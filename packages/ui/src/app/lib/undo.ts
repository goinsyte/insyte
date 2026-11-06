import { toast } from "sonner";

/**
 * A change the operator can take back, said once.
 *
 * Every destructive action in the console used to ask first — "Remove Sophia?" — and then do it.
 * The confirmation is the wrong half of the pair: it interrupts the ninety-nine times the operator
 * meant it to catch the one time they did not. The undo is the right half. It costs nothing when the
 * click was meant, and it is there for six seconds when it was not.
 *
 * Kept for actions that cannot be walked back by the person themselves — a refund that has left the
 * building, evidence sent to a payment provider — which still ask, through `ConfirmDialog`.
 */
export function undoable(message: string, undo: () => void, description?: string) {
	toast(message, {
		description,
		duration: 6000,
		action: { label: "Ongedaan maken", onClick: undo },
	});
}
