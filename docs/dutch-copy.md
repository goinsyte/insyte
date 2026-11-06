# Dutch copy: the console in Dutch

The console ships in Dutch only (PRODUCT.md: the market is Dutch-speaking; English is a later
locale). This is the shared standard every string follows, so the platform reads as one voice.

## Scope

- Translate every **user-visible** string: labels, headings, buttons, placeholders, empty states,
  toasts, tooltips, `aria-label`, `title`, `alt`, dialog copy, error messages, menu items, table
  headers, filter/facet labels, sentences Insyte writes (`lib/analytics`, `lib/ask`), and mock-data
  text a user reads (ticket titles and bodies, email subjects and bodies, chat messages,
  notifications, timeline events, automation names and descriptions, reasons).
- **Do not translate:** code identifiers, object keys, enum values, ids, route paths, search-param
  values, CSS classes, test ids, comments (leave code comments in English), brand and product names
  (Insyte, Shopify, Stripe, Klarna, Gmail, Outlook, Klaviyo, Meta, product titles such as "Aurora
  Hooded Fleece"), people's names, company names, email addresses, order numbers.
- **Out of scope for this console pass:** `packages/ui/src/marketing/`, `apps/marketing` and the
  generated token kit (`/brand/tokens`). The brand book (`packages/ui/src/brand/book/`, `/brand`) was
  rebuilt on 1 November 2026 and is written in Dutch to this standard; new copy there follows it.
- **Where the console lives:** its screens and parts are `packages/ui/src/app/`, its demo data
  `apps/design/src/app/fixtures/` ([ADR-0026](./adr/0026-the-reference-is-one-worker-and-the-screens-live-in-ui.md)).
  Paths below written as `lib/…`, `components/…` or `stores/…` are relative to the old
  `apps/console/src` and map to `packages/ui/src/app/…` (`components/<area>` to `app/<area>`).
- Where a string is compared in code (e.g. `if (status === "Delayed")`) translate only the shown
  label, not the compared value. If a display label and a logic key are the same string, split them.

## Voice

- Informal **je/jij**, never u. Plain and confident: "Hier is het concept", not "Ik denk dat je
  misschien zou kunnen overwegen". No exclamation marks, no apologies, no SaaS cheer.
- **Sentence case** (only the first word capitalised): "Nieuwe bestelling", not "Nieuwe Bestelling".
- Buttons are imperatives that name the action: "Opslaan", "Ticket openen", "Advertenties pauzeren".
- Keep it as short as the English or shorter. Dutch compounds are written as one word
  ("bestelnummer", "leverdatum").
- Keep placeholders/interpolations intact: `${n} bestellingen`, and get plurals right
  (`n === 1 ? "bestelling" : "bestellingen"`).

## Numbers, dates, money

- Format with `nl-NL`: replace `"en-US"` / `"en-GB"` locales in `Intl.*` and `toLocaleString` with
  `"nl-NL"` (so 1.594 and 7,6%). Currency stays whatever the data says (USD stays USD; `nl-NL`
  renders it `US$ 1.234` — that is correct). Dates: "26 mei", weekdays "maandag", months lower case
  in running text ("mei", "april") but capitalised at the start of a label.
- Hand-written number formats such as `` `${x.toFixed(1)}%` `` become `nl-NL` decimals where they
  are shown to a user (use a helper like `x.toLocaleString("nl-NL", { maximumFractionDigits: 1 })`).
- Relative time: "zojuist", "5 min geleden", "gisteren", "2 dagen geleden".

## Glossary (use these, every time)

| English                                                       | Dutch                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Dashboard / Home                                              | Dashboard / Start                                                         |
| Order(s)                                                      | Bestelling(en)                                                            |
| Customer(s)                                                   | Klant(en)                                                                 |
| Product(s)                                                    | Product(en)                                                               |
| Supplier(s)                                                   | Leverancier(s)                                                            |
| Store                                                         | Winkel                                                                    |
| Inbox                                                         | Inbox                                                                     |
| Ticket(s)                                                     | Ticket(s)                                                                 |
| Chat(s) / Channel / Direct message                            | Chat(s) / Kanaal / Privébericht                                           |
| Chargeback(s)                                                 | Chargeback(s)                                                             |
| Dispute(s)                                                    | Geschil(len)                                                              |
| Evidence pack                                                 | Bewijspakket                                                              |
| Analytics                                                     | Analyse                                                                   |
| Automation(s)                                                 | Automatisering(en)                                                        |
| Template(s)                                                   | Sjabloon / Sjablonen                                                      |
| Marketplace                                                   | Marketplace                                                               |
| Integration(s)                                                | Koppeling(en)                                                             |
| Settings                                                      | Instellingen                                                              |
| Data                                                          | Data                                                                      |
| Billing / Plan                                                | Facturatie / Abonnement                                                   |
| Team / Teammate / Member                                      | Team / Collega / Teamlid                                                  |
| Workspace                                                     | Werkruimte                                                                |
| API key                                                       | API-sleutel                                                               |
| Ask Insyte                                                    | Vraag Insyte                                                              |
| Proposal / File (a proposal) / Discard                        | Voorstel / Uitvoeren / Negeren                                            |
| Draft (noun) / Draft (verb)                                   | Concept / Opstellen                                                       |
| Refund / Refunded                                             | Terugbetaling / Terugbetaald                                              |
| Return                                                        | Retour                                                                    |
| Placed / Paid / At supplier / Shipped / Delivered / Cancelled | Geplaatst / Betaald / Bij leverancier / Verzonden / Bezorgd / Geannuleerd |
| Delayed / Late / On time                                      | Vertraagd / Te laat / Op tijd                                             |
| In transit / Tracking                                         | Onderweg / Track & trace                                                  |
| Fulfilment                                                    | Afhandeling                                                               |
| Stock / Low stock / Out of stock                              | Voorraad / Lage voorraad / Uitverkocht                                    |
| Margin                                                        | Marge                                                                     |
| Tag / Add tag                                                 | Label / Label toevoegen                                                   |
| Merge                                                         | Samenvoegen                                                               |
| Duplicate (record)                                            | Dubbele (profielen)                                                       |
| Assign / Assigned to me / Unassigned                          | Toewijzen / Aan mij toegewezen / Niet toegewezen                          |
| Snooze / Snoozed                                              | Uitstellen / Uitgesteld                                                   |
| Archive / Archived                                            | Archiveren / Gearchiveerd                                                 |
| Trash / Spam                                                  | Prullenbak / Spam                                                         |
| Done / Open / In progress / Intake / Awaiting reply           | Klaar / Open / Bezig / Nieuw / Wacht op antwoord                          |
| Priority High / Medium / Low                                  | Prioriteit hoog / gemiddeld / laag                                        |
| Mention                                                       | Vermelden                                                                 |
| Comment                                                       | Reactie                                                                   |
| Reply / Forward / Compose                                     | Beantwoorden / Doorsturen / Nieuwe e-mail                                 |
| Mailbox                                                       | Mailbox                                                                   |
| Connected / Disconnected / Reconnect / Synced                 | Gekoppeld / Ontkoppeld / Opnieuw koppelen / Gesynchroniseerd              |
| Save / Cancel / Delete / Remove / Edit / Close                | Opslaan / Annuleren / Verwijderen / Verwijderen / Bewerken / Sluiten      |
| Undo                                                          | Ongedaan maken                                                            |
| Search / Filter / Sort / Columns / Views                      | Zoeken / Filter / Sorteren / Kolommen / Weergaven                         |
| Select all / Clear                                            | Alles selecteren / Wissen                                                 |
| Bulk actions / Actions                                        | Acties                                                                    |
| New …                                                         | Nieuw(e) …                                                                |
| Revenue / Average order                                       | Omzet / Gemiddelde bestelling                                             |
| Run / Runs / History                                          | Uitvoeren / Uitvoeringen / Geschiedenis                                   |
| Trigger / Step / Condition                                    | Trigger / Stap / Voorwaarde                                               |
| Forecast / Estimate                                           | Prognose / Schatting                                                      |
| Finding(s)                                                    | Bevinding(en)                                                             |
| Log in / Log out / Sign up / Forgot password                  | Inloggen / Uitloggen / Registreren / Wachtwoord vergeten                  |
| Onboarding                                                    | Onboarding                                                                |
| Affiliate / Referral / Payout                                 | Affiliate / Doorverwijzing / Uitbetaling                                  |

Insyte's own sentences (findings, answers, drafts) follow the same voice: short declaratives that
state the number and what moved it, e.g. "De omzet steeg met 7,6% naar US$ 165.050."
