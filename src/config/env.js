const dotenv = require('dotenv');

dotenv.config();

const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:8443').split(',').map((s) => s.trim());

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3001,
  clientOrigins,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/morphofit',
  jwtSecret: process.env.JWT_SECRET || 'local-development-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  /** Public URL of the frontend — used to build links inside emails
   * (verify address, reset password, deep links to an order/appointment).
   * Defaults to the first allowed CORS origin so local dev works unset. */
  appUrl: (process.env.APP_URL || clientOrigins[0]).replace(/\/$/, ''),

  smtp: {
    // MAIL_ENABLED gates real delivery. Left off, mailService logs each
    // message to the console instead of sending — important here because
    // the seeded demo accounts use addresses that don't exist
    // (client@morphofit.com etc.) and would hard-bounce.
    enabled: process.env.MAIL_ENABLED === 'true',
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'MorphoFit <no-reply@morphofit.com>',
    // Recipient domains that are known not to exist, so mail to them is
    // dropped before it reaches the SMTP server. The seeded demo accounts
    // (client@morphofit.com etc.) are the reason this exists: morphofit.com
    // has no MX record, so every demo notification would hard-bounce back
    // into the sending mailbox and count against its sending reputation.
    // Set MAIL_SKIP_DOMAINS= (empty) to deliver to everything.
    skipDomains: (process.env.MAIL_SKIP_DOMAINS ?? 'morphofit.com')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },

  /** Hours a verification / password-reset link stays valid. */
  emailTokenTtlHours: parseInt(process.env.EMAIL_TOKEN_TTL_HOURS, 10) || 24,

  /** Body Scan AI analysis (see services/geminiBodyScanService.js). Server
   * side only — the key must never reach the frontend. Left unset, the
   * analyze endpoint answers 503 instead of pretending to work. */
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    apiBase: (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
    // One overall deadline for an analysis INCLUDING retries (see
    // generateWithRetry) — the longest a user is ever asked to wait.
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 75000,
    // Tried in order after the primary model keeps answering 503/429 "high
    // demand" or hangs. Quality-first, with the fast lite model as the last
    // resort so a scan still completes when the bigger models are overloaded
    // (measured: lite 3-5s and reliably available; 3.5/3.6-flash 12-50s and
    // frequently 503). Comma-separated; `none` disables fallbacks.
    fallbackModels:
      process.env.GEMINI_FALLBACK_MODELS === 'none'
        ? []
        : (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash,gemini-3.5-flash-lite').split(',').map((s) => s.trim()).filter(Boolean),
    // Newer Gemini models "think" before answering, which adds many seconds
    // to a photo analysis (measured 12s at 'minimal' vs 20-50s at 'low').
    // Set GEMINI_THINKING_LEVEL=none to omit the setting entirely.
    thinkingLevel: process.env.GEMINI_THINKING_LEVEL === 'none' ? '' : process.env.GEMINI_THINKING_LEVEL || 'minimal',
  },
};
