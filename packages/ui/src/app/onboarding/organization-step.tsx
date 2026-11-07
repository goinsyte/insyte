import { Field, SelectField, TextField } from "../common/form-dialog"
import { authClient } from "../lib/auth-client"
import { persistStep } from "../lib/onboarding-api"
import type { StepDef } from "./onboarding-shell"
import { SelectionGroup, SelectionTile } from "./selection-tile"
import type { OnboardingData } from "./use-onboarding-state"

/*
 * The admin track's organisation step, the workspace's name, address, country and team size, out of `admin-steps.tsx`
 * so a host can mount it without the rest of the admin tail and its stores (the console in step 2, before the plan,
 * store and analysis steps are wired). The step itself is the reference's, unchanged.
 */

const COUNTRIES = [
  "Nederland",
  "Verenigde Staten",
  "Verenigd Koninkrijk",
  "Duitsland",
  "Frankrijk",
  "Italië",
  "Spanje"
] as const

const TEAM_SIZES = [
  { id: "solo", label: "Alleen ik", hint: "Solo-ondernemer" },
  { id: "small", label: "2 tot 5", hint: "Klein team" },
  { id: "mid", label: "6 tot 20", hint: "Groeiend team" },
  { id: "large", label: "Meer dan 20", hint: "Meerdere winkels" }
] as const

/** The workspace as a host founds it: country as its ISO code, team size as the server's band. */
export interface NewWorkspace {
  readonly name: string
  readonly slug: string
  readonly country: string
  readonly teamSize: string
}

const COUNTRY_CODE: Record<(typeof COUNTRIES)[number], string> = {
  Nederland: "NL",
  "Verenigde Staten": "US",
  "Verenigd Koninkrijk": "GB",
  Duitsland: "DE",
  Frankrijk: "FR",
  Italië: "IT",
  Spanje: "ES"
}

const TEAM_BAND: Record<(typeof TEAM_SIZES)[number]["id"], string> = {
  solo: "1",
  small: "2-5",
  mid: "6-20",
  large: "21+"
}

/**
 * `onCreate` founds the workspace where the host has a server (the console: `Onboarding.advance`) and answers a sentence
 * when it refused; without it, the reference's own call runs.
 */
export function organizationStep({ data, patch, next, onCreate }: {
  data: OnboardingData
  patch: (p: OnboardingData) => void
  next: () => void
  onCreate?: ((workspace: NewWorkspace) => Promise<string | undefined>) | undefined
}): StepDef {
  const d = data as Record<string, string | undefined>
  return {
    id: "organization",
    title: "Geef je werkruimte een naam.",
    busyLabel: "Werkruimte wordt aangemaakt",
    subtitle: "Naam, huisstijl en land kun je altijd wijzigen in de instellingen.",
    canContinue: true,
    onPrimary: async () => {
      if (onCreate !== undefined) {
        const refused = await onCreate({
          name: d.orgName ?? "",
          slug: d.slug ?? "",
          country: COUNTRY_CODE[(d.country as (typeof COUNTRIES)[number]) ?? "Nederland"] ?? "NL",
          teamSize: TEAM_BAND[(d.teamSize as (typeof TEAM_SIZES)[number]["id"]) ?? "solo"] ?? "1"
        })
        // Thrown → the shell shows it inline beneath the fields.
        if (refused !== undefined) throw new Error(refused)
        next()
        return
      }
      const { data: org, error } = await authClient.organization.create({
        name: d.orgName ?? "",
        slug: d.slug ?? ""
      })
      if (error) {
        // Thrown → the shell shows it inline beneath the fields.
        throw new Error(error.message ?? "Je werkruimte kon niet worden aangemaakt.")
      }
      patch({ organizationId: org?.id })
      persistStep("organization", {
        organizationId: org?.id,
        country: d.country,
        teamSize: d.teamSize
      })
      next()
    },
    content: (
      <>
        <Field label="Naam werkruimte">
          <TextField
            value={(d.orgName as string) ?? ""}
            onChange={(v) => {
              patch({
                orgName: v,
                slug: v
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, "")
              })
            }}
            placeholder="Allure Co."
          />
        </Field>
        <Field label="URL werkruimte">
          <div className="field flex h-11 items-center overflow-hidden rounded-lg focus-within:outline-2 focus-within:outline-arc">
            <span className="pl-3.5 text-base text-ink-3">
              goinsyte.com/
            </span>
            <input
              value={(d.slug as string) ?? ""}
              onChange={(e) => patch({ slug: e.target.value })}
              className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-base text-ink outline-none placeholder:text-ink-3"
              placeholder="allure"
            />
          </div>
        </Field>
        <Field label="Land">
          <SelectField
            value={(d.country as (typeof COUNTRIES)[number]) ?? "Nederland"}
            onChange={(v) => patch({ country: v })}
            options={COUNTRIES}
          />
        </Field>
        <Field label="Teamgrootte">
          <SelectionGroup
            mode="single"
            value={(d.teamSize as string) ?? "solo"}
            onChange={(v) => patch({ teamSize: v as string })}
            columns={2}
            label="Teamgrootte"
          >
            {TEAM_SIZES.map((t) => (
              <SelectionTile
                key={t.id}
                id={t.id}
                label={t.label}
                hint={t.hint}
              />
            ))}
          </SelectionGroup>
        </Field>
      </>
    )
  }
}
