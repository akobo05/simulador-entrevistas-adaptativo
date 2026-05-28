import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Radio, TrendingUp, Users, ArrowRight } from 'lucide-react';
import { OrbeAnimado } from '../components/OrbeAnimado';

const features = [
  { icon: Layers, label: 'Capacitación' },
  { icon: Radio, label: 'En vivo' },
  { icon: TrendingUp, label: 'Progreso' },
  { icon: Users, label: 'Comunidad' },
];

function Stepper() {
  return (
    <div className="stepper">
      {[1, 2, 3].map((step) => (
        <React.Fragment key={step}>
          <div className={`step-circle ${step === 1 ? 'active' : ''}`}>{step}</div>
          {step < 3 && <div className={`step-line ${step === 1 ? 'active' : ''}`} />}
        </React.Fragment>
      ))}
      <span className="step-label">PASO 1 DE 3</span>
    </div>
  );
}

export function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-root">
      <Stepper />

      {/* Orbe central */}
      <div className="orbe-container">
        <OrbeAnimado />
      </div>

      {/* Contenido inferior */}
      <div className="home-content">
        <p className="home-subtitle">PLATAFORMA DE ENTRENAMIENTO DE ENTREVISTAS</p>

        <h1 className="home-title">
          Bienvenido a <span className="home-brand">Warachikuy</span>
        </h1>

        <p className="home-description">
          Tu espacio de aprendizaje inmersivo. Configura tu entorno en minutos y comienza a dominar
          nuevas habilidades blandas.
        </p>

        {/* Feature icons */}
        <div className="features-row">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="feature-item">
              <div className="feature-icon-wrap">
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <span className="feature-label">{label}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button className="cta-button" onClick={() => navigate('/chat')}>
          Comenzar
          <ArrowRight size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
