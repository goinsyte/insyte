import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useTeam } from "../stores/team-store";

const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.filter((w) => /[a-z0-9]/i.test(w[0] ?? ""))
		.map((w) => w[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();

/**
 * The hand-over between two workspaces: the console steps back under a glacier veil, the new
 * workspace's mark and name come up, and the chrome changes underneath before the veil lifts. It is
 * brief (about three quarters of a second) because it is a signal, not a loading screen: the point
 * is that the next thing you read belongs to someone else's business.
 */
export function WorkspaceSwitchOverlay() {
	const switching = useTeam((s) => s.switching);
	const navigate = useNavigate();
	const still = useReducedMotion();

	useEffect(() => {
		if (!switching) return;
		const t = window.setTimeout(
			() => {
				useTeam.getState().finishSwitch();
				void navigate({ to: "/dashboard", search: {} as never });
				toast.success(`Je werkt nu in ${switching.name}`, {
					description: switching.home ? undefined : `Als ${switching.role}. In deze demo zie je dezelfde gegevens onder de naam van deze werkruimte.`,
				});
			},
			still ? 250 : 760,
		);
		return () => window.clearTimeout(t);
	}, [switching, navigate, still]);

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
