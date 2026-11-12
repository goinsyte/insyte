import { Link2 } from "../../../icons";
import type { TemplateLinks } from "../../lib/settings-depth";
import { cn } from "../../lib/utils";
import { FieldRow, UnsavedBar } from "../form";
import { SettingCard } from "../setting-card";
import { useSection, WELL } from "./kit";
import { useSettingsDepthSource } from "./source";

const FIELDS: ReadonlyArray<{ key: keyof TemplateLinks; label: string; variable: string; uses: number; hint: string }> = [
	{ key: "review", label: "Reviewlink", variable: "{review_link}", uses: 3, hint: "Na een bezorging en bij een tevreden antwoord." },
	{ key: "unsubscribe", label: "Uitschrijflink", variable: "{uitschrijf_link}", uses: 2, hint: "Onder elke mail die geen antwoord op een vraag is." },
	{ key: "restock", label: "Weer-op-voorraad-link", variable: "{voorraad_link}", uses: 1, hint: "Als een klant vraagt wanneer iets terug is." },
];

const bad = (v: string) => v.trim() !== "" && !/^https:\/\/[^\s.]+\.[^\s]+$/.test(v.trim());

/**
 * Sjablonen (`/settings/templates`, PLAN 43): the fixed links reply templates and the customer
 * agent put in, set once. An empty link drops the sentence that carries it rather than sending a
 * mail with a hole in it, and the preview shows exactly that.
 */
export function TemplatesPage() {
	const s = useSection("links", "Sjablonen", (a, b) => FIELDS.filter((f) => a[f.key] !== b[f.key]).map((f) => [f.label, a[f.key], b[f.key]]));
	const usage = useSettingsDepthSource().linkUsage;
	const invalid = FIELDS.some((f) => bad(s.draft[f.key]));
	return (
		<>
			<SettingCard title="Vaste links" icon={Link2} subtitle="Een link per soort. Sjablonen gebruiken ze met de variabele ernaast.">
				<div className="flex flex-col">
					{FIELDS.map((f) => {
						const uses = usage?.[f.key] ?? f.uses;
						return (
						<FieldRow key={f.key} label={f.label} hint={`${f.hint} In ${uses} ${uses === 1 ? "sjabloon" : "sjablonen"}.`}>
							<span className="flex flex-col gap-1.5">
								<input value={s.draft[f.key]} disabled={!s.canEdit} onChange={(e) => s.setDraft({ ...s.draft, [f.key]: e.target.value })} placeholder="https://" inputMode="url" aria-invalid={bad(s.draft[f.key])} aria-label={f.label} className={cn(WELL, "aria-[invalid=true]:bg-signal-red-bg")} />
								<span className="flex items-center gap-2 text-xs">
									<code className="rounded bg-ink/6 px-1.5 py-0.5 font-sans text-ink-2">{f.variable}</code>
									{bad(s.draft[f.key]) ? <span className="text-signal-red">Een link begint met https:// en heeft een domein.</span> : !s.draft[f.key] ? <span className="text-ink-3">Leeg: de zin met deze link valt weg.</span> : null}
								</span>
							</span>
						</FieldRow>
						);
					})}
				</div>
			</SettingCard>
			<SettingCard title="Voorbeeld" subtitle="Het sjabloon Pakket bezorgd, zoals de klant het krijgt.">
				<div className="max-w-[560px] rounded-xl bg-paper p-5 text-base text-ink leading-[1.6] shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
					<p>Hoi Lena,</p>
					<p className="mt-3">Je pakket is bezorgd. We hopen dat de Aurora Hooded Fleece goed past.</p>
					{s.draft.review ? (
						<p className="mt-3">
							Vertel je ons wat je ervan vindt?{" "}
							<span className="text-arc-ink underline decoration-arc-ink/35 underline-offset-2">{s.draft.review}</span>
						</p>
					) : null}
					<p className="mt-3">Groet, Sofía van Northwind</p>
					{s.draft.unsubscribe ? <p className="mt-4 text-ink-3 text-xs">Liever geen mails meer? <span className="underline">Uitschrijven</span></p> : null}
				</div>
			</SettingCard>
			<UnsavedBar visible={s.dirty && s.canEdit && !invalid} onDiscard={s.discard} onSave={() => s.save("Vaste links opgeslagen", "Sjablonen gebruiken vanaf nu deze links.")} />
		</>
	);
}
