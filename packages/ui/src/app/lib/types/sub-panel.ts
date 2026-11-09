import type { CreateKind } from "../../stores/create-intent";
import type { IconComponent } from "../../../icons";

export type SubPanelItem = {
	to: string;
	label: string;
	icon: IconComponent;
	count?: number | string;
	exact?: boolean;
	search?: Record<string, string>;
	/** A count the workspace keeps, read live instead of fixed at build. */
	liveCount?: "needs-you" | "drawn";
	/** Drawn in the icon's place: a provider's logo, for rows that are a connected service. */
	mark?: import("react").ReactNode;
};

export type SubPanelSection = {
	label?: string;
	items: SubPanelItem[];
};

export type SubPanelCta = {
	label: string;
	to?: string;
	/** What the button makes: the page at `to` opens its own create dialog for it. */
	create?: CreateKind;
	onClick?: () => void;
	/** Why the host cannot make it yet (the console before its commands); the button is off and says so. */
	unavailable?: string;
};

export type SubPanelConfig = {
	title: string;
	icon?: IconComponent;
	cta?: SubPanelCta;
	sections: SubPanelSection[];
	customRender?: "dashboard";
};

/**
 * @deprecated The dark-rail nav was replaced by the single white {@link SidebarConfig}.
 * Kept for {@link useNavPrefs} ordering + the Manage popup View tab which still
 * references rail-shaped items.
 */
export type RailItem = {
	to: string;
	label: string;
	icon: IconComponent;
	matchPrefix?: string;
};

export type SidebarItem = {
	to: string;
	label: string;
	icon: IconComponent;
	matchPrefix?: string;
	count?: number | string;
};

export type SidebarTeamMember = {
	name: string;
	tone: "pink" | "rose" | "peach" | "amber";
};

export type SidebarConfig = {
	main: SidebarItem[];
	tools: SidebarItem[];
	team: SidebarTeamMember[];
};
