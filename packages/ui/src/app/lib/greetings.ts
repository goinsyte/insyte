/* ─────────────────────────────────────────────────────────────────────
   Tonal greeting helpers — used by the admin DashboardHero (drenched
   mesh-dark) and the shared DashboardGreeting (supplier + affiliate).

   Voice: confident, atmospheric, precise. No exclamation marks, no SaaS
   smile. The greeting acknowledges *when* the operator is opening the
   app, not just *that* they did. Two layers:

     · Salutation — the full greeting line ("Good morning, Elena.").
     · Eyebrow    — the small ALL-CAPS mono label above the greeting
                    ("MONDAY MORNING", "FRIDAY EVENING", "WEEKEND",
                    etc.) — used in the hero only.

   Weekend operators are real for dropship. They get acknowledged as
   "light shift" / "calm watch" rather than fake-cheery weekend greetings.
   ──────────────────────────────────────────────────────────────────── */

export type GreetingMode =
	| "predawn"
	| "morning"
	| "afternoon"
	| "evening"
	| "latenight";

export type Greeting = {
	/** Full salutation line, ending with a period. No exclamation. */
	salutation: string;
	/** Optional mono eyebrow label, ALL CAPS. */
	eyebrow: string;
	/** Coarse time-of-day bucket; useful for downstream copy choices. */
	mode: GreetingMode;
};

function modeFor(hour: number): GreetingMode {
	if (hour < 5) return "predawn";
	if (hour < 12) return "morning";
	if (hour < 17) return "afternoon";
	if (hour < 22) return "evening";
	return "latenight";
}

/** Pick a tonal greeting for `name` based on `date`. Pure function so
 *  callers can deterministically test or pin a moment (e.g. screenshots). */
export function getGreeting(name: string, date: Date = new Date()): Greeting {
	const hour = date.getHours();
	const dow = date.getDay(); // 0 = Sunday … 6 = Saturday
	const mode = modeFor(hour);

	// Off-hours win first — they're the most distinctive moments.
	if (mode === "predawn") {
		return {
			salutation: `Nog wakker, ${name}?`,
			eyebrow: "Voor dag en dauw",
			mode,
		};
	}
	if (mode === "latenight") {
		return {
			salutation: `Laat aan het werk, ${name}.`,
			eyebrow: "Laat op de avond",
			mode,
		};
	}

	// Weekend — dropship operators do still log in, but the tone shifts
	// from "go" to "watch". No fake cheer, no exclamations.
	if (dow === 0) {
		return {
			salutation:
				mode === "morning"
					? `Zondagochtend, ${name}.`
					: mode === "afternoon"
						? `Rustige zondag, ${name}.`
						: `Zondagavond, ${name}.`,
			eyebrow: "Rustige wacht",
			mode,
		};
	}
	if (dow === 6) {
		return {
			salutation:
				mode === "morning"
					? `Zaterdagochtend, ${name}.`
					: mode === "afternoon"
						? `Zaterdag, ${name}.`
						: `Zaterdagavond, ${name}.`,
			eyebrow: "Lichte dienst",
			mode,
		};
	}

	// Weekday flavour — Monday gets a "fresh week" beat, Friday lights up.
	if (dow === 1 && mode === "morning") {
		return {
			salutation: `Maandagochtend, ${name}.`,
			eyebrow: "Nieuwe week",
			mode,
		};
	}
	if (dow === 5) {
		if (mode === "afternoon") {
			return {
				salutation: `Fijne vrijdag, ${name}.`,
				eyebrow: "Vrijdag",
				mode,
			};
		}
		if (mode === "evening") {
			return {
				salutation: `Vrijdagavond, ${name}. Afronden?`,
				eyebrow: "Vrijdag",
				mode,
			};
		}
	}

	// Default time-of-day phrasing.
	const salutation =
		mode === "morning"
			? `Goedemorgen, ${name}.`
			: mode === "afternoon"
				? `Goedemiddag, ${name}.`
				: `Goedenavond, ${name}.`;
	const eyebrow =
		mode === "morning"
			? "Ochtend"
			: mode === "afternoon"
				? "Middag"
				: "Avond";
	return { salutation, eyebrow, mode };
}
