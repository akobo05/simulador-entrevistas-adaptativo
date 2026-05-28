import React from 'react';
import { MainLayout } from '../layouts/MainLayout';

export function NotFound() {
  return (
    <MainLayout>
      <h2>Error 404</h2>
      <p>La página que buscas no existe en el simulador.</p>
    </MainLayout>
  );
}
