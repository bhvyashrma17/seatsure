// [FULLSTACK M2.2 + M2.10] The Axios instance: user header, error normalisation and 401 handling.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, configureApiClient } from './apiClient.js';

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  configureApiClient({ userIdGetter: () => null, unauthorizedHandler: () => {} });
});

function respondWith(status, data, seen = {}) {
  apiClient.defaults.adapter = async (config) => {
    seen.headers = config.headers;
    if (status >= 400) {
      const error = new Error('fail');
      error.config = config;
      error.response = { status, data, headers: { 'x-request-id': 'req-123' }, config };
      throw error;
    }
    return { status, data, headers: {}, config, statusText: 'OK' };
  };
  return seen;
}

describe('apiClient', () => {
  it('FS-T05 sends the current demo user as X-User-Id', async () => {
    configureApiClient({ userIdGetter: () => 11 });
    const seen = respondWith(200, { status: 'success', data: [] });
    await apiClient.get('/events');
    expect(seen.headers['X-User-Id']).toBe('11');
  });

  it('FS-T06 turns a validation failure into ApiError with per-field messages', async () => {
    respondWith(422, { code: 'INVALID_ANSWERS', message: 'Some answers are invalid', errors: [{ field: 'answers.tshirt', message: 'Choose one of: S, M' }] });
    const err = await apiClient.post('/events/1/registrations', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'INVALID_ANSWERS', requestId: 'req-123', fieldErrors: { 'answers.tshirt': 'Choose one of: S, M' } });
  });

  it('FS-T07 a 401 calls the unauthorised handler (redirect to the user chooser)', async () => {
    const handler = vi.fn();
    configureApiClient({ unauthorizedHandler: handler });
    respondWith(401, { code: 'UNAUTHENTICATED', message: 'Choose a demo user first' });
    await apiClient.get('/me').catch(() => {});
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('FS-T08 a dead server becomes a friendly network error (status 0)', async () => {
    apiClient.defaults.adapter = async () => {
      throw new Error('ECONNREFUSED');
    };
    const err = await apiClient.get('/events').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
