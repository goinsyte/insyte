/*
 * The inbox's channels beside email (PLAN 27, design §4): WhatsApp, Instagram and the website chat.
 * A thread belongs to one channel; a chat channel's letter is bubbles, not a mail.
 *
 * The platforms' own rules are the product's rules (docs/backend/integrations.md §5.2–5.3): on
 * WhatsApp and Instagram a business may answer freely for 24 hours after the customer's last
 * message; after that WhatsApp allows only an approved template. Pure, so the rule is tested alone.
 */

export type ChannelId = "email" | "whatsapp" | "instagram" | "webchat";

export const CHANNEL_LABEL: Record<ChannelId, string> = {
	email: "E-mail",
	whatsapp: "WhatsApp",
	instagram: "Instagram",
	webchat: "Websitechat",
};

/** The chat channels, in the order the panel lists them after the mailboxes. */
export const CHAT_CHANNELS: ReadonlyArray<Exclude<ChannelId, "email">> = ["whatsapp", "instagram", "webchat"];

export type ChatMessage = {
	id: string;
	from: "customer" | "team" | "insyte";
	name?: string | undefined;
	at: string;
	text: string;
	/** For what the business sent: whether the customer has read it. */
	read?: boolean | undefined;
	/** Sent as an approved WhatsApp template, by its name. */
	template?: string | undefined;
};

/** What the customer agent did with a website-chat conversation (§5). */
export type AgentHandling = { state: "handled" | "handed_over" | "active"; reason?: string | undefined; summary?: string | undefined; at: string };

export type ChannelThread = {
	id: string;
	channel: Exclude<ChannelId, "email">;
	customer: { name: string; handle: string };
	subject: string;
	messages: ChatMessage[];
	unread: boolean;
	labels: string[];
	storeId?: string | undefined;
	orderRef?: string | undefined;
	agent?: AgentHandling | undefined;
};

export type WhatsAppTemplate = { id: string; name: string; label: string; body: string; status: "approved" | "pending" };

export type ChannelsSeed = {
	threads: ChannelThread[];
	/** Per channel: connected, off, or in need of attention; with the account shown in the panel. */
	accounts: Record<Exclude<ChannelId, "email">, { status: "connected" | "disconnected" | "action_required"; account: string; detail: string }>;
	templates: WhatsAppTemplate[];
};

/* ── the reply window ──────────────────────────────────────────────────────────────────────── */

export const WINDOW_HOURS = 24;

export type ReplyWindow = { applies: boolean; open: boolean; hoursLeft: number; closesAt?: Date | undefined };

/**
 * Whether a free reply may still go out on this channel. Website chat and email have no window.
 * `lastInboundAt` is the customer's last message; the window runs 24 hours from it.
 */
export function replyWindow(channel: ChannelId, lastInboundAt: string | undefined, now: number): ReplyWindow {
	if (channel !== "whatsapp" && channel !== "instagram") return { applies: false, open: true, hoursLeft: Number.POSITIVE_INFINITY };
	if (!lastInboundAt) return { applies: true, open: false, hoursLeft: 0 };
	const closes = Date.parse(lastInboundAt) + WINDOW_HOURS * 3_600_000;
	const left = (closes - now) / 3_600_000;
	return { applies: true, open: left > 0, hoursLeft: Math.max(0, Math.floor(left)), closesAt: new Date(closes) };
}

/** What may be sent now: anything, only an approved template (WhatsApp), or nothing (Instagram). */
export function mayReply(channel: ChannelId, w: ReplyWindow): "free" | "template" | "none" {
	if (w.open) return "free";
	return channel === "whatsapp" ? "template" : "none";
}

export const lastInbound = (messages: ReadonlyArray<Pick<ChatMessage, "from" | "at">>) => [...messages].reverse().find((m) => m.from === "customer")?.at;

/** Fills `{{naam}}` and `{{order}}` in a template's body. */
export const fillTemplate = (body: string, vars: { naam: string; order?: string | undefined }) => body.replaceAll("{{naam}}", vars.naam).replaceAll("{{order}}", vars.order ?? "je bestelling");
