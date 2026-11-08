import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { CheckCircle2, Download, Upload, XCircle } from "../../icons";
import { useMemo, useRef, useState } from "react";
import { Field, SelectField } from "../common/form-dialog";
import { GHOST_BTN, PRIMARY_BTN, WELL_BTN } from "./bits";
import { useAddressCheck, useSendInvites } from "./invite-dialog";
import { roleLabel, storeAccessLabel } from "./role-text";
import { useSourceInviteRoles, useTeamSource } from "./source";
import { counted } from "../lib/counted";
import type { StoreAccess } from "../lib/team-core";
import { cn } from "../lib/utils";

type Row = { line: number; email: string; roleId: string; stores: StoreAccess; problem?: string; note?: string };

const TEMPLATE = "e-mail,rol,winkels\namber@northwindclothing.co,Klantenservice,Northwind US|Northwind EU\njonas@northwindclothing.co,Financiën,\n";

/**
 * Many at once, from a spreadsheet. Paste the rows or drop the file: one address per row, then
 * optionally the role (as Rollen names it) and the stores (separated by |). Every row is read before
 * anything is sent and shown with what will happen to it, so a typo is caught here and not in an
 * inbox. Only the rows that are ready go out, and never more than the seats left.
 */
export function BulkInviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const roles = useSourceInviteRoles();
	const source = useTeamSource();
	const shops = source.stores;
	const seats = source.seats;
	const check = useAddressCheck();
	const sendInvites = useSendInvites();
	const [text, setText] = useState("");
	const [fallbackRole, setFallbackRole] = useState("service");
	const [file, setFile] = useState<string | null>(null);
	const picker = useRef<HTMLInputElement>(null);

	const rows = useMemo<Row[]>(() => {
		const seen: string[] = [];
		const out: Row[] = [];
		for (const [i, raw] of text.split(/\r?\n/).entries()) {
			const cells = raw.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
			const email = (cells[0] ?? "").toLowerCase();
			if (!email) continue;
			// A header row names its columns instead of holding an address.
			if (i === 0 && !email.includes("@") && /mail/.test(email)) continue;
			const roleCell = cells[1] ?? "";
			const role = roleCell ? roles.find((r) => r.label.toLowerCase() === roleCell.toLowerCase() || r.id === roleCell.toLowerCase()) : undefined;
			const storeNames = (cells[2] ?? "").split("|").map((s) => s.trim()).filter(Boolean);
			const storeIds = storeNames.map((n) => shops.find((s) => s.name.toLowerCase() === n.toLowerCase())?.id);
			const v = check(email, seen);
			seen.push(email);
			const problem = !v.ok ? v.reason : storeIds.includes(undefined) ? `Onbekende winkel: ${storeNames[storeIds.indexOf(undefined)]}` : undefined;
			out.push({
				line: i + 1,
				email,
				roleId: role?.id ?? fallbackRole,
				stores: storeIds.length === 0 || storeIds.length === shops.length ? "all" : (storeIds as string[]),
				problem,
				note: roleCell && !role ? `Rol "${roleCell}" bestaat niet, wordt ${roleLabel(roles, fallbackRole)}` : undefined,
			});
		}
		return out;
	}, [text, roles, shops, check, fallbackRole]);

	const ready = rows.filter((r) => !r.problem);
	const sendable = ready.slice(0, seats.free);
	const short = ready.length - sendable.length;

	function reset() {
		setText("");
		setFile(null);
	}

	function read(f: File) {
		void f.text().then((t) => {
			setText(t);
			setFile(f.name);
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v) reset();
				onOpenChange(v);
			}}
		>
			<DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[720px]">
				<DialogHeader>
					<DialogTitle>Uitnodigen uit een CSV</DialogTitle>
					<DialogDescription>Eén adres per regel, dan de rol en de winkels (gescheiden door |). Je ziet elke regel voordat er iets verstuurd wordt.</DialogDescription>
				</DialogHeader>

				{/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target around the paste well */}
				<div
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						const f = e.dataTransfer.files[0];
						if (f) read(f);
					}}
					className="flex flex-col gap-2"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<label htmlFor="bulk-csv" className="font-medium text-ink-3 text-sm leading-none">
							{file ? `Uit ${file}` : "Plak de regels of sleep het bestand hierheen"}
						</label>
						<div className="flex gap-1.5">
							<button
								type="button"
								onClick={() => {
									const a = document.createElement("a");
									a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
									a.download = "uitnodigingen-voorbeeld.csv";
									a.click();
									URL.revokeObjectURL(a.href);
								}}
								className={WELL_BTN}
							>
								<Download className="size-3.5" strokeWidth={1.75} />
								Voorbeeld
							</button>
							<button type="button" onClick={() => picker.current?.click()} className={WELL_BTN}>
								<Upload className="size-3.5" strokeWidth={1.75} />
								Bestand kiezen
							</button>
							<input
								ref={picker}
								type="file"
								accept=".csv,text/csv,.txt"
								className="sr-only"
								tabIndex={-1}
								aria-hidden
								onChange={(e) => {
									const f = e.target.files?.[0];
									if (f) read(f);
									e.target.value = "";
								}}
							/>
						</div>
					</div>
					<textarea
						id="bulk-csv"
						value={text}
						onChange={(e) => {
							setText(e.target.value);
							setFile(null);
						}}
						rows={5}
						placeholder={TEMPLATE.trim()}
						className="field w-full rounded-lg px-3.5 py-2.5 text-base text-ink leading-normal outline-none hover:field-hover placeholder:text-ink-3"
					/>
				</div>

				<Field label="Rol voor regels zonder rol">
					<SelectField value={fallbackRole} onChange={setFallbackRole} options={roles.map((r) => r.id)} renderLabel={(id) => roleLabel(roles, id)} />
				</Field>

				{rows.length > 0 ? (
					<section className="flex flex-col gap-1.5" aria-label="Voorbeeld">
						<h3 className="font-medium text-ink-3 text-xs tabular-nums">
							{counted(rows.length, "regel", "regels")} · {ready.length} klaar · {rows.length - ready.length} met een probleem
						</h3>
						<div className="table-scroll">
							<table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
								<thead>
									<tr className="text-left text-ink-3 text-xs">
										<th className="h-8 w-10 px-2.5 font-medium">Regel</th>
										<th className="px-2.5 font-medium">E-mail</th>
										<th className="px-2.5 font-medium">Rol</th>
										<th className="px-2.5 font-medium">Winkels</th>
										<th className="px-2.5 font-medium">Wat er gebeurt</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((r, i) => (
										<tr key={`${r.line}-${r.email}`} className={cn(i % 2 === 0 && "bg-mist", "[&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md")}>
											<td className="h-9 px-2.5 text-ink-3 tabular-nums">{r.line}</td>
											<td className="max-w-[200px] truncate px-2.5 text-ink">{r.email}</td>
											<td className="px-2.5 text-ink-2">{roleLabel(roles, r.roleId)}</td>
											<td className="max-w-[160px] truncate px-2.5 text-ink-2">{storeAccessLabel(shops, r.stores)}</td>
											<td className="px-2.5">
												{r.problem ? (
													<span className="inline-flex items-center gap-1.5 font-medium text-signal-red">
														<XCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
														{r.problem}
													</span>
												) : (
													<span className="inline-flex items-center gap-1.5 text-ink-2" title={r.note}>
														<CheckCircle2 className="size-3.5 shrink-0 text-signal-green" strokeWidth={1.75} />
														{r.note ?? "Wordt uitgenodigd"}
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				) : null}

				<DialogFooter className="sm:justify-between">
					<p className={cn("text-sm tabular-nums", short > 0 ? "font-medium text-signal-amber" : "text-ink-2")}>
						{short > 0 ? (
							<>
								Nog {counted(seats.free, "plek", "plekken")} vrij, {short} blijven liggen.{" "}
								<button
									type="button"
									onClick={() => {
										onOpenChange(false);
										source.buySeats();
									}}
									className="font-medium text-arc-ink underline decoration-arc-ink/35 underline-offset-2 hover:decoration-arc-ink"
								>
									Plek bijkopen
								</button>
							</>
						) : (
							`${seats.free} ${seats.free === 1 ? "plek" : "plekken"} vrij`
						)}
					</p>
					<div className="flex gap-2">
						<button type="button" onClick={() => onOpenChange(false)} className={GHOST_BTN}>
							Annuleren
						</button>
						<button
							type="button"
							disabled={sendable.length === 0}
							onClick={() => {
								void sendInvites(sendable).then((made) => {
									if (!made) return;
									reset();
									onOpenChange(false);
								});
							}}
							className={PRIMARY_BTN}
						>
							{sendable.length === 0 ? "Niets om te versturen" : `${counted(sendable.length, "uitnodiging", "uitnodigingen")} versturen`}
						</button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
