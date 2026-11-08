import type { RoleDef } from "@insyte/domain/Permissions";
import { createContext, useContext } from "react";
import type { ApiKey, ApiRequest } from "../lib/developer-core";
import type { TeamGate } from "../team/source";

/**
 * What Instellingen → API-sleutels (and Agents en MCP) reads and does, from whoever hosts it (as `team/source.tsx` for Team): the design
 * app answers from its demo stores and simulated logs, the console from the server. Every write resolves once it took;
 * a host that refuses says why itself.
 */

export type KeyUsage = ReadonlyArray<{ day: string; count: number; errors: number }>;

export interface DeveloperSource {
	keys: ReadonlyArray<ApiKey>;
	roles: ReadonlyArray<RoleDef>;
	stores: ReadonlyArray<{ id: string; name: string }>;
	can: { manage: TeamGate };
	/** The signed-in member, who makes the keys. */
	me: string;
	/** Where an MCP client connects (M19.3): the API's own host, `/mcp`. */
	mcpUrl: string;
	/** The webhook endpoints, for the card that links to them; absent where the host has none yet. */
	webhooks?: { count: number; failing: number } | undefined;
	/** A person's name, for "Gemaakt door". */
	personName: (memberId: string) => string;
	/** A key's recent requests and its 14 days of use. A hook: call it as one. */
	useActivity: (key: ApiKey, scopes: ReadonlyArray<string>) => { requests: ReadonlyArray<ApiRequest>; usage: KeyUsage };

	create: (input: Omit<ApiKey, "id" | "prefix" | "created_at" | "status">) => Promise<{ key: ApiKey; secret: string } | undefined>;
	update: (id: string, patch: { label?: string; ips?: ReadonlyArray<string> }) => Promise<boolean>;
	/** A new secret; the old one keeps working for `graceMs`. */
	rotate: (id: string, graceMs: number) => Promise<string | undefined>;
	endGrace: (id: string) => Promise<boolean>;
	revoke: (id: string) => Promise<boolean>;
	/** Undo of a revoke. */
	restore: (id: string) => Promise<boolean>;
}

const DeveloperSourceContext = createContext<DeveloperSource | null>(null);

export const DeveloperSourceProvider = DeveloperSourceContext.Provider;

export function useDeveloperSource(): DeveloperSource {
	const source = useContext(DeveloperSourceContext);
	if (source === null) throw new Error("A key screen needs a DeveloperSourceProvider around it.");
	return source;
}
