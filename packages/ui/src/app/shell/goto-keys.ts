import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { GOTO_DEFAULTS } from "../lib/settings-depth";
import { useSettingsDepth } from "../stores/settings-depth-store";

/** Whether a key press belongs to whatever the person is typing in. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest("[role=grid],[role=dialog],[role=menu]") !== null);

/**
 * G, then a key: go to an area (PLAN 43). The keys are the ones set under Instellingen →
 * Sneltoetsen. Never while typing, never with a modifier, and the G waits a second for its partner.
 */
export function useGoToKeys(enabled: boolean) {
	const navigate = useNavigate();
	useEffect(() => {
		if (!enabled) return;
		let armed = 0;
		const onKey = (e: KeyboardEvent) => {
			const { gotoOn, keys } = useSettingsDepth.getState();
			if (!gotoOn || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
			const k = e.key.length === 1 ? e.key.toUpperCase() : "";
			if (!k) return;
			if (armed && Date.now() - armed < 1000) {
				armed = 0;
				const hit = GOTO_DEFAULTS.find((g) => (keys[g.id] ?? g.key) === k);
				if (hit) {
					e.preventDefault();
					void navigate({ to: hit.to as never });
				}
				return;
			}
			if (k === "G") armed = Date.now();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enabled, navigate]);
}
