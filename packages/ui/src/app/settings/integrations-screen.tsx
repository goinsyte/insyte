import { Loader, RefreshCcw } from "../../icons";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChannelMark, MailboxMark } from "../inbox/channel-mark";
import { toast } from "sonner";
import { BrandLogo } from "../marketplace/brand-logos";
import { SoonChip } from "../common/soon-chip";
import { BandedList, BandedRow, SettingCard, StatusPill } from "./setting-card";
import { formatRelative } from "../lib/format";
import { undoable } from "../lib/undo";
import { type ChatChannel, type IntegrationCategory, type IntegrationItem, type IntegrationsSource, useIntegrationsSource } from "./integrations-source";

const ORDER: Array<IntegrationCategory> = ["Commerce", "Payments", "Email", "Channels", "Marketing", "Team", "AI"];

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
	Commerce: "Commerce",
	Payments: "Betalingen",
	Email: "E-mail",
	Channels: "Kanalen",
	Marketing: "Marketing",
	Team: "Team",
	AI: "AI",
};

const PRIMARY = "flex h-7 items-center rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary transition-colors hover:bg-abyss-2";

/**
 * The services Insyte reads from, grouped by what they are for and each wearing its own logo.
 *
 * They were letters on tinted squares — an "S" for Shopify on green and an "S" for Stripe on blue —
 * and every Manage and Connect button raised a toast. Now Connect goes through the provider's
 * approval (simulated), a connected service can be re-synced or disconnected with an undo, and a
 * service that needs attention says so in amber and offers the one button that fixes it.
 *
 * What it reads and does comes from its host (`integrations-source.tsx`): where the host manages a
 * service on another page, the row's button opens that page; what is not built yet says Binnenkort.
 */
export function IntegrationsPage() {
	const source = useIntegrationsSource();
	const integrations = source.integrations;
	const offered = integrations.filter((i) => i.status !== "soon");
	const [connecting, setConnecting] = useState<ChatChannel | null>(null);
	const { ChannelDialog } = source;
	return (
		<>
		<SettingCard title={`Gekoppeld · ${offered.filter((i) => i.status === "connected").length} van ${offered.length}`}>
			<div className="flex flex-col gap-4">
				{ORDER.map((category) => {
					const items = integrations.filter((i) => i.category === category);
					if (items.length === 0) return null;
					return (
						<div key={category} className="flex flex-col gap-1">
							<span className="px-3 font-medium text-xs text-ink-3">{CATEGORY_LABEL[category]}</span>
							<BandedList>
								{items.map((it) => (
									<IntegrationRow
										key={it.key}
										it={it}
										source={source}
										onConnect={it.category === "Channels" && ChannelDialog ? () => setConnecting(it.key as ChatChannel) : undefined}
									/>
								))}
							</BandedList>
						</div>
					);
				})}
			</div>
		</SettingCard>
		{ChannelDialog ? <ChannelDialog channel={connecting} onClose={() => setConnecting(null)} /> : null}
		</>
	);
}

function IntegrationMark({ it }: { it: IntegrationItem }) {
	const brand = it.brand ?? it.key;
	if (brand === "webchat") return <ChannelMark channel="webchat" size={32} />;
	if (brand === "email") return <MailboxMark logo={{ brand, name: it.name }} size={32} />;
	return <BrandLogo brand={brand} name={it.name} size={32} />;
}

function IntegrationRow({ it, source, onConnect }: { it: IntegrationItem; source: IntegrationsSource; onConnect?: (() => void) | undefined }) {
	const { connect, disconnect, sync } = source;
	const restore = () => source.restore?.(it);

	const status =
		it.status === "connected" ? (
			<StatusPill tone="success" label="Gekoppeld" />
		) : it.status === "action_required" ? (
			<StatusPill tone="warning" label="Actie nodig" />
		) : it.status === "connecting" ? (
			<span className="flex items-center gap-1.5 text-sm text-ink-2">
				<Loader className="size-3.5 animate-spin" /> Koppelen…
			</span>
		) : it.status === "soon" ? (
			<SoonChip />
		) : null;

	const manage = it.manage ? { to: it.manage.to as never, ...(it.manage.search ? { search: it.manage.search as never } : {}) } : undefined;

	return (
		<BandedRow
			leading={<IntegrationMark it={it} />}
			title={it.name}
			detail={
				it.status === "connected" && it.attention
					? `${it.description} · ${it.attention}`
					: it.status === "connected" && it.syncedAt
					? `${it.description} · gesynchroniseerd ${formatRelative(it.syncedAt)}`
					: it.status === "action_required"
						? `${it.description} · ${it.attention ?? "de toestemming is verlopen, dus er komen geen geschillen meer binnen"}`
						: it.description
			}
			trailing={
				<>
					{status}
					{it.status === "connected" ? (
						sync && disconnect ? (
						<>
							<button
								type="button"
								aria-label={`${it.name} nu synchroniseren`}
								onClick={async () => {
									await sync(it.key);
									toast.success(`${it.name} gesynchroniseerd`);
								}}
								className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
							>
								<RefreshCcw className="size-3.5" />
							</button>
							<button
								type="button"
								onClick={() => {
									disconnect(it.key);
									undoable(`${it.name} ontkoppeld`, restore);
								}}
								className="flex h-7 items-center rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-signal-red-bg hover:text-signal-red"
							>
								Ontkoppelen
							</button>
						</>
						) : manage ? (
							<Link
								{...manage}
								aria-label={`${it.name} beheren`}
								className="flex h-7 items-center rounded-md px-2.5 font-medium text-ink-2 text-xs transition-colors hover:bg-ink/6 hover:text-ink"
							>
								Beheren
							</Link>
						) : null
					) : it.status === "disconnected" || it.status === "action_required" ? (
						onConnect || connect ? (
						<button
							type="button"
							onClick={async () => {
								if (onConnect) return onConnect();
								await connect?.(it.key);
								toast.success(`${it.name} gekoppeld`);
							}}
							className={PRIMARY}
						>
							{it.status === "action_required" ? "Opnieuw koppelen" : "Koppelen"}
						</button>
						) : manage ? (
							<Link {...manage} className={PRIMARY}>
								{it.action ?? (it.status === "action_required" ? "Opnieuw koppelen" : "Koppelen")}
							</Link>
						) : null
					) : null}
				</>
			}
		/>
	);
}
