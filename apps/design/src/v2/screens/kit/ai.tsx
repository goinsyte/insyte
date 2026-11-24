import { useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { ChartCard } from "../../charts/chart-card.tsx"
import { BLOCKS } from "../../fixtures/analytics.ts"
import { CHATS } from "../../fixtures/assistant.ts"
import type { Turn } from "../../fixtures/assistant.ts"
import { paths } from "../../router.tsx"
import { MagnusAvatar, ModelButton, Thinking } from "../../ui/assistant.tsx"
import { AgentAvatar } from "../../ui/avatar.tsx"
import { Composer } from "../../ui/composer.tsx"
import { RotateCcw, Truck } from "../../ui/icons.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Proposal } from "../../ui/proposal.tsx"
import type { ProposalState } from "../../ui/proposal.tsx"
import { toast } from "../../ui/toast.tsx"
import { MagnusMessage, MyMessage, ProposalCard } from "../chat-parts.tsx"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"

const chat = CHATS[0]
const first = chat?.turns.find((t): t is Extract<Turn, { from: "magnus" }> => t.from === "magnus")
const mine = chat?.turns.find((t): t is Extract<Turn, { from: "me" }> => t.from === "me")

export function Ai() {
  const [context, setContext] = useState<ReadonlyArray<string>>(["Bord Weekoverzicht", "Aurora Hooded Fleece"])
  const [used, setUsed] = useState<ReadonlySet<string>>(new Set())
  const [card, setCard] = useState<ProposalState>("open")
  const [agent, setAgent] = useState<ProposalState>("open")
  return (
    <KitSection
      id="ai"
      second="Het verloop, alleen hier."
      title={ASSISTANT}
      intro={`Het verloop staat op drie plekken en verder nergens: het teken van ${ASSISTANT}, de rand van de composer terwijl je typt, en het punt in een grafiek dat ${ASSISTANT} vond. Het is vast in elk thema en nooit tekst. Een voorstel is Eerst vragen: er gebeurt niets tot iemand het uitvoert, en het is terug te draaien.`}
    >
      <Spec
        id="composer"
        title="Composer"
        anatomy={[
          "Context als chips, weg te halen",
          "Het veld, groeit mee met de tekst",
          "Bijlagen en model links, versturen rechts",
          "De rand: neutraal in rust, het verloop terwijl je typt"
        ]}
        name="Composer · ModelButton"
        file="ui/composer.tsx · ui/assistant.tsx"
        summary="Het veld waarin je met Magnus praat: de context als chips erboven (weg te halen), bijlagen en model links, versturen rechts. Enter verstuurt, Shift+Enter is een nieuwe regel."
        also="assistant/composer, chat input"
      >
        <States cols={2}>
          <State label="Met context" surface="desk" align="stretch">
            <Composer
              label={`Bericht aan ${ASSISTANT}`}
              placeholder={`Vraag ${ASSISTANT} iets over Northwind`}
              context={context}
              onRemoveContext={(item) => setContext((c) => c.filter((x) => x !== item))}
              onSend={(text) => toast({ title: "Verstuurd", body: text })}
            />
          </State>
          <State label="Kaal, zonder gereedschap" surface="desk" align="stretch">
            <Composer
              label="Instructie voor de agent"
              placeholder="Wat moet deze agent anders doen?"
              tools={false}
              onSend={() => undefined}
            />
          </State>
          <State label="ModelButton">
            <ModelButton />
          </State>
          <State label="Focus" force="focus" surface="desk" align="stretch">
            <Composer
              label="Voorbeeld"
              placeholder={`Vraag ${ASSISTANT} iets`}
              onSend={() => undefined}
              tools={false}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="message"
        title="Gesprek"
        name="Message · MyMessage · MagnusMessage · Thinking"
        file="ui/message.tsx · screens/chat-parts.tsx · ui/assistant.tsx"
        summary="Een gesprek leest als een document, niet als bubbels: wie, wanneer, en de tekst over de hele breedte. Magnus laat zien wat hij las en deed, en eindigt met vervolgstappen."
        also="assistant/message, thread"
      >
        <div className="flex flex-col gap-6 py-2">
          {mine !== undefined && <MyMessage at={mine.at} text={mine.text} />}
          {first !== undefined && (
            <MagnusMessage
              turn={first}
              used={used}
              onFollowUp={(f) => setUsed((u) => new Set([...u, f.id]))}
            />
          )}
          <Thinking />
        </div>
      </Spec>

      <Spec
        id="proposal"
        title="Voorstel"
        anatomy={[
          "Wie het voorstelt",
          "Wat er gebeurt, in één zin, en waar",
          "Wat hij las om erop te komen",
          "Uitvoeren, Bewerken (het concept in de regel, met Opslaan en Annuleren), Negeren",
          "Daarna wie het deed en een weg terug; een verzending telt 30 s af en is daarna niet meer terug te halen"
        ]}
        use={["Elke handeling op Eerst vragen, van Magnus of een agent."]}
        avoid={["Uitvoeren zonder dat te laten zien: elk voorstel blijft staan met wie het deed."]}
        name="Proposal · ProposalCard"
        file="ui/proposal.tsx · screens/chat-parts.tsx"
        summary="Wat een agent of Magnus wil doen en eerst vraagt: wie, wat, waar het gebeurt en wat hij las. Uitvoeren, Bewerken of Negeren; daarna blijft het staan met wie het deed en een weg terug."
        also="agent approvals, ‘Eerst vragen’ queue"
      >
        <States cols={2}>
          <State
            label={`ProposalCard · ${card === "open" ? "open" : card === "done" ? "uitgevoerd" : "genegeerd"}`}
            surface="desk"
            align="stretch"
          >
            <ProposalCard
              state={card}
              onChange={setCard}
              proposal={{
                title: "Maatadvies op de productpagina van de Aurora Hooded Fleece",
                body: "‘Valt klein: kies één maat groter dan je gewoonlijk draagt.’",
                where: "Shopify · productpagina",
                rule: "Eerst vragen"
              }}
            />
          </State>
          <State
            label={`Proposal van een agent · ${
              agent === "open" ? "open" : agent === "done" ? "uitgevoerd" : "genegeerd"
            }`}
            surface="desk"
            align="stretch"
          >
            <Proposal
              from={
                <span className="flex items-center gap-2">
                  <AgentAvatar glyph={RotateCcw} size={22} active />Retouragent
                </span>
              }
              title="Omruilen in plaats van terugbetalen voor Astrid Berg"
              body="Maat M is op voorraad. Ze vroeg zelf om een maat groter; een omruiling houdt de € 79,00 binnen."
              read={["Retourformulier #4821", "Voorraad Aurora · M: 14"]}
              where="Shopify · bestelling #4821"
              draft="Hoi Astrid, jammer dat de Aurora te klein valt. Zullen we hem omruilen voor maat M? Die gaat morgen de deur uit."
              state={agent}
              onChange={setAgent}
              sends
              doneBy="Elena Hart"
            />
          </State>
          <State label="Uitgevoerd" surface="desk" align="stretch">
            <ProposalCard
              state="done"
              onChange={() => undefined}
              proposal={{
                title: "Ticket #5142 toewijzen aan Sofía Kim",
                body: "Zij deed de vorige vraag van deze klant.",
                where: "Inbox",
                rule: "Eerst vragen"
              }}
            />
          </State>
          <State label="Genegeerd" surface="desk" align="stretch">
            <ProposalCard
              state="discarded"
              onChange={() => undefined}
              proposal={{
                title: "Kortingscode van 10% voor Chris Lee",
                body: "Als excuus voor de vertraging.",
                where: "Inbox · ticket #5146",
                rule: "Eerst vragen"
              }}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="chart-card"
        title="Grafiek in een gesprek"
        name="ChartCard"
        file="charts/chart-card.tsx"
        summary="Een grafiek in een gesprek: dezelfde tekens als op een bord, op een well, en ‘Op een bord zetten’ verplaatst hem als blok."
        also="assistant/inline-chart"
      >
        <States cols={2}>
          <State label="bar" align="start">
            <ChartCard
              title="Terugbetalingen per product, deze week"
              kind="bar"
              data={BLOCKS.terugbetalingenPerProduct.data}
              board={{ label: "Retouren", href: paths.board("retouren") }}
            />
          </State>
          <State label="rank" align="start">
            <ChartCard
              title="Retourredenen van de Aurora"
              kind="rank"
              data={BLOCKS.retourredenen.data}
              board={{ label: "Retouren", href: paths.board("retouren") }}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="agent-avatar"
        title="Magnus en de agents"
        name="MagnusMark · MagnusAvatar · AgentAvatar"
        file="ui/magnus-mark.tsx · ui/assistant.tsx · ui/avatar.tsx"
        summary="Het teken van Magnus, zijn schijf in een gesprek, en een agent: zijn icoon in inkt binnen een neutrale haarlijn, zonder verloop. Zeven agents blijven zo een lijst van iconen, geen zeven gekleurde bollen."
      >
        <States cols={4}>
          <State label="MagnusMark · 16 / 20 / 28">
            <MagnusMark size={16} />
            <MagnusMark size={20} />
            <MagnusMark size={28} label={ASSISTANT} />
          </State>
          <State label="MagnusAvatar">
            <MagnusAvatar size={28} />
            <MagnusAvatar size={36} />
          </State>
          <State label="AgentAvatar · aan">
            <AgentAvatar glyph={Truck} size={28} active />
            <AgentAvatar glyph={RotateCcw} size={36} active />
          </State>
          <State label="AgentAvatar · in de donkere L" surface="rail">
            <AgentAvatar glyph={Truck} size={28} />
            <span className="text-xs text-rail-ink">Neutrale ring, ook hier</span>
          </State>
        </States>
        <Rule>
          Het verloop wordt nooit een tekstkleur en nooit een knop; woorden van Magnus staan in inkt, naast zijn teken.
        </Rule>
      </Spec>
    </KitSection>
  )
}
