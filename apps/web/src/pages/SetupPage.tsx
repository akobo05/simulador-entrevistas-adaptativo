import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Industry, Level } from '@warachikuy/shared-types';
import { createSession, getIndustries, type IndustryOption } from '../lib/apiClient';
import { useSession } from '../context/SessionContext';
import { Button } from '../components';
import './SetupPage.css';

const LEVELS: { id: Level; name: string }[] = [
  { id: 'junior', name: 'Junior' },
  { id: 'mid', name: 'Mid' },
  { id: 'senior', name: 'Senior' },
];

export function SetupPage() {
  const navigate = useNavigate();
  const { setSession } = useSession();
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
  const [industry, setIndustry] = useState<Industry>('backend');
  const [level, setLevel] = useState<Level>('mid');
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getIndustries()
      .then((list) => {
        if (!active) return;
        setIndustries(list);
        if (list[0]) setIndustry(list[0].id);
      })
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createSession({ industry, level });
      setSession({ ...res, industry, level });
      navigate(`/interview/${res.sessionId}`);
    } catch {
      setSubmitError('No se pudo crear la sesion. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <div className="sp-root">
      {/* Header */}
      <header className="sp-header">
        <div className="sp-header__logo">
          <div className="sp-header__logo-mark" aria-hidden="true">
            W
          </div>
          <span className="sp-header__logo-name">Warachikuy</span>
        </div>

        <h1 className="sp-header__title">Configuracion de entrevista</h1>

        {/* Stepper */}
        <nav className="sp-stepper" aria-label="Paso 1 de 2">
          <div className="sp-step sp-step--active">
            <span className="sp-step__circle">1</span>
            <span className="sp-step__label">Configurar</span>
          </div>
          <div className="sp-step__line" aria-hidden="true" />
          <div className="sp-step">
            <span className="sp-step__circle">2</span>
            <span className="sp-step__label">Entrevista</span>
          </div>
        </nav>
      </header>

      {/* Body */}
      <main className="sp-body">
        {loadError ? (
          <p className="sp-error" role="alert">
            No se pudieron cargar las industrias. Recarga la pagina.
          </p>
        ) : (
          <form className="sp-card" onSubmit={handleSubmit} noValidate>
            <h2 className="sp-card__heading">
              <span className="sp-card__heading-icon" aria-hidden="true">
                ✦
              </span>
              Perfil de entrevista
            </h2>

            {/* Industria */}
            <div className="sp-field">
              <label className="sp-label" htmlFor="setup-industry">
                Industria
              </label>
              <select
                id="setup-industry"
                className="sp-select"
                value={industry}
                onChange={(e) => setIndustry(e.target.value as Industry)}
                data-testid="setup-industry"
              >
                {industries.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Nivel */}
            <div className="sp-field">
              <label className="sp-label" htmlFor="setup-level">
                Nivel
              </label>
              <select
                id="setup-level"
                className="sp-select"
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                data-testid="setup-level"
              >
                {LEVELS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            {submitError && (
              <p className="sp-error" role="alert">
                {submitError}
              </p>
            )}

            <div className="sp-cta">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={submitting}
                loading={submitting}
                data-testid="setup-submit"
              >
                {submitting ? 'Creando...' : 'Comenzar entrevista'}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
