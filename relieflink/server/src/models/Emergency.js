const mongoose = require('mongoose');

const emergencyStatusValues = [
  'Submitted',
  'AI Processing',
  'Processing',
  'Detected',
  'Verification Required',
  'Confirmed',
  'Assigned',
  'In Progress',
  'Resolved',
  'Cancelled',
  'Failed',
];

const emergencySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: false, default: '', trim: true },
    imageUrl: { type: String, default: '' },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    contactInfo: { type: String, default: '' },
    status: { type: String, enum: emergencyStatusValues, default: 'Submitted' },
    aiStatus: {
      type: String,
      enum: ['Pending', 'Processing', 'Completed', 'Verification Required', 'Failed', 'pending', 'processing', 'completed', 'failed'],
      default: 'Pending',
    },
    aiPrediction: { type: String, default: '' },
    aiConfidence: { type: Number, default: 0 },
    aiProbabilities: { type: Map, of: Number, default: {} },
    aiExplanation: { type: String, default: '' },
    aiModalityContribution: { type: mongoose.Schema.Types.Mixed, default: null },
    aiEvidence: { type: mongoose.Schema.Types.Mixed, default: null },
    aiUpdatedAt: { type: Date, default: null },
    assignedVolunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', default: null },
    recommendations: { type: mongoose.Schema.Types.Mixed, default: null },
    verifiedPrediction: { type: String, enum: ['', 'Fire', 'Flood', 'Accident'], default: '' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    verificationReason: { type: String, default: '' },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

emergencySchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Emergency', emergencySchema);
