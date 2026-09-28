import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">ReliefLink</p>
      <h1 className="max-w-3xl text-4xl font-bold text-slate-900 md:text-6xl">
        Real-Time Multimodal Emergency Detection
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-600">
        A disaster-response platform for AI-assisted emergency reporting, prioritization, coordination, and rapid rescue response.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        {user ? (
          <Link
            to="/dashboard"
            className="rounded-lg bg-cyan-600 px-6 py-3 font-semibold text-white hover:bg-cyan-500"
          >
            Open dashboard
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="rounded-lg bg-cyan-600 px-6 py-3 font-semibold text-white hover:bg-cyan-500"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="rounded-lg border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:border-slate-400"
            >
              Register
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
