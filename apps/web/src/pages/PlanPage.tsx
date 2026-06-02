import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { ImprovementPlan, PlanCompetency } from '@warachikuy/shared-types';
import { getPlan, type PlanFetchResult } from '../lib/apiClient';
import { useSession } from '../context/SessionContext';
import { CompetencyRing } from '../components/CompetencyRing';
import { Button } from '../components/Button';

const POLL_MS = 1500;
const LABELS: Record<PlanCompetency['name'], string> = {
  fluency: 'Fluidez',
  eye_contact: 'Contacto visual',
  speech_rate: 'Ritmo del habla',
  content: 'Contenido',
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
      <main className="plan-root">
        <p className="plan-loading">Generando tu plan de mejora...</p>
      </main>
    );
  }
  if (view === 'failed' || view === 'not_found' || !plan) {
    return (
      <main className="plan-root">
        <p className="setup-error">No se pudo generar el plan de mejora.</p>
        <Button onClick={restart}>Nueva entrevista</Button>
      </main>
    );
  }

  const hasNullMetric = plan.competencies.some((c) => c.score === null);

  return (
    <main className="plan-root">
      <h1>Tu plan de mejora</h1>
      <p className="plan-summary">{plan.summary}</p>

      <div className="plan-rings">
        {plan.competencies.map((c) => (
          <CompetencyRing key={c.name} label={LABELS[c.name]} score={c.score} />
        ))}
      </div>
      {hasNullMetric && (
        <p className="plan-note">
          Las metricas de camara y voz se integran con el modulo de voz (pendiente).
        </p>
      )}

      <section className="plan-section">
        <h2>Fortalezas</h2>
        <ul>
          {plan.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      <section className="plan-section">
        <h2>A mejorar</h2>
        <ul>
          {plan.improvements.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      <section className="plan-section">
        <h2>Ejercicios</h2>
        <ul>
          {plan.exercises.map((e, i) => (
            <li key={i}>
              <strong>{e.title}</strong>: {e.description}
            </li>
          ))}
        </ul>
      </section>

      <Button onClick={restart}>Nueva entrevista</Button>
    </main>
  );
}
