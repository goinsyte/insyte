import { Check, Lock } from "../../icons";
import { Fragment } from "react";
import { ACTION_GROUPS, type AgentActionId, type AutonomyLevel, CATALOGUE, DEFAULT_POLICY, LEVEL_LABEL, type Policy } from "../lib/autonomy";
import { cn } from "../lib/utils";

/*
 * The autonomy matrix, in the roles matrix's grammar (`roles/level-matrix.tsx`): the actions down
 * the side, grouped, three levels across — Zelf doen, Eerst vragen, Nooit — and each row's chosen
 * level as the `arc` knob. It is not a ladder (asking is not a kind of doing), so there is no track
 * between the steps. A locked row has a lock where Zelf doen would be and a short second line, with
 * the reason on hover. Below `sm` every row becomes a segmented control under its label.
 */

const LEVELS: ReadonlyArray<AutonomyLevel> = ["auto", "ask", "never"];

export function AutonomyMatrix({
	policy,
	onChange,
	readOnly,
	highlight,
}: {
	policy: Policy;
	onChange: (id: AgentActionId, level: AutonomyLevel) => void;
	readOnly?: boolean;
	/** The row a link pointed at (`?actie=`), washed for a moment. */
	highlight?: string;
}) {
	return (
		<div className="overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
			<div className="hidden h-9 items-center bg-mist px-3.5 sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,92px)]">
				<span className="font-medium text-ink-3 text-xs">Actie</span>
				{LEVELS.map((l) => (
					<span key={l} className="text-center font-medium text-ink-3 text-xs">
						{LEVEL_LABEL[l]}
					</span>
				))}
			</div>
			<ul>
				{ACTION_GROUPS.map((group) => {
					const rows = CATALOGUE.filter((e) => e.group === group);
					return (
						<Fragment key={group}>
							<li className="bg-mist/60 px-3.5 pt-3 pb-1.5 font-medium text-ink-3 text-xs">{group}</li>
							{rows.map((e) => {
								const level = policy[e.id];
								const changed = DEFAULT_POLICY[e.id] !== level;
								return (
									<li
										key={e.id}
										id={`actie-${e.id}`}
										className={cn(
											"grid scroll-mt-24 grid-cols-1 gap-2 px-3.5 py-2.5 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)] transition-colors duration-700 sm:grid-cols-[minmax(0,1fr)_repeat(3,92px)] sm:items-center sm:gap-0 sm:py-2",
											highlight === e.id && "bg-arc-tint",
										)}
									>
										<div className="flex min-w-0 flex-col">
											<span className="flex items-center gap-1.5 font-medium text-base text-ink">
												{e.label}
												{changed ? <span className="size-1.5 rounded-[1px] bg-arc" title="Anders dan de standaard" /> : null}
											</span>
											{/* What a level means is the page guide's job; a row only says why it is locked. */}
											{e.locked ? (
												<span className="inline-flex items-center gap-1 text-ink-3 text-sm" title={e.locked}>
													<Lock className="size-3 shrink-0" strokeWidth={2} />
													Vraagt altijd
												</span>
											) : null}
										</div>
										{/* Wide: three radio cells. Narrow: the same radios as one segmented well. */}
										<div role="radiogroup" aria-label={e.label} className="grid grid-cols-3 gap-0.5 rounded-lg bg-ink/5 p-0.5 sm:col-span-3 sm:gap-0 sm:rounded-none sm:bg-transparent sm:p-0">
											{LEVELS.map((l) => {
												const on = l === level;
												const blocked = l === "auto" && e.locked !== undefined;
												if (blocked) {
													return (
														<span key={l} className="flex h-8 items-center justify-center text-ink-4 sm:h-9" title={e.locked}>
															<Lock className="size-3.5" strokeWidth={1.75} />
															<span className="sr-only">{`${LEVEL_LABEL[l]} kan niet voor ${e.label}: ${e.locked}`}</span>
														</span>
													);
												}
												return (
													<button
														key={l}
														type="button"
														role="radio"
														aria-checked={on}
														aria-label={`${e.label}: ${LEVEL_LABEL[l]}`}
														disabled={readOnly}
														onClick={() => onChange(e.id, l)}
														className={cn(
															"group/cell flex h-8 items-center justify-center gap-1.5 rounded-md text-sm transition-colors disabled:cursor-default sm:h-9 sm:rounded-none",
															on ? "bg-paper font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)] sm:bg-transparent sm:shadow-none" : "text-ink-2",
														)}
													>
														<span
															className={cn(
																"hidden size-5 items-center justify-center rounded-full transition-colors sm:flex",
																on ? "bg-arc text-mesh-ink" : "bg-ink/8 group-enabled/cell:group-hover/cell:bg-ink/16",
															)}
														>
															{on ? <Check className="size-3" strokeWidth={2.5} /> : null}
														</span>
														<span className="sm:hidden">{LEVEL_LABEL[l]}</span>
													</button>
												);
											})}
										</div>
									</li>
								);
							})}
						</Fragment>
					);
				})}
			</ul>
		</div>
	);
}
