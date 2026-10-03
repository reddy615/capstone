const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Emergency = require('../models/Emergency');
const Volunteer = require('../models/Volunteer');
const Hospital = require('../models/Hospital');
const Shelter = require('../models/Shelter');
const Resource = require('../models/Resource');
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

const haversineKm = (first, second) => {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length < 2 || second.length < 2) return null;
  const [firstLongitude, firstLatitude] = first.map(Number);
  const [secondLongitude, secondLatitude] = second.map(Number);
  if (![firstLongitude, firstLatitude, secondLongitude, secondLatitude].every(Number.isFinite)) return null;

  const radians = (degrees) => degrees * (Math.PI / 180);
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const haversine = Math.min(1, Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(firstLatitude)) * Math.cos(radians(secondLatitude)) * Math.sin(longitudeDelta / 2) ** 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const recommendedActionsFor = (prediction) => {
  const recommendations = {
    Fire: [
      'Move away from the affected area if it is safe.',
      'Avoid smoke and move toward clean air.',
      'Do not enter a burning structure.',
      'Stay away from electrical hazards.',
      'Follow emergency responder instructions.',
    ],
    Flood: [
      'Move toward safer or higher ground if possible.',
      'Avoid walking or driving through moving water.',
      'Stay away from electrical equipment in flooded areas.',
      'Keep communication available.',
      'Follow emergency instructions.',
    ],
    Accident: [
      'Move to a safe location if possible.',
      'Stay away from traffic and other hazards.',
      'Request or await emergency assistance.',
      'Avoid moving seriously injured people unless there is immediate danger.',
      'Provide responders with your location.',
    ],
  };
  return recommendations[prediction] || [];
};

const valuesFromMap = (value) => {
  if (!value || typeof value !== 'object') return {};
  if (typeof value[Symbol.iterator] === 'function') return Object.fromEntries(value);
  return { ...value };
};

const serviceCoordinates = (service) => {
  const coordinates = service?.location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return coordinates.map(Number).every(Number.isFinite) ? coordinates.map(Number) : null;
};

const nearbyServicesFor = async (emergency) => {
  const origin = [emergency.longitude, emergency.latitude];
  const [hospitals, shelters, resources] = await Promise.all([
    Hospital.find({}).select('name type availableBeds capacity contact location').lean().catch(() => []),
    Shelter.find({}).select('name availableSlots capacity contact location').lean().catch(() => []),
    Resource.find({ quantity: { $gt: 0 } }).select('name type quantity location').lean().catch(() => []),
  ]);

  const sortNearest = (records) => records
    .map((service) => {
      const coordinates = serviceCoordinates(service);
      const distanceKm = coordinates ? haversineKm(origin, coordinates) : null;
      return distanceKm === null ? null : { ...service, coordinates, distanceKm };
    })
    .filter(Boolean)
    .sort((first, second) => first.distanceKm - second.distanceKm)
    .slice(0, 5);

  const project = (service, fields) => Object.fromEntries([
    ['id', service._id],
    ['name', service.name],
    ['coordinates', service.coordinates],
    ['distanceKm', service.distanceKm],
    ...fields.map((field) => [field, service[field]]),
  ].filter(([, value]) => value !== undefined));

  return {
    hospitals: sortNearest(hospitals).map((service) => project(service, ['type', 'availableBeds', 'capacity', 'contact'])),
    shelters: sortNearest(shelters).map((service) => project(service, ['availableSlots', 'capacity', 'contact'])),
    resources: sortNearest(resources).map((service) => project(service, ['type', 'quantity'])),
  };
};

const requiredEmergencyActionsFor = (emergency) => {
  const aiStatus = emergency.aiStatus;
  const aiComplete = ['Completed', 'Verification Required', 'completed'].includes(aiStatus);
  const aiFailed = ['Failed', 'failed'].includes(aiStatus);
  const aiPending = !aiComplete && !aiFailed;
  const recommendations = emergency.recommendations || {};
  const assigned = Boolean(emergency.assignedVolunteer);
  const terminalEmergency = ['Resolved', 'Cancelled'].includes(emergency.status);
  const hasLocation = Number.isFinite(emergency.latitude) && Number.isFinite(emergency.longitude);
  const facilities = recommendations.facilities || [];
  const resources = recommendations.resources || [];

  return [
    { id: 'sos_received', label: 'SOS received', status: emergency._id ? 'completed' : 'required' },
    { id: 'location_captured', label: 'Location captured', status: hasLocation ? 'completed' : 'required' },
    { id: 'ai_analysis', label: 'AI analysis', status: aiComplete ? 'completed' : aiFailed ? 'required' : 'pending' },
    { id: 'priority_assigned', label: 'Priority assigned', status: emergency.priority ? 'completed' : 'pending' },
    { id: 'responder_assignment', label: 'Responder assignment', status: assigned ? 'completed' : terminalEmergency ? 'not_required' : 'pending' },
    { id: 'emergency_response', label: 'Emergency response', status: ['In Progress', 'Resolved'].includes(emergency.status) ? 'completed' : emergency.status === 'Cancelled' ? 'not_required' : 'pending' },
    { id: 'facility_recommendation', label: 'Facility recommendation', status: facilities.length ? 'completed' : aiPending ? 'pending' : recommendations.facilityMessage ? 'not_required' : aiFailed ? 'required' : 'pending' },
    { id: 'resource_coordination', label: 'Resource coordination', status: resources.length ? 'completed' : aiPending ? 'pending' : aiFailed ? 'required' : 'not_required' },
  ];
};

const responderRoles = ['volunteer', 'ngo', 'hospital', 'authority', 'admin'];
const coordinationRoles = ['ngo', 'authority', 'admin'];
const statusValues = ['Submitted', 'Processing', 'Detected', 'Verification Required', 'Assigned', 'In Progress', 'Resolved', 'Cancelled', 'Failed'];
const activeEmergencyFilter = { status: { $nin: ['Resolved', 'Cancelled'] } };
const emergencyFilters = {
  all: () => ({}),
  active: () => ({ ...activeEmergencyFilter }),
  critical: () => ({ priority: 'Critical', ...activeEmergencyFilter }),
  high: () => ({ priority: 'High', ...activeEmergencyFilter }),
  'pending-verification': () => ({ $or: [{ aiStatus: 'Verification Required' }, { status: 'Verification Required' }] }),
  assigned: () => ({ assignedVolunteer: { $ne: null } }),
  'in-progress': () => ({ status: 'In Progress' }),
  resolved: () => ({ status: 'Resolved' }),
};

const filterForEmergencyViewer = async (filter, user) => {
  if (user.role !== 'volunteer') return filter;

  const volunteer = await Volunteer.findOne({ user: user._id }).select('_id');
  const assignmentScope = volunteer ? { assignedVolunteer: volunteer._id } : { _id: null };
  return Object.keys(filter).length ? { $and: [filter, assignmentScope] } : assignmentScope;
};

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
  locationName: emergency.locationName || '',
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
    const filter = await filterForEmergencyViewer({ ...activeEmergencyFilter }, req.user);
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
    const filters = await Promise.all(Object.entries(emergencyFilters).map(async ([name, createFilter]) => [
      name,
      await filterForEmergencyViewer(createFilter(), req.user),
    ]));
    const counts = Object.fromEntries(await Promise.all(filters.map(async ([name, filter]) => [
      name,
      await Emergency.countDocuments(filter),
    ])));
    res.status(200).json({
      success: true,
      stats: {
        total: counts.all,
        active: counts.active,
        critical: counts.critical,
        high: counts.high,
        verification: counts['pending-verification'],
        assigned: counts.assigned,
        inProgress: counts['in-progress'],
        resolved: counts.resolved,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', protect, upload.single('image'), async (req, res, next) => {
  try {
    const { description, latitude, longitude, locationName, contactInfo, priority } = req.body;

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
      locationName: typeof locationName === 'string' ? locationName.trim().slice(0, 200) : '',
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
        locationName: emergency.locationName || '',
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

router.get('/:id/victim-view', protect, async (req, res, next) => {
  try {
    const emergency = await getEmergencyOrFail(req.params.id, req.user, next);
    if (!emergency) return;

    const evidence = emergency.aiEvidence || {};
    const fusion = evidence.fusion || {};
    const verificationRequired = emergency.aiStatus === 'Verification Required'
      || fusion.verification_required === true;
    const probabilities = valuesFromMap(emergency.aiProbabilities);
    const recommendations = emergency.recommendations || {};
    const nearbyServices = await nearbyServicesFor(emergency);
    const safeEmergency = {
      id: emergency._id,
      description: emergency.description || '',
      imageUrl: emergency.imageUrl || '',
      latitude: emergency.latitude,
      longitude: emergency.longitude,
      locationName: emergency.locationName || '',
      contactInfo: emergency.contactInfo || '',
      status: emergency.status,
      aiStatus: emergency.aiStatus,
      aiPrediction: emergency.aiPrediction || '',
      aiConfidence: emergency.aiConfidence,
      aiProbabilities: probabilities,
      aiExplanation: emergency.aiExplanation || '',
      aiModalityContribution: emergency.aiModalityContribution || null,
      aiEvidence: {
        textPrediction: evidence.textPrediction || null,
        imagePrediction: evidence.imagePrediction || null,
        fusion: Object.keys(fusion).length ? {
          prediction: fusion.prediction || '',
          confidence: fusion.confidence,
          probabilities: fusion.probabilities || {},
          conflict: Boolean(fusion.conflict),
          verificationRequired: Boolean(fusion.verification_required),
          modality: fusion.modality || '',
        } : null,
      },
      verificationRequired,
      verifiedPrediction: emergency.verifiedPrediction || '',
      verificationReason: emergency.verificationReason || '',
      priority: emergency.priority || '',
      assignedVolunteer: emergency.assignedVolunteer ? {
        id: emergency.assignedVolunteer._id || emergency.assignedVolunteer,
        availability: emergency.assignedVolunteer.availability || '',
      } : null,
      recommendations: {
        facilities: (recommendations.facilities || []).map((facility) => ({
          id: facility._id,
          name: facility.name,
          type: facility.type,
          availableBeds: facility.availableBeds,
          availableSlots: facility.availableSlots,
        })),
        resources: (recommendations.resources || []).map((resource) => ({
          id: resource._id,
          name: resource.name,
          type: resource.type,
          quantity: resource.quantity,
        })),
        facilityMessage: recommendations.facilityMessage || '',
      },
      createdAt: emergency.createdAt,
      updatedAt: emergency.updatedAt,
      aiUpdatedAt: emergency.aiUpdatedAt,
    };

    res.status(200).json({
      success: true,
      emergency: safeEmergency,
      aiAssessment: {
        status: emergency.aiStatus,
        prediction: verificationRequired ? 'Verification Required' : emergency.aiPrediction || '',
        confidence: emergency.aiConfidence,
        probabilities,
        verificationRequired,
        modalityContribution: emergency.aiModalityContribution || null,
      },
      explanation: {
        summary: emergency.aiExplanation || '',
        textEvidence: evidence.textPrediction || null,
        imageEvidence: evidence.imagePrediction || null,
      },
      recommendedActions: recommendedActionsFor(verificationRequired ? '' : emergency.aiPrediction),
      requiredEmergencyActions: requiredEmergencyActionsFor(emergency),
      nearbyServices,
      responseStatus: { status: emergency.status, aiStatus: emergency.aiStatus },
    });
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
    const filterName = req.query.filter ?? 'all';
    if (typeof filterName !== 'string' || !Object.prototype.hasOwnProperty.call(emergencyFilters, filterName)) {
      return next(new AppError('Invalid emergency filter.', 400));
    }

    const filter = await filterForEmergencyViewer(emergencyFilters[filterName](), req.user);
    const emergencies = await Emergency.find(filter)
      .sort({ createdAt: -1 })
      .populate('assignedVolunteer')
      .populate('userId', 'name email role');

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
module.exports.haversineKm = haversineKm;
module.exports.recommendedActionsFor = recommendedActionsFor;
module.exports.requiredEmergencyActionsFor = requiredEmergencyActionsFor;
