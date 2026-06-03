import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';

// Rutas donde el sidebar NO aparece (pantalla completa)
const FULLSCREEN_ROUTES = ['/room', '/observer'];

export function MainLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isFullscreen = FULLSCREEN_ROUTES.includes(pathname);

  if (isFullscreen) {
    return <>{children}</>;
  }

  return (
    <div className="main-layout">
      <Sidebar />
      <main className="main-layout__content">{children}</main>
    </div>
  );
}
