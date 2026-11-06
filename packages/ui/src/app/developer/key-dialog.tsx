import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { Check, Key } from "../../icons";
import { useEffect, useState } from "react";
import { Switch } from "../../components/switch";
import { SoonChip } from "../common/soon-chip";
import { Field, SelectField, TextField } from "../common/form-dialog";
import { CopyButton, IpInput, Token } from "./bits";
import { GHOST_BTN, PRIMARY_BTN, Segmented, StoreAccessPicker } from "../team/bits";
import { type ApiKey, EXPIRY, type KeyAccess, scopeSummary } from "../lib/developer";
import { type ApiAccess, API_AREAS, type AreaId, apiAccessOfRole, type StoreScope, scopesOf } from "../lib/permissions";
import { cn } from "../lib/utils";
import { useDeveloper } from "../stores/developer-store";
import { useSettings } from "../stores/settings-store";

const ME = "mem_elena";
const DAY = 86_400_000;

/**
 * A new key, in two steps. First what it may reach: a role from Rollen (the key then changes with
 * the role) or its own scopes per area, read or read and write; which stores; how long it lives; and
 * where requests may come from. Then the secret, once: it is shown in full, copied, and the dialog
 * only closes after "Ik heb hem opgeslagen", because there is no second look.
 */
export function CreateKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const roles = useSettings((s) => s.roles).filter((r) => r.id !== "owner");
	const [step, setStep] = useState<"form" | "secret">("form");
	const [label, setLabel] = useState("");
	const [mode, setMode] = useState<KeyAccess["kind"]>("role");
	const [roleId, setRoleId] = useState("view");
	const [scopes, setScopes] = useState<Partial<Record<AreaId, ApiAccess>>>({ orders: 1 });
	const [stores, setStores] = useState<StoreScope>("all");
	const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]["id"]>("90");
	const [ips, setIps] = useState<string[]>([]);
	const [agent, setAgent] = useState(false);
	const [fresh, setFresh] = useState<{ key: ApiKey; secret: string } | null>(null);
	const [saved, setSaved] = useState(false);
	const [nudge, setNudge] = useState(false);

	useEffect(() => {
		if (!open) return;
		setStep("form");
		setLabel("");
		setMode("role");
		setRoleId(roles.some((r) => r.id === "view") ? "view" : (roles[0]?.id ?? "view"));
		setScopes({ orders: 1 });
		setStores("all");
		setExpiry("90");
		setIps([]);
		setFresh(null);
		setSaved(false);
		setNudge(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reset once per opening
	}, [open]);

	const role = roles.find((r) => r.id === roleId);
	const access = mode === "role" ? (role ? apiAccessOfRole(role) : {}) : scopes;
	const count = scopesOf(access).length;
	const ok = label.trim().length > 0 && count > 0;

	function create() {
		if (!ok) return;
		const days = EXPIRY.find((e) => e.id === expiry)?.days ?? null;
		const made = useDeveloper.getState().createKey({
			label: label.trim(),
			created_by: ME,
			access: mode === "role" ? { kind: "role", roleId } : { kind: "custom", scopes },
			stores,
			expires_at: days === null ? null : new Date(Date.now() + days * DAY).toISOString(),
			ips,
			agent,
		});
		setFresh(made);
		setStep("secret");
	}

	function close(v: boolean) {
		if (!v && step === "secret" && !saved) {
			setNudge(true);
			return;
		}
		onOpenChange(v);
	}

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[600px] [&>*]:min-w-0" showCloseButton={step === "form"}>
				{step === "form" ? (
					<>
						<DialogHeader>
							<DialogTitle>API-sleutel aanmaken</DialogTitle>
							<DialogDescription>Voor een script of dienst die met Insyte praat. Geef hem niet meer dan hij nodig heeft.</DialogDescription>
						</DialogHeader>
						<form
							className="flex flex-col gap-5"
							onSubmit={(e) => {
								e.preventDefault();
								create();
							}}
						>
							<Field label="Naam">
								<TextField value={label} onChange={setLabel} placeholder="Voorraadfeed magazijn" />
							</Field>

							<div className="flex flex-col gap-2">
								<span className="font-medium text-ink-3 text-sm leading-none">Toegang</span>
								<Segmented
									label="Toegang"
									value={mode}
									onChange={setMode}
									options={[
										{ id: "role", label: "Een rol" },
										{ id: "custom", label: "Eigen rechten" },
									]}
								/>
								{mode === "role" ? (
									<div className="flex flex-col gap-1.5">
										<SelectField value={roleId} onChange={setRoleId} options={roles.map((r) => r.id)} renderLabel={(id) => roles.find((r) => r.id === id)?.label ?? id} />
										<p className="text-ink-2 text-sm leading-normal">
											{scopeSummary(access, 4)}. Verandert de rol onder Rollen, dan verandert deze sleutel mee. Team en facturatie zijn nooit bereikbaar met een sleutel.
										</p>
									</div>
								) : (
									<ScopePicker value={scopes} onChange={setScopes} />
								)}
							</div>

							<div className="flex flex-col gap-2">
								<span className="font-medium text-ink-3 text-sm leading-none">Winkels</span>
								<StoreAccessPicker value={stores} onChange={setStores} />
							</div>

							<div className="flex flex-col gap-2">
								<span className="font-medium text-ink-3 text-sm leading-none">Verloopt na</span>
								<Segmented label="Verloopt na" value={expiry} onChange={setExpiry} options={EXPIRY.map((e) => ({ id: e.id, label: e.label }))} />
								{expiry === "never" ? <span className="text-ink-3 text-xs">Een sleutel die nooit verloopt, blijft werken tot iemand hem intrekt. Zet hem dan op één adres.</span> : null}
							</div>

							<div className="flex flex-col gap-2">
								<span className="font-medium text-ink-3 text-sm leading-none">Alleen vanaf deze IP-adressen</span>
								<IpInput value={ips} onChange={setIps} />
							</div>

							<label className="flex items-start justify-between gap-3 rounded-lg bg-mist px-3 py-2.5">
								<span className="flex flex-col gap-0.5">
									<span className="flex items-center gap-2 font-medium text-ink text-sm">
										Gebruiken met een agent
										<SoonChip label="MCP binnenkort" />
									</span>
									<span className="text-ink-3 text-xs leading-normal">Voor je eigen AI-tools, met dezelfde rechten. Wat de agent schrijft, volgt Zelfstandigheid: bij Eerst vragen wordt het een voorstel in Insyte.</span>
								</span>
								<Switch checked={agent} onCheckedChange={setAgent} aria-label="Gebruiken met een agent" />
							</label>

							<DialogFooter className="sm:justify-between">
								<span className="text-ink-3 text-sm tabular-nums">{count === 0 ? "Kies minstens één recht" : `${count} ${count === 1 ? "scope" : "scopes"}`}</span>
								<div className="flex gap-2">
									<button type="button" onClick={() => onOpenChange(false)} className={GHOST_BTN}>
										Annuleren
									</button>
									<button type="submit" disabled={!ok} className={PRIMARY_BTN}>
										Sleutel aanmaken
									</button>
								</div>
							</DialogFooter>
						</form>
					</>
				) : fresh ? (
					<>
						<DialogHeader>
							<DialogTitle>{fresh.key.label} is klaar</DialogTitle>
							<DialogDescription>Kopieer de sleutel nu en bewaar hem in je secret manager. Insyte laat hem hierna nooit meer zien, ook jou niet.</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-3 rounded-lg bg-abyss p-4 text-mesh-ink">
							<span className="flex items-center gap-2 text-mesh-ink-2 text-sm">
								<Key className="size-3.5" strokeWidth={1.75} />
								Geheime sleutel
							</span>
							<span className="break-all rounded-md bg-mesh-ink/10 px-3 py-2.5 text-base text-mesh-ink tabular-nums leading-normal">{fresh.secret}</span>
							<CopyButton value={fresh.secret} tone="mesh" className="self-start" />
						</div>
						<label className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 text-base transition-colors", nudge && !saved ? "bg-signal-amber-bg" : "bg-mist")}>
							<input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4 accent-[var(--abyss)]" />
							<span className="flex flex-col gap-0.5">
								<span className="font-medium text-ink">Ik heb hem opgeslagen</span>
								<span className="text-ink-2 text-sm leading-normal">
									{nudge && !saved ? (
										"Vink dit aan voor je sluit. Kwijt is kwijt: dan maak je een nieuwe."
									) : (
										<>
											Daarna zie je alleen nog het begin: <Token>{fresh.key.prefix}…</Token>
										</>
									)}
								</span>
							</span>
						</label>
						<DialogFooter>
							<button type="button" disabled={!saved} onClick={() => onOpenChange(false)} className={PRIMARY_BTN}>
								<Check className="size-4" strokeWidth={2} />
								Klaar
							</button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

const ACCESS: ReadonlyArray<{ id: ApiAccess; label: string }> = [
	{ id: 0, label: "Geen" },
	{ id: 1, label: "Lezen" },
	{ id: 2, label: "Lezen en schrijven" },
];

/** Per area: nothing, read, or read and write — the scopes in the ids an automation uses. */
export function ScopePicker({ value, onChange }: { value: Partial<Record<AreaId, ApiAccess>>; onChange: (v: Partial<Record<AreaId, ApiAccess>>) => void }) {
	const all = (a: ApiAccess) => onChange(Object.fromEntries(API_AREAS.map((x) => [x.id, a])));
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex flex-wrap items-center gap-1 text-sm">
				<span className="text-ink-3">Alles op</span>
				{ACCESS.map((a) => (
					<button key={a.id} type="button" onClick={() => all(a.id)} className="rounded-md px-1.5 py-0.5 font-medium text-arc-ink hover:bg-arc-tint">
						{a.label.toLowerCase()}
					</button>
				))}
			</div>
			<ul className="flex flex-col overflow-hidden rounded-lg">
				{API_AREAS.map((a, i) => {
					const Icon = a.icon;
					const v = value[a.id] ?? 0;
					return (
						<li key={a.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5", i % 2 ? "bg-paper" : "bg-mist")}>
							<Icon className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
							<span className="min-w-0 flex-1 text-base text-ink">{a.label}</span>
							<div role="radiogroup" aria-label={a.label} className="flex gap-0.5 rounded-md bg-ink/5 p-0.5">
								{ACCESS.map((o) => (
									<button
										key={o.id}
										type="button"
										role="radio"
										aria-checked={v === o.id}
										onClick={() => onChange({ ...value, [a.id]: o.id })}
										className={cn("h-7 rounded-sm px-2 font-medium text-xs transition-colors", v === o.id ? (o.id === 0 ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "bg-abyss text-mesh-ink") : "text-ink-2 hover:text-ink")}
									>
										{o.label}
									</button>
								))}
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
