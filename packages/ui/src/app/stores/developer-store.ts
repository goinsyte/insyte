import { create } from "zustand";
import {
	type ApiKey,
	AUTO_DISABLE_AFTER,
	type Delivery,
	makeDelivery,
	newPrefix,
	newSecret,
	randomHex,
	rng,
	seedDeliveries,
	seedKeys,
	seedWebhooks,
	type WebhookEndpoint,
} from "../lib/developer";

/*
 * API keys, webhook endpoints and the deliveries made to them. In memory, like the workspace
 * store, so a reload puts the demo back; the request logs of a key are drawn from its id
 * (`requestsFor`), the deliveries live here because sending a test or redelivering adds to them.
 */

type DeveloperState = {
	apiKeys: ApiKey[];
	webhooks: WebhookEndpoint[];
	deliveries: Delivery[];

	/** Makes a key and returns it with its full secret, which is never stored. */
	createKey: (input: Omit<ApiKey, "id" | "prefix" | "created_at" | "status">) => { key: ApiKey; secret: string };
	updateKey: (id: string, patch: Partial<ApiKey>) => void;
	/** Revokes and returns the undo. */
	revokeKey: (id: string) => () => void;
	/** A new secret; the old one keeps working for `graceMs`. */
	rotateKey: (id: string, graceMs: number) => string;
	endGrace: (id: string) => void;

	addWebhook: (w: WebhookEndpoint) => void;
	updateWebhook: (id: string, patch: Partial<WebhookEndpoint>) => void;
	/** Removes and returns the undo. */
	removeWebhook: (id: string) => () => void;
	rotateSecret: (id: string) => { before: string; after: string };
	/** Sends one simulated test event; it succeeds unless the endpoint is failing. */
	sendTest: (endpointId: string, event: string) => Delivery;
	/** Sends a delivery again; the new attempt goes through. */
	redeliver: (deliveryId: string) => Delivery | undefined;
};

const hooks = seedWebhooks();

export const useDeveloper = create<DeveloperState>()((set, get) => ({
	apiKeys: seedKeys(),
	webhooks: hooks,
	deliveries: seedDeliveries(hooks),

	createKey: (input) => {
		const prefix = newPrefix();
		const key: ApiKey = { ...input, id: `key_${Date.now().toString(36)}`, prefix, created_at: new Date().toISOString(), status: "active" };
		set((s) => ({ apiKeys: [key, ...s.apiKeys] }));
		return { key, secret: `${prefix}_${randomHex(20)}` };
	},
	updateKey: (id, patch) => set((s) => ({ apiKeys: s.apiKeys.map((k) => (k.id === id ? { ...k, ...patch } : k)) })),
	revokeKey: (id) => {
		const before = get().apiKeys.find((k) => k.id === id);
		set((s) => ({ apiKeys: s.apiKeys.map((k) => (k.id === id ? { ...k, status: "revoked", revoked_at: new Date().toISOString(), rotated: undefined } : k)) }));
		return () => {
			if (before) set((s) => ({ apiKeys: s.apiKeys.map((k) => (k.id === id ? before : k)) }));
		};
	},
	rotateKey: (id, graceMs) => {
		const k = get().apiKeys.find((x) => x.id === id);
		const prefix = newPrefix();
		if (k) {
			set((s) => ({
				apiKeys: s.apiKeys.map((x) => (x.id === id ? { ...x, prefix, rotated: { previousPrefix: k.prefix, until: new Date(Date.now() + graceMs).toISOString() } } : x)),
			}));
		}
		return `${prefix}_${randomHex(20)}`;
	},
	endGrace: (id) => set((s) => ({ apiKeys: s.apiKeys.map((k) => (k.id === id ? { ...k, rotated: undefined } : k)) })),

	addWebhook: (w) => set((s) => ({ webhooks: [w, ...s.webhooks] })),
	updateWebhook: (id, patch) => set((s) => ({ webhooks: s.webhooks.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
	removeWebhook: (id) => {
		const before = get();
		set((s) => ({ webhooks: s.webhooks.filter((w) => w.id !== id) }));
		return () => set({ webhooks: before.webhooks });
	},
	rotateSecret: (id) => {
		const w = get().webhooks.find((x) => x.id === id);
		const after = newSecret();
		set((s) => ({ webhooks: s.webhooks.map((x) => (x.id === id ? { ...x, secret: after, secretRotatedAt: new Date().toISOString() } : x)) }));
		return { before: w?.secret ?? "", after };
	},
	sendTest: (endpointId, event) => {
		const w = get().webhooks.find((x) => x.id === endpointId)!;
		const failing = w.failures > 0 && !w.autoDisabled;
		const d = makeDelivery(w, event, Date.now(), failing ? 502 : 200, 1, rng(`${Date.now()}`), { test: true, nextRetry: undefined });
		set((s) => ({
			deliveries: [d, ...s.deliveries],
			// A failed test counts toward the run of failures, and enough of them switch the endpoint off.
			webhooks: failing ? s.webhooks.map((x) => (x.id === w.id ? { ...x, failures: x.failures + 1, autoDisabled: x.failures + 1 >= AUTO_DISABLE_AFTER } : x)) : s.webhooks,
		}));
		return d;
	},
	redeliver: (deliveryId) => {
		const old = get().deliveries.find((d) => d.id === deliveryId);
		if (!old) return undefined;
		const w = get().webhooks.find((x) => x.id === old.endpointId);
		if (!w) return undefined;
		const r = rng(`${deliveryId}${Date.now()}`);
		const d: Delivery = { ...makeDelivery(w, old.event, Date.now(), 200, old.attempts + 1, r), request: old.request };
		set((s) => ({
			deliveries: [d, ...s.deliveries.map((x) => (x.id === deliveryId ? { ...x, nextRetry: undefined } : x))],
			// A delivery that goes through ends the run of failures.
			webhooks: s.webhooks.map((x) => (x.id === w.id ? { ...x, failures: 0, autoDisabled: false } : x)),
		}));
		return d;
	},
}));
