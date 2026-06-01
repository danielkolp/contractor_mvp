---
name: euroflo-design
description: Use this skill to generate well-branded interfaces and assets for Euroflo, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. Euroflo is a contractor-first SaaS — "a job that flows the way it should": request → estimate → approve → job → invoice → paid.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Where things are
- `README.md` — brand context, content + visual foundations, iconography, full file index. **Start here.**
- `colors_and_type.css` — all tokens (ocean palette, semantic roles, type scale, radii, shadows, gradients) + semantic type classes. Import this first in any artifact.
- `assets/euroflo-mark.svg` (and `.png`) — the wave logo. Pair with the "Euroflo" wordmark in **Reem Kufi Fun**.
- `preview/` — small specimen cards for every foundation and component.
- `ui_kits/dashboard/` — contractor app (Today queue, estimates, invoices, clients, job requests).
- `ui_kits/marketing/` — landing page.
- `ui_kits/client-portal/` — client request form → success → tracking portal.

## Quick rules (the essentials)
- **Palette:** ocean blue `#024D8B` is primary; navy `#033258`/`#002453` for dark surfaces & display type; sky `#2CA7FF` + cyan `#41CDE9` for highlights/flow; **orange `#FF6A00` is the single action accent** (one CTA, money-positive moments — never a background wash). Cool-leaning neutrals. Semantic: paid=green, due=amber, overdue=deep-orange, waiting=sky.
- **Type:** Reem Kufi Fun (display/brand), Geist (UI/body), Caveat (rare handwritten flourish), Geist Mono (figures). All Google Fonts. Tabular figures for money/counts.
- **Voice:** calm, plain-spoken tradesperson. Sentence case. Address the user as "you". Reassure about control ("Nothing sent without your approval"). No emoji. Numbers only when they mean money or a real count.
- **Shape:** cards = 14px radius, white, hairline border, soft **navy-tinted** shadow; buttons = 10px; pills = full. Status/queue cards carry a 3px colored left-border strip.
- **Icons:** Lucide, 2px stroke. Link from CDN, same names as the kits.
- **Signature motif:** the five-step flow (request → estimate → approved → job → paid) — use it to express the "everything in order, nothing falls through the cracks" promise.
- **Motion:** ease-out `cubic-bezier(.16,1,.3,1)`; subtle fades/slides; respect reduced-motion. Never gate content visibility on an opacity entrance animation (use transform-only) so nothing is left invisible.

## Font substitution note
Reem Kufi Fun, Geist, Geist Mono, and Caveat are all loaded from Google Fonts. If the original Euroflo brand uses a licensed wordmark face, swap `--font-display` and re-check the logo lockup.
