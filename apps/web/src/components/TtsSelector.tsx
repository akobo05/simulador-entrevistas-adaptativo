import { useEffect, useState } from 'react';
import { usePreferences } from '../hooks/usePreferences';
import './TtsSelector.css';

interface TtsSelectorProps {
  /** Llamado cada vez que el usuario cambia voz o velocidad. */
  onChange: (voice: SpeechSynthesisVoice | null, rate: number) => void;
}

function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

export function TtsSelector({ onChange }: TtsSelectorProps) {
  const { prefs, setPref } = usePreferences();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(getVoices);

  // Chrome carga voces de forma asincrona: escuchar voiceschanged la primera vez
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const handler = () => setVoices(getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    // Poblar de inmediato por si ya estaban cargadas al montar
    setVoices(getVoices());
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handler);
  }, []);

  if (!window.speechSynthesis) {
    return (
      <p className="tts-sel__unavailable">
        Voz no disponible en este navegador. La entrevista continua con texto.
      </p>
    );
  }

  if (voices.length === 0) {
    return <p className="tts-sel__unavailable">Cargando voces del sistema...</p>;
  }

  function handleVoiceChange(uri: string): void {
    const selected = voices.find((v) => v.voiceURI === uri) ?? null;
    setPref('ttsVoiceURI', uri || null);
    onChange(selected, prefs.ttsRate);
  }

  function handleRateChange(value: number): void {
    setPref('ttsRate', value);
    const saved = voices.find((v) => v.voiceURI === prefs.ttsVoiceURI) ?? null;
    onChange(saved, value);
  }

  return (
    <div className="tts-sel">
      <label className="tts-sel__label" htmlFor="tts-voice">
        Voz del entrevistador
      </label>
      <select
        id="tts-voice"
        className="tts-sel__select"
        value={prefs.ttsVoiceURI ?? ''}
        onChange={(e) => handleVoiceChange(e.target.value)}
      >
        <option value="">Automática (es-*)</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>

      <label className="tts-sel__label" htmlFor="tts-rate">
        Velocidad: {prefs.ttsRate.toFixed(1)}×
      </label>
      <input
        id="tts-rate"
        className="tts-sel__range"
        type="range"
        min={0.5}
        max={2}
        step={0.1}
        value={prefs.ttsRate}
        onChange={(e) => handleRateChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
