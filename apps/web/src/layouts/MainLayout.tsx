import React from 'react';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <header style={{ borderBottom: '2px solid #ccc', marginBottom: '20px' }}>
        <h1>Warachikuy</h1>
        <p>Simulador de Entrevistas Laborales Adaptativo</p>
      </header>

      <main>{children}</main>
    </div>
  );
}
