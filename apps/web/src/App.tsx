import { useState, useRef } from 'react';
import { createSttController, metricsWorkerApi } from '@warachikuy/voice-pipeline';
import type { CandidateTranscript, AuraMetric } from '@warachikuy/shared-types';

// Página de prueba temporal — eliminar antes del PR final
function VoicePipelineTest() {
  const [transcripts, setTranscripts] = useState<CandidateTranscript[]>([]);
  const [metrics, setMetrics] = useState<AuraMetric[]>([]);
  const [running, setRunning] = useState(false);
  const controllerRef = useRef<ReturnType<typeof createSttController> | null>(null);

  // sessionId real vendrá del backend (POST /api/v1/sessions) — valor fijo solo para prueba manual
  const TEST_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

  function handleStart() {
    const ctrl = createSttController(TEST_SESSION_ID, (t) => {
      setTranscripts((prev) => [...prev.slice(-9), t]);
    });
    ctrl.start();
    controllerRef.current = ctrl;
    setRunning(true);
  }

  function handleStop() {
    controllerRef.current?.stop();
    setRunning(false);
  }

  function handleMetrics() {
    const fakeFrame = { width: 640, height: 480, data: new Uint8ClampedArray(0) } as ImageData;
    const result = metricsWorkerApi.processFrame(fakeFrame);
    if (result.length > 0) setMetrics(result);
  }

  return (
    <section style={{ fontFamily: 'monospace', padding: '1rem', maxWidth: 600 }}>
      <h2>Prueba voice-pipeline</h2>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button onClick={handleStart} disabled={running}>
          ▶ Iniciar STT
        </button>
        <button onClick={handleStop} disabled={!running}>
          ■ Detener
        </button>
        <button onClick={handleMetrics}>📊 Simular métricas</button>
      </div>

      <h3>Transcripciones {running ? '🔴 grabando...' : ''}</h3>
      {transcripts.length === 0 && (
        <p style={{ color: '#888' }}>Habla después de presionar Iniciar</p>
      )}
      <ul>
        {transcripts.map((t, i) => (
          <li key={i} style={{ color: t.isFinal ? '#000' : '#888' }}>
            {t.isFinal ? '✓' : '…'} {t.text}
          </li>
        ))}
      </ul>

      <h3>Métricas</h3>
      {metrics.length === 0 && (
        <p style={{ color: '#888' }}>Presiona &quot;Simular métricas&quot;</p>
      )}
      <ul>
        {metrics.map((m) => (
          <li key={m.name}>
            {m.name}: {m.value} ({m.confidence})
          </li>
        ))}
      </ul>
    </section>
  );
}

export function App() {
  return (
    <main style={{ padding: '1rem' }}>
      <h1>Warachikuy</h1>
      <p>Simulador de Entrevistas Laborales Adaptativo</p>
      <hr />
      <VoicePipelineTest />
    </main>
  );
}
