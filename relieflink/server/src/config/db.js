const mongoose = require('mongoose');
const { resolveMongoUri } = require('./databaseConfig');

const connectDB = async () => {
  const mongoUri = resolveMongoUri();

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 20000,
    });

    console.log('MongoDB connected.');
    return conn;
  } catch {
    console.error('MongoDB connection failed; connection details omitted.');
    throw new Error('MongoDB connection failed.');
  }
};

module.exports = connectDB;
