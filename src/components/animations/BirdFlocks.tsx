import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BIRD_POLYGONS, { type PolygonFragment, birdPalette } from '@/data/birdPolygons';

// ─── STAGE TIMING (milliseconds) ───
const STAGE = {
  IDLE: 0,
  ACTIVATION: 1,
  FRAGMENTATION: 2,
  COMPLEXITY_REMOVAL: 3,
  CLARITY: 4,
  OS_REVEALED: 5,
} as const;

type Stage = (typeof STAGE)[keyof typeof STAGE];

const TIMING: Record<Stage, number> = {
  [STAGE.IDLE]: Infinity,
  [STAGE.ACTIVATION]: 200,
  [STAGE.FRAGMENTATION]: 500,
  [STAGE.COMPLEXITY_REMOVAL]: 800,
  [STAGE.CLARITY]: 600,
  [STAGE.OS_REVEALED]: 300,
};

// ─── NETWORK NODES (decorative) ───
interface NetworkNode {
  x: number;
  y: number;
}

interface NetworkLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const GRID_SIZE = 5;

function generateNetwork(): { nodes: NetworkNode[]; lines: NetworkLine[] } {
  const nodes: NetworkNode[] = [];
  const lines: NetworkLine[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      const x = 15 + (j / (GRID_SIZE - 1)) * 70;
      const y = 15 + (i / (GRID_SIZE - 1)) * 70;
      nodes.push({ x, y });
    }
  }
  // Connect adjacent nodes
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      const idx = i * GRID_SIZE + j;
      if (j < GRID_SIZE - 1) {
        lines.push({
          x1: nodes[idx].x, y1: nodes[idx].y,
          x2: nodes[idx + 1].x, y2: nodes[idx + 1].y,
        });
      }
      if (i < GRID_SIZE - 1) {
        lines.push({
          x1: nodes[idx].x, y1: nodes[idx].y,
          x2: nodes[idx + GRID_SIZE].x, y2: nodes[idx + GRID_SIZE].y,
        });
      }
    }
  }
  return { nodes, lines };
}

const NETWORK = generateNetwork();

// ─── GHOST BIRD (faint overlay stays throughout) ───
function GhostBird({ polygons }: { polygons: PolygonFragment[] }) {
  return (
    <g opacity={0.08}>
      {polygons.map((p) => (
        <polygon key={`ghost-${p.id}`} points={p.points} fill={p.color} />
      ))}
    </g>
  );
}

// ─── SCENE DIMENSIONS ───
const VIEWBOX = '0 0 100 100';

// ─── COLLISION POINTS: where fragments hit network lines ───
const COLLISION_POINTS = [
  { x: 18, y: 50 }, { x: 30, y: 30 }, { x: 40, y: 65 },
  { x: 55, y: 25 }, { x: 60, y: 55 }, { x: 65, y: 80 },
  { x: 75, y: 20 }, { x: 80, y: 70 }, { x: 85, y: 35 },
  { x: 45, y: 45 }, { x: 25, y: 70 }, { x: 70, y: 45 },
];

// ─── FRAGMENT DRIFT TARGETS (where fragments fly during complexity removal) ───
const DRIFT_TARGETS: { x: number; y: number }[] = [
  { x: -20, y: -10 }, { x: 120, y: 5 }, { x: -10, y: 110 },
  { x: 110, y: -15 }, { x: -25, y: 60 }, { x: 130, y: 90 },
  { x: 5, y: -25 }, { x: 95, y: 120 }, { x: 30, y: -20 },
  { x: -15, y: 80 }, { x: 125, y: 30 }, { x: 70, y: -10 },
];

// ─── CLUSTER ASSIGNMENTS (which group goes where) ───
const CLUSTER_MAP: Record<string, number> = {
  head: 0, body: 1, wing_upper: 2, wing_lower: 3, tail: 4,
};

// ─── MAIN COMPONENT ───
interface BirdFlocksProps {
  onTransitionComplete?: () => void;
}

export default function BirdFlocks({ onTransitionComplete }: BirdFlocksProps) {
  const [stage, setStage] = useState<Stage>(STAGE.IDLE);
  const [activated, setActivated] = useState(false);
  const [showLoginCard, setShowLoginCard] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [dissolvedLines, setDissolvedLines] = useState<Set<number>>(new Set());
  const timelineRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [rotation, setRotation] = useState(0);

  // ── IDLE ROTATION ──
  useEffect(() => {
    if (stage !== STAGE.IDLE) return;
    const interval = setInterval(() => {
      setRotation((r) => r + 1);
    }, 80); // ~12 degrees/sec, 30s per full rotation
    return () => clearInterval(interval);
  }, [stage]);

  // ── ACTIVATE ──
  const activate = useCallback(() => {
    if (activated) return;
    setActivated(true);

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Stage 2: Activation (200ms)
    setStage(STAGE.ACTIVATION);
    timers.push(setTimeout(() => {
      // Stage 3: Fragmentation (500ms)
      setStage(STAGE.FRAGMENTATION);
      timers.push(setTimeout(() => {
        // Stage 4: Complexity Removal (800ms)
        setStage(STAGE.COMPLEXITY_REMOVAL);
        // Dissolve network lines progressively
        let lineIdx = 0;
        const dissolveInterval = setInterval(() => {
          setDissolvedLines((prev) => {
            const next = new Set(prev);
            next.add(lineIdx);
            return next;
          });
          lineIdx++;
          if (lineIdx > NETWORK.lines.length) {
            clearInterval(dissolveInterval);
          }
        }, 60);
        timers.push(setTimeout(() => {
          clearInterval(dissolveInterval);
          // Stage 5: Clarity (600ms)
          setStage(STAGE.CLARITY);
          setShowLoginCard(true);
          timers.push(setTimeout(() => {
            setShowWorkspace(true);
            // Stage 6: OS Revealed (300ms)
            setStage(STAGE.OS_REVEALED);
            timers.push(setTimeout(() => {
              onTransitionComplete?.();
            }, TIMING[STAGE.OS_REVEALED]));
          }, TIMING[STAGE.CLARITY] * 0.6));
        }, TIMING[STAGE.COMPLEXITY_REMOVAL]));
      }, TIMING[STAGE.FRAGMENTATION]));
    }, TIMING[STAGE.ACTIVATION]));

    timelineRef.current = timers;
  }, [activated, onTransitionComplete]);

  // ── CLEANUP ──
  useEffect(() => {
    return () => {
      timelineRef.current.forEach(clearTimeout);
    };
  }, []);

  // ── FRAGMENT ANIMATION VARIANTS ──
  const fragmentVariants = {
    idle: (i: number) => ({
      x: 0,
      y: 0,
      rotate: 0,
      opacity: 1,
      scale: 1,
      transition: { duration: 0.3, ease: 'easeInOut' },
    }),
    activated: {
      x: 0,
      y: 0,
      rotate: 0,
      opacity: 1,
      transition: { duration: 0.15, ease: 'easeInOut' },
    },
    fragmenting: (i: number) => {
      const drift = DRIFT_TARGETS[i % DRIFT_TARGETS.length];
      return {
        x: drift.x * 0.4,
        y: drift.y * 0.4,
        rotate: (i % 3 - 1) * 8,
        opacity: 0.9,
        scale: 0.85,
        transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] },
      };
    },
    removing_complexity: (i: number) => {
      const target = DRIFT_TARGETS[i % DRIFT_TARGETS.length];
      return {
        x: target.x * 1.2,
        y: target.y * 1.2,
        rotate: (i % 5 - 2) * 12,
        opacity: 0.6,
        scale: 0.6,
        transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1.0] },
      };
    },
    clarity: (i: number) => {
      const cluster = CLUSTER_MAP[BIRD_POLYGONS[i]?.group] ?? (i % 5);
      const clusterTargets = [
        { x: 42, y: 55 }, // head group → mark top-left
        { x: 38, y: 58 }, // body group
        { x: 30, y: 42 }, // upper wing
        { x: 36, y: 70 }, // lower wing
        { x: 25, y: 65 }, // tail
      ];
      const t = clusterTargets[cluster];
      return {
        x: t.x - (BIRD_POLYGONS[i]?.centroid.x ?? 50) * 0.5,
        y: t.y - (BIRD_POLYGONS[i]?.centroid.y ?? 50) * 0.5,
        rotate: 0,
        opacity: 0.7,
        scale: 0.35,
        transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1.0] },
      };
    },
    os_revealed: (i: number) => {
      const markTargets = [
        { x: 5, y: 5 },  // login card header small bird
      ];
      const t = markTargets[0];
      return {
        x: t.x - (BIRD_POLYGONS[i]?.centroid.x ?? 50) * 0.25,
        y: t.y - (BIRD_POLYGONS[i]?.centroid.y ?? 50) * 0.25,
        rotate: 0,
        opacity: 0.9,
        scale: 0.15,
        transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1.0] },
      };
    },
  };

  const stageKey =
    stage === STAGE.IDLE ? 'idle' :
    stage === STAGE.ACTIVATION ? 'activated' :
    stage === STAGE.FRAGMENTATION ? 'fragmenting' :
    stage === STAGE.COMPLEXITY_REMOVAL ? 'removing_complexity' :
    stage === STAGE.CLARITY ? 'clarity' :
    'os_revealed';

  const rotationDeg = stage === STAGE.IDLE ? rotation : 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: stage >= STAGE.CLARITY
          ? 'linear-gradient(135deg, #FFFFFF 0%, #F7F9FA 50%, #EEF3F4 100%)'
          : 'linear-gradient(135deg, #021F23 0%, #073C40 50%, #0A5B5F 100%)',
        transition: 'background 1.2s ease-in-out',
        overflow: 'hidden',
        zIndex: 50,
        cursor: activated ? 'default' : 'pointer',
      }}
      onClick={!activated ? activate : undefined}
    >
      {/* ── BACKGROUND NETWORK LINES ── */}
      <svg
        viewBox={VIEWBOX}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
        preserveAspectRatio="xMidYMid slice"
      >
        {NETWORK.lines.map((line, i) => (
          <motion.line
            key={`net-${i}`}
            x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2}
            stroke={stage >= STAGE.CLARITY ? '#D0D5DD' : '#0A5B5F'}
            strokeWidth={0.3}
            opacity={dissolvedLines.has(i) ? 0 : (stage >= STAGE.CLARITY ? 0.3 : 0.4)}
            initial={false}
            animate={dissolvedLines.has(i) ? { opacity: 0, transition: { duration: 0.3 } } : {
              opacity: stage >= STAGE.CLARITY ? 0 : 0.4,
              transition: { duration: 1.0 },
            }}
          />
        ))}

        {/* ── HOVERING NODES ── */}
        {NETWORK.nodes.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.x}
            cy={node.y}
            r={0.6}
            fill={stage >= STAGE.CLARITY ? '#D0D5DD' : '#0A5B5F'}
            animate={
              dissolvedLines.size > i * 2
                ? { opacity: 0, r: 0, transition: { duration: 0.3 } }
                : { opacity: stage >= STAGE.CLARITY ? 0 : 0.5 }
            }
          />
        ))}

        {/* ── GHOST BIRD (always present) ── */}
        <GhostBird polygons={BIRD_POLYGONS} />

        {/* ── ACTIVE FRAGMENTS ── */}
        <g
          style={{
            transformOrigin: '50px 50px',
            transform: `rotate(${rotationDeg}deg)`,
            transition: 'transform 0.08s linear',
          }}
        >
          {BIRD_POLYGONS.map((poly, i) => {
            const driftTarget = DRIFT_TARGETS[i % DRIFT_TARGETS.length];
            const cluster = CLUSTER_MAP[poly.group] ?? (i % 5);

            return (
              <motion.polygon
                key={poly.id}
                points={poly.points}
                fill={poly.color}
                custom={i}
                variants={fragmentVariants}
                initial="idle"
                animate={stageKey}
                style={{
                  transformOrigin: `${poly.centroid.x}px ${poly.centroid.y}px`,
                }}
              />
            );
          })}
        </g>
      </svg>

      {/* ── LOGIN CARD ── */}
      <AnimatePresence>
        {showLoginCard && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(420px, 90vw)',
              background: '#FFFFFF',
              borderRadius: 16,
              padding: 40,
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
              zIndex: 60,
            }}
          >
            {/* Small bird mark in card header */}
            <svg
              viewBox="0 0 100 100"
              style={{ width: 40, height: 40, marginBottom: 24 }}
            >
              {BIRD_POLYGONS.slice(0, 12).map((p) => (
                <polygon
                  key={p.id}
                  points={p.points}
                  fill={p.color}
                  opacity={0.6}
                />
              ))}
            </svg>

            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#021F23', margin: '0 0 4px' }}>
              Architex OS
            </h2>
            <p style={{ fontSize: 14, color: '#667085', margin: '0 0 32px' }}>
              Sign in to your workspace
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input
                type="email"
                placeholder="Email address"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #D0D5DD',
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <input
                type="password"
                placeholder="Password"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid #D0D5DD',
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#073C40',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Sign In
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#98A2B3', textAlign: 'center', marginTop: 24 }}>
              Protected by Architex OS security
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── REQUEST ACCESS BUTTON (stages 1-4) ── */}
      {!activated && (
        <motion.button
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'absolute',
            bottom: '15%',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '14px 40px',
            background: 'rgba(138, 223, 210, 0.15)',
            border: '1px solid rgba(138, 223, 210, 0.3)',
            borderRadius: 8,
            color: '#8EDFD2',
            fontSize: 15,
            fontWeight: 500,
            cursor: 'pointer',
            letterSpacing: '0.5px',
            zIndex: 55,
          }}
          whileHover={{
            background: 'rgba(138, 223, 210, 0.25)',
            borderColor: 'rgba(138, 223, 210, 0.5)',
          }}
          onClick={activate}
        >
          Request Access
        </motion.button>
      )}
    </div>
  );
}
