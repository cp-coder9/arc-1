import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { motion, useReducedMotion } from 'framer-motion';
import birdData from '@/data/bird_particles.json';

/* ------------------------------------------------------------------ */
/* Types & Constants                                                   */
/* ------------------------------------------------------------------ */

type AnimationStage = 1 | 2 | 3 | 4 | 5 | 6;

interface BirdFlocksProps {
  stage: AnimationStage;
  onActivate: () => void;
  prefersReducedMotion?: boolean;
  className?: string;
}

const CLUSTER_COUNT = 30;
const STAGE_DURATIONS: Record<number, number> = {
  2: 200,   // Activation (ms)
  3: 500,   // Fragmentation
  4: 800,   // Complexity Removal
  5: 600,   // Clarity Emerges
  6: 300,   // OS Revealed
};

const COLORS = {
  idle: '#8EDFD2',
  accent: '#0A5B5F',
  ghost: 'rgba(143, 224, 210, 0.08)',
} as const;

/* ------------------------------------------------------------------ */
/* Bird Point Cloud Scene                                              */
/* ------------------------------------------------------------------ */

interface BirdSceneProps {
  stage: AnimationStage;
  prefersReducedMotion: boolean;
  onBirdClick: () => void;
}

function BirdScene({ stage, prefersReducedMotion, onBirdClick }: BirdSceneProps) {
  const meshRef = useRef<THREE.Points>(null);
  const ghostRef = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const ghostGeometryRef = useRef<THREE.BufferGeometry | null>(null);

  const { size } = useThree();

  // Process bird data into typed arrays
  const { positions, colors, opacities, center } = useMemo(() => {
    const pts = birdData.points as [number, number, number][];
    const cols = birdData.colors as [number, number, number][];
    const opas = birdData.opacity as number[];

    const pos = new Float32Array(pts.length * 3);
    const col = new Float32Array(pts.length * 3);
    const opa = new Float32Array(pts.length);
    let cx = 0, cy = 0, cz = 0;

    for (let i = 0; i < pts.length; i++) {
      const [x, y, z] = pts[i];
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      cx += x;
      cy += y;
      cz += z;

      const c = cols[i] || [143, 224, 210];
      col[i * 3] = c[0] / 255;
      col[i * 3 + 1] = c[1] / 255;
      col[i * 3 + 2] = c[2] / 255;
      opa[i] = opas[i] ?? 0.9;
    }

    return {
      positions: pos,
      colors: col,
      opacities: opa,
      center: new THREE.Vector3(cx / pts.length, cy / pts.length, cz / pts.length),
      pointCount: pts.length,
    };
  }, []);

  // Cluster assignments — deterministic based on index
  const clusters = useMemo(() => {
    const clusterOfPoint = new Uint8Array(positions.length / 3);
    const clusterCenters: THREE.Vector3[] = [];
    const clusterDrifts: THREE.Vector3[] = [];

    for (let c = 0; c < CLUSTER_COUNT; c++) {
      const angle1 = (c / CLUSTER_COUNT) * Math.PI * 2;
      const angle2 = (c * 7.3) % (Math.PI * 2);
      const radius = 0.08 + (c % 5) * 0.03;
      clusterCenters.push(
        new THREE.Vector3(
          Math.cos(angle1) * radius,
          Math.sin(angle2) * radius,
          (Math.cos(angle1 + angle2) * radius) / 2,
        ),
      );
      // Drift direction for stage 3-4 (outward in various directions)
      const driftAngle1 = (c / CLUSTER_COUNT) * Math.PI * 2 + 0.3;
      const driftAngle2 = (c * 11.17) % (Math.PI * 2);
      clusterDrifts.push(
        new THREE.Vector3(
          Math.cos(driftAngle1) * (1.2 + (c % 4) * 0.2),
          Math.sin(driftAngle2) * (0.8 + (c % 3) * 0.15),
          Math.cos(driftAngle1 + driftAngle2) * 0.5,
        ),
      );
    }

    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      let minDist = Infinity;
      let bestC = 0;
      for (let c = 0; c < CLUSTER_COUNT; c++) {
        const dist = new THREE.Vector3(x - center.x, y - center.y, z - center.z)
          .sub(clusterCenters[c])
          .length();
        if (dist < minDist) {
          minDist = dist;
          bestC = c;
        }
      }
      clusterOfPoint[i] = bestC;
    }

    return { clusterOfPoint, clusterCenters, clusterDrifts };
  }, [positions, center]);

  // Animation state
  const animState = useRef({
    startTime: 0,
    progress: 0,
    // Target positions for fragmentation
    fragmentTargets: new Float32Array(positions.length),
    // Opacity per point during animation
    pointOpacity: new Float32Array(positions.length / 3),
    // Final target for regroup
    regroupTarget: new Float32Array(positions.length),
  });

  // Compute fragment targets once
  const fragmentTargets = useMemo(() => {
    const targets = new Float32Array(positions.length);
    const regTargets = new Float32Array(positions.length);
    for (let i = 0; i < positions.length / 3; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      const cIdx = clusters.clusterOfPoint[i];
      const drift = clusters.clusterDrifts[cIdx];

      // Fragment target = original + drift (spread outward)
      targets[i * 3] = px + drift.x;
      targets[i * 3 + 1] = py + drift.y;
      targets[i * 3 + 2] = pz + drift.z;

      // Regroup target = compact bird at top-left area (scaled down ~40%)
      const scale = 0.35;
      const tx = -2.8 + px * scale;
      const ty = 1.5 + py * scale;
      const tz = pz * scale;
      regTargets[i * 3] = tx;
      regTargets[i * 3 + 1] = ty;
      regTargets[i * 3 + 2] = tz;
    }
    return { fragmentTargets: targets, regroupTargets: regTargets };
  }, [positions, clusters]);

  // Animation progress tracking
  const stageStartRef = useRef(0);
  const prevStageRef = useRef<AnimationStage>(1);

  // Track stage changes
  useEffect(() => {
    if (prevStageRef.current !== stage) {
      stageStartRef.current = performance.now();
      prevStageRef.current = stage;
    }
  }, [stage]);

  // Smooth easing function — cubic bezier approximation, no bounce/spring
  function smoothEase(t: number): number {
    // Custom ease-in-out: fast start, gentle finish
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Per-frame animation loop
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const now = performance.now();
    const elapsed = stageStartRef.current > 0 ? now - stageStartRef.current : 0;
    const duration = STAGE_DURATIONS[stage] || 500;
    const progress = Math.min(elapsed / duration, 1);
    const eased = smoothEase(progress);

    const geometry = mesh.geometry;
    const posAttr = geometry.attributes.position;
    const posArray = posAttr.array as Float32Array;

    // Ghost mesh
    const ghostMesh = ghostRef.current;

    switch (stage) {
      case 1: {
        // Idle: slow rotation + subtle bobble
        if (!prefersReducedMotion) {
          mesh.rotation.y += delta * 0.025; // ~25s per rotation
          mesh.rotation.x = Math.sin(now * 0.0004) * 0.02;
          mesh.rotation.z = Math.cos(now * 0.0003) * 0.015;
        }

        // Keep position at original
        for (let i = 0; i < posArray.length; i++) {
          posArray[i] = positions[i];
        }
        posAttr.needsUpdate = true;

        // Hide ghost
        if (ghostMesh) {
          ghostMesh.visible = false;
        }

        // Opacity = normal
        const mat = mesh.material as THREE.PointsMaterial;
        mat.opacity = 1;
        break;
      }

      case 2: {
        // Activation: gentle deceleration of rotation
        const slowFactor = 1 - eased;
        if (!prefersReducedMotion) {
          mesh.rotation.y += delta * 0.025 * slowFactor;
        }

        // Keep position at original
        for (let i = 0; i < posArray.length; i++) {
          posArray[i] = positions[i];
        }
        posAttr.needsUpdate = true;

        if (ghostMesh) ghostMesh.visible = false;
        (mesh.material as THREE.PointsMaterial).opacity = 1;
        break;
      }

      case 3: {
        // Fragmentation: clusters drift outward
        const ghostVis = ghostMesh;
        if (ghostVis) {
          ghostVis.visible = true;
          const gPosAttr = ghostVis.geometry.attributes.position;
          const gArray = gPosAttr.array as Float32Array;
          for (let i = 0; i < gArray.length; i++) {
            gArray[i] = positions[i];
          }
          gPosAttr.needsUpdate = true;
          (ghostVis.material as THREE.PointsMaterial).opacity = 0.08;
        }

        for (let i = 0; i < posArray.length / 3; i++) {
          const idx3 = i * 3;
          posArray[idx3] = positions[idx3] + (fragmentTargets.fragmentTargets[idx3] - positions[idx3]) * eased;
          posArray[idx3 + 1] = positions[idx3 + 1] + (fragmentTargets.fragmentTargets[idx3 + 1] - positions[idx3 + 1]) * eased;
          posArray[idx3 + 2] = positions[idx3 + 2] + (fragmentTargets.fragmentTargets[idx3 + 2] - positions[idx3 + 2]) * eased;
        }
        posAttr.needsUpdate = true;
        (mesh.material as THREE.PointsMaterial).opacity = 1;
        break;
      }

      case 4: {
        // Complexity Removal: fragments continue, fade out
        for (let i = 0; i < posArray.length / 3; i++) {
          const idx3 = i * 3;
          // Continue drifting slightly further
          const extraDrift = eased * 0.3;
          posArray[idx3] = fragmentTargets.fragmentTargets[idx3] + (fragmentTargets.fragmentTargets[idx3] - positions[idx3]) * extraDrift;
          posArray[idx3 + 1] = fragmentTargets.fragmentTargets[idx3 + 1] + (fragmentTargets.fragmentTargets[idx3 + 1] - positions[idx3 + 1]) * extraDrift;
          posArray[idx3 + 2] = fragmentTargets.fragmentTargets[idx3 + 2] + (fragmentTargets.fragmentTargets[idx3 + 2] - positions[idx3 + 2]) * extraDrift;
        }
        posAttr.needsUpdate = true;

        // Fade out: 1 → 0
        const fadeOpacity = 1 - eased;
        (mesh.material as THREE.PointsMaterial).opacity = fadeOpacity;

        // Ghost also fades a bit
        if (ghostMesh) {
          (ghostMesh.material as THREE.PointsMaterial).opacity = 0.06 * (1 - eased * 0.7);
        }
        break;
      }

      case 5: {
        // Clarity Emerges: fragments slow, begin regrouping
        const regroupEased = smoothEase(Math.min(progress * 1.2, 1)); // slightly faster progression

        for (let i = 0; i < posArray.length / 3; i++) {
          const idx3 = i * 3;
          const fragX = fragmentTargets.fragmentTargets[idx3];
          const fragY = fragmentTargets.fragmentTargets[idx3 + 1];
          const fragZ = fragmentTargets.fragmentTargets[idx3 + 2];
          const regX = fragmentTargets.regroupTargets[idx3];
          const regY = fragmentTargets.regroupTargets[idx3 + 1];
          const regZ = fragmentTargets.regroupTargets[idx3 + 2];

          // Start from far position, move toward regroup target
          posArray[idx3] = fragX + (regX - fragX) * regroupEased;
          posArray[idx3 + 1] = fragY + (regY - fragY) * regroupEased;
          posArray[idx3 + 2] = fragZ + (regZ - fragZ) * regroupEased;
        }
        posAttr.needsUpdate = true;

        // Fade back in
        (mesh.material as THREE.PointsMaterial).opacity = regroupEased;

        // Ghost fades out
        if (ghostMesh) {
          (ghostMesh.material as THREE.PointsMaterial).opacity = 0.06 * (1 - regroupEased);
        }
        break;
      }

      case 6: {
        // OS Revealed: final snap to regroup position
        for (let i = 0; i < posArray.length / 3; i++) {
          const idx3 = i * 3;
          posArray[idx3] = fragmentTargets.regroupTargets[idx3];
          posArray[idx3 + 1] = fragmentTargets.regroupTargets[idx3 + 1];
          posArray[idx3 + 2] = fragmentTargets.regroupTargets[idx3 + 2];
        }
        posAttr.needsUpdate = true;
        (mesh.material as THREE.PointsMaterial).opacity = 1;

        // Reset rotation
        mesh.rotation.set(0, 0, 0);

        if (ghostMesh) {
          ghostMesh.visible = false;
        }
        break;
      }
    }
  });

  // Initial geometry setup
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(positions);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return geo;
  }, [positions]);

  // Ghost geometry (same positions, always at original)
  const ghostGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(positions);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return geo;
  }, [positions]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (stage === 1) {
      onBirdClick();
    }
  }, [stage, onBirdClick]);

  // Determine point size based on stage
  const pointSize = stage === 6 ? 0.015 : 0.025;

  return (
    <group>
      {/* Ghost bird anchor — faint outline at original position */}
      <points ref={ghostRef} geometry={ghostGeometry} visible={false}>
        <pointsMaterial
          size={0.018}
          color="#8EDFD2"
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {/* Main bird point cloud */}
      <points
        ref={meshRef}
        geometry={geometry}
        onClick={handleClick}
        onPointerEnter={(e) => {
          if (stage === 1) {
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerLeave={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <pointsMaterial
          size={pointSize}
          color="#8EDFD2"
          transparent
          opacity={1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Main BirdFlocks Wrapper                                             */
/* ------------------------------------------------------------------ */

export function BirdFlocks({ stage, onActivate, prefersReducedMotion, className }: BirdFlocksProps) {
  const reduceMotion = useReducedMotion();
  const effectiveReducedMotion = prefersReducedMotion || reduceMotion === true;

  // Scale: the bird is roughly 1 unit in size, we want it to fill the container
  return (
    <div className={className} style={{ background: 'transparent' }}>
      <Canvas
        camera={{ position: [0, 0, 1.5], fov: 45, near: 0.01, far: 10 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
      >
        <BirdScene
          stage={stage}
          prefersReducedMotion={effectiveReducedMotion}
          onBirdClick={onActivate}
        />
      </Canvas>
    </div>
  );
}

export type { AnimationStage };
