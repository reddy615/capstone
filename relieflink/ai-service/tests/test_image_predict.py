from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_image_endpoint_exists():
    response = client.post('/api/v1/predict/image')
    assert response.status_code in {400, 415, 503}


def test_missing_image_rejected():
    response = client.post('/api/v1/predict/image', files={})
    assert response.status_code in {400, 422, 503}


def test_invalid_file_type_rejected():
    response = client.post(
        '/api/v1/predict/image',
        files={'image': ('not_an_image.txt', b'not really an image', 'text/plain')},
    )
    assert response.status_code in {400, 415, 503}


def test_corrupted_image_handled_safely():
    response = client.post(
        '/api/v1/predict/image',
        files={'image': ('broken.png', b'not-a-valid-image', 'image/png')},
    )
    assert response.status_code in {400, 415, 503}


def test_available_model_returns_prediction():
    model_path = Path(__file__).resolve().parents[1] / 'models' / 'image_classifier' / 'model.keras'
    image_path = Path(__file__).resolve().parents[1] / 'data' / 'image_dataset' / 'Fire' / 'Fire001.jpg'
    assert model_path.exists()
    assert image_path.exists()

    with image_path.open('rb') as image_file:
        response = client.post(
            '/api/v1/predict/image',
            files={'image': (image_path.name, image_file, 'image/jpeg')},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload['prediction'] in {'Fire', 'Flood', 'Accident'}
    assert 0 <= payload['confidence'] <= 1
    assert set(payload['probabilities']) == {'Fire', 'Flood', 'Accident'}
