import React, { useEffect, useState } from 'react';

export function AnimatedFloorPlan() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let animationFrame = 0;

    const updateOffset = (value: number) => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        setOffset(Math.min(value * 0.035, 36));
      });
    };

    const handleScroll = (event: Event) => {
      const target = event.target as HTMLElement | Document | null;
      const scrollTop = target && 'scrollTop' in target
        ? target.scrollTop
        : window.scrollY || document.documentElement.scrollTop;

      updateOffset(scrollTop);
    };

    updateOffset(window.scrollY || document.documentElement.scrollTop);
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none opacity-[0.08] flex items-center justify-center z-0 mix-blend-multiply"
    >
      <svg
        width="120%"
        height="120%"
        viewBox="0 0 1200 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="stroke-primary h-[120vh] min-w-[120vw] object-cover transition-transform duration-150 ease-out"
        style={{ transform: `translate3d(-2%, ${offset}px, 0) rotate(-2deg) scale(1.08)` }}
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        {/* Grid lines in background of SVG */}
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" className="stroke-primary/20" strokeWidth="0.5"/>
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Outer Walls (Thick) */}
        <path
          d="M 200 150 L 1000 150 L 1000 650 L 200 650 Z"
          strokeWidth="4"
        />
        
        {/* Inner Walls */}
        <path
          d="M 450 150 L 450 450 L 200 450 M 450 450 L 750 450 L 750 150 M 750 450 L 750 650 M 450 650 L 450 550 L 200 550"
          strokeWidth="2"
        />

        {/* Windows (Double lines) */}
        <path
          d="M 250 145 L 400 145 M 250 155 L 400 155 M 500 145 L 700 145 M 500 155 L 700 155 M 800 145 L 950 145 M 800 155 L 950 155"
          className="stroke-primary/60"
          strokeWidth="1"
        />

        {/* Doors (Arcs) */}
        <path
          d="M 450 250 A 50 50 0 0 0 400 300 M 750 250 A 50 50 0 0 1 800 300 M 450 500 A 50 50 0 0 1 500 450 M 750 500 A 50 50 0 0 0 700 450"
          className="stroke-primary/50"
          strokeDasharray="4 4"
        />

        {/* Dimension Lines */}
        <g
          className="stroke-primary/40"
          strokeWidth="1"
        >
          <path d="M 200 120 L 1000 120 M 200 110 L 200 130 M 1000 110 L 1000 130" />
          <text x="600" y="110" className="fill-primary/60 text-sm font-mono" stroke="none" textAnchor="middle">24000 mm</text>
          
          <path d="M 170 150 L 170 650 M 160 150 L 180 150 M 160 650 L 180 650" />
          <text x="150" y="400" className="fill-primary/60 text-sm font-mono" stroke="none" textAnchor="middle" transform="rotate(-90 150 400)">15000 mm</text>
        </g>

        {/* Room Labels */}
        <g
          className="fill-primary text-2xl font-mono font-bold tracking-widest opacity-40"
          stroke="none"
        >
          <text x="325" y="300" textAnchor="middle">OFFICE A</text>
          <text x="600" y="300" textAnchor="middle">CONFERENCE</text>
          <text x="875" y="400" textAnchor="middle">STUDIO</text>
          <text x="600" y="550" textAnchor="middle">LOBBY</text>
          <text x="325" y="600" textAnchor="middle">RECEPTION</text>
        </g>

        {/* Furniture / Details (Desks, Tables) */}
        <path
          d="M 250 200 h 100 v 50 h -100 z M 500 200 h 200 v 80 h -200 z M 800 200 h 150 v 150 h -150 z"
          className="stroke-primary/30"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
