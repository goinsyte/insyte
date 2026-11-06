/*
 * Days, as the home speaks about them. A day is a local calendar date written YYYY-MM-DD, so "due
 * Friday" means Friday wherever the operator is, and comparing two days is comparing two strings.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar day a moment falls on, in local time. */
export function dayKey(at: number | Date = Date.now()): string {
	const d = new Date(at);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The day `n` days after `from` (negative for before). */
export function addDays(from: number | Date, n: number): string {
	const d = new Date(from);
	d.setDate(d.getDate() + n);
	return dayKey(d);
}

/** Midnight at the start of a day key, local. */
export function dayStart(key: string): number {
	const [y, m, d] = key.split("-").map(Number);
	return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
}

/** A moment today at `hh:mm`, or on the day `days` from now. */
export function at(hm: string, days = 0, now = Date.now()): number {
	const d = new Date(now);
	d.setDate(d.getDate() + days);
	const [h, m] = hm.split(":").map(Number);
	d.setHours(h ?? 9, m ?? 0, 0, 0);
	return d.getTime();
}

const WEEKDAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"] as const;
const SHORT_DAYS: Record<string, number> = { zo: 0, ma: 1, di: 2, wo: 3, do: 4, vr: 5, za: 6 };
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;

/**
 * Reads a date off the end of a quick-add line, the way it is said: "morgen", "overmorgen",
 * "vrijdag", "volgende week", "over 3 dagen", "12 nov". Returns the line without the date words and
 * the day it names, or the line unchanged when it names none.
 */
export function parseDue(line: string, now = Date.now()): { text: string; due?: string; said?: string } {
	const rules: Array<[RegExp, (m: RegExpExecArray) => string | undefined]> = [
		[/\b(vandaag)\s*$/i, () => dayKey(now)],
		[/\b(overmorgen)\s*$/i, () => addDays(now, 2)],
		[/\b(morgen)\s*$/i, () => addDays(now, 1)],
		[/\b(volgende week)\s*$/i, () => addDays(now, ((8 - new Date(now).getDay()) % 7) || 7)],
		[/\bover (\d{1,2}) dag(?:en)?\s*$/i, (m) => addDays(now, Number(m[1]))],
		[
			/\b(?:op |vóór |voor )?(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\s*$/i,
			(m) => {
				const word = (m[1] ?? "").toLowerCase();
				const want = word.length === 2 ? SHORT_DAYS[word] : WEEKDAYS.indexOf(word as (typeof WEEKDAYS)[number]);
				if (want === undefined || want < 0) return undefined;
				const diff = (want - new Date(now).getDay() + 7) % 7 || 7;
				return addDays(now, diff);
			},
		],
		[
			/\b(\d{1,2}) (jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\s*$/i,
			(m) => {
				const month = MONTHS.indexOf((m[2] ?? "").toLowerCase().slice(0, 3) as (typeof MONTHS)[number]);
				if (month < 0) return undefined;
				const today = new Date(now);
				let d = new Date(today.getFullYear(), month, Number(m[1]));
				if (d.getTime() < dayStart(dayKey(now))) d = new Date(today.getFullYear() + 1, month, Number(m[1]));
				return dayKey(d);
			},
		],
	];
	for (const [re, make] of rules) {
		const m = re.exec(line);
		if (!m) continue;
		const due = make(m);
		if (due === undefined) continue;
		const text = line.slice(0, m.index).replace(/[\s,–-]+$/, "").trim();
		if (text.length === 0) continue;
		return { text, due, said: m[0].trim() };
	}
	return { text: line.trim() };
}

/** "vandaag", "morgen", "gisteren", "vrijdag", "12 nov": a day as it reads beside a row. */
export function dayLabel(key: string, now = Date.now()): string {
	const diff = Math.round((dayStart(key) - dayStart(dayKey(now))) / 86_400_000);
	if (diff === 0) return "vandaag";
	if (diff === 1) return "morgen";
	if (diff === -1) return "gisteren";
	const d = new Date(dayStart(key));
	if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()] ?? key;
	return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const CLOCK = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });
export const clock = (t: number) => CLOCK.format(t);

/** "zojuist", "4 min geleden", "2 u geleden", "gisteren". */
export function ago(t: number, now = Date.now()): string {
	const m = Math.round((now - t) / 60_000);
	if (m < 1) return "zojuist";
	if (m < 60) return `${m} min geleden`;
	const h = Math.round(m / 60);
	if (dayKey(t) === dayKey(now)) return `${h} u geleden`;
	if (dayKey(t) === addDays(now, -1)) return "gisteren";
	return `${Math.round((dayStart(dayKey(now)) - dayStart(dayKey(t))) / 86_400_000)} dagen geleden`;
}
