import { MessageCircle, Sparkle } from "../../icons"

/* The website chat's widget as a shopper sees it, for previews: its own module, so a screen that shows it loads no data. */

export function WidgetPreview(
  { greeting, agent = false, store = "Northwind EU" }: { greeting: string; agent?: boolean; store?: string }
) {
  return (
    <div aria-hidden className="flex flex-col gap-2 rounded-lg bg-mist p-3">
      <div className="flex items-center gap-2 rounded-md bg-abyss px-3 py-2 text-mesh-ink text-sm">
        <MessageCircle className="size-3.5" strokeWidth={1.75} />
        {store}
        {agent
          ? (
            <span className="ml-auto flex items-center gap-1 text-mesh-ink-2 text-xs">
              <Sparkle className="size-3" strokeWidth={1.75} />antwoordt meteen
            </span>
          )
          : null}
      </div>
      <p className="max-w-[80%] rounded-lg bg-paper px-3 py-2 text-ink text-sm">{greeting}</p>
      <div className="rounded-md bg-paper px-3 py-2 text-ink-3 text-sm">Typ een bericht</div>
    </div>
  )
}
