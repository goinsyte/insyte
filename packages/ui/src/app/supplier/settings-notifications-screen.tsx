import { Switch } from "../../components/switch";
import { SettingCard } from "../settings/setting-card";
import { type NotifyPrefs, useSupplier } from "../stores/supplier-store";

const ROWS: ReadonlyArray<{ key: keyof NotifyPrefs; label: string; detail: string }> = [
	{ key: "newOrder", label: "Nieuwe bestelling", detail: "Een e-mail zodra Northwind je een bestelling stuurt." },
	{ key: "late", label: "Bijna te laat", detail: "Een herinnering om 14:00 voor wat vandaag nog weg moet." },
	{ key: "message", label: "Bericht van Northwind", detail: "Een melding als het team je iets vraagt of vermeldt." },
	{ key: "digest", label: "Dagelijks overzicht", detail: "Elke ochtend om 08:00: te accepteren, te verzenden en te laat." },
];

/** What the supplier wants to hear about, and when. Changes apply at once. */
export function SupplierNotifications() {
	const notify = useSupplier((s) => s.notify);
	const set = useSupplier((s) => s.setNotify);
	return (
		<SettingCard title="Wat je hoort" subtitle={`Naar ${useSupplier.getState().profile.contact_email}.`}>
			<ul className="flex flex-col rounded-xl bg-paper">
				{ROWS.map((r) => (
					<li key={r.key} className="flex items-center gap-4 px-5 py-3.5 [&+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="font-medium text-base text-ink">{r.label}</span>
							<span className="text-ink-3 text-sm">{r.detail}</span>
						</span>
						<Switch checked={notify[r.key]} onCheckedChange={(v) => set({ [r.key]: v })} aria-label={r.label} />
					</li>
				))}
			</ul>
		</SettingCard>
	);
}
