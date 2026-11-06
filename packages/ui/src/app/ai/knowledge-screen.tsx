import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, MessageCircle, Plus, Sparkles, X } from "../../icons";
import { ReadOnlyNotice } from "../access/route-gate";
import { EmptyPage } from "../common/empty-page";
import { PageGuide } from "../common/page-guide";
import { FormDialog } from "../common/form-dialog";
import { BandedList, SettingCard, StatusPill } from "../settings/setting-card";
import { useMyName } from "../ask/agent-parts";
import { type Article, AUDIENCE_LABEL, type Audience, type Gap, LIMIT, STATUS_LABEL, statusOf, SUGGESTED } from "../lib/knowledge";
import { formatRelative } from "../lib/format";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useGate } from "../stores/access-store";
import { useKnowledge } from "../stores/knowledge-store";

/**
 * Instellingen → Insyte AI → Kennisbank (`/settings/ai/knowledge`, PLAN 28): the chapters the agents
 * answer from, with who they are for, whether what the agents read is the latest text, how long they
 * are against the 40.000-teken limit, and how often they were used this week. Above them the
 * questions the agent could not answer, each one a chapter waiting to be written.
 */
const GUIDE = [
	{ title: "Vragen zonder antwoord", body: "Wat de klantagent niet kon beantwoorden, komt hier. Voeg het antwoord toe aan een hoofdstuk en de vraag sluit.", art: "knowledge" },
	{ title: "Alleen gepubliceerd telt", body: "De agents antwoorden uit gepubliceerde hoofdstukken en zeggen uit welk. Concepten zien ze niet.", art: "chat" },
	{ title: "Insyte schrijft mee", body: "In een hoofdstuk stelt Insyte op verzoek een eerste tekst op. Publiceren doe jij.", art: "knowledge" },
] as const;

export function KnowledgePage() {
	const articles = useKnowledge((s) => s.articles);
	const gaps = useKnowledge((s) => s.gaps).filter((g) => g.state === "open");
	const navigate = useNavigate();
	const me = useMyName();
	const gate = useGate("settings", 3);
	const [adding, setAdding] = useState(false);
	const [gapFor, setGapFor] = useState<Gap | null>(null);

	const start = (title: string, audience: Audience, body: string) => {
		const a = useKnowledge.getState().create(title, audience, body, me);
		undoable(`Concept “${title}” gemaakt`, () => useKnowledge.getState().remove(a.id)());
		void navigate({ to: "/settings/ai/knowledge/$articleId", params: { articleId: a.id } });
	};

	if (articles.length === 0) {
		return (
			<>
				{gate.ok ? null : <ReadOnlyNotice reason={gate.reason} />}
				<EmptyPage
					kind="knowledge"
					count="0 hoofdstukken"
					title="Nog geen kennisbank"
					body="Schrijf op wat je klanten vaak vragen."
					action={gate.ok ? { label: "Hoofdstuk schrijven", onClick: () => setAdding(true) } : undefined}
					starts={SUGGESTED.map((s) => ({ id: s.title, label: s.title, body: `Concept om aan te vullen · ${AUDIENCE_LABEL[s.audience]}`, onClick: () => (gate.ok ? start(s.title, s.audience, s.body) : undefined) }))}
					startsTitle="Begin met een van deze"
					className="pt-2 sm:pt-4"
				/>
				<NewArticleDialog open={adding} onClose={() => setAdding(false)} onCreate={(t, a) => start(t, a, "")} />
			</>
		);
	}

	return (
		<>
			{gate.ok ? null : <ReadOnlyNotice reason={gate.reason} />}
			{gaps.length ? (
				<SettingCard title={`Nog niet beantwoord · ${gaps.length}`} icon={MessageCircle}>
					<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
						{gaps.slice(0, 8).map((g) => (
							<li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="font-medium text-base text-ink">“{g.question}”</span>
									<span className="text-ink-3 text-sm">
										{g.customer} · {g.channel === "webchat" ? "Websitechat" : g.channel === "whatsapp" ? "WhatsApp" : "E-mail"} · {formatRelative(g.at)}
										{g.threadId ? (
											<>
												{" · "}
												<Link to="/inbox" search={{ thread: g.threadId } as never} className="text-arc-ink hover:underline">
													gesprek
												</Link>
											</>
										) : null}
									</span>
								</span>
								<button type="button" disabled={!gate.ok} onClick={() => setGapFor(g)} className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover disabled:opacity-45">
									<Plus className="size-3.5" strokeWidth={2} />
									Toevoegen aan…
								</button>
								<button
									type="button"
									aria-label={`“${g.question}” negeren`}
									disabled={!gate.ok}
									onClick={() => undoable("Vraag genegeerd", useKnowledge.getState().setGap(g.id, { state: "dismissed" }))}
									className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink disabled:opacity-45"
								>
									<X className="size-4" strokeWidth={1.75} />
								</button>
							</li>
						))}
					</ul>
				</SettingCard>
			) : null}

			<SettingCard
				title="Hoofdstukken"
				icon={BookOpen}
				action={
					gate.ok ? (
						<button type="button" onClick={() => setAdding(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary hover:bg-abyss-2">
							<Plus className="size-3.5" strokeWidth={2} />
							Hoofdstuk schrijven
						</button>
					) : null
				}
			>
				<BandedList>
					{articles.map((a) => (
						<ArticleRow key={a.id} a={a} />
					))}
				</BandedList>
			</SettingCard>

			<NewArticleDialog open={adding} onClose={() => setAdding(false)} onCreate={(t, au) => start(t, au, "")} />
			<GapDialog gap={gapFor} articles={articles} onClose={() => setGapFor(null)} />
			<PageGuide id="settings.ai.knowledge" title="Kennisbank" steps={GUIDE} />
		</>
	);
}

function ArticleRow({ a }: { a: Article }) {
	const st = statusOf(a);
	const share = Math.min(1, a.body.length / LIMIT);
	return (
		<li>
			<Link to="/settings/ai/knowledge/$articleId" params={{ articleId: a.id }} className="group grid grid-cols-1 items-center gap-x-4 gap-y-1.5 px-3.5 py-3 transition-colors hover:bg-ink/3 sm:grid-cols-[minmax(0,1fr)_auto_160px_100px]">
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium text-base text-ink group-hover:text-arc-ink">{a.title}</span>
					<span className="truncate text-ink-3 text-sm">
						{AUDIENCE_LABEL[a.audience]} · {a.editedBy} · {formatRelative(a.editedAt)}
					</span>
				</span>
				<StatusPill tone={st === "published" ? "neutral" : st === "draft" ? "info" : "warning"} label={STATUS_LABEL[st]} />
				<span className="flex items-center gap-2" title={`${a.body.length.toLocaleString("nl-NL")} van ${LIMIT.toLocaleString("nl-NL")} tekens`}>
					<span className="relative h-1 flex-1 overflow-hidden rounded-full bg-ink/8">
						<span className={cn("absolute inset-y-0 left-0 rounded-full", share > 0.9 ? "bg-signal-amber" : "bg-ink-4")} style={{ width: `${Math.max(2, share * 100)}%` }} />
					</span>
					<span className={cn("w-20 text-right text-xs tabular-nums", share > 0.9 ? "text-signal-amber" : "text-ink-3")}>{a.body.length.toLocaleString("nl-NL")} tekens</span>
				</span>
				<span className="text-ink-3 text-sm tabular-nums sm:text-right">{a.uses7d ? `${a.uses7d}× gebruikt` : "Niet gebruikt"}</span>
			</Link>
		</li>
	);
}

function NewArticleDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (title: string, audience: Audience) => void }) {
	const [title, setTitle] = useState("");
	const [audience, setAudience] = useState<Audience>("both");
	return (
		<FormDialog
			open={open}
			onOpenChange={(o) => !o && onClose()}
			title="Hoofdstuk schrijven"
			description="Je begint met een concept. De agents gebruiken het pas als je het publiceert."
			primaryLabel="Concept maken"
			disabled={!title.trim()}
			onSubmit={() => {
				onCreate(title.trim(), audience);
				setTitle("");
				onClose();
			}}
		>
			<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijvoorbeeld: Verzending buiten de EU" aria-label="Titel" className="field h-11 rounded-lg px-3.5 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper" />
			<AudiencePicker value={audience} onChange={setAudience} />
		</FormDialog>
	);
}

export function AudiencePicker({ value, onChange, disabled }: { value: Audience; onChange: (a: Audience) => void; disabled?: boolean }) {
	return (
		<span role="radiogroup" aria-label="Voor wie" className="inline-flex h-8 items-center gap-0.5 self-start rounded-md bg-ink/5 p-0.5">
			{(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
				<button key={a} type="button" role="radio" aria-checked={a === value} disabled={disabled} onClick={() => onChange(a)} className={cn("h-7 rounded-[5px] px-2.5 font-medium text-sm transition-colors", a === value ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-2 enabled:hover:text-ink")}>
					{AUDIENCE_LABEL[a]}
				</button>
			))}
		</span>
	);
}

/** "Toevoegen aan…": pick the chapter the answer belongs in; the editor opens with the question as a new section. */
function GapDialog({ gap, articles, onClose }: { gap: Gap | null; articles: Article[]; onClose: () => void }) {
	const navigate = useNavigate();
	const [pick, setPick] = useState<string | null>(null);
	return (
		<FormDialog
			open={gap !== null}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					setPick(null);
				}
			}}
			title="In welk hoofdstuk hoort het antwoord?"
			description={gap ? `“${gap.question}”` : undefined}
			primaryLabel="Hoofdstuk openen"
			disabled={!pick}
			onSubmit={() => {
				if (!gap || !pick) return;
				useKnowledge.getState().setGap(gap.id, { articleId: pick });
				void navigate({ to: "/settings/ai/knowledge/$articleId", params: { articleId: pick }, search: { gap: gap.id } as never });
				onClose();
				setPick(null);
			}}
		>
			<ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" role="radiogroup" aria-label="Hoofdstuk">
				{articles.map((a) => (
					<li key={a.id}>
						<button type="button" role="radio" aria-checked={pick === a.id} onClick={() => setPick(a.id)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors", pick === a.id ? "bg-arc-tint font-medium text-arc-ink" : "bg-mist text-ink hover:bg-ink/6")}>
							{a.title}
							<span className="font-normal text-ink-3 text-xs">{AUDIENCE_LABEL[a.audience]}</span>
						</button>
					</li>
				))}
			</ul>
			<p className="flex items-center gap-1.5 text-ink-3 text-xs">
				<Sparkles className="size-3.5" strokeWidth={1.75} />
				In het hoofdstuk kan Insyte een eerste tekst opstellen; publiceren doe jij.
			</p>
		</FormDialog>
	);
}
