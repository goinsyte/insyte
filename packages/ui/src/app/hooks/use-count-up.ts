import { useEffect, useState } from "react";

/** Counts from 0 to `to` on an out-expo curve. Shared by the onboarding preview and the sync step. */
export function useCountUp(to: number, duration: number, delay = 0) {
	const [n, setN] = useState(duration === 0 ? to : 0);
	useEffect(() => {
		if (duration === 0) {
			setN(to);
			return;
		}
		let raf = 0;
		const start = performance.now() + delay;
		const tick = (now: number) => {
			const t = Math.min(1, Math.max(0, (now - start) / duration));
			setN(Math.round(to * (1 - 2 ** (-10 * t))));
			if (t < 1) raf = requestAnimationFrame(tick);
			else setN(to);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [to, duration, delay]);
	return n;
}
