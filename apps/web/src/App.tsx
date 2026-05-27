import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home, ChatRoom, NotFound } from './pages';
import './assets/global.css';

export function App() {
  return (
    <BrowserRouter>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<ChatRoom />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
