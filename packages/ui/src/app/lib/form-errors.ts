/**
 * Normalize a server error into TanStack Form's server-error shape
 * (`GlobalFormValidationError`), ready for `form.setErrorMap({ onServer })`.
 *
 * Handles both error sources the app talks to:
 *  - our API envelope, `{ error: { code, message, fields? } }` (surfaced by the
 *    Eden client on `error.value`, or passed directly);
 *  - better-auth, `{ message, code, status }`.
 *
 * `fields` keys are form field names → message (rendered inline under inputs);
 * `form` is the form-level message.
 */
import type { AnyFormApi } from "@tanstack/react-form"

export type ServerFormError = {
  form?: string
  fields?: Record<string, string>
}

type Envelope = {
  error?: { message?: string; fields?: Record<string, string> }
}

export function toFormError(
  err: unknown,
  fallback = "Er ging iets mis. Probeer het opnieuw."
): ServerFormError {
  if (!err || typeof err !== "object") return { form: fallback }

  // Eden puts the parsed response body on `.value`; otherwise the body may be
  // the object itself.
  const body = (
    "value" in err && err.value && typeof err.value === "object"
      ? err.value
      : err
  ) as Envelope & { message?: string }

  if (body.error && typeof body.error === "object") {
    const { message, fields } = body.error
    // With field errors the form-level line would be redundant.
    return { form: fields ? undefined : (message ?? fallback), fields }
  }

  // better-auth (or any { message }) shape.
  if (typeof body.message === "string") return { form: body.message }

  return { form: fallback }
}

/**
 * Push a server error into a TanStack form's `onServer` slot. Field messages are
 * wrapped as `{ message }` so they render through the same `FieldError` as the
 * client-side (zod) validators; the form-level message is read back with
 * `serverFormMessage`.
 */
export function applyServerError(
  form: AnyFormApi,
  err: unknown,
  fallback?: string
): void {
  const { form: formMsg, fields } = toFormError(err, fallback)
  form.setErrorMap({
    onServer: {
      ...(formMsg ? { form: formMsg } : {}),
      fields: fields
        ? Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, { message: v }])
        )
        : {}
    }
  })
}

/** Read the form-level message out of `form.state.errorMap.onServer`. */
export function serverFormMessage(onServer: unknown): string | undefined {
  if (!onServer || typeof onServer !== "object" || !("form" in onServer)) {
    return undefined
  }
  const f = (onServer as { form?: unknown }).form
  if (typeof f === "string") return f
  if (f && typeof f === "object" && "message" in f) {
    return String((f as { message?: unknown }).message ?? "") || undefined
  }
  return undefined
}
