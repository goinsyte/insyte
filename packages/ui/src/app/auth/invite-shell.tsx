import { InsyteMark } from "../../brand/mark";
import { ContactEmail } from "../../lib/contact-email";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/*
 * The invitation landing in /login's two halves: the Abyss mesh with the workspace's mark and one
 * line about what joining means on the left, and /login's grey form column on the right. The brand
 * half names the business being joined, not Insyte, because that is the thing the person clicked a
 * link from a colleague to see.
 */

export const INPUT =
	"h-11 w-full rounded-lg bg-paper px-3.5 text-base leading-none text-ink outline-none transition-shadow placeholder:text-ink-3 focus-visible:ring-focus read-only:text-ink-2";
export const PRIMARY =
	"flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-abyss px-4 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-60";
export const SECONDARY =
	"flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-paper px-4 font-medium text-base text-ink leading-none transition-colors hover:bg-mist disabled:opacity-60";

const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.filter((w) => /[a-z0-9]/i.test(w[0] ?? ""))
		.map((w) => w[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();

export function InviteShell({
	workspace,
	line,
	stepKey,
	children,
}: {
	workspace: string;
	line: { lead: string; accent: string; body: string };
	/** Changes when the form moves on, so the column slides rather than swaps. */
	stepKey: string;
	children: ReactNode;
}) {
	const still = useReducedMotion();
	return (
		<div className="grid min-h-svh grid-rows-[auto_1fr] bg-background text-ink lg:grid-cols-2 lg:grid-rows-1">
			<aside className="relative isolate hidden flex-col overflow-hidden bg-stripe-mesh-dark px-12 py-12 text-mesh-ink lg:flex xl:px-16">
				<Atmosphere />
				<div className="relative z-10 flex items-center gap-2.5">
					<InsyteMark size={22} tone="white" />
					<span className="font-medium text-lg tracking-tight">insyte</span>
				</div>

				<div className="relative z-10 my-auto flex flex-col gap-6 py-8">
					<span className="flex items-center gap-3">
						<span className="flex size-12 items-center justify-center rounded-xl bg-mesh-ink font-medium text-abyss text-lg">{initialsOf(workspace)}</span>
						<span className="font-medium text-md text-mesh-ink-2">{workspace}</span>
					</span>
					<motion.h1
						key={line.lead + line.accent}
						className="max-w-[16ch] font-medium text-4xl"
						initial={still ? false : { opacity: 0, y: 16, filter: "blur(6px)" }}
						animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
					>
						{line.lead} <span className="text-arc-ink">{line.accent}</span>
					</motion.h1>
					<p className="max-w-[44ch] text-md text-mesh-ink/75 leading-relaxed">{line.body}</p>
				</div>

				<div className="relative z-10 text-xs">
					<ContactEmail name="support" className="font-medium text-mesh-ink/70 transition-colors hover:text-mesh-ink" />
				</div>
			</aside>

			{/* Phone: the wordmark and whose workspace this is, without the headline. */}
			<aside className="relative isolate flex items-center justify-between gap-3 overflow-hidden bg-stripe-mesh-dark px-5 py-4 text-mesh-ink lg:hidden">
				<div className="relative z-10 flex items-center gap-2">
					<InsyteMark size={20} tone="white" />
					<span className="font-medium text-md tracking-tight">insyte</span>
				</div>
				<span className="relative z-10 flex min-w-0 items-center gap-2 text-mesh-ink-2 text-sm">
					<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-mesh-ink font-medium text-2xs text-abyss">{initialsOf(workspace)}</span>
					<span className="truncate">{workspace}</span>
				</span>
			</aside>

			<main className="flex flex-col items-center px-6 pt-[clamp(32px,10vh,110px)] pb-12 sm:px-10 lg:justify-center lg:pt-12">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={stepKey}
						className="flex w-full max-w-[400px] flex-col gap-5"
						initial={still ? false : { opacity: 0, x: 24 }}
						animate={{ opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } }}
						exit={still ? { opacity: 0 } : { opacity: 0, x: -16, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
					>
						{children}
					</motion.div>
				</AnimatePresence>
			</main>
		</div>
	);
}

export function Heading({ title, sub }: { title: string; sub?: ReactNode }) {
	return (
		<header className="flex flex-col gap-1.5">
			<h2 className="text-balance font-medium text-2xl text-ink">{title}</h2>
			{sub ? <p className="text-ink-2 text-sm leading-normal">{sub}</p> : null}
		</header>
	);
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
	return (
		<label htmlFor={htmlFor} className="font-medium text-ink-3 text-xs leading-none">
			{children}
		</label>
	);
}

/** One segment per step of joining, as onboarding draws it. */
export function Steps({ index, total }: { index: number; total: number }) {
	return (
		<div className="flex items-center gap-3">
			<div className="flex flex-1 items-center gap-1" aria-hidden>
				{Array.from({ length: total }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: steps are positions
					<span key={i} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i <= index ? "bg-arc" : "bg-ink/8")} />
				))}
			</div>
			<span className="shrink-0 font-medium text-ink-2 text-xs tabular-nums">
				Stap {index + 1} van {total}
			</span>
		</div>
	);
}

function Atmosphere() {
	return (
		<>
			<div className="glow-orb glow-orb--arc anim-orb-drift" style={{ width: 680, height: 680, top: -260, left: -220, opacity: 0.8 }} aria-hidden />
			<div className="glow-orb glow-orb--sky anim-orb-drift-slow" style={{ width: 520, height: 520, bottom: -220, right: -180, opacity: 0.55 }} aria-hidden />
			<div className="pointer-events-none absolute inset-0 bg-dot-grid opacity-40" aria-hidden />
			<div className="pointer-events-none absolute inset-0 bg-vignette" aria-hidden />
		</>
	);
}
