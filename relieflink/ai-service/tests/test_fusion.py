import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import fusion_service

client = TestClient(app)


def _payload(text_pred=None, image_pred=None):
    return {
        'text_prediction': text_pred,
        'image_prediction': image_pred,
    }


def test_fire_fire_agreement():
    payload = _payload(
        text_pred={
            'prediction': 'Fire',
            'confidence': 0.85,
            'probabilities': {'Fire': 0.85, 'Flood': 0.10, 'Accident': 0.05},
        },
        image_pred={
            'prediction': 'Fire',
            'confidence': 0.90,
            'probabilities': {'Fire': 0.90, 'Flood': 0.05, 'Accident': 0.05},
        },
    )
    response = client.post('/api/v1/fusion/predict', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['prediction'] == 'Fire'
    assert data['conflict'] is False
    assert data['verification_required'] is False
    assert data['modality'] == 'text_and_image'
    assert data['weights'] == {'text': 0.5, 'image': 0.5}
    assert abs(sum(data['probabilities'].values()) - 1.0) < 1e-6


def test_flood_flood_agreement():
    payload = _payload(
        text_pred={'prediction': 'Flood', 'confidence': 0.80, 'probabilities': {'Fire': 0.10, 'Flood': 0.80, 'Accident': 0.10}},
        image_pred={'prediction': 'Flood', 'confidence': 0.90, 'probabilities': {'Fire': 0.05, 'Flood': 0.90, 'Accident': 0.05}},
    )
    response = client.post('/api/v1/fusion/predict', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['prediction'] == 'Flood'
    assert data['conflict'] is False
    assert data['verification_required'] is False


def test_accident_accident_agreement():
    payload = _payload(
        text_pred={'prediction': 'Accident', 'confidence': 0.80, 'probabilities': {'Fire': 0.10, 'Flood': 0.10, 'Accident': 0.80}},
        image_pred={'prediction': 'Accident', 'confidence': 0.85, 'probabilities': {'Fire': 0.05, 'Flood': 0.10, 'Accident': 0.85}},
    )
    response = client.post('/api/v1/fusion/predict', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['prediction'] == 'Accident'
    assert data['conflict'] is False
    assert data['verification_required'] is False


def test_strong_fire_flood_conflict():
    payload = _payload(
        text_pred={'prediction': 'Fire', 'confidence': 0.85, 'probabilities': {'Fire': 0.85, 'Flood': 0.10, 'Accident': 0.05}},
        image_pred={'prediction': 'Flood', 'confidence': 0.88, 'probabilities': {'Fire': 0.10, 'Flood': 0.88, 'Accident': 0.02}},
    )
    response = client.post('/api/v1/fusion/predict', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['prediction'] == 'Verification Required'
    assert data['conflict'] is True
    assert data['verification_required'] is True


def test_weak_disagreement_not_conflict():
    payload = _payload(
        text_pred={'prediction': 'Fire', 'confidence': 0.55, 'probabilities': {'Fire': 0.55, 'Flood': 0.30, 'Accident': 0.15}},
        image_pred={'prediction': 'Flood', 'confidence': 0.58, 'probabilities': {'Fire': 0.30, 'Flood': 0.58, 'Accident': 0.12}},
    )
    response = client.post('/api/v1/fusion/predict', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['conflict'] is False
    assert data['verification_required'] is False


def test_text_only_fusion():
    payload = _payload(
        text_pred={'prediction': 'Fire', 'confidence': 0.85, 'probabilities': {'Fire': 0.85, 'Flood': 0.10, 'Accident': 0.05}},
    )
    response = client.post('/api/v1/fusion/predict', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['prediction'] == 'Fire'
    assert data['modality'] == 'text_only'
    assert data['weights'] == {'text': 1.0, 'image': 0.0}
    assert data['conflict'] is False
    assert data['verification_required'] is False


def test_image_only_fusion():
    payload = _payload(
        image_pred={'prediction': 'Flood', 'confidence': 0.90, 'probabilities': {'Fire': 0.05, 'Flood': 0.90, 'Accident': 0.05}},
    )
    response = client.post('/api/v1/fusion/predict', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['prediction'] == 'Flood'
    assert data['modality'] == 'image_only'
    assert data['weights'] == {'text': 0.0, 'image': 1.0}
    assert data['conflict'] is False
    assert data['verification_required'] is False


def test_no_modality_rejected():
    response = client.post('/api/v1/fusion/predict', json={'text_prediction': None, 'image_prediction': None})
    assert response.status_code in {400, 422}


def test_invalid_class_rejected():
    response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': {'prediction': 'Earthquake', 'confidence': 0.8, 'probabilities': {'Fire': 0.8, 'Flood': 0.1, 'Accident': 0.1}}},
    )
    assert response.status_code in {400, 422}


def test_missing_probability_rejected():
    response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': {'prediction': 'Fire', 'confidence': 0.8, 'probabilities': {'Fire': 0.8, 'Flood': 0.2}}},
    )
    assert response.status_code in {400, 422}


def test_extra_probability_class_rejected():
    response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': {'prediction': 'Fire', 'confidence': 0.8, 'probabilities': {'Fire': 0.8, 'Flood': 0.1, 'Accident': 0.05, 'Other': 0.05}}},
    )
    assert response.status_code in {400, 422}


def test_negative_probability_rejected():
    response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': {'prediction': 'Fire', 'confidence': 0.8, 'probabilities': {'Fire': -0.2, 'Flood': 0.6, 'Accident': 0.6}}},
    )
    assert response.status_code in {400, 422}


def test_probability_above_one_rejected():
    response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': {'prediction': 'Fire', 'confidence': 0.8, 'probabilities': {'Fire': 1.2, 'Flood': -0.1, 'Accident': -0.1}}},
    )
    assert response.status_code in {400, 422}


def test_malformed_probability_values_rejected():
    response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': {'prediction': 'Fire', 'confidence': 0.8, 'probabilities': {'Fire': 'NaN', 'Flood': 0.1, 'Accident': 0.9}}},
    )
    assert response.status_code in {400, 422}


def test_confidence_outside_range_rejected():
    response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': {'prediction': 'Fire', 'confidence': 1.5, 'probabilities': {'Fire': 0.8, 'Flood': 0.1, 'Accident': 0.1}}},
    )
    assert response.status_code in {400, 422}


def test_probability_normalization_applied():
    result = fusion_service.fuse_predictions(
        text_prediction={'prediction': 'Fire', 'confidence': 0.8, 'probabilities': {'Fire': 0.8, 'Flood': 0.1, 'Accident': 0.05}},
        image_prediction={'prediction': 'Fire', 'confidence': 0.9, 'probabilities': {'Fire': 0.9, 'Flood': 0.05, 'Accident': 0.05}},
    )
    assert result['prediction'] == 'Fire'
    assert abs(sum(result['probabilities'].values()) - 1.0) < 1e-6


def test_configurable_weights_and_threshold():
    result = fusion_service.fuse_predictions(
        text_prediction={'prediction': 'Fire', 'confidence': 0.85, 'probabilities': {'Fire': 0.85, 'Flood': 0.10, 'Accident': 0.05}},
        image_prediction={'prediction': 'Flood', 'confidence': 0.88, 'probabilities': {'Fire': 0.10, 'Flood': 0.88, 'Accident': 0.02}},
        text_weight=0.7,
        image_weight=0.3,
        conflict_confidence_threshold=0.95,
    )
    assert result['conflict'] is False
    assert result['verification_required'] is False
    assert result['weights'] == {'text': 0.7, 'image': 0.3}
