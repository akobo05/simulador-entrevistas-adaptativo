import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Industry, Level } from '@warachikuy/shared-types';
import { createSession, getIndustries, type IndustryOption } from '../lib/apiClient';
import { useSession } from '../context/SessionContext';
import { Button } from '../components/Button';

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
    <main className="setup-root">
      <h1>Configura tu entrevista</h1>
      {loadError ? (
        <p className="setup-error">No se pudieron cargar las industrias. Recarga la pagina.</p>
      ) : (
        <form className="setup-form" onSubmit={handleSubmit}>
          <label>
            Industria
            <select value={industry} onChange={(e) => setIndustry(e.target.value as Industry)}>
              {industries.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nivel
            <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
              {LEVELS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
          {submitError && <p className="setup-error">{submitError}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creando...' : 'Comenzar entrevista'}
          </Button>
        </form>
      )}
    </main>
  );
}
