import { create } from "zustand";
import { persist } from "zustand/middleware";
import { coursesSeed, SCENARIO, type Scenario } from "../../data-source";
import { type Block, type Chapter, type Course, type CourseQuestion, newId, type Progress, quizzesOf } from "../lib/courses";

/*
 * Courses (PLAN 39): chapters, courses, everyone's progress and the questions asked about them.
 * Persisted per browser and stamped with the design state, like the other stores of records the
 * operator changes. Every change returns the undo that puts exactly that back.
 */

type State = {
	scenario: Scenario;
	chapters: Chapter[];
	courses: Course[];
	progress: Progress[];
	questions: CourseQuestion[];
	addChapter: (title: string) => { id: string; undo: () => void };
	renameChapter: (id: string, title: string) => () => void;
	addModule: (chapterId: string, title: string) => { id: string; undo: () => void };
	renameModule: (chapterId: string, moduleId: string, title: string) => () => void;
	/** Puts the chapters in this order. */
	orderChapters: (ids: ReadonlyArray<string>) => void;
	/** Puts a module's courses in this order. */
	orderCourses: (ids: ReadonlyArray<string>) => void;
	create: (draft: Pick<Course, "title" | "chapterId" | "moduleId">, by: string) => Course;
	save: (id: string, next: Course) => () => void;
	setStatus: (ids: ReadonlyArray<string>, status: Course["status"]) => () => void;
	duplicate: (id: string, by: string) => Course | undefined;
	remove: (ids: ReadonlyArray<string>) => () => void;
	/** The person read a block (or answered it, for a question). */
	step: (courseId: string, memberId: string, blockId: string, answer?: string) => void;
	/** Scores the attempt and closes it. Returns the score. */
	finish: (courseId: string, memberId: string) => number;
	retake: (courseId: string, memberId: string) => void;
	/** Clears a person's progress so they take the course again from the start. */
	reset: (courseId: string, memberId: string) => () => void;
	ask: (q: Omit<CourseQuestion, "id" | "at">) => () => void;
	answer: (id: string, text: string, by: string) => () => void;
};

const now = () => new Date().toISOString();

export const useCourses = create<State>()(
	persist(
		(set, get) => {
			const swap = <K extends "courses" | "chapters" | "questions">(key: K, before: State[K]) => () => set({ [key]: before } as Partial<State>);
			const progressFor = (courseId: string, memberId: string): Progress =>
				get().progress.find((p) => p.courseId === courseId && p.memberId === memberId) ?? { courseId, memberId, done: [], answers: {}, attempts: 0, startedAt: now() };
			const putProgress = (p: Progress) =>
				set((s) => {
					const i = s.progress.findIndex((x) => x.courseId === p.courseId && x.memberId === p.memberId);
					return { progress: i < 0 ? [...s.progress, p] : s.progress.map((x, j) => (j === i ? p : x)) };
				});
			return {
				scenario: SCENARIO,
				chapters: coursesSeed.chapters,
				courses: coursesSeed.courses,
				progress: coursesSeed.progress,
				questions: coursesSeed.questions,
				addChapter: (title) => {
					const before = get().chapters;
					const id = newId("ch");
					set({ chapters: [...before, { id, title, modules: [{ id: newId("md"), title: "Algemeen" }] }] });
					return { id, undo: swap("chapters", before) };
				},
				renameChapter: (id, title) => {
					const before = get().chapters;
					set({ chapters: before.map((c) => (c.id === id ? { ...c, title } : c)) });
					return swap("chapters", before);
				},
				addModule: (chapterId, title) => {
					const before = get().chapters;
					const id = newId("md");
					set({ chapters: before.map((c) => (c.id === chapterId ? { ...c, modules: [...c.modules, { id, title }] } : c)) });
					return { id, undo: swap("chapters", before) };
				},
				renameModule: (chapterId, moduleId, title) => {
					const before = get().chapters;
					set({ chapters: before.map((c) => (c.id === chapterId ? { ...c, modules: c.modules.map((m) => (m.id === moduleId ? { ...m, title } : m)) } : c)) });
					return swap("chapters", before);
				},
				orderChapters: (ids) => set((s) => ({ chapters: ids.map((id) => s.chapters.find((c) => c.id === id)).filter((c): c is Chapter => !!c) })),
				orderCourses: (ids) =>
					set((s) => {
						const moved = ids.map((id) => s.courses.find((c) => c.id === id)).filter((c): c is Course => !!c);
						const rest = s.courses.filter((c) => !ids.includes(c.id));
						const first = s.courses.findIndex((c) => ids.includes(c.id));
						return { courses: [...rest.slice(0, first), ...moved, ...rest.slice(first)] };
					}),
				create: (draft, by) => {
					const c: Course = {
						id: newId("crs"),
						...draft,
						description: "",
						blocks: [],
						status: "draft",
						order: "free",
						audience: { kind: "all" },
						suppliers: { kind: "none" },
						deadline: "",
						badge: "star",
						passMark: 80,
						questions: true,
						createdBy: by,
						updatedAt: now(),
					};
					set((s) => ({ courses: [...s.courses, c] }));
					return c;
				},
				save: (id, next) => {
					const before = get().courses;
					set({ courses: before.map((c) => (c.id === id ? { ...next, updatedAt: now() } : c)) });
					return swap("courses", before);
				},
				setStatus: (ids, status) => {
					const before = get().courses;
					set({ courses: before.map((c) => (ids.includes(c.id) ? { ...c, status, updatedAt: now(), publishedAt: status === "live" ? (c.publishedAt ?? now()) : c.publishedAt } : c)) });
					return swap("courses", before);
				},
				duplicate: (id, by) => {
					const src = get().courses.find((c) => c.id === id);
					if (!src) return undefined;
					const copy: Course = { ...src, id: newId("crs"), title: `${src.title} (kopie)`, status: "draft", publishedAt: undefined, createdBy: by, updatedAt: now(), blocks: src.blocks.map((b) => ({ ...b, id: newId("blk") }) as Block) };
					set((s) => {
						const i = s.courses.findIndex((c) => c.id === id);
						return { courses: [...s.courses.slice(0, i + 1), copy, ...s.courses.slice(i + 1)] };
					});
					return copy;
				},
				remove: (ids) => {
					const before = get().courses;
					set({ courses: before.filter((c) => !ids.includes(c.id)) });
					return swap("courses", before);
				},
				step: (courseId, memberId, blockId, answer) => {
					const p = progressFor(courseId, memberId);
					if (p.finishedAt) return;
					putProgress({
						...p,
						done: p.done.includes(blockId) ? p.done : [...p.done, blockId],
						answers: answer === undefined ? p.answers : { ...p.answers, [blockId]: answer },
					});
				},
				finish: (courseId, memberId) => {
					const c = get().courses.find((x) => x.id === courseId);
					const p = progressFor(courseId, memberId);
					const qs = c ? quizzesOf(c) : [];
					const right = qs.filter((q) => p.answers[q.id] === q.correct).length;
					const score = qs.length ? Math.round((right / qs.length) * 100) : 100;
					putProgress({ ...p, finishedAt: now(), score, attempts: p.attempts + 1 });
					return score;
				},
				retake: (courseId, memberId) => {
					const p = progressFor(courseId, memberId);
					putProgress({ ...p, done: [], answers: {}, finishedAt: undefined, score: p.score, startedAt: now() });
				},
				reset: (courseId, memberId) => {
					const before = get().progress;
					set({ progress: before.filter((p) => !(p.courseId === courseId && p.memberId === memberId)) });
					return () => set({ progress: before });
				},
				ask: (q) => {
					const before = get().questions;
					set({ questions: [{ ...q, id: newId("q"), at: now() }, ...before] });
					return swap("questions", before);
				},
				answer: (id, text, by) => {
					const before = get().questions;
					set({ questions: before.map((q) => (q.id === id ? { ...q, answer: text, answeredBy: by } : q)) });
					return swap("questions", before);
				},
			};
		},
		{
			name: "insyte:courses:v2",
			version: 1,
			partialize: (s) => ({ scenario: s.scenario, chapters: s.chapters, courses: s.courses, progress: s.progress, questions: s.questions }),
			merge: (persisted, current) => {
				const p = persisted as Partial<State> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p };
			},
		},
	),
);
