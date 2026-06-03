/* eslint-disable react/no-unknown-property */
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import './AvatarAura.css';
import { MeshDistortMaterial, Float } from '@react-three/drei';
type DistortMaterialImpl = React.ComponentRef<typeof MeshDistortMaterial>;

export interface AvatarAuraProps {
  fluency: number | null; // 0-100 o null = sin datos
  speechRate: number | null; // 0-100 (era "rhythm")
  eyeContact: number | null; // 0-100 (reemplaza "pause")
  speaking: boolean;
}

// Valor neutral usado en el render 3D cuando una metrica es null
const NEUTRAL = 50;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function mapRange(pct: number, min: number, max: number) {
  return min + (clamp(pct, 0, 100) / 100) * (max - min);
}

/* ======================================================
   NUCLEO
   ====================================================== */
function AuraCore({
  fluency,
  speechRate,
  speaking,
}: {
  fluency: number;
  speechRate: number;
  speaking: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<DistortMaterialImpl>(null);

  const coreColor = useMemo(
    () =>
      new THREE.Color().lerpColors(
        new THREE.Color('#DC2626'),
        new THREE.Color('#2563EB'),
        fluency / 100,
      ),
    [fluency],
  );

  const emissiveColor = useMemo(
    () =>
      new THREE.Color().lerpColors(
        new THREE.Color('#6366F1'),
        new THREE.Color('#0EA5E9'),
        speechRate / 100,
      ),
    [speechRate],
  );

  const distort = mapRange(fluency, 0.08, 0.28);
  const emissiveInt = mapRange(speechRate, 0.12, 0.5);

  useFrame((state, delta) => {
    if (!meshRef.current || !matRef.current) return;
    // Solo rotacion lenta sobre si mismo — no orbital
    meshRef.current.rotation.y += delta * 0.18;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.08;
    const s = meshRef.current.scale.x;
    meshRef.current.scale.setScalar(lerp(s, speaking ? 1.07 : 1.0, delta * 4));
    matRef.current.distort = lerp(
      matRef.current.distort,
      speaking ? distort * 1.45 : distort,
      delta * 2,
    );
    matRef.current.emissiveIntensity = lerp(
      matRef.current.emissiveIntensity,
      speaking ? emissiveInt * 1.8 : emissiveInt,
      delta * 3,
    );
  });

  return (
    <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.28}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.0, 64, 64]} />
        <MeshDistortMaterial
          ref={matRef}
          color={coreColor}
          attach="material"
          distort={distort}
          speed={speaking ? 3.0 : 1.6}
          roughness={0.05}
          metalness={0.65}
          emissive={emissiveColor}
          emissiveIntensity={emissiveInt}
        />
      </mesh>
    </Float>
  );
}

/* ======================================================
   ANILLO METRICO — SIN rotacion orbital
   Solo cambia excentricidad (scale.x / scale.y) segun pct
   tiltX / tiltY orientan el plano del anillo hacia la esquina
   ====================================================== */
function MetricRing({
  pct,
  color,
  radius,
  tiltX,
  tiltY,
  speaking,
}: {
  pct: number;
  color: string;
  radius: number;
  tiltX: number;
  tiltY: number;
  speaking: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  // 0% → circulo (sx=1, sy=1)  |  100% → estirado (sx=1.7, sy=0.75)
  const targetSX = mapRange(pct, 1.0, 1.7);
  const targetSY = mapRange(pct, 1.0, 0.75);
  const targetOp = speaking ? clamp(mapRange(pct, 0.38, 0.88), 0, 0.88) : mapRange(pct, 0.2, 0.58);

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;
    // SIN rotacion orbital — solo morph de forma
    meshRef.current.scale.x = lerp(meshRef.current.scale.x, targetSX, delta * 1.2);
    meshRef.current.scale.y = lerp(meshRef.current.scale.y, targetSY, delta * 1.2);
    matRef.current.opacity = lerp(matRef.current.opacity, targetOp, delta * 2.0);
  });

  return (
    <mesh ref={meshRef} rotation={[tiltX, tiltY, 0]}>
      <torusGeometry args={[radius, 0.013, 16, 128]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={mapRange(pct, 0.2, 0.58)}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ======================================================
   PARTICULAS — flotan, no rotan orbitalmente
   ====================================================== */
function AuraParticles({ speaking }: { speaking: boolean }) {
  const count = 85;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.0 + Math.random() * 1.2;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  useFrame((state, delta) => {
    if (!ref.current || !matRef.current) return;
    // Deriva suave — no rotacion orbital
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.08) * 0.15;
    ref.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.06) * 0.1;
    matRef.current.opacity = lerp(matRef.current.opacity, speaking ? 0.78 : 0.35, delta * 2);
    matRef.current.size = lerp(matRef.current.size, speaking ? 0.032 : 0.017, delta * 2);
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={matRef} size={0.017} color="#0EA5E9" transparent opacity={0.35} />
    </points>
  );
}

/* ======================================================
   ESCENA — 3 anillos para las 3 metricas reales
   TL (fluency)     → tiltX=+0.55  tiltY=-0.55
   TR (speechRate)  → tiltX=+0.55  tiltY=+0.55
   BL (eyeContact)  → tiltX=-0.55  tiltY=-0.55
   ====================================================== */
function Scene({
  fluency,
  speechRate,
  eyeContact,
  speaking,
}: {
  fluency: number;
  speechRate: number;
  eyeContact: number;
  speaking: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.42} />
      <pointLight position={[4, 4, 4]} intensity={3.0} color="#2563EB" />
      <pointLight position={[-4, -4, -4]} intensity={1.4} color="#0EA5E9" />
      <pointLight position={[0, 4, -4]} intensity={1.1} color="#6366F1" />
      {speaking && <pointLight position={[0, 0, 3]} intensity={2.8} color="#38BDF8" />}

      <AuraCore fluency={fluency} speechRate={speechRate} speaking={speaking} />

      <MetricRing
        pct={fluency}
        color="#2563EB"
        radius={1.52}
        tiltX={0.55}
        tiltY={-0.55}
        speaking={speaking}
      />
      <MetricRing
        pct={speechRate}
        color="#0EA5E9"
        radius={1.8}
        tiltX={0.55}
        tiltY={0.55}
        speaking={speaking}
      />
      <MetricRing
        pct={eyeContact}
        color="#A78BFA"
        radius={2.08}
        tiltX={-0.55}
        tiltY={-0.55}
        speaking={speaking}
      />

      <AuraParticles speaking={speaking} />
    </>
  );
}

/* ======================================================
   EXPORT
   ====================================================== */
export function AvatarAura({ fluency, speechRate, eyeContact, speaking }: AvatarAuraProps) {
  // Para el render 3D usamos NEUTRAL cuando la metrica es null
  const f3d = fluency ?? NEUTRAL;
  const sr3d = speechRate ?? NEUTRAL;
  const ec3d = eyeContact ?? NEUTRAL;

  const fluencyDelta =
    fluency !== null ? (fluency >= 70 ? 'up' : fluency <= 40 ? 'down' : null) : null;
  const speechRateDelta =
    speechRate !== null ? (speechRate >= 70 ? 'up' : speechRate <= 40 ? 'down' : null) : null;
  const eyeContactDelta =
    eyeContact !== null ? (eyeContact >= 70 ? 'up' : eyeContact <= 40 ? 'down' : null) : null;

  return (
    <div className="aa-root">
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 66 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <Scene fluency={f3d} speechRate={sr3d} eyeContact={ec3d} speaking={speaking} />
      </Canvas>

      {/* Chip TL — Fluidez — azul */}
      <div className="aa-metric aa-metric--tl aa-metric--blue" data-testid="aura-chip-fluency">
        <span className="aa-metric__label">Fluidez</span>
        {fluency !== null ? (
          <>
            <span className="aa-metric__value">
              {Math.round(fluency)}%
              {fluencyDelta && (
                <span className={`aa-delta aa-delta--${fluencyDelta}`}>
                  {fluencyDelta === 'up' ? '▲' : '▼'}
                </span>
              )}
            </span>
            <div className="aa-metric__bar">
              <div
                className="aa-metric__bar-fill aa-metric__bar-fill--blue"
                style={{ width: `${fluency}%` }}
              />
            </div>
          </>
        ) : (
          <span className="aa-metric__value">sin datos</span>
        )}
      </div>

      {/* Chip TR — Ritmo — cian */}
      <div className="aa-metric aa-metric--tr aa-metric--cyan" data-testid="aura-chip-speechRate">
        <span className="aa-metric__label">Ritmo</span>
        {speechRate !== null ? (
          <>
            <span className="aa-metric__value">
              {Math.round(speechRate)}%
              {speechRateDelta && (
                <span className={`aa-delta aa-delta--${speechRateDelta}`}>
                  {speechRateDelta === 'up' ? '▲' : '▼'}
                </span>
              )}
            </span>
            <div className="aa-metric__bar">
              <div
                className="aa-metric__bar-fill aa-metric__bar-fill--cyan"
                style={{ width: `${speechRate}%` }}
              />
            </div>
          </>
        ) : (
          <span className="aa-metric__value">sin datos</span>
        )}
      </div>

      {/* Chip BL — Contacto visual — violeta */}
      <div className="aa-metric aa-metric--bl aa-metric--violet" data-testid="aura-chip-eyeContact">
        <span className="aa-metric__label">Contacto visual</span>
        {eyeContact !== null ? (
          <>
            <span className="aa-metric__value">
              {Math.round(eyeContact)}%
              {eyeContactDelta && (
                <span className={`aa-delta aa-delta--${eyeContactDelta}`}>
                  {eyeContactDelta === 'up' ? '▲' : '▼'}
                </span>
              )}
            </span>
            <div className="aa-metric__bar">
              <div
                className="aa-metric__bar-fill aa-metric__bar-fill--violet"
                style={{ width: `${eyeContact}%` }}
              />
            </div>
          </>
        ) : (
          <span className="aa-metric__value">sin datos</span>
        )}
      </div>

      <p className="aa-status">{speaking ? 'Escuchando…' : 'Procesando…'}</p>
    </div>
  );
}
