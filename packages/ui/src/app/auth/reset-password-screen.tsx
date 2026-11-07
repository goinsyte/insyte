import { useForm } from "@tanstack/react-form"
import { getRouteApi, Link } from "@tanstack/react-router"
import { motion } from "motion/react"
import { type ReactNode, useState } from "react"
import { z } from "zod"
import { Eye, EyeOff, Loader } from "../../icons"
import { FormError } from "../common/form-error"
import { authClient } from "../lib/auth-client"
import { applyServerError, serverFormMessage } from "../lib/form-errors"
import { BrandHalf, Field, FieldError, INPUT_CLASS } from "./login-screen"

/*
 * Where the reset link from the sign-in dialog lands (M2, G-reset). Written for this repo, in the sign-in screen's
 * layout and parts, so the two read as one place: the brand half, then one short task.
 *
 * Three states, each with a way on: the form; a link that no longer works, which sends the person back to ask for a
 * new one; and done. A reset signs out every session (`revokeSessionsOnPasswordReset`), so done says to sign in
 * rather than pretending the person already is.
 */

const Route = getRouteApi("/reset-password")

const schema = z
  .object({
    password: z.string().min(8, "Minimaal 8 tekens."),
    repeat: z.string()
  })
  .refine((v) => v.password === v.repeat, { message: "De wachtwoorden zijn niet gelijk.", path: ["repeat"] })

export function ResetPasswordPage() {
  const { token, error } = Route.useSearch()
  const [done, setDone] = useState(false)

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
          {done
            ? (
              <Outcome title="Wachtwoord gewijzigd" action="Inloggen">
                Je bent op al je apparaten uitgelogd. Log in met je nieuwe wachtwoord.
              </Outcome>
            )
            : token === undefined || error !== undefined
            ? (
              <Outcome title="Deze link werkt niet meer" action="Nieuwe link aanvragen">
                Een resetlink is 30 minuten geldig en werkt één keer. Vraag op de inlogpagina een nieuwe aan, via
                &ldquo;Vergeten?&rdquo;.
              </Outcome>
            )
            : <NewPasswordForm token={token} onDone={() => setDone(true)} />}
        </motion.div>
      </main>
    </div>
  )
}

function NewPasswordForm({ token, onDone }: { readonly token: string; readonly onDone: () => void }) {
  const [show, setShow] = useState(false)

  const form = useForm({
    defaultValues: { password: "", repeat: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      const { error } = await authClient.resetPassword({ newPassword: value.password, token })
      if (error) {
        applyServerError(formApi, error, "Je wachtwoord kon niet worden gewijzigd. Probeer het opnieuw.")
        return
      }
      onDone()
    }
  })

  return (
    <>
      <header className="mb-1 flex flex-col gap-1.5">
        <h2 className="font-medium text-[24px] text-ink leading-[1.15] tracking-[-0.6px]">Nieuw wachtwoord</h2>
        <p className="text-[13px] text-ink-3 leading-[1.5]">Kies een wachtwoord van minimaal 8 tekens.</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void form.handleSubmit()
        }}
        className="flex flex-col gap-3"
      >
        <form.Field name="password">
          {(field) => (
            <Field label="Nieuw wachtwoord">
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  autoFocus
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  autoComplete="new-password"
                  className={`${INPUT_CLASS} pr-11`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  aria-label={show ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                  onClick={() => setShow((s) => !s)}
                  className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-mist hover:text-ink"
                >
                  {show
                    ? <EyeOff className="size-4" strokeWidth={1.75} />
                    : <Eye className="size-4" strokeWidth={1.75} />}
                </button>
              </div>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <form.Field name="repeat">
          {(field) => (
            <Field label="Herhaal je wachtwoord">
              <input
                type={show ? "text" : "password"}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                autoComplete="new-password"
                className={INPUT_CLASS}
                placeholder="••••••••"
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.errorMap.onServer}>
          {(onServer) => <FormError message={serverFormMessage(onServer)} />}
        </form.Subscribe>

        <form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}>
          {({ canSubmit, isSubmitting }) => (
            <button type="submit" disabled={!canSubmit || isSubmitting} className={PRIMARY}>
              {isSubmitting ? <Loader className="size-4 animate-spin" strokeWidth={2} /> : "Wachtwoord opslaan"}
            </button>
          )}
        </form.Subscribe>
      </form>
    </>
  )
}

/** A finished state: what happened, and the one thing to do next, which is always the sign-in page. */
function Outcome(
  { title, action, children }: { readonly title: string; readonly action: string; readonly children: ReactNode }
) {
  return (
    <>
      <header className="mb-1 flex flex-col gap-1.5">
        <h2 className="font-medium text-[24px] text-ink leading-[1.15] tracking-[-0.6px]">{title}</h2>
        <p className="text-[13px] text-ink-3 leading-[1.5]">{children}</p>
      </header>
      <Link to="/login" className={PRIMARY}>{action}</Link>
    </>
  )
}

const PRIMARY =
  "mt-2 flex h-11 items-center justify-center rounded-lg bg-abyss px-4 font-medium text-[14px] text-mesh-ink leading-none tracking-[-0.1px] shadow-primary transition-colors hover:bg-abyss-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
