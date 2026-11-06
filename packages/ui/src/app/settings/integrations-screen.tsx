import { Loader, RefreshCcw } from "../../icons";
import { useState } from "react";
import { ChannelConnectDialog, ChannelMark } from "../inbox/channel-parts";
import { toast } from "sonner";
import { BrandLogo } from "../marketplace/brand-logos";
import { BandedList, BandedRow, SettingCard, StatusPill } from "./setting-card";
import { formatRelative } from "../lib/format";
import { undoable } from "../lib/undo";
import { useWorkspace, type WorkspaceIntegration } from "../stores/workspace-store";

const ORDER: Array<WorkspaceIntegration["category"]> = ["Commerce", "Payments", "Email", "Channels", "Marketing", "AI"];

const CATEGORY_LABEL: Record<WorkspaceIntegration["category"], string> = {
	Commerce: "Commerce",
	Payments: "Betalingen",
	Email: "E-mail",
	Channels: "Kanalen",
	Marketing: "Marketing",
	AI: "AI",
};

/**
 * The services Insyte reads from, grouped by what they are for and each wearing its own logo.
 *
 * They were letters on tinted squares — an "S" for Shopify on green and an "S" for Stripe on blue —
 * and every Manage and Connect button raised a toast. Now Connect goes through the provider's
 * approval (simulated), a connected service can be re-synced or disconnected with an undo, and a
 * service that needs attention says so in amber and offers the one button that fixes it.
 */
export function IntegrationsPage() {
	const integrations = useWorkspace((s) => s.integrations);
	const [connecting, setConnecting] = useState<"whatsapp" | "instagram" | "webchat" | null>(null);
	return (
		<>
		<SettingCard title={`Gekoppeld · ${integrations.filter((i) => i.status === "connected").length} van ${integrations.length}`}>
			<div className="flex flex-col gap-4">
				{ORDER.map((category) => {
					const items = integrations.filter((i) => i.category === category);
					if (items.length === 0) return null;
					return (
						<div key={category} className="flex flex-col gap-1">
							<span className="px-3 font-medium text-xs text-ink-3">{CATEGORY_LABEL[category]}</span>
							<BandedList>
								{items.map((it) => (
									<IntegrationRow key={it.key} it={it} onConnect={it.category === "Channels" ? () => setConnecting(it.key as "whatsapp" | "instagram" | "webchat") : undefined} />
								))}
							</BandedList>
						</div>
					);
				})}
			</div>
		</SettingCard>
		<ChannelConnectDialog channel={connecting} onClose={() => setConnecting(null)} />
		</>
	);
}

function IntegrationRow({ it, onConnect }: { it: WorkspaceIntegration; onConnect?: (() => void) | undefined }) {
	const connect = useWorkspace((s) => s.connectIntegration);
	const disconnect = useWorkspace((s) => s.disconnectIntegration);
	const sync = useWorkspace((s) => s.syncIntegration);
	const restore = () =>
		useWorkspace.setState((s) => ({
			integrations: s.integrations.map((i) => (i.key === it.key ? it : i)),
		}));

	const status =
		it.status === "connected" ? (
			<StatusPill tone="success" label="Gekoppeld" />
		) : it.status === "action_required" ? (
			<StatusPill tone="warning" label="Actie nodig" />
		) : it.status === "connecting" ? (
			<span className="flex items-center gap-1.5 text-sm text-ink-2">
				<Loader className="size-3.5 animate-spin" /> Koppelen…
			</span>
		) : null;

	return (
		<BandedRow
			leading={it.key === "webchat" ? <ChannelMark channel="webchat" size={32} /> : <BrandLogo brand={it.key} name={it.name} size={32} />}
			title={it.name}
			detail={
				it.status === "connected" && it.syncedAt
					? `${it.description} · gesynchroniseerd ${formatRelative(it.syncedAt)}`
					: it.status === "action_required"
						? `${it.description} · de toestemming is verlopen, dus er komen geen geschillen meer binnen`
						: it.description
			}
			trailing={
				<>
					{status}
					{it.status === "connected" ? (
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
					) : it.status !== "connecting" ? (
						<button
							type="button"
							onClick={async () => {
								if (onConnect) return onConnect();
								await connect(it.key);
								toast.success(`${it.name} gekoppeld`);
							}}
							className="flex h-7 items-center rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary transition-colors hover:bg-abyss-2"
						>
							{it.status === "action_required" ? "Opnieuw koppelen" : "Koppelen"}
						</button>
					) : null}
				</>
			}
		/>
	);
}
