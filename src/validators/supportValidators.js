const { z } = require('zod');
const { TYPES, CATEGORIES, STATUSES, PRIORITIES } = require('../models/SupportRequest');

// Submitted as multipart/form-data alongside the optional screenshots, so
// `context` arrives as a JSON string rather than a nested object — parse it
// before validating its shape.
const contextSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}, z.object({ path: z.string(), screenLabel: z.string() }).optional());

const createSupportRequest = z.object({
  type: z.enum(TYPES),
  category: z.enum(CATEGORIES).optional().default('other'),
  subject: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5),
  context: contextSchema,
});

const addResponse = z.object({
  message: z.string().trim().min(1),
});

const updateStatus = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .refine((data) => data.status !== undefined || data.priority !== undefined, {
    message: 'Provide status and/or priority',
  });

module.exports = { createSupportRequest, addResponse, updateStatus };
