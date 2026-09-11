const crypto = require('crypto');
const { emailTokenTtlHours } = require('../config/env');

/** Generates a one-time token for email verification / password reset.
 * The raw value goes in the emailed link; only its SHA-256 hash is stored,
 * so a database dump can't be replayed to seize accounts. */
function createToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return {
    raw,
    hash: hashToken(raw),
    expires: new Date(Date.now() + emailTokenTtlHours * 60 * 60 * 1000),
  };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = { createToken, hashToken };
