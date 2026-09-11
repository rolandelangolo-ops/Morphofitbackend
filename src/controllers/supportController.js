const path = require('path');
const { SupportRequest, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { notify } = require('./notificationsController');
const { publicUploadUrl, UPLOAD_ROOT } = require('../middleware/upload');
const { escapeRegExp } = require('../utils/escapeRegExp');

function publicResponse(r) {
  return {
    id: r._id.toString(),
    authorId: r.authorId.toString(),
    authorRole: r.authorRole,
    message: r.message,
    createdAt: r.createdAt,
  };
}

function publicSupportRequest(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    type: doc.type,
    category: doc.category,
    subject: doc.subject,
    description: doc.description,
    status: doc.status,
    priority: doc.priority,
    context: doc.context && (doc.context.path || doc.context.screenLabel) ? doc.context : undefined,
    attachments: doc.attachments,
    responses: doc.responses.map(publicResponse),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function notifyAdmins(type, title, body, data) {
  const admins = await User.find({ role: 'admin', active: true });
  await Promise.all(admins.map((admin) => notify(admin, type, title, body, data)));
}

const create = catchAsync(async (req, res) => {
  const { type, category, subject, description, context } = req.body;
  const attachments = (req.files || []).map((file) => publicUploadUrl(req, file.path));

  const request = await SupportRequest.create({
    userId: req.user._id,
    type,
    category,
    subject,
    description,
    context,
    attachments,
  });

  await notifyAdmins('support_request_created', 'New support request', subject, { supportRequestId: request._id });

  return created(res, publicSupportRequest(request));
});

const mine = catchAsync(async (req, res) => {
  const items = await SupportRequest.find({ userId: req.user._id }).sort({ updatedAt: -1 }).limit(200);
  return ok(res, items.map(publicSupportRequest));
});

const getOne = catchAsync(async (req, res) => {
  const request = await SupportRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Support request not found');
  const isOwner = request.userId.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') throw ApiError.forbidden();
  return ok(res, publicSupportRequest(request));
});

const addResponse = catchAsync(async (req, res) => {
  const request = await SupportRequest.findOne({ _id: req.params.id, userId: req.user._id });
  if (!request) throw ApiError.notFound('Support request not found');

  request.responses.push({ authorId: req.user._id, authorRole: req.user.role, message: req.body.message });
  await request.save();

  await notifyAdmins('support_reply_received', 'New reply to a support request', request.subject, {
    supportRequestId: request._id,
  });

  return ok(res, publicSupportRequest(request));
});

/** Serves a support-request screenshot only to the request's owner or an
 * admin — private, like message attachments (see messagingController.js). */
const serveAttachment = catchAsync(async (req, res) => {
  const filePath = path.join(UPLOAD_ROOT, 'support', req.params.filename);
  if (!filePath.startsWith(path.join(UPLOAD_ROOT, 'support'))) throw ApiError.notFound('Attachment not found');

  const request = await SupportRequest.findOne({ attachments: { $regex: `/${escapeRegExp(req.params.filename)}$` } });
  if (!request) throw ApiError.notFound('Attachment not found');
  const isOwner = request.userId.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') throw ApiError.forbidden();

  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

module.exports = { create, mine, getOne, addResponse, serveAttachment, publicSupportRequest, notifyAdmins };
