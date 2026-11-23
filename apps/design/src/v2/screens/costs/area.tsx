import { useState } from "react"
import type { AreaDef } from "../../areas.ts"
import { costOn, daysOf, figuresOf, KIND_LABEL, money, percent, PERIOD_LABEL } from "../../fixtures/costs.ts"
import type { CostKind, CostLine, Day, Period } from "../../fixtures/costs.ts"
import { navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, useAccess } from "../../ui/access.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { Edit, PiggyBank, Plus, Sheet as SheetGlyph, Trash } from "../../ui/icons.tsx"
import { Field, Input } from "../../ui/input.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { addLine, removeLine, updateLine, useLines } from "./store.ts"

/** Typed lines can be edited; the purchase price comes from the orders and Meta reports its own spend. */
const typed = (l: CostLine) => l.source === "getypt"

const ORDER: ReadonlyArray<CostKind> = ["inkoop", "percentage", "per-bestelling", "vast", "advertenties"]

const nl = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 2 })
const amount = (n: number) => money(Math.round(n))

/** "€ 18.400 per maand", "2,9% van de omzet", "uit de bestellingen". */
function basis(l: CostLine): string {
  switch (l.kind) {
    case "inkoop":
      return "inkoopprijs × stuks"
    case "percentage":
      return `${nl(l.amount)}% van de omzet incl. btw`
    case "per-bestelling":
      return `€ ${nl(l.amount)} per bestelling`
    case "vast":
      return `${money(l.amount)} per maand`
    case "advertenties":
      return l.source === "meta" ? "gemeld door Meta, gekoppeld" : `${money(l.amount)} per week, getypt van de factuur`
  }
}

/**
 * Kosten: from revenue to net profit, per day of Analyse's week or for today so far. Rebuilt from
 * `/app/costs` (`costs-screen.tsx`), by day instead of by month because the demo's orders are a week:
 * the revenue (€ 48.210 excl. btw, 1.204 orders) and the purchase price come from the orders, so the
 * margin is the same one Sheets and Analyse show. Viewing needs Analyse; changing a line needs
 * Instellingen · wijzigen, as in the original.
 */
function CostsScreen() {
  const view = useAccess("analytics")
  const edit = useAccess("settings").edit
  const state = dataState(useView())
  const lines = useLines()
  const period = (useQuery("periode") === "vandaag" ? "vandaag" : "week") satisfies Period
  const [dialog, setDialog] = useState<CostLine | "new" | null>(null)

  if (!view.view) {
    return (
      <Page width="text">
        <PageHead title="Kosten" />
        <Denied area="analytics" what="de kosten" />
      </Page>
    )
  }

  const days = daysOf(period)
  const f = figuresOf(lines, days)
  const sorted = ORDER.flatMap((k) => lines.filter((l) => l.kind === k))

  return (
    <Page>
      <PageHead
        title="Kosten"
        meta={`Van omzet naar nettowinst · ${PERIOD_LABEL[period]} · bedragen excl. btw`}
        actions={state === "ready" && (
          <>
            <Button icon={<SheetGlyph />} onClick={() => navigate(paths.sheet("winst-per-dag"))}>Winst per dag</Button>
            {edit && lines.length > 0 && (
              <Button variant="primary" icon={<Plus />} onClick={() => setDialog("new")}>Kostenpost</Button>
            )}
          </>
        )}
      />
      {state === "ready" && lines.length > 0 && !edit && (
        <Denied area="settings" need={2} size="inline" className="mb-2" />
      )}
      {state === "loading"
        ? (
          <div aria-busy="true" aria-label="Kosten laden" className="flex flex-col gap-4">
            <Skeleton className="h-5 w-full max-w-[60ch]" />
            {Array.from(
              { length: 9 },
              (_, i) => (
                <div key={i} className="flex h-11 items-center gap-6 border-b border-line">
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="ml-auto h-3 w-64" />
                </div>
              )
            )}
          </div>
        )
        : state === "error"
        ? (
          <ErrorState
            title="De kosten kwamen niet binnen"
            detail="GET /v1/costs · 503 · verzoek 1c90e4"
            action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
          >
            Je posten zijn niet weg; dit scherm kon ze alleen niet ophalen.
          </ErrorState>
        )
        : lines.length === 0
        ? (
          <EmptyState
            glyph={PiggyBank}
            title="Nog geen kosten"
            action={edit && <Button variant="primary" onClick={() => setDialog("new")}>Eerste kostenpost</Button>}
          >
            Vul in wat de winkel kost: inkoop, betaalkosten, verpakking, het team, advertenties. Dan rekent Insyte de
            nettowinst uit, in Analyse en in je sheets.
          </EmptyState>
        )
        : (
          <div className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-[64ch] text-md text-pretty text-ink">
                {period === "week" ? "Deze week" : "Vandaag tot 14:30"} hield de winkel{" "}
                <span className="figure font-semibold">{money(f.net)}</span> over van{" "}
                <span className="figure">{money(f.revenue)}</span> omzet,{" "}
                <span className="figure">{percent(f.margin)}</span>.{" "}
                <span className="text-ink-2">
                  Inkoop was <span className="figure">{percent(f.purchase / f.revenue)}</span>{" "}
                  van de omzet, advertenties <span className="figure">{percent(f.ads / f.revenue)}</span>, een ROAS van
                  {" "}
                  <span className="figure">{f.roas.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}</span>.
                </span>
              </p>
              <Segmented
                label="Periode"
                value={period}
                onChange={(next) => setQuery({ periode: next === "week" ? null : next })}
                options={[{ value: "week", label: "16–22 nov" }, { value: "vandaag", label: "Vandaag" }]}
              />
            </div>

            <CostTable lines={sorted} days={days} canEdit={edit} onEdit={setDialog} />

            <PageSection id="bronnen" title="Waar de cijfers vandaan komen">
              <ul className="flex max-w-[68ch] flex-col gap-2 text-sm text-pretty text-ink-2">
                <li>
                  <span className="font-medium text-ink">Omzet</span> is wat klanten betaalden zonder btw, van{" "}
                  <span className="figure">{f.orders.toLocaleString("nl-NL")}</span>{" "}
                  bestellingen. Hetzelfde getal als in Analyse.
                </li>
                <li>
                  <span className="font-medium text-ink">Inkoop</span>{" "}
                  is de inkoopprijs van elk product maal de stuks in de bestellingen; geannuleerde bestellingen tellen
                  niet mee.
                </li>
                <li>
                  <span className="font-medium text-ink">Vaste kosten</span>{" "}
                  per maand worden over de dagen verdeeld; vandaag telt tot 14:30.
                </li>
              </ul>
            </PageSection>
          </div>
        )}
      <LineDialog value={dialog} onClose={() => setDialog(null)} />
    </Page>
  )
}

function CostTable({ lines, days, canEdit, onEdit }: {
  readonly lines: ReadonlyArray<CostLine>
  readonly days: ReadonlyArray<Day>
  readonly canEdit: boolean
  readonly onEdit: (l: CostLine) => void
}) {
  const many = days.length > 1
  const total = figuresOf(lines, days)
  const perDay = days.map((d) => figuresOf(lines, [d]))
  const sum = (l: CostLine) => days.reduce((n, d) => n + costOn(l, d), 0)

  const totals: ReadonlyArray<readonly [string, (i: number | null) => string, boolean]> = [
    ["Omzet", (i) => amount(i === null ? total.revenue : (perDay[i]?.revenue ?? 0)), false],
    ["Alle kosten", (i) => amount(i === null ? total.costs : (perDay[i]?.costs ?? 0)), false],
    ["Nettowinst", (i) => amount(i === null ? total.net : (perDay[i]?.net ?? 0)), true],
    ["Marge", (i) => percent(i === null ? total.margin : (perDay[i]?.margin ?? 0)), false]
  ]

  return (
    <Table label="Kosten per dag" minWidth={many ? 1040 : 560}>
      <THead>
        <Th width="18rem">Post</Th>
        {many && days.map((d) => <Th key={d.key} align="right">{d.label}</Th>)}
        <Th align="right">{many ? "Week" : "Vandaag"}</Th>
        <Th width="3rem">
          <span className="sr-only">Bewerken</span>
        </Th>
      </THead>
      <TBody>
        {lines.map((l) => (
          <Tr key={l.id}>
            <Td header>
              <span className="flex flex-col py-1.5">
                <span className="font-medium text-ink">{l.name}</span>
                <span className="text-xs text-ink-3">{KIND_LABEL[l.kind]} · {basis(l)}</span>
              </span>
            </Td>
            {many && days.map((d) => <Td key={d.key} figure muted>{amount(costOn(l, d))}</Td>)}
            <Td figure className="font-medium text-ink">{amount(sum(l))}</Td>
            <Td align="right">
              {canEdit && typed(l) && (
                <IconButton
                  label={`${l.name} bewerken`}
                  size="sm"
                  className="pointer-coarse:size-11"
                  onClick={() => onEdit(l)}
                >
                  <Edit />
                </IconButton>
              )}
            </Td>
          </Tr>
        ))}
        {totals.map(([label, at, strong], row) => (
          <Tr key={label} className={cx(row === 0 && "border-t-2 border-t-line-strong")}>
            <Td header>
              <span className={cx(strong ? "font-semibold text-ink" : "font-medium text-ink-2")}>{label}</span>
            </Td>
            {many &&
              days.map((d, i) => (
                <Td key={d.key} figure className={cx(strong ? "font-semibold text-ink" : "text-ink-2")}>{at(i)}</Td>
              ))}
            <Td figure className={cx(strong ? "font-semibold text-ink" : "font-medium text-ink-2")}>{at(null)}</Td>
            <Td />
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

type Kind = "vast" | "per-bestelling" | "percentage" | "advertenties"

function LineDialog({ value, onClose }: { readonly value: CostLine | "new" | null; readonly onClose: () => void }) {
  const editing = value !== null && value !== "new" ? value : null
  return (
    <Dialog
      open={value !== null}
      onClose={onClose}
      title={editing === null ? "Kostenpost toevoegen" : `${editing.name} bewerken`}
      description={editing === null ? "Een post per soort kosten. Insyte rekent hem over de dagen uit." : undefined}
    >
      {value !== null && <LineForm key={editing?.id ?? "new"} editing={editing} onClose={onClose} />}
    </Dialog>
  )
}

function LineForm({ editing, onClose }: { readonly editing: CostLine | null; readonly onClose: () => void }) {
  const [name, setName] = useState(editing?.name ?? "")
  const [kind, setKind] = useState<Kind>(editing === null || editing.kind === "inkoop" ? "vast" : editing.kind)
  const [raw, setRaw] = useState(editing === null ? "" : String(editing.amount).replace(".", ","))
  const entered = Number(raw.replace(/\./g, "").replace(",", "."))
  const valid = name.trim() !== "" && raw.trim() !== "" && Number.isFinite(entered) && entered >= 0
  const [tried, setTried] = useState(false)

  const save = () => {
    setTried(true)
    if (!valid) return
    const line = { name: name.trim(), kind, source: "getypt" as const, amount: entered }
    if (editing === null) {
      const id = addLine(line)
      toast({
        title: `${line.name} toegevoegd`,
        body: "De nettowinst rekent er vanaf nu mee.",
        tone: "good",
        action: { label: "Ongedaan maken", onClick: () => removeLine(id) }
      })
    } else {
      const before = editing
      updateLine(editing.id, line)
      toast({
        title: `${line.name} opgeslagen`,
        action: { label: "Ongedaan maken", onClick: () => updateLine(before.id, before) }
      })
    }
    onClose()
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label="Naam" error={tried && name.trim() === "" ? "Geef de post een naam." : undefined}>
        {(control) => (
          <Input
            {...control}
            value={name}
            placeholder="Bijvoorbeeld: Klantenservice-software"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <RadioGroup
        label="Soort"
        value={kind}
        onChange={setKind}
        options={[
          { value: "vast", label: "Vast per maand", description: "Het team, Shopify, abonnementen." },
          { value: "per-bestelling", label: "Per bestelling", description: "Verpakking, een retourlabel." },
          { value: "percentage", label: "Deel van de omzet", description: "Betaalkosten, een commissie." },
          {
            value: "advertenties",
            label: "Advertenties",
            description: "Per week, van de factuur. Meta koppel je bij Koppelingen."
          }
        ]}
      />
      <Field
        label={kind === "vast"
          ? "Bedrag per maand"
          : kind === "per-bestelling"
          ? "Bedrag per bestelling"
          : kind === "percentage"
          ? "Percentage van de omzet"
          : "Bedrag per week"}
        error={tried && !valid && name.trim() !== "" ? "Vul een bedrag in, zoals 189 of 1,40." : undefined}
      >
        {(control) => (
          <Input
            {...control}
            inputMode="decimal"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            {...(kind === "percentage" ? { suffix: "%" } : { prefix: "€" })}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {editing === null ? <span /> : (
          <Button
            variant="ghost"
            icon={<Trash />}
            onClick={() => {
              const undo = removeLine(editing.id)
              onClose()
              toast({
                title: `${editing.name} verwijderd`,
                body: "De nettowinst rekent nu zonder deze post.",
                action: { label: "Ongedaan maken", onClick: undo }
              })
            }}
          >
            Verwijderen
          </Button>
        )}
        <div className="flex gap-2">
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" type="submit">{editing === null ? "Toevoegen" : "Opslaan"}</Button>
        </div>
      </div>
    </form>
  )
}

function thread() {
  return {
    items: [
      { kind: "page" as const, label: "Kosten", meta: "16–22 nov" },
      { kind: "sheet" as const, label: "Winst per dag", href: paths.sheet("winst-per-dag"), meta: "leest deze kosten" },
      { kind: "page" as const, label: "Analyse", href: paths.board("week"), meta: "€ 48.210 omzet deze week" },
      {
        kind: "setting" as const,
        label: "Koppelingen",
        href: paths.settings("koppelingen"),
        meta: "Meta Ads gekoppeld"
      }
    ],
    ask: "Kosten"
  }
}

/** Kosten: the area's entry for the shell (`areas.ts`). In the lead's "Meer" menu, so no Menu. */
export const area: AreaDef = { Screen: CostsScreen, thread }
