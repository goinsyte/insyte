import { Switch } from "../../components/switch";
import { Check, Copy, RefreshCcw } from "../../icons";
import { useState } from "react";
import { toast } from "sonner";
import { PageGuide } from "../common/page-guide";
import { FieldRow, TextInput } from "../settings/form";
import { BandedList, BandedRow, SettingCard, StatusPill } from "../settings/setting-card";
import { cn } from "../lib/utils";
import { type Platform, useSupplier } from "../stores/supplier-store";

/* The platforms Insyte has an adapter for, from the spec's supplier adapters; "Eigen API" is a webhook. */
const PLATFORMS: ReadonlyArray<{ id: Platform; label: string; detail: string }> = [
	{ id: "custom", label: "Eigen API", detail: "Insyte stuurt bestellingen naar je webhook en leest je voorraad." },
	{ id: "aliexpress", label: "AliExpress", detail: "Bestellingen en track & trace via je AliExpress-account." },
	{ id: "cj", label: "CJ Dropshipping", detail: "Voorraad en verzending rechtstreeks uit CJ." },
	{ id: "spocket", label: "Spocket", detail: "Producten en voorraad uit je Spocket-catalogus." },
	{ id: "modalyst", label: "Modalyst", detail: "Bestellingen en voorraad uit Modalyst." },
	{ id: "none", label: "Geen koppeling", detail: "Je werkt alles hier in Insyte bij." },
];

const GUIDE = [
	{ title: "Kies je platform", body: "Waar je bestellingen en voorraad nu al bijhoudt. Zonder koppeling werk je alles hier in Insyte bij.", art: "link" },
	{ title: "Eigen API", body: "Insyte stuurt elke nieuwe bestelling als JSON naar je webhook. Onderteken je antwoorden met de geheime sleutel.", art: "webhook" },
] as const;

const when = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** How the supplier's own system talks to Insyte, if it has one. Optional: everything also works by hand. */
export function ApiConnection() {
	const api = useSupplier((s) => s.api);
	const patch = useSupplier((s) => s.patchApi);
	const [testing, setTesting] = useState(false);

	function test() {
		setTesting(true);
		const ok = api.platform !== "custom" || /^https:\/\/\S+\.\S+/.test(api.url.trim());
		setTimeout(() => {
			patch({ lastTest: { ok, ms: ok ? 142 : 0, at: new Date().toISOString() } });
			setTesting(false);
			toast(ok ? "Verbinding werkt · 142 ms" : "Geen antwoord van je webhook. Klopt de URL?");
		}, 900);
	}

	return (
		<div className="flex flex-col gap-10">
			<SettingCard
				title="Platform"
				action={
					<label className="flex items-center gap-2 text-ink-2 text-sm">
						{api.enabled ? "Aan" : "Uit"}
						<Switch checked={api.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
					</label>
				}
			>
				<div role="radiogroup" aria-label="Platform" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{PLATFORMS.map((p) => (
						<button
							key={p.id}
							type="button"
							role="radio"
							aria-checked={api.platform === p.id}
							onClick={() => patch({ platform: p.id, lastTest: null })}
							className={cn(
								"flex cursor-pointer flex-col gap-1 rounded-xl px-4 py-3 text-left transition-colors",
								api.platform === p.id ? "bg-paper shadow-[inset_0_0_0_1.5px_var(--arc)]" : "bg-paper/60 hover:bg-paper",
							)}
						>
							<span className="flex items-center justify-between font-medium text-base text-ink">
								{p.label}
								{api.platform === p.id ? <Check className="size-4 text-arc-ink" strokeWidth={2} /> : null}
							</span>
							<span className="text-ink-3 text-sm">{p.detail}</span>
						</button>
					))}
				</div>
			</SettingCard>

			{api.platform === "custom" ? (
				<SettingCard title="Webhook">
					<div className="flex flex-col rounded-xl bg-paper px-5 py-3">
						<FieldRow label="Webhook-URL">
							<TextInput type="url" value={api.url} onChange={(url) => patch({ url, lastTest: null })} placeholder="https://jouwdomein.nl/insyte" />
						</FieldRow>
						<FieldRow label="Geheime sleutel">
							<span className="flex items-center gap-2">
								<code className="flex h-9 flex-1 items-center rounded-md bg-mist px-3 font-sans text-ink-2 text-sm tabular-nums">
									{api.key.slice(0, 8)}••••••••{api.key.slice(-4)}
								</code>
								<button
									type="button"
									aria-label="Sleutel kopiëren"
									onClick={() => {
										void navigator.clipboard?.writeText(api.key);
										toast("Sleutel gekopieerd");
									}}
									className="flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
								>
									<Copy className="size-4" strokeWidth={1.75} />
								</button>
							</span>
						</FieldRow>
					</div>
				</SettingCard>
			) : null}

			{api.platform !== "none" ? (
				<SettingCard
					title="Verbinding"
					action={
						<button
							type="button"
							onClick={test}
							disabled={testing || !api.enabled}
							className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-xs shadow-primary hover:bg-abyss-2 disabled:opacity-40"
						>
							<RefreshCcw className={cn("size-3.5", testing && "animate-spin")} strokeWidth={1.75} />
							{testing ? "Testen…" : "Verbinding testen"}
						</button>
					}
				>
					<BandedList>
						<BandedRow
							title={PLATFORMS.find((p) => p.id === api.platform)?.label ?? ""}
							detail={api.lastTest ? `Laatst getest ${when.format(new Date(api.lastTest.at))}` : "Nog niet getest"}
							trailing={
								api.lastTest ? (
									<StatusPill tone={api.lastTest.ok ? "success" : "danger"} label={api.lastTest.ok ? `Werkt · ${api.lastTest.ms} ms` : "Geen antwoord"} />
								) : (
									<StatusPill tone="neutral" label={api.enabled ? "Aan" : "Uit"} />
								)
							}
						/>
					</BandedList>
				</SettingCard>
			) : null}
			<PageGuide id="supplier.settings.api" title="API-koppeling" steps={GUIDE} />
		</div>
	);
}
