import { useForm } from "@tanstack/react-form"
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { motion } from "motion/react"
import { useState } from "react"
import { z } from "zod"
import { Loader } from "../../icons"
import { FormError } from "../common/form-error"
import { authClient } from "../lib/auth-client"
import { applyServerError, serverFormMessage } from "../lib/form-errors"
import { BrandHalf, Field, FieldError, INPUT_CLASS } from "./login-screen"

/*
 * The second step of signing in, for an account with two-factor on (M2, G-2FA). Written for this repo, in the sign-in
 * screen's layout and parts. The password was right; what is asked now is the six digits from the authenticator app,
 * or, without the phone, one of the backup codes, each of which works once. "Dit apparaat 30 dagen onthouden" skips
 * this step on this browser for thirty days (`trustDeviceMaxAge`).
 *
 * The attempt lives in a short-lived cookie better-auth set at the password; when it has run out, the only way on is
 * signing in again, which the error says and the link offers.
 */

const Route = getRouteApi("/login_/two-factor")

const SCHEMAS = {
  totp: z.object({ code: z.string().regex(/^\d{6}$/, "Vul de zes cijfers uit je app in."), trust: z.boolean() }),
  backup: z.object({ code: z.string().trim().min(1, "Vul een back-upcode in."), trust: z.boolean() })
}

export function TwoFactorPage() {
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  const [mode, setMode] = useState<"totp" | "backup">("totp")

  const form = useForm({
    defaultValues: { code: "", trust: false },
    validators: { onSubmit: SCHEMAS[mode] },
    onSubmit: async ({ value, formApi }) => {
      const request = { code: value.code.trim(), trustDevice: value.trust }
      const { error } = mode === "totp"
        ? await authClient.twoFactor.verifyTotp(request)
        : await authClient.twoFactor.verifyBackupCode(request)
      if (error) {
        applyServerError(formApi, error, "De code kon niet worden gecontroleerd. Probeer het opnieuw.")
        return
      }
      navigate({ to: redirect ?? "/dashboard", search: {} as never })
    }
  })

  const switchMode = () => {
    setMode((m) => (m === "totp" ? "backup" : "totp"))
    form.reset()
  }

  return (
    <div className="grid min-h-svh grid-rows-[44vh_1fr] bg-background lg:grid-cols-2 lg:grid-rows-1">
      <BrandHalf />

      <main className="flex flex-col items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full max-w-[400px] flex-col gap-5"
        >
          <header className="mb-1 flex flex-col gap-1.5">
            <h2 className="font-medium text-[24px] text-ink leading-[1.15] tracking-[-0.6px]">Tweestapsverificatie</h2>
            <p className="text-[13px] text-ink-3 leading-[1.5]">
              {mode === "totp"
                ? "Vul de code van zes cijfers uit je authenticator-app in."
                : "Vul een van je back-upcodes in. Elke code werkt één keer."}
            </p>
          </header>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void form.handleSubmit()
            }}
            className="flex flex-col gap-3"
          >
            <form.Field name="code">
              {(field) => (
                <Field label={mode === "totp" ? "Code" : "Back-upcode"}>
                  <input
                    key={mode}
                    autoFocus
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    {...(mode === "totp"
                      ? {
                        inputMode: "numeric" as const,
                        autoComplete: "one-time-code",
                        maxLength: 6,
                        placeholder: "123456"
                      }
                      : { autoComplete: "off", placeholder: "abcde-fghij" })}
                    className={mode === "totp" ? `${INPUT_CLASS} tabular-nums tracking-[0.2em]` : INPUT_CLASS}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            <form.Field name="trust">
              {(field) => (
                <label className="flex items-center gap-2.5 text-[13px] text-ink-2 leading-none">
                  <input
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="size-4 accent-arc"
                  />
                  Dit apparaat 30 dagen onthouden
                </label>
              )}
            </form.Field>

            <form.Subscribe selector={(s) => s.errorMap.onServer}>
              {(onServer) => <FormError message={serverFormMessage(onServer)} />}
            </form.Subscribe>

            <form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
              {({ canSubmit, isSubmitting }) => (
                <button type="submit" disabled={!canSubmit || isSubmitting} className={PRIMARY}>
                  {isSubmitting ? <Loader className="size-4 animate-spin" strokeWidth={2} /> : "Bevestigen"}
                </button>
              )}
            </form.Subscribe>
          </form>

          <div className="flex items-center justify-between text-[13px] leading-[1.4]">
            <button
              type="button"
              onClick={switchMode}
              className="font-medium text-arc-ink transition-colors hover:text-ink"
            >
              {mode === "totp" ? "Een back-upcode gebruiken" : "De code uit je app gebruiken"}
            </button>
            <Link to="/login" className="font-medium text-ink-3 transition-colors hover:text-ink">
              Opnieuw inloggen
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  )
}

const PRIMARY =
  "mt-2 flex h-11 items-center justify-center rounded-lg bg-abyss px-4 font-medium text-[14px] text-mesh-ink leading-none tracking-[-0.1px] shadow-primary transition-colors hover:bg-abyss-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
