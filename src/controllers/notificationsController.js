const { Notification, Message } = require('../models');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { getIO } = require('../sockets');
const { sendMailAsync } = require('../services/mailService');
const templates = require('../services/emailTemplates');

function publicNotification(n) {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    data: {
      appointmentId: n.data?.appointmentId?.toString(),
      orderId: n.data?.orderId?.toString(),
      conversationId: n.data?.conversationId?.toString(),
      supportRequestId: n.data?.supportRequestId?.toString(),
    },
    read: n.read,
    createdAt: n.createdAt,
  };
}

const CATEGORY_BY_TYPE = {
  appointment_requested: 'appointments',
  appointment_confirmed: 'appointments',
  appointment_declined: 'appointments',
  order_status_changed: 'orders',
  message_received: 'messages',
  support_request_created: 'support',
  support_reply_received: 'support',
  support_response_added: 'support',
  support_status_changed: 'support',
};

/** Last time we emailed a given user about a given conversation, keyed
 * `${userId}:${conversationId}`. In-process only: a restart just means one
 * extra email, and a multi-instance deployment would need this in Mongo or
 * Redis instead — noted rather than over-engineered for a single node. */
const lastMessageEmailAt = new Map();
const MESSAGE_EMAIL_COOLDOWN_MS = 20 * 60 * 1000;

/** Drops entries older than the cooldown window — without this the map only
 * ever grows (one entry per user/conversation pair, forever), which is a
 * slow leak on a long-lived process. Called opportunistically on write
 * rather than on a timer so there's no interval to clean up. */
function pruneMessageEmailCooldowns(now) {
  if (lastMessageEmailAt.size < 500) return;
  for (const [key, at] of lastMessageEmailAt) {
    if (now - at >= MESSAGE_EMAIL_COOLDOWN_MS) lastMessageEmailAt.delete(key);
  }
}

/** True when the user has at least one live socket — i.e. they're sitting
 * in the app right now and will see the in-app notification, so emailing
 * them as well is just noise. */
function isUserOnline(userId) {
  const io = getIO();
  if (!io) return false;
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  return Boolean(room && room.size > 0);
}

/** Decides whether this notification should ALSO go out by email, and
 * dispatches it fire-and-forget. Chat is special-cased: emailing on every
 * message would be spam, so we only mail an offline recipient, and at most
 * once per conversation per cooldown window. */
function maybeSendEmail(user, type, title, body, data) {
  const category = CATEGORY_BY_TYPE[type];
  if (!user.email) return;
  if (category && user.emailPrefs && user.emailPrefs[category] === false) return;

  if (type === 'message_received') {
    const conversationId = data?.conversationId?.toString();
    if (!conversationId) return;
    if (isUserOnline(user._id.toString())) return;

    const key = `${user._id}:${conversationId}`;
    const now = Date.now();
    const last = lastMessageEmailAt.get(key) || 0;
    if (now - last < MESSAGE_EMAIL_COOLDOWN_MS) return;
    pruneMessageEmailCooldowns(now);
    lastMessageEmailAt.set(key, now);

    Message.countDocuments({
      conversationId,
      senderId: { $ne: user._id },
      readBy: { $ne: user._id },
      deletedAt: { $exists: false },
    })
      .then((count) => {
        const senderName = String(title).replace(/^New message from\s*/i, '') || 'Someone';
        sendMailAsync({
          to: user.email,
          ...templates.messageDigest({ name: user.name, senderName, preview: body, conversationId, count: count || 1 }),
        });
      })
      .catch((err) => console.error('[mail] message digest count failed:', err.message));
    return;
  }

  sendMailAsync({
    to: user.email,
    ...templates.notificationEmail({ name: user.name, type, title, body, data }),
  });
}

/** Creates a notification and pushes it live over the recipient's socket
 * room. Called as a side effect from other controllers (appointments,
 * orders, messaging) — never a client-facing route itself. Respects the
 * recipient's notificationPrefs category toggle (see models/User.js and
 * Settings' Notifications section), and separately mirrors the same event
 * to email when emailPrefs allows it (see maybeSendEmail). */
async function notify(user, type, title, body, data = {}) {
  const category = CATEGORY_BY_TYPE[type];
  if (category && user.notificationPrefs && user.notificationPrefs[category] === false) return null;
  const notification = await Notification.create({ userId: user._id, type, title, body, data });
  const io = getIO();
  if (io) io.to(`user:${user._id}`).emit('notification:new', publicNotification(notification));

  // Email is a side channel: never allowed to fail the in-app notification
  // that already succeeded above.
  try {
    maybeSendEmail(user, type, title, body, data);
  } catch (err) {
    console.error('[mail] dispatch failed:', err.message);
  }
  return notification;
}

const list = catchAsync(async (req, res) => {
  const items = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
  return ok(res, items.map(publicNotification));
});

const unreadCount = catchAsync(async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user._id, read: false });
  return ok(res, { count });
});

const markRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true },
    { new: true }
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  return ok(res, publicNotification(notification));
});

const markAllRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  return ok(res, { success: true });
});

module.exports = { list, unreadCount, markRead, markAllRead, notify, publicNotification };
