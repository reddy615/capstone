require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES } = require('../utils/roles');

const ADMIN_EMAIL = '2300090002@kluniversity.in';
const ADMIN_PASSWORD = process.env.RELIEFLINK_ADMIN_PASSWORD || 'CAPSTONE26';

const seedAdmin = async () => {
  if (!process.env.MONGODB_URI) {
    console.log('MONGODB_URI missing; admin account not created in this environment.');
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  });

  try {
    const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() }).lean();

    if (existing) {
      if (existing.role !== ROLES.ADMIN) {
        await User.updateOne(
          { _id: existing._id },
          { $set: { role: ROLES.ADMIN, isActive: true } }
        );
        console.log('Admin role updated for existing user account.');
      } else {
        console.log('Admin account already exists.');
      }
      return;
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
