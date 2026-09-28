from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.services.fusion_service import fuse_predictions

router = APIRouter(prefix='/fusion', tags=['fusion'])


@router.post('/predict')
async def predict_fusion(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        text_prediction = payload.get('text_prediction')
        image_prediction = payload.get('image_prediction')
        if text_prediction is None and image_prediction is None:
            raise ValueError('At least one modality must be provided for fusion.')
        result = fuse_predictions(text_prediction, image_prediction)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - safety belt
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Fusion prediction failed.') from exc
