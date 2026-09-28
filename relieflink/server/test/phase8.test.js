const test = require('node:test');
const assert = require('node:assert/strict');
const { CLASS_NAMES, findRecommendations, priorityFor } = require('../src/services/aiIntegrationService');
const Hospital = require('../src/models/Hospital');
const Shelter = require('../src/models/Shelter');
const Resource = require('../src/models/Resource');

test('Phase 8 keeps exactly three emergency classes', () => {
  assert.deepEqual(CLASS_NAMES, ['Fire', 'Flood', 'Accident']);
});

test('priority rules distinguish critical, verification, and lower confidence cases', () => {
  const emergency = { contactInfo: '', latitude: 1, longitude: 1 };
  assert.equal(priorityFor('Fire', 0.9, false, emergency), 'Critical');
  assert.equal(priorityFor('', 0, true, emergency), 'High');
  assert.equal(priorityFor('Flood', 0.3, false, emergency), 'Low');
});

test('recommendations use registered available records only', async () => {
  const originals = { hospital: Hospital.find, shelter: Shelter.find, resource: Resource.find };
  const emergency = { latitude: 10, longitude: 20 };
  Hospital.find = () => ({ lean: async () => [{ name: 'Registered Hospital', availableBeds: 2, location: { coordinates: [20, 10] } }] });
  Shelter.find = () => ({ lean: async () => [] });
  Resource.find = () => ({ lean: async () => [{ name: 'Registered Rescue Kit', quantity: 1, location: { coordinates: [20, 10] } }] });
  try {
    const accident = await findRecommendations(emergency, 'Accident');
    assert.equal(accident.facilities[0].name, 'Registered Hospital');
    assert.equal(accident.resources[0].name, 'Registered Rescue Kit');
    const flood = await findRecommendations(emergency, 'Flood');
    assert.equal(flood.facilityMessage, 'No suitable registered facility available.');
  } finally {
    Hospital.find = originals.hospital;
    Shelter.find = originals.shelter;
    Resource.find = originals.resource;
  }
});
