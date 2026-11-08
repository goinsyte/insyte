import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/dialog";
import { FileText, X } from "../../icons";
import { useRef, useState } from "react";
import { Field, SelectField, TextAreaField } from "../common/form-dialog";
import { GHOST_BTN, PRIMARY_BTN, StorePicker } from "./bits";
import { abilitiesOf, roleLabel } from "./role-text";
import { type InviteRow, useSourceInviteRoles, useTeamSource } from "./source";
import { counted } from "../lib/counted";
import { EMAIL, isExpired, type StoreAccess } from "../lib/team-core";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";

/** Who is signed in: the owner of the demo workspace. */
export const ME = "mem_elena";

type Verdict = { ok: true } | { ok: false; reason: string };

/** Why an address cannot be invited, or that it can. Shared with the CSV import. */
export function useAddressCheck() {
	const { people: members, invites } = useTeamSource();
	return (email: string, earlier: ReadonlyArray<string> = []): Verdict => {
		const e = email.trim().toLowerCase();
		if (!EMAIL.test(e)) return { ok: false, reason: "Geen geldig e-mailadres" };
		if (earlier.includes(e)) return { ok: false, reason: "Staat er al tussen" };
		if (members.some((m) => m.email.toLowerCase() === e)) return { ok: false, reason: "Zit al in het team" };
		const open = invites.find((i) => i.email.toLowerCase() === e);
		if (open && !isExpired(open)) return { ok: false, reason: "Heeft al een uitnodiging" };
		return { ok: true };
	};
}

/** Send the invitations, with Undo; a lapsed invitation to the same address is replaced. */
export function useSendInvites() {
	const source = useTeamSource();
	return async (rows: ReadonlyArray<InviteRow>) => {
		const made = await source.send(rows.map((r) => ({ ...r, email: r.email.trim(), message: r.message?.trim() || undefined })));
		if (!made) return undefined;
		undoable(
			made.length === 1 ? `Uitnodiging verstuurd naar ${made[0]?.email}` : `${counted(made.length, "uitnodiging", "uitnodigingen")} verstuurd`,
			() => void source.unsend(made.map((m) => m.id)),
			"Ze krijgen een e-mail met een link die 7 dagen geldig is.",
		);
		return made;
	};
}

/**
 * Invite one or more colleagues. Addresses are typed or pasted into one well and become chips; a
 * chip that cannot be invited says why. The role comes from Settings → Rollen, with what it may do
 * written under it, and the stores it opens are picked one by one. The seats left on the plan are
 * counted in the foot, and the send is refused past them, with the way to buy more.
 */
export function InviteDialog({ open, onOpenChange, onBulk }: { open: boolean; onOpenChange: (v: boolean) => void; onBulk?: () => void }) {
	const roles = useSourceInviteRoles();
	const source = useTeamSource();
	const seats = source.seats;
	const check = useAddressCheck();
	const sendInvites = useSendInvites();
	const [emails, setEmails] = useState<string[]>([]);
	const [draft, setDraft] = useState("");
	const [roleId, setRoleId] = useState("service");
	const [stores, setStores] = useState<StoreAccess>("all");
	const [message, setMessage] = useState("");
	const [tried, setTried] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const abilities = abilitiesOf(source.roles, source.stores, roleId);

	function reset() {
		setEmails([]);
		setDraft("");
		setRoleId(roles.some((r) => r.id === "service") ? "service" : (roles[0]?.id ?? "view"));
		setStores("all");
		setMessage("");
		setTried(false);
	}

	function commit(raw: string) {
		const parts = raw
			.split(/[\s,;]+/)
			.map((p) => p.trim().replace(/^<|>$/g, ""))
			.filter(Boolean);
		if (parts.length === 0) return;
		setEmails((xs) => [...xs, ...parts.filter((p) => !xs.includes(p.toLowerCase())).map((p) => p.toLowerCase())]);
		setDraft("");
	}

	const all = draft.trim() ? [...emails, draft.trim().toLowerCase()] : emails;
	const verdicts = all.map((e, i) => ({ email: e, v: check(e, all.slice(0, i)) }));
	const good = verdicts.filter((x) => x.v.ok).map((x) => x.email);
	const bad = verdicts.length - good.length;
	const over = good.length > seats.free;

	function submit() {
		setTried(true);
		if (draft.trim()) commit(draft);
		if (good.length === 0 || bad > 0 || over) return;
		void sendInvites(good.map((email) => ({ email, roleId, stores, message }))).then((made) => {
			if (!made) return;
			reset();
			onOpenChange(false);
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
			<DialogContent className="sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>Collega's uitnodigen</DialogTitle>
					<DialogDescription>Ze krijgen een e-mail met een link en tellen als plek tot ze accepteren of de link verloopt.</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<div className="flex items-baseline justify-between">
							<label htmlFor="invite-emails" className="font-medium text-ink-3 text-sm leading-none">
								E-mailadressen
							</label>
							{onBulk ? (
								<button
									type="button"
									onClick={() => {
										onOpenChange(false);
										onBulk();
									}}
									className="inline-flex items-center gap-1 font-medium text-arc-ink text-sm leading-none hover:text-ink"
								>
									<FileText className="size-3.5" strokeWidth={1.75} />
									Uit een CSV
								</button>
							) : null}
						</div>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: clicking the well focuses its input */}
						{/* biome-ignore lint/a11y/useKeyWithClickEvents: the input inside takes the keyboard */}
						<div
							onClick={() => input.current?.focus()}
							className={cn(
								"field flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 hover:field-hover focus-within:bg-paper",
								tried && good.length === 0 && bad === 0 && "bg-signal-red-bg",
							)}
						>
							{verdicts.slice(0, emails.length).map(({ email, v }) => (
								<span
									key={email}
									title={v.ok ? undefined : v.reason}
									className={cn(
										"inline-flex h-7 max-w-full items-center gap-1 rounded-md pr-1 pl-2 text-sm",
										v.ok ? "bg-paper text-ink shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]" : "bg-signal-red-bg text-signal-red",
									)}
								>
									<span className="truncate">{email}</span>
									{v.ok ? null : <span className="shrink-0 text-xs">· {v.reason}</span>}
									<button
										type="button"
										aria-label={`${email} weghalen`}
										onClick={(e) => {
											e.stopPropagation();
											setEmails((xs) => xs.filter((x) => x !== email));
										}}
										className="flex size-5 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-ink/8 hover:text-ink"
									>
										<X className="size-3" strokeWidth={2} />
									</button>
								</span>
							))}
							<input
								id="invite-emails"
								ref={input}
								type="email"
								multiple
								autoFocus
								value={draft}
								onChange={(e) => {
									const v = e.target.value;
									if (/[,;\s]$/.test(v)) commit(v);
									else setDraft(v);
								}}
								onKeyDown={(e) => {
									if ((e.key === "Enter" || e.key === "Tab") && draft.trim()) {
										e.preventDefault();
										commit(draft);
									} else if (e.key === "Enter") {
										e.preventDefault();
										submit();
									} else if (e.key === "Backspace" && !draft && emails.length > 0) {
										setEmails((xs) => xs.slice(0, -1));
									}
								}}
								onPaste={(e) => {
									const text = e.clipboardData.getData("text");
									if (/[\s,;]/.test(text.trim())) {
										e.preventDefault();
										commit(`${draft}${text}`);
									}
								}}
								onBlur={() => draft.trim() && commit(draft)}
								placeholder={emails.length === 0 ? "amber@northwindclothing.co, jonas@…" : ""}
								className="h-7 min-w-[180px] flex-1 bg-transparent px-1.5 text-base text-ink outline-none placeholder:text-ink-3"
							/>
						</div>
						<span className="text-ink-3 text-xs">Plak er zoveel als je wilt, gescheiden door komma's of regels.</span>
					</div>

					<Field label="Rol">
						<SelectField value={roleId} onChange={setRoleId} options={roles.map((r) => r.id)} renderLabel={(id) => roleLabel(roles, id)} />
					</Field>
					<p className="-mt-2 text-ink-2 text-sm leading-normal">
						{abilities.length === 0 ? "Deze rol kan nog niets. Stel hem in onder Rollen." : abilities.join(" ")}
					</p>

					<div className="flex flex-col gap-1.5">
						<span className="font-medium text-ink-3 text-sm leading-none">Winkels</span>
						<StorePicker value={stores} onChange={setStores} stores={source.stores} />
					</div>

					<Field label="Persoonlijk bericht (optioneel)">
						<TextAreaField value={message} onChange={setMessage} placeholder="Begin met de chargeback-wachtrij, ik loop de eerste week met je mee." rows={2} />
					</Field>
				</div>

				<DialogFooter className="sm:justify-between">
					<p className={cn("text-sm tabular-nums", over ? "font-medium text-signal-red" : "text-ink-2")}>
						{over ? (
							<>
								Nog {counted(seats.free, "plek", "plekken")} vrij.{" "}
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
						) : tried && bad > 0 ? (
							<span className="font-medium text-signal-red">Haal de rode adressen weg om te versturen.</span>
						) : (
							`${seats.used + good.length} van ${seats.total} plekken bezet na versturen`
						)}
					</p>
					<div className="flex gap-2">
						<button type="button" onClick={() => onOpenChange(false)} className={GHOST_BTN}>
							Annuleren
						</button>
						<button type="button" onClick={submit} disabled={all.length === 0 || over} className={PRIMARY_BTN}>
							{good.length > 1 ? `${good.length} uitnodigingen versturen` : "Uitnodiging versturen"}
						</button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
