const nodemailer = require('nodemailer');
const { smtp, nodeEnv } = require('../config/env');

let transporter = null;
let transportKind = null; // 'smtp' | 'console'

/** Lazily builds the transport. When MAIL_ENABLED isn't true (or SMTP_HOST
 * is missing) we deliberately fall back to a console transport rather than
 * throwing — local dev and the seeded demo accounts use addresses that
 * don't exist, so attempting real delivery would only produce bounces. */
function getTransporter() {
  if (transporter) return transporter;

  if (smtp.enabled && smtp.host) {
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      // Explicit, short timeouts. Nodemailer defaults to a 2-minute socket
      // timeout, so a firewalled/blackholed SMTP host (which hangs rather
      // than refusing) would otherwise stall any caller that awaits a send.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    transportKind = 'smtp';
  } else {
    // jsonTransport doesn't open any connection; it just serializes the
    // message so we can log it.
    transporter = nodemailer.createTransport({ jsonTransport: true });
    transportKind = 'console';
  }
  return transporter;
}

/** Sends one email. Never throws and never rejects — a failed email must
 * not fail the API request that triggered it (an order status change still
 * succeeded even if the notification email bounced). Returns true only if
 * the message was actually handed to a real SMTP server. */
/** True when the recipient's domain is on the skip list (see env.smtp
 * skipDomains) — used to avoid mailing the fake demo addresses. */
function isUndeliverableDomain(to) {
  const domain = String(to).split('@').pop()?.toLowerCase();
  return Boolean(domain && smtp.skipDomains.includes(domain));
}

async function sendMail({ to, subject, html, text }) {
  if (!to) return false;

  if (isUndeliverableDomain(to)) {
    // Logged rather than silent, so this never looks like "email is broken".
    console.log(`[mail:skipped] to=${to} subject="${subject}" (domain on MAIL_SKIP_DOMAINS — would hard-bounce)`);
    return false;
  }

  try {
    const tx = getTransporter();
    const info = await tx.sendMail({ from: smtp.from, to, subject, html, text });

    if (transportKind === 'console') {
      if (nodeEnv !== 'test') {
        console.log(`[mail:console] to=${to} subject="${subject}" (set MAIL_ENABLED=true + SMTP_HOST to deliver for real)`);
      }
      return false;
    }
    console.log(`[mail] sent to=${to} subject="${subject}" id=${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[mail] FAILED to=${to} subject="${subject}":`, err.message);
    return false;
  }
}

/** Fire-and-forget wrapper for call sites that must not await delivery
 * (notification side effects inside a request handler). */
function sendMailAsync(options) {
  setImmediate(() => {
    sendMail(options).catch((err) => console.error('[mail] unexpected:', err));
  });
}

function isMailEnabled() {
  return Boolean(smtp.enabled && smtp.host);
}

module.exports = { sendMail, sendMailAsync, isMailEnabled };
