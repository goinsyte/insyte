import { create } from "zustand";

type State = {
	open: boolean;
};

type Actions = {
	openModal: () => void;
	closeModal: () => void;
	toggleModal: () => void;
};

export const useMarketplaceModalStore = create<State & Actions>()((set) => ({
	open: false,
	openModal: () => set({ open: true }),
	closeModal: () => set({ open: false }),
	toggleModal: () => set((s) => ({ open: !s.open })),
}));
