import { useEffect, useState } from "react";
import { create } from "zustand";

/*
 * How the reference arrives (ADR-0028).
 *
 * The reference has no network, so everything it draws is on screen the moment the route matches —
 * which hides every loading state the product will have. This puts them back, on a schedule the real
 * stack will keep: a cold start shows the brand once while the session and the workspace resolve, a
 * screen's first visit shows its skeleton while its loader runs, a record's first open shows its
 * header at once (the row was in the list) and its body a beat later, and anything the browser has to
 * draw itself (a chart, the map, the sheet grid) fills in after.
 *
 * What has arrived is remembered in memory, exactly like the query cache it stands in for: a second
 * visit is instant, and a reload is a cold start again.
 */

export type Pace = "live" | "slow" | "off";

export const PACES: ReadonlyArray<{ id: Pace; label: string; detail: string }> = [
	{ id: "live", label: "Zoals live", detail: "Eerste bezoek laadt kort, daarna direct uit de cache" },
	{ id: "slow", label: "Traag netwerk", detail: "Alles ruim twee keer zo lang, om elke stap te zien" },
	{ id: "off", label: "Direct", detail: "Geen laadtijd: alles staat er meteen" },
];

const FACTOR: Record<Pace, number> = { live: 1, slow: 2.6, off: 0 };
const KEY = "insyte:pace";
/** `?laden=traag` and friends, so a link can open the reference at a pace. */
const FROM_URL: Record<string, Pace> = { live: "live", traag: "slow", uit: "off", direct: "off" };

function initialPace(): Pace {
	if (typeof window === "undefined") return "live";
	try {
		const asked = FROM_URL[new URLSearchParams(window.location.search).get("laden") ?? ""];
		if (asked) {
			localStorage.setItem(KEY, asked);
			return asked;
		}
		const saved = localStorage.getItem(KEY);
		if (saved === "live" || saved === "slow" || saved === "off") return saved;
	} catch {
		// Storage can be blocked; the default pace is the honest one.
	}
	return "live";
}

type State = {
	pace: Pace;
	/** The cold start is over: the brand has handed over to the shell. Once per page load. */
	booted: boolean;
	/** How many things are on their way right now; the navigation line runs while this is above 0. */
	pending: number;
	setPace: (p: Pace) => void;
	setBooted: () => void;
	begin: () => void;
	end: () => void;
};

const startPace = initialPace();

export const useLoading = create<State>()((set) => ({
	pace: startPace,
	booted: startPace === "off",
	pending: 0,
	setPace: (pace) => {
		try {
			localStorage.setItem(KEY, pace);
		} catch {
			// Kept for this page load only.
		}
		set({ pace, ...(pace === "off" ? { booted: true } : {}) });
	},
	setBooted: () => set({ booted: true }),
	begin: () => set((s) => ({ pending: s.pending + 1 })),
	end: () => set((s) => ({ pending: Math.max(0, s.pending - 1) })),
}));

/** The in-memory cache. Gone on reload, as a real one is. */
const arrivedKeys = new Set<string>();

function hash(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

/** How long `key` takes, at the current pace: its base, give or take a fifth, the same every time. */
export function costOf(key: string, base: number): number {
	const jitter = ((hash(key) % 41) - 20) / 100;
	return Math.round(base * (1 + jitter) * FACTOR[useLoading.getState().pace]);
}

export const paceFactor = () => FACTOR[useLoading.getState().pace];

/**
 * True once `key` has arrived. The first time a key is asked for it takes `base` ms (at the current
 * pace); every time after, and at the "off" pace, it is true at once.
 *
 * `hold` keeps the clock from starting — a screen does not start loading under the boot screen.
 * `progress` counts it toward the navigation line. `marks` are keys that arrive with this one: a
 * record opened as a page has already shown its skeleton, so its body must not show a second one.
 */
export function useArrival(
	key: string,
	base: number,
	{ hold = false, progress = false, marks }: { hold?: boolean; progress?: boolean; marks?: ReadonlyArray<string> } = {},
): boolean {
	const off = useLoading((s) => s.pace === "off");
	const [done, setDone] = useState<string | null>(null);
	const ready = off || done === key || arrivedKeys.has(key);
	const also = marks?.join("|") ?? "";
	useEffect(() => {
		if (ready || hold) return;
		const { begin, end } = useLoading.getState();
		if (progress) begin();
		const t = window.setTimeout(() => {
			arrivedKeys.add(key);
			for (const m of also ? also.split("|") : []) arrivedKeys.add(m);
			setDone(key);
		}, costOf(key, base));
		return () => {
			window.clearTimeout(t);
			if (progress) end();
		};
	}, [key, ready, hold, base, progress, also]);
	return ready;
}
