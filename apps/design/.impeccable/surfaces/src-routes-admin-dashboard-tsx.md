---
version: 1
slug: "src-routes-admin-dashboard-tsx"
primary_target: "src/routes/_admin/dashboard.tsx"
related_targets: ["src/components/app-shell","src/styles/app.css"]
---

## Scope

The operator console: the shell (rail, area panel, top bar), the token layer, and the ten screens an
operator lives in — dashboard, orders, tickets, inbox, chats, customers, products, chargebacks,
automations, analytics. Visitor mode: **Operate**. The remaining admin routes and the supplier and
affiliate surfaces inherit the finished system in a follow-up.

Audience: independent and small-team Dutch dropshipping operators on Shopify, hours a day, dozens of
rows at a time, a sub-task every few minutes, real money in the chargebacks. Job: find the day's few
important things and decide them. Interface copy is English in the shipped code although PRODUCT.md
records Dutch as the interface language — unresolved, and not this pass's call.

Constraints pinned by the owner: Insyte's own palette stays (`glacier` / `mist` / `paper`, `arc` at hue
270, `abyss` for the primary action); **no monospace anywhere**; no cards and no borders; both themes
ship as equals; the mark is Drift, three offset squares, and the pattern derives from it.

## Direction contract

**THESIS.** Insyte draws the change before it files the change: every proposal opens as a blueprint
plate — `abyss` ground, white line, dimensioned — showing the record as it stands beside the record as
drawn, and only a hand files it. It refuses the KPI-row-over-widget-masonry dashboard the console ships
today, which PRODUCT.md's own anti-reference list already names.

**OWN-WORLD.** Achromatic `glacier` / `mist` / `paper` surfaces; `arc` carries every interactive
moment and decorates nothing; `abyss` is the plate ground with `mesh-ink` line work and `powder`
secondary; `sky` and `powder` never sit behind text. Separation is a surface change — adjacent fields
meet and the meeting is the boundary, so no border, no ring, no card, no nested container. Fields are
filled, never outlined. Inter 400 is the voice at two sizes; Archivo at narrow width sets the
monumental figure and the plate numbers. Tabular numerals on the sans, sentence case throughout, no
monospace. A 32px drafting grid on plate grounds; the Drift mark's three offset squares tile as the
24px hatch that fills cells with nothing to say. A line is drawn only when it measures something.

**STORY.** The operator opens Insyte and reads one number: how many things need them before the day
ends. The queue beneath is dense and ranked by time left. Selecting a record floods its row and draws
its proposal as a plate — what the record is now, what it becomes, what that is worth. They file it,
redraw it, or discard it. Nothing changed until they did.

**FIRST VIEWPORT.** The composition locked at `.impeccable/mocks/decision/blauwdruk.html`. A 52px
`mist` rail with the Drift mark at its head, a 224px `mist` area panel, a 48px top bar carrying the
store switcher, search and the proposals count in `abyss`. The work splits: the queue on `paper` and a
436px plate on `abyss`. The queue head sets a 60px Archivo figure against one sentence of context,
filter tabs below it, then 34px rows alternating `paper` and `mist` — signal dot, record, store, value,
time left — and the selected row floods `abyss`. The plate carries its heading, one paragraph, then the
drawing: a dimension line across the top labelled with the time remaining, an "as the record stands"
block, a leader line down to an "as drawn" block outlined in chalk, a witness line out to the store,
and the title block at the foot where a real drawing puts it. The primary action sits at the plate's
foot, chalk on `abyss`.

**Signature interaction — de uitslag.** Selecting a record unrolls its plate: the `abyss` ground wipes
in from the right in 280ms on an exponential ease-out, the drafting grid fades up, and the white line
then draws itself from the dimension line down to the "as drawn" block in one 420ms stroke, as a mask
sweep rather than a fade. Filing slackens it — the line dims to chalk, the ground lightens toward
`glacier`, and the queue row loses its dot. **Motion grammar:** the duration ladder in
`packages/tokens` and nothing beside it — `quick` 160ms for a state change, `base` 240ms for the
unroll, `slow` 420ms for the stroke, `scan` 6s for the travelling rule — on one exponential ease-out,
entrance from an already-visible default, and one authored moment per screen. The raw 180 / 280 / 420
this line used to name was close to the tokens without being them, which is how a second ladder
starts.
The only ambient motion is on plate grounds: a single faint rule travelling down the 32px grid every
six seconds, like a drawing being scanned. It halts off-screen, and under `prefers-reduced-motion` the
plate paints already-drawn and the rule never runs.

**FORM.** De Blauwdruk — the cyanotype and the architect's blueprint. Ranked 1 of 7 on my own grounded
list and taken from the pick card over the roll's assignment, on the owner's choice. seed:3caf9d8c59a97cde

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Interface language: English in code, Dutch in PRODUCT.md. Not decided here.
- `console:diff`, `brand:diff` and `port:diff` stop being invariants once this pass edits the ported
  files; the port commits stay as the provenance record and an ADR has to say so.
- The landing page still carries the three fabricated evidence blocks PRODUCT.md records as the open
  item. Out of this pass's scope and still blocking that page being served.
