import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface BackgroundNetworkProps {
  stage: number; // 1-6
  prefersReducedMotion?: boolean;
}

const NODE_COUNT = 18;
const LINE_COUNT = 24;

export function BackgroundNetwork({ stage, prefersReducedMotion }: BackgroundNetworkProps) {
  // Dissolve starts at stage 4, fully gone by stage 5
  const dissolveProgress = useMemo(() => {
    if (stage < 4) return 1;
    if (stage >= 5) return 0;
    return 1 - (stage - 4) / 1; // linear dissolve over stage 4
  }, [stage]);

  if (dissolveProgress === 0) return null;

  // Generate stable pseudo-random positions
  const nodes = useMemo(() => {
    const n: Array<{ x: number; y: number; r: number }> = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const seed = i * 137.508;
      n.push({
        x: 5 + ((seed * 7.31) % 90),
        y: 5 + ((seed * 13.73) % 90),
        r: 1.5 + ((seed * 3.17) % 3),
      });
    }
    return n;
  }, []);

  const lines = useMemo(() => {
    const l: Array<[number, number]> = [];
    for (let i = 0; i < LINE_COUNT; i++) {
      const seed = i * 89.123;
      l.push([
        Math.floor((seed * 7.31) % NODE_COUNT),
        Math.floor((seed * 13.73 * 7.31) % NODE_COUNT),
      ]);
    }
    return l;
  }, []);

  return (
    <motion.div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      animate={{ opacity: dissolveProgress }}
      transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
    >
      <svg
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Connection lines */}
        {lines.map(([from, to], idx) => (
          <line
            key={`line-${idx}`}
            x1={nodes[from].x}
            y1={nodes[from].y}
            x2={nodes[to].x}
            y2={nodes[to].y}
            stroke="rgba(143, 224, 210, 0.12)"
            strokeWidth="0.15"
          />
        ))}
        {/* Nodes */}
        {nodes.map((node, idx) => (
          <circle
            key={`node-${idx}`}
            cx={node.x}
            cy={node.y}
            r={node.r * 0.08}
            fill="rgba(143, 224, 210, 0.15)"
          />
        ))}
      </svg>
    </motion.div>
  );
}
