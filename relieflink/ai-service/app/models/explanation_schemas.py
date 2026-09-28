from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


EMERGENCY_CLASSES = ('Fire', 'Flood', 'Accident')
PredictionClass = Literal['Fire', 'Flood', 'Accident']
Modality = Literal['text_only', 'image_only', 'text_and_image']


class FusionExplanationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    prediction: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    probabilities: dict[str, float]
    modality: Modality
    weights: dict[str, float]
    text_prediction: PredictionClass | None = None
    image_prediction: PredictionClass | None = None
    conflict: bool
    verification_required: bool


class TextEvidence(BaseModel):
    available: bool
    prediction: PredictionClass | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    support: str


class ImageEvidence(BaseModel):
    available: bool
    prediction: PredictionClass | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    support: str
    visual_explanation_available: bool = False


class ModalityContribution(BaseModel):
    text_weight: float = Field(ge=0.0, le=1.0)
    image_weight: float = Field(ge=0.0, le=1.0)


class ExplanationDetails(BaseModel):
    summary: str
    text_evidence: TextEvidence
    image_evidence: ImageEvidence
    modality_contribution: ModalityContribution
    agreement: bool
    conflict: bool
    verification_required: bool
    recommended_action: str | None = None


class ExplanationResponse(BaseModel):
    prediction: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    explanation: ExplanationDetails