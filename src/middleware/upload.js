const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storageFor(subdir) {
  const dir = ensureDir(path.join(UPLOAD_ROOT, subdir));
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VOICE_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);

/** Avatar upload — a single image, 5MB cap. */
const uploadAvatar = multer({
  storage: storageFor('avatars'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_TYPES.has(file.mimetype)) return cb(ApiError.badRequest('Avatar must be an image'));
    cb(null, true);
  },
}).single('avatar');

/** Message attachment — one image OR one voice note, 15MB cap. */
const uploadMessageAttachment = multer({
  storage: storageFor('attachments'),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_TYPES.has(file.mimetype) && !VOICE_TYPES.has(file.mimetype)) {
      return cb(ApiError.badRequest('Attachment must be an image or an audio recording'));
    }
    cb(null, true);
  },
}).single('attachment');

/** Support-request screenshots — up to 3 images, 8MB cap each. */
const uploadSupportAttachments = multer({
  storage: storageFor('support'),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_TYPES.has(file.mimetype)) return cb(ApiError.badRequest('Attachments must be images'));
    cb(null, true);
  },
}).array('attachments', 3);

const BODYSCAN_DIR = path.join(UPLOAD_ROOT, 'bodyscans');
const BODYSCAN_VIEWS = ['front', 'back', 'left', 'right'];
const BODYSCAN_IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** Body-scan photos — exactly one image per angle, 8MB each. Body images are
 * private: stored under uploads/bodyscans and only ever served through the
 * owner-only authenticated route in app.js (never the public static mount).
 * The extension comes from the validated mimetype, never the client's
 * filename, and the controller additionally sniffs the real file header
 * (utils/imageSniff.js) because a mimetype header alone is client-supplied. */
const uploadBodyScanPhotos = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ensureDir(BODYSCAN_DIR)),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${BODYSCAN_IMAGE_EXT[file.mimetype] || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: BODYSCAN_VIEWS.length },
  fileFilter: (req, file, cb) => {
    if (!BODYSCAN_IMAGE_EXT[file.mimetype]) return cb(ApiError.badRequest('Body scan photos must be JPEG, PNG or WebP images'));
    cb(null, true);
  },
}).fields(BODYSCAN_VIEWS.map((name) => ({ name, maxCount: 1 })));

function publicUploadUrl(req, absPath) {
  const relative = path.relative(UPLOAD_ROOT, absPath).split(path.sep).join('/');
  return `${req.protocol}://${req.get('host')}/uploads/${relative}`;
}

module.exports = {
  UPLOAD_ROOT,
  BODYSCAN_DIR,
  BODYSCAN_VIEWS,
  uploadAvatar,
  uploadMessageAttachment,
  uploadSupportAttachments,
  uploadBodyScanPhotos,
  publicUploadUrl,
};
