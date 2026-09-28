# ReliefLink

ReliefLink is a disaster-response platform implementing the capstone emergency-response workflow.

## Structure

- `client/` - React + Vite + Tailwind frontend
- `server/` - Express + MongoDB + JWT backend
- `ai-service/` - Python FastAPI service for text, image, fusion, and explanation phases

## Phase 8 decision-support rule

The Node integration service stores the original modality predictions, fusion result, explanation, and verification state on each emergency. Priority is a deterministic project rule, not medically or scientifically validated triage: high-confidence Fire and Accident results are Critical, high-confidence Flood results are High, verification conflicts are High, and lower-confidence results are Medium or Low. AI failures preserve the original SOS and set `aiStatus` to `Failed`.

Only `Fire`, `Flood`, and `Accident` are supported. Facilities and resources are selected from registered database records; the system does not invent recommendations.

## Setup

See the exact commands in the final instructions after installation and verification.
