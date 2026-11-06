import { Sheet, SheetContent, SheetTitle } from "../../components/sheet";
import { Switch } from "../../components/switch";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Clock, Lock, MessageCircle, Plus, Send, Shield, Sparkles, Users, X } from "../../icons";
import { ReadOnlyNotice } from "../access/route-gate";
import { InsyteMark } from "../ask/parts";
import { EmptyPage } from "../common/empty-page";
import { PageGuide } from "../common/page-guide";
import { Notice } from "../developer/bits";
import { WidgetPreview } from "../inbox/channel-parts";
import { FieldRow, UnsavedBar } from "../settings/form";
import { SettingCard } from "../settings/setting-card";
import { type ChannelMode, type CustomerAgentSettings, DAYS, isOpen, MODE_LABEL, nextOpenLabel } from "../lib/customer-agent";
import { type Article, publishedVersion } from "../lib/knowledge";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useGate } from "../stores/access-store";
import { useAutonomy, workspaceSpent } from "../stores/autonomy-store";
import { AGENT_TODAY, useCustomerAgent } from "../stores/customer-agent-store";
import { useKnowledge } from "../stores/knowledge-store";

/**
 * Instellingen → Insyte AI → Klantagent (`/settings/ai/customer-agent`, PLAN 28, ADR-0027): the agent
 * that answers shoppers. Per channel whether it answers on its own (the website chat, in phase 1),
 * only drafts, or stays out; its opening hours and what it does outside them; when it hands over; its
 * tone and its words at a handover; what it never does. A test chat beside it answers from the
 * published knowledge base, and says so.
 */
const GUIDE = [
	{ title: "Per kanaal", body: "Zelf antwoorden, alleen een concept voor je team, of uit. Op WhatsApp en Instagram zet Insyte voorlopig alleen concepten klaar.", art: "chat" },
	{ title: "Binnen je openingstijden", body: "Dan is er een collega om aan over te dragen. Daarbuiten neemt Insyte de vraag aan of antwoordt uit de kennisbank.", art: "hours" },
	{ title: "Overdragen", body: "Insyte zegt dat een collega het overneemt, wijst het gesprek toe met een samenvatting en zwijgt tot je het teruggeeft.", art: "handover" },
	{ title: "Geld blijft bij je team", body: "Terugbetalen, annuleren of korting beloven doet Insyte nooit. Dat komt als voorstel.", art: "lock" },
	{ title: "Probeer het", body: "De testchat antwoordt uit je gepubliceerde kennisbank en zegt uit welk hoofdstuk. Er wordt niets verstuurd.", art: "chat" },
] as const;

export function CustomerAgentPage() {
	const navigate = useNavigate();
	const saved = useCustomerAgent((s) => s.settings);
	const spent = useAutonomy(workspaceSpent);
	const settingsGate = useGate("settings", 3);
	const aiGate = useGate("ai.autonomy");
	const readOnly = !settingsGate.ok || !aiGate.ok;
	const savedKey = JSON.stringify(saved);
	const [draft, setDraft] = useState<CustomerAgentSettings>(saved);
	const last = useRef(savedKey);
	useEffect(() => {
		if (last.current !== savedKey) {
			last.current = savedKey;
			setDraft(JSON.parse(savedKey) as CustomerAgentSettings);
		}
	}, [savedKey]);
	const dirty = JSON.stringify(draft) !== savedKey;
	const set = <K extends keyof CustomerAgentSettings>(k: K, v: CustomerAgentSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
	const now = new Date();
	const open = isOpen(draft.hours, now);
	const [testing, setTesting] = useState(false);

	const save = (next = draft, said = "Klantagent opgeslagen") => {
		const undo = useCustomerAgent.getState().save(next);
		undoable(said, undo, next.on ? "Nieuwe gesprekken volgen deze regels." : "Nieuwe gesprekken gaan naar de inbox.");
	};

	if (!saved.on) {
		return (
			<>
				{readOnly ? <ReadOnlyNotice reason={!settingsGate.ok ? settingsGate.reason : aiGate.reason} /> : null}
				<EmptyPage
					kind="chats"
					count="Uit"
					title="De klantagent staat uit"
					body="Zet hem aan en Insyte beantwoordt vragen op je websitechat."
					action={readOnly ? undefined : { label: "Aanzetten voor de websitechat", onClick: () => save({ ...draft, on: true, channels: { ...draft.channels, webchat: "auto" } }, "Klantagent staat aan") }}
					secondary={{ label: "Kennisbank vullen", onClick: () => void navigate({ to: "/settings/ai/knowledge" }) }}
					starts={[
						{ id: "never", label: "Wat Insyte nooit doet", body: "Terugbetalen, annuleren of geld beloven.", to: "/settings/ai/autonomy", search: { actie: "RefundOrder" } },
						{ id: "hours", label: "Binnen je openingstijden", body: "Daarbuiten neemt het de vraag aan.", to: "/settings/ai/customer-agent" },
						{ id: "kb", label: "Uit je eigen woorden", body: "Alleen uit wat je in de kennisbank publiceert.", to: "/settings/ai/knowledge" },
					]}
					startsTitle="Zo werkt het"
					className="pt-2 sm:pt-4"
				/>
			</>
		);
	}

	return (
		<>
			{readOnly ? <ReadOnlyNotice reason={!settingsGate.ok ? settingsGate.reason : aiGate.reason} /> : null}
			{spent ? (
				<Notice tone="amber" action={<Link to="/settings/ai/limits" className="font-medium text-sm hover:underline">Limieten openen</Link>}>
					<span className="font-medium">Limiet bereikt.</span> Alle nieuwe gesprekken gaan naar het team tot de maand omslaat of je de limiet verhoogt.
				</Notice>
			) : !open ? (
				<Notice tone="arc">
					<span className="font-medium">Buiten openingstijden.</span>{" "}
					{draft.outside === "take" ? `Insyte neemt nieuwe vragen aan en zegt dat een collega ${nextOpenLabel(draft.hours, now)} antwoordt.` : "Insyte antwoordt uit de kennisbank; wat het niet weet, gaat naar de inbox."}
				</Notice>
			) : null}

			<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-ink/5 sm:grid-cols-5">
				{(
					[
						["Gesprekken vandaag", AGENT_TODAY.conversations],
						["Zelf afgehandeld", AGENT_TODAY.handled],
						["Overgedragen", AGENT_TODAY.handedOver],
						["Wachten", AGENT_TODAY.waiting],
						["Eerste reactie", `${AGENT_TODAY.avgSeconds} s`],
					] as const
				).map(([k, v]) => (
					<div key={k} className="flex flex-col gap-0.5 bg-paper px-4 py-3">
						<dt className="text-ink-3 text-xs">{k}</dt>
						<dd className="font-medium text-ink text-lg tabular-nums">{v}</dd>
					</div>
				))}
			</dl>

			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
				<fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-8 disabled:opacity-90">
					<SettingCard title="Kanalen" icon={MessageCircle}>
						<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
							{(
								[
									["webchat", "Websitechat", "Northwind EU", true],
									["whatsapp", "WhatsApp", "", false],
									["instagram", "Instagram", "", false],
									["email", "E-mail", "", false],
								] as const
							).map(([id, label, detail, auto]) => (
								<li key={id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="flex items-center gap-2 font-medium text-base text-ink">
											{label}
										</span>
										{detail ? <span className="text-ink-3 text-sm">{detail}</span> : null}
									</span>
									<ModePicker value={draft.channels[id]} allowAuto={auto} onChange={(m) => set("channels", { ...draft.channels, [id]: m })} label={label} />
								</li>
							))}
						</ul>
					</SettingCard>

					<SettingCard title="Openingstijden" icon={Clock} action={<span className="text-ink-3 text-sm">{open ? "Nu open" : "Nu gesloten"}</span>}>
						<div>
							<OpeningHoursEditor hours={draft.hours} onChange={(hours) => set("hours", hours)} />
						</div>
						<FieldRow label="Buiten openingstijden">
							<span role="radiogroup" aria-label="Buiten openingstijden" className="inline-flex h-9 items-center gap-0.5 self-start rounded-md bg-ink/5 p-0.5">
								{(
									[
										["take", "Vraag aannemen"],
										["answer", "Antwoorden uit de kennisbank"],
									] as const
								).map(([v, t]) => (
									<button key={v} type="button" role="radio" aria-checked={draft.outside === v} onClick={() => set("outside", v)} className={cn("h-8 rounded-[5px] px-2.5 font-medium text-sm transition-colors", draft.outside === v ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-2 hover:text-ink")}>
										{t}
									</button>
								))}
							</span>
						</FieldRow>
					</SettingCard>

					<SettingCard title="Overdragen wanneer" icon={Users}>
						<div className="flex flex-col gap-1">
							<Toggle label="Insyte twijfelt aan het antwoord" checked={draft.handover.unsure} onChange={(unsure) => set("handover", { ...draft.handover, unsure })} />
							<Toggle label="De klant vraagt om een mens" checked={draft.handover.asksPerson} onChange={(asksPerson) => set("handover", { ...draft.handover, asksPerson })} />
							<FieldRow label="Altijd voor een collega">
								<Topics topics={draft.handover.topics} onChange={(topics) => set("handover", { ...draft.handover, topics })} />
							</FieldRow>
							<FieldRow label="Na zoveel berichten" hint="Leeg is nooit">
								<input
									inputMode="numeric"
									value={draft.handover.afterMessages ?? ""}
									onChange={(e) => {
										const d = e.target.value.replace(/[^0-9]/g, "");
										set("handover", { ...draft.handover, afterMessages: d ? Number(d) : null });
									}}
									aria-label="Overdragen na zoveel berichten"
									className="field h-9 w-24 rounded-md px-3 text-base text-ink tabular-nums outline-none focus:bg-paper"
								/>
							</FieldRow>
						</div>
					</SettingCard>

					<SettingCard title="Toon en woorden" icon={Sparkles}>
						<FieldRow label="Toon">
							<span role="radiogroup" aria-label="Toon" className="inline-flex h-9 items-center gap-0.5 self-start rounded-md bg-ink/5 p-0.5">
								{(
									[
										["brand", "Zoals je merk"],
										["short", "Kort en vriendelijk"],
										["formal", "Formeel"],
									] as const
								).map(([v, l]) => (
									<button key={v} type="button" role="radio" aria-checked={draft.tone === v} onClick={() => set("tone", v)} className={cn("h-8 rounded-[5px] px-2.5 font-medium text-sm transition-colors", draft.tone === v ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-2 hover:text-ink")}>
										{l}
									</button>
								))}
							</span>
						</FieldRow>
						<FieldRow label="Bij een overdracht" hint="{wanneer} wordt bijvoorbeeld “vandaag” of “morgen vanaf 9:00”">
							<textarea value={draft.handoverMessage} onChange={(e) => set("handoverMessage", e.target.value)} rows={3} aria-label="Overdrachtsbericht" className="field w-full rounded-md px-3 py-2 text-base text-ink leading-[1.5] outline-none focus:bg-paper" />
						</FieldRow>
					</SettingCard>

					<SettingCard title="Wat Insyte nooit doet" icon={Shield}>
						<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
							{(
								[
									["Terugbetalen", "RefundOrder"],
									["Een bestelling annuleren", "CancelOrder"],
									["Geld of korting beloven", "RefundOrder"],
								] as const
							).map(([l, id]) => (
								<li key={l}>
									<Link to="/settings/ai/autonomy" search={{ actie: id }} className="flex items-center gap-3 px-3.5 py-2.5 text-ink transition-colors hover:bg-ink/3">
										<Lock className="size-3.5 text-ink-3" strokeWidth={1.75} />
										<span className="flex-1 text-base">{l}</span>
										<span className="text-ink-3 text-sm">Vraagt altijd</span>
									</Link>
								</li>
							))}
						</ul>
					</SettingCard>

					{readOnly ? null : (
						<button type="button" onClick={() => save({ ...draft, on: false }, "Klantagent staat uit")} className="flex h-9 w-fit items-center rounded-md px-3 font-medium text-ink-2 text-sm hover:bg-signal-red-bg hover:text-signal-red">
							Klantagent uitzetten
						</button>
					)}
				</fieldset>

				<aside className="hidden flex-col gap-3 lg:sticky lg:top-4 lg:flex lg:self-start">
					<TestChat settings={draft} />
				</aside>
			</div>
			<button type="button" onClick={() => setTesting(true)} className="flex h-10 items-center justify-center gap-2 rounded-md bg-abyss font-medium text-mesh-ink text-sm lg:hidden">
				<MessageCircle className="size-4" strokeWidth={1.75} />
				Proberen
			</button>
			<Sheet open={testing} onOpenChange={setTesting}>
				<SheetContent side="bottom" className="h-[100svh] gap-0 bg-glacier p-4">
					<SheetTitle className="sr-only">Klantagent proberen</SheetTitle>
					<TestChat settings={draft} />
				</SheetContent>
			</Sheet>

			<UnsavedBar visible={dirty && !readOnly} onDiscard={() => setDraft(saved)} onSave={() => save()} />
			<PageGuide id="settings.ai.customer-agent" title="Klantagent" steps={GUIDE} />
		</>
	);
}

function ModePicker({ value, onChange, allowAuto, label }: { value: ChannelMode; onChange: (m: ChannelMode) => void; allowAuto: boolean; label: string }) {
	return (
		<span role="radiogroup" aria-label={`Klantagent op ${label}`} className="inline-flex h-8 items-center gap-0.5 rounded-md bg-ink/5 p-0.5">
			{(["auto", "drafts", "off"] as const).map((m) => (
				<button
					key={m}
					type="button"
					role="radio"
					aria-checked={m === value}
					disabled={m === "auto" && !allowAuto}
					title={m === "auto" && !allowAuto ? "Binnenkort" : undefined}
					onClick={() => onChange(m)}
					className={cn("h-7 rounded-[5px] px-2 font-medium text-xs transition-colors disabled:cursor-not-allowed disabled:text-ink-4", m === value ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-2 enabled:hover:text-ink")}
				>
					{MODE_LABEL[m]}
				</button>
			))}
		</span>
	);
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<label className="flex items-center justify-between gap-3 py-2">
			<span className="font-medium text-ink text-sm">{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
		</label>
	);
}

/** Seven rows, Monday first: open or closed, and from–to, in the time input the browser gives. */
export function OpeningHoursEditor({ hours, onChange }: { hours: CustomerAgentSettings["hours"]; onChange: (h: CustomerAgentSettings["hours"]) => void }) {
	const put = (i: number, patch: Partial<CustomerAgentSettings["hours"][number]>) => onChange(hours.map((h, j) => (j === i ? { ...h, ...patch } : h)));
	return (
		<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
			{DAYS.map((d, i) => {
				const h = hours[i]!;
				return (
					<li key={d} className="flex flex-wrap items-center gap-3 px-3.5 py-2">
						<span className="w-24 font-medium text-ink text-sm capitalize">{d}</span>
						<Switch checked={h.open} onCheckedChange={(open) => put(i, { open })} aria-label={`${d} open`} />
						{h.open ? (
							<span className="flex items-center gap-1.5 text-ink-3 text-sm">
								<input type="time" value={h.from} onChange={(e) => put(i, { from: e.target.value })} aria-label={`${d} van`} className="field h-8 rounded-md px-2 text-ink text-sm tabular-nums outline-none focus:bg-paper" />
								tot
								<input type="time" value={h.to} onChange={(e) => put(i, { to: e.target.value })} aria-label={`${d} tot`} className="field h-8 rounded-md px-2 text-ink text-sm tabular-nums outline-none focus:bg-paper" />
							</span>
						) : (
							<span className="text-ink-3 text-sm">Gesloten</span>
						)}
					</li>
				);
			})}
		</ul>
	);
}

function Topics({ topics, onChange }: { topics: string[]; onChange: (t: string[]) => void }) {
	const [text, setText] = useState("");
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{topics.map((t) => (
				<span key={t} className="inline-flex h-7 items-center gap-1 rounded-md bg-paper pr-1 pl-2.5 text-ink text-sm">
					{t}
					<button type="button" aria-label={`${t} weghalen`} onClick={() => onChange(topics.filter((x) => x !== t))} className="flex size-5 items-center justify-center rounded-sm text-ink-3 hover:bg-ink/6 hover:text-ink">
						<X className="size-3" strokeWidth={2} />
					</button>
				</span>
			))}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					const t = text.trim().toLowerCase();
					if (t && !topics.includes(t)) onChange([...topics, t]);
					setText("");
				}}
				className="flex items-center"
			>
				<input value={text} onChange={(e) => setText(e.target.value)} placeholder="Onderwerp toevoegen" aria-label="Onderwerp toevoegen" className="field h-7 w-40 rounded-md px-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:bg-paper" />
				<button type="submit" aria-label="Toevoegen" className="ml-1 flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink">
					<Plus className="size-3.5" strokeWidth={2} />
				</button>
			</form>
		</div>
	);
}

/* ── the test chat ─────────────────────────────────────────────────────────────────────────── */

type TestMsg = { from: "shopper" | "insyte"; text: string; source?: string; handover?: boolean };

const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3);

/** The answer the agent would give from the published chapters, with the one it used; or a handover. */
function answer(q: string, articles: ReadonlyArray<Article>, s: CustomerAgentSettings): TestMsg {
	const when = nextOpenLabel(s.hours, new Date());
	const handover = (why: string): TestMsg => ({ from: "insyte", text: s.handoverMessage.replace("{wanneer}", when === "nu" ? "vandaag nog" : when), source: why, handover: true });
	if (/geld terug|terugbetal|refund|korting krijg/i.test(q)) return handover("Overgedragen: geld beloven doet Insyte nooit");
	if (s.handover.asksPerson && /mens|medewerker|collega|iemand spreken|bellen/i.test(q)) return handover("Overgedragen: de klant vraagt om een mens");
	const topic = s.handover.topics.find((t) => q.toLowerCase().includes(t.replace(/en$/, "")));
	if (topic) return handover(`Overgedragen: ${topic} is altijd voor een collega`);
	const qw = new Set(words(q));
	let best: { a: Article; score: number; section: string } | null = null;
	for (const a of articles) {
		const pub = publishedVersion(a);
		if (!pub || a.audience === "assistant") continue;
		for (const section of pub.body.split(/\n(?=## )/)) {
			const score = words(`${a.title} ${section}`).filter((w) => qw.has(w)).length;
			if (score > (best?.score ?? 1)) best = { a, score, section };
		}
	}
	if (!best) return handover("Overgedragen: niet in de kennisbank, de vraag staat bij Nog niet beantwoord");
	const text = best.section.replace(/^## .*\n+/, "").replace(/^- /gm, "• ").trim();
	return { from: "insyte", text, source: `Uit Kennisbank: ${best.a.title} · versie ${publishedVersion(best.a)?.n}` };
}

function TestChat({ settings }: { settings: CustomerAgentSettings }) {
	const articles = useKnowledge((s) => s.articles);
	const [msgs, setMsgs] = useState<TestMsg[]>([]);
	const [q, setQ] = useState("");
	const end = useRef<HTMLDivElement>(null);
	useEffect(() => {
		end.current?.scrollIntoView({ block: "nearest" });
	}, [msgs.length]);
	const greeting = useMemo(() => "Hoi! Waar kunnen we je mee helpen?", []);
	const send = (text: string) => {
		if (!text.trim()) return;
		setMsgs((m) => [...m, { from: "shopper", text }, answer(text, articles, settings)]);
		setQ("");
	};
	return (
		<section aria-label="Klantagent proberen" className="flex h-full flex-col gap-2 rounded-xl bg-paper p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
			<header className="flex items-center gap-2 px-1">
				<h2 className="font-medium text-base text-ink">Proberen</h2>
				<span className="rounded-sm bg-mist px-1.5 py-px text-ink-3 text-xs">Test</span>
			</header>
			<WidgetPreview greeting={greeting} agent />
			<ol className="flex max-h-[380px] min-h-[120px] flex-col gap-2 overflow-y-auto px-1 lg:max-h-[380px]">
				{msgs.length === 0 ? <li className="text-ink-3 text-sm">Stel een vraag zoals een klant.</li> : null}
				{msgs.map((m, i) => (
					<li key={i} className={cn("flex max-w-[88%] flex-col gap-1", m.from === "shopper" ? "items-end self-end" : "items-start self-start")}>
						<p className={cn("whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-[1.5]", m.from === "shopper" ? "bg-ink/7 text-ink" : "bg-arc-tint text-ink")}>{m.text}</p>
						{m.source ? (
							<span className="flex items-center gap-1 text-ink-3 text-xs">
								{m.handover ? <Users className="size-3" strokeWidth={1.75} /> : <BookOpen className="size-3" strokeWidth={1.75} />}
								{m.source}
							</span>
						) : null}
					</li>
				))}
				<div ref={end} />
			</ol>
			<div className="flex flex-wrap gap-1">
				{["Hoe lang duurt verzending naar Duitsland?", "Valt de Cascade pufferjas klein?", "Ik wil mijn geld terug"].map((s) => (
					<button key={s} type="button" onClick={() => send(s)} className="h-7 rounded-md bg-mist px-2 text-ink-2 text-xs hover:text-ink">
						{s}
					</button>
				))}
			</div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					send(q);
				}}
				className="flex items-center gap-1.5"
			>
				<InsyteMark size={20} />
				<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Typ als een klant…" aria-label="Testvraag" className="field h-9 min-w-0 flex-1 rounded-md px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:bg-paper" />
				<button type="submit" aria-label="Versturen" className="flex size-9 items-center justify-center rounded-md bg-abyss text-mesh-ink hover:bg-abyss-2">
					<Send className="size-3.5" strokeWidth={2} />
				</button>
			</form>
		</section>
	);
}
