require('express-async-errors');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { getHealth } = require('./controllers/healthController');
const { UPLOAD_ROOT } = require('./middleware/upload');
const { authenticate } = require('./middleware/auth');
const { serveAttachment } = require('./controllers/messagingController');
const { serveAttachment: serveSupportAttachment } = require('./controllers/supportController');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientOrigins, credentials: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', getHealth);

// Avatars are meant to be publicly viewable (profile pictures shown across
// the app) so they stay under a plain static mount. Message attachments
// (images/voice notes shared 1:1) are private — only a conversation
// participant may fetch one, so they're served through an authenticated
// route instead of the static mount. See middleware/upload.js.
app.use('/uploads/avatars', express.static(path.join(UPLOAD_ROOT, 'avatars')));
app.get('/uploads/attachments/:filename', authenticate, serveAttachment);
app.get('/uploads/support/:filename', authenticate, serveSupportAttachment);

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
