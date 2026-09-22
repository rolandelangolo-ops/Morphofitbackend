const path = require('path');
const { BodyScanDraft, Measurement } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { BODYSCAN_VIEWS } = require('../middleware/upload');
const { createScanDraft } = require('../validators/measurementValidators');
const { analyzeBodyScan } = require('../services/geminiBodyScanService');
const { sniffImageType, scanFilePath, removeScanFiles, removeAbsFiles } = require('../utils/bodyScanFiles');

const MAX_DRAFTS_PER_HOUR = 6;
const MAX_ANALYSES_PER_DRAFT = 4;

function photoUrl(req, file) {
  return `${req.protocol}://${req.get('host')}/uploads/bodyscans/${file}`;
}

function publicPhotos(req, photos) {
  return (photos || []).map((p) => ({ view: p.view, url: photoUrl(req, p.file) }));
}

/** The scan as the client sees it — same shape whether it came from a
 * just-analysed draft or a saved history entry, so both scan methods and old
 * scans render through one component. */
function publicScan(req, m) {
  return {
    id: m._id.toString(),
    height: m.height,
    shoulder: m.shoulder,
    chest: m.chest,
    waist: m.waist,
    hip: m.hip,
    inseam: m.inseam,
    thigh: m.thigh,
    armLength: m.armLength,
    morphology: m.morphology,
    scannedAt: m.scannedAt,
    method: m.method,
    confidence: m.confidence,
    warnings: m.warnings,
    photos: publicPhotos(req, m.photos),
  };
}

/** POST /client/body-scans/drafts — four photos (multipart) -> a draft. Runs
 * after multer, so any rejection here must delete what multer already wrote. */
const createDraft = catchAsync(async (req, res) => {
  const files = req.files || {};
  const written = Object.values(files).flat().map((f) => f.path);
  const reject = (error) => {
    removeAbsFiles(written);
    throw error;
  };

  const parsed = createScanDraft.safeParse(req.body);
  if (!parsed.success) reject(ApiError.badRequest('Validation failed', parsed.error.flatten()));

  const missing = BODYSCAN_VIEWS.filter((v) => !files[v] || files[v].length !== 1);
  if (missing.length) reject(ApiError.badRequest(`Missing photo${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. All four angles are required.`, { missing }));

  // Trust the bytes, not the multipart Content-Type.
  const notImages = BODYSCAN_VIEWS.filter((v) => !sniffImageType(files[v][0].path));
  if (notImages.length) reject(ApiError.badRequest(`The ${notImages.join(', ')} file${notImages.length > 1 ? 's are' : ' is'} not a valid image.`, { invalid: notImages }));

  const recent = await BodyScanDraft.countDocuments({ userId: req.user._id, createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) } });
  if (recent >= MAX_DRAFTS_PER_HOUR) reject(new ApiError(429, 'You have started several scans in the last hour. Please wait a little before trying again.'));

  const draft = await BodyScanDraft.create({
    userId: req.user._id,
    method: parsed.data.method,
    heightCm: parsed.data.heightCm,
    photos: BODYSCAN_VIEWS.map((view) => ({ view, file: path.basename(files[view][0].path) })),
    expiresAt: BodyScanDraft.newExpiry(),
  });

  return created(res, { draftId: draft._id.toString(), photos: publicPhotos(req, draft.photos), expiresAt: draft.expiresAt });
});

/** POST /client/body-scans/drafts/:id/analyze */
const analyzeDraft = catchAsync(async (req, res) => {
  // Atomically count the attempt first so parallel/retry storms can't
  // exceed the cap even before Gemini responds.
  const draft = await BodyScanDraft.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id, expiresAt: { $gt: new Date() }, analysisCount: { $lt: MAX_ANALYSES_PER_DRAFT } },
    { $inc: { analysisCount: 1 } },
    { new: true }
  );
  if (!draft) {
    const exists = await BodyScanDraft.exists({ _id: req.params.id, userId: req.user._id, expiresAt: { $gt: new Date() } });
    if (exists) throw new ApiError(429, 'This scan has been analysed too many times. Please start a new scan.');
    throw ApiError.notFound('This scan has expired. Please retake your photos.');
  }

  const result = await analyzeBodyScan({ heightCm: draft.heightCm, photos: draft.photos });

  draft.analysis = result;
  draft.expiresAt = BodyScanDraft.newExpiry();
  draft.markModified('analysis');
  await draft.save();

  return ok(res, { draftId: draft._id.toString(), method: draft.method, photos: publicPhotos(req, draft.photos), ...result });
});

/** GET /client/measurements/history */
const history = catchAsync(async (req, res) => {
  const scans = await Measurement.find({ userId: req.user._id }).sort({ scannedAt: -1 }).limit(50);
  return ok(res, scans.map((m) => publicScan(req, m)));
});

/** DELETE /client/measurements/:id/photos — privacy control: removes only the
 * stored images of one scan; the measurements are kept. */
const deleteScanPhotos = catchAsync(async (req, res) => {
  const scan = await Measurement.findOne({ _id: req.params.id, userId: req.user._id });
  if (!scan) throw ApiError.notFound('Scan not found');
  removeScanFiles((scan.photos || []).map((p) => p.file));
  scan.photos = [];
  await scan.save();
  return ok(res, publicScan(req, scan));
});

/** GET /uploads/bodyscans/:filename — OWNER ONLY. Deliberately not extended to
 * admins, stylists or tailors: sharing body images would need its own
 * explicit-consent feature. 404 (not 403) for everyone else so a filename
 * can't be probed for existence. */
const serveScanPhoto = catchAsync(async (req, res) => {
  const abs = scanFilePath(req.params.filename);
  if (!abs) throw ApiError.notFound('Photo not found');
  const file = req.params.filename;
  const owned =
    (await Measurement.exists({ userId: req.user._id, 'photos.file': file })) ||
    (await BodyScanDraft.exists({ userId: req.user._id, 'photos.file': file }));
  if (!owned) throw ApiError.notFound('Photo not found');

  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

module.exports = { createDraft, analyzeDraft, history, deleteScanPhotos, serveScanPhoto, publicScan };
