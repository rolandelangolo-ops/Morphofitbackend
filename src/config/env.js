const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3001,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:8443').split(',').map((s) => s.trim()),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/morphofit',
  jwtSecret: process.env.JWT_SECRET || 'local-development-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
