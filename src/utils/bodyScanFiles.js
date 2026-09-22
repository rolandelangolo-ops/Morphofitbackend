const fs = require('fs');
const path = require('path');
const { BODYSCAN_DIR } = require('../middleware/upload');

/** Real image type from the file's first bytes, or null. A multipart
 * `Content-Type` is chosen by the client, so it can't be trusted to mean the
 * bytes on disk are actually an image Gemini/browsers can decode. */
function sniffImageType(absPath) {
  let fd;
  try {
    fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(12);
    const read = fs.readSync(fd, buf, 0, 12, 0);
    if (read < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Resolves a stored scan filename to an absolute path, or null if it would
 * escape the bodyscans directory (path traversal guard). */
function scanFilePath(filename) {
  if (typeof filename !== 'string' || filename !== path.basename(filename)) return null;
  const abs = path.join(BODYSCAN_DIR, filename);
  return abs.startsWith(BODYSCAN_DIR + path.sep) ? abs : null;
}

/** Best-effort delete of stored scan files by filename; never throws, so a
 * cleanup hiccup can't fail the request that triggered it. */
function removeScanFiles(filenames) {
  for (const name of filenames || []) {
    const abs = scanFilePath(name);
    if (abs) fs.unlink(abs, () => {});
  }
}

/** Same, for absolute paths multer just wrote (used to roll back a rejected
 * upload). */
function removeAbsFiles(absPaths) {
  for (const p of absPaths || []) fs.unlink(p, () => {});
}

module.exports = { sniffImageType, scanFilePath, removeScanFiles, removeAbsFiles };
