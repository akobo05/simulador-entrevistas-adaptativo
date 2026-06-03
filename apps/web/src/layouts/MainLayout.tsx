import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';

// Rutas donde el sidebar NO aparece (pantalla completa)
const FULLSCREEN_ROUTES = ['/interview'];

function isFullscreen(pathname: string): boolean {
  return FULLSCREEN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}

export function MainLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  if (isFullscreen(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="main-layout">
      <Sidebar />
      <main className="main-layout__content">{children}</main>
    </div>
  );
}
