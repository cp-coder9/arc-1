/**
 * Design System — Bird_Mark primitive.
 *
 * Feature: website-ui-redesign
 *
 * The Bird_Mark is the angular faceted teal/mint origami paper-crane "A" logo.
 * It is sourced from the real raster asset `public/logo.png` directly — never
 * converted to SVG (Req 6.1). This primitive generalizes the existing
 * `src/components/Logo.tsx` pattern with a configurable size, an optional
 * interactive activator, a screen blend mode, a decorative (aria-hidden) mode,
 * and a Wordmark fallback when the asset fails to load or is slow (Req 6.4).
 *
 * Styling derives entirely from Theme_Tokens (no literal color values), so the
 * primitive re-skins automatically on a Theme_Mode flip and is reusable by the
 * role-based app (Req 10.2).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { LANDING_TEXT, tokenVar } from './tokens';

/** Milliseconds to wait for the asset before swapping to the Wordmark (Req 6.4). */
const LOAD_TIMEOUT_MS = 3000;

/** The exact text alternative exposed to assistive technologies (Req 6.3, 6.5). */
const ACCESSIBLE_NAME = 'Architex';

/** Accessible name for the interactive activator — indicates entering the OS (Req 9.9). */
const ACTIVATOR_NAME = 'Enter Architex OS';

/** The Wordmark text rendered as the fallback and beside meaningful marks. */
const WORDMARK_TEXT = 'ARCHITEX';

/** Bird_Mark source — the real PNG, resolved against Vite's base URL (Req 6.1). */
const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

/** Named size presets in pixels. `hero` is the dominant footprint (Req 4.1). */
const SIZE_PX = {
  topbar: 40,
  hero: 280,
  shard: 32,
} as const;

export interface BirdMarkProps {
  /** Rendered size: a named preset or an explicit pixel value. */
  size: 'topbar' | 'hero' | 'shard' | number;
  /** When true, render a focusable button-role activator (Req 4.8, 4.9, 9.9). */
  interactive?: boolean;
  /** Activation handler — pointer click and Enter/Space (Req 4.8). */
  onActivate?: () => void;
  /** Apply `mix-blend-mode: screen` so the mark blends over the dark teal field. */
  blend?: boolean;
  /** Decorative instances (Agent_Shards) are aria-hidden with no text alternative. */
  decorative?: boolean;
  /** Optional extra classes for positioning/layout by the caller. */
  className?: string;
  /** Optional extra inline styles (e.g. transform/position for Agent_Shards). */
  style?: React.CSSProperties;
}

/** Resolve a size prop to a pixel number. */
function resolveSizePx(size: BirdMarkProps['size']): number {
  return typeof size === 'number' ? size : SIZE_PX[size];
}

/**
 * Bird_Mark — renders the origami bird logo from `public/logo.png`, with a
 * Wordmark fallback, an optional keyboard-operable activator, and token-driven
 * styling.
 */
export function BirdMark({
  size,
  interactive = false,
  onActivate,
  blend = false,
  decorative = false,
  className,
  style,
}: BirdMarkProps) {
  const sizePx = resolveSizePx(size);
  // 'fallback' renders the Wordmark; reached on load error OR the 3s timeout.
  const [showFallback, setShowFallback] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const settledRef = React.useRef(false);

  // Race a 3s timeout against the image's load (Req 6.4). The first to resolve
  // wins: onLoad clears the timer; the timer (or onError) swaps to the Wordmark.
  React.useEffect(() => {
    // If the asset is already cached and decoded, treat it as loaded.
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      settledRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      if (!settledRef.current) {
        settledRef.current = true;
        setShowFallback(true);
      }
    }, LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, []);

  const handleLoad = () => {
    if (!settledRef.current) {
      settledRef.current = true;
    }
  };

  const handleError = () => {
    if (!settledRef.current) {
      settledRef.current = true;
    }
    // A load error always swaps to the Wordmark, even after the timeout settled.
    setShowFallback(true);
  };

  // Decorative shards are hidden from assistive tech and carry no name (Req 6.3).
  const ariaProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({} as const);

  // The visual content: either the PNG or the Wordmark fallback. When the mark
  // is interactive, the activator owns the accessible name, so the inner content
  // is marked decorative to avoid a duplicate name.
  const innerIsDecorative = decorative || interactive;

  const content = showFallback ? (
    <span
      className={cn(
        'inline-flex items-center justify-center font-heading font-bold tracking-tighter leading-none whitespace-nowrap',
      )}
      style={{
        // Scale the Wordmark to roughly the mark's footprint; color from token.
        fontSize: Math.max(12, Math.round(sizePx * 0.32)),
        color: tokenVar(LANDING_TEXT),
        width: sizePx,
        height: sizePx,
        ...(blend ? { mixBlendMode: 'screen' as const } : {}),
      }}
      // Retain the "Architex" accessible name in the fallback (Req 6.5) unless
      // the surrounding activator/decorative context owns the name.
      {...(innerIsDecorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': ACCESSIBLE_NAME })}
    >
      {WORDMARK_TEXT}
    </span>
  ) : (
    <img
      ref={imgRef}
      src={logoSrc}
      // High-DPI hint: the source PNG is high-resolution, so it stays crisp from
      // the Top_Bar size up to the hero size when downscaled on retina (Req 6.2).
      srcSet={`${logoSrc} 1x, ${logoSrc} 2x`}
      width={sizePx}
      height={sizePx}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={handleLoad}
      onError={handleError}
      className="object-contain"
      style={{
        width: sizePx,
        height: sizePx,
        ...(blend ? { mixBlendMode: 'screen' as const } : {}),
      }}
      // Meaningful images expose "Architex"; decorative/interactive images use
      // empty alt so the activator name (or aria-hidden) is authoritative.
      alt={innerIsDecorative ? '' : ACCESSIBLE_NAME}
      {...(innerIsDecorative ? { 'aria-hidden': true } : {})}
      draggable={false}
    />
  );

  if (interactive) {
    const activate = () => onActivate?.();
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Enter and Space activate the control, matching native button semantics.
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        activate();
      }
    };

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={ACTIVATOR_NAME}
        onClick={activate}
        onKeyDown={handleKeyDown}
        className={cn(
          'inline-flex items-center justify-center cursor-pointer select-none',
          // Subtle hover scale within 100–300ms (Req 8.6); 200ms sits in range.
          'transition-transform duration-200 ease-out hover:scale-105',
          className,
        )}
        style={style}
      >
        {content}
      </div>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center justify-center', className)}
      style={style}
      {...ariaProps}
    >
      {content}
    </span>
  );
}

export default BirdMark;
