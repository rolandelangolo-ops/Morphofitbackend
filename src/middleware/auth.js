const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { User } = require('../models');

function tokenFor(user) {
  return jwt.sign({ id: user._id.toString() }, jwtSecret, { expiresIn: jwtExpiresIn });
}

/**
 * Verifies the `Authorization: Bearer <token>` JWT issued at login/register
 * and attaches the corresponding User document as req.user.
 */
const authenticate = catchAsync(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw ApiError.unauthorized('Missing Authorization header');

  let payload;
  try {
    payload = jwt.verify(header.slice(7), jwtSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.id);
  if (!user) throw ApiError.unauthorized('Invalid or expired token');

  req.user = user;
  next();
});

/** Restricts a route to users who hold one of the given roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
    next();
  };
}

module.exports = { authenticate, requireRole, tokenFor };
