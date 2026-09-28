import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _fusion_payload(text='Fire', image='Fire', prediction='Fire', confidence=0.875, **overrides):
    payload = {
        'prediction': prediction,
        'confidence': confidence,
        'probabilities': {'Fire': 0.875, 'Flood': 0.075, 'Accident': 0.05},
        'modality': 'text_and_image',
        'weights': {'text': 0.5, 'image': 0.5},
        'text_prediction': text,
        'image_prediction': image,
        'conflict': False,
        'verification_required': False,
    }
    payload.update(overrides)
    return payload


@pytest.mark.parametrize('emergency_class', ['Fire', 'Flood', 'Accident'])
def test_agreement_for_each_emergency_class(emergency_class):
    payload = _fusion_payload(
        text=emergency_class,
        image=emergency_class,
        prediction=emergency_class,
    )
    response = client.post('/api/v1/explain', json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result['prediction'] == emergency_class
    assert result['explanation']['agreement'] is True
    assert result['explanation']['conflict'] is False
    assert result['explanation']['verification_required'] is False
    assert emergency_class in result['explanation']['summary']


@pytest.mark.parametrize(('text', 'image'), [('Fire', 'Flood'), ('Fire', 'Accident'), ('Flood', 'Accident')])
def test_strong_conflict_requires_verification(text, image):
    payload = _fusion_payload(
        text=text,
        image=image,
        prediction='Verification Required',
        confidence=0.0,
        conflict=True,
        verification_required=True,
    )
    response = client.post('/api/v1/explain', json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result['prediction'] == 'Verification Required'
    assert result['explanation']['conflict'] is True
    assert result['explanation']['verification_required'] is True
    assert result['explanation']['text_evidence']['prediction'] == text
    assert result['explanation']['image_evidence']['prediction'] == image
    assert 'different predictions' in result['explanation']['summary']
    assert result['explanation']['recommended_action']


def test_text_only_explanation_uses_configured_contribution():
    payload = _fusion_payload(
        prediction='Fire',
        confidence=0.85,
        modality='text_only',
        weights={'text': 1.0, 'image': 0.0},
        text_prediction='Fire',
        image_prediction=None,
    )
    result = client.post('/api/v1/explain', json=payload).json()

    assert result['explanation']['summary'].startswith('The result is based only on the text modality')
    assert result['explanation']['modality_contribution'] == {'text_weight': 1.0, 'image_weight': 0.0}
    assert result['explanation']['image_evidence']['available'] is False


def test_image_only_explanation_reports_visual_evidence_unavailable():
    payload = _fusion_payload(
        prediction='Flood',
        confidence=0.9,
        modality='image_only',
        weights={'text': 0.0, 'image': 1.0},
        text_prediction=None,
        image_prediction='Flood',
    )
    result = client.post('/api/v1/explain', json=payload).json()

    assert result['explanation']['summary'].startswith('The result is based only on the image modality')
    assert result['explanation']['image_evidence']['available'] is True
    assert result['explanation']['image_evidence']['visual_explanation_available'] is False
    assert 'visual explanation' in result['explanation']['image_evidence']['support']


def test_no_modality_is_rejected():
    response = client.post('/api/v1/explain', json={})
    assert response.status_code == 400


@pytest.mark.parametrize(
    'payload',
    [
        _fusion_payload(prediction='Earthquake'),
        _fusion_payload(probabilities={'Fire': 0.5, 'Flood': 0.5}),
        _fusion_payload(confidence=1.1),
        _fusion_payload(modality='image_only'),
        _fusion_payload(weights={'text': 0.8, 'image': 0.8}),
        _fusion_payload(verification_required=True),
    ],
)
def test_invalid_fusion_input_is_rejected(payload):
    response = client.post('/api/v1/explain', json=payload)
    assert response.status_code == 400