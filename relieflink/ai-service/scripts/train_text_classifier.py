from __future__ import annotations

import json
import shutil
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import joblib
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split

from app.services.text_classifier import (
    CLASS_NAMES,
    MODEL_PATH,
    fit_text_model,
    load_training_dataset,
)
from app.utils.text_preprocessing import preprocess_text

SERVICE_ROOT = Path(__file__).resolve().parents[1]
METADATA_PATH = SERVICE_ROOT / 'models' / 'text_training_metadata.json'
RANDOM_STATE = 42
TEST_SIZE = 0.2


def _metrics(labels: list[str], predictions: list[str]) -> dict:
    precision, recall, f1, support = precision_recall_fscore_support(
        labels,
        predictions,
        labels=CLASS_NAMES,
        average=None,
        zero_division=0,
    )
    return {
        'accuracy': round(float(accuracy_score(labels, predictions)), 4),
        'precision_macro': round(float(precision.mean()), 4),
        'recall_macro': round(float(recall.mean()), 4),
        'f1_macro': round(float(f1.mean()), 4),
        'confusion_matrix': confusion_matrix(labels, predictions, labels=CLASS_NAMES).tolist(),
        'confusion_matrix_labels': CLASS_NAMES,
        'per_class': {
            class_name: {
                'precision': round(float(precision[index]), 4),
                'recall': round(float(recall[index]), 4),
                'f1': round(float(f1[index]), 4),
                'support': int(support[index]),
            }
            for index, class_name in enumerate(CLASS_NAMES)
        },
    }


def _write_json_atomically(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode='w',
        encoding='utf-8',
        dir=path.parent,
        delete=False,
        suffix='.tmp',
    ) as file:
        temporary_path = Path(file.name)
        json.dump(payload, file, indent=2)
        file.write('\n')
    temporary_path.replace(path)


def _write_model_atomically(payload: dict, backup_path: Path) -> None:
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=MODEL_PATH.parent, delete=False, suffix='.tmp') as file:
            temporary_path = Path(file.name)
        joblib.dump(payload, temporary_path)
        if MODEL_PATH.exists():
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(MODEL_PATH, backup_path)
        temporary_path.replace(MODEL_PATH)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def train() -> dict:
    samples = load_training_dataset()
    labels = [sample['label'] for sample in samples]
    class_counts = Counter(labels)
    if set(class_counts) != set(CLASS_NAMES) or min(class_counts.values()) < 2:
        raise ValueError('A stratified train/evaluation split requires at least two records per class.')

    train_samples, evaluation_samples = train_test_split(
        samples,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    evaluation_vectorizer, evaluation_model = fit_text_model(train_samples)
    evaluation_texts = [
        preprocess_text(sample['text'])
        for sample in evaluation_samples
    ]
    evaluation_labels = [sample['label'] for sample in evaluation_samples]
    evaluation_predictions = evaluation_model.predict(
        evaluation_vectorizer.transform(evaluation_texts)
    ).tolist()
    metrics = _metrics(evaluation_labels, evaluation_predictions)

    vectorizer, model = fit_text_model(samples)
    trained_at = datetime.now(timezone.utc).isoformat()
    metadata = {
        'trained_at_utc': trained_at,
        'dataset_sources': [
            str((SERVICE_ROOT / 'data' / 'dev_dataset.json').relative_to(SERVICE_ROOT)),
            str((SERVICE_ROOT / 'data' / 'image_dataset' / 'datasets' / 'text' / 'emergency_text.csv').relative_to(SERVICE_ROOT)),
        ],
        'total_valid_records': len(samples),
        'class_distribution': {class_name: class_counts[class_name] for class_name in CLASS_NAMES},
        'evaluation_split': {
            'strategy': 'stratified train_test_split',
            'random_state': RANDOM_STATE,
            'evaluation_fraction': TEST_SIZE,
            'training_records_for_evaluation': len(train_samples),
            'evaluation_records': len(evaluation_samples),
            'final_model_training_records': len(samples),
        },
        'evaluation_scope': (
            'Held-out stratified records evaluated before final model refit on all valid records; '
            'normalized exact duplicates were rejected before splitting.'
        ),
        'evaluation_metrics': metrics,
        'limitations': [
            'The 15-record holdout is small; its metrics have substantial sampling uncertainty.',
            'Records come from two small project datasets and do not establish performance on independent real-world reports.',
        ],
    }
    backup_path = MODEL_PATH.parent / 'backups' / (
        f'emergency_text_model.pre-retrain-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}.joblib'
    )
    _write_model_atomically(
        {'vectorizer': vectorizer, 'model': model, 'training_metadata': metadata},
        backup_path,
    )
    _write_json_atomically(METADATA_PATH, metadata)
    return {
        'model_path': str(MODEL_PATH),
        'backup_path': str(backup_path) if backup_path.exists() else None,
        'metadata_path': str(METADATA_PATH),
        **metadata,
    }


if __name__ == '__main__':
    print(json.dumps(train(), indent=2))
