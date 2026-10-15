const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { after, before, test } = require('node:test');

const User = require('../src/models/User');
const Emergency = require('../src/models/Emergency');
const Volunteer = require('../src/models/Volunteer');
const Hospital = require('../src/models/Hospital');
const Shelter = require('../src/models/Shelter');
const Resource = require('../src/models/Resource');
const emergencyRoutes = require('../src/routes/emergencyRoutes');
const { errorHandler } = require('../src/middleware/errorMiddleware');
const { haversineKm } = emergencyRoutes;

const originalMethods = {
  userFindById: User.findById,
  emergencyFindById: Emergency.findById,
  emergencyCreate: Emergency.create,
  emergencyFindByIdAndUpdate: Emergency.findByIdAndUpdate,
  emergencyFind: Emergency.find,
  emergencyCountDocuments: Emergency.countDocuments,
  volunteerFindOne: Volunteer.findOne,
  hospitalFind: Hospital.find,
  shelterFind: Shelter.find,
  resourceFind: Resource.find,
};
const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = 'victim-view-test-secret';
const users = new Map();
const emergencies = new Map();
let server;
let baseUrl;
let lastEmergencyFilter;
let countFilters = [];
let emittedEvents = [];

const makeListQuery = (records) => ({
  select() { return this; },
  lean: async () => records,
});

const makeEmergency = (overrides = {}) => ({
  _id: 'emergency-owner-a',
  userId: 'victim-a',
  description: 'Smoke reported near a warehouse.',
  imageUrl: '',
  latitude: 19.076,
  longitude: 72.8777,
  locationName: 'Mumbai, Maharashtra, India',
  contactInfo: '',
  status: 'Confirmed',
  aiStatus: 'Completed',
  aiPrediction: 'Fire',
  aiConfidence: 0.86,
  aiProbabilities: { Fire: 0.86, Flood: 0.09, Accident: 0.05 },
  aiExplanation: 'The description includes smoke and fire indicators.',
  aiModalityContribution: { text: 1, image: 0 },
  aiEvidence: {
    textPrediction: { prediction: 'Fire', confidence: 0.86, probabilities: { Fire: 0.86, Flood: 0.09, Accident: 0.05 } },
    imagePrediction: null,
    fusion: { prediction: 'Fire', confidence: 0.86, probabilities: { Fire: 0.86, Flood: 0.09, Accident: 0.05 }, conflict: false, verification_required: false, modality: 'text_only' },
  },
  priority: 'High',
  assignedVolunteer: null,
  recommendations: { facilities: [], resources: [], facilityMessage: 'No suitable registered facility available.' },
  createdAt: new Date('2026-09-20T10:00:00.000Z'),
  updatedAt: new Date('2026-09-20T10:01:00.000Z'),
  password: 'must-never-leak',
  ...overrides,
});

before(async () => {
  process.env.JWT_SECRET = jwtSecret;
  users.set('victim-a', { _id: 'victim-a', role: 'victim' });
  users.set('victim-b', { _id: 'victim-b', role: 'victim' });
  users.set('admin-a', { _id: 'admin-a', role: 'admin' });
  users.set('volunteer-a', { _id: 'volunteer-a', role: 'volunteer', approvalStatus: 'approved' });
  emergencies.set('emergency-owner-a', makeEmergency());

  User.findById = (id) => ({ select: async () => users.get(String(id)) || null });
  Emergency.findById = (id) => {
    const emergency = emergencies.get(String(id)) || null;
    return {
      populate: async () => emergency,
      then: (resolve, reject) => Promise.resolve(emergency).then(resolve, reject),
    };
  };
  Emergency.find = (filter) => {
    lastEmergencyFilter = filter;
    return {
      sort() { return this; },
      populate() { return this; },
      then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); },
    };
  };
  Emergency.countDocuments = async (filter) => {
    countFilters.push(filter);
    return countFilters.length;
  };
  Volunteer.findOne = () => ({ select: async () => ({ _id: 'volunteer-record-a' }) });
  Hospital.find = () => makeListQuery([
    { _id: 'hospital-far', name: 'Far Hospital', type: 'general', availableBeds: 4, capacity: 40, contact: 'stored hospital contact', location: { coordinates: [72.9777, 19.076] } },
    { _id: 'hospital-near', name: 'Near Hospital', type: 'trauma', availableBeds: 2, capacity: 20, contact: '', location: { coordinates: [72.8877, 19.076] } },
  ]);
  Shelter.find = () => makeListQuery([
    { _id: 'shelter-near', name: 'Nearby Shelter', availableSlots: 8, capacity: 80, contact: '', location: { coordinates: [72.8777, 19.086] } },
  ]);
  Resource.find = () => makeListQuery([
    { _id: 'resource-near', name: 'Rescue Kit', type: 'rescue', quantity: 3, location: { coordinates: [72.8787, 19.076] } },
  ]);

  const app = express();
  app.use(express.json());
  app.set('io', { emit: (...args) => emittedEvents.push(args) });
  app.use('/api/emergencies', emergencyRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  }
  User.findById = originalMethods.userFindById;
  Emergency.findById = originalMethods.emergencyFindById;
  Emergency.find = originalMethods.emergencyFind;
  Emergency.countDocuments = originalMethods.emergencyCountDocuments;
  Volunteer.findOne = originalMethods.volunteerFindOne;
  Hospital.find = originalMethods.hospitalFind;
  Shelter.find = originalMethods.shelterFind;
  Resource.find = originalMethods.resourceFind;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

const tokenFor = (id, claimedRole) => jwt.sign({ id, role: claimedRole }, jwtSecret);
const authorizedHeaders = (token) => new Headers({
  Authorization: ['Bearer', token].join(' '),
});
const getVictimView = (id, token) => fetch(`${baseUrl}/api/emergencies/${id}/victim-view`, {
  headers: authorizedHeaders(token),
});

test('SOS creation persists location name without replacing coordinates', async () => {
  const originalCreate = Emergency.create;
  const originalFindByIdAndUpdate = Emergency.findByIdAndUpdate;
  let savedEmergency;
  Emergency.create = async (record) => {
    savedEmergency = record;
    return makeEmergency({ ...record, _id: 'emergency-submitted-a' });
  };
  Emergency.findByIdAndUpdate = async () => null;

  try {
    const form = new FormData();
    form.append('description', 'Smoke reported near a warehouse.');
    form.append('latitude', '19.076');
    form.append('longitude', '72.8777');
    form.append('locationName', '  Mumbai, Maharashtra, India  ');
    const response = await fetch(`${baseUrl}/api/emergencies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('victim-a', 'victim')}` },
      body: form,
    });
    const data = await response.json();

    assert.equal(response.status, 201);
    assert.equal(data.emergency._id, 'emergency-submitted-a');
    assert.equal(savedEmergency.status, 'Submitted');
    assert.equal(data.emergency.status, 'Submitted');
    assert.ok(Number.isFinite(new Date(data.emergency.createdAt).getTime()));
    assert.equal(savedEmergency.locationName, 'Mumbai, Maharashtra, India');
    assert.equal(savedEmergency.latitude, 19.076);
    assert.equal(savedEmergency.longitude, 72.8777);
    assert.equal(data.emergency.locationName, 'Mumbai, Maharashtra, India');
    assert.equal(data.emergency.latitude, 19.076);
    assert.equal(data.emergency.longitude, 72.8777);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    Emergency.create = originalCreate;
    Emergency.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test('status changes enforce access, emit updates, and preserve the separate human verification reason', async () => {
  emittedEvents = [];
  const emergency = makeEmergency({
    _id: 'emergency-status-update',
    status: 'Verification Required',
    aiStatus: 'Verification Required',
    aiPrediction: '',
    verifiedPrediction: '',
    verificationReason: 'AI output needs a human review.',
    aiEvidence: {
      textPrediction: { verification_required: true, verification_reason: 'low_confidence' },
      fusion: { prediction: 'Verification Required', verification_required: true, conflict: false },
    },
    save: async () => {},
  });
  emergencies.set(emergency._id, emergency);
  const url = `${baseUrl}/api/emergencies/${emergency._id}/status`;
  const patch = (token, status) => fetch(url, {
    method: 'PATCH',
    headers: token
      ? new Headers([...authorizedHeaders(token), ['Content-Type', 'application/json']])
      : { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  const anonymous = await patch(null, 'In Progress');
  assert.equal(anonymous.status, 401);
  const victim = await patch(tokenFor('victim-a', 'victim'), 'In Progress');
  assert.equal(victim.status, 403, await victim.clone().text());
  const invalidStatus = await patch(tokenFor('admin-a', 'admin'), 'Unknown');
  assert.equal(invalidStatus.status, 400);
  assert.equal(emergency.status, 'Verification Required');

  const updatedResponse = await patch(tokenFor('admin-a', 'admin'), 'In Progress');
  const updated = await updatedResponse.json();
  assert.equal(updatedResponse.status, 200, JSON.stringify(updated));
  assert.equal(updated.emergency.status, 'In Progress');
  assert.equal(emergency.verificationReason, 'AI output needs a human review.');
  assert.equal(emergency.aiEvidence.textPrediction.verification_reason, 'low_confidence');
  assert.deepEqual(emittedEvents.map(([event]) => event), ['emergency:status-updated']);
  assert.equal(emittedEvents[0][1].emergencyId, emergency._id);
  assert.equal(emittedEvents[0][1].emergency.status, 'In Progress');
});

test('emergency list validates and applies supported responder filters', async () => {
  const filterCases = [
    ['all', {}],
    ['active', { status: { $nin: ['Resolved', 'Cancelled'] } }],
    ['critical', { priority: 'Critical', status: { $nin: ['Resolved', 'Cancelled'] } }],
    ['high', { priority: 'High', status: { $nin: ['Resolved', 'Cancelled'] } }],
    ['pending-verification', { $or: [{ aiStatus: 'Verification Required' }, { status: 'Verification Required' }] }],
    ['assigned', { assignedVolunteer: { $ne: null } }],
    ['in-progress', { status: 'In Progress' }],
    ['resolved', { status: 'Resolved' }],
  ];

  for (const [filter, expectedQuery] of filterCases) {
    const response = await fetch(`${baseUrl}/api/emergencies?filter=${filter}`, {
      headers: { Authorization: `Bearer ${tokenFor('admin-a', 'admin')}` },
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(data.emergencies, []);
    assert.deepEqual(lastEmergencyFilter, expectedQuery);
  }

  const invalidResponse = await fetch(`${baseUrl}/api/emergencies?filter=unknown`, {
    headers: { Authorization: `Bearer ${tokenFor('admin-a', 'admin')}` },
  });
  assert.equal(invalidResponse.status, 400);

  const unauthorizedResponse = await fetch(`${baseUrl}/api/emergencies?filter=critical`, {
    headers: { Authorization: `Bearer ${tokenFor('victim-a', 'victim')}` },
  });
  assert.equal(unauthorizedResponse.status, 403);
});

test('emergency filter counts reuse result predicates and volunteer visibility', async () => {
  countFilters = [];
  const adminResponse = await fetch(`${baseUrl}/api/emergencies/stats`, {
    headers: { Authorization: `Bearer ${tokenFor('admin-a', 'admin')}` },
  });
  const adminData = await adminResponse.json();
  assert.equal(adminResponse.status, 200);
  assert.deepEqual(adminData.stats, {
    total: 1,
    active: 2,
    critical: 3,
    high: 4,
    verification: 5,
    assigned: 6,
    inProgress: 7,
    resolved: 8,
  });
  assert.deepEqual(countFilters, [
    {},
    { status: { $nin: ['Resolved', 'Cancelled'] } },
    { priority: 'Critical', status: { $nin: ['Resolved', 'Cancelled'] } },
    { priority: 'High', status: { $nin: ['Resolved', 'Cancelled'] } },
    { $or: [{ aiStatus: 'Verification Required' }, { status: 'Verification Required' }] },
    { assignedVolunteer: { $ne: null } },
    { status: 'In Progress' },
    { status: 'Resolved' },
  ]);

  countFilters = [];
  const volunteerResponse = await fetch(`${baseUrl}/api/emergencies/stats`, {
    headers: { Authorization: `Bearer ${tokenFor('volunteer-a', 'volunteer')}` },
  });
  assert.equal(volunteerResponse.status, 200);
  assert.ok(countFilters.every((filter) => {
    const scope = filter.$and?.[1] || filter;
    return scope.assignedVolunteer === 'volunteer-record-a';
  }));
});

test('victim-view returns real emergency, AI, actions, and nearest services without secrets', async () => {
  const response = await getVictimView('emergency-owner-a', tokenFor('victim-a', 'admin'));
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.emergency.id, 'emergency-owner-a');
  assert.equal(data.aiAssessment.prediction, 'Fire');
  assert.equal(data.explanation.summary, 'The description includes smoke and fire indicators.');
  assert.equal(data.recommendedActions.length, 5);
  assert.equal(data.requiredEmergencyActions.find((action) => action.id === 'ai_analysis').status, 'completed');
  assert.equal(data.nearbyServices.hospitals[0].name, 'Near Hospital');
  assert.equal(data.emergency.locationName, 'Mumbai, Maharashtra, India');
  assert.equal(data.emergency.latitude, 19.076);
  assert.equal(data.emergency.longitude, 72.8777);
  assert.equal(data.nearbyServices.shelters[0].name, 'Nearby Shelter');
  assert.equal(data.nearbyServices.resources[0].name, 'Rescue Kit');
  assert.ok(data.nearbyServices.hospitals[0].distanceKm < data.nearbyServices.hospitals[1].distanceKm);
  assert.equal(JSON.stringify(data).includes('must-never-leak'), false);
  assert.equal(JSON.stringify(data).toLowerCase().includes('password'), false);
  assert.equal(JSON.stringify(data).toLowerCase().includes('token'), false);
});

test('victim-view denies another victim and allows the admin under existing access rules', async () => {
  const otherVictimResponse = await getVictimView('emergency-owner-a', tokenFor('victim-b', 'admin'));
  assert.equal(otherVictimResponse.status, 403);

  const adminResponse = await getVictimView('emergency-owner-a', tokenFor('admin-a', 'victim'));
  assert.equal(adminResponse.status, 200);
});

test('verification conflicts never return a confirmed prediction or victim actions', async () => {
  const conflicted = makeEmergency({
    _id: 'emergency-conflicted',
    aiStatus: 'Verification Required',
    status: 'Verification Required',
    aiPrediction: '',
    verificationReason: 'Responder reviewed the report.',
    aiEvidence: {
      textPrediction: { prediction: 'Fire', verification_required: true, verification_reason: 'low_confidence' },
      fusion: { prediction: 'Verification Required', conflict: true, verification_required: true },
    },
  });
  emergencies.set(conflicted._id, conflicted);

  const response = await getVictimView(conflicted._id, tokenFor('victim-a', 'victim'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.aiAssessment.prediction, 'Verification Required');
  assert.equal(data.aiAssessment.verificationRequired, true);
  assert.equal(data.aiAssessment.verificationReason, 'low_confidence');
  assert.equal(data.emergency.aiVerificationReason, 'low_confidence');
  assert.equal(data.emergency.verificationReason, 'Responder reviewed the report.');
  assert.equal(data.emergency.aiPrediction, '');
  assert.deepEqual(data.recommendedActions, []);
});

test('victim-view keeps matching text and image from appearing confirmed when text requires verification', async () => {
  const uncertain = makeEmergency({
    _id: 'emergency-text-verification',
    aiStatus: 'Verification Required',
    status: 'Verification Required',
    aiPrediction: '',
    aiEvidence: {
      textPrediction: { prediction: 'Fire', verification_required: true, verification_reason: 'insufficient_information' },
      imagePrediction: { prediction: 'Fire', confidence: 0.94 },
      fusion: { prediction: 'Verification Required', conflict: false, verification_required: true, modality: 'text_image_agreement' },
    },
  });
  emergencies.set(uncertain._id, uncertain);

  const response = await getVictimView(uncertain._id, tokenFor('victim-a', 'victim'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.aiAssessment.prediction, 'Verification Required');
  assert.equal(data.aiAssessment.verificationReason, 'insufficient_information');
  assert.equal(data.emergency.aiEvidence.textPrediction.prediction, 'Fire');
  assert.equal(data.emergency.aiEvidence.imagePrediction.prediction, 'Fire');
  assert.deepEqual(data.recommendedActions, []);
});

test('recommendations endpoint suppresses stale category-specific results while verification is pending', async () => {
  const uncertain = makeEmergency({
    _id: 'emergency-stale-recommendations',
    aiStatus: 'Completed',
    status: 'Confirmed',
    aiPrediction: 'Fire',
    recommendations: {
      facilities: [{ _id: 'stale-shelter', name: 'Do not show this shelter' }],
      resources: [{ _id: 'stale-resource', name: 'Do not show this resource' }],
      facilityMessage: 'Old recommendation',
    },
    aiEvidence: {
      textPrediction: { prediction: 'Fire', verification_required: true, verification_reason: 'low_confidence' },
      fusion: { prediction: 'Verification Required', conflict: false, verification_required: true },
    },
  });
  emergencies.set(uncertain._id, uncertain);

  const response = await fetch(`${baseUrl}/api/emergencies/${uncertain._id}/recommendations`, {
    headers: authorizedHeaders(tokenFor('victim-a', 'victim')),
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.recommendations.facilities, []);
  assert.deepEqual(data.recommendations.resources, []);
  assert.equal(data.recommendations.facilityMessage, 'Human verification is required before recommendations.');
});

test('legacy verification responses without an AI reason remain compatible', async () => {
  const legacy = makeEmergency({
    _id: 'emergency-legacy-verification',
    aiStatus: 'Verification Required',
    status: 'Verification Required',
    aiPrediction: '',
    aiEvidence: { fusion: { prediction: 'Verification Required', conflict: false, verification_required: true } },
  });
  emergencies.set(legacy._id, legacy);

  const response = await getVictimView(legacy._id, tokenFor('victim-a', 'victim'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.aiAssessment.prediction, 'Verification Required');
  assert.equal(data.aiAssessment.verificationRequired, true);
  assert.equal(data.aiAssessment.verificationReason, 'verification_required');
  assert.equal(data.emergency.aiVerificationReason, '');
});

test('human verification clears stale model verification flags when reopening an emergency', async () => {
  const verified = makeEmergency({
    _id: 'emergency-human-verified',
    aiStatus: 'Completed',
    status: 'Confirmed',
    aiPrediction: 'Flood',
    verifiedPrediction: 'Flood',
    aiEvidence: {
      textPrediction: { prediction: 'Fire', verification_required: true, verification_reason: 'low_confidence' },
      fusion: { prediction: 'Verification Required', verification_required: true, conflict: false },
    },
  });
  emergencies.set(verified._id, verified);

  const response = await getVictimView(verified._id, tokenFor('victim-a', 'victim'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.aiAssessment.verificationRequired, false);
  assert.equal(data.aiAssessment.prediction, 'Flood');
  assert.equal(data.aiAssessment.verificationReason, '');
  assert.equal(data.emergency.aiEvidence.fusion.verificationRequired, false);
});

test('Haversine distance uses Earth distance in kilometers', () => {
  const distanceKm = haversineKm([0, 0], [1, 0]);
  assert.ok(Math.abs(distanceKm - 111.195) < 0.1);
});