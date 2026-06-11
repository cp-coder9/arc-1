import React, { useState, useRef, useEffect } from 'react';
import { useDemoMode, DEMO_ROLE_GROUPS, type DemoRole } from '../demo-context/DemoModeProvider';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ChevronDown, RotateCcw, UserCircle } from 'lucide-react';

interface DemoRoleSwitcherProps {
  /** Optional callback when role changes */
  onRoleChange?: (role: DemoRole) => void;
}

export function DemoRoleSwitcher({ onRoleChange }: DemoRoleSwitcherProps) {
  const { isDemoMode, demoRole, setDemoRole, reseed, seeding } = useDemoMode();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!isDemoMode) return null;

  // Find current role label
  let currentLabel = demoRole;
  for (const group of DEMO_ROLE_GROUPS) {
    const found = group.roles.find((r) => r.value === demoRole);
    if (found) { currentLabel = found.label; break; }
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-2 border-yellow-400/50 text-yellow-400 hover:bg-yellow-400/10"
        onClick={() => setOpen(!open)}
      >
        <UserCircle className="h-4 w-4" />
        <span className="text-xs font-semibold truncate max-w-[160px]">{currentLabel}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <Card className="absolute top-full left-0 mt-1 z-50 w-72 max-h-[70vh] overflow-y-auto shadow-2xl border-yellow-400/30 bg-zinc-900">
          <div className="p-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-yellow-400/60 border-b border-yellow-400/10 mb-1">
              Switch Role (Demo Mode)
            </div>

            {DEMO_ROLE_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="px-2 py-1 text-[10px] font-medium text-white/40 uppercase tracking-wider mt-1">
                  {group.label}
                </div>
                {group.roles.map((role) => (
                  <button
                    key={role.value}
                    className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${
                      demoRole === role.value
                        ? 'bg-yellow-400/15 text-yellow-400 font-semibold'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                    onClick={() => {
                      setDemoRole(role.value as DemoRole);
                      setOpen(false);
                      onRoleChange?.(role.value as DemoRole);
                    }}
                  >
                    {role.label}
                    {demoRole === role.value && (
                      <span className="ml-2 text-[10px] text-yellow-400/60">✓ active</span>
                    )}
                  </button>
                ))}
              </div>
            ))}

            <div className="border-t border-yellow-400/10 mt-2 pt-2 px-2">
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-white/50 hover:text-yellow-400 hover:bg-white/5 rounded-md transition-colors disabled:opacity-40"
                onClick={() => { reseed(); setOpen(false); }}
                disabled={seeding}
              >
                <RotateCcw className={`h-3 w-3 ${seeding ? 'animate-spin' : ''}`} />
                {seeding ? 'Reseeding...' : 'Reset Sandbox Data'}
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
