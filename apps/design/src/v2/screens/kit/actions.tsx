import { useState } from "react"
import { paths } from "../../router.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import type { ButtonVariant } from "../../ui/button.tsx"
import { Chip } from "../../ui/chip.tsx"
import { ExternalLink, MoreHorizontal, Plus, Settings, Star, Trash, X } from "../../ui/icons.tsx"
import { DoDont, KitSection, Matrix, Spec, State, States } from "./frame.tsx"

const VARIANTS: ReadonlyArray<{ readonly v: ButtonVariant; readonly label: string; readonly text: string }> = [
  { v: "primary", label: "primary", text: "Uitvoeren" },
  { v: "secondary", label: "secondary", text: "Aanpassen" },
  { v: "ghost", label: "ghost", text: "Negeren" },
  { v: "danger", label: "danger", text: "Accepteren" }
]

const FORCED = [
  { label: "Standaard", force: undefined },
  { label: "Hover", force: "hover" },
  { label: "Focus", force: "focus" },
  { label: "Ingedrukt", force: "active" }
] as const

export function Actions() {
  const [used, setUsed] = useState(false)
  return (
    <KitSection
      id="acties"
      second="Inkt, nooit het accent."
      title="Acties"
      intro="Knoppen zijn inkt, nooit het accent: het thema van een klant mag niet bepalen wat er te drukken valt. Eén primaire knop per gebied. Een chip is een volgende stap met één druk."
    >
      <Spec
        id="button"
        title="Knop"
        anatomy={[
          "Icoon (optioneel), 16px, links van het woord",
          "Label: een werkwoord, de handeling zelf",
          "Hoogte 28 (sm) of 32 (md), ronding sm"
        ]}
        use={[
          "Eén primaire knop per gebied: de handeling waar het scherm om draait.",
          "Secundair voor de rest, stil (ghost) in rijen en kaarten."
        ]}
        avoid={[
          "Een knop in het accent: het thema bepaalt niet wat er te drukken valt.",
          "‘OK’, ‘Ja’ of ‘Klik hier’ als label."
        ]}
        name="Button"
        file="ui/button.tsx"
        summary="Vier varianten in twee maten. Bezig houdt de breedte en wisselt het icoon voor een spinner; uit is 45% en neemt geen invoer."
        also="components/button.tsx (default, outline, ghost, destructive)"
      >
        <Matrix
          label="Knop: varianten en staten"
          columns={[...FORCED, { label: "Uit" }, { label: "Bezig" }]}
          rows={VARIANTS.map(({ v, label, text }) => ({
            label,
            cell: (i) => <Button variant={v} disabled={i === 4} loading={i === 5}>{text}</Button>
          }))}
        />
        <States cols={3}>
          <State label="sm · 28px">
            <Button size="sm" variant="primary">Opslaan</Button>
            <Button size="sm" icon={<Plus />}>Blok toevoegen</Button>
          </State>
          <State label="md · 32px">
            <Button variant="primary">Opslaan</Button>
            <Button icon={<Plus />}>Blok toevoegen</Button>
          </State>
          <State label="Samen: primair, secundair, stil">
            <Button variant="primary" size="sm">Uitvoeren</Button>
            <Button variant="ghost" size="sm">Bewerken</Button>
            <Button variant="ghost" size="sm">Negeren</Button>
          </State>
        </States>
        <DoDont
          items={[
            {
              kind: "wel",
              caption: "Eén primaire knop per gebied; de rest is secundair of stil.",
              children: (
                <>
                  <Button variant="primary">Retour goedkeuren</Button>
                  <Button variant="ghost">Weigeren</Button>
                </>
              )
            },
            {
              kind: "niet",
              caption: "Twee primaire knoppen naast elkaar: nu weet niemand wat het scherm wil.",
              children: (
                <>
                  <Button variant="primary">Retour goedkeuren</Button>
                  <Button variant="primary">Weigeren</Button>
                </>
              )
            },
            {
              kind: "wel",
              caption: "Danger noemt de handeling, in de vraag vóór iets onomkeerbaars.",
              children: <Button variant="danger">Chargeback accepteren</Button>
            },
            {
              kind: "niet",
              caption: "‘OK’ of ‘Ja’ op een knop die geld kost of iets weghaalt.",
              children: <Button variant="danger">OK</Button>
            }
          ]}
        />
      </Spec>

      <Spec
        id="icon-button"
        title="Icoonknop"
        use={["Bekende handelingen in een balk of rij: sluiten, meer, vastzetten."]}
        avoid={["Een icoon dat je moet raden. Twijfel je, zet er een woord bij."]}
        name="IconButton"
        file="ui/button.tsx"
        summary="Een knop met alleen een icoon. Het label is verplicht: het wordt voorgelezen en verschijnt bij hover."
      >
        <States cols={6}>
          {FORCED.map((s) => (
            <State key={s.label} label={`canvas · ${s.label.toLowerCase()}`} force={s.force}>
              <IconButton label="Meer acties">
                <MoreHorizontal />
              </IconButton>
            </State>
          ))}
          <State label="canvas · aangezet">
            <IconButton label="Favoriet" pressed>
              <Star />
            </IconButton>
          </State>
          <State label="canvas · uit">
            <IconButton label="Weghalen" disabled>
              <Trash />
            </IconButton>
          </State>
          <State label="outline">
            <IconButton label="Meer acties" tone="outline">
              <MoreHorizontal />
            </IconButton>
          </State>
          <State label="outline · hover" force="hover">
            <IconButton label="Meer acties" tone="outline">
              <MoreHorizontal />
            </IconButton>
          </State>
          <State label="rail" surface="rail">
            <IconButton label="Instellingen" tone="rail">
              <Settings />
            </IconButton>
          </State>
          <State label="rail · hover" surface="rail" force="hover">
            <IconButton label="Instellingen" tone="rail">
              <Settings />
            </IconButton>
          </State>
          <State label="sm · 28px">
            <IconButton label="Sluiten" size="sm">
              <X />
            </IconButton>
          </State>
          <State label="md · 32px">
            <IconButton label="Sluiten">
              <X />
            </IconButton>
          </State>
        </States>
      </Spec>

      <Spec
        id="button-link"
        title="Knoplink"
        name="ButtonLink"
        file="ui/button.tsx"
        summary="Een link in de vorm van een knop, voor een actie die ergens heen gaat (‘Ticket openen’). Dezelfde varianten; het blijft een link voor de browser."
      >
        <States cols={3}>
          <State label="secondary">
            <ButtonLink to={paths.section("inbox")} size="sm">Naar de inbox</ButtonLink>
          </State>
          <State label="secondary · hover" force="hover">
            <ButtonLink to={paths.section("inbox")} size="sm">Naar de inbox</ButtonLink>
          </State>
          <State label="ghost met icoon">
            <ButtonLink to={paths.board("week")} size="sm" variant="ghost" icon={<ExternalLink />}>
              Open in Analyse
            </ButtonLink>
          </State>
        </States>
      </Spec>

      <Spec
        id="chip"
        title="Vervolgstap"
        name="Chip"
        file="ui/chip.tsx"
        summary="Een volgende stap met één druk: de vervolgstappen van Magnus, de suggesties van een nieuwe chat. Na gebruik blijft hij staan, afgevinkt en stil, zodat het gesprek zijn geschiedenis houdt."
      >
        <States cols={4}>
          <State label="Standaard">
            <Chip onClick={() => undefined}>Terugbetalingen per vervoerder</Chip>
          </State>
          <State label="Hover" force="hover">
            <Chip onClick={() => undefined}>Terugbetalingen per vervoerder</Chip>
          </State>
          <State label="Met hint: vraagt eerst">
            <Chip hint="vraagt eerst" onClick={() => undefined}>Maatadvies op de Aurora zetten</Chip>
          </State>
          <State label={used ? "Gebruikt" : "Druk om te gebruiken"}>
            <Chip done={used} onClick={() => setUsed(true)}>Vergelijk met oktober</Chip>
          </State>
        </States>
      </Spec>
    </KitSection>
  )
}
