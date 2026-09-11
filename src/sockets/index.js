const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { User } = require('../models');

let io = null;

/** Attaches Socket.IO to the same HTTP server as the Express API (see
 * server.js). JWT handshake auth mirrors middleware/auth.js so a socket
 * connection uses the exact same bearer token the REST API already issues —
 * no separate auth system. Each socket joins a room keyed by its own userId
 * (for notification/message pushes) and, on demand, a room per open chat
 * thread (`conversation:join`). */
function initSockets(httpServer, corsOrigins) {
  io = new Server(httpServer, { cors: { origin: corsOrigins, credentials: true } });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized'));
      const payload = jwt.verify(token, jwtSecret);
      const user = await User.findById(payload.id);
      if (!user || !user.active) return next(new Error('Unauthorized'));
      socket.userId = user._id.toString();
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on('conversation:join', (conversationId) => {
      if (typeof conversationId === 'string') socket.join(`conversation:${conversationId}`);
    });
    socket.on('conversation:leave', (conversationId) => {
      if (typeof conversationId === 'string') socket.leave(`conversation:${conversationId}`);
    });

    socket.on('typing:start', ({ conversationId } = {}) => {
      if (conversationId) socket.to(`conversation:${conversationId}`).emit('typing:start', { conversationId, userId: socket.userId });
    });
    socket.on('typing:stop', ({ conversationId } = {}) => {
      if (conversationId) socket.to(`conversation:${conversationId}`).emit('typing:stop', { conversationId, userId: socket.userId });
    });

    // Call signaling only — no media relay. A call is always exactly two
    // participants, so each event is forwarded straight to the other
    // person's personal room rather than broadcast conversation-wide.
    for (const event of ['call:invite', 'call:accept', 'call:decline', 'call:end']) {
      socket.on(event, ({ toUserId, conversationId } = {}) => {
        if (toUserId) io.to(`user:${toUserId}`).emit(event, { conversationId, fromUserId: socket.userId });
      });
    }
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = { initSockets, getIO };
