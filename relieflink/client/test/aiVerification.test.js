import { describe, expect, it } from 'vitest';
import { getAiAssessmentDisplay } from '../src/utils/aiVerification.js';

describe('AI assessment display', () => {
  it('clear predictions retain the emergency class', () => {
    expect(getAiAssessmentDisplay(
    { prediction: 'Fire', verificationRequired: false },
    { aiPrediction: 'Fire' },
    )).toEqual({ verificationRequired: false, prediction: 'Fire', reason: '' });
  });

  it('short text reason is human-readable and suppresses the class', () => {
    expect(getAiAssessmentDisplay(
    { verificationRequired: true, verificationReason: 'insufficient_information', prediction: 'Fire' },
    {},
    )).toEqual({ verificationRequired: true, prediction: 'Verification Required', reason: 'Not enough information' });
  });

  it('low confidence remains distinct from a modality conflict', () => {
    expect(getAiAssessmentDisplay(
    { verificationRequired: true },
    { aiEvidence: { textPrediction: { verification_reason: 'low_confidence' } } },
    ).reason).toBe('Low-confidence prediction');
  });

  it('legacy conflict evidence is recognized without new optional fields', () => {
    expect(getAiAssessmentDisplay(
    {},
    { aiStatus: 'Verification Required', aiEvidence: { fusion: { conflict: true, verification_required: true } } },
    )).toEqual({
      verificationRequired: true,
      prediction: 'Verification Required',
      reason: 'Conflicting model predictions',
    });
  });

  it('human verification reason is not mistaken for the AI reason', () => {
    expect(getAiAssessmentDisplay(
    { verificationRequired: true },
    { verificationReason: 'Reviewed by responder' },
    ).reason).toBe('Please verify the details before treating an AI classification as confirmed.');
  });

  it('human verification clears stale AI abstention metadata', () => {
    expect(getAiAssessmentDisplay(
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
    )).toEqual({ verificationRequired: false, prediction: 'Flood', reason: '' });
  });

  it('accepts null assessment and emergency values during initial rendering', () => {
    expect(getAiAssessmentDisplay(null, null)).toEqual({
      verificationRequired: false,
      prediction: '',
      reason: '',
    });
  });
});
