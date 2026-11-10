/**
 * Convert ISO 3166-1 alpha-2 country code into emoji flag.
 * Uses regional indicator symbols (U+1F1E6..U+1F1FF).
 */
export function countryFlag(code: string): string {
	const cc = code.trim().toUpperCase();
	if (cc.length !== 2) return "🏳️";
	const a = cc.charCodeAt(0);
	const b = cc.charCodeAt(1);
	if (a < 65 || a > 90 || b < 65 || b > 90) return "🏳️";
	return (
		String.fromCodePoint(0x1f1e6 + (a - 65)) +
		String.fromCodePoint(0x1f1e6 + (b - 65))
	);
}

const NAMES: Record<string, string> = {
	US: "Verenigde Staten",
	GB: "Verenigd Koninkrijk",
	CA: "Canada",
	AU: "Australië",
	DE: "Duitsland",
	FR: "Frankrijk",
	IT: "Italië",
	ES: "Spanje",
	NL: "Nederland",
	BE: "België",
	AT: "Oostenrijk",
	LU: "Luxemburg",
	DK: "Denemarken",
	CH: "Zwitserland",
	JP: "Japan",
	NZ: "Nieuw-Zeeland",
	MX: "Mexico",
	BR: "Brazilië",
	IN: "India",
	AE: "Verenigde Arabische Emiraten",
	SE: "Zweden",
	NO: "Noorwegen",
	PL: "Polen",
	IE: "Ierland",
	PT: "Portugal",
	EG: "Egypte",
	TW: "Taiwan",
	KR: "Zuid-Korea",
};

export function countryName(code: string): string {
	return NAMES[code.toUpperCase()] ?? code.toUpperCase();
}
