# ReliefLink: Real-Time Multimodal Emergency Event Detection with Explanation

## 1. Project Overview

ReliefLink is a disaster-response platform designed for emergency incident reporting and rapid coordination. A victim can submit a short SOS message, optionally attach an image, and share the current GPS location. The system analyzes the text and image together to determine whether the incident is most likely a Fire, Flood, or Accident. The model must use explainable multimodal reasoning and can escalate uncertain results to a manual review state named Verification Required.

The solution is intentionally split into two separate runtime systems:

- Main application: React.js frontend + Node.js/Express.js backend + MongoDB Atlas database + Socket.IO + Leaflet map integration
- AI service: Python + FastAPI microservice dedicated to NLP, computer vision, multimodal fusion, and explainability

This separation keeps the application production-ready, scalable, and suitable for a B.Tech capstone and research project while preserving clean responsibilities.

### Core constraints

- Exactly three emergency classes: Fire, Flood, Accident
- No audio or sensor inputs
- No additional disaster classes
- MongoDB Atlas is the database platform
- AI prediction uses both text and image when available
- If text and image predictions conflict, the system must not blindly choose one class; it must mark the case as Verification Required
- The system must support the disaster-response workflow: AI Detection → Emergency Prioritization → Volunteer Assignment → Hospital/Shelter Recommendation → Resource Coordination → Real-Time Rescue Response

---

## 2. Functional Requirements

### 2.1 User registration and authentication

1. Users must register as one of the defined roles: Victim, Volunteer, NGO, Hospital, Government/Authority, or Admin.
2. Authentication must use JWT-based access tokens and password hashing with bcrypt.
3. Role-based access control must restrict sensitive actions.
4. The system must support login, logout, token refresh, and session expiry handling.

### 2.2 Victim emergency registration

1. Victim users must be able to create an SOS report.
2. Each SOS must contain:
   - Text description of the emergency
   - Optional image upload
   - Current GPS location
3. The system must validate the presence of required fields and reject invalid or incomplete reports.
4. Each SOS report must record timestamps, device metadata, GPS coordinates, and source user identity.
5. The victim must receive immediate acknowledgement after report submission.

### 2.3 AI classification pipeline

1. The AI service must accept the text, image, and GPS metadata for each SOS.
2. The system must run independent text and image classification models.
3. The text model predicts one of: Fire, Flood, Accident.
4. The image model predicts one of: Fire, Flood, Accident.
5. The final multimodal decision must combine the two probabilities.
6. If both predictions agree, the confidence score must increase.
7. If the predictions conflict, the system must set the case status to Verification Required and avoid selecting a single final class without escalation.
8. The system must return a confidence score and AI rationale for the outcome.

### 2.4 Emergency prioritization

1. After AI detection, the system must assign an emergency priority level based on severity, location, and urgency.
2. Severity factors may include:
   - Incident class
   - Confidence score
   - Number of reports in an area
   - Time since first report
   - Victim risk indicators
3. Priority levels must be mapped to response urgency categories.

### 2.5 Volunteer assignment

1. The system must match volunteers based on:
   - Location proximity
   - Availability status
   - Skills or certification (if available)
   - Current workload
2. Volunteers must receive notification and assignment requests.
3. Volunteers must be able to accept or reject assignments.

### 2.6 Hospital and shelter recommendation

1. Based on incident type and GPS, the system must recommend the nearest suitable hospital or shelter.
2. Recommendations must consider facility type, capacity, and route accessibility.
3. Advisory data must be displayed on the map, with distances and travel estimates.

### 2.7 Resource coordination

1. NGOs, government agencies, and admins must be able to view active incidents and required resources.
2. Resource categories may include medical, rescue, shelter, food, and transport support.
3. Resource allocation must be tracked and updated in real time.

### 2.8 Real-time rescue response

1. Rescue operations must be coordinated through live status updates.
2. The system must provide a real-time event feed for all stakeholders.
3. Live location updates, volunteer status, and resource status must be visible to authorized roles.
4. Incident status transitions must be updated from Submitted → Detected → Prioritized → Assigned → Active Response → Resolved/Closed.

### 2.9 Reporting and analytics

1. Admins and authorities must be able to generate incident summaries.
2. Dashboard analytics must include trend data by incident type, response time, area, and resource usage.
3. Admins must be able to export reports for operational review.

---

## 3. Non-Functional Requirements

### 3.1 Performance

- Submit-response acknowledgment should be returned quickly, ideally within 2–3 seconds.
- AI inference should complete within a practical cap for a demo/research environment, typically under 5–8 seconds for text + image analysis.
- Real-time updates must be delivered with low latency through Socket.IO.

### 3.2 Scalability

- The architecture must support multiple simultaneous users and active incidents.
- The backend should be horizontally scalable by deploying stateless Express.js instances behind a load balancer.
- The AI service should be independently scalable because inference is computationally heavier than the main application.
- MongoDB Atlas should use indexing and query optimization for hot collections.

### 3.3 Reliability and availability

- The system must handle partial failure gracefully.
- If the AI service is unavailable, the application must still accept SOS reports and mark them as Pending AI Analysis.
- Event delivery must be resilient, with retry and fallback behavior for real-time notifications.

### 3.4 Security

- Passwords must be hashed using bcrypt.
- JWT tokens must be stateless and securely signed.
- All API traffic must use HTTPS.
- File uploads must be sanitized and size-limited.
- Inputs must be validated on both frontend and backend.
- Role-based controls must enforce least privilege.

### 3.5 Maintainability

- The application and AI service must be modularized into clear service boundaries.
- API contracts must be versioned or clearly structured for future changes.
- Code should be documented and organized for B.Tech project development and future extension.

### 3.6 Data privacy and ethics

- GPS and image data must be handled securely and stored only where necessary.
- Access to victim personal data must be restricted to authorized roles.
- Sensitive location information should be masked or limited for non-authorized users.

---

## 4. User Roles and Permissions

| Role | Primary responsibilities | Key permissions |
| --- | --- | --- |
| Victim | Submit SOS, track case status | Create SOS, view own reports, upload image, share location |
| Volunteer | Respond to emergencies | View nearby incidents, accept/reject assignments, update response state |
| NGO | Coordinate aid support | View incidents, assign resources, manage shelter/aid tasks |
| Hospital | Manage emergency care | View relevant incidents, receive patient/triage info, update hospital readiness |
| Government/Authority | Monitor region-wide response | View regional incidents, coordinate agencies, access dashboards |
| Admin | Platform administration | Manage users, roles, reports, system health, moderation |

### Access model

- Victims can only manage their own reports.
- Volunteers can see relevant nearby incidents after assignment or after region matching.
- Hospitals and NGOs see only cases relevant to their service domain.
- Government/authority roles see aggregate and regional data with privacy restrictions.
- Admins have broad read access but must not override emergency decisions without audit logging.

---

## 5. Complete System Architecture

### 5.1 High-level architecture

The system is organized as a multi-tier solution:

1. Client layer: React.js frontend with Vite
2. Application layer: Node.js + Express.js API backend
3. Real-time layer: Socket.IO server and event bus
4. Data layer: MongoDB Atlas collections and indexes
5. AI layer: Python + FastAPI AI service
6. External integration layer: maps, routing, hospital/shelter metadata, notifications

### 5.2 Architectural principles

- Clear separation between application logic and AI inference logic
- Stateless backend services for horizontal scaling
- Independent AI service to isolate heavy ML workloads
- MongoDB Atlas as the main data store for all structured operational records
- Event-driven communication for real-time operational updates

### 5.3 Runtime flow

1. Victim submits SOS from frontend.
2. Backend validates request and stores raw SOS record.
3. Backend triggers AI inference request to Python AI service.
4. AI service analyzes text and image and returns class probabilities and explanation data.
5. Backend decides the final incident state and confidence.
6. The incident is prioritized and matched to volunteers/resources.
7. Notifications and map updates are sent via Socket.IO.
8. Relevant stakeholders receive incident updates in real time.

---

## 6. Frontend Architecture

### 6.1 Frontend stack

- React.js
- Vite for project bootstrapping and fast development
- React Router for navigation
- Leaflet.js + OpenStreetMap for live map rendering
- HTTP client for API calls
- Real-time event listeners via Socket.IO client

### 6.2 Frontend modules

- Auth module
- Dashboard module
- SOS submission module
- Incident detail module
- Volunteer dashboard
- NGO dashboard
- Hospital dashboard
- Government dashboard
- Admin control panel
- Map view module
- Notification center

### 6.3 Frontend responsibilities

- Capture emergency description and image attachment
- Show location selection using GPS or map pinning
- Display AI classification result and explanation
- Show confidence and verification status
- Display assignment and response timeline
- Present map markers for active incidents and responders
- Route users according to their role permissions

### 6.4 UI behavior requirements

- Victim form must guide users through an easy SOS submission flow.
- Incident cards must show class, confidence, risk, and status.
- Explainability panel must visually show why an incident was classified as Fire, Flood, or Accident.
- If the case is Verification Required, the interface must clearly prompt for supervisor review.

---

## 7. Backend Architecture

### 7.1 Backend stack

- Node.js
- Express.js
- JWT-based auth middleware
- bcrypt for password hashing
- Mongoose ODM for MongoDB Atlas interaction
- Socket.IO server integration
- File upload handling for images
- Validation layer using schema validation and custom logic

### 7.2 Backend service modules

- Authentication service
- User service
- SOS service
- Incident service
- AI orchestration service
- Prioritization service
- Volunteer matching service
- Resource coordination service
- Recommendation service
- Notification service
- Audit log service
- Map and geospatial service

### 7.3 Backend responsibilities

- Validate incoming SOS data
- Store records in MongoDB Atlas
- Trigger AI request to Python service
- Perform multimodal decision logic and state updates
- Manage role-based authorization
- Send live updates to clients through Socket.IO
- Coordinate operational workflow to response planning

### 7.4 Middleware architecture

- Request validation middleware
- Error handling middleware
- Auth middleware
- Role authorization middleware
- Rate limiting middleware
- CORS and security headers
- File upload middleware

---

## 8. MongoDB Database Architecture

### 8.1 Database choice

MongoDB Atlas is required. The schema must be flexible enough to support geospatial data, social response workflows, and evolving AI metadata.

### 8.2 Core collections

- users
- sos_reports
- incidents
- incident_events
- volunteers
- hospitals
- shelters
- agencies
- resources
- assignments
- notifications
- audit_logs

### 8.3 Important document design

#### users

- _id
- name
- email
- passwordHash
- role
- createdAt
- lastLogin
- availability
- location
- preferences

#### sos_reports

- _id
- victimId
- textDescription
- imageUrl
- gps: { lat, lng }
- submittedAt
- status
- aiRequestId
- rawPredictions
- finalDecision
- confidence
- verificationRequired

#### incidents

- _id
- sosReportId
- incidentType
- candidateLabels
- finalStatus
- confidence
- priorityScore
- severity
- geolocation
- assignedVolunteerId
- hospitalRecommendation
- shelterRecommendation
- createdAt
- updatedAt

#### assignments

- _id
- incidentId
- volunteerId
- ngoId
- status
- assignedAt
- acceptedAt
- responseState

#### notifications

- _id
- recipientId
- type
- message
- read
- createdAt

### 8.4 Indexing strategy

- Index on user email and role
- Index on incident location for geospatial queries
- Index on incident status and createdAt for dashboard queries
- Index on SOS submission time and victimId
- Index on volunteer availability and location

### 8.5 MongoDB Atlas considerations

- Use Atlas Search if future text-based retrieval is needed
- Keep geospatial latitude/longitude fields in a consistent format
- Use separate collections for operational data and historical archives for long-term scalability

---

## 9. AI Service Architecture

### 9.1 AI service stack

- Python
- FastAPI
- Pydantic for request validation
- Pillow, OpenCV, or equivalent for image preprocessing
- Transformers or PyTorch/TensorFlow for model inference
- NumPy and scikit-learn for probability fusion and calibration

### 9.2 AI service responsibilities

- Receive SOS request from the backend
- Preprocess text description
- Preprocess uploaded image
- Run text model inference for Fire/Flood/Accident
- Run image model inference for Fire/Flood/Accident
- Fuse probabilities using multimodal logic
- Generate explanation output
- Return structured response to backend

### 9.3 Model design

#### Text model

- A transformer-based classifier such as a BERT-style model fine-tuned on disaster-related text
- Input: victim description in natural language
- Output: 3-class probability vector

#### Image model

- CNN-based architecture such as EfficientNet or ResNet fine-tuned for disaster imagery
- Input: uploaded emergency image
- Output: 3-class probability vector

### 9.4 Multimodal fusion logic

- Compute text scores: P_text = [Fire, Flood, Accident]
- Compute image scores: P_image = [Fire, Flood, Accident]
- Fuse the probabilities using weighted averaging or learned fusion
- If predictions agree, amplify confidence
- If predictions conflict, return a verification state instead of silently choosing one class

### 9.5 Explainability layer

- Text explanation: top keywords and phrases influencing the decision
- Image explanation: class activation maps or attention-based saliency highlighting regions
- Multimodal explanation: explain which modality dominated the final outcome
- Response payload includes explanation sections for frontend display

### 9.6 AI service contract

The AI service should return a structured JSON object like:

- incidentId
- textPrediction
- imagePrediction
- multimodalPrediction
- confidence
- decisionStatus
- explanation
- candidateLabels
- verificationRequired

---

## 10. API Architecture

### 10.1 API style

- RESTful API architecture
- JSON request/response format
- Clear versioning strategy such as /api/v1/
- Consistent response envelopes

### 10.2 API groups

- Auth APIs
- User APIs
- SOS submission APIs
- Incident APIs
- Assignment APIs
- Resource APIs
- Recommendation APIs
- Notification APIs
- Dashboard analytics APIs

### 10.3 Example endpoints

- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/sos/create
- GET /api/v1/incidents/:id
- PATCH /api/v1/incidents/:id/status
- GET /api/v1/volunteers/nearby
- POST /api/v1/assignments/create
- GET /api/v1/recommendations/hospital
- GET /api/v1/dashboard/summary

### 10.4 Response standards

- Success responses with status and payload
- Error responses with error code, message, and trace ID
- Standardized HTTP status codes
- Consistent success/error structure for frontend handling

---

## 11. Socket.IO Event Architecture

Socket.IO is used for live operational communication.

### 11.1 Event categories

- Authentication events
- SOS lifecycle events
- Assignment events
- Location update events
- Resource update events
- Notification events
- Dashboard streaming events

### 11.2 Example events

- sos:submitted
- sos:ai_processed
- incident:priority_updated
- volunteer:assigned
- volunteer:status_changed
- resource:updated
- notification:received
- map:incident_updated
- incident:verification_required

### 11.3 Event payload requirements

Each event should include:

- event name
- incidentId or userId
- timestamp
- payload metadata
- authorization context when necessary

### 11.4 Real-time use cases

- Victim sees case acknowledgement and status changes
- Volunteer receives assignment request instantly
- NGO sees new incidents in assigned area
- Government dashboard updates live incident volume
- Admin monitors platform activity and alerts

---

## 12. Multimodal AI Workflow

### 12.1 Workflow sequence

1. Victim submits SOS with text, optional image, and GPS.
2. Backend validates request and stores a pending incident.
3. Backend sends request to AI service with structured payload.
4. Text classifier analyzes the emergency description.
5. Image classifier analyzes the image if present.
6. Probability vectors are collected for both modalities.
7. Fusion module combines the two predictions.
8. Decision logic evaluates agreement versus conflict.
9. The system outputs either:
   - Final class: Fire, Flood, or Accident
   - Or Verification Required if the modalities disagree significantly
10. The result is stored and sent back to the frontend.

### 12.2 Decision rules

- If both text and image predict the same class and confidence is acceptable, select that class.
- If both modalities agree but confidence is low, keep the class but mark it as low confidence.
- If text and image differ, set status to Verification Required and flag the incident for manual or supervisory review.
- Only Fire, Flood, and Accident are allowed as the core classes in the model output space.

### 12.3 Confidence logic

Confidence can be computed as a weighted combination of modality confidence and agreement bonus.

- Agreement bonus: increase confidence when both modalities align
- Conflict penalty: reduce confidence or trigger Verification Required when predictions disagree
- Confidence should be stored as a normalized score from 0 to 1 or 0 to 100

---

## 13. Explainability Workflow

### 13.1 Goal

The system should not behave like a black box. It must provide user-facing explanations that help stakeholders understand why the emergency was predicted as a class.

### 13.2 Text explainability

- Identify top terms in the SOS description that influenced the prediction
- Highlight words such as smoke, floodwater, crash, fire, submerged, vehicle collision, etc.
- Show contribution scores to indicate strong vs weak indicators

### 13.3 Image explainability

- Use visual saliency or Grad-CAM style output to highlight warm regions in the image
- Show which parts of the image contributed most strongly to the decision
- Indicate whether the model recognized smoke, water, or vehicle impact patterns

### 13.4 Multimodal explanation

- Show which modality was more influential
- Indicate whether both modalities supported the same class
- If conflict exists, explain the conflicting evidence and the reason for manual verification

### 13.5 Frontend explainability display

The interface should show:

- Predicted class
- Probability breakdown
- Confidence percentage
- Supporting text cues
- Supporting image cues
- Conflict status if applicable
- Reason summary for end users and responders

---

## 14. Emergency Response Workflow

The disaster-response workflow must follow the required lifecycle:

### 14.1 AI Detection

- Victim submits SOS.
- Backend invokes AI service.
- Model returns class, confidence, and explanation.

### 14.2 Emergency Prioritization

- System calculates urgency score based on incident type, confidence, location risk, and time sensitivity.
- Incident is assigned a triage level.

### 14.3 Volunteer Assignment

- Volunteer matching uses geospatial and availability filters.
- Top relevant volunteers are notified and assigned.
- Volunteer can accept or reject.

### 14.4 Hospital or Shelter Recommendation

- System suggests nearest suitable healthcare or shelter facility.
- Recommendations are displayed to relevant teams and can be shared with responders.

### 14.5 Resource Coordination

- NGOs and agencies view required support and allocate resources.
- Medical, rescue, food, shelter, and transit support can be assigned.

### 14.6 Real-Time Rescue Response

- Rescuers coordinate in real time with live incident updates.
- Response team updates the case until resolution.
- Final state is recorded as resolved/closed or escalated for follow-up.

---

## 15. Security Requirements

1. All authentication must use JWT tokens and bcrypt password hashing.
2. User roles must be enforced through middleware and route restrictions.
3. The backend must validate all user input and reject malicious payloads.
4. File uploads must be restricted in size and file type to reduce abuse risk.
5. All communication between frontend, backend, and AI service must use secure channels.
6. GPS and image metadata must be protected from unauthorized access.
7. APIs must use rate limiting and XSS/CSRF-safe patterns.
8. Audit logs must record who changed incident state or assigned volunteers.
9. Sensitive operations must require explicit user authorization.
10. The system must support secure environment configuration through environment variables.

---

## 16. Error-Handling Strategy

### 16.1 Validation errors

- Invalid SOS submissions must be rejected early with clear messages.
- Missing text content, invalid GPS, and unsupported image types must trigger appropriate validation errors.

### 16.2 AI service failures

- If the AI service is unavailable or returns malformed data, the backend must not crash.
- The incident should be stored as Pending AI Analysis and retried later.
- A clear user-visible status message should be sent.

### 16.3 Database failures

- MongoDB connection errors must be caught and surfaced through proper API error handlers.
- The backend should retry transient writes when feasible.
- Critical writes must be logged.

### 16.4 Real-time event failures

- Socket.IO failures should not block the core workflow.
- Clients should be able to reconnect and resync state.

### 16.5 Operational fallback behavior

- If volunteer matching fails, incident should remain visible to NGOs and admins for manual assignment.
- If recommendation data is missing, the system should fall back to generic nearest available services.

---

## 17. Testing Strategy

### 17.1 Unit testing

- Test validation logic for SOS forms and role rules
- Test JWT authentication and role enforcement
- Test AI preprocessing and fusion logic with known sample cases
- Test recommendation functions and priority calculation

### 17.2 Integration testing

- Test backend-to-AI-service interaction
- Test MongoDB Atlas CRUD flows
- Test assignment and notification workflows
- Test incident lifecycle transitions

### 17.3 Frontend testing

- Validate form flows, role dashboards, and map rendering
- Test UI responses for Classification Result and Verification Required states
- Test explainability panel rendering

### 17.4 AI evaluation testing

- Evaluate text model performance on balanced disaster text data
- Evaluate image model performance on labeled disaster image sets
- Validate multimodal fusion behavior on agreement and disagreement cases
- Measure confidence calibration and explanation consistency

### 17.5 System testing

- End-to-end flow from SOS submission to response coordination
- Verify live updates using Socket.IO
- Test failure scenarios such as AI service outage or failed assignment

### 17.6 Research-oriented validation

Since this is a capstone project, it is helpful to benchmark:

- Accuracy by class
- Precision, recall, and F1-score
- Agreement rate between text and image models
- Verification-required incident rate
- Average inference time

---

## 18. Folder Structure

A clean project structure for the capstone should separate the main application and the AI service clearly:

```text
ReliefLink/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   ├── utils/
│   │   └── app.js
│   ├── package.json
│   └── .env.example
├── ai-service/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── preprocessing/
│   │   ├── inference/
│   │   ├── fusion/
│   │   ├── explainability/
│   │   └── main.py
│   ├── requirements.txt
│   └── .env.example
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   └── api-spec.md
├── database/
│   └── mongo-schema-notes.md
├── deployment/
│   ├── vercel/
│   └── railway/
├── README.md
├── .gitignore
└── .env.example
```

This structure is easy to manage in a capstone project and keeps the AI subsystem separate from the main application without losing integration clarity.

---

## 19. Development Sequence

### Phase 1: Requirement and architecture definition

- Finalize core use cases and data model
- Confirm role definitions and permission matrix
- Define AI output contract and verification logic
- Define the exact three-class prediction domain

### Phase 2: Project skeleton and environment setup

- Initialize frontend, backend, and AI service separately
- Set up MongoDB Atlas cluster and connectivity
- Configure .env files and deployment assumptions
- Establish API contracts and route structure

### Phase 3: Core backend and frontend foundation

- Authentication and role management
- User profile creation and management
- SOS submission form and API flow
- Map integration and location handling

### Phase 4: AI service implementation

- Data collection and preprocessing
- Text model pipeline
- Image model pipeline
- Fusion and explainability modules
- Verification Required decision logic

### Phase 5: Workflow integration

- AI results to incident state updates
- Prioritization logic
- Volunteer matching
- Hospital/shelter recommendations
- Resource coordination

### Phase 6: Real-time communication

- Socket.IO event definitions
- Live incident updates
- Notification feed and dashboard live sync

### Phase 7: Validation and testing

- Validate model classification and explainability quality
- Run integration testing across stack
- Refinement of user experience and dashboard feedback

### Phase 8: Capstone demonstration and documentation

- Present architecture and workflow to evaluators
- Document system design, assumptions, and limitations
- Prepare demonstrations for different user roles

---

## 20. Design Summary

ReliefLink is designed as a modern, modular emergency-response platform with a clean separation between the main application and the Python AI service. The architecture supports real-time operations, role-based access, geospatial coordination, and explainable multimodal emergency detection using only text and image inputs. The project remains scalable, suitable for a B.Tech capstone, and aligned with the required domain constraints: exactly three classes, no extra disaster types, no audio/sensor inputs, and MongoDB Atlas as the database platform.

This design is intentionally implementation-ready but still keeps the scope feasible for a research-oriented capstone project. It balances technical depth with practical development constraints while clearly separating application logic from AI inference logic.
