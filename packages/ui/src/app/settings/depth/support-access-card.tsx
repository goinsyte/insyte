import { Switch } from "../../../components/switch"
import { Eye } from "../../../icons"
import { cn } from "../../lib/utils"
import { SettingCard } from "../setting-card"
import type { SupportAccessHere } from "./source"

const when = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

/**
 * Insyte-support mag meekijken (M18), under Gegevens en privacy: the owner lets Insyte's team look along, read-only,
 * for a few days; it goes off by itself. Every member sees while a session is on (the frame's line), and every
 * session, read and end is in the Logboek.
 */
export function SupportAccessCard({ support }: { support: SupportAccessHere }) {
  const on = support.until !== null && new Date(support.until).getTime() > Date.now()
  return (
    <SettingCard
      title="Insyte-support mag meekijken"
      icon={Eye}
      subtitle={`Zet dit aan als je wilt dat Insyte-support je werkruimte bekijkt om je te helpen. Alleen lezen: support kan niets wijzigen, exporteren of verwijderen en ziet geen wachtwoorden of sleutels. Het gaat na ${support.days} dagen vanzelf uit. Elke keer dat support meekijkt, staat in het Logboek.`}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-paper p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        <span className={cn("size-2", on ? "bg-signal-green" : "bg-ink-4")} aria-hidden />
        <span className="min-w-0 flex-1 text-ink text-sm">
          <span className="font-medium">{on ? `Aan tot ${when(support.until!)}.` : "Uit."}</span>{" "}
          {support.sessionEndsAt !== null
            ? <span className="text-ink-2">Support kijkt nu mee, tot {when(support.sessionEndsAt)}.</span>
            : on
            ? <span className="text-ink-2">Support kijkt nu niet mee.</span>
            : <span className="text-ink-2">Support kan je werkruimte niet bekijken.</span>}
        </span>
        <label
          className="flex items-center gap-2 text-ink-2 text-sm"
          title={support.canChange ? undefined : "Alleen de eigenaar kan dit aan- of uitzetten"}
        >
          <Switch
            checked={on}
            onCheckedChange={(next) => support.setOn(next)}
            disabled={!support.canChange || support.changing}
            aria-label="Insyte-support mag meekijken"
          />
          {on ? "Aan" : "Uit"}
        </label>
      </div>
    </SettingCard>
  )
}
