import { AlertTriangle, Check } from "../../icons";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import type { TestResult } from "./flow-edits";

const DURATION = 7000;

/**
 * The answer to "Test met voorbeeld": a dark toast, because it is the product reporting what it would
 * have done; a line naming the sample record; a bar that drains for as long as the toast stays; and
 * Sluiten. A failed test names the step it stopped at and why, and the canvas keeps that step red.
 */
function TestToast({ id, result }: { id: string | number; result: TestResult }) {
	const still = useReducedMotion();
	return (
		<div role="status" className="relative flex w-full flex-col overflow-hidden rounded-lg bg-abyss text-mesh-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]">
			<div className="flex items-start gap-2.5 px-3.5 pt-3 pb-3">
				<span
					className={cn(
						"mt-px flex size-5 shrink-0 items-center justify-center rounded-full",
						result.ok ? "bg-signal-green-bg text-signal-green" : "bg-signal-red-bg text-signal-red",
					)}
				>
					{result.ok ? <Check className="size-3" strokeWidth={2.5} /> : <AlertTriangle className="size-3" strokeWidth={2.25} />}
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="font-medium text-sm">
						{result.ok ? "Test geslaagd, niets opgeslagen of verstuurd" : `Test gestopt bij ${result.step}`}
					</span>
					{result.ok ? null : <span className="text-mesh-ink-2 text-xs leading-[1.45]">{result.reason}</span>}
					<span className="whitespace-nowrap text-mesh-ink-2 text-xs tabular-nums">
						Voorbeeld {result.sample.number} · {result.sample.name}
					</span>
				</div>
				<button
					type="button"
					onClick={() => toast.dismiss(id)}
					className="h-6 shrink-0 rounded-md px-2 font-medium text-mesh-ink text-xs transition-colors hover:bg-mesh-ink/12"
				>
					Sluiten
				</button>
			</div>
			<motion.span
				aria-hidden
				className={cn("absolute bottom-0 left-0 h-0.5 w-full origin-left", result.ok ? "bg-mesh-ink-2" : "bg-signal-red")}
				initial={{ scaleX: 1 }}
				animate={{ scaleX: still ? 1 : 0 }}
				transition={{ duration: DURATION / 1000, ease: "linear" }}
			/>
		</div>
	);
}

export function showTestResult(result: TestResult) {
	// Sonner lays toasts out at 356px; this one carries a sentence and a record, so it is widened about its centre.
	toast.custom((id) => <TestToast id={id} result={result} />, { duration: DURATION, style: { width: 420, marginLeft: -32 } });
}
