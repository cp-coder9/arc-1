import React from 'react';
import { Origami } from 'lucide-react';

interface LogoProps {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  textClassName?: string;
}

const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

export function Logo({ 
  className = "flex items-center gap-2", 
  iconClassName = "w-10 h-10 text-primary", 
  showText = false,
  textClassName = "font-heading font-bold text-2xl lg:text-3xl tracking-tighter"
}: LogoProps) {
  return (
    <div className={className}>
      <div className="relative group">
        <img 
          src={logoSrc}
          alt="Architex Logo" 
          className={iconClassName}
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
            if (fallback) fallback.classList.remove('hidden');
          }}
        />
        <div className="logo-fallback hidden" aria-hidden="true">
          <div className="rounded-2xl bg-primary/10 p-2 text-primary ring-1 ring-primary/20">
            <Origami className={iconClassName} />
          </div>
        </div>
      </div>
      {showText && <span className={textClassName}>Architex</span>}
    </div>
  );
}
