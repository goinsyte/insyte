import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Clock, Eye, Hash, List, RotateCcw, Sparkles, X } from "../../icons";
import { ReadOnlyNotice } from "../access/route-gate";
import { useMyName } from "../ask/agent-parts";
import { EmptyState } from "../common/empty-state";
import { UnsavedBar } from "../settings/form";
import { StatusPill } from "../settings/setting-card";
import { type Article, type Audience, diffLines, LIMIT, publishedVersion, STATUS_LABEL, statusOf } from "../lib/knowledge";
import { formatDateTime } from "../lib/format";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useGate } from "../stores/access-store";
import { useKnowledge } from "../stores/knowledge-store";
import { AudiencePicker } from "./knowledge-screen";

export type ArticleSearch = { gap?: string | undefined };

type Draft = Pick<Article, "title" | "audience" | "body">;

/**
 * One chapter (`/settings/ai/knowledge/$articleId`): the title, who it is for, and the text in a
 * plain Markdown well with the count against the limit. Opslaan als concept keeps a version the
 * agents do not read; Publiceren makes it the one they do. Versies opens every version with who and
 * when, and what changed; Terugzetten publishes an earlier one again, with Undo.
 */
export function ArticlePage() {
	const { articleId } = useParams({ strict: false }) as { articleId?: string };
	const a = useKnowledge((s) => s.articles.find((x) => x.id === articleId));
	if (!a) return <EmptyState kind="knowledge" title="Dit hoofdstuk bestaat niet (meer)." body="Ga terug naar de kennisbank." />;
	return <Editor a={a} />;
}

function Editor({ a }: { a: Article }) {
	const search = useSearch({ strict: false }) as ArticleSearch;
	const navigate = useNavigate();
	const gap = useKnowledge((s) => (search.gap ? s.gaps.find((g) => g.id === search.gap) : undefined));
	const gate = useGate("settings", 3);
	const me = useMyName();
	const saved: Draft = { title: a.title, audience: a.audience, body: a.body };
	const savedKey = JSON.stringify(saved);
	const [draft, setDraft] = useState<Draft>(() => (gap && gap.state === "open" && !a.body.includes(gap.question) ? { ...saved, body: `${a.body.trimEnd()}\n\n## ${gap.question}\n\n` } : saved));
	const last = useRef(savedKey);
	useEffect(() => {
		if (last.current !== savedKey) {
			last.current = savedKey;
			setDraft(JSON.parse(savedKey) as Draft);
		}
	}, [savedKey]);
	const dirty = JSON.stringify(draft) !== savedKey;
	const [preview, setPreview] = useState(false);
	const [versions, setVersions] = useState(false);
	const st = statusOf({ ...a, ...draft });
	const over = draft.body.length > LIMIT;
	const area = useRef<HTMLTextAreaElement>(null);

	const keep = (publish: boolean) => {
		const undo = useKnowledge.getState().save(a.id, draft, me, publish);
		undoable(publish ? `“${draft.title}” gepubliceerd` : `Concept van “${draft.title}” opgeslagen`, undo, publish ? "De klantagent en Vraag Insyte gebruiken vanaf nu deze versie." : "De agents lezen nog de gepubliceerde versie.");
		if (publish && search.gap) void navigate({ to: "/settings/ai/knowledge/$articleId", params: { articleId: a.id }, search: {} as never, replace: true });
	};

	/** Puts a heading or list marker at the start of the line the caret is on. */
	const mark = (prefix: string) => {
		const el = area.current;
		if (!el) return;
		const start = draft.body.lastIndexOf("\n", el.selectionStart - 1) + 1;
		const body = draft.body.slice(0, start) + prefix + draft.body.slice(start);
		setDraft((d) => ({ ...d, body }));
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(el.selectionStart + prefix.length, el.selectionStart + prefix.length);
		});
	};

	/** Insyte's first text for a gap: a draft in the well, never published by itself (design §6, question 6). */
	const suggest = () => {
		if (!gap) return;
		const text = SUGGESTIONS[gap.id] ?? "Schrijf hier het antwoord. Houd het kort: twee of drie zinnen, met de termijn of het bedrag erin.";
		setDraft((d) => ({ ...d, body: d.body.endsWith("\n\n") ? `${d.body}${text}\n` : `${d.body}\n${text}\n` }));
	};

	return (
		<>
			<Link to="/settings/ai/knowledge" className="-mt-4 -ml-1.5 flex h-7 w-fit items-center gap-1 rounded-md px-1.5 text-ink-3 text-sm hover:bg-ink/6 hover:text-ink">
				<ChevronLeft className="size-3.5" strokeWidth={1.75} />
				Kennisbank
			</Link>
			{gate.ok ? null : <ReadOnlyNotice reason={gate.reason} />}
			{gap && gap.state === "open" ? (
				<p className="flex flex-wrap items-center gap-2 rounded-lg bg-arc-tint px-3.5 py-2.5 text-ink text-sm">
					<span className="min-w-0 flex-1">
						<span className="font-medium">Je beantwoordt: “{gap.question}”</span> Publiceer het hoofdstuk, dan gebruikt de klantagent het antwoord en sluit de vraag.
					</span>
					{gate.ok ? (
						<button type="button" onClick={suggest} className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-2.5 font-medium text-arc-ink text-sm hover:bg-paper/80">
							<Sparkles className="size-3.5" strokeWidth={1.75} />
							Laat Insyte een eerste tekst schrijven
						</button>
					) : null}
				</p>
			) : null}

			<div className="flex flex-col gap-3">
				<input
					value={draft.title}
					disabled={!gate.ok}
					onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
					aria-label="Titel"
					className="-mx-2 rounded-md bg-transparent px-2 py-1 font-medium text-ink text-xl outline-none hover:bg-ink/4 focus:bg-paper"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<AudiencePicker value={draft.audience} onChange={(audience: Audience) => setDraft((d) => ({ ...d, audience }))} disabled={!gate.ok} />
					<StatusPill tone={st === "published" ? "neutral" : st === "draft" ? "info" : "warning"} label={STATUS_LABEL[st]} />
					<span className="text-ink-3 text-sm">
						Gepubliceerd: {publishedVersion(a) ? `versie ${publishedVersion(a)?.n}` : "nog niet"} · {a.uses7d}× gebruikt deze week
					</span>
					<span className="flex-1" />
					<button type="button" onClick={() => setVersions(true)} className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover">
						<Clock className="size-3.5" strokeWidth={1.75} />
						Versies · {a.versions.length}
					</button>
				</div>
			</div>

			<section className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
				<div className="flex items-center gap-1 bg-mist px-2 py-1.5">
					<Tool onClick={() => mark("## ")} disabled={!gate.ok || preview} label="Kop">
						<Hash className="size-3.5" strokeWidth={1.75} />
						Kop
					</Tool>
					<Tool onClick={() => mark("- ")} disabled={!gate.ok || preview} label="Lijst">
						<List className="size-3.5" strokeWidth={1.75} />
						Lijst
					</Tool>
					<span className="flex-1" />
					<Tool onClick={() => setPreview((p) => !p)} label="Voorbeeld" pressed={preview}>
						<Eye className="size-3.5" strokeWidth={1.75} />
						Voorbeeld
					</Tool>
				</div>
				{preview ? (
					<div className="min-h-[360px] px-5 py-4">
						<Markdown text={draft.body} />
					</div>
				) : (
					<textarea
						ref={area}
						value={draft.body}
						disabled={!gate.ok}
						onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
						aria-label="Tekst"
						spellCheck
						className="min-h-[360px] w-full resize-y bg-paper px-5 py-4 text-base text-ink leading-[1.7] outline-none placeholder:text-ink-3"
						placeholder="## Kop&#10;&#10;Wat de klant moet weten, in korte zinnen."
					/>
				)}
				<div className="flex items-center gap-3 bg-mist px-4 py-2 text-sm">
					<span className="relative h-1 w-32 overflow-hidden rounded-full bg-ink/8">
						<span className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-signal-red" : draft.body.length / LIMIT > 0.9 ? "bg-signal-amber" : "bg-ink-4")} style={{ width: `${Math.min(100, (draft.body.length / LIMIT) * 100)}%` }} />
					</span>
					<span className={cn("tabular-nums", over ? "font-medium text-signal-red" : "text-ink-3")}>
						{draft.body.length.toLocaleString("nl-NL")} van {LIMIT.toLocaleString("nl-NL")} tekens
					</span>
					<span className="flex-1" />
					{gate.ok ? (
						<>
							<button type="button" disabled={over || (!dirty && st !== "changed" && st !== "draft")} onClick={() => keep(false)} className="flex h-8 items-center rounded-md px-3 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink disabled:opacity-45">
								Opslaan als concept
							</button>
							<button type="button" disabled={over || (!dirty && st === "published")} onClick={() => keep(true)} className="flex h-8 items-center rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2 disabled:opacity-45">
								Publiceren
							</button>
						</>
					) : null}
				</div>
			</section>

			<UnsavedBar visible={dirty && gate.ok} onDiscard={() => setDraft(saved)} onSave={() => keep(false)} />
			<VersionDrawer open={versions} a={a} canRevert={gate.ok} onClose={() => setVersions(false)} />
		</>
	);
}

function Tool({ children, onClick, disabled, label, pressed }: { children: ReactNode; onClick: () => void; disabled?: boolean; label: string; pressed?: boolean }) {
	return (
		<button type="button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-sm transition-colors disabled:opacity-40", pressed ? "bg-paper font-medium text-ink" : "text-ink-2 enabled:hover:bg-ink/6 enabled:hover:text-ink")}>
			{children}
		</button>
	);
}

/** The well's Markdown, read: `##` headings, `-` and `1.` lists, paragraphs. Nothing else is needed here. */
export function Markdown({ text }: { text: string }) {
	const blocks = text.split(/\n{2,}/);
	return (
		<div className="flex max-w-[68ch] flex-col gap-3 text-base text-ink leading-[1.65]">
			{blocks.map((b, i) => {
				const lines = b.split("\n").filter(Boolean);
				if (lines.length === 0) return null;
				if (lines[0]!.startsWith("## ")) return <h3 key={i} className="pt-1 font-medium text-ink text-md">{lines[0]!.slice(3)}</h3>;
				if (lines.every((l) => /^- /.test(l))) return <ul key={i} className="flex list-disc flex-col gap-1 pl-5">{lines.map((l) => <li key={l}>{l.slice(2)}</li>)}</ul>;
				if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i} className="flex list-decimal flex-col gap-1 pl-5">{lines.map((l) => <li key={l}>{l.replace(/^\d+\. /, "")}</li>)}</ol>;
				return <p key={i}>{lines.join(" ")}</p>;
			})}
		</div>
	);
}

/** Every version, newest first, with who and when; one opens with what changed against the one before. */
function VersionDrawer({ open, a, canRevert, onClose }: { open: boolean; a: Article; canRevert: boolean; onClose: () => void }) {
	const me = useMyName();
	const list = useMemo(() => [...a.versions].reverse(), [a.versions]);
	const [pick, setPick] = useState<number | null>(null);
	const chosen = a.versions.find((v) => v.n === (pick ?? list[0]?.n));
	const before = chosen ? a.versions.find((v) => v.n === chosen.n - 1) : undefined;
	const diff = useMemo(() => (chosen ? diffLines(before?.body ?? "", chosen.body) : []), [chosen, before]);
	const current = publishedVersion(a)?.n;
	const ref = useRef<HTMLDivElement>(null);
	return (
		<Sheet open={open} onOpenChange={(o) => !o && onClose()}>
			<SheetContent side="right" className="w-[560px] max-w-[100vw] gap-0 overflow-y-auto bg-paper p-0 sm:max-w-[560px]" showCloseButton={false} initialFocus={ref}>
				<div ref={ref} tabIndex={-1} className="flex min-h-full flex-col outline-none">
					<header className="flex items-start gap-3 bg-mist px-5 py-4">
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<SheetTitle className="font-medium text-ink text-lg">Versies van “{a.title}”</SheetTitle>
							<SheetDescription className="text-ink-2 text-sm">De agents lezen {current ? `versie ${current}` : "nog geen versie"}.</SheetDescription>
						</div>
						<button type="button" aria-label="Sluiten" onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink">
							<X className="size-4" strokeWidth={1.75} />
						</button>
					</header>
					<ul className="flex flex-col px-3 py-3">
						{list.map((v) => (
							<li key={v.n}>
								<button type="button" onClick={() => setPick(v.n)} className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors", chosen?.n === v.n ? "bg-arc-tint" : "hover:bg-ink/4")}>
									<span className={cn("w-16 shrink-0 font-medium text-sm tabular-nums", chosen?.n === v.n ? "text-arc-ink" : "text-ink")}>Versie {v.n}</span>
									<span className="min-w-0 flex-1 truncate text-ink-2 text-sm">
										{v.by} · {formatDateTime(v.at)}
									</span>
									{v.n === current ? <StatusPill tone="neutral" label="Gepubliceerd" /> : v.published ? null : <StatusPill tone="info" label="Concept" />}
								</button>
							</li>
						))}
					</ul>
					{chosen ? (
						<section className="flex flex-col gap-2 px-5 pb-6">
							<div className="flex items-center justify-between">
								<h3 className="font-medium text-ink-3 text-xs">{before ? `Anders dan versie ${before.n}` : "De eerste versie"}</h3>
								{canRevert && chosen.n !== current ? (
									<button
										type="button"
										onClick={() => {
											const undo = useKnowledge.getState().revert(a.id, chosen.n, me);
											undoable(`Versie ${chosen.n} staat weer gepubliceerd`, undo, "Als een nieuwe versie, zodat de oude blijven bestaan.");
											onClose();
										}}
										className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover"
									>
										<RotateCcw className="size-3.5" strokeWidth={1.75} />
										Terugzetten
									</button>
								) : null}
							</div>
							<ol className="flex flex-col overflow-hidden rounded-lg text-sm leading-[1.6]">
								{diff.map((d, i) => (
									<li key={i} className={cn("whitespace-pre-wrap px-3 py-0.5", d.kind === "added" ? "bg-arc-tint text-ink" : d.kind === "removed" ? "bg-signal-red-bg text-ink-2 line-through decoration-ink-4" : "bg-mist text-ink-2")}>
										<span className="mr-2 inline-block w-3 text-ink-3" aria-hidden>
											{d.kind === "added" ? "+" : d.kind === "removed" ? "−" : ""}
										</span>
										{d.text || " "}
									</li>
								))}
							</ol>
						</section>
					) : null}
				</div>
			</SheetContent>
		</Sheet>
	);
}

/* Insyte's first texts for the seeded gaps, drafted from the rest of the knowledge base and the settings. */
const SUGGESTIONS: Record<string, string> = {
	gap_1: "Sale-artikelen kun je niet retourneren voor je geld terug. Ruilen voor een andere maat kan wel, binnen 30 dagen na bezorging, via het retourportaal.",
	gap_2: "We versturen nog niet naar Zwitserland. Bestellen kan wel met een adres in Duitsland of Oostenrijk.",
	gap_3: "Een cadeaubon en een kortingscode kun je samen gebruiken: vul eerst de code in en betaal de rest met je cadeaubon.",
	gap_4: "Binnen een uur na het betalen kunnen we je bestelling nog aanpassen. Stuur ons dan meteen een bericht met je bestelnummer.",
	gap_5: "In Duitsland kun je bij het afrekenen een DHL-Packstation of -punt kiezen. In Nederland en België bezorgt PostNL ook bij een afhaalpunt.",
};
