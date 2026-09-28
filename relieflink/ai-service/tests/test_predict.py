from fastapi.testclient import TestClient

from app.main import app

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


def test_invalid_input_rejected():
    response = client.post('/api/v1/predict/text', json={'text': ''})
    assert response.status_code == 400


def test_invalid_json_rejected():
    response = client.post('/api/v1/predict/text', data='not-json')
    assert response.status_code in {400, 422}
