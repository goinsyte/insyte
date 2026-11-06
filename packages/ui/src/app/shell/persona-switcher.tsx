import { Button } from "../../components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { Check, Sparkles } from "../../icons";
import { setPersonaSelection, usePersonaSelection } from "../hooks/use-persona";
import { designControls, SCENARIO, SCENARIOS, setScenario } from "../../data-source";
import { appHref } from "../../data-source/hrefs";
import { PERSONA_OPTIONS } from "../lib/types/persona";
import { useAccess, useCurrentRole } from "../stores/access-store";
import { useSettings } from "../stores/settings-store";
import { PACES, useLoading } from "../loading/pace";

/** The screens before anyone is signed in, each in the state it is designed for. */
const SIGNED_OUT = [
	{ label: "Inloggen", to: "/login" },
	{ label: "Registreren", to: "/register" },
	{ label: "Uitnodiging · nieuw account", to: "/invitations/inv_nieuw" },
	{ label: "Uitnodiging · bestaand account", to: "/invitations/inv_bestaand" },
	{ label: "Uitnodiging · ander account ingelogd", to: "/invitations/inv_ander" },
	{ label: "Uitnodiging · via link", to: "/invitations/link_nw7k2q9d" },
	{ label: "Uitnodiging · SSO vereist", to: "/invitations/inv_sso" },
	{ label: "Uitnodiging · werkruimte vol", to: "/invitations/inv_vol" },
	{ label: "Uitnodiging · verlopen", to: "/invitations/inv_verlopen" },
	{ label: "Uitnodiging · ingetrokken", to: "/invitations/inv_ingetrokken" },
	{ label: "Uitnodiging · al geaccepteerd", to: "/invitations/inv_geaccepteerd" },
	{ label: "Uitnodiging · leverancier", to: "/invitations/inv_leverancier" },
	{ label: "Uitnodiging · affiliate", to: "/invitations/inv_affiliate" },
	{ label: "Inrichten · merk", to: "/onboarding?persona=admin" },
	{ label: "Inrichten · leverancier", to: "/onboarding?persona=supplier" },
	{ label: "Inrichten · affiliate", to: "/onboarding?persona=affiliate" },
] as const;

export function PersonaSwitcher() {
	const navigate = useNavigate();
	const { selection, persona } = usePersonaSelection();
	const roles = useSettings((s) => s.roles);
	const viewAs = useAccess((s) => s.viewAs);
	const role = useCurrentRole();
	const pace = useLoading((s) => s.pace);

	if (!import.meta.env.DEV && !designControls) return null;

	const current = PERSONA_OPTIONS.find((o) => o.value === selection);
	const state = SCENARIOS.find((x) => x.id === SCENARIO);

	/*
	 * Docked to the window's bottom-left corner, clear of both the rail and the work.
	 *
	 * It used to sit `right-4 bottom-4`, which on every screen in the console is the plate's title
	 * block, and at phone width landed on the plate's own "As drawn" line. A development control that
	 * covers the thing being developed is worse than no control.
	 *
	 * `bottom-2 left-2` was the first answer and was wrong for the same reason: the rail's foot now
	 * carries the Manage button and the account avatar, and this chip sat exactly on top of the
	 * avatar — it was unclickable in development, which is the only place this chip exists. Clearing
	 * the 52px rail puts it on the foot of the area panel, which is empty on every screen that has
	 * one and padding on every screen that does not. Still `import.meta.env.DEV`-gated above.
	 */
	return (
		<div className="pointer-events-none fixed bottom-2 left-[60px] z-50 flex [&>*]:pointer-events-auto">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					{/* Filled, not outlined: this world's controls are fields. */}
					<Button
						variant="ghost"
						size="sm"
						className="panel-raised h-7 gap-1.5 rounded-md bg-arc-tint px-2.5 font-medium text-sm text-arc-ink hover:bg-arc-soft hover:text-arc-ink"
					>
						<Sparkles className="size-3" />
						{current?.label ?? "Persona"}
						<span className="text-arc-ink/60">·</span>
						{state?.label.split(" · ")[0]}
						{role.viewing ? (
							<>
								<span className="text-arc-ink/60">·</span>
								{role.label}
							</>
						) : null}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" side="top" className="max-h-[80vh] w-[320px] overflow-y-auto">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Bekijk als</DropdownMenuLabel>
						{PERSONA_OPTIONS.map((opt) => (
							<DropdownMenuItem
								key={opt.value}
								onClick={() => {
									setPersonaSelection(opt.value);
									navigate({ to: opt.landing });
								}}
							>
								{opt.label}
								{opt.value === selection ? <Check className="ml-auto size-3.5 text-ink-3" strokeWidth={2} /> : null}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
					{persona === "admin" ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuLabel>Bekijk als rol · wat iemand met die rol ziet</DropdownMenuLabel>
								<DropdownMenuItem onClick={() => useAccess.getState().setViewAs(null)}>
									Mijn eigen rol
									{viewAs === null ? <Check className="ml-auto size-3.5 text-ink-3" strokeWidth={2} /> : null}
								</DropdownMenuItem>
								{roles
									.filter((r) => r.id !== "owner")
									.map((r) => (
										<DropdownMenuItem key={r.id} onClick={() => useAccess.getState().setViewAs(r.id)}>
											<span className="truncate">{r.label}</span>
											{viewAs === r.id ? <Check className="ml-auto size-3.5 shrink-0 text-ink-3" strokeWidth={2} /> : null}
										</DropdownMenuItem>
									))}
							</DropdownMenuGroup>
						</>
					) : null}
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel>Ontwerpstaat · dezelfde schermen, andere data</DropdownMenuLabel>
						{SCENARIOS.map((x) => (
							<DropdownMenuItem key={x.id} onClick={() => x.id !== SCENARIO && setScenario(x.id)} className="h-auto items-start py-2">
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="font-medium text-ink">{x.label}</span>
									<span className="text-ink-3 text-xs leading-snug">{x.detail}</span>
								</span>
								{x.id === SCENARIO ? <Check className="mt-0.5 ml-auto size-3.5 shrink-0 text-ink-3" strokeWidth={2} /> : null}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel>Laden · hoe een scherm binnenkomt</DropdownMenuLabel>
						{PACES.map((x) => (
							<DropdownMenuItem key={x.id} onClick={() => useLoading.getState().setPace(x.id)} className="h-auto items-start py-2">
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="font-medium text-ink">{x.label}</span>
									<span className="text-ink-3 text-xs leading-snug">{x.detail}</span>
								</span>
								{x.id === pace ? <Check className="mt-0.5 ml-auto size-3.5 shrink-0 text-ink-3" strokeWidth={2} /> : null}
							</DropdownMenuItem>
						))}
						{/* A reload empties the in-memory cache, which is exactly what a cold start is. */}
						<DropdownMenuItem disabled={pace === "off"} onClick={() => window.location.reload()}>
							Koude start opnieuw afspelen
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel>Schermen voor het inloggen</DropdownMenuLabel>
						{SIGNED_OUT.map((x) => (
							<DropdownMenuItem key={x.to} onClick={() => window.location.assign(appHref(x.to))}>
								{x.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
