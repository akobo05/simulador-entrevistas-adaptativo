import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as RouterModule from 'react-router-dom';
import type { CandidateTranscript } from '@warachikuy/shared-types';
import { SessionProvider, type SessionData } from '../context/SessionContext';
import { InterviewPage } from './InterviewPage';
import * as apiClient from '../lib/apiClient';
import * as hookMod from '../hooks/useInterviewSocket';
import type { InterviewSocket, ChatItem } from '../hooks/useInterviewSocket';
import * as voiceMod from '../hooks/useVoiceTurn';
import type { VoiceTurn, MicStatus } from '../hooks/useVoiceTurn';
import * as auraMod from '../hooks/useAuraPipeline';
import type { AuraPipeline } from '../hooks/useAuraPipeline';

// AvatarAura captura sus props para asertar el cableado del aura
let lastAuraProps: Record<string, unknown> = {};
vi.mock('../components/AvatarAura', () => ({
  AvatarAura: (props: Record<string, unknown>) => {
    lastAuraProps = props;
    return null;
  },
}));

// Gate stub: dos botones para resolverlo con o sin permisos
vi.mock('../components/PermissionGate', () => ({
  PermissionGate: ({ onReady }: { onReady: (g: { mic: boolean; camera: boolean }) => void }) => (
    <div data-testid="gate-stub">
      <button onClick={() => onReady({ mic: true, camera: true })}>gate-grant</button>
      <button onClick={() => onReady({ mic: false, camera: false })}>gate-skip</button>
    </div>
  ),
}));

// TTS espiable
const ttsSpeak = vi.fn();
const ttsCancel = vi.fn();
let ttsOptions: { onStart?: () => void; onEnd?: () => void } = {};
vi.mock('@warachikuy/voice-pipeline', () => ({
  createTtsController: vi.fn((opts: { onStart?: () => void; onEnd?: () => void }) => {
    ttsOptions = opts;
    return { speak: ttsSpeak, cancel: ttsCancel, speaking: false };
  }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof RouterModule>()),
  useNavigate: () => navigateMock,
}));

const session: SessionData = {
  sessionId: 's1',
  token: 'a'.repeat(64),
  websocketUrl: 'ws://x',
  industry: 'backend',
  level: 'mid',
};

function seedSession() {
  sessionStorage.setItem('warachikuy:session', JSON.stringify(session));
}

function fakeSocket(over: Partial<InterviewSocket> = {}): InterviewSocket {
  return {
    items: [],
    phase: 'warmup',
    turnNumber: 0,
    status: 'open',
    lastError: null,
    closing: false,
    sendAnswer: vi.fn(),
    sendMetrics: vi.fn(),
    ...over,
  };
}

// Voz espiable: captura los callbacks que la pagina le pasa
let voiceCallbacks: { onFinal: (t: CandidateTranscript) => void; onSpeechStart: () => void } = {
  onFinal: () => undefined,
  onSpeechStart: () => undefined,
};
const voiceStart = vi.fn();
const voiceStop = vi.fn();
function fakeVoice(micStatus: MicStatus = 'idle'): VoiceTurn {
  return { micStatus, start: voiceStart, stop: voiceStop };
}

// Pipeline espiable
const feedTranscript = vi.fn();
function fakePipeline(over: Partial<AuraPipeline> = {}): AuraPipeline {
  return { auraState: null, feedTranscript, cameraStatus: 'off', videoStream: null, ...over };
}

function interviewerItem(id: string, text: string): ChatItem {
  return { id, role: 'interviewer', text, timestamp: 1 };
}

let voiceReturn: VoiceTurn;
let pipelineReturn: AuraPipeline;

function renderPage(opts: { grant?: boolean } = {}) {
  const utils = render(
    <MemoryRouter>
      <SessionProvider>
        <InterviewPage />
      </SessionProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText(opts.grant === false ? 'gate-skip' : 'gate-grant'));
  return utils;
}

describe('InterviewPage', () => {
  let socketSpy: MockInstance<typeof hookMod.useInterviewSocket>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    seedSession();
    lastAuraProps = {};
    voiceReturn = fakeVoice();
    pipelineReturn = fakePipeline();
    vi.spyOn(voiceMod, 'useVoiceTurn').mockImplementation((_sid, onFinal, onSpeechStart) => {
      voiceCallbacks = { onFinal, onSpeechStart };
      return voiceReturn;
    });
    vi.spyOn(auraMod, 'useAuraPipeline').mockImplementation(() => pipelineReturn);
    socketSpy = vi.spyOn(hookMod, 'useInterviewSocket');
  });

  // ── Gate ───────────────────────────────────────────────

  it('muestra el gate primero y no conecta el WS hasta resolverlo', () => {
    socketSpy.mockReturnValue(fakeSocket());
    render(
      <MemoryRouter>
        <SessionProvider>
          <InterviewPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('gate-stub')).toBeInTheDocument();
    // Mientras el gate esta abierto, el hook recibe URL vacia (no conecta)
    expect(socketSpy).toHaveBeenLastCalledWith('', 's1');
    fireEvent.click(screen.getByText('gate-grant'));
    expect(socketSpy).toHaveBeenLastCalledWith('ws://x', 's1');
  });

  // ── Comportamiento existente (adaptado: ahora pasa por el gate) ──

  it('renderiza los items y envia la respuesta tecleada', () => {
    const sendAnswer = vi.fn();
    socketSpy.mockReturnValue(
      fakeSocket({ items: [interviewerItem('m1', 'Hola, cuentame de ti')], sendAnswer }),
    );
    renderPage();
    expect(screen.getByText('Hola, cuentame de ti')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'soy backend' } });
    fireEvent.submit(screen.getByRole('button', { name: /enviar/i }).closest('form')!);
    expect(sendAnswer).toHaveBeenCalledWith('soy backend');
  });

  it('al closing muestra el boton ver plan y al apretarlo llama end y navega', async () => {
    vi.spyOn(apiClient, 'endSession').mockResolvedValue({ sessionId: 's1', planId: 'p1' });
    socketSpy.mockReturnValue(fakeSocket({ closing: true }));
    renderPage();
    // Al entrar en closing el mic se detiene solo
    expect(voiceStop).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /ver mi plan/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/plan/s1'));
  });

  it('si endSession falla muestra banner y no navega', async () => {
    vi.spyOn(apiClient, 'endSession').mockRejectedValue(new Error('x'));
    socketSpy.mockReturnValue(fakeSocket({ closing: true }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /ver mi plan/i }));
    await waitFor(() => expect(screen.getByTestId('ip-end-error')).toBeInTheDocument());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('ante un error no recuperable muestra el mensaje y oculta el form', () => {
    socketSpy.mockReturnValue(
      fakeSocket({ lastError: { code: 'x', message: 'Sesion expirada', recoverable: false } }),
    );
    renderPage();
    expect(screen.getByTestId('ip-terminal')).toHaveTextContent('Sesion expirada');
    expect(screen.queryByRole('textbox')).toBeNull();
    // La pregunta no puede seguir sonando sobre la pantalla terminal
    expect(ttsCancel).toHaveBeenCalled();
  });

  it('ante una desconexion inesperada muestra aviso y oculta el form', () => {
    socketSpy.mockReturnValue(fakeSocket({ status: 'closed' }));
    renderPage();
    expect(screen.getByTestId('ip-terminal')).toHaveTextContent(/se perdio la conexion/i);
  });

  it('deshabilita el form mientras la conexion no esta abierta', () => {
    socketSpy.mockReturnValue(fakeSocket({ status: 'connecting' }));
    renderPage();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  // ── TTS ────────────────────────────────────────────────

  it('habla cada interviewer.message nuevo una sola vez', () => {
    const items = [interviewerItem('m1', 'Primera pregunta')];
    const sock = fakeSocket({ items });
    socketSpy.mockReturnValue(sock);
    const { rerender } = renderPage();
    expect(ttsSpeak).toHaveBeenCalledWith('Primera pregunta');
    expect(ttsSpeak).toHaveBeenCalledOnce();
    // Mismo array: re-render sin items nuevos no re-habla
    rerender(
      <MemoryRouter>
        <SessionProvider>
          <InterviewPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(ttsSpeak).toHaveBeenCalledOnce();
  });

  it('un mensaje nuevo del candidato no dispara el TTS', () => {
    const items = [interviewerItem('m1', 'Pregunta')];
    socketSpy.mockReturnValue(fakeSocket({ items }));
    const { rerender } = renderPage();
    expect(ttsSpeak).toHaveBeenCalledOnce();
    // Llega la respuesta del candidato: array nuevo, mismo conteo interviewer
    socketSpy.mockReturnValue(
      fakeSocket({
        items: [...items, { id: 'c1', role: 'candidate', text: 'mi r', timestamp: 2 }],
      }),
    );
    rerender(
      <MemoryRouter>
        <SessionProvider>
          <InterviewPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(ttsSpeak).toHaveBeenCalledOnce();
  });

  it('el pipeline recibe sessionId, permiso de camara y el sendMetrics del socket', () => {
    const sock = fakeSocket();
    socketSpy.mockReturnValue(sock);
    const auraSpy = vi.spyOn(auraMod, 'useAuraPipeline');
    renderPage();
    expect(auraSpy).toHaveBeenLastCalledWith('s1', true, sock.sendMetrics);
  });

  it('con historial de golpe (reconexion) habla solo el ultimo mensaje', () => {
    socketSpy.mockReturnValue(
      fakeSocket({
        items: [
          interviewerItem('m1', 'Vieja uno'),
          { id: 'c1', role: 'candidate', text: 'r', timestamp: 1 },
          interviewerItem('m2', 'Vieja dos'),
          interviewerItem('m3', 'Actual'),
        ],
      }),
    );
    renderPage();
    expect(ttsSpeak).toHaveBeenCalledOnce();
    expect(ttsSpeak).toHaveBeenCalledWith('Actual');
  });

  it('el aura refleja speaking del TTS', async () => {
    socketSpy.mockReturnValue(fakeSocket());
    renderPage();
    expect(lastAuraProps.speaking).toBe(false);
    act(() => ttsOptions.onStart?.());
    await waitFor(() => expect(lastAuraProps.speaking).toBe(true));
    act(() => ttsOptions.onEnd?.());
    await waitFor(() => expect(lastAuraProps.speaking).toBe(false));
  });

  // ── Voz del candidato ──────────────────────────────────

  it('el transcript final del mic se dicta al campo y va al pipeline, sin enviarse solo', () => {
    const sendAnswer = vi.fn();
    socketSpy.mockReturnValue(fakeSocket({ sendAnswer }));
    renderPage();
    const t: CandidateTranscript = {
      sessionId: 's1',
      text: 'mi respuesta hablada',
      isFinal: true,
      timestamp: 1,
    };
    act(() => voiceCallbacks.onFinal(t));
    // El dictado aparece en el campo editable, pero NO se envia automaticamente
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('mi respuesta hablada');
    expect(sendAnswer).not.toHaveBeenCalled();
    expect(feedTranscript).toHaveBeenCalledWith(t);
  });

  it('los dictados consecutivos se acumulan en el campo', () => {
    socketSpy.mockReturnValue(fakeSocket());
    renderPage();
    const mk = (text: string): CandidateTranscript => ({
      sessionId: 's1',
      text,
      isFinal: true,
      timestamp: 1,
    });
    act(() => voiceCallbacks.onFinal(mk('soy backend')));
    act(() => voiceCallbacks.onFinal(mk('con cinco años')));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'soy backend con cinco años',
    );
  });

  it('al enviar se detiene el microfono y se limpia el campo', () => {
    const sendAnswer = vi.fn();
    socketSpy.mockReturnValue(fakeSocket({ sendAnswer }));
    renderPage();
    act(() =>
      voiceCallbacks.onFinal({
        sessionId: 's1',
        text: 'mi respuesta',
        isFinal: true,
        timestamp: 1,
      }),
    );
    fireEvent.submit(screen.getByRole('button', { name: /enviar/i }).closest('form')!);
    expect(sendAnswer).toHaveBeenCalledWith('mi respuesta');
    expect(voiceStop).toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  });

  it('cuando el entrevistador habla, el microfono descansa', () => {
    socketSpy.mockReturnValue(fakeSocket({ items: [interviewerItem('m1', 'Cuentame de ti')] }));
    renderPage();
    expect(voiceStop).toHaveBeenCalled();
  });

  it('barge-in: cuando el candidato empieza a hablar se cancela el TTS', () => {
    socketSpy.mockReturnValue(fakeSocket());
    renderPage();
    voiceCallbacks.onSpeechStart();
    expect(ttsCancel).toHaveBeenCalled();
  });

  it('toggle del mic: en idle arranca la escucha y en listening la detiene', () => {
    socketSpy.mockReturnValue(fakeSocket());
    voiceReturn = fakeVoice('idle');
    const { unmount } = renderPage();
    fireEvent.click(screen.getByTestId('ip-mic-toggle'));
    expect(voiceStart).toHaveBeenCalledOnce();
    unmount();
    // Con el mic escuchando, el mismo boton detiene
    voiceReturn = fakeVoice('listening');
    renderPage();
    expect(screen.getByTestId('ip-mic-toggle')).toHaveTextContent(/escuchando/i);
    fireEvent.click(screen.getByTestId('ip-mic-toggle'));
    expect(voiceStop).toHaveBeenCalled();
  });

  it('camara denegada -> aviso suave visible', () => {
    socketSpy.mockReturnValue(fakeSocket());
    pipelineReturn = fakePipeline({ cameraStatus: 'denied' });
    renderPage();
    expect(screen.getByTestId('ip-camera-note')).toBeInTheDocument();
  });

  it('en on_no_metrics muestra el self-view y el aviso de analisis no disponible', () => {
    socketSpy.mockReturnValue(fakeSocket());
    const fakeStream = { getTracks: () => [] } as unknown as MediaStream;
    pipelineReturn = fakePipeline({ cameraStatus: 'on_no_metrics', videoStream: fakeStream });
    renderPage();
    expect(screen.getByTestId('ip-selfview')).toBeInTheDocument();
    expect(screen.getByTestId('ip-camera-note')).toHaveTextContent(
      'análisis de contacto visual no está disponible',
    );
  });

  it('sin permiso de mic no hay boton de mic y el form tecleado queda', () => {
    socketSpy.mockReturnValue(fakeSocket());
    renderPage({ grant: false });
    expect(screen.queryByTestId('ip-mic-toggle')).toBeNull();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('mic unsupported -> sin boton de mic, el form sigue', () => {
    socketSpy.mockReturnValue(fakeSocket());
    voiceReturn = fakeVoice('unsupported');
    renderPage();
    expect(screen.queryByTestId('ip-mic-toggle')).toBeNull();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  // ── Aura con datos reales ──────────────────────────────

  it('el aura recibe las metricas del pipeline', () => {
    pipelineReturn = fakePipeline({
      auraState: {
        sessionId: 's1',
        collectedAt: 1,
        metrics: [{ name: 'fluency', value: 80, confidence: 'high', timestamp: 1 }],
      },
    });
    socketSpy.mockReturnValue(fakeSocket());
    renderPage();
    expect(lastAuraProps.fluency).toBe(80);
    expect(lastAuraProps.speechRate).toBeNull();
    expect(lastAuraProps.eyeContact).toBeNull();
  });
});
