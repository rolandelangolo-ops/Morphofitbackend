const { z } = require('zod');
const { objectId } = require('./common');

const createAppointment = z.object({
  tailorId: objectId,
  date: z.string().min(1),
  time: z.string().min(1),
  notes: z.string().optional().default(''),
});

const updateAppointmentStatus = z.object({
  status: z.enum(['confirmed', 'declined', 'completed']),
});

module.exports = { createAppointment, updateAppointmentStatus };
