const fs = require('fs');
const path = require('path');
const { Conversation, Message, User } = require('../models');
const { pairKeyFor } = require('../models/Conversation');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { minimalUser } = require('./authController');
const { notify } = require('./notificationsController');
const { getIO } = require('../sockets');
const { publicUploadUrl, UPLOAD_ROOT } = require('../middleware/upload');
const { escapeRegExp } = require('../utils/escapeRegExp');

/** Best-effort local-disk cleanup for an uploaded attachment; never allowed
 * to fail the request that triggered it (deleteMessage). */
function unlinkAttachment(attachmentUrl) {
  if (!attachmentUrl) return;
  try {
    const relative = new URL(attachmentUrl).pathname.replace(/^\/uploads\//, '');
    const absPath = path.join(UPLOAD_ROOT, relative);
    if (absPath.startsWith(UPLOAD_ROOT)) fs.unlink(absPath, () => {});
  } catch {
    // malformed URL — nothing to clean up
  }
}

function otherParticipantId(conversation, userId) {
  return conversation.participantIds.find((id) => id.toString() !== userId.toString());
}

async function publicConversation(conversation, viewerId) {
  const other = await User.findById(otherParticipantId(conversation, viewerId));
  const unreadCount = await Message.countDocuments({
    conversationId: conversation._id,
    senderId: { $ne: viewerId },
    readBy: { $ne: viewerId },
    deletedAt: { $exists: false },
  });
  return {
    id: conversation._id.toString(),
    participant: other ? minimalUser(other) : null,
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.lastMessagePreview,
    unreadCount,
  };
}

/** One-line conversation-list preview for a message — shared by sendMessage
 * and deleteMessage (which has to recompute it from the newest surviving
 * message so a deleted message's text doesn't linger in the sidebar). */
function previewFor({ type, text }) {
  if (type === 'image') return 'Photo';
  if (type === 'voice') return 'Voice note';
  return (text || '').slice(0, 120);
}

function publicMessage(m) {
  return {
    id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    senderId: m.senderId.toString(),
    type: m.type,
    text: m.deletedAt ? '' : m.text,
    attachmentUrl: m.deletedAt ? undefined : m.attachmentUrl,
    attachmentDurationSec: m.attachmentDurationSec,
    reactions: (m.reactions || []).map((r) => ({ userId: r.userId.toString(), emoji: r.emoji })),
    readBy: (m.readBy || []).map((id) => id.toString()),
    deleted: Boolean(m.deletedAt),
    createdAt: m.createdAt,
  };
}

async function requireParticipant(conversationId, userId) {
  const conversation = await Conversation.findOne({ _id: conversationId, participantIds: userId });
  if (!conversation) throw ApiError.notFound('Conversation not found');
  return conversation;
}

const listConversations = catchAsync(async (req, res) => {
  const conversations = await Conversation.find({ participantIds: req.user._id }).sort({ lastMessageAt: -1, createdAt: -1 });
  const enriched = await Promise.all(conversations.map((c) => publicConversation(c, req.user._id)));
  return ok(res, enriched);
});

// Get-or-create a direct conversation with `userId`. Deliberately doesn't
// re-check the search-time role pairing (see usersController's
// REACHABLE_ROLES) — reaching this endpoint already implies a legitimate
// counterpart (from search, or a "Message" button on a profile reached
// through an existing order/appointment), and duplicating that ACL here
// would just drift out of sync with it.
const createConversation = catchAsync(async (req, res) => {
  const { userId } = req.body;
  if (userId === req.user._id.toString()) throw ApiError.badRequest('Cannot start a conversation with yourself');
  const other = await User.findOne({ _id: userId, active: true });
  if (!other) throw ApiError.notFound('User not found');

  // Atomic get-or-create on the unique pairKey index — closes the race where
  // two concurrent requests for the same pair could otherwise both pass a
  // findOne-then-create check and fork the conversation in two.
  const pairKey = pairKeyFor(req.user._id, other._id);
  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate(
      { pairKey },
      { $setOnInsert: { participantIds: [req.user._id, other._id], pairKey } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      conversation = await Conversation.findOne({ pairKey });
    } else {
      throw err;
    }
  }
  return created(res, await publicConversation(conversation, req.user._id));
});

const listMessages = catchAsync(async (req, res) => {
  const conversation = await requireParticipant(req.params.id, req.user._id);
  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).limit(200);
  return ok(res, messages.map(publicMessage));
});

const sendMessage = catchAsync(async (req, res) => {
  const conversation = await requireParticipant(req.params.id, req.user._id);
  const text = (req.body.text || '').trim();
  const file = req.file;
  if (!text && !file) throw ApiError.badRequest('Message must have text or an attachment');

  let type = 'text';
  let attachmentUrl;
  let attachmentDurationSec;
  if (file) {
    type = file.mimetype.startsWith('image/') ? 'image' : 'voice';
    attachmentUrl = publicUploadUrl(req, file.path);
    if (type === 'voice' && req.body.durationSec) attachmentDurationSec = req.body.durationSec;
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderId: req.user._id,
    type,
    text,
    attachmentUrl,
    attachmentDurationSec,
    readBy: [req.user._id],
  });

  const preview = previewFor({ type, text });
  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessagePreview = preview;
  await conversation.save();

  const payload = publicMessage(message);
  getIO()?.to(`conversation:${conversation._id}`).emit('message:new', payload);

  const other = await User.findById(otherParticipantId(conversation, req.user._id));
  if (other) {
    await notify(other, 'message_received', `New message from ${req.user.name}`, preview, { conversationId: conversation._id });
  }

  return created(res, payload);
});

const markRead = catchAsync(async (req, res) => {
  const conversation = await requireParticipant(req.params.id, req.user._id);
  const result = await Message.updateMany(
    { conversationId: conversation._id, senderId: { $ne: req.user._id }, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );

  // Only the sender's own bubbles need to flip their checkmark, so a
  // {conversationId, readerId} pointer is enough — no need to broadcast
  // every affected message id individually.
  if (result.modifiedCount > 0) {
    getIO()?.to(`conversation:${conversation._id}`).emit('message:read', {
      conversationId: conversation._id.toString(),
      readerId: req.user._id.toString(),
    });
  }

  return ok(res, { success: true });
});

const react = catchAsync(async (req, res) => {
  const conversation = await requireParticipant(req.params.id, req.user._id);
  const { emoji } = req.body;
  const message = await Message.findOne({ _id: req.params.messageId, conversationId: conversation._id });
  if (!message) throw ApiError.notFound('Message not found');

  const mine = (r) => r.userId.toString() === req.user._id.toString();
  const alreadyReacted = message.reactions.some((r) => mine(r) && r.emoji === emoji);
  message.reactions = message.reactions.filter((r) => !mine(r));
  if (!alreadyReacted) message.reactions.push({ userId: req.user._id, emoji });
  await message.save();

  const payload = publicMessage(message);
  getIO()?.to(`conversation:${conversation._id}`).emit('message:reaction', payload);
  return ok(res, payload);
});

const deleteMessage = catchAsync(async (req, res) => {
  const conversation = await requireParticipant(req.params.id, req.user._id);
  const message = await Message.findOne({ _id: req.params.messageId, conversationId: conversation._id, senderId: req.user._id });
  if (!message) throw ApiError.notFound('Message not found');
  unlinkAttachment(message.attachmentUrl);
  message.deletedAt = new Date();
  message.text = '';
  message.attachmentUrl = undefined;
  await message.save();

  // If this was the conversation's most recent message, the stored preview
  // still holds its (now deleted) text — which would keep showing the
  // deleted content in both participants' conversation lists. Recompute the
  // preview from the newest surviving message instead.
  const latest = await Message.findOne({
    conversationId: conversation._id,
    deletedAt: { $exists: false },
  }).sort({ createdAt: -1 });

  conversation.lastMessageAt = latest ? latest.createdAt : undefined;
  conversation.lastMessagePreview = latest ? previewFor(latest) : '';
  await conversation.save();

  const payload = publicMessage(message);
  getIO()?.to(`conversation:${conversation._id}`).emit('message:deleted', payload);
  return ok(res, payload);
});

/** Serves a message attachment (image/voice note) only to a participant of
 * the conversation it belongs to — unlike avatars, these are meant to be
 * private, so they're not under the blanket `/uploads` static mount
 * (see app.js). */
const serveAttachment = catchAsync(async (req, res) => {
  const filePath = path.join(UPLOAD_ROOT, 'attachments', req.params.filename);
  if (!filePath.startsWith(path.join(UPLOAD_ROOT, 'attachments'))) throw ApiError.notFound('Attachment not found');

  const message = await Message.findOne({ attachmentUrl: { $regex: `/${escapeRegExp(req.params.filename)}$` } });
  if (!message) throw ApiError.notFound('Attachment not found');
  await requireParticipant(message.conversationId, req.user._id);

  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

module.exports = {
  listConversations,
  createConversation,
  listMessages,
  sendMessage,
  markRead,
  react,
  deleteMessage,
  serveAttachment,
};
