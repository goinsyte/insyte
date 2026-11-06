import { create } from "zustand";
import { persist } from "zustand/middleware";
import { extensions as seedExtensions } from "../../data-source";

export type InstallRecord = {
	id: string;
	installedAt: string;
	lastOpenedAt?: string;
};

type State = {
	records: Record<string, InstallRecord>;
};

type Actions = {
	install: (id: string) => void;
	uninstall: (id: string) => void;
	markOpened: (id: string) => void;
};

function seedFromExtensions(): Record<string, InstallRecord> {
	const now = new Date().toISOString();
	const out: Record<string, InstallRecord> = {};
	for (const e of seedExtensions) {
		if (e.installed) out[e.id] = { id: e.id, installedAt: now };
	}
	return out;
}

export const useMarketplaceStore = create<State & Actions>()(
	persist(
		(set, get) => ({
			records: seedFromExtensions(),

			install: (id) => {
				const now = new Date().toISOString();
				set({
					records: {
						...get().records,
						[id]: { id, installedAt: now },
					},
				});
			},

			uninstall: (id) => {
				const next = { ...get().records };
				delete next[id];
				set({ records: next });
			},

			markOpened: (id) => {
				const existing = get().records[id];
				if (!existing) return;
				set({
					records: {
						...get().records,
						[id]: { ...existing, lastOpenedAt: new Date().toISOString() },
					},
				});
			},
		}),
		{
			name: "insyte:marketplace-installs:v2",
			version: 2,
		},
	),
);
