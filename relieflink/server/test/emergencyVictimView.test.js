const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { after, before, test } = require('node:test');

const User = require('../src/models/User');
const Emergency = require('../src/models/Emergency');
const Hospital = require('../src/models/Hospital');
const Shelter = require('../src/models/Shelter');
const Resource = require('../src/models/Resource');
const emergencyRoutes = require('../src/routes/emergencyRoutes');
const { errorHandler } = require('../src/middleware/errorMiddleware');
const { haversineKm } = emergencyRoutes;

const originalMethods = {
  userFindById: User.findById,
  emergencyFindById: Emergency.findById,
  emergencyFind: Emergency.find,
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
  emergencies.set('emergency-owner-a', makeEmergency());

  User.findById = (id) => ({ select: async () => users.get(String(id)) || null });
  Emergency.findById = (id) => ({ populate: async () => emergencies.get(String(id)) || null });
  Emergency.find = (filter) => {
    lastEmergencyFilter = filter;
    return {
      sort() { return this; },
      populate() { return this; },
      then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); },
    };
  };
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
  Hospital.find = originalMethods.hospitalFind;
  Shelter.find = originalMethods.shelterFind;
  Resource.find = originalMethods.resourceFind;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

const tokenFor = (id, claimedRole) => jwt.sign({ id, role: claimedRole }, jwtSecret);
const getVictimView = (id, token) => fetch(`${baseUrl}/api/emergencies/${id}/victim-view`, {
  headers: { Authorization: `Bearer ${token}` },
});

test('emergency list validates and applies supported responder filters', async () => {
  const filterCases = [
    ['all', {}],
    ['active', { status: { $nin: ['Resolved', 'Cancelled'] } }],
    ['critical', { priority: 'Critical', status: { $nin: ['Resolved', 'Cancelled'] } }],
    ['high', { priority: 'High', status: { $nin: ['Resolved', 'Cancelled'] } }],
    ['pending-verification', { aiStatus: 'Verification Required' }],
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
    aiPrediction: '',
    aiEvidence: { fusion: { prediction: 'Verification Required', conflict: true, verification_required: true } },
  });
  emergencies.set(conflicted._id, conflicted);

  const response = await getVictimView(conflicted._id, tokenFor('victim-a', 'victim'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.aiAssessment.prediction, 'Verification Required');
  assert.equal(data.aiAssessment.verificationRequired, true);
  assert.deepEqual(data.recommendedActions, []);
});

test('Haversine distance uses Earth distance in kilometers', () => {
  const distanceKm = haversineKm([0, 0], [1, 0]);
  assert.ok(Math.abs(distanceKm - 111.195) < 0.1);
});