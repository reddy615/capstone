import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import MapView from '../components/MapView';

const responderRoles = new Set(['volunteer', 'ngo', 'hospital', 'authority', 'admin']);
const eventNames = [
  'emergency:created',
  'emergency:ai-processing',
  'emergency:ai-completed',
  'emergency:verification-required',
  'emergency:priority-updated',
  'emergency:volunteer-assigned',
  'emergency:facility-recommended',
  'emergency:ai-failed',
  'emergency:status-updated',
];

const toneFor = (value) => {
  if (value === 'Critical' || value === 'Verification Required' || value === 'Failed') return 'red';
  if (value === 'High' || value === 'AI Processing' || value === 'Processing') return 'yellow';
  if (value === 'Resolved' || value === 'Confirmed' || value === 'Assigned') return 'green';
  return 'blue';
};

const emergencyKey = (emergency) => String(emergency._id || emergency.id || emergency.emergencyId);

const formatDate = (value) => value ? new Date(value).toLocaleString() : 'Unavailable';
const emergencyFilterOptions = [
  { value: 'all', label: 'All', title: 'All Emergencies', countKey: 'total' },
  { value: 'active', label: 'Active', title: 'Active Emergencies', countKey: 'active' },
  { value: 'critical', label: 'Critical', title: 'Critical Emergencies', countKey: 'critical' },
  { value: 'high', label: 'High Priority', title: 'High Priority Emergencies', countKey: 'high' },
  { value: 'pending-verification', label: 'Pending Verification', title: 'Pending Verification', countKey: 'verification' },
  { value: 'assigned', label: 'Assigned', title: 'Assigned Emergencies', countKey: 'assigned' },
  { value: 'in-progress', label: 'In Progress', title: 'In Progress Emergencies', countKey: 'inProgress' },
  { value: 'resolved', label: 'Resolved', title: 'Resolved Emergencies', countKey: 'resolved' },
];

const requiresVerification = (emergency) => emergency.verificationRequired === true
  || emergency.aiStatus === 'Verification Required'
  || emergency.status === 'Verification Required';

function EmergencyDetails({ emergency, role, token, onUpdated }) {
  const [status, setStatus] = useState(emergency.status || 'Submitted');
  const [statusError, setStatusError] = useState('');
  const canUpdate = responderRoles.has(role) && role !== 'hospital';
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const evidence = emergency.aiEvidence || {};
  const probabilities = emergency.aiProbabilities instanceof Map
    ? Object.fromEntries(emergency.aiProbabilities)
    : emergency.aiProbabilities || {};
  const facilities = emergency.recommendations?.facilities || [];
  const resources = emergency.recommendations?.resources || [];

  const formatProbabilities = Object.entries(probabilities)
    .map(([name, value]) => `${name} ${Math.round(value * 100)}%`)
    .join(' | ');

  useEffect(() => setStatus(emergency.status || 'Submitted'), [emergency.status]);

  const updateStatus = async (event) => {
    const nextStatus = event.target.value;
    setStatusError('');
    try {
      const response = await fetch(`${apiBase}/emergencies/${emergency._id || emergency.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to update status.');
      onUpdated(data.emergency);
    } catch (error) {
      setStatusError(error.message);
    }
  };

  return (
    <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Emergency ID</p>
            <p className="mt-1 font-semibold text-slate-900">{emergency._id || emergency.id}</p>
          </div>
          <div className="flex gap-2">
            <StatusBadge text={emergency.type || emergency.aiPrediction || 'Unresolved'} tone={toneFor(emergency.type || emergency.aiPrediction)} />
            <StatusBadge text={emergency.priority || 'Medium'} tone={toneFor(emergency.priority)} />
          </div>
        </div>
        <p className="text-slate-700">{emergency.description || 'No text description provided.'}</p>
        <div className="grid gap-2 text-slate-600 md:grid-cols-2">
          <span>Location: {typeof emergency.latitude === 'number' && typeof emergency.longitude === 'number' ? `${emergency.latitude}, ${emergency.longitude}` : 'Location unavailable.'}</span>
          <span>Created: {formatDate(emergency.createdAt)}</span>
          <span>Current status: {emergency.status || 'Unavailable'}</span>
          <span>AI status: {emergency.aiStatus || 'Unavailable'}</span>
          <span>Assigned volunteer: {emergency.assignedVolunteer?.user?.name || emergency.assignedVolunteer?.name || 'Unassigned'}</span>
          <span>Verification required: {requiresVerification(emergency) ? 'Yes' : emergency.verifiedPrediction ? 'Verified' : 'No'}</span>
          <span>Last updated: {formatDate(emergency.updatedAt || emergency.aiUpdatedAt)}</span>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="font-semibold text-slate-900">AI analysis</h3>
          <div className="mt-2 grid gap-2 text-slate-600 md:grid-cols-2">
            <span>Prediction: {emergency.aiPrediction || 'Verification Required / unresolved'}</span>
            <span>Confidence: {typeof emergency.aiConfidence === 'number' ? `${Math.round(emergency.aiConfidence * 100)}%` : 'Unavailable'}</span>
            <span>Probabilities: {formatProbabilities || 'Unavailable'}</span>
            <span>Modality: {emergency.aiModalityContribution ? JSON.stringify(emergency.aiModalityContribution) : 'Unavailable'}</span>
          </div>
          {emergency.aiExplanation && <p className="mt-2 text-slate-700">{emergency.aiExplanation}</p>}
          {evidence.textPrediction && <p className="mt-2 text-slate-600">Text evidence: {evidence.textPrediction.prediction} ({Math.round(evidence.textPrediction.confidence * 100)}%)</p>}
          {evidence.imagePrediction && <p className="mt-1 text-slate-600">Image evidence: {evidence.imagePrediction.prediction} ({Math.round(evidence.imagePrediction.confidence * 100)}%)</p>}
        </div>

        {emergency.aiStatus === 'Verification Required' && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">
            <p className="font-semibold">Verification Required</p>
            <p className="mt-1">The unresolved modality result must not be treated as a confirmed emergency class.</p>
            <p className="mt-1">Verification: {emergency.verifiedPrediction || 'Pending human review'}</p>
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <h3 className="font-semibold text-slate-900">Recommendations and resources</h3>
          {facilities.length ? facilities.map((facility) => <p key={facility._id || facility.name} className="mt-2 text-slate-700">{facility.name} {facility.availableBeds !== undefined ? `(${facility.availableBeds} beds)` : facility.availableSlots !== undefined ? `(${facility.availableSlots} slots)` : ''}</p>) : <p className="mt-2 text-slate-600">{emergency.recommendations?.facilityMessage || 'No suitable registered facility available.'}</p>}
          {resources.length ? resources.map((resource) => <p key={resource._id || resource.name} className="mt-1 text-slate-700">Resource: {resource.name} ({resource.quantity} available)</p>) : <p className="mt-2 text-slate-600">No matching registered resources available.</p>}
        </div>

        {canUpdate && (
          <label className="block text-slate-700">Update response status
            <select value={status} onChange={updateStatus} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              {['Submitted', 'Processing', 'Detected', 'Verification Required', 'Assigned', 'In Progress', 'Resolved', 'Cancelled', 'Failed'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        )}
        {statusError && <p className="text-sm text-rose-700">{statusError}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const location = useLocation();
  const [emergencies, setEmergencies] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, critical: 0, high: 0, verification: 0, assigned: 0, inProgress: 0, resolved: 0 });
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [selectedEmergencyId, setSelectedEmergencyId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const selectedEmergencyIdRef = useRef(null);
  const modalCloseButtonRef = useRef(null);
  const modalTriggerRef = useRef(null);
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const isResponder = responderRoles.has(user?.role);
  const isEmergencyView = location.pathname === '/emergencies';
  const selectedFilter = new URLSearchParams(location.search).get('filter') || 'all';
  const selectedFilterOption = emergencyFilterOptions.find((option) => option.value === selectedFilter);

  const upsertEmergency = (incoming) => {
    if (!incoming) return;
    const key = emergencyKey(incoming);
    setEmergencies((current) => {
      const existing = current.find((item) => emergencyKey(item) === key);
      const merged = existing ? { ...existing, ...incoming } : incoming;
      return existing ? current.map((item) => emergencyKey(item) === key ? merged : item) : [merged, ...current];
    });
    setSelectedEmergency((current) => current && emergencyKey(current) === key ? { ...current, ...incoming } : current);
  };

  const loadDashboard = async () => {
    try {
      setError('');
      const endpoint = isResponder
        ? isEmergencyView ? `/emergencies?filter=${encodeURIComponent(selectedFilter)}` : '/emergencies/active'
        : '/emergencies/my';
      const shouldLoadStats = isResponder;
      const responses = await Promise.all([
        fetch(`${apiBase}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } }),
        ...(shouldLoadStats ? [fetch(`${apiBase}/emergencies/stats`, { headers: { Authorization: `Bearer ${token}` } })] : []),
      ]);
      const emergencyData = await responses[0].json();
      if (!responses[0].ok) {
        if (isEmergencyView && isResponder) setEmergencies([]);
        throw new Error(emergencyData.message || 'Unable to load emergencies.');
      }
      const loadedEmergencies = emergencyData.emergencies || [];
      setEmergencies(loadedEmergencies);
      setSelectedEmergency((current) => current && loadedEmergencies.some((emergency) => emergencyKey(emergency) === emergencyKey(current)) ? current : null);
      if (shouldLoadStats) {
        const statsData = await responses[1].json();
        if (responses[1].ok) setStats(statsData.stats);
      }
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  const loadEmergencyDetails = async (emergencyId) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await fetch(`${apiBase}/emergencies/${encodeURIComponent(emergencyId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok || !data.emergency) throw new Error('Unable to load emergency details.');
      if (String(selectedEmergencyIdRef.current) !== String(emergencyId)) return;
      if (response.ok && data.emergency) {
        upsertEmergency(data.emergency);
        setSelectedEmergency(data.emergency);
      }
    } catch {
      if (String(selectedEmergencyIdRef.current) === String(emergencyId)) {
        setDetailError('Unable to load emergency details.');
      }
    } finally {
      if (String(selectedEmergencyIdRef.current) === String(emergencyId)) setDetailLoading(false);
    }
  };

  const selectEmergency = (emergency, triggerElement = document.activeElement) => {
    const emergencyId = emergency._id || emergency.id || emergency.emergencyId;
    if (!emergencyId) return;
    modalTriggerRef.current = triggerElement;
    selectedEmergencyIdRef.current = String(emergencyId);
    setSelectedEmergencyId(String(emergencyId));
    setSelectedEmergency(null);
    loadEmergencyDetails(emergencyId);
  };

  const closeEmergencyDetails = () => {
    selectedEmergencyIdRef.current = null;
    setSelectedEmergencyId(null);
    setSelectedEmergency(null);
    setDetailLoading(false);
    setDetailError('');
    const trigger = modalTriggerRef.current;
    if (trigger?.isConnected) window.requestAnimationFrame(() => trigger.focus());
  };

  useEffect(() => {
    if (!token) return undefined;
    loadDashboard();
    const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin);
    const handlers = eventNames.map((eventName) => {
      const handler = (payload) => {
        const incoming = payload?.emergency || payload;
        upsertEmergency(incoming);
        setNotifications((current) => {
          const notificationId = `${eventName}-${emergencyKey(incoming)}-${incoming?.updatedAt || incoming?.aiUpdatedAt || ''}`;
          if (current.some((item) => item.id === notificationId)) return current;
          return [{ id: notificationId, text: `${eventName.replace('emergency:', '').replaceAll('-', ' ')}: ${incoming?.type || incoming?.aiPrediction || incoming?.emergencyId || 'emergency'}` }, ...current].slice(0, 8);
        });
        loadDashboard();
      };
      socket.on(eventName, handler);
      return [eventName, handler];
    });
    return () => {
      handlers.forEach(([eventName, handler]) => socket.off(eventName, handler));
      socket.disconnect();
    };
  }, [token, isResponder, location.pathname, selectedFilter]);

  useEffect(() => {
    setSelectedEmergency(null);
    selectedEmergencyIdRef.current = null;
    setSelectedEmergencyId(null);
    setDetailLoading(false);
    setDetailError('');
  }, [location.pathname, selectedFilter]);

  useEffect(() => {
    if (!selectedEmergencyId) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeEmergencyDetails();
    };
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    modalCloseButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedEmergencyId]);

  const markers = useMemo(() => emergencies.filter((emergency) => typeof emergency.latitude === 'number' && typeof emergency.longitude === 'number').map((emergency) => ({
    id: emergencyKey(emergency),
    emergency,
    position: [emergency.latitude, emergency.longitude],
    type: emergency.type || emergency.aiPrediction || 'Verification Required',
    priority: emergency.priority,
    confidence: emergency.aiConfidence,
    status: emergency.status,
    assignedVolunteer: emergency.assignedVolunteer,
  })), [emergencies]);

  const detailMapMarkers = selectedEmergency && typeof selectedEmergency.latitude === 'number' && typeof selectedEmergency.longitude === 'number'
    ? [{
      id: emergencyKey(selectedEmergency),
      emergency: selectedEmergency,
      position: [selectedEmergency.latitude, selectedEmergency.longitude],
      type: selectedEmergency.type || selectedEmergency.aiPrediction || 'Verification Required',
      priority: selectedEmergency.priority,
      confidence: selectedEmergency.aiConfidence,
      status: selectedEmergency.status,
      assignedVolunteer: selectedEmergency.assignedVolunteer,
    }]
    : [];

  const summaryStats = isResponder ? [
    { label: 'Active Emergencies', value: stats.active, filter: 'active' },
    { label: 'Critical', value: stats.critical, filter: 'critical' },
    { label: 'High Priority', value: stats.high, filter: 'high' },
    { label: 'Pending Verification', value: stats.verification, filter: 'pending-verification' },
    { label: 'Assigned', value: stats.assigned, filter: 'assigned' },
    { label: 'In Progress', value: stats.inProgress, filter: 'in-progress' },
    { label: 'Resolved', value: stats.resolved, filter: 'resolved' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-700">ReliefLink operations</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{isEmergencyView ? 'Emergencies' : isResponder ? 'Live emergency coordination' : 'Your emergency response'}</h1>
          <p className="mt-2 text-slate-600">{isEmergencyView && isResponder ? `Filter: ${selectedFilterOption?.label || selectedFilter}` : isResponder ? 'Operational data from registered emergencies and response records.' : 'Monitor your submitted emergency and response updates.'}</p>
        </div>
        <StatusBadge text={user?.role || 'victim'} tone="blue" />
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {isResponder && !isEmergencyView && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{summaryStats.map(({ label, value, filter }) => (
        <Link key={filter} to={`/emergencies?filter=${filter}`} aria-label={`View ${label} emergencies`} className="group block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600 focus-visible:outline-offset-2">
          <Card className="h-full transition duration-150 group-hover:-translate-y-0.5 group-hover:border-cyan-300 group-hover:shadow-md">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          </Card>
        </Link>
      ))}</div>}

      {notifications.length > 0 && <Card title="Live notifications"><div className="space-y-2 text-sm text-slate-700">{notifications.map((notification) => <p key={notification.id} className="border-b border-slate-100 pb-2 last:border-0">{notification.text}</p>)}</div></Card>}

      {isResponder && isEmergencyView && <nav aria-label="Emergency filters" className="flex flex-wrap gap-2">
        {emergencyFilterOptions.map((option) => (
          <Link
            key={option.value}
            to={`/emergencies?filter=${option.value}`}
            aria-current={selectedFilter === option.value ? 'page' : undefined}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600 ${selectedFilter === option.value ? 'border-cyan-600 bg-cyan-50 text-cyan-900' : 'border-slate-300 bg-white text-slate-700 hover:border-cyan-400 hover:bg-cyan-50'}`}
          >
            {option.label}{' '}
            <span className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${selectedFilter === option.value ? 'bg-white text-cyan-800' : 'bg-slate-100 text-slate-600'}`}>
              ({stats[option.countKey] ?? 0})
            </span>
          </Link>
        ))}
      </nav>}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card title={`${isEmergencyView && isResponder ? selectedFilterOption?.title || 'Filtered Emergencies' : 'Emergencies'} (${emergencies.length})`}>
          {!emergencies.length && <p className="text-sm text-slate-500">{isEmergencyView && isResponder ? 'No emergencies found for this filter.' : 'No stored emergencies available.'}</p>}
          <div className="space-y-3">
            {emergencies.map((emergency) => <button type="button" key={emergencyKey(emergency)} aria-haspopup="dialog" aria-label={`Open emergency ${emergencyKey(emergency)}: ${emergency.description || emergency.type || 'Emergency details'}`} onClick={(event) => selectEmergency(emergency, event.currentTarget)} className="w-full cursor-pointer rounded-lg border border-slate-200 p-4 text-left transition hover:border-cyan-400 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{emergency.type || emergency.aiPrediction || (requiresVerification(emergency) ? 'Verification Required' : 'Unresolved')}</p><p className="mt-1 text-xs text-slate-500">Emergency ID: {emergency._id || emergency.id}</p></div><div className="flex gap-2"><StatusBadge text={emergency.priority || 'Medium'} tone={toneFor(emergency.priority)} /><StatusBadge text={emergency.status || emergency.aiStatus || 'Submitted'} tone={toneFor(emergency.status || emergency.aiStatus)} /></div></div>
              <p className="mt-3 text-sm text-slate-700">{emergency.description || 'No text description provided.'}</p>
              <div className="mt-3 grid gap-1 text-sm text-slate-600 md:grid-cols-2"><span>Confidence: {typeof emergency.aiConfidence === 'number' ? `${Math.round(emergency.aiConfidence * 100)}%` : 'Unavailable'}</span><span>Volunteer: {emergency.assignedVolunteer?.user?.name || emergency.assignedVolunteer?.name || 'Unassigned'}</span><span>Location: {typeof emergency.latitude === 'number' && typeof emergency.longitude === 'number' ? `${emergency.latitude}, ${emergency.longitude}` : 'Location unavailable.'}</span><span>Created: {formatDate(emergency.createdAt)}</span><span>Verification required: {requiresVerification(emergency) ? 'Yes' : emergency.verifiedPrediction ? 'Verified' : 'No'}</span></div>
            </button>)}
          </div>
        </Card>
        <Card title="Live emergency map"><MapView markers={markers} onMarkerSelect={selectEmergency} /><p className="mt-2 text-xs text-slate-500">{markers.length} emergency marker(s) with stored coordinates. Location unavailable records are excluded.</p></Card>
      </div>

      {selectedEmergencyId && createPortal(<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEmergencyDetails(); }}>
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="emergency-details-title"
          className="max-h-[88vh] w-full max-w-6xl overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl"
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            const focusable = [...event.currentTarget.querySelectorAll('button:not([disabled]), select:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
            <h2 id="emergency-details-title" className="text-xl font-semibold text-slate-900">Emergency Details</h2>
            <button ref={modalCloseButtonRef} type="button" onClick={closeEmergencyDetails} aria-label="Close emergency details" title="Close" className="flex h-9 w-9 items-center justify-center rounded-md text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600">×</button>
          </div>
          <div className="p-5 sm:p-7">
            {detailLoading && <p role="status" className="py-8 text-center text-sm text-slate-600">Loading emergency details...</p>}
            {!detailLoading && detailError && <div role="alert" className="space-y-3 py-6 text-center">
              <p className="text-sm text-rose-700">Unable to load emergency details.</p>
              <button type="button" onClick={() => loadEmergencyDetails(selectedEmergencyId)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600">Retry</button>
            </div>}
            {!detailLoading && !detailError && selectedEmergency && <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
              <div className="min-w-0"><EmergencyDetails emergency={selectedEmergency} role={user?.role} token={token} onUpdated={upsertEmergency} /></div>
              <aside className="min-w-0 self-start rounded-lg border border-slate-200 p-3">
                <h3 className="mb-3 font-semibold text-slate-900">Emergency Map</h3>
                <MapView
                  center={detailMapMarkers[0]?.position}
                  zoom={detailMapMarkers.length ? 12 : 5}
                  markers={detailMapMarkers}
                  invalidateOnMount
                  zoomAnimation={false}
                  className="emergency-details-map"
                />
              </aside>
            </div>}
          </div>
          <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white px-5 py-3 sm:px-7">
            <button type="button" onClick={closeEmergencyDetails} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600 focus-visible:outline-offset-2">Close</button>
          </div>
        </section>
      </div>, document.body)}
    </div>
  );
}
