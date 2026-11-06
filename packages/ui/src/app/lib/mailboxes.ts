import type { EmailThread } from "./types/domain";

/**
 * The mailboxes the inbox reads, each one an email integration's account. A mailbox is only as live
 * as its integration: connected, it has synced and says when; disconnected, its threads stay but no
 * new mail arrives until it is reconnected, and the inbox says so rather than going quiet.
 */
export type MailboxProvider = "gmail" | "outlook";

export type Mailbox = { id: string; address: string; provider: MailboxProvider; label: string };

export const MAILBOXES: ReadonlyArray<Mailbox> = [
	{ id: "support", address: "support@allure.eu", provider: "gmail", label: "Support" },
	{ id: "returns", address: "returns@allure.eu", provider: "outlook", label: "Retouren" },
];

export const PROVIDER_LABEL: Record<MailboxProvider, string> = { gmail: "Gmail", outlook: "Outlook" };

/** Threads about returns, refunds and exchanges arrive at the returns mailbox; the rest at support. */
export function mailboxOf(t: Pick<EmailThread, "subject" | "labels"> & { mailbox?: string }): string {
	if (t.mailbox) return t.mailbox;
	const text = `${t.subject} ${t.labels.join(" ")}`.toLowerCase();
	return /return|refund|exchange|wrong size|retour|terugbetal|ruil|verkeerde maat/.test(text) ? "returns" : "support";
}

export type MailboxStatus = { live: boolean; line: string };

export function mailboxStatus(
	m: Mailbox,
	integrations: ReadonlyArray<{ key: string; status: string; syncedAt?: string }>,
): MailboxStatus {
	const i = integrations.find((x) => x.key === m.provider);
	if (i?.status !== "connected") return { live: false, line: `${PROVIDER_LABEL[m.provider]} ontkoppeld` };
	return { live: true, line: i.syncedAt ? `Gesynchroniseerd ${syncedAgo(i.syncedAt)}` : "Gesynchroniseerd" };
}

function syncedAgo(iso: string): string {
	const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
	if (min < 1) return "zojuist";
	if (min < 60) return `${min} min geleden`;
	const h = Math.round(min / 60);
	if (h < 24) return `${h} uur geleden`;
	return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(new Date(iso));
}
