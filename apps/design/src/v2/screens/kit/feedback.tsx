import { useEffect, useState } from "react"
import { Denied, ReadOnlyNotice } from "../../ui/access.tsx"
import { Button } from "../../ui/button.tsx"
import { Inbox, RotateCcw } from "../../ui/icons.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Meter, ProgressBar } from "../../ui/progress.tsx"
import { Skeleton, SkeletonRow, SkeletonText } from "../../ui/skeleton.tsx"
import { Spinner } from "../../ui/spinner.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { toast, ToastView } from "../../ui/toast.tsx"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"

function LiveProgress() {
  const [value, setValue] = useState(0.18)
  useEffect(() => {
    const t = window.setInterval(() => setValue((v) => (v >= 1 ? 0.05 : Math.min(1, v + 0.07))), 600)
    return () => window.clearInterval(t)
  }, [])
  return (
    <ProgressBar
      label="Bestellingen importeren"
      value={value}
      detail={`${Math.round(value * 1284).toLocaleString("nl-NL")} van 1.284`}
    />
  )
}

export function Feedback() {
  return (
    <KitSection
      id="feedback"
      second="Wat de app terugzegt."
      title="Feedback"
      intro="Wat de app terugzegt. Een melding verdwijnt vanzelf en is terug te draaien; een bericht in de pagina blijft staan tot het is opgelost. Leeg, laden en fout hebben elk een vaste vorm, zodat een scherm nooit zomaar wit is."
    >
      <Spec
        id="toast"
        title="Melding"
        anatomy={[
          "Teken en titel: wat er net gebeurde",
          "Een zin uitleg (optioneel)",
          "Eén actie, meestal Ongedaan maken",
          "Sluiten"
        ]}
        use={["Bevestigen wat net gelukt is, met een weg terug."]}
        avoid={["Een fout die iemand moet oplossen: die hoort in de pagina, naast het probleem."]}
        name="toast() · Toaster · ToastView"
        file="ui/toast.tsx"
        summary="Rechtsonder, hoogstens drie tegelijk, vijf seconden; met de muis erop blijft hij staan. Voor iets dat net gelukt is, met Ongedaan maken waar dat kan. Voorgelezen via een live-regio."
        also="components/sonner.tsx, toast"
      >
        <States cols={2}>
          <State label="neutral" align="stretch" surface="desk">
            <ToastView
              item={{ title: "Export gestart", body: "Je krijgt een mail als het bestand klaar is.", tone: "neutral" }}
              onDismiss={() => undefined}
            />
          </State>
          <State label="good · met actie" align="stretch" surface="desk">
            <ToastView
              item={{
                title: "6 bestellingen gearchiveerd",
                tone: "good",
                action: { label: "Ongedaan maken", onClick: () => undefined }
              }}
              onDismiss={() => undefined}
            />
          </State>
          <State label="bad" align="stretch" surface="desk">
            <ToastView
              item={{
                title: "Opslaan lukte niet",
                body: "De verbinding viel weg. Je wijziging staat nog in het veld.",
                tone: "bad"
              }}
              onDismiss={() => undefined}
            />
          </State>
        </States>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => toast({ title: "Ticket #5142 toegewezen aan Sofía Kim" })}>
            Toon een melding
          </Button>
          <Button
            size="sm"
            onClick={() =>
              toast({
                title: "Label ‘Maat’ weggehaald",
                tone: "good",
                action: { label: "Ongedaan maken", onClick: () => toast({ title: "Label teruggezet" }) }
              })}
          >
            Met Ongedaan maken
          </Button>
          <Button
            size="sm"
            onClick={() =>
              toast({
                title: "Versturen lukte niet",
                body: "Klarna weigerde het bewijs: het bestand is groter dan 10 MB.",
                tone: "bad"
              })}
          >
            Een fout
          </Button>
        </div>
      </Spec>

      <Spec
        id="notice"
        title="Bericht in de pagina"
        use={["Iets dat blijft tot het opgelost is: een koppeling die verloopt."]}
        avoid={["Een gekleurde rand links als signaal.", "Meer dan één bericht boven een scherm."]}
        name="Notice"
        file="ui/notice.tsx"
        summary="Een bericht in de pagina dat blijft: een koppeling die verloopt, een formulier met fouten. Een getinte vlak met een teken en een woord, geen gekleurde rand."
        also="components/alert.tsx, banners"
      >
        <States cols={2}>
          <State label="info" align="stretch">
            <Notice title="Shopify wordt bijgewerkt">
              De cijfers van vandaag kunnen een paar minuten achterlopen.
            </Notice>
          </State>
          <State label="good" align="stretch">
            <Notice tone="good" title="Klarna is gekoppeld">Disputen komen vanaf nu binnen onder Chargebacks.</Notice>
          </State>
          <State label="warn · met actie" align="stretch">
            <Notice
              tone="warn"
              title="De koppeling met Klarna verloopt over 6 dagen"
              action={<Button size="sm">Opnieuw koppelen</Button>}
            >
              Daarna komen er geen nieuwe disputen meer binnen.
            </Notice>
          </State>
          <State label="bad · weg te klikken" align="stretch">
            <Notice
              tone="bad"
              title="Chargeback #CB-2291 moet morgen 12:00 beantwoord zijn"
              onDismiss={() => undefined}
            >
              Zonder bewijs wint de klant het dispuut automatisch.
            </Notice>
          </State>
        </States>
      </Spec>

      <Spec
        id="states"
        title="Leeg en fout"
        name="EmptyState · ErrorState"
        file="ui/states.tsx"
        summary="Leeg zegt wat hier komt en hoe je het vult. Fout zegt wat er misging, wat nog wel werkt, en wat je kunt doen; de technische regel staat ingeklapt."
        also="common/empty-state, error boundaries"
      >
        <States cols={3}>
          <State label="Leeg, eerste keer" align="stretch">
            <EmptyState
              glyph={Inbox}
              title="Nog geen tickets"
              action={<Button size="sm" variant="primary">Inbox koppelen</Button>}
            >
              Koppel je e-mail of winkelchat, dan komen vragen van klanten hier binnen.
            </EmptyState>
          </State>
          <State label="Leeg, alles af" align="stretch">
            <EmptyState title="Niets dat op je wacht" size="sm">
              De agents handelden de rest af. Fijne middag.
            </EmptyState>
          </State>
          <State label="Fout" align="stretch">
            <ErrorState
              title="De tickets laden niet"
              detail="GET /v2/inbox · 500 · req_8f2c19"
              action={<Button size="sm" icon={<RotateCcw />}>Opnieuw proberen</Button>}
            >
              Je e-mail is niet kwijt; alleen deze lijst kon niet worden opgehaald.
            </ErrorState>
          </State>
        </States>
      </Spec>

      <Spec
        id="access"
        title="Geen toegang"
        anatomy={[
          "Slot: wat hier zou staan, mag deze rol niet",
          "De permissie die ontbreekt, als woorden",
          "Je rol, en welke rollen het wel hebben",
          "Toegang vragen, daarna Gevraagd"
        ]}
        use={[
          "Op de plek van de records of de actie die de rol niet mag zien of doen; de rest van de pagina blijft werken.",
          "Alleen lezen boven een pagina die de rol mag bekijken maar niet wijzigen, en dan zonder de knoppen die wijzigen."
        ]}
        avoid={["Een knop tonen die na een klik pas zegt dat het niet mag."]}
        name="Denied · ReadOnlyNotice · useAccess"
        file="ui/access.tsx"
        summary="Wat een pagina zegt als de rol iets niet mag: op de plek zelf, nooit over het werk heen. Leest de rol uit de demoweergave (view.ts), zoals de server dat later doet."
        also="access/denied.tsx, access/read-only-notice.tsx"
      >
        <States cols={3}>
          <State label="page · Financiën op de inbox" align="stretch">
            <Denied area="support" what="de inbox" size="section" as="financien" />
          </State>
          <State label="inline · in een sheet" align="stretch">
            <Denied area="chargebacks" need={3} size="inline" as="klantenservice" />
          </State>
          <State label="Alleen lezen" align="stretch">
            <ReadOnlyNotice area="orders" as="alleen-lezen" />
          </State>
        </States>
        <Rule>
          De rol komt uit de demoweergave in het avatarmenu, of uit <span className="figure">?rol=klantenservice</span>.
        </Rule>
      </Spec>

      <Spec
        id="skeleton"
        title="Laden"
        name="Skeleton · SkeletonText · SkeletonRow · Spinner"
        file="ui/skeleton.tsx · ui/spinner.tsx"
        summary="Laden heeft de vorm van wat komt, zodat de pagina niet verspringt. Een spinner alleen in een knop of naast een kort woord, nooit voor een hele pagina."
        also="components/skeleton.tsx, loading states"
      >
        <States cols={3}>
          <State label="SkeletonText" align="stretch">
            <Skeleton className="h-4 w-2/5" />
            <SkeletonText lines={3} />
          </State>
          <State label="SkeletonRow" align="stretch">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </State>
          <State label="Spinner">
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <Spinner /> Bijwerken…
            </span>
            <Button loading>Opslaan</Button>
          </State>
        </States>
      </Spec>

      <Spec
        id="progress"
        title="Voortgang"
        name="ProgressBar · Meter"
        file="ui/progress.tsx"
        summary="ProgressBar is werk dat loopt, met een getal als dat bekend is en een zwaai als het niet bekend is. Meter is een stand tegen een grens, zoals verbruik; bij 80% wordt hij oranje met een zin."
        also="components/progress.tsx, usage meters"
      >
        <States cols={2}>
          <State label="Bepaald, lopend" align="stretch">
            <LiveProgress />
          </State>
          <State label="Onbepaald" align="stretch">
            <ProgressBar label="Retourredenen lezen" detail="Kan een minuut duren" />
          </State>
          <State label="Meter · binnen de grens" align="stretch">
            <Meter label="Agent-runs deze maand" value={3120} max={10000} format={(n) => n.toLocaleString("nl-NL")} />
          </State>
          <State label="Meter · bijna vol" align="stretch">
            <Meter label="Agent-runs deze maand" value={9240} max={10000} format={(n) => n.toLocaleString("nl-NL")} />
          </State>
        </States>
        <Rule>Een meter op 100% is rood en zegt wat er dan gebeurt, niet alleen dat hij vol is.</Rule>
      </Spec>
    </KitSection>
  )
}
