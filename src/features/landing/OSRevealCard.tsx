/**
 * Landing Feature — OS_Reveal sign-in card.
 *
 * Feature: website-ui-redesign (Task 11.4)
 *
 * The frosted "Welcome to Architex OS" sign-in card presented at the end of the
 * Flock_Activation sequence (Req 12.7). It is the top-most rendered layer (z7)
 * sitting above the dimmed Agent_Field, which remains visible-but-blurred behind
 * it through the Glass_Surface's obscured glazing (Req 12.6).
 *
 * Composition (Req 12.7):
 *   - `GlassSurface variant="card"` — the frosted container; its `.glass`
 *     backdrop blur keeps the Agent_Field behind it visible-but-blurred rather
 *     than fully hidden (Req 12.6, 2.7). This component deliberately does NOT
 *     render the Agent_Field itself — the parent (`LandingPage`, Task 12.1)
 *     stacks the Agent_Field beneath this card.
 *   - A small `BirdMark` (topbar size) for brand presence.
 *   - The heading "Welcome to Architex OS".
 *   - A labeled email field (type=email) and a labeled password field
 *     (type=password).
 *   - A sign-in control with an accessible name.
 *
 * Accessibility:
 *   - Each input is associated with a visible `<label>` via `htmlFor`/`id`
 *     (ids derived from `useId` so multiple instances never collide).
 *   - The sign-in control is a submit button with a clear accessible name.
 *
 * Styling is token-driven — every color comes from a Theme_Token (Tailwind
 * `landing-*` utilities or `tokenVar(...)`), with no inline hex literals
 * (Req 1.5), so the card re-skins automatically on a Theme_Mode flip.
 *
 * Presentational only: it owns no auth logic. Submitting the form (or activating
 * the sign-in control) invokes the optional `onSignIn` callback supplied by the
 * parent.
 */
import * as React from 'react';
import { GlassSurface } from '@/design-system/GlassSurface';
import BirdMark from '@/design-system/BirdMark';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  GLASS_BORDER,
  LANDING_ACCENT,
  LANDING_TEXT,
  LANDING_TEXT_MUTED,
  RING,
  tokenVar,
} from '@/design-system/tokens';

/** The card heading (Req 12.7). */
const HEADING_TEXT = 'Welcome to Architex OS';

/** Visible / accessible labels for the credential fields (Req 12.7). */
const EMAIL_LABEL = 'Email';
const PASSWORD_LABEL = 'Password';

/** Visible / accessible name for the sign-in control (Req 12.7). */
const SIGN_IN_LABEL = 'Sign in';

/** Shared focus-visible ring, colored from the `--ring` Theme_Token (Req 9.3). */
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-offset-0';

export interface OSRevealCardProps {
  /**
   * Invoked with the collected credentials when the user submits the sign-in
   * form (via the sign-in control or pressing Enter in a field). Presentational
   * only — the parent owns auth. Returning a Promise is allowed (async auth).
   */
  onSignIn?: (email: string, password: string) => void | Promise<void>;
  /** Optional extra classes for positioning/layout by the caller. */
  className?: string;
}

/**
 * OS_Reveal sign-in card — a frosted Glass_Surface above the Agent_Field.
 */
export function OSRevealCard({ onSignIn, className }: OSRevealCardProps) {
  // Unique ids so label/input associations hold even with multiple instances.
  const emailId = React.useId();
  const passwordId = React.useId();

  // Controlled credential state so the parent receives the typed values.
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  // Shared ring color for all focusable controls (token-driven).
  const ringStyle = { ['--tw-ring-color' as string]: tokenVar(RING) };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Stay presentational: prevent a full-page navigation and delegate the
    // collected credentials upward (the parent performs the real auth).
    event.preventDefault();
    onSignIn?.(email, password);
  };

  return (
    <GlassSurface
      variant="card"
      className={cn('w-full max-w-sm p-6 sm:p-8', className)}
    >
      {/* Brand + heading. */}
      <div className="flex flex-col items-center gap-3 text-center">
        <BirdMark size="topbar" />
        <h2
          className="font-heading text-xl font-semibold leading-tight sm:text-2xl"
          style={{ color: tokenVar(LANDING_TEXT) }}
        >
          {HEADING_TEXT}
        </h2>
      </div>

      {/* Credential form. */}
      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={emailId}
            className="font-sans"
            style={{ color: tokenVar(LANDING_TEXT) }}
          >
            {EMAIL_LABEL}
          </Label>
          <Input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn('h-10', FOCUS_RING)}
            style={{
              color: tokenVar(LANDING_TEXT),
              borderColor: tokenVar(GLASS_BORDER),
              ...ringStyle,
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={passwordId}
            className="font-sans"
            style={{ color: tokenVar(LANDING_TEXT) }}
          >
            {PASSWORD_LABEL}
          </Label>
          <Input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn('h-10', FOCUS_RING)}
            style={{
              color: tokenVar(LANDING_TEXT),
              borderColor: tokenVar(GLASS_BORDER),
              ...ringStyle,
            }}
          />
        </div>

        {/* Sign-in control — a pill Glass_Surface submit button (Req 12.7). */}
        <GlassSurface
          as="button"
          variant="pill"
          type="submit"
          aria-label={SIGN_IN_LABEL}
          className={cn(
            'mt-2 inline-flex h-11 items-center justify-center whitespace-nowrap',
            'px-5 font-heading text-sm font-semibold',
            'cursor-pointer select-none transition-transform duration-200 ease-out hover:scale-[1.02]',
            FOCUS_RING,
          )}
          style={{
            color: tokenVar(LANDING_ACCENT),
            ...ringStyle,
          }}
        >
          {SIGN_IN_LABEL}
        </GlassSurface>
      </form>

      {/* Subtle helper line — muted, token-driven. */}
      <p
        className="mt-4 text-center font-sans text-xs"
        style={{ color: tokenVar(LANDING_TEXT_MUTED) }}
      >
        The Operating System for the Built Environment
      </p>
    </GlassSurface>
  );
}

export default OSRevealCard;
