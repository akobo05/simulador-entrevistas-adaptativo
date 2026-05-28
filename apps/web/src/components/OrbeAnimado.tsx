/* eslint-disable react/no-unknown-property */
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Ring, Float } from '@react-three/drei';
// @ts-expect-error: Suppress missing type declarations for 'three' package
import * as THREE from 'three';

function OrbeCore() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <Sphere ref={meshRef} args={[1.2, 64, 64]}>
        <MeshDistortMaterial
          color="#ff6b35"
          attach="material"
          distort={0.35}
          speed={2}
          roughness={0.1}
          metalness={0.8}
          emissive="#ff3300"
          emissiveIntensity={0.2}
        />
      </Sphere>
    </Float>
  );
}

function AnilloOrbitante({
  radio,
  velocidad,
  color,
  inclinacion = 0,
}: {
  radio: number;
  velocidad: number;
  color: string;
  inclinacion?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = state.clock.elapsedTime * velocidad;
    }
  });

  return (
    <mesh ref={ref} rotation={[inclinacion, 0, 0]}>
      <Ring args={[radio - 0.015, radio + 0.015, 128]}>
        <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
      </Ring>
    </mesh>
  );
}

function ParticlesDot() {
  const count = 80;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 2.2 + Math.random() * 1.2;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.025} color="#ffaa44" transparent opacity={0.7} />
    </points>
  );
}

export function OrbeAnimado() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={2} color="#ff6b35" />
        <pointLight position={[-5, -5, -5]} intensity={1} color="#ffcc00" />
        <pointLight position={[0, 5, -5]} intensity={1.5} color="#ff8844" />

        <OrbeCore />
        <AnilloOrbitante radio={2.0} velocidad={0.4} color="#ff6b35" inclinacion={Math.PI / 6} />
        <AnilloOrbitante radio={2.5} velocidad={-0.25} color="#ffaa44" inclinacion={Math.PI / 3} />
        <AnilloOrbitante radio={1.7} velocidad={0.6} color="#ff4422" inclinacion={Math.PI / 2} />
        <ParticlesDot />
      </Canvas>
    </div>
  );
}
