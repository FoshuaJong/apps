# Apps — apps.fong.nz

## Project Context
Interactive tools and experiments, hosted separately from the portfolio (joshua.fong.nz).
Each app is self-contained — its own page with inline styles for app-specific UI.
Feel free to suggest new app ideas that fit the aesthetic.

## Relationship to Portfolio
- Portfolio repo: `C:\Users\Joshua\Desktop\portfolio` (joshua.fong.nz)
- This repo shares design tokens (`variables.css`, `base.css`) copied from the portfolio — they are independent copies, not linked
- Portfolio nav links to apps via full external URLs (`https://apps.fong.nz/weeks/`)
- If design tokens change in the portfolio, manually sync `css/variables.css` and `css/base.css` here

## Stack
- Vanilla HTML + CSS + JS. No frameworks, no build tools, no Tailwind.
- Static site hosted on GitHub Pages with Cloudflare DNS/CDN.
- Shared styles live in `/css/`. App-specific styles go inline in that app's `<style>` tag.

## Site Structure
- `/index.html` — landing page listing all apps
- `/css/variables.css` — CSS custom properties (colors, fonts) — synced from portfolio
- `/css/base.css` — reset, body styles, global defaults — synced from portfolio
- `/css/apps.css` — shared components: nav, buttons, section labels, footer, animations
- `/images/favicon.svg` — shared favicon
- `/weeks/index.html` — "Life in weeks" visualization app (see `/weeks/CLAUDE.md`)
- `/nothing/index.html` — Fleeing/seeking text experiment (see `/nothing/CLAUDE.md`)

## Adding a New App
1. Create `/appname/index.html`
2. Link the three shared CSS files: `../css/variables.css`, `../css/base.css`, `../css/apps.css`
3. Use the apps nav pattern (see Nav & Footer below)
4. All app-specific styles go in the page's `<style>` tag
5. Add an `.app-card` entry to the landing page (`/index.html`)
6. Optionally add a nav link in the portfolio repo's subpage nav

## Design Constraints (non-negotiable)
- Dark theme only. No light mode, no toggle.
- Zero border-radius everywhere. Sharp corners on all elements. Only exception: `border-radius: 50%` for circular indicators.
- No shadows except primary button hover: `box-shadow: 0 8px 30px var(--accent-border-hover)`.
- Three fonts only: DM Serif Display (headings), Outfit (body/UI), JetBrains Mono (labels/code/tags). Never add a fourth.
- Teal accent (#3DA899) used sparingly — labels, numbers, hover states, tag text. Never fill large areas.
- No external CSS libraries. Every style is hand-written using CSS custom properties.

## Aesthetic Direction
Editorial/refined minimalism. Dieter Rams-inspired — function first, then elegance.
Apps should feel like tools that make the user pause and think, not flashy demos.
Monochrome palette with a single sharp accent color. Strong typography. Sentence case throughout.

## Style Rules
- Read `/css/variables.css` before writing any CSS.
- Read `/css/apps.css` before creating any new component — it already has nav, buttons, section labels, footer, and animations.
- App-specific styles stay in that app's `<style>` tag.
- When editing a shared component's styles, update `/css/apps.css` — never override in app-level styles unless it's genuinely app-specific.

## Typography Quick Reference
- Headings (h1-h3): `var(--font-display)`, weight 400 only
- Body text: `var(--font-body)`, weight 300 (light)
- Labels/eyebrows/tags: `var(--font-mono)`, uppercase, accent-colored, letter-spacing 0.15-0.2em
- Section labels always use class `.section-label`

## Color Roles
- Backgrounds: `--bg` (page), `--bg-elevated` (nav/overlays), `--bg-card` (cards)
- Text: `--text-primary` (headings), `--text-secondary` (body), `--text-muted` (labels/captions)
- Borders: `var(--border)` at rest, `var(--accent-border-hover)` on hover
- Tinted surfaces (tag backgrounds, subtle fills): `var(--accent-surface)`
- Spotlight/ambient glows: `var(--accent-glow)`
- **Never hardcode a color value or rgba() — always use a CSS variable from `variables.css`**

## Nav & Footer
- Nav mark: `JF / apps` — "JF" links to `https://joshua.fong.nz`
- Nav links: Portfolio (external, to joshua.fong.nz) | separator | Apps (/) | [Current App Name] (with `aria-current="page"`)
- Landing page: Portfolio | Apps (active)
- App pages: Portfolio | Apps | AppName (active)
- Footer: `© 2026 Joshua Fong` left, `joshua.fong.nz` right (linked to portfolio)
- Nav and footer HTML are duplicated across pages. If structure changes, update ALL pages.
- Active indicator: 2px accent underline via `::after` on `[aria-current="page"]`.
- Mobile hamburger nav at 640px breakpoint.

## Responsive Breakpoints
- 900px: grids collapse from 2-3 col to 1-2 col, mobile nav not yet active
- 640px: full mobile layout, hamburger nav, single column everything

