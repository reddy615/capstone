require('dotenv').config();
const mongoose = require('mongoose');
const { bootstrapAdmin } = require('../services/adminBootstrap');

const seedAdmin = async () => {
  const hasAdminConfig = Boolean(
    process.env.RELIEFLINK_ADMIN_EMAIL?.trim()
    && process.env.RELIEFLINK_ADMIN_PASSWORD
  );
  if (!hasAdminConfig) return;
  if (!process.env.MONGODB_URI) throw new Error('Admin bootstrap requires database configuration.');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  try {
    const result = await bootstrapAdmin();
    if (result.status !== 'skipped') console.log(`Admin bootstrap: ${result.status}`);
  } finally {
    await mongoose.disconnect();
  }
};

seedAdmin().catch((error) => {
  console.error('Admin bootstrap failed.');
  process.exit(1);
});
