import { OPEN_STORE_CHATS } from "./live.ts"
import { DEMO_NOW, TODAY } from "./workspace.ts"
import type { PEOPLE } from "./workspace.ts"

/**
 * The inbox's demo: Northwind's customer conversations on Monday 23 November until 14:30
 * (`DEMO_NOW`), the team chat and the store chat. Each conversation is a ticket, whatever channel it
 * came in on: the support mailbox, WhatsApp, Instagram or the store chat a person took over. The
 * customers and orders are the shared records (`records.ts`); the copy follows the current demo's
 * mail and channel fixtures (`src/app/fixtures/mock-data/emails.ts`, `channels.ts`, `chats.ts`),
 * moved to this clock and story. Nothing here is real.
 *
 * The story it carries: twelve open tickets (`TODAY.openTickets`), three of them waiting longer than
 * four hours on the team, the oldest Felix Muller's at six hours; #5141 the parcel DPD lost, given to
 * Elena by the agent (DPD closes claims at 17:00); #5142 the refund Sofía asked Elena to approve;
 * #5146 Luca's order four days late with the agent's 10% code; #5148 Astrid's Aurora in S, where the
 * Retouragent wants to offer an M.
 */

export type PersonKey = keyof typeof PEOPLE

export type Channel = "email" | "whatsapp" | "instagram" | "winkelchat"

export const CHANNELS: ReadonlyArray<{ readonly id: Channel; readonly label: string; readonly account: string }> = [
  { id: "email", label: "E-mail", account: "support@northwind.co" },
  { id: "whatsapp", label: "WhatsApp", account: "+31 20 808 44 11" },
  { id: "instagram", label: "Instagram", account: "@northwindclothing" },
  { id: "winkelchat", label: "Winkelchat", account: "Northwind EU" }
]

export const channelLabel = (id: Channel) => CHANNELS.find((c) => c.id === id)?.label ?? id

export type TicketStatus = "nieuw" | "bezig" | "wacht" | "klaar"

export const TICKET_STATUS: Readonly<
  Record<TicketStatus, { readonly label: string; readonly tone: "neutral" | "accent" | "warn" | "good" }>
> = {
  nieuw: { label: "Nieuw", tone: "neutral" },
  bezig: { label: "Bezig", tone: "accent" },
  wacht: { label: "Wacht op antwoord", tone: "warn" },
  klaar: { label: "Klaar", tone: "good" }
}

export const STATUS_ORDER: ReadonlyArray<TicketStatus> = ["nieuw", "bezig", "wacht", "klaar"]

export type Priority = "hoog" | "gemiddeld" | "laag"

export const PRIORITY: Readonly<
  Record<Priority, { readonly label: string; readonly tone: "bad" | "warn" | "neutral" }>
> = {
  hoog: { label: "Hoog", tone: "bad" },
  gemiddeld: { label: "Gemiddeld", tone: "warn" },
  laag: { label: "Laag", tone: "neutral" }
}

/** The labels a ticket can carry: the operator's own words. */
export const LABELS: ReadonlyArray<string> = [
  "Levering",
  "Pakket kwijt",
  "Retour",
  "Maat",
  "Terugbetaling",
  "Voorraad",
  "Beschadigd",
  "Voor aankoop",
  "Techniek",
  "VIP",
  "Leverancier"
]

/**
 * One line in a conversation. `customer` is the customer, `team` a colleague's reply, `agent` an
 * agent that answered or acted (under which rule), `note` an internal note only the team sees, and
 * `event` what happened to the ticket (assigned, moved).
 */
export type Entry =
  | { readonly kind: "customer"; readonly at: string; readonly text: string; readonly attachment?: string }
  | { readonly kind: "team"; readonly who: PersonKey; readonly at: string; readonly text: string }
  | { readonly kind: "agent"; readonly agentId: string; readonly at: string; readonly text: string }
  | { readonly kind: "note"; readonly who: PersonKey; readonly at: string; readonly text: string }
  | { readonly kind: "event"; readonly at: string; readonly text: string }

export type Ticket = {
  /** The ticket number without the hash, also the URL: `/v2/inbox/5141`. */
  readonly number: string
  readonly customerId: string
  /** Where they wrote from: an address, a number, a handle. */
  readonly handle: string
  readonly subject: string
  readonly channel: Channel
  readonly status: TicketStatus
  readonly priority: Priority
  readonly assignee: PersonKey | null
  readonly labels: ReadonlyArray<string>
  /** The order it is about, when there is one (`records.ts`). */
  readonly order?: string
  /** Another record it touches: the chargeback, the product asked about. */
  readonly also?: { readonly kind: "chargeback" | "product" | "supplier"; readonly id: string; readonly label: string }
  readonly createdAt: string
  /** When the customer started waiting on the team, if they are: the last message nobody answered. */
  readonly waitingSince?: string
  readonly unread: boolean
  readonly entries: ReadonlyArray<Entry>
  /** An agent's proposal on this ticket (`fixtures/home.ts`, `APPROVALS`), decided in the demo store. */
  readonly approvalId?: string
  /** Magnus's draft reply, for a ticket without a proposal. */
  readonly draft?: string
  /** A deadline someone else sets. */
  readonly deadline?: { readonly at: string; readonly text: string }
  /** A colleague writing an answer right now. */
  readonly typing?: PersonKey
}

/** "14:30" → minutes after midnight. */
export const minutes = (clock: string) => {
  const [h, m] = clock.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

const NOW = DEMO_NOW.hours * 60 + DEMO_NOW.minutes

export const TICKETS: ReadonlyArray<Ticket> = [
  {
    number: "5139",
    customerId: "felix-muller",
    handle: "+49 170 6655 0912",
    subject: "Harbor Raincoat in maat L",
    channel: "whatsapp",
    status: "nieuw",
    priority: "gemiddeld",
    assignee: null,
    labels: ["Voorraad", "VIP"],
    also: { kind: "chargeback", id: "CB-2291", label: "Chargeback CB-2291" },
    createdAt: "08:30",
    waitingSince: "08:30",
    unread: true,
    entries: [
      {
        kind: "customer",
        at: "08:30",
        text: "Is de Harbor Raincoat weer op voorraad in L? Ik wil hem graag voor het weekend."
      },
      { kind: "customer", at: "08:31", text: "Het mag ook de olijfgroene zijn." }
    ],
    draft:
      "Hoi Felix, de Harbor Raincoat in L is er weer: er kwamen vanochtend 18 stuks binnen bij Kestrel Goods. Als je vandaag bestelt, is hij er donderdag. Zal ik er een voor je apart houden?"
  },
  {
    number: "5140",
    customerId: "maria-garcia",
    handle: "@maria.garcia.style",
    subject: "Cascade Puffer in olijf?",
    channel: "instagram",
    status: "nieuw",
    priority: "laag",
    assignee: null,
    labels: ["Voor aankoop"],
    also: { kind: "product", id: "cascade-puffer", label: "Cascade Puffer" },
    createdAt: "09:20",
    waitingSince: "09:20",
    unread: true,
    entries: [
      {
        kind: "customer",
        at: "09:20",
        text: "Hebben jullie de Cascade Puffer ook in olijf? Zag hem in jullie laatste post."
      }
    ],
    draft:
      "Hoi Maria, de Cascade Puffer in olijf komt half december. Wil je een bericht als hij binnen is? Dan zet ik je op de lijst."
  },
  {
    number: "5141",
    customerId: "hannah-schmidt",
    handle: "hannah@example.com",
    subject: "Pakket kwijt bij DPD",
    channel: "email",
    status: "bezig",
    priority: "hoog",
    assignee: "elena",
    labels: ["Pakket kwijt", "Levering"],
    order: "5263",
    createdAt: "09:45",
    waitingSince: "13:40",
    unread: true,
    deadline: { at: "17:00", text: "DPD sluit claims om 17:00" },
    entries: [
      {
        kind: "customer",
        at: "09:45",
        text:
          "Hallo,\n\nMijn Field Pant (bestelling #5263) staat sinds dinsdag op ‘in transit’ bij DPD. De bezorgdatum is al voorbij en de track & trace verandert niet meer. Kunnen jullie kijken waar hij is?\n\nGroet,\nHannah"
      },
      {
        kind: "agent",
        agentId: "waar-is-mijn-bestelling",
        at: "09:47",
        text:
          "Hoi Hannah, ik zoek het voor je uit bij DPD. Je hoort vandaag nog van ons, hier in je mail.\n\nNorthwind Clothing"
      },
      {
        kind: "customer",
        at: "13:40",
        text: "Is er al nieuws? Ik had de broek nodig voor een reis op donderdag."
      },
      {
        kind: "event",
        at: "13:58",
        text:
          "Waar is mijn bestelling wees het ticket toe aan Elena Hart: DPD meldt het pakket sinds 18 nov als zoek. Een claim moet vandaag voor 17:00 binnen zijn."
      }
    ],
    draft:
      "Hoi Hannah, DPD heeft je pakket kwijtgeraakt, sorry daarvoor. We sturen vandaag een nieuwe Field Pant in maat 32 met spoed, dan is hij er woensdag, ruim voor je reis. De claim bij DPD regelen wij."
  },
  {
    number: "5142",
    customerId: "liam-oconnor",
    handle: "liam@example.com",
    subject: "Geld terug voor een sale-artikel",
    channel: "email",
    status: "bezig",
    priority: "gemiddeld",
    assignee: "sofia",
    labels: ["Terugbetaling"],
    order: "5297",
    createdAt: "10:04",
    waitingSince: "13:05",
    unread: false,
    typing: "sofia",
    entries: [
      {
        kind: "customer",
        at: "10:04",
        text:
          "Ik wil mijn geld terug voor de Heartland Henley uit bestelling #5297. Hij valt veel te ruim, ook in L.\n\nLiam"
      },
      {
        kind: "agent",
        agentId: "waar-is-mijn-bestelling",
        at: "10:06",
        text:
          "Hoi Liam, dat is vervelend. Hier kijkt een collega graag even naar: je hoort vandaag nog van ons, per mail."
      },
      {
        kind: "event",
        at: "10:06",
        text:
          "Overgedragen aan het team: klant vraagt om een terugbetaling van een sale-artikel, dat volgens het retourbeleid niet retourneerbaar is."
      },
      { kind: "customer", at: "13:05", text: "Hebben jullie al nieuws?" },
      {
        kind: "note",
        who: "sofia",
        at: "13:12",
        text: "@Elena kun jij de terugbetaling goedkeuren? € 45,40, buiten het beleid maar hij is vaste klant."
      }
    ]
  },
  {
    number: "5143",
    customerId: "olivier-dubois",
    handle: "olivier@example.com",
    subject: "Beschadigd aangekomen",
    channel: "email",
    status: "nieuw",
    priority: "gemiddeld",
    assignee: "sofia",
    labels: ["Beschadigd"],
    order: "5433",
    createdAt: "10:00",
    waitingSince: "10:00",
    unread: true,
    entries: [
      {
        kind: "customer",
        at: "10:00",
        text:
          "Bonjour,\n\nFoto in de bijlage: de doos kwam geplet aan en de Sailor Stripe Tee heeft een scheur bij de naad. Bestelling #5433.\n\nOlivier",
        attachment: "doos-geplet.jpg"
      }
    ],
    draft:
      "Hoi Olivier, dank je voor de foto. We sturen je vandaag een nieuwe Sailor Stripe Tee in XL; de beschadigde hoef je niet terug te sturen."
  },
  {
    number: "5144",
    customerId: "chris-lee",
    handle: "chris.lee@example.com",
    subject: "Wachtlijst voor de Cascade Puffer?",
    channel: "email",
    status: "bezig",
    priority: "laag",
    assignee: "elena",
    labels: ["VIP", "Voor aankoop"],
    also: { kind: "product", id: "cascade-puffer", label: "Cascade Puffer" },
    createdAt: "11:10",
    waitingSince: "11:10",
    unread: false,
    entries: [
      {
        kind: "customer",
        at: "11:10",
        text:
          "Hoi, ik wil graag op de lijst voor de Cascade Puffer als de nieuwe kleur uitkomt. Maat L, zoals altijd.\n\nChris"
      }
    ],
    draft:
      "Hoi Chris, je staat op de lijst voor de Cascade Puffer in L. Zodra de nieuwe kleur binnen is, krijg je als eerste een bericht, nog voor hij online staat."
  },
  {
    number: "5145",
    customerId: "daniel-brown",
    handle: "daniel.brown@example.com",
    subject: "Waar is mijn bestelling?",
    channel: "email",
    status: "bezig",
    priority: "gemiddeld",
    assignee: "ethan",
    labels: ["Levering"],
    order: "6451",
    createdAt: "12:20",
    waitingSince: "12:20",
    unread: false,
    entries: [
      {
        kind: "customer",
        at: "12:20",
        text:
          "Hallo,\n\nMijn bestelling van gisteren is verzonden, maar de track & trace van DPD doet het niet. Ik bereid een benefietavond voor en wil weten of hij er woensdag is.\n\nBedankt,\nDaniel"
      },
      {
        kind: "note",
        who: "ethan",
        at: "12:41",
        text: "DPD heeft het label pas om 12:30 gescand, de link werkt nu. Ik antwoord hem zo."
      }
    ],
    draft:
      "Hoi Daniel, je bestelling #6451 is onderweg met DPD en wordt woensdag bezorgd. De track & trace werkt nu; je vindt hem in je verzendmail."
  },
  {
    number: "5146",
    customerId: "luca-romano",
    handle: "luca.r@example.com",
    subject: "Bestelling #5309 nog steeds niet binnen",
    channel: "email",
    status: "bezig",
    priority: "hoog",
    assignee: null,
    labels: ["Levering"],
    order: "5309",
    createdAt: "12:40",
    waitingSince: "12:40",
    unread: false,
    approvalId: "korting-5146",
    entries: [
      {
        kind: "customer",
        at: "12:40",
        text:
          "Hoi,\n\nJullie beloofden mijn Sailor Stripe Tee op 19 november. Het is nu maandag en hij is er nog steeds niet. Wat is er aan de hand?\n\nLuca"
      },
      {
        kind: "agent",
        agentId: "waar-is-mijn-bestelling",
        at: "14:12",
        text:
          "Ik heb PostNL nagekeken: het pakket ligt sinds donderdag in het sorteercentrum in Nieuwegein en wordt morgen bezorgd. Je regel zegt excuses en 10% na 3 dagen vertraging, dus ik stel een code voor."
      }
    ]
  },
  {
    number: "5147",
    customerId: "bea-williams",
    handle: "bea@example.com",
    subject: "Probleem bij het afrekenen",
    channel: "email",
    status: "nieuw",
    priority: "hoog",
    assignee: "elena",
    labels: ["Techniek"],
    createdAt: "13:05",
    waitingSince: "13:05",
    unread: true,
    entries: [
      {
        kind: "customer",
        at: "13:05",
        text:
          "Ik heb drie keer geprobeerd af te rekenen en kreeg elke keer een 500-fout. Met Bancontact, op mijn telefoon.\n\nBea"
      }
    ],
    draft:
      "Hoi Bea, sorry voor het gedoe. We kijken naar de fout bij Bancontact. Wil je het intussen met iDEAL of je kaart proberen? Je winkelmandje staat nog klaar."
  },
  {
    number: "5148",
    customerId: "astrid-berg",
    handle: "astrid@example.com",
    subject: "Aurora too small, can I swap it?",
    channel: "email",
    status: "bezig",
    priority: "gemiddeld",
    assignee: "sofia",
    labels: ["Retour", "Maat"],
    order: "5296",
    createdAt: "13:30",
    waitingSince: "13:30",
    unread: false,
    approvalId: "omruil-5321",
    entries: [
      {
        kind: "customer",
        at: "13:30",
        text:
          "Hi,\n\nThe Aurora Hooded Fleece in S from order #5296 is too small, the sleeves are short. I started a return. Can I swap it for an M instead of getting my money back?\n\nThanks,\nAstrid"
      },
      {
        kind: "agent",
        agentId: "retouragent",
        at: "13:47",
        text:
          "Retour R-881 staat open met reden ‘valt te klein’. M is op voorraad (34 stuks). Ik stel een omruiling voor in plaats van terugbetalen, in het Engels zoals Astrid schreef."
      }
    ]
  },
  {
    number: "5149",
    customerId: "sofia-mendez",
    handle: "sofia.m@example.com",
    subject: "Waar blijft mijn Cascade Puffer?",
    channel: "email",
    status: "wacht",
    priority: "gemiddeld",
    assignee: "sofia",
    labels: ["Levering", "Leverancier"],
    order: "5424",
    also: { kind: "supplier", id: "kestrel-goods", label: "Kestrel Goods" },
    createdAt: "13:50",
    unread: false,
    entries: [
      {
        kind: "customer",
        at: "13:50",
        text: "Hola, mijn Cascade Puffer van 17 november is nog steeds niet onderweg. Kunnen jullie kijken?\n\nSofía"
      },
      {
        kind: "team",
        who: "sofia",
        at: "14:02",
        text:
          "Hoi Sofía, je jas komt van onze leverancier Kestrel Goods en is later verzonden dan beloofd. We hebben ze om een nieuwe datum gevraagd en laten het je vandaag nog weten."
      },
      {
        kind: "note",
        who: "sofia",
        at: "14:03",
        text: "Wacht op Kestrel. De Leveranciersopvolger heeft een tweede mail klaarstaan."
      }
    ]
  },
  {
    number: "5150",
    customerId: "yuki-tanaka",
    handle: "@yuki.t",
    subject: "Reactie op je story",
    channel: "instagram",
    status: "wacht",
    priority: "laag",
    assignee: "maya",
    labels: [],
    also: { kind: "product", id: "coastline-bomber-jacket", label: "Coastline Bomber Jacket" },
    createdAt: "14:05",
    unread: false,
    entries: [
      { kind: "customer", at: "14:05", text: "Mooie foto. Waar is deze jas van?" },
      {
        kind: "team",
        who: "maya",
        at: "14:11",
        text: "Dank je. Dat is de Coastline Bomber Jacket, de link staat in onze bio. Welke maat draag je meestal?"
      }
    ]
  },
  /* Done today. */
  {
    number: "5136",
    customerId: "nina-petrova",
    handle: "nina@example.com",
    subject: "Verzending naar Polen",
    channel: "winkelchat",
    status: "klaar",
    priority: "laag",
    assignee: null,
    labels: [],
    createdAt: "11:20",
    unread: false,
    entries: [
      { kind: "customer", at: "11:20", text: "Do you ship to Poland, and how long does it take?" },
      {
        kind: "agent",
        agentId: "waar-is-mijn-bestelling",
        at: "11:20",
        text: "Hi Nina, yes we do. Orders to Poland arrive in 4–6 working days, shipping is free above € 75."
      },
      { kind: "customer", at: "11:21", text: "Great, thanks!" },
      { kind: "event", at: "11:21", text: "Afgehandeld door Waar is mijn bestelling: levertijd uit de kennisbank." }
    ]
  },
  {
    number: "5137",
    customerId: "soren-nilsson",
    handle: "soren@example.com",
    subject: "Retourlabel voor #5301",
    channel: "email",
    status: "klaar",
    priority: "laag",
    assignee: null,
    labels: ["Retour", "Maat"],
    order: "5301",
    createdAt: "13:55",
    unread: false,
    entries: [
      {
        kind: "customer",
        at: "13:55",
        text: "Hej, de tote is kleiner dan ik dacht. Kan ik een retourlabel krijgen voor bestelling #5301?\n\nSoren"
      },
      {
        kind: "agent",
        agentId: "retouragent",
        at: "14:19",
        text: "Hoi Soren, je retourlabel zit in de bijlage. Breng het pakket binnen 14 dagen naar een UPS-punt."
      },
      { kind: "event", at: "14:19", text: "Afgehandeld door de Retouragent." }
    ]
  },
  {
    number: "5138",
    customerId: "maria-garcia",
    handle: "maria.garcia@example.com",
    subject: "Waar is mijn bestelling #5322?",
    channel: "email",
    status: "klaar",
    priority: "laag",
    assignee: null,
    labels: ["Levering"],
    order: "5322",
    createdAt: "14:26",
    unread: false,
    entries: [
      { kind: "customer", at: "14:26", text: "Waar blijft mijn bestelling #5322?" },
      {
        kind: "agent",
        agentId: "waar-is-mijn-bestelling",
        at: "14:28",
        text: "Hoi Maria, je pakket is bij DHL en wordt woensdag bezorgd. Je kunt het volgen met JJD000390007199."
      },
      { kind: "event", at: "14:28", text: "Afgehandeld door Waar is mijn bestelling." }
    ]
  }
]

export const ticket = (number: string, list: ReadonlyArray<Ticket> = TICKETS) =>
  list.find((t) => t.number === number.replace(/^#/, ""))

/* ── the busy week: long names, many rows (the current demo's `BUSY` tickets) ─────────────────── */

const FIRST = [
  "Maximiliaan",
  "Anne-Sophie",
  "Jan-Willem",
  "Wilhelmina",
  "Bartholomeus",
  "Charlotte-Louise",
  "Evangelina",
  "Constantijn",
  "Frederique",
  "Hendrikus"
]
const LAST = [
  "van Oostenbrugge-de Wolff",
  "Vanderhaeghen-Moerman",
  "Brinkman-Hoogendoorn",
  "de Clercq-Vermeulen",
  "van Lieshout-Brouwers",
  "Terlouw-van den Akker"
]

/** A busy-week name, for the `druk` view only: no customer record behind it. */
export const busyName = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`

export const BUSY_TICKETS: ReadonlyArray<Ticket> = Array.from({ length: 60 }, (_, i) => {
  const at = NOW - 20 - i * 9
  const clock = `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`
  return {
    number: String(5200 + i),
    customerId: `druk-${i}`,
    handle: `klant${i}@voorbeeldmail.nl`,
    subject: `${busyName(i)} vraagt waar bestelling #${
      5400 + i * 7
    } blijft, die volgens de bevestiging al vorige week geleverd had moeten zijn`,
    channel: (["email", "whatsapp", "instagram", "email"] as const)[i % 4] ?? "email",
    status: (["nieuw", "bezig", "wacht", "nieuw"] as const)[i % 4] ?? "nieuw",
    priority: (["hoog", "gemiddeld", "laag", "hoog"] as const)[i % 4] ?? "gemiddeld",
    assignee: i % 3 === 0 ? null : "elena",
    labels: ["Levering", "Leverancier"],
    createdAt: clock,
    waitingSince: i % 4 === 2 ? undefined : clock,
    unread: i % 5 === 0,
    entries: [
      {
        kind: "customer",
        at: clock,
        text: "Klant mailde twee keer en belde één keer. Track & trace staat al vijf dagen op ‘onderweg’."
      }
    ]
  }
})

/* ── the counts ────────────────────────────────────────────────────────────────────────────────── */

export const isOpen = (t: Ticket) => t.status !== "klaar"

/** How long the customer has waited on the team, in minutes; null when the ball is not with us. */
export const waitedMinutes = (t: Ticket) =>
  t.waitingSince === undefined || !isOpen(t) || t.status === "wacht" ? null : NOW - minutes(t.waitingSince)

/** "6 u", "4 u 30 min", "50 min". */
export function waited(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} u` : `${h} u ${m} min`
}

export const LONG_WAIT = 4 * 60

/** Open tickets: the rail's Inbox count, the menu, the inbox and the board. Twelve on the Monday. */
export const openTicketsOf = (list: ReadonlyArray<Ticket> = TICKETS) => list.filter(isOpen)
export const openTicketCount = (list: ReadonlyArray<Ticket> = TICKETS) => openTicketsOf(list).length

/** Open tickets whose customer has waited longer than four hours, longest first. */
export const waitingLong = (list: ReadonlyArray<Ticket> = TICKETS) =>
  openTicketsOf(list)
    .filter((t) => (waitedMinutes(t) ?? 0) > LONG_WAIT)
    .toSorted((a, b) => (waitedMinutes(b) ?? 0) - (waitedMinutes(a) ?? 0))

export const waitingLongCount = (list: ReadonlyArray<Ticket> = TICKETS) => waitingLong(list).length

/** Open tickets assigned to someone; `me` is the signed-in person. */
export const assignedTo = (who: PersonKey, list: ReadonlyArray<Ticket> = TICKETS) =>
  openTicketsOf(list).filter((t) => t.assignee === who)

export const unassigned = (list: ReadonlyArray<Ticket> = TICKETS) =>
  openTicketsOf(list).filter((t) => t.assignee === null)

export const doneToday = (list: ReadonlyArray<Ticket> = TICKETS) => list.filter((t) => t.status === "klaar")

export const byChannel = (channel: Channel, list: ReadonlyArray<Ticket> = TICKETS) =>
  openTicketsOf(list).filter((t) => t.channel === channel)

// The story's numbers, checked where the data is written: twelve open, three waiting over four hours.
if (openTicketCount() !== TODAY.openTickets) throw new Error("inbox: open tickets must equal TODAY.openTickets")
if (waitingLongCount() !== 3) throw new Error("inbox: three tickets wait longer than four hours")

/* ── templates for a new ticket ────────────────────────────────────────────────────────────────── */

export const TEMPLATES: ReadonlyArray<{
  readonly id: string
  readonly label: string
  readonly title: string
  readonly description: string
  readonly priority: Priority
  readonly labels: ReadonlyArray<string>
}> = [
  {
    id: "terugbetaling",
    label: "Verzoek om terugbetaling",
    title: "Verzoek om terugbetaling · ",
    description:
      "De klant vraagt om een terugbetaling. Controleer of de bestelling binnen de retourtermijn valt en of het artikel terug is, betaal dan terug en antwoord de klant.",
    priority: "gemiddeld",
    labels: ["Terugbetaling"]
  },
  {
    id: "leverancier",
    label: "Escalatie naar leverancier",
    title: "Vertraging bij leverancier · ",
    description:
      "Een bestelling is over de overdrachtsdatum heen. Vraag de leverancier om een verzenddatum en track & trace, en laat het de klant weten zodra je die hebt.",
    priority: "hoog",
    labels: ["Leverancier"]
  },
  {
    id: "feedback",
    label: "Feedback van klant",
    title: "Feedback van klant · ",
    description:
      "Feedback die het doorgeven waard is. Noteer wat er gezegd is, waar, en wie in het team het moet zien.",
    priority: "laag",
    labels: []
  }
]

/* ── team chat ─────────────────────────────────────────────────────────────────────────────────── */

/** People in the team chat who are not on the team: a supplier's own staff. */
export const GUESTS = {
  marco: { name: "Marco Rossi", role: "Accountmanager · Allure Fulfillment", supplierId: "allure-fulfillment" },
  jacob: { name: "Jacob", role: "Planner · DPC Apparel", supplierId: "dpc-apparel" }
} as const

export type GuestKey = keyof typeof GUESTS

export type ChatRef =
  | { readonly kind: "ticket"; readonly id: string }
  | { readonly kind: "order"; readonly id: string }
  | { readonly kind: "customer"; readonly id: string }
  | { readonly kind: "chargeback"; readonly id: string }
  | { readonly kind: "product"; readonly id: string }
  | { readonly kind: "supplier"; readonly id: string }

export type ChatMessage = {
  readonly id: string
  readonly from: { readonly kind: "person"; readonly who: PersonKey } | {
    readonly kind: "guest"
    readonly who: GuestKey
  } | { readonly kind: "agent"; readonly agentId: string }
  readonly at: string
  /** `**bold**` and `@Naam` are drawn; a record is linked through `refs`. */
  readonly text: string
  readonly refs?: ReadonlyArray<ChatRef>
  readonly reactions?: ReadonlyArray<{ readonly emoji: string; readonly count: number; readonly mine?: boolean }>
  readonly replies?: ReadonlyArray<Omit<ChatMessage, "replies">>
  readonly pinned?: boolean
}

export type Conversation = {
  readonly id: string
  readonly kind: "kanaal" | "prive"
  /** A channel's name without the hash, or the other person's name. */
  readonly name: string
  readonly topic: string
  readonly members: ReadonlyArray<
    { readonly kind: "person"; readonly who: PersonKey } | { readonly kind: "guest"; readonly who: GuestKey }
  >
  readonly unread: number
  readonly messages: ReadonlyArray<ChatMessage>
}

const p = (who: PersonKey) => ({ kind: "person" as const, who })
const g = (who: GuestKey) => ({ kind: "guest" as const, who })

export const CONVERSATIONS: ReadonlyArray<Conversation> = [
  {
    id: "klantenservice",
    kind: "kanaal",
    name: "klantenservice",
    topic: "Vragen en escalaties van klanten",
    members: [p("elena"), p("sofia"), p("ethan"), p("liam")],
    unread: 2,
    messages: [
      {
        id: "k1",
        from: p("ethan"),
        at: "09:14",
        text: "Goedemorgen. Hannah Schmidt mailt over **#5263**: DPD meldt het pakket sinds 18 nov als zoek.",
        refs: [{ kind: "ticket", id: "5141" }, { kind: "order", id: "5263" }],
        reactions: [{ emoji: "👀", count: 2, mine: true }],
        replies: [
          {
            id: "k1a",
            from: p("sofia"),
            at: "09:21",
            text: "Weet DPD tot wanneer we een claim kunnen indienen?"
          },
          {
            id: "k1b",
            from: p("ethan"),
            at: "09:26",
            text: "Vandaag tot 17:00, daarna moet het via hun klantenservice en duurt het weken."
          },
          {
            id: "k1c",
            from: p("elena"),
            at: "09:31",
            text: "Dan pak ik hem vanmiddag. Zet het als notitie bij het ticket zodat we het later terugvinden.",
            reactions: [{ emoji: "👍", count: 2 }]
          }
        ]
      },
      {
        id: "k2",
        from: p("sofia"),
        at: "10:33",
        text:
          "De Aurora-retouren lopen nog steeds op: 21 van de 26 terugbetalingen vorige week waren ‘valt te klein’. De nieuwe maattabel staat sinds 20 nov online.",
        refs: [{ kind: "product", id: "aurora-hooded-fleece" }]
      },
      {
        id: "k3",
        from: p("liam"),
        at: "11:45",
        text:
          "Nieuwe chargeback van Klarna op **#5318**: CB-2291, € 129,00. Antwoord moet uiterlijk morgen 12:00 binnen zijn.",
        refs: [{ kind: "chargeback", id: "CB-2291" }, { kind: "order", id: "5318" }],
        pinned: true
      },
      {
        id: "k4",
        from: { kind: "agent", agentId: "chargebacks" },
        at: "11:52",
        text:
          "Het bewijspakket voor CB-2291 is opgesteld: bezorgbevestiging, de mails met Felix Muller en de factuur. Indienen bij Klarna wacht op een collega.",
        refs: [{ kind: "chargeback", id: "CB-2291" }]
      },
      {
        id: "k5",
        from: p("sofia"),
        at: "14:16",
        text: "Ik neem de winkelchats tot vier uur. @Ethan kun jij #5145 afronden?",
        refs: [{ kind: "ticket", id: "5145" }]
      }
    ]
  },
  {
    id: "fulfilment",
    kind: "kanaal",
    name: "fulfilment",
    topic: "Uitgaande zendingen en uitzonderingen",
    members: [p("elena"), p("liam"), p("ethan")],
    unread: 0,
    messages: [
      {
        id: "f1",
        from: p("liam"),
        at: "09:30",
        text:
          "Kestrel Goods heeft 6 bestellingen langer dan 5 dagen onderweg. Hun levertijd staat op 6,1 dagen, belofte 5.",
        refs: [{ kind: "supplier", id: "kestrel-goods" }],
        reactions: [{ emoji: "😬", count: 2 }]
      },
      {
        id: "f2",
        from: { kind: "agent", agentId: "leveranciers" },
        at: "11:30",
        text: "Een tweede mail aan Kestrel Goods staat klaar en wacht op je ja. Hun kantoor sluit om 16:00.",
        refs: [{ kind: "supplier", id: "kestrel-goods" }]
      },
      {
        id: "f3",
        from: p("ethan"),
        at: "12:30",
        text: "DPD heeft de labels van vanochtend pas om 12:30 gescand. #6451 is nu onderweg.",
        refs: [{ kind: "order", id: "6451" }]
      }
    ]
  },
  {
    id: "operations",
    kind: "kanaal",
    name: "operations",
    topic: "Dagelijkse stand-up van operations",
    members: [p("elena"), p("sofia"), p("liam"), p("maya")],
    unread: 1,
    messages: [
      {
        id: "o1",
        from: p("elena"),
        at: "09:02",
        text:
          "Let op: de Klarna-deadline voor CB-2291 is morgen 12:00. Het bewijs staat klaar, ik dien het vanmiddag in.",
        refs: [{ kind: "chargeback", id: "CB-2291" }],
        pinned: true
      },
      {
        id: "o2",
        from: p("maya"),
        at: "13:40",
        text: "De Instagram-post van 11:40 doet het goed: twee keer zo druk als vorige maandag rond twaalf uur."
      }
    ]
  },
  {
    id: "allure-fulfillment",
    kind: "kanaal",
    name: "allure-fulfillment",
    topic: "Afhandeling met Allure Fulfillment",
    members: [p("elena"), p("sofia"), g("marco")],
    unread: 0,
    messages: [
      {
        id: "a1",
        from: p("sofia"),
        at: "vr 20 nov",
        text:
          "Hoi Marco, de Aurora valt klein in S: 21 van de 26 terugbetalingen zijn ‘valt te klein’. Ik heb de maattabel vandaag aangepast. Kunnen jullie de volgende levering nameten?",
        refs: [{ kind: "product", id: "aurora-hooded-fleece" }]
      },
      {
        id: "a2",
        from: g("marco"),
        at: "vr 20 nov",
        text: "Doen we. Ik stuur de metingen van de nieuwe partij zodra die binnen is."
      },
      {
        id: "a3",
        from: g("marco"),
        at: "10:21",
        text:
          "De partij van vandaag is nagemeten: de S is 2 cm smaller dan de tabel van oktober. Bestand komt vanmiddag."
      }
    ]
  },
  {
    id: "dpc-apparel",
    kind: "kanaal",
    name: "dpc-apparel",
    topic: "Afhandeling met DPC Apparel",
    members: [p("elena"), g("jacob")],
    unread: 1,
    messages: [
      {
        id: "d1",
        from: g("jacob"),
        at: "08:05",
        text: "Mariner Wool Beanie wordt aangevuld: 800 stuks onderweg, in het magazijn op donderdag.",
        refs: [{ kind: "product", id: "mariner-wool-beanie" }]
      }
    ]
  },
  {
    id: "maya-roy",
    kind: "prive",
    name: "Maya Roy",
    topic: "Privébericht",
    members: [p("elena"), p("maya")],
    unread: 0,
    messages: [
      {
        id: "m1",
        from: p("elena"),
        at: "gisteren",
        text: "Kun jij de Franse teksten van de Cascade Puffer en de Coastline Bomber Jacket doen?"
      },
      { id: "m2", from: p("maya"), at: "gisteren", text: "Helder. Ik doe de Franse vertalingen vandaag." }
    ]
  },
  {
    id: "sofia-kim",
    kind: "prive",
    name: "Sofía Kim",
    topic: "Privébericht",
    members: [p("elena"), p("sofia")],
    unread: 0,
    messages: [
      {
        id: "s1",
        from: p("sofia"),
        at: "13:13",
        text: "Ik heb je in #5142 genoemd, de terugbetaling van Liam. Ik schrijf hem intussen al een antwoord.",
        refs: [{ kind: "ticket", id: "5142" }]
      }
    ]
  }
]

/** Unread team-chat messages: the menu's Teamchat count. */
export const teamChatUnread = () => CONVERSATIONS.reduce((n, c) => n + c.unread, 0)

/* ── store chat ────────────────────────────────────────────────────────────────────────────────── */

export type StoreLine = {
  readonly from: "visitor" | "agent" | "team"
  readonly who?: PersonKey
  readonly at: string
  readonly text: string
}

export type StoreChat = {
  readonly id: string
  readonly about: string
  /** The visitor: a customer when they are signed in, otherwise where they are. */
  readonly visitor: string
  readonly customerId?: string
  readonly place: string
  /** The page they are on, and what is in their cart. */
  readonly page: string
  readonly cart?: string
  readonly startedAt: string
  readonly state: "overgedragen" | "afgehandeld"
  /** Why the agent handed it over, or what it settled. */
  readonly summary: string
  readonly who?: PersonKey
  readonly lines: ReadonlyArray<StoreLine>
}

const OPEN_DETAIL: Readonly<Record<string, Omit<StoreChat, "id" | "about" | "state">>> = {
  "chat-levertijd": {
    visitor: "Milan Peeters",
    customerId: "milan-peeters",
    place: "Brugge",
    page: "Cascade Puffer",
    cart: "Cascade Puffer, maat M",
    startedAt: "14:25",
    who: "sofia",
    summary: "Vraagt of een bestelling van vandaag vrijdag in Brugge is; de Cascade Puffer komt van Kestrel Goods.",
    lines: [
      { from: "visitor", at: "14:25", text: "Hoi, als ik vandaag bestel, is het er dan vrijdag in Brugge?" },
      {
        from: "agent",
        at: "14:25",
        text: "Hoi Milan, naar België duurt het 2 tot 3 werkdagen met PostNL. Om welk artikel gaat het?"
      },
      { from: "visitor", at: "14:26", text: "De Cascade Puffer, in M." },
      {
        from: "agent",
        at: "14:26",
        text: "Die komt van een andere leverancier, daar kijkt een collega even naar. Een moment."
      },
      {
        from: "team",
        who: "sofia",
        at: "14:27",
        text: "Hoi Milan, ik ben Sofía. Ik kijk het voor je na bij onze leverancier."
      }
    ]
  },
  "chat-aurora": {
    visitor: "Bezoeker uit Gent",
    place: "Gent",
    page: "Aurora Hooded Fleece",
    cart: "Aurora Hooded Fleece, maat M",
    startedAt: "14:27",
    who: "sofia",
    summary: "Twijfelt tussen M en L; draagt normaal M bij andere merken.",
    lines: [
      { from: "visitor", at: "14:27", text: "Valt de Aurora klein? Ik twijfel tussen M en L." },
      {
        from: "agent",
        at: "14:27",
        text:
          "De maattabel is op 20 november bijgewerkt: de Aurora valt iets kleiner dan je gewend bent. Wat draag je bij andere merken?"
      },
      { from: "visitor", at: "14:28", text: "Normaal M, maar ik wil hem wat ruimer." },
      { from: "agent", at: "14:28", text: "Dan zet ik er een collega bij die de maten kent." }
    ]
  },
  "chat-korting": {
    visitor: "Thomas Claes",
    customerId: "thomas-claes",
    place: "Hasselt",
    page: "Afrekenen",
    cart: "Coastline Bomber Jacket, maat L",
    startedAt: "14:29",
    who: "sofia",
    summary: "De code uit de Coastline-mail geeft een fout bij het afrekenen; codes regelt de agent niet zelf.",
    lines: [
      { from: "visitor", at: "14:29", text: "De code COASTLINE20 uit jullie mail werkt niet bij het afrekenen." },
      {
        from: "agent",
        at: "14:29",
        text: "Vervelend. Kortingscodes kan ik niet zelf aanpassen; ik haal er een collega bij."
      }
    ]
  }
}

/** The chats open now (`OPEN_STORE_CHATS`, Live's count), then the ones the agent settled today. */
export const STORE_CHATS: ReadonlyArray<StoreChat> = [
  ...OPEN_STORE_CHATS.map((c) => {
    const detail = OPEN_DETAIL[c.id]
    if (detail === undefined) throw new Error(`inbox: no detail for store chat ${c.id}`)
    return { id: c.id, about: c.about, state: "overgedragen" as const, ...detail }
  }),
  {
    id: "chat-maat-1408",
    about: "Maat van de Aurora",
    visitor: "Lena Vos",
    customerId: "lena-vos",
    place: "Haarlem",
    page: "Aurora Hooded Fleece",
    startedAt: "14:08",
    state: "afgehandeld",
    summary: "Maattabel gedeeld; ze koos L.",
    lines: [
      { from: "visitor", at: "14:08", text: "Welke maat moet ik nemen als ik 1,72 m ben?" },
      {
        from: "agent",
        at: "14:08",
        text:
          "Bij 1,72 m past de M meestal, maar de Aurora valt iets klein. Wil je hem ruimer, neem dan L. De maattabel staat onder de foto's."
      },
      { from: "visitor", at: "14:09", text: "Dan L. Dank je." }
    ]
  },
  {
    id: "chat-polen",
    about: "Verzending naar Polen",
    visitor: "Nina Petrova",
    customerId: "nina-petrova",
    place: "Warschau",
    page: "Verzending",
    startedAt: "11:20",
    state: "afgehandeld",
    summary: "Levertijd naar Polen uit de kennisbank: 4 tot 6 werkdagen.",
    lines: [
      { from: "visitor", at: "11:20", text: "Do you ship to Poland, and how long does it take?" },
      {
        from: "agent",
        at: "11:20",
        text: "Hi Nina, yes we do. Orders to Poland arrive in 4–6 working days, shipping is free above € 75."
      },
      { from: "visitor", at: "11:21", text: "Great, thanks!" }
    ]
  }
]

/** Store chats open now; equals `openStoreChats()` in `demo.ts`. */
export const openStoreChatCount = () => STORE_CHATS.filter((c) => c.state === "overgedragen").length
