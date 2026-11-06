import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Home, type IconComponent, Settings, Sparkles, Bell, Radio, BadgePercent } from "../../icons";
import { PERSONA_CHROME } from "../lib/persona-chrome";
import { SIDEBAR_BY_PERSONA } from "../lib/app-shell-config";
import type { Persona } from "../lib/types/persona";
import { useWorkspace } from "../stores/workspace-store";
import { paceFactor, useLoading } from "./pace";

/*
 * The cold start (ADR-0028): what is on screen between the first byte and the first screen.
 *
 * On the real stack the server has already decided who this is and which workspace they are in — the
 * session cookie is read in middleware and a wrong tenant never gets HTML — so this moment is short
 * and it is the brand's. The Drift mark's three squares fold together and drift back out, the way
 * the mark itself is drawn, while the workspace's name is set under it; when the screen is ready the
 * squares settle into one and that one becomes the place you are going, its glyph drawn in chalk on
 * the abyss square. Then the whole sheet lifts off the shell, which has been there underneath.
 */

/** The mark's own colours, from `brand/marks.tsx`: powder azure, mid azure, abyss. */
const BACK = "oklch(86% 0.060 270)";
const MID = "oklch(56% 0.140 270)";
const EXPO = [0.16, 1, 0.3, 1] as const;

export type DriftPhase = "drift" | "arrive";

export function DriftLoader({ size = 56, phase = "drift", icon: Icon }: { size?: number; phase?: DriftPhase; icon?: IconComponent | undefined }) {
	const still = useReducedMotion();
	const arrive = phase === "arrive";
	/* Drifting, a square folds onto the front one and comes back out; arriving, all three settle on
	   the centre, where the front square is going. `to` is how far it sits from the front square,
	   `settle` where it ends up once the front square has moved 11 units back to the centre. */
	const square = (to: number, settle: number, delay: number) => ({
		animate: still ? { x: 0, y: 0 } : arrive ? { x: settle, y: settle } : { x: [0, to, to, 0], y: [0, to, to, 0] },
		transition: arrive
			? { duration: 0.42, ease: EXPO }
			: { duration: 1.25, times: [0, 0.42, 0.58, 1], ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY, repeatDelay: 0.1, delay },
	});
	return (
		<span className="relative block" style={{ width: size, height: size }}>
			<svg viewBox="0 0 64 64" width={size} height={size} overflow="visible" aria-hidden>
				<motion.rect x="2" y="2" width="38" height="38" rx="7" fill={BACK} {...square(22, 11, 0)} />
				<motion.rect x="13" y="13" width="38" height="38" rx="7" fill={MID} {...square(11, 0, 0.06)} />
				<motion.g
					animate={arrive ? { x: -11, y: -11, scale: 1.14 } : { x: 0, y: 0, scale: 1 }}
					transition={{ duration: 0.42, ease: EXPO }}
				>
					<rect x="24" y="24" width="38" height="38" rx="7" fill="var(--abyss)" />
					<motion.g initial={{ opacity: 0.55 }} animate={{ opacity: arrive && Icon ? 0 : 0.55 }} transition={{ duration: 0.18 }} fill="#ffffff">
						<rect x="44" y="30" width="10" height="3" rx="1.5" />
						<rect x="44" y="36" width="14" height="3" rx="1.5" />
						<rect x="44" y="42" width="8" height="3" rx="1.5" />
					</motion.g>
				</motion.g>
			</svg>
			{Icon ? (
				<motion.span
					className="absolute inset-0 flex items-center justify-center text-mesh-ink"
					initial={false}
					animate={arrive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
					transition={{ duration: 0.32, delay: arrive ? 0.16 : 0, ease: EXPO }}
					aria-hidden
				>
					<Icon style={{ width: size * 0.36, height: size * 0.36 }} strokeWidth={1.9} />
				</motion.span>
			) : null}
		</span>
	);
}

/** The places a cold start can open on that are not in the sidebar's two lists. */
const EXTRA: ReadonlyArray<{ prefix: string; label: string; icon: IconComponent }> = [
	{ prefix: "/settings", label: "Instellingen", icon: Settings },
	{ prefix: "/supplier/settings", label: "Instellingen", icon: Settings },
	{ prefix: "/affiliate/settings", label: "Instellingen", icon: Settings },
	{ prefix: "/notifications", label: "Meldingen", icon: Bell },
	{ prefix: "/live", label: "Live", icon: Radio },
	{ prefix: "/costs", label: "Kosten", icon: BadgePercent },
	{ prefix: "/marketplace", label: "Marketplace", icon: Sparkles },
];

/** Where a path is, as the sidebar names it: its label and its glyph. */
export function destinationOf(pathname: string, persona: Persona): { label: string; icon: IconComponent } {
	const nav = SIDEBAR_BY_PERSONA[persona];
	const items = [...nav.main, ...nav.tools];
	const hit = items.find((i) => pathname === i.to || pathname.startsWith(`${i.matchPrefix ?? i.to}/`));
	if (hit) return { label: hit.label, icon: hit.icon };
	const extra = EXTRA.find((e) => pathname === e.prefix || pathname.startsWith(`${e.prefix}/`) || pathname.endsWith(e.prefix));
	return extra ?? { label: "Dashboard", icon: Home };
}

type Phase = "drift" | "arrive" | "leave" | "gone";

/** The sheet over the shell on a cold start. Plays once per page load, never on navigation. */
export function BootScreen({ persona }: { persona: Persona }) {
	const [phase, setPhase] = useState<Phase>(() => (useLoading.getState().booted ? "gone" : "drift"));
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const workspace = useWorkspace((s) => s.account.workspace);
	const where = destinationOf(pathname, persona);
	const who = PERSONA_CHROME[persona].partner?.name ?? workspace;

	useEffect(() => {
		if (useLoading.getState().booted) return;
		const drift = Math.round(950 * paceFactor());
		const t = [
			window.setTimeout(() => setPhase("arrive"), drift),
			// The shell starts loading the screen as the sheet starts to lift, so the skeleton is
			// what the sheet reveals rather than what replaces it a moment later.
			window.setTimeout(() => {
				setPhase("leave");
				useLoading.getState().setBooted();
			}, drift + 460),
			window.setTimeout(() => setPhase("gone"), drift + 460 + 320),
		];
		return () => t.forEach((x) => window.clearTimeout(x));
	}, []);

	if (phase === "gone") return null;
	const arriving = phase !== "drift";
	return (
		<div
			role="status"
			aria-live="polite"
			className="fixed inset-0 z-[90] bg-glacier transition-opacity duration-300 ease-out"
			style={{ opacity: phase === "leave" ? 0 : 1, pointerEvents: phase === "leave" ? "none" : "auto" }}
		>
			<span className="sr-only">{arriving ? `${where.label} openen` : `${who} openen`}</span>
			<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2">
				<DriftLoader phase={arriving ? "arrive" : "drift"} icon={where.icon} />
			</div>
			{/* Under the mark, not beside it, and absolutely: the mark sits on the exact centre the
			    document's own first paint put it on, so the hand-over from HTML to React does not move it. */}
			<div className="absolute inset-x-0 top-[calc(50%+48px)] flex justify-center" aria-hidden>
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={arriving ? "where" : "who"}
						initial={{ opacity: 0, y: 3 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -3 }}
						transition={{ duration: 0.2, ease: EXPO }}
						className="font-medium text-ink-3 text-sm"
					>
						{arriving ? where.label : who}
					</motion.span>
				</AnimatePresence>
			</div>
		</div>
	);
}
