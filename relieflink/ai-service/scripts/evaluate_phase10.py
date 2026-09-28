from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
from PIL import Image, ImageOps
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

CLASS_NAMES = ['Fire', 'Flood', 'Accident']
SERVICE_ROOT = Path(__file__).resolve().parents[1]
TEXT_MODEL_PATH = SERVICE_ROOT / 'models' / 'emergency_text_model.joblib'
TEXT_DATASET_PATH = SERVICE_ROOT / 'data' / 'dev_dataset.json'
IMAGE_MODEL_PATH = SERVICE_ROOT / 'models' / 'image_classifier' / 'model.keras'
IMAGE_DATASET_PATH = SERVICE_ROOT / 'data' / 'image_dataset'
IMAGE_REPORT_PATH = SERVICE_ROOT / 'models' / 'image_classifier' / 'evaluation_report.json'
OUTPUT_PATH = SERVICE_ROOT / 'models' / 'phase10_evaluation_report.json'
IMAGE_SIZE = (224, 224)
SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


def metric_report(labels: list[str], predictions: list[str]) -> dict:
    precision, recall, f1, support = precision_recall_fscore_support(
        labels,
        predictions,
        labels=CLASS_NAMES,
        average=None,
        zero_division=0,
    )
    return {
        'accuracy': round(float(accuracy_score(labels, predictions)), 4),
        'precision_macro': round(float(np.mean(precision)), 4),
        'recall_macro': round(float(np.mean(recall)), 4),
        'f1_macro': round(float(np.mean(f1)), 4),
        'confusion_matrix': confusion_matrix(labels, predictions, labels=CLASS_NAMES).tolist(),
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


def evaluate_text() -> dict:
    samples = json.loads(TEXT_DATASET_PATH.read_text(encoding='utf-8'))
    payload = joblib.load(TEXT_MODEL_PATH)
    vectorizer = payload['vectorizer']
    model = payload['model']
    labels = [sample['label'] for sample in samples]
    predictions = model.predict(vectorizer.transform([sample['text'] for sample in samples])).tolist()
    return {
        'evaluation_scope': 'development dataset used to train the persisted NLP model; not an independent test set',
        'sample_count': len(labels),
        **metric_report(labels, predictions),
    }


def evaluate_images() -> dict:
    import tensorflow as tf

    model = tf.keras.models.load_model(IMAGE_MODEL_PATH, compile=False)
    arrays: list[np.ndarray] = []
    labels: list[str] = []
    counts: dict[str, int] = {}
    for class_name in CLASS_NAMES:
        paths = sorted(path for path in (IMAGE_DATASET_PATH / class_name).iterdir() if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS)
        counts[class_name] = len(paths)
        for image_path in paths:
            with Image.open(image_path) as image:
                image = ImageOps.exif_transpose(image).convert('RGB').resize(IMAGE_SIZE)
                arrays.append(preprocess_input(np.asarray(image, dtype=np.float32)))
                labels.append(class_name)
    probabilities = model.predict(np.stack(arrays), verbose=0)
    predictions = [CLASS_NAMES[int(index)] for index in np.argmax(probabilities, axis=1)]
    persisted_report = json.loads(IMAGE_REPORT_PATH.read_text(encoding='utf-8'))
    return {
        'evaluation_scope': 'all available images, including training images; persisted validation report is retained separately',
        'sample_count': len(labels),
        'image_count_per_class': counts,
        'persisted_validation_report': persisted_report,
        'all_available_image_metrics': metric_report(labels, predictions),
        'scientific_reliability': 'insufficient: only 4 images per class are available and no independent test set exists',
    }


def main() -> None:
    report = {
        'classes': CLASS_NAMES,
        'nlp': evaluate_text(),
        'computer_vision': evaluate_images(),
    }
    OUTPUT_PATH.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
