const bcrypt = require('bcryptjs');
const { User, Order, Measurement, Conversation } = require('../models');
const { pairKeyFor } = require('../models/Conversation');

const DEMO_USERS = [
  {
    name: 'Client Demo',
    email: 'client@morphofit.com',
    role: 'client',
    city: 'Douala, Bonanjo',
    bio: 'Bespoke fashion client with calibrated hourglass profile.',
    phone: '+237 655 23 45 67',
    morphology: 'hourglass',
  },
  {
    name: 'Stylist Demo',
    email: 'stylist@morphofit.com',
    role: 'stylist',
    city: 'Yaoundé, Bastos',
    bio: 'Haute couture stylist specialized in silhouette and textile drape.',
    phone: '+237 699 12 34 56',
  },
  {
    name: 'Tailor Demo',
    email: 'tailor@morphofit.com',
    role: 'tailor',
    city: 'Douala, Akwa',
    bio: 'Master artisan of bespoke tailoring with Savile Row training. Atelier Sartorial Douala.',
    phone: '+237 677 89 45 12',
  },
  {
    name: 'Delivery Demo',
    email: 'delivery@morphofit.com',
    role: 'delivery_agent',
    city: 'Douala',
    bio: 'Smart proximity courier for fragile haute couture garments.',
    phone: '+237 670 45 67 89',
  },
  {
    name: 'Admin Demo',
    email: 'admin@morphofit.com',
    role: 'admin',
    city: 'Douala',
    bio: 'MorphoFit Platform Administrator.',
    phone: '+237 670 00 00 00',
  },
];

/** Idempotent — safe to call on every server start (see server.js). */
async function seedDemoUsers() {
  for (const info of DEMO_USERS) {
    const existing = await User.findOne({ email: info.email });
    if (!existing) {
      await User.create({
        name: info.name,
        email: info.email,
        role: info.role,
        city: info.city,
        bio: info.bio,
        phone: info.phone,
        morphology: info.morphology,
        passwordHash: await bcrypt.hash('password123', 10),
      });
    } else {
      // Backfill missing profile fields if not set
      let needsSave = false;
      for (const field of ['city', 'bio', 'phone', 'morphology']) {
        if (info[field] && !existing[field]) {
          existing[field] = info[field];
          needsSave = true;
        }
      }
      if (needsSave) await existing.save();
    }
  }

  // Ensure client demo has measurement
  const client = await User.findOne({ email: 'client@morphofit.com' });
  const tailor = await User.findOne({ email: 'tailor@morphofit.com' });
  const stylist = await User.findOne({ email: 'stylist@morphofit.com' });

  if (client) {
    const m = await Measurement.findOne({ userId: client._id });
    if (!m) {
      await Measurement.create({
        userId: client._id,
        shoulder: 39.5,
        chest: 91,
        waist: 69.5,
        hip: 98,
        inseam: 78,
        thigh: 54,
        armLength: 59,
        height: 172,
        morphology: 'hourglass',
        scannedAt: new Date(),
      });
    }

    if (tailor) {
      // Connect orders where tailorId was not assigned
      await Order.updateMany(
        { clientId: client._id, tailorId: null },
        { $set: { tailorId: tailor._id, stylistId: stylist ? stylist._id : null } }
      );
    }
  }
}

/** Backfills fields added to the User schema after documents already
 * existed in the database. */
async function backfillUserDefaults() {
  await User.updateMany({ active: { $exists: false } }, { $set: { active: true } });
  await User.updateMany({ notificationPrefs: { $exists: false } }, {
    $set: { notificationPrefs: { appointments: true, orders: true, messages: true, support: true } },
  });
  await User.updateMany({ 'notificationPrefs.support': { $exists: false } }, {
    $set: { 'notificationPrefs.support': true },
  });
  // Email channel (added with SMTP support). `messages: false` by default —
  // an email per chat message would be spam; see notificationsController's
  // offline+cooldown throttle for when message mail does go out.
  await User.updateMany({ emailPrefs: { $exists: false } }, {
    $set: {
      emailPrefs: { account: true, appointments: true, orders: true, messages: false, support: true },
    },
  });
  await User.updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: false } });
}

/** Backfills Conversation.pairKey (added after the unique-pair-per-DM
 * constraint was introduced) on any conversation created before it existed. */
async function backfillConversationPairKeys() {
  const stale = await Conversation.find({ pairKey: { $exists: false } });
  for (const conversation of stale) {
    const [a, b] = conversation.participantIds;
    if (!a || !b) continue;
    conversation.pairKey = pairKeyFor(a, b);
    await conversation.save();
  }
}

module.exports = { seedDemoUsers, backfillUserDefaults, backfillConversationPairKeys, DEMO_USERS };
