from __future__ import annotations

import math
from typing import Any

from app.services.image_classifier import ImageClassifierUnavailableError

CLASS_NAMES = ['Fire', 'Flood', 'Accident']
TEXT_WEIGHT = 0.5
IMAGE_WEIGHT = 0.5
CONFLICT_CONFIDENCE_THRESHOLD = 0.70


def _normalize_probabilities(probabilities: dict[str, float]) -> dict[str, float]:
    if not isinstance(probabilities, dict) or not probabilities:
        raise ValueError('Probabilities are required for each class.')

    if set(probabilities.keys()) != set(CLASS_NAMES):
        extra = set(probabilities.keys()) - set(CLASS_NAMES)
        missing = set(CLASS_NAMES) - set(probabilities.keys())
        if extra or missing:
            raise ValueError('Probabilities must contain exactly Fire, Flood, and Accident.')

    normalized: dict[str, float] = {}
    for class_name in CLASS_NAMES:
        value = probabilities[class_name]
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValueError(f'Probability for {class_name} must be numeric.')
        if math.isnan(value) or math.isinf(value):
            raise ValueError(f'Probability for {class_name} is invalid.')
        if value < 0 or value > 1:
            raise ValueError(f'Probability for {class_name} must be between 0 and 1.')
        normalized[class_name] = float(value)

    total = sum(normalized.values())
    if total <= 0:
        raise ValueError('Probability distribution must have a positive total.')
    if not math.isclose(total, 1.0, abs_tol=1e-3):
        normalized = {key: value / total for key, value in normalized.items()}
    return normalized


def _validate_prediction_payload(prediction: dict[str, Any] | None, label: str) -> dict[str, Any]:
    if prediction is None:
        return prediction

    if not isinstance(prediction, dict):
        raise ValueError(f'{label} prediction must be an object.')

    if 'prediction' not in prediction or prediction['prediction'] not in CLASS_NAMES:
        raise ValueError(f'{label} prediction must be one of: {CLASS_NAMES}')

    if 'confidence' not in prediction:
        raise ValueError(f'{label} confidence is required.')
    confidence = prediction['confidence']
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        raise ValueError(f'{label} confidence must be numeric.')
    if math.isnan(confidence) or math.isinf(confidence) or confidence < 0 or confidence > 1:
        raise ValueError(f'{label} confidence must be between 0 and 1.')

    if 'probabilities' not in prediction:
        raise ValueError(f'{label} probabilities are required.')
    normalized = _normalize_probabilities(prediction['probabilities'])
    prediction = dict(prediction)
    prediction['probabilities'] = normalized
    return prediction


def _highest_class(probabilities: dict[str, float]) -> str:
    return max(probabilities.items(), key=lambda item: item[1])[0]


def _resolve_modality(text_prediction: dict[str, Any] | None, image_prediction: dict[str, Any] | None) -> tuple[str, float, float]:
    if text_prediction is not None and image_prediction is not None:
        return 'text_and_image', TEXT_WEIGHT, IMAGE_WEIGHT
    if text_prediction is not None and image_prediction is None:
        return 'text_only', 1.0, 0.0
    if text_prediction is None and image_prediction is not None:
        return 'image_only', 0.0, 1.0
    raise ValueError('At least one modality must be provided for fusion.')


def _detect_conflict(
    text_prediction: dict[str, Any] | None,
    image_prediction: dict[str, Any] | None,
    conflict_threshold: float = CONFLICT_CONFIDENCE_THRESHOLD,
) -> tuple[bool, bool]:
    if text_prediction is None or image_prediction is None:
        return False, False

    text_top = _highest_class(text_prediction['probabilities'])
    image_top = _highest_class(image_prediction['probabilities'])
    if text_top == image_top:
        return False, False

    if float(text_prediction['confidence']) >= conflict_threshold and float(image_prediction['confidence']) >= conflict_threshold:
        return True, True
    return False, False


def fuse_predictions(
    text_prediction: dict[str, Any] | None,
    image_prediction: dict[str, Any] | None,
    text_weight: float = TEXT_WEIGHT,
    image_weight: float = IMAGE_WEIGHT,
    conflict_confidence_threshold: float = CONFLICT_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    if text_prediction is None and image_prediction is None:
        raise ValueError('At least one modality must be provided for fusion.')

    validated_text = _validate_prediction_payload(text_prediction, 'text') if text_prediction is not None else None
    validated_image = _validate_prediction_payload(image_prediction, 'image') if image_prediction is not None else None

    modality, effective_text_weight, effective_image_weight = _resolve_modality(validated_text, validated_image)
    normalized_text_weight = float(text_weight)
    normalized_image_weight = float(image_weight)
    if normalized_text_weight < 0 or normalized_image_weight < 0:
        raise ValueError('Fusion weights must be non-negative.')

    if validated_text is None and validated_image is not None:
        probabilities = dict(validated_image['probabilities'])
        final_prediction = _highest_class(probabilities)
        confidence = float(validated_image['confidence'])
        conflict = False
        verification_required = False
        return {
            'prediction': final_prediction,
            'confidence': round(confidence, 6),
            'probabilities': {key: round(value, 6) for key, value in probabilities.items()},
            'modality': modality,
            'weights': {'text': 0.0, 'image': 1.0},
            'text_prediction': None,
            'image_prediction': validated_image['prediction'],
            'conflict': conflict,
            'verification_required': verification_required,
        }

    if validated_text is not None and validated_image is None:
        probabilities = dict(validated_text['probabilities'])
        final_prediction = _highest_class(probabilities)
        confidence = float(validated_text['confidence'])
        return {
            'prediction': final_prediction,
            'confidence': round(confidence, 6),
            'probabilities': {key: round(value, 6) for key, value in probabilities.items()},
            'modality': modality,
            'weights': {'text': 1.0, 'image': 0.0},
            'text_prediction': validated_text['prediction'],
            'image_prediction': None,
            'conflict': False,
            'verification_required': False,
        }

    if validated_text is None or validated_image is None:
        raise ValueError('Both modalities must be present for fusion.')

    text_probabilities = dict(validated_text['probabilities'])
    image_probabilities = dict(validated_image['probabilities'])

    fused = {
        class_name: (normalized_text_weight * text_probabilities[class_name]) + (normalized_image_weight * image_probabilities[class_name])
        for class_name in CLASS_NAMES
    }
    total = sum(fused.values())
    if total <= 0:
        raise ValueError('Fused probability distribution must have a positive total.')
    fused = {key: value / total for key, value in fused.items()}

    conflict, verification_required = _detect_conflict(validated_text, validated_image, conflict_threshold=conflict_confidence_threshold)
    if conflict and verification_required:
        return {
            'prediction': 'Verification Required',
            'confidence': 0.0,
            'probabilities': {key: round(value, 6) for key, value in fused.items()},
            'modality': modality,
            'weights': {'text': round(normalized_text_weight, 6), 'image': round(normalized_image_weight, 6)},
            'text_prediction': validated_text['prediction'],
            'image_prediction': validated_image['prediction'],
            'conflict': True,
            'verification_required': True,
        }

    final_prediction = _highest_class(fused)
    confidence = float(fused[final_prediction])
    return {
        'prediction': final_prediction,
        'confidence': round(confidence, 6),
        'probabilities': {key: round(value, 6) for key, value in fused.items()},
        'modality': modality,
        'weights': {'text': round(normalized_text_weight, 6), 'image': round(normalized_image_weight, 6)},
        'text_prediction': validated_text['prediction'],
        'image_prediction': validated_image['prediction'],
        'conflict': False,
        'verification_required': False,
    }


__all__ = ['CLASS_NAMES', 'TEXT_WEIGHT', 'IMAGE_WEIGHT', 'CONFLICT_CONFIDENCE_THRESHOLD', 'fuse_predictions']
