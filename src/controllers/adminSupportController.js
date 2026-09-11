const { SupportRequest, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { notify } = require('./notificationsController');
const { minimalUser } = require('./authController');
const { publicSupportRequest } = require('./supportController');
const { escapeRegExp } = require('../utils/escapeRegExp');

async function withRequester(doc) {
  const requester = await User.findById(doc.userId);
  return { ...publicSupportRequest(doc), requester: requester ? minimalUser(requester) : null };
}

const list = catchAsync(async (req, res) => {
  const { status, type, category, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (q) {
    const re = { $regex: escapeRegExp(q), $options: 'i' };
    filter.$or = [{ subject: re }, { description: re }];
  }

  const items = await SupportRequest.find(filter).sort({ updatedAt: -1 }).limit(500);
  const requesterIds = [...new Set(items.map((i) => i.userId.toString()))];
  const requesters = await User.find({ _id: { $in: requesterIds } });
  const requesterById = new Map(requesters.map((u) => [u._id.toString(), minimalUser(u)]));

  return ok(res, items.map((doc) => ({ ...publicSupportRequest(doc), requester: requesterById.get(doc.userId.toString()) || null })));
});

const getOne = catchAsync(async (req, res) => {
  const request = await SupportRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Support request not found');
  return ok(res, await withRequester(request));
});

const updateStatus = catchAsync(async (req, res) => {
  const request = await SupportRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Support request not found');

  const { status, priority } = req.body;
  const statusChanged = status !== undefined && status !== request.status;
  if (status !== undefined) request.status = status;
  if (priority !== undefined) request.priority = priority;
  await request.save();

  if (statusChanged) {
    const requester = await User.findById(request.userId);
    if (requester) {
      await notify(
        requester,
        'support_status_changed',
        'Your support request was updated',
        `"${request.subject}" is now ${status.replace('_', ' ')}.`,
        { supportRequestId: request._id }
      );
    }
  }

  return ok(res, await withRequester(request));
});

const respond = catchAsync(async (req, res) => {
  const request = await SupportRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Support request not found');

  request.responses.push({ authorId: req.user._id, authorRole: req.user.role, message: req.body.message });
  await request.save();

  const requester = await User.findById(request.userId);
  if (requester) {
    await notify(requester, 'support_response_added', 'New reply to your support request', request.subject, {
      supportRequestId: request._id,
    });
  }

  return ok(res, await withRequester(request));
});

module.exports = { list, getOne, updateStatus, respond };
