import { useState } from "react"
import { ASK_ASSISTANT } from "../../assistant.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Avatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { CommandPalette, CommandPanel } from "../../ui/command.tsx"
import type { Command } from "../../ui/command.tsx"
import { AlertDialog, AlertPanel, Dialog, DialogPanel, Sheet, SheetPanel } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  Archive,
  Copy,
  Edit,
  ExternalLink,
  Factory,
  Inbox,
  MoreHorizontal,
  Package,
  Plus,
  Settings,
  Trash,
  Users
} from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { Popover, PopoverPanel } from "../../ui/popover.tsx"
import { toast } from "../../ui/toast.tsx"
import { Tooltip, TooltipBubble } from "../../ui/tooltip.tsx"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"

const COMMANDS: ReadonlyArray<Command> = [
  { id: "c1", label: "Inbox", group: "Ga naar", glyph: Inbox, run: () => undefined },
  { id: "c2", label: "Team", group: "Ga naar", glyph: Users, run: () => undefined },
  {
    id: "c3",
    label: "Aurora Hooded Fleece",
    group: "Records",
    glyph: Package,
    meta: "Product · € 79,00",
    run: () => undefined
  },
  { id: "c4", label: "Kestrel Goods", group: "Records", glyph: Factory, meta: "Leverancier", run: () => undefined },
  { id: "c5", label: "Nieuw ticket", group: "Acties", glyph: Plus, shortcut: "T", run: () => undefined },
  { id: "c6", label: "Instellingen", group: "Acties", glyph: Settings, run: () => undefined }
]

function OrderSheetBody() {
  return (
    <KeyValue
      items={[
        { label: "Klant", value: "Astrid Berg" },
        { label: "Product", value: "Aurora Hooded Fleece, maat M" },
        { label: "Betaald", value: "€ 79,00 via Klarna", figure: true },
        { label: "Status", value: <Status tone="accent">Retour aangevraagd</Status> },
        { label: "Reden", value: "‘Valt te klein’" }
      ]}
    />
  )
}

export function Overlays() {
  const [dialog, setDialog] = useState(false)
  const [alert, setAlert] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [palette, setPalette] = useState(false)
  return (
    <KitSection
      id="overlays"
      second="Wat boven de pagina zweeft."
      title="Overlays"
      intro="Wat boven de pagina zweeft, op het paneel met de zwevende schaduw. Elke overlay sluit met Escape en geeft de focus terug aan wat hem opende; een dialoog houdt de focus vast tot hij dicht is. Links statisch getekend, eronder het werkende onderdeel."
    >
      <Spec
        id="dialog"
        title="Dialoog"
        anatomy={[
          "Titel en een zin uitleg",
          "Hooguit een paar velden",
          "Knoppen rechtsonder, de hoofdactie rechts",
          "Sluiten rechtsboven en met Escape"
        ]}
        use={["Een korte taak die de rest even moet stilleggen."]}
        avoid={["Een dialoog voor iets dat ook in de pagina kan.", "Een dialoog in een dialoog."]}
        name="Dialog · DialogPanel"
        file="ui/dialog.tsx"
        summary="Een korte taak die de pagina even stillegt: iets toevoegen, iets kiezen. Titel, hooguit een paar velden, en de knoppen rechtsonder met de hoofdactie rechts."
        also="components/dialog.tsx, common/form-dialog"
      >
        <States cols={1}>
          <State label="Open, statisch getekend" surface="desk" inert>
            <DialogPanel
              title="Teamlid uitnodigen"
              description="Ze krijgen een mail met een link die 7 dagen geldig is."
              onClose={() => undefined}
              footer={
                <>
                  <Button variant="ghost">Annuleren</Button>
                  <Button variant="primary">Uitnodiging sturen</Button>
                </>
              }
            >
              <div className="flex flex-col gap-4">
                <Field label="E-mail">{(c) => <Input {...c} placeholder="naam@northwind.nl" />}</Field>
                <Field label="Rol">
                  {(c) => (
                    <Select {...c} defaultValue="lid">
                      <option value="lid">Teamlid</option>
                      <option value="beheer">Beheerder</option>
                    </Select>
                  )}
                </Field>
              </div>
            </DialogPanel>
          </State>
        </States>
        <div>
          <Button onClick={() => setDialog(true)}>Dialoog openen</Button>
        </div>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Teamlid uitnodigen"
          description="Ze krijgen een mail met een link die 7 dagen geldig is."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>Annuleren</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setDialog(false)
                  toast({ title: "Uitnodiging verstuurd", tone: "good" })
                }}
              >
                Uitnodiging sturen
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="E-mail">{(c) => <Input {...c} placeholder="naam@northwind.nl" autoFocus />}</Field>
          </div>
        </Dialog>
      </Spec>

      <Spec
        id="alert-dialog"
        title="Bevestigen"
        name="AlertDialog · AlertPanel"
        file="ui/dialog.tsx"
        summary="De vraag vóór iets onomkeerbaars. Zegt wat er gebeurt en wat niet terug kan; de knop noemt de handeling. Escape en Annuleren doen niets."
        also="components/alert-dialog.tsx"
      >
        <States cols={2}>
          <State label="Open" surface="desk">
            <AlertPanel
              title="Chargeback #CB-2291 accepteren?"
              body="Klarna betaalt € 129,00 terug aan Hannah Schmidt. Je kunt het dispuut daarna niet meer betwisten."
              confirmLabel="Chargeback accepteren"
            />
          </State>
          <State label="Bezig" surface="desk">
            <AlertPanel
              title="Chargeback #CB-2291 accepteren?"
              body="Klarna betaalt € 129,00 terug aan Hannah Schmidt. Je kunt het dispuut daarna niet meer betwisten."
              confirmLabel="Chargeback accepteren"
              loading
            />
          </State>
        </States>
        <div>
          <Button variant="danger" onClick={() => setAlert(true)}>Chargeback accepteren…</Button>
        </div>
        <AlertDialog
          open={alert}
          loading={busy}
          onCancel={() => setAlert(false)}
          onConfirm={() => {
            setBusy(true)
            window.setTimeout(() => {
              setBusy(false)
              setAlert(false)
              toast({ title: "Chargeback geaccepteerd", body: "Klarna betaalt € 129,00 terug." })
            }, 900)
          }}
          title="Chargeback #CB-2291 accepteren?"
          body="Klarna betaalt € 129,00 terug aan Hannah Schmidt. Je kunt het dispuut daarna niet meer betwisten."
          confirmLabel="Chargeback accepteren"
        />
      </Spec>

      <Spec
        id="sheet"
        title="Sheet"
        name="Sheet · SheetPanel"
        file="ui/dialog.tsx"
        summary="Een record bekijken zonder de lijst te verlaten: schuift van rechts in, de lijst blijft erachter staan. Op een telefoon is hij schermbreed."
        also="components/sheet.tsx, drawer, record peek"
      >
        <States cols={2}>
          <State label="Open, statisch getekend" surface="desk" align="stretch" inert>
            <div className="h-96 overflow-hidden rounded-lg shadow-pop ring-1 ring-line">
              <SheetPanel
                title="Bestelling #4821"
                meta="22 nov 2026, 09:14"
                onClose={() => undefined}
                actions={
                  <IconButton label="Openen op eigen pagina" size="sm">
                    <ExternalLink />
                  </IconButton>
                }
                footer={
                  <>
                    <Button variant="ghost">Weigeren</Button>
                    <Button variant="primary">Retour goedkeuren</Button>
                  </>
                }
              >
                <OrderSheetBody />
              </SheetPanel>
            </div>
          </State>
          <State label="Werkend">
            <Button onClick={() => setSheet(true)}>Bestelling #4821 bekijken</Button>
          </State>
        </States>
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          title="Bestelling #4821"
          meta="22 nov 2026, 09:14"
          footer={
            <>
              <Button variant="ghost" onClick={() => setSheet(false)}>Weigeren</Button>
              <Button variant="primary" onClick={() => setSheet(false)}>Retour goedkeuren</Button>
            </>
          }
        >
          <OrderSheetBody />
        </Sheet>
      </Spec>

      <Spec
        id="popover"
        title="Popover"
        name="Popover · PopoverPanel"
        file="ui/popover.tsx"
        summary="Iets erbij laten zien of kort instellen zonder de pagina te verlaten: wie er op een ticket zit, de meldingen in de hoofdbalk. Geen modaal; een klik ernaast sluit hem."
        also="components/popover.tsx, hover-card"
      >
        <States cols={2}>
          <State label="Open, statisch getekend" surface="desk" align="start" inert>
            <PopoverPanel label="Op dit ticket">
              <div className="flex flex-col gap-2.5 p-3">
                <p className="text-xs font-medium text-ink-3">Op dit ticket</p>
                {[PEOPLE.sofia, PEOPLE.ethan].map((p) => (
                  <span key={p.id} className="flex items-center gap-2 text-sm text-ink">
                    <Avatar name={p.name} size={24} presence={p.presence} />
                    {p.name}
                    <span className="ml-auto text-xs text-ink-3">{p.role}</span>
                  </span>
                ))}
              </div>
            </PopoverPanel>
          </State>
          <State label="Werkend" align="center">
            <Popover
              label="Op dit ticket"
              trigger={(props) => <Button {...props} icon={<Users />}>Op dit ticket</Button>}
            >
              <div className="flex flex-col gap-2.5 p-3">
                {[PEOPLE.sofia, PEOPLE.ethan].map((p) => (
                  <span key={p.id} className="flex items-center gap-2 text-sm text-ink">
                    <Avatar name={p.name} size={24} presence={p.presence} />
                    {p.name}
                    <span className="ml-auto text-xs text-ink-3">{p.role}</span>
                  </span>
                ))}
              </div>
            </Popover>
          </State>
        </States>
      </Spec>

      <Spec
        id="menu-live"
        title="Menu, werkend"
        name="DropdownMenu (werkend)"
        file="ui/dropdown.tsx"
        summary="Het menu uit Navigatie, nu werkend: open met een klik, Enter of pijl omlaag, en loop met de pijltjes."
      >
        <States cols={2}>
          <State label="Achter drie puntjes">
            <DropdownMenu
              label="Acties"
              trigger={(props) => (
                <IconButton label="Acties" tone="outline" {...props}>
                  <MoreHorizontal />
                </IconButton>
              )}
            >
              <DropdownItem glyph={Edit} shortcut="E" onSelect={() => toast({ title: "Naam wijzigen" })}>
                Naam wijzigen
              </DropdownItem>
              <DropdownItem glyph={Copy} onSelect={() => toast({ title: "Gedupliceerd", tone: "good" })}>
                Dupliceren
              </DropdownItem>
              <DropdownItem glyph={Archive}>Archiveren</DropdownItem>
              <DropdownSeparator />
              <DropdownItem glyph={Trash} tone="danger" onSelect={() => toast({ title: "Weggehaald", tone: "bad" })}>
                Weghalen
              </DropdownItem>
            </DropdownMenu>
          </State>
          <State label="Achter een knop">
            <DropdownMenu label="Nieuw" trigger={(props) => <Button {...props} icon={<Plus />}>Nieuw</Button>}>
              <DropdownItem glyph={Inbox}>Ticket</DropdownItem>
              <DropdownItem glyph={Package}>Product</DropdownItem>
              <DropdownItem glyph={Factory}>Leverancier</DropdownItem>
            </DropdownMenu>
          </State>
        </States>
      </Spec>

      <Spec
        id="tooltip"
        title="Tooltip"
        avoid={["Informatie die je nodig hebt om verder te kunnen: op een telefoon is er geen hover."]}
        name="Tooltip · TooltipBubble"
        file="ui/tooltip.tsx"
        summary="De naam van een knop zonder woord, en zijn sneltoets. Verschijnt na een korte pauze bij hover of focus. Nooit iets wat je moet lezen om verder te kunnen."
        also="components/tooltip.tsx"
      >
        <States cols={3}>
          <State label="Bubbel">
            <TooltipBubble>Kopiëren</TooltipBubble>
          </State>
          <State label="Met sneltoets">
            <TooltipBubble shortcut="⌘K">Zoeken</TooltipBubble>
          </State>
          <State label="Werkend: hover of focus">
            <Tooltip content="Dupliceren" shortcut="⌘D">
              <IconButton label="Dupliceren" tone="outline">
                <Copy />
              </IconButton>
            </Tooltip>
          </State>
        </States>
      </Spec>

      <Spec
        id="command"
        title="Palet"
        name="CommandPalette · CommandPanel"
        file="ui/command.tsx"
        summary={`Overal ⌘K: ga naar een gebied, open een record of start een actie. Vind je het niet, dan is de laatste regel ‘${ASK_ASSISTANT}’ met wat je typte.`}
        also="components/command.tsx, global search"
      >
        <States cols={1}>
          <State label="Open, statisch getekend" surface="desk" inert>
            <div className="w-full max-w-xl overflow-hidden rounded-lg bg-panel shadow-pop ring-1 ring-line">
              <CommandPanel
                commands={COMMANDS}
                onRun={() => undefined}
                onAsk={() => undefined}
                askLabel={(q) => <>{ASK_ASSISTANT}: ‘{q}’</>}
              />
            </div>
          </State>
        </States>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setPalette(true)}>Palet openen</Button>
          <span className="text-xs text-ink-3">of druk overal in de app op ⌘K</span>
        </div>
        <CommandPalette
          open={palette}
          onClose={() => setPalette(false)}
          commands={COMMANDS}
          onAsk={(q) => toast({ title: `${ASK_ASSISTANT}: ‘${q}’` })}
          askLabel={(q) => <>{ASK_ASSISTANT}: ‘{q}’</>}
        />
        <Rule>
          De statische tekening en de werkende palet zijn hetzelfde onderdeel; de palet zet het in een dialoog.
        </Rule>
      </Spec>
    </KitSection>
  )
}
