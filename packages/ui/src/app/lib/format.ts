import type { Currency } from "./types/domain";

export function formatCurrency(
	value: number,
	currency: Currency = "USD",
	options?: Intl.NumberFormatOptions,
) {
	return new Intl.NumberFormat("nl-NL", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
		...options,
	}).format(value);
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

export function formatDate(
	value: string | Date,
	options?: Intl.DateTimeFormatOptions,
) {
	const d = typeof value === "string" ? new Date(value) : value;
	return new Intl.DateTimeFormat("nl-NL", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: ZONE,
		...options,
	}).format(d);
}

export function formatDateTime(value: string | Date) {
	return formatDate(value, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
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
