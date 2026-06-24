import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { MainLayout } from './layouts/MainLayout';
import { Home } from './pages/Home';
import { ErrorBoundary } from './components/ErrorBoundary';
import './assets/global.css';

/* ── Lazy (paginas no criticas) ─────────────────────────── */
const SetupPage = lazy(() => import('./pages/SetupPage').then((m) => ({ default: m.SetupPage })));
const InterviewPage = lazy(() =>
  import('./pages/InterviewPage').then((m) => ({ default: m.InterviewPage })),
);
const PlanPage = lazy(() => import('./pages/PlanPage').then((m) => ({ default: m.PlanPage })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const Ranking = lazy(() => import('./pages/Ranking').then((m) => ({ default: m.Ranking })));
const MyProgress = lazy(() =>
  import('./pages/MyProgress').then((m) => ({ default: m.MyProgress })),
);
const ObserverRoom = lazy(() =>
  import('./pages/ObserverRoom').then((m) => ({ default: m.ObserverRoom })),
);

/* Fallback de Suspense mientras carga el chunk */
function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#F4F6FB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <span
        style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: '22px',
          color: '#2563EB',
          letterSpacing: '0.02em',
        }}
      >
        Warachikuy
      </span>
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          border: '3px solid #E2E8F0',
          borderTopColor: '#2563EB',
          animation: 'ls-spin 0.7s linear infinite',
        }}
      />
      <span
        style={{
          fontSize: '13px',
          color: '#64748B',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Cargando...
      </span>
      <style>{`
        @keyframes ls-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* Resetea el scroll al inicio en cada cambio de ruta */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<LoadingScreen />}>
          <MainLayout>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/interview/:sessionId" element={<InterviewPage />} />
                <Route path="/plan/:sessionId" element={<PlanPage />} />
                <Route path="/ranking" element={<Ranking />} />
                <Route path="/progress" element={<MyProgress />} />
                <Route path="/observer" element={<ObserverRoom />} />
                <Route path="/observer/:roomId" element={<ObserverRoom />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </MainLayout>
        </Suspense>
      </BrowserRouter>
    </SessionProvider>
  );
}
