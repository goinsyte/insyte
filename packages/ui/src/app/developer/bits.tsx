import { Check, Copy, Plus, X } from "../../icons";
import { Fragment, useState } from "react";
import { PersonDisc } from "../team/bits";
import { fallbackName, IP } from "../lib/developer";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

/*
 * The small parts the keys and webhooks pages share. Ids, prefixes, secrets, paths and payloads are
 * data, but this system has no typewriter face: they are set in the sans with tabular figures, as a
 * soft tinted chip, so a prefix reads as a thing you can copy rather than as a costume.
 */

/** A token — prefix, secret, path, event id — as a soft `ink` chip in the sans. */
export function Token({ children, className, tone = "ink" }: { children: React.ReactNode; className?: string; tone?: "ink" | "arc" | "mesh" }) {
	return (
		<span
			className={cn(
				"inline-flex h-5 max-w-full items-center truncate rounded-sm px-1.5 text-xs tabular-nums leading-none",
				tone === "arc" ? "bg-arc-tint text-arc-ink" : tone === "mesh" ? "bg-mesh-ink/10 text-mesh-ink" : "bg-ink/6 text-ink-2",
				className,
			)}
		>
			{children}
		</span>
	);
}

export function CopyButton({ value, label = "Kopiëren", className, tone = "well", disabled }: { value: string; label?: string; className?: string; tone?: "well" | "mesh" | "ghost"; disabled?: boolean }) {
	const [done, setDone] = useState(false);
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => {
				void navigator.clipboard?.writeText(value).catch(() => {});
				setDone(true);
				window.setTimeout(() => setDone(false), 1600);
			}}
			className={cn(
				"flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium text-sm transition-colors disabled:pointer-events-none disabled:opacity-45",
				tone === "mesh" ? "bg-mesh-ink text-abyss hover:bg-paper" : tone === "ghost" ? "text-ink-2 hover:bg-ink/6 hover:text-ink" : "field text-ink hover:field-hover",
				className,
			)}
		>
			{done ? <Check className="size-3.5" strokeWidth={2.25} /> : <Copy className="size-3.5" strokeWidth={1.75} />}
			{done ? "Gekopieerd" : label}
		</button>
	);
}

/** Who made it: their disc and first name. */
export function MadeBy({ memberId }: { memberId: string }) {
	const member = useWorkspace((s) => s.members.find((m) => m.id === memberId));
	const name = member?.name ?? fallbackName(memberId);
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5">
			<PersonDisc seed={memberId} name={name} size={18} />
			<span className="truncate">{name.split(" ")[0]}</span>
		</span>
	);
}

const METHOD_TONE: Record<string, string> = {
	GET: "bg-ink/6 text-ink-2",
	POST: "bg-signal-green-bg text-signal-green",
	PATCH: "bg-signal-amber-bg text-signal-amber",
	DELETE: "bg-signal-red-bg text-signal-red",
};

export function Method({ method }: { method: string }) {
	return <span className={cn("inline-flex h-5 w-[52px] shrink-0 items-center justify-center rounded-sm font-medium text-2xs", METHOD_TONE[method])}>{method}</span>;
}

/** An HTTP status as a word with its colour: 2xx green, 4xx amber, 5xx and timeouts red. */
export function StatusCode({ status }: { status: number | null }) {
	const tone = status === null || status >= 500 ? "bg-signal-red-bg text-signal-red" : status >= 400 ? "bg-signal-amber-bg text-signal-amber" : "bg-signal-green-bg text-signal-green";
	return <span className={cn("inline-flex h-5 min-w-10 shrink-0 items-center justify-center rounded-full px-2 font-medium text-xs tabular-nums", tone)}>{status ?? "Time-out"}</span>;
}

/**
 * JSON, readable: one key per line, indented, in the sans. Keys in `ink-2`, strings in `arc-ink`,
 * numbers and booleans in `ink`, punctuation in `ink-3`. Not a code block — a document you read.
 */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
	return <pre className={cn("overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-mist px-3.5 py-3 font-sans text-sm leading-[1.7] tabular-nums", className)}>{render(value, 0)}</pre>;
}

function render(v: unknown, depth: number): React.ReactNode {
	const pad = "  ".repeat(depth + 1);
	const end = "  ".repeat(depth);
	if (v === null) return <span className="text-ink-3">null</span>;
	if (typeof v === "string") return <span className="text-arc-ink">"{v}"</span>;
	if (typeof v === "number" || typeof v === "boolean") return <span className="font-medium text-ink">{String(v)}</span>;
	if (Array.isArray(v)) {
		if (v.length === 0) return <span className="text-ink-3">[]</span>;
		return (
			<>
				<span className="text-ink-3">[</span>
				{"\n"}
				{v.map((x, i) => (
					<Fragment key={i}>
						{pad}
						{render(x, depth + 1)}
						{i < v.length - 1 ? <span className="text-ink-3">,</span> : null}
						{"\n"}
					</Fragment>
				))}
				{end}
				<span className="text-ink-3">]</span>
			</>
		);
	}
	if (typeof v === "object") {
		const entries = Object.entries(v as Record<string, unknown>);
		return (
			<>
				<span className="text-ink-3">{"{"}</span>
				{"\n"}
				{entries.map(([k, x], i) => (
					<Fragment key={k}>
						{pad}
						<span className="text-ink-2">{k}</span>
						<span className="text-ink-3">: </span>
						{render(x, depth + 1)}
						{i < entries.length - 1 ? <span className="text-ink-3">,</span> : null}
						{"\n"}
					</Fragment>
				))}
				{end}
				<span className="text-ink-3">{"}"}</span>
			</>
		);
	}
	return String(v);
}

/** A raw body: JSON when it parses, as it came otherwise. */
export function BodyView({ body }: { body: string }) {
	if (!body) return <p className="rounded-lg bg-mist px-3.5 py-3 text-ink-3 text-sm">Geen body.</p>;
	try {
		return <JsonView value={JSON.parse(body)} />;
	} catch {
		return <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-mist px-3.5 py-3 font-sans text-ink-2 text-sm leading-[1.7]">{body}</pre>;
	}
}

/** Addresses as chips in one well; Enter, comma or space makes one, and a wrong one says so. */
export function IpInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
	const [draft, setDraft] = useState("");
	const [error, setError] = useState("");
	function commit(raw: string) {
		const parts = raw.split(/[\s,;]+/).filter(Boolean);
		const bad = parts.filter((p) => !IP.test(p));
		const good = parts.filter((p) => IP.test(p) && !value.includes(p));
		if (good.length) onChange([...value, ...good]);
		setError(bad.length ? `${bad[0]} is geen IP-adres of bereik, zoals 185.43.12.7 of 185.43.12.0/24.` : "");
		setDraft(bad.join(" "));
	}
	return (
		<div className="flex flex-col gap-1.5">
			<div className={cn("field flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5", error && "bg-signal-red-bg")}>
				{value.map((ip) => (
					<span key={ip} className="inline-flex h-7 items-center gap-1 rounded-md bg-paper pr-1 pl-2 text-sm text-ink tabular-nums shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
						{ip}
						<button type="button" aria-label={`${ip} verwijderen`} onClick={() => onChange(value.filter((x) => x !== ip))} className="flex size-5 items-center justify-center rounded text-ink-3 hover:bg-ink/6 hover:text-ink">
							<X className="size-3" strokeWidth={2} />
						</button>
					</span>
				))}
				<input
					value={draft}
					onChange={(e) => {
						const v = e.target.value;
						if (/[\s,;]$/.test(v)) commit(v);
						else setDraft(v);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							commit(draft);
						}
						if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
					}}
					onBlur={() => draft && commit(draft)}
					placeholder={value.length ? "" : "Overal vandaan, of bijvoorbeeld 185.43.12.0/24"}
					aria-label="IP-adressen"
					className="h-7 min-w-[160px] flex-1 bg-transparent px-1 text-base text-ink tabular-nums outline-none placeholder:text-ink-3"
				/>
			</div>
			{error ? <span className="text-signal-red text-xs">{error}</span> : null}
		</div>
	);
}

/** Key/value rows for headers sent with every delivery. */
export function HeadersEditor({ value, onChange }: { value: Array<{ key: string; value: string }>; onChange: (v: Array<{ key: string; value: string }>) => void }) {
	const set = (i: number, patch: Partial<{ key: string; value: string }>) => onChange(value.map((h, j) => (j === i ? { ...h, ...patch } : h)));
	return (
		<div className="flex flex-col gap-1.5">
			{value.map((h, i) => (
				<div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-1.5">
					<input value={h.key} onChange={(e) => set(i, { key: e.target.value })} placeholder="X-Header-Naam" aria-label="Naam van de header" className="field h-9 rounded-md px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper" />
					<input value={h.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Waarde" aria-label="Waarde van de header" className="field h-9 rounded-md px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper" />
					<button type="button" aria-label="Header verwijderen" onClick={() => onChange(value.filter((_, j) => j !== i))} className="flex size-9 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink">
						<X className="size-3.5" strokeWidth={2} />
					</button>
				</div>
			))}
			<button type="button" onClick={() => onChange([...value, { key: "", value: "" }])} className="flex h-8 items-center gap-1.5 self-start rounded-md px-2 font-medium text-arc-ink text-sm hover:bg-arc-tint">
				<Plus className="size-3.5" strokeWidth={2} />
				Header toevoegen
			</button>
		</div>
	);
}

/** Requests per day as bars, the busiest day labelled, errors as the red cap of a bar. */
export function UsageChart({ days }: { days: ReadonlyArray<{ day: string; count: number; errors: number }> }) {
	const max = Math.max(1, ...days.map((d) => d.count));
	const total = days.reduce((n, d) => n + d.count, 0);
	const errors = days.reduce((n, d) => n + d.errors, 0);
	const fmt = new Intl.NumberFormat("nl-NL");
	const dayFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
	const W = 14 * 24;
	return (
		<figure className="flex flex-col gap-2">
			<figcaption className="flex items-baseline justify-between gap-3 text-sm">
				<span className="text-ink">
					<span className="font-medium tabular-nums">{fmt.format(total)}</span> verzoeken in 14 dagen
				</span>
				<span className="text-ink-3 tabular-nums">{total ? `${fmt.format(errors)} fouten · ${((errors / total) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%` : "Nog niet gebruikt"}</span>
			</figcaption>
			<svg viewBox={`0 0 ${W} 72`} className="h-[72px] w-full" role="img" aria-label={`${fmt.format(total)} verzoeken in de laatste 14 dagen`} preserveAspectRatio="none">
				<line x1="0" x2={W} y1="71.5" y2="71.5" className="stroke-ink-5" strokeWidth="1" />
				{days.map((d, i) => {
					const h = (d.count / max) * 66;
					const e = d.count ? (d.errors / d.count) * h : 0;
					return (
						<g key={d.day}>
							<title>{`${dayFmt.format(new Date(d.day))}: ${fmt.format(d.count)} verzoeken, ${d.errors} fouten`}</title>
							<rect x={i * 24 + 4} y={71 - h} width="16" height={Math.max(h - e, 0)} rx="2" className="fill-ink-4" />
							{e > 0 ? <rect x={i * 24 + 4} y={71 - h} width="16" height={Math.max(e, 1.5)} rx="1" className="fill-signal-red" /> : null}
						</g>
					);
				})}
			</svg>
			<div className="flex justify-between text-ink-3 text-xs tabular-nums">
				<span>{days[0] ? dayFmt.format(new Date(days[0].day)) : ""}</span>
				<span>vandaag</span>
			</div>
		</figure>
	);
}

/** One line on the sheet that says something needs doing: a signal tint and its word. */
export function Notice({ tone, children, action }: { tone: "amber" | "red" | "arc"; children: React.ReactNode; action?: React.ReactNode }) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3.5 py-2.5 text-sm",
				tone === "amber" ? "bg-signal-amber-bg text-ink" : tone === "red" ? "bg-signal-red-bg text-ink" : "bg-arc-tint text-ink",
			)}
		>
			<span className="min-w-0 flex-1 leading-normal">{children}</span>
			{action}
		</div>
	);
}
