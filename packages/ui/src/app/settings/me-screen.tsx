import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Bell, Shield } from "../../icons"
import { FieldRow, INPUT_CLASS, UnsavedBar } from "./form"
import { BandedList, SettingCard, SettingsItem } from "./setting-card"

/** The longest name a person goes by, as the server holds it. */
const NAME_MAX = 80

/** What is wrong with a name as typed, or nothing. */
const nameProblem = (name: string) =>
  name.trim() === ""
    ? "Vul je naam in."
    : name.trim().length > NAME_MAX
    ? `Deze naam is te lang: maximaal ${NAME_MAX} tekens.`
    : undefined

/**
 * Je profiel: the signed-in person, not the workspace (that is Account). The name the team sees on everything they
 * do, and the address they sign in with. The name is theirs to change; the address is shown, not changed here. Saving
 * is the settings bar's, as on every settings page; a refusal from the host keeps what was typed and says why.
 *
 * What the host keeps is its own: the console saves through the auth client, the reference keeps it in the page.
 */
export function PersonalProfilePage({
  name,
  email,
  onSave
}: {
  name: string
  email: string
  /** Keeps the name (trimmed); answers whether it took. */
  onSave: (name: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(name)
  const [kept, setKept] = useState(name)
  const keptRef = useRef(name)
  const [tried, setTried] = useState(false)
  // A name changed elsewhere (another tab) is the one to start from, unless another is being typed.
  useEffect(() => {
    if (keptRef.current === name) return
    const was = keptRef.current
    keptRef.current = name
    setKept(name)
    setDraft((d) => (d.trim() === was ? name : d))
  }, [name])

  const dirty = draft.trim() !== kept
  const problem = nameProblem(draft)
  const shownProblem = tried ? problem : undefined

  // A save that does not take rejects, so a held navigation stays on the page with what was typed.
  const save = async () => {
    setTried(true)
    if (problem !== undefined) throw new Error(problem)
    const next = draft.trim()
    if (!(await onSave(next))) throw new Error("not saved")
    keptRef.current = next
    setKept(next)
    setDraft(next)
    setTried(false)
    toast.success("Je naam is opgeslagen")
  }

  return (
    <>
      <SettingCard title="Je profiel" subtitle="Zo staat je naam bij alles wat je in Insyte doet.">
        <div className="flex flex-col">
          <FieldRow label="Naam">
            <span className="flex flex-col gap-1.5">
              <input
                type="text"
                value={draft}
                autoComplete="name"
                maxLength={NAME_MAX + 20}
                aria-invalid={shownProblem !== undefined || undefined}
                aria-describedby={shownProblem === undefined ? undefined : "me-name-problem"}
                onChange={(e) => setDraft(e.target.value)}
                className={INPUT_CLASS}
              />
              {shownProblem === undefined ? null : (
                <span id="me-name-problem" className="text-signal-red text-sm">
                  {shownProblem}
                </span>
              )}
            </span>
          </FieldRow>
          <FieldRow label="E-mail" hint="Hiermee log je in.">
            <span className="flex h-9 items-center text-base text-ink-2">{email}</span>
          </FieldRow>
        </div>
      </SettingCard>

      <SettingCard title="Verder">
        <BandedList>
          <SettingsItem
            icon={Shield}
            tone="arc"
            title="Beveiliging"
            detail="Wachtwoord, tweestapsverificatie en waar je bent ingelogd"
            to="/settings/security"
          />
          <SettingsItem
            icon={Bell}
            tone="arc"
            title="Meldingen"
            detail="Wat je hoort, waar en wanneer"
            to="/settings/notifications"
          />
        </BandedList>
      </SettingCard>

      <UnsavedBar
        visible={dirty}
        onDiscard={() => {
          setDraft(kept)
          setTried(false)
        }}
        onSave={save}
      />
    </>
  )
}
