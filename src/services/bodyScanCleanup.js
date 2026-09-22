const { BodyScanDraft } = require('../models');
const { removeScanFiles } = require('../utils/bodyScanFiles');

/** Deletes EXPIRED DRAFTS and the photo files those drafts still own — nothing
 * else. A saved scan's photos are owned by its Measurement (the draft doc is
 * removed at save time), so they are never reachable from here; no existing
 * scan data is touched. */
async function sweepExpiredDrafts() {
  const expired = await BodyScanDraft.find({ expiresAt: { $lt: new Date() } }).limit(200);
  if (expired.length === 0) return 0;
  for (const draft of expired) removeScanFiles(draft.photos.map((p) => p.file));
  await BodyScanDraft.deleteMany({ _id: { $in: expired.map((d) => d._id) } });
  return expired.length;
}

function startBodyScanCleanup() {
  const run = () =>
    sweepExpiredDrafts()
      .then((n) => n && console.log(`[bodyscan] swept ${n} expired draft(s)`))
      .catch((err) => console.error('[bodyscan] draft sweep failed:', err.message));
  run();
  // unref: the timer must never keep the process alive on its own.
  setInterval(run, 60 * 60 * 1000).unref();
}

module.exports = { sweepExpiredDrafts, startBodyScanCleanup };
