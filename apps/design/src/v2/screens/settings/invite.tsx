import { useRef, useState } from "react"
import { invitesFor, membersFor, roleLabel, ROLES, SEATS, storesLabel } from "../../fixtures/settings.ts"
import type { Invite, Member } from "../../fixtures/settings.ts"
import { PEOPLE, STORES } from "../../fixtures/workspace.ts"
import { navigate, paths } from "../../router.tsx"
import { Button } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { FileDrop } from "../../ui/file-drop.tsx"
import { AlertTriangle, CheckCircle, Download, FileText, X } from "../../ui/icons.tsx"
import { Field, Select, Textarea } from "../../ui/input.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { AREA_LABEL, LEVEL_LABEL, useView } from "../../view.ts"
import type { Level, PermArea } from "../../view.ts"
import { money, useSaved } from "./parts.tsx"

/*
 * Inviting people into the workspace: one or more addresses typed or pasted into one field, or a
 * whole list from a spreadsheet. Every address is checked before anything is sent (a typo, someone
 * already in the team, an invitation still open) and the seats left on the plan are counted, so the
 * send is refused past them with the way to buy more. Team and the teammate page share the members
 * and invitations through `useTeam`.
 */

const NOW = new Date(2026, 10, 23, 14, 30).getTime()
const WEEK = 7 * 86_400_000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ME = PEOPLE.elena.id

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const INVITABLE = ROLES.filter((r) => r.id !== "eigenaar")

/** The team as the pages change it: members, open invitations and the seats they hold. */
export function useTeam() {
  const view = useView()
  const [members, setMembers] = useSaved<ReadonlyArray<Member>>("team.members", membersFor(view.staat))
  const [invites, setInvites] = useSaved<ReadonlyArray<Invite>>("team.invites", invitesFor(view.staat))
  const used = members.filter((m) => m.deactivated !== true).length +
    invites.filter((i) => i.expires.getTime() > NOW).length
  const total = SEATS.included + SEATS.extra
  const meOwner = members.find((m) => m.id === ME)?.roleId === "eigenaar"
  return {
    members,
    setMembers,
    invites,
    setInvites,
    seats: { used, total, free: Math.max(0, total - used) },
    me: ME,
    meOwner
  }
}

type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: string }

function check(
  email: string,
  earlier: ReadonlyArray<string>,
  members: ReadonlyArray<Member>,
  invites: ReadonlyArray<Invite>
): Verdict {
  const e = email.trim().toLowerCase()
  if (!EMAIL.test(e)) return { ok: false, reason: "Geen geldig e-mailadres" }
  if (earlier.includes(e)) return { ok: false, reason: "Staat er al tussen" }
  if (members.some((m) => m.email.toLowerCase() === e)) return { ok: false, reason: "Zit al in het team" }
  if (invites.some((i) => i.email.toLowerCase() === e && i.expires.getTime() > NOW)) {
    return { ok: false, reason: "Heeft al een uitnodiging" }
  }
  return { ok: true }
}

/** Send the invitations, with Undo. A lapsed invitation to the same address is replaced. */
function useSend() {
  const team = useTeam()
  return (rows: ReadonlyArray<Omit<Invite, "id" | "invitedBy" | "sent" | "expires">>) => {
    const made = rows.map((r, i): Invite => ({
      ...r,
      id: `inv_${Math.random().toString(36).slice(2, 8)}${i}`,
      invitedBy: ME,
      sent: new Date(NOW),
      expires: new Date(NOW + WEEK)
    }))
    const before = team.invites
    const emails = new Set(made.map((m) => m.email))
    team.setInvites([...made, ...before.filter((i) => !emails.has(i.email))])
    toast({
      title: made.length === 1
        ? `Uitnodiging verstuurd naar ${made[0]?.email ?? ""}`
        : `${plural(made.length, "uitnodiging", "uitnodigingen")} verstuurd`,
      body: "Ze krijgen een e-mail met een link die 7 dagen geldig is.",
      tone: "good",
      action: { label: "Ongedaan maken", onClick: () => team.setInvites(before) }
    })
  }
}

/**
 * What a role may do, in words: the areas it manages, edits and only sees, and the refund limit when
 * it may refund. Under the role picker, so the person inviting sees what they hand out.
 */
export function RoleReach({ roleId, className }: { readonly roleId: string; readonly className?: string }) {
  const role = ROLES.find((r) => r.id === roleId)
  if (role === undefined) return null
  if (role.id === "eigenaar") {
    return <p className={cx("text-sm text-ink-2", className)}>Kan alles, ook facturatie en de werkruimte opheffen.</p>
  }
  const groups = ([3, 2, 1] as const).map((lvl) => ({
    lvl,
    areas: (Object.entries(role.levels) as Array<[PermArea, Level]>).filter(([, l]) => l === lvl).map(([a]) =>
      AREA_LABEL[a]
    )
  })).filter((g) => g.areas.length > 0)
  return (
    <dl className={cx("flex flex-col gap-1.5", className)}>
      {groups.length === 0 && <p className="text-sm text-ink-2">Deze rol kan nog niets. Stel hem in bij Rollen.</p>}
      {groups.map((g) => (
        <div key={g.lvl} className="grid grid-cols-[minmax(6rem,28%)_minmax(0,1fr)] gap-3">
          <dt className="text-xs leading-5 text-ink-3">{LEVEL_LABEL[g.lvl]}</dt>
          <dd className="text-sm text-ink-2">{g.areas.join(", ")}</dd>
        </div>
      ))}
      {role.specials.includes("refunds.write") && (
        <div className="grid grid-cols-[minmax(6rem,28%)_minmax(0,1fr)] gap-3">
          <dt className="text-xs leading-5 text-ink-3">Terugbetalen</dt>
          <dd className="text-sm text-ink-2">
            {role.refundLimit === null ? "Zonder grens" : `Tot ${money(role.refundLimit)} per keer`}
          </dd>
        </div>
      )}
    </dl>
  )
}

function StorePicker({ value, onChange }: {
  readonly value: ReadonlyArray<string>
  readonly onChange: (next: ReadonlyArray<string>) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-xs font-medium text-ink">Winkels</legend>
      {STORES.map((s) => (
        <Checkbox
          key={s.id}
          label={s.name}
          description={s.connected ? undefined : "Ontkoppeld"}
          checked={value.includes(s.id)}
          onChange={(on) => onChange(on ? [...value, s.id] : value.filter((x) => x !== s.id))}
        />
      ))}
    </fieldset>
  )
}

/** The seats line in a dialog's foot: what is left, or that it runs out, with the way to buy more. */
function SeatsLine({ need, free, total, used, onBuy }: {
  readonly need: number
  readonly free: number
  readonly total: number
  readonly used: number
  readonly onBuy: () => void
}) {
  if (need > free) {
    return (
      <p className="mr-auto text-sm text-bad-ink">
        Nog {plural(free, "plek", "plekken")} vrij.{" "}
        <button type="button" onClick={onBuy} className="font-medium underline underline-offset-2 hover:text-ink">
          Plek bijkopen
        </button>
      </p>
    )
  }
  return (
    <p className="figure mr-auto text-sm text-ink-3">
      {need === 0
        ? `${plural(free, "plek", "plekken")} vrij`
        : `${used + need} van ${total} plekken bezet na versturen`}
    </p>
  )
}

/**
 * Invite one or more colleagues. Addresses typed or pasted become chips; a chip that cannot be invited
 * says why. Under the role, what it may do. The foot counts the seats it will take.
 */
export function InviteDialog({ open, onClose, onBulk }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly onBulk: () => void
}) {
  const team = useTeam()
  const send = useSend()
  const [emails, setEmails] = useState<ReadonlyArray<string>>([])
  const [draft, setDraft] = useState("")
  const [roleId, setRoleId] = useState("klantenservice")
  const [stores, setStores] = useState<ReadonlyArray<string>>(STORES.filter((s) => s.connected).map((s) => s.id))
  const [message, setMessage] = useState("")
  const [tried, setTried] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const reset = () => {
    setEmails([])
    setDraft("")
    setMessage("")
    setTried(false)
  }
  const close = () => {
    reset()
    onClose()
  }
  const commit = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim().replace(/^<|>$/g, "").toLowerCase()).filter(Boolean)
    if (parts.length === 0) return
    setEmails((xs) => [...xs, ...parts.filter((p) => !xs.includes(p))])
    setDraft("")
  }

  const all = draft.trim() === "" ? emails : [...emails, draft.trim().toLowerCase()]
  const verdicts = all.map((e, i) => ({ email: e, v: check(e, all.slice(0, i), team.members, team.invites) }))
  const good = verdicts.filter((x) => x.v.ok).map((x) => x.email)
  const bad = verdicts.length - good.length
  const over = good.length > team.seats.free

  const submit = () => {
    setTried(true)
    if (draft.trim() !== "") commit(draft)
    if (good.length === 0 || bad > 0 || over || stores.length === 0) return
    const scope = stores.length === STORES.length ? "all" : stores
    send(good.map((email) => ({
      email,
      roleId,
      stores: scope,
      ...(message.trim() === "" ? {} : { message: message.trim() })
    })))
    close()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Collega's uitnodigen"
      description="Ze krijgen een e-mail met een link en tellen als plek tot ze accepteren of de link verloopt."
      footer={
        <>
          {tried && bad > 0
            ? <p className="mr-auto text-sm text-bad-ink">Haal de rode adressen weg om te versturen.</p>
            : (
              <SeatsLine
                need={good.length}
                free={team.seats.free}
                total={team.seats.total}
                used={team.seats.used}
                onBuy={() => {
                  close()
                  navigate(paths.settings("facturatie"))
                }}
              />
            )}
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button variant="primary" disabled={all.length === 0 || over} onClick={submit}>
            {good.length > 1 ? `${good.length} uitnodigingen versturen` : "Uitnodiging versturen"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="invite-emails" className="text-xs font-medium text-ink">E-mailadressen</label>
            <button
              type="button"
              onClick={() => {
                close()
                onBulk()
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:text-ink pointer-coarse:min-h-11"
            >
              <FileText size={13} />
              Uit een CSV
            </button>
          </div>
          <div
            onClick={() => input.current?.focus()}
            className={cx(
              "flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 rounded-sm bg-canvas px-1 py-1 ring-1 ring-line-strong ring-inset",
              "focus-within:ring-2 focus-within:ring-accent hover:ring-ink-4",
              tried && all.length === 0 && "ring-bad-ink"
            )}
          >
            {verdicts.slice(0, emails.length).map(({ email, v }) => (
              <span
                key={email}
                title={v.ok ? undefined : v.reason}
                className={cx(
                  "inline-flex h-6 max-w-full items-center gap-1 rounded-xs pr-0.5 pl-1.5 text-xs",
                  v.ok ? "bg-well text-ink" : "bg-bad-tint text-bad-ink"
                )}
              >
                <span className="truncate">{email}</span>
                {!v.ok && <span className="shrink-0">· {v.reason}</span>}
                <button
                  type="button"
                  aria-label={`${email} weghalen`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setEmails((xs) => xs.filter((x) => x !== email))
                  }}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              id="invite-emails"
              ref={input}
              type="email"
              multiple
              value={draft}
              onChange={(event) => {
                const v = event.target.value
                if (/[,;\s]$/.test(v)) commit(v)
                else setDraft(v)
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === "Tab") && draft.trim() !== "") {
                  event.preventDefault()
                  commit(draft)
                } else if (event.key === "Enter") {
                  event.preventDefault()
                  submit()
                } else if (event.key === "Backspace" && draft === "" && emails.length > 0) {
                  setEmails((xs) => xs.slice(0, -1))
                }
              }}
              onPaste={(event) => {
                const text = event.clipboardData.getData("text")
                if (/[\s,;]/.test(text.trim())) {
                  event.preventDefault()
                  commit(`${draft}${text}`)
                }
              }}
              onBlur={() => {
                if (draft.trim() !== "") commit(draft)
              }}
              placeholder={emails.length === 0 ? "amber@northwindclothing.co, jonas@…" : ""}
              className="h-6 min-w-[11rem] flex-1 bg-transparent px-1.5 text-sm text-ink outline-none placeholder:text-ink-3 pointer-coarse:h-9"
            />
          </div>
          <p className="text-xs text-ink-3">
            {tried && all.length === 0
              ? "Vul minstens één e-mailadres in."
              : "Plak er zoveel als je wilt, gescheiden door komma's of regels."}
          </p>
        </div>
        <Field label="Rol">
          {(c) => (
            <Select {...c} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {INVITABLE.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          )}
        </Field>
        <RoleReach roleId={roleId} className="-mt-2" />
        <div className="flex flex-col gap-1">
          <StorePicker value={stores} onChange={setStores} />
          {tried && stores.length === 0 && <p className="text-xs text-bad-ink">Kies minstens één winkel</p>}
        </div>
        <Field label="Persoonlijk bericht" optional>
          {(c) => (
            <Textarea
              {...c}
              rows={2}
              placeholder="Begin met de chargeback-wachtrij, ik loop de eerste week met je mee."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

type Row = {
  readonly line: number
  readonly email: string
  readonly roleId: string
  readonly stores: "all" | ReadonlyArray<string>
  readonly problem?: string
  readonly note?: string
}

const TEMPLATE =
  "e-mail,rol,winkels\namber@northwindclothing.co,Klantenservice,Northwind US|Northwind EU\njonas@northwindclothing.co,Financiën,\n"

/**
 * Many at once, from a spreadsheet: paste the rows or drop the file. One address per row, then the
 * role (as Rollen names it) and the stores, separated by |. Every row is read and shown with what will
 * happen to it before anything is sent; only the rows that are ready go out, and never more than the
 * seats left.
 */
export function BulkInviteDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const team = useTeam()
  const send = useSend()
  const [text, setText] = useState("")
  const [file, setFile] = useState<string | null>(null)
  const [fallback, setFallback] = useState("klantenservice")

  const rows: ReadonlyArray<Row> = (() => {
    const seen: Array<string> = []
    const out: Array<Row> = []
    for (const [i, raw] of text.split(/\r?\n/).entries()) {
      const cells = raw.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""))
      const email = (cells[0] ?? "").toLowerCase()
      if (email === "") continue
      if (i === 0 && !email.includes("@") && /mail/.test(email)) continue
      const roleCell = cells[1] ?? ""
      const role = roleCell === ""
        ? undefined
        : INVITABLE.find((r) => r.label.toLowerCase() === roleCell.toLowerCase() || r.id === roleCell.toLowerCase())
      const names = (cells[2] ?? "").split("|").map((s) => s.trim()).filter(Boolean)
      const ids = names.map((n) => STORES.find((s) => s.name.toLowerCase() === n.toLowerCase())?.id)
      const v = check(email, seen, team.members, team.invites)
      seen.push(email)
      const missing = ids.indexOf(undefined)
      const problem = !v.ok ? v.reason : missing >= 0 ? `Onbekende winkel: ${names[missing] ?? ""}` : undefined
      out.push({
        line: i + 1,
        email,
        roleId: role?.id ?? fallback,
        stores: ids.length === 0 || ids.length === STORES.length ? "all" : ids.filter((x) => x !== undefined),
        ...(problem === undefined ? {} : { problem }),
        ...(roleCell !== "" && role === undefined
          ? { note: `Rol “${roleCell}” bestaat niet, wordt ${roleLabel(fallback)}` }
          : {})
      })
    }
    return out
  })()

  const ready = rows.filter((r) => r.problem === undefined)
  const sendable = ready.slice(0, team.seats.free)
  const short = ready.length - sendable.length
  const close = () => {
    setText("")
    setFile(null)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Uitnodigen uit een CSV"
      description="Eén adres per regel, dan de rol en de winkels, gescheiden door |. Je ziet elke regel voordat er iets verstuurd wordt."
      footer={
        <>
          {short > 0
            ? (
              <p className="mr-auto text-sm text-warn-ink">
                Nog {plural(team.seats.free, "plek", "plekken")} vrij, {short} blijven liggen.{" "}
                <button
                  type="button"
                  className="font-medium underline underline-offset-2 hover:text-ink"
                  onClick={() => {
                    close()
                    navigate(paths.settings("facturatie"))
                  }}
                >
                  Plek bijkopen
                </button>
              </p>
            )
            : <p className="figure mr-auto text-sm text-ink-3">{plural(team.seats.free, "plek", "plekken")} vrij</p>}
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={sendable.length === 0}
            onClick={() => {
              send(sendable.map((r) => ({ email: r.email, roleId: r.roleId, stores: r.stores })))
              close()
            }}
          >
            {sendable.length === 0
              ? "Niets om te versturen"
              : `${plural(sendable.length, "uitnodiging", "uitnodigingen")} versturen`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="bulk-csv" className="text-xs font-medium text-ink">
              {file === null ? "Plak de regels" : `Uit ${file}`}
            </label>
            <Button
              size="sm"
              variant="ghost"
              icon={<Download />}
              onClick={() => {
                const a = document.createElement("a")
                a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }))
                a.download = "uitnodigingen-voorbeeld.csv"
                a.click()
                URL.revokeObjectURL(a.href)
              }}
            >
              Voorbeeld downloaden
            </Button>
          </div>
          <Textarea
            id="bulk-csv"
            rows={4}
            value={text}
            placeholder={TEMPLATE.trim()}
            onChange={(e) => {
              setText(e.target.value)
              setFile(null)
            }}
          />
        </div>
        {text.trim() === "" && (
          <FileDrop
            accept=".csv,text/csv,.txt"
            label="Of sleep het bestand hierheen"
            hint="CSV of tekst, met een adres per regel"
            onFiles={(files) => {
              const f = files[0]
              if (f === undefined) return
              void f.text().then((t) => {
                setText(t)
                setFile(f.name)
              })
            }}
          />
        )}
        <Field label="Rol voor regels zonder rol">
          {(c) => (
            <Select {...c} value={fallback} onChange={(e) => setFallback(e.target.value)}>
              {INVITABLE.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          )}
        </Field>
        {rows.length > 0 && (
          <section aria-label="Voorbeeld" className="flex flex-col gap-2">
            <p className="figure text-xs text-ink-3">
              {plural(rows.length, "regel", "regels")} · {ready.length} klaar · {rows.length - ready.length}{" "}
              met een probleem
            </p>
            <Table label="Regels" minWidth={600}>
              <THead>
                <Th width="3.5rem">Regel</Th>
                <Th>E-mail</Th>
                <Th>Rol</Th>
                <Th>Winkels</Th>
                <Th>Wat er gebeurt</Th>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <Tr key={`${r.line}-${r.email}`}>
                    <Td figure muted>{r.line}</Td>
                    <Td className="max-w-[13rem] truncate">{r.email}</Td>
                    <Td muted>{roleLabel(r.roleId)}</Td>
                    <Td muted className="max-w-[10rem] truncate">{storesLabel(r.stores)}</Td>
                    <Td>
                      {r.problem === undefined
                        ? (
                          <span className="inline-flex items-center gap-1.5 text-ink-2">
                            <CheckCircle size={14} className="shrink-0 text-good-ink" />
                            {r.note ?? "Wordt uitgenodigd"}
                          </span>
                        )
                        : (
                          <span className="inline-flex items-center gap-1.5 text-bad-ink">
                            <AlertTriangle size={14} className="shrink-0" />
                            {r.problem}
                          </span>
                        )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </section>
        )}
      </div>
    </Dialog>
  )
}
