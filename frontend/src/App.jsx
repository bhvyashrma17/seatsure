import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { configureApiClient } from './services/apiClient.js';
import { CurrentUserProvider } from './features/users/index.js';
import { ToastProvider } from './shared/components/Toast.jsx';
import { createQueryClient } from './app/queryClient.js';
import { createAppRouter } from './app/router.jsx';

export default function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => {
    const r = createAppRouter();
    // [FULLSTACK M2.10: 401 handling] The Axios interceptor sends unknown users to the chooser page.
    configureApiClient({
      unauthorizedHandler: () => {
        const here = r.state.location.pathname;
        if (here !== '/choose-user') r.navigate(`/choose-user?next=${encodeURIComponent(here)}`);
      },
    });
    return r;
  });

  return (
    // [FULLSTACK M2.3: QueryClientProvider] makes the shared cache available to every useQuery.
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CurrentUserProvider>
          <RouterProvider router={router} />
        </CurrentUserProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
