/**
 * Checks the SMTP setup end to end, without touching the database or the API.
 *
 *   npm run mail:test                  # sends to SMTP_USER (your own mailbox)
 *   npm run mail:test you@example.com  # sends to a specific address
 *
 * Step 1 opens a connection and authenticates (no mail sent) — this is what
 * fails on a wrong password, blocked port, or bad host. Step 2 sends one real
 * message through the same code path the app's controllers use, so a pass
 * here means the app can send too.
 */
const nodemailer = require('nodemailer');
const { smtp, appUrl } = require('../config/env');
const { sendMail, isMailEnabled } = require('../services/mailService');
const templates = require('../services/emailTemplates');

const recipient = process.argv[2] || smtp.user;

function fail(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`  → ${hint}`);
  process.exit(1);
}

async function main() {
  console.log('\nMorphoFit SMTP check');
  console.log('────────────────────');
  console.log(`MAIL_ENABLED : ${isMailEnabled()}`);
  console.log(`host         : ${smtp.host || '(unset)'}:${smtp.port} secure=${smtp.secure}`);
  console.log(`user         : ${smtp.user || '(unset)'}`);
  console.log(`password     : ${smtp.pass ? `${smtp.pass.length} chars (hidden)` : '(unset)'}`);
  console.log(`from         : ${smtp.from}`);
  console.log(`APP_URL      : ${appUrl}   ← links inside emails point here`);
  console.log(`skip domains : ${smtp.skipDomains.join(', ') || '(none)'}`);
  console.log(`recipient    : ${recipient}\n`);

  if (!isMailEnabled()) {
    fail(
      'Mail is disabled, so nothing would be delivered.',
      'Set MAIL_ENABLED=true and SMTP_HOST=... in .env, then re-run.'
    );
  }
  if (!recipient) {
    fail('No recipient.', 'Pass one: npm run mail:test you@example.com');
  }

  const domain = recipient.split('@').pop().toLowerCase();
  if (smtp.skipDomains.includes(domain)) {
    fail(
      `"${domain}" is on MAIL_SKIP_DOMAINS, so this address is dropped on purpose.`,
      'That domain cannot receive mail. Use a real address, or clear MAIL_SKIP_DOMAINS in .env.'
    );
  }

  // ── 1. Connect + authenticate (nothing is sent) ──────────────────────────
  process.stdout.write('1/2  connecting and authenticating… ');
  const probe = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  try {
    await probe.verify();
    console.log('OK');
  } catch (err) {
    console.log('FAILED');
    const hints = {
      EAUTH: 'Wrong username or app password. Gmail needs an App Password (16 chars, no spaces) with 2-Step Verification on — a normal account password will not work.',
      ECONNECTION: 'Could not reach the server. Check SMTP_HOST/SMTP_PORT, and whether a firewall or your network blocks outbound SMTP.',
      ETIMEDOUT: 'The server never answered — usually a blocked port. Try port 465 with SMTP_SECURE=true.',
      ESOCKET: 'TLS mismatch. Use port 587 with SMTP_SECURE=false, or port 465 with SMTP_SECURE=true.',
    };
    fail(`${err.code || 'Error'}: ${err.message}`, hints[err.code]);
  }

  // ── 2. Send one real message through the app's own mail service ──────────
  process.stdout.write('2/2  sending a test message… ');
  const tpl = templates.verifyEmail({
    name: 'MorphoFit',
    verifyUrl: `${appUrl}/verify-email?token=smtp-self-test`,
  });
  const delivered = await sendMail({
    to: recipient,
    subject: '[MorphoFit] SMTP test',
    html: tpl.html,
    text: tpl.text,
  });

  if (!delivered) {
    console.log('FAILED');
    fail('The server accepted the connection but the send did not go through.', 'See the [mail] error logged just above.');
  }

  console.log(`\n✔ Sent. Check ${recipient} (including Spam) for "[MorphoFit] SMTP test".`);
  console.log('  Delivery is asynchronous — a bounce, if any, arrives a minute later.\n');
}

main().catch((err) => fail(err.message));
