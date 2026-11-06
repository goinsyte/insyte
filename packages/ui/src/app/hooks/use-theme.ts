import { useEffect } from "react";
import { type ThemeMode, useNavPrefs } from "./use-nav-prefs";

export function useApplyTheme() {
	const { state } = useNavPrefs();

	useEffect(() => {
		applyMode(state.themeMode);
	}, [state.themeMode]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (state.themeMode !== "auto") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyMode("auto");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [state.themeMode]);
}

/*
 * One element, one key.
 *
 * This used to add `.dark` to `<body>` while the pre-paint script in `index.html` added `.dark` or
 * `.light` to `<html>` from a different store (`insyte-theme`). Both were live at once, so choosing
 * Light in the app removed the class from the body and left the one on the html element in place,
 * and the page stayed dark: `tokens.css` swaps the values under `.dark`, and the ancestor still had
 * it. `html` is also the element `app.css` paints the canvas on, so it has to be the one that knows.
 */
function applyMode(mode: ThemeMode) {
	if (typeof document === "undefined") return;
	const dark =
		mode === "auto"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
			: mode === "dark";
	const root = document.documentElement;
	root.classList.toggle("dark", dark);
	root.classList.toggle("light", !dark);
	// Left where the pre-paint script will find it, so the next load opens in the same theme
	// instead of flashing the system one.
	try {
		// "auto" is stored too: with nothing stored the script opens in daylight, so a missing key
		// would flash daylight before an "auto" night.
		localStorage.setItem("insyte-theme", mode);
	} catch {
		// Private mode, or storage disabled. The class above is still correct for this page.
	}
	document.body.classList.remove("dark");
}
