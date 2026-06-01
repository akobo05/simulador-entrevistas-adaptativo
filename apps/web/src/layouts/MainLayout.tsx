import type { ReactNode } from 'react';

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="chat-layout">
      <header className="chat-header">
        <h1>Warachikuy</h1>
        <p>Simulador de Entrevistas Laborales Adaptativo</p>
      </header>

      <main>{children}</main>
    </div>
  );
}
