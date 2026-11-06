/**
 * Form-level error banner — the counterpart to the per-field `FieldError`. Pair
 * with a TanStack `form.Subscribe` on `errorMap.onServer` + `serverFormMessage`:
 *
 *   <form.Subscribe selector={(s) => s.errorMap.onServer}>
 *     {(onServer) => <FormError message={serverFormMessage(onServer)} />}
 *   </form.Subscribe>
 */
export function FormError({ message }: { message?: string }) {
	if (!message) return null;
	return (
		<p
			role="alert"
			className="rounded-lg bg-signal-red-bg px-3 py-2 font-medium text-sm text-signal-red leading-[1.4]"
		>
			{message}
		</p>
	);
}
