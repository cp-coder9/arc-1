/**
 * Shared navigation UI primitives.
 *
 * Extracted from App.tsx so they can be reused by MainSidebar
 * and other navigation components.
 */

import React from 'react';

// ── NavSectionLabel --------------------------------------------------------

export function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1 beos-label-caps text-muted-foreground/80">
      {children}
    </div>
  );
}

// ── NavItem ----------------------------------------------------------------

type ButtonAttrs = React.ComponentPropsWithoutRef<'button'>;

export interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
  'data-testid'?: string;
}

export function NavItem({ icon, label, active, onClick, 'data-testid': dataTestId, ...props }: NavItemProps & Omit<ButtonAttrs, 'children'>) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group w-full flex items-center gap-3 rounded-[1.05rem] px-3 py-2.5 text-left text-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active
          ? 'bg-[#dff1fa] text-primary shadow-[0_12px_30px_rgba(20,71,63,0.10)]'
          : 'text-muted-foreground hover:bg-muted hover:text-primary'
      }`}
      {...props}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-[0.7rem] border transition-all ${
          active
            ? 'border-primary/15 bg-white text-primary'
            : 'border-transparent bg-white/70 text-muted-foreground group-hover:border-primary/15 group-hover:text-primary'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold tracking-[0.01em]">{label}</span>
      {active && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />}
    </button>
  );
}
