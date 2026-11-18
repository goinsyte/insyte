import { Eye } from "../../icons";

/**
 * While Insyte-support looks along (M18): one `abyss` line across the top of the work, as while looking through a
 * role, saying until when and that it only reads. Every member sees it; the owner turns the consent off under
 * Gegevens en privacy.
 */
export function SupportBanner({ endsAt, onOpenSettings }: { endsAt: string; onOpenSettings?: () => void }) {
	const until = new Date(endsAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
	return (
		<div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-abyss px-3 text-mesh-ink text-sm" role="status">
			<Eye className="size-3.5 shrink-0 text-mesh-ink-2" strokeWidth={1.75} />
			<span className="truncate">
				<span className="font-medium">Insyte-support kijkt mee</span> tot {until}, alleen lezen
			</span>
			{onOpenSettings ? (
				<>
					<span className="text-mesh-ink-3">·</span>
					<button
						type="button"
						onClick={onOpenSettings}
						className="rounded-sm font-medium text-mesh-ink underline decoration-mesh-ink/35 underline-offset-2 hover:decoration-mesh-ink"
					>
						Instellingen
					</button>
				</>
			) : null}
		</div>
	);
}
