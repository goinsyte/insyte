import { Lock } from "../../icons";

/** "Alleen lezen": a page the role may read but not change, said above it with the permission it misses. */
export function ReadOnlyNotice({ reason }: { reason: string }) {
	return (
		<p className="flex items-start gap-2 rounded-lg bg-mist px-3 py-2.5 text-ink-2 text-sm leading-normal">
			<Lock className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
			<span>
				<span className="font-medium text-ink">Alleen lezen.</span> {reason}, dus je kunt hier kijken maar niets wijzigen.
			</span>
		</p>
	);
}
