require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES } = require('../utils/roles');

const ADMIN_EMAIL = '2300090002@kluniversity.in';
const ADMIN_PASSWORD = process.env.RELIEFLINK_ADMIN_PASSWORD;

const seedAdmin = async () => {
  if (!process.env.MONGODB_URI) {
    console.log('MONGODB_URI missing; admin account not created in this environment.');
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  });

  try {
    const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });

    if (existing) {
      let accountChanged = false;
      if (existing.role !== ROLES.ADMIN) {
        existing.role = ROLES.ADMIN;
        existing.isActive = true;
        accountChanged = true;
      }
      if (ADMIN_PASSWORD) {
        existing.password = ADMIN_PASSWORD;
        accountChanged = true;
      }

      if (accountChanged) {
        await existing.save();
        console.log('Admin account updated from configured seed settings.');
      } else {
        console.log('Admin account already exists.');
      }
      return;
    }

    if (!ADMIN_PASSWORD) {
      throw new Error('RELIEFLINK_ADMIN_PASSWORD must be set before creating the admin account.');
    }

    await User.create({
      name: 'ReliefLink Admin',
      email: ADMIN_EMAIL.toLowerCase(),
      password: ADMIN_PASSWORD,
      role: ROLES.ADMIN,
      phone: '',
      isActive: true,
    });

    console.log('Admin account created successfully.');
  } finally {
    await mongoose.disconnect();
  }
};

seedAdmin().catch((error) => {
  console.error('Admin seed failed:', error.message);
  process.exit(1);
});
