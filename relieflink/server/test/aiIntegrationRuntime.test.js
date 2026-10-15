const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

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

test('AI processing persists short-text, low-confidence, and conflict verification without confirming a class', async () => {
  const originalFetch = global.fetch;
  const originalReadFile = fs.readFile;
  const originalFindByIdAndUpdate = Emergency.findByIdAndUpdate;
  const originalVolunteerFind = Volunteer.find;
  const originalVolunteerUpdateOne = Volunteer.updateOne;
  const originalUpdateOne = Emergency.updateOne;
  const originalHospitalFind = Hospital.find;
  const originalShelterFind = Shelter.find;
  const originalResourceFind = Resource.find;
  let currentCase;
  let volunteerLookups = 0;
  const store = {
    _id: 'emergency-verification',
    userId: 'user-1',
    description: 'Smoke?',
    imageUrl: '/uploads/emergencies/mock.jpg',
    latitude: 19.076,
    longitude: 72.8777,
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
    toObject() { return { ...this }; },
  };
  const scenarios = [
    {
      name: 'short text, even with agreeing modalities',
      textReason: 'insufficient_information',
      fusion: {
        prediction: 'Verification Required',
        confidence: 0.91,
        probabilities: { Fire: 0.91, Flood: 0.05, Accident: 0.04 },
        modality: 'text_image_agreement',
        weights: { text: 0.5, image: 0.5 },
        text_prediction: 'Fire',
        image_prediction: 'Fire',
        conflict: false,
        verification_required: true,
      },
      imagePrediction: { prediction: 'Fire', confidence: 0.94, probabilities: { Fire: 0.94, Flood: 0.04, Accident: 0.02 } },
    },
    {
      name: 'low-confidence text',
      textReason: 'low_confidence',
      fusion: {
        prediction: 'Verification Required',
        confidence: 0.41,
        probabilities: { Fire: 0.41, Flood: 0.32, Accident: 0.27 },
        modality: 'text_only',
        weights: { text: 1, image: 0 },
        text_prediction: 'Fire',
        image_prediction: null,
        conflict: false,
        verification_required: true,
      },
      imagePrediction: null,
    },
    {
      name: 'text and image conflict',
      textReason: null,
      fusion: {
        prediction: 'Verification Required',
        confidence: 0.88,
        probabilities: { Fire: 0.88, Flood: 0.07, Accident: 0.05 },
        modality: 'conflict',
        weights: { text: 0.5, image: 0.5 },
        text_prediction: 'Fire',
        image_prediction: 'Flood',
        conflict: true,
        verification_required: true,
      },
      imagePrediction: { prediction: 'Flood', confidence: 0.88, probabilities: { Fire: 0.07, Flood: 0.88, Accident: 0.05 } },
    },
  ];

  fs.readFile = async () => Buffer.from('mock image');
  global.fetch = async (url) => {
    const endpoint = String(url).split('/api/v1').pop();
    if (endpoint === '/predict/text') {
      const probabilities = currentCase.textReason === 'low_confidence'
        ? { Fire: 0.41, Flood: 0.32, Accident: 0.27 }
        : { Fire: 0.91, Flood: 0.05, Accident: 0.04 };
      return { ok: true, status: 200, json: async () => ({
        prediction: 'Fire',
        confidence: currentCase.textReason === 'low_confidence' ? 0.41 : 0.91,
        probabilities,
        verification_required: Boolean(currentCase.textReason),
        verification_reason: currentCase.textReason,
      }) };
    }
    if (endpoint === '/predict/image') {
      return { ok: true, status: 200, json: async () => currentCase.imagePrediction };
    }
    if (endpoint === '/fusion/predict') {
      return { ok: true, status: 200, json: async () => currentCase.fusion };
    }
    if (endpoint === '/explain') {
      return { ok: true, status: 200, json: async () => ({
        explanation: { summary: 'Human verification is required.', modality_contribution: currentCase.fusion.weights },
      }) };
    }
    return { ok: false, status: 500, json: async () => ({ detail: 'unexpected endpoint' }) };
  };
  Emergency.findByIdAndUpdate = (id, update) => {
    Object.assign(store, update.$set || update);
    return {
      then: (resolve, reject) => Promise.resolve(store).then(resolve, reject),
      populate: async () => store,
    };
  };
  Volunteer.find = () => {
    volunteerLookups += 1;
    return { lean: async () => [] };
  };
  Volunteer.updateOne = async () => ({ acknowledged: true });
  Emergency.updateOne = async () => ({ acknowledged: true });
  Hospital.find = () => ({ lean: async () => [] });
  Shelter.find = () => ({ lean: async () => [] });
  Resource.find = () => ({ lean: async () => [] });

  try {
    for (const scenario of scenarios) {
      currentCase = scenario;
      Object.assign(store, {
        status: 'Submitted',
        aiStatus: 'Pending',
        aiPrediction: '',
        aiEvidence: null,
        recommendations: null,
        assignedVolunteer: null,
        imageUrl: scenario.imagePrediction ? '/uploads/emergencies/mock.jpg' : '',
      });

      const result = await processEmergencyAI(store._id, { emit() {} });
      assert.equal(result.aiStatus, 'Verification Required', scenario.name);
      assert.equal(result.aiPrediction, '', scenario.name);
      assert.equal(result.status, 'Verification Required', scenario.name);
      assert.equal(result.aiEvidence.textPrediction.verification_reason, scenario.textReason, scenario.name);
      assert.equal(result.aiEvidence.imagePrediction?.prediction || null, scenario.imagePrediction?.prediction || null, scenario.name);
      assert.equal(result.aiEvidence.fusion.verification_required, true, scenario.name);
      assert.deepEqual(result.recommendations.facilities, [], scenario.name);
      assert.deepEqual(result.recommendations.resources, [], scenario.name);
    }
    assert.equal(volunteerLookups, 0, 'verification-required reports must not trigger assignment');
  } finally {
    global.fetch = originalFetch;
    fs.readFile = originalReadFile;
    Emergency.findByIdAndUpdate = originalFindByIdAndUpdate;
    Volunteer.find = originalVolunteerFind;
    Volunteer.updateOne = originalVolunteerUpdateOne;
    Emergency.updateOne = originalUpdateOne;
    Hospital.find = originalHospitalFind;
    Shelter.find = originalShelterFind;
    Resource.find = originalResourceFind;
  }
});
