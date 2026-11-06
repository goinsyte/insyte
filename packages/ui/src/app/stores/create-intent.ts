import { useEffect } from "react";
import { create } from "zustand";

/*
 * "Make a new one", asked from somewhere other than the page that makes it: the area panel's primary
 * button, the top bar's + menu, the command palette. The asker records the intent and navigates;
 * the page, once mounted, sees an intent for its kind, opens its own create dialog and clears it.
 * That keeps every dialog owned by the page it belongs to.
 */

export type CreateKind = "order" | "customer" | "product" | "ticket" | "evidence" | "automation" | "thread" | "channel" | "return" | "course" | "sheet";

type CreateIntent = { kind: CreateKind | null; request: (k: CreateKind) => void; clear: () => void };

export const useCreateIntent = create<CreateIntent>()((set) => ({
	kind: null,
	request: (kind) => set({ kind }),
	clear: () => set({ kind: null }),
}));

/** On a page that makes `kind`: run `open` whenever someone asks for one. */
export function useOnCreate(kind: CreateKind, open: () => void) {
	const asked = useCreateIntent((s) => s.kind === kind);
	const clear = useCreateIntent((s) => s.clear);
	useEffect(() => {
		if (!asked) return;
		clear();
		open();
	}, [asked, clear, open]);
}

/** Where each kind is made. */
export const CREATE_ROUTE: Record<CreateKind, string> = {
	order: "/orders",
	customer: "/customers",
	product: "/products",
	ticket: "/tickets",
	evidence: "/chargebacks",
	automation: "/automations",
	thread: "/inbox",
	course: "/courses",
	sheet: "/sheets",
	channel: "/chats",
	return: "/returns",
};
