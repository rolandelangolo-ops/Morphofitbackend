const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Order, User, AdminActionLog, Measurement, BodyScanDraft } = require('../models');
const { removeScanFiles } = require('../utils/bodyScanFiles');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { publicUser } = require('./authController');
const { notify } = require('./notificationsController');
const { createToken, hashToken } = require('../utils/emailTokens');
const { sendMailAsync } = require('../services/mailService');
const templates = require('../services/emailTemplates');
const { appUrl } = require('../config/env');
const { logAdminAction } = require('../services/adminActionLogService');

/** Richer than authController's minimalUser/publicUser — an admin editing a
 * user needs the full picture (email, phone, active state), fields a user
 * viewing someone ELSE's profile is never shown. */
function adminUserView(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    city: user.city,
    phone: user.phone,
    bio: user.bio || '',
    morphology: user.morphology,
    avatarUrl: user.avatarUrl,
    active: user.active,
    createdAt: user.createdAt,
  };
}

const users = catchAsync(async (req, res) => {
  const items = await User.find().sort({ createdAt: -1 }).limit(500);
  return ok(res, items.map(publicUser));
});

const orders = catchAsync(async (req, res) => {
  const items = await Order.find().sort({ createdAt: -1 }).limit(500);
  return ok(res, items);
});

const getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  return ok(res, adminUserView(user));
});

/** No Firebase-style "claim on first sign-in" exists in this JWT+bcrypt app,
 * so the account needs a real (if unusable-by-anyone) password hash right
 * away. The new user's first action is the existing /reset-password page —
 * reusing forgotPassword's exact token machinery instead of inventing a
 * separate "set your password" flow. */
const createUser = catchAsync(async (req, res) => {
  const { name, email, role, city, phone, bio, morphology } = req.body;
  const normalizedEmail = email.toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const unusablePassword = crypto.randomBytes(32).toString('hex');
  const user = await User.create({
    name,
    email: normalizedEmail,
    role,
    city,
    phone,
    bio,
    morphology,
    passwordHash: await bcrypt.hash(unusablePassword, 10),
  });

  const { raw, hash, expires } = createToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpires = expires;
  await user.save();
  sendMailAsync({
    to: user.email,
    ...templates.accountProvisioned({ name: user.name, resetUrl: `${appUrl}/reset-password?token=${raw}` }),
  });

  logAdminAction({ adminId: req.user._id, action: 'user.create', targetType: 'User', targetId: user._id, detail: user.email });
  return created(res, adminUserView(user));
});

const updateUser = catchAsync(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');

  const { name, email, city, phone, bio, morphology } = req.body;
  if (name !== undefined) target.name = name;
  if (email !== undefined) target.email = email.toLowerCase();
  if (city !== undefined) target.city = city;
  if (phone !== undefined) target.phone = phone;
  if (bio !== undefined) target.bio = bio;
  if (morphology !== undefined) target.morphology = morphology;
  await target.save();

  await notify(target, 'account_updated_by_admin', 'Your account was updated', 'An administrator updated your account details.');
  logAdminAction({ adminId: req.user._id, action: 'user.update', targetType: 'User', targetId: target._id });
  return ok(res, adminUserView(target));
});

/** Shared guard for changeRole/deactivateUser/deleteUser — refuses to strip
 * the platform's last active admin of that status, which would otherwise
 * lock every admin out of the admin console with no way back in. */
async function ensureNotLastActiveAdmin(targetUser) {
  if (targetUser.role !== 'admin' || !targetUser.active) return;
  const otherActiveAdmins = await User.countDocuments({ role: 'admin', active: true, _id: { $ne: targetUser._id } });
  if (otherActiveAdmins === 0) throw ApiError.badRequest("Can't remove the platform's last active admin");
}

const changeRole = catchAsync(async (req, res) => {
  if (req.params.id === req.user._id.toString()) throw ApiError.badRequest("You can't change your own role here");
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');

  const { role } = req.body;
  if (role !== target.role) {
    await ensureNotLastActiveAdmin(target);
    const previousRole = target.role;
    target.role = role;
    await target.save();
    await notify(target, 'role_changed_by_admin', 'Your account role was updated', `Your MorphoFit role is now ${role}.`);
    logAdminAction({
      adminId: req.user._id,
      action: 'user.changeRole',
      targetType: 'User',
      targetId: target._id,
      detail: `${previousRole} → ${role}`,
    });
  }
  return ok(res, adminUserView(target));
});

const setPassword = catchAsync(async (req, res) => {
  const target = await User.findById(req.params.id).select('+passwordHash');
  if (!target) throw ApiError.notFound('User not found');

  target.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await target.save();

  await notify(target, 'password_reset_by_admin', 'Your password was reset', 'An administrator reset your MorphoFit password.');
  logAdminAction({ adminId: req.user._id, action: 'user.setPassword', targetType: 'User', targetId: target._id });
  return ok(res, { success: true });
});

const deactivateUser = catchAsync(async (req, res) => {
  if (req.params.id === req.user._id.toString()) throw ApiError.badRequest("You can't deactivate your own account here");
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');
  if (!target.active) return ok(res, adminUserView(target));

  await ensureNotLastActiveAdmin(target);
  target.active = false;
  await target.save();

  await notify(target, 'account_deactivated_by_admin', 'Your account was deactivated', 'An administrator deactivated your MorphoFit account.');
  logAdminAction({ adminId: req.user._id, action: 'user.deactivate', targetType: 'User', targetId: target._id });
  return ok(res, adminUserView(target));
});

const reactivateUser = catchAsync(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');
  if (target.active) return ok(res, adminUserView(target));

  target.active = true;
  await target.save();

  await notify(target, 'account_reactivated_by_admin', 'Your account was reactivated', 'An administrator reactivated your MorphoFit account.');
  logAdminAction({ adminId: req.user._id, action: 'user.reactivate', targetType: 'User', targetId: target._id });
  return ok(res, adminUserView(target));
});

const deleteUser = catchAsync(async (req, res) => {
  if (req.params.id === req.user._id.toString()) throw ApiError.badRequest("You can't delete your own account here");
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');

  await ensureNotLastActiveAdmin(target);
  const { email } = target;
  await User.findByIdAndDelete(target._id);

  // A deleted account must not leave its body photos behind on disk. Only the
  // stored images (and unsaved drafts) go; the Measurement documents are left
  // exactly as before this feature existed, minus the now-dead photo refs.
  const scans = await Measurement.find({ userId: target._id, 'photos.0': { $exists: true } }).select('photos');
  const drafts = await BodyScanDraft.find({ userId: target._id });
  removeScanFiles([...scans, ...drafts].flatMap((doc) => doc.photos.map((p) => p.file)));
  await BodyScanDraft.deleteMany({ userId: target._id });
  await Measurement.updateMany({ userId: target._id }, { $unset: { photos: 1 } });

  logAdminAction({ adminId: req.user._id, action: 'user.delete', targetType: 'User', targetId: target._id, detail: email });
  return ok(res, { success: true });
});

const recentActivity = catchAsync(async (req, res) => {
  const entries = await AdminActionLog.find().sort({ createdAt: -1 }).limit(50);
  const adminIds = [...new Set(entries.map((e) => e.adminId.toString()))];
  const admins = await User.find({ _id: { $in: adminIds } });
  const nameById = new Map(admins.map((a) => [a._id.toString(), a.name]));

  return ok(
    res,
    entries.map((e) => ({
      id: e._id.toString(),
      adminName: nameById.get(e.adminId.toString()) || 'Unknown admin',
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId ? e.targetId.toString() : undefined,
      detail: e.detail,
      createdAt: e.createdAt,
    }))
  );
});

module.exports = {
  users,
  orders,
  getUser,
  createUser,
  updateUser,
  changeRole,
  setPassword,
  deactivateUser,
  reactivateUser,
  deleteUser,
  recentActivity,
};
