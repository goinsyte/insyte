import { create } from "zustand";
import { persist } from "zustand/middleware";
import { knowledgeSeed, SCENARIO, type Scenario } from "../../data-source";
import { type Article, type Audience, type Gap, revertTo, saveVersion } from "../lib/knowledge";

/*
 * The knowledge base (PLAN 28): chapters with their versions, and the gaps the agent left. Persisted
 * per browser, stamped with the design state. Every change returns its way back for Undo.
 */

type State = {
	articles: Article[];
	gaps: Gap[];
	scenario: Scenario;
	create: (title: string, audience: Audience, body: string, by: string) => Article;
	remove: (id: string) => () => void;
	/** Keeps a title, audience and body as a new version, published or as a draft. */
	save: (id: string, patch: Pick<Article, "title" | "audience" | "body">, by: string, publish: boolean) => () => void;
	revert: (id: string, n: number, by: string) => () => void;
	setGap: (id: string, patch: Partial<Gap>) => () => void;
};

export const useKnowledge = create<State>()(
	persist(
		(set, get) => {
			const keep = (id: string, next: (a: Article) => Article): (() => void) => {
				const before = get().articles.find((a) => a.id === id);
				if (!before) return () => {};
				set((s) => ({ articles: s.articles.map((a) => (a.id === id ? next(a) : a)) }));
				return () => set((s) => ({ articles: s.articles.map((a) => (a.id === id ? before : a)) }));
			};
			return {
				articles: knowledgeSeed.articles,
				gaps: knowledgeSeed.gaps,
				scenario: SCENARIO,
				create: (title, audience, body, by) => {
					const at = new Date().toISOString();
					const article: Article = { id: `kb_${Date.now().toString(36)}`, title, audience, body, versions: [{ n: 1, at, by, body, title, published: false }], editedAt: at, editedBy: by, uses7d: 0 };
					set((s) => ({ articles: [article, ...s.articles] }));
					return article;
				},
				remove: (id) => {
					const before = get().articles;
					set({ articles: before.filter((a) => a.id !== id) });
					return () => set({ articles: before });
				},
				save: (id, patch, by, publish) => {
					const gapsBefore = get().gaps;
					const undo = keep(id, (a) => saveVersion({ ...a, ...patch }, by, new Date().toISOString(), publish));
					// Publishing answers the gaps that were being added to this chapter.
					if (publish) set((s) => ({ gaps: s.gaps.map((g) => (g.articleId === id && g.state === "open" ? { ...g, state: "answered" } : g)) }));
					return () => {
						undo();
						set({ gaps: gapsBefore });
					};
				},
				revert: (id, n, by) => keep(id, (a) => revertTo(a, n, by, new Date().toISOString())),
				setGap: (id, patch) => {
					const before = get().gaps.find((g) => g.id === id);
					set((s) => ({ gaps: s.gaps.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
					return () => set((s) => ({ gaps: s.gaps.map((g) => (g.id === id && before ? before : g)) }));
				},
			};
		},
		{
			name: "insyte:knowledge:v1",
			version: 1,
			partialize: (s) => ({ articles: s.articles, gaps: s.gaps, scenario: s.scenario }),
			merge: (persisted, current) => {
				const p = persisted as Partial<State> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p };
			},
		},
	),
);
