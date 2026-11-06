import { useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Plus, Search } from "../../icons";
import { motion, useReducedMotion } from "motion/react";
import { panelForPath } from "../lib/app-shell-config";
import { WorkspaceName } from "../team/workspace-name";
import type { SubPanelItem } from "../lib/types/sub-panel";
import { cn } from "../lib/utils";
import { isDrawn, isNeedsYou, useWorkspace } from "../stores/workspace-store";
import { useChatStore } from "../stores/chat-store";
import { useCreateIntent } from "../stores/create-intent";
import type { Conversation, Ticket, TicketSource } from "../lib/types/domain";
import { SourceMark } from "../tickets/source-mark";
import { BrandLogo } from "../marketplace/brand-logos";
import { MAILBOXES, mailboxStatus, PROVIDER_LABEL } from "../lib/mailboxes";
import { type ThreadState, useInbox } from "../stores/inbox-store";
import { recommendations, usesAi } from "../automations/library";
import { AutomationsPanelExtras } from "../automations/panel-extras";
import type { WorkflowState } from "../automations/node-types";
import { useWorkflows } from "../automations/workflow-store";
import { TEMPLATES } from "../lib/automation-templates";
import { useCustomers, useProducts } from "../hooks/use-operator-data";
import { deriveCustomerStatus } from "../customers/customer-status-badge";
import { conversations } from "../../data-source";
import type { Chargeback, Customer, Order } from "../lib/types/domain";
import { inSupplierView, type SupplierOrderRow, type SupplierView, useSupplierOrders } from "../hooks/use-supplier-orders";
import { isAssignedTo, ME } from "../lib/assignees";
import { inView, SOURCE, sourceOf, type TicketView } from "../lib/ticket-source";
import type { SubPanelConfig } from "../lib/types/sub-panel";
import { List, MessagesSquare, User } from "../../icons";
import { usePanel } from "../stores/panel-store";
import { Settings, Sparkle } from "../../icons";
import { heard, isPrimary, type Note, type NotifyPrefs, SOURCE_ORDER, SOURCES, stateOf } from "../lib/notifications";
import { useNotifications } from "../stores/notifications-store";
import { areaForPath, permissionName } from "../lib/permissions";
import { useCan, useCanOpen, useCurrentRole } from "../stores/access-store";
import { Folder, Lock } from "../../icons";
import { CustomizeButton } from "./customize-panel";
import { useAgentEntries } from "../stores/agent-log-store";
import { useCourses } from "../stores/courses-store";
import { useSheets } from "../stores/sheets-store";
import type { Folder as SheetFolder, Sheet } from "../lib/sheets";
import type { Course, CourseQuestion } from "../lib/courses";
import { useReturns } from "../stores/returns-store";
import type { ReturnRecord } from "../lib/returns";
import { CHANNEL_LABEL, CHAT_CHANNELS } from "../lib/channels";
import { ChannelMark } from "../inbox/channel-parts";
import { isForwardView, type QueueRow, useQueueRows } from "../orders/forwarding";
import { type ForwardView, inView as forwardInView } from "../lib/forwarding";
import { type AgentLogEntry, canUndo } from "../lib/agent-log";
import { ReportSection, ShortcutsSection } from "./panel-shortcuts";

/**
 * The area panel: 224px of `mist`, adjacent to the rail, carrying where you are.
 *
 * It was a floating white tile with a hairline ring on a `glacier` gap. Now it is the same field as
 * the rail beside it and the top bar above it, and the boundary is where that field stops — which is
 * the one idea this whole system is built on, so the furniture is where it has to be true first.
 *
 * The organisation's name heads it, because a panel that says "Dashboard" above a rail tile that
 * already says Dashboard is saying nothing. Below it the area filter, then the groups.
 */
export function SubPanel() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const search = useRouterState({ select: (s) => s.location.search }) as Record<
		string,
		unknown
	>;
	const navigate = useNavigate();

	const sections = usePanel((s) => s.sections);
	const hidden = usePanel((s) => s.hidden);
	// Pins, the report and the day ruler are the brand's own work; a supplier or affiliate sees only
	// the navigation for their part, and nothing to customise.
	const partner = pathname.startsWith("/supplier") || pathname.startsWith("/affiliate");
	const shown = partner ? sections.filter((s) => s === "navigation") : sections.filter((s) => !hidden.includes(s));

	const created = useChatStore((s) => s.created);
	const pinnedChats = useChatStore((s) => s.pinned);
	const tickets = useWorkspace((s) => s.tickets);
	const integrations = useWorkspace((s) => s.integrations);
	const threads = useInbox((s) => s.threads);
	const workflows = useWorkflows();
	const supplierRows = useSupplierOrders();
	const orders = useWorkspace((s) => s.orders);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const notes = useNotifications((s) => s.notes);
	const notePrefs = useNotifications((s) => s.prefs);
	const { data: products } = useProducts();
	const { data: customers } = useCustomers();
	const recommendedCount = useMemo(
		() => recommendations({ orders, products, customers, chargebacks, tickets }, workflows).length,
		[orders, products, customers, chargebacks, tickets, workflows],
	);

	const agentEntries = useAgentEntries();
	const returnRecords = useReturns((s) => s.records);
	const courses = useCourses((s) => s.courses);
	const questions = useCourses((s) => s.questions);
	const sheetList = useSheets((s) => s.sheets);
	const sheetFolders = useSheets((s) => s.folders);
	const queueRows = useQueueRows(Math.floor(Date.now() / 60_000) * 60_000);
	const can = useCan();
	const role = useCurrentRole();
	const base = panelForPath(pathname);
	if (!base) return null;
	// Making something new in an area needs Bewerken there; without it the button says what is missing.
	const ctaNeed = base.cta?.to ? areaForPath(base.cta.to) : null;
	const ctaBlocked = ctaNeed && !can(ctaNeed.area, 2) ? `Je rol ${role.label} mist ${permissionName(ctaNeed.area, 2)}` : null;
	const cfg =
		base.title === "Meldingen"
			? withNotifications(base, pathname, notes, notePrefs)
			: base.title === "Chats"
			? withChats(base, created, pinnedChats)
			: pathname.startsWith("/orders") || pathname.startsWith("/customers") || pathname.startsWith("/chargebacks")
				? withCounts(base, orders, customers, chargebacks, queueRows)
			: base.title === "Tickets"
				? withTickets(base, tickets, integrations)
				: base.title === "Inbox"
					? withInbox(base, threads, integrations)
					: pathname.startsWith("/supplier/orders")
						? withSupplierOrders(base, supplierRows)
						: base.title === "Automatiseringen"
						? withAutomations(base, workflows, recommendedCount)
						: base.title === "Vraag Insyte"
						? withAgentLog(base, agentEntries)
						: base.title === "Retouren"
						? withReturns(base, returnRecords)
						: base.title === "Cursussen"
						? withCourses(base, courses, questions)
						: base.title === "Rekenbladen"
						? withSheets(base, sheetList, sheetFolders)
						: base;

	return (
		<aside className="flex w-56 shrink-0 flex-col overflow-hidden bg-mist px-2 py-2.5">
			<header className="flex h-7 shrink-0 items-center px-2">
				<span className="truncate font-medium text-base text-ink leading-none">
					<WorkspaceName />
				</span>
			</header>

			<AreaFilter area={cfg.title} />

			{cfg.cta ? (
				<div className="pt-1 pb-2">
					<motion.button
						type="button"
						onClick={() => {
							const cta = cfg.cta;
							if (!cta) return;
							if (cta.onClick) return cta.onClick();
							if (cta.create) useCreateIntent.getState().request(cta.create);
							if (cta.to) navigate({ to: cta.to } as never);
						}}
						whileTap={ctaBlocked ? undefined : { scale: 0.98 }}
						transition={{ type: "spring", stiffness: 600, damping: 30 }}
						disabled={ctaBlocked !== null}
						title={ctaBlocked ?? undefined}
						className="flex h-[30px] w-full items-center justify-center gap-1.5 rounded-md bg-abyss font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-45"
					>
						{ctaBlocked ? <Lock className="size-3.5" strokeWidth={2} /> : <Plus className="size-3.5" strokeWidth={2} />}
						{cfg.cta.label}
					</motion.button>
				</div>
			) : null}

			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2">
				{shown.map((id) =>
					id === "navigation" ? (
						cfg.sections.map((section, si) => (
							<div key={section.label ?? si} className="flex flex-col">
								{section.label ? (
									<div className="px-2 pt-3 pb-1 font-medium text-ink-3 text-xs">
										{section.label}
									</div>
								) : null}
								{section.items.map((item) => (
									<SubPanelLink
										key={`${item.to}-${item.label}`}
										item={item}
										currentPath={pathname}
										currentSearch={search}
										onNavigate={(to, params) =>
											navigate({ to, search: params ?? {} } as never)
										}
									/>
								))}
								{cfg.title === "Automatiseringen" && si === cfg.sections.length - 1 ? <AutomationsPanelExtras /> : null}
							</div>
						))
					) : id === "report" ? (
						<ReportSection key="report" />
					) : (
						<ShortcutsSection key="shortcuts" reportShown={shown.includes("report")} />
					),
				)}
			</div>

			{/* Customize, where ClickUp keeps it: the foot of the panel, clear of the persona switcher
			    that floats over the bottom-left corner in this demo. */}
			<div className="shrink-0 pt-2 pb-9">{partner ? null : <CustomizeButton />}</div>
		</aside>
	);
}

/**
 * The area's own filter, which is also what names the area. A filled well, the same 30px well the
 * top bar's search is, because they do the same kind of thing at two scales.
 */
function AreaFilter({ area }: { area: string }) {
	return (
		<label className="field mt-1 mb-1.5 flex h-[30px] items-center gap-2 rounded-md px-2.5 transition-colors hover:field-hover">
			<Search className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
			<input
				type="search"
				placeholder={`Zoek in ${area.toLowerCase()}`}
				aria-label={`Zoek in ${area.toLowerCase()}`}
				className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
			/>
		</label>
	);
}

/**
 * One row. Active is the `arc-tint` wash with `arc` ink — the brand carrying an interactive state and
 * decorating nothing, which is the one job `arc` has. Not a left border and not a ring; the count
 * sits at the end in tabular figures on the sans, where a mono one used to.
 *
 * The wash is one element with a `layoutId`, the same device the rail uses for its active tile, so
 * moving between segments reads as the marker sliding down the list rather than one row lighting up
 * as another goes dark. Two scales of the same chrome, one idea of where you are.
 */
function SubPanelLink({
	item,
	currentPath,
	currentSearch,
	onNavigate,
}: {
	item: SubPanelItem;
	currentPath: string;
	currentSearch: Record<string, unknown>;
	onNavigate: (to: string, search?: Record<string, string>) => void;
}) {
	const Icon = item.icon;
	const onSamePath = item.exact
		? currentPath === item.to
		: currentPath === item.to || currentPath.startsWith(`${item.to}/`);
	const searchMatches = item.search
		? Object.entries(item.search).every(
				([k, v]) => String(currentSearch[k] ?? "") === v,
			)
		: !item.search && Object.keys(currentSearch).length === 0;
	const active = onSamePath && searchMatches;

	const still = useReducedMotion();
	const live = useWorkspace((s) =>
		item.liveCount === "needs-you"
			? s.queue.filter(isNeedsYou).length
			: item.liveCount === "drawn"
				? s.queue.filter(isDrawn).length
				: undefined,
	);
	const count = live ?? item.count;
	const canOpen = useCanOpen();
	const role = useCurrentRole();
	const need = areaForPath(item.to);
	const locked = need !== null && !canOpen(item.to) ? `Je rol ${role.label} mist ${permissionName(need.area, need.level)}` : null;

	return (
		<button
			type="button"
			onClick={() => onNavigate(item.to, item.search)}
			aria-current={active ? "page" : undefined}
			title={locked ?? undefined}
			className={cn(
				"density-row relative flex h-7 items-center gap-2.5 rounded-md px-2 text-left text-base transition-colors",
				active
					? "font-medium text-arc-ink"
					: locked
						? "text-ink-3 hover:bg-ink/4"
						: "text-ink-2 hover:bg-ink/6 hover:text-ink",
			)}
		>
			{active ? (
				<motion.span
					layoutId="panel-active"
					className="absolute inset-0 rounded-md bg-arc-tint"
					transition={
						still
							? { duration: 0 }
							: { type: "spring", stiffness: 520, damping: 38, mass: 0.6 }
					}
					aria-hidden
				/>
			) : null}
			{item.mark ? (
				<span className="relative flex shrink-0">{item.mark}</span>
			) : (
				<Icon
					className={cn(
						"relative size-[13px] shrink-0",
						active ? "text-arc-ink" : "text-ink-3",
					)}
					strokeWidth={1.75}
				/>
			)}
			<span className="relative min-w-0 flex-1 truncate">{item.label}</span>
			{locked ? (
				<Lock className="relative size-3 shrink-0 text-ink-3" strokeWidth={2} aria-label="Geen toegang" />
			) : count !== undefined ? (
				<span
					className={cn(
						"relative shrink-0 tabular-nums",
						active ? "text-arc-ink" : "text-ink-3",
					)}
				>
					{count}
				</span>
			) : null}
		</button>
	);
}

/**
 * Chats' panel is partly the operator's: channels and DMs started here join the seeded ones, and a
 * pinned conversation moves to the top of its group.
 */
function withChats(cfg: SubPanelConfig, created: ReadonlyArray<Conversation>, pinned: ReadonlyArray<string>): SubPanelConfig {
	const item = (c: Conversation) => ({
		to: "/chats",
		label: c.type === "group" ? `# ${c.name}` : c.name,
		icon: c.type === "group" ? MessagesSquare : User,
		search: { id: c.id },
	});
	const first = (items: SubPanelConfig["sections"][number]["items"]) =>
		[...items].sort((a, b) => Number(pinned.includes(String(b.search?.id))) - Number(pinned.includes(String(a.search?.id))));
	return {
		...cfg,
		sections: cfg.sections.map((section) => {
			const kind = section.label === "Kanalen" ? "group" : "dm";
			const extra = created.filter((c) => c.type === kind).map(item);
			const seeded = section.items.filter((i) => conversations.some((c) => c.id === i.search?.id));
			const own = conversations.filter((c) => c.type === kind && !section.items.some((i) => i.search?.id === c.id)).map(item);
			return { ...section, items: first([...extra, ...own, ...seeded]) };
		}),
	};
}

/**
 * Tickets' panel, counted live: each view's number is the tickets in it, and Sources lists where
 * tickets come from — every connected service that sends them, plus chat, Insyte's automations and
 * hand-made tickets when there are any — each with its logo and its open count.
 */
function withTickets(
	cfg: SubPanelConfig,
	tickets: ReadonlyArray<Ticket>,
	integrations: ReadonlyArray<{ key: string; status: string }>,
): SubPanelConfig {
	const mine = (t: Ticket) => isAssignedTo(t.assignee_ids, ME);
	const count = (view: TicketView) => tickets.filter((t) => inView(t, view, mine)).length;
	const views = cfg.sections.map((section) => ({
		...section,
		items: section.items.map((item) => {
			const view = (item.search?.view ?? "open") as TicketView;
			const n = count(view);
			return { ...item, count: n === 0 ? undefined : n };
		}),
	}));
	const connected = new Set(integrations.filter((i) => i.status === "connected").map((i) => i.key));
	const live = tickets.filter((t) => inView(t, "open", mine) && t.status !== "done");
	const sources = (Object.keys(SOURCE) as TicketSource[]).filter(
		(k) => live.some((t) => sourceOf(t) === k) || (SOURCE[k].brand !== undefined && connected.has(k)),
	);
	return {
		...cfg,
		sections: [
			...views,
			{
				label: "Bronnen",
				items: sources.map((k) => {
					const n = live.filter((t) => sourceOf(t) === k).length;
					return {
						to: "/tickets",
						label: SOURCE[k].label,
						icon: List,
						mark: <SourceMark source={k} size={14} />,
						search: { source: k },
						count: n === 0 ? undefined : n,
					};
				}),
			},
		],
	};
}

/**
 * Inbox's panel, counted from the threads themselves, and a Mailboxes section: every connected
 * account with its provider's logo and its open threads, a disconnected one marked as such, and the
 * way to connect another.
 */
function withInbox(
	cfg: SubPanelConfig,
	threads: ReadonlyArray<ThreadState>,
	integrations: ReadonlyArray<{ key: string; status: string; syncedAt?: string }>,
): SubPanelConfig {
	const open = threads.filter((t) => !t.archived && !t.spam);
	const counts: Record<string, number> = {
		all: open.length,
		unassigned: open.filter((t) => !t.assignee).length,
		mine: open.filter((t) => t.assignee === ME).length,
		linked: open.filter((t) => !!t.ticket_id).length,
		archive: threads.filter((t) => t.archived).length,
		handed_over: open.filter((t) => t.agent?.state === "handed_over").length,
		insyte: open.filter((t) => t.agent?.state === "handled").length,
	};
	const sections = cfg.sections.map((section) => ({
		...section,
		items: section.items.map((item) => {
			const n = counts[((item.search?.folder ?? item.search?.view) as string | undefined) ?? "all"];
			return { ...item, count: n ? n : undefined };
		}),
	}));
	return {
		...cfg,
		sections: [
			sections[0],
			{
				label: "Kanalen",
				items: [
					...MAILBOXES.map((m) => {
						const status = mailboxStatus(m, integrations);
						const n = open.filter((t) => !t.channel && t.mailbox === m.id).length;
						return {
							to: "/inbox",
							label: status.live ? m.label : `${m.label} · offline`,
							icon: List,
							mark: <BrandLogo brand={m.provider} name={PROVIDER_LABEL[m.provider]} size={14} />,
							search: { mailbox: m.id },
							count: n === 0 ? undefined : n,
						};
					}),
					// The chat channels (PLAN 27): only the ones that are connected or need attention.
					...CHAT_CHANNELS.flatMap((c) => {
						const it = integrations.find((i) => i.key === c);
						if (!it || it.status === "disconnected") return [];
						const n = open.filter((t) => t.channel === c).length;
						return [
							{
								to: "/inbox",
								label: it.status === "connected" ? CHANNEL_LABEL[c] : `${CHANNEL_LABEL[c]} · offline`,
								icon: List,
								mark: <ChannelMark channel={c} size={14} />,
								search: { channel: c },
								count: n === 0 ? undefined : n,
							},
						];
					}),
					{ to: "/settings/integrations", label: "Kanaal koppelen", icon: Plus },
				],
			},
			...sections.slice(1),
		].filter((x): x is NonNullable<typeof x> => x !== undefined),
	};
}

/** Automations' panel, counted from the workflows: every flow, the drafts, the runs, the library. */
function withAutomations(cfg: SubPanelConfig, workflows: Record<string, WorkflowState>, recommended: number): SubPanelConfig {
	const flows = Object.values(workflows);
	const counts: Record<string, number> = {
		all: flows.length,
		drafts: flows.filter((w) => w.status === "draft").length,
		ai: flows.filter(usesAi).length,
		history: flows.reduce((n, w) => n + w.history.length, 0),
		templates: TEMPLATES.length,
		recommended,
	};
	return {
		...cfg,
		sections: cfg.sections.map((section) => ({
			...section,
			items: section.items.map((item) => {
				const n = counts[(item.search?.view as string | undefined) ?? "all"];
				return { ...item, count: n ? n : undefined };
			}),
		})),
	};
}

/** Retouren's panel, each view counted from the queue the list shows. */
const RETURN_VIEW: Record<string, (r: ReturnRecord) => boolean> = {
	review: (r) => r.status === "review",
	awaiting: (r) => r.status === "awaiting_parcel" || r.status === "in_transit",
	received: (r) => r.status === "received",
	ready: (r) => r.status === "ready",
	resolved: (r) => r.status === "resolved",
	rejected: (r) => r.status === "rejected",
	returns: (r) => r.kind === "return",
	claims: (r) => r.kind === "claim",
};
function withSheets(cfg: SubPanelConfig, sheets: ReadonlyArray<Sheet>, folders: ReadonlyArray<SheetFolder>): SubPanelConfig {
	const live = sheets.filter((s) => !s.archived);
	const n: Record<string, number> = {
		pinned: live.filter((s) => s.pinned).length,
		shared: live.filter((s) => s.ownerId !== ME && s.shared.includes(ME)).length,
		archive: sheets.filter((s) => s.archived).length,
	};
	return {
		...cfg,
		sections: cfg.sections.map((section) =>
			section.label === "Mappen"
				? { ...section, items: folders.map((f) => ({ to: "/sheets", label: f.name, icon: Folder, search: { folder: f.id }, count: live.filter((s) => s.folderId === f.id).length || undefined })) }
				: {
						...section,
						items: section.items.map((item) => {
							const v = item.search?.view as string | undefined;
							const count = v ? n[v] : item.exact && item.to === "/sheets" ? live.length : undefined;
							return { ...item, count: count ? count : undefined };
						}),
					},
		),
	};
}

function withCourses(cfg: SubPanelConfig, courses: ReadonlyArray<Course>, questions: ReadonlyArray<CourseQuestion>): SubPanelConfig {
	const n: Record<string, number> = {
		drafts: courses.filter((c) => c.status === "draft").length,
		archived: courses.filter((c) => c.status === "archived").length,
		questions: questions.filter((q) => !q.answer).length,
	};
	return {
		...cfg,
		sections: cfg.sections.map((section) => ({
			...section,
			items: section.items.map((item) => {
				const v = item.search?.view as string | undefined;
				const count = v ? n[v] : item.exact ? courses.filter((c) => c.status !== "archived").length : undefined;
				return { ...item, count: count ? count : undefined };
			}),
		})),
	};
}

function withReturns(cfg: SubPanelConfig, records: ReadonlyArray<ReturnRecord>): SubPanelConfig {
	return {
		...cfg,
		sections: cfg.sections.map((section) => ({
			...section,
			items: section.items.map((item) => {
				const v = item.search?.view as string | undefined;
				const n = v && RETURN_VIEW[v] ? records.filter(RETURN_VIEW[v]).length : item.exact && item.to === "/returns" ? records.length : undefined;
				return { ...item, count: n ? n : undefined };
			}),
		})),
	};
}

/** Vraag Insyte's panel, counted from the agent log: what can still be taken back, what was undone or failed. */
function withAgentLog(cfg: SubPanelConfig, entries: ReadonlyArray<AgentLogEntry>): SubPanelConfig {
	const now = Date.now();
	const counts: Record<string, number> = {
		undoable: entries.filter((e) => canUndo(e, now)).length,
		auto: entries.filter((e) => e.level === "auto").length,
		undone: entries.filter((e) => e.status === "undone").length,
		failed: entries.filter((e) => e.status === "failed").length,
	};
	return {
		...cfg,
		sections: cfg.sections.map((section) => ({
			...section,
			items: section.items.map((item) => {
				const v = item.search?.view as string | undefined;
				const n = v ? counts[v] : item.to === "/ask/activity" ? entries.length : undefined;
				return { ...item, count: n ? n : undefined };
			}),
		})),
	};
}

/** The supplier's order panel, each cut counted from its own lines. */
function withSupplierOrders(cfg: SubPanelConfig, rows: ReadonlyArray<SupplierOrderRow>): SubPanelConfig {
	return {
		...cfg,
		sections: cfg.sections.map((section) => ({
			...section,
			items: section.items.map((item) => {
				const view = ((item.search?.view as string | undefined) ?? "to_ship") as SupplierView;
				const n = rows.filter((r) => inSupplierView(r, view)).length;
				return { ...item, count: n ? n : undefined };
			}),
		})),
	};
}

/** The orders, customers and chargebacks panels, counted from the rows their lists show. */
const ORDER_CUT: Record<string, (o: Order) => boolean> = {
	open: (o) => ["placed", "paid", "at_supplier"].includes(o.status),
	processing: (o) => o.status === "at_supplier" || o.tags.includes("at_risk"),
	shipped: (o) => o.status === "shipped" && !o.tags.includes("at_risk"),
	returned: (o) => o.status === "refunded",
	cancelled: (o) => o.status === "cancelled",
};
const SEGMENT: Record<string, (c: Customer) => boolean> = {
	new: (c) => deriveCustomerStatus(c) === "new",
	vip: (c) => deriveCustomerStatus(c) === "loyal",
	at_risk: (c) => deriveCustomerStatus(c) === "at_risk",
};
const TAB: Record<string, (c: Chargeback) => boolean> = {
	action_required: (c) => c.status === "open" || c.status === "awaiting_evidence",
	submitted: (c) => c.status === "submitted",
	won: (c) => c.status === "won",
	lost: (c) => c.status === "lost",
};

function withCounts(cfg: SubPanelConfig, orders: ReadonlyArray<Order>, customers: ReadonlyArray<Customer>, chargebacks: ReadonlyArray<Chargeback>, legs: ReadonlyArray<QueueRow>): SubPanelConfig {
	const count = (item: SubPanelItem): SubPanelItem["count"] => {
		const q = item.search ?? {};
		const n =
			isForwardView(q.view)
				? legs.filter((l) => forwardInView(l.effective, q.view as ForwardView)).length
				: typeof q.status === "string" && ORDER_CUT[q.status]
				? orders.filter(ORDER_CUT[q.status]).length
				: typeof q.segment === "string" && SEGMENT[q.segment]
					? customers.filter(SEGMENT[q.segment]).length
					: typeof q.tab === "string" && TAB[q.tab]
						? chargebacks.filter(TAB[q.tab]).length
						: undefined;
		return n === undefined ? item.count : n || undefined;
	};
	return { ...cfg, sections: cfg.sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, count: count(item) })) })) };
}

/**
 * The notifications panel, counted from the same store the page and the dropdown read: unread in
 * Primair and Overig, everything waiting in Later, and Bronnen — every source the persona has
 * notifications from, with its glyph and its unread count. The rows point at the persona's own page,
 * and the foot goes to its own settings.
 */
function withNotifications(cfg: SubPanelConfig, pathname: string, notes: ReadonlyArray<Note>, prefs: NotifyPrefs): SubPanelConfig {
	const persona = pathname.startsWith("/supplier") ? "supplier" : pathname.startsWith("/affiliate") ? "affiliate" : "admin";
	const base = persona === "admin" ? "/notifications" : `/${persona}/notifications`;
	const settings = persona === "admin" ? "/settings/notifications" : persona === "supplier" ? "/supplier/settings/notifications" : "/affiliate/settings/profile";
	const now = Date.now();
	const mine = notes.filter((n) => n.persona === persona && heard(n, prefs));
	const inbox = mine.filter((n) => stateOf(n, now) === "inbox");
	const counts: Record<string, number> = {
		primary: inbox.filter((n) => isPrimary(n) && !n.read).length,
		other: inbox.filter((n) => !isPrimary(n) && !n.read).length,
		later: mine.filter((n) => stateOf(n, now) === "later").length,
		cleared: 0,
	};
	const views = cfg.sections.map((section) => ({
		...section,
		items: section.items.map((item) => {
			const n = counts[(item.search?.view as string | undefined) ?? "primary"] ?? 0;
			return { ...item, to: base, count: n === 0 ? undefined : n };
		}),
	}));
	const sources = SOURCE_ORDER.filter((k) => mine.some((n) => n.source === k));
	return {
		...cfg,
		sections: [
			...views,
			...(sources.length > 0
				? [
						{
							label: "Bronnen",
							items: sources.map((k) => {
								const n = inbox.filter((x) => x.source === k && !x.read).length;
								return {
									to: base,
									label: SOURCES[k].label,
									icon: SOURCES[k].icon,
									mark:
										k === "insyte" ? (
											<span className="flex size-[14px] items-center justify-center rounded-[4px] bg-abyss text-mesh-ink">
												<Sparkle className="size-[9px]" strokeWidth={2} />
											</span>
										) : undefined,
									search: { source: k },
									count: n === 0 ? undefined : n,
								};
							}),
						},
					]
				: []),
			{ items: [{ to: settings, label: "Meldingsinstellingen", icon: Settings }] },
		],
	};
}
