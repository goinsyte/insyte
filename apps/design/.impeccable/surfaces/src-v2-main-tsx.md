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

**RISK.** A breadcrumb can read as decoration; it must always hold real, clickable records.
