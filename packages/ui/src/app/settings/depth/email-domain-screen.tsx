import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Mail, RefreshCcw } from "../../../icons";
import { useMyName } from "../../ask/agent-parts";
import { formatRelative } from "../../lib/format";
import type { DnsRecord, Domain } from "../../lib/settings-depth";
import { cn } from "../../lib/utils";
import { useSettingsDepth } from "../../stores/settings-depth-store";
import { FieldRow, UnsavedBar } from "../form";
import { SettingCard, StatusPill } from "../setting-card";
import { useSection, WELL } from "./kit";

const STATUS: Record<DnsRecord["status"], { tone: "success" | "warning" | "neutral"; label: string }> = { found: { tone: "success", label: "Gevonden" }, missing: { tone: "warning", label: "Niet gevonden" }, pending: { tone: "neutral", label: "Controleren…" } };

const copy = (text: string, what: string) => {
	void navigator.clipboard?.writeText(text).catch(() => undefined);
	toast(`${what} gekopieerd`);
};

/**
 * E-mail en domein (`/settings/email-domain`, PLAN 43): sending from the shop's own domain. The
 * four records to put at the domain host, each with its state and a copy button, a check that asks
 * again, and what to tell whoever manages the domain. Until all four are found mail still goes out,
 * and the page says the honest part: it may land in spam.
 */
export function EmailDomainPage() {
	const s = useSection("domain", "E-mail en domein", (a, b) => {
		const out: Array<[string, string, string]> = [];
		if (a.from !== b.from) out.push(["Mails van Insyte", a.from, b.from]);
		if (a.replyTo !== b.replyTo) out.push(["Antwoorden naar", a.replyTo, b.replyTo]);
		return out;
	});
	const d = useSettingsDepth((st) => st.domain);
	const me = useMyName();
	const [checking, setChecking] = useState(false);
	const found = d.records.filter((r) => r.status === "found").length;
	const all = found === d.records.length;

	const check = () => {
		setChecking(true);
		const pending: Domain = { ...d, records: d.records.map((r) => (r.status === "found" ? r : { ...r, status: "pending" as const })) };
		useSettingsDepth.setState({ domain: pending });
		window.setTimeout(() => {
			const n = d.checks + 1;
			/* The reference's DNS: DKIM appears on the first check, MX on the second, as records propagate. */
			const records = d.records.map((r): DnsRecord => (r.status === "found" || r.id === "dkim" || n >= 2 ? { ...r, status: "found", why: undefined } : { ...r, status: "missing" }));
			const before = d.records.filter((r) => r.status === "found").length;
			const after = records.filter((r) => r.status === "found").length;
			useSettingsDepth.getState().save("domain", { ...d, records, checks: n, checkedAt: new Date().toISOString() }, { who: me, page: "E-mail en domein", to: "/settings/email-domain", changes: [["DNS-records gevonden", `${before} van 4`, `${after} van 4`]] });
			setChecking(false);
			toast(after === records.length ? "Alle records gevonden" : `${after} van ${records.length} records gevonden`, { description: after === records.length ? "Mail van je domein is nu ondertekend en komt beter aan." : "De rest kan tot 24 uur duren. Controleer het later nog eens." });
		}, 1400);
	};

	const instructions = `Wil je deze records toevoegen aan ${d.domain}?\n\n${d.records.map((r) => `${r.type}  ${r.name}  ${r.value}`).join("\n")}\n\nDank je.`;

	return (
		<>
			<div className={cn("flex flex-wrap items-center gap-3 rounded-xl px-4 py-3", all ? "bg-signal-green-bg" : "bg-signal-amber-bg")}>
				{all ? <CheckCircle2 className="size-4 text-signal-green" strokeWidth={1.75} /> : <AlertTriangle className="size-4 text-signal-amber" strokeWidth={1.75} />}
				<p className="min-w-0 flex-1 text-ink text-sm">
					<span className="font-medium">{all ? "Je domein is klaar." : `${found} van ${d.records.length} records gevonden.`}</span> {all ? `Mail van ${d.domain} is ondertekend.` : "Mail gaat al de deur uit, maar kan in spam belanden tot alle vier er staan."}
				</p>
				<button type="button" onClick={() => copy(instructions, "Instructies")} className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-2.5 font-medium text-ink text-sm hover:bg-paper/80">
					<Copy className="size-3.5" strokeWidth={1.75} />
					Instructies voor je IT'er
				</button>
			</div>

			<SettingCard
				title={`DNS-records voor ${d.domain}`}
				icon={Mail}
				subtitle={`Voeg ze toe bij je domeinbeheerder. Laatst gecontroleerd ${formatRelative(d.checkedAt)}.`}
				action={
					<button type="button" disabled={checking} onClick={check} className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-xs shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-60">
						<RefreshCcw className={cn("size-3.5", checking && "animate-spin")} strokeWidth={1.75} />
						{checking ? "Controleren…" : "Opnieuw controleren"}
					</button>
				}
			>
				<div className="table-scroll overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
					<div className="grid min-w-[680px] grid-cols-[64px_170px_minmax(0,1fr)_130px] gap-3 bg-mist px-3.5 py-2 font-medium text-ink-3 text-xs">
						<span>Soort</span>
						<span>Naam</span>
						<span>Waarde</span>
						<span>Status</span>
					</div>
					{d.records.map((r, i) => (
						<div key={r.id} className={cn("grid min-w-[680px] grid-cols-[64px_170px_minmax(0,1fr)_130px] items-start gap-3 px-3.5 py-2.5 text-sm", i % 2 ? "bg-mist/40" : "bg-paper")}>
							<span className="pt-1 font-medium text-ink">{r.type}</span>
							<CopyCell text={r.name} what="Naam" />
							<span className="flex min-w-0 flex-col gap-1">
								<CopyCell text={r.value} what="Waarde" />
								{r.why && r.status === "missing" ? <span className="text-ink-3 text-xs">{r.why}</span> : null}
							</span>
							<span className="pt-1">
								<StatusPill tone={STATUS[r.status].tone} label={STATUS[r.status].label} />
							</span>
						</div>
					))}
				</div>
			</SettingCard>

			<SettingCard title="Afzenders" subtitle="Van welk adres Insyte mailt, en waar een antwoord landt.">
				<div className="flex flex-col">
					<FieldRow label="Mails van Insyte" hint="Sjablonen, retourmails en wat de klantagent mailt.">
						<input value={s.draft.from} disabled={!s.canEdit} onChange={(e) => s.setDraft({ ...s.draft, from: e.target.value })} type="email" aria-label="Mails van Insyte" className={WELL} />
					</FieldRow>
					<FieldRow label="Antwoorden naar" hint="Komt binnen in de Inbox.">
						<input value={s.draft.replyTo} disabled={!s.canEdit} onChange={(e) => s.setDraft({ ...s.draft, replyTo: e.target.value })} type="email" aria-label="Antwoorden naar" className={WELL} />
					</FieldRow>
				</div>
			</SettingCard>
			<UnsavedBar visible={s.dirty && s.canEdit} onDiscard={s.discard} onSave={() => s.save("Afzenders opgeslagen")} />
		</>
	);
}

function CopyCell({ text, what }: { text: string; what: string }) {
	return (
		<button type="button" onClick={() => copy(text, what)} title="Kopiëren" className="group/c flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink">
			<span className="min-w-0 break-all">{text}</span>
			<Copy className="size-3 shrink-0 text-ink-4 group-hover/c:text-ink-3" strokeWidth={1.75} />
		</button>
	);
}
