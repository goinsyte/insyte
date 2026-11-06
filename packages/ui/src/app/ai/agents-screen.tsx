import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Bot, Key, Link2, Plug, Shield, Sparkle, Webhook } from "../../icons";
import { PageGuide } from "../common/page-guide";
import { SoonChip } from "../common/soon-chip";
import { Token } from "../developer/bits";
import { BandedList, BandedRow, SettingCard, SettingsItem, StatusPill } from "../settings/setting-card";
import { formatRelative } from "../lib/format";
import { scopeSummary } from "../lib/developer";
import { useDeveloper } from "../stores/developer-store";
import { useSettings } from "../stores/settings-store";

const INTEREST = "insyte:agents-mcp-interest";

/**
 * Instellingen → Technisch → Agents en MCP (`/settings/agents`, PLAN 31, ADR-0027): what agent-ready
 * means for the operator's own AI tools. The public API and webhooks work today through API keys;
 * the MCP server is not built and is drawn as _Binnenkort_ everywhere — its address greyed, nothing
 * that pretends to connect. The same in every design state, because nothing of it exists yet.
 */
const GUIDE = [
	{ title: "Agent-ready", body: "Je eigen AI-tools lezen en werken in Insyte met de rechten van een rol: via de API en webhooks nu, via MCP binnenkort.", art: "keys" },
	{ title: "Rechten", body: "Per rol of per onderdeel, lezen of schrijven. Team, facturatie en de API zelf zijn nooit bereikbaar met een sleutel.", art: "roles" },
	{ title: "Dezelfde regels", body: "Elke schrijfactie volgt Zelfstandigheid. Wat op Eerst vragen staat, komt als voorstel bij jou, net als bij Insyte.", art: "rules" },
	{ title: "MCP", body: "Zodra de server live is, logt een MCP-client in zoals een API-sleutel, met dezelfde rechten.", art: "webhook" },
] as const;

export function AgentsPage() {
	const all = useDeveloper((s) => s.apiKeys);
	const keys = all.filter((k) => k.agent && k.status === "active");
	const roles = useSettings((s) => s.roles);
	const [interested, setInterested] = useState(() => {
		try {
			return window.localStorage.getItem(INTEREST) === "1";
		} catch {
			return false;
		}
	});

	return (
		<>
			<SettingCard title="Je eigen agents" icon={Bot}>
				<BandedList>
					{keys.length === 0 ? (
						<li className="flex items-center justify-between gap-3 px-3.5 py-3 text-ink-3 text-sm">
							Nog geen sleutel voor een agent
							<Link to="/settings/api-keys" className="font-medium text-arc-ink hover:underline">
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

			<SettingCard
				title="MCP-server"
				icon={Plug}
				action={<SoonChip />}
			>
				<div className="flex flex-wrap items-center gap-3 rounded-xl bg-paper px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
					<div className="flex flex-1 flex-wrap items-center gap-2">
						<span className="text-ink-3 text-sm">Serveradres</span>
						<span aria-disabled className="inline-flex h-8 items-center rounded-md bg-ink/5 px-3 text-ink-3 text-sm tabular-nums">
							mcp.goinsyte.com/northwind
						</span>
						<StatusPill tone="neutral" label="Nog niet beschikbaar" />
					</div>
					<button
						type="button"
						disabled={interested}
						onClick={() => {
							try {
								window.localStorage.setItem(INTEREST, "1");
							} catch {
								// Private mode: the toast still says it, the page simply forgets after a reload.
							}
							setInterested(true);
							toast("We laten het je weten", { description: "Je hoort het zodra de MCP-server voor je werkruimte klaar is." });
						}}
						className="field flex h-8 w-fit items-center rounded-md px-3 font-medium text-ink text-sm hover:field-hover disabled:cursor-default disabled:opacity-60"
					>
						{interested ? "Je staat op de lijst" : "Laat het me weten"}
					</button>
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
