const mongoose = require('mongoose');

function getHealth(req, res) {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    ok: connected,
    database: mongoose.connection.name || null,
  });
}

module.exports = { getHealth };
