# Euroflo — Design System

> **A job that flows the way it should.**
> Client submits the request → contractor sends the estimate → client approves → job gets done → invoice gets paid. Every step in order. Nothing falling through the cracks.

Euroflo is a **contractor-first SaaS** for trades businesses (renovation, plumbing, electrical, landscaping, general contracting). It gives a solo owner or small crew one calm place to run the whole job lifecycle — requests, estimates, approvals, invoices, and the polite follow-ups that recover money from quiet quotes and overdue invoices. **It is not a marketplace.** Contractors keep their own clients; clients submit requests to a specific contractor through a shareable link.

The brand identity is **flow / water**: the logo is a cresting wave, and the palette runs from deep ocean navy through sky blue to a cyan crest, with an energetic orange "current" accent reserved for the money-positive moments. The promise is *order* — work moving predictably downstream, nothing stranded.

---

## Products / surfaces represented

1. **Marketing site** — public landing page that explains the product (hero, problem framing, "how it works" steps, product preview, pricing, FAQ). Bold display type, motion-rich, light with one dramatic dark section.
2. **Contractor dashboard** (the core app) — sidebar workspace: **Today** (ranked action queue), **Estimates**, **Invoices**, **Clients**, **Job Requests**, **Recovery** (follow-up queue), **Settings**.
3. **Client portal & request flow** — what a contractor's customer sees: the *"Tell us about your project"* request form, a submission success screen, and a portal to track estimates/invoices and approve work.

---

## Sources used to build this system

These were the inputs. **Do not assume the reader has access** — links are recorded so they can be explored further if available.

- **Figma file** — *"Logo and Client Flow.fig"* (attached, read-only). Contains the Euroflo wave logo, a Reem Kufi Fun wordmark specimen, and a full **Client-Perspective flow chart** (request → form fields → system processing → magic-link email → portal). The flow chart is the source of truth for the client journey.
- **GitHub — product codebase:** [`danielkolp/contractor_mvp`](https://github.com/danielkolp/contractor_mvp) — Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui + Supabase. This is the live product (internally codenamed "Revenue Recovery" / "EstiGator"); **all UI structure, components, copy, and interaction patterns in this system are lifted from it.** Explore this repo to build higher-fidelity Euroflo designs.
- **Uploads:** `uploads/logoflow.png` — the **Euroflo wave mark** (the brand logo, copied into `assets/`). `uploads/logo.svg` — the *developer's personal "d:" mark*, **not** an Euroflo asset (excluded).

> **Brand vs. codebase note.** The codebase ships a *forest-green* theme under the working name "EstiGator." Euroflo is the brand layer: the same product structure and components, **recolored to the ocean palette** and rebranded to the wave logo + Reem Kufi wordmark. When the green codebase and the Euroflo brand disagree, **the Euroflo ocean brand wins** — but always keep the codebase's *structure, copy voice, and interaction patterns*.

---

## CONTENT FUNDAMENTALS

The voice is a **calm, plain-spoken tradesperson** — not a startup, not a bank, not a robot. It respects that the user is busy, on a job site, and skeptical of software. Copy is the product's biggest trust lever.

**Tone**
- **Plain English, short sentences.** "See who owes money, what needs a follow-up today, and the next practical step." No jargon, no "synergy," no accounting-speak.
- **Reassuring about control.** The single most-repeated promise: *the user is always in control.* "Nothing sent without your approval." "Every follow-up is drafted for your review. Nothing sends without your approval." This appears in the sidebar, login, and product views — it's load-bearing copy, not filler.
- **Confident, never hypey.** "It only needs to recover one missed payment to make the math obvious." Benefit-first, grounded in money.
- **Human, lightly warm.** Generated follow-up messages read like a real contractor texting: *"Hi Sam, quick follow-up on invoice INV-1048. Happy to resend if useful."* Friendly, brief, respectful — "a normal customer conversation, not accounting jargon."

**Person & address**
- Speak to the user as **"you"** ("when you're ready", "you approve every message"). The product refers to itself by name ("Euroflo shows which clients need a follow-up") or implicitly — rarely "we."
- The user's customers are **"clients"** or **"customers"** (used interchangeably, leaning "customer" in marketing, "client" in the app data model).

**Casing**
- **Sentence case everywhere** — headings, buttons, nav, card titles. ("Find missed follow-ups", "Add recovery", "Start with highest value".) Never Title Case buttons.
- **UPPERCASE + wide tracking** only for tiny eyebrow labels and section dividers ("NEEDS ACTION NOW", "MESSAGE READY").
- Money and document IDs are literal and tabular: `$4,850`, `INV-1048`, `EST-2211`. Default currency **CAD**, `en-CA` formatting.

**Vibe & examples**
- Marketing headline pattern: a problem → arrow → relief. *"Turn quiet quotes and unpaid invoices into clear next steps."*
- Status language is outcome-based and kind: "They said yes", "Followed up", "Not interested", "Mark paid", "You're all caught up for today."
- Microcopy carries small reassurances: "No credit card required.", "It takes ten seconds."
- **No emoji.** None in product or marketing. Warmth comes from word choice and the occasional handwritten-script flourish (Caveat), not emoji.
- Numbers are used **only when they mean money or a count of real work** (amount at risk, # of follow-ups due, days overdue). Avoid vanity stats.

---

## VISUAL FOUNDATIONS

The system is **clean, cool, and trustworthy** with bursts of energy. Think calm water with a bright crest. Built on a shadcn/ui foundation, recolored to ocean blues.

**Color**
- **Ocean blue (`--ef-ocean` #024D8B) is the primary** — buttons, links, active nav, brand fills. Deep navy (`--ef-navy` #033258 / `--ef-ink` #002453) anchors dark surfaces and display type.
- **Sky blue (#2CA7FF) and cyan (#41CDE9 / #45D6F0)** are the highlight/flow colors — focus rings, progress bars, "waiting" states, gradient crests.
- **Orange (`--ef-orange` #FF6A00) is the single action accent** — used sparingly for the most important CTA and money-positive moments. Never as a background wash.
- **Neutrals are cool-leaning** (zinc ramp), so whites read slightly blue. App canvas is a cool tint (#F2F7FB), cards are pure white.
- **Semantic colors carry product meaning:** paid/won = calm green (#15966B), due/review = amber (#F59E0B), overdue = deep orange (#F0590B), waiting = brand sky blue, destructive = red (#DC2A3A). Each pairs with a 50-tint background and a mid text color.
- **Imagery vibe:** cool, bright, optimistic — daylight and water, not gritty. (No stock photography ships in the codebase; if added, keep it cool and clean.)

**Type**
- **Reem Kufi Fun** (the wordmark face) for brand display + big headlines — rounded, geometric, friendly. **Geist** for all UI and body — modern, neutral, legible at small sizes. **Caveat** for an occasional handwritten flourish on a key phrase. **Geist Mono** for IDs/amounts when a monospace is wanted.
- Marketing leans **heavy weights (700)** and tight tracking for impact; product UI leans **500/600** and comfortable line-height (1.6 body).
- Always **tabular figures** for money and counts (`.ef-num`).

**Backgrounds & texture**
- Mostly **flat cool white / tint**. No heavy gradients in the product.
- Marketing uses **subtle ambient dot grids** (radial-dot pattern, ~32px, ~5% opacity, often masked with a radial fade) and **soft blurred radial glows** behind hero/CTA content.
- One signature **flow gradient** (`--grad-flow`, navy→ocean→sky→cyan) for brand moments and the dark product section; otherwise restrained.
- The dark marketing section uses a near-black canvas with a drifting dot grid and a blue glow — the one "dramatic" moment.

**Borders, radii, cards**
- **Radius scale** off a 10px base: buttons/inputs **lg (10px)**, **cards xl (14px)**, marketing feature cards **2xl (18px)**, badges **md (8px)**, status pills **full**.
- **Cards:** white surface, hairline border (`--ef-200`), soft cool shadow (`--shadow-sm`), generous `p-6` padding. Hover lifts shadow to `--shadow-md` (and marketing cards translate up ~3–5px).
- **Status/queue cards** use a **3px colored left-border strip** (overdue=orange, due=amber, follow-up=green, accepted=deep green) — a controlled, intentional accent (not the AI-slop "rounded card + colored left border" trope; here it's a functional status indicator on otherwise neutral cards).

**Shadows / elevation**
- Soft, **navy-tinted** shadows (never pure black). Five-step scale `xs→xl`. Focus uses a **sky-blue glow ring** (`--ring-glow`, 3px @ 30%).

**Animation**
- **Easing:** a custom ease `cubic-bezier(0.16, 1, 0.3, 1)` (smooth ease-out) for most entrances; spring-like `cubic-bezier(0.12, 0.8, 0.2, 1.1)` for emphatic moments (a headline phrase, the pricing card).
- **Patterns:** fade-slide-up on content reveal, scroll-linked "scatter → sorted" storytelling on the marketing queue, staggered children, magnetic buttons, gentle floating chips, one-time glow pulses. Durations ~0.45–0.85s.
- **Reduced-motion is fully respected** — all of the above collapse to instant/none.
- Product UI animation is restrained: a 1.5s skeleton shimmer, content fade-in, button press.

**Interaction states**
- **Hover:** primary buttons darken (`--ef-ocean` → ~90% / deeper); outline/ghost get a faint tint fill; cards raise shadow. Links underline.
- **Press/active:** buttons nudge **down 1px** (`translate-y-px`); marketing CTAs **scale to 0.95**.
- **Focus-visible:** sky-blue ring glow + border color shift. Always visible, never removed.
- **Disabled:** 50% opacity, pointer-events off.

**Layout rules**
- **Sidebar app shell:** fixed 256px (`w-64`) left sidebar with logo, nav, and a "You stay in control" reassurance card pinned at the bottom; sticky 64px top bar (theme toggle + account menu); content max-width with `p-4 → p-8` responsive padding.
- **Marketing:** centered `max-w-7xl` sections, generous vertical rhythm (`py-16 → py-20`), sticky translucent navbar with backdrop blur.
- **Transparency & blur:** used for sticky bars (`bg-white/85` + `backdrop-blur`) and glass-y overlays — sparingly, always over busy/scrolling content.

---

## ICONOGRAPHY

- **Icon set: [Lucide](https://lucide.dev)** — the codebase imports `lucide-react` throughout. Clean, **2px stroke, rounded line icons**, no fill. This is the canonical Euroflo icon language.
- **In this system:** Lucide is linked from CDN (`lucide@latest`) in the UI kits and rendered via `data-lucide` attributes / `lucide.createIcons()`. Same names as the codebase so designs stay 1:1.
- **Common icons (from the product):** `CalendarCheck2` (Today), `FileText` (Estimates), `Receipt` (Invoices), `UsersRound` (Clients), `ClipboardList` (Job Requests), `RotateCcw` (Recovery), `Settings`, `ShieldCheck` (the "in control" promise), `Send`, `Plus`, `Sparkles` (AI draft), `TrendingUp`, `ArrowRight`, `CheckCircle2`, `ChevronDown`, `Bell`, `HardHat`, `Wrench`.
- **Sizing:** 16px (`size-4`) inline in buttons/nav, 20px (`size-5`) for feature tiles, 14px (`size-3.5`) in dense status cards. Icons inherit text color or sit in a tinted rounded square (`bg-ef-mist text-ef-ocean`).
- **Logo / brand mark:** the **wave** (`assets/euroflo-mark.svg`, vector; `.png` raster fallback) — a navy rounded-square app tile with a white-to-cyan cresting wave. Use as-is on light or dark; it carries its own navy tile. Pair with the **"Euroflo" wordmark in Reem Kufi Fun**.
- **No emoji. No unicode-character icons.** Status is shown with Lucide glyphs + colored dots/pills, never emoji.

---

## INDEX — what's in this folder

| Path | What it is |
|---|---|
| `README.md` | This file — brand context, sources, content + visual foundations, iconography. |
| `colors_and_type.css` | All foundation tokens: ocean palette, semantic roles, type scale, radii, shadows, gradients, semantic type classes. **Import this first.** |
| `SKILL.md` | Agent Skill manifest — makes this system usable as a downloadable Claude skill. |
| `assets/` | Brand assets — `euroflo-mark.svg` (primary wave logo, vector) and `euroflo-mark.png` (raster fallback). |
| `preview/` | Small HTML specimen cards that populate the Design System tab (colors, type, components, etc.). |
| `ui_kits/dashboard/` | **Contractor dashboard** UI kit — interactive recreation of the Today queue, estimates, invoices, clients, with the full app shell. |
| `ui_kits/marketing/` | **Marketing site** UI kit — hero, problem cards, how-it-works, product preview, pricing, FAQ. |
| `ui_kits/client-portal/` | **Client portal & request flow** UI kit — the "Tell us about your project" form, success screen, and tracking portal. |

**Getting started:** import `colors_and_type.css`, link Lucide from CDN, and reuse the JSX components in `ui_kits/*`. Read each kit's own `README.md` for its component list.
