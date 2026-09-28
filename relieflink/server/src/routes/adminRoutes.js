const express = require('express');
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');
const User = require('../models/User');
const Emergency = require('../models/Emergency');
const Volunteer = require('../models/Volunteer');
const Hospital = require('../models/Hospital');
const Shelter = require('../models/Shelter');
const Resource = require('../models/Resource');
const AuditLog = require('../models/AuditLog');
const AppError = require('../utils/appError');

const router = express.Router();

const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt || null,
  location: user.location || null,
});

const safeEmergency = (emergency) => ({
  id: emergency._id,
  emergencyId: emergency._id,
  victim: emergency.userId ? {
    id: emergency.userId._id || emergency.userId,
    name: emergency.userId.name || '',
    email: emergency.userId.email || '',
    phone: emergency.userId.phone || '',
    role: emergency.userId.role || '',
  } : null,
  description: emergency.description || '',
  imageAvailable: Boolean(emergency.imageUrl),
  imageUrl: emergency.imageUrl || '',
  latitude: emergency.latitude,
  longitude: emergency.longitude,
  location: emergency.location || null,
  createdAt: emergency.createdAt,
  updatedAt: emergency.updatedAt,
  status: emergency.status,
  priority: emergency.priority,
  aiStatus: emergency.aiStatus,
  aiPrediction: emergency.aiPrediction || '',
  aiConfidence: emergency.aiConfidence,
  aiProbabilities: emergency.aiProbabilities ? Object.fromEntries(emergency.aiProbabilities) : {},
  aiExplanation: emergency.aiExplanation || '',
  aiEvidence: emergency.aiEvidence || null,
  aiModalityContribution: emergency.aiModalityContribution || null,
  verifiedPrediction: emergency.verifiedPrediction || '',
  verificationReason: emergency.verificationReason || '',
  assignedVolunteer: emergency.assignedVolunteer ? {
    id: emergency.assignedVolunteer._id || emergency.assignedVolunteer,
    availability: emergency.assignedVolunteer.availability || '',
    skills: emergency.assignedVolunteer.skills || [],
    user: emergency.assignedVolunteer.user ? {
      id: emergency.assignedVolunteer.user._id || emergency.assignedVolunteer.user,
      name: emergency.assignedVolunteer.user.name || '',
      email: emergency.assignedVolunteer.user.email || '',
      role: emergency.assignedVolunteer.user.role || '',
    } : null,
  } : null,
  recommendations: emergency.recommendations || null,
  contactInfo: emergency.contactInfo || '',
  verifiedBy: emergency.verifiedBy || null,
  verifiedAt: emergency.verifiedAt || null,
});

const safeVolunteer = async (volunteer) => {
  const populatedVolunteer = await Volunteer.findById(volunteer._id).populate('user', 'name email phone role isActive createdAt').lean();
  return {
    id: populatedVolunteer._id,
    name: populatedVolunteer.user?.name || '',
    email: populatedVolunteer.user?.email || '',
    phone: populatedVolunteer.user?.phone || '',
    role: populatedVolunteer.user?.role || 'volunteer',
    skills: populatedVolunteer.skills || [],
    availability: populatedVolunteer.availability || 'available',
    certifications: populatedVolunteer.certifications || [],
    location: populatedVolunteer.location || null,
    status: populatedVolunteer.user?.isActive ? 'active' : 'inactive',
    createdAt: populatedVolunteer.createdAt,
    updatedAt: populatedVolunteer.updatedAt,
  };
};

const safeHospital = (hospital) => ({
  id: hospital._id,
  name: hospital.name,
  type: hospital.type,
  capacity: hospital.capacity,
  availableBeds: hospital.availableBeds,
  location: hospital.location || null,
  contact: hospital.contact || '',
  createdAt: hospital.createdAt,
});

const safeShelter = (shelter) => ({
  id: shelter._id,
  name: shelter.name,
  capacity: shelter.capacity,
  availableSlots: shelter.availableSlots,
  location: shelter.location || null,
  contact: shelter.contact || '',
  createdAt: shelter.createdAt,
});

const safeResource = (resource) => ({
  id: resource._id,
  name: resource.name,
  category: resource.type,
  description: resource.description || '',
  quantity: resource.quantity,
  availableQuantity: resource.quantity,
  location: resource.location || null,
  status: 'available',
  owner: resource.owner || null,
  createdAt: resource.createdAt,
});

const adminOnly = [protect, authorize(ROLES.ADMIN)];

router.use(...adminOnly);

router.get('/overview', async (req, res, next) => {
  try {
    const [totalUsers, totalAdmins, totalVictims, totalVolunteers, totalNgo, totalHospitals, totalAuthorities, totalEmergencies, activeEmergencies, resolvedEmergencies, pendingEmergencies, criticalEmergencies, highPriority, mediumPriority, lowPriority, totalHospitalsRecords, totalShelters, totalResources, volunteersAvailable] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: ROLES.ADMIN }),
      User.countDocuments({ role: ROLES.VICTIM }),
      User.countDocuments({ role: ROLES.VOLUNTEER }),
      User.countDocuments({ role: ROLES.NGO }),
      User.countDocuments({ role: ROLES.HOSPITAL }),
      User.countDocuments({ role: ROLES.AUTHORITY }),
      Emergency.countDocuments(),
      Emergency.countDocuments({ status: { $nin: ['Resolved', 'Cancelled'] } }),
      Emergency.countDocuments({ status: 'Resolved' }),
      Emergency.countDocuments({ status: { $in: ['Submitted', 'Processing', 'Detected', 'Verification Required', 'Assigned', 'In Progress'] } }),
      Emergency.countDocuments({ priority: 'Critical', status: { $nin: ['Resolved', 'Cancelled'] } }),
      Emergency.countDocuments({ priority: 'High' }),
      Emergency.countDocuments({ priority: 'Medium' }),
      Emergency.countDocuments({ priority: 'Low' }),
      Hospital.countDocuments(),
      Shelter.countDocuments(),
      Resource.countDocuments(),
      Volunteer.countDocuments({ availability: 'available' }),
    ]);

    const severity = {
      totalUsers,
      totalAdmins,
      totalVictims,
      totalVolunteers,
      totalNgo,
      totalHospitals,
      totalAuthorities,
      totalEmergencies,
      activeEmergencies,
      resolvedEmergencies,
      pendingEmergencies,
      criticalEmergencies,
      highPriority,
      mediumPriority,
      lowPriority,
      totalHospitalsRecords,
      totalShelters,
      totalResources,
      volunteersAvailable,
    };

    res.status(200).json({ success: true, overview: severity, backendStatus: 'online', aiServiceStatus: 'online', databaseConnectionStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', socketStatus: req.app.get('io') ? 'online' : 'offline' });
  } catch (error) {
    next(error);
  }
});

router.get('/profile', async (req, res) => {
  const user = await User.findById(req.user._id).select('-password').lean();
  if (!user) {
    throw new AppError('Admin profile not found.', 404);
  }
  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt || null,
      location: user.location || null,
    },
    actions: ['Change password', 'Logout', 'Profile update'],
  });
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    res.status(200).json({
      success: true,
      count: users.length,
      users: users.map(safeUser),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return next(new AppError('User not found.', 404));
    const [emergencyHistory, activity, relatedEmergencies] = await Promise.all([
      Emergency.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      AuditLog.find({ userId: user._id }).sort({ timestamp: -1 }).limit(20).lean(),
      Emergency.find({ assignedVolunteer: { $exists: true } }).populate('assignedVolunteer', 'user skills availability').lean(),
    ]);

    const related = relatedEmergencies.filter((item) => item.assignedVolunteer && item.assignedVolunteer.user && item.assignedVolunteer.user.toString() === user._id.toString());
    res.status(200).json({
      success: true,
      user: safeUser(user),
      emergencyCount: emergencyHistory.length,
      emergencyHistory: emergencyHistory.map(safeEmergency),
      relatedActivity: activity.map((entry) => ({
        id: entry._id,
        action: entry.action,
        target: entry.target || '',
        resourceType: entry.resourceType,
        success: entry.success,
        timestamp: entry.timestamp,
      })),
      relatedEmergencies: related.map((item) => ({
        id: item._id,
        status: item.status,
        priority: item.priority,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/emergencies', async (req, res, next) => {
  try {
    const emergencies = await Emergency.find().sort({ createdAt: -1 }).populate('userId', 'name email phone role').populate('assignedVolunteer', 'skills availability user').lean();
    res.status(200).json({
      success: true,
      count: emergencies.length,
      emergencies: emergencies.map((emergency) => {
        const item = { ...safeEmergency(emergency) };
        return item;
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/emergencies/:id', async (req, res, next) => {
  try {
    const emergency = await Emergency.findById(req.params.id).populate('userId', 'name email phone role').populate('assignedVolunteer', 'skills availability user').populate('verifiedBy', 'name email role').lean();
    if (!emergency) return next(new AppError('Emergency not found.', 404));
    res.status(200).json({ success: true, emergency: safeEmergency(emergency) });
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const emergencies = await Emergency.find().lean();
    const total = emergencies.length;
    const successful = emergencies.filter((item) => ['Completed', 'completed', 'Resolved', 'Confirmed'].includes(item.aiStatus) || item.status === 'Resolved').length;
    const failed = emergencies.filter((item) => ['Failed', 'failed'].includes(item.aiStatus) || item.status === 'Failed').length;
    const fire = emergencies.filter((item) => item.aiPrediction === 'Fire' || item.verifiedPrediction === 'Fire').length;
    const flood = emergencies.filter((item) => item.aiPrediction === 'Flood' || item.verifiedPrediction === 'Flood').length;
    const accident = emergencies.filter((item) => item.aiPrediction === 'Accident' || item.verifiedPrediction === 'Accident').length;
    const verificationRequired = emergencies.filter((item) => item.aiStatus === 'Verification Required').length;
    const averageConfidence = total ? emergencies.reduce((sum, item) => sum + Number(item.aiConfidence || 0), 0) / total : 0;
    const textOnly = emergencies.filter((item) => item.aiEvidence && item.aiEvidence.textPrediction).length;
    const imageOnly = emergencies.filter((item) => item.aiEvidence && item.aiEvidence.imagePrediction).length;
    const multimodal = emergencies.filter((item) => item.aiEvidence && item.aiEvidence.textPrediction && item.aiEvidence.imagePrediction).length;

    res.status(200).json({
      success: true,
      analytics: {
        totalAIAnalyses: total,
        successfulAnalyses: successful,
        failedAnalyses: failed,
        firePredictions: fire,
        floodPredictions: flood,
        accidentPredictions: accident,
        verificationRequired,
        averageConfidence: Number(averageConfidence.toFixed(4)),
        textOnlyAnalyses: textOnly,
        imageOnlyAnalyses: imageOnly,
        multimodalAnalyses: multimodal,
        processingStatus: total ? 'active' : 'idle',
        aiProcessingFailures: failed,
      },
      emergencies: emergencies.map((emergency) => ({
        id: emergency._id,
        aiPrediction: emergency.aiPrediction || '',
        aiStatus: emergency.aiStatus,
        aiConfidence: emergency.aiConfidence,
        aiEvidence: emergency.aiEvidence || null,
        aiExplanation: emergency.aiExplanation || '',
        verificationReason: emergency.verificationReason || '',
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/volunteers', async (req, res, next) => {
  try {
    const volunteers = await Volunteer.find().populate('user', 'name email phone role isActive').sort({ createdAt: -1 }).lean();
    res.status(200).json({
      success: true,
      count: volunteers.length,
      volunteers: volunteers.map((volunteer) => ({
        id: volunteer._id,
        name: volunteer.user?.name || '',
        email: volunteer.user?.email || '',
        phone: volunteer.user?.phone || '',
        role: volunteer.user?.role || 'volunteer',
        skills: volunteer.skills || [],
        availability: volunteer.availability || 'available',
        location: volunteer.location || null,
        status: volunteer.user?.isActive ? 'active' : 'inactive',
        createdAt: volunteer.createdAt,
      })),
      summary: {
        total: volunteers.length,
        available: volunteers.filter((item) => item.availability === 'available').length,
        assigned: volunteers.filter((item) => item.availability === 'busy').length,
        unavailable: volunteers.filter((item) => item.availability === 'offline').length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/hospitals', async (req, res, next) => {
  try {
    const hospitals = await Hospital.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, count: hospitals.length, hospitals: hospitals.map(safeHospital) });
  } catch (error) {
    next(error);
  }
});

router.get('/shelters', async (req, res, next) => {
  try {
    const shelters = await Shelter.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, count: shelters.length, shelters: shelters.map(safeShelter) });
  } catch (error) {
    next(error);
  }
});

router.get('/resources', async (req, res, next) => {
  try {
    const resources = await Resource.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, count: resources.length, resources: resources.map(safeResource) });
  } catch (error) {
    next(error);
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    const activity = [];
    for (const user of users) {
      const logs = await AuditLog.find({ userId: user._id }).sort({ timestamp: -1 }).limit(5).lean();
      if (logs.length) {
        activity.push({
          userId: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          lastLoginAt: user.lastLoginAt || logs[0]?.timestamp || null,
          recentActions: logs.map((entry) => ({ action: entry.action, timestamp: entry.timestamp, success: entry.success })),
        });
      }
    }
    res.status(200).json({ success: true, count: activity.length, activity });
  } catch (error) {
    next(error);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const entries = await AuditLog.find().sort({ timestamp: -1 }).limit(200).lean();
    res.status(200).json({ success: true, count: entries.length, auditLogs: entries.map((entry) => ({
      id: entry._id,
      actor: entry.email || 'system',
      role: entry.role || 'system',
      action: entry.action,
      target: entry.target || entry.resourceType,
      resourceId: entry.resourceId || '',
      timestamp: entry.timestamp,
      success: entry.success,
    })) });
  } catch (error) {
    next(error);
  }
});

router.get('/system', async (req, res) => {
  const aiHealth = await fetch(`http://${process.env.AI_SERVICE_HOST || '127.0.0.1'}:${process.env.AI_SERVICE_PORT || 8000}/health`).then(() => 'online').catch(() => 'offline');
  res.status(200).json({
    success: true,
    system: {
      nodeStatus: 'online',
      expressStatus: 'online',
      fastApiStatus: aiHealth,
      mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      socketStatus: req.app.get('io') ? 'online' : 'offline',
      frontendStatus: 'online',
      apiHealth: 'online',
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
});

router.get('/database', async (req, res, next) => {
  try {
    const [users, emergencies, volunteers, hospitals, shelters, resources, auditLogs] = await Promise.all([
      User.countDocuments(),
      Emergency.countDocuments(),
      Volunteer.countDocuments(),
      Hospital.countDocuments(),
      Shelter.countDocuments(),
      Resource.countDocuments(),
      AuditLog.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      summary: {
        users,
        emergencies,
        volunteers,
        hospitals,
        shelters,
        resources,
        auditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) {
      return res.status(200).json({ success: true, matches: [] });
    }

    const regex = new RegExp(query, 'i');
    const [users, emergencies, volunteers, hospitals, shelters, resources] = await Promise.all([
      User.find({ $or: [{ name: regex }, { email: regex }, { _id: regex }] }).select('-password').lean(),
      Emergency.find({ $or: [{ _id: regex }, { aiPrediction: regex }, { description: regex }, { status: regex } ] }).lean(),
      Volunteer.find().populate('user', 'name email').lean(),
      Hospital.find({ $or: [{ name: regex }, { _id: regex }] }).lean(),
      Shelter.find({ $or: [{ name: regex }, { _id: regex }] }).lean(),
      Resource.find({ $or: [{ name: regex }, { _id: regex }, { type: regex }] }).lean(),
    ]);

    const matches = [
      ...users.map((user) => ({ type: 'user', id: user._id, label: `${user.name} (${user.email})`, href: `/admin/users` })),
      ...emergencies.map((item) => ({ type: 'emergency', id: item._id, label: `${item.aiPrediction || 'Emergency'} / ${item.status}`, href: `/admin/emergencies` })),
      ...volunteers.map((item) => ({ type: 'volunteer', id: item._id, label: item.user?.name || 'Volunteer', href: `/admin/volunteers` })),
      ...hospitals.map((item) => ({ type: 'hospital', id: item._id, label: item.name, href: `/admin/hospitals` })),
      ...shelters.map((item) => ({ type: 'shelter', id: item._id, label: item.name, href: `/admin/shelters` })),
      ...resources.map((item) => ({ type: 'resource', id: item._id, label: item.name, href: `/admin/resources` })),
    ].slice(0, 50);

    res.status(200).json({ success: true, matches });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
