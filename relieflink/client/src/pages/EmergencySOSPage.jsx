import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import MapView from '../components/MapView';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const createEmptyForm = () => ({
  description: '',
  latitude: '',
  longitude: '',
  contactInfo: '',
  priority: 'Medium',
});

export default function EmergencySOSPage() {
  const { token } = useAuth();
  const fileInputRef = useRef(null);
  const currentEmergencyId = useRef(null);
  const submissionResultRef = useRef(null);

  const [form, setForm] = useState(createEmptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSubmissionResult, setShowSubmissionResult] = useState(false);
  const [submittedEmergency, setSubmittedEmergency] = useState(null);
  const [victimView, setVictimView] = useState(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [resultError, setResultError] = useState('');

  useEffect(() => {
    if (showSubmissionResult) {
      submissionResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showSubmissionResult]);

  const locationLabel = useMemo(() => {
    if (form.latitude && form.longitude) {
      return `Lat ${form.latitude}, Lng ${form.longitude}`;
    }

    return 'Location not captured yet';
  }, [form.latitude, form.longitude]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleImageSelection = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, or WEBP images are allowed.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('Image size must be 5MB or less.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.');
      return;
    }

    setError('');
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((previous) => ({
          ...previous,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setIsLocating(false);
      },
      () => {
        setError('Unable to access current location. Please enter coordinates manually.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const refreshVictimView = async (emergencyId, { silent = false } = {}) => {
    if (!emergencyId) return;
    if (!silent) {
      setResultLoading(true);
      setServicesLoading(true);
    }
    setResultError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/emergencies/${encodeURIComponent(emergencyId)}/victim-view`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load emergency response information.');
      if (String(currentEmergencyId.current) !== String(emergencyId)) return;
      setVictimView(data);
      setSubmittedEmergency(data.emergency);
    } catch (loadError) {
      setResultError(loadError.message || 'Unable to load emergency response information.');
    } finally {
      if (!silent) {
        setResultLoading(false);
        setServicesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin);
    const eventNames = [
      'emergency:created',
      'emergency:ai-processing',
      'emergency:ai-completed',
      'emergency:verification-required',
      'emergency:priority-updated',
      'emergency:volunteer-assigned',
      'emergency:facility-recommended',
      'emergency:status-updated',
      'emergency:ai-failed',
    ];
    const handlers = eventNames.map((eventName) => {
      const handler = (payload) => {
        const emergencyId = payload?.emergencyId || payload?.emergency?._id || payload?.emergency?.id || payload?.id;
        if (!emergencyId || String(emergencyId) !== String(currentEmergencyId.current)) return;
        if (eventName === 'emergency:ai-processing') {
          setResultLoading(true);
          setServicesLoading(true);
        }
        refreshVictimView(emergencyId, { silent: eventName !== 'emergency:ai-processing' });
      };
      socket.on(eventName, handler);
      return [eventName, handler];
    });

    return () => {
      handlers.forEach(([eventName, handler]) => socket.off(eventName, handler));
      socket.disconnect();
    };
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.description.trim() && !imageFile) {
      setError('Please describe the emergency or attach an image before submitting.');
      return;
    }

    if (!form.latitude || !form.longitude) {
      setError('Please capture or enter GPS coordinates.');
      return;
    }

    try {
      setLoading(true);

      const payload = new FormData();
      payload.append('description', form.description.trim());
      payload.append('latitude', form.latitude);
      payload.append('longitude', form.longitude);
      payload.append('contactInfo', form.contactInfo.trim());
      payload.append('priority', form.priority);

      if (imageFile) {
        payload.append('image', imageFile);
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/emergencies`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Emergency submission failed.');
      }

      const emergency = data.emergency;
      const emergencyId = emergency?._id || emergency?.id;
      currentEmergencyId.current = emergencyId;
      setSubmittedEmergency({ ...emergency, id: emergencyId });
      setVictimView(null);
      setResultLoading(true);
      setServicesLoading(true);
      setSuccess('Emergency submitted. AI analysis in progress...');
      setShowSubmissionResult(true);
      await refreshVictimView(emergencyId);
    } catch (submitError) {
      setError(submitError.message || 'Emergency submission failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSos = () => {
    currentEmergencyId.current = null;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setForm(createEmptyForm());
    setImageFile(null);
    setImagePreview('');
    setError('');
    setSuccess('');
    setSubmittedEmergency(null);
    setVictimView(null);
    setResultLoading(false);
    setServicesLoading(false);
    setResultError('');
    setShowSubmissionResult(false);
  };

  const resultEmergency = victimView?.emergency || submittedEmergency;
  const aiAssessment = victimView?.aiAssessment;
  const aiEvidence = resultEmergency?.aiEvidence || {};
  const probabilities = aiAssessment?.probabilities || resultEmergency?.aiProbabilities || {};
  const prediction = aiAssessment?.verificationRequired || resultEmergency?.verificationRequired
    ? 'Verification Required'
    : aiAssessment?.prediction || resultEmergency?.aiPrediction || '';
  const aiStatus = aiAssessment?.status || resultEmergency?.aiStatus || '';
  const aiFailed = ['Failed', 'failed'].includes(aiStatus);
  const aiInProgress = resultLoading || !aiStatus || ['Pending', 'pending', 'Processing', 'processing'].includes(aiStatus);
  const services = victimView?.nearbyServices;
  const mapMarkers = useMemo(() => {
    if (!resultEmergency || !Number.isFinite(Number(resultEmergency.latitude)) || !Number.isFinite(Number(resultEmergency.longitude))) return [];
    const emergencyPosition = [Number(resultEmergency.latitude), Number(resultEmergency.longitude)];
    const serviceMarkers = [
      ...(services?.hospitals || []).map((service) => ({ ...service, type: 'Hospital', details: `${service.type || 'Hospital'}${service.availableBeds === undefined ? '' : ` · ${service.availableBeds} beds`}` })),
      ...(services?.shelters || []).map((service) => ({ ...service, type: 'Shelter', details: `${service.availableSlots === undefined ? 'Shelter' : `${service.availableSlots} available slots`}` })),
      ...(services?.resources || []).map((service) => ({ ...service, type: 'Resource', details: `${service.type || 'Resource'}${service.quantity === undefined ? '' : ` · ${service.quantity} available`}` })),
    ].filter((service) => Array.isArray(service.coordinates) && service.coordinates.length >= 2)
      .map((service) => ({
        id: String(service.id),
        position: [Number(service.coordinates[1]), Number(service.coordinates[0])],
        type: service.type,
        details: `${service.details} · ${Number(service.distanceKm).toFixed(1)} km away`,
      }));

    return [
      { id: `sos-${resultEmergency.id}`, position: emergencyPosition, type: 'Your SOS location', details: 'Emergency location' },
      ...serviceMarkers,
    ];
  }, [resultEmergency, services]);

  const formatConfidence = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : 'N/A';
  const formatProbability = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : 'N/A';
  const formatDistance = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} km away` : 'N/A';
  const formatSubmittedAt = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
  };
  const displayedProbabilities = aiInProgress || aiFailed ? {} : probabilities;
  const aiEvidenceFor = victimView?.explanation || aiEvidence;

  const renderEvidence = (label, result) => (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      {result ? (
        <p className="mt-1 text-sm text-slate-800">
          {result.prediction || 'Result unavailable'}
          {result.confidence === undefined ? '' : ` · ${formatConfidence(result.confidence)}`}
        </p>
      ) : <p className="mt-1 text-sm text-slate-600">{label === 'Text analysis' && !resultEmergency?.description ? 'No text analysis was submitted.' : label === 'Image analysis' && !resultEmergency?.imageUrl ? 'No image analysis was submitted.' : 'Analysis evidence is not available.'}</p>}
    </div>
  );

  const actionStatusLabel = (status) => ({
    completed: 'Completed',
    pending: 'Pending',
    required: 'Required',
    not_required: 'Not Required',
  }[status] || 'N/A');

  const emergencyId = resultEmergency?.id || resultEmergency?._id || submittedEmergency?.id || submittedEmergency?._id;
  const emergencyStatus = resultEmergency?.status || submittedEmergency?.status || 'Status unavailable';
  const aiAnalysisComplete = ['Completed', 'Verification Required', 'completed'].includes(aiStatus);
  const responderAssigned = Boolean(resultEmergency?.assignedVolunteer);
  const responseComplete = ['In Progress', 'Resolved'].includes(emergencyStatus);
  const confirmationSteps = [
    { label: 'SOS Submitted', state: emergencyId ? 'completed' : 'pending' },
    { label: 'AI Analysis', state: aiFailed ? 'failed' : aiInProgress ? 'in_progress' : aiAnalysisComplete ? 'completed' : 'pending' },
    { label: 'Responder Assignment', state: responderAssigned ? 'completed' : 'pending' },
    { label: 'Emergency Response', state: responseComplete ? 'completed' : emergencyStatus === 'Cancelled' ? 'not_required' : 'pending' },
  ];

  const confirmationStepText = (state) => ({
    completed: '✓ Completed',
    in_progress: '⏳ In Progress',
    pending: '⏳ Pending',
    failed: '⚠ Unavailable',
    not_required: '— Not Required',
  }[state] || 'N/A');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div style={{ display: showSubmissionResult ? 'none' : undefined }}>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-700">SOS Submission</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Report an emergency</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Share what is happening, add a photo if available, and send your location so responders can act quickly.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="description" className="mb-2 block text-sm font-medium text-slate-700">
              Emergency description
            </label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={6}
              placeholder="Describe the incident, people affected, urgency, and any immediate risks."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-slate-900 outline-none transition focus:border-cyan-500"
            />
          </div>

          <div>
            <label htmlFor="imageUpload" className="mb-2 block text-sm font-medium text-slate-700">
              Image upload (optional)
            </label>
            <input
              ref={fileInputRef}
              id="imageUpload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageSelection}
              className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            <p className="mt-2 text-xs text-slate-500">Max file size: 5MB. JPG, PNG, and WEBP supported.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="latitude" className="mb-2 block text-sm font-medium text-slate-700">
                Latitude
              </label>
              <input
                id="latitude"
                name="latitude"
                type="number"
                step="any"
                value={form.latitude}
                onChange={handleChange}
                placeholder="19.0760"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 outline-none transition focus:border-cyan-500"
                required
              />
            </div>

            <div>
              <label htmlFor="longitude" className="mb-2 block text-sm font-medium text-slate-700">
                Longitude
              </label>
              <input
                id="longitude"
                name="longitude"
                type="number"
                step="any"
                value={form.longitude}
                onChange={handleChange}
                placeholder="72.8777"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 outline-none transition focus:border-cyan-500"
                required
              />
            </div>
          </div>

          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-cyan-900">Current location</p>
                <p className="text-sm text-cyan-700">{locationLabel}</p>
              </div>

              <button
                type="button"
                onClick={handleGetCurrentLocation}
                disabled={isLocating}
                className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLocating ? 'Locating...' : 'Use my location'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="contactInfo" className="mb-2 block text-sm font-medium text-slate-700">
              Optional contact information
            </label>
            <input
              id="contactInfo"
              name="contactInfo"
              type="text"
              value={form.contactInfo}
              onChange={handleChange}
              placeholder="Phone, alternate contact, or safe point-of-contact"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 outline-none transition focus:border-cyan-500"
            />
          </div>

          <div>
            <label htmlFor="priority" className="mb-2 block text-sm font-medium text-slate-700">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              value={form.priority}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 outline-none transition focus:border-cyan-500"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Submitting SOS...' : 'Submit SOS'}
          </button>
        </form>

        <aside className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
          <h2 className="text-xl font-semibold">Emergency preview</h2>

          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Status</p>
            <p className="mt-2 text-lg font-semibold text-cyan-300">Not Submitted</p>
          </div>

          {imagePreview ? (
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-700">
              <img src={imagePreview} alt="Emergency preview" className="h-64 w-full object-cover" />
            </div>
          ) : (
            <div className="mt-5 flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800 text-sm text-slate-300">
              No image attached yet
            </div>
          )}

          <div className="mt-5 space-y-3 text-sm text-slate-200">
            <div>
              <p className="text-slate-400">Description</p>
              <p>{form.description || 'Not provided yet'}</p>
            </div>
            <div>
              <p className="text-slate-400">Coordinates</p>
              <p>{form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : 'Not available'}</p>
            </div>
            <div>
              <p className="text-slate-400">Contact</p>
              <p>{form.contactInfo || 'No contact added'}</p>
            </div>
          </div>
        </aside>
      </div>
      </div>

      {showSubmissionResult && submittedEmergency && (
        <div ref={submissionResultRef} className="mt-6 space-y-6">
          <button
            type="button"
            onClick={handleBackToSos}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            ← Back to SOS
          </button>

          <section
            className="overflow-hidden rounded-2xl border-2 border-red-300 bg-white shadow-lg"
            aria-label="SOS submission confirmation"
            aria-live="assertive"
            aria-atomic="true"
          >
            <div className="bg-red-800 px-5 py-7 text-center text-white sm:px-8 sm:py-9">
              <div aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-white/15 text-4xl sm:h-20 sm:w-20 sm:text-5xl">🚨</div>
              <h2 className="mt-4 text-2xl font-extrabold leading-tight sm:text-3xl">SOS SUBMITTED SUCCESSFULLY</h2>
              <p className="mx-auto mt-3 max-w-2xl text-lg font-semibold leading-relaxed sm:text-xl">
                Your emergency has been reported successfully.
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-base leading-relaxed text-red-50 sm:text-lg">
                {aiFailed
                  ? 'Your emergency has still been recorded and can be handled by responders.'
                  : 'AI analysis and emergency response coordination are now in progress.'}
              </p>
            </div>

            <div className="p-5 sm:p-7">
              {aiFailed ? (
                <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <p className="font-semibold">⚠ AI analysis is temporarily unavailable.</p>
                  <p className="mt-1 text-sm">Your emergency has still been recorded and can be handled by responders.</p>
                </div>
              ) : null}
              {aiAssessment?.verificationRequired || resultEmergency?.verificationRequired ? (
                <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <p className="font-semibold">⚠ VERIFICATION REQUIRED</p>
                  <p className="mt-1 text-sm">The AI models produced conflicting information. Please verify the emergency details.</p>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-slate-500">Emergency ID</p>
                  <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900 sm:text-base">{emergencyId || 'N/A'}</p>
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Submitted At</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatSubmittedAt(resultEmergency?.createdAt || submittedEmergency?.createdAt)}</p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-xs font-semibold uppercase text-slate-500">Current status</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{emergencyStatus}</p>
                </div>
              </div>

              <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Emergency response progress">
                {confirmationSteps.map((step, index) => (
                  <li key={step.label} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 p-3 sm:flex-col sm:gap-2 sm:p-4">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.state === 'completed' ? 'bg-emerald-100 text-emerald-800' : step.state === 'failed' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`} aria-hidden="true">
                      {step.state === 'completed' ? '✓' : step.state === 'failed' ? '!' : step.state === 'in_progress' ? '…' : index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{step.label}</p>
                      <p className={`mt-1 text-sm ${step.state === 'completed' ? 'font-medium text-emerald-800' : step.state === 'failed' ? 'font-medium text-amber-800' : step.state === 'in_progress' ? 'font-medium text-cyan-800' : 'text-slate-600'}`}>
                        {confirmationStepText(step.state)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              {resultError && <p role="alert" className="mt-4 text-sm text-rose-700">Response details could not be refreshed: {resultError}</p>}
              {success && !aiFailed && <p className="sr-only" role="status">{success}</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="model-predictions-heading">
            <h2 id="model-predictions-heading" className="text-xl font-semibold text-slate-900">Model Predictions</h2>
            <h3 className="mt-4 text-base font-semibold text-slate-800">AI Emergency Assessment</h3>
            {aiAssessment?.verificationRequired || resultEmergency?.verificationRequired ? (
              <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <p className="font-semibold">Verification Required</p>
                <p className="mt-1 text-sm">The text and image analysis produced conflicting results. Please verify the emergency information.</p>
              </div>
            ) : aiFailed ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">AI analysis is temporarily unavailable.</p>
            ) : aiInProgress ? (
              <p className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-900">Analyzing emergency...</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Prediction</p>
                  <p className="mt-1 font-medium text-slate-900">{prediction || 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Confidence</p>
                  <p className="mt-1 font-medium text-slate-900">{formatConfidence(aiAssessment?.confidence ?? resultEmergency?.aiConfidence)}</p>
                </div>
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-800">Probability breakdown</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {['Fire', 'Flood', 'Accident'].map((name) => (
                  <div key={name} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{name}</span>
                    <span className="font-medium">{formatProbability(displayedProbabilities[name])}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {renderEvidence('Text analysis', aiEvidenceFor.textEvidence || aiEvidenceFor.textPrediction)}
              {renderEvidence('Image analysis', aiEvidenceFor.imageEvidence || aiEvidenceFor.imagePrediction)}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Fusion</p>
                <p className="mt-1 text-sm text-slate-800">
                  {aiEvidence.fusion?.prediction
                    ? `${aiEvidence.fusion.prediction}${aiEvidence.fusion.modality ? ` · ${aiEvidence.fusion.modality}` : ''}`
                    : aiInProgress ? 'Fusion result will appear when analysis completes.' : 'Fusion result is not available.'}
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <h3 className="font-semibold text-slate-900">XAI Explanation</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {resultEmergency?.aiExplanation
                  || (aiInProgress ? 'The explanation will appear when analysis completes.' : 'AI explanation is not available for this analysis.')}
              </p>
              {aiEvidenceFor.textEvidence || aiEvidenceFor.textPrediction ? (
                <p className="mt-3 text-sm text-slate-600">Text evidence: {aiEvidenceFor.textEvidence?.prediction || aiEvidenceFor.textPrediction?.prediction || 'N/A'}</p>
              ) : resultEmergency?.description ? (
                <p className="mt-3 text-sm text-slate-600">Text evidence is not available.</p>
              ) : null}
              {aiEvidenceFor.imageEvidence || aiEvidenceFor.imagePrediction ? (
                <p className="mt-2 text-sm text-slate-600">Image evidence: {aiEvidenceFor.imageEvidence?.prediction || aiEvidenceFor.imagePrediction?.prediction || 'N/A'}</p>
              ) : resultEmergency?.imageUrl ? (
                <p className="mt-2 text-sm text-slate-600">Image evidence is not available.</p>
              ) : null}
              {!resultEmergency?.description && !resultEmergency?.imageUrl && <p className="mt-3 text-sm text-slate-500">No text or image evidence was submitted.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="recommended-actions-heading">
            <h2 id="recommended-actions-heading" className="text-xl font-semibold text-slate-900">Recommended Actions</h2>
            {aiAssessment?.verificationRequired || resultEmergency?.verificationRequired ? (
              <p className="mt-3 text-sm text-slate-600">Victim guidance is unavailable until the conflicting analysis is verified.</p>
            ) : aiFailed ? (
              <p className="mt-3 text-sm text-slate-600">Recommendations are unavailable because AI analysis failed.</p>
            ) : aiInProgress ? (
              <p className="mt-3 text-sm text-slate-600">Recommended actions will appear after analysis.</p>
            ) : victimView?.recommendedActions?.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                {victimView.recommendedActions.map((action) => <li key={action}>{action}</li>)}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-600">No prediction-based actions are available.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="required-actions-heading">
            <h2 id="required-actions-heading" className="text-xl font-semibold text-slate-900">Required Emergency Actions</h2>
            {resultLoading && !victimView ? (
              <p className="mt-3 text-sm text-slate-600">Loading response workflow...</p>
            ) : victimView?.requiredEmergencyActions?.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {victimView.requiredEmergencyActions.map((action) => (
                  <li key={action.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="text-slate-800">{action.label}</span>
                    <span className={`font-medium ${action.status === 'completed' ? 'text-emerald-700' : action.status === 'required' ? 'text-rose-700' : action.status === 'pending' ? 'text-amber-700' : 'text-slate-500'}`}>
                      {actionStatusLabel(action.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-600">Response workflow information is not available.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="nearby-services-heading">
            <h2 id="nearby-services-heading" className="text-xl font-semibold text-slate-900">Nearby Emergency Services</h2>
            {servicesLoading && !services ? (
              <p className="mt-3 text-sm text-slate-600">Finding nearby emergency services...</p>
            ) : (
              <>
                {services && !services.hospitals.length && !services.shelters.length && !services.resources.length && (
                  <p className="mt-3 text-sm text-slate-600">No nearby emergency services found for this location.</p>
                )}
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {[
                    ['Nearby Hospitals', services?.hospitals || [], (service) => `${service.type || 'Hospital'}${service.availableBeds === undefined ? '' : ` · ${service.availableBeds} beds available`}`],
                    ['Nearby Shelters', services?.shelters || [], (service) => `${service.availableSlots === undefined ? 'Shelter' : `${service.availableSlots} slots available`}`],
                    ['Nearby Resources', services?.resources || [], (service) => `${service.type || 'Resource'}${service.quantity === undefined ? '' : ` · ${service.quantity} available`}`],
                  ].map(([title, entries, describe]) => (
                    <div key={title}>
                      <h3 className="font-semibold text-slate-800">{title}</h3>
                      {entries.length ? (
                        <ul className="mt-2 space-y-2">
                          {entries.map((service) => (
                            <li key={service.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                              <p className="font-medium text-slate-900">{service.name || 'N/A'}</p>
                              <p className="mt-1 text-slate-600">{formatDistance(service.distanceKm)}</p>
                              <p className="mt-1 text-slate-600">{describe(service)}</p>
                              {service.contact ? <p className="mt-1 text-slate-600">{service.contact}</p> : null}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="mt-2 text-sm text-slate-500">No nearby records.</p>}
                    </div>
                  ))}
                </div>
                {mapMarkers.length > 0 && (
                  <div className="mt-5">
                    <h3 className="mb-2 font-semibold text-slate-800">Service map</h3>
                    <div className="h-72 overflow-hidden rounded-xl border border-slate-200">
                      <MapView
                        center={[Number(resultEmergency.latitude), Number(resultEmergency.longitude)]}
                        zoom={12}
                        markers={mapMarkers}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
