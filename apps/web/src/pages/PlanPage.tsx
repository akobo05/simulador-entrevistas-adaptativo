import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { ImprovementPlan, PlanCompetency } from '@warachikuy/shared-types';
import { getPlan, type PlanFetchResult } from '../lib/apiClient';
import { useSession } from '../context/SessionContext';
import { CompetencyRing } from '../components/CompetencyRing';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import './PlanPage.css';

const POLL_MS = 1500;
const LABELS: Record<PlanCompetency['name'], string> = {
  fluency: 'Fluidez',
  eye_contact: 'Contacto visual',
  speech_rate: 'Ritmo del habla',
  content: 'Contenido',
};

// Icono decorativo por competencia (sin significado semantico, aria-hidden)
const ICONS: Record<PlanCompetency['name'], string> = {
  fluency: '💬',
  eye_contact: '👁️',
  speech_rate: '🎙️',
  content: '⚙️',
};

type View = 'generating' | 'ready' | 'failed' | 'not_found';

export function PlanPage() {
  const { session, clearSession } = useSession();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('generating');
  const [plan, setPlan] = useState<ImprovementPlan | null>(null);

  useEffect(() => {
    if (!session) return;
    const s = session;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll(): Promise<void> {
      let res: PlanFetchResult;
      try {
        res = await getPlan(s.sessionId, s.token);
      } catch {
        // error transitorio de red: reintenta en el proximo tick
        if (active) timer = setTimeout(poll, POLL_MS);
        return;
      }
      if (!active) return;
      if (res.status === 'ready') {
        setPlan(res.plan);
        setView('ready');
        return; // estado terminal: corta el polling
      }
      if (res.status === 'failed') {
        setView('failed');
        return;
      }
      if (res.status === 'not_found') {
        setView('not_found');
        return;
      }
      // generating: sigue
      timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session]);

  if (!session) return <Navigate to="/setup" replace />;

  function restart(): void {
    clearSession();
    navigate('/');
  }

  if (view === 'generating') {
    return (
      <main className="plan-root" data-testid="plan-generating">
        <div className="plan-loading-wrap">
          <span className="plan-spinner" aria-hidden="true" />
          <p className="plan-loading">Generando tu plan de mejora...</p>
        </div>
      </main>
    );
  }

  if (view === 'failed' || view === 'not_found' || !plan) {
    return (
      <main className="plan-root plan-root--error" data-testid="plan-error">
        <p className="setup-error">No se pudo generar el plan de mejora.</p>
        <Button onClick={restart}>Nueva entrevista</Button>
      </main>
    );
  }

  const hasNullMetric = plan.competencies.some((c) => c.score === null);

  return (
    <main className="plan-root" data-testid="plan-ready">
      {/* Encabezado */}
      <header className="plan-header">
        <div className="plan-header__text">
          <p className="plan-header__eyebrow">Plan de mejora</p>
          <h1 className="plan-header__title" data-testid="plan-title">
            Tu plan de mejora
          </h1>
        </div>
        <div className="plan-header__actions">
          <Button variant="ghost" onClick={restart}>
            Nueva entrevista
          </Button>
        </div>
      </header>

      {/* Resumen */}
      <p className="plan-summary" data-testid="plan-summary">
        {plan.summary}
      </p>

      {/* Competencias evaluadas */}
      <section className="plan-section" aria-labelledby="plan-competencies-title">
        <h2 className="plan-section__title" id="plan-competencies-title">
          Competencias evaluadas
        </h2>
        {hasNullMetric && (
          <p className="plan-note" data-testid="plan-null-note">
            Las metricas de camara y voz se integran con el modulo de voz (pendiente).
          </p>
        )}
        <div className="plan-competencies" data-testid="plan-competencies">
          {plan.competencies.map((c) => (
            <Card key={c.name} className="plan-comp-card" data-testid={`comp-card-${c.name}`}>
              <div className="plan-comp-card__ring">
                <CompetencyRing label={LABELS[c.name]} score={c.score} />
              </div>
              <div className="plan-comp-card__info">
                <div className="plan-comp-card__name">
                  <span className="plan-comp-card__icon" aria-hidden="true">
                    {ICONS[c.name]}
                  </span>
                  {LABELS[c.name]}
                </div>
                {c.comment && <p className="plan-comp-card__comment">{c.comment}</p>}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Fortalezas */}
      <section className="plan-section" aria-labelledby="plan-strengths-title">
        <h2 className="plan-section__title" id="plan-strengths-title">
          Fortalezas
        </h2>
        <ul className="plan-list" data-testid="plan-strengths">
          {plan.strengths.map((s, i) => (
            <li key={i} className="plan-list__item plan-list__item--strength">
              {s}
            </li>
          ))}
        </ul>
      </section>

      {/* A mejorar */}
      <section className="plan-section" aria-labelledby="plan-improvements-title">
        <h2 className="plan-section__title" id="plan-improvements-title">
          A mejorar
        </h2>
        <ul className="plan-list" data-testid="plan-improvements">
          {plan.improvements.map((s, i) => (
            <li key={i} className="plan-list__item plan-list__item--improvement">
              {s}
            </li>
          ))}
        </ul>
      </section>

      {/* Ejercicios priorizados */}
      <section className="plan-section" aria-labelledby="plan-exercises-title">
        <h2 className="plan-section__title" id="plan-exercises-title">
          Ejercicios priorizados
        </h2>
        <div className="plan-exercises" data-testid="plan-exercises">
          {plan.exercises.map((e, i) => (
            <div key={i} className="plan-exercise" data-testid={`exercise-${i}`}>
              <div className="plan-exercise__rank" aria-hidden="true">
                #{i + 1}
              </div>
              <div className="plan-exercise__body">
                <span className="plan-exercise__title">{e.title}</span>
                <p className="plan-exercise__desc">{e.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Acciones pie de pagina */}
      <div className="plan-footer-actions">
        <Button variant="primary" onClick={restart}>
          Nueva entrevista
        </Button>
      </div>
    </main>
  );
}
