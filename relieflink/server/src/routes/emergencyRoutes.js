const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Emergency = require('../models/Emergency');
const Volunteer = require('../models/Volunteer');
const { protect, authorize } = require('../middleware/authMiddleware');
const { APPROVAL_REQUIRED_ROLES } = require('../utils/roles');
const { CLASS_NAMES, findRecommendations, processEmergencyAI, priorityFor } = require('../services/aiIntegrationService');
const AppError = require('../utils/appError');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads/emergencies');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = path.extname(file.originalname) || '.jpg';
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new AppError('Only JPG, JPEG, PNG, and WEBP images are allowed.', 400));
    }

    cb(null, true);
  },
});

const normalizeCoordinates = (value) => {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return null;
  }

  return number;
};

const responderRoles = ['volunteer', 'ngo', 'hospital', 'authority', 'admin'];
const coordinationRoles = ['ngo', 'authority', 'admin'];
const statusValues = ['Submitted', 'Processing', 'Detected', 'Verification Required', 'Assigned', 'In Progress', 'Resolved', 'Cancelled', 'Failed'];

const publicEmergency = (emergency) => ({
  id: emergency._id,
  emergencyId: emergency._id,
  type: emergency.aiStatus === 'Verification Required' ? 'Verification Required' : emergency.aiPrediction || '',
  description: emergency.description,
  aiConfidence: emergency.aiConfidence,
  aiStatus: emergency.aiStatus,
  priority: emergency.priority,
  verificationStatus: emergency.aiStatus === 'Verification Required' ? 'Verification Required' : emergency.verifiedPrediction ? 'Verified' : 'Not required',
  latitude: emergency.latitude,
  longitude: emergency.longitude,
  location: emergency.location,
  status: emergency.status,
  assignedVolunteer: emergency.assignedVolunteer,
  recommendations: emergency.recommendations,
  createdAt: emergency.createdAt,
  updatedAt: emergency.updatedAt,
  aiUpdatedAt: emergency.aiUpdatedAt,
});

const emitStatus = (req, emergency) => {
  const io = req.app.get('io');
  if (io) io.emit('emergency:status-updated', { emergencyId: emergency._id, emergency: publicEmergency(emergency) });
};

router.get('/active', protect, authorize(...responderRoles), async (req, res, next) => {
  try {
    const filter = { status: { $nin: ['Resolved', 'Cancelled'] } };
    if (req.user.role === 'volunteer') {
      const volunteer = await Volunteer.findOne({ user: req.user._id });
      filter.assignedVolunteer = volunteer?._id || null;
    }
    const emergencies = await Emergency.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .populate('assignedVolunteer');
    res.status(200).json({ success: true, count: emergencies.length, emergencies: emergencies.map(publicEmergency) });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', protect, authorize(...responderRoles), async (req, res, next) => {
  try {
    const [active, critical, high, verification, assigned, inProgress, resolved] = await Promise.all([
      Emergency.countDocuments({ status: { $nin: ['Resolved', 'Cancelled'] } }),
      Emergency.countDocuments({ priority: 'Critical', status: { $nin: ['Resolved', 'Cancelled'] } }),
      Emergency.countDocuments({ priority: 'High', status: { $nin: ['Resolved', 'Cancelled'] } }),
      Emergency.countDocuments({ aiStatus: 'Verification Required' }),
      Emergency.countDocuments({ status: 'Assigned' }),
      Emergency.countDocuments({ status: 'In Progress' }),
      Emergency.countDocuments({ status: 'Resolved' }),
    ]);
    res.status(200).json({ success: true, stats: { active, critical, high, verification, assigned, inProgress, resolved } });
  } catch (error) {
    next(error);
  }
});

router.post('/', protect, upload.single('image'), async (req, res, next) => {
  try {
    const { description, latitude, longitude, contactInfo, priority } = req.body;

    if ((!description || !description.trim()) && !req.file) {
      return next(new AppError('Emergency description or image is required.', 400));
    }

    const lat = normalizeCoordinates(latitude);
    const lng = normalizeCoordinates(longitude);

    if (lat === null || lng === null) {
      return next(new AppError('Valid latitude and longitude are required.', 400));
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return next(new AppError('Latitude and longitude values are out of range.', 400));
    }

    const emergency = await Emergency.create({
      userId: req.user._id,
      description: description ? description.trim() : '',
      imageUrl: req.file ? `/uploads/emergencies/${req.file.filename}` : '',
      latitude: lat,
      longitude: lng,
      contactInfo: contactInfo ? contactInfo.trim() : '',
      priority: priority || 'Medium',
      status: 'Submitted',
      aiStatus: 'Pending',
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('emergency:created', {
        id: emergency._id,
        userId: emergency.userId,
        description: emergency.description,
        status: emergency.status,
        priority: emergency.priority,
        latitude: emergency.latitude,
        longitude: emergency.longitude,
      });
    }

    setImmediate(() => {
      processEmergencyAI(emergency._id, io).catch(() => {});
    });

    res.status(201).json({
      success: true,
      message: 'Emergency SOS submitted successfully.',
      emergency,
    });
  } catch (error) {
    next(error);
  }
});

const canViewEmergency = async (emergency, user) => {
  const isOwner = emergency.userId && emergency.userId.toString() === user._id.toString();
  if (isOwner) return true;
  if (APPROVAL_REQUIRED_ROLES.includes(user.role) && user.approvalStatus !== 'approved') return false;
  if (['admin', 'authority', 'ngo', 'hospital'].includes(user.role)) return true;
  if (user.role !== 'volunteer') return false;
  const volunteer = await Volunteer.findOne({ user: user._id });
  const assignedId = emergency.assignedVolunteer?._id || emergency.assignedVolunteer;
  return Boolean(volunteer && assignedId && assignedId.toString() === volunteer._id.toString());
};

const getEmergencyOrFail = async (id, user, next) => {
  const emergency = await Emergency.findById(id).populate('assignedVolunteer');
  if (!emergency) {
    next(new AppError('Emergency not found.', 404));
    return null;
  }
  if (!(await canViewEmergency(emergency, user))) {
    next(new AppError('Not authorized to view this emergency.', 403));
    return null;
  }
  return emergency;
};

router.post('/:id/process-ai', protect, async (req, res, next) => {
  try {
    const emergency = await getEmergencyOrFail(req.params.id, req.user, next);
    if (!emergency) return;
    const result = await processEmergencyAI(emergency._id, req.app.get('io'));
    res.status(200).json({ success: true, emergency: result });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/ai-result', protect, async (req, res, next) => {
  try {
    const emergency = await getEmergencyOrFail(req.params.id, req.user, next);
    if (!emergency) return;
    res.status(200).json({
      success: true,
      ai: {
        status: emergency.aiStatus,
        prediction: emergency.aiPrediction,
        confidence: emergency.aiConfidence,
        probabilities: Object.fromEntries(emergency.aiProbabilities || []),
        explanation: emergency.aiExplanation,
        modalityContribution: emergency.aiModalityContribution,
        evidence: emergency.aiEvidence,
        updatedAt: emergency.aiUpdatedAt,
        verifiedPrediction: emergency.verifiedPrediction,
        verifiedBy: emergency.verifiedBy,
        verifiedAt: emergency.verifiedAt,
        verificationReason: emergency.verificationReason,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/recommendations', protect, async (req, res, next) => {
  try {
    const emergency = await getEmergencyOrFail(req.params.id, req.user, next);
    if (!emergency) return;
    if (emergency.aiStatus === 'Verification Required' || !CLASS_NAMES.includes(emergency.aiPrediction)) {
      return res.status(200).json({ success: true, recommendations: emergency.recommendations || { facilities: [], resources: [], facilityMessage: 'No suitable registered facility available.' } });
    }
    const recommendations = await findRecommendations(emergency, emergency.aiPrediction);
    await Emergency.updateOne({ _id: emergency._id }, { $set: { recommendations } });
    res.status(200).json({ success: true, recommendations });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/verify', protect, authorize('authority', 'admin'), async (req, res, next) => {
  try {
    const { prediction, reason } = req.body;
    if (prediction !== null && !CLASS_NAMES.includes(prediction)) {
      return next(new AppError('Verification prediction must be Fire, Flood, Accident, or null to reject.', 400));
    }
    const emergency = await Emergency.findById(req.params.id);
    if (!emergency) return next(new AppError('Emergency not found.', 404));
    emergency.verifiedPrediction = prediction || '';
    emergency.verifiedBy = req.user._id;
    emergency.verifiedAt = new Date();
    emergency.verificationReason = reason ? String(reason).trim() : '';
    if (prediction) {
      emergency.aiPrediction = prediction;
      emergency.priority = priorityFor(prediction, emergency.aiConfidence, false, emergency);
      emergency.aiStatus = 'Completed';
      emergency.status = 'Confirmed';
    } else {
      emergency.aiStatus = 'Failed';
      emergency.status = 'Submitted';
    }
    await emergency.save();
    const io = req.app.get('io');
    if (io) io.emit('emergency:ai-completed', { emergencyId: emergency._id, emergency });
    res.status(200).json({ success: true, emergency });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', protect, authorize(...responderRoles), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!statusValues.includes(status)) return next(new AppError('Invalid emergency status.', 400));
    const emergency = await Emergency.findById(req.params.id);
    if (!emergency) return next(new AppError('Emergency not found.', 404));
    if (req.user.role === 'volunteer' && (!emergency.assignedVolunteer || emergency.assignedVolunteer.toString() !== req.user._id.toString())) {
      return next(new AppError('Volunteers may update only assigned emergencies.', 403));
    }
    emergency.status = status;
    await emergency.save();
    emitStatus(req, emergency);
    res.status(200).json({ success: true, emergency });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/assign-volunteer', protect, authorize(...coordinationRoles), async (req, res, next) => {
  try {
    const { volunteerId } = req.body;
    const [emergency, volunteer] = await Promise.all([
      Emergency.findById(req.params.id),
      Volunteer.findOne({ _id: volunteerId, availability: 'available' }),
    ]);
    if (!emergency) return next(new AppError('Emergency not found.', 404));
    if (!volunteer) return next(new AppError('No suitable volunteer available.', 404));
    emergency.assignedVolunteer = volunteer._id;
    emergency.status = 'Assigned';
    await emergency.save();
    volunteer.availability = 'busy';
    await volunteer.save();
    const io = req.app.get('io');
    if (io) io.emit('emergency:volunteer-assigned', { emergencyId: emergency._id, emergency: publicEmergency(emergency), volunteer });
    res.status(200).json({ success: true, emergency, volunteer });
  } catch (error) {
    next(error);
  }
});

router.get('/my', protect, async (req, res, next) => {
  try {
    const emergencies = await Emergency.find({ userId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: emergencies.length,
      emergencies,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', protect, authorize('volunteer', 'ngo', 'hospital', 'authority', 'admin'), async (req, res, next) => {
  try {
    const emergencies = await Emergency.find().sort({ createdAt: -1 }).populate('userId', 'name email role');

    res.status(200).json({
      success: true,
      count: emergencies.length,
      emergencies,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', protect, async (req, res, next) => {
  try {
    const emergency = await getEmergencyOrFail(req.params.id, req.user, next);
    if (!emergency) return;

    res.status(200).json({
      success: true,
      emergency,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.publicEmergency = publicEmergency;
module.exports.statusValues = statusValues;
