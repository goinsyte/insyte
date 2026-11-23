import { useState } from "react"
import { LOGIN_LINE } from "../../fixtures/auth.ts"
import { Link, paths, useQuery } from "../../router.tsx"
import { Button } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Field } from "../../ui/input.tsx"
import { AuthFrame, FormColumn, Heading, PasswordInput, pause, primaryWide } from "./frame.tsx"

/*
 * Where the reset link lands (`/app/reset-password`). Three states, each with a way on: the new
 * password; a link that no longer works (`?link=verlopen`, as one that is used or past its 30
 * minutes arrives), which sends the person back to ask for a new one; and done, which says to sign
 * in again because a reset signs out every session.
 */
export function ResetPasswordScreen() {
  const link = useQuery("link")
  const [done, setDone] = useState(false)

  return (
    <AuthFrame line={LOGIN_LINE}>
      <FormColumn stepKey={done ? "done" : (link ?? "form")}>
        {done
          ? (
            <Outcome title="Wachtwoord gewijzigd" action="Inloggen">
              Je bent op al je apparaten uitgelogd. Log in met je nieuwe wachtwoord.
            </Outcome>
          )
          : link === "verlopen"
          ? (
            <Outcome title="Deze link werkt niet meer" action="Nieuwe link aanvragen">
              Een resetlink is 30 minuten geldig en werkt één keer. Vraag op de inlogpagina een nieuwe aan, via
              “Vergeten?”.
            </Outcome>
          )
          : <NewPassword onDone={() => setDone(true)} />}
      </FormColumn>
    </AuthFrame>
  )
}

function NewPassword({ onDone }: { readonly onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [errors, setErrors] = useState<{ password?: string; repeat?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const next = {
      password: password.length < 8 ? "Minimaal 8 tekens." : undefined,
      repeat: password.length >= 8 && password !== repeat ? "De wachtwoorden zijn niet gelijk." : undefined
    }
    setErrors(next)
    if (next.password !== undefined || next.repeat !== undefined) return
    setBusy(true)
    await pause()
    setBusy(false)
    onDone()
  }

  return (
    <>
      <Heading title="Nieuw wachtwoord">Kies een wachtwoord van minimaal 8 tekens.</Heading>
      <form
        noValidate
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="Nieuw wachtwoord" error={errors.password}>
          {(control) => (
            <PasswordInput {...control} autoComplete="new-password" value={password} onChange={setPassword} />
          )}
        </Field>
        <Field label="Herhaal je wachtwoord" error={errors.repeat}>
          {(control) => <PasswordInput {...control} autoComplete="new-password" value={repeat} onChange={setRepeat} />}
        </Field>
        <Button type="submit" variant="primary" loading={busy} className={cx(primaryWide, "mt-1.5")}>
          Wachtwoord opslaan
        </Button>
      </form>
      <p className="text-center text-xs text-ink-3">
        Zo ziet een verlopen link eruit:{" "}
        <Link
          to={`${paths.resetPassword}?link=verlopen`}
          className="rounded-xs font-medium text-accent-ink hover:text-ink"
        >
          verlopen link openen
        </Link>
      </p>
    </>
  )
}

/** A finished state: what happened, and the one thing to do next, which is always the sign-in page. */
function Outcome({ title, action, children }: {
  readonly title: string
  readonly action: string
  readonly children: string | ReadonlyArray<string>
}) {
  return (
    <>
      <Heading title={title}>{children}</Heading>
      <Link to={paths.login} className={cx(primaryWide, "mt-1.5")}>{action}</Link>
    </>
  )
}
