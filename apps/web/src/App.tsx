import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import './assets/global.css';

/* ── Eager (críticos, sin lazy) ─────────────────────────── */
import { Home } from './pages/Home';
import { ChatRoom } from './pages/ChatRoom';

/* ── Lazy (resto de páginas) ────────────────────────────── */
const ProfileSetup = lazy(() =>
  import('./pages/ProfileSetup').then((m) => ({ default: m.ProfileSetup })),
);
const ObserverRoom = lazy(() =>
  import('./pages/ObserverRoom').then((m) => ({ default: m.ObserverRoom })),
);
const ImprovementPlan = lazy(() =>
  import('./pages/ImprovementPlan').then((m) => ({ default: m.ImprovementPlan })),
);
const MyProgress = lazy(() =>
  import('./pages/MyProgress').then((m) => ({ default: m.MyProgress })),
);
const Ranking = lazy(() => import('./pages/Ranking').then((m) => ({ default: m.Ranking })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

/* ══════════════════════════════════════════════════════════
   LOADING SCREEN — fallback de Suspense
   ══════════════════════════════════════════════════════════ */
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
      {/* Logo */}
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

      {/* Spinner */}
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

      {/* Texto */}
      <span
        style={{
          fontSize: '13px',
          color: '#64748B',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Cargando…
      </span>

      {/* Keyframe inyectado inline (sin CSS externo) */}
      <style>{`
        @keyframes ls-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SCROLL TO TOP — resetea scroll en cada cambio de ruta
   ══════════════════════════════════════════════════════════ */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

/* ══════════════════════════════════════════════════════════
   APP — Routing principal
   ══════════════════════════════════════════════════════════ */
export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />

      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* ── Con MainLayout ───────────────────────────── */}
          <Route
            path="/"
            element={
              <MainLayout>
                <Home />
              </MainLayout>
            }
          />

          <Route
            path="/onboarding"
            element={
              <MainLayout>
                <ProfileSetup />
              </MainLayout>
            }
          />

          <Route
            path="/improvement"
            element={
              <MainLayout>
                <ImprovementPlan />
              </MainLayout>
            }
          />

          <Route
            path="/progress"
            element={
              <MainLayout>
                <MyProgress />
              </MainLayout>
            }
          />

          <Route
            path="/ranking"
            element={
              <MainLayout>
                <Ranking />
              </MainLayout>
            }
          />

          {/* ── Full-screen (sin layout) ─────────────────── */}
          <Route path="/room" element={<ChatRoom />} />
          <Route path="/observer" element={<ObserverRoom />} />

          {/* ── 404 ──────────────────────────────────────── */}
          <Route
            path="*"
            element={
              <MainLayout>
                <NotFound />
              </MainLayout>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
