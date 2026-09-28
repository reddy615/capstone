import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

from app.utils.text_preprocessing import preprocess_text

CLASS_NAMES = ['Fire', 'Flood', 'Accident']
MODEL_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_PATH = MODEL_DIR / 'models' / 'emergency_text_model.joblib'
DATASET_PATH = MODEL_DIR / 'data' / 'dev_dataset.json'


def _load_dev_dataset() -> list[dict]:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f'Development dataset not found at {DATASET_PATH}')

    with DATASET_PATH.open('r', encoding='utf-8') as file:
        return json.load(file)


def train_model() -> tuple[TfidfVectorizer, LogisticRegression]:
    samples = _load_dev_dataset()
    texts = [preprocess_text(item['text']) for item in samples]
    labels = [item['label'] for item in samples]

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    features = vectorizer.fit_transform(texts)

    model = LogisticRegression(max_iter=1000, multi_class='auto', solver='lbfgs')
    model.fit(features, labels)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({'vectorizer': vectorizer, 'model': model}, MODEL_PATH)
    return vectorizer, model


def load_model() -> tuple[TfidfVectorizer, LogisticRegression]:
    if MODEL_PATH.exists():
        payload = joblib.load(MODEL_PATH)
        return payload['vectorizer'], payload['model']

    return train_model()


def evaluate_model() -> dict:
    samples = _load_dev_dataset()
    texts = [preprocess_text(item['text']) for item in samples]
    labels = [item['label'] for item in samples]

    vectorizer, model = train_model()
    transformed = vectorizer.transform(texts)
    predictions = model.predict(transformed)

    return {
        'accuracy': round(float(accuracy_score(labels, predictions)), 4),
        'precision_macro': round(float(precision_score(labels, predictions, average='macro', zero_division=0)), 4),
        'recall_macro': round(float(recall_score(labels, predictions, average='macro', zero_division=0)), 4),
        'f1_macro': round(float(f1_score(labels, predictions, average='macro', zero_division=0)), 4),
    }


def predict_text(text: str) -> dict:
    if not text or not text.strip():
        raise ValueError('Text input is required.')

    vectorizer, model = load_model()
    cleaned = preprocess_text(text)
    features = vectorizer.transform([cleaned])
    probabilities = model.predict_proba(features)[0]
    prediction_index = int(np.argmax(probabilities))
    prediction = CLASS_NAMES[prediction_index]
    confidence = float(probabilities[prediction_index])

    probability_map = {
        class_name: float(probabilities[idx])
        for idx, class_name in enumerate(CLASS_NAMES)
    }

    return {
        'prediction': prediction,
        'confidence': round(confidence, 4),
        'probabilities': {key: round(value, 4) for key, value in probability_map.items()},
    }
