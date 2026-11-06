import { PERSONA_OPTIONS } from "@insyte/ui/app/lib/types/persona"
import { useState } from "react"
import { SCENARIOS, setScenario } from "../app/fixtures/scenario.ts"

type ScenarioId = (typeof SCENARIOS)[number]["id"]

/** The screens before anyone is signed in, as the persona switcher lists them. */
const SIGNED_OUT = [
  { label: "Inloggen", to: "/login" },
  { label: "Registreren", to: "/register" },
  { label: "Inrichten · merk", to: "/onboarding?persona=admin" },
  { label: "Inrichten · leverancier", to: "/onboarding?persona=supplier" },
  { label: "Inrichten · affiliate", to: "/onboarding?persona=affiliate" },
  { label: "Uitnodiging · nieuw account", to: "/invitations/inv_nieuw" },
  { label: "Uitnodiging · leverancier", to: "/invitations/inv_leverancier" },
  { label: "Uitnodiging · verlopen", to: "/invitations/inv_verlopen" }
] as const

const SITE = [
  { label: "Start", to: "/site" },
  { label: "Prijzen", to: "/site/prijzen" },
  { label: "Oplossingen · operators", to: "/site/oplossingen/operators" },
  { label: "Product · bestellingen", to: "/site/product/bestellingen" },
  { label: "Koppelingen", to: "/site/koppelingen" },
  { label: "Vragen", to: "/site/vragen" },
  { label: "Changelog", to: "/site/changelog" },
  { label: "Achtergronden · lab", to: "/site/variants" }
] as const

const BRAND = [
  { label: "Merkboek", to: "/brand" },
  { label: "Typografie", to: "/brand/type" },
  { label: "Kleur", to: "/brand/color" },
  { label: "Logo's", to: "/brand/logos" },
  { label: "Designsysteem (tokens)", to: "/brand/tokens" }
] as const

const PERSONA_KEY = "insyte:persona"

/**
 * `/`: what this origin holds, and the two switches the product demo is driven by.
 *
 * Opening a persona does what the persona switcher in the product does — it stores the persona under
 * the switcher's own key and sets the design state, clearing the workspace's edits on the way — so
 * the demo opens exactly as if it had been switched from inside.
 */
export function Home() {
  const [scenario, setPicked] = useState<ScenarioId>("settled")

  const open = (persona: string, landing: string) => {
    try {
      window.localStorage.setItem(PERSONA_KEY, persona)
    } catch {
      // Private mode: the demo opens as the admin, which is its default.
    }
    setScenario(scenario, `/app${landing}`)
  }

  return (
    <main className="min-h-svh bg-glacier text-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16 sm:px-8">
        <header className="flex flex-col gap-3">
          <p className="text-ink-3 text-sm">Insyte · referentie</p>
          <h1 className="max-w-[24ch] font-medium text-3xl tracking-tight">
            Het hele productontwerp op één plek, zonder backend.
          </h1>
          <p className="max-w-2xl text-ink-2 leading-relaxed">
            Het product met demodata, de marketingsite en het merkboek, uit dezelfde componenten als het echte platform.
            Elk scherm komt uit <code className="text-sm">@insyte/ui</code>; alleen de data is hier nagebootst.
          </p>
        </header>

        <section aria-labelledby="product-kop" className="flex flex-col gap-5 rounded-xl bg-paper p-6">
          <div className="flex flex-col gap-1">
            <h2 id="product-kop" className="font-medium text-xl">Product</h2>
            <p className="text-ink-2 text-sm">
              Kies een ontwerpstaat en open het product als een van de rollen. In het product wissel je met de knop
              linksonder.
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-medium text-sm">Ontwerpstaat</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {SCENARIOS.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg bg-mist p-3 has-[:checked]:bg-arc-tint has-[:checked]:text-arc-ink"
                >
                  <span className="flex items-center gap-2 font-medium text-sm">
                    <input
                      type="radio"
                      name="scenario"
                      value={s.id}
                      checked={scenario === s.id}
                      onChange={() => setPicked(s.id)}
                    />
                    {s.label}
                  </span>
                  <span className="text-ink-3 text-xs leading-snug">{s.detail}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">Bekijk als</h3>
            <div className="flex flex-wrap gap-2">
              {PERSONA_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => open(p.value, p.landing)}
                  className="rounded-md bg-abyss px-3 py-1.5 font-medium text-mesh-ink text-sm hover:bg-abyss-2"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-sm">Schermen voor het inloggen</h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {SIGNED_OUT.map((x) => (
                <li key={x.to}>
                  <a className="text-arc-ink underline-offset-2 hover:underline" href={`/app${x.to}`}>{x.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="grid gap-6 sm:grid-cols-2">
          <Links
            title="Marketingsite"
            lead="De twintig pagina's van apps/marketing, met het achtergrondenlab."
            items={SITE}
          />
          <Links title="Merkboek" lead="De veertien hoofdstukken, en het designsysteem uit de tokens." items={BRAND} />
        </div>
      </div>
    </main>
  )
}

function Links(
  { title, lead, items }: {
    readonly title: string
    readonly lead: string
    readonly items: ReadonlyArray<{ readonly label: string; readonly to: string }>
  }
) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-paper p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-xl">{title}</h2>
        <p className="text-ink-2 text-sm">{lead}</p>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((x) => (
          <li key={x.to}>
            <a className="text-arc-ink underline-offset-2 hover:underline" href={x.to}>{x.label}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}
