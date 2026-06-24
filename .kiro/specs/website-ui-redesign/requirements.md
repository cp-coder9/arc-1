# Requirements Document

## Introduction

This feature redefines the Architex website user interface, beginning with the public landing/marketing page and establishing a reusable design system that extends across the role-based application. The redesign expresses Architex as "The Operating System for the Built Environment": a platform that takes the full lifecycle of a construction/architecture project and, through complementary role-based toolsets, produces a single source of truth that turns a complex, multidimensional industry into a simple, AI-guided workflow.

The visual direction is a premium, minimal "liquid glass" aesthetic inspired by Apple visionOS material language: frosted translucent surfaces, soft depth, blur, and subtle glow over a dark teal palette derived from the test.architex.co.za theme. The redesign replaces the current dense, generic landing experience with a simple, distinctive, content-light hero centered on the Architex origami bird mark.

This redesign is delivered with React 19 + TypeScript on Vite 6, Tailwind v4 (CSS-only `@theme inline` tokens in `src/index.css`), shadcn/ui + Radix primitives, framer-motion animation, and lucide-react icons. Accessibility compliance (WCAG 2.1 AA targets) and `prefers-reduced-motion` support are mandatory.

## Visual Reference

Two interactive HTML mockups have been created to illustrate the intended visual direction. Open them in a browser to preview the design (they use the real Architex bird logo, the dark teal palette, and the liquid-glass treatment):

- **Bird Flock activation (animated)**: `mockups/landing-flock-mockup.html` — demonstrates the signature activation animation and the Apple-style Liquid Glass material (frosted surfaces that refract animated color moving beneath them). The hero shows a large, prominent Bird_Mark rendered from the actual `public/logo.png`. On "Enter OS"/"Sign in", the PNG explodes into a flock of miniature Architex bird logos of varying sizes (Agent_Shards / AI agents) that fly outward, on-page complexity (hero copy, quick nav, grid) dissolves, and the shards then settle dimly into the background as the Agent_Field beneath a Liquid Glass "Welcome to Architex OS" sign-in card. The Agent_Field continues to move in a controlled, systematic pattern to convey the system working for the user. Use the Enter OS / Reset controls to replay. Note: the checkered grid stays visible (dimmer) after activation; the twinkling dots are now Network_Nodes positioned at grid junctions; the agents travel along the grid lines between nodes (some moving up, some moving down); and the top-bar "Sign up" action is a separate placeholder page (not the Enter OS action). Note that the agents remain visible as blurred shapes through the frosted sign-in glass (obscured glazing); each agent follows its own grid path, changing between vertical and horizontal travel at the nodes so some move vertically while others move horizontally; and the central bird logo is itself clickable (with a subtle hover grow) to trigger the same Enter OS activation.
- **Design system & workspace**: `mockups/design-system-preview.html` — the canonical system reference: color tokens (`#0d2520` background, `#005b4e` primary, `#aeefe3` mint), liquid-glass surfaces, button styles (primary "Enter OS" mint, glass "Sign up", ghost), the Space Grotesk + Inter type scale, and an elemental OS workspace example (sidebar + Command Centre) that reuses the same tokens and glass surfaces but stays calm and clutter-free, deliberately omitting the landing page's Flock_Activation animation and moving grid.

These mockups are non-binding visual references intended to convey look and feel; the binding acceptance criteria are defined in the Requirements section below.

## Glossary

- **Landing_Page**: The public, unauthenticated marketing page rendered as the home view of the Architex website.
- **Design_System**: The shared set of color tokens, typography scale, spacing, surface/material styles, and reusable UI primitives defined for the redesign.
- **Glass_Surface**: A reusable translucent UI material exhibiting backdrop blur, layered translucency, soft border highlight, and subtle outer glow, expressing the "liquid glass" aesthetic. Glass_Surface follows the Apple "Liquid Glass" material language, where the translucent surface refracts animated color/content moving beneath it in addition to backdrop blur, layered translucency, soft border highlight, and outer glow.
- **Theme_Tokens**: The CSS custom properties defined in `src/index.css` (`:root` variables and `@theme inline` mappings) that supply colors, fonts, and radii.
- **Theme_Mode**: The active color theme of the application — either the Dark_Theme (default) or the Light_Theme.
- **Dark_Theme**: The default dark teal palette (background `#0d2520`, primary `#005b4e`, mint `#aeefe3`) — the standard appearance of the site.
- **Light_Theme**: An optional light color theme that reuses the same Design_System primitives and component logic with light-appropriate Theme_Token values.
- **Theme_Toggle**: The user control that switches the Theme_Mode between Dark_Theme and Light_Theme.
- **Bird_Mark**: The angular faceted teal/mint origami paper-crane "A" bird logo, supplied as the actual raster image `public/logo.png` and used directly (not converted to SVG).
- **Flock_Activation**: The signature transition animation in which the Bird_Mark explodes into a flock of Agent_Shards (miniature bird logos) that fly outward, on-page complexity dissolves, the Agent_Shards then settle dimly into the background as the Agent_Field, and the Architex OS sign-in surface (OS_Reveal) is revealed above them.
- **Agent_Shard**: A miniature copy of the Bird_Mark logo (identical origami-bird form, rendered at a small, varying size) produced when the Bird_Mark explodes during Flock_Activation, representing one of Architex's AI agents that guide the workflow.
- **OS_Reveal**: The Liquid Glass sign-in card ("Welcome to Architex OS") presented at the end of Flock_Activation.
- **Sign_In_Page**: A standalone, elemental authentication page that reuses the Design_System (Theme_Tokens, Glass_Surface, Bird_Mark) and the dimmed Grid_Background/Network_Node/Agent_Field backdrop, presenting only a centered Glass_Surface sign-in card and a minimal Top_Bar — excluding the Landing_Page hero copy, Quick_Nav, and Flock_Activation animation.
- **Workspace**: An authenticated interior page of the Architex OS (for example the Command Centre or a project view). Workspaces reuse the Design_System (Theme_Tokens, Glass_Surface, Bird_Mark) but remain calm and clutter-free, and do not render the Flock_Activation animation or the moving Grid_Background/Agent_Field.
- **Agent_Field**: The dimmed background layer of Agent_Shards that, after Flock_Activation, travel along the Grid_Background lines between Network_Nodes at a uniform speed in a controlled, systematic pattern. Each agent follows its own path and changes between vertical (up/down) and horizontal (side-to-side) movement when it reaches a Network_Node, so that at any moment some agents move vertically while others move horizontally. The Agent_Field remains visible through the OS_Reveal glass as if moving behind obscure frosted glazing.
- **Grid_Background**: The checkered square grid texture rendered across the Landing_Page background; it remains visible after Flock_Activation but at a reduced (dimmer) opacity than on the initial Landing_Page.
- **Network_Node**: A twinkling circular dot positioned at an intersection (junction) of the Grid_Background lines. Network_Nodes are the points between which Agent_Field agents travel; they are distributed across the Viewport (more numerous than the original orbit-ring nodes) and are rendered dimmer on the OS_Reveal page than on the initial Landing_Page.
- **Orbit_Ring**: The thin circular ring surrounding the Bird_Mark in the hero.
- **Top_Bar**: The Landing_Page header containing the Architex wordmark and the account actions.
- **Wordmark**: The text "ARCHITEX" displayed in the Top_Bar.
- **Hero_Section**: The centered primary content region of the Landing_Page containing the Bird_Mark, headline, subline, and primary call to action.
- **Primary_CTA**: The "Enter OS" call-to-action control presented as the dominant action on the Landing_Page; activating it begins the Flock_Activation sequence.
- **Sign_Up_Action**: The control labeled "Sign up" in the Top_Bar that navigates to a separate sign-up / authentication page. It is a placeholder to be connected to the existing test.architex.co.za login at a later integration stage, it links to a different destination than the Primary_CTA, and it does NOT begin the Flock_Activation sequence.
- **Quick_Nav**: The bottom row of four icon-and-label navigation items on the Landing_Page (People, Projects, Approvals, Payments).
- **Reduced_Motion_Setting**: The user's operating-system or browser `prefers-reduced-motion` preference.
- **System**: The Architex website front-end application as a whole.
- **Viewport**: The visible browser rendering area, classified as mobile (width below 640px), tablet (640px to 1023px), or desktop (1024px and above).

## Requirements

### Requirement 1: Dark Teal Theme Foundation

**User Story:** As a brand owner, I want the redesigned UI to use the Architex dark teal palette, so that the website reflects a consistent, premium brand identity.

#### Acceptance Criteria

1. THE Design_System SHALL define a dark teal background Theme_Token with hex value `#0d2520` and apply it as the default background color of the Landing_Page primary background surface.
2. THE Design_System SHALL reuse the existing brand Theme_Tokens `--primary` (`#005b4e`), `--primary-light` (`#007666`), `--primary-dark` (`#00201b`), and `--secondary` (`#aeefe3`) without redefining their hex values.
3. THE Design_System SHALL define text color Theme_Tokens for white (`#ffffff`) and mint accent (`#aeefe3`) used for Landing_Page typography, each maintaining a contrast ratio of at least 4.5:1 against the dark teal background Theme_Token (`#0d2520`).
4. WHERE a new Theme_Token is introduced, THE Design_System SHALL declare the token in `src/index.css` using the `:root` and `@theme inline` mechanism rather than a separate Tailwind configuration file.
5. THE System SHALL apply colors to all Landing_Page component markup exclusively by Theme_Token reference, with zero inline hard-coded hex color literals present in that markup.
6. WHEN the Landing_Page renders typography, THE System SHALL apply the white text Theme_Token (`#ffffff`) as the default body text color and the mint accent Theme_Token (`#aeefe3`) for accent text.
7. IF Landing_Page component markup references a Theme_Token that is not declared in `src/index.css`, THEN THE System SHALL surface a build-time error identifying the undefined token and SHALL NOT substitute an inline hex literal.

### Requirement 2: Liquid Glass Material

**User Story:** As a visitor, I want surfaces to feel like premium frosted glass, so that the product feels modern and high-end.

#### Acceptance Criteria

1. THE Design_System SHALL define a single reusable Glass_Surface style token composed of exactly four named layers: a backdrop blur layer, a layered background translucency layer, a light-toned border layer, and an outer glow layer, such that a tester can verify the presence of all four layers.
2. WHEN the Landing_Page renders a card, THE System SHALL apply the Glass_Surface style to that card.
3. WHEN the Landing_Page renders the Top_Bar or the Primary_CTA, THE System SHALL apply the Glass_Surface style to that element.
4. THE Glass_Surface SHALL maintain a measured contrast ratio of at least 4.5:1 between foreground text and the composited background visible directly behind that text.
5. IF the browser does not support backdrop blur, THEN THE System SHALL render the Glass_Surface with an opaque fallback background, SHALL preserve the contrast ratio of at least 4.5:1 defined in criterion 4, and SHALL keep the rendered element visible with no loss of content.
6. THE Glass_Surface SHALL be exposed as a reusable Design_System primitive that the role-based application can apply to its own elements using the same definition referenced in criterion 1.
7. WHILE animated content is positioned behind a Glass_Surface, THE System SHALL render that content as visible-but-blurred (obscured glazing) and SHALL NOT fully hide it, while still satisfying the foreground text contrast requirement in criterion 4.

### Requirement 3: Landing Page Top Bar

**User Story:** As a visitor, I want a clear, minimal header, so that I can identify the brand and access my account quickly.

#### Acceptance Criteria

1. THE Top_Bar SHALL display the Bird_Mark and the Wordmark "ARCHITEX" aligned to the leading edge of the Top_Bar, both fully visible without clipping or truncation.
2. THE Top_Bar SHALL display the Sign_Up_Action and the Primary_CTA aligned to the trailing edge of the Top_Bar, both fully visible without clipping or truncation.
3. THE Primary_CTA in the Top_Bar SHALL be presented as a pill-shaped button rendered with the Glass_Surface style.
4. WHEN a user activates the Sign_Up_Action, THE System SHALL navigate to a separate sign-up page that is distinct from the Primary_CTA destination, and SHALL NOT begin the Flock_Activation sequence.
5. WHEN a user activates the Primary_CTA, THE System SHALL begin the Flock_Activation sequence (see Requirement 12) within 1000 ms.
6. IF the Sign_Up_Action navigation or the Primary_CTA activation fails to start within 5000 ms, THEN THE System SHALL keep the user on the current page and display an error indication that the requested action could not be completed.
7. WHILE the Viewport width is at most 767 px, THE Top_Bar SHALL keep the Wordmark, the Sign_Up_Action, and the Primary_CTA fully visible and operable without horizontal scrolling of the Viewport.
8. WHILE the Viewport width is at most 767 px, THE Top_Bar SHALL render the Sign_Up_Action and the Primary_CTA with a minimum interactive target size of 44 by 44 px each.

### Requirement 4: Hero Section with Bird Mark and Orbit Ring

**User Story:** As a visitor, I want a focused, distinctive hero, so that I immediately understand what Architex is and feel the premium brand.

#### Acceptance Criteria

1. WHEN the Hero_Section renders, THE System SHALL display the Bird_Mark as the dominant focal element, centered horizontally within the Hero_Section within a 2 px tolerance and occupying the largest visual footprint of any Hero_Section element.
2. WHEN the Hero_Section renders, THE System SHALL display the Orbit_Ring as a circular ring with a stroke width between 1 px and 3 px surrounding the Bird_Mark.
3. THE Hero_Section SHALL display the headline text "The Operating System for the Built Environment" rendered using the heading font Theme_Token (`Space Grotesk`).
4. THE Hero_Section SHALL display the subline text "Simplify complexity. Deliver with confidence." rendered using the sans font Theme_Token (`Inter`).
5. THE Hero_Section SHALL display exactly one Primary_CTA labeled "Enter OS".
6. WHEN a user activates the Hero_Section Primary_CTA, THE System SHALL begin the Flock_Activation sequence within 1000 ms.
7. IF the Hero_Section Primary_CTA fails to begin the Flock_Activation sequence within 5000 ms, THEN THE System SHALL keep the user on the Hero_Section and display an error indication that the requested action could not be completed.
8. WHEN a user activates the Bird_Mark by pointer click, or by pressing the Enter or Space key while the Bird_Mark is focused, THE System SHALL begin the Flock_Activation sequence identical to activating the Primary_CTA.
9. WHILE the Bird_Mark is interactive, THE System SHALL present it with a pointer cursor on pointer-capable devices and as a keyboard-focusable control.

### Requirement 5: Quick Navigation Row

**User Story:** As a visitor, I want simple entry points to the core capabilities, so that I can understand the scope of the platform at a glance.

#### Acceptance Criteria

1. THE Quick_Nav SHALL display exactly four items labeled "People", "Projects", "Approvals", and "Payments".
2. THE Quick_Nav SHALL display each item as a lucide-react icon paired with the item label.
3. WHEN a user activates a Quick_Nav item by pointer click or by pressing the Enter or Space key while it has focus, THE System SHALL navigate to the destination route associated with that item within 1000 ms.
4. IF the destination route associated with an activated Quick_Nav item is unavailable or fails to load, THEN THE System SHALL retain the current view and display an error indication that the requested destination could not be opened.
5. WHILE the Viewport width is at most 767 px, THE Quick_Nav SHALL present all four items fully visible with no overlap between adjacent items and no label truncation.

### Requirement 6: Origami Bird Mark Asset Usage

**User Story:** As a brand owner, I want the official origami bird logo used consistently, so that brand identity is preserved across the site.

#### Acceptance Criteria

1. THE System SHALL source the Bird_Mark from the supplied raster image `public/logo.png` and SHALL use it directly without converting it to SVG.
2. THE System SHALL render the Bird_Mark from a sufficiently high-resolution PNG so that it displays without visible pixelation or blurring at every rendered size from the Top_Bar size up to and including the prominent hero size.
3. THE System SHALL provide a text alternative with the exact value "Architex" for the Bird_Mark, exposed to assistive technologies.
4. IF the `public/logo.png` Bird_Mark asset does not complete loading within 3 seconds of the load request, or returns a load error, THEN THE System SHALL replace the Bird_Mark with the Wordmark rendered as the text "ARCHITEX" in the same placement as the Bird_Mark.
5. WHEN the System renders the Wordmark fallback, THE System SHALL retain the "Architex" text alternative so that the brand identity remains announced to assistive technologies.

### Requirement 7: Responsive Layout

**User Story:** As a visitor on any device, I want the landing page to adapt to my screen, so that the experience is comfortable and legible.

#### Acceptance Criteria

1. WHILE the Viewport width is 1024px or greater, THE Landing_Page SHALL center the Hero_Section both vertically and horizontally within the available content area, with no part of the Hero_Section positioned outside the visible Viewport bounds.
2. WHILE the Viewport width is between 320px and 767px inclusive, THE Landing_Page SHALL stack the Top_Bar, Hero_Section, and Quick_Nav in a single vertical column in that top-to-bottom order, with no horizontal overlap between these sections.
3. WHILE the Viewport width is between 768px and 1023px inclusive, THE Landing_Page SHALL render the Top_Bar, Hero_Section, and Quick_Nav without overlap and without clipping the Bird_Mark, headline, subline, or Primary_CTA.
4. WHEN the Viewport width changes across the 768px or 1024px boundary, THE System SHALL re-render the layout within 200ms while keeping the Bird_Mark, headline, subline, and Primary_CTA fully visible and uncut at all Viewport widths from 320px through 3840px.
5. WHILE the Viewport width is between 320px and 3840px inclusive, THE Landing_Page SHALL render its primary content without producing horizontal scrolling.

### Requirement 8: Motion and Animation

**User Story:** As a visitor, I want subtle, refined motion, so that the interface feels alive without being distracting.

#### Acceptance Criteria

1. WHEN the Landing_Page loads, THE System SHALL animate the entrance of the Hero_Section using framer-motion transitions, completing the entrance animation within 200 to 1000 milliseconds.
2. WHILE the Landing_Page is displayed, THE System SHALL animate the Network_Nodes with a continuous twinkling opacity-pulse loop that repeats indefinitely, with each cycle completing within 2 to 8 seconds.
3. IF the Reduced_Motion_Setting indicates reduced motion is preferred, THEN THE System SHALL render the Landing_Page in a static state with no entrance, looping, or parallax animation, displaying each element in its final resting visual state immediately on load.
4. WHEN a user hovers over the Primary_CTA on a pointer-capable device, THE System SHALL apply a visual emphasis transition that changes the Primary_CTA from its default visual state, completing the transition within 100 to 300 milliseconds.
5. WHEN the pointer leaves the Primary_CTA on a pointer-capable device, THE System SHALL revert the Primary_CTA to its default visual state within 100 to 300 milliseconds.
6. WHEN a user hovers over the Bird_Mark on a pointer-capable device, THE System SHALL apply a subtle scale-up emphasis transition to the Bird_Mark within 100 to 300 milliseconds, and SHALL revert it within 100 to 300 milliseconds when the pointer leaves.

### Requirement 9: Accessibility Compliance

**User Story:** As a visitor using assistive technology, I want the landing page to be perceivable and operable, so that I can use the site regardless of ability.

#### Acceptance Criteria

1. THE System SHALL render the Sign_Up_Action, the Primary_CTA, and each Quick_Nav item within the Top_Bar, Hero_Section, and Quick_Nav as interactive controls that are reachable and focusable using only the keyboard Tab and Shift+Tab keys.
2. WHEN an interactive control in the Top_Bar, Hero_Section, or Quick_Nav has keyboard focus and the user presses the Enter key or, for button controls, the Space key, THE System SHALL invoke that control's activation behavior.
3. WHEN an interactive control receives keyboard focus, THE System SHALL display a focus indicator that fully encloses the control, remains visible for the entire duration the control holds focus, and maintains a contrast ratio of at least 3:1 between the focus indicator and the adjacent background.
4. THE System SHALL provide an accessible name that conveys the control's purpose for the Sign_Up_Action, the Primary_CTA, and each Quick_Nav item.
5. THE System SHALL maintain a text contrast ratio of at least 4.5:1 for body text and at least 3:1 for large text against the effective background, where large text is defined as text of at least 24px (18pt) regular weight or at least 18.66px (14pt) bold weight.
6. THE System SHALL structure the Landing_Page with exactly one level-one heading, and that heading SHALL contain the Hero_Section headline.
7. THE System SHALL order keyboard focus to follow the visual reading order of Top_Bar first, Hero_Section second, then Quick_Nav.
8. WHILE a user navigates interactive controls with the keyboard, THE System SHALL allow focus to move away from every control using the Tab or Shift+Tab keys without trapping focus on any control.
9. THE System SHALL make the Bird_Mark activator keyboard-focusable and operable via the Enter or Space key, and SHALL provide it an accessible name indicating it enters the Architex OS.

### Requirement 10: Reusable Design System for Role-Based App

**User Story:** As a developer, I want the redesign delivered as reusable design tokens and primitives, so that the role-based application can adopt the same look without duplication.

#### Acceptance Criteria

1. THE Design_System SHALL expose color, typography, spacing, radius, and Glass_Surface definitions as shared Theme_Tokens in `src/index.css`, with each value exposed through exactly one canonical Theme_Token and no duplicate definitions.
2. THE Design_System SHALL provide the Glass_Surface and the Bird_Mark rendering as reusable React components that derive their styling from Theme_Tokens rather than literal style values.
3. WHERE a role-based application screen consumes a Design_System primitive, THE System SHALL resolve that primitive's styling exclusively from the shared Theme_Tokens, producing computed style values identical to the Landing_Page render.
4. THE Design_System SHALL preserve the existing Theme_Token names already referenced by the application with zero renames or removals, such that 100% of previously referenced tokens continue to resolve.
5. IF a Design_System primitive references a Theme_Token that is not defined, THEN THE System SHALL render a documented fallback style and emit a development-time warning indicating the unresolved token name.
6. THE Sign_In_Page SHALL reuse the Design_System Theme_Tokens, Glass_Surface, and Bird_Mark, and SHALL remain elemental by excluding the Landing_Page hero copy, the Quick_Nav, and the Flock_Activation animation.
7. THE OS Workspaces SHALL reuse the Design_System Theme_Tokens, Glass_Surface, and Bird_Mark and SHALL remain clutter-free, and SHALL NOT render the Flock_Activation animation or the moving Grid_Background and Agent_Field; the expressive animated background is reserved for the Landing_Page.

### Requirement 11: Conceptual Messaging Integrity

**User Story:** As a brand owner, I want the landing content to communicate the Built Environment OS concept simply, so that the message is unique and not generic.

#### Acceptance Criteria

1. THE Hero_Section SHALL present exactly one headline (maximum 60 characters) and exactly one subline (maximum 160 characters) as the only primary marketing copy in the Hero_Section.
2. THE Landing_Page SHALL limit its primary interactive actions to the Sign_Up_Action, the Primary_CTA, and the four Quick_Nav items; the Bird_Mark is permitted as an alternate activator of the Primary_CTA's Flock_Activation and does not count as an additional distinct action.
3. WHEN the Landing_Page renders in the initial viewport before any user scroll, THE Landing_Page SHALL exclude additional marketing sections, feature grids, statistics rows, and testimonial blocks.
4. IF the headline exceeds 60 characters or the subline exceeds 160 characters, THEN THE Hero_Section SHALL truncate the copy to its character limit and retain the headline and subline as the only primary marketing copy.

### Requirement 12: Bird Flock Activation Sequence

**User Story:** As a visitor, I want a signature activation animation that visually expresses Architex removing complexity, so that I understand the product's promise before I even sign in.

#### Acceptance Criteria

1. WHEN a user activates the Primary_CTA on the Landing_Page, THE System SHALL begin the Flock_Activation sequence.
2. WHEN the Flock_Activation begins, THE System SHALL explode the Bird_Mark into between 30 and 60 Agent_Shards, each rendered as a miniature copy of the Bird_Mark logo at a varying size, animating outward from the Bird_Mark center along divergent trajectories, representing AI agents being deployed.
3. WHILE the Flock_Activation runs, THE System SHALL progressively dissolve the Hero_Section copy, the Quick_Nav, and background grid texture to reduce on-screen complexity.
4. WHEN the Agent_Shards complete their outward dispersal, THE System SHALL settle them into the background as the Agent_Field positioned beneath the stacking order of the OS_Reveal card, reducing each Agent_Shard opacity to at most 0.25.
5. WHILE the OS_Reveal is displayed, THE System SHALL animate each Agent_Field agent along its own path on the Grid_Background lines at a uniform speed, traveling between Network_Nodes and changing between vertical (up/down) and horizontal (side-to-side) movement at Network_Nodes, such that at any given moment some agents are moving vertically while others are moving horizontally.
6. WHILE Agent_Field agents pass beneath the OS_Reveal card, THE System SHALL keep them visible as blurred, obscured shapes through the OS_Reveal Glass_Surface rather than fully hiding them.
7. WHEN the Flock_Activation completes, THE System SHALL present the OS_Reveal sign-in card rendered with the Glass_Surface style, containing an email field, a password field, and a sign-in control.
8. THE System SHALL complete the full Flock_Activation sequence, from activation to OS_Reveal, within 1500 to 3500 milliseconds.
9. IF the Reduced_Motion_Setting indicates reduced motion is preferred, THEN THE System SHALL skip the Agent_Shard dispersal and Agent_Field motion and present the OS_Reveal sign-in card directly without flight, dissolve, or looping animation.
10. WHERE the Landing_Page provides a means to return from the OS_Reveal to the initial Landing_Page state, THE System SHALL restore the Bird_Mark, Hero_Section copy, and Quick_Nav to their pre-activation state.

### Requirement 13: Grid Network Background

**User Story:** As a visitor, I want a structured grid-and-node background, so that the moving agents read as an orderly system working across a connected network.

#### Acceptance Criteria

1. THE Landing_Page SHALL render the Grid_Background as a checkered square grid spanning the full background.
2. THE System SHALL render Network_Nodes as twinkling circular dots positioned at intersections of the Grid_Background lines, distributed across the Viewport.
3. WHEN the Flock_Activation completes and the OS_Reveal is displayed, THE System SHALL keep the Grid_Background visible at a reduced opacity that is lower than its initial Landing_Page opacity.
4. WHEN the OS_Reveal is displayed, THE System SHALL render the Network_Nodes at a dimmer opacity than on the initial Landing_Page.
5. THE System SHALL align Agent_Field travel paths to the Grid_Background lines so that each agent moves between Network_Nodes along grid lines and may turn between a vertical line and a horizontal line at a Network_Node.
6. IF the Reduced_Motion_Setting indicates reduced motion is preferred, THEN THE System SHALL render the Network_Nodes without twinkling and the Agent_Field without travel motion.

### Requirement 14: Theme Mode (Dark Default with Light Option)

**User Story:** As a user, I want to switch between the default dark theme and a light theme, so that I can use the interface in the appearance that suits my preference and environment.

#### Acceptance Criteria

1. THE Design_System SHALL provide two selectable Theme_Modes: the Dark_Theme and the Light_Theme, both defined as Theme_Token sets in `src/index.css`.
2. WHEN the application loads and no stored Theme_Mode preference exists, THE System SHALL apply the Dark_Theme as the default.
3. THE System SHALL provide a Theme_Toggle control that switches the active Theme_Mode between Dark_Theme and Light_Theme.
4. WHEN a user selects a Theme_Mode via the Theme_Toggle, THE System SHALL apply the selected Theme_Mode to all Design_System surfaces within 200 ms and persist the selected preference.
5. WHEN the application reloads after a Theme_Mode has been selected, THE System SHALL restore the most recently selected Theme_Mode.
6. THE Light_Theme SHALL define Theme_Token values that maintain a text contrast ratio of at least 4.5:1 for body text and at least 3:1 for large text and focus indicators against their backgrounds.
7. THE Light_Theme and Dark_Theme SHALL both reuse the same Design_System primitives (Glass_Surface, Bird_Mark, and shared components) without duplicating component logic, differing only by Theme_Token values.
8. WHILE the Light_Theme is active, THE System SHALL render the Glass_Surface with light-appropriate translucency and border values that preserve the obscured-glazing behavior and the contrast requirement in criterion 6.
9. THE Theme_Toggle SHALL be keyboard-focusable and operable via the Enter or Space key, and SHALL expose an accessible name indicating it switches the color theme.
