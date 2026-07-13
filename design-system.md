# FTA Insurance — Design System

> Distilled from the live ftainsurance.com.au site. Use this as the visual reference for the underwriter MVP so the demo looks native to FTA's brand.

---

## 1. Brand personality

Bold, confident, modern fintech-for-insurance. Big type, generous whitespace, sharp magenta accents against deep navy and warm cream. The tone is "fast, sharp, specialist" — the UI should feel decisive and uncluttered.

Tagline voice: *"The Fast Turn Around Specialists."* / *"Cover that doesn't flinch at hard risk."*

---

## 2. Color palette

| Token | Hex (approx) | Usage |
|-------|--------------|-------|
| `--navy` | `#0A1330` | Top nav bar, dark sections, footer |
| `--magenta` | `#E6147D` | Primary CTAs, links, eyebrow labels, accent bars, chat button |
| `--magenta-hover` | `#C4106A` | Button/link hover |
| `--ink` | `#15161A` | Headings, near-black body |
| `--body` | `#4A4A4A` | Paragraph / secondary text (warm gray) |
| `--cream` | `#F2EEE6` | Alternating section background |
| `--white` | `#FFFFFF` | Default background, cards |
| `--pink-tint` | `#FBE3F0` | Highlighted email/info box background |
| `--border` | `#E2E0DA` | Card borders, input borders |

**Rules of thumb**
- Magenta is the *only* accent — used sparingly for action and emphasis, never for large fills.
- Alternate section backgrounds between `--white` and `--cream` for rhythm.
- Dark navy is reserved for the global nav (and presumably footer).

---

## 3. Typography

A heavy geometric grotesque (think Aktiv Grotesk / Neue Haas Grotesk / Inter-Tight family). Display headings are **very bold, tight, and large**.

| Style | Size (desktop) | Weight | Color | Notes |
|-------|---------------|--------|-------|-------|
| Hero / Display H1 | 80–110px | 800 (Black) | `--ink` | Tight line-height (~0.95), ends with a period |
| Section H2 | 64–80px | 800 | `--ink` | "Cover that doesn't flinch…" |
| Card title H3 | 22–26px | 700 | `--ink` | |
| Eyebrow label | 14px | 700 | `--magenta` | UPPERCASE, letter-spacing ~0.12em |
| Body | 17–19px | 400 | `--body` | line-height ~1.5 |
| Nav link | 16px | 600 | white (on navy) | |
| Button label | 14–15px | 700 | white / ink | UPPERCASE, letter-spacing ~0.05em |

- Headings frequently end with a **period** as a stylistic device.
- Line-height for display type is tight (~0.95–1.0); body is relaxed (~1.5).

---

## 4. Layout & spacing

- **Max content width** ~1200–1280px, centered with generous side padding.
- **Generous vertical rhythm** — large section padding (~96–120px top/bottom).
- Section structure: small magenta eyebrow → huge headline → supporting paragraph → content grid.
- **Card grid:** 4 columns (products) / 3 columns (documents) on desktop; collapses on smaller screens.
- 8px spacing base; large gaps between cards (~24–32px).

---

## 5. Components

### Top navigation
- Full-width **navy bar**, white logo left.
- Left-grouped text links (About Us, For Brokers, Contact) with hover/active in magenta.
- Right side: email + phone in white caps, then two buttons:
  - **QuikQuoter** — outlined (white border, transparent fill, white text).
  - **GET A QUOTE** — solid magenta fill, white uppercase text.
- Dropdown menus open as white panels with dark links.

### Buttons
| Variant | Style |
|---------|-------|
| Primary | Solid `--magenta` bg, white uppercase text, ~4–6px radius, padding ~14px 28px |
| Secondary / outline | Transparent bg, 1px white (or ink) border, matching text |
| Hover | Darken to `--magenta-hover` |

### Eyebrow label
Small uppercase magenta text with letter-spacing, sits above every section heading.

### Content card (products / documents)
- White background, subtle 1px `--border`, small radius (~8px), light shadow on hover.
- **Short magenta top accent bar** (~32px wide, 4px tall) at the card's top-left.
- Title (H3) → description (body gray).
- Optional **"Learn more →"** magenta link at the bottom (arrow glyph included).
- Document cards add a small magenta **"PDF DOCUMENT"** eyebrow + file icon.

### Form (Contact)
- Inputs: white fill, 1px `--border`, ~4px radius, comfortable padding (~16px), gray placeholder text.
- Two-column for name/email, full-width for subject and message.
- Textarea resizable.
- **SEND** button = primary magenta.
- Supporting "respond within 48 hours" reassurance copy beside heading.

### Highlighted info box
Light pink (`--pink-tint`) rounded box with centered label + magenta bold email — used to surface the submissions address.

### Floating action — "Ask FTA"
- Fixed bottom-right **pill button**, solid magenta, white text + chat icon, fully rounded.
- This is the AI/chat entry point — relevant anchor for the underwriter MVP assistant.

---

## 6. Iconography & misc
- Minimal line icons (file/PDF, chat bubble, arrow `→`).
- Arrows used as affordance on links and CTAs.
- Shadows are soft and subtle; corners are slightly rounded (not pill except for the chat button).

---

## 7. Quick CSS variables

```css
:root {
  --navy: #0A1330;
  --magenta: #E6147D;
  --magenta-hover: #C4106A;
  --ink: #15161A;
  --body: #4A4A4A;
  --cream: #F2EEE6;
  --white: #FFFFFF;
  --pink-tint: #FBE3F0;
  --border: #E2E0DA;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-pill: 999px;

  --font-sans: "Inter Tight", "Aktiv Grotesk", "Helvetica Neue", Arial, sans-serif;
  --maxw: 1240px;
}
```

---

*Last updated: 2026-06-16 — distilled from FTA Insurance website screenshots for the underwriter MVP demo.*
