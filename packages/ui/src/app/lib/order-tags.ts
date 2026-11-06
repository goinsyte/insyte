/*
 * Order tags come in two kinds. Insyte sets some itself — a delay it detected, a tracking email it
 * sent, a draft it is holding — and those read as words, not as the keys they are stored under, and
 * change only through the action that set them. Everything else is the operator's own and can be
 * added or taken away freely.
 */
const SYSTEM: Record<string, string> = {
	at_risk: "Vertraagd",
	tracking_sent: "Track & trace verstuurd",
	draft: "Concept",
};

export const isSystemTag = (t: string): boolean => t in SYSTEM;
export const tagLabel = (t: string): string => SYSTEM[t] ?? t;

/** A typed tag as it is stored: lower case, words joined by hyphens. */
export const normaliseTag = (t: string): string => t.trim().toLowerCase().replace(/\s+/g, "-");
