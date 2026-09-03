const bcrypt = require('bcryptjs');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { tokenFor } = require('../middleware/auth');

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    morphology: user.morphology,
    city: user.city,
    createdAt: user.createdAt,
  };
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
  return created(res, { token: tokenFor(user), user: publicUser(user) });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  return ok(res, { token: tokenFor(user), user: publicUser(user) });
});

const me = catchAsync(async (req, res) => {
  return ok(res, publicUser(req.user));
});

module.exports = { register, login, me, publicUser };
