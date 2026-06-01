# Euroflo — Contractor Dashboard UI kit

The core product: a sidebar workspace where a trades owner runs the whole job lifecycle and recovers money that slipped through the cracks. Recreated from [`danielkolp/contractor_mvp`](https://github.com/danielkolp/contractor_mvp) (Next.js + shadcn/ui), recolored to the Euroflo ocean palette.

## Run
Open `index.html`. React + Babel are loaded from CDN; Lucide provides icons; tokens come from `../../colors_and_type.css`.

## Screens (interactive)
- **Today** — the ranked action queue. Hero summary (count + amount at risk), then sections: *Needs action now*, *Message ready*, *Waiting for reply*. Click **Generate / Review follow-up** to open the draft drawer, edit the AI-written message, and **Approve & send** (card moves to *Waiting*, toast confirms). **Mark paid / They said yes** clears items.
- **Invoices** — stat tiles (outstanding / overdue / paid) + filterable table with status pills.
- **Estimates** — quote tracker with status (due, no reply, accepted, draft).
- **Clients** — customer list with reliability badges and outstanding balances.
- **Job Requests** — incoming leads from the request link, with Send-estimate / Archive actions and a "new" badge.
- **Recovery / Settings** — stubs pointing back to the live flows.

## Files
| File | Role |
|---|---|
| `index.html` | Mounts `<App>`, holds routing + the Recovery/Settings stubs. |
| `kit.css` | All component styles (shell, buttons, cards, queue cards, tables, drawer, toasts). |
| `data.js` | Fake seed data (`window.EF_DATA`). |
| `components.jsx` | Primitives: `Icon` (Lucide bridge), `Btn`, `money`, `toast`, `Toasts`. Exported to `window`. |
| `screens.jsx` | `Sidebar`, `TopBar`, `TodayScreen`, `InvoicesScreen`, `EstimatesScreen`, `ClientsScreen`, `JobRequestsScreen`, the follow-up `FollowUpDrawer`. Exported to `window`. |

## Notes
- The signature reassurance — *"Every follow-up is drafted for your review. Nothing sends without your approval."* — is pinned in the sidebar, matching the product's load-bearing trust copy.
- Status colors are semantic (overdue=deep orange, due=amber, follow-up=green, waiting=sky, accepted=ocean). Money uses tabular figures + `en-CA` / CAD.
- Entrance animation is transform-only (never opacity) so content is never left hidden if the tab is backgrounded.
