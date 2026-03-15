# Sippy Design System

## Design Ideology

Sippy's visual identity lives at the intersection of **equipment design** and **analog nostalgia**. The aesthetic reference is "Teenage Engineering meets Aphex Twin's Cheetah EP" — precision instrumentation with warmth, technical without being cold, retro without being kitschy.

The core tension: **we build invisible crypto infrastructure, but we present it through analog metaphors**. The user never sees a blockchain. They see equipment panels, spec sheets, CRT screens, registration marks — physical things that feel trustworthy because they're tangible. This is deliberate: our LATAM audience doesn't trust apps that look like apps. They trust things that look like they were built by engineers who care.

### Inspiration & References

| Reference | What we take from it |
|-----------|---------------------|
| **Teenage Engineering** (OP-1, TX-6) | Equipment panel aesthetic — double-border housings, spec labels, indicator dots, registration marks. The product IS the interface. |
| **Aphex Twin — Cheetah EP** | Cornflower/cerulean blue, thin multi-line border frames, vintage synth manual feel. Confidence without trying hard. The cheetah blue (#00AFD7) comes directly from this. |
| **VHS / CRT analog artifacts** | Scanlines, chromatic aberration, rolling black bands, phosphor glow. Organic warmth layered on digital precision. The CRT TV component is the purest expression of this. |
| **Technical drawings / engineering paper** | Ruled grid backgrounds, registration marks, squared inner tolerances on rounded outer housings. Precision communicates care. |
| **Nokia print ads (early 2000s)** | Phone-centered layout with flanking content. The "How It Works" section uses this layout — phone silhouette centered, steps on either side. |
| **Equipment spec sheets** | Dense information layout, monospace data readouts, tracking-wide uppercase labels. The footer IS a spec sheet. |

### Principles

1. **Equipment, not software.** UI elements look like they belong on a Teenage Engineering product — panel frames with double borders, spec labels with tracking, indicator dots, registration marks. The page is a piece of equipment, not a website.

2. **Analog warmth on digital precision.** The CRT TV scanlines, VHS glitch waves, and analog gradient effects add organic texture. But they're layered on top of a rigid geometric grid. The chaos is controlled.

3. **Brutalist geometry with selective softness.** The logo is all straight lines, no curves. Section borders are angular. But hero frame borders get rounded corners — the contrast between sharp and soft creates visual tension that keeps the eye moving.

4. **Flat, not 3D.** Everything is flat and diagrammatic. No drop shadows on cards. No gradient buttons. No 3D renders. The CRT TV is a wireframe, not a chunky photorealistic object. The phone silhouette is a line drawing. This keeps the visual system cohesive and prevents individual elements from jumping out of the plane.

5. **Density over emptiness.** Unlike most landing pages that float elements in white space, Sippy packs information tight — like a spec sheet or equipment manual. Grid lines, data readouts, border frames all fill the space with intentional detail.

6. **Square inner borders on rounded outer borders.** This is a deliberate design decision, not a bug. Panel frames (`::after` pseudo-elements) use square corners inside rounded outer borders. The geometric contrast is the point — it references technical drawings where inner tolerances are tighter than outer housings.

---

## Color System

### Brand Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `brand-primary` (Cheetah Blue) | `#00AFD7` | Consumer-facing surfaces, borders, spec labels, primary CTA |
| `brand-crypto` (Electric Green) | `#00D796` | Crypto/transaction contexts, WhatsApp CTA, success indicators |
| `brand-dark` | `#0D0D1A` | Body text, dark backgrounds, phone silhouette |

### Color Rules
- **Never use gray on colored backgrounds.** Use a tinted shade of the background color or white with transparency instead.
- **Decorative text uses opacity, not gray.** Spec labels, version stamps, and equipment annotations use `text-brand-dark/40` or `text-brand-primary/60` — not `text-gray-400`.
- **Body text is `text-gray-500` on white, `text-gray-600` on gray-50.** Consistent. No mixing.
- **Borders use brand-primary with opacity** for the equipment/wireframe feel, not gray borders.
- **The two-brand-color system is strict:** cheetah blue = consumer/trust, electric green = crypto/action. Don't cross them.

### CSS Custom Properties
```css
:root {
  --brand-primary: #00AFD7;
  --brand-primary-hover: #0098BD;
  --brand-crypto: #00D796;
  --brand-dark: #0D0D1A;
}
```

---

## Typography

### Font Stack
| Font | Variable | Usage |
|------|----------|-------|
| Chakra Petch | `--font-chakra-petch` | Headings (`font-display`), CTAs, uppercase labels |
| Electrolize | `--font-electrolize` | Reserved for data/numeric displays |
| Space Mono | `--font-space-mono` | Spec labels, data readouts, timestamps, footer text |

### Rules
- **Headings are always uppercase.** `font-display font-bold uppercase` — this is the equipment manual aesthetic.
- **Spec labels** use Space Mono at 11px, bold, tracking 0.15em, uppercase. Color is `brand-primary` or `brand-primary/60`.
- **Body text** uses the default sans stack (Chakra Petch via `font-sans`). Never monospace for body paragraphs.
- **Data readouts** (hero tags, footer specs) use monospace at 9-11px with wide tracking.

---

## Component Patterns

### Panel Frame (`.panel-frame`)
The signature Sippy component. Double-border equipment housing.
- Outer: `border: 1px solid var(--brand-primary)`
- Inner (`::after`): `inset: 5px; border: 1px solid var(--brand-primary)`
- Inner border is **always square** (no `border-radius: inherit`) — intentional design decision
- Hover: inner border transitions to white
- Fill variant (`.panel-frame-fill-hover`): inner fills with brand-primary on hover, text goes white

### Panel Frame Light (`.panel-frame-light`)
White variant for blue/dark backgrounds.
- Uses `rgba(255, 255, 255, 0.4)` borders instead of brand-primary.

### Gradient Border Frame (Hero + Under the Hood)
Multiple nested `<div>` elements with progressive opacity, creating a bloom/glow effect:
- 12 border lines fading from `brand-primary/[0.03]` (outer) to `brand-primary/80` (inner)
- Outer borders are more rounded, inner borders are tighter — mimics lens aberration
- Mobile uses `inset-x` values (content-width independent), desktop uses negative insets to go wider

### CRT TV (`.crt-tv`)
Wireframe equipment housing with analog screen.
- Housing: `background: #f4fafe` (barely-blue tint), `border: 1px solid var(--brand-primary)`, `border-radius: 1.2rem`
- Inner double border via `::after` with `inset: 5px`
- Screen (`.crt-screen`): rounded corners, `overflow: hidden`, `inset box-shadow` for depth
- Scanlines via `::after` repeating gradient (2px alternating dark bands)
- Content overlays: VHS flicker lines, chromatic aberration text (`.crt-fringe`), phosphor glow (`.crt-glow`)
- Bottom bar: "sippy" label at `text-brand-primary/60`, decorative circles at `border-brand-primary/30`
- **Screen base color**: `#1c2e3c` (deep teal-blue) — not brand-dark. Must read as a powered-on CRT, not a dead panel.

### Registration Marks (`.registration-marks`)
Print-style alignment crosshairs in corners. Desktop only (`sm:` breakpoint). Opacity 0.3. Applied to hero section.

### Indicator Dot (`.indicator-dot`)
6px circle status light. Active variant uses brand-crypto with glow box-shadow.

### Spec Label (`.spec-label`)
Equipment annotation text. Space Mono, 11px, bold, 0.15em tracking, uppercase, brand-primary color.

---

## Animation & Motion

### Philosophy
Motion serves the analog equipment narrative. Everything should feel like mechanical instrumentation — not bouncy UI.

### Easing
- **Primary**: `cubic-bezier(0.16, 1, 0.3, 1)` — fast start, smooth deceleration. Used for fade-in-up, transitions.
- **NEVER use bounce or elastic easing.** They feel dated and fight the precision aesthetic.
- **Transition duration**: 150-300ms for interactions, 0.5-0.8s for scroll reveals.

### Scroll Animations
- `BlurFade`: Blur + fade + vertical offset on enter. Uses Framer Motion `useInView`.
- `ScrollReveal`: Directional slide + fade. Supports `left`, `right`, `up` directions.
- Both respect `prefers-reduced-motion` — reduced motion = instant opacity, no transforms.

### CRT/VHS Effects
- `analog-band`: Rolling black band, 7s linear infinite. Simulates analog TV interference.
- `vhs-flicker-1/2/3`: Horizontal tracking lines that jump erratically (step-end timing).
- `glitch-wave` variants: Slow vertical translation of wave layers at different speeds (6.7s to 17s).
- `glitch-drift`: Organic blob movement, 23s cycle.
- `float-breathe`: Gentle 8px vertical float, 4s ease-in-out. Used on phone silhouette.

### Performance Rules
- Only animate `transform` and `opacity` for 60fps.
- SVG `feTurbulence` filters are expensive — keep `numOctaves` low (2-4) for LATAM low-end Android target.
- All CRT animations are CSS-only (no JS runtime cost).
- `will-change` not used (browser heuristics are sufficient at current complexity).

---

## Layout Patterns

### Content Width System
- **Mobile**: `max-w-[75vw]` — consistent across all sections. This is the mobile content width.
- **Desktop**: `sm:max-w-7xl` or `sm:max-w-none` with horizontal padding (`sm:px-6 lg:px-8`).
- **Hero**: No max-width on desktop; uses `sm:px-14 lg:px-16` for the blue container to stretch wider.
- **Under the Hood**: Full-width wrapper, border lines use `inset-x` values independently from content width.

### Section Rhythm
- Vertical padding: `py-12 sm:py-24` for most sections. Hero is `h-screen max-h-[900px]`.
- White throughout with one exception: Get Started CTA is full-width `bg-brand-primary` for punch.
- Separation comes from border frames, grid lines, and content density — not alternating backgrounds.

### Grid Backgrounds
Ruled grid lines (80px or 60px spacing) using CSS `background-image` with `rgba(0, 175, 215, 0.04-0.06)`. Applied to Under the Hood section and footer. Echoes engineering paper / equipment rack lines.

---

## Navigation

### ScrollNav
- Floating nav with hide-on-scroll-down, show-on-scroll-up behavior.
- Scrolled state: `bg-white/70 backdrop-blur-xl shadow-sm` (glassmorphic).
- Wordmark is **absolute centered** (`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`), not flex centered.
- S-mark badge on left, CTA on right. Mobile CTA says "Access", desktop says "Get Early Access".

---

## Accessibility

- Skip-to-content link as first child of page.
- `<main id='main-content'>` wraps all content between nav and footer.
- `aria-hidden='true'` on decorative elements (marquee, desktop-only step duplicates, SVG icons in CTAs).
- `aria-label='Main navigation'` on nav.
- `focus-visible:ring-2` on all interactive elements — ring color matches context (brand-primary on white, white on blue).
- `prefers-reduced-motion` respected: all animations disabled, scroll reveals become instant.
- Touch targets: minimum 44x44px on mobile (enforced via padding on small links).

---

## Anti-Patterns (What NOT to Do)

1. **No gradient text.** AI slop tell. Use solid colors.
2. **No glassmorphism on cards.** Only on the floating nav (functional, not decorative).
3. **No hero metrics grid** ("10K+ users / $1M+ volume"). We don't have the numbers yet, and fake metrics are dishonest.
4. **No card grids with icons.** The Under the Hood section uses an asymmetric grid with one large feature card — not a 3x3 grid of identical cards.
5. **No bounce animations.** Equipment doesn't bounce.
6. **No pure gray text.** Always tinted with brand color via opacity on brand-dark/primary.
7. **No 3D elements.** Everything flat and diagrammatic.
8. **No generic stock fonts** (Inter, system-ui for headings). Chakra Petch is the display font.
9. **No alternating section backgrounds.** White throughout (except the Get Started CTA), separated by border frames and grid lines.
10. **No rounded inner borders on panel frames.** Square inner, rounded outer. This is intentional.

---

## Key Design Decisions Log

| Decision | Rationale |
|----------|-----------|
| Square inner borders on rounded outer borders | Technical drawing aesthetic — inner tolerances tighter than outer housings |
| CRT TV as wireframe, not 3D | Maintains flat design language; 3D would break the visual plane |
| CRT screen base `#1c2e3c` not brand-dark | Must read as powered-on screen, not dead panel. Deep teal-blue lets scanlines shimmer |
| TV housing `#f4fafe` | Barely-blue tint ties to brand without competing with wireframe border |
| Horizontal scanlines (not vertical) | Authentic CRT behavior — electron gun sweeps horizontally |
| `max-w-[75vw]` on mobile | Consistent content width across all sections, prevents edge-to-edge content that feels cramped |
| Absolute-centered wordmark in nav | True center regardless of left/right element widths |
| No panel-frame-rounded on pills | Square inner borders are the design decision, even on rounded pill shapes |
| Hero "Request Access" not "Start Texting" | Honest — we're in beta, can't promise instant access |
| WhatsApp CTA uses brand-crypto, not brand-primary | Green = action/crypto context. Blue = information/trust context |
| Get Started section full-width blue | Breaks white monotony before footer, more direct and punchy |
