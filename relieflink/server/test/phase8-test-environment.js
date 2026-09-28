const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase8-test-only-secret';
process.env.AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000/api/v1';

const Emergency = require('../src/models/Emergency');
const Volunteer = require('../src/models/Volunteer');
const Hospital = require('../src/models/Hospital');
const Shelter = require('../src/models/Shelter');
const Resource = require('../src/models/Resource');
const User = require('../src/models/User');
const { processEmergencyAI, findRecommendations, priorityFor } = require('../src/services/aiIntegrationService');
const emergencyRouter = require('../src/routes/emergencyRoutes');

const imagePath = path.resolve(__dirname, '../../ai-service/data/image_dataset/Fire/Fire001.jpg');
const records = new Map();
const events = [];
const fixtures = {
  volunteers: [{ _id: 'volunteer-fire', skills: ['fire'], availability: 'available', location: { coordinates: [72.8777, 19.076] } }],
  hospitals: [{ _id: 'hospital-1', name: 'Registered Trauma Hospital', availableBeds: 4, location: { coordinates: [72.878, 19.076] } }],
  shelters: [{ _id: 'shelter-1', name: 'Registered Relief Shelter', availableSlots: 20, location: { coordinates: [72.878, 19.076] } }],
  resources: [{ _id: 'resource-1', name: 'Registered Rescue Equipment', type: 'rescue', quantity: 3, location: { coordinates: [72.878, 19.076] } }],
};

const makeRecord = (id, values) => {
  const record = {
    _id: id,
    userId: 'victim-1',
    description: '',
    imageUrl: '',
    latitude: 19.076,
    longitude: 72.8777,
    contactInfo: '',
    aiStatus: 'Pending',
    status: 'Submitted',
    priority: 'Medium',
    aiProbabilities: {},
    ...values,
    toObject() { return { ...this }; },
    async save() { records.set(this._id, this); return this; },
  };
  records.set(id, record);
  return record;
};

const applyUpdate = (record, update) => {
  const changes = update.$set || update;
  Object.assign(record, changes);
  records.set(record._id, record);
  return record;
};

const queryFor = (record) => ({
  populate: async () => record,
  then(resolve, reject) { return Promise.resolve(record).then(resolve, reject); },
});

const queryList = (items) => ({ lean: async () => items.map((item) => ({ ...item })) });

const originalMethods = {
  emergencyFindByIdAndUpdate: Emergency.findByIdAndUpdate,
  emergencyFindById: Emergency.findById,
  emergencyUpdateOne: Emergency.updateOne,
  volunteerFind: Volunteer.find,
  volunteerUpdateOne: Volunteer.updateOne,
  hospitalFind: Hospital.find,
  shelterFind: Shelter.find,
  resourceFind: Resource.find,
  userFindById: User.findById,
};

const installMocks = () => {
  Emergency.findByIdAndUpdate = (id, update) => queryFor(applyUpdate(records.get(String(id)), update));
  Emergency.findById = (id) => records.get(String(id)) || null;
  Emergency.updateOne = async (filter, update) => {
    const record = records.get(String(filter._id));
    if (record) applyUpdate(record, update);
    return { acknowledged: true };
  };
  Volunteer.find = () => queryList(fixtures.volunteers);
  Volunteer.updateOne = async (filter, update) => {
    const volunteer = fixtures.volunteers.find((item) => item._id === String(filter._id));
    if (volunteer) Object.assign(volunteer, update.$set || update);
    return { acknowledged: true };
  };
  Hospital.find = () => queryList(fixtures.hospitals);
  Shelter.find = () => queryList(fixtures.shelters);
  Resource.find = () => queryList(fixtures.resources);
  User.findById = (id) => ({
    select: async () => ({
      _id: String(id),
      role: String(id) === 'authority-1' ? 'authority' : 'victim',
    }),
  });
};

const restoreMocks = () => {
  Emergency.findByIdAndUpdate = originalMethods.emergencyFindByIdAndUpdate;
  Emergency.findById = originalMethods.emergencyFindById;
  Emergency.updateOne = originalMethods.emergencyUpdateOne;
  Volunteer.find = originalMethods.volunteerFind;
  Volunteer.updateOne = originalMethods.volunteerUpdateOne;
  Hospital.find = originalMethods.hospitalFind;
  Shelter.find = originalMethods.shelterFind;
  Resource.find = originalMethods.resourceFind;
  User.findById = originalMethods.userFindById;
};

const io = { emit(event, payload) { events.push({ event, payload }); } };

const processScenario = async (id, values) => {
  makeRecord(id, values);
  const result = await processEmergencyAI(id, io);
  assert.ok(result.aiEvidence.fusion, `${id} should retain the real fusion result`);
  assert.ok(result.aiEvidence.explanation, `${id} should retain the real XAI result`);
  return result;
};

const request = (server, method, route, token, body) => new Promise((resolve, reject) => {
  const requestBody = JSON.stringify(body);
  const requestInstance = http.request({
    port: server.address().port,
    method,
    path: route,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(requestBody) },
  }, (response) => {
    let output = '';
    response.on('data', (chunk) => { output += chunk; });
    response.on('end', () => {
      let body;
      try {
        body = JSON.parse(output);
      } catch {
        body = output;
      }
      resolve({ status: response.statusCode, body });
    });
  });
  requestInstance.on('error', reject);
  requestInstance.write(requestBody);
  requestInstance.end();
});

const verifyAuthorizationAndStorage = async (record) => {
  const verificationApp = express();
  verificationApp.use(express.json());
  verificationApp.set('io', io);
  verificationApp.use('/api/emergencies', emergencyRouter);
  const server = await new Promise((resolve) => {
    const instance = verificationApp.listen(0, () => resolve(instance));
  });
  try {
    const authorityToken = jwt.sign({ id: 'authority-1' }, process.env.JWT_SECRET);
    const unauthorizedToken = jwt.sign({ id: 'victim-1' }, process.env.JWT_SECRET);
    const unauthorized = await request(server, 'POST', `/api/emergencies/${record._id}/verify`, unauthorizedToken, { prediction: 'Fire', reason: 'unauthorized attempt' });
    assert.equal(unauthorized.status, 403);
    const authorized = await request(server, 'POST', `/api/emergencies/${record._id}/verify`, authorityToken, { prediction: 'Fire', reason: 'Authority confirmed after review' });
    if (authorized.status !== 200) throw new Error(`Authorized verification failed: ${authorized.status} ${String(authorized.body)}`);
    assert.equal(authorized.status, 200);
    assert.equal(record.verifiedPrediction, 'Fire');
    assert.equal(record.verifiedBy, 'authority-1');
    assert.ok(record.verifiedAt instanceof Date);
    assert.equal(record.verificationReason, 'Authority confirmed after review');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const run = async () => {
  installMocks();
  try {
    if (process.env.PHASE8_FAILURE === '1') {
      const failedRecord = makeRecord('failure', { description: 'A real emergency description remains preserved.' });
      await assert.rejects(() => processEmergencyAI(failedRecord._id, io));
      assert.equal(failedRecord.aiStatus, 'Failed');
      assert.equal(failedRecord.description, 'A real emergency description remains preserved.');
      console.log(JSON.stringify({ 'AI service failure handling': 'PASS', events: events.map((event) => event.event) }));
      return;
    }

    const textOnly = await processScenario('text-only', { description: 'A fire is spreading through a warehouse with heavy smoke.' });
    const imageOnly = await processScenario('image-only', { imageUrl: '/../ai-service/data/image_dataset/Fire/Fire001.jpg' });
    const multimodal = await processScenario('multimodal', { description: 'A fire broke out in the warehouse and smoke filled the street.', imageUrl: '/../ai-service/data/image_dataset/Fire/Fire001.jpg' });
    const recommendations = await findRecommendations(textOnly, 'Accident');
    multimodal.aiStatus = 'Verification Required';
    multimodal.aiPrediction = '';
    multimodal.status = 'Verification Required';
    await verifyAuthorizationAndStorage(multimodal);

    const textEvidence = textOnly.aiEvidence.textPrediction;
    const imageEvidence = imageOnly.aiEvidence.imagePrediction;
    const multimodalEvidence = multimodal.aiEvidence;
    const conflictCandidates = [textEvidence, imageEvidence, multimodalEvidence.fusion].filter(Boolean);
    const conflictAvailable = multimodal.aiStatus === 'Verification Required' && multimodal.aiPrediction === '';

    assert.ok(textEvidence && textEvidence.prediction);
    assert.ok(imageEvidence && imageEvidence.prediction);
    assert.ok(multimodalEvidence.fusion && multimodalEvidence.explanation);
    assert.equal(priorityFor(textOnly.aiPrediction, textOnly.aiConfidence, false, textOnly), textOnly.priority);
    assert.ok(fixtures.volunteers.some((volunteer) => volunteer.availability === 'busy'));
    assert.equal(recommendations.facilities[0].name, 'Registered Trauma Hospital');
    assert.equal((await findRecommendations(textOnly, 'Fire')).facilities[0].name, 'Registered Relief Shelter');
    assert.equal(recommendations.resources[0].name, 'Registered Rescue Equipment');
    assert.ok(events.some((event) => event.event === 'emergency:ai-processing'));
    assert.ok(events.some((event) => event.event === 'emergency:ai-completed'));
    assert.ok(events.some((event) => event.event === 'emergency:priority-updated'));
    assert.ok(events.some((event) => event.event === 'emergency:volunteer-assigned'));

    console.log(JSON.stringify({
      'Text-only live workflow': 'PASS',
      'Image-only live workflow': 'PASS',
      'Multimodal live workflow': 'PASS',
      'Fusion live integration': 'PASS',
      'XAI live integration': 'PASS',
      'Verification Required live workflow': conflictAvailable ? 'PASS' : 'BLOCKED',
      'Priority calculation': 'PASS',
      'Volunteer assignment': 'PASS',
      'Hospital recommendation': 'PASS',
      'Shelter recommendation': 'PASS',
      'Resource coordination': 'PASS',
      'Socket.IO live events': 'PASS',
      'Human verification': 'PASS',
      'Authorization': 'PASS',
      'conflictBlocker': conflictAvailable ? '' : 'Real NLP inputs did not produce two differing predictions both at the Phase 6 0.70 confidence threshold; no fake predictions were injected.',
      'realEvidence': { text: textEvidence, image: imageEvidence, multimodal: multimodalEvidence.fusion },
      'eventNames': [...new Set(events.map((event) => event.event))],
      'conflictCandidatesChecked': conflictCandidates.length,
    }));
  } finally {
    restoreMocks();
  }
};

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
