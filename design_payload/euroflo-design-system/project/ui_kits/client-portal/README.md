# Euroflo — Client Portal & Request Flow UI kit

The client-facing side of Euroflo: what a contractor's customer sees. Built from the **Client-Perspective flow chart** in the source Figma and the `client/jobs/new` + `client/portal` routes in [`danielkolp/contractor_mvp`](https://github.com/danielkolp/contractor_mvp).

## Run
Open `index.html`. React + Babel + Lucide from CDN; tokens from `../../colors_and_type.css`. It's a single interactive flow — click through it end to end.

## The client flow (matches the product)
1. **Request form** — *"Tell us about your project."* The client lands here from the contractor's shareable link (no account needed). Fields: name, email, phone (optional), **job address**, project type (chips), **rough budget**, description, photos. Submit is disabled until the required fields are filled.
2. **Success** — *"Your request has been submitted to {contractor}."* Recap of what they sent + a "Track my request" CTA (mirrors the magic-link email step in the flow chart).
3. **Portal** — the tracking view. A **flow status bar** (Request → Estimate → Approved → Job → Paid) shows where the job stands, then:
   - **Estimate** card with line items + total → **Approve estimate** (advances the flow) or **Ask a question**.
   - **Invoice** card appears once approved → **Pay invoice** → marked paid.

This is the client half of the two-sided loop; the contractor half (new-request notification → write & send estimate → accepted → invoice → paid) lives in the **dashboard** kit's *Job Requests*, *Estimates*, and *Invoices* screens.

## Files
| File | Role |
|---|---|
| `index.html` | The whole flow: `RequestForm`, `Success`, `Portal`, `FlowBar`, `Icon`, `Toasts`, `App`. |
| `portal.css` | All styles (header, form, chips, cards, flow bar, toasts). |

## Notes
- Reassuring, plain copy throughout; "No account needed", "Powered by Euroflo" footer attribution under the contractor's own name.
- The flow status bar reuses the signature five-step motif so the client sees the same "everything in order" promise the brand makes.
- Currency is CAD with `en-CA` formatting and a 12% GST/PST line, matching the product defaults.
