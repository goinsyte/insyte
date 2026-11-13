import { useParams } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { ArrowRight, Check, FileText, Loader, MoreHorizontal, Sparkles, Trash2, Upload } from "../../icons"
import { useGateRole } from "../access/gate-role"
import { ConfirmDialog } from "../common/confirm-dialog"
import { DetailShell } from "../common/detail-shell"
import { EmptyState } from "../common/empty-state"
import { PageGuide } from "../common/page-guide"
import { formatCurrency, formatDate, formatDateTime } from "../lib/format"
import { canRole, permissionName } from "../lib/permissions"
import type { Chargeback } from "../lib/types/domain"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"
import { useChargebackDetailSource } from "./source"

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  awaiting_evidence: {
    label: "Wacht op bewijs",
    bg: "var(--signal-amber-bg)",
    fg: "var(--signal-amber)"
  },
  submitted: {
    label: "Ingediend",
    bg: "var(--arc-tint)",
    fg: "var(--arc-ink)"
  },
  won: {
    label: "Gewonnen",
    bg: "var(--signal-green-bg)",
    fg: "var(--signal-green)"
  },
  lost: {
    label: "Verloren",
    bg: "var(--signal-red-bg)",
    fg: "var(--signal-red)"
  }
}

const GUIDE = [
  {
    title: "Bewijs verzamelen",
    body:
      "Insyte stelt het pakket samen: de scan van de vervoerder, de bezorgfoto, de antwoorden van de klant en de originele factuur.",
    art: "log"
  },
  {
    title: "Controleren en indienen",
    body: "Controleer wat is toegevoegd en dien het dan in. Er gaat niets naar de aanbieder tot je dat doet.",
    art: "lock"
  },
  {
    title: "De uitspraak",
    body: "De uitspraak komt meestal binnen 30 dagen. Insyte houdt het in de gaten.",
    art: "notify"
  }
] as const

const PROVIDER: Record<Chargeback["provider"], string> = { stripe: "Stripe", klarna: "Klarna", paypal: "PayPal" }

export function ChargebackDetail() {
  const { chargebackId: id = "" } = useParams({ strict: false }) as { chargebackId?: string }
  const found = useChargebackDetailSource().useCase(id)
  // The route answers for a case that is not there; until the host has it, there is nothing to draw.
  if (found === undefined) return null
  return <CaseView c={found} />
}

function CaseView({ c }: { c: Chargeback }) {
  const { commands, record, fileHref, submitUnavailable, pack } = useChargebackDetailSource()
  const role = useGateRole()
  const [building, setBuilding] = useState(false)
  const [confirm, setConfirm] = useState<"submit" | "accept" | null>(null)
  const [packDismissed, setPackDismissed] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const status = STATUS[c.status] ?? STATUS.awaiting_evidence
  const provider = PROVIDER[c.provider]
  const open = c.status === "awaiting_evidence" || c.status === "open"
  // Bewerken adds and removes files; Beheren accepts. Without them the control says what is missing.
  const editBlocked = role !== null && !canRole(role, "chargebacks", 2)
    ? `Je rol ${role.label} mist ${permissionName("chargebacks", 2)}`
    : undefined
  const acceptBlocked = role !== null && !canRole(role, "chargebacks", 3)
    ? `Je rol ${role.label} mist ${permissionName("chargebacks", 3)}`
    : undefined
  // Where the host cannot submit yet, the button stays and says why.
  const submitBlocked = commands.submit ? undefined : submitUnavailable?.(c)

  // The win rate is counted from the cases on file, not asserted: the pack used to say "~78%".
  const decided = record.decided
  const won = record.won

  // Where the host gathers the pack out of sight, its progress is the host's; else the screen's own wait.
  const progress = pack?.(c)
  const gathering = building || progress?.building === true

  async function draw() {
    if (!commands.draw) return
    setBuilding(true)
    await commands.draw(c.id)
    setBuilding(false)
  }

  function attach(files: FileList | null) {
    if (!files || files.length === 0) return
    commands.attach(c, Array.from(files))
  }

  function removeFile(index: number) {
    commands.remove(c, index)
  }

  const daysLeft = Math.ceil(
    (new Date(c.deadline_at).getTime() - Date.now()) / 86_400_000
  )
  const deadlineTone = daysLeft < 3 ? "danger" : daysLeft < 7 ? "warning" : "neutral"

  // The plate offers what Insyte drew; where it cannot draw yet, it stands only over a pack the team put together.
  const showAiPack = open && !packDismissed && (commands.draw !== undefined || c.evidence_files.length > 0)

  return (
    <DetailShell
      crumb={{ label: "Chargebacks", to: "/chargebacks" }}
      title={c.customer_name}
      badge={
        <span
          className="inline-flex h-[20px] shrink-0 items-center rounded-sm px-1.5 font-medium text-xs"
          style={{ background: status.bg, color: status.fg }}
        >
          {status.label}
        </span>
      }
      meta={
        /* The reason has its own panel two inches below; a heading that restates the body is
				   the thing this pass is removing everywhere. */


          <span className="flex items-center gap-2">
            <BrandLogo brand={c.provider} name={provider} size={16} />
            <span>{provider}</span>
            <span className="text-ink-4">·</span>
            <span>{c.case_number}</span>
            <span className="text-ink-4">·</span>
            <span className="text-ink">
              {formatCurrency(c.amount, c.currency)}
            </span>
            <DeadlinePill
              daysLeft={daysLeft}
              date={c.deadline_at}
              tone={deadlineTone}
            />
          </span>

      }
      actions={
        <>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              attach(e.target.files)
              e.target.value = ""
            }}
          />
          {open ?
            (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={editBlocked !== undefined}
                title={editBlocked}
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink transition-colors hover:bg-ink/6 disabled:pointer-events-none disabled:opacity-45"
              >
                <Upload className="size-3.5" strokeWidth={1.75} />
                Bewijs toevoegen
              </button>
            ) :
            null}
          {open ?
            (
              <button
                type="button"
                disabled={c.evidence_files.length === 0 || submitBlocked !== undefined}
                title={submitBlocked ??
                  (c.evidence_files.length === 0 ? "Voeg eerst bewijs toe of stel het samen" : undefined)}
                onClick={() => setConfirm("submit")}
                className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
              >
                Indienen bij {provider}
                <ArrowRight className="size-3.5" strokeWidth={1.75} />
              </button>
            ) :
            null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Meer acties"
                className="flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard?.writeText(c.case_number)
                  toast(`${c.case_number} gekopieerd`)
                }}
              >
                Zaaknummer kopiëren
              </DropdownMenuItem>
              {open ?
                (
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={acceptBlocked !== undefined}
                    title={acceptBlocked}
                    onClick={() => setConfirm("accept")}
                  >
                    Geschil accepteren
                  </DropdownMenuItem>
                ) :
                null}
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={confirm === "submit"}
            onOpenChange={(v) => !v && setConfirm(null)}
            title={`${c.evidence_files.length} ${
              c.evidence_files.length === 1 ? "document" : "documenten"
            } indienen bij ${provider}?`}
            description={`${provider} beoordeelt wat je stuurt zoals het is; je kunt daarna niets meer toevoegen. Er wordt ${
              formatCurrency(c.amount, c.currency)
            } betwist.`}
            confirmLabel={`Indienen bij ${provider}`}
            onConfirm={() => {
              commands.submit?.([c])
              setConfirm(null)
            }}
          />
          <ConfirmDialog
            open={confirm === "accept"}
            onOpenChange={(v) => !v && setConfirm(null)}
            title="Geschil accepteren?"
            description={`${
              formatCurrency(c.amount, c.currency)
            } gaat terug naar ${c.customer_name} en de zaak sluit als verloren. Dit kan niet ongedaan worden gemaakt.`}
            confirmLabel="Accepteren en terugbetalen"
            tone="destructive"
            onConfirm={() => {
              commands.accept([c])
              setConfirm(null)
            }}
          />
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* AI Evidence Pack — the canonical mesh-dark AI moment. */}
          {showAiPack ?
            (
              <AiEvidencePack
                caseNumber={c.case_number}
                provider={provider}
                files={c.evidence_files.length}
                building={gathering}
                progress={progress?.building === true ? progress : undefined}
                record={decided > 0 ? `${won} van ${decided} beslechte zaken gewonnen` : undefined}
                onDraw={commands.draw ? draw : undefined}
                onSubmit={() => setConfirm("submit")}
                submitBlocked={submitBlocked}
                onDismiss={() => setPackDismissed(true)}
              />
            ) :
            c.status === "submitted" ?
            (
              <section className="flex items-center gap-3 rounded-lg bg-arc-tint px-4 py-3">
                <Check className="size-4 text-arc-ink" strokeWidth={2.25} />
                <p className="text-base text-ink">
                  Ingediend bij {provider}.
                </p>
              </section>
            ) :
            null}

          {/* Reason card — flat, hairline border. */}
          <section className="panel flex flex-col gap-2 rounded-lg p-4">
            <span className="font-medium text-xs text-ink-2">
              Reden
            </span>
            <p className="text-md text-ink leading-[1.55]">{c.reason}</p>
            <p className="text-sm text-ink-3 leading-none">
              Ingediend door <span className="capitalize">{c.provider}</span> op{" "}
              <span className="tabular-nums">
                {formatDate(c.opened_at)}
              </span>
            </p>
          </section>

          {/* Evidence — file list with AI-attached items marked. */}
          <section className="panel flex flex-col gap-2 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-xs text-ink-2">
                Bewijs · {c.evidence_files.length}
              </span>
              {open ?
                (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={editBlocked !== undefined}
                    title={editBlocked}
                    className="flex h-7 items-center gap-1.5 rounded-md px-2 font-medium text-sm text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
                  >
                    <Upload className="size-3.5" strokeWidth={1.75} />
                    Uploaden
                  </button>
                ) :
                null}
            </div>
            {c.evidence_files.length === 0 ?
              (
                <EmptyState
                  compact
                  kind="chargebacks"
                  title="Nog geen bestanden."
                  body={commands.draw
                    ? "Insyte verzamelt bewijs uit de gekoppelde winkels."
                    : "Voeg bewijs toe: een bezorgbevestiging, een factuur of mails met de klant."}
                  action={!open
                    ? undefined
                    : commands.draw
                    ? { label: "Bewijspakket samenstellen", onClick: () => void draw() }
                    : editBlocked === undefined
                    ? { label: "Bewijs toevoegen", onClick: () => fileInput.current?.click() }
                    : undefined}
                />
              ) :
              (
                <ul className="flex flex-col divide-y divide-ink/7">
                  <AnimatePresence initial={false}>
                    {c.evidence_files.map((f, i) => (
                      <EvidenceRow
                        key={`${i}-${f.name}`}
                        file={f}
                        href={fileHref?.(c, i)}
                        removable={open && editBlocked === undefined}
                        onRemove={() => removeFile(i)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
          </section>
        </div>

        <div className="flex flex-col gap-3">
          {/* Quick facts */}
          <section className="panel flex flex-col gap-3 rounded-lg p-4">
            <span className="font-medium text-xs text-ink-2">
              Feiten van de zaak
            </span>
            <dl className="flex flex-col gap-3 text-sm">
              <Fact label="Aanbieder" value={c.provider} capitalize />
              <Fact label="Zaak-ID" value={c.case_number} mono />
              {c.order_id ? <Fact label="Bestelling" value={c.order_id} mono /> : null}
              <Fact
                label="Bedrag"
                value={formatCurrency(c.amount, c.currency)}
                mono
                strong
              />
              <Fact label="Ingediend" value={formatDate(c.opened_at)} mono />
              <Fact label="Deadline" value={formatDate(c.deadline_at)} mono />
            </dl>
          </section>

          <NotePanel key={`${c.id}:${c.notes ?? ""}`} c={c} blocked={editBlocked} onSave={commands.note} />

          {/* Timeline */}
          <section className="panel flex flex-col gap-3 rounded-lg p-4">
            <span className="font-medium text-xs text-ink-2">
              Tijdlijn
            </span>
            {c.timeline.length === 0 ?
              (
                <EmptyState
                  compact
                  kind="tickets"
                  title="Nog geen gebeurtenissen."
                  body="Elke melding, upload en indiening bij deze zaak komt hier, op volgorde."
                />
              ) :
              (
                <ol className="relative flex flex-col gap-4 pl-4">
                  <span
                    className="absolute top-1.5 bottom-1.5 left-[5px] w-px bg-ink/10"
                    aria-hidden
                  />
                  {c.timeline.map((t) => {
                    const isAi = t.actor.toLowerCase().includes("insyte ai")
                    return (
                      <li
                        key={`${t.at}-${t.event}`}
                        className="relative flex flex-col gap-0.5"
                      >
                        <span
                          className={cn(
                            "absolute top-1 -left-[14px] size-[7px] rounded-full",
                            isAi ? "bg-arc" : "bg-ink-4"
                          )}
                          aria-hidden
                        />
                        <span className="font-medium text-base text-ink leading-[1.3]">
                          {t.event}
                        </span>
                        <div className="flex items-center gap-2 font-medium text-xs text-ink-3 leading-none">
                          <span
                            className={cn(
                              isAi ? "font-medium text-arc-ink" : undefined
                            )}
                          >
                            {t.actor}
                          </span>
                          <span className="text-ink-3">·</span>
                          <span className="tabular-nums">
                            {formatDateTime(t.at)}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
          </section>
        </div>
      </div>
      <PageGuide id="chargebacks.case" title="Chargeback" steps={GUIDE} />
    </DetailShell>
  )
}

/* --------------------------------- AI Evidence Pack --------------------------------- */

function AiEvidencePack({
  caseNumber,
  provider,
  files,
  building,
  progress,
  record,
  onDraw,
  onSubmit,
  onDismiss,
  submitBlocked
}: {
  caseNumber: string
  provider: string
  files: number
  building: boolean
  /** The host's count of the documents in so far, while it gathers. */
  progress?: { done: number; total: number } | undefined
  /** The record on file, counted rather than claimed. */
  record?: string
  /** Absent where Insyte cannot draw the pack yet. */
  onDraw?: (() => void) | undefined
  onSubmit: () => void
  onDismiss: () => void
  /** Why it cannot be submitted yet. */
  submitBlocked?: string | undefined
}) {
  const ready = files > 0 && !building
  return (
    <section className="plate flex flex-col gap-3 overflow-hidden rounded-lg p-4 text-mesh-ink">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-medium text-xs">
          <Sparkles className="size-3.5 text-mesh-ink" strokeWidth={1.75} />
          <span className="text-mesh-ink">Bewijspakket</span>
        </div>
        {record ? <span className="text-mesh-ink-3 text-xs tabular-nums">{record}</span> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="font-medium text-xl text-mesh-ink">
          {building
            ? `Verzamelen · ${progress?.done ?? files} van ${progress?.total || 4}`
            : ready
            ? `${files} ${files === 1 ? "document" : "documenten"} klaar voor ${provider}.`
            : `Insyte kan het bewijs voor ${caseNumber} samenstellen.`}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        {ready || !onDraw ?
          (
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitBlocked !== undefined || !ready}
              title={submitBlocked}
              className="group/btn flex h-8 items-center justify-center gap-1.5 rounded-md bg-paper px-3 font-medium text-abyss text-xs transition-colors hover:bg-arc-tint disabled:pointer-events-none disabled:opacity-45"
            >
              Indienen bij {provider}
              <ArrowRight className="size-3.5 transition-transform group-hover/btn:translate-x-0.5" strokeWidth={2} />
            </button>
          ) :
          (
            <button
              type="button"
              onClick={onDraw}
              disabled={building}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-paper px-3 font-medium text-abyss text-xs transition-colors hover:bg-arc-tint disabled:opacity-80"
            >
              {building
                ? <Loader className="size-3.5 animate-spin" />
                : <Sparkles className="size-3.5" strokeWidth={1.75} />}
              {building ? "Pakket samenstellen" : "Bewijspakket samenstellen"}
            </button>
          )}
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto flex h-8 items-center rounded-md px-2.5 font-medium text-sm text-mesh-ink-2 transition-colors hover:bg-mesh-ink/8 hover:text-mesh-ink"
        >
          Niet nu
        </button>
      </div>
      {submitBlocked ? <p className="text-mesh-ink-3 text-xs">{submitBlocked}</p> : null}
    </section>
  )
}

function EvidenceRow({
  file,
  href,
  removable,
  onRemove
}: {
  file: { name: string; size: number; kind: string }
  /** Where the file opens; absent where there is nothing to open. */
  href?: string | undefined
  removable: boolean
  onRemove: () => void
}) {
  const still = useReducedMotion()
  const drawn = file.kind !== "upload"
  return (
    <motion.li
      layout={still ? false : "position"}
      initial={still ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="group flex items-center gap-3 overflow-hidden py-2.5"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-mist">
        <FileText className="size-3.5 text-ink-3" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        {href ?
          (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="truncate font-medium text-base text-ink leading-none hover:underline"
            >
              {file.name}
            </a>
          ) :
          <span className="truncate font-medium text-base text-ink leading-none">{file.name}</span>}
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-3 leading-none">
          <span className="tabular-nums">{Math.max(1, Math.round(file.size / 1024))} KB</span>
          <span>·</span>
          <span className={cn(drawn && "font-medium text-arc-ink")}>
            {drawn ? "Samengesteld door Insyte" : "Door jou geüpload"}
          </span>
        </div>
      </div>
      {removable ?
        (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${file.name} verwijderen`}
            className="flex size-7 items-center justify-center rounded-md text-ink-3 opacity-0 transition hover:bg-signal-red-bg hover:text-signal-red focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) :
        null}
    </motion.li>
  )
}

/* --------------------------------- Notes --------------------------------- */

/** "Notities": the case's note for the team, kept when it is saved; a save that fails keeps what was typed. */
function NotePanel({
  c,
  blocked,
  onSave
}: {
  c: Chargeback
  /** Why the role cannot change it. */
  blocked: string | undefined
  onSave: (c: Chargeback, note: string) => Promise<boolean>
}) {
  const saved = c.notes ?? ""
  const [draft, setDraft] = useState(saved)
  const [saving, setSaving] = useState(false)
  const dirty = draft.trim() !== saved.trim()

  async function save() {
    setSaving(true)
    const kept = await onSave(c, draft.trim())
    setSaving(false)
    if (kept) setDraft(draft.trim())
  }

  return (
    <section className="panel flex flex-col gap-2 rounded-lg p-4">
      <span className="font-medium text-xs text-ink-2">Notities</span>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={blocked !== undefined}
        title={blocked}
        maxLength={2000}
        rows={3}
        aria-label="Notities"
        placeholder={blocked === undefined ? "bijv. klant vroeg per e-mail om terugbetaling…" : "Nog geen notities."}
        className="field rounded-md px-3 py-2.5 text-ink text-sm leading-[1.55] outline-none placeholder:text-ink-3 focus:bg-paper"
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-ink-3 text-xs">Alleen zichtbaar voor je team.</span>
        {dirty && blocked === undefined ?
          (
            <>
              <button
                type="button"
                onClick={() => setDraft(saved)}
                disabled={saving}
                className="flex h-7 items-center rounded-md px-2 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-45"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="flex h-7 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-80"
              >
                {saving ? <Loader className="size-3.5 animate-spin" /> : null}
                {saving ? "Opslaan…" : "Opslaan"}
              </button>
            </>
          ) :
          null}
      </div>
    </section>
  )
}

/* --------------------------------- Bits --------------------------------- */

function Fact({
  label,
  value,
  mono,
  strong,
  capitalize
}: {
  label: string
  value: string
  mono?: boolean
  strong?: boolean
  capitalize?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={cn(
          mono ? "tabular-nums" : "",
          capitalize ? "capitalize" : "",
          strong ? "font-medium text-ink" : "font-medium text-ink-2",
          "truncate text-right"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function DeadlinePill({
  daysLeft,
  date,
  tone
}: {
  daysLeft: number
  date: string
  tone: "danger" | "warning" | "neutral"
}) {
  const tones = {
    danger: { bg: "var(--signal-red-bg)", fg: "var(--signal-red)" },
    warning: { bg: "var(--signal-amber-bg)", fg: "var(--signal-amber)" },
    neutral: { bg: "var(--mist)", fg: "var(--ink-3)" }
  }
  const t = tones[tone]
  const label = daysLeft < 0
    ? `${Math.abs(daysLeft)} d verlopen`
    : daysLeft === 0
    ? "Vandaag"
    : `nog ${daysLeft} d`
  return (
    <span
      className="inline-flex h-5 items-center gap-1 rounded px-1.5 font-medium text-xs leading-none"
      style={{ background: t.bg, color: t.fg }}
      title={formatDate(date)}
    >
      <span className="tabular-nums">{label}</span>
    </span>
  )
}
