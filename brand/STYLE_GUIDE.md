# Sippy Style Guide

Quick-reference for every visual token in the Sippy brand system.
For design ideology, component patterns, and anti-patterns see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

---

## Colors

### Brand Palette

| Name                 | Hex       | CSS Variable            | Tailwind              | Role                                                         |
| -------------------- | --------- | ----------------------- | --------------------- | ------------------------------------------------------------ |
| Cheetah Blue         | `#00AFD7` | `--brand-primary`       | `brand-primary`       | Consumer-facing surfaces, borders, spec labels, primary CTA  |
| Cheetah Blue Hover   | `#0098BD` | `--brand-primary-hover` | `brand-primary-hover` | Interactive hover state for primary elements                 |
| Electric Green       | `#00D796` | `--brand-crypto`        | `brand-crypto`        | Crypto/transaction context, WhatsApp CTA, success indicators |
| Electric Green Hover | `#00B87F` | --                      | `brand-crypto-hover`  | Interactive hover state for crypto elements                  |
| Brand Dark           | `#0D0D1A` | `--brand-dark`          | `brand-dark`          | Body text, dark backgrounds                                  |

### Semantic Colors

| Name          | Hex       | CSS Variable           | Tailwind                 | Usage                             |
| ------------- | --------- | ---------------------- | ------------------------ | --------------------------------- |
| Success       | `#16A34A` | `--semantic-success`   | `semantic-success`       | Confirmations, completed states   |
| Success Light | `#DCFCE7` | `--fill-success-light` | `semantic-success-light` | Success banners/alert backgrounds |
| Danger        | `#DC2626` | `--semantic-danger`    | `semantic-danger`        | Errors, destructive actions       |
| Danger Light  | `#FEE2E2` | `--fill-danger-light`  | `semantic-danger-light`  | Error banners/alert backgrounds   |
| Warning       | `#D97706` | `--semantic-warning`   | `semantic-warning`       | Caution states, pending actions   |
| Warning Light | `#FEF3C7` | `--fill-warning-light` | `semantic-warning-light` | Warning banners/alert backgrounds |

### Light Tints (backgrounds)

| Tailwind              | Value                     | Usage                                   |
| --------------------- | ------------------------- | --------------------------------------- |
| `brand-primary-light` | `#E6F7FB`                 | Light blue backgrounds, selected states |
| `brand-primary-muted` | `rgba(0, 175, 215, 0.15)` | Subtle blue fills, hover tints          |
| `brand-crypto-light`  | `#E6FBF3`                 | Light green backgrounds                 |

### Surface System (CSS Variables)

Light mode:

| Variable           | Value                      | Usage                       |
| ------------------ | -------------------------- | --------------------------- |
| `--bg-primary`     | `#FFFFFF`                  | Main page background        |
| `--bg-secondary`   | `#F9FAFB`                  | Card/section backgrounds    |
| `--bg-tertiary`    | `#F3F4F6`                  | Inset/nested backgrounds    |
| `--bg-nav-blur`    | `rgba(255, 255, 255, 0.7)` | Floating nav glassmorphism  |
| `--text-primary`   | `#0D0D1A`                  | Headings, main text         |
| `--text-secondary` | `rgba(13, 13, 26, 0.6)`    | Supporting text             |
| `--text-muted`     | `rgba(13, 13, 26, 0.4)`    | Captions, decorative labels |
| `--border-default` | `rgba(0, 175, 215, 0.1)`   | Subtle dividers             |
| `--border-strong`  | `rgba(0, 175, 215, 0.2)`   | Emphasized borders          |

Dark mode (`.dark`):

| Variable           | Value                       |
| ------------------ | --------------------------- |
| `--bg-primary`     | `#000000`                   |
| `--bg-secondary`   | `#0A0A0A`                   |
| `--bg-tertiary`    | `#141414`                   |
| `--bg-nav-blur`    | `rgba(0, 0, 0, 0.7)`        |
| `--text-primary`   | `#FFFFFF`                   |
| `--text-secondary` | `rgba(255, 255, 255, 0.7)`  |
| `--text-muted`     | `rgba(255, 255, 255, 0.45)` |
| `--border-default` | `rgba(255, 255, 255, 0.10)` |
| `--border-strong`  | `rgba(255, 255, 255, 0.18)` |

### Color Rules

- **Two-brand-color system is strict.** Cheetah blue = consumer/trust. Electric green = crypto/action. Never cross them.
- **Never use gray on colored backgrounds.** Use a tinted shade of the background color or white with transparency.
- **Decorative text uses opacity, not gray.** Spec labels use `text-brand-dark/40` or `text-brand-primary/60`, never `text-gray-400`.
- **Body text:** `text-gray-500` on white, `text-gray-600` on gray-50.
- **Borders use brand-primary with opacity** for the equipment/wireframe feel, not gray borders.

### Monochrome Usage

| Context                  | Foreground | Background |
| ------------------------ | ---------- | ---------- |
| Print                    | `#1A1A2E`  | White      |
| Dark mode / dark surface | White      | Black      |

---

## Typography

### Font Stack

| Font             | CSS Variable          | Tailwind Class | Loaded Weights          | Role                                                |
| ---------------- | --------------------- | -------------- | ----------------------- | --------------------------------------------------- |
| **Chakra Petch** | `--font-chakra-petch` | `font-sans`    | 300, 400, 500, 600, 700 | Default body font, headings, CTAs, uppercase labels |
| **Electrolize**  | `--font-electrolize`  | `font-display` | 400                     | Data/numeric displays                               |
| **Space Mono**   | `--font-space-mono`   | `font-mono`    | 400, 700                | Spec labels, data readouts, timestamps, footer text |

All fonts loaded from Google Fonts with `display: swap` and `latin` + `latin-ext` subsets.

### Typography Rules

| Element          | Font         | Weight         | Size       | Tracking | Transform | Example class                       |
| ---------------- | ------------ | -------------- | ---------- | -------- | --------- | ----------------------------------- |
| Headings         | Chakra Petch | Bold (700)     | Responsive | Default  | Uppercase | `font-sans font-bold uppercase`     |
| Body text        | Chakra Petch | Regular (400)  | 16px base  | Default  | None      | `font-sans`                         |
| Spec labels      | Space Mono   | Bold (700)     | 11px       | 0.15em   | Uppercase | `.spec-label`                       |
| Data readouts    | Space Mono   | Regular (400)  | 9-11px     | Wide     | Uppercase | `font-mono text-xs tracking-wider`  |
| CTAs             | Chakra Petch | Semibold (600) | Varies     | Default  | Uppercase | `font-sans font-semibold uppercase` |
| Numeric displays | Electrolize  | Regular (400)  | Varies     | Default  | None      | `font-display`                      |

### Key Typography Decisions

- Headings are **always uppercase**. This is the equipment manual aesthetic.
- Body text never uses monospace. Monospace is reserved for spec labels, data readouts, and timestamps.
- No generic system fonts for headings. Chakra Petch is the display font, always.

---

## Logo

### Assets

Two marks are available, each in 12 color variants:

| Mark                     | Files                  | Stroke |
| ------------------------ | ---------------------- | ------ |
| Wordmark (`sippy/51994`) | `sippy-wordmark-*.svg` | 16px   |
| Standalone S/5 mark      | `sippy-s-mark-*.svg`   | 32px   |

### Color Variants

Each mark ships in these combinations:

| Variant                   | Mark Color     | Background     |
| ------------------------- | -------------- | -------------- |
| `*-cheetah.svg`           | Cheetah Blue   | Transparent    |
| `*-electric.svg`          | Electric Green | Transparent    |
| `*-black.svg`             | Black          | Transparent    |
| `*-white.svg`             | White          | Transparent    |
| `*-cheetah-on-white.svg`  | Cheetah Blue   | White          |
| `*-electric-on-white.svg` | Electric Green | White          |
| `*-black-on-white.svg`    | Black          | White          |
| `*-white-on-black.svg`    | White          | Black          |
| `*-white-on-cheetah.svg`  | White          | Cheetah Blue   |
| `*-white-on-electric.svg` | White          | Electric Green |

### Construction

- All straight lines, no curves -- brutalist geometric system.
- Angular `sippy/51994` wordmark plus standalone S/5 mark.

---

## Motion & Animation

### Easing

| Name    | Value                               | Usage                           |
| ------- | ----------------------------------- | ------------------------------- |
| Primary | `cubic-bezier(0.16, 1, 0.3, 1)`     | Fade-in-up, scroll transitions  |
| Smooth  | `cubic-bezier(0.37, 0, 0.63, 1)`    | Glitch wave bands               |
| Spring  | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Reserved (`.transition-spring`) |

### Duration Guidelines

| Context                       | Duration  |
| ----------------------------- | --------- |
| Hover/interaction transitions | 150-300ms |
| Scroll reveal animations      | 0.5-0.8s  |
| CRT/VHS ambient loops         | 4-23s     |

### Named Animations

| Class                         | Duration | Behavior                              |
| ----------------------------- | -------- | ------------------------------------- |
| `.animate-fade-in-up`         | 0.8s     | Blur + fade + 24px vertical offset    |
| `.animate-float`              | 4s       | Gentle 8px vertical float, infinite   |
| `.analog-band`                | 7s       | Rolling black band (CRT interference) |
| `.animate-glitch-wave`        | 11s      | Erratic vertical translation          |
| `.animate-glitch-wave-slow`   | 17s      | Slow vertical drift with skew         |
| `.animate-glitch-wave-fast`   | 6.7s     | Fast vertical translation with scale  |
| `.animate-glitch-drift`       | 23s      | Organic blob wandering                |
| `.animate-glitch-wave-h`      | 8.3s     | Horizontal interference               |
| `.animate-glitch-wave-h-slow` | 13.7s    | Slow horizontal drift                 |
| `.animate-vhs-flicker-1`      | 8s       | VHS tracking line (step-end)          |
| `.animate-vhs-flicker-2`      | 11s      | VHS tracking line (step-end)          |
| `.animate-vhs-flicker-3`      | 14s      | VHS tracking line (step-end)          |
| `.animate-hero-drift`         | 12s      | Slow horizontal streak drift          |
| `.animate-hero-drift-slow`    | 16s      | Slower horizontal drift               |
| `.animate-hero-drift-warm`    | 10s      | Warm opacity-shifting drift           |

### Motion Rules

- **Never use bounce or elastic easing.** Equipment doesn't bounce.
- Only animate `transform` and `opacity` for 60fps.
- Keep SVG `feTurbulence numOctaves` low (2-4) for LATAM low-end Android.
- All CRT animations are CSS-only (no JS runtime cost).
- All animations respect `prefers-reduced-motion: reduce` (instant opacity, no transforms).

---

## Spacing & Layout

### Content Width

| Breakpoint | System                                              |
| ---------- | --------------------------------------------------- |
| Mobile     | `max-w-[75vw]` -- consistent across all sections    |
| Desktop    | `sm:max-w-7xl` or full-width with `sm:px-6 lg:px-8` |
| Hero       | No max-width on desktop, uses `sm:px-14 lg:px-16`   |

### Vertical Rhythm

| Element           | Padding                  |
| ----------------- | ------------------------ |
| Standard sections | `py-12 sm:py-24`         |
| Hero              | `h-screen max-h-[900px]` |

### Grid Backgrounds

| Class              | Spacing        | Opacity |
| ------------------ | -------------- | ------- |
| `.ruled-lines`     | 80px vertical  | 0.06    |
| `.grid-overlay`    | 60px both axes | 0.04    |
| `.grid-overlay-lg` | 80px both axes | 0.06    |

---

## Special Colors

A few one-off colors used in specific contexts:

| Hex       | Where                       | Why                                                                    |
| --------- | --------------------------- | ---------------------------------------------------------------------- |
| `#1c2e3c` | CRT screen background       | Deep teal-blue reads as powered-on, not dead panel                     |
| `#f4fafe` | CRT TV housing background   | Barely-blue tint ties to brand without competing with wireframe border |
| `#1A1A2E` | Print monochrome foreground | Warm near-black for print collateral                                   |
