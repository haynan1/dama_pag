import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './components/Toasts.tsx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5_000 } },
});

// Destino decidido no build: o ramo que não é usado some do bundle.
const Root =
  import.meta.env.VITE_TARGET === 'app'
    ? lazy(() => import('./campaign/CampaignApp.tsx').then((m) => ({ default: m.CampaignApp })))
    : lazy(() => import('./App.tsx').then((m) => ({ default: m.App })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Suspense fallback={null}>
          <Root />
        </Suspense>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
