const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

router.get('/dashboard', protect, authorize(ROLES.VICTIM, ROLES.VOLUNTEER, ROLES.NGO, ROLES.HOSPITAL, ROLES.AUTHORITY, ROLES.ADMIN), (req, res) => {
  res.status(200).json({
    success: true,
    message: `Welcome ${req.user.role} user`,
    user: {
      id: req.user._id,
      name: req.user.name,
      role: req.user.role,
    },
  });
});

router.get('/admin/overview', protect, authorize(ROLES.ADMIN), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin overview access granted',
  });
});

module.exports = router;
