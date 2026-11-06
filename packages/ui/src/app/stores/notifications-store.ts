import { create } from "zustand";
import { persist } from "zustand/middleware";
import { seedNotifications } from "../../data-source";
import { DEFAULT_PREFS, type EventKey, type Note, type NotifyPrefs, stateOf } from "../lib/notifications";
import { SCENARIO, type Scenario } from "../../data-source";

/*
 * One store for every place a notification is read: the topbar's dropdown, the notifications page
 * and its panel counts, and the settings that decide what is heard. Reading a row in the dropdown
 * reads it on the page, and muting an event in settings takes it out of both.
 *
 * It persists, like the board, because what someone has read and cleared is theirs. It is seeded by
 * the design state, and a stored copy made under another state is dropped on load rather than
 * mixed in, so `?scenario=busy` always shows the busy week.
 */

type NotificationsState = {
	scenario: Scenario;
	notes: Note[];
	prefs: NotifyPrefs;
	setRead: (ids: ReadonlyArray<string>, read: boolean) => void;
	snooze: (ids: ReadonlyArray<string>, until: string) => void;
	clear: (ids: ReadonlyArray<string>) => void;
	/** Back to the inbox from Later or Gewist. */
	restore: (ids: ReadonlyArray<string>) => void;
	/** The notes as they were, for an undo. */
	pick: (ids: ReadonlyArray<string>) => Note[];
	put: (notes: ReadonlyArray<Note>) => void;
	/** Snoozed notes whose time has come return to the inbox, unread. */
	wake: (now: number) => void;
	setPrefs: (prefs: NotifyPrefs) => void;
	setEventApp: (event: EventKey, on: boolean) => void;
};

const patch = (notes: Note[], ids: ReadonlyArray<string>, f: (n: Note) => Note) => {
	const set = new Set(ids);
	return notes.map((n) => (set.has(n.id) ? f(n) : n));
};

export const useNotifications = create<NotificationsState>()(
	persist(
		(set, get) => ({
			scenario: SCENARIO,
			notes: seedNotifications(),
			prefs: DEFAULT_PREFS,
			setRead: (ids, read) => set((s) => ({ notes: patch(s.notes, ids, (n) => ({ ...n, read })) })),
			snooze: (ids, until) => set((s) => ({ notes: patch(s.notes, ids, (n) => ({ ...n, state: "later", snoozeUntil: until })) })),
			clear: (ids) => set((s) => ({ notes: patch(s.notes, ids, (n) => ({ ...n, state: "cleared", read: true, snoozeUntil: undefined })) })),
			restore: (ids) => set((s) => ({ notes: patch(s.notes, ids, (n) => ({ ...n, state: "inbox", snoozeUntil: undefined })) })),
			pick: (ids) => {
				const want = new Set(ids);
				return get().notes.filter((n) => want.has(n.id));
			},
			put: (notes) => {
				const by = new Map(notes.map((n) => [n.id, n]));
				set((s) => ({ notes: s.notes.map((n) => by.get(n.id) ?? n) }));
			},
			wake: (now) => {
				const due = get().notes.filter((n) => n.state === "later" && stateOf(n, now) === "inbox");
				if (due.length === 0) return;
				set((s) => ({ notes: patch(s.notes, due.map((n) => n.id), (n) => ({ ...n, state: "inbox", snoozeUntil: undefined, read: false })) }));
			},
			setPrefs: (prefs) => set({ prefs }),
			setEventApp: (event, on) =>
				set((s) => {
					const current = s.prefs.events[event] ?? { app: true, email: false, push: false, slack: false, onlyMine: false };
					return { prefs: { ...s.prefs, events: { ...s.prefs.events, [event]: { ...current, app: on } } } };
				}),
		}),
		{
			name: "insyte:notifications:v1",
			version: 1,
			// A copy stored under another design state belongs to that state: start from this one's seed.
			merge: (persisted, current) => {
				const p = persisted as Partial<NotificationsState> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p, prefs: { ...DEFAULT_PREFS, ...p.prefs, events: { ...DEFAULT_PREFS.events, ...p.prefs?.events } } };
			},
			partialize: (s) => ({ scenario: s.scenario, notes: s.notes, prefs: s.prefs }),
		},
	),
);
