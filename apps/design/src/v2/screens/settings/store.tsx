import { useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import {
  BRAND,
  DOMAIN,
  relative,
  RESOLUTION_LABEL,
  RETURN_SETTINGS,
  SHIP_STATUSES,
  SHOW_LABEL,
  TEMPLATE_FIELDS,
  TEMPLATE_LINKS
} from "../../fixtures/settings.ts"
import type { DnsRecord, ShipStatus } from "../../fixtures/settings.ts"
import { Link, paths } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { FileDrop } from "../../ui/file-drop.tsx"
import { ExternalLink, Mail, Plus, RefreshCcw, Trash } from "../../ui/icons.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { PageSection } from "../../ui/page.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { useView } from "../../view.ts"
import { CopyValue, SaveBar, SettingsPage, useDraft, useSaved } from "./parts.tsx"

const removeButton = (label: string, onClick: () => void) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
  >
    <Trash size={15} />
  </button>
)

/* ── Retouren ──────────────────────────────────────────────────────────────────────────────────── */

type ReturnDraft = {
  returnDays: string
  claimDays: string
  windows: ReadonlyArray<{ id: string; label: string; days: number; from: string; to: string }>
  reasons: ReadonlyArray<{ id: string; label: string; claim: boolean; photo: boolean; quality: boolean; days?: number }>
  rules: ReadonlyArray<{ id: string; target: string; href?: string; kind: string; note: string }>
  offered: ReadonlyArray<string>
  giftCardBonus: string
  exchangeFee: string
  addresses: ReadonlyArray<{ country: string; label: string; address: string; carrier: string }>
  portal: boolean
  intro: string
  done: string
}

/**
 * Retouren: how long a customer may return or claim, the reasons they choose from, products that
 * cannot come back, what they may get instead, where parcels go, and the portal that asks for it all.
 * The returns themselves live under Retouren. The current demo's `settings/returns`.
 */
export function ReturnsSettingsScreen() {
  const view = useView()
  const { edit } = useAccess("settings")
  const r = RETURN_SETTINGS
  const form = useDraft<ReturnDraft>("returns", {
    returnDays: String(r.returnDays),
    claimDays: String(r.claimDays),
    windows: r.specialWindows.map((w) => ({ ...w })),
    reasons: r.reasons.map((x) => ({ ...x })),
    rules: r.rules.map((x) => ({ ...x })),
    offered: [...r.offered],
    giftCardBonus: String(r.giftCardBonus),
    exchangeFee: String(r.exchangeFee),
    addresses: r.addresses.map((a) => ({ ...a })),
    portal: view.staat !== "leeg",
    intro: r.portal.intro,
    done: r.portal.done
  })
  const [addingRule, setAddingRule] = useState(false)
  const [addingAddress, setAddingAddress] = useState(false)
  const d = form.draft
  const valid = Number(d.returnDays) > 0 && Number(d.claimDays) > 0
  const save = () => {
    if (!valid) {
      toast({ title: "Een termijn is een aantal dagen, meer dan 0", tone: "bad" })
      return
    }
    form.commit()
    toast({ title: "Retourinstellingen opgeslagen", body: "Het portaal gebruikt ze meteen.", tone: "good" })
  }
  const footer = <SaveBar disabled={!edit} dirty={form.dirty} onSave={save} onReset={form.reset} />
  const removeRule = (id: string) => {
    const rule = d.rules.find((x) => x.id === id)
    form.patch({ rules: d.rules.filter((x) => x.id !== id) })
    toast({
      title: "Regel verwijderd",
      body: "Nog niet opgeslagen.",
      action: rule === undefined
        ? undefined
        : { label: "Ongedaan maken", onClick: () => form.set((f) => ({ ...f, rules: [...f.rules, rule] })) }
    })
  }
  const removeAddress = (country: string) => {
    const addr = d.addresses.find((x) => x.country === country)
    form.patch({ addresses: d.addresses.filter((x) => x.country !== country) })
    toast({
      title: "Adres verwijderd",
      body: "Nog niet opgeslagen.",
      action: addr === undefined
        ? undefined
        : { label: "Ongedaan maken", onClick: () => form.set((f) => ({ ...f, addresses: [...f.addresses, addr] })) }
    })
  }

  return (
    <SettingsPage
      title="Retouren"
      area="settings"
      what="de retourinstellingen"
      meta="Wat een klant mag terugsturen, wanneer, en wat hij ervoor terugkrijgt"
      actions={<ButtonLink size="sm" variant="ghost" to={paths.returns}>Naar de retouren</ButtonLink>}
    >
      <SettingsSection
        id="termijnen"
        title="Termijnen"
        description="Na bezorging. Een claim is voor een artikel dat beschadigd of verkeerd aankwam."
        footer={footer}
      >
        <SettingRow
          title="Retourtermijn"
          htmlFor="return-days"
          control={
            <Input
              id="return-days"
              inputMode="numeric"
              suffix="dagen"
              className="w-32"
              disabled={!edit}
              value={d.returnDays}
              onChange={(e) => form.patch({ returnDays: e.target.value })}
            />
          }
        />
        <SettingRow
          title="Claimtermijn"
          htmlFor="claim-days"
          control={
            <Input
              id="claim-days"
              inputMode="numeric"
              suffix="dagen"
              className="w-32"
              disabled={!edit}
              value={d.claimDays}
              onChange={(e) => form.patch({ claimDays: e.target.value })}
            />
          }
        />
        {d.windows.map((w) => (
          <SettingRow
            key={w.id}
            title={w.label}
            description={`${w.days} dagen voor bestellingen van ${w.from} tot ${w.to}`}
            control={edit
              ? removeButton(
                `${w.label} verwijderen`,
                () => form.patch({ windows: d.windows.filter((x) => x.id !== w.id) })
              )
              : undefined}
          />
        ))}
        {edit && (
          <div className="pb-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              onClick={() =>
                form.patch({
                  windows: [...d.windows, {
                    id: `w${d.windows.length + 1}`,
                    label: "Zomeractie",
                    days: 45,
                    from: "1 jul",
                    to: "31 aug"
                  }]
                })}
            >
              Speciale termijn
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="redenen"
        title="Redenen"
        description="Waaruit de klant kiest. Bij een claim vraagt het portaal om foto's."
        footer={footer}
      >
        <Table label="Redenen" minWidth={520}>
          <THead>
            <Th>Reden</Th>
            <Th>Soort</Th>
            <Th>Foto verplicht</Th>
            <Th>Naar kwaliteit</Th>
          </THead>
          <TBody>
            {d.reasons.map((x) => (
              <Tr key={x.id}>
                <Td header>
                  {x.label}
                  {x.days === undefined ? "" : <span className="text-ink-3">· {x.days} dagen</span>}
                </Td>
                <Td muted>{x.claim ? "Claim" : "Retour"}</Td>
                <Td>
                  <Toggle
                    label={`Foto verplicht bij ${x.label}`}
                    disabled={!edit}
                    on={x.photo}
                    onChange={(on) =>
                      form.patch({ reasons: d.reasons.map((y) => (y.id === x.id ? { ...y, photo: on } : y)) })}
                  />
                </Td>
                <Td>
                  <Toggle
                    label={`${x.label} naar kwaliteit`}
                    disabled={!edit}
                    on={x.quality}
                    onChange={(on) =>
                      form.patch({ reasons: d.reasons.map((y) => (y.id === x.id ? { ...y, quality: on } : y)) })}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </SettingsSection>

      <SettingsSection
        id="regels"
        title="Productregels"
        description="Wat niet terug kan, of alleen tegen geld."
        footer={footer}
      >
        <List divided label="Productregels" className="pb-2">
          {d.rules.map((x) => (
            <ListRow
              key={x.id}
              padded={false}
              title={x.href === undefined ? x.target : <Link to={x.href} className="hover:underline">{x.target}</Link>}
              meta={`${x.kind} · ${x.note}`}
              trail={edit ? removeButton(`Regel voor ${x.target} verwijderen`, () => removeRule(x.id)) : undefined}
            />
          ))}
        </List>
        {edit && (
          <div className="pb-2">
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAddingRule(true)}>
              Regel toevoegen
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="oplossingen"
        title="Oplossingen"
        description="Wat de klant mag kiezen in plaats van zijn geld."
        footer={footer}
      >
        <div className="flex flex-col gap-3 py-3">
          {Object.entries(RESOLUTION_LABEL).map(([id, label]) => (
            <Checkbox
              key={id}
              label={label}
              disabled={!edit || id === "refund"}
              description={id === "refund" ? "Kan altijd; zo wil de wet het." : undefined}
              checked={d.offered.includes(id)}
              onChange={(on) => form.patch({ offered: on ? [...d.offered, id] : d.offered.filter((x) => x !== id) })}
            />
          ))}
        </div>
        <SettingRow
          title="Bonus op een cadeaubon"
          htmlFor="gift-bonus"
          description="Bovenop het bedrag, als de klant een cadeaubon kiest."
          control={
            <Input
              id="gift-bonus"
              inputMode="numeric"
              suffix="%"
              className="w-28"
              disabled={!edit}
              value={d.giftCardBonus}
              onChange={(e) => form.patch({ giftCardBonus: e.target.value })}
            />
          }
        />
        <SettingRow
          title="Ruilkosten"
          htmlFor="exchange-fee"
          description="0 is gratis ruilen."
          control={
            <Input
              id="exchange-fee"
              inputMode="decimal"
              prefix="€"
              className="w-28"
              disabled={!edit}
              value={d.exchangeFee}
              onChange={(e) => form.patch({ exchangeFee: e.target.value })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        id="adressen"
        title="Adressen en vervoerders"
        description="Waar een retour heen gaat, per land."
        footer={footer}
      >
        <List divided label="Retouradressen" className="pb-2">
          {d.addresses.map((a) => (
            <ListRow
              key={a.country}
              padded={false}
              title={a.label}
              meta={`${a.address} · ${a.carrier}`}
              trail={edit
                ? removeButton(`Adres voor ${a.label} verwijderen`, () => removeAddress(a.country))
                : undefined}
            />
          ))}
        </List>
        {edit && (
          <div className="pb-2">
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAddingAddress(true)}>
              Adres toevoegen
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="portaal"
        title="Retourportaal"
        description="Waar een klant zelf een retour of claim aanvraagt."
        footer={footer}
      >
        <SettingRow
          title={d.portal ? "Het portaal staat aan" : "Het portaal staat uit"}
          description={d.portal
            ? "Klanten vinden het via de link in hun verzendmail."
            : "Klanten mailen voor een retour; dat komt in de Inbox."}
          control={
            <Toggle
              label="Retourportaal"
              disabled={!edit}
              on={d.portal}
              onChange={(on) => form.patch({ portal: on })}
            />
          }
        />
        {d.portal && (
          <>
            <SettingRow
              title="Adres"
              control={
                <span className="flex items-center gap-2">
                  <CopyValue
                    value={`https://insyte.store${paths.returnPortal(r.portal.handle)}`}
                    shown={`…/retour/${r.portal.handle}`}
                    label="Portaallink"
                  />
                  <ButtonLink
                    size="sm"
                    variant="ghost"
                    icon={<ExternalLink />}
                    to={paths.returnPortal(r.portal.handle)}
                  >
                    Bekijken
                  </ButtonLink>
                </span>
              }
            />
            <div className="flex flex-col gap-4 py-3">
              <Field label="Welkomsttekst">
                {(c) => (
                  <Textarea
                    {...c}
                    rows={2}
                    disabled={!edit}
                    value={d.intro}
                    onChange={(e) => form.patch({ intro: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Als de aanvraag binnen is">
                {(c) => (
                  <Textarea
                    {...c}
                    rows={3}
                    disabled={!edit}
                    value={d.done}
                    onChange={(e) => form.patch({ done: e.target.value })}
                  />
                )}
              </Field>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-ink">Stappen bij een claim</p>
                <ol className="list-decimal pl-5 text-sm text-ink-2">
                  {r.claimSteps.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </div>
            </div>
          </>
        )}
      </SettingsSection>

      <RuleDialog
        open={addingRule}
        onClose={() => setAddingRule(false)}
        onAdd={(rule) => {
          form.patch({ rules: [...d.rules, rule] })
          setAddingRule(false)
        }}
      />
      <AddressDialog
        open={addingAddress}
        onClose={() => setAddingAddress(false)}
        onAdd={(addr) => {
          form.patch({ addresses: [...d.addresses, addr] })
          setAddingAddress(false)
        }}
      />
    </SettingsPage>
  )
}

function RuleDialog({ open, onClose, onAdd }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly onAdd: (rule: { id: string; target: string; kind: string; note: string }) => void
}) {
  const [target, setTarget] = useState("")
  const [kind, setKind] = useState("Niet retourneerbaar")
  const [note, setNote] = useState("")
  const [tried, setTried] = useState(false)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Regel toevoegen"
      description="Voor een product, een collectie of een label. Het portaal legt de klant uit waarom."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (target.trim() === "") return
              onAdd({
                id: `rule_${target.trim().toLowerCase().replace(/\W+/g, "_")}`,
                target: target.trim(),
                kind,
                note: note.trim()
              })
              setTarget("")
              setNote("")
              setTried(false)
            }}
          >
            Toevoegen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Product, collectie of label"
          error={tried && target.trim() === "" ? "Kies waar de regel voor geldt" : undefined}
        >
          {(c) => (
            <Input
              {...c}
              placeholder="Label “ondergoed”"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          )}
        </Field>
        <Field label="Regel">
          {(c) => (
            <Select {...c} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option>Niet retourneerbaar</option>
              <option>Alleen geld terug</option>
              <option>Alleen ruilen</option>
            </Select>
          )}
        </Field>
        <Field label="Uitleg voor de klant" optional>
          {(c) => <Input {...c} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

function AddressDialog({ open, onClose, onAdd }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly onAdd: (addr: { country: string; label: string; address: string; carrier: string }) => void
}) {
  const [label, setLabel] = useState("")
  const [address, setAddress] = useState("")
  const [carrier, setCarrier] = useState("PostNL")
  const [tried, setTried] = useState(false)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adres toevoegen"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (label.trim() === "" || address.trim() === "") return
              onAdd({
                country: label.trim().slice(0, 2).toUpperCase(),
                label: label.trim(),
                address: address.trim(),
                carrier
              })
              setLabel("")
              setAddress("")
              setTried(false)
            }}
          >
            Toevoegen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Voor welke landen" error={tried && label.trim() === "" ? "Vul in voor welke landen" : undefined}>
          {(c) => (
            <Input
              {...c}
              placeholder="Spanje en Portugal"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          )}
        </Field>
        <Field label="Adres" error={tried && address.trim() === "" ? "Vul het adres in" : undefined}>
          {(c) => <Textarea {...c} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <Field label="Vervoerder">
          {(c) => (
            <Select {...c} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              {["PostNL", "DHL", "DPD", "UPS", "GLS"].map((x) => <option key={x}>{x}</option>)}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  )
}

const say = (label: string) => label.replaceAll("{vervoerder}", "PostNL")

/* ── Verzending ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Verzending: per carrier status the sentence the customer reads, and where. The preview shows an
 * order's timeline and what the customer agent answers to "waar is mijn pakket?". The current demo's
 * `settings/shipping`.
 */
export function ShippingScreen() {
  const { edit } = useAccess("settings")
  const form = useDraft<ReadonlyArray<ShipStatus>>("shipping", SHIP_STATUSES)
  const [preview, setPreview] = useState("local")
  const shown = form.draft.find((s) => s.id === preview) ?? form.draft[0]
  const set = (id: string, next: Partial<ShipStatus>) =>
    form.set(form.draft.map((s) => (s.id === id ? { ...s, ...next } : s)))
  const timeline = form.draft.filter((s) => s.show === "all" && ["info", "local", "transit", "out"].includes(s.id))

  return (
    <SettingsPage
      title="Verzending"
      width="record"
      area="settings"
      what="de verzendinstellingen"
      meta="Wat de klant leest terwijl zijn pakket onderweg is"
      actions={<ButtonLink size="sm" variant="ghost" to={paths.orders}>Naar de bestellingen</ButtonLink>}
    >
      <SettingsSection
        id="zinnen"
        title="Wat de klant leest"
        description="Per status van de vervoerder de zin die de klant ziet. {vervoerder} wordt de naam van de vervoerder."
        footer={
          <SaveBar
            disabled={!edit}
            dirty={form.dirty}
            onReset={form.reset}
            onSave={() => {
              form.commit()
              toast({
                title: "Verzendstatussen opgeslagen",
                body: "Klanten lezen de nieuwe zinnen vanaf de volgende update van hun zending.",
                tone: "good"
              })
            }}
          />
        }
      >
        <Table label="Verzendstatussen" minWidth={720}>
          <THead>
            <Th>Status van de vervoerder</Th>
            <Th>Wat de klant leest</Th>
            <Th>Waar</Th>
          </THead>
          <TBody>
            {form.draft.map((s) => (
              <Tr key={s.id} selected={s.id === preview} onOpen={() => setPreview(s.id)}>
                <Td header>
                  <span className="flex flex-col">
                    <span>{s.carrier}</span>
                    <span className="text-xs text-ink-3">
                      <span className="figure">{s.orders}</span> bestellingen nu
                    </span>
                  </span>
                </Td>
                <Td>
                  <Input
                    aria-label={`Wat de klant leest bij ${s.carrier}`}
                    disabled={!edit}
                    value={s.label}
                    onFocus={() => setPreview(s.id)}
                    onChange={(e) => set(s.id, { label: e.target.value })}
                  />
                </Td>
                <Td>
                  <Select
                    aria-label={`Waar bij ${s.carrier}`}
                    disabled={!edit}
                    className="w-52"
                    value={s.show}
                    onChange={(e) => set(s.id, { show: e.target.value as ShipStatus["show"] })}
                  >
                    {(Object.keys(SHOW_LABEL) as Array<ShipStatus["show"]>).map((k) => (
                      <option key={k} value={k}>{SHOW_LABEL[k]}</option>
                    ))}
                  </Select>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </SettingsSection>

      <PageSection id="voorbeeld" title="Zo ziet de klant het" meta={shown?.carrier}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-lg bg-well px-5 py-4">
            <p className="text-sm font-semibold text-ink">Bestelling #12218</p>
            <p className="text-sm text-ink">
              {shown === undefined || shown.show === "hidden" ? "Verzonden" : say(shown.label)}
            </p>
            <ol className="flex flex-col gap-1.5 border-l border-line pl-3">
              {timeline.map((s) => <li key={s.id} className="text-xs text-ink-2">{say(s.label)}</li>)}
            </ol>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-well px-5 py-4">
            <p className="text-xs text-ink-3">De klantagent op “waar is mijn pakket?”</p>
            <p className="text-sm text-ink">
              Je bestelling #12218 is nu:{" "}
              {shown === undefined ? "" : say(shown.label).toLowerCase()}. De laatste scan was vanochtend om 06:14.
            </p>
          </div>
        </div>
      </PageSection>

      <SettingsSection id="volgen" title="Volgen">
        <SettingRow
          title="17TRACK"
          description={`Niet gekoppeld · nu leest ${ASSISTANT} de statussen uit Shopify, die minder vaak bijwerken.`}
          control={<ButtonLink size="sm" to={paths.marketplace}>Koppelen</ButtonLink>}
        />
      </SettingsSection>
    </SettingsPage>
  )
}

/* ── Sjablonen ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Sjablonen: the fixed links templates insert with a variable (the review page, unsubscribe, back in
 * stock), and one template as the customer gets it. The templates themselves are written in the
 * Inbox. The current demo's `settings/templates`.
 */
export function TemplatesScreen() {
  const { edit } = useAccess("settings")
  const form = useDraft("templates", { ...TEMPLATE_LINKS })
  const bad = TEMPLATE_FIELDS.filter((f) =>
    form.draft[f.key].trim() !== "" && !/^https:\/\/\S+\.\S+/.test(form.draft[f.key].trim())
  )
  const review = form.draft.review.trim()
  return (
    <SettingsPage
      title="Sjablonen"
      area="settings"
      what="de sjablonen"
      meta="De vaste links die sjablonen gebruiken"
      actions={<ButtonLink size="sm" variant="ghost" to={paths.inbox}>Sjablonen in de Inbox</ButtonLink>}
    >
      <SettingsSection
        id="links"
        title="Vaste links"
        description="Een link per soort. Sjablonen gebruiken ze met de variabele ernaast."
        footer={
          <SaveBar
            disabled={!edit}
            dirty={form.dirty}
            onReset={form.reset}
            onSave={() => {
              if (bad.length > 0) {
                toast({ title: `${bad[0]?.label ?? "Een link"} moet met https:// beginnen`, tone: "bad" })
                return
              }
              form.commit()
              toast({ title: "Vaste links opgeslagen", body: "Sjablonen gebruiken vanaf nu deze links.", tone: "good" })
            }}
          />
        }
      >
        <div className="flex flex-col gap-4 py-3">
          {TEMPLATE_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={`${f.label} · ${f.variable}`}
              hint={`${f.hint} In ${f.uses} ${f.uses === 1 ? "sjabloon" : "sjablonen"}.`}
              error={bad.includes(f) ? "Gebruik een adres dat met https:// begint" : undefined}
            >
              {(c) => (
                <Input
                  {...c}
                  type="url"
                  placeholder="https://"
                  disabled={!edit}
                  value={form.draft[f.key]}
                  onChange={(e) => form.patch({ [f.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
      </SettingsSection>

      <PageSection id="voorbeeld" title="Voorbeeld" meta="Het sjabloon Pakket bezorgd, zoals de klant het krijgt.">
        <div className="flex max-w-xl flex-col gap-3 rounded-lg bg-well px-5 py-4 text-sm text-ink">
          <p>Hoi Lena,</p>
          <p>Je pakket is bezorgd. We hopen dat de Aurora Hooded Fleece goed past.</p>
          <p>
            Vertel je ons wat je ervan vindt? {review === ""
              ? <span className="text-warn-ink">[reviewlink ontbreekt]</span>
              : <span className="underline">{review}</span>}
          </p>
          <p>Groet, Sofía van Northwind</p>
          <p className="text-xs text-ink-3">
            Liever geen mails meer? {form.draft.unsubscribe.trim() === ""
              ? <span className="text-warn-ink">[uitschrijflink ontbreekt]</span>
              : <span className="underline">Uitschrijven</span>}
          </p>
        </div>
      </PageSection>
    </SettingsPage>
  )
}

/* ── Huisstijl ─────────────────────────────────────────────────────────────────────────────────── */

/** WCAG contrast of white on a hex colour. */
function contrastWithWhite(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (m === null) return 0
  const n = Number.parseInt(m[1] ?? "000000", 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0)
  return 1.05 / (lum + 0.05)
}

/**
 * Huisstijl: the store's logo, colour and typeface in mails, the chat window and the return portal,
 * and who sends the mail. The colour is the store's own choice and only paints the preview of its own
 * mail. The current demo's `settings/brand`.
 */
export function BrandScreen() {
  const { edit } = useAccess("settings")
  const form = useDraft("brand.mark", {
    color: BRAND.color,
    font: BRAND.font,
    logo: "northwind-logo.svg" as string | null
  })
  const sender = useDraft("brand.sender", {
    sender: BRAND.sender,
    website: BRAND.website,
    support: BRAND.support,
    widget: BRAND.widget
  })
  const [logoError, setLogoError] = useState<string | undefined>(undefined)
  const d = { ...form.draft, ...sender.draft }
  const ratio = contrastWithWhite(d.color)
  const readable = ratio >= 4.5
  return (
    <SettingsPage
      title="Huisstijl"
      area="settings"
      what="de huisstijl"
      meta="Hoe je winkel eruitziet in mails, de chat en het retourportaal"
    >
      <SettingsSection
        id="merk"
        title="Merk"
        description="In mails, het chatvenster en het retourportaal."
        footer={
          <SaveBar
            disabled={!edit}
            dirty={form.dirty}
            onReset={form.reset}
            onSave={() => {
              if (!/^#[0-9a-f]{6}$/i.test(d.color.trim())) {
                toast({ title: "Een merkkleur is een hexcode, zoals #24443C", tone: "bad" })
                return
              }
              form.commit()
              toast({
                title: "Huisstijl opgeslagen",
                body: "Nieuwe mails, de chat en het retourportaal gebruiken hem meteen.",
                tone: "good"
              })
            }}
          />
        }
      >
        <SettingRow
          title="Logo"
          stack
          description="PNG, JPG, WebP of SVG, tot 400 kB. Liggend werkt het best."
          control={
            <div className="flex w-full flex-col gap-2 pb-2">
              {d.logo !== null && (
                <span className="flex items-center justify-between gap-3 text-sm text-ink-2">
                  {d.logo}
                  {edit && (
                    <Button size="sm" variant="ghost" onClick={() => form.patch({ logo: null })}>Verwijderen</Button>
                  )}
                </span>
              )}
              {edit && (
                <FileDrop
                  label="Sleep een logo hierheen of kies er een"
                  accept=".png,.jpg,.jpeg,.webp,.svg"
                  hint="PNG, JPG, WebP of SVG, tot 400 kB"
                  invalid={logoError}
                  onFiles={(files) => {
                    const f = files[0]
                    if (f === undefined) return
                    if (!/\.(png|jpe?g|webp|svg)$/i.test(f.name)) {
                      return setLogoError("Dat is geen logo: kies een PNG, JPG, WebP of SVG")
                    }
                    if (f.size > 400_000) return setLogoError("Dat logo is te groot: het mag tot 400 kB zijn")
                    setLogoError(undefined)
                    form.patch({ logo: f.name })
                  }}
                />
              )}
            </div>
          }
        />
        <SettingRow
          title="Merkkleur"
          htmlFor="brand-color"
          description={readable
            ? `Voor knoppen en links. Contrast met wit ${
              ratio.toFixed(1).replace(".", ",")
            }:1, goed leesbaar op knoppen.`
            : `Voor knoppen en links. Contrast met wit ${
              ratio.toFixed(1).replace(".", ",")
            }:1: witte tekst is hier slecht te lezen.`}
          control={
            <span className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Kleur kiezen"
                disabled={!edit}
                value={/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#000000"}
                onChange={(e) => form.patch({ color: e.target.value.toUpperCase() })}
                className="size-8 cursor-pointer rounded-sm bg-transparent"
              />
              <Input
                id="brand-color"
                className="w-28"
                disabled={!edit}
                value={d.color}
                onChange={(e) => form.patch({ color: e.target.value })}
              />
            </span>
          }
        />
        <SettingRow
          title="Lettertype in mails"
          control={
            <Segmented
              label="Lettertype in mails"
              disabled={!edit}
              value={d.font}
              onChange={(font) => form.patch({ font })}
              options={["Systeem", "Inter", "Georgia"].map((f) => ({ value: f, label: f }))}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        id="afzender"
        title="Afzender"
        description="Wie de mail stuurt en waar een antwoord heen gaat."
        footer={
          <SaveBar
            disabled={!edit}
            dirty={sender.dirty}
            onReset={sender.reset}
            onSave={() => {
              sender.commit()
              toast({ title: "Afzender opgeslagen", body: "Nieuwe mails gebruiken hem meteen.", tone: "good" })
            }}
          />
        }
      >
        <div className="grid gap-4 py-3 sm:grid-cols-2">
          <Field label="Afzendernaam">
            {(c) => (
              <Input
                {...c}
                disabled={!edit}
                value={d.sender}
                onChange={(e) => sender.patch({ sender: e.target.value })}
              />
            )}
          </Field>
          <Field label="Website">
            {(c) => (
              <Input
                {...c}
                type="url"
                disabled={!edit}
                value={d.website}
                onChange={(e) => sender.patch({ website: e.target.value })}
              />
            )}
          </Field>
          <Field label="Supportadres" hint="Staat onder elke mail en in het retourportaal." className="sm:col-span-2">
            {(c) => (
              <Input
                {...c}
                type="email"
                disabled={!edit}
                value={d.support}
                onChange={(e) => sender.patch({ support: e.target.value })}
              />
            )}
          </Field>
        </div>
        <SettingRow
          title="Chatvenster op de website"
          control={
            <Segmented
              label="Chatvenster op de website"
              disabled={!edit}
              value={d.widget}
              onChange={(widget) => sender.patch({ widget })}
              options={[{ value: "right", label: "Rechtsonder" }, { value: "left", label: "Linksonder" }]}
            />
          }
        />
      </SettingsSection>

      <PageSection id="voorbeeld" title="Voorbeeld" meta="Een retourmail, met je huisstijl">
        <div
          className="flex max-w-xl flex-col gap-3 rounded-lg bg-well px-5 py-4 text-sm text-ink"
          style={{
            fontFamily: d.font === "Georgia" ? "Georgia, serif" : d.font === "Inter" ? "Inter, sans-serif" : undefined
          }}
        >
          <p className="text-md font-semibold">{d.sender}</p>
          <p>Hoi Lena, je retour is goedgekeurd. Print het label en breng het pakket naar een PostNL-punt.</p>
          <span
            className="inline-flex h-9 w-fit items-center rounded-sm px-4 text-sm font-medium text-on-accent"
            style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : undefined }}
          >
            Label downloaden
          </span>
          <p className="text-xs text-ink-3">{d.sender} · {d.support} · {d.website.replace(/^https:\/\//, "")}</p>
        </div>
      </PageSection>
    </SettingsPage>
  )
}

/* ── E-mail en domein ──────────────────────────────────────────────────────────────────────────── */

/**
 * E-mail en domein: the four DNS records that let mail from the store's own domain arrive signed, and
 * the addresses it is sent from and answered to. The current demo's `settings/email-domain`.
 */
export function EmailDomainScreen() {
  const view = useView()
  const { edit } = useAccess("settings")
  const seedRecords = view.staat === "leeg" ? DOMAIN.records.map((r) => ({ ...r, found: false })) : DOMAIN.records
  const records = useDraft<ReadonlyArray<DnsRecord>>("domain.records", seedRecords)
  const senders = useDraft("domain.senders", { from: DOMAIN.from, replyTo: DOMAIN.replyTo })
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(view.staat === "leeg" ? null : DOMAIN.checked)
  const [removing, setRemoving] = useState(false)
  const [removed, setRemoved] = useSaved("domain.removed", false)
  const found = records.saved.filter((r) => r.found).length
  const all = found === records.saved.length
  const check = () => {
    setChecking(true)
    window.setTimeout(() => {
      setChecking(false)
      setChecked(new Date(2026, 10, 23, 14, 30))
      toast({
        title: all ? "Alle records gevonden" : `${found} van ${records.saved.length} records gevonden`,
        body: all ? undefined : "Een nieuw record kan tot 24 uur duren.",
        tone: all ? "good" : "neutral"
      })
    }, 900)
  }

  return (
    <SettingsPage
      title="E-mail en domein"
      width="record"
      area="settings"
      what="het maildomein"
      meta={`Mail vanaf ${DOMAIN.domain}, ondertekend en zonder spam`}
    >
      {removed
        ? (
          <EmptyState
            glyph={Mail}
            title="Geen eigen maildomein"
            action={edit ? <Button onClick={() => setRemoved(false)}>{DOMAIN.domain} toevoegen</Button> : undefined}
          >
            Mail gaat nu vanaf het adres van Insyte. Met je eigen domein komt hij ondertekend aan en belandt hij minder
            vaak in spam.
          </EmptyState>
        )
        : (
          <>
            {all
              ? <Notice tone="good" title="Je domein is klaar.">Mail van {DOMAIN.domain} is ondertekend.</Notice>
              : (
                <Notice tone="warn" title={`${found} van ${records.saved.length} records gevonden.`}>
                  Mail gaat al de deur uit, maar kan in spam belanden tot alle vier er staan.
                </Notice>
              )}

            <PageSection
              id="dns"
              title={`DNS-records voor ${DOMAIN.domain}`}
              meta={checked === null ? "Nog niet gecontroleerd" : `Laatst gecontroleerd ${relative(checked)}`}
              actions={
                <>
                  <CopyValue
                    label="Instructies"
                    shown="Instructies"
                    value={records.saved.map((r) => `${r.type} ${r.name}.${DOMAIN.domain} ${r.value}`).join("\n")}
                  />
                  <Button size="sm" icon={<RefreshCcw />} loading={checking} onClick={check}>
                    Opnieuw controleren
                  </Button>
                </>
              }
            >
              <Table label="DNS-records" minWidth={720}>
                <THead>
                  <Th width={64}>Soort</Th>
                  <Th>Naam</Th>
                  <Th>Waarde</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {records.saved.map((r) => (
                    <Tr key={r.id}>
                      <Td header>{r.type}</Td>
                      <Td>
                        <CopyValue value={r.name} label={`Naam van ${r.type}-record`} />
                      </Td>
                      <Td className="max-w-[18rem]">
                        <CopyValue value={r.value} label={`Waarde van ${r.type}-record`} />
                      </Td>
                      <Td>
                        <span className="flex flex-col gap-0.5 py-1">
                          {checking
                            ? <Status tone="neutral">Controleren…</Status>
                            : r.found
                            ? <Status tone="good">Gevonden</Status>
                            : <Status tone="warn">Niet gevonden</Status>}
                          {!r.found && !checking && (
                            <span className="max-w-[16rem] text-xs text-ink-3">
                              {view.staat === "leeg" ? "Nog niet toegevoegd bij je domeinbeheerder." : r.why}
                            </span>
                          )}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </PageSection>

            <SettingsSection
              id="afzenders"
              title="Afzenders"
              footer={
                <SaveBar
                  disabled={!edit}
                  dirty={senders.dirty}
                  onReset={senders.reset}
                  onSave={() => {
                    if (!senders.draft.from.endsWith(`@${DOMAIN.domain}`)) {
                      toast({ title: `Het afzendadres moet op @${DOMAIN.domain} eindigen`, tone: "bad" })
                      return
                    }
                    senders.commit()
                    toast({ title: "Afzenders opgeslagen", tone: "good" })
                  }}
                />
              }
            >
              <SettingRow
                title="Mails van Insyte"
                htmlFor="from"
                description="Sjablonen, retourmails en wat de klantagent mailt."
                control={
                  <Input
                    id="from"
                    type="email"
                    className="w-64"
                    disabled={!edit}
                    value={senders.draft.from}
                    onChange={(e) => senders.patch({ from: e.target.value })}
                  />
                }
              />
              <SettingRow
                title="Antwoorden naar"
                htmlFor="reply"
                description="Komt binnen in de Inbox."
                control={
                  <Input
                    id="reply"
                    type="email"
                    className="w-64"
                    disabled={!edit}
                    value={senders.draft.replyTo}
                    onChange={(e) => senders.patch({ replyTo: e.target.value })}
                  />
                }
              />
            </SettingsSection>

            {edit && (
              <div>
                <Button variant="ghost" icon={<Trash />} onClick={() => setRemoving(true)}>Domein verwijderen</Button>
              </div>
            )}
            <AlertDialog
              open={removing}
              onCancel={() => setRemoving(false)}
              onConfirm={() => {
                setRemoving(false)
                setRemoved(true)
                toast({
                  title: `${DOMAIN.domain} verwijderd`,
                  body: "Mail gaat weer vanaf het adres van Insyte.",
                  action: { label: "Ongedaan maken", onClick: () => setRemoved(false) }
                })
              }}
              title="Domein verwijderen?"
              body={`Mail gaat dan weer vanaf het adres van Insyte, niet vanaf ${DOMAIN.domain}. De records bij je domeinbeheerder kun je daarna weghalen.`}
              confirmLabel="Verwijderen"
            />
          </>
        )}
    </SettingsPage>
  )
}
