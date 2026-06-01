import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home, ChatRoom, NotFound } from './pages';
import './assets/global.css';

export function App() {
  // No envolvemos en <main> aca: cada pagina/layout aporta su propio <main>
  // (Home tiene el suyo, ChatRoom y NotFound lo reciben de MainLayout). Asi se
  // evita un <main> anidado, que es HTML invalido y rompe los landmarks de los
  // lectores de pantalla.
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<ChatRoom />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
