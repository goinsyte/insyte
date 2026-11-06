import { ArrowLeft, BellRing, CheckCircle2, Clock, Eye, EyeOff, Loader, RotateCcw, Send, X } from "../../icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkflows } from "../automations/workflow-store";
import { NoteLead, NoteSentence } from "./note-parts";
import { eventDef, fullTime, type Note, SOURCES, stateOf, wakesAt } from "../lib/notifications";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useChatStore } from "../stores/chat-store";
import { useNotifications } from "../stores/notifications-store";
import { useWorkspace } from "../stores/workspace-store";

/*
 * The preview: what the notification is about, read from the record itself, and the one thing to do
 * about it. A proposal is filed here, a mention is answered here, an invitation is sent again here;
 * everything else opens its record. Doing it reads the notification.
 */

const ORDER_STATUS: Record<string, string> = {
	placed: "Geplaatst",
	paid: "Betaald",
	at_supplier: "Bij leverancier",
	shipped: "Verzonden",
	delivered: "Bezorgd",
	cancelled: "Geannuleerd",
	refunded: "Terugbetaald",
};
const TICKET_STATUS: Record<string, string> = { intake: "Nieuw", in_progress: "Bezig", awaiting_reply: "Wacht op antwoord", done: "Klaar" };
const PRIORITY: Record<string, string> = { high: "Hoog", medium: "Gemiddeld", low: "Laag" };
const CB_STATUS: Record<string, string> = { open: "Open", awaiting_evidence: "Wacht op bewijs", submitted: "Ingediend", won: "Gewonnen", lost: "Verloren" };
const FLOW_STATUS: Record<string, string> = { active: "Actief", paused: "Gepauzeerd", draft: "Concept" };
const INTEGRATION_STATUS: Record<string, string> = { connected: "Gekoppeld", disconnected: "Ontkoppeld", action_required: "Actie nodig", connecting: "Bezig met koppelen" };
const PROVIDER: Record<string, string> = { klarna: "Klarna", stripe: "Stripe", paypal: "PayPal" };

const money = (v: number, currency = "USD") => new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(v);

type Primary = { label: string; run: () => void | Promise<void>; busy?: boolean; done?: string; quiet?: boolean };

export function NotePreview({ note, now, onClose, onSnooze, onClear, onRestore, canMute }: {
	note: Note;
	now: number;
	onClose: () => void;
	onSnooze: () => void;
	onClear: () => void;
	onRestore: () => void;
	canMute: boolean;
}) {
	const navigate = useNavigate();
	const still = useReducedMotion();
	const setRead = useNotifications((s) => s.setRead);
	const setEventApp = useNotifications((s) => s.setEventApp);
	const orders = useWorkspace((s) => s.orders);
	const tickets = useWorkspace((s) => s.tickets);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const members = useWorkspace((s) => s.members);
	const integrations = useWorkspace((s) => s.integrations);
	const queue = useWorkspace((s) => s.queue);
	const workflows = useWorkflows();
	const [busy, setBusy] = useState(false);
	const state = stateOf(note, now);
	const ref = note.ref;

	const open = () => {
		setRead([note.id], true);
		navigate({ to: note.to, search: note.search } as never);
	};

	let facts: Array<readonly [string, ReactNode]> = [...(note.facts ?? [])];
	let primary: Primary = { label: "Openen", run: open };
	let missing = false;

	if (ref?.type === "order") {
		const o = orders.find((x) => x.id === ref.id);
		if (o) {
			facts = [
				["Bestelling", o.number],
				["Klant", o.customer_name],
				["Totaal", money(o.total, o.currency)],
				["Status", ORDER_STATUS[o.status] ?? o.status],
				["Artikelen", String(o.line_items.reduce((n, l) => n + l.quantity, 0))],
			];
		} else missing = true;
		primary = { label: "Bestelling openen", run: open };
	} else if (ref?.type === "ticket") {
		const t = tickets.find((x) => x.id === ref.id);
		if (t) {
			facts = [
				["Ticket", t.number],
				["Onderwerp", t.title],
				["Status", TICKET_STATUS[t.status] ?? t.status],
				["Prioriteit", PRIORITY[t.priority] ?? t.priority],
			];
		} else missing = true;
		primary = { label: "Ticket openen", run: open };
	} else if (ref?.type === "chargeback") {
		const c = chargebacks.find((x) => x.id === ref.id);
		if (c) {
			facts = [
				["Zaak", `${c.case_number} · ${PROVIDER[c.provider] ?? c.provider}`],
				["Klant", c.customer_name],
				["Bedrag", money(c.amount, c.currency)],
				["Reden", c.reason],
				["Status", CB_STATUS[c.status] ?? c.status],
			];
		} else missing = true;
		primary = { label: "Chargeback openen", run: open };
	} else if (ref?.type === "automation") {
		const w = workflows[ref.id];
		if (w) {
			facts = [
				["Flow", w.name],
				["Status", FLOW_STATUS[w.status] ?? w.status],
				["Uitvoeringen", w.runs.toLocaleString("nl-NL")],
			];
		}
		primary = { label: "Flow openen", run: open };
	} else if (ref?.type === "proposal") {
		const q = queue.find((x) => x.id === ref.id);
		if (q) {
			facts = [
				["Voorstel", q.plate?.heading ?? q.title],
				["Op het spel", q.value],
				["Termijn", q.due],
				["Staat", q.state === "open" ? "Getekend, niet uitgevoerd" : q.state === "filed" ? "Uitgevoerd" : "Genegeerd"],
			];
			primary =
				q.state === "open"
					? {
							label: q.plate?.fileLabel ?? "Uitvoeren",
							run: () => {
								const ws = useWorkspace.getState();
								ws.fileQueue(q.id);
								setRead([note.id], true);
								undoable(`${q.plate?.heading ?? "Voorstel"} uitgevoerd`, () => ws.restoreQueue(q.id, "open"), q.plate?.after.value);
							},
						}
					: { label: "Op Start bekijken", run: open, done: q.state === "filed" ? "Uitgevoerd" : "Genegeerd" };
		} else missing = true;
	} else if (ref?.type === "member") {
		const m = members.find((x) => x.id === ref.id);
		if (m) {
			facts = [
				["Naam", m.name],
				["E-mail", m.email],
				["Rol", m.role],
				["Status", m.status === "invited" ? "Uitgenodigd" : "Actief"],
			];
			primary =
				m.status === "invited"
					? {
							label: "Uitnodiging opnieuw versturen",
							run: () => {
								useWorkspace.getState().resendInvite(m.id);
								setRead([note.id], true);
								toast.success(`Uitnodiging opnieuw verstuurd naar ${m.email}`);
							},
						}
					: { label: "Team openen", run: open };
		} else missing = true;
	} else if (ref?.type === "integration") {
		const i = integrations.find((x) => x.key === ref.key);
		if (i) {
			facts = [
				["Koppeling", i.name],
				["Status", INTEGRATION_STATUS[i.status] ?? i.status],
				["Laatst gesynchroniseerd", i.syncedAt ? fullTime(i.syncedAt) : "Nog niet"],
			];
			const act = async (verb: "connect" | "sync") => {
				setBusy(true);
				const ws = useWorkspace.getState();
				await (verb === "connect" ? ws.connectIntegration(i.key) : ws.syncIntegration(i.key));
				setBusy(false);
				setRead([note.id], true);
				toast.success(verb === "connect" ? `${i.name} is weer gekoppeld` : `${i.name} is opnieuw gesynchroniseerd`);
			};
			primary =
				i.status !== "connected"
					? { label: i.status === "connecting" ? "Bezig met koppelen" : "Opnieuw koppelen", run: () => act("connect"), busy: busy || i.status === "connecting" }
					: note.event === "integration.sync"
						? { label: "Opnieuw synchroniseren", run: () => act("sync"), busy }
						: { label: "Koppelingen openen", run: open };
		}
	} else if (ref?.type === "conversation") {
		// The answer is the primary act here; opening the channel is the way out.
		primary = { label: "Chat openen", run: open, quiet: true };
	}

	const event = eventDef(note.event);
	const Source = SOURCES[note.source];

	return (
		<motion.article
			key={note.id}
			initial={still ? false : { opacity: 0, x: 8 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
			aria-label="Voorbeeld"
			className="flex min-h-0 flex-1 flex-col"
		>
			<header className="flex h-[52px] shrink-0 items-center gap-2 px-4">
				<button
					type="button"
					onClick={onClose}
					aria-label="Terug naar de lijst"
					className="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-ink/6 hover:text-ink lg:hidden"
				>
					<ArrowLeft className="size-4" strokeWidth={1.75} />
				</button>
				<span className="flex h-6 items-center gap-1.5 rounded-sm bg-paper px-2 font-medium text-ink-2 text-xs">
					<Source.icon className="size-3.5 text-ink-3" strokeWidth={1.75} />
					{Source.label}
				</span>
				<span className="truncate text-ink-3 text-xs">{fullTime(note.at)}</span>
				<button
					type="button"
					onClick={onClose}
					aria-label="Voorbeeld sluiten"
					title="Sluiten (Esc)"
					className="ml-auto hidden size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink lg:flex"
				>
					<X className="size-4" strokeWidth={1.75} />
				</button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-1 pb-6">
				<div className="flex items-start gap-3">
					<NoteLead note={note} size={36} />
					<div className="flex min-w-0 flex-col gap-1">
						<NoteSentence note={note} className="text-ink text-md [overflow-wrap:anywhere]" />
						{state === "later" && note.snoozeUntil ? (
							<span className="flex items-center gap-1.5 text-arc-ink text-sm">
								<Clock className="size-3.5" strokeWidth={1.75} />
								Komt terug {wakesAt(note.snoozeUntil, now)}
							</span>
						) : null}
						{state === "cleared" ? <span className="text-ink-3 text-sm">Gewist. Hij staat hier tot je hem terugzet.</span> : null}
					</div>
				</div>

				{note.detail ? (
					<p className={cn("rounded-lg bg-paper px-3.5 py-3 text-base leading-relaxed", note.quote ? "text-ink" : "text-ink-2")}>
						{note.quote ? `“${note.detail}”` : note.detail}
					</p>
				) : null}

				{ref?.type === "conversation" ? <Reply note={note} conversation={ref.id} name={ref.name} /> : null}

				{facts.length > 0 ? (
					<dl className="flex flex-col overflow-hidden rounded-lg bg-paper [&>div+div]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
						{facts.map(([k, v]) => (
							<div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3.5 py-2 text-sm">
								<dt className="text-ink-3">{k}</dt>
								<dd className="text-ink tabular-nums [overflow-wrap:anywhere]">{v}</dd>
							</div>
						))}
					</dl>
				) : null}
				{missing ? <p className="text-ink-3 text-sm">Dit record staat niet meer in de werkruimte.</p> : null}

				<div className="flex flex-wrap items-center gap-2">
					{primary.done ? (
						<span className="flex h-9 items-center gap-1.5 rounded-md bg-signal-green-bg px-3 font-medium text-signal-green text-sm">
							<CheckCircle2 className="size-4" strokeWidth={1.75} />
							{primary.done}
						</span>
					) : null}
					<button
						type="button"
						disabled={primary.busy}
						onClick={() => void primary.run()}
						className={cn(
							"flex h-9 items-center gap-2 rounded-md px-3.5 font-medium text-base transition-colors disabled:opacity-70",
							primary.quiet ? "field text-ink hover:field-hover" : "bg-abyss text-mesh-ink shadow-primary hover:bg-abyss-2",
						)}
					>
						{primary.busy ? <Loader className="size-4 animate-spin" strokeWidth={1.75} /> : null}
						{primary.label}
					</button>
					{primary.label !== "Openen" && primary.run !== open && !primary.done ? (
						<Link
							to={note.to}
							search={note.search as never}
							onClick={() => setRead([note.id], true)}
							className="field flex h-9 items-center rounded-md px-3.5 font-medium text-base text-ink hover:field-hover"
						>
							Openen
						</Link>
					) : null}
				</div>

				<div className="flex flex-wrap gap-1">
					<PaneButton icon={note.read ? EyeOff : Eye} label={note.read ? "Ongelezen" : "Gelezen"} keys="U" onClick={() => setRead([note.id], !note.read)} />
					{state === "inbox" ? <PaneButton icon={Clock} label="Later" keys="S" onClick={onSnooze} /> : null}
					{state === "cleared" || state === "later" ? (
						<PaneButton icon={RotateCcw} label={state === "later" ? "Nu terughalen" : "Terugzetten"} onClick={onRestore} />
					) : (
						<PaneButton icon={CheckCircle2} label="Wissen" keys="E" onClick={onClear} />
					)}
					{note.persona === "admin" && event && canMute ? (
						<PaneButton
							icon={BellRing}
							label="Dit soort niet meer tonen"
							onClick={() => {
								setEventApp(note.event, false);
								onClose();
								undoable(`Je ziet “${event.label}” niet meer in de app`, () => setEventApp(note.event, true), "Zet het terug in Instellingen, Meldingen.");
							}}
						/>
					) : null}
				</div>
			</div>
		</motion.article>
	);
}

function PaneButton({ icon: Icon, label, keys, onClick }: { icon: typeof Eye; label: string; keys?: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
		>
			<Icon className="size-3.5 text-ink-3" strokeWidth={1.75} />
			{label}
			{keys ? <kbd className="ml-0.5 hidden h-5 sm:flex min-w-5 items-center justify-center rounded-sm bg-paper px-1 font-medium text-ink-3 text-xs">{keys}</kbd> : null}
		</button>
	);
}

/** Answer a mention where it was read: the message lands in the channel it came from. */
function Reply({ note, conversation, name }: { note: Note; conversation: string; name: string }) {
	const appendMessage = useChatStore((s) => s.appendMessage);
	const setRead = useNotifications((s) => s.setRead);
	const [text, setText] = useState("");
	// A new notification starts a new answer.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset per note
	useEffect(() => setText(""), [note.id]);
	const send = () => {
		const body = text.trim();
		if (!body) return;
		appendMessage(conversation, {
			id: `m_${Date.now()}`,
			conversation_id: conversation,
			sender_id: "u_elena",
			sender_name: "Elena Hart",
			body,
			at: new Date().toISOString(),
		});
		setText("");
		setRead([note.id], true);
		toast.success(`Verstuurd in ${name}`);
	};
	return (
		<div className="flex flex-col gap-2 rounded-lg bg-paper p-2">
			<textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						send();
					}
				}}
				rows={3}
				placeholder={`Antwoord in ${name}`}
				aria-label={`Antwoord in ${name}`}
				className="w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-base text-ink outline-none placeholder:text-ink-3"
			/>
			<div className="flex items-center justify-between gap-2 pl-2">
				<span className="text-ink-3 text-xs">⌘ Enter verstuurt</span>
				<button
					type="button"
					onClick={send}
					disabled={!text.trim()}
					className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
				>
					<Send className="size-3.5" strokeWidth={1.75} />
					Versturen
				</button>
			</div>
		</div>
	);
}
