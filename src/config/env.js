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
  },

  /** Hours a verification / password-reset link stays valid. */
  emailTokenTtlHours: parseInt(process.env.EMAIL_TOKEN_TTL_HOURS, 10) || 24,
};
