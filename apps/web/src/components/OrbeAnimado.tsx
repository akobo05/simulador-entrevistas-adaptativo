import './OrbeAnimado.css';

export function OrbeAnimado() {
  return (
    <div className="oa-root">
      {/* capa de particulas flotantes */}
      <div className="oa-particles" aria-hidden="true">
        {Array.from({ length: 30 }).map((_, i) => (
          <span
            key={i}
            className="oa-particle"
            style={
              {
                '--x': `${Math.random() * 100}%`,
                '--y': `${Math.random() * 100}%`,
                '--d': `${Math.random() * 3 + 1}s`,
                '--s': `${Math.random() * 4 + 2}px`,
                '--delay': `${Math.random() * 5}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* anillos orbitantes */}
      <svg className="oa-rings" viewBox="0 0 300 300" aria-hidden="true">
        <ellipse cx="150" cy="150" rx="130" ry="40" className="oa-ring oa-ring--1" />
        <ellipse cx="150" cy="150" rx="100" ry="30" className="oa-ring oa-ring--2" />
        <ellipse cx="150" cy="150" rx="70" ry="22" className="oa-ring oa-ring--3" />
      </svg>

      {/* glow de fondo */}
      <div className="oa-glow" aria-hidden="true" />

      {/* logo central */}
      <div className="oa-logo">
        <svg viewBox="0 0 100 100" className="oa-logo-svg">
          <defs>
            <linearGradient id="oaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#0EA5E9" />
            </linearGradient>
          </defs>
          <path
            d="M25 25 h35 v5 h5 v5 h5 v20 h-5 v5 h-5 v5 h-15 l-5 5 l-5 -5 h-15 v-5 h-5 v-25 h5 v-5 h5 z"
            fill="#111827"
            opacity="0.9"
          />
          <path
            d="M35 40 h35 v5 h5 v5 h5 v20 h-5 v5 h-5 v5 h-10 l-7 7 l-3 -7 h-15 v-5 h-5 v-25 h5 v-5 h5 z"
            fill="url(#oaGrad)"
          />
          <rect x="47" y="52" width="4" height="4" fill="#FFFFFF" />
          <rect x="55" y="52" width="4" height="4" fill="#FFFFFF" />
          <rect x="63" y="52" width="4" height="4" fill="#FFFFFF" />
        </svg>
      </div>
    </div>
  );
}
