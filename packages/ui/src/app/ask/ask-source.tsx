import { createContext, useContext } from "react";
import type { Decision, ProposalAction, Turn } from "../lib/ask/types";

/**
 * What Vraag Insyte reads and does, from whoever hosts it (as `agent-log-source.tsx` is for Wat Insyte deed): the design
 * app from its scripted store, the console from `Ask.list`, `Ask.get` and the streamed `Ask.send` (M15 step 3). The
 * drawer, the page and the thread all read it.
 */
export interface AskSource {
	/** The viewer's conversations, newest first. */
	conversations: ReadonlyArray<{ id: string; title: string; at: number }>;
	active: string | null;
	/** The open conversation's turns, oldest first. */
	turns: ReadonlyArray<Turn> | undefined;
	ask: (text: string) => void;
	start: () => void;
	open: (id: string) => void;
	/** "Gesprek verwijderd", with Undo. */
	remove: (id: string) => void;
	/** A scripted turn has played to its end. */
	settle: (turnId: string) => void;
	decide: (turnId: string, d: Decision) => void;
	/** "Opnieuw vragen": the host asks the same question again; absent, the thread asks the first follow-up. */
	retry?: ((turnId: string) => void) | undefined;
	/** Whether a question is being answered, so the composer waits. */
	busy?: boolean | undefined;
	/** The first view: who is asking, and how much waits on them (none where the host does not know). */
	welcome: { name: string; needs: number | null; starts?: ReadonlyArray<string> | undefined };
	/** Under the welcome's lead, where the host's answers are not the demo's scripts. */
	note?: string | undefined;
	/** The records `@` offers in the composer, most pressing first. */
	mentions: ReadonlyArray<{ ref: string; hint: string; kind: "order" | "chargeback" }>;
	/** Filing a proposal an answer drew; absent where the host's answers draw none. */
	file?: ((action: ProposalAction) => void) | undefined;
	/** "Volledige pagina openen" from the panel: the host opens the conversation on its page; absent, `/ask`. */
	page?: (() => void) | undefined;
	/** How many actions Wat Insyte deed holds, for its link; absent where the host does not count them here. */
	actions?: number | undefined;
}

const Context = createContext<AskSource | null>(null);

export const AskSourceProvider = Context.Provider;

/** The host's Vraag Insyte, or `null` where it provides none. */
export function useHostedAskSource(): AskSource | null {
	return useContext(Context);
}

/** The host's Vraag Insyte, for the thread and the page, which are nothing without it. */
export function useAskSource(): AskSource {
	const source = useContext(Context);
	if (source === null) throw new Error("Vraag Insyte needs an AskSourceProvider around it.");
	return source;
}
