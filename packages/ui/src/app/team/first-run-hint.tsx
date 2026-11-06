import { ArrowRight, X } from "../../icons";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTeam } from "../stores/team-store";

/**
 * The first thing a person sees after joining: a note hanging from the workspace name in the top
 * bar, saying where they are, as what, and the three places worth opening first. It goes when it is
 * dismissed or one of them is opened, and does not come back.
 */
export function FirstRunHint() {
	const welcome = useTeam((s) => s.welcome);
	const still = useReducedMotion();
	const close = () => useTeam.getState().setWelcome(null);

	const places = [
		{ to: "/tickets", label: "Tickets die op je wachten", detail: "Wat aan jou is toegewezen, het dringendste eerst" },
		{ to: "/settings/profile", label: "Je profiel en meldingen", detail: "Foto, naam en wanneer Insyte je iets laat weten" },
		{ to: "/settings/team", label: "Wie er in het team zit", detail: "En wat ieder kan zien" },
	] as const;

	return (
		<AnimatePresence>
			{welcome ? (
				<motion.div
					role="dialog"
					aria-label={`Welkom in ${welcome.workspace}`}
					className="panel-raised absolute top-[calc(100%+10px)] left-0 z-40 w-[min(340px,calc(100vw-24px))] rounded-xl bg-paper p-4"
					initial={still ? false : { opacity: 0, y: -6, scale: 0.98 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: -4, transition: { duration: 0.14 } }}
					transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
					style={{ transformOrigin: "top left" }}
				>
					<span aria-hidden className="absolute -top-1.5 left-4 size-3 rotate-45 bg-paper shadow-[-1px_-1px_0_color-mix(in_oklch,var(--ink)_9%,transparent)]" />
					<div className="flex items-start justify-between gap-3">
						<div className="flex min-w-0 flex-col gap-0.5">
							<h2 className="font-medium text-ink text-md">Welkom in {welcome.workspace}, {welcome.name.split(" ")[0]}</h2>
							<p className="text-ink-2 text-sm">
								Je bent {welcome.role}. Hier wissel je van winkel of werkruimte.
							</p>
						</div>
						<button type="button" onClick={close} aria-label="Sluiten" className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink">
							<X className="size-3.5" strokeWidth={2} />
						</button>
					</div>
					<ul className="mt-3 flex flex-col gap-0.5">
						{places.map((p) => (
							<li key={p.to}>
								<Link to={p.to} onClick={close} className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-ink/5">
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="font-medium text-base text-ink">{p.label}</span>
										<span className="truncate text-ink-3 text-sm">{p.detail}</span>
									</span>
									<ArrowRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2" strokeWidth={1.75} />
								</Link>
							</li>
						))}
					</ul>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
