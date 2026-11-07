import {
	AlertTriangle,
	AtSign,
	BarChart3,
	Box,
	Calendar,
	Check,
	Clock,
	CornerDownLeft,
	Globe,
	type IconComponent,
	Inbox,
	MessagesSquare,
	Pin,
	Plus,
	Rocket,
	ShoppingBag,
	Sparkle,
	Star,
	Ticket,
	Truck,
	Users,
	Workflow,
	X,
} from "../../icons";
import { CustomerAgentCard, ReturnsCard } from "./agent-cards";
import { MessageCircle, RotateCcw } from "../../icons";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Glyph } from "../common/glyph";
import { RevenueBreakdown } from "./breakdown-dialog";
import {
	BestsellersCard,
	BookmarksCard,
	ChatsCard,
	CountriesCard,
	InsyteCard,
	LiveCard,
	MentionsCard,
	RecentCard,
	TodayCard,
} from "./cards";
import { isAssignedTo, ME } from "../lib/assignees";
import { formatCurrency, initials } from "../lib/format";
import { lastActionById, presenceById } from "../../data-source";
import { convert } from "../lib/money";
import { personStyle } from "../lib/person-color";
import { revenueWindow } from "../lib/revenue";
import { automations } from "../../data-source";
import { products } from "../../data-source";
import { supplierName } from "../lib/order-supplier";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useHome, type WidgetId, type WidgetSize, type WidgetTone } from "../stores/home-store";
import { useWorkspace } from "../stores/workspace-store";
import { setupTasks, Struck, type Task, TickBox } from "./setup-checklist";

export { Struck, TickBox };

/**
 * The home board's widgets.
 *
 * Each one answers a question an operator asks about the business between triage runs — is setup
 * done, what did I mean to do, how is revenue moving, where are orders stuck, which supplier is
 * slow — and every one of them reads the same workspace the rest of the console writes to. File a
 * chargeback on the queue above and the chargeback widget moves; mark an order fulfilled on Orders
 * and the stage bar shifts. None of them is a number for its own sake.
 *
 * The grammar is the queue's: a quiet heading, figures in tabular sans, bands instead of rules, one
 * arc accent per widget. A band is `bg-band`, which the frame sets from the widget's ground — `mist`
 * on white, white on light blue and grey — so a widget reads the same whichever ground it is given.
 * Each one leads with its own glyph from the house set, drawn in when it appears and answering a
 * hover with one small gesture; no icons in circles, no hero figure over a sparkline.
 */

export type WidgetDef = {
	id: WidgetId;
	title: string;
	/** One line for the add-widget menu. */
	blurb: string;
	icon: IconComponent;
	defaultSize: WidgetSize;
	defaultTone: WidgetTone;
	/** The grounds the operator may put it on. The queue keeps the brand's glow. */
	tones: ReadonlyArray<WidgetTone>;
	/** Where "Open" in the heading goes, when the widget is a window onto a screen. */
	to?: string;
	render: () => ReactNode;
};

const LIGHT: ReadonlyArray<WidgetTone> = ["paper", "tint", "mist"];

export const WIDGETS: Record<WidgetId, WidgetDef> = {
	queue: {
		id: "queue",
		title: "Je wachtrij",
		blurb: "Wat een beslissing van je vraagt, op volgorde van resterende tijd.",
		icon: Inbox,
		defaultSize: 2,
		defaultTone: "mesh",
		tones: ["mesh"],
		// The dashboard renders the queue itself: it owns the selection and the plate.
		render: () => null,
	},
	setup: {
		id: "setup",
		title: "Inrichting afronden",
		blurb: "Wat de onboarding voor later liet, afgevinkt zodra je het doet.",
		icon: Rocket,
		defaultSize: 1,
		defaultTone: "tint",
		tones: LIGHT,
		render: () => <SetupWidget />,
	},
	todo: {
		id: "todo",
		title: "Je lijst",
		blurb: "Een korte takenlijst die alleen jij ziet.",
		icon: Check,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		render: () => <TodoWidget />,
	},
	revenue: {
		id: "revenue",
		title: "Omzet",
		blurb: "Bestelwaarde per week, vergeleken met de weken ervoor.",
		icon: BarChart3,
		defaultSize: 2,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/analytics",
		render: () => <RevenueWidget />,
	},
	orders: {
		id: "orders",
		title: "Bestellingen per fase",
		blurb: "Waar elke open bestelling staat, en hoeveel er vertraagd zijn.",
		icon: ShoppingBag,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/orders",
		render: () => <OrdersWidget />,
	},
	chargebacks: {
		id: "chargebacks",
		title: "Chargebacks",
		blurb: "Zaken die op bewijs wachten, en je resultaten tot nu toe.",
		icon: CornerDownLeft,
		defaultSize: 1,
		defaultTone: "tint",
		tones: LIGHT,
		to: "/chargebacks",
		render: () => <ChargebacksWidget />,
	},
	suppliers: {
		id: "suppliers",
		title: "Vertragingen bij leveranciers",
		blurb: "Welke leveranciers bestellingen ophouden.",
		icon: Truck,
		defaultSize: 1,
		defaultTone: "mist",
		tones: LIGHT,
		to: "/orders",
		render: () => <SuppliersWidget />,
	},
	tickets: {
		id: "tickets",
		title: "Tickets",
		blurb: "De kolommen van het bord in één oogopslag.",
		icon: Ticket,
		defaultSize: 1,
		defaultTone: "tint",
		tones: LIGHT,
		to: "/tickets",
		render: () => <TicketsWidget />,
	},
	stock: {
		id: "stock",
		title: "Lage voorraad",
		blurb: "Varianten die bijna op zijn.",
		icon: Box,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/products",
		render: () => <StockWidget />,
	},
	automations: {
		id: "automations",
		title: "Automatiseringen",
		blurb: "Wat er de afgelopen 30 dagen is uitgevoerd.",
		icon: Workflow,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/automations",
		render: () => <AutomationsWidget />,
	},
	mytickets: {
		id: "mytickets",
		title: "Mijn tickets",
		blurb: "De open tickets die aan jou zijn toegewezen, de meest urgente eerst.",
		icon: Ticket,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/tickets",
		render: () => <MyTicketsWidget />,
	},
	team: {
		id: "team",
		title: "Team nu",
		blurb: "Wie er is en waar ze aan werken, één klik van een bericht.",
		icon: Users,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/settings/team",
		render: () => <TeamWidget />,
	},
	today: {
		id: "today",
		title: "Agenda vandaag",
		blurb: "De deadlines en geplande dingen van vandaag, met een lijn voor nu.",
		icon: Calendar,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		render: () => <TodayCard />,
	},
	live: {
		id: "live",
		title: "Live bestellingen",
		blurb: "Bestellingen zoals ze binnenkomen, te pauzeren.",
		icon: ShoppingBag,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/orders",
		render: () => <LiveCard />,
	},
	mentions: {
		id: "mentions",
		title: "Vermeldingen en toegewezen",
		blurb: "Waar iemand je noemde of werk bij je neerlegde.",
		icon: AtSign,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/notifications",
		render: () => <MentionsCard />,
	},
	recent: {
		id: "recent",
		title: "Recent",
		blurb: "De records die je het laatst opende.",
		icon: Clock,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		render: () => <RecentCard />,
	},
	insyte: {
		id: "insyte",
		title: "Wat Insyte deed",
		blurb: "Concepten, voorstellen en uitvoeringen van vandaag, en de tijd die het scheelt.",
		icon: Sparkle,
		defaultSize: 1,
		defaultTone: "tint",
		tones: LIGHT,
		render: () => <InsyteCard />,
	},
	customeragent: {
		id: "customeragent",
		title: "Klantagent vandaag",
		blurb: "Gesprekken op de websitechat: wat Insyte afhandelde en wat het doorgaf.",
		icon: MessageCircle,
		defaultSize: 1,
		defaultTone: "tint",
		tones: LIGHT,
		to: "/settings/ai/customer-agent",
		render: () => <CustomerAgentCard />,
	},
	returns: {
		id: "returns",
		title: "Retouren",
		blurb: "Wat te beoordelen of af te handelen is, met de deadline.",
		icon: RotateCcw,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/returns",
		render: () => <ReturnsCard />,
	},
	bestsellers: {
		id: "bestsellers",
		title: "Bestsellers",
		blurb: "Wat het meest verkocht, met de voorraad die nog over is.",
		icon: Star,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/products",
		render: () => <BestsellersCard />,
	},
	bookmarks: {
		id: "bookmarks",
		title: "Bladwijzers",
		blurb: "Je vastgezette records en favorieten, één klik van de start.",
		icon: Pin,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		render: () => <BookmarksCard />,
	},
	countries: {
		id: "countries",
		title: "Bestellingen per land",
		blurb: "Waar je bestellingen vandaan komen, in de periode van het bord.",
		icon: Globe,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/analytics",
		render: () => <CountriesCard />,
	},
	chats: {
		id: "chats",
		title: "Ongelezen chats",
		blurb: "Kanalen en privéberichten met iets nieuws.",
		icon: MessagesSquare,
		defaultSize: 1,
		defaultTone: "paper",
		tones: LIGHT,
		to: "/chats",
		render: () => <ChatsCard />,
	},
};

/* ─── Setup ─────────────────────────────────────────────────────────────── */


export function useSetupTasks(): Task[] {
	const stores = useWorkspace((s) => s.stores);
	const members = useWorkspace((s) => s.members);
	const integrations = useWorkspace((s) => s.integrations);
	const ticked = useHome((s) => s.ticked);
	const connected = (k: string) => integrations.some((i) => i.key === k && i.status === "connected");
	const facts: Record<"store" | "inbox" | "team", boolean> = {
		store: stores.some((s) => s.status === "connected"),
		inbox: connected("gmail") || connected("outlook"),
		team: members.length > 1,
	};
	return setupTasks((id) => (id === "store" || id === "inbox" || id === "team" ? facts[id] : ticked.includes(id)));
}

function SetupWidget() {
	const tasks = useSetupTasks();
	const toggleTask = useHome((s) => s.toggleTask);
	const still = useReducedMotion();
	const done = tasks.filter((t) => t.done).length;
	const pct = done / tasks.length;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ink/8">
					<motion.span
						className="absolute inset-y-0 left-0 rounded-full bg-arc"
						initial={false}
						animate={{ width: `${pct * 100}%` }}
						transition={still ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 28 }}
					/>
				</div>
				<span className="font-medium text-sm text-ink-2 tabular-nums">
					{done} van {tasks.length}
				</span>
			</div>
			<ul className="flex flex-col">
				{tasks.map((t, i) => (
					<li key={t.id} className={cn("glyph-host flex h-9 items-center gap-2.5 rounded-md px-2", i % 2 === 0 && "bg-band")}>
						<TickBox
							done={t.done}
							disabled={t.auto}
							onToggle={() => toggleTask(t.id)}
							label={t.label}
							title={t.auto ? "Wordt automatisch afgevinkt zodra het in de werkruimte gebeurt" : undefined}
						/>
						<Glyph draw={false}
							icon={t.icon}
							size={15}
							className={cn("shrink-0", t.done ? "text-ink-4" : "text-ink-3")}
						/>
						<Link
							to={t.to}
							className={cn(
								"min-w-0 flex-1 truncate text-base transition-colors hover:text-arc-ink",
								t.done ? "text-ink-3" : "text-ink",
							)}
						>
							<Struck on={t.done}>{t.label}</Struck>
						</Link>
						{t.auto && t.done ? <span className="text-xs text-ink-3">Klaar</span> : null}
					</li>
				))}
			</ul>
		</div>
	);
}

/* ─── To-do ─────────────────────────────────────────────────────────────── */

function TodoWidget() {
	const todos = useHome((s) => s.todos);
	const addTodo = useHome((s) => s.addTodo);
	const toggleTodo = useHome((s) => s.toggleTodo);
	const removeTodo = useHome((s) => s.removeTodo);
	const restoreTodo = useHome((s) => s.restoreTodo);
	const still = useReducedMotion();
	const [draft, setDraft] = useState("");
	const open = todos.filter((t) => !t.done);
	const ordered = [...open, ...todos.filter((t) => t.done)];

	return (
		<div className="flex flex-col gap-2">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					const text = draft.trim();
					if (!text) return;
					addTodo(text);
					setDraft("");
				}}
				className="field flex h-9 items-center gap-2 rounded-lg pr-1 pl-2.5 focus-within:bg-paper hover:field-hover"
			>
				<Plus className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} />
				<input
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder="Iets toevoegen om te doen"
					aria-label="Taak toevoegen"
					className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
				/>
				{draft.trim() ? (
					<button type="submit" className="h-7 rounded-md bg-abyss px-2.5 font-medium text-sm text-mesh-ink hover:bg-abyss-2">
						Toevoegen
					</button>
				) : null}
			</form>
			<ul className="flex flex-col">
				<AnimatePresence initial={false}>
					{ordered.map((t) => (
						<motion.li
							key={t.id}
							layout={!still}
							initial={still ? false : { opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 36 }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ type: "spring", stiffness: 500, damping: 40 }}
							className="group/todo flex items-center gap-2.5 overflow-hidden rounded-md px-2 hover:bg-ink/4"
						>
							<TickBox done={t.done} round onToggle={() => toggleTodo(t.id)} label={t.text} />
							<span className={cn("min-w-0 flex-1 truncate text-base transition-colors", t.done ? "text-ink-3" : "text-ink")}>
								<Struck on={t.done}>{t.text}</Struck>
							</span>
							<button
								type="button"
								aria-label={`"${t.text}" verwijderen`}
								onClick={() => {
									const gone = removeTodo(t.id);
									if (gone) undoable("Taak verwijderd", () => restoreTodo(gone));
								}}
								className="flex size-6 cursor-pointer items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/6 hover:text-ink group-hover/todo:opacity-100 focus-visible:opacity-100"
							>
								<X className="size-3.5" strokeWidth={2} />
							</button>
						</motion.li>
					))}
				</AnimatePresence>
			</ul>
			{todos.length === 0 ? <p className="px-2 text-sm text-ink-3">Er staat niets op je lijst.</p> : null}
			{open.length === 0 && todos.length > 0 ? <p className="px-2 text-sm text-ink-3">Alles is af voor nu.</p> : null}
		</div>
	);
}

/* ─── Revenue ───────────────────────────────────────────────────────────── */

const DAY = 86_400_000;

function RevenueWidget() {
	const orders = useWorkspace((s) => s.orders);
	const range = useHome((s) => s.range);
	const currency = useHome((s) => s.currency);
	const [explaining, setExplaining] = useState(false);
	const w = useMemo(() => revenueWindow(orders, range, currency), [orders, range, currency]);
	const series = w.points;
	const change = w.change;
	const money = (n: number) => formatCurrency(n, currency);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-baseline gap-3">
				{/* The figure is a question you can ask: click it to see what it is made of. */}
				<button
					type="button"
					onClick={() => setExplaining(true)}
					title="Waar dit getal vandaan komt"
					className="-mx-1 cursor-pointer rounded-md px-1 font-medium text-2xl text-ink tabular-nums underline decoration-ink/20 decoration-dotted underline-offset-4 transition-colors hover:bg-ink/4 hover:decoration-arc"
				>
					{money(w.total)}
				</button>
				<span className="text-sm text-ink-2">laatste {range} dagen</span>
				<span
					className={cn(
						"ml-auto rounded-sm px-1.5 py-0.5 font-medium text-xs tabular-nums",
						change === null || change === 0
							? "bg-band text-ink-2"
							: change > 0
								? "bg-signal-green-bg text-signal-green"
								: "bg-signal-red-bg text-signal-red",
					)}
				>
					{change === null ? "Niets in de periode ervoor" : change === 0 ? "Gelijk aan de periode ervoor" : `${change > 0 ? "+" : ""}${change}% t.o.v. de periode ervoor`}
				</span>
			</div>
			<RevenueBreakdown open={explaining} onOpenChange={setExplaining} window={w} days={range} currency={currency} />
			<div className="h-[168px]">
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
						<defs>
							<linearGradient id="home-rev" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--arc)" stopOpacity={0.22} />
								<stop offset="100%" stopColor="var(--arc)" stopOpacity={0} />
							</linearGradient>
						</defs>
						<XAxis
							dataKey="label"
							tickLine={false}
							axisLine={false}
							interval="preserveStartEnd"
							tick={{ fill: "var(--ink-3)", fontSize: 12 }}
						/>
						<YAxis hide domain={[0, "dataMax"]} />
						<Tooltip
							cursor={{ stroke: "var(--ink-4)", strokeDasharray: "3 3" }}
							content={({ active, payload }) => {
								const p = payload?.[0]?.payload as (typeof series)[number] | undefined;
								if (!active || !p) return null;
								return (
									<div className="rounded-lg bg-abyss px-2.5 py-1.5 text-mesh-ink shadow-primary">
										<p className="text-xs text-mesh-ink-2">{range > 31 ? `Week van ${p.label}` : p.label}</p>
										<p className="font-medium text-sm tabular-nums">
											{money(p.value)} · {p.orders} {p.orders === 1 ? "bestelling" : "bestellingen"}
										</p>
									</div>
								);
							}}
						/>
						<Area
							type="monotone"
							dataKey="value"
							stroke="var(--arc)"
							strokeWidth={2}
							fill="url(#home-rev)"
							activeDot={{ r: 4, fill: "var(--arc)", stroke: "var(--paper)", strokeWidth: 2 }}
							animationDuration={700}
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}

/* ─── Orders by stage ───────────────────────────────────────────────────── */

const STAGES = [
	{ id: "placed", label: "Geplaatst", tone: "var(--ink-4)" },
	{ id: "paid", label: "Betaald", tone: "var(--sky)" },
	{ id: "at_supplier", label: "Bij leverancier", tone: "var(--signal-amber)" },
	{ id: "shipped", label: "Verzonden", tone: "var(--arc)" },
	{ id: "delivered", label: "Bezorgd", tone: "var(--signal-green)" },
] as const;

function OrdersWidget() {
	const all = useWorkspace((s) => s.orders);
	const range = useHome((s) => s.range);
	// Orders placed in the board's window, ending at the latest order the workspace has.
	const orders = useMemo(() => {
		const end = Math.max(0, ...all.map((o) => Date.parse(o.created_at))) + DAY;
		return all.filter((o) => Date.parse(o.created_at) >= end - range * DAY);
	}, [all, range]);
	const still = useReducedMotion();
	const counts = STAGES.map((st) => ({ ...st, n: orders.filter((o) => o.status === st.id).length }));
	const total = counts.reduce((s, c) => s + c.n, 0) || 1;
	const delayed = orders.filter((o) => o.tags.includes("at_risk") && o.status !== "cancelled" && o.status !== "refunded").length;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
				{counts.map((c) =>
					c.n > 0 ? (
						<motion.span
							key={c.id}
							className="h-full first:rounded-l-full last:rounded-r-full"
							style={{ background: c.tone }}
							initial={false}
							animate={{ flexGrow: c.n }}
							transition={still ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 26 }}
							title={`${c.label}: ${c.n}`}
						/>
					) : null,
				)}
			</div>
			<ul className="flex flex-col">
				{counts.map((c, i) => (
					<li key={c.id} className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-base", i % 2 === 0 && "bg-band")}>
						<span className="size-2 rounded-[3px]" style={{ background: c.tone }} />
						<span className="flex-1 text-ink-2">{c.label}</span>
						<span className="font-medium text-ink tabular-nums">{c.n}</span>
						<span className="w-10 text-right text-sm text-ink-3 tabular-nums">{Math.round((c.n / total) * 100)}%</span>
					</li>
				))}
			</ul>
			{delayed > 0 ? (
				<Link
					to="/orders"
					className="glyph-host flex items-center gap-2 rounded-md bg-signal-red-bg px-2.5 py-2 font-medium text-sm text-signal-red transition-opacity hover:opacity-85"
				>
					<Glyph draw={false} icon={AlertTriangle} size={14} />
					{delayed} {delayed === 1 ? "bestelling is" : "bestellingen zijn"} vertraagd
				</Link>
			) : null}
		</div>
	);
}

/* ─── Chargebacks ───────────────────────────────────────────────────────── */

function ChargebacksWidget() {
	const cases = useWorkspace((s) => s.chargebacks);
	const open = cases.filter((c) => c.status === "open" || c.status === "awaiting_evidence");
	const won = cases.filter((c) => c.status === "won");
	const lost = cases.filter((c) => c.status === "lost").length;
	const submitted = cases.filter((c) => c.status === "submitted").length;
	const decided = won.length + lost;
	const currency = useHome((s) => s.currency);
	const atStake = open.reduce((s, c) => s + convert(c.amount, c.currency, currency), 0);
	const nearest = [...open].sort((a, b) => Date.parse(a.deadline_at) - Date.parse(b.deadline_at))[0];
	const daysLeft = nearest ? Math.max(0, Math.ceil((Date.parse(nearest.deadline_at) - Date.now()) / DAY)) : null;

	return (
		<div className="flex flex-col gap-3">
			<div className="grid grid-cols-2 gap-1.5">
				<Stat label="Bewijs nodig" value={String(open.length)} />
				<Stat label="Op het spel" value={formatCurrency(atStake, currency)} />
				<Stat label="Gewonnen" value={decided === 0 ? "—" : `${won.length} van ${decided}`} />
				<Stat label="Ingediend" value={String(submitted)} />
			</div>
			{nearest ? (
				<Link
					to="/chargebacks/$chargebackId"
					params={{ chargebackId: nearest.id }}
					className="glyph-host flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2 transition-colors hover:bg-ink/4 hover:text-ink"
				>
					<Glyph draw={false} icon={Clock} size={14} className="text-ink-3" />
					<span className="min-w-0 flex-1 truncate">
						Eerstvolgende: <span className="font-medium text-ink">{nearest.case_number}</span>, {nearest.customer_name}
					</span>
					<span className="shrink-0 font-medium text-ink tabular-nums">{daysLeft === 0 ? "vandaag" : `${daysLeft}d`}</span>
				</Link>
			) : (
				<p className="px-2 text-sm text-ink-3">Er wacht geen zaak op bewijs.</p>
			)}
		</div>
	);
}

/* ─── Suppliers ─────────────────────────────────────────────────────────── */

function SuppliersWidget() {
	const orders = useWorkspace((s) => s.orders);
	const still = useReducedMotion();
	const rows = useMemo(() => {
		const open = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded" && o.status !== "delivered");
		const by = new Map<string, { delayed: number; open: number }>();
		for (const o of open) {
			const name = supplierName(o.id);
			const r = by.get(name) ?? { delayed: 0, open: 0 };
			r.open += 1;
			if (o.tags.includes("at_risk")) r.delayed += 1;
			by.set(name, r);
		}
		return [...by]
			.map(([name, r]) => ({ name, ...r }))
			.sort((a, b) => b.delayed - a.delayed || b.open - a.open)
			.slice(0, 5);
	}, [orders]);
	const max = Math.max(1, ...rows.map((r) => r.open));

	return (
		<ul className="flex flex-col gap-1">
			{rows.map((r) => (
				<li key={r.name} className="glyph-host flex flex-col gap-1 rounded-md px-2 py-1.5">
					<div className="flex items-center gap-2 text-base">
						<Glyph draw={false} icon={Truck} size={14} className={r.delayed > 0 ? "text-signal-red" : "text-ink-3"} />
						<span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
						{r.delayed > 0 ? (
							<span className="font-medium text-sm text-signal-red tabular-nums">{r.delayed} vertraagd</span>
						) : (
							<span className="text-sm text-ink-3">Op tijd</span>
						)}
						<span className="w-14 text-right text-sm text-ink-2 tabular-nums">{r.open} open</span>
					</div>
					<div className="flex h-1 overflow-hidden rounded-full bg-ink/6">
						<motion.span
							className="h-full bg-arc/35"
							initial={still ? false : { width: 0 }}
							animate={{ width: `${((r.open - r.delayed) / max) * 100}%` }}
							transition={{ type: "spring", stiffness: 160, damping: 26 }}
						/>
						<motion.span
							className="h-full bg-signal-red"
							initial={still ? false : { width: 0 }}
							animate={{ width: `${(r.delayed / max) * 100}%` }}
							transition={{ type: "spring", stiffness: 160, damping: 26, delay: 0.08 }}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}

/* ─── Tickets ───────────────────────────────────────────────────────────── */

const COLUMNS = [
	{ id: "intake", label: "Nieuw" },
	{ id: "in_progress", label: "Bezig" },
	{ id: "awaiting_reply", label: "Wacht op antwoord" },
	{ id: "done", label: "Klaar" },
] as const;

function TicketsWidget() {
	const tickets = useWorkspace((s) => s.tickets);
	const still = useReducedMotion();
	const counts = COLUMNS.map((c) => ({ ...c, n: tickets.filter((t) => t.status === c.id).length }));
	const max = Math.max(1, ...counts.map((c) => c.n));
	const high = tickets.filter((t) => t.priority === "high" && t.status !== "done").length;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex h-[92px] items-end gap-2">
				{counts.map((c) => (
					<Link key={c.id} to="/tickets" className="group/col flex flex-1 flex-col items-center gap-1.5">
						<span className="font-medium text-sm text-ink tabular-nums">{c.n}</span>
						<motion.span
							className={cn("w-full rounded-md transition-colors", c.id === "done" ? "bg-ink/10" : "bg-arc/80 group-hover/col:bg-arc")}
							initial={still ? false : { height: 4 }}
							animate={{ height: Math.max(4, (c.n / max) * 56) }}
							transition={{ type: "spring", stiffness: 180, damping: 24 }}
						/>
					</Link>
				))}
			</div>
			<div className="flex gap-2">
				{counts.map((c) => (
					<span key={c.id} className="flex-1 truncate text-center text-xs text-ink-3">
						{c.label}
					</span>
				))}
			</div>
			{high > 0 ? (
				<p className="glyph-host flex items-center gap-2 rounded-md bg-band px-2.5 py-2 text-sm text-ink-2">
					<Glyph draw={false} icon={AlertTriangle} size={14} className="text-signal-red" />
					{high} {high === 1 ? "ticket" : "tickets"} met hoge prioriteit nog open
				</p>
			) : null}
		</div>
	);
}

/* ─── Low stock ─────────────────────────────────────────────────────────── */

const LOW = 12;

function StockWidget() {
	const rows = useMemo(
		() =>
			products
				.flatMap((p) => p.variants.map((v) => ({ id: v.id, product: p.title, productId: p.id, variant: v.title, sku: v.sku, left: v.inventory_level })))
				.filter((v) => v.left <= LOW)
				.sort((a, b) => a.left - b.left)
				.slice(0, 5),
		[],
	);
	if (rows.length === 0) return <p className="px-2 text-sm text-ink-3">Er is niets bijna op.</p>;
	return (
		<ul className="flex flex-col">
			{rows.map((r, i) => (
				<li key={r.id}>
					<Link
						to="/products/$productId"
						params={{ productId: r.productId }}
						className={cn("glyph-host flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/6", i % 2 === 0 && "bg-band")}
					>
						<Glyph draw={false} icon={Box} size={15} className={r.left === 0 ? "text-signal-red" : "text-ink-3"} />
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-base text-ink">{r.product}</span>
							<span className="truncate text-xs text-ink-3">
								{r.variant} · {r.sku}
							</span>
						</span>
						<span
							className={cn(
								"rounded-sm px-1.5 py-0.5 font-medium text-xs tabular-nums",
								r.left === 0 ? "bg-signal-red-bg text-signal-red" : "bg-signal-amber-bg text-signal-amber",
							)}
						>
							{r.left === 0 ? "Uitverkocht" : `nog ${r.left}`}
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

/* ─── Automations ───────────────────────────────────────────────────────── */

function AutomationsWidget() {
	const active = automations.filter((a) => a.status === "active");
	const runs = automations.reduce((s, a) => s + a.runs_30d, 0);
	const top = [...automations].sort((a, b) => b.runs_30d - a.runs_30d).slice(0, 3);
	return (
		<div className="flex flex-col gap-3">
			<div className="grid grid-cols-2 gap-1.5">
				<Stat label="Actief" value={`${active.length} van ${automations.length}`} />
				<Stat label="Uitvoeringen, 30 dagen" value={runs.toLocaleString("nl-NL")} />
			</div>
			<ul className="flex flex-col">
				{top.map((a, i) => (
					<li key={a.id} className={cn("glyph-host flex h-8 items-center gap-2.5 rounded-md px-2 text-base", i % 2 === 0 && "bg-band")}>
						<Glyph draw={false} icon={Workflow} size={14} className="text-ink-3" />
						<span className="min-w-0 flex-1 truncate text-ink">{a.name}</span>
						<span className="text-sm text-ink-2 tabular-nums">{a.runs_30d.toLocaleString("nl-NL")}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5 rounded-md bg-band px-2.5 py-2">
			<span className="text-xs text-ink-3">{label}</span>
			<span className="font-medium text-lg text-ink tabular-nums">{value}</span>
		</div>
	);
}

/* ─── My tickets ────────────────────────────────────────────────────────── */

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY_LABEL = { high: "Hoog", medium: "Gemiddeld", low: "Laag" } as const;
const PRIORITY_TONE = {
	high: "bg-signal-red-bg text-signal-red",
	medium: "bg-signal-amber-bg text-signal-amber",
	low: "bg-band text-ink-2",
} as const;

function MyTicketsWidget() {
	const tickets = useWorkspace((s) => s.tickets);
	const mine = useMemo(
		() =>
			tickets
				.filter((t) => t.status !== "done" && isAssignedTo(t.assignee_ids, ME))
				.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Date.parse(b.updated_at) - Date.parse(a.updated_at)),
		[tickets],
	);
	if (mine.length === 0) return <p className="px-2 text-sm text-ink-3">Er is niets aan jou toegewezen.</p>;
	return (
		<ul className="flex flex-col">
			{mine.slice(0, 5).map((t, i) => (
				<li key={t.id}>
					<Link
						to="/tickets"
						search={{ ticket: t.id } as never}
						className={cn("flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/6", i % 2 === 0 && "bg-band")}
					>
						<span className="w-[68px] shrink-0 whitespace-nowrap text-sm text-ink-3 tabular-nums">{t.number}</span>
						<span className="min-w-0 flex-1 truncate text-base text-ink">{t.title}</span>
						<span className={cn("rounded-sm px-1.5 py-0.5 font-medium text-xs", PRIORITY_TONE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span>
					</Link>
				</li>
			))}
			{mine.length > 5 ? <li className="px-2 pt-1.5 text-sm text-ink-3">{mine.length - 5} meer op het bord</li> : null}
		</ul>
	);
}

/* ─── Team online ───────────────────────────────────────────────────────── */

const PRESENCE = {
	online: { dot: "bg-signal-green", label: "Online", rank: 0 },
	away: { dot: "bg-signal-amber", label: "Afwezig", rank: 1 },
	offline: { dot: "bg-ink-4", label: "Offline", rank: 2 },
} as const;

function TeamWidget() {
	const members = useWorkspace((s) => s.members);
	const team = useMemo(
		() =>
			members
				.filter((m) => m.id !== ME && m.status === "active")
				.map((m) => ({ ...m, presence: PRESENCE[presenceById[m.id] ?? "offline"] }))
				.sort((a, b) => a.presence.rank - b.presence.rank),
		[members],
	);
	const online = team.filter((m) => m.presence.rank === 0).length;
	return (
		<div className="flex flex-col gap-2">
			<p className="px-2 text-sm text-ink-3">
				{online} van {team.length} online
			</p>
			<ul className="flex flex-col">
				{team.slice(0, 6).map((m, i) => (
					<li key={m.id} className={cn("group/member flex h-11 items-center gap-2.5 rounded-md px-2", i % 2 === 0 && "bg-band")}>
						<span className="relative flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-xs" style={personStyle(m.id)}>
							{initials(m.name)}
							<span className={cn("absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-paper", m.presence.dot)} />
						</span>
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-base text-ink">{m.name}</span>
							<span className="truncate text-xs text-ink-3">{lastActionById[m.id] ?? m.presence.label}</span>
						</span>
						<Link
							to="/chats"
							search={{ id: `conv_dm_${m.id}` } as never}
							aria-label={`Bericht aan ${m.name}`}
							title={`Bericht aan ${m.name}`}
							className="flex size-7 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/6 hover:text-ink focus-visible:opacity-100 group-hover/member:opacity-100"
						>
							<MessagesSquare className="size-3.5" strokeWidth={1.75} />
						</Link>
					</li>
				))}
			</ul>
			{team.length > 6 ? (
				<Link to="/settings/team" className="w-fit rounded-md px-2 py-1 text-sm text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink">
					Nog {team.length - 6} in je team
				</Link>
			) : null}
		</div>
	);
}
