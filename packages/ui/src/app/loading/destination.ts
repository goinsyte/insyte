import { BadgePercent, Bell, Home, type IconComponent, Radio, Settings, Sparkles } from "../../icons";
import { SIDEBAR_BY_PERSONA } from "../lib/app-shell-config";
import type { Persona } from "../lib/types/persona";

/* Where a path is, apart from the cold start that names it (`boot-screen.tsx`): a route's skeleton titles itself with
   it too, and a skeleton loads with no workspace behind it (the console's screens). */

/** The places a cold start can open on that are not in the sidebar's two lists. */
const EXTRA: ReadonlyArray<{ prefix: string; label: string; icon: IconComponent }> = [
	{ prefix: "/settings", label: "Instellingen", icon: Settings },
	{ prefix: "/supplier/settings", label: "Instellingen", icon: Settings },
	{ prefix: "/affiliate/settings", label: "Instellingen", icon: Settings },
	{ prefix: "/notifications", label: "Meldingen", icon: Bell },
	{ prefix: "/live", label: "Live", icon: Radio },
	{ prefix: "/costs", label: "Kosten", icon: BadgePercent },
	{ prefix: "/marketplace", label: "Marketplace", icon: Sparkles },
];

/** Where a path is, as the sidebar names it: its label and its glyph. */
export function destinationOf(pathname: string, persona: Persona): { label: string; icon: IconComponent } {
	const nav = SIDEBAR_BY_PERSONA[persona];
	const items = [...nav.main, ...nav.tools];
	const hit = items.find((i) => pathname === i.to || pathname.startsWith(`${i.matchPrefix ?? i.to}/`));
	if (hit) return { label: hit.label, icon: hit.icon };
	const extra = EXTRA.find((e) => pathname === e.prefix || pathname.startsWith(`${e.prefix}/`) || pathname.endsWith(e.prefix));
	return extra ?? { label: "Dashboard", icon: Home };
}

