import { Archive, Database, FileText, Keyboard, Mail, MessageSquareText, Palette, Receipt, ShieldCheck, Truck, RotateCcw, BadgePercent, Bell, BookOpen, Bot, CreditCard, Globe, type IconComponent, Key, MessageCircle, Plug, Shield, Sparkles, Store, User, UserCog, Users, Wallet, Webhook } from "../../icons";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { ReadOnlyNotice, useReadOnly } from "../access/route-gate";
import { SettingsSheet } from "./settings-sheet";

/** The page's own name and mark: the area panel already says these are settings. */
const PAGES: Record<string, { title: string; icon: IconComponent }> = {
	profile: { title: "Account", icon: User },
	team: { title: "Team", icon: Users },
	roles: { title: "Rollen", icon: UserCog },
	stores: { title: "Winkels", icon: Store },
	billing: { title: "Facturatie", icon: CreditCard },
	regional: { title: "Regio", icon: Globe },
	notifications: { title: "Meldingen", icon: Bell },
	integrations: { title: "Koppelingen", icon: Plug },
	apps: { title: "Apps", icon: BadgePercent },
	security: { title: "Beveiliging", icon: Shield },
	"api-keys": { title: "API-sleutels", icon: Key },
	webhooks: { title: "Webhooks", icon: Webhook },
	autonomy: { title: "Zelfstandigheid", icon: Sparkles },
	limits: { title: "Limieten", icon: Wallet },
	"customer-agent": { title: "Klantagent", icon: MessageCircle },
	knowledge: { title: "Kennisbank", icon: BookOpen },
	agents: { title: "Agents en MCP", icon: Bot },
	returns: { title: "Retouren", icon: RotateCcw },
	shipping: { title: "Verzending", icon: Truck },
	templates: { title: "Sjablonen", icon: MessageSquareText },
	brand: { title: "Huisstijl", icon: Palette },
	"email-domain": { title: "E-mail en domein", icon: Mail },
	vat: { title: "Btw", icon: Receipt },
	privacy: { title: "Gegevens en privacy", icon: ShieldCheck },
	data: { title: "Je gegevens", icon: Database },
	log: { title: "Logboek", icon: FileText },
	trash: { title: "Prullenbak", icon: Archive },
	shortcuts: { title: "Sneltoetsen", icon: Keyboard },
};

/*
 * Pages that are only a form: when the role may open them but not change them, the whole page is
 * one disabled fieldset. The other pages gate their own controls, because opening a row there is
 * reading, not changing.
 */
const FORM_PAGES = new Set(["stores", "regional", "security", "integrations", "apps", "returns"]);

/** Settings, as one grey sheet centred in the window (`SettingsSheet`), titled by the page it shows. */
export function SettingsLayout() {
	// A chapter of the knowledge base is a page of Kennisbank, whatever its id.
	const leaf = useRouterState({ select: (s) => (s.location.pathname.includes("/ai/knowledge/") ? "knowledge" : (s.location.pathname.split("/").filter(Boolean).at(-1) ?? "")) });
	const page = PAGES[leaf] ?? { title: "Instellingen", icon: Plug };
	const Icon = page.icon;
	const path = useRouterState({ select: (s) => s.location.pathname });
	const readOnly = useReadOnly(path);
	return (
		<SettingsSheet title={page.title} icon={Icon}>
			{readOnly ? <ReadOnlyNotice reason={readOnly} /> : null}
			{readOnly && FORM_PAGES.has(leaf) ? (
				<fieldset disabled className="contents">
					<Outlet />
				</fieldset>
			) : (
				<Outlet />
			)}
		</SettingsSheet>
	);
}
