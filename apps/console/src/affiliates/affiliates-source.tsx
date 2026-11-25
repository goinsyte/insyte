import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  AffiliateList,
  AffiliateRow,
  ApplicationRow as ServerApplication,
  InviteRow as ServerInvite,
  PayoutLine,
  PayoutsView,
  ProgramView,
  ResourceRow
} from "@insyte/modules/affiliates/domain/Affiliates"
import { METHOD_LABEL, type PortalResource, TIER_LABEL } from "@insyte/ui/app/affiliate/source"
import type {
  AffiliatesSource,
  ApplicationRow,
  InviteRow,
  PayoutRow,
  PayoutsMonth,
  ProgramAffiliateRow,
  Said
} from "@insyte/ui/app/affiliates/source"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AFFILIATES,
  affiliatesListAtom,
  affiliatesWrites,
  applicationsAtom,
  inviteLinkAtom,
  invitesAtom,
  payoutsAtom,
  resourcesAtom
} from "../data/affiliates.ts"
import { useAtomSetInTurn } from "../data/in-turn.ts"
import { fetchInTab } from "../data/tab-workspace.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * The affiliates page's source in the console (M16 steps 3–5): `Affiliates.*` as the design's. Amounts come in minor
 * units and go out in whole ones. Every write hands back its undo ticket, spent by "Ongedaan maken" through
 * `Shared.undo`. Approving a month and marking it paid are Affiliates · Beheren; the running month "loopt nog" and
 * approves nothing. A code Shopify would not take says so on the affiliate, with "Opnieuw proberen". The material goes
 * up through `PUT /api/affiliates/resources` and down through `GET /api/affiliates/resources/:id`.
 */

const COPY: RefusalCopy = {
  gone: "Dat is er niet meer",
  conflicts: {
    month_open: ["Deze maand loopt nog", "Goedkeuren kan zodra de maand voorbij is."],
    not_approved: ["Nog niet goedgekeurd", "Keur de uitbetaling eerst goed."],
    nothing_to_approve: ["Niets te keuren", "Alles van deze maand is al goedgekeurd of zit nog in de retourtermijn."],
    approved: ["Al goedgekeurd", "Iemand anders was je voor."],
    rejected: ["Al afgewezen", "Iemand anders was je voor."]
  },
  invalid: {
    code: "Die code is al in gebruik. Kies een andere.",
    affiliate: "Dat adres hoort al bij een affiliate.",
    invited: "Dat adres is al uitgenodigd.",
    format: "Vul een geldig e-mailadres in.",
    reference: "De referentie is te lang."
  }
}

const UPLOAD: Record<number, [string, string]> = {
  401: ["Je bent uitgelogd", "Log opnieuw in en probeer het nog eens."],
  403: ["Dat kan je rol niet", "Materiaal uploaden vraagt Affiliates · Bewerken."],
  413: ["Dat bestand is te groot", "Materiaal mag tot 25 MB per bestand zijn."],
  415: ["Dit soort bestand kan niet", "Een afbeelding, een PDF, een MP4 of een ZIP kan wel."],
  422: ["Dat kan zo niet", "Kijk het bestand nog eens na."]
}

const monthYear = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" })
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const monthLabel = (month: string) => capital(monthYear.format(new Date(`${month}-15T12:00:00Z`)))
const minor = (n: number) => n / 100
const sizeOf = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`

const refused = (error: unknown) => sayRefusal(error, COPY)

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

const affiliateOf = (a: AffiliateRow): ProgramAffiliateRow => ({
  id: a.id,
  name: a.name,
  email: a.email,
  code: a.code,
  tier: a.tier,
  rate: a.rate,
  joinedAt: a.joinedAt,
  conversions: a.conversions,
  earned: minor(a.earnedMinor),
  paused: a.status === "paused",
  discount: { state: a.discount, error: a.discountError }
})

const applicationOf = (a: ServerApplication): ApplicationRow => ({
  id: a.id,
  name: a.name,
  email: a.email,
  channel: a.channel ?? "",
  audience: a.audience ?? "",
  motivation: a.motivation ?? "",
  url: a.mainUrl ?? undefined,
  appliedAt: a.appliedAt,
  status: a.status,
  reason: a.reason ?? undefined,
  decidedAt: a.decidedAt ?? undefined
})

const lineOf = (l: PayoutLine, at: number): PayoutRow => ({
  affiliateId: l.affiliateId,
  name: l.name,
  method: l.method === null ? "—" : METHOD_LABEL[l.method],
  orders: l.orders,
  approvable: minor(l.approvableMinor),
  inWindow: minor(l.inWindowMinor),
  reversed: minor(Math.abs(l.reversedMinor)),
  approvedAt: l.status === "approved" || l.status === "paid" ? at : undefined,
  paidAt: l.status === "paid" ? at : undefined
})

const monthOf = (v: PayoutsView): PayoutsMonth => {
  const payDay = Date.parse(`${v.payDay}T12:00:00Z`)
  return { label: monthLabel(v.month), payDay, running: !v.closed, lines: v.lines.map((l) => lineOf(l, payDay)) }
}

const inviteOf = (i: ServerInvite): InviteRow => ({
  id: i.id,
  name: i.name ?? i.email,
  email: i.email,
  tier: i.tier,
  sentAt: i.sentAt,
  expiresAt: i.lapsed ? Math.min(i.expiresAt, Date.now()) : i.expiresAt
})

const resourceOf = (r: ResourceRow): PortalResource => ({
  id: r.id,
  name: r.title,
  kind: r.kind,
  size: sizeOf(r.sizeBytes),
  updated_at: new Date(r.updatedAt).toISOString()
})

const kindOf = (mime: string): PortalResource["kind"] =>
  mime === "image/svg+xml"
    ? "logo"
    : mime.startsWith("image/")
    ? "image"
    : mime.startsWith("video/")
    ? "video"
    : "doc"

const EMPTY_MONTH: PayoutsMonth = { label: "", payDay: 0, running: true, lines: [] }
const NO_ROWS: Array<never> = []

function useAffiliates() {
  const list = value(useAtomValue(affiliatesListAtom))
  return useMemo(() => list?.rows.map(affiliateOf) ?? NO_ROWS, [list])
}

function useApplications() {
  const list = value(useAtomValue(applicationsAtom))
  return useMemo(() => list?.rows.map(applicationOf) ?? NO_ROWS, [list])
}

function usePayouts() {
  const view = value(useAtomValue(payoutsAtom))
  return useMemo(() => (view === undefined ? EMPTY_MONTH : monthOf(view)), [view])
}

function useInvites() {
  const list = value(useAtomValue(invitesAtom))
  return useMemo(() => list?.map(inviteOf) ?? NO_ROWS, [list])
}

function useResourceList() {
  const list = value(useAtomValue(resourcesAtom))
  return useMemo(() => list?.map(resourceOf) ?? NO_ROWS, [list])
}

/** "Deze maand" for the affiliate whose dialog is open, read when it opens. */
function useThisMonth(affiliateId: string) {
  const get = useAtomSet(affiliatesWrites.get, { mode: "promiseExit" })
  const [month, setMonth] = useState<{ id: string; amount: number } | undefined>(undefined)
  useEffect(() => {
    if (affiliateId === "") return
    let live = true
    void get({ payload: { affiliateId } }).then((exit) => {
      if (live && Exit.isSuccess(exit)) setMonth({ id: affiliateId, amount: minor(exit.value.thisMonthMinor) })
    })
    return () => {
      live = false
    }
  }, [affiliateId, get])
  return month?.id === affiliateId ? month.amount : undefined
}

/** The code an approval gives, proposed by the server (unique in the programme) when the dialog opens. */
function useProposedCode(app: ApplicationRow | null) {
  const propose = useAtomSet(affiliatesWrites.proposeCode, { mode: "promiseExit" })
  const [code, setCode] = useState<{ id: string; code: string } | undefined>(undefined)
  const id = app?.id
  const name = app?.name
  useEffect(() => {
    if (id === undefined || name === undefined) return
    let live = true
    void propose({ payload: { name } }).then((exit) => {
      if (live && Exit.isSuccess(exit)) setCode({ id, code: exit.value.code })
    })
    return () => {
      live = false
    }
  }, [id, name, propose])
  return code !== undefined && code.id === id ? code.code : ""
}

type Change = Exit.Exit<{ readonly undo: { readonly token: string } | null }, unknown>

/** The page's source over `Affiliates.*`, for the programme `program` and the list `list` the route read. */
export function useConsoleAffiliatesSource(program: ProgramView, list: AffiliateList): AffiliatesSource {
  const keys = { reactivityKeys: AFFILIATES }
  const write = {
    setTier: useAtomSet(affiliatesWrites.setTier, { mode: "promiseExit" }),
    // Pausing several affiliates is a write each, and so is undoing it: they go in turn, each with its own answer.
    setPaused: useAtomSetInTurn(affiliatesWrites.setPaused),
    approve: useAtomSet(affiliatesWrites.approve, { mode: "promiseExit" }),
    reject: useAtomSet(affiliatesWrites.reject, { mode: "promiseExit" }),
    retryDiscount: useAtomSet(affiliatesWrites.retryDiscount, { mode: "promiseExit" }),
    approvePayouts: useAtomSet(affiliatesWrites.approvePayouts, { mode: "promiseExit" }),
    markPaid: useAtomSet(affiliatesWrites.markPaid, { mode: "promiseExit" }),
    invite: useAtomSet(affiliatesWrites.invite, { mode: "promiseExit" }),
    resend: useAtomSet(affiliatesWrites.resend, { mode: "promiseExit" }),
    revoke: useAtomSet(affiliatesWrites.revoke, { mode: "promiseExit" }),
    removeResource: useAtomSet(affiliatesWrites.removeResource, { mode: "promiseExit" }),
    undo: useAtomSetInTurn(affiliatesWrites.undo)
  }
  const refreshResources = useAtomRefresh(resourcesAtom)
  const view = value(useAtomValue(payoutsAtom))
  const link = value(useAtomValue(inviteLinkAtom))
  const manage = useGate("affiliates", 3).ok
  const edit = useGate("affiliates", 2).ok
  const currency = list.currency as Currency

  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  /** One or more writes said once: the first refusal, else "Ongedaan maken" spending every ticket. */
  const said = (exits: ReadonlyArray<Change>, words: Said) => {
    const failed = exits.find(Exit.isFailure)
    if (failed !== undefined) refused(failureOf(failed))
    const tokens = exits.flatMap((e) => (Exit.isSuccess(e) && e.value.undo !== null ? [e.value.undo.token] : []))
    if (failed !== undefined && tokens.length === 0) return
    if (tokens.length === 0) return void toast.success(words.message, { description: words.description })
    undoable(words.message, () => tokens.forEach(undo), words.description)
  }
  const one = (p: Promise<Change>, words: Said) => void p.then((exit) => said([exit], words))
  const origin = typeof location === "undefined" ? "" : location.origin

  return {
    money: (amount) => formatCurrency(amount, currency),
    tiers: program.tiers.map((t) => ({ id: t.tier, label: TIER_LABEL[t.tier], rate: t.rate, from: t.threshold })),
    rejectReasons: program.rejectReasons,
    returnDays: program.returnDays,
    useAffiliates,
    useApplications,
    usePayouts,
    useInvites,
    useThisMonth,
    useProposedCode,
    canManagePayouts: manage,
    approve: (app, tier, code, words) =>
      one(write.approve({ payload: { applicationId: app.id, tier, code }, ...keys }), words),
    reject: (app, reason, words) => one(write.reject({ payload: { applicationId: app.id, reason }, ...keys }), words),
    setTier: (a, tier, words) => one(write.setTier({ payload: { affiliateId: a.id, tier }, ...keys }), words),
    setPaused: (rows, words) =>
      void Promise.all(
        rows.map((r) => write.setPaused({ payload: { affiliateId: r.id, paused: !r.paused }, ...keys }))
      ).then((exits) => said(exits, words)),
    retryDiscount: (a) =>
      void write.retryDiscount({ payload: { affiliateId: a.id }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) return refused(failureOf(exit))
        toast.success("Kortingscode opnieuw aangevraagd", { description: `${a.code} gaat opnieuw naar Shopify.` })
      }),
    approvePayouts: (rows, words) => {
      if (view === undefined) return
      one(
        write.approvePayouts({ payload: { month: view.month, affiliateIds: rows.map((r) => r.affiliateId) }, ...keys }),
        words
      )
    },
    markPaid: (rows, words) => {
      if (view === undefined) return
      one(
        write.markPaid({ payload: { month: view.month, affiliateIds: rows.map((r) => r.affiliateId) }, ...keys }),
        words
      )
    },
    invite: (input, words) =>
      one(
        write.invite({
          payload: {
            email: input.email,
            tier: input.tier,
            ...(input.name === "" ? {} : { name: input.name }),
            ...(input.message === undefined ? {} : { message: input.message })
          },
          ...keys
        }),
        words
      ),
    resendInvite: (i, words) => one(write.resend({ payload: { invitationId: i.id }, ...keys }), words),
    revokeInvite: (i, words) => one(write.revoke({ payload: { invitationId: i.id }, ...keys }), words),
    inviteUrl: () => `${origin}${link?.url ?? program.applyPath}`,
    viewInvite: null,
    resources: {
      useList: useResourceList,
      canEdit: edit,
      upload: (file, words) =>
        void fetchInTab("/api/affiliates/resources", {
          method: "PUT",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
            "x-resource-title": encodeURIComponent(file.name.replace(/\.[^.]+$/, "") || file.name),
            "x-resource-kind": kindOf(file.type)
          },
          body: file
        }).catch(() => null).then((response) => {
          if (response?.status !== 201) {
            const [title, description] = UPLOAD[response?.status ?? 0] ??
              ["Het bestand kwam niet door", "Probeer het zo nog eens."]
            return void toast.error(title, { description })
          }
          refreshResources()
          toast.success(words.message, { description: words.description })
        }),
      remove: (r, words) =>
        void write.removeResource({ payload: { resourceId: r.id }, ...keys }).then((exit) => said([exit], words)),
      open: (r) => void window.open(`/api/affiliates/resources/${encodeURIComponent(r.id)}`, "_blank", "noopener")
    }
  }
}
