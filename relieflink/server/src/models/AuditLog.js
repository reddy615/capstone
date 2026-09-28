const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    email: {
      type: String,
      default: '',
      trim: true,
    },
    role: {
      type: String,
      default: 'user',
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    resourceType: {
      type: String,
      default: 'system',
      trim: true,
    },
    resourceId: {
      type: String,
      default: '',
      trim: true,
    },
    target: {
      type: String,
      default: '',
      trim: true,
    },
    success: {
      type: Boolean,
      default: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
