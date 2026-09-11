const { AdminActionLog } = require('../models');

/** Records an admin mutation for the "Recent Admin Activity" panel.
 * Fire-and-forget — mirrors mailService.sendMailAsync's "never allowed to
 * fail the request that triggered it" pattern, so a logging hiccup never
 * blocks the actual admin action that already succeeded. */
function logAdminAction({ adminId, action, targetType, targetId, detail = '' }) {
  setImmediate(() => {
    AdminActionLog.create({ adminId, action, targetType, targetId, detail }).catch((err) =>
      console.error('[adminActionLog] failed:', err.message)
    );
  });
}

module.exports = { logAdminAction };
