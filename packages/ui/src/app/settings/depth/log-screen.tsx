import { Link } from "@tanstack/react-router"
import { ArrowRight, Download, FileText } from "../../../icons"
import { EmptyState } from "../../common/empty-state"
import { formatDateTime } from "../../lib/format"
import { cn } from "../../lib/utils"
import { PersonDisc, Segmented } from "../../team/bits"
import { useLogSource } from "../log-source"
import { SettingCard } from "../setting-card"

/**
 * Logboek (`/settings/log`, PLAN 43): every change to a setting, who made it, what it was and what
 * it became, and the page it was made on. Saving on a settings page writes here. The lines, the
 * filter and the export are the host's (`log-source.tsx`).
 */
export function LogPage() {
  const source = useLogSource()
  const { period, who, page } = source.filter
  const rows = source.lines
  return (
    <SettingCard
      title="Elke wijziging in de instellingen"
      icon={FileText}
      subtitle="Logboeken bewaart Insyte zolang onder Gegevens en privacy staat."
      action={
        <button
          type="button"
          disabled={!rows.length}
          onClick={source.exportCsv}
          className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary hover:bg-abyss-2 disabled:opacity-45"
        >
          <Download className="size-3.5" strokeWidth={1.75} />
          Exporteren
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Periode"
          value={period}
          onChange={(next) => source.setFilter({ ...source.filter, period: next })}
          options={[{ id: "7", label: "7 dagen" }, { id: "30", label: "30 dagen" }, { id: "all", label: "Alles" }]}
        />
        <select
          value={who}
          onChange={(e) => source.setFilter({ ...source.filter, who: e.target.value })}
          aria-label="Wie"
          className="field h-9 rounded-md px-2.5 text-ink text-sm outline-none focus:bg-paper"
        >
          <option value="">Iedereen</option>
          {source.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={page}
          onChange={(e) => source.setFilter({ ...source.filter, page: e.target.value })}
          aria-label="Pagina"
          className="field h-9 rounded-md px-2.5 text-ink text-sm outline-none focus:bg-paper"
        >
          <option value="">Alle pagina's</option>
          {source.pages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {source.retry !== undefined ?
        (
          <EmptyState
            kind="activity"
            title="Het logboek kon niet worden geladen"
            body="Er ging iets mis bij het ophalen. Probeer het zo opnieuw."
            action={{ label: "Opnieuw proberen", onClick: source.retry }}
          />
        ) :
        rows.length === 0 ?
        (
          <EmptyState
            kind="activity"
            title={source.any ? "Niets in deze periode." : "Nog niets gewijzigd."}
            body={source.any
              ? "Kies een langere periode of iemand anders."
              : "Wie een instelling verandert, komt hier te staan, met wat het was en wat het werd."}
          />
        ) :
        (
          <div className="table-scroll overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            <div className="grid min-w-[720px] grid-cols-[140px_170px_minmax(0,1fr)_150px] gap-3 bg-mist px-3.5 py-2 font-medium text-ink-3 text-xs">
              <span>Wanneer</span>
              <span>Wie</span>
              <span>Wat</span>
              <span>Pagina</span>
            </div>
            {rows.map((r, i) => (
              <div
                key={r.id}
                className={cn(
                  "grid min-w-[720px] grid-cols-[140px_170px_minmax(0,1fr)_150px] items-center gap-3 px-3.5 py-2 text-sm",
                  i % 2 ? "bg-mist/40" : "bg-paper"
                )}
              >
                <span className="text-ink-2 tabular-nums">{formatDateTime(r.at)}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <PersonDisc seed={r.who} name={r.who} size={20} />
                  <span className="truncate text-ink">{r.who}</span>
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-ink">{r.field}</span>
                  <span className="rounded bg-signal-red-bg px-1.5 text-ink-2 line-through decoration-ink-3/60">
                    {r.before}
                  </span>
                  <ArrowRight aria-hidden className="size-3 text-ink-4" strokeWidth={1.75} />
                  <span className="rounded bg-signal-green-bg px-1.5 text-ink">{r.after}</span>
                </span>
                {r.to === "" ?
                  <span className="truncate text-ink-2">{r.page}</span> :
                  (
                    <Link to={r.to} className="truncate text-arc-ink hover:underline">
                      {r.page}
                    </Link>
                  )}
              </div>
            ))}
          </div>
        )}
      {source.more !== undefined && source.retry === undefined && rows.length > 0 ?
        (
          <button
            type="button"
            disabled={source.more.busy}
            onClick={source.more.load}
            className="field flex h-8 items-center gap-1.5 self-center rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover disabled:opacity-45"
          >
            {source.more.busy ? "Laden…" : "Meer laden"}
          </button>
        ) :
        null}
    </SettingCard>
  )
}
