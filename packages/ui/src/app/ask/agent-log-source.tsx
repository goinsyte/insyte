import { createContext, useContext } from "react";
import type { AgentLogEntry } from "../lib/agent-log";

/**
 * What Wat Insyte deed reads and does, from whoever hosts it (as `ai/autonomy-source.tsx` is for Zelfstandigheid): the
 * design app from its agent log store, the console from `AgentLog.list`, `.get`, `.undo`, `.redo` and `.compensate`
 * (M15 step 6). The log page, its drawer and the agent rows on a record all read it; a host that shows none of them
 * provides none.
 */
export interface AgentLogSource {
	/** Every row the viewer may see, newest first (the address's `?row=` among them, where the host has it). */
	entries: AgentLogEntry[];
	/** Today's counts, where the host keeps them over more rows than it lists; absent, the page counts its rows. */
	today?: { n: number; undone: number; failed: number } | undefined;
	/**
	 * "Ongedaan maken" inside the window; after it, the compensation by hand (`e.compensation`). The host says what it
	 * did, with "Toch laten staan", or why it could not.
	 */
	undo: (e: AgentLogEntry, now: number) => void;
	/** Which of the pages the log links to the host has yet: Vraag Insyte. */
	pages: { ask: boolean };
}

const Context = createContext<AgentLogSource | null>(null);

export const AgentLogSourceProvider = Context.Provider;

/**
 * The host's log, or `null` where it provides none: the agent rows on a record, the undo on a row and a card draw
 * nothing then, so a screen that shows them where the host has no log yet does not break.
 */
export function useAgentLogSourceOrNone(): AgentLogSource | null {
	return useContext(Context);
}

/** The host's log, for the page that is nothing without it (Wat Insyte deed). */
export function useAgentLogSource(): AgentLogSource {
	const source = useContext(Context);
	if (source === null) throw new Error("Wat Insyte deed needs an AgentLogSourceProvider around it.");
	return source;
}
