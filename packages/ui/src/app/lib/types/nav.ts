import type { IconComponent } from "../../../icons";

export type NavItem = {
	to: string;
	label: string;
	icon: IconComponent;
	badge?: string | number;
	exact?: boolean;
};

export type NavSection = {
	label?: string;
	items: NavItem[];
};

export type NavConfig = {
	sections: NavSection[];
};
