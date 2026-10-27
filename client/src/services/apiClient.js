// [FULLSTACK M2.2: One configured Axios instance] Every API call in the app goes through this client.
// The base URL comes from a Vite environment variable, never a hard-coded string.
// [FULLSTACK M2.10: Global API error handling] Interceptors attach the current user to every request
// and turn every failure into one predictable ApiError shape the UI can rely on.
import axios from 'axios';

export class ApiError extends Error {
  constructor({ status, code, message, fieldErrors = {}, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 = network failure (server unreachable)
    this.code = code;
    this.fieldErrors = fieldErrors; // { 'answers.level': 'Experience level is required' }
    this.requestId = requestId;
  }
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1',
  timeout: 10_000,
  headers: { Accept: 'application/json' },
});

// The current user lives in React context; the client reads it through these hooks-free setters.
let getUserId = () => null;
let onUnauthorized = () => {};
export function configureApiClient({ userIdGetter, unauthorizedHandler }) {
  if (userIdGetter) getUserId = userIdGetter;
  if (unauthorizedHandler) onUnauthorized = unauthorizedHandler;
}

apiClient.interceptors.request.use((config) => {
  const userId = getUserId();
  if (userId) config.headers['X-User-Id'] = String(userId);
  return config;
});

export function toApiError(error) {
  if (error instanceof ApiError) return error;
  if (!error.response) {
    return new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the SeatSure API. Is the server running?' });
  }
  const { status, data, headers } = error.response;
  const fieldErrors = Object.fromEntries((data?.errors ?? []).map((e) => [e.field, e.message]));
  return new ApiError({
    status,
    code: data?.code ?? 'HTTP_ERROR',
    message: data?.message ?? `Request failed (${status})`,
    fieldErrors,
    requestId: data?.requestId ?? headers?.['x-request-id'],
  });
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error);
    // 401 = no/unknown demo user: send the person to the "choose user" screen.
    if (apiError.status === 401) onUnauthorized(apiError);
    return Promise.reject(apiError);
  },
);

/** Unwraps the API's success envelope: { status, data, meta }. */
export const unwrap = (response) => response.data;
