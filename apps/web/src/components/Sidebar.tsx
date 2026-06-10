import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { House, Plus, TrendingUp, Trophy, Eye, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './Sidebar.css';

// Items de navegacion del sidebar
const NAV_ITEMS = [
  { to: '/', icon: House, label: 'Inicio' },
  { to: '/setup', icon: Plus, label: 'Nueva sesion' },
  { to: '/progress', icon: TrendingUp, label: 'Mi progreso' },
  { to: '/ranking', icon: Trophy, label: 'Ranking' },
  { to: '/observer', icon: Eye, label: 'Sala de observador' },
];

// Placeholder neutro: no usa datos de persona real
const PLACEHOLDER_USER = { initials: 'W' };

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar__logo">
        <img src="/logo.svg" alt="Logo" style={{ width: '50px', height: 'auto' }} />
        {!collapsed && <span className="sidebar__logo-text">Warachikuy</span>}
      </div>

      {/* Nav */}
      <nav className="sidebar__nav" aria-label="Navegacion principal">
        {/* NavLink resuelve solo el estado activo (por segmentos, no por
            prefijo crudo) y pone aria-current="page" nativamente; `end` evita
            que "/" quede activo en todas las rutas. */}
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="sidebar__item-icon" />
            {!collapsed && <span className="sidebar__item-label">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer: avatar + collapse */}
      <div className="sidebar__footer">
        <div className={`sidebar__avatar-row${collapsed ? ' sidebar__avatar-row--collapsed' : ''}`}>
          <div className="sidebar__avatar" aria-hidden="true">
            {PLACEHOLDER_USER.initials}
          </div>
          {!collapsed && <span className="sidebar__avatar-name">Usuario</span>}
        </div>

        <button
          className="sidebar__collapse-btn"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
