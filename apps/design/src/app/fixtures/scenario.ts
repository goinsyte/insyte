import type { Scenario } from "@insyte/ui/data-source";
export type { Scenario };
/**
 * Which state of the workspace the demo shows: the first day after setup, with every list empty; a
 * normal Tuesday a few months in, which is the demo; or the busy week that breaks a layout, with
 * long names and many rows. For design only.
 *
 * It is read once, when the page loads, from `?scenario=` or from what was picked last, and every
 * mock-data module picks its rows by it. Switching reloads the page, because those modules are
 * evaluated once; the workspace's own edits belong to one state, so they are cleared on the way.
 */

export const SCENARIOS: ReadonlyArray<{ id: Scenario; label: string; detail: string }> = [
	{ id: "empty", label: "Eerste dag · alles leeg", detail: "Net na het inrichten: elke lijst is leeg, elk scherm toont zijn lege staat." },
	{ id: "settled", label: "Gewone dinsdag", detail: "Een paar maanden in gebruik. Zo ziet de demo eruit." },
	{ id: "busy", label: "Drukke week · lange namen, veel rijen", detail: "De week die een layout breekt: honderden bestellingen, 60 open tickets, lange klantnamen." },
];

const KEY = "insyte:scenario";
const valid = (x: string | null): x is Scenario => x === "empty" || x === "settled" || x === "busy";

function read(): Scenario {
	if (typeof window === "undefined") return "settled";
	try {
		const q = new URLSearchParams(window.location.search).get("scenario");
		if (valid(q)) {
			window.localStorage.setItem(KEY, q);
			return q;
		}
		const saved = window.localStorage.getItem(KEY);
		return valid(saved) ? saved : "settled";
	} catch {
		return "settled";
	}
}

export const SCENARIO: Scenario = read();

/** The rows for the current state. `busy` is a thunk, so the big set is only built when asked for. */
export function byScenario<A>(c: { empty: A; settled: A; busy?: () => A }): A {
	if (SCENARIO === "empty") return c.empty;
	if (SCENARIO === "busy" && c.busy) return c.busy();
	return c.settled;
}

/** What survives a switch: who you are looking as, and how the console is laid out. */
const KEEP = [/persona/, /scenario/, /theme/, /nav/, /sidebar/, /rail/];

export function setScenario(next: Scenario, to?: string) {
	try {
		for (const k of Object.keys(window.localStorage)) {
			if (k.startsWith("insyte") && !KEEP.some((r) => r.test(k))) window.localStorage.removeItem(k);
		}
		window.localStorage.setItem(KEY, next);
	} catch {
		// Private mode: the reload below still carries the choice in the URL.
	}
	const url = new URL(to ?? window.location.pathname, window.location.origin);
	url.searchParams.set("scenario", next);
	window.location.assign(url.toString());
}

/* ── the busy week's extra rows ─────────────────────────────────────────────────────────────── */

const FIRST = ["Maximiliaan", "Anne-Sophie", "Jan-Willem", "Wilhelmina", "Bartholomeus", "Charlotte-Louise", "Evangelina", "Constantijn", "Frederique", "Hendrikus", "Marie-Claire", "Alexandrina", "Sebastiaan", "Theodora", "Guillaume"];
const LAST = [
	"van Oostenbrugge-de Wolff",
	"Vanderhaeghen-Moerman",
	"Brinkman-Hoogendoorn",
	"de Vries van Heijst",
	"Schimmelpenninck van der Oye",
	"Gonçalves Albuquerque",
	"Papadopoulou-Konstantinidou",
	"Wiśniewska-Kowalczyk",
	"van den Bosch tot Nijenrode",
	"Achterberg-Zuidervaart",
	"Østergaard-Lindqvist",
	"Fitzgerald-Montgomery",
];

/** A long, real-sounding name for row `i` of the busy set. */
export const longName = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
export const longEmail = (i: number) =>
	`${longName(i)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z]+/g, ".")}${i}@voorbeeldmail.nl`;
