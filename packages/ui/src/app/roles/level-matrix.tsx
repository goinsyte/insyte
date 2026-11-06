import { Check } from "../../icons";
import { motion, useReducedMotion } from "motion/react";
import { AREAS, type AreaId, clampLevel, type Level, LEVELS } from "../lib/permissions";
import { cn } from "../lib/utils";

/**
 * The matrix: every area down the side, Geen · Bekijken · Bewerken · Beheren across, one choice per
 * row. Levels are a ladder — Bewerken includes Bekijken — so the row draws the ladder: an `arc-tint`
 * track from the first step up to the chosen one, and the chosen step as the `arc` knob. A level an
 * area does not have (Analyse has no Bewerken) is an empty cell, not a disabled button.
 *
 * A column's head sets every area to that level, which is how a role is roughed out before it is
 * tuned. The rows are the data table's: a 32px head of `ink-3` labels, then rows on a white card
 * with a hairline between them, because each row is a record of what the role may do.
 */
export function LevelMatrix({
	levels,
	onChange,
	onAll,
	readOnly,
	base,
}: {
	levels: Record<AreaId, Level>;
	onChange: (area: AreaId, level: Level) => void;
	onAll: (level: Level) => void;
	readOnly?: boolean;
	/** The role this one was made from: a step that differs from it is marked. */
	base?: Record<AreaId, Level>;
}) {
	const still = useReducedMotion();
	return (
		<div className="overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
			<div className="hidden h-9 items-center bg-mist px-3.5 sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(4,84px)]">
				<span className="font-medium text-ink-3 text-xs">Onderdeel</span>
				{LEVELS.map((l) => (
					<button
						key={l.level}
						type="button"
						disabled={readOnly}
						onClick={() => onAll(l.level)}
						title={readOnly ? undefined : `Alles op ${l.label.toLowerCase()}`}
						className="mx-auto flex h-7 items-center rounded-md px-2 font-medium text-ink-3 text-xs transition-colors enabled:hover:bg-ink/6 enabled:hover:text-ink disabled:cursor-default"
					>
						{l.label}
					</button>
				))}
			</div>
			<ul className="[&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
				{AREAS.map((area) => {
					const level = levels[area.id];
					const Icon = area.icon;
					const changed = base !== undefined && base[area.id] !== level;
					return (
						<li key={area.id} className="grid grid-cols-1 gap-2 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(4,84px)] sm:items-center sm:gap-0 sm:py-2">
							<div className="flex min-w-0 items-start gap-2.5">
								<Icon className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
								<div className="flex min-w-0 flex-col">
									<span className="flex items-center gap-1.5 font-medium text-base text-ink">
										{area.label}
										{changed ? <span className="size-1.5 rounded-[1px] bg-arc" title="Anders dan de rol waar deze van komt" /> : null}
									</span>
									<span className="truncate text-ink-3 text-sm">{level === 0 ? "Ziet dit onderdeel niet" : `Kan ${area.can[level]}`}</span>
								</div>
							</div>
							<div role="radiogroup" aria-label={area.label} className="relative grid grid-cols-4 sm:col-span-4">
								{/* The ladder's track, from the first step to the chosen one. */}
								{level > 0 ? (
									<motion.span
										aria-hidden
										className="absolute top-[-1px] h-6 rounded-full bg-arc-tint sm:top-1.5"
										initial={false}
										animate={{ width: `calc(${(level - 1) * 25}% + 24px)` }}
										style={{ left: "calc(37.5% - 12px)" }}
										transition={still ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
									/>
								) : null}
								{LEVELS.map((l) => {
									const offered = area.levels.includes(l.level);
									const on = l.level === level;
									if (!offered) {
										return (
											<span key={l.level} className="relative flex h-9 items-center justify-center">
												<span className="h-px w-3 bg-ink-4" aria-hidden />
												<span className="sr-only">{`${l.label} bestaat niet voor ${area.label}`}</span>
											</span>
										);
									}
									return (
										<button
											key={l.level}
											type="button"
											role="radio"
											aria-checked={on}
											aria-label={`${area.label}: ${l.label}`}
											disabled={readOnly}
											onClick={() => onChange(area.id, clampLevel(area.id, l.level))}
											className="group/cell relative flex h-9 flex-col items-center justify-center gap-0.5 disabled:cursor-default"
										>
											<span
												className={cn(
													"flex size-5 items-center justify-center rounded-full transition-colors",
													on ? "bg-arc text-mesh-ink" : l.level > 0 && l.level < level ? "bg-arc/25" : "bg-ink/8 group-enabled/cell:group-hover/cell:bg-ink/16",
												)}
											>
												{on ? <Check className="size-3" strokeWidth={2.5} /> : null}
											</span>
											<span className={cn("text-2xs sm:hidden", on ? "font-medium text-arc-ink" : "text-ink-3")}>{l.label}</span>
										</button>
									);
								})}
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
