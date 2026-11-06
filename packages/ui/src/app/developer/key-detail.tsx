import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { RefreshCcw, Trash2 } from "../../icons";
import { useMemo, useRef, useState } from "react";
import { Gate } from "../access/gate";
import { TextField } from "../common/form-dialog";
import { StatusPill } from "../settings/setting-card";
import { CopyButton, IpInput, MadeBy, Method, Notice, StatusCode, Token, UsageChart } from "./bits";
import { GHOST_BTN, PRIMARY_BTN, Segmented, WELL_BTN } from "../team/bits";
import { type ApiKey, expiryState, GRACE, isRestricted, keyScopes, requestsFor, usageFor } from "../lib/developer";
import { formatDate, formatDateTime, formatRelative } from "../lib/format";
import { apiAccessOfRole, storeScopeLabel } from "../lib/permissions";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useGate } from "../stores/access-store";
import { useDeveloper } from "../stores/developer-store";
import { useSettings } from "../stores/settings-store";
import { useWorkspace } from "../stores/workspace-store";

/**
 * One key: what it reaches, who made it, how much it is used and what it asked for lately. Its name
 * and the addresses it may come from can change in place; rotating gives a new secret while the old
 * one keeps working for a grace period the operator picks, so a deploy has time to catch up; revoking
 * happens at once with Undo, and the key stops when the toast goes.
 */
export function KeyDetailDialog({ keyId, onClose }: { keyId: string | null; onClose: () => void }) {
	const key = useDeveloper((s) => s.apiKeys.find((k) => k.id === keyId));
	const top = useRef<HTMLDivElement>(null);
	return (
		<Dialog open={key !== undefined} onOpenChange={(v) => !v && onClose()}>
			{/* Focus lands on the key itself, not on its first field, so the dialog opens at the top. */}
			<DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[720px] [&>*]:min-w-0" initialFocus={top}>
				{key ? (
					<>
						<div ref={top} tabIndex={-1} className="sr-only">
							{key.label}
						</div>
						<Body k={key} onClose={onClose} />
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function Body({ k, onClose }: { k: ApiKey; onClose: () => void }) {
	const roles = useSettings((s) => s.roles);
	const stores = useWorkspace((s) => s.stores);
	const manage = useGate("integrations", 3);
	const roleAccess = (id: string) => {
		const r = roles.find((x) => x.id === id);
		return r ? apiAccessOfRole(r) : {};
	};
	const scopes = keyScopes(k, roleAccess);
	const requests = useMemo(() => requestsFor(k, scopes), [k, scopes.join()]);
	const usage = useMemo(() => usageFor(k), [k]);
	const exp = expiryState(k);
	const revoked = k.status === "revoked";
	const [name, setName] = useState(k.label);
	const [ips, setIps] = useState(k.ips);
	const [shown, setShown] = useState(10);
	const [rotating, setRotating] = useState(false);
	const [grace, setGrace] = useState<(typeof GRACE)[number]["id"]>("24h");
	const [secret, setSecret] = useState<string | null>(null);
	const dirty = name.trim() !== k.label || JSON.stringify(ips) !== JSON.stringify(k.ips);
	const roleName = k.access.kind === "role" ? (roles.find((r) => r.id === (k.access as { roleId: string }).roleId)?.label ?? "Verwijderde rol") : "Eigen rechten";

	function save() {
		const before = { label: k.label, ips: k.ips };
		useDeveloper.getState().updateKey(k.id, { label: name.trim() || k.label, ips });
		undoable(`${name.trim() || k.label} bijgewerkt`, () => useDeveloper.getState().updateKey(k.id, before));
	}

	function rotate() {
		const ms = GRACE.find((g) => g.id === grace)!.ms;
		setSecret(useDeveloper.getState().rotateKey(k.id, ms));
		setRotating(false);
	}

	function revoke() {
		const undo = useDeveloper.getState().revokeKey(k.id);
		onClose();
		undoable(`${k.label} ingetrokken`, undo, "Wat deze sleutel gebruikt, krijgt vanaf nu een 401. Ongedaan maken kan zolang deze melding staat.");
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle className="flex flex-wrap items-center gap-2">
					<span className="min-w-0 truncate">{k.label}</span>
					{revoked ? <StatusPill tone="neutral" label="Ingetrokken" /> : exp.tone === "red" ? <StatusPill tone="danger" label="Verlopen" /> : <StatusPill tone="success" label="Actief" />}
					{isRestricted(k) ? <StatusPill tone="info" label="Beperkt" /> : null}
				</DialogTitle>
				<DialogDescription className="flex flex-wrap items-center gap-1.5">
					<Token>{k.prefix}…</Token>
					<span>{revoked && k.revoked_at ? `ingetrokken ${formatRelative(k.revoked_at)}` : k.last_used_at ? `laatst gebruikt ${formatRelative(k.last_used_at)}` : "nog nooit gebruikt"}</span>
				</DialogDescription>
			</DialogHeader>

			{secret ? (
				<div className="flex flex-col gap-2 rounded-lg bg-abyss p-4 text-mesh-ink">
					<span className="text-mesh-ink-2 text-sm">De nieuwe sleutel, één keer. Zet hem in je deploy voordat de oude stopt.</span>
					<span className="break-all rounded-md bg-mesh-ink/10 px-3 py-2.5 text-base tabular-nums">{secret}</span>
					<div className="flex gap-2">
						<CopyButton value={secret} tone="mesh" />
						<button type="button" onClick={() => setSecret(null)} className="flex h-8 items-center rounded-md px-3 font-medium text-mesh-ink-2 text-sm hover:bg-mesh-ink/10 hover:text-mesh-ink">
							Ik heb hem opgeslagen
						</button>
					</div>
				</div>
			) : null}

			{k.rotated && !revoked ? (
				<Notice
					tone="amber"
					action={
						manage.ok ? (
							<button type="button" onClick={() => useDeveloper.getState().endGrace(k.id)} className="flex h-7 items-center rounded-md px-2.5 font-medium text-sm text-ink hover:bg-ink/6">
								Oude nu stoppen
							</button>
						) : null
					}
				>
					De oude sleutel <Token>{k.rotated.previousPrefix}…</Token> werkt nog tot {formatDateTime(k.rotated.until)} ({formatRelative(k.rotated.until)}).
				</Notice>
			) : null}
			{!revoked && exp.tone !== "none" ? (
				<Notice tone={exp.tone}>{exp.tone === "red" ? "Deze sleutel is verlopen. Verzoeken krijgen een 401; roteer hem of maak een nieuwe." : `${exp.label}. Roteer hem op tijd, dan loopt niets vast.`}</Notice>
			) : null}

			<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-mist sm:grid-cols-4">
				{(
					[
						["Toegang", roleName],
						["Winkels", storeScopeLabel(k.stores, stores).replace(/^./, (c) => c.toUpperCase())],
						["Gemaakt", <span key="m" className="flex items-center gap-1.5"><MadeBy memberId={k.created_by} /> · {formatDate(k.created_at, { day: "numeric", month: "short" })}</span>],
						["Verloopt", k.expires_at ? formatDate(k.expires_at, { day: "numeric", month: "short", year: "numeric" }) : "Nooit"],
					] as const
				).map(([label, value]) => (
					<div key={label} className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
						<dt className="text-ink-3 text-xs">{label}</dt>
						<dd className="truncate font-medium text-base text-ink">{value}</dd>
					</div>
				))}
			</dl>

			<UsageChart days={usage} />

			<section className="flex flex-col gap-2">
				<h3 className="font-medium text-ink-3 text-xs">Scopes · {scopes.length}</h3>
				<div className="flex flex-wrap gap-1">
					{scopes.map((s) => (
						<Token key={s} tone={s.endsWith(".write") ? "arc" : "ink"}>
							{s}
						</Token>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-2">
				<h3 className="font-medium text-ink-3 text-xs">Recente verzoeken</h3>
				{requests.length === 0 ? (
					<p className="rounded-lg bg-mist px-3.5 py-3 text-ink-3 text-sm">Nog geen verzoeken. Het eerste verschijnt hier zodra de sleutel gebruikt wordt.</p>
				) : (
					<div className="table-scroll">
						<table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
							<thead>
								<tr className="text-left text-ink-3 text-xs">
									<th className="h-8 px-2.5 font-medium">Verzoek</th>
									<th className="h-8 px-2.5 font-medium">Status</th>
									<th className="h-8 px-2.5 text-right font-medium">Duur</th>
									<th className="h-8 px-2.5 font-medium">Vanaf</th>
									<th className="h-8 px-2.5 text-right font-medium">Tijd</th>
								</tr>
							</thead>
							<tbody>
								{requests.slice(0, shown).map((r, i) => (
									<tr key={r.id} className={cn("h-9 text-ink-2", i % 2 ? "bg-paper" : "bg-mist", "[&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md")}>
										<td className="px-2.5">
											<span className="flex min-w-0 items-center gap-2">
												<Method method={r.method} />
												<span className="truncate text-ink tabular-nums">{r.path}</span>
											</span>
										</td>
										<td className="px-2.5">
											<StatusCode status={r.status} />
										</td>
										<td className="px-2.5 text-right tabular-nums">{r.ms} ms</td>
										<td className="px-2.5 tabular-nums">{r.ip}</td>
										<td className="whitespace-nowrap px-2.5 text-right tabular-nums">{formatRelative(r.at)}</td>
									</tr>
								))}
							</tbody>
						</table>
						{shown < requests.length ? (
							<button type="button" onClick={() => setShown((n) => n + 15)} className="mt-1 flex h-8 items-center rounded-md px-2 font-medium text-arc-ink text-sm hover:bg-arc-tint">
								Meer tonen
							</button>
						) : null}
					</div>
				)}
			</section>

			{revoked ? null : (
				<section className="flex flex-col gap-3">
					<h3 className="font-medium text-ink-3 text-xs">Naam en adressen</h3>
					<fieldset disabled={!manage.ok} className="flex flex-col gap-2 disabled:opacity-70">
						<TextField value={name} onChange={setName} />
						<IpInput value={ips} onChange={setIps} />
					</fieldset>
					{dirty ? (
						<button type="button" onClick={save} className={cn(PRIMARY_BTN, "self-start")}>
							Wijzigingen opslaan
						</button>
					) : null}
				</section>
			)}

			{rotating ? (
				<div className="flex flex-col gap-2.5 rounded-lg bg-mist px-3.5 py-3">
					<span className="text-base text-ink">Hoe lang mag de oude sleutel nog werken?</span>
					<Segmented label="Overgangstijd" value={grace} onChange={setGrace} options={GRACE.map((g) => ({ id: g.id, label: g.label }))} />
					<div className="flex gap-2">
						<button type="button" onClick={rotate} className={PRIMARY_BTN}>
							Nieuwe sleutel maken
						</button>
						<button type="button" onClick={() => setRotating(false)} className={GHOST_BTN}>
							Annuleren
						</button>
					</div>
				</div>
			) : null}

			{revoked ? null : (
				<DialogFooter className="sm:justify-between">
					<Gate perm="integrations" arg={3}>
						<button type="button" onClick={revoke} className={cn(GHOST_BTN, "text-signal-red hover:bg-signal-red-bg hover:text-signal-red")}>
							<Trash2 className="size-3.5" strokeWidth={1.75} />
							Intrekken
						</button>
					</Gate>
					<Gate perm="integrations" arg={3}>
						<button type="button" onClick={() => setRotating(true)} disabled={rotating} className={WELL_BTN}>
							<RefreshCcw className="size-3.5" strokeWidth={1.75} />
							Roteren
						</button>
					</Gate>
				</DialogFooter>
			)}
		</>
	);
}
