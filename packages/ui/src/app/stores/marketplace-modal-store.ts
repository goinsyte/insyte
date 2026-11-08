import { create } from "zustand";

export type MarketplaceModalState = {
	open: boolean;
};

export type MarketplaceModalActions = {
	openModal: () => void;
	closeModal: () => void;
	toggleModal: () => void;
};

export const useMarketplaceModalStore = create<MarketplaceModalState & MarketplaceModalActions>()((set) => ({
	open: false,
	openModal: () => set({ open: true }),
	closeModal: () => set({ open: false }),
	toggleModal: () => set((s) => ({ open: !s.open })),
}));
