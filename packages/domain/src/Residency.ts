/*
 * Where Insyte keeps a workspace's data, and who else handles some of it (security.md §6 "Residency", ADR-0022). The
 * same for every workspace: only the EU is built, so this is a fact of the platform, not a setting. When the platform
 * changes (a new store of data, another service), this list changes in the same pull request. It lives here, beside
 * the permissions, because both Je gegevens' read (`modules/privacy`) and the design app's demo of it say it.
 */

export interface Place {
  readonly what: string
  readonly where: string
}

export interface SubProcessor {
  readonly name: string
  readonly purpose: string
  readonly where: string
  /** Some of what it handles may leave the EU. */
  readonly outsideEu: boolean
}

export const PLACES: ReadonlyArray<Place> = [
  { what: "Database", where: "Frankfurt, Duitsland (Neon, AWS eu-central-1)" },
  { what: "Bestanden en exports", where: "Europese Unie (Cloudflare R2, EU-jurisdictie)" },
  { what: "Wachtrijen en achtergrondtaken", where: "Europese Unie (Cloudflare, EU-jurisdictie)" },
  { what: "Versleuteling", where: "Alles versleuteld opgeslagen; winkelsleutels nog eens apart verzegeld" }
]

export const SUB_PROCESSORS: ReadonlyArray<SubProcessor> = [
  {
    name: "Cloudflare",
    purpose: "Hosting en het netwerk waarover Insyte draait",
    where: "Opslag in de EU; verkeer wordt wereldwijd doorgegeven",
    outsideEu: true
  },
  { name: "Neon", purpose: "De database", where: "Frankfurt, Duitsland", outsideEu: false },
  {
    name: "Resend",
    purpose: "E-mail die Insyte namens je verstuurt",
    where: "Verzending vanuit de EU; gegevens over verzending in de VS",
    outsideEu: true
  },
  {
    name: "Anthropic",
    purpose: "Het taalmodel achter concepten en de Insyte-agent",
    where: "Verenigde Staten",
    outsideEu: true
  },
  { name: "Stripe", purpose: "Abonnement en betalingen", where: "Verenigde Staten en EU", outsideEu: true },
  {
    name: "Google en Microsoft",
    purpose: "Alleen je eigen gekoppelde accounts, zoals een mailbox",
    where: "Waar je eigen account staat",
    outsideEu: true
  }
]
