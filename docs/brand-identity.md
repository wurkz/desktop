# Wurkz Brand Identity Guide

> The single reference for anyone producing Wurkz material — ads, brochures, social media,
> website, product pages. Companions: [`positioning.md`](./positioning.md) (pitch language),
> [`brand-logo-brief.md`](./brand-logo-brief.md) (how the logo was designed).
> Locked 2026-07-10 by the owner.

---

## 1. Brand architecture

- **Alemhar** — the main brand (company). Planned; not yet designed.
- **Wurkz** — a product of Alemhar. This guide covers Wurkz only.
  - **Wurkz Shop** — the desktop app that runs the shop (offline-first).
  - **Wurkz Cloud** — the subscription owner's dashboard (watch the shop from anywhere).

When Alemhar materials exist, product pages present Wurkz as *"Wurkz, by Alemhar"* — Wurkz
keeps its own identity (this guide); Alemhar endorsement appears as a small credit line, never
mixed into the Wurkz lockup itself.

## 2. Name

- The product is **Wurkz** — pronounced *works*. The name IS the promise: it just works.
- Written exactly `Wurkz` — capital W, lowercase the rest. Never WURKZ (except set in the
  wordmark font where letterforms carry it), never Wurks, Workz, or Wurkz!.
- Products: **Wurkz Shop** and **Wurkz Cloud** on first mention; "the Shop app" / "the Cloud"
  after. "Owner's Dashboard" is a spoken description of Wurkz Cloud, never a printed title.

## 3. Logo

**The mark:** two bold checkmarks forming a subtle W ("the double-check"). Three meanings at
once: quality-checked ✓, "it works", and the Wurkz initial.

**Files** (masters in `docs/logo/`):
| Asset | File | Use |
|---|---|---|
| Mark, transparent | `wurkz-mark.png` | On light or dark surfaces, next to typed wordmark |
| App icon master | `desktop/appicon-1024.png` | Mark at 88% width on charcoal rounded square |
| Original generation | `wurkz_logo.png` | Archive — don't place directly |
| Favicons / touch icons | `cloud/` | Web surfaces |
| Store / launcher sets | `mobile/` | iOS + Android (incl. adaptive pair) |

**Rules:**
- Clear space around the mark ≥ the height of one check's stroke width.
- Minimum size: 16 px digital / 6 mm print. Below that, use the app-icon version (better contrast).
- On white/light: orange mark alone. On dark/charcoal: orange mark alone (it carries).
  On photos or busy backgrounds: use the app-icon (charcoal plate) version.
- **Never:** recolor the mark, outline it, add gradients or shadows, rotate it, separate the
  two checks, put a literal gear/wrench near it as decoration, or stretch it.

## 4. Color

| Role | Name | Hex | Notes |
|---|---|---|---|
| Primary | **Safety Orange** | `#F97316` | The mark; CTAs in marketing; energy |
| Ground | **Steel Charcoal** | `#1F2937` | Wordmark text, dark surfaces, app-icon plate |
| Paper | **Off-white** | `#F9FAFB` | Light backgrounds; wordmark on dark |
| Support | Slate mutes | `#64748B` | Secondary text in layouts |

- Orange is for the mark and *one* emphasis per layout (a CTA button, a key stat). If everything
  is orange, nothing is.
- Semantic colors in product UI (green good / red bad) are not brand colors — don't use red or
  green as decoration in marketing.
- The apps' UI accent is currently independent (indigo in Cloud); adopting orange as the product
  accent is an open decision — do not assume it in mockups of the actual product.

## 5. Typography

- **Wordmark font: Nunito Black (weight 900)** — locked. Rounded heavy sans matching the mark's
  personality. Open Font License; self-hosted in both apps (never a CDN dependency).
  - Use it ONLY for the literal brand words: "Wurkz", "Wurkz Shop", "Wurkz Cloud".
  - Wordmark color: Steel Charcoal on light, Off-white on dark. "Cloud"/"Shop" may take the
    surface's accent when the layout wants contrast (see cloud login).
- **Everything else** (headlines, body, captions in ads/brochures/web): Nunito (regular weights
  400/600/700) keeps the family consistent, or the platform's system font for product UI.
- Never set body copy in Black/900 — the wordmark weight stays special.

## 6. The lockup

Preferred: **mark left, "Wurkz" right** (or mark above, word below for centered/portrait
compositions — as on the app login). The word is always *typed text in Nunito Black*, never a
rasterized graphic, so it stays sharp and translatable across sizes.

Product lockups: `Wurkz Shop` / `Wurkz Cloud` — "Wurkz" and the product word in the same
weight; the product word may take the accent color.

## 7. Voice & message

(Full pitch language and the engineering→layman translation table live in `positioning.md` —
use it verbatim for copy.)

- **One-line story:** *"Wurkz Shop runs your shop. Wurkz Cloud lets you watch it — from anywhere."*
- **Tone:** plain, confident, concrete. Say what it does in the owner's words. No startup
  buzzwords, no "revolutionize", no exclamation marks doing the selling.
- **Load-bearing claims:** works even with no internet · your records never leave your shop ·
  only you see the money · you'll know — without being there.
- Audience is PH repair-shop owners: examples use pesos, jeepney-street reality, BIR compliance,
  Senior/PWD discounts. Taglish is fine in social copy when it sounds natural, not forced.

## 8. Applications quick-spec

| Surface | Spec |
|---|---|
| Social avatar | App icon (charcoal plate version) — never the bare mark on white at avatar size |
| Social post | Off-white or charcoal ground, one orange emphasis, Nunito headings |
| Brochure/flyer | Lead with the one-line story; feature bullets from positioning.md's benefit column |
| Website hero | Lockup + one-line story + a real product screenshot (not abstract illustration) |
| Product page under Alemhar | Wurkz identity as-is + "by Alemhar" credit line in the footer/eyebrow |
| Ads | One claim per ad (pick from load-bearing claims), CTA in Safety Orange |

## 9. Asset + spec inventory (for producers)

- Logo masters: `docs/logo/` (this repo)
- Colors: §4 hex values — no other oranges/charcoals
- Wordmark font file: `@fontsource/nunito` 900 (desktop repo) / `public/fonts/nunito-latin-900-normal.woff2` (cloud repo)
- Pitch copy: `docs/positioning.md`
- In-product behavior worth showing in ads: default Wurkz logo appears only until the shop sets
  its own — screenshots for marketing should use a demo shop with the Wurkz default visible.

## 10. Open items

- [ ] Alemhar main-brand identity (separate exercise; this guide is unaffected)
- [ ] DTI / IPOPHL name search on "Wurkz" before print
- [ ] Decide whether Safety Orange becomes the product-UI accent
- [ ] Vectorize the mark (SVG redraw from `wurkz-mark.png`) before large-format print
