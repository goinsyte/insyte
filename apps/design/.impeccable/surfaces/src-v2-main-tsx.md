---
version: 1
slug: "src-v2-main-tsx"
primary_target: "src/v2/main.tsx"
related_targets: ["src/v2"]
---

## Scope

`/v2`: a second version of the product demo, built from the product owner's own screens (2026-11-21):
the shell (icon rail, sub-panel, top bar with the werkdraad, store switcher), Home, the Magnus chat, an
agent's page and an Analyse board. Visitor mode: **Operate**. Demo data only. Runs beside `/app`, never
replaces it; it has its own token set (`src/v2/tokens.css`), not `@insyte/tokens`.

Audience and job as in PRODUCT.md. Pinned by the owner: navigation is icon bar + menu + main bar; the
main bar carries the werkdraad (context links for the thing you are working on). Pinned by the
developer: no AI-generated or ClickUp look; keep calm light surfaces, the dark rail, proportional numerals and
the gradient for the AI only. No monospace anywhere (developer, 2026-11-23).

seed: none (direction pinned by the brief: the owner's screens)

## Direction contract

**THESIS.** The platform thinks along: wherever you are, the werkdraad names what you are working on and
what it touches (supplier, colleague, order), and Magnus is one step away carrying that context. Refuses
the ClickUp shell of coloured icons, badges everywhere and identical card grids.

**OWN-WORLD.** White work surface, a warm-grey sub-panel, a near-black rail that joins the store switcher
into one dark L. Ink-dark primary buttons, hairline rules, 8–12px radii. Mona Sans for everything, figures
in proportional numerals (Mona Sans tabular figures look monospace; developer, 2026-11-23); no mono face. The only colour is meaning: one calm teal house accent (customer themes on top via data-accent; never blue, indigo or violet; developer, 2026-11-23) for focus and data highlight, signal
green/amber/red with words, and the multicolour gradient strictly for Magnus and agents.

**STORY.** Home shows the few things waiting on you and what the agents did; the chat answers with
numbers and a chart in the house style; an agent is a colleague with instructions, skills, triggers and
rules; a board is yours to arrange but cannot go off-style.

**FIRST VIEWPORT.** The shell itself: the dark L, the sub-panel for the section, the werkdraad centred in
the top bar.

**SIGNATURE.** The werkdraad: a breadcrumb of linked records that changes with the work and ends in
"Vraag Magnus" carrying that context.

**OUTSIDE THE DASHBOARD** (signing in, setting up, an invitation; developer, 2026-11-24). Default "in de schil":
the product's own shell, still empty. The werkdraad names the steps done (the workspace's name, the plan,
the store), the rail's areas light up as the workspace is set up, and Magnus asks the setup questions
(mark and name above the heading). An invitation shows the workspace's shell complete. Two alternatives stay
switchable in Varianten (`inlog-midden`, `inlog-gesplitst`) for the owner to compare. The shopper's return
portal and the supplier's quality check carry the store's face, not this frame.
Beside the task (developer, 2026-11-24, `fill`): default "voorbeeld", the morning being set up building
itself on the menu's warm grey (workspace name as typed, plan, store, orders streaming in, Magnus's first
finding, the night rules), with no demo label or hint anywhere (owner, 2026-11-24: "we dont do that"); alternatives "gesprek" (answered steps as a Magnus
conversation) and "vlak" (white sheet on warm grey, the step's mark and line). One progress line along the
bar; steps slide in the direction of travel (motion springs, cross-fade under reduced motion).

**RISK.** A breadcrumb can read as decoration; it must always hold real, clickable records.
