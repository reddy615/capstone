const verificationReasonLabels = {
  insufficient_information: 'Not enough information',
  low_confidence: 'Low-confidence prediction',
  conflicting_predictions: 'Conflicting model predictions',
  verification_required: 'The AI could not confidently classify this report',
};

export const getAiAssessmentDisplay = (assessment = {}, emergency = {}) => {
  const evidence = emergency.aiEvidence || {};
  const fusion = evidence.fusion || {};
  const humanVerified = ['Fire', 'Flood', 'Accident'].includes(emergency.verifiedPrediction)
    && emergency.aiStatus === 'Completed';
  const verificationRequired = !humanVerified && (
    assessment.verificationRequired === true
    || emergency.verificationRequired === true
    || assessment.status === 'Verification Required'
    || assessment.prediction === 'Verification Required'
    || emergency.aiStatus === 'Verification Required'
    || emergency.status === 'Verification Required'
    || emergency.aiPrediction === 'Verification Required'
    || evidence.textPrediction?.verification_required === true
    || fusion.conflict === true
    || fusion.verification_required === true
    || fusion.verificationRequired === true
  );
  const reason = assessment.verificationReason
    || emergency.aiVerificationReason
    || evidence.textPrediction?.verification_reason
    || evidence.textPrediction?.verificationReason
    || (fusion.conflict ? 'conflicting_predictions' : '');
  const reasonLabel = verificationReasonLabels[reason]
    || (reason ? String(reason).replaceAll('_', ' ') : 'Please verify the details before treating an AI classification as confirmed.');

  return {
    verificationRequired,
    prediction: verificationRequired
      ? 'Verification Required'
      : assessment.prediction || emergency.aiPrediction || '',
    reason: verificationRequired ? reasonLabel : '',
  };
};
