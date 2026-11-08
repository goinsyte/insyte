import { Link } from "@tanstack/react-router";
import { Bot, Key, Link2, Plug, Shield, Sparkle, Webhook } from "../../icons";
import { PageGuide } from "../common/page-guide";
import { CopyButton, Token } from "../developer/bits";
import { useDeveloperSource } from "../developer/source";
import { BandedList, BandedRow, SettingCard, SettingsItem, StatusPill } from "../settings/setting-card";
import { formatRelative } from "../lib/format";
import { scopeSummary } from "../lib/developer-core";

/**
 * Instellingen → Technisch → Agents en MCP (`/settings/agents`, PLAN 31, ADR-0027): what agent-ready
 * means for the operator's own AI tools. The public API and the MCP server both take an API key and
 * act with its rights; the agent keys are listed here, the server's address is ready to copy. Reads
 * the same source as API-sleutels.
 */
const GUIDE = [
	{ title: "Agent-ready", body: "Je eigen AI-tools lezen en werken in Insyte met de rechten van een rol: via de API, MCP en webhooks.", art: "keys" },
	{ title: "Rechten", body: "Per rol of per onderdeel, lezen of schrijven. Team, facturatie en de API zelf zijn nooit bereikbaar met een sleutel.", art: "roles" },
	{ title: "Dezelfde regels", body: "Elke schrijfactie volgt Zelfstandigheid. Wat op Eerst vragen staat, komt als voorstel bij jou, net als bij Insyte.", art: "rules" },
	{ title: "MCP", body: "Een MCP-client logt in met een API-sleutel, met dezelfde rechten. Elke aanroep staat in het verzoeklog van die sleutel.", art: "webhook" },
] as const;

export function AgentsPage() {
	const source = useDeveloperSource();
	const keys = source.keys.filter((k) => k.agent && k.status === "active");
	const roles = source.roles;

	return (
		<>
			<SettingCard title="Je eigen agents" icon={Bot}>
				<BandedList>
					{keys.length === 0 ? (
						<li className="flex items-center justify-between gap-3 px-3.5 py-3 text-ink-3 text-sm">
							Nog geen sleutel voor een agent
							<Link to={"/settings/api-keys" as never} className="font-medium text-arc-ink hover:underline">
								Sleutel maken
							</Link>
						</li>
					) : (
						keys.map((k) => (
							<BandedRow
								key={k.id}
								leading={
									<span className="flex size-9 items-center justify-center rounded-lg bg-mist text-ink-2">
										<Bot className="size-4" strokeWidth={1.75} />
									</span>
								}
								title={k.label}
								detail={`${k.access.kind === "custom" ? scopeSummary(k.access.scopes) : `Rol ${roles.find((r) => r.id === (k.access.kind === "role" ? k.access.roleId : ""))?.label ?? "verwijderd"}`} · ${k.last_used_at ? `laatst gebruikt ${formatRelative(k.last_used_at)}` : "nog niet gebruikt"}`}
								trailing={<Token>{k.prefix}</Token>}
							/>
						))
					)}
				</BandedList>
			</SettingCard>

			<SettingCard title="MCP-server" icon={Plug} action={<StatusPill tone="info" label="Live" />}>
				<div className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
					<div className="flex flex-wrap items-center gap-3">
						<span className="text-ink-3 text-sm">Serveradres</span>
						<span className="order-last basis-full break-all rounded-md bg-ink/5 px-3 py-1.5 text-ink text-sm tabular-nums leading-5 sm:order-none sm:basis-0 sm:flex-1">{source.mcpUrl}</span>
						<CopyButton value={source.mcpUrl} className="ml-auto sm:ml-0" />
					</div>
					<p className="text-ink-3 text-sm leading-normal">
						Log in met een API-sleutel als <Token>Authorization: Bearer</Token>, met de rechten van die sleutel.
					</p>
				</div>
			</SettingCard>

			<SettingCard title="Verder" icon={Link2}>
				<BandedList>
					<SettingsItem icon={Key} title="API-sleutels" detail="Sleutels maken, beperken, roteren en intrekken" tone="arc" to="/settings/api-keys" />
					<SettingsItem icon={Webhook} title="Webhooks" detail="Laat je agent weten wanneer er iets gebeurt" tone="arc" to="/settings/webhooks" />
					<SettingsItem icon={Shield} title="Zelfstandigheid" detail="Wat Insyte en je eigen agents zelf mogen" tone="arc" to="/settings/ai/autonomy" />
					<SettingsItem icon={Sparkle} title="Wat Insyte deed" detail="Elke actie van een agent, met Ongedaan maken" tone="arc" to="/ask/activity" />
				</BandedList>
			</SettingCard>
			<PageGuide id="settings.agents" title="Agents en MCP" steps={GUIDE} />
		</>
	);
}
