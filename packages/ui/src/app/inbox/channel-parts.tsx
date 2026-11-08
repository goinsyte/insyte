import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Lock, MessageCircle, Send, Sparkle } from "../../icons";
import { InsyteMark } from "../ask/parts";
import { FormDialog } from "../common/form-dialog";
import { ChannelMark } from "./channel-mark";
import {
	CHANNEL_LABEL,
	type ChannelId,
	type ChatMessage,
	fillTemplate,
	lastInbound,
	mayReply,
	replyWindow,
	type WhatsAppTemplate,
} from "../lib/channels";
import { cn } from "../lib/utils";
import { channelsSeed } from "../../data-source";
import type { ThreadState } from "../stores/inbox-store";
import { useWorkspace } from "../stores/workspace-store";

/*
 * The inbox's chat channels (PLAN 27, design §4): their mark, their group head, the letter drawn as
 * bubbles with the 24-hour reply window, and the connect flow. Email keeps its own letter.
 */

/** A channel's mark: the vendor's own logo, or Insyte's glyph on `abyss` for the website chat. */
export { ChannelMark };

export function useChannelStatus(channel: Exclude<ChannelId, "email">) {
	const it = useWorkspace((s) => s.integrations.find((i) => i.key === channel));
	return { live: it?.status === "connected", status: it?.status ?? "disconnected", account: channelsSeed.accounts[channel].account };
}

/** The sticky band over a channel's threads, in the mailbox band's grammar. */
export function ChannelHeader({ channel, count }: { channel: Exclude<ChannelId, "email">; count: number }) {
	const st = useChannelStatus(channel);
	return (
		<div className="sticky top-0 z-[1] flex h-9 items-center gap-2 bg-glacier px-5 text-sm">
			<ChannelMark channel={channel} size={16} />
			<span className="min-w-0 truncate font-medium text-ink-2">{CHANNEL_LABEL[channel]}</span>
			<span className="min-w-0 truncate text-ink-3">{st.account}</span>
			<span className="ml-auto flex shrink-0 items-center gap-1.5 text-ink-3 tabular-nums">
				{st.live ? (
					<>
						<span className="size-1.5 rounded-full bg-signal-green" aria-hidden />
						{count}
					</>
				) : (
					<Link to="/settings/integrations" className="font-medium text-signal-amber hover:underline">
						Opnieuw koppelen
					</Link>
				)}
			</span>
		</div>
	);
}

const time = (iso: string) => new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * The window a business has on WhatsApp and Instagram: amber in its last hours, and once closed the
 * sentence that says what may still be sent.
 */
export function ReplyWindowNotice({ channel, messages, now }: { channel: ChannelId; messages: ReadonlyArray<ChatMessage>; now: number }) {
	const w = replyWindow(channel, lastInbound(messages), now);
	if (!w.applies) return null;
	const can = mayReply(channel, w);
	if (w.open) {
		return (
			<p className={cn("flex items-center gap-2 px-4 py-2 text-sm", w.hoursLeft < 6 ? "bg-signal-amber-bg text-ink" : "bg-mist text-ink-2")}>
				<Clock className={cn("size-3.5 shrink-0", w.hoursLeft < 6 ? "text-signal-amber" : "text-ink-3")} strokeWidth={1.75} />
				Nog {w.hoursLeft === 0 ? "minder dan een uur" : `${w.hoursLeft} ${w.hoursLeft === 1 ? "uur" : "uur"}`} om vrij te antwoorden; daarna {channel === "whatsapp" ? "alleen een goedgekeurd sjabloon" : "kun je pas weer antwoorden als de klant iets stuurt"}.
			</p>
		);
	}
	return (
		<p className="flex items-center gap-2 bg-signal-amber-bg px-4 py-2 text-ink text-sm">
			<Lock className="size-3.5 shrink-0 text-signal-amber" strokeWidth={1.75} />
			{can === "template" ? "Het venster van 24 uur is dicht. Je kunt alleen een goedgekeurd WhatsApp-sjabloon sturen." : "Het venster van 24 uur is dicht. Instagram laat je pas weer antwoorden als de klant iets stuurt."}
		</p>
	);
}

/** One bubble. The customer on the left on `mist`; the team and Insyte on the right, Insyte marked. */
function Bubble({ m, customer }: { m: ChatMessage; customer: string }) {
	const ours = m.from !== "customer";
	return (
		<li className={cn("flex max-w-[78%] flex-col gap-1", ours ? "items-end self-end" : "items-start self-start")}>
			<span className="flex items-center gap-1.5 text-ink-3 text-xs">
				{m.from === "insyte" ? <InsyteMark size={14} /> : null}
				{m.from === "insyte" ? "Insyte · automatisch" : m.from === "team" ? (m.name ?? "Team") : customer}
				<span className="tabular-nums">{time(m.at)}</span>
			</span>
			<p className={cn("whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-base leading-[1.5]", ours ? (m.from === "insyte" ? "bg-arc-tint text-ink" : "bg-ink/7 text-ink") : "bg-mist text-ink")}>
				{m.template ? <span className="mb-1 block text-ink-3 text-xs">Sjabloon · {m.template}</span> : null}
				{m.text}
			</p>
			{ours && m.read !== undefined ? (
				<span className="flex items-center gap-1 text-ink-3 text-xs">
					<Check className="size-3" strokeWidth={2.25} />
					{m.read ? "Gelezen" : "Afgeleverd"}
				</span>
			) : null}
		</li>
	);
}

/**
 * The letter of a chat thread: who and where, the conversation as bubbles, the reply window, and a
 * composer that sends a bubble — or, past the window on WhatsApp, only an approved template.
 */
export function ChatLetter({
	thread,
	now,
	onSend,
	banner,
	composerDisabled,
}: {
	thread: ThreadState;
	now: number;
	onSend: (text: string, template?: WhatsAppTemplate) => void;
	/** Put above the conversation: the handover band (§5). */
	banner?: React.ReactNode;
	composerDisabled?: string | undefined;
}) {
	const channel = thread.channel as Exclude<ChannelId, "email">;
	const st = useChannelStatus(channel);
	const messages = thread.chat ?? [];
	const w = replyWindow(channel, lastInbound(messages), now);
	const can = mayReply(channel, w);
	const [text, setText] = useState("");
	const [tpl, setTpl] = useState<WhatsAppTemplate | null>(null);
	const end = useRef<HTMLDivElement>(null);
	const customer = thread.participants[0]?.name ?? "Klant";
	useEffect(() => {
		end.current?.scrollIntoView({ block: "end" });
	}, [messages.length]);
	const blocked = composerDisabled ?? (!st.live ? `${CHANNEL_LABEL[channel]} is ontkoppeld. Koppel het opnieuw om te antwoorden.` : can === "none" ? "Wacht tot de klant weer iets stuurt." : undefined);
	const approved = channelsSeed.templates.filter((t) => t.status === "approved");
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
				<div className="flex flex-wrap items-center gap-2 pt-1 pb-4">
					<ChannelMark channel={channel} size={20} />
					<h1 className="font-medium text-ink text-xl leading-tight">{customer}</h1>
					<span className="text-ink-3 text-sm">{thread.handle}</span>
					{thread.orderRef ? <span className="rounded-sm bg-arc-tint px-1.5 py-px font-medium text-arc-ink text-xs">{thread.orderRef}</span> : null}
				</div>
				{banner}
				<ol className="flex flex-col gap-3 pt-2">
					{messages.map((m) => (
						<Bubble key={m.id} m={m} customer={customer} />
					))}
				</ol>
				<div ref={end} />
			</div>
			<ReplyWindowNotice channel={channel} messages={messages} now={now} />
			{!st.live ? (
				<div className="flex shrink-0 items-center gap-2 bg-signal-amber-bg px-4 py-2 text-ink text-sm">
					<AlertTriangle className="size-3.5 shrink-0 text-signal-amber" strokeWidth={2} />
					<span className="min-w-0 flex-1">{CHANNEL_LABEL[channel]} vraagt opnieuw toestemming. Er komt niets binnen en er gaat niets uit tot het weer gekoppeld is.</span>
					<Link to="/settings/integrations" className="shrink-0 font-medium hover:underline">
						Opnieuw koppelen
					</Link>
				</div>
			) : null}
			<div className="flex shrink-0 flex-col gap-2 bg-mist px-4 py-3">
				{can === "template" && !blocked ? (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-ink-3 text-sm">Sjabloon</span>
						{approved.map((t) => (
							<button key={t.id} type="button" aria-pressed={tpl?.id === t.id} onClick={() => setTpl(t)} className={cn("h-7 rounded-md px-2 text-sm transition-colors", tpl?.id === t.id ? "bg-abyss font-medium text-mesh-ink" : "bg-paper text-ink-2 hover:text-ink")}>
								{t.label}
							</button>
						))}
					</div>
				) : null}
				<div className="flex items-end gap-2">
					<textarea
						value={can === "template" && tpl ? fillTemplate(tpl.body, { naam: customer.split(" ")[0] ?? customer, order: thread.orderRef }) : text}
						readOnly={can === "template"}
						disabled={!!blocked}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && can === "free") {
								onSend(text.trim());
								setText("");
							}
						}}
						rows={2}
						placeholder={blocked ?? (can === "template" ? "Kies een sjabloon" : `Antwoord via ${CHANNEL_LABEL[channel]}`)}
						aria-label="Antwoord"
						className="field min-h-[44px] flex-1 resize-none rounded-md px-3 py-2.5 text-base text-ink leading-[1.4] outline-none placeholder:text-ink-3 focus:bg-paper disabled:opacity-60"
					/>
					<button
						type="button"
						disabled={!!blocked || (can === "free" ? !text.trim() : !tpl)}
						onClick={() => {
							if (can === "template" && tpl) {
								onSend(fillTemplate(tpl.body, { naam: customer.split(" ")[0] ?? customer, order: thread.orderRef }), tpl);
								setTpl(null);
							} else {
								onSend(text.trim());
								setText("");
							}
						}}
						className="flex h-11 items-center gap-2 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Send className="size-3.5" strokeWidth={2} />
						Versturen
					</button>
				</div>
			</div>
		</div>
	);
}

/* ── connecting a channel ──────────────────────────────────────────────────────────────────── */

const STEPS: Record<Exclude<ChannelId, "email">, ReadonlyArray<{ title: string; body: string }>> = {
	whatsapp: [
		{ title: "Meta-bedrijfsaccount", body: "Je logt in bij Meta en kiest het bedrijfsaccount van Northwind. Insyte krijgt alleen toegang tot berichten." },
		{ title: "Telefoonnummer", body: "Het nummer waarop klanten je appen. Het mag niet al in de gewone WhatsApp-app staan." },
		{ title: "Weergavenaam en sjabloon", body: "De naam die klanten zien, en een eerste sjabloon dat Meta goedkeurt, zodat je ook na 24 uur kunt antwoorden." },
	],
	instagram: [
		{ title: "Instagram-bedrijfsaccount", body: "Je logt in bij Meta en kiest het Instagram-account dat aan je Facebook-pagina hangt." },
		{ title: "Berichten toestaan", body: "Instagram vraagt of apps je berichten mogen lezen en beantwoorden. Reacties en stories blijven van jou." },
	],
	webchat: [
		{ title: "App-embed in je thema", body: "Insyte zet de chat als app-embed in het thema van de winkel. Je kunt hem daar met één schakelaar weer uitzetten." },
		{ title: "Kleur en welkomsttekst", body: "De chat neemt de kleur van je winkel over en begroet bezoekers met de tekst die je hier kiest." },
	],
};

/**
 * Kanaal koppelen: the provider's steps, simulated one at a time, each with what Insyte will and will
 * not get. The last step connects; the channel appears in the inbox's panel.
 */
export function ChannelConnectDialog({ channel, onClose }: { channel: Exclude<ChannelId, "email"> | null; onClose: () => void }) {
	const [step, setStep] = useState(0);
	const [busy, setBusy] = useState(false);
	const [greeting, setGreeting] = useState("Hoi! Waar kunnen we je mee helpen?");
	const connect = useWorkspace((s) => s.connectIntegration);
	const steps = channel ? STEPS[channel] : [];
	const last = step === steps.length - 1;
	return (
		<FormDialog
			open={channel !== null}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
					setStep(0);
				}
			}}
			title={channel ? `${CHANNEL_LABEL[channel]} koppelen` : ""}
			description={channel ? `Stap ${step + 1} van ${steps.length}` : undefined}
			primaryLabel={busy ? "Koppelen…" : last ? "Koppelen" : "Volgende"}
			disabled={busy}
			onSubmit={async () => {
				if (!channel) return;
				if (!last) return setStep((x) => x + 1);
				setBusy(true);
				await connect(channel);
				setBusy(false);
				onClose();
				setStep(0);
			}}
		>
			{channel ? (
				<div className="flex flex-col gap-4">
					<ol className="flex gap-1.5" aria-hidden>
						{steps.map((s, i) => (
							<li key={s.title} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-arc" : "bg-ink/8")} />
						))}
					</ol>
					<div className="flex items-start gap-3">
						<ChannelMark channel={channel} size={36} />
						<div className="flex flex-col gap-1">
							<p className="font-medium text-ink">{steps[step]?.title}</p>
							<p className="text-ink-2 text-sm leading-relaxed">{steps[step]?.body}</p>
						</div>
					</div>
					{channel === "webchat" && last ? (
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-ink-3 text-sm">Welkomsttekst</span>
							<input value={greeting} onChange={(e) => setGreeting(e.target.value)} className="field h-10 rounded-md px-3 text-base text-ink outline-none focus:bg-paper" />
						</label>
					) : null}
					{channel === "webchat" && last ? <WidgetPreview greeting={greeting} /> : null}
				</div>
			) : null}
		</FormDialog>
	);
}

/** A static drawing of the shopper's side of the website chat, with the store's greeting. */
export function WidgetPreview({ greeting, agent = false }: { greeting: string; agent?: boolean }) {
	return (
		<div aria-hidden className="flex flex-col gap-2 rounded-lg bg-mist p-3">
			<div className="flex items-center gap-2 rounded-md bg-abyss px-3 py-2 text-mesh-ink text-sm">
				<MessageCircle className="size-3.5" strokeWidth={1.75} />
				Northwind EU
				{agent ? <span className="ml-auto flex items-center gap-1 text-mesh-ink-2 text-xs"><Sparkle className="size-3" strokeWidth={1.75} />antwoordt meteen</span> : null}
			</div>
			<p className="max-w-[80%] rounded-lg bg-paper px-3 py-2 text-ink text-sm">{greeting}</p>
			<div className="rounded-md bg-paper px-3 py-2 text-ink-3 text-sm">Typ een bericht</div>
		</div>
	);
}
