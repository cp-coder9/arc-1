import React from 'react';
import { useDemoMode } from '../demo-context/DemoModeProvider';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export function DemoBanner() {
  const { isDemoMode, demoRole, internalRole, isSeeded, seeding, reseed } = useDemoMode();

  if (!isDemoMode) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-yellow-400/10 via-yellow-400/5 to-yellow-400/10 border-t border-yellow-400/20 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-1.5 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
          <span className="text-[11px] font-medium text-yellow-400/80">
            DEMO MODE
          </span>
          <span className="text-[10px] text-white/30">|</span>
          <span className="text-[11px] text-white/50">
            Role: <span className="text-white/80 font-semibold">{demoRole}</span>
            <span className="text-white/30 ml-1">→ {internalRole}</span>
          </span>
          {!isSeeded && !seeding && (
            <span className="text-[10px] text-yellow-400/50 ml-2 italic">Sandbox not seeded yet</span>
          )}
          {seeding && (
            <span className="text-[10px] text-yellow-400/70 ml-2 italic flex items-center gap-1">
              <RotateCcw className="h-3 w-3 animate-spin" /> Seeding sandbox...
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-white/20">demo.architex.co.za</span>
          {isSeeded && !seeding && (
            <button
              onClick={reseed}
              className="flex items-center gap-1 text-[10px] text-white/30 hover:text-yellow-400 transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
