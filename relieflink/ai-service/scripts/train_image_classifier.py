from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
import tensorflow as tf
from PIL import Image, ImageOps
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from tensorflow.keras import layers
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.preprocessing.image import ImageDataGenerator

CLASS_NAMES = ['Fire', 'Flood', 'Accident']
DATASET_ROOT = Path(__file__).resolve().parents[1] / 'data' / 'image_dataset'
MODEL_DIR = Path(__file__).resolve().parents[1] / 'models' / 'image_classifier'
MODEL_PATH = MODEL_DIR / 'model.keras'
LABELS_PATH = MODEL_DIR / 'class_labels.json'
REPORT_PATH = MODEL_DIR / 'evaluation_report.json'
METADATA_PATH = MODEL_DIR / 'training_metadata.json'
IMAGE_SIZE = (224, 224)
SEED = 42


def _ensure_dataset_directories() -> dict[str, Path]:
    directories = {label: DATASET_ROOT / label for label in CLASS_NAMES}
    actual_directories = {path.name for path in DATASET_ROOT.iterdir() if path.is_dir()} if DATASET_ROOT.exists() else set()
    unexpected = sorted(actual_directories - set(CLASS_NAMES))
    if unexpected:
        raise ValueError(f'Unexpected image dataset classes: {unexpected}')
    missing = [name for name, path in directories.items() if not path.exists()]
    if missing:
        raise FileNotFoundError(f'Missing required image dataset directories: {missing}')

    for label, path in directories.items():
        images = sorted(path.glob('*'))
        if not images:
            raise ValueError(f'Image dataset directory is empty for class {label}: {path}')
    return directories


def _load_image_files() -> dict[str, list[Path]]:
    directories = _ensure_dataset_directories()
    files_by_class: dict[str, list[Path]] = {}
    for label, directory in directories.items():
        candidates = [
            item for item in directory.iterdir()
            if item.is_file() and item.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}
        ]
        images = []
        for image_path in sorted(candidates):
            try:
                with Image.open(image_path) as image:
                    image.verify()
                with Image.open(image_path) as image:
                    image.load()
            except (OSError, ValueError) as exc:
                raise ValueError(f'Corrupt or unreadable image: {image_path.name}: {exc}') from exc
            images.append(image_path)
        files_by_class[label] = images

    if any(len(files) < 2 for files in files_by_class.values()):
        raise ValueError('Insufficient dataset for reliable training. Need at least 2 images per class.')

    return files_by_class


def _build_model() -> tf.keras.Model:
    base_model = MobileNetV2(
        weights='imagenet',
        include_top=False,
        input_shape=(224, 224, 3),
    )
    base_model.trainable = False

    inputs = tf.keras.Input(shape=(224, 224, 3))
    x = base_model(inputs, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dense(128, activation='relu')(x)
    x = tf.keras.layers.Dropout(0.2)(x)
    outputs = tf.keras.layers.Dense(len(CLASS_NAMES), activation='softmax', name='emergency_classes')(x)
    return tf.keras.Model(inputs=inputs, outputs=outputs)


def _prepare_dataset() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    random.seed(SEED)
    np.random.seed(SEED)
    tf.random.set_seed(SEED)

    files_by_class = _load_image_files()
    images: list[np.ndarray] = []
    labels: list[int] = []

    for label_index, label in enumerate(CLASS_NAMES):
        for image_path in files_by_class[label]:
            with Image.open(image_path) as image:
                image = ImageOps.exif_transpose(image).convert('RGB')
                image = image.resize(IMAGE_SIZE)
                array = preprocess_input(np.asarray(image, dtype=np.float32))
                images.append(array)
                labels.append(label_index)

    items = list(zip(images, labels))
    random.shuffle(items)
    shuffled_images, shuffled_labels = zip(*items) if items else ([], [])

    x = np.stack(shuffled_images, axis=0) if shuffled_images else np.empty((0, 224, 224, 3), dtype=np.float32)
    y = np.asarray(shuffled_labels, dtype=np.int32)

    if len(x) < 2:
        raise ValueError('Insufficient dataset for reliable training.')

    train_indices: list[int] = []
    val_indices: list[int] = []
    for label_index in range(len(CLASS_NAMES)):
        class_indices = [index for index, label in enumerate(y) if label == label_index]
        split_index = max(1, int(len(class_indices) * 0.8))
        train_indices.extend(class_indices[:split_index])
        val_indices.extend(class_indices[split_index:])
    train_x, val_x = x[train_indices], x[val_indices]
    train_y, val_y = y[train_indices], y[val_indices]
    return train_x, train_y, val_x, val_y


def train_image_classifier() -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    LABELS_PATH.write_text(json.dumps(CLASS_NAMES, indent=2), encoding='utf-8')

    try:
        train_x, train_y, val_x, val_y = _prepare_dataset()
    except (FileNotFoundError, ValueError) as exc:
        report = {
            'status': 'insufficient_dataset',
            'message': 'Insufficient dataset for reliable evaluation.',
            'detail': str(exc),
            'classes': CLASS_NAMES,
        }
        REPORT_PATH.write_text(json.dumps(report, indent=2), encoding='utf-8')
        METADATA_PATH.write_text(json.dumps({'status': 'demo_mode', 'message': 'Development/demo mode: no validated image model is available yet.'}, indent=2), encoding='utf-8')
        return report

    train_datagen = ImageDataGenerator(
        horizontal_flip=True,
        rotation_range=10,
        zoom_range=0.1,
        brightness_range=[0.85, 1.15],
    )
    train_generator = train_datagen.flow(train_x, train_y, batch_size=16, seed=SEED)

    model = _build_model()
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy'],
    )

    callbacks = [EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True)]
    model.fit(
        train_generator,
        validation_data=(val_x, val_y),
        epochs=5,
        callbacks=callbacks,
        verbose=0,
    )

    probabilities = model.predict(val_x, verbose=0)
    predictions = np.argmax(probabilities, axis=1)
    precision, recall, f1, _ = precision_recall_fscore_support(
        val_y,
        predictions,
        labels=range(len(CLASS_NAMES)),
        average=None,
        zero_division=0,
    )
    evaluation = {
        'status': 'evaluated',
        'accuracy': float(accuracy_score(val_y, predictions)),
        'precision': {label: float(value) for label, value in zip(CLASS_NAMES, precision)},
        'recall': {label: float(value) for label, value in zip(CLASS_NAMES, recall)},
        'f1': {label: float(value) for label, value in zip(CLASS_NAMES, f1)},
        'confusion_matrix': confusion_matrix(val_y, predictions, labels=range(len(CLASS_NAMES))).tolist(),
        'classes': CLASS_NAMES,
        'validation_image_count': int(len(val_y)),
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_PATH)
    REPORT_PATH.write_text(json.dumps(evaluation, indent=2), encoding='utf-8')
    metadata = {
        'status': 'trained',
        'model_architecture': 'MobileNetV2 transfer learning',
        'input_size': [224, 224, 3],
        'classes': CLASS_NAMES,
        'seed': SEED,
        'training_image_count': int(len(train_y)),
        'validation_image_count': int(len(val_y)),
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    return metadata


if __name__ == '__main__':
    train_image_classifier()
