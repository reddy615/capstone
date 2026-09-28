import { useEffect, useMemo, useState } from 'react';
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
    <Card title="Emergency details">
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
          <span>Last updated: {formatDate(emergency.updatedAt || emergency.aiUpdatedAt)}</span>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="font-semibold text-slate-900">AI analysis</h3>
          <div className="mt-2 grid gap-2 text-slate-600 md:grid-cols-2">
            <span>Prediction: {emergency.aiPrediction || 'Verification Required / unresolved'}</span>
            <span>Confidence: {typeof emergency.aiConfidence === 'number' ? `${Math.round(emergency.aiConfidence * 100)}%` : 'Unavailable'}</span>
            <span>Probabilities: {Object.entries(probabilities).map(([name, value]) => `${name} ${Math.round(value * 100)}%`).join(' | ') || 'Unavailable'}</span>
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
    </Card>
  );
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [emergencies, setEmergencies] = useState([]);
  const [stats, setStats] = useState({ active: 0, critical: 0, high: 0, verification: 0, assigned: 0, inProgress: 0, resolved: 0 });
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const isResponder = responderRoles.has(user?.role);

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
      const endpoint = isResponder ? '/emergencies/active' : '/emergencies/my';
      const responses = await Promise.all([
        fetch(`${apiBase}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } }),
        ...(isResponder ? [fetch(`${apiBase}/emergencies/stats`, { headers: { Authorization: `Bearer ${token}` } })] : []),
      ]);
      const emergencyData = await responses[0].json();
      if (!responses[0].ok) throw new Error(emergencyData.message || 'Unable to load emergencies.');
      setEmergencies(emergencyData.emergencies || []);
      if (isResponder) {
        const statsData = await responses[1].json();
        if (responses[1].ok) setStats(statsData.stats);
      }
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  const selectEmergency = async (emergency) => {
    setSelectedEmergency(emergency);
    const emergencyId = emergency._id || emergency.id;
    try {
      const response = await fetch(`${apiBase}/emergencies/${emergencyId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (response.ok && data.emergency) {
        upsertEmergency(data.emergency);
        setSelectedEmergency(data.emergency);
      }
    } catch {
      // The summary remains visible when the detail request is unavailable.
    }
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
  }, [token, isResponder]);

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

  const summaryStats = isResponder ? [
    ['Active Emergencies', stats.active], ['Critical', stats.critical], ['High Priority', stats.high], ['Pending Verification', stats.verification], ['Assigned', stats.assigned], ['In Progress', stats.inProgress], ['Resolved', stats.resolved],
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-700">ReliefLink operations</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{isResponder ? 'Live emergency coordination' : 'Your emergency response'}</h1>
          <p className="mt-2 text-slate-600">{isResponder ? 'Operational data from registered emergencies and response records.' : 'Monitor your submitted emergency and response updates.'}</p>
        </div>
        <StatusBadge text={user?.role || 'victim'} tone="blue" />
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {isResponder && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{summaryStats.map(([label, value]) => <Card key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></Card>)}</div>}

      {notifications.length > 0 && <Card title="Live notifications"><div className="space-y-2 text-sm text-slate-700">{notifications.map((notification) => <p key={notification.id} className="border-b border-slate-100 pb-2 last:border-0">{notification.text}</p>)}</div></Card>}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card title={`Emergencies (${emergencies.length})`}>
          {!emergencies.length && <p className="text-sm text-slate-500">No stored emergencies available.</p>}
          <div className="space-y-3">
            {emergencies.map((emergency) => <button type="button" key={emergencyKey(emergency)} onClick={() => selectEmergency(emergency)} className="w-full rounded-lg border border-slate-200 p-4 text-left transition hover:border-cyan-400">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{emergency.type || emergency.aiPrediction || 'Verification Required'}</p><p className="mt-1 text-xs text-slate-500">{emergency._id || emergency.id}</p></div><div className="flex gap-2"><StatusBadge text={emergency.priority || 'Medium'} tone={toneFor(emergency.priority)} /><StatusBadge text={emergency.status || emergency.aiStatus || 'Submitted'} tone={toneFor(emergency.status || emergency.aiStatus)} /></div></div>
              <div className="mt-3 grid gap-1 text-sm text-slate-600 md:grid-cols-2"><span>Confidence: {typeof emergency.aiConfidence === 'number' ? `${Math.round(emergency.aiConfidence * 100)}%` : 'Unavailable'}</span><span>Volunteer: {emergency.assignedVolunteer?.user?.name || emergency.assignedVolunteer?.name || 'Unassigned'}</span><span>Location: {typeof emergency.latitude === 'number' ? `${emergency.latitude}, ${emergency.longitude}` : 'Location unavailable.'}</span><span>Created: {formatDate(emergency.createdAt)}</span></div>
            </button>)}
          </div>
        </Card>
        <Card title="Live emergency map"><MapView markers={markers} onMarkerSelect={selectEmergency} /><p className="mt-2 text-xs text-slate-500">{markers.length} emergency marker(s) with stored coordinates. Location unavailable records are excluded.</p></Card>
      </div>

      {selectedEmergency && <EmergencyDetails emergency={selectedEmergency} role={user?.role} token={token} onUpdated={upsertEmergency} />}
    </div>
  );
}
