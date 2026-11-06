import { AnimatePresence, motion, type TargetAndTransition, type Transition, useReducedMotion } from "motion/react";
import { Bell, Check, Key, Lock, Package, Sparkle, Undo2 } from "../../icons";
import { cn } from "../lib/utils";

/*
 * The pictures in a page's uitleg. A step used to point at the page and ring the section it meant;
 * now it shows a small drawing of it instead: the screen in skeleton, doing the one thing the step
 * is about, on a loop. They share one grammar so a dozen pages read as one set: a mesh stage, a
 * paper window with a soft lift, ink bars for words, and Arc for the single thing that moves.
 *
 * With reduced motion every loop rests on its telling frame; nothing depends on moving to be read.
 */

export type GuideArt =
	| "rules"
	| "lock"
	| "undo"
	| "log"
	| "budget"
	| "people"
	| "chat"
	| "hours"
	| "handover"
	| "knowledge"
	| "keys"
	| "webhook"
	| "flow"
	| "notify"
	| "chart"
	| "portal"
	| "roles"
	| "link"
	| "parcel";

type Frames = Record<string, ReadonlyArray<number | string>>;

/** A keyframed loop, or its resting frame when motion is reduced. */
function useLoop() {
	const reduce = useReducedMotion() ?? false;
	return (frames: Frames, duration: number, opts: Transition & { rest?: number } = {}) => {
		const { rest, ...transition } = opts;
		if (reduce) {
			const still = Object.fromEntries(Object.entries(frames).map(([k, v]) => [k, v[rest ?? v.length - 1]]));
			return { initial: false, animate: still as TargetAndTransition };
		}
		return {
			initial: false,
			animate: frames as unknown as TargetAndTransition,
			transition: { duration, repeat: Infinity, ease: "easeInOut", ...transition } as Transition,
		};
	};
}

const LIFT = "shadow-[0_1px_2px_rgb(0_0_0/0.05),0_10px_24px_-12px_rgb(0_0_0/0.22)]";

function Win({ className, children }: { className?: string; children: React.ReactNode }) {
	return <div className={cn("rounded-lg bg-paper", LIFT, className)}>{children}</div>;
}

function Bar({ w, className }: { w: number | string; className?: string }) {
	return <span className={cn("block h-1.5 shrink-0 rounded-full bg-ink/10", className)} style={{ width: w }} />;
}

function Mark({ size = 16 }: { size?: number }) {
	return (
		<span className="flex shrink-0 items-center justify-center rounded-[5px] bg-abyss text-mesh-ink" style={{ width: size, height: size }}>
			<Sparkle className="size-[58%]" strokeWidth={2} />
		</span>
	);
}

function Avatar({ tone = 0 }: { tone?: number }) {
	return <span className={cn("block size-4 shrink-0 rounded-full", ["bg-arc-tint", "bg-ink/12", "bg-arc/35"][tone % 3])} />;
}

/*
 * The stage is the brand mesh: abyss with the two atmosphere stops glowing in from the corners.
 * Nothing on it is text, which is the condition for using it at all; the sketch floats on it as a
 * paper screen the way a product shot would.
 */
const MESH =
	"radial-gradient(120% 90% at 0% 0%, color-mix(in oklch, var(--color-sky) 55%, transparent), transparent 60%), radial-gradient(90% 80% at 100% 100%, color-mix(in oklch, var(--color-arc) 80%, transparent), transparent 70%), radial-gradient(60% 60% at 85% 10%, color-mix(in oklch, var(--color-powder) 35%, transparent), transparent 70%)";

/** The stage stays put between steps; only the sketch on it changes. */
export function GuideIllustration({ art, step }: { art?: GuideArt; step: number }) {
	const reduce = useReducedMotion() ?? false;
	const A = art ? ART[art] : null;
	return (
		<div aria-hidden className="relative flex h-[188px] items-center justify-center overflow-hidden bg-abyss" style={{ backgroundImage: MESH }}>
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={step}
					initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 1.02 }}
					animate={{ opacity: 1, y: 0, scale: 1.06 }}
					exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 1.04 }}
					transition={{ duration: reduce ? 0.1 : 0.26, ease: [0.16, 1, 0.3, 1] }}
				>
					{A ? <A /> : null}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

/* ——— The drawings ——— */

/** Three actions, each with its three-way switch; the choice slides as if someone is setting it. */
function Rules() {
	const loop = useLoop();
	const paths = [
		[0, 0, 22, 22, 22, 0],
		[22, 22, 22, 0, 0, 22],
		[44, 44, 22, 22, 44, 44],
	];
	return (
		<Win className="flex w-[232px] flex-col gap-3 p-3.5">
			{paths.map((x, i) => (
				<div key={i} className="flex items-center gap-2.5">
					<Bar w={[64, 82, 54][i] ?? 60} />
					<span className="flex-1" />
					<span className="relative flex h-4 w-[66px] rounded-full bg-ink/6">
						<motion.span className="absolute top-0 left-0 h-4 w-[22px] rounded-full bg-arc" {...loop({ x }, 6, { delay: i * 0.25, rest: 0 })} />
					</span>
				</div>
			))}
		</Win>
	);
}

/** A switch that will not move: it nudges and settles back under its lock. */
function LockArt() {
	const loop = useLoop();
	return (
		<Win className="flex w-[232px] flex-col gap-3 p-3.5">
			<div className="flex items-center gap-2.5 opacity-60">
				<Bar w={70} />
				<span className="flex-1" />
				<span className="relative flex h-4 w-[66px] rounded-full bg-ink/6">
					<span className="absolute top-0 left-0 h-4 w-[22px] rounded-full bg-arc/50" />
				</span>
			</div>
			<div className="flex items-center gap-2.5">
				<Lock className="size-3 text-arc-ink" strokeWidth={2} />
				<Bar w={58} />
				<span className="flex-1" />
				<span className="relative flex h-4 w-[66px] rounded-full bg-ink/6">
					<motion.span className="absolute top-0 left-[22px] h-4 w-[22px] rounded-full bg-arc" {...loop({ x: [0, 0, -7, 4, -2, 0, 0] }, 3, { times: [0, 0.4, 0.5, 0.6, 0.68, 0.76, 1], rest: 0 })} />
				</span>
			</div>
			<div className="flex items-center gap-2.5 opacity-60">
				<Bar w={46} />
				<span className="flex-1" />
				<span className="relative flex h-4 w-[66px] rounded-full bg-ink/6">
					<span className="absolute top-0 left-[44px] h-4 w-[22px] rounded-full bg-arc/50" />
				</span>
			</div>
		</Win>
	);
}

/** A done action with its window running out; at the end it is turned back and struck through. */
function UndoArt() {
	const loop = useLoop();
	const C = 2 * Math.PI * 7;
	return (
		<Win className="flex w-[244px] flex-col gap-2.5 p-3.5">
			<div className="flex items-center gap-2.5 opacity-50">
				<Mark />
				<Bar w={110} />
			</div>
			<div className="flex items-center gap-2.5">
				<Mark />
				<span className="relative">
					<Bar w={120} className="bg-ink/18" />
					<motion.span className="absolute top-1/2 left-0 h-px w-full origin-left bg-ink/50" {...loop({ scaleX: [0, 0, 1, 1, 0] }, 4.5, { times: [0, 0.62, 0.7, 0.92, 1], rest: 2 })} />
				</span>
				<span className="flex-1" />
				<motion.span className="flex items-center gap-1 rounded-md bg-arc-tint px-1.5 py-1 text-arc-ink" {...loop({ scale: [1, 1, 0.9, 1, 1] }, 4.5, { times: [0, 0.58, 0.62, 0.66, 1] })}>
					<Undo2 className="size-3" strokeWidth={2} />
					<svg viewBox="0 0 18 18" className="size-3.5 -rotate-90">
						<circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2.5} />
						<motion.circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth={2.5} strokeDasharray={C} {...loop({ strokeDashoffset: [0, C * 0.55, C * 0.55, 0] }, 4.5, { times: [0, 0.6, 0.94, 1], ease: "linear", rest: 1 })} />
					</svg>
				</motion.span>
			</div>
			<div className="flex items-center gap-2.5 opacity-50">
				<Mark />
				<Bar w={88} />
			</div>
		</Win>
	);
}

/** A log that keeps growing: a new row eases in at the top and the rest step down. */
function Log() {
	const loop = useLoop();
	const rows = [96, 120, 78, 104, 88];
	return (
		<Win className="h-[118px] w-[244px] overflow-hidden px-3.5 pt-3">
			<div className="mb-2.5 flex gap-2">
				<Bar w={34} className="bg-ink/16" />
				<Bar w={52} className="bg-ink/16" />
			</div>
			<motion.div className="flex flex-col" {...loop({ y: [-22, 0, 0] }, 2.2, { times: [0, 0.3, 1], rest: 1 })}>
				{rows.map((w, i) => (
					<motion.div key={i} className="flex h-[22px] items-center gap-2.5" {...(i === 0 ? loop({ opacity: [0, 1, 1] }, 2.2, { times: [0, 0.3, 1] }) : {})}>
						<Bar w={22} />
						<Mark size={12} />
						<Bar w={w} className={i === 0 ? "bg-arc/40" : undefined} />
					</motion.div>
				))}
			</motion.div>
		</Win>
	);
}

/** The month's budget filling up; past the mark at 80% a bell rings. */
function Budget() {
	const loop = useLoop();
	return (
		<Win className="flex w-[244px] flex-col gap-3 p-3.5">
			<div className="flex items-center justify-between">
				<Bar w={70} className="bg-ink/16" />
				<motion.span className="flex size-5 items-center justify-center rounded-full bg-arc-tint text-arc-ink" {...loop({ scale: [0, 0, 1.15, 1, 1, 0], opacity: [0, 0, 1, 1, 1, 0] }, 4, { times: [0, 0.55, 0.62, 0.68, 0.92, 1], rest: 3 })}>
					<Bell className="size-3" strokeWidth={2} />
				</motion.span>
			</div>
			<div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink/8">
				<motion.span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-arc" {...loop({ scaleX: [0.05, 0.86, 0.86, 0.05] }, 4, { times: [0, 0.6, 0.92, 1], rest: 1 })} />
				<span className="absolute inset-y-0 left-[80%] w-px bg-paper" />
			</div>
			<div className="flex gap-2">
				<Bar w={40} />
				<Bar w={28} />
			</div>
		</Win>
	);
}

/** Three people, each with their own meter, filling at their own pace. */
function People() {
	const loop = useLoop();
	return (
		<Win className="flex w-[244px] flex-col gap-3 p-3.5">
			{[0.7, 0.35, 0.9].map((to, i) => (
				<div key={i} className="flex items-center gap-2.5">
					<Avatar tone={i} />
					<Bar w={[54, 70, 46][i] ?? 50} />
					<span className="flex-1" />
					<span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-ink/8">
						<motion.span className={cn("absolute inset-0 origin-left rounded-full", to > 0.8 ? "bg-arc" : "bg-arc/50")} {...loop({ scaleX: [0.1, to, to, 0.1] }, 4, { times: [0, 0.5, 0.9, 1], delay: i * 0.2, rest: 1 })} />
					</span>
				</div>
			))}
		</Win>
	);
}

/** A customer asks, Insyte types, and answers with the chapter it read. */
function Chat() {
	const loop = useLoop();
	const T = { times: [0, 0.9, 0.96, 1] };
	return (
		<Win className="flex w-[232px] flex-col gap-2 p-3">
			<motion.div className="flex w-[70%] flex-col gap-1.5 self-start rounded-lg rounded-bl-sm bg-ink/6 p-2" {...loop({ opacity: [1, 1, 0, 1] }, 5, { ...T, rest: 0 })}>
				<Bar w="90%" />
				<Bar w="55%" />
			</motion.div>
			<div className="relative h-[52px]">
				<motion.div className="absolute top-0 right-0 flex gap-1 rounded-lg bg-arc-tint px-2.5 py-2" {...loop({ opacity: [0, 0, 1, 1, 0, 0] }, 5, { times: [0, 0.15, 0.2, 0.35, 0.4, 1], rest: 0 })}>
					{[0, 1, 2].map((d) => (
						<motion.span key={d} className="size-1 rounded-full bg-arc-ink/60" {...loop({ y: [0, -2, 0] }, 0.6, { delay: d * 0.12 })} />
					))}
				</motion.div>
				<motion.div className="absolute top-0 right-0 flex w-[78%] flex-col gap-1.5 rounded-lg rounded-br-sm bg-arc-tint p-2" {...loop({ opacity: [0, 0, 1, 1, 0], y: [6, 6, 0, 0, 0] }, 5, { times: [0, 0.4, 0.48, 0.9, 1], rest: 3 })}>
					<Bar w="92%" className="bg-arc/25" />
					<Bar w="70%" className="bg-arc/25" />
					<span className="mt-0.5 flex items-center gap-1 self-start rounded-sm bg-paper px-1 py-0.5">
						<span className="size-1.5 rounded-full bg-arc" />
						<Bar w={26} className="h-1" />
					</span>
				</motion.div>
			</div>
		</Win>
	);
}

/** A week of opening hours with now sweeping across it. */
function Hours() {
	const loop = useLoop();
	const days = [
		[20, 70],
		[20, 70],
		[20, 70],
		[20, 70],
		[20, 60],
		[35, 50],
		[0, 0],
	];
	return (
		<Win className="relative flex h-[104px] w-[232px] items-end gap-2.5 px-4 pt-3 pb-3">
			{days.map(([from, to], i) => (
				<div key={i} className="flex h-full flex-1 flex-col items-center gap-1.5">
					<div className="relative w-full flex-1 rounded-sm bg-ink/5">
						{to ? <span className="absolute inset-x-0 rounded-sm bg-arc-tint" style={{ top: `${from}%`, height: `${to - from + 10}%` }} /> : null}
					</div>
					<Bar w={10} className="h-1" />
				</div>
			))}
			<motion.span className="absolute top-3 bottom-[22px] w-0.5 rounded-full bg-arc" {...loop({ left: ["10%", "88%"] }, 6, { ease: "linear", repeatType: "loop", rest: 0 })} />
		</Win>
	);
}

/** A conversation passed on: a dot carries it over to a colleague, who gets the summary. */
function Handover() {
	const loop = useLoop();
	return (
		<div className="flex items-center gap-3">
			<Win className="flex w-[104px] flex-col gap-1.5 p-2.5">
				<Bar w="80%" />
				<Bar w="60%" />
				<span className="mt-1 flex items-center gap-1.5">
					<Mark size={12} />
					<Bar w="50%" className="bg-arc/30" />
				</span>
			</Win>
			<div className="relative h-px w-12 bg-mesh-ink/30">
				<motion.span className="absolute -top-[3px] size-[7px] rounded-full bg-arc" {...loop({ left: [0, 40, 40], opacity: [1, 1, 0] }, 3, { times: [0, 0.4, 0.5], rest: 0 })} />
			</div>
			<div className="flex flex-col items-center gap-2">
				<motion.span className="flex size-9 items-center justify-center rounded-full bg-arc-tint ring-arc/40" {...loop({ scale: [1, 1, 1.12, 1, 1] }, 3, { times: [0, 0.4, 0.5, 0.6, 1] })}>
					<span className="size-4 rounded-full bg-arc/45" />
				</motion.span>
				<motion.div {...loop({ opacity: [0, 0, 1, 1, 0], y: [6, 6, 0, 0, 0] }, 3, { times: [0, 0.5, 0.6, 0.9, 1], rest: 3 })}>
					<Win className="flex w-[78px] flex-col gap-1 p-2">
						<Bar w="90%" className="h-1" />
						<Bar w="60%" className="h-1" />
					</Win>
				</motion.div>
			</div>
		</div>
	);
}

/** An unanswered question drops into a chapter and becomes a line of it. */
function Knowledge() {
	const loop = useLoop();
	return (
		<div className="relative">
			<Win className="flex w-[180px] flex-col gap-2 p-3.5">
				<Bar w={70} className="h-2 bg-ink/18" />
				<Bar w="95%" />
				<Bar w="80%" />
				<Bar w="88%" />
				<motion.span className="block h-1.5 w-[64%] origin-left rounded-full bg-arc/45" {...loop({ scaleX: [0, 0, 1, 1, 0] }, 4, { times: [0, 0.45, 0.6, 0.92, 1], rest: 2 })} />
			</Win>
			<motion.span
				className={cn("absolute -top-3 -left-12 flex items-center gap-1.5 rounded-full bg-paper px-2 py-1", LIFT)}
				{...loop({ x: [0, 0, 60, 60, 0], y: [0, 0, 78, 78, 0], opacity: [0, 1, 0, 0, 0], scale: [0.9, 1, 0.6, 0.6, 0.9] }, 4, { times: [0, 0.12, 0.45, 0.9, 1], rest: 1 })}
			>
				<span className="flex size-3 items-center justify-center rounded-full bg-arc text-[8px] text-mesh-ink">?</span>
				<Bar w={36} />
			</motion.span>
		</div>
	);
}

/** A key with its scopes, granted one by one. */
function Keys() {
	const loop = useLoop();
	return (
		<Win className="flex w-[232px] flex-col gap-3 p-3.5">
			<div className="flex items-center gap-2.5">
				<span className="flex size-6 items-center justify-center rounded-md bg-arc-tint text-arc-ink">
					<Key className="size-3.5" strokeWidth={2} />
				</span>
				<Bar w={60} className="bg-ink/16" />
				<span className="flex-1" />
				<span className="flex gap-0.5">
					{Array.from({ length: 6 }, (_, i) => (
						<span key={i} className="size-1 rounded-full bg-ink/25" />
					))}
				</span>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{[34, 48, 40, 30, 44].map((w, i) => (
					<motion.span key={i} className="h-4 rounded-full" style={{ width: w }} {...loop({ backgroundColor: ["var(--color-mist)", "var(--color-mist)", "var(--color-arc-tint)", "var(--color-arc-tint)", "var(--color-mist)"] }, 5, { times: [0, 0.1 + i * 0.1, 0.18 + i * 0.1, 0.9, 1], rest: 3 })} />
				))}
			</div>
		</Win>
	);
}

/** An event leaves Insyte and arrives at the other end, which answers with a check. */
function WebhookArt() {
	const loop = useLoop();
	return (
		<div className="flex items-center gap-3">
			<span className={cn("flex size-11 items-center justify-center rounded-xl bg-paper text-arc-ink", LIFT)}>
				<Sparkle className="size-5" strokeWidth={1.75} />
			</span>
			<div className="relative h-px w-20 bg-[repeating-linear-gradient(90deg,var(--color-mesh-ink)_0_3px,transparent_3px_7px)] opacity-40" />
			<motion.span className="absolute size-2 rounded-full bg-mesh-ink" style={{ marginLeft: -52 }} {...loop({ x: [0, 0, 92, 92], opacity: [0, 1, 1, 0] }, 2.6, { times: [0, 0.05, 0.5, 0.55], rest: 1 })} />
			<Win className="relative flex w-[92px] flex-col gap-1.5 p-2.5">
				<Bar w="70%" className="bg-ink/16" />
				<Bar w="90%" />
				<Bar w="55%" />
				<motion.span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-arc text-mesh-ink ring-2 ring-paper" {...loop({ scale: [0, 0, 1.15, 1, 1, 0] }, 2.6, { times: [0, 0.5, 0.58, 0.64, 0.9, 1], rest: 3 })}>
					<Check className="size-3" strokeWidth={2.5} />
				</motion.span>
			</Win>
		</div>
	);
}

/** When, if, then: a pulse runs down the three blocks of an automation. */
function Flow() {
	const loop = useLoop();
	return (
		<div className="flex flex-col items-center">
			{[0, 1, 2].map((i) => (
				<div key={i} className="flex flex-col items-center">
					{i > 0 ? (
						<span className="relative h-3.5 w-px bg-mesh-ink/30">
							<motion.span className="absolute -left-[2.5px] size-1.5 rounded-full bg-mesh-ink" {...loop({ top: [-2, 12], opacity: [0, 1, 0] }, 2.4, { delay: i * 0.5, repeatDelay: 0.4, rest: 1 })} />
						</span>
					) : null}
					<motion.div {...loop({ scale: [1, 1.04, 1] }, 2.4, { delay: i * 0.55, times: [0, 0.12, 0.3], repeatDelay: 0.4 })}>
						<Win className="flex w-[176px] items-center gap-2 px-2.5 py-2">
							<span className={cn("size-3.5 rounded-[4px]", i === 0 ? "bg-arc" : "bg-arc-tint")} />
							<Bar w={[70, 92, 60][i] ?? 60} />
						</Win>
					</motion.div>
				</div>
			))}
		</div>
	);
}

/** Notifications dropping onto a stack beside a bell that rings for each. */
function Notify() {
	const loop = useLoop();
	return (
		<div className="flex items-start gap-3">
			<motion.span className={cn("flex size-9 items-center justify-center rounded-full bg-paper text-arc-ink", LIFT)} {...loop({ rotate: [0, 14, -10, 6, 0, 0] }, 2.2, { times: [0, 0.08, 0.16, 0.24, 0.32, 1] })}>
				<Bell className="size-4" strokeWidth={1.75} />
			</motion.span>
			<div className="relative h-[96px] w-[176px]">
				{[0, 1, 2].map((i) => (
					<motion.div key={i} className="absolute inset-x-0" style={{ top: i * 30 }} {...(i === 0 ? loop({ opacity: [0, 1, 1], y: [-10, 0, 0] }, 2.2, { times: [0, 0.2, 1] }) : {})}>
						<Win className={cn("flex items-center gap-2 px-2.5 py-2", i > 0 && "opacity-70")}>
							<span className={cn("size-1.5 rounded-full", i === 0 ? "bg-arc" : "bg-ink/20")} />
							<Bar w={[96, 74, 84][i] ?? 80} />
						</Win>
					</motion.div>
				))}
			</div>
		</div>
	);
}

/** A small board: figures on top, bars growing underneath. */
function Chart() {
	const loop = useLoop();
	const bars = [0.45, 0.62, 0.38, 0.8, 0.55, 0.92, 0.7];
	return (
		<Win className="flex w-[244px] flex-col gap-3 p-3.5">
			<div className="flex gap-4">
				{[0, 1, 2].map((i) => (
					<div key={i} className="flex flex-col gap-1.5">
						<Bar w={30} className="h-1" />
						<Bar w={[46, 38, 42][i] ?? 40} className={cn("h-2", i === 0 ? "bg-arc/50" : "bg-ink/18")} />
					</div>
				))}
			</div>
			<div className="flex h-12 items-end gap-2">
				{bars.map((h, i) => (
					<motion.span key={i} className={cn("flex-1 origin-bottom rounded-t-sm", i === 5 ? "bg-arc" : "bg-arc-tint")} style={{ height: `${h * 100}%` }} {...loop({ scaleY: [0.15, 1, 1, 0.15] }, 4, { times: [0, 0.3, 0.9, 1], delay: i * 0.06, rest: 1 })} />
				))}
			</div>
		</Win>
	);
}

/** The customer's side: a phone-sized form stepping through its pages. */
function Portal() {
	const loop = useLoop();
	return (
		<Win className="flex w-[124px] flex-col gap-2.5 px-3 pt-3 pb-3.5">
			<div className="flex gap-1">
				{[0, 1, 2].map((i) => (
					<span key={i} className="relative h-1 flex-1 overflow-hidden rounded-full bg-ink/8">
						<motion.span className="absolute inset-0 origin-left bg-arc" {...loop({ scaleX: [0, 0, 1, 1, 0] }, 4.5, { times: [0, 0.1 + i * 0.25, 0.2 + i * 0.25, 0.92, 1], rest: 3 })} />
					</span>
				))}
			</div>
			<Bar w="70%" className="h-2 bg-ink/18" />
			<span className="h-5 rounded-md bg-ink/6" />
			<span className="h-5 rounded-md bg-ink/6" />
			<span className="flex h-5 items-center justify-center rounded-md bg-abyss">
				<Bar w={28} className="h-1 bg-mesh-ink/50" />
			</span>
		</Win>
	);
}

/** A grid of permissions, ticking on in a wave. */
function Roles() {
	const loop = useLoop();
	return (
		<Win className="flex w-[232px] flex-col gap-2.5 p-3.5">
			{[0, 1, 2].map((r) => (
				<div key={r} className="flex items-center gap-2.5">
					<Bar w={[64, 50, 72][r] ?? 60} />
					<span className="flex-1" />
					{[0, 1, 2, 3].map((c) => (
						<motion.span
							key={c}
							className="flex size-4 items-center justify-center rounded-[4px] text-mesh-ink"
							{...loop({ backgroundColor: ["var(--color-mist)", "var(--color-mist)", "var(--color-arc)", "var(--color-arc)", "var(--color-mist)"] }, 5, { times: [0, 0.05 + (r + c) * 0.08, 0.1 + (r + c) * 0.08, 0.9, 1], rest: c + r < 4 ? 3 : 0 })}
						>
							<Check className="size-2.5" strokeWidth={3} />
						</motion.span>
					))}
				</div>
			))}
		</Win>
	);
}

/** A shared link and the clicks it brings, climbing. */
function LinkArt() {
	const loop = useLoop();
	return (
		<Win className="flex w-[232px] flex-col gap-3 p-3.5">
			<div className="flex items-center gap-2 rounded-md bg-ink/5 px-2 py-1.5">
				<span className="size-2 rounded-full bg-arc" />
				<Bar w={110} />
				<span className="flex-1" />
				<span className="h-3 w-5 rounded-sm bg-arc-tint" />
			</div>
			<div className="flex h-10 items-end gap-1.5">
				{[0.2, 0.3, 0.28, 0.45, 0.5, 0.66, 0.74, 0.9].map((h, i) => (
					<motion.span key={i} className="flex-1 origin-bottom rounded-t-sm bg-arc/40" style={{ height: `${h * 100}%` }} {...loop({ scaleY: [0, 0, 1, 1, 0] }, 4, { times: [0, i * 0.05, 0.3 + i * 0.05, 0.92, 1], rest: 3 })} />
				))}
			</div>
		</Win>
	);
}

/** A parcel making its way back from the customer to the warehouse. */
function Parcel() {
	const loop = useLoop();
	return (
		<div className="flex items-center gap-4">
			<Win className="flex size-14 items-center justify-center">
				<span className="size-5 rounded-full bg-arc-tint" />
			</Win>
			<div className="relative h-px w-24 bg-[repeating-linear-gradient(90deg,var(--color-mesh-ink)_0_3px,transparent_3px_7px)] opacity-40" />
			<Win className="flex size-14 items-center justify-center">
				<span className="h-5 w-7 rounded-sm bg-arc-tint" />
			</Win>
			<motion.span className="absolute flex size-7 items-center justify-center rounded-md bg-paper text-arc-ink shadow-[0_6px_14px_-6px_rgb(0_0_0/0.3)]" {...loop({ x: [-74, 74, 74], opacity: [1, 1, 0] }, 3.2, { times: [0, 0.8, 1], rest: 0 })}>
				<Package className="size-4" strokeWidth={1.75} />
			</motion.span>
		</div>
	);
}

const ART: Record<GuideArt, () => React.ReactNode> = {
	rules: Rules,
	lock: LockArt,
	undo: UndoArt,
	log: Log,
	budget: Budget,
	people: People,
	chat: Chat,
	hours: Hours,
	handover: Handover,
	knowledge: Knowledge,
	keys: Keys,
	webhook: WebhookArt,
	flow: Flow,
	notify: Notify,
	chart: Chart,
	portal: Portal,
	roles: Roles,
	link: LinkArt,
	parcel: Parcel,
};
