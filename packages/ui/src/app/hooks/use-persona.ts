import { useEffect, useState } from "react";
import {
	type AffiliateState,
	PERSONA_OPTIONS,
	type Persona,
	type PersonaSelection,
} from "../lib/types/persona";

const KEY = "insyte:persona";
const DEFAULT: PersonaSelection = "admin";

function read(): PersonaSelection {
	if (typeof window === "undefined") return DEFAULT;
	const raw = window.localStorage.getItem(KEY);
	if (!raw) return DEFAULT;
	if (PERSONA_OPTIONS.some((o) => o.value === raw)) {
		return raw as PersonaSelection;
	}
	return DEFAULT;
}

const listeners = new Set<() => void>();

export function setPersonaSelection(value: PersonaSelection) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(KEY, value);
	listeners.forEach((cb) => {
		cb();
	});
}

/**
 * Keeps the selection on the side of the product being shown. Signing in to the supplier portal,
 * finishing onboarding as a partner, or opening a link into either lands in that persona's shell,
 * and the avatar, the switcher and the affiliate's review state all read the selection, so without
 * this they would still be the admin's. Reads storage rather than hook state, so a stored
 * "affiliate-pending" is kept when the shell is already the affiliate's.
 */
export function ensurePersona(persona: Persona) {
	const current = PERSONA_OPTIONS.find((o) => o.value === read());
	if (current?.persona === persona) return;
	setPersonaSelection(persona);
}

export function usePersonaSelection(): {
	selection: PersonaSelection;
	persona: Persona;
	affiliateState?: AffiliateState;
	landing: string;
} {
	const [selection, setSelection] = useState<PersonaSelection>(DEFAULT);

	useEffect(() => {
		setSelection(read());
		const cb = () => setSelection(read());
		listeners.add(cb);
		const onStorage = (e: StorageEvent) => {
			if (e.key === KEY) cb();
		};
		window.addEventListener("storage", onStorage);
		return () => {
			listeners.delete(cb);
			window.removeEventListener("storage", onStorage);
		};
	}, []);

	const meta =
		PERSONA_OPTIONS.find((o) => o.value === selection) ?? PERSONA_OPTIONS[0];
	return {
		selection,
		persona: meta.persona,
		affiliateState: meta.affiliateState,
		landing: meta.landing,
	};
}
