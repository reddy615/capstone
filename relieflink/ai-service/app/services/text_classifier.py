import csv
import json
from collections import defaultdict
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

from app.config import MINIMUM_TEXT_WORDS, TEXT_VERIFICATION_THRESHOLD
from app.utils.text_preprocessing import preprocess_text

CLASS_NAMES = ['Fire', 'Flood', 'Accident']
MODEL_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_PATH = MODEL_DIR / 'models' / 'emergency_text_model.joblib'
DATASET_PATH = MODEL_DIR / 'data' / 'dev_dataset.json'
NEW_DATASET_PATH = MODEL_DIR / 'data' / 'image_dataset' / 'datasets' / 'text' / 'emergency_text.csv'
_LABELS_BY_CASEFOLD = {class_name.casefold(): class_name for class_name in CLASS_NAMES}


def load_training_dataset() -> list[dict[str, str]]:
    samples: list[dict[str, str]] = []
    descriptions: dict[str, list[tuple[str, str, str]]] = defaultdict(list)

    def add_sample(text: object, label: object, source: str, record_number: int) -> None:
        location = f'{source} record {record_number}'
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f'Emergency description is missing or invalid at {location}.')
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f'Emergency label is missing or invalid at {location}.')

        canonical_label = _LABELS_BY_CASEFOLD.get(label.strip().casefold())
        if canonical_label is None:
            raise ValueError(f'Unsupported emergency label {label!r} at {location}.')

        cleaned_text = preprocess_text(text)
        if not cleaned_text:
            raise ValueError(f'Emergency description is empty after preprocessing at {location}.')

        descriptions[cleaned_text].append((canonical_label, location, text.strip()))
        samples.append({'text': text.strip(), 'label': canonical_label})

    if not DATASET_PATH.exists():
        raise FileNotFoundError(f'Development dataset not found at {DATASET_PATH}')
    with DATASET_PATH.open('r', encoding='utf-8') as file:
        dev_samples = json.load(file)
    if not isinstance(dev_samples, list):
        raise ValueError(f'Development dataset must contain a list: {DATASET_PATH}')
    for index, sample in enumerate(dev_samples, start=1):
        if not isinstance(sample, dict):
            raise ValueError(f'Development dataset record {index} must be an object.')
        add_sample(sample.get('text'), sample.get('label'), str(DATASET_PATH), index)

    if not NEW_DATASET_PATH.exists():
        raise FileNotFoundError(f'New emergency text dataset not found at {NEW_DATASET_PATH}')
    with NEW_DATASET_PATH.open('r', encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        if reader.fieldnames is None or set(reader.fieldnames) != {'text', 'label'}:
            raise ValueError(
                f'Expected CSV columns "text" and "label" in {NEW_DATASET_PATH}; '
                f'found {reader.fieldnames!r}.'
            )
        for index, sample in enumerate(reader, start=2):
            if None in sample:
                raise ValueError(f'Unexpected extra CSV fields at {NEW_DATASET_PATH} line {index}.')
            add_sample(sample.get('text'), sample.get('label'), str(NEW_DATASET_PATH), index - 1)

    duplicate_groups = [entries for entries in descriptions.values() if len(entries) > 1]
    if duplicate_groups:
        details = '; '.join(
            ', '.join(f'{location} ({label})' for label, location, _ in entries)
            for entries in duplicate_groups
        )
        raise ValueError(f'Duplicate normalized emergency descriptions found: {details}')

    observed_classes = {sample['label'] for sample in samples}
    if observed_classes != set(CLASS_NAMES):
        missing = sorted(set(CLASS_NAMES) - observed_classes)
        raise ValueError(f'Training data must include all three classes; missing: {missing}.')

    return samples


def fit_text_model(samples: list[dict[str, str]]) -> tuple[TfidfVectorizer, LogisticRegression]:
    texts = [preprocess_text(item['text']) for item in samples]
    labels = [item['label'] for item in samples]

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    features = vectorizer.fit_transform(texts)

    model = LogisticRegression(max_iter=1000, multi_class='auto', solver='lbfgs')
    model.fit(features, labels)
    return vectorizer, model


def train_model() -> tuple[TfidfVectorizer, LogisticRegression]:
    samples = load_training_dataset()
    vectorizer, model = fit_text_model(samples)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({'vectorizer': vectorizer, 'model': model}, MODEL_PATH)
    return vectorizer, model


def load_model() -> tuple[TfidfVectorizer, LogisticRegression]:
    if MODEL_PATH.exists():
        payload = joblib.load(MODEL_PATH)
        return payload['vectorizer'], payload['model']

    return train_model()


def evaluate_model() -> dict:
    samples = load_training_dataset()
    texts = [preprocess_text(item['text']) for item in samples]
    labels = [item['label'] for item in samples]

    vectorizer, model = train_model()
    transformed = vectorizer.transform(texts)
    predictions = model.predict(transformed)

    return {
        'evaluation_scope': 'combined training data; not an independent evaluation set',
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
    model_classes = [str(class_name) for class_name in model.classes_]

    probability_map = {
        class_name: float(probabilities[idx])
        for idx, class_name in enumerate(model_classes)
    }
    if set(probability_map) != set(CLASS_NAMES):
        raise ValueError('Text model output does not match the expected three emergency classes.')

    prediction = model_classes[int(np.argmax(probabilities))]
    confidence = probability_map[prediction]
    ordered_probability_map = {class_name: probability_map[class_name] for class_name in CLASS_NAMES}
    if len(cleaned.split()) < MINIMUM_TEXT_WORDS:
        verification_reason = 'insufficient_information'
    elif confidence < TEXT_VERIFICATION_THRESHOLD:
        verification_reason = 'low_confidence'
    else:
        verification_reason = None

    return {
        'prediction': prediction,
        'confidence': round(confidence, 4),
        'probabilities': {key: round(value, 4) for key, value in ordered_probability_map.items()},
        'verification_required': verification_reason is not None,
        'verification_reason': verification_reason,
    }
