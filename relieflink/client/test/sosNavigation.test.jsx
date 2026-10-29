import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), disconnect: vi.fn() }),
}));

const authenticatedVictim = {
  user: { _id: 'victim-1', name: 'Test Victim', role: 'victim' },
};
const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

function renderApp(path = '/') {
  localStorage.setItem('relieflink_token', 'test-token');
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('SOS navigation and form', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/auth/me')) {
        return jsonResponse(authenticatedVictim);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('navigates from the SOS navigation link to the reporting form', async () => {
    renderApp();

    fireEvent.click(await screen.findByRole('link', { name: 'SOS' }));

    expect(await screen.findByRole('heading', { name: 'Report an emergency' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit SOS' })).toBeTruthy();
  });

  it('renders the SOS form immediately without waiting for emergency APIs', async () => {
    renderApp('/sos');

    expect(await screen.findByRole('heading', { name: 'Report an emergency' })).toBeTruthy();
    expect(screen.getByLabelText('Emergency description')).toBeTruthy();
    expect(screen.getByLabelText('Image upload (optional)')).toBeTruthy();
    expect(screen.getByLabelText('Latitude')).toBeTruthy();
    expect(screen.getByLabelText('Longitude')).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable message when the emergency API is unavailable', async () => {
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (String(url).endsWith('/auth/me')) {
        return jsonResponse(authenticatedVictim);
      }
      if (String(url).endsWith('/emergencies') && options.method === 'POST') {
        return jsonResponse({ message: 'Emergency service unavailable.' }, 503);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp('/sos');

    fireEvent.change(await screen.findByLabelText('Emergency description'), {
      target: { value: 'Fire in the building.' },
    });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '19.076' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '72.8777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit SOS' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Emergency service unavailable.');
    expect(screen.getByRole('button', { name: 'Submit SOS' }).disabled).toBe(false);
    expect(screen.getByRole('heading', { name: 'Report an emergency' })).toBeTruthy();
  });

  it('shows a clear connection error when submission cannot reach the server', async () => {
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      if (String(url).endsWith('/auth/me')) {
        return jsonResponse(authenticatedVictim);
      }
      if (String(url).endsWith('/emergencies') && options.method === 'POST') {
        throw new TypeError('Failed to fetch');
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp('/sos');

    fireEvent.change(await screen.findByLabelText('Emergency description'), {
      target: { value: 'Flooding near the road.' },
    });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '19.076' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '72.8777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit SOS' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Your SOS was not submitted.');
    });
    expect(screen.getByRole('heading', { name: 'Report an emergency' })).toBeTruthy();
  });
});
