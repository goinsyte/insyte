import { create } from "zustand";
import { channelsSeed, emailThreads } from "../../data-source";
import type { AgentHandling, ChannelId, ChannelThread, ChatMessage } from "../lib/channels";
import { mailboxOf } from "../lib/mailboxes";
import type { EmailThread } from "../lib/types/domain";

/**
 * The inbox's threads, held where the area panel can count them as well as the page can show them.
 * A thread belongs to one mailbox and, once someone takes it, to one teammate.
 */
export type ThreadState = EmailThread & {
	mailbox: string;
	assignee?: string;
	archived?: boolean;
	spam?: boolean;
	body?: string;
	/** What was sent from here: replies, and forwards with who they went to. */
	sent?: Array<{ id: string; kind: "reply" | "forward"; at: string; body: string; to?: string }>;
	/** A chat channel's thread (PLAN 27): which channel, its bubbles, and what the customer agent did. */
	channel?: ChannelId;
	chat?: ChatMessage[];
	handle?: string;
	orderRef?: string;
	storeId?: string;
	agent?: AgentHandling;
};

/** A chat channel's conversation, as the inbox holds it beside the mail. */
function fromChannel(t: ChannelThread): ThreadState {
	const last = t.messages.at(-1);
	return {
		id: t.id,
		subject: t.subject,
		participants: [{ name: t.customer.name, email: t.customer.handle }, { name: "Northwind", email: "team@northwindclothing.co" }],
		last_message_at: last?.at ?? new Date().toISOString(),
		last_message_preview: last?.text ?? "",
		unread: t.unread,
		starred: false,
		labels: t.labels,
		messages: [],
		mailbox: t.channel,
		channel: t.channel,
		chat: t.messages,
		handle: t.customer.handle,
		orderRef: t.orderRef,
		storeId: t.storeId,
		agent: t.agent,
	} as ThreadState;
}

/** Who the seed's threads are already with: some taken, most waiting for someone. */
const SEED_ASSIGNEE: Record<string, string> = { th_2: "mem_elena", th_4: "mem_sofia", th_6: "mem_elena", th_9: "mem_ethan" };

type InboxState = {
	threads: ThreadState[];
	update: (id: string, patch: Partial<ThreadState>) => void;
	add: (t: ThreadState) => void;
	remove: (id: string) => void;
};

export const useInbox = create<InboxState>()((set) => ({
	threads: [
		...emailThreads.map((t) => ({ ...t, mailbox: mailboxOf(t), assignee: SEED_ASSIGNEE[t.id] })),
		...channelsSeed.threads.map(fromChannel),
	].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
	update: (id, patch) => set((s) => ({ threads: s.threads.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
	add: (t) => set((s) => ({ threads: [t, ...s.threads] })),
	remove: (id) => set((s) => ({ threads: s.threads.filter((t) => t.id !== id) })),
}));
