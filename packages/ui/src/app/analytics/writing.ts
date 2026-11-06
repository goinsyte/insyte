import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Insyte writing something out: a beat per step of what it read, then the words two at a time.
 * A piece that has been written once is not written again — reopening a finding shows it settled —
 * and with reduced motion everything is simply there.
 */
const written = new Set<string>();

export function useWriting(key: string, steps: number, words: number) {
	const still = useReducedMotion();
	const done = still || written.has(key);
	const [phase, setPhase] = useState<"thinking" | "writing" | "done">(done ? "done" : "thinking");
	const [reached, setReached] = useState(done ? steps : 1);
	const [shown, setShown] = useState(done ? words : 0);

	// A new key starts over, unless it has been written before.
	useEffect(() => {
		const seen = still || written.has(key);
		setPhase(seen ? "done" : "thinking");
		setReached(seen ? steps : 1);
		setShown(seen ? words : 0);
	}, [key, still, steps, words]);

	useEffect(() => {
		if (phase === "thinking") {
			const t = window.setTimeout(() => {
				if (reached < steps) setReached((r) => r + 1);
				else setPhase("writing");
			}, 380);
			return () => window.clearTimeout(t);
		}
		if (phase === "writing") {
			if (shown >= words) {
				written.add(key);
				setPhase("done");
				return;
			}
			const t = window.setTimeout(() => setShown((n) => Math.min(words, n + 3)), 28);
			return () => window.clearTimeout(t);
		}
	}, [phase, reached, steps, shown, words, key]);

	return { phase, reached, shown, seconds: Math.max(1, Math.round((steps * 380) / 1000)) };
}
