import { ArrowRight, BellRing, Check, type IconComponent, Mail, ShieldCheck, Store, Truck, UserPlus, Workflow } from "../../icons";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Glyph } from "../common/glyph";
import { cn } from "../lib/utils";
import { Steps } from "./setup-steps";

/*
 * Start's setup checklist: the tasks, the plate that says how far setup is, and the list to tick. Out of `widgets.tsx`
 * and `first-run.tsx` so a host without the reference's stores and data source can mount them (the console, from the
 * server's `Onboarding.start`). The reference's home builds the same tasks from its stores; both render the same.
 */

export type SetupTaskId = "store" | "inbox" | "team" | "supplier" | "automation" | "security" | "alerts";

export type Task = {
	id: SetupTaskId;
	label: string;
	to: string;
	done: boolean;
	auto: boolean;
	icon: IconComponent;
};

/* The first three are facts the workspace already knows; the rest are the onboarding checklist's
   "do it later" items, which only the operator can say they have done. */
export function setupTasks(done: (id: SetupTaskId) => boolean): Task[] {
	return [
		{ id: "store", label: "Een Shopify-winkel koppelen", to: "/settings/stores", done: done("store"), auto: true, icon: Store },
		{ id: "inbox", label: "Je support-inbox koppelen", to: "/settings/integrations", done: done("inbox"), auto: true, icon: Mail },
		{ id: "team", label: "Een collega uitnodigen", to: "/settings/team", done: done("team"), auto: true, icon: UserPlus },
		{ id: "supplier", label: "Een leverancier koppelen", to: "/settings/integrations", done: done("supplier"), auto: false, icon: Truck },
		{ id: "automation", label: "Een startautomatisering aanzetten", to: "/automations", done: done("automation"), auto: false, icon: Workflow },
		{ id: "security", label: "2FA voor iedereen inschakelen", to: "/settings/security", done: done("security"), auto: false, icon: ShieldCheck },
		{ id: "alerts", label: "Drempels voor meldingen kiezen", to: "/settings/profile#alerts", done: done("alerts"), auto: false, icon: BellRing },
	];
}

/**
 * How far setup is and the one next step. `canOpen` says which tasks the host has a screen for (all, in the
 * reference); without one, the task is named but not linked. `actions` follow the next step's button.
 */
export function SetupPlate({
	tasks,
	workspace,
	canOpen = () => true,
	actions,
}: {
	tasks: Task[];
	workspace: string;
	canOpen?: (task: Task) => boolean;
	actions?: ReactNode;
}) {
	const done = tasks.filter((t) => t.done).length;
	const left = tasks.length - done;
	const next = tasks.find((t) => !t.done);
	return (
		<section aria-labelledby="setup-title" className="plate overflow-hidden rounded-2xl">
			<div
				aria-hidden
				className="hatch-on-plate pointer-events-none absolute inset-y-0 right-0 w-3/5 [mask-image:linear-gradient(90deg,transparent,black_60%)]"
			/>
			<div className="relative grid gap-6 p-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<p className="text-mesh-ink-2 text-sm tabular-nums">
							Inrichten, {done} van {tasks.length}
						</p>
						<h2 id="setup-title" className="max-w-[26ch] text-balance font-medium text-2xl text-mesh-ink">
							{left === 0 ? `Insyte draait voor ${workspace}` : `Nog ${left} ${left === 1 ? "stap" : "stappen"}, dan draait Insyte voor ${workspace}`}
						</h2>
						<p className="max-w-[48ch] text-base text-mesh-ink-2">
							{next ? `Hierna: ${next.label.toLowerCase()}.` : "Alles staat."}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{next && canOpen(next) ? (
							<Link
								to={next.to}
								className="flex h-9 items-center gap-1.5 rounded-md bg-paper px-3.5 font-medium text-abyss text-sm transition-colors hover:bg-paper/90"
							>
								Verder met inrichten
								<ArrowRight className="size-3.5" strokeWidth={2} />
							</Link>
						) : null}
						{actions}
					</div>
				</div>
				<Steps done={done} total={tasks.length} />
			</div>
		</section>
	);
}

/** The tasks to tick, the next one first to act on. `canOpen` as on the plate. */
export function SetupChecklist({
	tasks,
	onToggle,
	canOpen = () => true,
}: {
	tasks: Task[];
	onToggle: (id: SetupTaskId) => void;
	canOpen?: (task: Task) => boolean;
}) {
	const next = tasks.find((t) => !t.done);
	return (
		<section aria-labelledby="checklist-title" className="flex flex-col gap-4 rounded-xl bg-paper p-5">
			<h2 id="checklist-title" className="font-medium text-xl text-ink">
				Je werkruimte inrichten
			</h2>
			<ol className="flex flex-col">
				{tasks.map((t, i) => (
					<li key={t.id} className={cn("glyph-host flex min-h-12 items-center gap-3 rounded-md px-2.5", i % 2 === 0 && "bg-mist")}>
						<TickBox
							done={t.done}
							disabled={t.auto}
							onToggle={() => onToggle(t.id)}
							label={t.label}
							title={t.auto ? "Wordt automatisch afgevinkt zodra het in de werkruimte gebeurt" : undefined}
						/>
						<Glyph icon={t.icon} size={15} draw={false} className={t.done ? "text-ink-4" : "text-ink-2"} />
						<span className={cn("min-w-0 flex-1 text-base", t.done ? "text-ink-3" : "text-ink")}>
							<Struck on={t.done}>{t.label}</Struck>
						</span>
						{t.done ? (
							<span className="text-sm text-ink-3">Klaar</span>
						) : canOpen(t) ? (
							<Link
								to={t.to}
								className={cn(
									"flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 font-medium text-sm transition-colors",
									t.id === next?.id ? "bg-abyss text-mesh-ink shadow-primary hover:bg-abyss-2" : "text-arc-ink hover:bg-arc-tint",
								)}
							>
								{t.id === next?.id ? "Nu doen" : "Openen"}
								<ArrowRight className="size-3.5" strokeWidth={2} />
							</Link>
						) : null}
					</li>
				))}
			</ol>
		</section>
	);
}

/**
 * The tick. Ticking draws the check in — the same pen stroke every glyph arrives with — on an arc
 * field that pops once; unticking just clears it. Square for a checklist item, round for a to-do.
 */
export function TickBox({
	done,
	onToggle,
	label,
	round = false,
	disabled = false,
	title,
}: {
	done: boolean;
	onToggle: () => void;
	label: string;
	round?: boolean;
	disabled?: boolean;
	title?: string;
}) {
	const still = useReducedMotion();
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onToggle}
			aria-pressed={done}
			aria-label={done ? `"${label}" markeren als niet klaar` : `"${label}" markeren als klaar`}
			title={title}
			className={cn(
				"relative flex size-4 shrink-0 cursor-pointer items-center justify-center transition-colors disabled:cursor-default",
				round ? "rounded-full" : "rounded-[5px]",
				done ? "bg-arc text-mesh-ink" : "bg-paper ring-1 ring-ink/25 hover:ring-arc",
			)}
		>
			<AnimatePresence initial={false}>
				{done ? (
					<motion.span
						key="tick"
						className="flex"
						initial={still ? false : { scale: 0.6 }}
						animate={{ scale: 1 }}
						exit={{ opacity: 0, transition: { duration: 0.1 } }}
						transition={{ type: "spring", stiffness: 640, damping: 22 }}
					>
						<Glyph icon={Check} size={round ? 10 : 12} />
					</motion.span>
				) : null}
			</AnimatePresence>
		</button>
	);
}

/** A strike-through that is drawn across the words, left to right, rather than switched on. */
export function Struck({ on, children }: { on: boolean; children: ReactNode }) {
	const still = useReducedMotion();
	return (
		<span className="relative">
			{children}
			<motion.span
				aria-hidden
				className="pointer-events-none absolute top-1/2 left-0 h-px w-full origin-left bg-ink-3"
				initial={false}
				animate={{ scaleX: on ? 1 : 0 }}
				transition={still ? { duration: 0 } : { duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
			/>
		</span>
	);
}
