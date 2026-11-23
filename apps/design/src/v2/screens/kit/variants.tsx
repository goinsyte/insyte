import { FAB, FabFace, LogoMark, VariantsPanel } from "../../shell/variants.tsx"
import { cx } from "../../ui/cx.ts"
import { PopoverPanel } from "../../ui/popover.tsx"
import { LOGO_OPTIONS, useVariant } from "../../variants.ts"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"

/*
 * Varianten: the floating panel that lets the founder compare versions of his own direction on
 * every screen at once. The panel on this sheet is the real one: what you pick here changes the
 * whole app, as it does from the button.
 */

export function Variants() {
  const { direction } = useVariant()
  return (
    <KitSection
      id="varianten"
      title="Varianten"
      second="Je eigen richting, in versies naast elkaar"
      intro="Eén knop rechtsonder op elke pagina. Wat je kiest geldt meteen voor de hele app, blijft bewaard en staat in de link, zodat je precies deze versie kunt doorsturen."
    >
      <Spec
        id="variants"
        title="Varianten"
        anatomy={[
          "Knop: rond, rechtsonder; een stip in het accent als er een variant aan staat",
          "Regel: wat er nu aan staat, in woorden",
          "Kleurrichting, accent, iconenbalk, hoofdbalk, weergave, dichtheid, logo",
          "Link kopiëren en Terug naar standaard"
        ]}
        use={[
          "Om richtingen te vergelijken op echte schermen, niet op een merkbord.",
          "Een link met ?v= opent precies die variant, ook als je zelf iets anders bewaard had."
        ]}
        avoid={[
          "Als instelling voor klanten: die kiezen hun accent in het avatarmenu.",
          "Een variant per scherm: elke keuze is één attribuut op de pagina."
        ]}
        name="VariantsButton · VariantsPanel · VariantMark"
        file="shell/variants.tsx · variants.ts"
        summary="Zet kleuren, balken, dichtheid en logo om voor de hele app, zonder dat een scherm het weet."
        also="nieuw in v2"
      >
        <States cols={3}>
          <State label="knop · standaard" inert>
            <span className={cx("relative", FAB)}>
              <FabFace on={false} />
            </span>
          </State>
          <State label="knop · variant aan" inert>
            <span className={cx("relative", FAB)}>
              <FabFace on />
            </span>
          </State>
          <State label="logo's in de huidige richting" surface="rail">
            {LOGO_OPTIONS.filter((o) => o.value !== "winkel").map((o) => (
              <span
                key={o.value}
                title={o.label}
                className={cx(
                  "inline-flex size-8 items-center justify-center rounded-sm",
                  o.value !== "insyte-mono" && "bg-mark-ground"
                )}
              >
                <LogoMark logo={o.value} direction={direction} size={o.value === "insyte-mono" ? 32 : 26} />
              </span>
            ))}
          </State>
          <State label="paneel · werkt echt" align="start" span="full">
            <PopoverPanel label="Varianten" width="w-[22rem] max-w-full">
              <VariantsPanel />
            </PopoverPanel>
          </State>
        </States>
        <Rule>
          Elke keuze is een token of een attribuut op de pagina. Een richting zet het accent, het verloop van Magnus en
          de kleuren van de tekens; blauw en violet blijven in het verloop en komen nooit in de schermen.
        </Rule>
      </Spec>
    </KitSection>
  )
}
