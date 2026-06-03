/* eslint-disable react/no-unknown-property */
import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import './AvatarAura.css';
import { MeshDistortMaterial, Float } from '@react-three/drei';
type DistortMaterialImpl = React.ComponentRef<typeof MeshDistortMaterial>;

export interface AvatarAuraProps {
  fluency: number;
  rhythm: number;
  level: string;
  pause: number;
  speaking: boolean;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function mapRange(pct: number, min: number, max: number) {
  return min + (clamp(pct, 0, 100) / 100) * (max - min);
}
function pausePct(p: number) {
  return clamp((1 - p / 5) * 100, 0, 100);
}

/* ══════════════════════════════════════════════════════════
   NÚCLEO
   ══════════════════════════════════════════════════════════ */
function AuraCore({
  fluency,
  rhythm,
  speaking,
}: {
  fluency: number;
  rhythm: number;
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
        rhythm / 100,
      ),
    [rhythm],
  );

  const distort = mapRange(fluency, 0.08, 0.28);
  const emissiveInt = mapRange(rhythm, 0.12, 0.5);

  useFrame((state, delta) => {
    if (!meshRef.current || !matRef.current) return;
    // Solo rotación lenta sobre sí mismo — no orbital
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

/* ══════════════════════════════════════════════════════════
   ANILLO MÉTRICO — SIN rotación orbital
   Solo cambia excentricidad (scale.x / scale.y) según pct
   tiltX / tiltY orientan el plano del anillo hacia la esquina
   ══════════════════════════════════════════════════════════ */
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

  // 0% → círculo (sx=1, sy=1)  |  100% → estirado (sx=1.7, sy=0.75)
  const targetSX = mapRange(pct, 1.0, 1.7);
  const targetSY = mapRange(pct, 1.0, 0.75);
  const targetOp = speaking ? clamp(mapRange(pct, 0.38, 0.88), 0, 0.88) : mapRange(pct, 0.2, 0.58);

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;
    // SIN rotación orbital — solo morph de forma
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

/* ══════════════════════════════════════════════════════════
   PARTÍCULAS — flotan, no rotan orbitalmente
   ══════════════════════════════════════════════════════════ */
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
    // Deriva suave — no rotación orbital
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

/* ══════════════════════════════════════════════════════════
   ESCENA
   ══════════════════════════════════════════════════════════ */
function Scene({ fluency, rhythm, pause, speaking }: AvatarAuraProps) {
  const pp = pausePct(pause);
  return (
    <>
      <ambientLight intensity={0.42} />
      <pointLight position={[4, 4, 4]} intensity={3.0} color="#2563EB" />
      <pointLight position={[-4, -4, -4]} intensity={1.4} color="#0EA5E9" />
      <pointLight position={[0, 4, -4]} intensity={1.1} color="#6366F1" />
      {speaking && <pointLight position={[0, 0, 3]} intensity={2.8} color="#38BDF8" />}

      <AuraCore fluency={fluency} rhythm={rhythm} speaking={speaking} />

      {/*
        Cada anillo inclina su plano hacia su esquina de chip:
        TL (fluency)  → tiltX=+0.55  tiltY=-0.55
        TR (rhythm)   → tiltX=+0.55  tiltY=+0.55
        BL (nivel)    → tiltX=-0.55  tiltY=-0.55
        BR (pausa)    → tiltX=-0.55  tiltY=+0.55
      */}
      <MetricRing
        pct={fluency}
        color="#2563EB"
        radius={1.52}
        tiltX={0.55}
        tiltY={-0.55}
        speaking={speaking}
      />
      <MetricRing
        pct={rhythm}
        color="#0EA5E9"
        radius={1.8}
        tiltX={0.55}
        tiltY={0.55}
        speaking={speaking}
      />
      <MetricRing
        pct={pp}
        color="#A78BFA"
        radius={2.08}
        tiltX={-0.55}
        tiltY={-0.55}
        speaking={speaking}
      />
      <MetricRing
        pct={pp}
        color="#F59E0B"
        radius={2.36}
        tiltX={-0.55}
        tiltY={0.55}
        speaking={speaking}
      />

      <AuraParticles speaking={speaking} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   SIMULACIÓN DE CAMBIO DE MÉTRICAS (demo interna)
   En producción esto vendrá de props reales del WebSocket
   ══════════════════════════════════════════════════════════ */
function useSimulatedMetrics(base: AvatarAuraProps) {
  const [metrics, setMetrics] = useState({
    fluency: base.fluency,
    rhythm: base.rhythm,
    pause: base.pause,
  });

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((prev) => ({
        fluency: clamp(prev.fluency + (Math.random() * 10 - 5), 0, 100),
        rhythm: clamp(prev.rhythm + (Math.random() * 10 - 5), 0, 100),
        pause: clamp(prev.pause + (Math.random() * 0.4 - 0.2), 0, 5),
      }));
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return metrics;
}

/* ══════════════════════════════════════════════════════════
   EXPORT
   ══════════════════════════════════════════════════════════ */
export function AvatarAura(props: AvatarAuraProps) {
  const { level, speaking } = props;
  const sim = useSimulatedMetrics(props);

  const fluencyDelta = sim.fluency >= 70 ? 'up' : sim.fluency <= 40 ? 'down' : null;
  const rhythmDelta = sim.rhythm >= 70 ? 'up' : sim.rhythm <= 40 ? 'down' : null;
  const pp = pausePct(sim.pause);
  const pauseDelta = pp >= 70 ? 'up' : pp <= 40 ? 'down' : null;

  const live = { ...props, ...sim };

  return (
    <div className="aa-root">
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 66 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <Scene {...live} />
      </Canvas>

      {/* Chip TL — Fluidez — azul */}
      <div className="aa-metric aa-metric--tl aa-metric--blue">
        <span className="aa-metric__label">Fluidez</span>
        <span className="aa-metric__value">
          {Math.round(sim.fluency)}%
          {fluencyDelta && (
            <span className={`aa-delta aa-delta--${fluencyDelta}`}>
              {fluencyDelta === 'up' ? '▲' : '▼'}
            </span>
          )}
        </span>
        <div className="aa-metric__bar">
          <div
            className="aa-metric__bar-fill aa-metric__bar-fill--blue"
            style={{ width: `${sim.fluency}%` }}
          />
        </div>
      </div>

      {/* Chip TR — Ritmo — cian */}
      <div className="aa-metric aa-metric--tr aa-metric--cyan">
        <span className="aa-metric__label">Ritmo</span>
        <span className="aa-metric__value">
          {Math.round(sim.rhythm)}%
          {rhythmDelta && (
            <span className={`aa-delta aa-delta--${rhythmDelta}`}>
              {rhythmDelta === 'up' ? '▲' : '▼'}
            </span>
          )}
        </span>
        <div className="aa-metric__bar">
          <div
            className="aa-metric__bar-fill aa-metric__bar-fill--cyan"
            style={{ width: `${sim.rhythm}%` }}
          />
        </div>
      </div>

      {/* Chip BL — Nivel — violeta */}
      <div className="aa-metric aa-metric--bl aa-metric--violet">
        <span className="aa-metric__label">Nivel</span>
        <span className="aa-metric__value aa-metric__value--accent">{level}</span>
      </div>

      {/* Chip BR — Pausa — ámbar */}
      <div className="aa-metric aa-metric--br aa-metric--amber">
        <span className="aa-metric__label">Pausa</span>
        <span className="aa-metric__value">
          {sim.pause.toFixed(1)}s
          {pauseDelta && (
            <span className={`aa-delta aa-delta--${pauseDelta}`}>
              {pauseDelta === 'up' ? '▲' : '▼'}
            </span>
          )}
        </span>
        <div className="aa-metric__bar">
          <div
            className="aa-metric__bar-fill aa-metric__bar-fill--amber"
            style={{ width: `${pp}%` }}
          />
        </div>
      </div>

      <p className="aa-status">{speaking ? 'Escuchando…' : 'Procesando…'}</p>
    </div>
  );
}
