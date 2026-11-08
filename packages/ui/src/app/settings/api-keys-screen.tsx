import { ChevronRight, Key, Plus, Webhook } from "../../icons";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useMemo, useState } from "react";
import { Blocked } from "../access/blocked";
import { EmptyState } from "../common/empty-state";
import { PageGuide } from "../common/page-guide";
import { MadeByName, Token } from "../developer/bits";
import { CreateKeyDialog } from "../developer/key-dialog";
import { KeyDetailDialog } from "../developer/key-detail";
import { BandedList, BandedRow, SectionAction, SettingCard, StatusPill } from "./setting-card";
import { type ApiKey, expiryState, isRestricted, scopeSummary } from "../lib/developer-core";
import { formatRelative } from "../lib/format";
import { apiAccessOfRole } from "../lib/permissions";
import { cn } from "../lib/utils";
import { useDeveloperSource } from "../developer/source";

const GUIDE = [
	{ title: "Een sleutel per dienst", body: "Met een sleutel praat een script of dienst met Insyte: een voorraadfeed, je boekhouding, een Zapier-flow.", art: "keys" },
	{ title: "Rol of eigen rechten", body: "Geef een sleutel een rol, dan verandert hij mee met die rol. Of geef alleen de rechten die hij nodig heeft, per winkel.", art: "roles" },
	{ title: "Beperkt", body: "Een sleutel die niet in elke winkel een hele rol heeft, staat gemarkeerd als Beperkt.", art: "lock" },
	{ title: "Op tijd roteren", body: "Roteer een sleutel voordat hij verloopt, anders valt er iets stil. Ingetrokken sleutels blijven grijs in de lijst staan.", art: "undo" },
] as const;

/**
 * Keys for scripts and services that talk to Insyte.
 *
 * A key holds a role from Rollen — and changes when the role does — or its own scopes, per area,
 * read or read and write, in the same ids an automation's rights use. A key that is not a whole
 * role in every store, from anywhere, is marked Beperkt. Active keys come first; a key about to
 * lapse says so in amber, a lapsed one in red. Revoked keys stay listed below, greyed, for the record.
 */
export function ApiKeysPage() {
	const source = useDeveloperSource();
	const { keys, roles } = source;
	const manage = source.can.manage;
	const [creating, setCreating] = useState(false);
	const [openId, setOpenId] = useState<string | null>(null);
	const [showRevoked, setShowRevoked] = useState(false);

	const active = keys.filter((k) => k.status === "active");
	const revoked = keys.filter((k) => k.status === "revoked");
	const soon = active.filter((k) => expiryState(k).tone !== "none").length;
	const access = useMemo(
		() => (k: ApiKey) => {
			if (k.access.kind === "custom") return { name: "Eigen rechten", summary: scopeSummary(k.access.scopes) };
			const { roleId } = k.access;
			const r = roles.find((x) => x.id === roleId);
			return { name: r ? `Rol ${r.label}` : "Verwijderde rol", summary: r ? scopeSummary(apiAccessOfRole(r)) : "Geen rechten" };
		},
		[roles],
	);

	const action = (
		<Gate perm="integrations" arg={3} className="shrink-0 whitespace-nowrap">
			<SectionAction icon={<Plus className="size-3.5" strokeWidth={2} />} onClick={() => setCreating(true)}>
				Sleutel aanmaken
			</SectionAction>
		</Gate>
	);

	return (
		<>
			<SettingCard
				title={keys.length ? `Sleutels · ${active.length} actief` : "Sleutels"}
				icon={Key}
				subtitle={soon ? `${soon} ${soon === 1 ? "sleutel verloopt" : "sleutels verlopen"} binnenkort of zijn verlopen` : undefined}
				action={action}
			>
				{keys.length === 0 ? (
					<div className="rounded-xl bg-paper">
						<EmptyState
							kind="automations"
							title="Nog geen API-sleutels"
							body="Laat een script of dienst met Insyte praten."
							{...(manage.ok ? { action: { label: "Eerste sleutel aanmaken", onClick: () => setCreating(true) } } : {})}
						/>
					</div>
				) : (
					<BandedList>
						{[...active, ...(showRevoked ? revoked : [])].map((k) => {
							const exp = expiryState(k);
							const a = access(k);
							const off = k.status === "revoked";
							return (
								<li key={k.id}>
									<button type="button" onClick={() => setOpenId(k.id)} className={cn("group/item flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-ink/3", off && "opacity-60")}>
										<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink/6">
											<Key className="size-4 text-ink-2" strokeWidth={1.75} />
										</span>
										<span className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="flex min-w-0 items-center gap-2">
												<span className="truncate font-medium text-base text-ink">{k.label}</span>
												<Token className="hidden shrink-0 sm:inline-flex">{k.prefix}…</Token>
											</span>
											<span className="truncate text-ink-2 text-sm">
												{a.name} · {a.summary}
											</span>
											<span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-ink-3 text-xs">
												<MadeByName memberId={k.created_by} name={source.personName(k.created_by)} />
												<span>·</span>
												<span>{off && k.revoked_at ? `ingetrokken ${formatRelative(k.revoked_at)}` : k.last_used_at ? `gebruikt ${formatRelative(k.last_used_at)}` : "nooit gebruikt"}</span>
												{!off && exp.tone === "none" ? (
													<>
														<span>·</span>
														<span>{exp.label.replace(/^V/, "v")}</span>
													</>
												) : null}
											</span>
											<span className="mt-1 flex flex-wrap gap-1.5 sm:hidden">
											{isRestricted(k) && !off ? <StatusPill tone="info" label="Beperkt" /> : null}
											{k.agent && !off ? <StatusPill tone="neutral" label="Agent" /> : null}
											{off ? (
												<StatusPill tone="neutral" label="Ingetrokken" />
											) : exp.tone === "red" ? (
												<StatusPill tone="danger" label="Verlopen" />
											) : exp.tone === "amber" ? (
												<StatusPill tone="warning" label={exp.label} />
											) : k.rotated ? (
												<StatusPill tone="warning" label="Geroteerd" />
											) : (
												<StatusPill tone="success" label="Actief" />
											)}
											</span>
										</span>
										<span className="hidden shrink-0 items-center justify-end gap-1.5 sm:flex">
											{isRestricted(k) && !off ? <StatusPill tone="info" label="Beperkt" /> : null}
											{k.agent && !off ? <StatusPill tone="neutral" label="Agent" /> : null}
											{off ? (
												<StatusPill tone="neutral" label="Ingetrokken" />
											) : exp.tone === "red" ? (
												<StatusPill tone="danger" label="Verlopen" />
											) : exp.tone === "amber" ? (
												<StatusPill tone="warning" label={exp.label} />
											) : k.rotated ? (
												<StatusPill tone="warning" label="Geroteerd" />
											) : (
												<StatusPill tone="success" label="Actief" />
											)}
										</span>
										<ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover/item:translate-x-0.5" strokeWidth={1.75} />
									</button>
								</li>
							);
						})}
						{active.length === 0 && !showRevoked ? <BandedRow title="Geen actieve sleutels" detail="Alle sleutels zijn ingetrokken." /> : null}
					</BandedList>
				)}
				{revoked.length ? (
					<button type="button" onClick={() => setShowRevoked((v) => !v)} className="self-start rounded-md px-2 py-1 font-medium text-arc-ink text-sm hover:bg-arc-tint">
						{showRevoked ? "Ingetrokken sleutels verbergen" : `${revoked.length} ingetrokken ${revoked.length === 1 ? "sleutel" : "sleutels"} tonen`}
					</button>
				) : null}
				{!manage.ok && keys.length ? <p className="text-ink-3 text-sm">Alleen bekijken. Beheren vraagt Koppelingen en API · Beheren.</p> : null}
			</SettingCard>

			{source.webhooks ? <SettingCard title="Webhooks" icon={Webhook}>
				{/* Only the reference has a webhooks page yet; the console leaves `source.webhooks` out. */}
				<Link to={"/settings/webhooks" as never} className="group/item flex items-center gap-3 rounded-xl bg-paper px-3.5 py-3 transition-colors hover:bg-ink/3">
					<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-arc-tint text-arc-ink">
						<Webhook className="size-4" strokeWidth={1.75} />
					</span>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-medium text-base text-ink">Endpoints en leveringen</span>
						<WebhookLine webhooks={source.webhooks} />
					</span>
					<ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover/item:translate-x-0.5" strokeWidth={1.75} />
				</Link>
			</SettingCard> : null}

			<CreateKeyDialog open={creating} onOpenChange={setCreating} />
			<KeyDetailDialog keyId={openId} onClose={() => setOpenId(null)} />
			<PageGuide id="settings.api-keys" title="API-sleutels" steps={GUIDE} />
		</>
	);
}

function WebhookLine({ webhooks }: { webhooks: { count: number; failing: number } }) {
	const { count, failing } = webhooks;
	return (
		<span className="truncate text-ink-3 text-sm">
			{count === 0 ? "Nog geen endpoints" : `${count} ${count === 1 ? "endpoint" : "endpoints"}${failing ? ` · ${failing} met fouten` : " · alles in orde"}`}
		</span>
	);
}

/** A control as it is when the role may manage keys; otherwise disabled, with what the role misses. */
function Gate({ children, className }: { perm?: "integrations"; arg?: 3; className?: string; children: ReactElement }) {
	const manage = useDeveloperSource().can.manage;
	return manage.ok ? children : <Blocked reason={manage.reason} className={className}>{children}</Blocked>;
}
