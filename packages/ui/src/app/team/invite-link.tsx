import { Switch } from "../../components/switch";
import { Copy, RefreshCcw } from "../../icons";
import { toast } from "sonner";
import { SelectField } from "../common/form-dialog";
import { Segmented, WELL_BTN } from "./bits";
import { roleLabel } from "./role-text";
import { useSourceInviteRoles, useTeamSource } from "./source";
import { formatRelative } from "../lib/format";
import { DAY, LINK_DAYS } from "../lib/team-core";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";

/**
 * One address anyone on the team can pass on, for when typing every colleague's email is the slow
 * part. It grants one role, lapses after a set time, and can be turned off or replaced — replacing it
 * kills the old one, with Undo. People who come in through it still take a seat.
 *
 * Off, there is no link: no address, nothing to copy or replace, and no date it was made. What it will
 * grant and for how long can be set beforehand, so it opens at the right role.
 */
export function InviteLinkSection() {
	const source = useTeamSource();
	const link = source.link;
	const roles = useSourceInviteRoles();
	const url = link.url;
	const expiresAt = link.createdAt + link.days * DAY;
	const lapsed = expiresAt <= Date.now();

	async function copy() {
		if (!url) return void toast.error("Geen link om te kopiëren", { description: "Je rol kan de link niet zien." });
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Link gekopieerd", { description: `Wie hem opent, komt binnen als ${roleLabel(roles, link.roleId)}.` });
		} catch {
			toast.error("Kopiëren lukte niet", { description: url });
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-3">
				<Switch
					checked={link.enabled}
					aria-label="Uitnodigen via link"
					onCheckedChange={(v) => {
						void source.setLink({ enabled: v }).then((ok) => {
							if (ok) undoable(v ? "Link staat aan" : "Link staat uit", () => void source.setLink({ enabled: !v }), v ? undefined : "Wie hem al heeft, komt er niet meer mee binnen.");
						});
					}}
				/>
				<span className="text-base text-ink">{link.enabled ? "Iedereen met deze link kan deelnemen" : "Uit · alleen wie je per e-mail uitnodigt komt binnen"}</span>
			</div>

			<div className="flex flex-col gap-4">
				{link.enabled ? (
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<input
							readOnly
							value={url}
							aria-label="Uitnodigingslink"
							onFocus={(e) => e.currentTarget.select()}
							className="field h-9 min-w-0 flex-1 rounded-lg px-3 text-base text-ink-2 outline-none"
						/>
						<div className="flex shrink-0 gap-1.5">
							<button type="button" onClick={() => void copy()} className={cn(WELL_BTN, "h-9")}>
								<Copy className="size-3.5" strokeWidth={1.75} />
								Kopiëren
							</button>
							<button
								type="button"
								onClick={() => {
									void source.regenerateLink().then((ok) => {
										if (ok) undoable("Nieuwe link gemaakt", () => void source.undoRegenerateLink(), "De vorige link werkt niet meer.");
									});
								}}
								className={cn(WELL_BTN, "h-9")}
							>
								<RefreshCcw className="size-3.5" strokeWidth={1.75} />
								Nieuwe link
							</button>
						</div>
					</div>
				) : null}

				<div className="grid gap-4 sm:grid-cols-[200px_minmax(0,380px)] sm:items-center">
					<span className="font-medium text-base text-ink">Rol bij deelnemen</span>
					<SelectField
						label="Rol bij deelnemen"
						value={link.roleId}
						onChange={(roleId) => void source.setLink({ roleId })}
						options={roles.map((r) => r.id)}
						renderLabel={(id) => roleLabel(roles, id)}
					/>
					<span className="font-medium text-base text-ink">Geldig</span>
					<Segmented label="Geldig" value={link.days} options={LINK_DAYS} onChange={(days) => void source.setLink({ days })} />
				</div>

				{link.enabled ? (
					<p className="text-ink-2 text-sm tabular-nums">
						Gemaakt {formatRelative(new Date(link.createdAt))} ·{" "}
						<span className={cn(lapsed && "font-medium text-signal-amber")}>
							{lapsed ? `verlopen ${formatRelative(new Date(expiresAt))}, maak een nieuwe` : `verloopt ${formatRelative(new Date(expiresAt))}`}
						</span>{" "}
						· {link.joined === 0 ? "nog niemand via deze link" : `${link.joined} ${link.joined === 1 ? "persoon" : "mensen"} via deze link`}
					</p>
				) : null}
			</div>
		</div>
	);
}
