# Euroflo — Marketing Site UI kit

The public landing page. Recreated from the `landing-page.tsx` in [`danielkolp/contractor_mvp`](https://github.com/danielkolp/contractor_mvp) — same section structure, copy patterns, and motion intent, rebranded to Euroflo (wave logo, Reem Kufi display, ocean palette) and built as plain HTML/CSS so it's easy to lift.

## Run
Open `index.html`. Lucide loads from CDN; tokens from `../../colors_and_type.css`.

## Sections
1. **Sticky nav** — translucent blur bar, logo, links, accent CTA.
2. **Hero** — Reem Kufi headline with the ocean→cyan gradient on *"a job that flows"*, lede, two CTAs, trust points, and a live-looking **recovery queue preview** card with ranked rows + a drafted-message bar. Ambient dot grid + cyan glow.
3. **Flow band** (signature) — the request → estimate → approved → job done → paid stepper on the deep flow gradient. *"Every step in order. Nothing falls through the cracks."*
4. **Problem** — three cards (quiet quotes, unpaid invoices, past customers) with metrics and hover lift.
5. **How it works** — four numbered steps, "you stay in control" framing.
6. **Dark product section** — the one dramatic dark moment; dot grid + glow behind a dark recovery-queue preview.
7. **Pricing** — early-access $49/mo card with floating status minis.
8. **FAQ** — click-to-expand accordion (real interaction).
9. **Final CTA + footer** — links across to the dashboard and client portal kits.

## Files
| File | Role |
|---|---|
| `index.html` | The full page + inline JS (FAQ accordion, scroll-reveal via IntersectionObserver). |
| `marketing.css` | All section styles. |

## Notes
- Copy voice matches the product: plain, benefit-first, reassuring ("Nothing sent without your approval"), sentence case, no emoji.
- Scroll-reveal degrades safely: a `.no-js` guard shows everything if JS is off; the observer only hides-then-reveals when JS runs.
- The hero and dark previews intentionally mirror the dashboard kit's real queue so marketing and product feel like one product.
