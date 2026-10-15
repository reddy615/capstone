from collections import Counter

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.text_classifier import CLASS_NAMES, load_training_dataset

client = TestClient(app)


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_fire_prediction():
    response = client.post('/api/v1/predict/text', json={'text': 'fire broke out in the warehouse and smoke is everywhere'})
    assert response.status_code == 200
    payload = response.json()
    assert payload['prediction'] in {'Fire', 'Flood', 'Accident'}
    assert 0 <= payload['confidence'] <= 1
    assert set(payload['probabilities'].keys()) == {'Fire', 'Flood', 'Accident'}


def test_combined_training_dataset_contains_all_validated_records():
    samples = load_training_dataset()

    assert len(samples) == 72
    assert Counter(sample['label'] for sample in samples) == {
        'Fire': 24,
        'Flood': 24,
        'Accident': 24,
    }


@pytest.mark.parametrize(
    ('text', 'expected_class'),
    [
        ('The warehouse is on fire and smoke is filling the building', 'Fire'),
        ('Flood water has covered the highway after heavy rain', 'Flood'),
        ('Two cars collided on the highway and a driver is injured', 'Accident'),
    ],
)
def test_text_prediction_is_compatible_with_fusion_and_explanation(text, expected_class):
    response = client.post('/api/v1/predict/text', json={'text': text})
    assert response.status_code == 200
    prediction = response.json()
    assert prediction['prediction'] == expected_class
    assert set(prediction['probabilities']) == set(CLASS_NAMES)
    assert max(prediction['probabilities'], key=prediction['probabilities'].get) == expected_class
    assert prediction['confidence'] == prediction['probabilities'][expected_class]

    fusion_response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': prediction},
    )
    assert fusion_response.status_code == 200
    fusion = fusion_response.json()
    assert fusion['prediction'] == expected_class
    assert fusion['modality'] == 'text_only'

    explanation_response = client.post('/api/v1/explain', json=fusion)
    assert explanation_response.status_code == 200
    assert explanation_response.json()['prediction'] == expected_class


@pytest.mark.parametrize(
    'text',
    [
        'fire',
        'I would like to order a pizza for dinner',
        'There is water everywhere',
        'I need help',
    ],
)
def test_short_irrelevant_ambiguous_and_low_confidence_text_requires_verification(text):
    response = client.post('/api/v1/predict/text', json={'text': text})

    assert response.status_code == 200
    prediction = response.json()
    assert prediction['verification_required'] is True
    assert prediction['verification_reason'] in {'insufficient_information', 'low_confidence'}
    assert prediction['prediction'] in set(CLASS_NAMES)
    assert set(prediction['probabilities']) == set(CLASS_NAMES)

    fusion_response = client.post(
        '/api/v1/fusion/predict',
        json={'text_prediction': prediction},
    )
    assert fusion_response.status_code == 200
    fusion = fusion_response.json()
    assert fusion['prediction'] == 'Verification Required'
    assert fusion['verification_required'] is True
    assert fusion['conflict'] is False
    assert fusion['text_prediction'] == prediction['prediction']

    explanation_response = client.post('/api/v1/explain', json=fusion)
    assert explanation_response.status_code == 200
    explanation = explanation_response.json()
    assert explanation['prediction'] == 'Verification Required'
    assert explanation['explanation']['verification_required'] is True
    assert 'too short or its classifier confidence is below the configured review threshold' in explanation['explanation']['summary']


def test_invalid_input_rejected():
    response = client.post('/api/v1/predict/text', json={'text': ''})
    assert response.status_code == 400


def test_invalid_json_rejected():
    response = client.post('/api/v1/predict/text', data='not-json')
    assert response.status_code in {400, 422}


def test_whitespace_only_text_is_rejected():
    response = client.post('/api/v1/predict/text', json={'text': '   '})
    assert response.status_code == 400
