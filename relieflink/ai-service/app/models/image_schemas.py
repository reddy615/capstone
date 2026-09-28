from pydantic import BaseModel, Field


class ImagePredictionResponse(BaseModel):
    prediction: str = Field(..., description='Predicted emergency class: Fire, Flood, or Accident.')
    confidence: float = Field(..., ge=0.0, le=1.0, description='Confidence score for the chosen class.')
    probabilities: dict[str, float] = Field(
        ...,
        description='Probability distribution for Fire, Flood, and Accident.',
    )
