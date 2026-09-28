# ReliefLink AI Service

## Phase 5: Image-Based Emergency Detection

This service provides the Phase 5 computer vision pipeline for ReliefLink. It accepts an emergency image and predicts one class from:

- Fire
- Flood
- Accident

The system is intentionally designed to remain safe in development mode: if no real trained image model is available, it does not fabricate predictions and returns an HTTP 503 response instead.

## Supported classes

The image model is constrained to exactly three emergency classes:

- Fire
- Flood
- Accident

## Model architecture

Phase 5 uses transfer learning with MobileNetV2 pretrained on ImageNet. The base model is frozen during initial training, and a custom classification head is trained on top of the feature extractor.

- Input size: 224 x 224 RGB images
- Final activation: softmax
- Output classes: 3

## Dataset structure

Images are expected under:

- data/image_dataset/Fire/
- data/image_dataset/Flood/
- data/image_dataset/Accident/

The repository includes the current real development dataset. It contains 4 images per class, so it is sufficient for pipeline and integration checks but insufficient for meaningful scientific model evaluation.

## Training command

From the ai-service directory:

python scripts/train_image_classifier.py

This script:

- validates the three class folders
- checks for a minimum usable dataset
- trains a MobileNetV2-based classifier
- saves the model to models/image_classifier/
- persists class labels in deterministic order
- writes a training metadata file
- writes an evaluation report if the dataset is sufficient

## Evaluation command

The model evaluation is produced during the training process and saved to:

- models/image_classifier/evaluation_report.json

If the dataset is insufficient, the report contains:

"Insufficient dataset for reliable evaluation."

Phase 10 evaluation, including per-class metrics and confusion matrices for the available NLP and image data, can be generated with:

python scripts/evaluate_phase10.py

The resulting report is written to models/phase10_evaluation_report.json. Its limitations must be read with the metrics: the NLP examples are development/training examples and the image set has only 4 images per class with no independent test set.

## Model location

Trained model artifacts are stored under:

- models/image_classifier/model.keras
- models/image_classifier/class_labels.json
- models/image_classifier/evaluation_report.json
- models/image_classifier/training_metadata.json

## API endpoint

POST /api/v1/predict/image

Request format:

- Content-Type: multipart/form-data
- Field name: image

Example:

curl -X POST "http://localhost:8000/api/v1/predict/image" -F "image=@path/to/image.jpg"

## Response format

Successful inference returns:

{
  "prediction": "Fire",
  "confidence": 0.91,
  "probabilities": {
    "Fire": 0.91,
    "Flood": 0.05,
    "Accident": 0.04
  }
}

The probabilities object always contains exactly these keys:

- Fire
- Flood
- Accident

## Error handling

The API handles:

- missing image
- invalid multipart request
- unsupported image type
- corrupted image
- oversized images
- model unavailable
- model loading failure
- inference failure

Unsupported files and corrupted uploads are rejected with HTTP 400. Missing or untrained models return HTTP 503 with:

{
  "error": "Image classification model is not available.",
  "detail": "Train or load the Phase 5 image model before requesting predictions."
}

## Development / demo mode

This Phase 5 implementation is intentionally safe. If no trained image model is available, the AI service starts normally, but image inference returns HTTP 503 rather than fake predictions. The current repository includes a trained model produced from the small development dataset; its metrics are not a claim of real-world reliability.

## Phase 6: Multimodal Fusion

Phase 6 adds the multimodal fusion engine that combines the Phase 4 text prediction and the Phase 5 image prediction into a single emergency classification.

### Fusion method

The fusion engine uses transparent weighted probability fusion. The initial default weights are:

- text = 0.5
- image = 0.5

These are the initial transparent baseline weights and have not been claimed as optimal. They are easy to tune in one place for future experimentation.

For each class:

combined_probability = text_weight × text_probability + image_weight × image_probability

The resulting distribution is normalized to sum approximately to 1.

### Conflict detection

If the top text class and top image class differ and both modality confidences exceed the configured threshold, the engine marks a conflict and returns:

- prediction: "Verification Required"
- conflict: true
- verification_required: true

The default conflict threshold is configured as 0.70 and can be tuned centrally.

### Text-only and image-only modes

- text only: text weight = 1.0, image weight = 0.0, modality = "text_only"
- image only: text weight = 0.0, image weight = 1.0, modality = "image_only"
- neither modality: validation error; no fabricated prediction

If the Phase 5 image model is unavailable, the fusion engine does not invent an image prediction. It operates safely in text-only mode when text is available.

### Endpoint

POST /api/v1/fusion/predict

Example request:

{
  "text_prediction": {
    "prediction": "Fire",
    "confidence": 0.85,
    "probabilities": {
      "Fire": 0.85,
      "Flood": 0.10,
      "Accident": 0.05
    }
  },
  "image_prediction": {
    "prediction": "Fire",
    "confidence": 0.90,
    "probabilities": {
      "Fire": 0.90,
      "Flood": 0.05,
      "Accident": 0.05
    }
  }
}

Example response:

{
  "prediction": "Fire",
  "confidence": 0.875,
  "probabilities": {
    "Fire": 0.875,
    "Flood": 0.075,
    "Accident": 0.05
  },
  "modality": "text_and_image",
  "weights": {
    "text": 0.5,
    "image": 0.5
  },
  "text_prediction": "Fire",
  "image_prediction": "Fire",
  "conflict": false,
  "verification_required": false
}

## Phase 7: Explainable AI

Phase 7 adds a deterministic explanation layer for the Phase 6 fusion result. It does not run an LLM, recalculate fusion, or create evidence that was not returned by a model.

### Endpoint

POST /api/v1/explain

The endpoint accepts the structured Phase 6 fusion response and returns:

- the preserved final prediction and confidence
- text evidence containing the text model prediction when available
- image evidence containing the image model prediction when available
- configured text and image fusion contributions
- agreement, conflict, and Verification Required flags
- a recommended human verification action for conflicting results

The explanation describes model outputs and configured fusion contributions. It does not establish causal certainty.

### Evidence safety

Text explanations do not invent keywords or feature-level evidence. Image explanations describe only the image classifier prediction when available. Since the current Phase 5 service does not expose reliable visual evidence, `visual_explanation_available` is `false` and no visual claim is generated. If the image model is unavailable, the API must continue to represent image evidence as unavailable rather than fabricate a prediction.

When both modalities make different predictions and Phase 6 marks the result as `Verification Required`, Phase 7 preserves that result and requests human verification. It does not select an emergency class on the user's behalf.

### Optional Grad-CAM and limitations

Grad-CAM is not implemented. It may be added later only when a supported trained image model can produce a reliable heatmap. The current explanation layer cannot infer per-modality confidence or causal feature importance from the flat Phase 6 response, so it reports only information actually present in that response.

Phase 7 does not implement prioritization, volunteer assignment, hospital/shelter recommendation, resource coordination, audio, or sensor inputs.
