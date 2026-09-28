const test = require('node:test');
const assert = require('node:assert/strict');

const Emergency = require('../src/models/Emergency');
const Volunteer = require('../src/models/Volunteer');
const Hospital = require('../src/models/Hospital');
const Shelter = require('../src/models/Shelter');
const Resource = require('../src/models/Resource');
const { processEmergencyAI } = require('../src/services/aiIntegrationService');

test('AI processing keeps a valid result even when volunteer records omit optional skills metadata', async () => {
  const originalFetch = global.fetch;
  const originalFindByIdAndUpdate = Emergency.findByIdAndUpdate;
  const originalUpdateOne = Emergency.updateOne;
  const originalVolunteerFind = Volunteer.find;
  const originalVolunteerUpdateOne = Volunteer.updateOne;
  const originalHospitalFind = Hospital.find;
  const originalShelterFind = Shelter.find;
  const originalResourceFind = Resource.find;

  const store = {
    _id: 'emergency-42',
    userId: 'user-1',
    description: 'Warehouse fire with smoke across the loading bay.',
    imageUrl: '',
    latitude: 19.076,
    longitude: 72.8777,
    contactInfo: '555-0100',
    status: 'Submitted',
    aiStatus: 'Pending',
    aiPrediction: '',
    aiConfidence: 0,
    aiProbabilities: {},
    aiExplanation: '',
    aiModalityContribution: null,
    aiEvidence: null,
    aiUpdatedAt: null,
    assignedVolunteer: null,
    recommendations: null,
    priority: 'Medium',
    toObject() {
      return { ...this };
    },
  };

  global.fetch = async (url, options = {}) => {
    const endpoint = String(url).split('/api/v1').pop();
    if (endpoint === '/predict/text') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ prediction: 'Fire', confidence: 0.91, probabilities: { Fire: 0.91, Flood: 0.05, Accident: 0.04 } }),
      };
    }
    if (endpoint === '/fusion/predict') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          prediction: 'Fire',
          confidence: 0.91,
          probabilities: { Fire: 0.91, Flood: 0.05, Accident: 0.04 },
          modality: 'text_only',
          weights: { text: 1.0, image: 0.0 },
          text_prediction: 'Fire',
          image_prediction: null,
          conflict: false,
          verification_required: false,
        }),
      };
    }
    if (endpoint === '/explain') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          prediction: 'Fire',
          confidence: 0.91,
          explanation: {
            summary: 'The emergency is determined from the text context alone.',
            modality_contribution: { text: 1.0, image: 0.0 },
          },
        }),
      };
    }
    return { ok: false, status: 500, json: async () => ({ detail: 'unexpected endpoint' }) };
  };

  Emergency.findByIdAndUpdate = (id, update, options) => {
    Object.assign(store, update.$set || update);
    const query = {
      then: (resolve, reject) => Promise.resolve({ ...store }).then(resolve, reject),
      populate: async () => ({ ...store }),
    };
    return query;
  };
  Emergency.updateOne = async () => ({ acknowledged: true });

  Volunteer.find = () => ({
    lean: async () => [
      {
        _id: 'vol-1',
        user: 'user-2',
        skills: undefined,
        availability: 'available',
        location: { coordinates: [72.8777, 19.076] },
      },
    ],
  });
  Volunteer.updateOne = async () => ({ acknowledged: true });
  Hospital.find = () => ({ lean: async () => [] });
  Shelter.find = () => ({ lean: async () => [] });
  Resource.find = () => ({ lean: async () => [] });

  try {
    const result = await processEmergencyAI('emergency-42', { emit() {} });
    assert.equal(result.aiStatus, 'Completed');
    assert.equal(result.aiPrediction, 'Fire');
  } finally {
    global.fetch = originalFetch;
    Emergency.findByIdAndUpdate = originalFindByIdAndUpdate;
    Emergency.updateOne = originalUpdateOne;
    Volunteer.find = originalVolunteerFind;
    Volunteer.updateOne = originalVolunteerUpdateOne;
    Hospital.find = originalHospitalFind;
    Shelter.find = originalShelterFind;
    Resource.find = originalResourceFind;
  }
});
