import { type ReactNode, useMemo, useRef } from "react";
import { fallbackName, requestsFor, usageFor } from "../lib/developer";
import { useGate } from "../stores/access-store";
import { useDeveloper } from "../stores/developer-store";
import { useSettings } from "../stores/settings-store";
import { useWorkspace } from "../stores/workspace-store";
import { type DeveloperSource, DeveloperSourceProvider } from "./source";

/** Who is signed in: the owner of the demo workspace. */
const ME = "mem_elena";

/**
 * API-sleutels' source in the design app: the demo stores and the simulated request logs, as the screens read them
 * before they had a source. What a revoke took is kept for its undo.
 */
export function DemoDeveloperSource({ children }: { children: ReactNode }) {
	const keys = useDeveloper((s) => s.apiKeys);
	const webhooks = useDeveloper((s) => s.webhooks);
	const roles = useSettings((s) => s.roles);
	const stores = useWorkspace((s) => s.stores);
	const members = useWorkspace((s) => s.members);
	const manage = useGate("integrations", 3);
	const revoked = useRef(new Map<string, () => void>());
	const done = Promise.resolve(true);

	const source: DeveloperSource = {
		keys,
		roles,
		stores,
		can: { manage },
		me: ME,
		webhooks: { count: webhooks.length, failing: webhooks.filter((w) => w.failures > 0 || w.autoDisabled).length },
		personName: (id) => members.find((m) => m.id === id)?.name ?? fallbackName(id),
		useActivity: (key, scopes) => {
			const requests = useMemo(() => requestsFor(key, scopes), [key, scopes.join()]);
			const usage = useMemo(() => usageFor(key), [key]);
			return { requests, usage };
		},
		create: (input) => Promise.resolve(useDeveloper.getState().createKey(input)),
		mcpUrl: "https://insyte-api-staging.ishak-73d.workers.dev/mcp",
		update: (id, patch) => {
			useDeveloper.getState().updateKey(id, {
				...(patch.label === undefined ? {} : { label: patch.label }),
				...(patch.ips === undefined ? {} : { ips: [...patch.ips] }),
			});
			return done;
		},
		rotate: (id, graceMs) => Promise.resolve(useDeveloper.getState().rotateKey(id, graceMs)),
		endGrace: (id) => {
			useDeveloper.getState().endGrace(id);
			return done;
		},
		revoke: (id) => {
			revoked.current.set(id, useDeveloper.getState().revokeKey(id));
			return done;
		},
		restore: (id) => {
			revoked.current.get(id)?.();
			return done;
		},
	};

	return <DeveloperSourceProvider value={source}>{children}</DeveloperSourceProvider>;
}
