import { useEffect, useRef, useState } from "react";

/**
 * The shell's keys with ⌘ (Ctrl elsewhere): K opens and closes the palette, J opens Vraag Insyte when the host passes
 * `onAsk`. Sneltoetsen lists both, so both work wherever the shell is.
 */
export function useCommandPalette(onAsk?: () => void) {
	const [open, setOpen] = useState(false);
	// The latest, for a listener added once.
	const ask = useRef(onAsk);
	ask.current = onAsk;

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
			const k = e.key.toLowerCase();
			if (k === "k") {
				e.preventDefault();
				setOpen((v) => !v);
			} else if (k === "j" && ask.current) {
				// Not over a dialog, or a key the page already took (the rule `goto-keys.tsx` keeps).
				const t = e.target;
				if (e.defaultPrevented || (t instanceof Element && t.closest("[role=dialog]") !== null)) return;
				e.preventDefault();
				ask.current();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return { open, setOpen };
}
