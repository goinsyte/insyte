import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import type { Workspace } from "../lib/team";

const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.filter((w) => /[a-z0-9]/i.test(w[0] ?? ""))
		.map((w) => w[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();

/**
 * The veil of the hand-over between two workspaces (`WorkspaceSwitchOverlay`), on its own for a host that runs the
 * switch itself (the console waits for the server, then reloads). No store here, so the console can show it.
 */
export function WorkspaceSwitchVeil({ switching }: { switching: Workspace | null }) {
	const still = useReducedMotion();
	if (typeof document === "undefined") return null;
	return createPortal(
		<AnimatePresence>
			{switching ? (
				<motion.div
					key={switching.id}
					role="status"
					aria-live="polite"
					className="fixed inset-0 z-[70] flex items-center justify-center bg-glacier/80 backdrop-blur-md"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, transition: { duration: 0.24 } }}
					transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
				>
					<motion.div
						className="flex flex-col items-center gap-4"
						initial={still ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
						animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
					>
						<span className="flex size-14 items-center justify-center rounded-xl bg-abyss font-medium text-mesh-ink text-xl shadow-primary">{initialsOf(switching.name)}</span>
						<div className="flex flex-col items-center gap-1 text-center">
							<span className="text-ink-2 text-sm">Naar werkruimte</span>
							<span className="max-w-[28ch] font-medium text-ink text-xl">{switching.name}</span>
						</div>
						<span className="relative h-0.5 w-32 overflow-hidden rounded-full bg-ink/10" aria-hidden>
							<motion.span
								className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-arc"
								initial={{ scaleX: 0 }}
								animate={{ scaleX: 1 }}
								transition={{ duration: still ? 0 : 0.7, ease: [0.25, 1, 0.5, 1] }}
							/>
						</span>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>,
		document.body,
	);
}
