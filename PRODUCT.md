# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Bun workspaces with a catalog; TanStack Start on Cloudflare Workers; Tailwind 4 with the design values in
`packages/tokens`; shadcn primitives on Base UI. Effect 4 arrives with the API in phase 2. The conventions —
tsconfig, dprint, oxlint, the package taxonomy — follow `vantionlabs/effect-cloudflare-full-stack`; the design
layer's shape follows `vantionlabs/saas-starter`. Decided before this record was written, not delegated.

## Users

Independent and small-team **dropshipping operators** running one or more Shopify stores from a laptop, often
across timezones. They live inside the app for hours a day: orders, customer questions, supplier follow-up,
chargebacks, email. Time-pressed, technical enough but not engineers, switching sub-task every few minutes.

Three personas, confirmed unchanged:

- **Admin** — the store owner and operator. The primary surface and the person the landing page addresses.
- **Supplier** — an external fulfilment partner. Sees only what it needs.
- **Affiliate** — a referral partner. Sees only its own referrals and payouts.

## Product Purpose

Insyte is the operating system for dropshipping and branded e-commerce. It unifies orders, customer service
(tickets, chats, inbox), products, suppliers, chargebacks, automations and a marketplace of integrations into one
command centre, so the operator stops running the business out of a dozen browser tabs.

Success is an operator opening Insyte first thing in the morning and finding the day's three or four important
things surfaced clearly, with the rest tucked under panels they visit only when they need to.

## Positioning

To dropship operators what Shopify is to webshop builders: the default place they run the business from, rather
than another dashboard beside the others.

The mechanism a neighbouring product could not truthfully copy is **an agent that works within the operator's
rules**. The Insyte-agent does the work (it sets a status, assigns a ticket, writes the note, answers a
customer on the store chat, drafts the evidence pack) and the operator decides, once, per kind of action, how
far it may go: _Zelf doen_, _Eerst vragen_ or _Nooit_. Every action it takes is logged with what it read and
why, and anything reversible can be undone inside the undo window. What it may not do alone it brings as a
proposal, the plate the console already draws, which the operator files, edits or discards.

Insyte is also **agent-ready**: its records and actions are meant to be used by the operator's own AI tools,
through the public API and webhooks today and through an MCP server that is **coming, not built**. Copy says
"binnenkort" for MCP and never presents it as available.

## AI

_Reversal, 2026-11-01._ Until this date this record said "the AI proposes and the operator decides; nothing
leaves the building and no record changes without a person choosing it". The product owner reversed that on
2026-11-01: the assistant may act on its own within rules the operator sets, a customer-facing agent may answer
shoppers alone, and Insyte is marketed as an agent, agent-ready and built for agents, with MCP coming. Everything
below is the design; none
of it is built, and marketing must label the autonomy settings and the customer agent as planned.

- **Autonomy per action.** Each action the agent can take has a setting the operator controls: _Zelf doen_
  (the agent acts and logs it), _Eerst vragen_ (it brings a proposal; a person files it) or _Nooit_.
- **Safe defaults.** _Eerst vragen_ for anything that moves money or speaks for the business: a refund, a
  cancellation, an email to a customer or a supplier, a team-chat message. _Zelf doen_ is allowed by default
  only for internal bookkeeping: status, priority and deadline, assigning, adding a note, applying a label,
  creating a ticket, snoozing a conversation. Actions that cannot be undone at the other side (submitting evidence to Klarna,
  accepting a dispute) always ask, whatever the setting.
- **Limits.** A monthly AI spend limit for the workspace and per person, with a warning at 80%; the
  customer-facing agent works within opening hours the operator sets and hands over outside them.
- **Audit and undo.** Every agent action is a logged event: what it did, on which record, under which
  setting, what it read (its sources) and why. A reversible action carries an undo token for the server-side
  window that already exists ([ADR-0023](docs/adr/0023-undo-is-a-server-window-not-a-client-trick.md));
  a send waits out that window before it leaves.
- **The customer-facing agent** answers shoppers on the store chat on its own once the operator switches it on
  for that channel, within opening hours (email replies stay _Eerst vragen_), and, later, on other channels, from a
  knowledge base the operator writes and versions, hands the conversation to a person when it is unsure, when
  the customer asks, or outside opening hours, and never refunds or cancels on its own.
- **The proposal plate stays.** It is what _Eerst vragen_ looks like.
- **No mascot names.** It is "Insyte", "de
  Insyte-agent" and "Vraag Insyte" until a name is decided (see the open questions below).
- **Agent-ready.** The same permission model governs a person, an API key and, when it arrives, an MCP
  client: scoped like an API key, every call audited.

## Operating Context

- Shopify is the system of record the product connects to; an operator may run several stores.
- The market is Dutch-speaking. Interface and marketing copy are **Dutch**, with English planned as a second
  locale rather than shipped. Money is euros.
- The work is continuous and interruptive: dozens of rows read at a time, a sub-task every few minutes, and a
  working day that does not line up with a supplier's timezone.
- Chargebacks and customer trust are handled daily, with real money attached.

## Capabilities and Constraints

- **Availability: private beta, invite only.** There is no self-serve signup. Any surface that implies one is
  wrong.
- Shopify connects by OAuth; the product reads orders, customers, products and fulfilments.
- The three personas have genuinely separate visibility, not a role flag on one screen.
- Interface language is Dutch. English is a planned second locale; the content model is built for it, but no
  English copy ships in phase 1.
- Numbers an operator might compare or copy are exact and traceable to where they came from.
- **Undecided, and not to be invented:** whether the supplier and affiliate surfaces are part of the first public
  release; whether there is a native mobile app; what the public pricing is. Legacy marketing showed three tiers
  and a separate billing package treated Stripe as the source of truth for what is charged — the two disagreed,
  so neither is a fact yet.
- **Open, not to be settled by copying another app.** Only "the AI may act on its own" is answered. Still open:
  - **Agent names.** This record says no mascot; until a name is decided the copy says "Insyte" and "de Insyte-agent".
  - **Language.** Dutch only in phase 1; English (and Chinese for suppliers) are candidates.
  - **Currency.** Euros; GBP and USD at ECB rates are candidates.
  - **Mobile.** The native app stays undecided.
  - ~~Scope of Courses and Sheets.~~ _Decided 2026-11-02: build both._ Courses trains the
    team (and, if the operator allows, suppliers); Sheets is the operator's own calculations on Insyte's figures.
  - **Affiliates.** Suppliers first and affiliates later is likely; the affiliate surfaces stay designed but their
    release is open.

## Brand Commitments

- The product name is **Insyte**.
- **Royal Azure on neutral grey** is the identity palette, carried forward deliberately: a true-neutral
  grey-white canvas with one committed brand hue doing the interactive work. Binding.
- Voice is plain and confident: no exclamation points, no apologetic phrasing, no SaaS smile, no mascot. AI says
  "here is the draft", not "I think you might want to consider". Sentence case throughout.
- **Anti-references, carried forward and binding.** Stay out of these lanes: Stripe and Stripe-clones (the
  previous direction, which made Insyte read as "Stripe dashboard, but worse"); the generic SaaS template
  (Tailwind UI and shadcn defaults, identical rounded card grids, the big-number hero, KPI tiles in rows of
  three — if a screen could be the cover image for a UI kit, it is wrong); crypto and fintech neon and
  decorative AI glow; Mailchimp warmth and enterprise-B2B grey, which are opposite failures and both banned.
  Density is allowed; ugliness is not.
- Two marks currently exist in the legacy codebase and disagree with each other — a "Drift" mark of three offset
  rounded squares in the favicon, and a four-point star in the app shell. **Which one is the mark is an open
  decision**, not a thing to settle by picking whichever file is nearer.

## Evidence on Hand

**There is none. Confirmed 2026-10-21.** No customers, no logos, no testimonials, no case studies, no press, no
published metrics.

This is recorded this plainly because the legacy marketing site did fabricate all three: a named testimonial with
a direct quote from an invented founder, a marquee of invented company names whose own source comment said it was
meant "to read as a real customer roster", and an unevidenced "8 hours saved per operator, every week". None of
it may reappear in any form.

**They are gone from the page.** The landing page was a one-to-one port of the legacy page (made on
2026-10-26) and shipped the invented testimonial, the invented logo roster and the unevidenced figure
as they were. The redesign of 2026-10-28 removed all three; what it shows instead is the mechanism,
drawn with the console's own parts on the demo workspace (labelled as the demo), and the real marks
of the services Insyte connects to.

What is legitimately available: the names and marks of services the product genuinely integrates with — Shopify,
Stripe, Meta, Resend — and whatever the product can be shown actually doing.

## Product Principles

1. **The agent works; the operator sets the rules.** Every action names the setting it ran under, shows what it
   read, and can be undone where the outside world allows. Where the rule is _Eerst vragen_, make the decision
   point obvious and its consequence clear. Withholding, handing over or escalating is a legitimate result and
   must read as one, never as a failure. (Until 2026-11-01 this said "the operator decides; the product
   proposes"; see AI above.)
2. **Calm by default.** Surface the day's few important things and stay out of the way for the rest. Noise is a
   product defect, not a density setting.
3. **Precision is the trust mechanism.** The operator handles money, customer trust and chargebacks all day; the
   tool should feel as exact as the work. Every figure traceable to where it came from.
4. **Density where it earns it, breath where it does not.** Tables and rails run tight because dozens of rows are
   being read. Hero surfaces breathe. The rhythm between the two is the personality; the same padding everywhere
   is monotony.
5. **Claim nothing we cannot show.** With no customers and no metrics, the only honest persuasion is the
   mechanism itself, demonstrated. This is a constraint on copy, not a temporary inconvenience to route around.

## Accessibility & Inclusion

- Target **WCAG 2.1 AA**: body text at 4.5:1 or better against its background, large text and UI at 3:1 or
  better, and a focus ring visible on every interactive element.
- Keyboard-first. Every action reachable without a mouse; a command palette as a first-class entry point.
- Reduced motion respected. No animation that carries meaning relies on motion alone.
- Colour is never the only signal: a status pairs its colour with a word, a trend pairs direction with a sign.
- Currency and dates through `Intl`, so a locale change stays clean.
