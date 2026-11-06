import { create } from "zustand";
import { persist } from "zustand/middleware";

/*
 * How the operator arranged the area panel, set from its Customize dialog: which sections it shows
 * and in what order, which of the three shortcut styles it draws, and how dense rows are across the
 * panel and the tables. Persisted per browser.
 */

export type PanelSection = "navigation" | "report" | "shortcuts";
export type ShortcutStyle = "ruler" | "drawer" | "classic";
export type Density = "compact" | "comfortable";

export const SECTION_LABEL: Record<PanelSection, { label: string; hint: string }> = {
	navigation: { label: "Navigatie", hint: "De pagina's en selecties van dit onderdeel" },
	report: { label: "Weekrapport", hint: "Het rapport van maandag, tot je het hebt gelezen" },
	shortcuts: { label: "Snelkoppelingen", hint: "Vastgezette items, opgeslagen weergaven en wat je opende" },
};

const DEFAULT_SECTIONS: PanelSection[] = ["navigation", "report", "shortcuts"];

type PanelState = {
	sections: PanelSection[];
	hidden: PanelSection[];
	style: ShortcutStyle;
	density: Density;
	setSections: (s: PanelSection[]) => void;
	toggleSection: (s: PanelSection) => void;
	setStyle: (s: ShortcutStyle) => void;
	setDensity: (d: Density) => void;
	reset: () => void;
};

export const usePanel = create<PanelState>()(
	persist(
		(set) => ({
			sections: DEFAULT_SECTIONS,
			hidden: [],
			style: "ruler",
			density: "compact",
			setSections: (sections) => set({ sections }),
			toggleSection: (id) => set((s) => ({ hidden: s.hidden.includes(id) ? s.hidden.filter((h) => h !== id) : [...s.hidden, id] })),
			setStyle: (style) => set({ style }),
			setDensity: (density) => set({ density }),
			reset: () => set({ sections: DEFAULT_SECTIONS, hidden: [], style: "ruler", density: "compact" }),
		}),
		{ name: "insyte:panel:v1", version: 1 },
	),
);
