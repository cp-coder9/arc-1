/**
 * Design System — GlassSurface primitive.
 *
 * Feature: website-ui-redesign (Task 2.1)
 *
 * The single reusable Liquid Glass material surface (Req 2.6, 10.2). It renders
 * a polymorphic element (default `div`, but any `as` element — `button`,
 * `section`, …) carrying the canonical `.glass` utility defined once in
 * `src/index.css`. All of its appearance derives from the `--glass-*` Theme_Tokens
 * referenced by `.glass`, so it carries **no literal colors** and re-skins
 * automatically when the Theme_Mode flips (Req 14.8). Because it is token-driven
 * and ships in the shared design-system layer, the role-based app reuses the
 * exact same definition (Req 2.6, 10.3).
 *
 * Obscured glazing (Req 2.7, 12.6)
 * --------------------------------
 * The `.glass` utility blurs (does not occlude) whatever sits behind it: in the
 * supported path its background is a translucent token (`--glass-bg`) layered
 * over a `backdrop-filter` blur, so animated content behind the surface — e.g.
 * the Agent_Field — stays visible-but-blurred rather than hidden. GlassSurface
 * therefore must **not** add any opaque background; it only contributes the
 * `.glass` class plus a variant radius, leaving the obscured-glazing behavior to
 * the shared utility (and its `@supports` opaque fallback for unsupported
 * browsers, Req 2.5).
 *
 * Variants
 * --------
 * - `card` — a rounded card surface (Top_Bar container, OS_Reveal card; Req 2.2).
 * - `pill` — fully rounded, for the pill-shaped Primary_CTA (Req 2.3, 3.3).
 *
 * Both radii come from the radius scale derived from the `--radius` Theme_Token,
 * keeping the surface token-driven.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export type GlassVariant = 'card' | 'pill';

/**
 * Variant → radius utility class. `rounded-3xl` resolves from the `--radius`
 * scale (a rounded card radius); `rounded-full` is fully rounded (pill).
 */
const VARIANT_RADIUS: Record<GlassVariant, string> = {
  card: 'rounded-3xl',
  pill: 'rounded-full',
};

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The rendered element. Defaults to `div`; e.g. `'button' | 'section'`. */
  as?: React.ElementType;
  /** `card` = rounded card radius; `pill` = fully rounded. Defaults to `card`. */
  variant?: GlassVariant;
  children?: React.ReactNode;
}

/**
 * Liquid Glass surface primitive. Forwards its ref to the rendered element and
 * spreads any remaining props onto it.
 */
export const GlassSurface = React.forwardRef<HTMLElement, GlassSurfaceProps>(
  ({ as, variant = 'card', className, children, ...props }, ref) => {
    const Comp = (as ?? 'div') as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn('glass', VARIANT_RADIUS[variant], className)}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);

GlassSurface.displayName = 'GlassSurface';

export default GlassSurface;
