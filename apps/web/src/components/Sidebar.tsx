import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { House, Plus, TrendingUp, Trophy, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './Sidebar.css';

// Rutas reales activas en esta version
const REAL_NAV_ITEMS = [
  { to: '/', icon: House, label: 'Inicio' },
  { to: '/setup', icon: Plus, label: 'Nueva sesion' },
];

// Items F2 diferidos — no navegan, muestran "proximamente"
const DEFERRED_ITEMS = [
  { icon: TrendingUp, label: 'Mi progreso' },
  { icon: Trophy, label: 'Ranking' },
];

// Placeholder neutro: no usa datos de persona real
const PLACEHOLDER_USER = { initials: 'W' };

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar__logo">
        <img src="/logo.svg" alt="Logo" style={{ width: '50px', height: 'auto' }} />
        {!collapsed && <span className="sidebar__logo-text">Warachikuy</span>}
      </div>

      {/* Nav */}
      <nav className="sidebar__nav" aria-label="Navegacion principal">
        {/* Items con ruta real */}
        {REAL_NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const isActive =
            to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

          return (
            <NavLink
              key={to}
              to={to}
              className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="sidebar__item-icon" />
              {!collapsed && <span className="sidebar__item-label">{label}</span>}
            </NavLink>
          );
        })}

        {/* Items diferidos F2 — aria-disabled, sin navegacion */}
        {DEFERRED_ITEMS.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="sidebar__item sidebar__item--disabled"
            aria-disabled="true"
            title={collapsed ? label : undefined}
            role="button"
            tabIndex={0}
          >
            <Icon size={18} className="sidebar__item-icon" />
            {!collapsed && (
              <>
                <span className="sidebar__item-label">{label}</span>
                <span className="sidebar__item-soon">proximamente</span>
              </>
            )}
          </span>
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
