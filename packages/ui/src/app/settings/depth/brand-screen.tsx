import { useRef } from "react"
import { toast } from "sonner"
import { MessageCircle, Palette, Upload, X } from "../../../icons"
import { contrast, isHex } from "../../lib/settings-depth"
import { cn } from "../../lib/utils"
import { Segmented } from "../../team/bits"
import { FieldRow, UnsavedBar } from "../form"
import { SettingCard } from "../setting-card"
import { useSection, WELL } from "./kit"
import { useSettingsDepthSource } from "./source"

const FONT_STACK = {
  Systeem: "system-ui, sans-serif",
  Inter: "Inter, system-ui, sans-serif",
  Georgia: "Georgia, serif"
} as const

/**
 * Huisstijl (`/settings/brand`, PLAN 43): what the customer sees of the shop in mail, on the
 * website chat and on the returns portal. The colour is checked against white as it is set,
 * because a brand colour on a button is text on a colour, and it has to read.
 */
export function BrandPage() {
  const s = useSection("brand", "Huisstijl", (a, b) => {
    const out: Array<[string, string, string]> = []
    if (a.color !== b.color) out.push(["Merkkleur", a.color, b.color])
    if (a.logo !== b.logo) out.push(["Logo", a.logo ? "eigen logo" : "geen", b.logo ? "nieuw logo" : "geen"])
    if (a.font !== b.font) out.push(["Lettertype in mails", a.font, b.font])
    if (a.sender !== b.sender) out.push(["Afzendernaam", a.sender, b.sender])
    if (a.website !== b.website) out.push(["Website", a.website, b.website])
    if (a.support !== b.support) out.push(["Supportadres", a.support, b.support])
    if (a.widget !== b.widget) {
      out.push(["Chatvenster", a.widget === "right" ? "rechts" : "links", b.widget === "right" ? "rechts" : "links"])
    }
    return out
  })
  const upload = useSettingsDepthSource().uploadLogo
  const d = s.draft
  const file = useRef<HTMLInputElement>(null)
  const hexOk = isHex(d.color)
  const ratio = hexOk ? contrast(d.color, "#ffffff") : 0
  const color = hexOk ? d.color : "#1F3A5F"
  const set = (p: Partial<typeof d>) => s.setDraft({ ...d, ...p })
  const pick = (f: File | undefined) => {
    if (!f) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) {
      return void toast("Dat is geen logo", { description: "Kies een PNG, JPG, WebP of SVG." })
    }
    if (f.size > 400_000) {
      return void toast("Dat logo is te groot", {
        description: "Kies er een tot 400 kB; het staat klein in mails en de chat."
      })
    }
    if (upload) {
      void upload(f).then((logo) => {
        if (logo !== undefined) s.setDraft((x) => ({ ...x, logo }))
      })
      return
    }
    const r = new FileReader()
    r.addEventListener("load", () => set({ logo: String(r.result) }), { once: true })
    r.readAsDataURL(f)
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-8">
          <SettingCard title="Merk" icon={Palette} subtitle="In mails, het chatvenster en het retourportaal.">
            <div className="flex flex-col">
              <FieldRow label="Logo" hint="PNG, JPG, WebP of SVG, tot 400 kB. Liggend werkt het best.">
                <span className="flex items-center gap-2">
                  <span className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-md bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_7%,transparent)]">
                    {d.logo
                      ? <img src={d.logo} alt="Logo" className="max-h-10 max-w-24 object-contain" />
                      : <span className="font-medium text-sm" style={{ color }}>{d.sender}</span>}
                  </span>
                  <button
                    type="button"
                    disabled={!s.canEdit}
                    onClick={() => file.current?.click()}
                    className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover"
                  >
                    <Upload className="size-3.5" strokeWidth={1.75} />
                    Kiezen
                  </button>
                  {d.logo ?
                    (
                      <button
                        type="button"
                        aria-label="Logo weghalen"
                        onClick={() => set({ logo: undefined })}
                        className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
                      >
                        <X className="size-3.5" strokeWidth={1.75} />
                      </button>
                    ) :
                    null}
                  <input
                    ref={file}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => pick(e.target.files?.[0])}
                  />
                </span>
              </FieldRow>
              <FieldRow label="Merkkleur" hint="Voor knoppen en links. Witte tekst moet erop te lezen zijn.">
                <span className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      disabled={!s.canEdit}
                      onChange={(e) => set({ color: e.target.value.toUpperCase() })}
                      aria-label="Kleur kiezen"
                      className="h-9 w-11 cursor-pointer rounded-md bg-transparent p-0.5"
                    />
                    <input
                      value={d.color}
                      disabled={!s.canEdit}
                      onChange={(e) => set({ color: e.target.value })}
                      aria-label="Hexcode"
                      aria-invalid={!hexOk}
                      className={cn(WELL, "w-32 tabular-nums aria-[invalid=true]:bg-signal-red-bg")}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      !hexOk ? "text-signal-red" : ratio >= 4.5 ? "text-ink-2" : "text-signal-red"
                    )}
                  >
                    {!hexOk
                      ? "Een kleur als #1F3A5F."
                      : ratio >= 4.5
                      ? `Contrast met wit ${ratio.toFixed(1).replace(".", ",")}:1, goed leesbaar op knoppen.`
                      : `Contrast met wit ${
                        ratio.toFixed(1).replace(".", ",")
                      }:1. Dat is te licht voor witte tekst; kies een donkerdere tint.`}
                  </span>
                </span>
              </FieldRow>
              <FieldRow label="Lettertype in mails">
                <Segmented
                  label="Lettertype"
                  value={d.font}
                  onChange={(font) => set({ font })}
                  options={[{ id: "Systeem", label: "Systeem" }, { id: "Inter", label: "Inter" }, {
                    id: "Georgia",
                    label: "Georgia"
                  }]}
                />
              </FieldRow>
            </div>
          </SettingCard>
          <SettingCard title="Afzender" subtitle="Wie de mail stuurt en waar een antwoord heen gaat.">
            <div className="flex flex-col">
              <FieldRow label="Afzendernaam">
                <input
                  value={d.sender}
                  disabled={!s.canEdit}
                  onChange={(e) => set({ sender: e.target.value })}
                  aria-label="Afzendernaam"
                  className={WELL}
                />
              </FieldRow>
              <FieldRow label="Website">
                <input
                  value={d.website}
                  disabled={!s.canEdit}
                  onChange={(e) => set({ website: e.target.value })}
                  aria-label="Website"
                  inputMode="url"
                  className={WELL}
                />
              </FieldRow>
              <FieldRow label="Supportadres" hint="Staat onder elke mail en in het retourportaal.">
                <input
                  value={d.support}
                  disabled={!s.canEdit}
                  onChange={(e) => set({ support: e.target.value })}
                  aria-label="Supportadres"
                  type="email"
                  className={WELL}
                />
              </FieldRow>
              <FieldRow label="Chatvenster op de website">
                <Segmented
                  label="Chatvenster"
                  value={d.widget}
                  onChange={(widget) => set({ widget })}
                  options={[{ id: "right", label: "Rechtsonder" }, { id: "left", label: "Linksonder" }]}
                />
              </FieldRow>
            </div>
          </SettingCard>
        </div>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
          <h2 className="font-medium text-ink text-md">Voorbeeld</h2>
          <div
            className="overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
            style={{ fontFamily: FONT_STACK[d.font] }}
          >
            <div
              className="flex h-14 items-center px-5"
              style={{ background: `color-mix(in oklch, ${color} 8%, white)` }}
            >
              {d.logo
                ? <img src={d.logo} alt="" className="max-h-8 max-w-32 object-contain" />
                : <span className="font-medium" style={{ color }}>{d.sender}</span>}
            </div>
            <div className="flex flex-col gap-3 p-5 text-md text-ink leading-[1.55]">
              <p>Hoi Lena, je retour is goedgekeurd. Print het label en breng het pakket naar een PostNL-punt.</p>
              <span
                className="w-fit rounded-md px-3.5 py-2 font-medium text-sm text-white"
                style={{ background: color }}
              >
                Label downloaden
              </span>
              <p className="text-ink-3 text-xs">
                {d.sender} · {d.website.replace(/^https?:\/\//, "")} · {d.support}
              </p>
            </div>
          </div>
          <div className="relative h-36 overflow-hidden rounded-xl bg-mist">
            <span className="absolute top-3 left-4 text-ink-3 text-xs">Je website</span>
            <div
              className={cn(
                "absolute bottom-3 flex flex-col items-end gap-2",
                d.widget === "right" ? "right-3" : "left-3 items-start"
              )}
            >
              <span className="max-w-44 rounded-lg bg-paper px-3 py-2 text-ink text-xs shadow-[0_2px_8px_rgb(0_0_0/0.08)]">
                Hoi, waar kan ik je mee helpen?
              </span>
              <span
                className="flex size-10 items-center justify-center rounded-full text-white"
                style={{ background: color }}
              >
                <MessageCircle className="size-4" strokeWidth={1.75} />
              </span>
            </div>
          </div>
        </aside>
      </div>
      <UnsavedBar
        visible={s.dirty && s.canEdit && hexOk}
        onDiscard={s.discard}
        onSave={() =>
          s.save("Huisstijl opgeslagen", "Nieuwe mails, de chat en het retourportaal gebruiken hem meteen.")}
      />
    </>
  )
}
