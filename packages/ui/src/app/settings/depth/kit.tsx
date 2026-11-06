import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMyName } from "../../ask/agent-parts";
import type { SettingsDepthSeed } from "../../lib/settings-depth";
import { undoable } from "../../lib/undo";
import { useGate } from "../../stores/access-store";
import { useSettingsDepth } from "../../stores/settings-depth-store";

type Section = Exclude<keyof SettingsDepthSeed, "audit" | "trash">;

/**
 * One settings section edited as a draft: the house's unsaved bar shows while it differs, and
 * saving writes the change into the Logboek with what it was and what it became.
 */
export function useSection<K extends Section>(key: K, page: string, describe: (before: SettingsDepthSeed[K], after: SettingsDepthSeed[K]) => Array<[string, string, string]>) {
	const saved = useSettingsDepth((s) => s[key]) as SettingsDepthSeed[K];
	const savedKey = JSON.stringify(saved);
	const [draft, setDraft] = useState<SettingsDepthSeed[K]>(saved);
	const last = useRef(savedKey);
	useEffect(() => {
		if (last.current !== savedKey) {
			last.current = savedKey;
			setDraft(JSON.parse(savedKey) as SettingsDepthSeed[K]);
		}
	}, [savedKey]);
	const me = useMyName();
	const to = useRouterState({ select: (s) => s.location.pathname });
	const gate = useGate("settings", 2);
	const dirty = JSON.stringify(draft) !== savedKey;
	const save = (message: string, detail?: string) => {
		const changes = describe(saved, draft);
		const undo = useSettingsDepth.getState().save(key, draft, { who: me, page, to, changes: changes.length ? changes : [["Instellingen", "", "gewijzigd"]] });
		undoable(message, undo, detail);
	};
	return { saved, draft, setDraft, dirty, discard: () => setDraft(saved), save, canEdit: gate.ok };
}

export const WELL = "field h-9 w-full rounded-md px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper";
