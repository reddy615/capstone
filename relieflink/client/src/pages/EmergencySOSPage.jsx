import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function EmergencySOSPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    description: '',
    latitude: '',
    longitude: '',
    contactInfo: '',
    priority: 'Medium',
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

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

  const resetForm = () => {
    setForm({
      description: '',
      latitude: '',
      longitude: '',
      contactInfo: '',
      priority: 'Medium',
    });
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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

      setSuccess('Emergency SOS submitted successfully. It has been queued for review and AI preparation.');
      resetForm();
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (submitError) {
      setError(submitError.message || 'Emergency submission failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
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

          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
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
            <p className="mt-2 text-lg font-semibold text-cyan-300">Submitted</p>
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
  );
}
