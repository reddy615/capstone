import assert from 'node:assert/strict';
import test from 'node:test';
import { getAiAssessmentDisplay } from '../src/utils/aiVerification.js';

test('clear predictions retain the emergency class', () => {
  assert.deepEqual(getAiAssessmentDisplay(
    { prediction: 'Fire', verificationRequired: false },
    { aiPrediction: 'Fire' },
  ), { verificationRequired: false, prediction: 'Fire', reason: '' });
});

test('short text reason is human-readable and suppresses the class', () => {
  assert.deepEqual(getAiAssessmentDisplay(
    { verificationRequired: true, verificationReason: 'insufficient_information', prediction: 'Fire' },
    {},
  ), { verificationRequired: true, prediction: 'Verification Required', reason: 'Not enough information' });
});

test('low confidence remains distinct from a modality conflict', () => {
  assert.equal(getAiAssessmentDisplay(
    { verificationRequired: true },
    { aiEvidence: { textPrediction: { verification_reason: 'low_confidence' } } },
  ).reason, 'Low-confidence prediction');
});

test('legacy conflict evidence is recognized without new optional fields', () => {
  assert.deepEqual(getAiAssessmentDisplay(
    {},
    { aiStatus: 'Verification Required', aiEvidence: { fusion: { conflict: true, verification_required: true } } },
  ), {
    verificationRequired: true,
    prediction: 'Verification Required',
    reason: 'Conflicting model predictions',
  });
});

test('human verification reason is not mistaken for the AI reason', () => {
  assert.equal(getAiAssessmentDisplay(
    { verificationRequired: true },
    { verificationReason: 'Reviewed by responder' },
  ).reason, 'Please verify the details before treating an AI classification as confirmed.');
});

test('human verification clears stale AI abstention metadata', () => {
  assert.deepEqual(getAiAssessmentDisplay(
    {},
    {
      aiStatus: 'Completed',
      aiPrediction: 'Flood',
      verifiedPrediction: 'Flood',
      aiEvidence: {
        textPrediction: { verification_required: true, verification_reason: 'low_confidence' },
        fusion: { verification_required: true },
      },
    },
  ), { verificationRequired: false, prediction: 'Flood', reason: '' });
});
