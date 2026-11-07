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

export function organizationStep({ data, patch, next }: {
  data: OnboardingData
  patch: (p: OnboardingData) => void
  next: () => void
}): StepDef {
  const d = data as Record<string, string | undefined>
  return {
    id: "organization",
    title: "Geef je werkruimte een naam.",
    busyLabel: "Werkruimte wordt aangemaakt",
    subtitle: "Naam, huisstijl en land kun je altijd wijzigen in de instellingen.",
    canContinue: true,
    onPrimary: async () => {
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
