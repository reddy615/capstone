const test = require('node:test');
const assert = require('node:assert/strict');
const emergencyRoutes = require('../src/routes/emergencyRoutes');

test('dashboard projection exposes operational emergency fields without inventing location', () => {
  const summary = emergencyRoutes.publicEmergency({
    _id: 'emergency-1',
    aiStatus: 'Verification Required',
    aiPrediction: '',
    aiConfidence: 0,
    priority: 'High',
    status: 'Verification Required',
    description: 'Stored emergency',
    latitude: null,
    longitude: null,
    location: null,
    assignedVolunteer: null,
    recommendations: null,
    createdAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:01:00.000Z',
    aiUpdatedAt: null,
    verifiedPrediction: '',
  });

  assert.equal(summary.type, 'Verification Required');
  assert.equal(summary.verificationStatus, 'Verification Required');
  assert.equal(summary.latitude, null);
  assert.equal(summary.longitude, null);
  assert.equal(summary.priority, 'High');
});

test('dashboard status contract contains the supported response lifecycle', () => {
  for (const status of ['Submitted', 'Processing', 'Detected', 'Verification Required', 'Assigned', 'In Progress', 'Resolved', 'Cancelled', 'Failed']) {
    assert.ok(emergencyRoutes.statusValues.includes(status));
  }
});