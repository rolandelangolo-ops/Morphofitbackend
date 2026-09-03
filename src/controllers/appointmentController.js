const { Appointment, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { publicUser } = require('./authController');

const listTailors = catchAsync(async (req, res) => {
  const tailors = await User.find({ role: 'tailor' }).sort({ name: 1 });
  return ok(res, tailors.map(publicUser));
});

const list = catchAsync(async (req, res) => {
  const filter = req.user.role === 'client' ? { clientId: req.user._id } : req.user.role === 'tailor' ? { tailorId: req.user._id } : {};
  const appointments = await Appointment.find(filter).sort({ date: 1, time: 1 });
  const enriched = await Promise.all(
    appointments.map(async (appointment) => ({
      id: appointment._id.toString(),
      clientId: appointment.clientId.toString(),
      tailorId: appointment.tailorId.toString(),
      date: appointment.date,
      time: appointment.time,
      notes: appointment.notes,
      status: appointment.status,
      createdAt: appointment.createdAt,
      client: publicUser(await User.findById(appointment.clientId)),
      tailor: publicUser(await User.findById(appointment.tailorId)),
    }))
  );
  return ok(res, enriched);
});

const create = catchAsync(async (req, res) => {
  const { tailorId, date, time, notes } = req.body;
  const tailor = await User.findOne({ _id: tailorId, role: 'tailor' });
  if (!tailor) throw ApiError.badRequest('A valid tailor is required');
  const appointment = await Appointment.create({ clientId: req.user._id, tailorId: tailor._id, date, time, notes });
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
  return ok(res, { ...appointment.toObject(), id: appointment._id.toString() });
});

module.exports = { listTailors, list, create, updateStatus };
