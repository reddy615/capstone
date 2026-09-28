from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_DIMENSION = 4096
ALLOWED_IMAGE_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
MODEL_INPUT_SIZE = (224, 224)


def _read_image_bytes(file_obj) -> bytes:
    if file_obj is None:
        raise ValueError('Image file is required.')

    file_obj.seek(0)
    content = file_obj.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError(f'Image exceeds maximum allowed size of {MAX_IMAGE_BYTES} bytes.')
    if not content:
        raise ValueError('Image file is empty.')
    return content


def validate_image_upload(file_obj, filename: str | None = None) -> None:
    if file_obj is None:
        raise ValueError('Image file is required.')

    content = _read_image_bytes(file_obj)

    suffix = Path(filename or '').suffix.lower() if filename else ''
    if suffix and suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError('Unsupported image format.')

    try:
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            image_format = image.format
            image = ImageOps.exif_transpose(image)
            if image_format not in {'JPEG', 'PNG', 'WEBP'}:
                raise ValueError('Unsupported image format.')
            if max(image.size) > MAX_IMAGE_DIMENSION:
                raise ValueError('Image dimensions are too large.')
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError('Corrupted or invalid image file.') from exc


def preprocess_image(file_obj, filename: str | None = None, image_size: tuple[int, int] = MODEL_INPUT_SIZE):
    validate_image_upload(file_obj, filename)
    content = _read_image_bytes(file_obj)

    with Image.open(io.BytesIO(content)) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        image = image.resize(image_size)
        array = np.asarray(image, dtype=np.float32)
        return array
