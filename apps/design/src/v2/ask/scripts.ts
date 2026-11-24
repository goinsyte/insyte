import { getDemo, myWork, openProposals } from "../demo.ts"
import { BLOCKS, PERIOD, WEEK_ORDERS } from "../fixtures/analytics.ts"
import { CHATS } from "../fixtures/assistant.ts"
import type { FollowUp, Proposal, Turn } from "../fixtures/assistant.ts"
import { SEED, stepType, template } from "../fixtures/automations.ts"
import { CASE_STATUS, casesOf, CHANNEL_LABEL, timeLeft, waitingOnEvidence } from "../fixtures/chargebacks.ts"
import type { Chargeback } from "../fixtures/chargebacks.ts"
import { COST_LINES, figuresOf, WEEK as COST_WEEK } from "../fixtures/costs.ts"
import { isOpen as isOpenOrder } from "../fixtures/customers.ts"
import { isOpen, openTicketsOf, waited, waitedMinutes, waitingLong } from "../fixtures/inbox.ts"
import type { Ticket } from "../fixtures/inbox.ts"
import { daysLeft, getProductState, returnRate, stockOf, weekOf } from "../fixtures/products.ts"
import {
  customer,
  customerOrders,
  CUSTOMERS,
  euro,
  order as findOrder,
  ORDER_STATUS,
  ORDERS,
  product,
  PRODUCTS,
  SUPPLIERS,
  VAT
} from "../fixtures/records.ts"
import type { Order } from "../fixtures/records.ts"
import {
  customerReturns,
  orderReturns,
  REASON_LABEL,
  returnsOf,
  STATUS as RETURN_STATUS,
  toReview
} from "../fixtures/returns.ts"
import { DEMO_NOW, TODAY } from "../fixtures/workspace.ts"
import { paths } from "../router.tsx"
import { getInbox, ticketsOf } from "../screens/inbox/store.ts"
import {
  caseRef,
  COMMANDS,
  customerRef,
  orderRef,
  productRef,
  refsIn,
  returnRef,
  supplierRef,
  ticketRef
} from "./catalogue.ts"
import type { Ref, RefKind } from "./catalogue.ts"

/*
 * What Magnus says, while the model is mocked.
 *
 * Every answer is read from the workspace at the moment the question is asked, so the figures in it
 * and the records it names are the ones on screen elsewhere: send the Klarna evidence from a proposal
 * and Magnus stops proposing it, pause an ad and he says it is paused. An answer is the whole turn:
 * the steps it worked through (and what each read), the sentences with records and figures as chips,
 * a chart or table where Analyse would draw one, the sources, at most one proposal and the next steps.
 *
 * Nothing here pretends to be a model. It is a decision tree over the question's words, a `/`
 * command and the records named with `@` (or in plain words), and it says plainly when it has
 * nothing to go on.
 */

type MagnusTurn = Extract<Turn, { from: "magnus" }>

/** An answer before it is stamped with a time. */
export type Reply = {
  readonly turn: Omit<MagnusTurn, "from" | "at">
  readonly proposal?: Proposal
}

/** What was asked: the words, the records named with `@`, and a `/` command if one was chosen. */
export type Question = {
  readonly text: string
  readonly refs?: ReadonlyArray<Ref>
  readonly command?: string
  /** What the conversation is about without saying so (the page it was opened from): used when nothing is named. */
  readonly about?: ReadonlyArray<Ref>
}

/* ── writing ───────────────────────────────────────────────────────────────────────────────────── */

const rec = (r: Ref) => `[[${r.label}|${r.href}|${r.kind}]]`
const fig = (value: string, what: string, href: string) => `{{${value}|${what}|${href}}}`
const count = (n: number) => n.toLocaleString("nl-NL")
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`
const pct = (share: number, digits = 1) =>
  `${(share * 100).toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
const list = (items: ReadonlyArray<string>) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} en ${items.at(-1) ?? ""}`
const ask = (label: string): FollowUp => ({ id: label, label, kind: "question" })
const firstName = (name: string) => name.split(" ")[0] ?? name

const DAY = 86_400_000
const NOW = DEMO_NOW.date.getTime()
const ME_FIRST = "Elena"

const norm = (s: string) => s.toLocaleLowerCase("nl-NL").normalize("NFD").replace(/\p{Diacritic}/gu, "")

const supplierOf = (o: Order) => product(o.lines[0]?.productId ?? "")?.supplierId ?? ""
const daysLate = (o: Order) => (o.promisedAt === undefined ? 0 : Math.floor((NOW - o.promisedAt.getTime()) / DAY))
const tickets = () => ticketsOf(getInbox(), false)
const delayed = () => ORDERS.filter((o) => o.status === "vertraagd")
/** A supplier ticket filed this visit (from here or the inbox), so Magnus does not propose it twice. */
const supplierTicket = (supplierId: string) =>
  tickets().find((t) => t.customerId === "" && t.also?.kind === "supplier" && t.also.id === supplierId && isOpen(t))

/** An order's status as a clause: "ligt bij de leverancier", "is verzonden". */
const STATUS_PHRASE: Readonly<Record<Order["status"], string>> = {
  betaald: "is betaald",
  "bij-leverancier": "ligt bij de leverancier",
  verzonden: "is verzonden",
  bezorgd: "is bezorgd",
  vertraagd: "is vertraagd",
  retour: "komt retour",
  terugbetaald: "is terugbetaald",
  geannuleerd: "is geannuleerd"
}

const ANALYSE = (board: string, label: string) => ({ label, href: paths.board(board) })

/* ── the answers ───────────────────────────────────────────────────────────────────────────────── */

function summary(): Reply {
  const demo = getDemo()
  const waiting = myWork(demo)
  const proposals = openProposals(demo)
  const cb = casesOf().find((c) => c.id === "CB-2291")
  const urgent = cb !== undefined && cb.status === "wacht-op-bewijs"
  const late = delayed()
  const kestrel = late.filter((o) => supplierOf(o) === "kestrel-goods")
  const long = waitingLong(tickets())
  const review = toReview()
  const lead = urgent
    ? `Het dringendst is ${rec(caseRef(cb.id))} van ${rec(customerRef(cb.customerId))}: ${
      CHANNEL_LABEL[cb.channel]
    } wil het bewijs ${timeLeft(cb.dueAt).replace("nog ", "binnen ")}, en het pakket van ${
      plural(cb.files.length, "document", "documenten")
    } staat klaar.`
    : "De Klarna-zaak is ingediend, dus de komende uren loopt er geen deadline af."
  return {
    turn: {
      steps: [
        { label: "Wachtrij van vandaag gelezen", read: `Start · ${count(waiting)} open` },
        { label: "Deadlines van open zaken nagekeken", read: `Chargebacks · ${count(waitingOnEvidence().length)}` },
        { label: "Vertraagde bestellingen per leverancier geteld", read: `Shopify · ${count(late.length)}` },
        { label: "Wachtende klanten in de inbox gezocht", read: `Inbox · ${count(openTicketsOf(tickets()).length)}` }
      ],
      paragraphs: [
        `${fig(count(waiting), "Open op Start", paths.home)} ${
          waiting === 1 ? "zaak wacht" : "zaken wachten"
        } vandaag op jou, waarvan ${fig(count(proposals), "Voorstellen die op je ja wachten", paths.approvals)} ${
          proposals === 1 ? "voorstel" : "voorstellen"
        } van je agents. ${lead}`,
        `Verder zijn er ${
          fig(count(late.length), "Bestellingen op Vertraagd", paths.orders)
        } vertraagde bestellingen, ${count(kestrel.length)} bij ${rec(supplierRef("kestrel-goods"))}. ${
          long.length === 0
            ? "Geen klant wacht langer dan vier uur op antwoord"
            : `${plural(long.length, "klant wacht", "klanten wachten")} langer dan vier uur op antwoord, het langst ${
              rec(customerRef(long[0]?.customerId ?? ""))
            }`
        }, en ${plural(review.length, "retour wacht", "retouren wachten")} op je oordeel.`
      ],
      sources: [
        { kind: "page", title: "Start", detail: `${count(waiting)} open zaken`, href: paths.home },
        ...(cb === undefined
          ? []
          : [{ kind: "chargeback" as const, title: cb.id, detail: timeLeft(cb.dueAt), href: paths.chargeback(cb.id) }]),
        {
          kind: "supplier",
          title: "Kestrel Goods",
          detail: `${count(kestrel.length)} vertraagd`,
          href: paths.supplier("kestrel-goods")
        },
        { kind: "page", title: "Inbox", detail: `${count(long.length)} wachten lang`, href: paths.inbox }
      ],
      followUps: [
        ask("Welke bestellingen dreigen te laat te komen?"),
        ask("Stel een antwoord op aan Luca Romano over zijn vertraagde levering"),
        ask("Welke tickets wachten het langst?")
      ]
    },
    ...(urgent ? { proposal: evidenceProposal(cb) } : {})
  }
}

function evidenceProposal(c: Chargeback): Proposal {
  return {
    title: `Bewijs voor ${c.id} indienen bij ${CHANNEL_LABEL[c.channel]}`,
    body: `${plural(c.files.length, "document", "documenten")} en het verweer dat de Chargeback-assistent schreef: ${
      c.files.map((f) => f.what.split(",")[0]?.toLocaleLowerCase("nl-NL") ?? f.name).slice(0, 3).join(", ")
    }.`,
    where: `${CHANNEL_LABEL[c.channel]} · ${c.id}`,
    rule: "Eerst vragen",
    read: [c.id, `Bestelling #${c.orderNumber}`, "Track & trace"],
    draft: c.statement,
    action: { kind: "submit-evidence", caseId: c.id }
  }
}

function supplierProposal(supplierId: string, orders: ReadonlyArray<Order>): Proposal | undefined {
  const s = SUPPLIERS.find((x) => x.id === supplierId)
  if (s === undefined || orders.length === 0 || supplierTicket(supplierId) !== undefined) return undefined
  const numbers = orders.map((o) => o.number)
  return {
    title: `Vraag ${s.name} om nieuwe overdrachtsdata`,
    body: `Eén bericht voor ${
      plural(numbers.length, "bestelling", "bestellingen")
    }, als ticket geopend zodat het antwoord in de inbox terechtkomt.`,
    where: `Inbox · ${s.email}`,
    rule: "Eerst vragen",
    read: numbers.slice(0, 3).map((n) => `#${n}`),
    draft: `Hallo ${s.name}, ${
      plural(numbers.length, "bestelling van ons is", "bestellingen van ons zijn")
    } over de beloofde overdrachtsdatum: ${
      numbers.map((n) => `#${n}`).join(", ")
    }. Kun je per bestelling laten weten wanneer hij de deur uitgaat? Dan laten we het de klanten weten. Groet, ${ME_FIRST}`,
    action: { kind: "supplier-ticket", supplierId, orders: numbers }
  }
}

function lateRow(o: Order) {
  return {
    order: `#${o.number}`,
    customer: customer(o.customerId)?.name ?? "",
    supplier: SUPPLIERS.find((s) => s.id === supplierOf(o))?.name ?? "",
    late: o.promisedAt === undefined ? "kwijt" : `${daysLate(o)} d`
  }
}

const LATE_COLUMNS = [
  { key: "order", label: "Bestelling" },
  { key: "customer", label: "Klant" },
  { key: "supplier", label: "Leverancier" },
  { key: "late", label: "Te laat" }
] as const

function delays(refs: ReadonlyArray<Ref>): Reply {
  const pinned = refs.find((r) => r.kind === "supplier")
  if (pinned !== undefined) return aboutSupplier(pinned.id)
  const late = delayed().toSorted((a, b) => daysLate(b) - daysLate(a))
  const by = new Map<string, Array<Order>>()
  for (const o of late) by.set(supplierOf(o), [...(by.get(supplierOf(o)) ?? []), o])
  const [worstId, worst] = [...by].toSorted((a, b) => b[1].length - a[1].length)[0] ?? ["", []]
  const s = SUPPLIERS.find((x) => x.id === worstId)
  const others = late.filter((o) => supplierOf(o) !== worstId).slice(0, 2)
  const filed = supplierTicket(worstId)
  if (late.length === 0 || s === undefined) {
    return {
      turn: {
        steps: [{
          label: "Bestellingen voorbij hun beloofde datum gezocht",
          read: `Shopify · ${count(ORDERS.length)}`
        }],
        paragraphs: ["Er is nu geen bestelling voorbij haar beloofde datum."],
        followUps: [ask("Hoe snel leveren de leveranciers?")]
      }
    }
  }
  const proposal = supplierProposal(worstId, worst)
  return {
    turn: {
      steps: [
        { label: "Bestellingen voorbij hun beloofde datum gezocht", read: `Shopify · ${count(ORDERS.length)}` },
        {
          label: "Elke bestelling aan haar leverancier gekoppeld",
          read: plural(by.size, "leverancier", "leveranciers")
        },
        { label: "Track & trace van de vertraagde pakketten gelezen", read: `${count(late.length)} pakketten` },
        { label: "Leveranciers gerangschikt op aantal" }
      ],
      paragraphs: [
        `${fig(plural(late.length, "bestelling", "bestellingen"), "Nu vertraagd", paths.orders)} ${
          late.length === 1 ? "is" : "zijn"
        } over de beloofde datum. ${rec(supplierRef(worstId))} heeft er **${count(worst.length)}** van, waaronder ${
          list(worst.slice(0, 3).map((o) => rec(orderRef(o.number))))
        }: de levertijd is nu ${
          fig(`${s.leadDays.toLocaleString("nl-NL")} dagen`, "Gem. levertijd, 16–22 nov", paths.board("leveranciers"))
        } tegen een belofte van ${s.promiseDays}.`,
        ...(others.length === 0 ? [] : [
          `${others.length === 1 ? "De andere is" : "De andere twee zijn"} ${
            list(others.map((o) =>
              `${rec(orderRef(o.number))} van ${rec(customerRef(o.customerId))}, ${
                o.promisedAt === undefined ? `kwijt bij ${o.carrier}` : `${daysLate(o)} dagen te laat bij ${o.carrier}`
              }`
            ))
          }.`
        ]),
        filed === undefined
          ? `Geen van de bestellingen van ${s.name} heeft al een nieuwe datum, dus de klanten weten nog van niets.`
          : `Je vroeg ${s.name} al om nieuwe data, op ${rec(ticketRef(filed.number))}; daar is nog geen antwoord op.`
      ],
      visual: {
        kind: "table",
        title: "Vertraagde bestellingen, langst te laat bovenaan",
        data: { columns: LATE_COLUMNS, rows: late.slice(0, 8).map(lateRow), focus: 0 }
      },
      sources: [
        { kind: "supplier", title: s.name, detail: `${count(worst.length)} vertraagd`, href: paths.supplier(worstId) },
        ...late.slice(0, 3).map((o) => ({
          kind: "order" as const,
          title: `#${o.number}`,
          detail: lateRow(o).late === "kwijt" ? "Pakket kwijt" : `${lateRow(o).late} te laat`,
          href: paths.order(o.number)
        }))
      ],
      followUps: [
        ask(`Stel een antwoord op aan ${customer(others[0]?.customerId ?? "luca-romano")?.name ?? "Luca Romano"}`),
        ask("Hoe snel leveren de leveranciers?"),
        ask("Maak een automatisering voor late leveringen")
      ]
    },
    ...(proposal === undefined ? {} : { proposal })
  }
}

function leadTimes(): Reply {
  return {
    turn: {
      steps: [{ label: "Track & trace van de week gelezen", read: "1.096 bezorgde pakketten" }, {
        label: "Per leverancier de levertijd berekend"
      }],
      paragraphs: [
        `${rec(supplierRef("allure-fulfillment"))} is het snelst met **3,8** dagen. ${
          rec(supplierRef("kestrel-goods"))
        } haalt de belofte van 5 dagen al drie weken niet: ${
          fig("6,1 dagen", "Gem. levertijd Kestrel, 16–22 nov", paths.board("leveranciers"))
        }, en de week ervoor 5,7. In België kwamen 19 van de 27 te late pakketten van Kestrel.`
      ],
      visual: {
        kind: "bar",
        title: BLOCKS.levertijd.title,
        data: BLOCKS.levertijd.data,
        board: ANALYSE("leveranciers", "Leveranciers")
      },
      sources: [{
        kind: "board",
        title: "Leveranciers",
        detail: BLOCKS.levertijd.source,
        href: paths.board("leveranciers")
      }],
      followUps: [ask("Welke bestellingen dreigen te laat te komen?"), ask("Wat moet ik weten over Kestrel Goods?")]
    }
  }
}

function ticketFor(customerId: string): Ticket | undefined {
  const open = tickets().filter((t) => t.customerId === customerId && isOpen(t) && t.status !== "wacht")
  return open.find((t) => t.order !== undefined) ?? open[0]
}

function reply(refs: ReadonlyArray<Ref>): Reply {
  const named = refs.find((r) => r.kind === "customer" || r.kind === "ticket" || r.kind === "order")
  const pinnedTicket = named?.kind === "ticket" ? tickets().find((t) => t.number === named.id) : undefined
  const customerId = named?.kind === "customer"
    ? named.id
    : pinnedTicket !== undefined
    ? pinnedTicket.customerId
    : named?.kind === "order"
    ? (findOrder(named.id)?.customerId ?? "luca-romano")
    : "luca-romano"
  const c = customer(customerId)
  if (c === undefined) return nothing("")
  const first = firstName(c.name)
  const t = pinnedTicket ?? ticketFor(customerId)
  const o = findOrder(t?.order ?? (named?.kind === "order" ? named.id : "")) ??
    (t === undefined ? customerOrders(customerId).find((x) => isOpenOrder(x)) : undefined)
  const late = o?.status === "vertraagd"
  const luca = customerId === "luca-romano"
  const body = t?.draft ?? (luca
    ? `Hoi Luca, sorry dat je bestelling er nog niet is. Ik heb het nagekeken: je pakket ligt sinds donderdag bij PostNL in het sorteercentrum in Nieuwegein en wordt morgen bezorgd. Omdat het later is dan we beloofden, krijg je 10% korting op je volgende bestelling; de code staat hieronder. Groet, ${ME_FIRST}`
    : o === undefined
    ? `Hoi ${first}, bedankt voor je bericht. Ik zoek het voor je uit en laat het je vandaag nog weten. Groet, ${ME_FIRST}`
    : `Hoi ${first}, bedankt voor je geduld. Je bestelling #${o.number} ${STATUS_PHRASE[o.status]}${
      late ? ` en is later dan we beloofden; ik heb de leverancier om een nieuwe datum gevraagd` : ""
    }. Ik laat het je weten zodra er iets verandert. Groet, ${ME_FIRST}`)
  const messages = t?.entries.filter((e) => e.kind === "customer").length ?? 0
  return {
    turn: {
      steps: [
        {
          label: `Berichten van ${first} gelezen`,
          read: t === undefined
            ? "Geen open ticket"
            : `Ticket #${t.number} · ${plural(messages, "bericht", "berichten")}`
        },
        ...(o === undefined
          ? []
          : [{ label: `Nagegaan waar #${o.number} is`, read: `${o.carrier} · ${ORDER_STATUS[o.status].label}` }]),
        { label: "Geschreven in de toon van de winkel", read: "Kennisbank · Northwind-toon" }
      ],
      paragraphs: [
        `${rec(customerRef(customerId))} ${
          t === undefined
            ? "heeft geen open vraag in de inbox"
            : `schreef ${messages === 1 ? "één keer" : `${count(messages)} keer`} op ${rec(ticketRef(t.number))}`
        }${
          o === undefined ? (t === undefined ? "." : `, over ‘${t.subject}’.`) : ` over ${rec(orderRef(o.number))}.`
        } ${
          luca
            ? "De bestelling is 4 dagen later dan beloofd; volgens PostNL ligt ze in het sorteercentrum en komt ze morgen. Je regel geeft na drie dagen vertraging excuses en 10% korting, dus die staat erin."
            : late
            ? `De bestelling is ${
              daysLate(o)
            } dagen later dan beloofd en heeft nog geen nieuwe datum, dus het antwoord belooft er ook geen.`
            : o === undefined
            ? ""
            : `De bestelling ${STATUS_PHRASE[o.status]}.`
        }`.trim(),
        "Hier is een antwoord. Het gaat pas weg als jij Uitvoeren kiest, en dan heb je nog 30 seconden om het terug te halen."
      ],
      sources: [
        {
          kind: "customer",
          title: c.name,
          detail: `${plural(c.ordersCount, "bestelling", "bestellingen")} sinds ${c.since}`,
          href: paths.customer(customerId)
        },
        ...(t === undefined
          ? []
          : [{
            kind: "ticket" as const,
            title: `Ticket #${t.number}`,
            detail: t.subject,
            href: paths.ticket(t.number)
          }]),
        ...(o === undefined
          ? []
          : [{
            kind: "order" as const,
            title: `#${o.number}`,
            detail: ORDER_STATUS[o.status].label,
            href: paths.order(o.number)
          }])
      ],
      followUps: [ask(`Wat moet ik weten over ${c.name}?`), ask("Welke tickets wachten het langst?")]
    },
    proposal: {
      title: `${first} beantwoorden`,
      body: "In de toon van de winkel, zonder een datum te beloven die de vervoerder niet gaf.",
      where: t === undefined ? `E-mail · ${c.email}` : `Inbox · ticket #${t.number}`,
      rule: "Eerst vragen",
      draft: body,
      sends: true,
      action: {
        kind: "send-reply",
        customerId,
        subject: o === undefined ? `Bericht aan ${c.name}` : `Over bestelling #${o.number}`,
        ...(t === undefined ? {} : { ticket: t.number })
      }
    }
  }
}

const CASE_COLUMNS = [
  { key: "case", label: "Zaak" },
  { key: "customer", label: "Klant" },
  { key: "amount", label: "Bedrag", format: "euro" as const },
  { key: "due", label: "Deadline" }
] as const

function chargebacks(refs: ReadonlyArray<Ref>): Reply {
  const pinned = refs.find((r) => r.kind === "chargeback")
  if (pinned !== undefined) return aboutCase(pinned.id)
  const open = waitingOnEvidence().toSorted((a, b) => a.dueAt - b.dueAt)
  const atStake = open.reduce((n, c) => n + c.amount, 0)
  const ready = open.find((c) => c.files.length > 0)
  const all = casesOf()
  if (open.length === 0) {
    return {
      turn: {
        steps: [{ label: "Zaken gezocht die op bewijs wachten", read: `Chargebacks · ${count(all.length)}` }],
        paragraphs: ["Er wacht geen zaak op bewijs. Alles wat open staat, is ingediend en wacht op de uitspraak."],
        followUps: [ask("Vat de open zaken van vandaag samen")]
      }
    }
  }
  return {
    turn: {
      steps: [
        { label: "Zaken gezocht die op bewijs wachten", read: `Chargebacks · ${count(all.length)}` },
        { label: "Op deadline gesorteerd" },
        {
          label: "Bewijs per zaak nagekeken",
          read: plural(open.reduce((n, c) => n + c.files.length, 0), "document", "documenten")
        }
      ],
      paragraphs: [
        `${plural(open.length, "zaak wacht", "zaken wachten")} op bewijs, ${
          fig(euro(atStake), "Vastgezet door de betaalpartijen", paths.chargebacks)
        } in totaal. ${
          list(
            open.slice(0, 2).map((c, i) =>
              `${i === 0 ? "De eerste deadline is" : "daarna"} ${rec(caseRef(c.id))} van ${
                rec(customerRef(c.customerId))
              } (${CHANNEL_LABEL[c.channel]}, ${euro(c.amount)}), ${timeLeft(c.dueAt)}`
            )
          )
        }.`,
        ready === undefined
          ? "Voor geen van de zaken is al bewijs verzameld."
          : `Voor ${ready.id} staat het bewijspakket klaar: ${
            plural(ready.files.length, "document", "documenten")
          } en een verweer.${
            open.filter((c) => c.files.length === 0).length > 0
              ? ` Voor ${
                list(open.filter((c) => c.files.length === 0).map((c) => c.id))
              } moet het nog verzameld worden.`
              : ""
          }`
      ],
      visual: {
        kind: "table",
        title: "Zaken die op bewijs wachten",
        data: {
          columns: CASE_COLUMNS,
          rows: open.map((c) => ({
            case: c.id,
            customer: customer(c.customerId)?.name ?? "",
            amount: c.amount,
            due: timeLeft(c.dueAt)
          })),
          focus: 0
        }
      },
      sources: open.slice(0, 3).map((c) => ({
        kind: "chargeback" as const,
        title: c.id,
        detail: c.reason,
        href: paths.chargeback(c.id)
      })),
      followUps: [ask("Vat de open zaken van vandaag samen")]
    },
    ...(ready === undefined ? {} : { proposal: evidenceProposal(ready) })
  }
}

/** The two proposals the refunds conversation already makes: the same objects, so they read the same. */
const REFUND_PROPOSALS =
  (CHATS[0]?.turns.find((t) => t.from === "magnus" && t.followUps !== undefined) as MagnusTurn | undefined)
    ?.followUps?.filter((f) => f.kind === "proposal") ?? []

function returns(refs: ReadonlyArray<Ref>): Reply {
  const pinned = refs.find((r) => r.kind === "product" && r.id !== "aurora-hooded-fleece")
  if (pinned !== undefined) return aboutProduct(pinned.id)
  const [refunds, rate, exchanges] = BLOCKS.retourcijfers.figures
  const review = toReview()
  return {
    turn: {
      steps: [
        {
          label: "Terugbetalingen van de afgelopen twee weken gelezen",
          read: `Shopify · ${count((refunds?.value ?? 0) + (refunds?.previous ?? 0))}`
        },
        { label: "Per product gegroepeerd" },
        { label: "Retourredenen gelezen", read: "Retourformulieren · 41" },
        { label: "Maattabel van de Aurora vergeleken met de levering", read: "Allure Fulfillment · 2 okt" }
      ],
      paragraphs: [
        `Er waren afgelopen week ${
          fig(count(refunds?.value ?? 0), "Terugbetalingen, 16–22 nov", paths.board("retouren"))
        } terugbetalingen, tegen ${count(refunds?.previous ?? 0)} de week ervoor; het retourpercentage ging van ${
          String(rate?.previous ?? 0).replace(".", ",")
        }% naar ${
          fig(`${String(rate?.value ?? 0).replace(".", ",")}%`, "Retourpercentage, 16–22 nov", paths.board("retouren"))
        }.`,
        `**26** daarvan gaan over de ${
          rec(productRef("aurora-hooded-fleece"))
        } in maat S, en **21** klanten schrijven dat hij te klein valt. Sinds de levering van ${
          rec(supplierRef("allure-fulfillment"))
        } van 2 oktober valt de S 2 cm smaller dan de maattabel. Zonder de Aurora waren de terugbetalingen gelijk gebleven.`,
        `Er waren ${count(exchanges?.value ?? 0)} omruilingen, en ${
          plural(review.length, "retour wacht", "retouren wachten")
        } nu op je oordeel${review[0] === undefined ? "" : `, waaronder ${rec(returnRef(review[0].id))}`}.`
      ],
      visual: {
        kind: "bar",
        title: "Terugbetalingen per product, afgelopen week",
        data: BLOCKS.terugbetalingenPerProduct.data,
        board: ANALYSE("retouren", "Retouren")
      },
      sources: [
        {
          kind: "board",
          title: "Retouren",
          detail: BLOCKS.terugbetalingenPerProduct.source,
          href: paths.board("retouren")
        },
        {
          kind: "product",
          title: "Aurora Hooded Fleece",
          detail: "26 terugbetalingen",
          href: paths.product("aurora-hooded-fleece")
        },
        {
          kind: "supplier",
          title: "Allure Fulfillment",
          detail: "Levering van 2 okt",
          href: paths.supplier("allure-fulfillment")
        }
      ],
      closing:
        "Zal ik de oorzaak aanpakken? Ik kan een maatadvies op de Aurora zetten en de retouragent eerst een omruiling laten aanbieden.",
      followUps: [...REFUND_PROPOSALS, ask("Terugbetalingen per vervoerder tonen")]
    }
  }
}

function carriers(): Reply {
  return {
    turn: {
      steps: [{ label: "Terugbetalingen aan hun zending gekoppeld", read: "Track & trace · 41" }, {
        label: "Per vervoerder vergeleken met hun deel van de pakketten"
      }],
      paragraphs: [
        `${
          fig("PostNL", "Vervoerder met de meeste terugbetalingen", paths.board("retouren"))
        } heeft de meeste terugbetalingen, **18** van de **41**, maar vervoert ook bijna de helft van de pakketten. Geen vervoerder zit ver boven zijn deel van de zendingen: de stijging komt van de ${
          rec(productRef("aurora-hooded-fleece"))
        }, niet van een vervoerder.`
      ],
      visual: {
        kind: "rank",
        title: "Terugbetalingen per vervoerder, afgelopen week",
        data: BLOCKS.perVervoerder.data,
        board: ANALYSE("retouren", "Retouren")
      },
      sources: [{
        kind: "board",
        title: "Retouren",
        detail: BLOCKS.perVervoerder.source,
        href: paths.board("retouren")
      }],
      followUps: [ask("Waarom stegen de terugbetalingen afgelopen week?")]
    }
  }
}

function revenue(): Reply {
  const [omzet, orders] = BLOCKS.kerncijfers.figures
  const days: ReadonlyArray<number> = BLOCKS.omzetPerDag.data.current
  const best = days.indexOf(Math.max(...days))
  const change = ((omzet?.value ?? 0) - (omzet?.previous ?? 1)) / (omzet?.previous ?? 1)
  const basket = Math.round((omzet?.value ?? 0) / (orders?.value ?? 1))
  const week = paths.board("week")
  return {
    turn: {
      steps: [
        {
          label: "Betaalde bestellingen van twee weken opgeteld",
          read: `Shopify · ${count(WEEK_ORDERS.length)} deze week`
        },
        { label: "Omzet excl. btw per dag berekend" },
        { label: "Vergeleken met de week ervoor", read: PERIOD.compare }
      ],
      paragraphs: [
        `De omzet kwam afgelopen week (${PERIOD.label}) op ${
          fig(euro(omzet?.value ?? 0), `Omzet excl. btw, ${PERIOD.label}`, week)
        }, ${fig(pct(change), `Tegen ${PERIOD.compare}`, week)} meer dan de week ervoor. Dat waren ${
          fig(count(orders?.value ?? 0), `Bestellingen, ${PERIOD.label}`, paths.orders)
        } bestellingen van gemiddeld ${euro(basket)}.`,
        `${
          ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"][best] ?? "Vrijdag"
        } was de beste dag sinds juni, met ${
          fig(euro(days[best] ?? 0), "Omzet op de beste dag", week)
        }: de Coastline-mail van donderdag. Vandaag staat het tot ${DEMO_NOW.clock} op ${
          fig(euro(TODAY.revenue), `Omzet vandaag tot ${DEMO_NOW.clock}`, paths.home)
        }, tegen ${euro(TODAY.lastMonday.revenue)} vorige maandag om deze tijd.`
      ],
      visual: {
        kind: "line",
        title: "Omzet per dag, tegen de week ervoor",
        data: BLOCKS.omzetPerDag.data,
        board: ANALYSE("week", "De week")
      },
      sources: [
        { kind: "board", title: "De week", detail: BLOCKS.omzetPerDag.source, href: week },
        { kind: "page", title: "Start", detail: `Vandaag tot ${DEMO_NOW.clock}`, href: paths.home }
      ],
      followUps: [ask("Welke producten verkochten het best?"), ask("Wat leveren de advertenties op?")]
    }
  }
}

function weekUnits() {
  const units = new Map<string, { units: number; revenue: number }>()
  for (const o of WEEK_ORDERS) {
    for (const l of o.lines) {
      const now = units.get(l.productId) ?? { units: 0, revenue: 0 }
      units.set(l.productId, { units: now.units + l.quantity, revenue: now.revenue + (l.price * l.quantity) / VAT })
    }
  }
  return [...units].toSorted((a, b) => b[1].units - a[1].units)
}

function bestsellers(): Reply {
  const top = weekUnits().slice(0, 5)
  const [first, second, third] = top
  const short = PRODUCTS.filter((p) => p.status === "actief" && stockOf(p) !== "op-voorraad")
  return {
    turn: {
      steps: [
        { label: "Verkochte stuks per product geteld", read: `Shopify · ${count(WEEK_ORDERS.length)} bestellingen` },
        { label: "Voorraad van de bestsellers nagekeken", read: `${count(PRODUCTS.length)} producten` }
      ],
      paragraphs: [
        `Afgelopen week verkocht de ${rec(productRef(first?.[0] ?? ""))} het best: ${
          fig(`${count(first?.[1].units ?? 0)} stuks`, `Verkocht, ${PERIOD.label}`, paths.product(first?.[0] ?? ""))
        }, ${euro(Math.round(first?.[1].revenue ?? 0))} omzet. Daarna de ${rec(productRef(second?.[0] ?? ""))} met **${
          count(second?.[1].units ?? 0)
        }** en de ${rec(productRef(third?.[0] ?? ""))} met **${count(third?.[1].units ?? 0)}**.`,
        short.length === 0
          ? "Geen van de actieve producten raakt binnenkort op."
          : `Let op de voorraad: ${
            list(
              short.slice(0, 3).map((p) =>
                `${rec(productRef(p.id))} ${p.stock === 0 ? "is uitverkocht" : `heeft er nog ${count(p.stock)}`}`
              )
            )
          }.`
      ],
      visual: {
        kind: "rank",
        title: "Verkochte stuks per product, afgelopen week",
        data: {
          items: top.map(([id, v]) => ({ label: product(id)?.name.split(" ")[0] ?? id, value: v.units })),
          format: "count",
          focus: 0
        },
        board: ANALYSE("week", "De week")
      },
      sources: top.slice(0, 3).map(([id, v]) => ({
        kind: "product" as const,
        title: product(id)?.name ?? id,
        detail: `${count(v.units)} verkocht`,
        href: paths.product(id)
      })),
      followUps: [ask("Welke producten raken op?"), ask("Wat leveren de advertenties op?")]
    }
  }
}

const STONE = "field-pant-stone"
/** What the Stone's Meta campaign spends a day: part of the week's Meta costs (`fixtures/costs.ts`). */
const STONE_AD_PER_DAY = 21

function pauseProposal(productId: string): Proposal | undefined {
  if (getProductState().edits[productId]?.adsPaused === true) return undefined
  const p = product(productId)
  if (p === undefined) return undefined
  return {
    title: `Meta-advertenties van de ${p.name} pauzeren`,
    body: `Het product is uitverkocht, maar de campagne liep afgelopen week door: ${
      euro(STONE_AD_PER_DAY * 7)
    } voor bezoekers die niets konden kopen. Ze gaan weer aan als je ze hervat.`,
    where: "Meta Ads · campagne Field Pant",
    rule: "Eerst vragen",
    read: [p.name, "Meta Ads", "Voorraad"],
    action: { kind: "pause-ads", productId }
  }
}

/** Days of stock left, the sold-out first. */
const runway = (p: (typeof PRODUCTS)[number]) => (p.stock === 0 ? -1 : (daysLeft(p) ?? Infinity))

function stock(): Reply {
  const low = PRODUCTS.filter((p) => p.status === "actief" && stockOf(p) !== "op-voorraad")
    .toSorted((a, b) => runway(a) - runway(b))
  const proposal = low.some((p) => p.id === STONE) ? pauseProposal(STONE) : undefined
  const paused = getProductState().edits[STONE]?.adsPaused === true
  return {
    turn: {
      steps: [
        { label: "Voorraad van alle actieve producten gelezen", read: `Shopify · ${count(PRODUCTS.length)} producten` },
        { label: "Verkoop per dag erbij gezet", read: PERIOD.label },
        { label: "Lopende advertenties nagekeken", read: "Meta Ads" }
      ],
      paragraphs: [
        low.length === 0
          ? "Geen van de actieve producten raakt binnen tien dagen op."
          : `${plural(low.length, "product raakt", "producten raken")} op of ${
            low.length === 1 ? "is" : "zijn"
          } al op. ${
            list(
              low.slice(0, 3).map((p) => {
                const d = daysLeft(p)
                return `${rec(productRef(p.id))} ${
                  p.stock === 0
                    ? "is uitverkocht"
                    : `heeft er nog **${count(p.stock)}**${
                      d === null ? "" : `, genoeg voor ${Math.max(1, Math.round(d))} dagen`
                    }`
                }`
              })
            )
          }.`,
        low.some((p) => p.id === STONE)
          ? paused
            ? "De advertenties van de Field Pant · Stone staan al op pauze tot de nabestelling binnen is."
            : `De Meta-advertentie van de ${rec(productRef(STONE))} loopt nog, terwijl er niets te koop is: ongeveer ${
              euro(STONE_AD_PER_DAY)
            } per dag.`
          : ""
      ].filter((p) => p !== ""),
      visual: {
        kind: "table",
        title: "Producten die op raken",
        data: {
          columns: [
            { key: "product", label: "Product" },
            { key: "stock", label: "Voorraad", format: "count", bar: true },
            { key: "days", label: "Dagen over" }
          ],
          rows: low.map((p) => {
            const d = daysLeft(p)
            return {
              product: p.name,
              stock: p.stock,
              days: p.stock === 0 ? "op" : d === null ? "" : `${Math.max(1, Math.round(d))}`
            }
          }),
          focus: 0
        }
      },
      sources: low.slice(0, 3).map((p) => ({
        kind: "product" as const,
        title: p.name,
        detail: `${count(p.stock)} op voorraad`,
        href: paths.product(p.id)
      })),
      followUps: [ask("Maak een automatisering voor lage voorraad"), ask("Welke producten verkochten het best?")]
    },
    ...(proposal === undefined ? {} : { proposal })
  }
}

function ads(): Reply {
  const f = figuresOf(COST_LINES, COST_WEEK)
  const roas = f.roas.toLocaleString("nl-NL", { maximumFractionDigits: 1 })
  const paused = getProductState().edits[STONE]?.adsPaused === true
  const proposal = pauseProposal(STONE)
  return {
    turn: {
      steps: [
        { label: "Advertentiekosten van de week gelezen", read: "Meta Ads · Google Ads" },
        { label: "Tegen de omzet van dezelfde dagen gezet", read: `Shopify · ${PERIOD.label}` },
        { label: "Campagnes vergeleken met de voorraad", read: `${count(PRODUCTS.length)} producten` }
      ],
      paragraphs: [
        `Je gaf afgelopen week ${
          fig(euro(Math.round(f.ads)), `Advertentiekosten, ${PERIOD.label}`, paths.costs)
        } uit aan advertenties: ${euro(Math.round(f.adsMeta))} bij Meta en ${
          euro(Math.round(f.adsGoogle))
        } bij Google. Elke euro bracht ${fig(`€ ${roas}`, "Omzet per euro advertentie (ROAS)", paths.costs)} omzet op.`,
        paused
          ? `De campagne van de ${
            rec(productRef(STONE))
          } staat op pauze zolang hij uitverkocht is, dus er loopt niets meer voor niets.`
          : `Eén campagne loopt voor niets: die van de ${
            rec(productRef(STONE))
          }. Het product is uitverkocht, maar de advertentie kost nog ongeveer ${euro(STONE_AD_PER_DAY)} per dag.`
      ],
      visual: {
        kind: "figures",
        title: "Advertenties, afgelopen week",
        compareLabel: PERIOD.compare,
        figures: [
          {
            label: "Advertentiekosten",
            value: Math.round(f.ads),
            previous: Math.round(f.ads * 0.94),
            format: "euro",
            better: "lower"
          },
          { label: "Omzet", value: Math.round(f.revenue), previous: 44800, format: "euro", better: "higher" }
        ]
      },
      sources: [
        { kind: "page", title: "Kosten", detail: "Meta Ads en Google Ads", href: paths.costs },
        { kind: "product", title: "Field Pant · Stone", detail: "Uitverkocht", href: paths.product(STONE) }
      ],
      followUps: [ask("Welke producten raken op?"), ask("Hoe ging de omzet afgelopen week?")]
    },
    ...(proposal === undefined ? {} : { proposal })
  }
}

function customers(): Reply {
  const top = CUSTOMERS.filter((c) => c.duplicateOf === undefined).toSorted((a, b) => b.lifetimeValue - a.lifetimeValue)
    .slice(0, 5)
  const vip = CUSTOMERS.filter((c) => c.duplicateOf === undefined && c.tags.includes("vip"))
  const disputed = waitingOnEvidence().map((c) => customer(c.customerId)).find((c) => c?.tags.includes("vip") === true)
  const [first] = top
  return {
    turn: {
      steps: [
        { label: "Klanten op wat ze ooit besteedden gesorteerd", read: `Shopify · ${count(CUSTOMERS.length)} klanten` },
        { label: "Open zaken van de beste klanten nagekeken", read: "Inbox en chargebacks" }
      ],
      paragraphs: [
        `Je beste klant is ${rec(customerRef(first?.id ?? ""))}: ${
          fig(euro(first?.lifetimeValue ?? 0), "Besteed sinds de eerste bestelling", paths.customer(first?.id ?? ""))
        } over **${count(first?.ordersCount ?? 0)}** bestellingen sinds ${first?.since ?? ""}. ${
          fig(plural(vip.length, "klant", "klanten"), "Met het label vip", paths.customers)
        } ${vip.length === 1 ? "heeft" : "hebben"} het label vip.`,
        disputed === undefined
          ? "Geen van hen heeft nu een open geschil."
          : `Let op ${
            rec(customerRef(disputed.id))
          }: een vip met een open geschil. Een sterk verweer en een persoonlijk bericht houden hem vaak binnen.`
      ],
      visual: {
        kind: "table",
        title: "Klanten die het meest besteedden",
        data: {
          columns: [
            { key: "name", label: "Klant" },
            { key: "orders", label: "Bestellingen", format: "count" },
            { key: "ltv", label: "Besteed", format: "euro", bar: true }
          ],
          rows: top.map((c) => ({ name: c.name, orders: c.ordersCount, ltv: c.lifetimeValue })),
          focus: 0
        }
      },
      sources: top.slice(0, 3).map((c) => ({
        kind: "customer" as const,
        title: c.name,
        detail: euro(c.lifetimeValue),
        href: paths.customer(c.id)
      })),
      followUps: disputed === undefined ? [] : [ask(`Wat moet ik weten over ${disputed.name}?`)]
    }
  }
}

function inbox(): Reply {
  const all = tickets()
  const open = openTicketsOf(all)
  const long = waitingLong(all)
  const drafted = long.find((t) => t.draft !== undefined)
  return {
    turn: {
      steps: [
        { label: "Open tickets gelezen", read: `Inbox · ${count(open.length)}` },
        { label: "Op wachttijd gesorteerd" },
        { label: "Concepten van de agents nagekeken" }
      ],
      paragraphs: [
        `Er staan ${
          fig(count(open.length), "Open tickets", paths.inbox)
        } tickets open. De eerste reactie zit vandaag op ${
          fig(`${TODAY.firstReply} min`, "Mediaan eerste reactie vandaag", paths.inbox)
        }, tegen ${TODAY.lastMonday.firstReply} vorige maandag.`,
        long.length === 0
          ? "Niemand wacht langer dan vier uur."
          : `${plural(long.length, "klant wacht", "klanten wachten")} langer dan vier uur, het langst ${
            list(
              long.slice(0, 2).map((t) =>
                `${rec(customerRef(t.customerId))} op ${rec(ticketRef(t.number))} (${waited(waitedMinutes(t) ?? 0)})`
              )
            )
          }.${
            drafted === undefined
              ? ""
              : ` Voor ${firstName(customer(drafted.customerId)?.name ?? "")} ligt er al een concept.`
          }`
      ],
      visual: {
        kind: "table",
        title: "Wie het langst wacht",
        data: {
          columns: [
            { key: "ticket", label: "Ticket" },
            { key: "customer", label: "Klant" },
            { key: "subject", label: "Over" },
            { key: "waited", label: "Wacht" }
          ],
          rows: open.filter((t) => waitedMinutes(t) !== null).toSorted((a, b) =>
            (waitedMinutes(b) ?? 0) - (waitedMinutes(a) ?? 0)
          )
            .slice(0, 5).map((t) => ({
              ticket: `#${t.number}`,
              customer: customer(t.customerId)?.name ?? "",
              subject: t.subject,
              waited: waited(waitedMinutes(t) ?? 0)
            })),
          focus: 0
        }
      },
      sources: [
        { kind: "page", title: "Inbox", detail: `${count(open.length)} open`, href: paths.inbox },
        ...long.slice(0, 2).map((t) => ({
          kind: "ticket" as const,
          title: `Ticket #${t.number}`,
          detail: t.subject,
          href: paths.ticket(t.number)
        }))
      ],
      followUps: [ask("Vat de open zaken van vandaag samen")]
    },
    ...(drafted === undefined ? {} : { proposal: reply([ticketRef(drafted.number)]).proposal })
  }
}

function conversion(): Reply {
  const steps = BLOCKS.conversie.data.steps
  const visits = steps[0]?.value ?? 1
  const paid = steps.at(-1)?.value ?? 0
  const rates = steps.map((s, i) => (i === 0 ? 1 : s.value / (steps[i - 1]?.value ?? 1)))
  const worst = rates.reduce((at, r, i) => (i > 0 && r < (rates[at] ?? 1) ? i : at), 1)
  const board = paths.board("week")
  return {
    turn: {
      steps: [{ label: "Sessies van de week gelezen", read: `Shopify · ${count(visits)} bezoeken` }, {
        label: "Per stap berekend wie doorgaat"
      }],
      paragraphs: [
        `Van de ${fig(count(visits), "Bezoeken, 16–22 nov", board)} bezoeken werden er ${
          fig(count(paid), "Betaalde bestellingen", board)
        } een bestelling: ${fig(pct(paid / visits), "Conversie", board)}. De grootste stap is van ${
          steps[worst - 1]?.label.toLocaleLowerCase("nl-NL") ?? ""
        } naar ${steps[worst]?.label.toLocaleLowerCase("nl-NL") ?? ""}: maar ${
          fig(pct(rates[worst] ?? 0, 0), "Gaat door naar de volgende stap", board)
        } gaat door.`
      ],
      visual: {
        kind: "funnel",
        title: BLOCKS.conversie.title,
        data: BLOCKS.conversie.data,
        board: ANALYSE("week", "De week")
      },
      sources: [{ kind: "board", title: "De week", detail: BLOCKS.conversie.source, href: board }],
      followUps: [ask("Welke producten verkochten het best?")]
    }
  }
}

const AUTOMATIONS: ReadonlyArray<{ readonly test: RegExp; readonly id: string }> = [
  { test: /(voorraad|uitverkocht|campagne)/, id: "lage-voorraad-campagne" },
  { test: /(chargeback|geschil|bewijs)/, id: "chargeback-bewijs" },
  { test: /review/, id: "slechte-review" },
  { test: /(terugbetal|retour)/, id: "terugbetaling-goedkeuring" },
  { test: /(vip|hoge waarde)/, id: "vip-bestelling" },
  { test: /(terugwin|90 dagen)/, id: "terugwinnen" },
  { test: /./, id: "late-levering" }
]

function automation(text: string): Reply {
  const q = norm(text)
  const id = AUTOMATIONS.find((a) => a.test.test(q))?.id ?? "late-levering"
  const t = template(id)
  if (t === undefined) return nothing(text)
  const covered = t.coveredBy === undefined ? undefined : SEED.find((a) => a.id === t.coveredBy)
  return {
    turn: {
      steps: [
        { label: "Sjablonen voor dit soort werk doorzocht", read: "Automatiseringen · sjablonen" },
        { label: "Nagekeken wat er al draait", read: `${count(SEED.length)} automatiseringen` },
        ...(t.evidence === null ? [] : [{ label: "Geteld hoe vaak het voorkomt", read: t.evidence.line }])
      ],
      paragraphs: [
        `Dit past bij **${t.name}**. ${t.description}`,
        `Hij doet het in ${plural(t.steps.length, "stap", "stappen")}: ${
          list(t.steps.map((s) => (stepType(s.type)?.label ?? s.summary).toLocaleLowerCase("nl-NL")))
        }.${t.evidence === null ? "" : ` ${t.evidence.line}`}${
          covered === undefined ? "" : ` Let op: ‘${covered.name}’ doet een deel hiervan al.`
        }`,
        "Ik zet hem als concept klaar. Er draait niets tot je hem publiceert."
      ],
      sources: [{ kind: "page", title: "Automatiseringen", detail: t.name, href: paths.automations }],
      followUps: [ask("Welke bestellingen dreigen te laat te komen?")]
    },
    proposal: {
      title: `Automatisering ‘${t.name}’ als concept`,
      body: "Met de stappen hierboven. Je kunt elke stap aanpassen voordat je hem publiceert.",
      where: "Automatiseringen · concept",
      rule: "Eerst vragen",
      action: { kind: "create-automation", templateId: id, name: t.name }
    }
  }
}

/* ── about one record ──────────────────────────────────────────────────────────────────────────── */

function aboutOrder(number: string): Reply {
  const o = findOrder(number)
  if (o === undefined) return nothing(`#${number}`)
  const c = customer(o.customerId)
  const supplierId = supplierOf(o)
  const cases = casesOf().filter((x) => x.orderNumber === o.number)
  const rets = orderReturns(o.number)
  const asked = tickets().filter((t) => t.order === o.number && isOpen(t))
  const waitingCase = cases.find((x) => x.status === "wacht-op-bewijs")
  const late = o.status === "vertraagd"
  const items = o.lines.map((l) => `${product(l.productId)?.name ?? ""}${l.size === "Eén maat" ? "" : ` in ${l.size}`}`)
  const proposal = waitingCase !== undefined
    ? evidenceProposal(waitingCase)
    : asked[0] !== undefined
    ? reply([ticketRef(asked[0].number)]).proposal
    : late && o.promisedAt !== undefined
    ? supplierProposal(supplierId, [o])
    : undefined
  return {
    turn: {
      steps: [
        {
          label: `#${o.number} geopend`,
          read: `Shopify · ${o.storeId === "store_eu" ? "Northwind EU" : "Northwind US"}`
        },
        { label: "Leverancier en track & trace gelezen", read: o.carrier },
        { label: "Tickets, retouren en geschillen erbij gezocht" }
      ],
      paragraphs: [
        `${rec(orderRef(o.number))} is ${
          fig(euro(o.total), "Totaal incl. btw en verzending", paths.order(o.number))
        } van ${rec(customerRef(o.customerId))} voor ${list(items)}, betaald met ${o.payment}. Hij ${
          STATUS_PHRASE[o.status]
        }, via ${rec(supplierRef(supplierId))} en ${o.carrier}.${
          late
            ? o.promisedAt === undefined
              ? " Het pakket is kwijt bij de vervoerder."
              : ` Hij is ${daysLate(o)} dagen later dan beloofd.`
            : ""
        }`,
        [
          ...asked.map((t) =>
            `${c === undefined ? "De klant" : firstName(c.name)} vroeg ernaar op ${rec(ticketRef(t.number))}.`
          ),
          ...cases.map((x) =>
            `Er loopt een geschil, ${rec(caseRef(x.id))}: ${x.reason.toLocaleLowerCase("nl-NL")}, ${
              CASE_STATUS[x.status].label.toLocaleLowerCase("nl-NL")
            }${x.status === "wacht-op-bewijs" ? `, ${timeLeft(x.dueAt)}` : ""}.`
          ),
          ...rets.map((r) =>
            `Er is een retour, ${rec(returnRef(r.id))}: ${REASON_LABEL[r.reason].toLocaleLowerCase("nl-NL")}.`
          )
        ].join(" ") || "Er hangen geen tickets, retouren of geschillen aan."
      ],
      sources: [
        { kind: "order", title: `#${o.number}`, detail: ORDER_STATUS[o.status].label, href: paths.order(o.number) },
        ...(c === undefined
          ? []
          : [{ kind: "customer" as const, title: c.name, detail: c.city, href: paths.customer(c.id) }])
      ],
      followUps: [
        ask(`Stel een antwoord op aan ${c?.name ?? "de klant"}`),
        ask("Welke bestellingen dreigen te laat te komen?")
      ]
    },
    ...(proposal === undefined ? {} : { proposal })
  }
}

function aboutCustomer(id: string): Reply {
  const c = customer(id)
  if (c === undefined) return nothing(id)
  const orders = customerOrders(id)
  const open = orders.filter(isOpenOrder)
  const asked = tickets().filter((t) => t.customerId === id && isOpen(t))
  const cases = casesOf().filter((x) =>
    x.customerId === id && (x.status === "wacht-op-bewijs" || x.status === "ingediend")
  )
  const rets = customerReturns(id)
  const first = firstName(c.name)
  const proposal = cases.find((x) => x.status === "wacht-op-bewijs" && x.files.length > 0)
  return {
    turn: {
      steps: [
        {
          label: `Klantkaart van ${first} geopend`,
          read: `Shopify · ${plural(c.ordersCount, "bestelling", "bestellingen")}`
        },
        { label: "Open bestellingen, tickets en geschillen gezocht" }
      ],
      paragraphs: [
        `${rec(customerRef(id))} uit ${c.city} is klant sinds ${c.since} en besteedde ${
          fig(euro(c.lifetimeValue), "Besteed sinds de eerste bestelling", paths.customer(id))
        } over **${count(c.ordersCount)}** bestellingen${c.tags.length === 0 ? "" : ` (${c.tags.join(", ")})`}.`,
        [
          open.length === 0
            ? "Er staat geen bestelling van hem of haar open."
            : `Open: ${
              list(
                open.slice(0, 3).map((o) =>
                  `${rec(orderRef(o.number))} (${ORDER_STATUS[o.status].label.toLocaleLowerCase("nl-NL")})`
                )
              )
            }.`,
          ...asked.map((t) => `${first} wacht op antwoord op ${rec(ticketRef(t.number))}, ‘${t.subject}’.`),
          ...cases.map((x) =>
            `Er loopt een geschil, ${rec(caseRef(x.id))} (${euro(x.amount)}, ${
              CASE_STATUS[x.status].label.toLocaleLowerCase("nl-NL")
            }).`
          ),
          ...(rets.length === 0
            ? []
            : [`${plural(rets.length, "retour", "retouren")}, de laatste ${rec(returnRef(rets[0]?.id ?? ""))}.`])
        ].join(" ")
      ],
      sources: [
        { kind: "customer", title: c.name, detail: `${c.city} · sinds ${c.since}`, href: paths.customer(id) },
        ...asked.slice(0, 2).map((t) => ({
          kind: "ticket" as const,
          title: `Ticket #${t.number}`,
          detail: t.subject,
          href: paths.ticket(t.number)
        }))
      ],
      followUps: [ask(`Stel een antwoord op aan ${c.name}`)]
    },
    ...(proposal === undefined
      ? asked[0] === undefined ? {} : { proposal: reply([ticketRef(asked[0].number)]).proposal }
      : { proposal: evidenceProposal(proposal) })
  }
}

function aboutProduct(id: string): Reply {
  const p = product(id)
  if (p === undefined) return nothing(id)
  const w = weekOf(p)
  const rate = returnRate(p)
  const d = daysLeft(p)
  const level = stockOf(p)
  const aurora = id === "aurora-hooded-fleece"
  const proposal = p.stock === 0 && p.status === "actief" ? pauseProposal(id) : undefined
  const paused = getProductState().edits[id]?.adsPaused === true
  return {
    turn: {
      steps: [
        { label: `${p.name} geopend`, read: `Shopify · ${p.sku}` },
        { label: "Verkoop en retouren van de week geteld", read: PERIOD.label },
        { label: "Voorraad en leverancier nagekeken", read: SUPPLIERS.find((s) => s.id === p.supplierId)?.name ?? "" }
      ],
      paragraphs: [
        `De ${rec(productRef(id))} kost ${euro(p.price)} en komt van ${
          rec(supplierRef(p.supplierId))
        }. Afgelopen week gingen er ${
          fig(count(w.sold), `Verkocht, ${PERIOD.label}`, paths.product(id))
        } de deur uit en ${count(w.returned)} terug, een retourpercentage van ${
          fig(pct(rate), "Teruggestuurd van verkocht", paths.board("retouren"))
        }.`,
        `${
          p.stock === 0
            ? `Hij is uitverkocht${p.tags.includes("nabestelling") ? ", de nabestelling loopt" : ""}.`
            : `Er zijn er nog **${count(p.stock)}**${
              d === null ? "" : `, genoeg voor ongeveer ${Math.max(1, Math.round(d))} dagen`
            }${level === "laag" ? "; dat is krap" : ""}.`
        }${
          aurora
            ? " 21 klanten schreven dat de S te klein valt: sinds de levering van 2 oktober meet hij 2 cm minder dan de maattabel."
            : ""
        }${p.stock === 0 ? paused ? " De advertenties staan op pauze." : " De Meta-advertentie loopt nog." : ""}`
      ],
      sources: [{ kind: "product", title: p.name, detail: `${count(p.stock)} op voorraad`, href: paths.product(id) }],
      followUps: aurora ? REFUND_PROPOSALS : [ask("Welke producten raken op?")]
    },
    ...(proposal === undefined ? {} : { proposal })
  }
}

function aboutSupplier(id: string): Reply {
  const s = SUPPLIERS.find((x) => x.id === id)
  if (s === undefined) return nothing(id)
  const late = delayed().filter((o) => supplierOf(o) === id)
  const products = PRODUCTS.filter((p) => p.supplierId === id)
  const over = s.leadDays > s.promiseDays
  const filed = supplierTicket(id)
  const proposal = supplierProposal(id, late)
  return {
    turn: {
      steps: [
        { label: `${s.name} geopend`, read: `${s.country} · ${s.apiConnected ? "API" : "Portaal"}` },
        { label: "Levertijd van de week berekend", read: "Track & trace" },
        { label: "Vertraagde bestellingen gezocht", read: `Shopify · ${count(late.length)}` }
      ],
      paragraphs: [
        s.leadDays === 0
          ? `${rec(supplierRef(id))} is uitgenodigd maar levert nog niets.`
          : `${rec(supplierRef(id))} levert ${plural(products.length, "product", "producten")} en doet er gemiddeld ${
            fig(`${s.leadDays.toLocaleString("nl-NL")} dagen`, "Gem. levertijd, 16–22 nov", paths.board("leveranciers"))
          } over, ${over ? "langer dan" : "binnen"} de belofte van ${s.promiseDays}.`,
        late.length === 0
          ? "Geen van zijn bestellingen is nu te laat."
          : `${plural(late.length, "bestelling is", "bestellingen zijn")} over de beloofde datum, waaronder ${
            list(late.slice(0, 3).map((o) => rec(orderRef(o.number))))
          }.${filed === undefined ? "" : ` Je vroeg al om nieuwe data op ${rec(ticketRef(filed.number))}.`}`
      ],
      visual: {
        kind: "bar",
        title: BLOCKS.levertijd.title,
        data: BLOCKS.levertijd.data,
        board: ANALYSE("leveranciers", "Leveranciers")
      },
      sources: [
        {
          kind: "supplier",
          title: s.name,
          detail: `${s.leadDays.toLocaleString("nl-NL")} d levertijd`,
          href: paths.supplier(id)
        },
        ...late.slice(0, 2).map((o) => ({
          kind: "order" as const,
          title: `#${o.number}`,
          detail: `${daysLate(o)} d te laat`,
          href: paths.order(o.number)
        }))
      ],
      followUps: [ask("Welke bestellingen dreigen te laat te komen?")]
    },
    ...(proposal === undefined ? {} : { proposal })
  }
}

function aboutTicket(number: string): Reply {
  const t = tickets().find((x) => x.number === number)
  if (t === undefined) return nothing(`#${number}`)
  const c = customer(t.customerId)
  const mins = waitedMinutes(t)
  const r = c === undefined || !isOpen(t) ? undefined : reply([ticketRef(number)])
  return {
    turn: {
      steps: [{ label: `Ticket #${number} gelezen`, read: plural(t.entries.length, "regel", "regels") }, {
        label: "Bestelling en eerdere vragen erbij gezocht"
      }],
      paragraphs: [
        `${rec(ticketRef(number))} gaat over ‘${t.subject}’, van ${
          c === undefined ? "intern" : rec(customerRef(c.id))
        }${t.order === undefined ? "" : ` over ${rec(orderRef(t.order))}`}. ${
          !isOpen(t)
            ? "Het is afgehandeld."
            : mins === null
            ? "We wachten op de klant."
            : `De klant wacht sinds ${t.waitingSince ?? ""}, ${waited(mins)}.`
        }${t.deadline === undefined ? "" : ` Let op: ${t.deadline.text}.`}`,
        ...(r === undefined ? [] : ["Ik heb een antwoord klaargezet."])
      ],
      sources: [{ kind: "ticket", title: `Ticket #${number}`, detail: t.subject, href: paths.ticket(number) }],
      followUps: [ask("Welke tickets wachten het langst?")]
    },
    ...(r?.proposal === undefined ? {} : { proposal: r.proposal })
  }
}

function aboutCase(id: string): Reply {
  const c = casesOf().find((x) => x.id.toLowerCase() === id.toLowerCase())
  if (c === undefined) return nothing(id)
  const waiting = c.status === "wacht-op-bewijs"
  return {
    turn: {
      steps: [
        { label: `${c.id} geopend`, read: CHANNEL_LABEL[c.channel] },
        { label: "Bewijs en verweer nagekeken", read: plural(c.files.length, "document", "documenten") }
      ],
      paragraphs: [
        `${rec(caseRef(c.id))} is een geschil van ${rec(customerRef(c.customerId))} bij ${
          CHANNEL_LABEL[c.channel]
        } over ${fig(euro(c.amount), "Vastgezet bedrag", paths.chargeback(c.id))}${
          c.linked ? ` en bestelling ${rec(orderRef(c.orderNumber))}` : ""
        }: ‘${c.reason.toLocaleLowerCase("nl-NL")}’. Het staat op **${
          CASE_STATUS[c.status].label.toLocaleLowerCase("nl-NL")
        }**${waiting ? `, ${timeLeft(c.dueAt)}` : ""}.`,
        waiting
          ? c.files.length === 0
            ? "Er is nog geen bewijs verzameld."
            : `Het bewijspakket staat klaar: ${
              list(c.files.map((f) => f.what.split(",")[0]?.toLocaleLowerCase("nl-NL") ?? f.name))
            }.`
          : ""
      ].filter((p) => p !== ""),
      sources: [
        { kind: "chargeback", title: c.id, detail: c.reason, href: paths.chargeback(c.id) },
        ...(c.linked
          ? [{
            kind: "order" as const,
            title: `#${c.orderNumber}`,
            detail: "Bestelling",
            href: paths.order(c.orderNumber)
          }]
          : [])
      ],
      followUps: [ask("Welke chargebacks hebben bewijs nodig?")]
    },
    ...(waiting && c.files.length > 0 ? { proposal: evidenceProposal(c) } : {})
  }
}

function aboutReturn(id: string): Reply {
  const r = returnsOf().find((x) => x.id === id)
  if (r === undefined) return nothing(id)
  const p = product(r.productId)
  return {
    turn: {
      steps: [{ label: `${r.number} geopend` }, { label: "Bestelling en reden gelezen", read: `#${r.orderNumber}` }],
      paragraphs: [
        `${rec(returnRef(id))} is een ${r.kind} van ${rec(customerRef(r.customerId))} voor ${
          p === undefined ? "een product" : rec(productRef(p.id))
        } in ${r.size}, uit ${rec(orderRef(r.orderNumber))}: ‘${
          REASON_LABEL[r.reason].toLocaleLowerCase("nl-NL")
        }’. Het staat op **${RETURN_STATUS[r.status].label.toLocaleLowerCase("nl-NL")}**${
          r.note === "" ? "." : `. De klant schreef: ‘${r.note}’`
        }`
      ],
      sources: [{ kind: "return", title: r.number, detail: RETURN_STATUS[r.status].label, href: paths.return(id) }],
      followUps: [ask("Waarom stegen de terugbetalingen afgelopen week?")]
    }
  }
}

const ABOUT: Readonly<Record<RefKind, (id: string) => Reply>> = {
  order: aboutOrder,
  customer: aboutCustomer,
  product: aboutProduct,
  supplier: aboutSupplier,
  ticket: aboutTicket,
  chargeback: aboutCase,
  return: aboutReturn
}

function nothing(text: string): Reply {
  const said = text.trim().slice(0, 60)
  return {
    turn: {
      steps: [{ label: "Uitgezocht waar dit over gaat" }],
      paragraphs: [
        said === ""
          ? "Ik kon dat niet koppelen aan iets in de werkruimte."
          : `Ik kon ‘${said}’ niet koppelen aan een bestelling, klant, product, ticket of leverancier. Noem een record met @, of begin met een van deze.`
      ],
      followUps: COMMANDS.slice(0, 3).map((c) => ask(c.prompt))
    }
  }
}

/* ── which answer ──────────────────────────────────────────────────────────────────────────────── */

type Intent = {
  readonly test: RegExp
  /** The record kinds it takes as its subject; a question naming another kind is about that record. */
  readonly takes?: ReadonlyArray<RefKind>
  /** An action wins over a named record: "stel een antwoord op aan Felix" is a reply, not Felix's card. */
  readonly action?: boolean
  readonly run: (refs: ReadonlyArray<Ref>, text: string) => Reply
}

const INTENTS: ReadonlyArray<Intent> = [
  { test: /(antwoord op|stel .*op|opstellen|schrijf|beantwoord|mail .*aan|concept voor)/, action: true, run: reply },
  { test: /(automatiser|automatisch|elke keer als|altijd als|flow voor)/, action: true, run: (_, t) => automation(t) },
  { test: /(vat de week|week samen|hoe ging de week)/, run: revenue },
  { test: /(samenvat|vat .*samen|wat moet ik vandaag|als eerste|wacht op mij|open zaken|wat speelt er)/, run: summary },
  { test: /(advertent|\bads\b|roas|meta|campagne)/, takes: ["product"], run: ads },
  { test: /(chargeback|geschil|dispute|bewijs|betwist)/, takes: ["chargeback"], run: chargebacks },
  { test: /vervoerder/, run: carriers },
  {
    test: /(retour|terugbetal|terugstur|refund|te klein|valt klein|(komt|komen|kwam|kwamen) .*terug)/,
    takes: ["product"],
    run: returns
  },
  { test: /(levertijd|hoe snel leveren)/, run: leadTimes },
  { test: /(te laat|vertra|onderweg|dreig|overdracht|achterstand)/, takes: ["supplier"], run: delays },
  { test: /(voorraad|uitverkocht|raken op|raakt op|bijna op|nabestel)/, run: stock },
  { test: /(bestverkocht|best verkocht|verkochten het best|bestseller|populairst)/, run: bestsellers },
  { test: /(omzet|verkoop|verdien|hoe ging de week|hoe ging het)/, run: revenue },
  { test: /(beste klant|klanten|vip)/, run: customers },
  { test: /(ticket|inbox|klantenservice|eerste reactie|wachten het langst)/, run: inbox },
  { test: /(conversie|bezoek|afhak|winkelwagen|funnel)/, run: conversion }
]

/**
 * The answer to a question: the records named with `@` first, then the ones named in plain words, then
 * the intent read from the words. A `/` command asks its own question, with whatever was typed after it.
 */
export function answer(question: Question): Reply {
  const command = COMMANDS.find((c) => c.name === question.command) ??
    COMMANDS.find((c) => norm(question.text).startsWith(`/${c.name}`))
  const rest = question.text.replace(/^\/\S+\s*/, "").trim()
  const text = command === undefined ? question.text : `${command.prompt} ${rest}`.trim()
  const named = [...(question.refs ?? [])]
  for (const ref of refsIn(text)) if (!named.some((r) => r.kind === ref.kind && r.id === ref.id)) named.push(ref)
  if (named.length === 0) named.push(...(question.about ?? []))
  const q = norm(text)
  const intent = INTENTS.find((i) => i.test.test(q))
  const subject = named[0]
  if (intent !== undefined) {
    const fits = subject === undefined || intent.action === true ||
      (intent.takes ?? []).includes(subject.kind)
    if (fits) return intent.run(named, text)
  }
  if (subject !== undefined) return ABOUT[subject.kind](subject.id)
  return nothing(question.text)
}
