# Architex OS — UI Brief Extension: Option 3 "Signal Layers"

> Chosen landing palette: **Palette 1 · Deep Teal** (`.kiro/specs/website-ui-redesign/mockups/palettes/palette-1-deep-teal.html`).
> Landing aesthetic stays close to `mockups/landing-flock-mockup.html` (dark teal grid, central origami bird, restrained glow, frosted glass).
> This brief governs the **logged-in platform** (command centre, navigation, role cards, panels, buttons, hover states).

## Core intention
A calm, premium architectural command operating layer — not a generic SaaS/AI dashboard, not a crypto panel, not an Apple liquid-glass clone, and never white-on-white glass with poor readability.

## Palette (platform)
- Base: near-black green `#071713`, deep teal `#0B2A24`, command green `#073C34`, panel green `#102F29`.
- Text: soft white `#F3F7F4`, secondary `#A8B8B0`, low-emphasis `#71867E`.
- Accent: mint/signal `#9DEFD6`, teal `#00A88A`, warm action highlight `#F1D39A`; alert amber/coral used sparingly.
- Never white-on-white or mint-on-white. Text must always be readable.

## Signal Layers concept
Layered command system, visible through spacing/borders/glow/hover (not milky glass):
1. Background — dark grid, deep green gradients, subtle project-field atmosphere.
2. Navigation — stable left rail: role, modules, shortcuts.
3. Command — main dashboard panels: project state, readiness, requirements.
4. Intelligence — Ask AI, Next Best Action, alerts, live projection, profile readiness.
5. Action — workflow buttons, open actions, role progression.

Panels = translucent operational sheets over a dark technical field (trace paper + command system + project radar). Avoid large blurred frosted panels that hurt contrast.

## Interaction
Calm default; hover "wakes up" surfaces — mint/gold edge, soft glow, subtle diagonal signal sweep, 1–3px lift, border illumination. Precise, controlled micro-interactions. No bounce/spin/excessive blur.

## Buttons
- Primary (e.g. "Take next action"): deep teal fill → hover mint/warm-gold fill, dark text, glow, arrow/signal sweep.
- Secondary (e.g. "Open"): transparent + thin border → hover brighter border + subtle fill.
- AI ("Ask AI"): restrained violet-grey/mint outline → hover luminous, subtle scanning ring; must not clash with brand.

## Layout (reference: current command centre)
Left nav rail (logo, role card, nav items, shortcuts block) · top command bar (breadcrumbs, title, role chip, Ask AI, alerts, profile) · main command centre (large "Coordinate professional delivery." title, supporting copy, live projection, Next Best Action, Current Stage, metric/action tiles). Cards = operational modules: thin outlines, inner shadow, subtle scan accents; medium radius (not pill-everywhere).

## Avoid
Pale frosted interface, white/pale panels behind white/mint text, blur overuse, generic Tailwind cards, gradient/colour overload, playful/childish feel, aggressive hover, everything rounded.

## Typography & motion & a11y
Modern professional sans, crisp/architectural; confident headings, uppercase tracked labels, readable metadata (no tiny grey text). Motion minimal/distinctive (slow signal sweeps, glowing edges, hover lift, soft border illumination); alive only on interaction. Strong contrast in all states; readable font sizes; generous padding.

## Scope split for execution
- Landing: keep aesthetic; fix flock animation to match the mockup pixel-for-pixel, fully responsive.
- Routing: Sign up → dedicated sign-up/role-select page; Enter OS sign-in → authenticate → go straight to the workspace (Command Centre).
- Platform: apply Signal Layers to the logged-in shell + command centre; eliminate white-on-white.
