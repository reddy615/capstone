# ReliefLink

ReliefLink is a disaster-response capstone platform connecting victim SOS reports with text classification, image classification, multimodal fusion, explainable AI, emergency prioritization, responder coordination, and a real-time operational dashboard.

## Problem and objectives

Emergency information is often fragmented across descriptions, images, responders, facilities, and resources. ReliefLink provides one workflow for capturing an SOS, preserving the original report, analyzing available modalities, coordinating registered responders, and exposing status changes to authorized users.

The system supports exactly three emergency classes: `Fire`, `Flood`, and `Accident`. It does not process audio or sensor inputs.

## Architecture

- `client/`: React, Vite, Tailwind, React Leaflet, and Socket.IO client.
- `server/`: Express, MongoDB/Mongoose, JWT authorization, Multer image uploads, Socket.IO, and the Phase 8 integration service.
- `ai-service/`: FastAPI endpoints for NLP, computer vision, multimodal fusion, and explainability.
- `docs/`: technical requirements and final verification reports.

Workflow:

```text
Victim SOS
  -> text and optional image
  -> NLP and/or computer vision
  -> weighted multimodal fusion
  -> explainable AI
  -> priority and emergency update
  -> volunteer, facility, and resource coordination
  -> Socket.IO dashboard updates
```

The Node integration service preserves raw modality results, fusion output, explanation evidence, and verification state. If the AI service fails, the original SOS is retained and the emergency is marked `Failed`.

## Technology stack

- Frontend: React 18, Vite, Tailwind CSS, Leaflet/OpenStreetMap, Socket.IO Client.
- Backend: Node.js, Express, Mongoose, MongoDB, JWT, Socket.IO, Multer.
- AI service: Python 3, FastAPI, scikit-learn, joblib, TensorFlow/Keras, Pillow.

## AI pipeline

### NLP methodology

Phase 4 uses a persisted TF-IDF vectorizer and Logistic Regression model. The development dataset contains 12 labeled text examples across Fire, Flood, and Accident. Its metrics are development-set/training-set metrics, not independent generalization measurements.

### Computer vision methodology

Phase 5 uses frozen MobileNetV2 transfer learning with a custom classification head. Images are resized to 224x224 RGB and validated before inference. The current dataset contains 4 images per class, 12 total. The validation split contains only 3 images, one per class, so its perfect score is a pipeline check rather than evidence of real-world reliability.

### Multimodal fusion

Phase 6 combines class probability distributions with default weights of 0.5 text and 0.5 image. Single-modality requests use a weight of 1.0 for the available modality. If both top predictions differ and both confidences are at least 0.70, the result is `Verification Required`; no class is selected automatically.

### Explainable AI

Phase 7 reports only model outputs and configured modality contributions. It does not invent keywords, visual evidence, causal claims, or heatmaps. Missing modalities are explicitly represented as unavailable.

## Emergency coordination

Phase 8 stores AI status, prediction, confidence, probabilities, explanation, evidence, priority, verification fields, recommendations, and assigned volunteer information on the Emergency record. Priority is a deterministic project decision-support rule, not medically or scientifically validated triage.

Phase 9 provides an authorized real-time dashboard with:

- live emergency list and counters
- Leaflet map markers from stored coordinates only
- AI results, explanation, evidence, verification, priority, and status
- registered hospital, shelter, and resource recommendations
- volunteer assignment and status controls
- Socket.IO notifications and live record updates

Victims can view their own emergencies. Volunteers see assigned emergencies. NGO, hospital, authority, and admin access follows the existing role permissions; authority and admin roles can verify AI conflicts.

## API overview

AI service:

- `GET /health`
- `POST /api/v1/predict/text`
- `POST /api/v1/predict/image`
- `POST /api/v1/fusion/predict`
- `POST /api/v1/explain`

Backend:

- `POST /api/emergencies`
- `GET /api/emergencies/my`
- `GET /api/emergencies/active`
- `GET /api/emergencies/stats`
- `GET /api/emergencies/:id`
- `POST /api/emergencies/:id/process-ai`
- `GET /api/emergencies/:id/ai-result`
- `GET /api/emergencies/:id/recommendations`
- `POST /api/emergencies/:id/verify`
- `PATCH /api/emergencies/:id/status`
- `PATCH /api/emergencies/:id/assign-volunteer`
- `GET /api/volunteers/available`
- `GET /api/resources/available`

## Socket.IO events

The backend emits or the dashboard listens for:

`emergency:created`, `emergency:ai-processing`, `emergency:ai-completed`, `emergency:verification-required`, `emergency:priority-updated`, `emergency:volunteer-assigned`, `emergency:facility-recommended`, `emergency:ai-failed`, and `emergency:status-updated`.

## Dataset and evaluation

Real image files are stored in `ai-service/data/image_dataset/` under the three supported class directories. The reproducible Phase 10 evaluator is:

```text
cd relieflink/ai-service
python scripts/evaluate_phase10.py
```

It writes `models/phase10_evaluation_report.json`. The current report records 1.0 development-set NLP metrics and 1.0 image metrics on the available images, but explicitly marks both evaluations as non-independent. Computer vision has only 4 images per class, and no scientific reliability claim is made.

## Testing

Backend tests:

```text
cd relieflink/server
npm install
npm test
```

AI-service tests:

```text
cd relieflink/ai-service
pytest -q
```

Frontend production build:

```text
cd relieflink/client
npm install
npm run build
```

The Phase 10 automated result at the time of this report is 5 backend tests passed, 41 AI-service tests passed, and the frontend build passed. The real-AI test-environment harness uses the running FastAPI service and isolated in-memory backend fixtures; it does not replace MongoDB production verification.

## Deployment

### Backend Railway deployment

Railway settings for the Node backend:

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- `server/package.json` start script: `node src/server.js`

The backend reads `PORT`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, and `CLIENT_URL` from the environment. The repository contains only example variable names and no production secret values.

### AI service deployment

From `ai-service`, install `requirements.txt` and start FastAPI with a production process such as:

```text
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The trained image model and class labels must be present under `models/image_classifier/`. The service currently uses its application routes under `/api/v1`.

### Frontend deployment

The frontend uses `VITE_API_URL` for the backend API and `VITE_SOCKET_URL` for Socket.IO. Run `npm run build` and serve the generated Vite output with the selected hosting platform.

## Known limitations

- Production MongoDB verification is pending because the current configured URI resolves to the placeholder host `cluster.example.mongodb.net`.
- The Node backend cannot complete startup until valid MongoDB connectivity is provided; MongoDB configuration was not modified.
- The NLP score is measured on the 12 examples used to train the persisted development model, not an independent test set.
- The image dataset has only 4 images per class and the 3-image validation score is not evidence of real-world model reliability.
- The real AI disagreement tested so far did not produce two confidences at the unchanged 0.70 conflict threshold, so a genuine high-confidence `Verification Required` event remains un-demonstrated.
- Coordination and dashboard end-to-end tests use isolated backend fixtures when MongoDB is unavailable. They do not prove production persistence or production Socket.IO behavior.
- Response timing is environment-dependent; first image inference includes TensorFlow/model loading overhead.

## Future scope

Acquire independent, representative datasets; evaluate on held-out data; calibrate confidence; add operational monitoring; validate MongoDB and Socket.IO in a deployed environment; and conduct security, load, and usability testing with authorized stakeholders.

## Final verification

See [PHASE10-FINAL-VERIFICATION-REPORT.md](../docs/PHASE10-FINAL-VERIFICATION-REPORT.md) for the exact automated results, live AI checks, deployment readiness findings, and production verification status.
