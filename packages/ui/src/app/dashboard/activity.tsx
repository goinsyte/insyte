import { type AgentLogEntry, ranUnder } from "../lib/agent-log";
import { useAgentEntries } from "../stores/agent-log-store";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { ChevronDown, X } from "../../icons";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { EmptyPage } from "../common/empty-page";
import { actorName, NoteLead, NoteSentence, useNow } from "../notifications/note-parts";
import { seedActivity } from "../lib/home/activity";
import { addDays, clock, dayKey, dayLabel } from "../lib/home/dates";
import { formatCurrency } from "../lib/format";
import { heard, type Note, type NoteSource, SOURCES } from "../lib/notifications";
import { cn } from "../lib/utils";
import { type LiveOrder, useLive } from "../stores/live-store";
import { useNotifications } from "../stores/notifications-store";

/**
 * Everything that happened in the workspace, newest first and grouped by the hour: the team's own
 * work, what Insyte drafted and drew, what the services and suppliers did, and the orders arriving.
 * Filtered by who did it and by where. New rows arrive at the head while the home is open.
 */

const SEED = seedActivity();

const fromLive = (o: LiveOrder): Note => ({
	id: o.id,
	persona: "admin",
	source: "order",
	event: "order.note",
	actor: { kind: "brand", brand: "shopify", name: "Shopify" },
	title: "nieuwe bestelling",
	record: o.number,
	detail: `${o.customer} · ${o.qty} × ${o.title} · ${formatCurrency(o.total, "USD")}`,
	to: `/products/${o.productId}`,
	at: new Date(o.at).toISOString(),
	read: true,
	state: "inbox",
});

/** An agent log row, as a line in the feed: Insyte's star, the sentence, the setting it ran under. */
const fromAgent = (e: AgentLogEntry): Note => ({
	id: `agent_${e.id}`,
	persona: "admin",
	source: "insyte",
	event: "insyte.action",
	actor: { kind: "insyte" },
	title: e.sentence.charAt(0).toLowerCase() + e.sentence.slice(1),
	detail: `${e.status === "undone" ? `Ongedaan gemaakt door ${e.undoneBy ?? "een collega"}` : e.status === "failed" ? (e.failReason ?? "Mislukt") : ranUnder(e)} · ${e.trigger}`,
	tone: e.status === "failed" ? "red" : undefined,
	to: "/ask/activity",
	search: { row: e.id },
	at: e.at,
	read: true,
	state: "inbox",
});

export function ActivityFeed() {
	const now = useNow(30_000);
	const still = useReducedMotion();
	const notes = useNotifications((s) => s.notes);
	const prefs = useNotifications((s) => s.prefs);
	const live = useLive((s) => s.orders);
	const agent = useAgentEntries();
	const [who, setWho] = useState<string>("all");
	const [source, setSource] = useState<NoteSource | "all">("all");
	const [limit, setLimit] = useState(60);

	const feed = useMemo(() => {
		const own = notes.filter((n) => n.persona === "admin" && heard(n, prefs));
		return [...own, ...SEED, ...live.map(fromLive), ...agent.slice(0, 300).map(fromAgent)].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
	}, [notes, prefs, live, agent]);

	const people = useMemo(() => {
		const by = new Map<string, number>();
		for (const n of feed) {
			const name = actorName(n);
			if (name) by.set(name, (by.get(name) ?? 0) + 1);
		}
		return [...by].sort((a, b) => b[1] - a[1]);
	}, [feed]);
	const sources = useMemo(() => [...new Set(feed.map((n) => n.source))], [feed]);

	const rows = feed.filter((n) => (who === "all" || actorName(n) === who) && (source === "all" || n.source === source));
	const groups = useMemo(() => {
		const out: Array<{ key: string; label: string; rows: Note[] }> = [];
		const today = dayKey(now);
		for (const n of rows.slice(0, limit)) {
			const t = Date.parse(n.at);
			const d = dayKey(t);
			const key = d === today ? `${d}-${new Date(t).getHours()}` : d;
			const label =
				d === today
					? `${String(new Date(t).getHours()).padStart(2, "0")}:00`
					: d === addDays(now, -1)
						? "Gisteren"
						: dayLabel(d, now).replace(/^./, (c) => c.toUpperCase());
			const last = out[out.length - 1];
			if (last?.key === key) last.rows.push(n);
			else out.push({ key, label, rows: [n] });
		}
		return out;
	}, [rows, limit, now]);
	const filtered = who !== "all" || source !== "all";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-1.5">
				<Pick
					label="Wie"
					value={who}
					display={who === "all" ? "Iedereen" : who}
					options={[["all", "Iedereen"], ...people.map(([p, n]) => [p, `${p} · ${n}`] as [string, string])]}
					onChange={setWho}
				/>
				<Pick
					label="Bron"
					value={source}
					display={source === "all" ? "Alle bronnen" : SOURCES[source].label}
					options={[["all", "Alle bronnen"], ...sources.map((s) => [s, SOURCES[s].label] as [string, string])]}
					onChange={(v) => setSource(v as NoteSource | "all")}
				/>
				{filtered ? (
					<button
						type="button"
						onClick={() => {
							setWho("all");
							setSource("all");
						}}
						className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-sm text-ink-2 hover:bg-ink/6 hover:text-ink"
					>
						<X className="size-3.5" strokeWidth={2} />
						Wissen
					</button>
				) : null}
				<span className="ml-auto text-sm text-ink-3 tabular-nums">
					{rows.length} {rows.length === 1 ? "gebeurtenis" : "gebeurtenissen"}
				</span>
			</div>

			{groups.length === 0 ? (
				<div className="rounded-xl bg-paper px-6">
					<EmptyPage
						kind="activity"
						count="0 gebeurtenissen"
						title={filtered ? "Niets met deze filters" : "Nog geen activiteit"}
						body={
							filtered
								? "Kies iemand anders of een andere bron."
								: "Wat je team, Insyte en je koppelingen doen, verschijnt hier."
						}
						starts={
							filtered
								? undefined
								: [
										{ id: "stores", label: "Een winkel koppelen", body: "Bestellingen en klanten uit Shopify.", to: "/settings/stores" },
										{ id: "integrations", label: "Koppelingen", body: "Mailbox, betaalproviders en meer.", to: "/settings/integrations" },
									]
						}
					/>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{groups.map((g) => (
						<section key={g.key} aria-label={g.label} className="flex gap-3">
							<h3 className="w-14 shrink-0 pt-3 text-right font-medium text-sm text-ink-3 tabular-nums sm:w-20">{g.label}</h3>
							<ul className="flex min-w-0 flex-1 flex-col rounded-xl bg-paper px-1.5 py-1.5">
								<AnimatePresence initial={false}>
									{g.rows.map((n, i) => (
										<motion.li
											key={n.id}
											initial={still ? false : { opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
											className="overflow-hidden"
										>
											<Link
												to={n.to}
												search={n.search as never}
												className={cn("flex min-w-0 items-start gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-ink/4", i % 2 === 1 && "bg-mist")}
											>
												<NoteLead note={n} size={28} />
												<span className="flex min-w-0 flex-1 flex-col gap-0.5">
													<NoteSentence note={n} className="text-base text-ink" />
													{n.detail ? <span className="line-clamp-2 text-sm text-ink-3">{n.detail}</span> : null}
												</span>
												<span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-ink-3 tabular-nums">
													{clock(Date.parse(n.at))}
													<span className="hidden sm:inline">{SOURCES[n.source].label}</span>
												</span>
											</Link>
										</motion.li>
									))}
								</AnimatePresence>
							</ul>
						</section>
					))}
					{rows.length > limit ? (
						<button
							type="button"
							onClick={() => setLimit((l) => l + 60)}
							className="ml-[68px] h-9 w-fit cursor-pointer rounded-md px-3 font-medium text-sm text-arc-ink hover:bg-arc-tint sm:ml-[92px]"
						>
							Meer laden · nog {rows.length - limit}
						</button>
					) : null}
				</div>
			)}
		</div>
	);
}

function Pick({
	label,
	value,
	display,
	options,
	onChange,
}: {
	label: string;
	value: string;
	display: string;
	options: ReadonlyArray<[string, string]>;
	onChange: (v: string) => void;
}) {
	const on = value !== "all";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors",
						on ? "bg-arc-tint text-arc-ink" : "bg-paper text-ink-2 hover:text-ink",
					)}
				>
					<span className={on ? "text-arc-ink/80" : "text-ink-3"}>{label}</span>
					<span className="max-w-40 truncate font-medium">{display}</span>
					<ChevronDown className="size-3 opacity-70" strokeWidth={2} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
				<DropdownMenuLabel>{label}</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(String(v))}>
					{options.map(([v, l]) => (
						<DropdownMenuRadioItem key={v} value={v}>
							{l}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
