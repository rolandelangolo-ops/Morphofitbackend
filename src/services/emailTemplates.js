const { appUrl } = require('../config/env');

// Palette mirrors the frontend's light-theme tokens (src/index.css) so
// emails read as the same product. Inlined literals, not CSS variables —
// mail clients don't support custom properties.
const C = {
  ink: '#1C1916',
  inkMuted: '#5C5348',
  inkSubtle: '#655C4F',
  gold: '#8F6E33',
  goldDark: '#6B5124',
  parchment: '#F0EAE0',
  parchmentDark: '#E4DACB',
  surface: '#FFFCF7',
  cream: '#FBF8F3',
  seal: '#B23A2E',
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Shared shell: header wordmark, content card, optional CTA, footer.
 * Table-based and inline-styled because that's what mail clients render
 * reliably (no flex/grid, no <style> blocks). */
function layout({ heading, intro, bodyHtml = '', cta, footerNote }) {
  const ctaHtml = cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${cta.url}" style="display:inline-block;background:${C.gold};color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:13px 26px;border-radius:12px;">${escapeHtml(cta.label)}</a>
       </td></tr>
       <tr><td style="padding:14px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.inkSubtle};">
         If the button doesn't work, copy this link into your browser:<br />
         <span style="color:${C.goldDark};word-break:break-all;">${cta.url}</span>
       </td></tr>`
    : '';

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.cream};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td style="padding-bottom:20px;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:${C.ink};letter-spacing:0.5px;">MorphoFit</span>
          <span style="font-family:'Courier New',monospace;font-size:10px;color:${C.inkSubtle};letter-spacing:2px;text-transform:uppercase;padding-left:8px;">Atelier</span>
        </td></tr>

        <tr><td style="background:${C.surface};border:1px solid ${C.parchmentDark};border-radius:20px;padding:32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:${C.ink};padding-bottom:12px;line-height:1.3;">
              ${escapeHtml(heading)}
            </td></tr>
            <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:${C.inkMuted};padding-bottom:${bodyHtml || cta ? '18px' : '0'};">
              ${intro}
            </td></tr>
            ${bodyHtml ? `<tr><td style="padding-bottom:18px;">${bodyHtml}</td></tr>` : ''}
            ${ctaHtml}
          </table>
        </td></tr>

        <tr><td style="padding-top:20px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:${C.inkSubtle};">
          ${footerNote ? `${escapeHtml(footerNote)}<br /><br />` : ''}
          You're receiving this because you have a MorphoFit account.
          Manage which emails you get in <a href="${appUrl}/dashboard/settings" style="color:${C.goldDark};">Settings</a>.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Key/value detail block used by order + appointment emails. */
function detailRows(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.parchment};border-radius:12px;padding:4px 16px;">
    ${rows
      .filter((r) => r && r.value)
      .map(
        (r) => `<tr>
          <td style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${C.inkSubtle};padding:10px 0 2px;">${escapeHtml(r.label)}</td>
        </tr>
        <tr>
          <td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${C.ink};padding:0 0 10px;">${escapeHtml(r.value)}</td>
        </tr>`
      )
      .join('')}
  </table>`;
}

/** Strips tags for the plaintext alternative every message ships with. */
function toText(...parts) {
  return parts
    .filter(Boolean)
    .join('\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Account & security ───────────────────────────────────────────────────

function welcome({ name, verifyUrl }) {
  const intro = `Welcome to MorphoFit, ${escapeHtml(name)}. Your atelier account is ready.${
    verifyUrl ? ' Confirm your email address to secure it and unlock account recovery.' : ''
  }`;
  return {
    subject: 'Welcome to MorphoFit',
    html: layout({
      heading: 'Your atelier account is ready',
      intro,
      cta: verifyUrl ? { label: 'Confirm email address', url: verifyUrl } : undefined,
    }),
    text: toText(intro, verifyUrl && `Confirm your email: ${verifyUrl}`),
  };
}

function accountProvisioned({ name, resetUrl }) {
  const intro = `Hi ${escapeHtml(name)}, an administrator created a MorphoFit account for you. Choose a password to get started.`;
  return {
    subject: 'Your MorphoFit account is ready',
    html: layout({
      heading: 'Your MorphoFit account is ready',
      intro,
      cta: { label: 'Set your password', url: resetUrl },
      footerNote: 'This link expires in 24 hours and can only be used once.',
    }),
    text: toText(intro, `Set your password: ${resetUrl}`, 'This link expires in 24 hours and can only be used once.'),
  };
}

function verifyEmail({ name, verifyUrl }) {
  const intro = `Hi ${escapeHtml(name)}, confirm this email address to finish securing your MorphoFit account.`;
  return {
    subject: 'Confirm your MorphoFit email address',
    html: layout({
      heading: 'Confirm your email address',
      intro,
      cta: { label: 'Confirm email address', url: verifyUrl },
      footerNote: 'This link expires in 24 hours. If you didn\'t create a MorphoFit account, you can ignore this email.',
    }),
    text: toText(intro, `Confirm your email: ${verifyUrl}`, 'This link expires in 24 hours.'),
  };
}

function passwordReset({ name, resetUrl }) {
  const intro = `Hi ${escapeHtml(name)}, we received a request to reset your MorphoFit password. Choose a new one using the link below.`;
  return {
    subject: 'Reset your MorphoFit password',
    html: layout({
      heading: 'Reset your password',
      intro,
      cta: { label: 'Choose a new password', url: resetUrl },
      footerNote:
        'This link expires in 24 hours and can only be used once. If you didn\'t request a reset, ignore this email — your password stays unchanged.',
    }),
    text: toText(intro, `Reset your password: ${resetUrl}`, 'This link expires in 24 hours and can only be used once.'),
  };
}

function passwordChanged({ name }) {
  const intro = `Hi ${escapeHtml(name)}, your MorphoFit password was just changed.`;
  return {
    subject: 'Your MorphoFit password was changed',
    html: layout({
      heading: 'Your password was changed',
      intro,
      footerNote: 'If this wasn\'t you, reset your password immediately and contact support from the Help screen.',
    }),
    text: toText(intro, "If this wasn't you, reset your password immediately."),
  };
}

function accountDeactivated({ name }) {
  const intro = `Hi ${escapeHtml(name)}, your MorphoFit account has been deactivated and you've been signed out. Your orders, measurements, and messages are retained.`;
  return {
    subject: 'Your MorphoFit account was deactivated',
    html: layout({
      heading: 'Your account was deactivated',
      intro,
      footerNote: 'Want it back? Contact support and we can reactivate it.',
    }),
    text: toText(intro, 'Want it back? Contact support and we can reactivate it.'),
  };
}

// ── Notification mirror ──────────────────────────────────────────────────

// Deep link + button label per notification type. Adding a new type to
// Notification.js without touching this map still produces a valid email —
// it just falls back to the dashboard.
const NOTIFICATION_LINKS = {
  appointment_requested: { label: 'Review request', path: () => '/dashboard/appointments' },
  appointment_confirmed: { label: 'View appointment', path: () => '/dashboard/appointments' },
  appointment_declined: { label: 'Book another time', path: () => '/dashboard/appointments' },
  order_status_changed: { label: 'Track your order', path: () => '/dashboard/orders' },
  message_received: {
    label: 'Open conversation',
    path: (data) => (data?.conversationId ? `/dashboard/messages/${data.conversationId}` : '/dashboard/messages'),
  },
  support_request_created: { label: 'Open support queue', path: () => '/dashboard/support' },
  support_response_added: { label: 'View request', path: () => '/dashboard/help' },
  support_reply_received: { label: 'View request', path: () => '/dashboard/help' },
  support_status_changed: { label: 'View request', path: () => '/dashboard/help' },
  account_updated_by_admin: { label: 'Review your account', path: () => '/dashboard/settings' },
  role_changed_by_admin: { label: 'Review your account', path: () => '/dashboard/settings' },
  account_deactivated_by_admin: { label: 'Review your account', path: () => '/dashboard/settings' },
  account_reactivated_by_admin: { label: 'Review your account', path: () => '/dashboard/settings' },
  password_reset_by_admin: { label: 'Review your account', path: () => '/dashboard/settings' },
};

/** Email counterpart of an in-app notification. Deliberately built from the
 * same `type`/`title`/`body`/`data` that notify() already receives, so every
 * existing (and future) notification call site gets an email for free —
 * no per-event wiring to keep in sync. */
function notificationEmail({ name, type, title, body, data }) {
  const link = NOTIFICATION_LINKS[type];
  const path = link ? link.path(data) : '/dashboard';
  const intro = `Hi ${escapeHtml(name)}, ${escapeHtml(body || title)}`;
  return {
    subject: title,
    html: layout({
      heading: title,
      intro,
      bodyHtml: body && body !== title ? detailRows([{ label: 'Details', value: body }]) : '',
      cta: { label: link ? link.label : 'Open MorphoFit', url: `${appUrl}${path}` },
    }),
    text: toText(intro, `${appUrl}${path}`),
  };
}

/** Batched variant for chat — one email covering N unread messages rather
 * than one per message. See the throttle in notificationsController. */
function messageDigest({ name, senderName, preview, conversationId, count }) {
  const many = count > 1;
  const intro = many
    ? `Hi ${escapeHtml(name)}, you have ${count} unread messages from ${escapeHtml(senderName)}.`
    : `Hi ${escapeHtml(name)}, ${escapeHtml(senderName)} sent you a message.`;
  return {
    subject: many ? `${count} new messages from ${senderName}` : `New message from ${senderName}`,
    html: layout({
      heading: many ? 'You have unread messages' : 'You have a new message',
      intro,
      bodyHtml: preview ? detailRows([{ label: 'Latest message', value: preview }]) : '',
      cta: { label: 'Open conversation', url: `${appUrl}/dashboard/messages/${conversationId}` },
    }),
    text: toText(intro, preview, `${appUrl}/dashboard/messages/${conversationId}`),
  };
}

module.exports = {
  welcome,
  accountProvisioned,
  verifyEmail,
  passwordReset,
  passwordChanged,
  accountDeactivated,
  notificationEmail,
  messageDigest,
};
