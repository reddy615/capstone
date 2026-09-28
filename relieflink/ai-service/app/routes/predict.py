from fastapi import APIRouter, HTTPException, status

from app.models.schemas import PredictionResponse, TextPredictionRequest
from app.services.text_classifier import predict_text

router = APIRouter(prefix='/predict', tags=['prediction'])


@router.post('/text', response_model=PredictionResponse)
async def predict_emergency_text(payload: TextPredictionRequest) -> PredictionResponse:
    try:
        if not payload.text or not payload.text.strip():
            raise ValueError('Text input is required.')

        result = predict_text(payload.text)
        return PredictionResponse(**result)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Prediction failed: {str(exc)}',
        ) from exc
