import { useNavigate, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { Play } from "../../icons";
import { EmptyState } from "../common/empty-state";
import { PageHeader } from "../common/page-header";
import { type Course, dayLabel, minutesOf, shareDone, stateOf } from "../lib/courses";
import { ME_SUPPLIER } from "../lib/supplier-work";
import { useNow } from "../ask/agent-parts";
import { useCourses } from "../stores/courses-store";
import { CoursePlayer } from "./course-player";
import { CourseBadge, PersonStatePill, plural } from "./parts";

const forSupplier = (c: Course, id: string) => c.status === "live" && (c.suppliers.kind === "all" || (c.suppliers.kind === "some" && c.suppliers.ids.includes(id)));

/**
 * Training (`/supplier/training`): the brand's courses it opened to this supplier, and nothing else
 * of the team's. Progress is kept under the supplier's own id, so the brand sees it beside its team.
 */
export function SupplierTrainingPage() {
	const navigate = useNavigate();
	const all = useCourses((s) => s.courses);
	const progress = useCourses((s) => s.progress);
	const now = useNow(60_000);
	const courses = useMemo(() => all.filter((c) => forSupplier(c, ME_SUPPLIER.id)), [all]);
	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader title="Training" meta={courses.length ? plural(courses.length, "cursus", "cursussen") : undefined} />
			<div className="px-5 pb-10">
				{courses.length === 0 ? (
					<EmptyState kind="courses" title="Nog geen training." body="Als het merk een cursus voor jullie openzet, staat hij hier: hoe ze bestellingen willen ontvangen, verpakken en verzenden." />
				) : (
					<ul className="flex max-w-[880px] flex-col overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
						{courses.map((c) => {
							const p = progress.find((x) => x.courseId === c.id && x.memberId === ME_SUPPLIER.id);
							const state = stateOf(c, p, now);
							return (
								<li key={c.id} className="odd:bg-mist/60">
									<button type="button" onClick={() => void navigate({ to: "/supplier/training/$courseId", params: { courseId: c.id } })} className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-arc-tint/50">
										<CourseBadge badge={c.badge} size={40} earned={state === "done"} />
										<span className="flex min-w-0 flex-col">
											<span className="truncate font-medium text-base text-ink">{c.title}</span>
											<span className="truncate text-ink-3 text-sm">
												{c.description || `${plural(c.blocks.length, "blok", "blokken")}`} · {minutesOf(c)} min{c.deadline ? ` · deadline ${dayLabel(c.deadline)}` : ""}
											</span>
										</span>
										<PersonStatePill state={state} extra={state === "busy" ? `${Math.round(shareDone(c, p) * 100)}%` : undefined} />
										<Play className="size-4 text-ink-3" strokeWidth={1.75} />
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}

export function SupplierCoursePage() {
	const { courseId } = useParams({ strict: false }) as { courseId?: string };
	const c = useCourses((s) => s.courses.find((x) => x.id === courseId));
	if (c && !forSupplier(c, ME_SUPPLIER.id)) return <EmptyState kind="locked" title="Deze cursus staat niet voor jullie open." body="Vraag het merk om hem voor jullie open te zetten." />;
	return <CoursePlayer courseId={courseId ?? ""} memberId={ME_SUPPLIER.id} name={ME_SUPPLIER.name} preview={false} back={{ label: "Training", to: "/supplier/training" }} crumbs={[]} />;
}
