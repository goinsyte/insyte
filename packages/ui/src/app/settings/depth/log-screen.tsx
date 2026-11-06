import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Download, FileText } from "../../../icons";
import { EmptyState } from "../../common/empty-state";
import { exportCsv } from "../../lib/bulk";
import { formatDateTime } from "../../lib/format";
import { cn } from "../../lib/utils";
import { useSettingsDepth } from "../../stores/settings-depth-store";
import { PersonDisc, Segmented } from "../../team/bits";
import { SettingCard } from "../setting-card";

const DAY = 86_400_000;

/**
 * Logboek (`/settings/log`, PLAN 43): every change to a setting, who made it, what it was and what
 * it became, and the page it was made on. Saving on the new settings pages writes here; the rest of
 * the history is the workspace's own.
 */
export function LogPage() {
	const audit = useSettingsDepth((s) => s.audit);
	const [period, setPeriod] = useState<"7" | "30" | "all">("30");
	const [who, setWho] = useState("");
	const [page, setPage] = useState("");
	const people = useMemo(() => [...new Set(audit.map((a) => a.who))], [audit]);
	const pages = useMemo(() => [...new Set(audit.map((a) => a.page))].sort(), [audit]);
	const rows = audit.filter((a) => (period === "all" || Date.now() - Date.parse(a.at) < Number(period) * DAY) && (!who || a.who === who) && (!page || a.page === page));
	return (
		<SettingCard
			title="Elke wijziging in de instellingen"
			icon={FileText}
			subtitle="Logboeken bewaart Insyte zolang onder Gegevens en privacy staat."
			action={
				<button type="button" disabled={!rows.length} onClick={() => exportCsv("logboek", ["Wanneer", "Wie", "Pagina", "Wat", "Was", "Werd"], rows.map((r) => [r.at, r.who, r.page, r.field, r.before, r.after]))} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary hover:bg-abyss-2 disabled:opacity-45">
					<Download className="size-3.5" strokeWidth={1.75} />
					Exporteren
				</button>
			}
		>
			<div className="flex flex-wrap items-center gap-2">
				<Segmented label="Periode" value={period} onChange={setPeriod} options={[{ id: "7", label: "7 dagen" }, { id: "30", label: "30 dagen" }, { id: "all", label: "Alles" }]} />
				<select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Wie" className="field h-9 rounded-md px-2.5 text-ink text-sm outline-none focus:bg-paper">
					<option value="">Iedereen</option>
					{people.map((p) => (
						<option key={p}>{p}</option>
					))}
				</select>
				<select value={page} onChange={(e) => setPage(e.target.value)} aria-label="Pagina" className="field h-9 rounded-md px-2.5 text-ink text-sm outline-none focus:bg-paper">
					<option value="">Alle pagina's</option>
					{pages.map((p) => (
						<option key={p}>{p}</option>
					))}
				</select>
			</div>
			{rows.length === 0 ? (
				<EmptyState kind="activity" title={audit.length ? "Niets in deze periode." : "Nog niets gewijzigd."} body={audit.length ? "Kies een langere periode of iemand anders." : "Wie een instelling verandert, komt hier te staan, met wat het was en wat het werd."} />
			) : (
				<div className="table-scroll overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
					<div className="grid min-w-[720px] grid-cols-[140px_170px_minmax(0,1fr)_150px] gap-3 bg-mist px-3.5 py-2 font-medium text-ink-3 text-xs">
						<span>Wanneer</span>
						<span>Wie</span>
						<span>Wat</span>
						<span>Pagina</span>
					</div>
					{rows.map((r, i) => (
						<div key={r.id} className={cn("grid min-w-[720px] grid-cols-[140px_170px_minmax(0,1fr)_150px] items-center gap-3 px-3.5 py-2 text-sm", i % 2 ? "bg-mist/40" : "bg-paper")}>
							<span className="text-ink-2 tabular-nums">{formatDateTime(r.at)}</span>
							<span className="flex min-w-0 items-center gap-2">
								<PersonDisc seed={r.who} name={r.who} size={20} />
								<span className="truncate text-ink">{r.who}</span>
							</span>
							<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
								<span className="text-ink">{r.field}</span>
								<span className="rounded bg-signal-red-bg px-1.5 text-ink-2 line-through decoration-ink-3/60">{r.before}</span>
								<ArrowRight aria-hidden className="size-3 text-ink-4" strokeWidth={1.75} />
								<span className="rounded bg-signal-green-bg px-1.5 text-ink">{r.after}</span>
							</span>
							<Link to={r.to} className="truncate text-arc-ink hover:underline">
								{r.page}
							</Link>
						</div>
					))}
				</div>
			)}
		</SettingCard>
	);
}
