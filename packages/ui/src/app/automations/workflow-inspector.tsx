import { useNavigate } from "@tanstack/react-router"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/select"
import { Switch } from "../../components/switch"
import { AlertTriangle, Trash2, X } from "../../icons"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { kindLabel, VARIANTS_BY_ID, type WorkflowNode, type WorkflowSettings } from "./node-types"
import { missingScope, SCOPE_LABEL } from "./scopes"
import { type StepIssue, useAutomationsSource } from "./source"
import { StepTile } from "./step-tile"
import { VarChip, VarText } from "./summary"

const WELL =
  "field h-8 w-full rounded-md px-2.5 text-ink text-sm outline-none placeholder:text-ink-3 hover:field-hover focus:bg-paper"

const FIELDS = ["customer.email", "customer.first_name", "order.number", "order.total"]

/**
 * A step's settings, beside the canvas: 288px of `paper`, opened by clicking a step and closed with X
 * or Escape. A field written as {{customer.email}} is read back under the input as a chip, and the
 * right the step needs is named, with a warning when the flow does not hold it.
 */
export function WorkflowInspector({
  automationId,
  node,
  settings,
  issues,
  onClose
}: {
  automationId: string
  node: WorkflowNode
  settings: WorkflowSettings
  /** What the host says is wrong with this step. */
  issues?: ReadonlyArray<StepIssue> | undefined
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { editor, people, useFields } = useAutomationsSource()
  const fields = useFields?.(automationId) ?? FIELDS
  const v = VARIANTS_BY_ID[node.variantId]
  if (!v) return null
  const isTrigger = v.kind === "trigger"
  const set = (patch: Record<string, unknown>) => editor.updateNodeConfig(automationId, node.id, patch)
  const fieldIssue = (key: string) => issues?.find((i) => i.field === key && i.code !== "missing_field")
  const stepIssues = issues?.filter((i) => i.field === undefined && i.code !== "scope_off") ?? []
  const missing = missingScope(node, settings)

  return (
    <aside
      className="flex w-72 shrink-0 flex-col bg-paper"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        <StepTile variant={v} size={28} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-ink text-sm">{v.label}</span>
          <span className="truncate text-ink-3 text-xs">{kindLabel(v)}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Instellingen sluiten"
          className="flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="px-3 pb-3 text-ink-3 text-xs leading-[1.5]">{v.description}</p>
      {stepIssues.length > 0 ?
        (
          <ul className="mx-3 mb-3 flex flex-col gap-1 rounded-md bg-signal-amber-bg px-2.5 py-2">
            {stepIssues.map((i) => (
              <li key={i.code} className="flex items-start gap-1.5 text-ink-2 text-xs leading-[1.5]">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-3 shrink-0",
                    i.severity === "error" ? "text-signal-red" : "text-signal-amber"
                  )}
                />
                {i.message}
              </li>
            ))}
          </ul>
        ) :
        null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
        <Row label={isTrigger ? "Wanneer" : "Titel op het canvas"}>
          <input
            value={String((isTrigger ? node.config.summary : node.config.title_override) ?? "")}
            placeholder={isTrigger ? v.description : v.label}
            onChange={(e) => set(isTrigger ? { summary: e.target.value } : { title_override: e.target.value })}
            className={WELL}
          />
        </Row>

        {v.fields.map((f) => {
          const value = node.config[f.key]
          if (f.type === "select") {
            return (
              <Row key={f.key} label={f.label}>
                <Select
                  items={f.options}
                  value={String(value ?? f.options[0]?.value ?? "")}
                  onValueChange={(x) => set({ [f.key]: x })}
                >
                  <SelectTrigger size="sm" className="w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
            )
          }
          if (f.type === "member") {
            // A teammate by id; the name beside it is for the canvas, never what an answer is checked against.
            const picked = String(value ?? "")
            const empty = f.required === true && picked === ""
            return (
              <Row key={f.key} label={f.label} hint={empty ? "Nodig om te draaien" : fieldIssue(f.key)?.message}>
                <Select
                  items={[...people]}
                  value={picked}
                  onValueChange={(x) =>
                    set({
                      [f.key]: x,
                      [`${f.key}_name`]: people.find((p) => p.value === x)?.label ?? ""
                    })}
                >
                  <SelectTrigger size="sm" className="w-full text-sm">
                    <SelectValue placeholder="Kies een collega" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
            )
          }
          if (f.type === "switch") {
            return (
              <div key={f.key} className="flex items-center justify-between">
                <span className="text-ink-2 text-xs">{f.label}</span>
                <Switch checked={Boolean(value)} onCheckedChange={(c) => set({ [f.key]: c })} />
              </div>
            )
          }
          const text = String(value ?? "")
          const empty = "required" in f && f.required && text.trim() === ""
          const wrong = fieldIssue(f.key)
          return (
            <Row key={f.key} label={f.label} hint={empty ? "Nodig om te draaien" : wrong?.message}>
              {f.type === "textarea" ?
                (
                  <textarea
                    value={text}
                    rows={3}
                    aria-invalid={empty || undefined}
                    onChange={(e) => set({ [f.key]: e.target.value })}
                    className={cn(WELL, "h-auto resize-none py-1.5 leading-[1.5]")}
                  />
                ) :
                (
                  <input
                    type={f.type === "number" ? "number" : "text"}
                    value={text}
                    aria-invalid={empty || undefined}
                    placeholder={"placeholder" in f ? f.placeholder : undefined}
                    onChange={(e) => set({ [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })}
                    className={cn(WELL, "tabular-nums")}
                  />
                )}
              {text.includes("{{")
                ? <VarText text={text} className="line-clamp-2 text-ink-3 text-xs leading-[1.6]" />
                : null}
            </Row>
          )
        })}

        {v.fields.some((f) => f.type === "text" || f.type === "textarea") ?
          (
            <div className="flex flex-col gap-1.5">
              <span className="text-ink-3 text-xs">Velden van het record, te schrijven als {"{{veld}}"}</span>
              <div className="flex flex-wrap gap-1">
                {fields.map((k) => <VarChip key={k} name={k} />)}
              </div>
            </div>
          ) :
          null}

        {v.scope ?
          (
            <div
              className={cn("flex flex-col gap-1 rounded-md px-2.5 py-2", missing ? "bg-signal-amber-bg" : "bg-mist")}
            >
              <span className="flex items-center gap-1.5 text-ink-2 text-xs">
                {missing ? <AlertTriangle className="size-3 text-signal-amber" /> : null}
                {missing ? "Deze stap mislukt: de flow mist het recht" : "Recht dat deze stap gebruikt"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-ink text-xs">{SCOPE_LABEL[v.scope]}</span>
                <span className="rounded-sm bg-ink/7 px-1 text-ink-2 text-xs">{v.scope}</span>
              </span>
              {missing ?
                (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/automations/$automationId",
                        params: { automationId },
                        search: { tab: "settings" }
                      })}
                    className="self-start text-arc-ink text-xs underline-offset-2 hover:underline"
                  >
                    Naar Rechten
                  </button>
                ) :
                null}
            </div>
          ) :
          null}
      </div>

      {isTrigger ? null : (
        <div className="shrink-0 px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              const undo = editor.removeNode(automationId, node.id)
              onClose()
              if (undo) undoable("Stap verwijderd", undo)
            }}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-signal-red text-sm transition-colors hover:bg-signal-red-bg"
          >
            <Trash2 className="size-3.5" />
            Stap verwijderen
          </button>
        </div>
      )}
    </aside>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2 text-ink-2 text-xs">
        {label}
        {hint ? <span className="text-signal-red">{hint}</span> : null}
      </span>
      {children}
    </div>
  )
}
