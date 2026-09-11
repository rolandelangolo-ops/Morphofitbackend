const bcrypt = require('bcryptjs');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { tokenFor } = require('../middleware/auth');
const { createToken, hashToken } = require('../utils/emailTokens');
const { sendMailAsync } = require('../services/mailService');
const templates = require('../services/emailTemplates');
const { appUrl } = require('../config/env');

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    morphology: user.morphology,
    city: user.city,
    bio: user.bio || '',
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

/** Own-profile shape (Settings/Profile screens) — publicUser plus fields
 * that only make sense for the account holder themselves. */
function richUser(user) {
  return {
    ...publicUser(user),
    bio: user.bio || '',
    phone: user.phone,
    notificationPrefs: user.notificationPrefs,
    emailPrefs: user.emailPrefs,
    emailVerified: Boolean(user.emailVerified),
  };
}

/** Minimal shape for viewing ANOTHER user's profile (PublicProfile screen,
 * chat headers) — deliberately excludes email/phone/notificationPrefs. */
function minimalUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    bio: user.bio || '',
    city: user.city,
  };
}

/** Issues a fresh verification token, stores only its hash, and emails the
 * raw one as a link. Shared by register and resendVerification. */
async function issueVerificationEmail(user) {
  const { raw, hash, expires } = createToken();
  user.emailVerificationTokenHash = hash;
  user.emailVerificationExpires = expires;
  await user.save();
  sendMailAsync({
    to: user.email,
    ...templates.verifyEmail({ name: user.name, verifyUrl: `${appUrl}/verify-email?token=${raw}` }),
  });
}

const register = catchAsync(async (req, res) => {
  const { name, email, password, role } = req.body;
  const normalizedEmail = email.toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) {
    throw ApiError.conflict('An account with this email already exists');
  }
  const user = await User.create({
    name,
    email: normalizedEmail,
    role,
    passwordHash: await bcrypt.hash(password, 10),
  });

  // Verification is not a gate — the account works immediately; the email
  // just secures it and enables password recovery.
  const { raw, hash, expires } = createToken();
  user.emailVerificationTokenHash = hash;
  user.emailVerificationExpires = expires;
  await user.save();
  sendMailAsync({
    to: user.email,
    ...templates.welcome({ name: user.name, verifyUrl: `${appUrl}/verify-email?token=${raw}` }),
  });

  return created(res, { token: tokenFor(user), user: publicUser(user) });
});

const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({
    emailVerificationTokenHash: hashToken(token),
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationTokenHash +emailVerificationExpires');
  if (!user) throw ApiError.badRequest('This verification link is invalid or has expired');

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  return ok(res, { success: true, email: user.email });
});

const resendVerification = catchAsync(async (req, res) => {
  if (req.user.emailVerified) return ok(res, { success: true, alreadyVerified: true });
  await issueVerificationEmail(req.user);
  return ok(res, { success: true });
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase(), active: true });

  // Always answer identically whether or not the address exists — otherwise
  // this endpoint becomes an account-enumeration oracle. The send is
  // deliberately fire-and-forget rather than awaited: awaiting it makes the
  // response measurably slower for a real address than an unknown one,
  // which leaks exactly what the identical body is hiding (and would also
  // stall the request behind SMTP if the host hangs rather than refusing).
  if (user) {
    const { raw, hash, expires } = createToken();
    user.passwordResetTokenHash = hash;
    user.passwordResetExpires = expires;
    await user.save();
    sendMailAsync({
      to: user.email,
      ...templates.passwordReset({ name: user.name, resetUrl: `${appUrl}/reset-password?token=${raw}` }),
    });
  }
  return ok(res, { success: true });
});

const resetPassword = catchAsync(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpires +passwordHash');
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');

  user.passwordHash = await bcrypt.hash(password, 10);
  // Single-use: burn the token so the emailed link can't be replayed.
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  sendMailAsync({ to: user.email, ...templates.passwordChanged({ name: user.name }) });
  return ok(res, { token: tokenFor(user), user: publicUser(user) });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.active) throw ApiError.unauthorized('This account has been deactivated');
  return ok(res, { token: tokenFor(user), user: publicUser(user) });
});

const me = catchAsync(async (req, res) => {
  return ok(res, publicUser(req.user));
});

module.exports = {
  register,
  login,
  me,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  publicUser,
  richUser,
  minimalUser,
};
