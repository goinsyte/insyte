import { create } from "zustand";

export type MarketplaceModalState = {
	open: boolean;
	/** The app whose detail opens with the Marketplace, as "Koppelen" on Koppelingen asks for one. */
	focus: string | null;
};

export type MarketplaceModalActions = {
	openModal: () => void;
	/** The Marketplace over the page it is opened from, with one app's detail on top. */
	openApp: (id: string) => void;
	closeModal: () => void;
	toggleModal: () => void;
	clearFocus: () => void;
};

export const useMarketplaceModalStore = create<MarketplaceModalState & MarketplaceModalActions>()((set) => ({
	open: false,
	focus: null,
	openModal: () => set({ open: true, focus: null }),
	openApp: (id) => set({ open: true, focus: id }),
	closeModal: () => set({ open: false, focus: null }),
	toggleModal: () => set((s) => ({ open: !s.open, focus: null })),
	clearFocus: () => set({ focus: null }),
}));
