import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatAction, ChatReaction, RichMessage } from "../../data-source";
import type { Conversation } from "../lib/types/domain";

export type ChatState = {
	drafts: Record<string, string>; // conversation_id -> draft text
	extra: Record<string, RichMessage[]>; // conversation_id -> appended messages
	reactions: Record<string, ChatReaction[]>; // message_id -> current reactions
	/** Channels and direct messages started in this browser, beside the seeded ones. */
	created: Conversation[];
	pinned: string[];
	muted: string[];
	/** Replies written here, under the message they answer. */
	threadExtra: Record<string, RichMessage[]>;
	/** Where an action has got to since it was posted: confirmed, run, undone, declined. */
	actions: Record<string, Partial<ChatAction>>;
	/** A message rewritten or taken back by its author. */
	edits: Record<string, { body?: string; deleted?: boolean; edited_at?: string }>;
	pinnedMessages: string[];
	/** Who is typing where, for the line above the composer. Not kept across reloads. */
	typing: Record<string, string | undefined>;
};

export type ChatActions = {
	setDraft: (conversationId: string, value: string) => void;
	appendMessage: (conversationId: string, msg: RichMessage) => void;
	setReactions: (messageId: string, reactions: ChatReaction[]) => void;
	addConversation: (c: Conversation) => void;
	removeConversation: (id: string) => void;
	togglePinned: (id: string) => void;
	toggleMuted: (id: string) => void;
	appendReply: (parentId: string, msg: RichMessage) => void;
	setAction: (actionId: string, patch: Partial<ChatAction>) => void;
	editMessage: (messageId: string, body: string) => void;
	deleteMessage: (messageId: string) => void;
	restoreMessage: (messageId: string) => void;
	togglePinnedMessage: (messageId: string) => void;
	setTyping: (conversationId: string, who: string | undefined) => void;
};

export const useChatStore = create<ChatState & ChatActions>()(
	persist(
		(set, get) => ({
			drafts: {},
			extra: {},
			reactions: {},
			created: [],
			pinned: [],
			muted: [],
			threadExtra: {},
			actions: {},
			edits: {},
			pinnedMessages: [],
			typing: {},

			appendReply: (parentId, msg) =>
				set({ threadExtra: { ...get().threadExtra, [parentId]: [...(get().threadExtra[parentId] ?? []), msg] } }),
			setAction: (actionId, patch) => set({ actions: { ...get().actions, [actionId]: { ...get().actions[actionId], ...patch } } }),
			editMessage: (messageId, body) =>
				set({ edits: { ...get().edits, [messageId]: { ...get().edits[messageId], body, edited_at: new Date().toISOString() } } }),
			deleteMessage: (messageId) => set({ edits: { ...get().edits, [messageId]: { ...get().edits[messageId], deleted: true } } }),
			restoreMessage: (messageId) => set({ edits: { ...get().edits, [messageId]: { ...get().edits[messageId], deleted: false } } }),
			togglePinnedMessage: (messageId) =>
				set({
					pinnedMessages: get().pinnedMessages.includes(messageId)
						? get().pinnedMessages.filter((m) => m !== messageId)
						: [...get().pinnedMessages, messageId],
				}),
			setTyping: (conversationId, who) => set({ typing: { ...get().typing, [conversationId]: who } }),

			addConversation: (c) => set({ created: [c, ...get().created.filter((x) => x.id !== c.id)] }),
			removeConversation: (id) => set({ created: get().created.filter((c) => c.id !== id) }),
			togglePinned: (id) =>
				set({ pinned: get().pinned.includes(id) ? get().pinned.filter((p) => p !== id) : [...get().pinned, id] }),
			toggleMuted: (id) =>
				set({ muted: get().muted.includes(id) ? get().muted.filter((p) => p !== id) : [...get().muted, id] }),

			setDraft: (conversationId, value) =>
				set({ drafts: { ...get().drafts, [conversationId]: value } }),

			appendMessage: (conversationId, msg) =>
				set({
					extra: {
						...get().extra,
						[conversationId]: [...(get().extra[conversationId] ?? []), msg],
					},
				}),

			setReactions: (messageId, reactions) =>
				set({
					reactions: { ...get().reactions, [messageId]: reactions },
				}),
		}),
		{
			name: "insyte:chat:v1",
			partialize: ({ typing: _typing, ...kept }) => kept,
		},
	),
);
