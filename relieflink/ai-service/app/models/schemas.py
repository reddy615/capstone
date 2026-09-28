from pydantic import BaseModel, Field


class TextPredictionRequest(BaseModel):
    text: str = Field(..., max_length=2000, description='Emergency text description to classify.')


class PredictionResponse(BaseModel):
    prediction: str
    confidence: float
    probabilities: dict[str, float]
