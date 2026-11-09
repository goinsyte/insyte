import { useNavigate } from "@tanstack/react-router"
import { type ReactNode, useMemo } from "react"
import { create } from "zustand"
import { suppliers as seeded } from "../../data-source"
import { Mail, Pause, Send } from "../../icons"
import { useProducts } from "../hooks/use-operator-data"
import { counted } from "../lib/bulk"
import { stockOf, supplierStats, unitsOf } from "../lib/catalog"
import type { Supplier } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { DemoAreaEmpty, ListClosing } from "../marketing-sections/closings"
import { useGate } from "../stores/access-store"
import { useForwarding } from "../stores/forwarding-store"
import { SOLD90, THRESHOLD, useAllComplaints, useQuality } from "../stores/quality-store"
import { useTeam } from "../stores/team-store"
import { useWorkspace } from "../stores/workspace-store"
import { invitePortal, PortalInviteDialog, PortalSection } from "./portal-invite"
import {
  type ApiState,
  type SupplierQuality,
  type SupplierRow as Row,
  type SuppliersSource,
  SuppliersSourceProvider
} from "./source"

/*
 * The suppliers page in the design app: the demo's suppliers scored from its orders store, the quality columns from
 * its quality store (PLAN 26), forwarding preferences from the forwarding store (PLAN 24), the portal from the team
 * store, and suppliers added or edited here kept in this session's own little store.
 */

const SUPPLIER_CHAT: Record<string, string> = { sup_allure: "conv_supplier_allure", sup_dpc: "conv_supplier_dpc" }

type Local = {
  added: ReadonlyArray<Supplier>
  edits: Record<string, Partial<Supplier> & { description?: string; leadDays?: number }>
  /** Their API as connected here; the seed's connected suppliers start at a demo address. */
  apis: Record<string, ApiState>
}
const useLocal = create<Local>(() => ({
  added: [],
  edits: {},
  apis: Object.fromEntries(
    seeded.filter((s) => s.api_connected).map((s) => [s.id, {
      url: `https://api.${s.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.example/insyte/orders`,
      lastPing: { ok: true, ms: 42, at: Date.now() - 3_600_000 }
    }])
  )
}))

function pauseOrResume(rows: ReadonlyArray<Row>) {
  const ws = useWorkspace.getState()
  const before = ws.pausedSuppliers
  for (const r of rows) ws.toggleSupplierPause(r.id)
  undoable(
    rows.length === 1 ?
      `${rows[0]?.name} ${rows[0]?.paused ? "hervat" : "gepauzeerd voor nieuwe bestellingen"}` :
      `${counted(rows.length, "leverancier", "leveranciers")} omgezet`,
    () => useWorkspace.setState({ pausedSuppliers: before })
  )
}

const ACTIONS: SuppliersSource["actions"] = [
  {
    id: "portal",
    label: "Uitnodigen voor het portaal",
    icon: Send,
    group: "Portaal",
    shortcut: "u",
    bar: true,
    applies: (r) => r.portal !== "active",
    run: (rows) => invitePortal(rows.map((r) => r.supplier))
  },
  {
    id: "pause",
    label: "Nieuwe bestellingen pauzeren of hervatten",
    icon: Pause,
    group: "Bestellingen",
    shortcut: "p",
    bar: true,
    run: (rows) => pauseOrResume(rows)
  },
  {
    id: "email",
    label: "E-mailen",
    icon: Mail,
    group: "Contact",
    shortcut: "m",
    bar: true,
    run: (rows) => {
      window.location.href = `mailto:?bcc=${encodeURIComponent(rows.map((r) => r.supplier.contact_email).join(","))}`
    }
  }
]

const standing = (rows: ReadonlyArray<Row>) => {
  const late = rows.reduce((n, r) => n + r.delayed, 0)
  const live = rows.filter((r) => r.supplier.stock_indicator === "live").length
  return `${rows.length} ${rows.length === 1 ? "leverancier" : "leveranciers"} · ${
    late === 0 ? "geen vertraging" : `${late} ${late === 1 ? "vertraagde bestelling" : "vertraagde bestellingen"}`
  } · ${live} met live voorraad · ${rows.filter((r) => r.portal === "active").length} in het portaal`
}

function useDemoDetail(row: Row | null) {
  const { data: products } = useProducts()
  const orders = useWorkspace((s) => s.orders)
  return useMemo(() => ({
    products: products.filter((p) => p.supplier_id === row?.id).map((p) => ({
      id: p.id,
      title: p.title,
      units: unitsOf(p),
      stock: stockOf(p)
    })),
    late: orders.filter(
      (o) =>
        row !== null && o.tags.includes("at_risk") && o.status !== "cancelled" && o.status !== "refunded" &&
        o.line_items.some((li) => li.supplier_id === row.id)
    ).map((o) => ({ id: o.id, number: o.number }))
  }), [products, orders, row])
}

const DemoEmpty = () => <DemoAreaEmpty area="suppliers" />
const DemoClosing = ({ empty, onInvite }: { empty: boolean; onInvite: () => void }) => (
  <ListClosing area="suppliers" empty={empty} onInvite={onInvite} />
)

const ALLOWED = { ok: true, reason: "" }
const PORTAL = { Section: PortalSection, InviteDialog: PortalInviteDialog }
const NONE: ReadonlyArray<string> = []

export function DemoSuppliersSource({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { data: products } = useProducts()
  const orders = useWorkspace((s) => s.orders)
  const paused = useWorkspace((s) => s.pausedSuppliers)
  const portal = useTeam((s) => s.portal)
  const { added, edits, apis } = useLocal()
  const gate = useGate("suppliers", 2)
  const all = useMemo(
    () => [...seeded, ...added].map((s) => ({ ...s, ...edits[s.id] })),
    [added, edits]
  )

  const rows = useMemo<Array<Row>>(
    () =>
      supplierStats(all, products, orders).map((st) => ({
        ...st,
        id: st.supplier.id,
        name: st.supplier.name,
        paused: paused.includes(st.supplier.id),
        portal: portal[st.supplier.id]?.status ?? "none"
      })),
    [all, products, orders, paused, portal]
  )
  // Complaint rate and checks passed per supplier (PLAN 26), over its products' last 90 days.
  const checks = useQuality((st) => st.checks)
  const complaints = useAllComplaints()
  const quality = useMemo(() => {
    const out = new Map<string, SupplierQuality>()
    for (const sup of all) {
      const mine = products.filter((p) => p.supplier_id === sup.id).map((p) => p.id)
      const sold = mine.reduce((n, id) => n + (SOLD90[id] ?? 0), 0)
      const n = complaints.filter((c) => mine.includes(c.productId)).length
      const judged = checks.filter((c) =>
        c.supplierId === sup.id && (c.status === "approved" || c.status === "rejected")
      )
      const rate = sold > 0 ? n / sold : 0
      out.set(sup.id, {
        rate,
        over: rate > THRESHOLD,
        complaints: n,
        sold,
        passed: judged.filter((c) => c.status === "approved").length,
        judged: judged.length
      })
    }
    return out
  }, [all, checks, complaints, products])
  const prefs = useForwarding((s) => s.prefs)

  const source: SuppliersSource = {
    rows,
    standing,
    hidden: NONE,
    actions: ACTIONS,
    qualityOf: (id) => quality.get(id),
    pauseOrResume,
    useDetail: useDemoDetail,
    prefOf: (id) => prefs[id] ?? { via: "portal", auto: false },
    setPref: (row, patch, said) => {
      const before = prefs[row.id] ?? { via: "portal" as const, auto: false }
      useForwarding.getState().setPref(row.id, patch)
      undoable(said, () => useForwarding.getState().setPref(row.id, before))
    },
    forwardGate: gate,
    api: {
      stateOf: (id) => apis[id] ?? null,
      hookOf: (id) => `https://api.goinsyte.com/hooks/supplier/${id}`,
      connect: async (row, url) => {
        const before = useLocal.getState().apis[row.id] ?? null
        useLocal.setState((s) => ({ apis: { ...s.apis, [row.id]: { url, lastPing: null } } }))
        undoable(`API van ${row.name} gekoppeld`, () =>
          useLocal.setState((s) => ({ apis: { ...s.apis, [row.id]: before } })))
        return `whsec_demo${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`
      },
      test: async (row) => {
        const at = Date.now()
        useLocal.setState((s) => {
          const current = s.apis[row.id]
          return current ? { apis: { ...s.apis, [row.id]: { ...current, lastPing: { ok: true, ms: 42, at } } } } : s
        })
        return { ok: true, ms: 42, reason: null }
      },
      disconnect: (row) => {
        const before = useLocal.getState().apis[row.id] ?? null
        useLocal.setState((s) => ({ apis: { ...s.apis, [row.id]: null } }))
        undoable(`API van ${row.name} ontkoppeld`, () =>
          useLocal.setState((s) => ({ apis: { ...s.apis, [row.id]: before } })))
      }
    },
    restock: (row, low) => {
      const ws = useWorkspace.getState()
      const made = low.map((p) =>
        ws.createTicket({
          title: `${p.title} bijbestellen bij ${row.name}`,
          description: `Van ${p.title} zijn nog ${p.units ?? 0} stuks over. Vraag ${row.name} wanneer er nieuwe voorraad komt.`,
          priority: p.units === 0 ? "high" : "medium",
          status: "awaiting_reply",
          tags: ["Leverancier"]
        })
      )
      undoable(
        `${counted(made.length, "bijbestelling", "bijbestellingen")} gestuurd naar ${row.name}`,
        () => useWorkspace.setState((s) => ({ tickets: s.tickets.filter((t) => !made.some((m) => m.id === t.id)) }))
      )
    },
    chatOf: (row) => SUPPLIER_CHAT[row.id],
    openChat: (id) => void navigate({ to: "/chats", search: { id } as never }),
    portal: PORTAL,
    canCreate: ALLOWED,
    save: (input, row) => {
      if (row) {
        useLocal.setState((s) => ({
          edits: {
            ...s.edits,
            [row.id]: {
              name: input.name,
              contact_email: input.contactEmail,
              ...(input.contactPhone === "" ? {} : { contact_phone: input.contactPhone }),
              description: input.description,
              leadDays: input.leadDays
            }
          }
        }))
        undoable(`${input.name} opgeslagen`, () =>
          useLocal.setState((s) => {
            const { [row.id]: _, ...rest } = s.edits
            return { edits: rest }
          }))
        return
      }
      const made: Supplier = {
        id: `sup_demo_${Date.now().toString(36)}`,
        name: input.name,
        contact_email: input.contactEmail,
        ...(input.contactPhone === "" ? {} : { contact_phone: input.contactPhone }),
        status: "active",
        api_connected: false,
        stock_indicator: "none",
        assigned_product_count: 0,
        created_at: new Date().toISOString()
      }
      useLocal.setState((s) => ({ added: [...s.added, made] }))
      undoable(`${input.name} toegevoegd`, () =>
        useLocal.setState((s) => ({ added: s.added.filter((a) => a.id !== made.id) })))
    },
    inputOf: (row) => ({
      name: row.name,
      contactEmail: row.supplier.contact_email,
      contactPhone: row.supplier.contact_phone ?? "",
      description: edits[row.id]?.description ?? "",
      leadDays: edits[row.id]?.leadDays ?? 2
    }),
    Empty: DemoEmpty,
    Closing: DemoClosing
  }
  return <SuppliersSourceProvider value={source}>{children}</SuppliersSourceProvider>
}

