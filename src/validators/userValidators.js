const { z } = require('zod');
const { USER_ROLES } = require('../models/User');

const updateProfile = z
  .object({
    name: z.string().min(1).optional(),
    bio: z.string().max(500).optional(),
    phone: z.string().max(30).optional(),
    city: z.string().max(80).optional(),
    notificationPrefs: z
      .object({
        appointments: z.boolean().optional(),
        orders: z.boolean().optional(),
        messages: z.boolean().optional(),
        support: z.boolean().optional(),
      })
      .partial()
      .optional(),
    // No `account` key — security email (password changed, deactivation)
    // isn't opt-out. See usersController.updateMe.
    emailPrefs: z
      .object({
        appointments: z.boolean().optional(),
        orders: z.boolean().optional(),
        messages: z.boolean().optional(),
        support: z.boolean().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

const changePassword = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

const searchUsers = z.object({
  q: z.string().min(1).max(80),
});

// ── Admin-only user management ──────────────────────────────────────────────
// Deliberately separate from updateProfile/changePassword above: an admin can
// touch fields (email, role) a user can't touch on themselves, and even the
// admin path never accepts role/active/password through the generic update —
// those go through their own dedicated endpoints (adminChangeRole,
// deactivate/reactivate, adminSetPassword) for defense in depth.
const adminCreateUser = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(USER_ROLES),
  city: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
  bio: z.string().max(500).optional(),
  morphology: z.string().max(40).optional(),
});

const adminUpdateUser = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    city: z.string().max(80).optional(),
    phone: z.string().max(30).optional(),
    bio: z.string().max(500).optional(),
    morphology: z.string().max(40).optional(),
  })
  .partial();

const adminChangeRole = z.object({
  role: z.enum(USER_ROLES),
});

const adminSetPassword = z.object({
  newPassword: z.string().min(6),
});

const adminDeleteUser = z.object({
  confirm: z.literal('DELETE'),
});

module.exports = {
  updateProfile,
  changePassword,
  searchUsers,
  adminCreateUser,
  adminUpdateUser,
  adminChangeRole,
  adminSetPassword,
  adminDeleteUser,
};
