import React from 'react';
import { Building2 } from 'lucide-react';

interface LogoProps {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  textClassName?: string;
}

export function Logo({ 
  className = "flex items-center gap-2", 
  iconClassName = "w-8 h-8 text-primary", 
  showText = false,
  textClassName = "font-heading font-bold text-2xl tracking-tighter"
}: LogoProps) {
  return (
    <div className={className}>
      <div className="relative group">
        {/* 
          Note: Replace '/logo.png' with the actual path to the logo image provided.
          The image provided is an origami-style bird with architectural drawings.
        */}
        <img 
          src="/logo.png" 
          alt="Architex Logo" 
          className={iconClassName}
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
            if (fallback) fallback.classList.remove('hidden');
          }}
        />
        <div className="logo-fallback hidden">
          <Building2 className={iconClassName} />
        </div>
      </div>
      {showText && <span className={textClassName}>Architex</span>}
    </div>
  );
}
