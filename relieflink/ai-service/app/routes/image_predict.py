from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from app.services.image_classifier import ImageClassifierUnavailableError, predict_image

router = APIRouter(prefix='/predict', tags=['image-prediction'])


@router.post('/image')
async def predict_emergency_image(image: UploadFile | None = File(None)) -> dict:
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Image file is required.',
        )

    try:
        result = predict_image(image.file, filename=image.filename)
        return result
    except ImageClassifierUnavailableError as exc:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                'error': 'Image classification model is not available.',
                'detail': 'Train or load the Phase 5 image model before requesting predictions.',
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Image prediction failed.',
        ) from exc
