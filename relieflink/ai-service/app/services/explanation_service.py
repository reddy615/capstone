from __future__ import annotations

import math
from typing import Any

from app.models.explanation_schemas import (
    EMERGENCY_CLASSES,
    ExplanationResponse,
    FusionExplanationRequest,
    ImageEvidence,
    ModalityContribution,
    ExplanationDetails,
    TextEvidence,
)


def _validate_fusion_result(payload: dict[str, Any]) -> FusionExplanationRequest:
    if not isinstance(payload, dict):
        raise ValueError('Fusion result must be an object.')

    try:
        fusion = FusionExplanationRequest.model_validate(payload)
    except Exception as exc:
        raise ValueError('Fusion result contains invalid or missing fields.') from exc

    if fusion.prediction not in (*EMERGENCY_CLASSES, 'Verification Required'):
        raise ValueError('Prediction must be Fire, Flood, Accident, or Verification Required.')

    if set(fusion.probabilities) != set(EMERGENCY_CLASSES):
        raise ValueError('Probabilities must contain exactly Fire, Flood, and Accident.')
    if any(not math.isfinite(value) or value < 0 or value > 1 for value in fusion.probabilities.values()):
        raise ValueError('Probabilities must be finite values between 0 and 1.')
    if not math.isclose(sum(fusion.probabilities.values()), 1.0, abs_tol=1e-3):
        raise ValueError('Probabilities must sum to 1.')
    if fusion.prediction != 'Verification Required' and fusion.confidence is None:
        raise ValueError('Confidence is required for an emergency prediction.')

    if set(fusion.weights) != {'text', 'image'}:
        raise ValueError('Weights must contain exactly text and image.')
    if any(not math.isfinite(value) or value < 0 or value > 1 for value in fusion.weights.values()):
        raise ValueError('Weights must be between 0 and 1.')
    if not math.isclose(sum(fusion.weights.values()), 1.0, abs_tol=1e-6):
        raise ValueError('Weights must sum to 1.')

    has_text = fusion.text_prediction is not None
    has_image = fusion.image_prediction is not None
    expected_modality = 'text_and_image' if has_text and has_image else 'text_only' if has_text else 'image_only' if has_image else None
    if expected_modality is None:
        raise ValueError('At least one modality prediction is required.')
    if fusion.modality != expected_modality:
        raise ValueError('Modality does not match the available predictions.')

    expected_weights = {'text_only': (1.0, 0.0), 'image_only': (0.0, 1.0)}
    if fusion.modality in expected_weights:
        text_weight, image_weight = expected_weights[fusion.modality]
        if not math.isclose(fusion.weights['text'], text_weight) or not math.isclose(fusion.weights['image'], image_weight):
            raise ValueError('Weights do not match the single-modality result.')

    if fusion.verification_required != fusion.conflict:
        raise ValueError('Conflict and verification flags are inconsistent.')
    if fusion.verification_required and fusion.prediction != 'Verification Required':
        raise ValueError('Verification Required must be the prediction when verification is required.')
    if fusion.prediction == 'Verification Required' and not fusion.verification_required:
        raise ValueError('Verification Required requires verification_required=true.')
    if fusion.prediction != 'Verification Required' and fusion.conflict:
        raise ValueError('A conflicting result must return Verification Required.')
    if fusion.prediction == 'Verification Required' and fusion.confidence not in (None, 0.0):
        raise ValueError('Verification Required confidence must be null or 0.')

    return fusion


def _text_support(prediction: str) -> str:
    return f'The text model predicted {prediction}; no feature-level text evidence is available.'


def _image_support(prediction: str) -> str:
    return f'The image model predicted {prediction}; no visual explanation is available.'


def explain_fusion_result(payload: dict[str, Any]) -> ExplanationResponse:
    fusion = _validate_fusion_result(payload)
    text_available = fusion.text_prediction is not None
    image_available = fusion.image_prediction is not None
    agreement = text_available and image_available and fusion.text_prediction == fusion.image_prediction and not fusion.conflict

    text_evidence = TextEvidence(
        available=text_available,
        prediction=fusion.text_prediction,
        support=_text_support(fusion.text_prediction) if text_available else 'Text-based explanation is unavailable because no text prediction was provided.',
    )
    image_evidence = ImageEvidence(
        available=image_available,
        prediction=fusion.image_prediction,
        support=_image_support(fusion.image_prediction) if image_available else 'Image-based explanation is unavailable because the image prediction was not provided.',
        visual_explanation_available=False,
    )
    contribution = ModalityContribution(text_weight=fusion.weights['text'], image_weight=fusion.weights['image'])

    if fusion.verification_required:
        summary = (
            'Verification is required because the text and image models produced different predictions. '
            'The system therefore does not automatically select one emergency category.'
        )
        recommended_action = 'Request human verification before assigning a final emergency category.'
    elif agreement:
        summary = f'Both the text and image models predicted {fusion.text_prediction}, so the modalities agree on the detected emergency.'
        recommended_action = None
    elif text_available and image_available:
        summary = 'The modalities produced different predictions, but the fusion result did not meet the configured conflict threshold for verification.'
        recommended_action = None
    elif text_available:
        summary = 'The result is based only on the text modality because no image prediction was available.'
        recommended_action = None
    else:
        summary = 'The result is based only on the image modality because no text prediction was available.'
        recommended_action = None

    return ExplanationResponse(
        prediction=fusion.prediction,
        confidence=fusion.confidence,
        explanation=ExplanationDetails(
            summary=summary,
            text_evidence=text_evidence,
            image_evidence=image_evidence,
            modality_contribution=contribution,
            agreement=agreement,
            conflict=fusion.conflict,
            verification_required=fusion.verification_required,
            recommended_action=recommended_action,
        ),
    )


__all__ = ['explain_fusion_result']