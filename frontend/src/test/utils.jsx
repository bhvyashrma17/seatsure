// Renders a component inside the same providers the real app uses.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CurrentUserProvider } from '../features/users/index.js';
import { ToastProvider } from '../shared/components/Toast.jsx';

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
}

export function renderWithProviders(ui, { route = '/', path = '*', userId = null, queryClient = makeQueryClient() } = {}) {
  window.localStorage.clear();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CurrentUserProvider initialUserId={userId}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
              <Route path="/choose-user" element={<p>choose user page</p>} />
            </Routes>
          </MemoryRouter>
        </CurrentUserProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

export const ok = (data, meta) => (meta ? { status: 'success', data, meta } : { status: 'success', data });

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
