import type { Tone } from "../ui/badge.tsx"

/*
 * Northwind's orders as the kit's list example shows them: fictional customers and the demo's
 * products, placed in the week of 16 to 22 November 2026. Nothing here is real.
 */

export type OrderStatus = "betaald" | "verzonden" | "vertraagd" | "retour" | "terugbetaald"

export const STATUS: Readonly<Record<OrderStatus, { readonly label: string; readonly tone: Tone }>> = {
  betaald: { label: "Betaald", tone: "neutral" },
  verzonden: { label: "Verzonden", tone: "good" },
  vertraagd: { label: "Vertraagd", tone: "warn" },
  retour: { label: "Retour aangevraagd", tone: "accent" },
  terugbetaald: { label: "Terugbetaald", tone: "bad" }
}

export type Order = {
  readonly id: string
  readonly number: string
  readonly customer: string
  readonly product: string
  readonly carrier: "PostNL" | "DPD" | "DHL"
  readonly total: number
  readonly placed: string
  readonly status: OrderStatus
  readonly labels: ReadonlyArray<string>
}

export const ORDERS: ReadonlyArray<Order> = [
  {
    id: "o1",
    number: "4821",
    customer: "Astrid Berg",
    product: "Aurora Hooded Fleece",
    carrier: "PostNL",
    total: 79,
    placed: "22 nov",
    status: "retour",
    labels: ["Maat"]
  },
  {
    id: "o2",
    number: "4820",
    customer: "Hannah Schmidt",
    product: "Coastline Bomber Jacket",
    carrier: "DHL",
    total: 149,
    placed: "22 nov",
    status: "vertraagd",
    labels: ["Kestrel Goods"]
  },
  {
    id: "o3",
    number: "4819",
    customer: "Maria Garcia",
    product: "Drift Crewneck",
    carrier: "PostNL",
    total: 59,
    placed: "21 nov",
    status: "verzonden",
    labels: []
  },
  {
    id: "o4",
    number: "4818",
    customer: "Chris Lee",
    product: "Sailor Stripe Tee",
    carrier: "DPD",
    total: 32,
    placed: "21 nov",
    status: "verzonden",
    labels: ["Vaste klant"]
  },
  {
    id: "o5",
    number: "4817",
    customer: "Soren Nilsson",
    product: "Aurora Hooded Fleece",
    carrier: "PostNL",
    total: 158,
    placed: "20 nov",
    status: "terugbetaald",
    labels: ["Maat"]
  },
  {
    id: "o6",
    number: "4816",
    customer: "Felix Muller",
    product: "Black Cedar",
    carrier: "DHL",
    total: 45,
    placed: "20 nov",
    status: "betaald",
    labels: []
  },
  {
    id: "o7",
    number: "4815",
    customer: "Noah Bakker",
    product: "Coastline Bomber Jacket",
    carrier: "DPD",
    total: 149,
    placed: "19 nov",
    status: "vertraagd",
    labels: ["Kestrel Goods"]
  },
  {
    id: "o8",
    number: "4814",
    customer: "Lena Vos",
    product: "Drift Crewneck",
    carrier: "PostNL",
    total: 118,
    placed: "18 nov",
    status: "verzonden",
    labels: ["Vaste klant"]
  },
  {
    id: "o9",
    number: "4813",
    customer: "Luca Romano",
    product: "Sailor Stripe Tee",
    carrier: "DPD",
    total: 64,
    placed: "17 nov",
    status: "verzonden",
    labels: []
  }
]

/** The list says this many in all; the fixture is the first page. */
export const ORDER_TOTAL = 312
