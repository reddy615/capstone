const fs = require('fs/promises');
const path = require('path');
const Emergency = require('../models/Emergency');
const Volunteer = require('../models/Volunteer');
const Hospital = require('../models/Hospital');
const Shelter = require('../models/Shelter');
const Resource = require('../models/Resource');

const CLASS_NAMES = ['Fire', 'Flood', 'Accident'];
const configuredAIServiceUrl = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const AI_BASE_URL = configuredAIServiceUrl.endsWith('/api/v1') ? configuredAIServiceUrl : `${configuredAIServiceUrl}/api/v1`;
const AI_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS || 15000);

class AIServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AIServiceError';
    this.cause = cause;
  }
}

const emit = (io, event, emergency) => {
  if (io) io.emit(event, { emergencyId: emergency._id, emergency });
};

const requestJson = async (endpoint, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(`${AI_BASE_URL}${endpoint}`, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new AIServiceError(`AI service returned ${response.status}.`);
    return payload;
  } catch (error) {
    if (error instanceof AIServiceError) throw error;
    throw new AIServiceError('AI service is unavailable or timed out.', error);
  } finally {
    clearTimeout(timeout);
  }
};

const predictText = (text) => requestJson('/predict/text', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text }),
});

const predictImage = async (imagePath) => {
  const bytes = await fs.readFile(imagePath);
  const form = new FormData();
  form.append('image', new Blob([bytes]), path.basename(imagePath));
  return requestJson('/predict/image', { method: 'POST', body: form });
};

const distance = (first, second) => {
  const [firstLng, firstLat] = first;
  const [secondLng, secondLat] = second;
  return Math.hypot(firstLat - secondLat, firstLng - secondLng);
};

const priorityFor = (prediction, confidence, verificationRequired, emergency) => {
  if (verificationRequired) return 'High';
  if (prediction === 'Fire' && confidence >= 0.8) return 'Critical';
  if (prediction === 'Accident' && confidence >= 0.8) return 'Critical';
  if (prediction === 'Flood' && confidence >= 0.8) return 'High';
  if (confidence >= 0.65 || emergency.contactInfo) return 'High';
  if (confidence >= 0.4) return 'Medium';
  return 'Low';
};

const findRecommendations = async (emergency, prediction) => {
  const point = [emergency.longitude, emergency.latitude];
  const recommendations = { facilities: [], resources: [] };
  if (prediction === 'Accident') {
    const hospitals = await Hospital.find({ availableBeds: { $gt: 0 } }).lean();
    recommendations.facilities = hospitals
      .sort((a, b) => distance(point, a.location.coordinates) - distance(point, b.location.coordinates))
      .slice(0, 3);
  } else if (prediction === 'Fire' || prediction === 'Flood') {
    const shelters = await Shelter.find({ availableSlots: { $gt: 0 } }).lean();
    recommendations.facilities = shelters
      .sort((a, b) => distance(point, a.location.coordinates) - distance(point, b.location.coordinates))
      .slice(0, 3);
  }
  const resourceTypes = prediction === 'Accident' ? ['medical', 'transport', 'rescue'] : ['shelter', 'rescue', 'equipment'];
  const resources = await Resource.find({ type: { $in: resourceTypes }, quantity: { $gt: 0 } }).lean();
  recommendations.resources = resources
    .sort((a, b) => distance(point, a.location.coordinates) - distance(point, b.location.coordinates))
    .slice(0, 5);
  recommendations.facilityMessage = recommendations.facilities.length ? '' : 'No suitable registered facility available.';
  return recommendations;
};

const assignVolunteer = async (emergency, prediction, io) => {
  if (!prediction || !CLASS_NAMES.includes(prediction)) return null;
  const volunteers = await Volunteer.find({ availability: 'available' }).lean();
  const skill = prediction.toLowerCase();
  const suitable = volunteers.filter((volunteer) => !volunteer.skills.length || volunteer.skills.some((value) => value.toLowerCase().includes(skill)));
  const selected = suitable.sort((a, b) => distance([emergency.longitude, emergency.latitude], a.location.coordinates) - distance([emergency.longitude, emergency.latitude], b.location.coordinates))[0];
  if (!selected) return null;
  await Volunteer.updateOne({ _id: selected._id }, { $set: { availability: 'busy' } });
  await Emergency.updateOne({ _id: emergency._id }, { $set: { assignedVolunteer: selected._id, status: 'Assigned' } });
  emit(io, 'emergency:volunteer-assigned', { ...emergency.toObject(), assignedVolunteer: selected._id });
  return selected;
};

const imagePathFor = (imageUrl) => path.resolve(__dirname, '..', '..', imageUrl.replace(/^[/\\]/, ''));

const processEmergencyAI = async (emergencyId, io) => {
  let emergency = await Emergency.findByIdAndUpdate(emergencyId, { aiStatus: 'Processing', status: 'AI Processing', aiUpdatedAt: new Date() }, { new: true });
  if (!emergency) throw new Error('Emergency not found.');
  emit(io, 'emergency:ai-processing', emergency);
  try {
    const textPrediction = emergency.description ? await predictText(emergency.description) : null;
    const imagePrediction = emergency.imageUrl ? await predictImage(imagePathFor(emergency.imageUrl)) : null;
    const fusion = await requestJson('/fusion/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_prediction: textPrediction, image_prediction: imagePrediction }),
    });
    const explanation = await requestJson('/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fusion),
    });
    const verificationRequired = Boolean(fusion.verification_required);
    const finalPrediction = verificationRequired ? '' : fusion.prediction;
    const priority = priorityFor(finalPrediction, Number(fusion.confidence || 0), verificationRequired, emergency);
    const recommendations = verificationRequired ? { facilities: [], resources: [], facilityMessage: 'Human verification is required before recommendations.' } : await findRecommendations(emergency, finalPrediction);
    emergency = await Emergency.findByIdAndUpdate(emergencyId, {
      aiStatus: verificationRequired ? 'Verification Required' : 'Completed',
      aiPrediction: finalPrediction,
      aiConfidence: Number(fusion.confidence || 0),
      aiProbabilities: fusion.probabilities,
      aiExplanation: explanation.explanation?.summary || '',
      aiModalityContribution: explanation.explanation?.modality_contribution || fusion.weights,
      aiEvidence: {
        textPrediction,
        imagePrediction,
        fusion,
        explanation: explanation.explanation || {},
      },
      aiUpdatedAt: new Date(),
      priority,
      status: verificationRequired ? 'Verification Required' : 'Confirmed',
      recommendations,
    }, { new: true }).populate('assignedVolunteer');
    if (!verificationRequired) {
      const volunteer = await assignVolunteer(emergency, finalPrediction, io);
      if (volunteer) emergency.assignedVolunteer = volunteer;
    }
    emit(io, verificationRequired ? 'emergency:verification-required' : 'emergency:ai-completed', emergency);
    emit(io, 'emergency:priority-updated', emergency);
    if (recommendations.facilities.length) emit(io, 'emergency:facility-recommended', { emergencyId: emergency._id, recommendations });
    return emergency;
  } catch (error) {
    emergency = await Emergency.findByIdAndUpdate(emergencyId, { aiStatus: 'Failed', aiUpdatedAt: new Date(), status: 'Submitted' }, { new: true });
    emit(io, 'emergency:ai-failed', emergency);
    throw error;
  }
};

module.exports = { CLASS_NAMES, AIServiceError, processEmergencyAI, findRecommendations, priorityFor };