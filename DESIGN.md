---
name: "ETHN Courts â€” Daylight SaaS"
description: "Minimalist SaaS design system for ETHN Courts pickleball booking, built on crisp white surfaces, court cobalt primary actions, pickleball lime accents, and Space Grotesk + Geist typography."
---

## Overview

ETHN Courts is an outdoor pickleball court booking and open-play platform in Balamban, Cebu. The design system translates the energy of a physical blue-and-lime pickleball court into a minimalist, high-clarity SaaS interface. Generous whitespace, 1px hairline borders, and crisp typographic hierarchy replace heavy full-bleed color blocks so players can scan court availability, book a slot, or track a reservation in seconds.

## Colors

The palette pairs a crisp light surface with **Court Cobalt** (`#00288E` / `#1E40AF`) for primary actions and **Pickleball Lime** (`#65A30D`) as a restrained accent for active highlights, open-play indicators, and court energy. Semantic status tokens handle availability states (`available`, `selected`, `unavailable`, `closed`) cleanly without visual clutter.

```yaml
colors:
  accent: "#65A30D"
  on-accent: "#2C2C2C"
  success: "#15803D"
  on-success: "#FFFFFF"
  success-container: "#DCFCE7"
  on-success-container: "#14532D"
  warning: "#B45309"
  on-warning: "#FFFFFF"
  warning-container: "#FEF3C7"
  on-warning-container: "#78350F"
  light:
    primary: "#00288E"
    on-primary: "#FFFFFF"
    primary-container: "#1E40AF"
    on-primary-container: "#A8B8FF"
    secondary: "#525C87"
    on-secondary: "#FFFFFF"
    secondary-container: "#C3CCFE"
    on-secondary-container: "#4C5680"
    tertiary: "#213B00"
    on-tertiary: "#FFFFFF"
    tertiary-container: "#315400"
    on-tertiary-container: "#8BCD3D"
    error: "#BA1A1A"
    on-error: "#FFFFFF"
    error-container: "#FFDAD6"
    on-error-container: "#93000A"
    background: "#FFFFFF"
    on-background: "#1A1B22"
    surface: "#FFFFFF"
    surface-dim: "#DAD9E3"
    surface-bright: "#FBF8FF"
    surface-container-lowest: "#FFFFFF"
    surface-container-low: "#F4F2FC"
    surface-container: "#EEEDF7"
    surface-container-high: "#E8E7F1"
    surface-container-highest: "#E3E1EB"
    on-surface: "#1A1B22"
    surface-variant: "#E1E1F2"
    on-surface-variant: "#444653"
    outline: "#757684"
    outline-variant: "#C4C5D5"
    inverse-surface: "#2F3037"
    inverse-on-surface: "#F1F0FA"
    inverse-primary: "#B8C4FF"
  dark:
    primary: "#B8C4FF"
    on-primary: "#002584"
    primary-container: "#1E40AF"
    on-primary-container: "#A8B8FF"
    secondary: "#BBC4F6"
    on-secondary: "#242E56"
    secondary-container: "#3B446E"
    on-secondary-container: "#A9B3E3"
    tertiary: "#96D947"
    on-tertiary: "#1E3700"
    tertiary-container: "#315400"
    on-tertiary-container: "#8BCD3D"
    error: "#FFB4AB"
    on-error: "#690005"
    error-container: "#93000A"
    on-error-container: "#FFDAD6"
    background: "#12131A"
    on-background: "#E3E1EB"
    surface: "#12131A"
    surface-dim: "#12131A"
    surface-bright: "#383940"
    surface-container-lowest: "#0D0E14"
    surface-container-low: "#1A1B22"
    surface-container: "#1E1F26"
    surface-container-high: "#282A31"
    surface-container-highest: "#33343C"
    on-surface: "#E3E1EB"
    surface-variant: "#444653"
    on-surface-variant: "#C4C5D5"
    outline: "#8E909F"
    outline-variant: "#444653"
    inverse-surface: "#E3E1EB"
    inverse-on-surface: "#2F3037"
    inverse-primary: "#3755C3"
```

## Typography

A technical SaaS type hierarchy built on **Space Grotesk** for geometric, tight-tracked display and section headings, **Geist** for crisp, legible UI and body copy, and **Geist Mono** for court rates (`â‚±150.00`), time ranges, and reservation tracking codes.

```yaml
typography:
  display-lg:
    fontFamily: "Space Grotesk"
    fontSize: 56px
    fontWeight: 700
    lineHeight: 62px
    letterSpacing: -1.5px
  display-lg-mobile:
    fontFamily: "Space Grotesk"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 38px
    letterSpacing: -0.75px
  display-md:
    fontFamily: "Space Grotesk"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 46px
    letterSpacing: -1px
  display-md-mobile:
    fontFamily: "Space Grotesk"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: -0.5px
  headline-lg:
    fontFamily: "Space Grotesk"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 42px
    letterSpacing: -0.75px
  headline-lg-mobile:
    fontFamily: "Space Grotesk"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 30px
    letterSpacing: -0.5px
  headline-md:
    fontFamily: "Space Grotesk"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 30px
    letterSpacing: -0.5px
  headline-sm:
    fontFamily: "Space Grotesk"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: -0.25px
  title-lg:
    fontFamily: "Geist"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: -0.2px
  title-md:
    fontFamily: "Geist"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: -0.1px
  body-lg:
    fontFamily: "Geist"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 26px
    letterSpacing: 0px
  body-md:
    fontFamily: "Geist"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0px
  body-sm:
    fontFamily: "Geist"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0px
  label-lg:
    fontFamily: "Geist"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0px
  label-md:
    fontFamily: "Geist"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.1px
  label-sm:
    fontFamily: "Geist"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.2px
  mono-md:
    fontFamily: "Geist Mono"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: 0px
  mono-sm:
    fontFamily: "Geist Mono"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0px
```

## Layout & Spacing

Landing layout centered on a `1120px` max-width container inside a `1280px` viewport, with an airy `80px`â€“`96px` vertical rhythm between sections and hairline `1px` dividers (`outline-variant`). An `8px` base grid (`4px` half-step for micro-padding) keeps slot grids, bento cards, and form controls aligned.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 80px
  page-margin: 32px
```

## Elevation & Depth

Minimalist tonal layering paired with crisp `1px` hairline borders (`outline-variant`). Cards and interactive booking containers rest on `surface-container-lowest` (`#FFFFFF`) or `surface-container-low` (`#F4F2FC`) without heavy drop shadows; reserve soft elevation for floating surfaces and, optionally, the hero CTA.

## Shapes

Soft Pill & Card geometry: `16px` (`lg`) for primary containers and cards, `12px` (`md`) for inner bento cards and inputs, `8px` (`DEFAULT`) for time-slot pills, and `9999px` (`full`) for primary/secondary buttons, date pills, and status badges.

```yaml
rounded:
  sm: 4px
  DEFAULT: 8px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
```

## Motion & Micro-interaction

Motion is crisp and functional. Slot pills, date selectors, and buttons respond in `120ms` (`ease-out`) via color and subtle scale/opacity transitions, while FAQ accordions and panels enter smoothly in `220ms`.

```yaml
motion:
  state-change:
    duration: 120ms
    delay: 0ms
    timingFunction: ease-out
  surface-enter:
    duration: 220ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
```

## Voice & Content Strategy

Direct, local, and welcoming without marketing fluff. Headings use sentence case (`Book a court`, `How booking works`, `Track your reservation`). Action buttons use concise verb phrases (`Book a court`, `See open plays`, `Check availability`, `Check status`). Rates use `â‚±150.00` in `Geist Mono` with `tabular-nums`.

## Component defaults

Use the existing Base UI wrappers in `src/components/ui/` as the implementation baseline. This spec replaces the old CK Grounds design; it describes the target, not the current UI. Do not add a second component library or depend on external sticker sheets.

| Component | Default | Exceptions and behavior |
|---|---|---|
| Buttons and action links | Cobalt `primary` with `on-primary` for the main action. Quiet `secondary-container` with `on-secondary-container` for secondary actions; this replaces the previous orange CTA. Use neutral ghost or text links for tertiary actions. | Customer CTAs are pills. Compact staff toolbar and icon controls may use 8–12 px corners; preserve their density. Use links for navigation and buttons for actions. Destructive actions use error roles, never orange or lime. |
| Fields, selects and date pickers | Use `Input`, `Textarea`, `FormSelect`, and `DateField`; 12 px radius, muted fill, visible labels, linked help and errors. | Use `outline` when the boundary identifies the control; reserve `outline-variant` for decorative dividers. Keep customer touch targets at least 44 px and mobile text inputs at least 16 px; allow compact staff controls with comfortable touch sizing on coarse pointers. |
| Cards | White or low-tonal surface, 16 px radius, 1 px decorative border. | No blanket card shadows. Soft elevation for floating overlays and an optional hero CTA; keep tables and filters flat. |
| Dialogs and confirmations | Share panel, backdrop, title, and footer styling across `Dialog` and the styled confirmation provider. Keep contents scrollable on short viewports. | Confirmations keep explicit verbs, initial focus on Cancel for risky actions, Escape dismissal where appropriate, and return focus to the trigger. Preserve payment warnings and retry safeguards. |
| Accordion | Keep semantic disclosure, visible focus and clear expanded state. | Use the existing FAQ behavior; motion must not delay access to content. |
| Feedback | Inline errors for recoverable input or workflow problems, toasts for brief outcomes, badges for persistent status. | Do not make color the only signal or replace instructions users need with a toast. |

## State and accessibility rules

- **Default / hover / pressed:** light primary uses `primary` by default, `primary-container` for hover and `primary` for pressed; keep `on-primary` text. Dark primary uses `primary` with `on-primary`; use `inverse-on-surface` as the lighter hover fill and return to `primary` on press. Secondary actions use their container pair; use an underline or inset outline for additional interaction feedback without changing the text pairing.
- **Focus:** use a visible 2 px outline, offset 2 px. Use `primary` against the page surface; on a matching or mixed surface, use a contrasting two-tone ring. Check focus against adjacent colors in both themes and support forced colors.
- **Disabled / pending:** disabled controls use `surface-container-high` with `on-surface-variant`, are not interactive, and do not respond to hover. Show the reason nearby when needed. While submitting, keep the action visible and indicate progress without allowing duplicate submits.
- **Booking inventory:** Available uses a quiet surface with a price; selected uses the cobalt primary pair and a programmatic pressed state; unavailable and closed use neutral surfaces and distinct symbols or labels. Keep readable accessible names even when the grid uses symbols. Lime is an accent, not the availability or success signal.
- **Booking lifecycle:** Proof submitted means **Pending review**, not confirmed. Use success for actual confirmation, warning for time-sensitive or unresolved states, and error for failed actions. Use text with every persistent status.
- **Contrast:** target at least 4.5:1 for normal text and 3:1 for meaningful control boundaries and indicators. Cobalt on white is 12.40:1; lime with `#2C2C2C` is 4.52:1, but lime with white is only 3.09:1. `outline-variant` on white is 1.71:1; do not rely on it alone to identify controls. Verify actual pairings, including focus, placeholder, hover, and dark states.
- **Motion:** keep the specified 120 ms state and 220 ms surface transitions where helpful. Under `prefers-reduced-motion`, skip scale and nonessential transitions. Preserve the existing landing hero artwork and animation; do not extend its motion to staff screens.

## Rollout and acceptance

1. **Foundation:** map this palette and typography into existing shared theme variables and UI wrappers. Keep public and compact staff size presets; do not force every control into the same visual size. Keep existing ETHN identity and artwork.
2. **Customer:** migrate landing, `/book`, Plays, Track, and Contact. Use the 1120 px width and generous section rhythm on landing only; booking grids may use more space. Preserve the gallery, selected-slot handoff, mobile summary, calendar, payment holds, proof review, and private tracking.
3. **Staff:** migrate shared controls, dialogs, tables, feedback, and status labels while preserving compact workflow layouts and booking/payment safeguards. Staff schedule, calendar and finance views are not capped at landing width.
4. **Release checks:** ship light and dark together for each migrated surface because the app follows system theme. Verify mobile reflow, keyboard and focus restoration, contrast in both themes, and held/released/pending/confirmed booking states. Check date-change cancellation, paid-checkout release warnings, and staff retry behavior before accepting the migration.
