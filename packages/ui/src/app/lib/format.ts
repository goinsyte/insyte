import type { Currency } from "./types/domain.ts";

const minorDigits = new Map<string, number>();

/**
 * The decimals an amount in `currency` is written with: its minor unit's, as Intl knows them ("€ 24,95", "¥ 2.495"),
 * at most two, because Insyte keeps two for the three-decimal currencies too (`minorDigits` in the fx module).
 */
export function minorDigitsOf(currency: string) {
	let digits = minorDigits.get(currency);
	if (digits === undefined) {
		try {
			const own = new Intl.NumberFormat("nl-NL", { style: "currency", currency }).resolvedOptions();
			digits = Math.min(own.maximumFractionDigits ?? 2, 2);
		} catch {
			digits = 2;
		}
		minorDigits.set(currency, digits);
	}
	return digits;
}

/** Whole units, for a KPI tile, a sum or a threshold ("€ 1.235"): the options a caller passes to opt in. */
export const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

/**
 * An amount in `currency`, Dutch. A record's amount (an order, a product, a refund) keeps its minor digits
 * ("US$ 24,95", never "US$ 25"); a figure that sums many asks for `WHOLE`.
 */
export function formatCurrency(
	value: number,
	currency: Currency = "USD",
	options?: Intl.NumberFormatOptions,
) {
	return new Intl.NumberFormat("nl-NL", {
		style: "currency",
		currency,
		maximumFractionDigits: minorDigitsOf(currency),
		...options,
	}).format(value);
}

/** A product's price over its variants: "€ 24,95", or "vanaf € 9,95" when one variant costs more than the lowest. */
export function formatPriceFrom(lowest: number, highest: number | undefined, currency?: Currency) {
	const price = formatCurrency(lowest, currency);
	return highest !== undefined && highest > lowest ? `vanaf ${price}` : price;
}

/** The sign an amount in `currency` is written with in Dutch: "€", "US$", "£"; the code itself for one Intl lacks. */
export function currencySymbol(currency: string) {
	try {
		const parts = new Intl.NumberFormat("nl-NL", { style: "currency", currency }).formatToParts(0);
		return parts.find((p) => p.type === "currency")?.value ?? currency;
	} catch {
		return currency;
	}
}

export function formatCompactNumber(value: number) {
	return new Intl.NumberFormat("nl-NL", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

export function formatPercent(value: number, fractionDigits = 1) {
	const n = value.toLocaleString("nl-NL", {
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	});
	return `${value > 0 ? "+" : ""}${n}%`;
}

/**
 * The zone every date is shown in: Insyte's own (the workspace's arrives with its settings). Named, so the console's
 * server (UTC) and the browser write the same day and hour, and hydration never meets two dates.
 */
export const ZONE = "Europe/Amsterdam";

/** How a date and a time are written: the workspace's choice at Instellingen → Regio. */
export interface Notation {
	readonly dateFormat: "DD MMM YYYY" | "MMM DD, YYYY" | "YYYY-MM-DD";
	readonly timeFormat: "24h" | "12h";
}

/** "22 nov 2026, 13:09": Dutch, and what a host that names no notation (the design app) writes. */
export const DEFAULT_NOTATION: Notation = { dateFormat: "DD MMM YYYY", timeFormat: "24h" };

let currentNotation: () => Notation = () => DEFAULT_NOTATION;

/**
 * Where the formatters read the notation from. The host sets it once: the console reads the request's on its server
 * (one isolate serves many workspaces) and the tab's in the browser. Nothing read: the default.
 */
export function readNotationFrom(read: () => Notation | undefined) {
	currentNotation = () => read() ?? DEFAULT_NOTATION;
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** One `Intl.DateTimeFormat` per locale and options, made once: a long list writes hundreds of dates. */
function dateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions) {
	const key = `${locale}|${JSON.stringify(options)}`;
	let format = formats.get(key);
	if (format === undefined) {
		format = new Intl.DateTimeFormat(locale, options);
		formats.set(key, format);
	}
	return format;
}

const partOf = (parts: ReadonlyArray<Intl.DateTimeFormatPart>, type: Intl.DateTimeFormatPartTypes) =>
	parts.find((p) => p.type === type)?.value;

/**
 * The 12-hour clock's "a.m." and "p.m." written by Insyte rather than by the runtime's ICU, which says "PM" in one
 * engine and "p.m." in another, with a plain or a narrow space before it: the server and the browser write the same.
 */
function dayPeriodOf(parts: Array<Intl.DateTimeFormatPart>, d: Date, timeZone: string | undefined) {
	const i = parts.findIndex((p) => p.type === "dayPeriod");
	if (i < 0) return;
	const hour = Number(
		dateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(d),
	);
	parts[i] = { type: "dayPeriod", value: hour < 12 ? "a.m." : "p.m." };
	const before = parts[i - 1];
	if (before?.type === "literal") parts[i - 1] = { type: "literal", value: " " };
}

/**
 * A date, and its time when `options` ask for the hour, in the notation: day-month-year as Intl writes it in Dutch,
 * month first ("nov 22, 2026"), or numbers year first ("2026-11-22"); the clock in 24 or 12 hours. The options say
 * which parts to show, as for `Intl.DateTimeFormat`.
 */
export function formatDate(
	value: string | Date,
	options?: Intl.DateTimeFormatOptions,
	notation: Notation = currentNotation(),
) {
	const d = typeof value === "string" ? new Date(value) : value;
	const opts: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: ZONE,
		...options,
	};
	// The 24-hour clock is Dutch's own, so only the 12-hour one is asked for.
	const twelve = opts.hour !== undefined && notation.timeFormat === "12h";
	if (twelve) {
		delete opts.hourCycle;
		opts.hour12 = true;
	}
	const format = dateTimeFormat("nl-NL", opts);
	if (notation.dateFormat === "DD MMM YYYY" && !twelve) return format.format(d);
	const parts = format.formatToParts(d);
	if (twelve) dayPeriodOf(parts, d, opts.timeZone);
	const whole = parts.map((p) => p.value).join("");
	if (notation.dateFormat === "DD MMM YYYY") return whole;
	const firstTime = parts.findIndex((p) => p.type === "hour");
	const dateParts = firstTime < 0 ? parts : parts.slice(0, firstTime);
	const day = partOf(dateParts, "day");
	const month = partOf(dateParts, "month");
	const year = partOf(dateParts, "year");
	if (day === undefined && month === undefined && year === undefined) return whole;
	let date: string;
	if (notation.dateFormat === "YYYY-MM-DD") {
		const numbers = dateTimeFormat("nl-NL", {
			timeZone: opts.timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(d);
		date = [
			year === undefined ? undefined : partOf(numbers, "year"),
			month === undefined ? undefined : partOf(numbers, "month"),
			day === undefined ? undefined : partOf(numbers, "day"),
		]
			.filter((p) => p !== undefined)
			.join("-");
	} else {
		const monthDay = [month, day].filter((p) => p !== undefined).join(" ");
		date = year === undefined ? monthDay : monthDay === "" ? year : `${monthDay}, ${year}`;
	}
	const weekday = partOf(dateParts, "weekday");
	if (weekday !== undefined) date = `${weekday} ${date}`;
	const time = firstTime < 0 ? "" : parts.slice(firstTime).map((p) => p.value).join("");
	return time === "" ? date : `${date}, ${time}`;
}

export function formatDateTime(value: string | Date, notation?: Notation) {
	return formatDate(
		value,
		{
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		},
		notation,
	);
}

const RELATIVE_THRESHOLDS: Array<[number, "second" | "minute" | "hour" | "day" | "week" | "month" | "year"]> = [
	[60, "second"],
	[60, "minute"],
	[24, "hour"],
	[7, "day"],
	[4.34524, "week"],
	[12, "month"],
	[Number.POSITIVE_INFINITY, "year"],
];

const RELATIVE_UNIT: Record<"minute" | "hour" | "day" | "week" | "month" | "year", [string, string]> = {
	minute: ["min", "min"],
	hour: ["uur", "uur"],
	day: ["dag", "dagen"],
	week: ["week", "weken"],
	month: ["maand", "maanden"],
	year: ["jaar", "jaar"],
};

/** "zojuist", "5 min geleden", "gisteren", "2 dagen geleden"; ahead: "over 5 min", "morgen". */
export function formatRelative(value: string | Date) {
	const date = typeof value === "string" ? new Date(value) : value;
	const diff = (date.getTime() - Date.now()) / 1000;
	let unitValue = diff;
	let unit: (typeof RELATIVE_THRESHOLDS)[number][1] = "year";
	for (const [size, u] of RELATIVE_THRESHOLDS) {
		if (Math.abs(unitValue) < size) {
			unit = u;
			break;
		}
		unitValue /= size;
	}
	const n = Math.round(unitValue);
	if (unit === "second" || n === 0) return "zojuist";
	const past = n < 0;
	const abs = Math.abs(n);
	if (unit === "day" && abs === 1) return past ? "gisteren" : "morgen";
	const [one, many] = RELATIVE_UNIT[unit];
	const phrase = `${abs} ${abs === 1 ? one : many}`;
	return past ? `${phrase} geleden` : `over ${phrase}`;
}

export function initials(name: string) {
	return name
		.split(/\s+/)
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

export function pluralize(value: number, singular: string, plural?: string) {
	return `${value} ${value === 1 ? singular : (plural ?? `${singular}s`)}`;
}
