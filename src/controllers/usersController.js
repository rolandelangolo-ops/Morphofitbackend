const bcrypt = require('bcryptjs');
const { User, Measurement, Order, Appointment, Conversation } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { richUser, minimalUser } = require('./authController');
const { publicUploadUrl } = require('../middleware/upload');
const { escapeRegExp } = require('../utils/escapeRegExp');
const { sendMailAsync } = require('../services/mailService');
const templates = require('../services/emailTemplates');

// Who a given role is allowed to search for / start a conversation with —
// mirrors the real working relationships in the app (client<->stylist/tailor,
// tailor<->delivery, etc.) rather than a general-purpose ACL system.
const REACHABLE_ROLES = {
  client: ['stylist', 'tailor'],
  stylist: ['client', 'tailor'],
  tailor: ['client', 'stylist', 'delivery_agent'],
  delivery_agent: ['tailor', 'client'],
  admin: ['client', 'stylist', 'tailor', 'delivery_agent', 'admin'],
};

const me = catchAsync(async (req, res) => {
  return ok(res, richUser(req.user));
});

const updateMe = catchAsync(async (req, res) => {
  const { name, bio, phone, city, notificationPrefs, emailPrefs } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (bio !== undefined) update.bio = bio;
  if (phone !== undefined) update.phone = phone;
  if (city !== undefined) update.city = city;
  if (notificationPrefs) {
    for (const key of ['appointments', 'orders', 'messages', 'support']) {
      if (notificationPrefs[key] !== undefined) update[`notificationPrefs.${key}`] = notificationPrefs[key];
    }
  }
  if (emailPrefs) {
    // `account` is deliberately NOT settable — password-changed and
    // deactivation notices are security mail, not marketing.
    for (const key of ['appointments', 'orders', 'messages', 'support']) {
      if (emailPrefs[key] !== undefined) update[`emailPrefs.${key}`] = emailPrefs[key];
    }
  }
  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
  return ok(res, richUser(user));
});

const uploadAvatarHandler = catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No avatar file uploaded');
  const avatarUrl = publicUploadUrl(req, req.file.path);
  const user = await User.findByIdAndUpdate(req.user._id, { avatarUrl }, { new: true });
  return ok(res, richUser(user));
});

const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  // Security mail: always sent, not gated on emailPrefs — the whole point
  // is telling someone their password changed when it wasn't them.
  sendMailAsync({ to: user.email, ...templates.passwordChanged({ name: user.name }) });
  return ok(res, { success: true });
});

const exportData = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const [measurements, orders, appointments] = await Promise.all([
    Measurement.find({ userId }),
    Order.find({ $or: [{ clientId: userId }, { stylistId: userId }, { tailorId: userId }, { deliveryAgentId: userId }] }),
    Appointment.find({ $or: [{ clientId: userId }, { tailorId: userId }] }),
  ]);
  return ok(res, {
    user: richUser(req.user),
    measurements,
    orders,
    appointments,
    exportedAt: new Date().toISOString(),
  });
});

const deactivate = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { active: false });
  sendMailAsync({ to: req.user.email, ...templates.accountDeactivated({ name: req.user.name }) });
  return ok(res, { success: true });
});

const getById = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || !user.active) throw ApiError.notFound('User not found');

  // Same reachability rule as search() — a role can view another user's
  // profile if they could have found them there in the first place, if
  // they're already in a conversation together (messaging deliberately
  // allows some cross-role pairs search() doesn't, e.g. a courier messaging
  // a client — see messagingController.createConversation), or it's their
  // own profile / they're an admin.
  const isSelf = user._id.toString() === req.user._id.toString();
  if (!isSelf && req.user.role !== 'admin') {
    const roles = REACHABLE_ROLES[req.user.role] || [];
    const reachableByRole = roles.includes(user.role);
    const alreadyMessaging =
      reachableByRole || (await Conversation.exists({ participantIds: { $all: [req.user._id, user._id] } }));
    if (!alreadyMessaging) throw ApiError.notFound('User not found');
  }

  return ok(res, minimalUser(user));
});

const search = catchAsync(async (req, res) => {
  const { q } = req.query;
  const roles = REACHABLE_ROLES[req.user.role] || [];
  if (roles.length === 0) return ok(res, []);
  const users = await User.find({
    _id: { $ne: req.user._id },
    role: { $in: roles },
    active: true,
    name: { $regex: escapeRegExp(q), $options: 'i' },
  })
    .sort({ name: 1 })
    .limit(20);
  return ok(res, users.map(minimalUser));
});

module.exports = { me, updateMe, uploadAvatarHandler, changePassword, exportData, deactivate, getById, search };
