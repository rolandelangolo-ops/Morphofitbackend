const fs = require('fs');
const { z } = require('zod');
const ApiError = require('../utils/ApiError');
const { gemini } = require('../config/env');
const { BOUNDS } = require('../validators/measurementValidators');
const { scanFilePath } = require('../utils/bodyScanFiles');

const VIEWS = ['front', 'back', 'left', 'right'];
const MEASURED = ['shoulder', 'chest', 'waist', 'hip', 'inseam', 'thigh', 'armLength'];
const MORPHOLOGIES = ['hourglass', 'pear', 'inverted-triangle', 'rectangle', 'oval'];
// Inline image data is capped by the API (~20MB per request); stay well under.
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

const SYSTEM_INSTRUCTION = `You help a bespoke tailoring app estimate body measurements for garment sizing from four photos of ONE person: front, back, left side and right side. The person states their real height, which is your only scale reference.

Rules:
- First judge each photo. A view is "ok" only if it shows a whole standing person (head to feet visible), roughly upright, facing the required direction (front: facing the camera; back: facing away; left/right: the named side toward the camera), and sharp enough to judge the silhouette. If not, set ok=false and give ONE short, actionable "issue" (e.g. "Feet are cut off - step further back", "Turned about 45 degrees - face the camera squarely"). If ok, issue is an empty string.
- Estimate in centimetres: shoulder = shoulder breadth (acromion to acromion); chest, waist, hip and thigh = CIRCUMFERENCES; inseam = crotch to floor; armLength = shoulder point to wrist. Use the stated height to scale everything. Loose clothing, heavy layers, arms in the way, slouching, or camera tilt make girths less certain: lower the confidence and say so in warnings.
- confidence is 0 to 1 per value, honest and conservative. Girths from photos are inherently uncertain; do not report high confidence for them unless the photos are ideal (fitted clothing, straight-on, full body, good light).
- Do not guess wildly. If a measurement cannot be judged, still give your best estimate but with confidence below 0.3 and a warning.
- morphology must be one of: hourglass, pear, inverted-triangle, rectangle, oval (based on the shoulder / waist / hip balance you observe).
- overallConfidence is 0 to 1 for the scan as a whole.
- Output ONLY the requested fields. Never comment on identity, sex, weight, body fat, attractiveness or health.`;

const numberField = { type: 'NUMBER' };
const viewSchema = {
  type: 'OBJECT',
  properties: { ok: { type: 'BOOLEAN' }, issue: { type: 'STRING' } },
  required: ['ok', 'issue'],
};
const measureSchema = {
  type: 'OBJECT',
  properties: { valueCm: numberField, confidence: numberField },
  required: ['valueCm', 'confidence'],
};
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    views: { type: 'OBJECT', properties: Object.fromEntries(VIEWS.map((v) => [v, viewSchema])), required: VIEWS },
    measurements: { type: 'OBJECT', properties: Object.fromEntries(MEASURED.map((m) => [m, measureSchema])), required: MEASURED },
    morphology: { type: 'STRING', enum: MORPHOLOGIES },
    overallConfidence: numberField,
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['views', 'measurements', 'morphology', 'overallConfidence', 'warnings'],
};

const viewResult = z.object({ ok: z.boolean(), issue: z.string().default('') });
const measureResult = z.object({ valueCm: z.number().finite(), confidence: z.number().finite() });
const analysisResult = z.object({
  views: z.object(Object.fromEntries(VIEWS.map((v) => [v, viewResult]))),
  measurements: z.object(Object.fromEntries(MEASURED.map((m) => [m, measureResult]))),
  morphology: z.string(),
  overallConfidence: z.number().finite(),
  warnings: z.array(z.string()).default([]),
});

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Same balance rule the app used before, kept only as a fallback if the model
 * returns something outside the allowed set. */
function fallbackMorphology({ shoulder, waist, hip }) {
  const waistToHip = waist / hip;
  if (waistToHip < 0.75 && Math.abs(shoulder - hip * 0.42) < 4) return 'hourglass';
  if (hip - shoulder * 2.3 > 6) return 'pear';
  if (shoulder * 2.3 - hip > 6) return 'inverted-triangle';
  if (waistToHip > 0.88) return 'oval';
  return 'rectangle';
}

function upstreamError(status) {
  if (status === 429) return new ApiError(503, 'The analysis service is busy right now. Please try again in a minute.');
  if (status === 401 || status === 403) {
    console.error('[gemini] upstream rejected the API key (HTTP', status, ')');
    return new ApiError(503, 'Body scan analysis is temporarily unavailable.');
  }
  if (status >= 500) return new ApiError(502, 'The analysis service had a problem. Please try again shortly.');
  return new ApiError(502, 'The analysis service could not process this request.');
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POSTs one generateContent request, riding out transient overload. Google's
 * newest models regularly answer 503 "high demand" or simply hang, and a
 * body-scan flow shouldn't die on that. Order of play: the primary model
 * (one quick retry on 503), then each fallback model in turn (a different
 * model beats hammering an overloaded one), then one last pass over the
 * chain. A model that hangs or rejects our request is not retried. Everything
 * shares ONE deadline (gemini.timeoutMs), so the user never waits longer than
 * that in total. A bad key / bad config on the PRIMARY model fails
 * immediately (that's a setup problem, not overload).
 */
async function generateWithRetry(payload) {
  const deadline = Date.now() + gemini.timeoutMs;
  const models = [gemini.model, ...gemini.fallbackModels.filter((m) => m !== gemini.model)];
  const plan = [
    { model: models[0], delay: 0 },
    { model: models[0], delay: 1500 },
    ...models.slice(1).map((model) => ({ model, delay: 0 })),
    ...models.map((model, i) => ({ model, delay: i === 0 ? 3000 : 0 })),
  ];
  const skip = new Set();
  let lastError = new ApiError(502, 'The analysis service had a problem. Please try again shortly.');

  for (const { model, delay } of plan) {
    if (skip.has(model)) continue;
    if (delay) await sleep(delay);
    const remaining = deadline - Date.now();
    if (remaining < 4000) break;

    // One slow/hung attempt must not eat the whole budget and starve the
    // fallbacks: cap each attempt, but never beyond the shared deadline.
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(remaining, 30000));
    try {
      const res = await fetch(`${gemini.apiBase}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gemini.apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (res.ok) {
        if (model !== models[0]) console.warn(`[gemini] served by fallback model ${model}`);
        return { res, model };
      }

      let detail = '';
      try { detail = (await res.json())?.error?.message || ''; } catch { /* non-JSON body */ }
      console.error(`[gemini] ${model} -> HTTP ${res.status} after ${Date.now() - startedAt}ms: ${String(detail).slice(0, 120)}`);
      lastError = upstreamError(res.status);
      // 429 = this key's quota/rate limit for THIS model; asking again a
      // second later won't help, but another model has its own limit.
      if (res.status === 429) skip.add(model);
      if (!RETRYABLE.has(res.status)) {
        if (model === models[0]) throw lastError; // key/config problem: surface it, don't mask it
        skip.add(model); // a fallback that rejects our request is just skipped
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.name === 'AbortError') {
        console.error(`[gemini] ${model} attempt timed out after ${Date.now() - startedAt}ms`);
        lastError = new ApiError(504, 'The analysis took too long. Please try again.');
        skip.add(model); // a hung model won't be helped by asking again
        continue;
      }
      console.error(`[gemini] ${model} request failed after ${Date.now() - startedAt}ms: ${err.message}${err.cause ? ` (${err.cause.code || err.cause.message})` : ''}`);
      lastError = new ApiError(502, 'Could not reach the analysis service. Please try again.');
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/**
 * Estimates measurements from four stored scan photos.
 * `photos`: [{ view, file }] (stored filenames). Returns the validated,
 * clamped result. Throws ApiError:
 *  - 503 not configured / busy / key rejected
 *  - 422 a view isn't usable (details.views lists which and why) or the image
 *        was blocked by the provider's content filter
 *  - 502/504 upstream failure / timeout
 * Nothing here is ever stored or returned unless it validated.
 */
async function analyzeBodyScan({ heightCm, photos }) {
  if (!gemini.apiKey) throw new ApiError(503, 'Body scan analysis is not configured on this server.');

  const parts = [{ text: `The person's real height is ${heightCm} cm. Four photos follow, in this order: front, back, left side, right side.` }];
  let totalBytes = 0;
  for (const view of VIEWS) {
    const photo = photos.find((p) => p.view === view);
    const abs = photo && scanFilePath(photo.file);
    if (!abs || !fs.existsSync(abs)) throw ApiError.badRequest(`The ${view} photo is missing. Please retake it.`);
    const data = fs.readFileSync(abs);
    totalBytes += data.length;
    if (totalBytes > MAX_INLINE_BYTES) throw new ApiError(413, 'The photos are too large to analyse. Please retake them at a lower resolution.');
    const mimeType = photo.file.endsWith('.png') ? 'image/png' : photo.file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    parts.push({ text: `${view.toUpperCase()} view:` });
    parts.push({ inlineData: { mimeType, data: data.toString('base64') } });
  }

  const { res, model } = await generateWithRetry({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      ...(gemini.thinkingLevel ? { thinkingConfig: { thinkingLevel: gemini.thinkingLevel } } : {}),
    },
  });

  const body = await res.json();
  if (body.promptFeedback?.blockReason) {
    throw new ApiError(422, 'These photos could not be analysed. Try plain fitted clothing and even lighting.', { code: 'BLOCKED' });
  }
  const candidate = body.candidates?.[0];
  if (!candidate || ['SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'BLOCKLIST'].includes(candidate.finishReason)) {
    throw new ApiError(422, 'These photos could not be analysed. Try plain fitted clothing and even lighting.', { code: 'BLOCKED' });
  }
  // Newer models emit "thought" parts alongside the answer; only real text
  // parts carry the JSON.
  const text = (candidate.content?.parts || []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');

  let parsed;
  try {
    parsed = analysisResult.parse(JSON.parse(text));
  } catch {
    console.error('[gemini] reply did not match the expected shape (finishReason:', candidate.finishReason, ')');
    throw new ApiError(502, 'The analysis returned an unreadable result. Please try again.');
  }

  const badViews = VIEWS.filter((v) => !parsed.views[v].ok).map((v) => ({ view: v, issue: parsed.views[v].issue || 'This photo could not be used. Please retake it.' }));
  if (badViews.length) {
    throw new ApiError(422, 'Some photos need to be retaken.', { code: 'VIEW_REJECTED', views: badViews });
  }

  const warnings = [...parsed.warnings];
  const measurements = { height: heightCm };
  const confidences = {};
  for (const key of MEASURED) {
    const [min, max] = BOUNDS[key];
    const raw = parsed.measurements[key].valueCm;
    const value = Math.min(max, Math.max(min, raw));
    if (value !== raw) warnings.push(`${key} was outside the plausible range and was adjusted - please check it.`);
    measurements[key] = Number(value.toFixed(1));
    confidences[key] = clamp01(parsed.measurements[key].confidence);
  }
  const overallConfidence = clamp01(parsed.overallConfidence);
  if (Math.min(...Object.values(confidences)) < 0.35) warnings.push('Some values are low-confidence. Double-check them before saving.');

  return {
    measurements,
    confidences,
    morphology: MORPHOLOGIES.includes(parsed.morphology) ? parsed.morphology : fallbackMorphology(measurements),
    overallConfidence,
    warnings: [...new Set(warnings)].slice(0, 10),
    model,
  };
}

module.exports = { analyzeBodyScan };
