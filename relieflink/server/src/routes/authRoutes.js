const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { PUBLIC_REGISTRATION_ROLES, APPROVAL_REQUIRED_ROLES } = require('../utils/roles');
const { protect } = require('../middleware/authMiddleware');
const AppError = require('../utils/appError');

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedName || !normalizedEmail || typeof password !== 'string' || !password) {
      return next(new AppError('Name, email, and password are required', 400));
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return next(new AppError('Please provide a valid email address', 400));
    }

    if (password.length < 6) {
      return next(new AppError('Password must be at least 6 characters', 400));
    }

    if (!role) {
      return next(new AppError('Role is required', 400));
    }

    if (typeof role !== 'string' || !PUBLIC_REGISTRATION_ROLES.includes(role)) {
      return next(new AppError('Invalid role for public registration', 400));
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return next(new AppError('User already exists', 400));
    }

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password,
      role,
      approvalStatus: APPROVAL_REQUIRED_ROLES.includes(role) ? 'pending' : 'not_required',
      phone: phone || '',
    });

    const response = {
      success: true,
      approvalStatus: user.approvalStatus,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
      },
    };

    if (user.approvalStatus === 'pending') {
      response.message = 'Registration submitted. Admin approval is required before operational access.';
    } else {
      response.token = generateToken(user._id);
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Email and password are required', 400));
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return next(new AppError('Invalid email or password', 401));
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return next(new AppError('Invalid email or password', 401));
    }

    if (APPROVAL_REQUIRED_ROLES.includes(user.role) && user.approvalStatus !== 'approved') {
      return next(new AppError(
        user.approvalStatus === 'rejected' ? 'Your account was not approved.' : 'Your account is pending admin approval.',
        403
      ));
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', protect, async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        approvalStatus: req.user.approvalStatus,
        phone: req.user.phone,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
