import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { label: 'Overview', href: '/admin' },
  { label: 'Emergencies', href: '/admin/emergencies' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Volunteers', href: '/admin/volunteers' },
  { label: 'Hospitals', href: '/admin/hospitals' },
  { label: 'Shelters', href: '/admin/shelters' },
  { label: 'Resources', href: '/admin/resources' },
  { label: 'AI Analytics', href: '/admin/analytics' },
  { label: 'Activity', href: '/admin/activity' },
  { label: 'Audit Logs', href: '/admin/audit-logs' },
  { label: 'System Health', href: '/admin/system' },
  { label: 'Reports', href: '/admin/reports' },
  { label: 'Admin Profile', href: '/admin/profile' },
];

const formatDate = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
};

const apiBase = import.meta.env.VITE_API_URL || '/api';

const fetchAdminJson = async (path, token) => {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
};

function StatCard({ label, value, tone = 'cyan' }) {
  const colors = {
    cyan: 'bg-cyan-50 text-cyan-900',
    red: 'bg-rose-50 text-rose-900',
    green: 'bg-emerald-50 text-emerald-900',
    amber: 'bg-amber-50 text-amber-900',
    slate: 'bg-slate-50 text-slate-900',
  };

  return (
    <div className={`rounded-xl border border-slate-200 p-4 ${colors[tone]}`}>
      <p className="text-xs uppercase tracking-[0.2em] opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function LoadingState() {
  return <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-600">Loading admin data...</div>;
}

export default function AdminPage() {
  const { user, token } = useAuth();
  const location = useLocation();
  const section = location.pathname.replace('/admin', '') || '/';
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [volunteers, setVolunteers] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [resources, setResources] = useState([]);
  const [activity, setActivity] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [system, setSystem] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !user) return;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [overviewData, usersData, emergenciesData, analyticsData, volunteersData, hospitalsData, sheltersData, resourcesData, activityData, auditLogsData, systemData, profileData] = await Promise.all([
          fetchAdminJson('/admin/overview', token),
          fetchAdminJson('/admin/users', token),
          fetchAdminJson('/admin/emergencies', token),
          fetchAdminJson('/admin/analytics', token),
          fetchAdminJson('/admin/volunteers', token),
          fetchAdminJson('/admin/hospitals', token),
          fetchAdminJson('/admin/shelters', token),
          fetchAdminJson('/admin/resources', token),
          fetchAdminJson('/admin/activity', token),
          fetchAdminJson('/admin/audit-logs', token),
          fetchAdminJson('/admin/system', token),
          fetchAdminJson('/admin/profile', token),
        ]);
        setOverview(overviewData.overview);
        setUsers(usersData.users || []);
        setEmergencies(emergenciesData.emergencies || []);
        setAnalytics(analyticsData.analytics || null);
        setVolunteers(volunteersData.volunteers || []);
        setHospitals(hospitalsData.hospitals || []);
        setShelters(sheltersData.shelters || []);
        setResources(resourcesData.resources || []);
        setActivity(activityData.activity || []);
        setAuditLogs(auditLogsData.auditLogs || []);
        setSystem(systemData.system || null);
        setProfile(profileData.user || null);
      } catch (loadError) {
        setError(loadError.message || 'Unable to load admin data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, user]);

  const roleCounts = useMemo(() => {
    const totals = { admin: 0, victim: 0, volunteer: 0, ngo: 0, hospital: 0, authority: 0 };
    users.forEach((entry) => {
      if (totals[entry.role] !== undefined) totals[entry.role] += 1;
    });
    return totals;
  }, [users]);

  const renderOverview = () => {
    if (!overview) return <LoadingState />;

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Users" value={overview.totalUsers} />
          <StatCard label="Emergencies" value={overview.totalEmergencies} />
          <StatCard label="Active" value={overview.activeEmergencies} tone="amber" />
          <StatCard label="Critical" value={overview.criticalEmergencies} tone="red" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Admins" value={overview.totalAdmins} tone="slate" />
          <StatCard label="Volunteers" value={overview.totalVolunteers} tone="green" />
          <StatCard label="NGOs" value={overview.totalNgo} tone="cyan" />
          <StatCard label="Hospitals" value={overview.totalHospitals} tone="amber" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Authorities" value={overview.totalAuthorities} />
          <StatCard label="Shelters" value={overview.totalShelters} />
          <StatCard label="Resources" value={overview.totalResources} />
          <StatCard label="Available Volunteers" value={overview.volunteersAvailable} tone="green" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">User mix</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              {Object.entries(roleCounts).map(([role, count]) => (
                <div key={role} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                  <span className="capitalize">{role}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Operational summary</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div className="flex justify-between"><span>Resolved</span><span>{overview.resolvedEmergencies}</span></div>
              <div className="flex justify-between"><span>Pending</span><span>{overview.pendingEmergencies}</span></div>
              <div className="flex justify-between"><span>High priority</span><span>{overview.highPriority}</span></div>
              <div className="flex justify-between"><span>Medium priority</span><span>{overview.mediumPriority}</span></div>
              <div className="flex justify-between"><span>Low priority</span><span>{overview.lowPriority}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUsers = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Users</h3>
        <span className="text-sm text-slate-500">{users.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{entry.name}</td>
                <td className="px-3 py-2">{entry.email}</td>
                <td className="px-3 py-2 capitalize">{entry.role}</td>
                <td className="px-3 py-2">{entry.isActive ? 'Active' : 'Inactive'}</td>
                <td className="px-3 py-2">{formatDate(entry.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderEmergencies = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Emergencies</h3>
        <span className="text-sm text-slate-500">{emergencies.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">AI</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {emergencies.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">{entry.aiPrediction || entry.verifiedPrediction || 'Not available'}</td>
                <td className="px-3 py-2">{entry.priority || 'Medium'}</td>
                <td className="px-3 py-2">{entry.status || 'Submitted'}</td>
                <td className="px-3 py-2">{entry.aiStatus || 'Pending'}</td>
                <td className="px-3 py-2">{formatDate(entry.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAnalytics = () => {
    if (!analytics) return <LoadingState />;

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total AI analyses" value={analytics.totalAIAnalyses} />
          <StatCard label="Successful" value={analytics.successfulAnalyses} tone="green" />
          <StatCard label="Failed" value={analytics.failedAnalyses} tone="red" />
          <StatCard label="Verification required" value={analytics.verificationRequired} tone="amber" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Fire" value={analytics.firePredictions} />
          <StatCard label="Flood" value={analytics.floodPredictions} />
          <StatCard label="Accident" value={analytics.accidentPredictions} />
          <StatCard label="Text-only" value={analytics.textOnlyAnalyses} />
          <StatCard label="Avg confidence" value={`${Number(analytics.averageConfidence || 0).toFixed(2)}%`} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">AI analysis detail</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2">Emergency</th>
                  <th className="px-3 py-2">Prediction</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {emergencies.slice(0, 20).map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{entry.id}</td>
                    <td className="px-3 py-2">{entry.aiPrediction || 'Not available'}</td>
                    <td className="px-3 py-2">{entry.aiStatus || 'Pending'}</td>
                    <td className="px-3 py-2">{typeof entry.aiConfidence === 'number' ? `${Math.round(entry.aiConfidence * 100)}%` : 'Not available'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderLists = (title, payload, columns) => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <span className="text-sm text-slate-500">{payload.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.map((entry, index) => (
              <tr key={entry.id || index} className="border-t border-slate-100">
                {columns.map((column) => (
                  <td key={`${entry.id || index}-${column}`} className="px-3 py-2">
                    {typeof entry[column] === 'boolean' ? (entry[column] ? 'Yes' : 'No') : (entry[column] || 'Not available')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {profile ? (
        <div className="space-y-4 text-sm text-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-slate-900">Administrator profile</h3>
            <button type="button" className="rounded-md bg-cyan-600 px-3 py-2 text-white">Reset Password</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Name</p><p className="mt-1 font-medium text-slate-900">{profile.name}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Email</p><p className="mt-1 font-medium text-slate-900">{profile.email}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Phone</p><p className="mt-1 font-medium text-slate-900">{profile.phone || 'Not available'}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Role</p><p className="mt-1 font-medium text-slate-900">{profile.role}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">User ID</p><p className="mt-1 font-medium text-slate-900">{profile.id}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</p><p className="mt-1 font-medium text-slate-900">{profile.isActive ? 'Active' : 'Inactive'}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Creation date</p><p className="mt-1 font-medium text-slate-900">{formatDate(profile.createdAt)}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last login</p><p className="mt-1 font-medium text-slate-900">{formatDate(profile.lastLoginAt)}</p></div>
          </div>
        </div>
      ) : <LoadingState />}
    </div>
  );

  const renderSystem = () => (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {system ? (
        <>
          <h3 className="text-lg font-semibold text-slate-900">System health</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Node / Express" value={system.nodeStatus} tone="green" />
            <StatCard label="FastAPI" value={system.fastApiStatus} tone="cyan" />
            <StatCard label="MongoDB" value={system.mongoStatus} tone="amber" />
            <StatCard label="Socket.IO" value={system.socketStatus} tone="slate" />
            <StatCard label="API health" value={system.apiHealth} tone="green" />
            <StatCard label="Environment" value={system.environment} tone="cyan" />
          </div>
          <div className="mt-4 text-sm text-slate-700">
            <p>Uptime: {system.uptimeSeconds} seconds</p>
          </div>
        </>
      ) : <LoadingState />}
    </div>
  );

  const renderActivity = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Recent admin activity</h3>
      <div className="mt-4 space-y-3">
        {activity.length ? activity.map((item) => (
          <div key={`${item.userId}-${item.lastLoginAt}`} className="rounded-lg border border-slate-100 p-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{item.name}</p>
            <p>{item.email} • {item.role}</p>
            <p>Last login: {formatDate(item.lastLoginAt)}</p>
            <div className="mt-2 space-y-1">
              {item.recentActions.map((action, idx) => (
                <div key={`${action.action}-${idx}`} className="flex justify-between gap-3">
                  <span>{action.action}</span>
                  <span>{formatDate(action.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )) : <p className="text-sm text-slate-500">No activity records available.</p>}
      </div>
    </div>
  );

  const renderAuditLogs = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Audit logs</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{entry.actor}</td>
                <td className="px-3 py-2">{entry.role}</td>
                <td className="px-3 py-2">{entry.action}</td>
                <td className="px-3 py-2">{entry.target}</td>
                <td className="px-3 py-2">{formatDate(entry.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Reports</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total hospitals" value={hospitals.length} />
        <StatCard label="Total shelters" value={shelters.length} />
        <StatCard label="Total resources" value={resources.length} />
        <StatCard label="Available volunteers" value={volunteers.filter((entry) => entry.availability === 'available').length} tone="green" />
        <StatCard label="AI failures" value={analytics?.failedAnalyses ?? 0} tone="red" />
        <StatCard label="Admins" value={roleCounts.admin ?? 0} tone="slate" />
      </div>
    </div>
  );

  let content;
  switch (section) {
    case '/users':
      content = renderUsers();
      break;
    case '/emergencies':
      content = renderEmergencies();
      break;
    case '/analytics':
      content = renderAnalytics();
      break;
    case '/volunteers':
      content = renderLists('Volunteers', volunteers, ['name', 'email', 'role', 'availability', 'status']);
      break;
    case '/hospitals':
      content = renderLists('Hospitals', hospitals, ['name', 'type', 'capacity', 'availableBeds', 'contact']);
      break;
    case '/shelters':
      content = renderLists('Shelters', shelters, ['name', 'capacity', 'availableSlots', 'contact']);
      break;
    case '/resources':
      content = renderLists('Resources', resources, ['name', 'category', 'quantity', 'status', 'location']);
      break;
    case '/activity':
      content = renderActivity();
      break;
    case '/audit-logs':
      content = renderAuditLogs();
      break;
    case '/system':
      content = renderSystem();
      break;
    case '/reports':
      content = renderReports();
      break;
    case '/profile':
      content = renderProfile();
      break;
    case '/':
    default:
      content = renderOverview();
      break;
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-700">ReliefLink admin</p>
            <h1 className="text-3xl font-bold text-slate-900">Administration dashboard</h1>
          </div>
          <div className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">{user?.role || 'admin'}</div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <nav className="space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-cyan-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>

          <main>{loading ? <LoadingState /> : content}</main>
        </div>
      </div>
    </div>
  );
}
