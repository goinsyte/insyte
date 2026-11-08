import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Script, scriptFor } from "../lib/ask/scripts";

/*
 * Ask Insyte's conversations, shared by the drawer and the /ask page, so a thread started in the
 * drawer is the same thread the full page opens on. Persisted per browser.
 *
 * An assistant turn plays once — think, stream, settle — and is then marked `settled`, so a reload
 * or reopening the drawer shows the finished answer rather than replaying it. A proposal keeps what
 * the operator did with it.
 */

export type Decision = "open" | "filed" | "discarded";
export type Turn =
	| { id: string; role: "user"; text: string }
	| { id: string; role: "assistant"; script: Script; settled: boolean; decision: Decision };
export type Conversation = { id: string; title: string; at: number; turns: Turn[] };

let n = 0;
const id = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

export type AskState = {
	conversations: Conversation[];
	active: string | null;
	ask: (text: string) => void;
	settle: (turnId: string) => void;
	decide: (turnId: string, d: Decision) => void;
	start: () => void;
	open: (id: string) => void;
	remove: (id: string) => void;
};

export const useAsk = create<AskState>()(
	persist(
		(set, get) => ({
			conversations: [],
			active: null,
			ask: (text) => {
				const clean = text.trim();
				if (clean === "") return;
				const user: Turn = { id: id("u"), role: "user", text: clean };
				const reply: Turn = { id: id("a"), role: "assistant", script: scriptFor(clean), settled: false, decision: "open" };
				const current = get().conversations.find((c) => c.id === get().active);
				if (current) {
					set((s) => ({
						conversations: s.conversations.map((c) => (c.id === current.id ? { ...c, at: Date.now(), turns: [...c.turns, user, reply] } : c)),
					}));
					return;
				}
				const conv: Conversation = { id: id("c"), title: clean.slice(0, 60), at: Date.now(), turns: [user, reply] };
				set((s) => ({ conversations: [conv, ...s.conversations], active: conv.id }));
			},
			settle: (turnId) => set((s) => ({ conversations: s.conversations.map((c) => ({ ...c, turns: c.turns.map((t) => (t.id === turnId && t.role === "assistant" ? { ...t, settled: true } : t)) })) })),
			decide: (turnId, d) => set((s) => ({ conversations: s.conversations.map((c) => ({ ...c, turns: c.turns.map((t) => (t.id === turnId && t.role === "assistant" ? { ...t, decision: d } : t)) })) })),
			start: () => set({ active: null }),
			open: (cid) => set({ active: cid }),
			remove: (cid) => set((s) => ({ conversations: s.conversations.filter((c) => c.id !== cid), active: s.active === cid ? null : s.active })),
		}),
		{
			name: "insyte:ask:v1",
			version: 1,
			// A turn that was mid-play when the page closed is shown finished, not replayed.
			merge: (persisted, current) => {
				const p = persisted as Partial<AskState>;
				return {
					...current,
					...p,
					conversations: (p.conversations ?? []).map((c) => ({
						...c,
						turns: c.turns.map((t) => (t.role === "assistant" ? { ...t, settled: true } : t)),
					})),
				};
			},
		},
	),
);
