/*
 * The customer-facing agent (PLAN 28, ADR-0027 "the channel agent"): per channel whether it answers
 * on its own, only drafts, or stays out; when it works; when it hands over; and the words it uses.
 *
 * Pure: opening hours, what the agent does with a message right now, and the sentence that says when
 * a person replies. Tested on their own.
 */

export type ChannelMode = "auto" | "drafts" | "off";

export const MODE_LABEL: Record<ChannelMode, string> = { auto: "Zelf antwoorden", drafts: "Alleen concepten", off: "Uit" };

/** Monday first, as the operator reads a week. */
export const DAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const;

export type DayHours = { open: boolean; from: string; to: string };

export type CustomerAgentSettings = {
	on: boolean;
	channels: { webchat: ChannelMode; whatsapp: ChannelMode; instagram: ChannelMode; email: ChannelMode };
	/** Index 0 is Monday. */
	hours: DayHours[];
	/** Outside hours: answer from the knowledge base, or take the question and say when a person replies. */
	outside: "answer" | "take";
	handover: { unsure: boolean; asksPerson: boolean; topics: string[]; afterMessages: number | null };
	tone: "brand" | "short" | "formal";
	handoverMessage: string;
};

export type AgentDay = { conversations: number; handled: number; handedOver: number; waiting: number; avgSeconds: number };

export type CustomerAgentSeed = { settings: CustomerAgentSettings; today: AgentDay };

const minutes = (hhmm: string) => {
	const [h, m] = hhmm.split(":").map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
};

/** Monday is 0, as `DAYS`; JavaScript's Sunday-first day turned round. */
export const weekday = (d: Date) => (d.getDay() + 6) % 7;

export function isOpen(hours: ReadonlyArray<DayHours>, at: Date): boolean {
	const day = hours[weekday(at)];
	if (!day?.open) return false;
	const now = at.getHours() * 60 + at.getMinutes();
	return now >= minutes(day.from) && now < minutes(day.to);
}

/** "vandaag om 9:00", "morgen vanaf 9:00", "maandag vanaf 9:00": when a person is next there. */
export function nextOpenLabel(hours: ReadonlyArray<DayHours>, at: Date): string {
	for (let i = 0; i < 8; i++) {
		const d = new Date(at);
		d.setDate(d.getDate() + i);
		const day = hours[weekday(d)];
		if (!day?.open) continue;
		const from = minutes(day.from);
		if (i === 0) {
			const now = at.getHours() * 60 + at.getMinutes();
			if (now < from) return `vandaag vanaf ${day.from.replace(/^0/, "")}`;
			if (now < minutes(day.to)) return "nu";
			continue;
		}
		return `${i === 1 ? "morgen" : DAYS[weekday(d)]} vanaf ${day.from.replace(/^0/, "")}`;
	}
	return "zodra er iemand is";
}

export type AgentMove = "answer" | "draft" | "handover" | "silent";

/**
 * What the agent does with a new message on a channel right now. Off means nothing; drafts means a
 * draft for the inbox; auto answers within hours, and outside them either answers from the knowledge
 * base or takes the question and hands over. A spent budget hands over everything (ADR-0027).
 */
export function move(s: CustomerAgentSettings, channel: keyof CustomerAgentSettings["channels"], at: Date, ctx: { budgetSpent?: boolean; topic?: string; asksPerson?: boolean } = {}): AgentMove {
	const mode = s.on ? s.channels[channel] : "off";
	if (mode === "off") return "silent";
	if (ctx.budgetSpent) return "handover";
	if (ctx.asksPerson && s.handover.asksPerson) return "handover";
	if (ctx.topic && s.handover.topics.includes(ctx.topic)) return "handover";
	if (mode === "drafts") return "draft";
	if (!isOpen(s.hours, at) && s.outside === "take") return "handover";
	return "answer";
}
