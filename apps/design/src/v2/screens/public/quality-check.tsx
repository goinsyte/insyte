import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { CHECK_KIND_LABEL, CHECK_STATUS_LABEL, DELIVERABLE_LABEL, qualityCheck } from "../../fixtures/public.ts"
import type { QualityCheck } from "../../fixtures/public.ts"
import { product, supplier } from "../../fixtures/records.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { FileDrop, FileRow } from "../../ui/file-drop.tsx"
import type { FileState } from "../../ui/file-drop.tsx"
import { CheckCircle, ClipboardCheck, LinkIcon, XCircle } from "../../ui/icons.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { clock, dayMonth, LoadingStep, pause, PublicFrame, Row, Step, Title, weekdayDayMonth } from "./frame.tsx"

/*
 * A quality check by link (`/app/kwaliteit/$checkId`): what a brand asked a supplier to show before a
 * batch ships, opened from the mail without an account. It says who asks what, for which product
 * and by when, and takes the photos, the video, the batch number and the measured sizes. Once sent
 * the brand reviews it; a rejected one says why and takes a new submission. A link that is unknown
 * or spent says so, and who to ask for a new one.
 */

type Upload = {
  readonly id: number
  readonly name: string
  readonly bytes: number
  readonly video: boolean
  state: FileState
}

let uploadId = 0

export function QualityCheckScreen({ id }: { readonly id: string }) {
  const view = useView()
  const check = qualityCheck(id)
  const data = dataState(view)
  const brand = check?.brand ?? "Kwaliteitscontrole"

  if (data === "loading") {
    return (
      <PublicFrame brand={brand} wide>
        <LoadingStep />
      </PublicFrame>
    )
  }
  if (data === "error") {
    return (
      <PublicFrame brand={brand} wide>
        <ErrorState
          title="De controle laadt niet"
          detail="503 · quality.link"
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        >
          Er ging iets mis aan onze kant. Je link blijft geldig; probeer het over een minuut opnieuw.
        </ErrorState>
      </PublicFrame>
    )
  }
  if (check === undefined || data === "empty") {
    return (
      <PublicFrame brand={brand} wide>
        <EmptyState glyph={LinkIcon} title="Deze link werkt niet meer">
          Vraag je opdrachtgever om een nieuwe link naar de kwaliteitscontrole.
        </EmptyState>
      </PublicFrame>
    )
  }
  return <Check check={check} />
}

function Check({ check }: { readonly check: QualityCheck }) {
  const p = product(check.productId)
  const s = supplier(check.supplierId)
  const [submittedAt, setSubmittedAt] = useState<Date | null>(check.submitted?.at ?? null)
  const [resubmitting, setResubmitting] = useState(false)
  const status = submittedAt !== null && check.status === "requested" ? "submitted" : check.status
  const late = status === "requested" && check.due < DEMO_NOW.date
  const open = status === "requested" || (status === "rejected" && resubmitting)

  return (
    <PublicFrame brand={check.brand} wide>
      <Step stepKey={open ? "open" : status}>
        <Title
          sub={`${check.brand} vraagt ${
            s?.name ?? "je"
          } om een kwaliteitscontrole. ${check.requestedBy} stuurde dit verzoek.`}
        >
          {CHECK_KIND_LABEL[check.kind]}: {p?.name ?? check.productId}
        </Title>

        <dl className="flex flex-col gap-3">
          <Row term="Status">
            <span
              className={cx(
                "font-medium",
                late ? "text-bad-ink" : status === "approved" ? "text-good-ink" : "text-ink"
              )}
            >
              {late ? "Te laat" : CHECK_STATUS_LABEL[status]}
            </span>
          </Row>
          <Row term="Aanleveren">
            {check.deliverables.map((d) => DELIVERABLE_LABEL[d]).join(", ")}
            {check.sizes === undefined ? "" : ` (${check.sizes.join(", ")})`}
          </Row>
          <Row term="Vóór">
            <span className="figure">{weekdayDayMonth(check.due)}, {clock(check.due)}</span>
          </Row>
          {p !== undefined && (
            <Row term="Product">
              <span className="figure">{p.name} · {p.sku}</span>
            </Row>
          )}
        </dl>

        {check.note !== undefined && (
          <blockquote className="flex flex-col gap-1 rounded-md bg-well px-4 py-3.5">
            <p className="text-sm text-pretty text-ink">{check.note}</p>
            <footer className="text-xs text-ink-3">{check.requestedBy}, {check.brand}</footer>
          </blockquote>
        )}

        {status === "rejected" && check.decision !== undefined && (
          <Outcome tone="bad" title={`${check.brand} keurde af`}>
            {check.decision.reason ?? "Zonder toelichting."} {check.decision.by}, {dayMonth(check.decision.at)}.
          </Outcome>
        )}
        {status === "approved" && check.decision !== undefined && (
          <Outcome tone="good" title="Goedgekeurd">
            {check.decision.by} keurde je controle goed op {dayMonth(check.decision.at)}. Je hoeft niets meer te doen.
          </Outcome>
        )}
        {status === "submitted" && submittedAt !== null && (
          <Outcome tone="neutral" title="Ingestuurd">
            Ingestuurd op <span className="figure">{dayMonth(submittedAt)} om {clock(submittedAt)}</span>. {check.brand}
            {" "}
            beoordeelt het en je krijgt een mail met het besluit.
          </Outcome>
        )}

        {check.submitted !== undefined && !open && (
          <section aria-labelledby="sent" className="flex flex-col gap-2.5">
            <h2 id="sent" className="text-sm font-semibold text-ink">Wat je instuurde</h2>
            <dl className="flex flex-col gap-2">
              <Row term="Foto's">
                <span className="figure">{check.submitted.photos}</span>
              </Row>
              {check.submitted.video && <Row term="Video">1</Row>}
              {check.submitted.batch !== undefined && (
                <Row term="Batchnummer">
                  <span className="figure">{check.submitted.batch}</span>
                </Row>
              )}
              {check.submitted.note !== undefined && <Row term="Notitie">{check.submitted.note}</Row>}
            </dl>
          </section>
        )}

        {status === "rejected" && !resubmitting && (
          <Button
            variant="primary"
            onClick={() => setResubmitting(true)}
            className="min-h-11 w-full"
          >
            Opnieuw insturen
          </Button>
        )}

        {open && (
          <Submission
            check={check}
            title={status === "rejected" ? "Nieuwe controle" : "Je controle"}
            onSent={(at) => {
              setSubmittedAt(at)
              setResubmitting(false)
              toast({
                title: "Controle ingestuurd",
                body: `${check.brand} krijgt een melding en beoordeelt het.`,
                tone: "good",
                action: {
                  label: "Ongedaan maken",
                  onClick: () => setSubmittedAt(check.submitted?.at ?? null)
                },
                duration: 8000
              })
            }}
          />
        )}
      </Step>
    </PublicFrame>
  )
}

function Outcome({ tone, title, children }: {
  readonly tone: "good" | "bad" | "neutral"
  readonly title: string
  readonly children: ReactNode
}) {
  const G = tone === "good" ? CheckCircle : tone === "bad" ? XCircle : ClipboardCheck
  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-md px-4 py-3.5",
        tone === "good" ? "bg-good-tint" : tone === "bad" ? "bg-bad-tint" : "bg-well"
      )}
    >
      <G
        size={17}
        className={cx(
          "mt-0.5 shrink-0",
          tone === "good" ? "text-good-ink" : tone === "bad" ? "text-bad-ink" : "text-ink-2"
        )}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-sm text-pretty text-ink-2">{children}</p>
      </div>
    </div>
  )
}

function Submission({ check, title, onSent }: {
  readonly check: QualityCheck
  readonly title: string
  readonly onSent: (at: Date) => void
}) {
  const wantsVideo = check.deliverables.includes("video")
  const wantsBatch = check.deliverables.includes("batch")
  const [uploads, setUploads] = useState<ReadonlyArray<Upload>>([])
  const [batch, setBatch] = useState("")
  const [sizes, setSizes] = useState<Readonly<Record<string, string>>>({})
  const [note, setNote] = useState("")
  const [errors, setErrors] = useState<{ files?: string; batch?: string; video?: string }>({})
  const [busy, setBusy] = useState(false)

  // The demo's upload: each file fills its bar in under a second.
  useEffect(() => {
    if (!uploads.some((u) => u.state.kind === "uploading")) return
    const t = window.setTimeout(() => {
      setUploads((now) =>
        now.map((u) =>
          u.state.kind === "uploading"
            ? {
              ...u,
              state: u.state.progress >= 0.95
                ? { kind: "done" }
                : { kind: "uploading", progress: u.state.progress + 0.25 }
            }
            : u
        )
      )
    }, 180)
    return () => window.clearTimeout(t)
  }, [uploads])

  const add = (files: ReadonlyArray<File>) => {
    setErrors((e) => ({ ...e, files: undefined, video: undefined }))
    setUploads((now) => [
      ...now,
      ...files.map((f): Upload => {
        const ok = f.type.startsWith("image/") || f.type.startsWith("video/")
        return {
          id: ++uploadId,
          name: f.name,
          bytes: f.size,
          video: f.type.startsWith("video/"),
          state: ok ? { kind: "uploading", progress: 0.1 } : { kind: "failed", reason: "Geen foto of video." }
        }
      })
    ])
  }

  const submit = async () => {
    const done = uploads.filter((u) => u.state.kind === "done")
    const next = {
      files: done.some((u) => !u.video) ? undefined : "Minstens één foto nodig.",
      video: wantsVideo && !done.some((u) => u.video) ? "Voeg de video toe." : undefined,
      batch: wantsBatch && batch.trim() === "" ? "Vul het batchnummer in." : undefined
    }
    setErrors(next)
    if (next.files !== undefined || next.video !== undefined || next.batch !== undefined) return
    setBusy(true)
    await pause(900)
    setBusy(false)
    onSent(DEMO_NOW.date)
  }

  return (
    <form
      noValidate
      aria-labelledby="submission"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h2 id="submission" className="text-md font-semibold text-ink">{title}</h2>
      <div className="flex flex-col gap-2">
        <FileDrop
          accept="image/*,video/*"
          label={wantsVideo ? "Foto's en video kiezen" : "Foto's kiezen"}
          hint={wantsVideo
            ? "JPG, PNG, HEIC of MP4. Sleep ze hierheen of kies ze."
            : "JPG, PNG of HEIC. Sleep ze hierheen of kies ze."}
          onFiles={add}
          invalid={errors.files ?? errors.video}
        />
        {uploads.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {uploads.map((u) => (
              <li key={u.id}>
                <FileRow
                  name={u.name}
                  bytes={u.bytes}
                  state={u.state}
                  onRemove={() => setUploads((now) => now.filter((x) => x.id !== u.id))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {wantsBatch && (
        <Field label="Batchnummer" error={errors.batch} hint="Staat op het label in de kraag of op de doos.">
          {(c) => (
            <Input
              {...c}
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="AL-2618"
              autoComplete="off"
              className="figure min-h-10 pointer-coarse:min-h-11"
            />
          )}
        </Field>
      )}
      {check.sizes !== undefined && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-ink">
            Maten gemeten <span className="font-normal text-ink-3">borstwijdte × lengte in cm</span>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {check.sizes.map((size) => (
              <Field key={size} label={size} optional>
                {(c) => (
                  <Input
                    {...c}
                    value={sizes[size] ?? ""}
                    onChange={(e) => setSizes({ ...sizes, [size]: e.target.value })}
                    placeholder="54 × 70"
                    inputMode="decimal"
                    className="figure min-h-10 pointer-coarse:min-h-11"
                  />
                )}
              </Field>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Notitie" optional>
        {(c) => (
          <Textarea
            {...c}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={`Iets dat ${check.brand} moet weten`}
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="primary"
        loading={busy}
        disabled={uploads.some((u) => u.state.kind === "uploading")}
        className="min-h-11 w-full"
      >
        Controle insturen
      </Button>
    </form>
  )
}
