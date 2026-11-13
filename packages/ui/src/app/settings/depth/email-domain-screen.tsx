import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Copy, Mail, RefreshCcw } from "../../../icons"
import { ConfirmDialog } from "../../common/confirm-dialog"
import { formatRelative } from "../../lib/format"
import type { DnsRecord, Domain } from "../../lib/settings-depth"
import { cn } from "../../lib/utils"
import { FieldRow, UnsavedBar } from "../form"
import { SettingCard, StatusPill } from "../setting-card"
import { useSection, WELL } from "./kit"
import { type DomainHere, useSettingsDepthSource } from "./source"

const STATUS: Record<DnsRecord["status"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  found: { tone: "success", label: "Gevonden" },
  missing: { tone: "warning", label: "Niet gevonden" },
  pending: { tone: "neutral", label: "Controleren…" }
}

const copy = (text: string, what: string) => {
  void navigator.clipboard?.writeText(text).catch(() => undefined)
  toast(`${what} gekopieerd`)
}

/** Why there are no records to show, said plainly: what it means for the mail now, and what helps. */
const NOT_READY: Record<"unavailable" | "failed", [string, string]> = {
  unavailable: [
    "Mailen vanaf je eigen domein is nog niet beschikbaar.",
    "Mail gaat van Insyte uit, in de naam van je winkel."
  ],
  failed: [
    "De DNS-records zijn nu niet op te halen.",
    "Mail gaat van Insyte uit tot het lukt. Probeer het zo opnieuw."
  ]
}

/** No domain set up yet, or the last try did not take: what that means, and what to do. */
const SET_UP: Record<"unclaimed" | "taken" | "failed", (domain: string) => [string, string]> = {
  unclaimed: () => [
    "Nog geen domein ingesteld.",
    "Stel het domein in waarvan je winkel mailt. Daarna zie je de vier DNS-records voor je domeinbeheerder."
  ],
  taken: (domain) => [
    `${domain} is al in gebruik.`,
    "Het domein hoort bij een andere werkruimte. Kies een ander domein of neem contact op met Insyte."
  ],
  failed: () => [
    "Het instellen lukte niet.",
    "Mail gaat van Insyte uit tot het lukt. Probeer het zo opnieuw."
  ]
}

/** A check that found more keeps the senders being typed; senders saved meanwhile (or undone) replace them. */
const keepSenders = (saved: Domain, draft: Domain, before: Domain): Domain =>
  saved.from === before.from && saved.replyTo === before.replyTo
    ? { ...saved, from: draft.from, replyTo: draft.replyTo }
    : saved

/**
 * E-mail en domein (`/settings/email-domain`, PLAN 43): sending from the shop's own domain. The
 * four records to put at the domain host, each with its state and a copy button, a check that asks
 * again, and what to tell whoever manages the domain. Until all four are found mail still goes out,
 * and the page says the honest part: it may land in spam. Where there is no domain to show, it says
 * why instead of showing records that are not real; with none set up yet, "Domein instellen", and
 * once one is, "Domein verwijderen" (after a confirm: the DNS work is lost) where the host offers them.
 */
export function EmailDomainPage() {
  const s = useSection(
    "domain",
    "E-mail en domein",
    (a, b) => {
      const out: Array<[string, string, string]> = []
      if (a.from !== b.from) out.push(["Mails van Insyte", a.from, b.from])
      if (a.replyTo !== b.replyTo) out.push(["Antwoorden naar", a.replyTo, b.replyTo])
      return out
    },
    2,
    keepSenders
  )
  const here = useSettingsDepthSource().domain
  const d: Domain = s.saved
  const checking = here?.checking ?? false
  const found = d.records.filter((r) => r.status === "found").length
  const all = found === d.records.length

  const instructions = `Wil je deze records toevoegen aan ${d.domain}?\n\n${
    d.records.map((r) => `${r.type}  ${r.name}  ${r.value}`).join("\n")
  }\n\nDank je.`

  const [removing, setRemoving] = useState(false)
  const state = here?.state ?? "ready"
  const setUp = state === "unclaimed" || state === "taken" || (state === "failed" && d.records.length === 0)

  return (
    <>
      {state === "ready"
        ? (
          <>
            <div
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl px-4 py-3",
                all ? "bg-signal-green-bg" : "bg-signal-amber-bg"
              )}
            >
              {all
                ? <CheckCircle2 className="size-4 text-signal-green" strokeWidth={1.75} />
                : <AlertTriangle className="size-4 text-signal-amber" strokeWidth={1.75} />}
              <p className="min-w-0 flex-1 text-ink text-sm">
                <span className="font-medium">
                  {all ? "Je domein is klaar." : `${found} van ${d.records.length} records gevonden.`}
                </span>{" "}
                {all
                  ? `Mail van ${d.domain} is ondertekend.`
                  : "Mail gaat al de deur uit, maar kan in spam belanden tot alle vier er staan."}
              </p>
              <button
                type="button"
                onClick={() => copy(instructions, "Instructies")}
                className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-2.5 font-medium text-ink text-sm hover:bg-paper/80"
              >
                <Copy className="size-3.5" strokeWidth={1.75} />
                Instructies voor je IT'er
              </button>
            </div>

            <SettingCard
              title={`DNS-records voor ${d.domain}`}
              icon={Mail}
              subtitle={`Voeg ze toe bij je domeinbeheerder. ${
                d.checkedAt === "" ? "Nog niet gecontroleerd" : `Laatst gecontroleerd ${formatRelative(d.checkedAt)}`
              }.`}
              action={
                <div className="flex items-center gap-2">
                  {here?.remove !== undefined && s.canEdit
                    ? (
                      <button
                        type="button"
                        disabled={here.busy === true}
                        onClick={() => setRemoving(true)}
                        className="field flex h-8 items-center rounded-md px-2.5 font-medium text-ink text-xs hover:field-hover disabled:opacity-60"
                      >
                        Domein verwijderen
                      </button>
                    )
                    : null}
                  <button
                    type="button"
                    disabled={checking || !s.canEdit}
                    onClick={here?.check}
                    className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-60"
                  >
                    <RefreshCcw className={cn("size-3.5", checking && "animate-spin")} strokeWidth={1.75} />
                    {checking ? "Controleren…" : "Opnieuw controleren"}
                  </button>
                </div>
              }
            >
              <div className="table-scroll overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
                <div className="grid min-w-[680px] grid-cols-[64px_170px_minmax(0,1fr)_130px] gap-3 bg-mist px-3.5 py-2 font-medium text-ink-3 text-xs">
                  <span>Soort</span>
                  <span>Naam</span>
                  <span>Waarde</span>
                  <span>Status</span>
                </div>
                {d.records.map((r, i) => (
                  <div
                    key={r.id}
                    className={cn(
                      "grid min-w-[680px] grid-cols-[64px_170px_minmax(0,1fr)_130px] items-start gap-3 px-3.5 py-2.5 text-sm",
                      i % 2 ? "bg-mist/40" : "bg-paper"
                    )}
                  >
                    <span className="pt-1 font-medium text-ink">{r.type}</span>
                    <CopyCell text={r.name} what="Naam" />
                    <span className="flex min-w-0 flex-col gap-1">
                      <CopyCell text={r.value} what="Waarde" />
                      {r.why && r.status === "missing" ? <span className="text-ink-3 text-xs">{r.why}</span> : null}
                    </span>
                    <span className="pt-1">
                      <StatusPill tone={STATUS[r.status].tone} label={STATUS[r.status].label} />
                    </span>
                  </div>
                ))}
              </div>
            </SettingCard>
          </>
        )
        : here !== undefined && setUp
        ? <SetUp here={here} domain={d.domain} canEdit={s.canEdit} />
        : here !== undefined
        ? <NotReady here={here} canEdit={s.canEdit} />
        : null}

      <SettingCard title="Afzenders" subtitle="Van welk adres Insyte mailt, en waar een antwoord landt.">
        <div className="flex flex-col">
          <FieldRow label="Mails van Insyte" hint="Sjablonen, retourmails en wat de klantagent mailt.">
            <input
              value={s.draft.from}
              disabled={!s.canEdit}
              onChange={(e) => s.setDraft({ ...s.draft, from: e.target.value })}
              type="email"
              aria-label="Mails van Insyte"
              className={WELL}
            />
          </FieldRow>
          <FieldRow label="Antwoorden naar" hint="Komt binnen in de Inbox.">
            <input
              value={s.draft.replyTo}
              disabled={!s.canEdit}
              onChange={(e) => s.setDraft({ ...s.draft, replyTo: e.target.value })}
              type="email"
              aria-label="Antwoorden naar"
              className={WELL}
            />
          </FieldRow>
        </div>
      </SettingCard>
      {here?.remove !== undefined
        ? (
          <ConfirmDialog
            open={removing}
            onOpenChange={setRemoving}
            tone="destructive"
            title="Domein verwijderen?"
            description={`Insyte haalt ${d.domain} weg. De DNS-records die je al toevoegde, tellen dan niet meer: een ander domein krijgt eigen records. Tot dat klaar is, gaat je mail van Insyte uit.`}
            confirmLabel="Verwijderen"
            onConfirm={() => {
              setRemoving(false)
              here.remove?.()
            }}
          />
        )
        : null}
      <UnsavedBar visible={s.dirty && s.canEdit} onDiscard={s.discard} onSave={() => s.save("Afzenders opgeslagen")} />
    </>
  )
}

/** The band in place of the records: why there are none, and the one thing that helps where there is one. */
function NotReady({ here, canEdit }: { here: DomainHere; canEdit: boolean }) {
  if (here.state !== "unavailable" && here.state !== "failed") return null
  const [title, detail] = NOT_READY[here.state]
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-mist px-4 py-3">
      <Mail className="size-4 text-ink-3" strokeWidth={1.75} />
      <p className="min-w-0 flex-1 text-ink text-sm">
        <span className="font-medium">{title}</span> {detail}
      </p>
      {here.state === "failed"
        ? (
          <button
            type="button"
            disabled={here.checking || !canEdit}
            onClick={here.check}
            className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-2.5 font-medium text-ink text-sm hover:bg-paper/80 disabled:opacity-60"
          >
            <RefreshCcw className={cn("size-3.5", here.checking && "animate-spin")} strokeWidth={1.75} />
            Opnieuw proberen
          </button>
        )
        : null}
    </div>
  )
}

/**
 * No domain yet: the name to set up (the website's, filled in) and "Domein instellen". Only then is the domain made at
 * the provider, and only by someone who may change the settings.
 */
function SetUp({ here, domain, canEdit }: { here: DomainHere; domain: string; canEdit: boolean }) {
  const [name, setName] = useState(domain)
  useEffect(() => setName(domain), [domain])
  const state = here.state === "taken" || here.state === "failed" ? here.state : "unclaimed"
  const [title, detail] = SET_UP[state](name.trim() === "" ? domain : name.trim())
  const busy = here.busy === true
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-mist px-4 py-3">
      <div className="flex items-center gap-3">
        <Mail className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
        <p className="min-w-0 flex-1 text-ink text-sm">
          <span className="font-medium">{title}</span> {detail}
        </p>
      </div>
      {here.setUp !== undefined
        ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim() !== "") here.setUp?.(name.trim())
            }}
          >
            <input
              value={name}
              disabled={!canEdit || busy}
              onChange={(e) => setName(e.target.value)}
              placeholder="jouwwinkel.nl"
              aria-label="Domein"
              className={cn(WELL, "min-w-0 max-w-xs flex-1 bg-paper")}
            />
            <button
              type="submit"
              disabled={!canEdit || busy || name.trim() === ""}
              className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-60"
            >
              {busy ? "Instellen…" : "Domein instellen"}
            </button>
          </form>
        )
        : null}
    </div>
  )
}

function CopyCell({ text, what }: { text: string; what: string }) {
  return (
    <button
      type="button"
      onClick={() => copy(text, what)}
      title="Kopiëren"
      className="group/c flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
    >
      <span className="min-w-0 break-all">{text}</span>
      <Copy className="size-3 shrink-0 text-ink-4 group-hover/c:text-ink-3" strokeWidth={1.75} />
    </button>
  )
}
