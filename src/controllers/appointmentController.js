const { Appointment, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { publicUser } = require('./authController');
const { notify } = require('./notificationsController');

const listTailors = catchAsync(async (req, res) => {
  const tailors = await User.find({ role: 'tailor' }).sort({ name: 1 });
  return ok(res, tailors.map(publicUser));
});

const list = catchAsync(async (req, res) => {
  const filter = req.user.role === 'client' ? { clientId: req.user._id } : req.user.role === 'tailor' ? { tailorId: req.user._id } : {};
  const appointments = await Appointment.find(filter)
    .sort({ date: 1, time: 1 })
    .limit(200)
    .populate('clientId')
    .populate('tailorId');
  const enriched = appointments.map((appointment) => ({
    id: appointment._id.toString(),
    clientId: appointment.clientId._id.toString(),
    tailorId: appointment.tailorId._id.toString(),
    date: appointment.date,
    time: appointment.time,
    notes: appointment.notes,
    status: appointment.status,
    createdAt: appointment.createdAt,
    client: publicUser(appointment.clientId),
    tailor: publicUser(appointment.tailorId),
  }));
  return ok(res, enriched);
});

const create = catchAsync(async (req, res) => {
  const { tailorId, date, time, notes } = req.body;
  const tailor = await User.findOne({ _id: tailorId, role: 'tailor' });
  if (!tailor) throw ApiError.badRequest('A valid tailor is required');

  const conflict = await Appointment.findOne({
    tailorId: tailor._id,
    date,
    time,
    status: { $in: ['requested', 'confirmed'] },
  });
  if (conflict) throw ApiError.conflict('This tailor already has an appointment at that date and time');

  const appointment = await Appointment.create({ clientId: req.user._id, tailorId: tailor._id, date, time, notes });
  try {
    await notify(
      tailor,
      'appointment_requested',
      'New appointment request',
      `${req.user.name} requested a fitting on ${date} at ${time}.`,
      { appointmentId: appointment._id }
    );
  } catch (err) {
    console.error('[appointment] notify failed:', err);
  }
  return created(res, {
    id: appointment._id.toString(),
    clientId: appointment.clientId.toString(),
    tailorId: appointment.tailorId.toString(),
    date: appointment.date,
    time: appointment.time,
    notes: appointment.notes,
    status: appointment.status,
    createdAt: appointment.createdAt,
    client: publicUser(req.user),
    tailor: publicUser(tailor),
  });
});

const updateStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const appointment = await Appointment.findOneAndUpdate({ _id: req.params.id, tailorId: req.user._id }, { status }, { new: true });
  if (!appointment) throw ApiError.notFound('Appointment not found');
  if (status === 'confirmed' || status === 'declined') {
    try {
      const client = await User.findById(appointment.clientId);
      if (client) {
        await notify(
          client,
          status === 'confirmed' ? 'appointment_confirmed' : 'appointment_declined',
          status === 'confirmed' ? 'Appointment confirmed' : 'Appointment declined',
          `${req.user.name} ${status} your fitting on ${appointment.date} at ${appointment.time}.`,
          { appointmentId: appointment._id }
        );
      }
    } catch (err) {
      console.error('[appointment] notify failed:', err);
    }
  }
  return ok(res, { ...appointment.toObject(), id: appointment._id.toString() });
});

module.exports = { listTailors, list, create, updateStatus };
