import type { DragEvent, ChangeEvent } from 'react';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components';
import './ProfileSetup.css';

/* ── Tipos ───────────────────────────────────────────────── */
type ExperienceLevel = 0 | 1 | 2 | 3;
type DyslexiaFont = 'default' | 'opendyslexic' | 'lexie';

interface AccessibilityOptions {
  reducedMotion: boolean;
  audioFirst: boolean;
  liveSubtitles: boolean;
}

interface ProfileState {
  role: string;
  interests: string[];
  experienceLevel: ExperienceLevel;
  accessibilityOptions: AccessibilityOptions;
  dyslexiaFont: DyslexiaFont;
  cvFile: File | null;
}

/* ── Datos ───────────────────────────────────────────────── */
const INTEREST_AREAS = [
  'Comunicación efectiva',
  'Liderazgo',
  'Negociación',
  'Presentaciones',
  'Trabajo en equipo',
  'Resolución de conflictos',
  'Entrevistas laborales',
  'Oratoria',
  'Escucha activa',
  'Pensamiento crítico',
  'Networking',
  'Gestión del tiempo',
];

const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  0: 'Junior',
  1: 'Mid',
  2: 'Senior',
  3: 'Expert',
};

const DYSLEXIA_FONTS: { value: DyslexiaFont; label: string; description: string }[] = [
  { value: 'default', label: 'Estándar', description: 'DM Sans — fuente por defecto' },
  {
    value: 'opendyslexic',
    label: 'OpenDyslexic',
    description: 'Diseñada para lectores con dislexia',
  },
  { value: 'lexie', label: 'Lexie Readable', description: 'Alta legibilidad, interletrado amplio' },
];

/* ── Componente ──────────────────────────────────────────── */
export function ProfileSetup() {
  const navigate = useNavigate();

  const [state, setState] = useState<ProfileState>({
    role: '',
    interests: [],
    experienceLevel: 1,
    accessibilityOptions: {
      reducedMotion: false,
      audioFirst: false,
      liveSubtitles: false,
    },
    dyslexiaFont: 'default',
    cvFile: null,
  });

  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Handlers ── */
  const toggleInterest = (area: string) =>
    setState((s) => ({
      ...s,
      interests: s.interests.includes(area)
        ? s.interests.filter((i) => i !== area)
        : [...s.interests, area],
    }));

  const setExperience = (e: ChangeEvent<HTMLInputElement>) =>
    setState((s) => ({ ...s, experienceLevel: Number(e.target.value) as ExperienceLevel }));

  const toggleA11y = (key: keyof AccessibilityOptions) =>
    setState((s) => ({
      ...s,
      accessibilityOptions: {
        ...s.accessibilityOptions,
        [key]: !s.accessibilityOptions[key],
      },
    }));

  const setFont = (value: DyslexiaFont) => setState((s) => ({ ...s, dyslexiaFont: value }));

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setState((s) => ({ ...s, cvFile: file }));
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setState((s) => ({ ...s, cvFile: file }));
  };

  const removeFile = () => {
    setState((s) => ({ ...s, cvFile: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => navigate('/room');

  /* ── Render ── */
  return (
    <div className="ps-root">
      {/* Header */}
      <header className="ps-header">
        <div className="ps-header__logo">
          <img
            src="/logo.svg"
            alt="Logo"
            style={{ width: '50px', height: 'auto' }} // Ajusta el tamaño a tu gusto
          />
          <span className="ps-header__logo-name">Warachikuy</span>
        </div>

        <h1 className="ps-header__title">Configuración de perfil</h1>

        {/* Stepper */}
        <div className="ps-stepper" aria-label="Paso 2 de 3">
          <div className="ps-step ps-step--done">
            <span className="ps-step__circle">1</span>
            <span className="ps-step__label">Cuenta</span>
          </div>
          <div className="ps-step__line ps-step__line--done" aria-hidden="true" />
          <div className="ps-step ps-step--active">
            <span className="ps-step__circle">2</span>
            <span className="ps-step__label">Perfil</span>
          </div>
          <div className="ps-step__line" aria-hidden="true" />
          <div className="ps-step">
            <span className="ps-step__circle">3</span>
            <span className="ps-step__label">Listo</span>
          </div>
        </div>
      </header>

      {/* Body — 2 columnas */}
      <main className="ps-body">
        {/* ── Columna izquierda: perfil profesional ── */}
        <section className="ps-card" aria-labelledby="prof-heading">
          <h2 id="prof-heading" className="ps-card__heading">
            <span className="ps-card__heading-icon" aria-hidden="true">
              ✦
            </span>
            Perfil profesional
          </h2>

          {/* Rol */}
          <div className="ps-field">
            <label className="ps-label" htmlFor="role">
              ¿Cuál es tu rol actual?
            </label>
            <input
              id="role"
              className="ps-input"
              type="text"
              placeholder="Ej. Product Manager, Ingeniero de Software…"
              value={state.role}
              onChange={(e) => setState((s) => ({ ...s, role: e.target.value }))}
            />
          </div>

          {/* Intereses — chips */}
          <div className="ps-field">
            <span className="ps-label" id="interests-label">
              Áreas de interés
              <span className="ps-label__count" aria-live="polite">
                {state.interests.length > 0 ? ` · ${state.interests.length} seleccionadas` : ''}
              </span>
            </span>
            <div className="ps-chips" role="group" aria-labelledby="interests-label">
              {INTEREST_AREAS.map((area) => {
                const active = state.interests.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    className={`ps-chip${active ? ' ps-chip--active' : ''}`}
                    onClick={() => toggleInterest(area)}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slider experiencia */}
          <div className="ps-field">
            <label className="ps-label" htmlFor="experience">
              Nivel de experiencia
              <span className="ps-label__badge">{EXPERIENCE_LABELS[state.experienceLevel]}</span>
            </label>
            <div className="ps-slider-wrap">
              <input
                id="experience"
                type="range"
                min={0}
                max={3}
                step={1}
                value={state.experienceLevel}
                onChange={setExperience}
                className="ps-slider"
                aria-valuetext={EXPERIENCE_LABELS[state.experienceLevel]}
              />
              <div className="ps-slider-labels" aria-hidden="true">
                {(Object.values(EXPERIENCE_LABELS) as string[]).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Dropzone CV */}
          <div className="ps-field">
            <span className="ps-label">
              CV / Currículum <span className="ps-label__optional">(opcional)</span>
            </span>

            {state.cvFile ? (
              <div className="ps-file-preview" role="status" aria-live="polite">
                <span className="ps-file-preview__icon" aria-hidden="true">
                  📄
                </span>
                <span className="ps-file-preview__name">{state.cvFile.name}</span>
                <span className="ps-file-preview__size">
                  {(state.cvFile.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  className="ps-file-preview__remove"
                  onClick={removeFile}
                  aria-label="Eliminar archivo"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                className={`ps-dropzone${dragging ? ' ps-dropzone--hover' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Sube tu CV arrastrando o haciendo clic"
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                <span className="ps-dropzone__icon" aria-hidden="true">
                  ⬆
                </span>
                <span className="ps-dropzone__main">Arrastra tu CV aquí</span>
                <span className="ps-dropzone__sub">
                  o haz clic para seleccionar · PDF, DOCX · máx. 5 MB
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="ps-dropzone__input"
                  onChange={handleFileInput}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Columna derecha: accesibilidad ── */}
        <section className="ps-card" aria-labelledby="a11y-heading">
          <h2 id="a11y-heading" className="ps-card__heading">
            <span className="ps-card__heading-icon" aria-hidden="true">
              ◈
            </span>
            Accesibilidad
          </h2>

          {/* Toggles */}
          <div className="ps-field">
            <span className="ps-label">Preferencias de sesión</span>

            <div className="ps-toggles">
              {(
                [
                  {
                    key: 'reducedMotion',
                    label: 'Reducir movimiento',
                    desc: 'Minimiza animaciones y transiciones',
                  },
                  {
                    key: 'audioFirst',
                    label: 'Audio primero',
                    desc: 'Prioriza descripción de audio en sala',
                  },
                  {
                    key: 'liveSubtitles',
                    label: 'Subtítulos en tiempo real',
                    desc: 'Muestra transcripción automática',
                  },
                ] as const
              ).map(({ key, label, desc }) => (
                <div key={key} className="ps-toggle-row">
                  <div className="ps-toggle-row__info">
                    <span className="ps-toggle-row__label">{label}</span>
                    <span className="ps-toggle-row__desc">{desc}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={state.accessibilityOptions[key]}
                    aria-label={label}
                    className={`ps-toggle${state.accessibilityOptions[key] ? ' ps-toggle--on' : ''}`}
                    onClick={() => toggleA11y(key)}
                  >
                    <span className="ps-toggle__thumb" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tipografía dislexia — radios */}
          <div className="ps-field">
            <span className="ps-label" id="font-label">
              Tipografía para dislexia
            </span>
            <div className="ps-radios" role="radiogroup" aria-labelledby="font-label">
              {DYSLEXIA_FONTS.map(({ value, label, description }) => (
                <label
                  key={value}
                  className={`ps-radio-card${state.dyslexiaFont === value ? ' ps-radio-card--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="dyslexiaFont"
                    value={value}
                    checked={state.dyslexiaFont === value}
                    onChange={() => setFont(value)}
                    className="ps-radio-card__input"
                  />
                  <span className="ps-radio-card__dot" aria-hidden="true" />
                  <span className="ps-radio-card__body">
                    <span className="ps-radio-card__label">{label}</span>
                    <span className="ps-radio-card__desc">{description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="ps-cta">
            <Button variant="primary" size="lg" fullWidth onClick={handleSubmit}>
              Iniciar →
            </Button>
            <p className="ps-cta__hint">
              Puedes modificar estas opciones en cualquier momento desde ajustes.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
