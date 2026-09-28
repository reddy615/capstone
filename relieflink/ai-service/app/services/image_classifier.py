from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from app.utils.image_preprocessing import preprocess_image

CLASS_NAMES = ['Fire', 'Flood', 'Accident']
MODEL_DIR = Path(__file__).resolve().parent.parent.parent / 'models' / 'image_classifier'
MODEL_PATH = MODEL_DIR / 'model.keras'
LEGACY_MODEL_PATH = MODEL_DIR / 'model.h5'
LABELS_PATH = MODEL_DIR / 'class_labels.json'


class ImageClassifierUnavailableError(RuntimeError):
    pass


def _load_labels() -> list[str]:
    if LABELS_PATH.exists():
        with LABELS_PATH.open('r', encoding='utf-8') as file:
            labels = json.load(file)
        if isinstance(labels, list) and labels:
            normalized = [str(label) for label in labels]
            if normalized == CLASS_NAMES:
                return normalized
    return CLASS_NAMES


def model_available() -> bool:
    return (MODEL_PATH.exists() or LEGACY_MODEL_PATH.exists()) and LABELS_PATH.exists()


def _load_model():
    try:
        import tensorflow as tf
    except ImportError as exc:
        raise RuntimeError('TensorFlow is required for image inference.') from exc

    model_file = MODEL_PATH if MODEL_PATH.exists() else LEGACY_MODEL_PATH
    if not model_file.exists():
        raise FileNotFoundError('Image model file not found.')

    return tf.keras.models.load_model(model_file, compile=False)


def predict_image(file_obj, filename: str | None = None) -> dict:
    if not model_available():
        raise ImageClassifierUnavailableError('Image classification model is not available.')

    try:
        import tensorflow as tf
        from tensorflow.keras.applications import mobilenet_v2
    except ImportError as exc:
        raise RuntimeError('TensorFlow is required for image inference.') from exc

    image_array = preprocess_image(file_obj, filename=filename, image_size=(224, 224))
    image_batch = np.expand_dims(image_array, axis=0)
    image_batch = mobilenet_v2.preprocess_input(image_batch)

    labels = _load_labels()
    model = _load_model()

    try:
        probabilities = model.predict(image_batch, verbose=0)[0]
    except Exception as exc:
        raise RuntimeError('Image inference failed.') from exc

    if len(probabilities) != len(labels):
        raise ValueError('Image model output does not match the expected three emergency classes.')

    probabilities = np.asarray(probabilities, dtype=np.float64)
    prediction_index = int(np.argmax(probabilities))
    prediction = labels[prediction_index]
    confidence = float(probabilities[prediction_index])

    probability_map = {label: float(probabilities[index]) for index, label in enumerate(labels)}
    ordered_probability_map = {class_name: probability_map[class_name] for class_name in CLASS_NAMES}

    return {
        'prediction': prediction,
        'confidence': round(confidence, 6),
        'probabilities': {key: round(value, 6) for key, value in ordered_probability_map.items()},
    }
