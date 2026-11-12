import { useState } from "react"
import {
  Archive,
  FileText,
  MessageSquareText,
  RotateCcw,
  Sheet as SheetIcon,
  Ticket,
  Trash2,
  User,
  Workflow
} from "../../../icons"
import type { IconComponent } from "../../../icons"
import { ConfirmDialog } from "../../common/confirm-dialog"
import { EmptyState } from "../../common/empty-state"
import { formatRelative } from "../../lib/format"
import { TRASH_DAYS, type TrashItem } from "../../lib/settings-depth"
import { undoable } from "../../lib/undo"
import { cn } from "../../lib/utils"
import { useGate } from "../../stores/access-store"
import { useSettingsDepth } from "../../stores/settings-depth-store"
import { BandedList, SettingCard } from "../setting-card"

const KIND: Record<TrashItem["kind"], { icon: IconComponent; label: string }> = {
  ticket: { icon: Ticket, label: "Ticket" },
  klant: { icon: User, label: "Klant" },
  automatisering: { icon: Workflow, label: "Automatisering" },
  rekenblad: { icon: SheetIcon, label: "Rekenblad" },
  sjabloon: { icon: MessageSquareText, label: "Sjabloon" },
  notitie: { icon: FileText, label: "Notitie" }
}

const left = (at: string) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - Date.parse(at)) / 86_400_000))

/**
 * Prullenbak (`/settings/trash`, PLAN 43): what was deleted, for 30 days. Terugzetten puts it back
 * where it was (with Undo); Definitief verwijderen asks first, because after that it is gone.
 * Customers, orders and invoices follow Gegevens en privacy instead.
 */
export function TrashPage() {
  const trash = useSettingsDepth((s) => s.trash)
  const gate = useGate("settings", 2)
  const [gone, setGone] = useState<TrashItem[] | null>(null)
  const restore = (items: TrashItem[]) =>
    undoable(
      items.length === 1 ? `“${items[0]!.title}” teruggezet` : `${items.length} items teruggezet`,
      useSettingsDepth.getState().restore(items.map((i) => i.id)),
      "Het staat weer waar het stond."
    )
  return (
    <>
      <SettingCard
        title={`Verwijderd, de laatste ${TRASH_DAYS} dagen`}
        icon={Archive}
        subtitle="Na 30 dagen verdwijnt een item vanzelf. Tot die tijd zet je het met een klik terug."
        action={trash.length && gate.ok ?
          (
            <button
              type="button"
              onClick={() => setGone(trash)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-signal-red text-xs hover:bg-signal-red-bg"
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
              Prullenbak legen
            </button>
          ) :
          null}
      >
        {trash.length === 0 ?
          (
            <EmptyState
              kind="activity"
              title="De prullenbak is leeg."
              body="Wat je verwijdert, staat hier nog 30 dagen."
            />
          ) :
          (
            <BandedList>
              {trash.map((t) => {
                const K = KIND[t.kind]
                const days = left(t.at)
                return (
                  <li key={t.id} className="flex min-h-14 flex-wrap items-center gap-3 px-3.5 py-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-mist text-ink-2">
                      <K.icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-base text-ink">{t.title}</span>
                      <span className="truncate text-ink-3 text-sm">
                        {K.label} · verwijderd door {t.by} · {formatRelative(t.at)}
                      </span>
                    </span>
                    <span className="flex w-28 flex-col gap-1">
                      <span
                        className={cn("text-xs tabular-nums", days <= 3 ? "font-medium text-signal-red" : "text-ink-3")}
                      >
                        nog {days} {days === 1 ? "dag" : "dagen"}
                      </span>
                      <span className="block h-1 overflow-hidden rounded-full bg-ink/8">
                        <span
                          className={cn("block h-full rounded-full", days <= 3 ? "bg-signal-red" : "bg-ink-3")}
                          style={{ width: `${(days / TRASH_DAYS) * 100}%` }}
                        />
                      </span>
                    </span>
                    {gate.ok ?
                      (
                        <span className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => restore([t])}
                            className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover"
                          >
                            <RotateCcw className="size-3.5" strokeWidth={1.75} />
                            Terugzetten
                          </button>
                          <button
                            type="button"
                            aria-label={`${t.title} definitief verwijderen`}
                            title="Definitief verwijderen"
                            onClick={() => setGone([t])}
                            className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-signal-red-bg hover:text-signal-red"
                          >
                            <Trash2 className="size-3.5" strokeWidth={1.75} />
                          </button>
                        </span>
                      ) :
                      null}
                  </li>
                )
              })}
            </BandedList>
          )}
      </SettingCard>
      <ConfirmDialog
        open={gone !== null}
        onOpenChange={(v) => !v && setGone(null)}
        tone="destructive"
        title={gone && gone.length > 1 ? `${gone.length} items definitief verwijderen?` : "Definitief verwijderen?"}
        description={gone && gone.length === 1
          ? `“${gone[0]!.title}” is daarna weg en komt niet terug.`
          : "Alles in de prullenbak is daarna weg en komt niet terug."}
        confirmLabel="Definitief verwijderen"
        onConfirm={() => {
          useSettingsDepth.getState().purge((gone ?? []).map((g) => g.id))
          setGone(null)
        }}
      />
    </>
  )
}
