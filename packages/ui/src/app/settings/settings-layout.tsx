import { Archive, FileText, Keyboard, Mail, MessageSquareText, Palette, Receipt, ShieldCheck, Truck, RotateCcw, BadgePercent, Bell, BookOpen, Bot, CreditCard, Globe, type IconComponent, Key, MessageCircle, Plug, Shield, Sparkles, Store, User, UserCog, Users, Wallet, Webhook } from "../../icons";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { ReadOnlyNotice, useReadOnly } from "../access/route-gate";

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

/**
 * Settings, as one grey sheet centred in the window.
 *
 * The sheet is `glacier` on the `paper` content area, up to 1120px wide and the full height of the
 * window, with /login's dot grid in the margin around it. The form sits in a field of its own the
 * way /login's form does, and its inputs are white for the same reason: on a grey ground the slot
 * you type into is the lightest thing there. Sections are headings with their glyph; lists of things
 * (stores, keys, links elsewhere) are grouped white cards of rows with a leading tile and a chevron.
 */
export function SettingsLayout() {
	// A chapter of the knowledge base is a page of Kennisbank, whatever its id.
	const leaf = useRouterState({ select: (s) => (s.location.pathname.includes("/ai/knowledge/") ? "knowledge" : (s.location.pathname.split("/").filter(Boolean).at(-1) ?? "")) });
	const page = PAGES[leaf] ?? { title: "Instellingen", icon: Plug };
	const Icon = page.icon;
	const path = useRouterState({ select: (s) => s.location.pathname });
	const readOnly = useReadOnly(path);
	return (
		<div className="relative isolate flex min-h-full min-w-0 shrink-0 flex-col bg-paper px-3 py-3 sm:px-5 sm:py-5">
			{/* The ground around the sheet carries /login's dot grid, faded toward the middle, so the
			    margin reads as the drawing board the sheet is laid on rather than as empty white. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-dot-grid-ink [mask-image:radial-gradient(ellipse_at_center,transparent_35%,black_85%)]"
			/>
			<div className="settings-sheet mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-8 rounded-2xl bg-glacier px-5 pt-6 pb-10 sm:px-10 sm:pt-8">
				<header className="flex items-center gap-3">
					<span className="flex size-9 items-center justify-center rounded-lg bg-paper text-arc-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
						<Icon className="size-[18px]" strokeWidth={1.75} />
					</span>
					<h1 className="font-medium text-2xl text-ink">{page.title}</h1>
				</header>
				{readOnly ? <ReadOnlyNotice reason={readOnly} /> : null}
				{readOnly && FORM_PAGES.has(leaf) ? (
					<fieldset disabled className="contents">
						<Outlet />
					</fieldset>
				) : (
					<Outlet />
				)}
			</div>
		</div>
	);
}
