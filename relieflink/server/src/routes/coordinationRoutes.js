const express = require('express');
const Volunteer = require('../models/Volunteer');
const Resource = require('../models/Resource');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();
const coordinationRoles = ['volunteer', 'ngo', 'hospital', 'authority', 'admin'];

router.get('/volunteers/available', protect, authorize(...coordinationRoles), async (req, res, next) => {
  try {
    const volunteers = await Volunteer.find({ availability: 'available' }).populate('user', 'name email role');
    res.status(200).json({ success: true, count: volunteers.length, volunteers });
  } catch (error) {
    next(error);
  }
});

router.get('/resources/available', protect, authorize(...coordinationRoles), async (req, res, next) => {
  try {
    const resources = await Resource.find({ quantity: { $gt: 0 } }).populate('owner', 'name email role');
    res.status(200).json({ success: true, count: resources.length, resources });
  } catch (error) {
    next(error);
  }
});

module.exports = router;