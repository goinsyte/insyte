import { useState } from "react"
import { ACCESS_REQUESTS, member, membersFor, ROLES, SPECIALS, storeName } from "../../fixtures/settings.ts"
import type { RoleDef, SpecialId } from "../../fixtures/settings.ts"
import { STORES } from "../../fixtures/workspace.ts"
import { Link, paths, setQuery, useQuery } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Tag } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { ArrowLeft, Lock, Plus, Trash, UserCog } from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { AREA_LABEL, LEVEL_LABEL, LEVELS, useView } from "../../view.ts"
import type { Level, PermArea, Rol } from "../../view.ts"
import { SettingsPage, UnsavedBar, useSaved } from "./parts.tsx"

const AREAS = Object.keys(AREA_LABEL) as ReadonlyArray<PermArea>
const LEVEL_OPTIONS = ([0, 1, 2, 3] as const).map((l) => ({ value: String(l), label: LEVEL_LABEL[l] }))
const NONE = Object.fromEntries(AREAS.map((a) => [a, 0])) as Record<PermArea, Level>

/** The role a custom role is compared with: its base, or a role from nothing. */
const baseOf = (role: RoleDef): Readonly<Record<PermArea, Level>> =>
  role.basedOn === undefined ? NONE : LEVELS[role.basedOn]

/**
 * Rollen: the five system roles and the team's own, each a level per area (Geen, Bekijken, Bewerken,
 * Beheren), a few special actions, and the stores it sees. A system role reads as it comes out of the
 * box and can be copied; an own role is edited here and says how it differs from the role it started
 * from. `?open=` opens one (not `?rol=`, which sets the view's role). The current demo's `settings/roles`.
 */
export function RolesScreen() {
  const view = useView()
  const { edit } = useAccess("team")
  const open = useQuery("open")
  const [roles, setRoles] = useSaved<ReadonlyArray<RoleDef>>("roles", ROLES)
  const [requests, setRequests] = useSaved("roles.requests", view.staat === "leeg" ? [] : [...ACCESS_REQUESTS])
  const [creating, setCreating] = useState<string | null>(null)
  const [compareAll, setCompareAll] = useState<"alles" | "verschil">("verschil")
  const people = membersFor(view.staat)
  const count = (id: string) => people.filter((p) => p.roleId === id).length
  const role = roles.find((r) => r.id === open)

  if (open !== null && role !== undefined) {
    return (
      <RoleEditor
        key={role.id}
        role={role}
        edit={edit}
        holders={people.filter((p) => p.roleId === role.id).map((p) => p.name)}
        roles={roles}
        onSave={(next) => setRoles((all) => all.map((r) => (r.id === next.id ? next : r)))}
        onCopy={() => setCreating(role.id)}
        onDelete={(to) => {
          const gone = role
          setRoles((all) => all.filter((r) => r.id !== gone.id))
          setQuery({ open: null })
          toast({
            title: `${gone.label} verwijderd`,
            body: `Wie deze rol had, is nu ${roles.find((r) => r.id === to)?.label ?? to}.`,
            action: { label: "Ongedaan maken", onClick: () => setRoles((all) => [...all, gone]) }
          })
        }}
      />
    )
  }

  const system = roles.filter((r) => r.system)
  const custom = roles.filter((r) => !r.system)
  const compared = AREAS.filter((a) => compareAll === "alles" || new Set(roles.map((r) => r.levels[a])).size > 1)

  return (
    <SettingsPage
      title="Rollen"
      width="record"
      area="team"
      what="de rollen"
      meta="Een niveau per onderdeel: Niets, bekijken, bewerken of beheren. Bewerken omvat bekijken, beheren omvat bewerken."
      actions={edit
        ? <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setCreating("")}>Nieuwe rol</Button>
        : undefined}
    >
      {open !== null && role === undefined && (
        <EmptyState size="sm" title="Deze rol bestaat niet (meer).">
          Misschien is hij verwijderd. Kies hieronder een andere.
        </EmptyState>
      )}

      <PageSection id="systeem" title="Systeemrollen" meta={String(system.length)}>
        <List divided label="Systeemrollen">
          {system.map((r) => (
            <ListRow
              key={r.id}
              padded={false}
              onClick={() => setQuery({ open: r.id })}
              lead={<GlyphTile>{r.id === "eigenaar" ? <Lock size={16} /> : <UserCog size={16} />}</GlyphTile>}
              title={r.label}
              meta={r.description}
              trail={
                <>
                  <span className="figure hidden sm:inline">
                    {count(r.id)} {count(r.id) === 1 ? "persoon" : "personen"}
                  </span>
                  <Tag>{r.id === "eigenaar" ? "Vergrendeld" : "Systeemrol"}</Tag>
                </>
              }
            />
          ))}
        </List>
      </PageSection>

      <PageSection id="eigen" title="Eigen rollen" meta={String(custom.length)}>
        {custom.length === 0
          ? (
            <EmptyState
              size="sm"
              glyph={UserCog}
              title="Nog geen eigen rollen"
              action={edit ? <Button icon={<Plus />} onClick={() => setCreating("")}>Nieuwe rol</Button> : undefined}
            >
              Begin vanuit de rol die er het dichtst bij zit en pas daarna aan wat anders moet.
            </EmptyState>
          )
          : (
            <List divided label="Eigen rollen">
              {custom.map((r) => (
                <ListRow
                  key={r.id}
                  padded={false}
                  onClick={() => setQuery({ open: r.id })}
                  lead={
                    <GlyphTile>
                      <UserCog size={16} />
                    </GlyphTile>
                  }
                  title={r.label}
                  meta={`${
                    r.basedOn === undefined
                      ? "Vanaf niets"
                      : `Op basis van ${roles.find((x) => x.id === r.basedOn)?.label ?? ""}`
                  } · ${r.description}`}
                  trail={
                    <>
                      <span className="figure hidden sm:inline">
                        {count(r.id)} {count(r.id) === 1 ? "persoon" : "personen"}
                      </span>
                      <Tag tone="accent">Eigen rol</Tag>
                    </>
                  }
                />
              ))}
            </List>
          )}
      </PageSection>

      <PageSection id="verzoeken" title="Toegangsverzoeken" meta={String(requests.length)}>
        {requests.length === 0
          ? <p className="text-sm text-ink-3">Niemand vraagt nu om meer rechten.</p>
          : (
            <List divided label="Toegangsverzoeken">
              {requests.map((req) => {
                const who = member(req.who)
                const decide = (ok: boolean) => {
                  setRequests((all) => all.filter((x) => x.id !== req.id))
                  toast({
                    title: ok
                      ? `${who?.name ?? ""} krijgt ${AREA_LABEL[req.area]} · ${LEVEL_LABEL[req.level]}`
                      : "Verzoek afgewezen",
                    body: ok
                      ? "Alleen voor deze persoon; de rol zelf blijft zoals hij is."
                      : `${who?.name ?? ""} krijgt een melding.`,
                    tone: ok ? "good" : "neutral",
                    action: { label: "Ongedaan maken", onClick: () => setRequests((all) => [...all, req]) }
                  })
                }
                return (
                  <ListRow
                    key={req.id}
                    padded={false}
                    lead={<Avatar name={who?.name ?? ""} size={28} />}
                    title={`${who?.name ?? ""} vraagt ${AREA_LABEL[req.area]} · ${LEVEL_LABEL[req.level]}`}
                    meta={`“${req.why}” · nu ${roles.find((r) => r.id === req.roleId)?.label ?? ""}`}
                    trail={edit
                      ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => decide(false)}>Afwijzen</Button>
                          <Button size="sm" onClick={() => decide(true)}>Goedkeuren</Button>
                        </>
                      )
                      : undefined}
                  />
                )
              })}
            </List>
          )}
      </PageSection>

      <PageSection
        id="vergelijk"
        title="Vergelijk rollen"
        actions={
          <Segmented
            size="sm"
            label="Welke onderdelen"
            value={compareAll}
            onChange={setCompareAll}
            options={[{ value: "verschil", label: "Alleen verschillen" }, { value: "alles", label: "Alles" }]}
          />
        }
      >
        <Table label="Rollen vergeleken" minWidth={160 + roles.length * 108}>
          <THead>
            <Th>Onderdeel</Th>
            {roles.map((r) => <Th key={r.id}>{r.label}</Th>)}
          </THead>
          <TBody>
            {compared.map((a) => (
              <Tr key={a}>
                <Td header>{AREA_LABEL[a]}</Td>
                {roles.map((r) => <Td key={r.id} muted={r.levels[a] === 0}>{LEVEL_LABEL[r.levels[a]]}</Td>)}
              </Tr>
            ))}
          </TBody>
        </Table>
      </PageSection>

      <NewRoleDialog
        open={creating !== null}
        from={creating ?? ""}
        roles={roles}
        onClose={() => setCreating(null)}
        onCreate={(next) => {
          setRoles((all) => [...all, next])
          setCreating(null)
          setQuery({ open: next.id })
          toast({ title: `${next.label} gemaakt`, body: "Pas aan wat anders moet en sla op.", tone: "good" })
        }}
      />
    </SettingsPage>
  )
}

function RoleEditor({ role, edit, holders, roles, onSave, onCopy, onDelete }: {
  readonly role: RoleDef
  readonly edit: boolean
  readonly holders: ReadonlyArray<string>
  readonly roles: ReadonlyArray<RoleDef>
  readonly onSave: (next: RoleDef) => void
  readonly onCopy: () => void
  readonly onDelete: (to: string) => void
}) {
  const [draft, setDraft] = useState<RoleDef>(role)
  const [deleting, setDeleting] = useState(false)
  const [moveTo, setMoveTo] = useState("alleen-lezen")
  const editable = edit && !role.system
  const dirty = JSON.stringify(draft) !== JSON.stringify(role)
  const base = baseOf(role)
  const baseLabel = role.basedOn === undefined
    ? "niets"
    : roles.find((r) => r.id === role.basedOn)?.label ?? role.basedOn
  const differs = role.system ? [] : AREAS.filter((a) => draft.levels[a] !== base[a])
  const setLevel = (a: PermArea, l: Level) => {
    const levels = { ...draft.levels, [a]: l }
    // A special action that no longer has its level falls away with it.
    const specials = draft.specials.filter((id) => {
      const s = SPECIALS.find((x) => x.id === id)
      return s === undefined || levels[s.needs.area] >= s.needs.level
    })
    setDraft({ ...draft, levels, specials })
  }
  const toggleSpecial = (id: SpecialId, on: boolean) =>
    setDraft({ ...draft, specials: on ? [...draft.specials, id] : draft.specials.filter((x) => x !== id) })
  const scopedStores = draft.stores === "all" ? STORES.map((s) => s.id) : draft.stores

  return (
    <SettingsPage
      title={role.label}
      width="record"
      area="team"
      what="de rollen"
      meta={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Tag tone={role.system ? "neutral" : "accent"}>
            {role.id === "eigenaar" ? "Vergrendeld" : role.system ? "Systeemrol" : "Eigen rol"}
          </Tag>
          <span>{role.description}</span>
        </span>
      }
      actions={
        <>
          <ButtonLink size="sm" variant="ghost" icon={<ArrowLeft />} to={paths.settings("rollen")}>Rollen</ButtonLink>
          {edit && role.id !== "eigenaar" && <Button size="sm" onClick={onCopy}>Kopie maken</Button>}
          {editable && (
            <Button size="sm" variant="ghost" icon={<Trash />} onClick={() => setDeleting(true)}>Verwijderen</Button>
          )}
        </>
      }
    >
      {role.id === "eigenaar" && (
        <p className="text-sm text-ink-2">De eigenaar kan altijd alles en is niet te wijzigen.</p>
      )}
      {role.system && role.id !== "eigenaar" && (
        <p className="text-sm text-ink-2">
          Een systeemrol staat zoals hij uit de doos komt. Maak een kopie om er een eigen rol van te maken.
        </p>
      )}

      <PageSection id="wie" title="Wie deze rol heeft" meta={String(holders.length)}>
        <p className="text-sm text-ink-2">
          {holders.length === 0 ? "Nog niemand." : holders.join(", ")}
        </p>
      </PageSection>

      <PageSection
        id="onderdelen"
        title="Per onderdeel"
        meta={role.system
          ? undefined
          : differs.length === 0
          ? `Gelijk aan ${baseLabel}`
          : `${differs.length} anders dan ${baseLabel}`}
      >
        <Table label={`Niveaus van ${role.label}`} minWidth={560}>
          <THead>
            <Th>Onderdeel</Th>
            <Th>Niveau</Th>
          </THead>
          <TBody>
            {AREAS.map((a) => {
              const changed = !role.system && draft.levels[a] !== base[a]
              return (
                <Tr key={a}>
                  <Td header>
                    <span className="flex flex-col">
                      <span>{AREA_LABEL[a]}</span>
                      {changed && <span className="text-2xs text-accent-ink">{baseLabel}: {LEVEL_LABEL[base[a]]}</span>}
                    </span>
                  </Td>
                  <Td>
                    {editable
                      ? (
                        <Segmented
                          size="sm"
                          label={AREA_LABEL[a]}
                          value={String(draft.levels[a])}
                          options={LEVEL_OPTIONS}
                          onChange={(v) => setLevel(a, Number(v) as Level)}
                        />
                      )
                      : (
                        <span className={draft.levels[a] === 0 ? "text-ink-3" : "text-ink"}>
                          {LEVEL_LABEL[draft.levels[a]]}
                        </span>
                      )}
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      </PageSection>

      <PageSection id="bijzonder" title="Bijzondere acties">
        <div className="flex flex-col gap-3">
          {SPECIALS.map((s) => {
            const possible = draft.levels[s.needs.area] >= s.needs.level
            return (
              <Checkbox
                key={s.id}
                label={s.label}
                description={possible
                  ? s.detail
                  : `Vraagt ${AREA_LABEL[s.needs.area]} · ${LEVEL_LABEL[s.needs.level]} of hoger.`}
                checked={draft.specials.includes(s.id)}
                disabled={!editable || !possible}
                onChange={(on) => toggleSpecial(s.id, on)}
              />
            )
          })}
        </div>
        {draft.specials.includes("refunds.write") && (
          <Field
            label="Terugbetalen tot"
            hint="Per terugbetaling. Leeg is geen grens; daarboven vraagt het een collega."
            className="max-w-xs pt-2"
          >
            {(c) => (
              <Input
                {...c}
                prefix="€"
                inputMode="decimal"
                disabled={!editable}
                value={draft.refundLimit === null ? "" : String(draft.refundLimit)}
                placeholder="Geen grens"
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."))
                  setDraft({ ...draft, refundLimit: e.target.value.trim() === "" || Number.isNaN(n) ? null : n })
                }}
              />
            )}
          </Field>
        )}
      </PageSection>

      <PageSection id="winkels" title="Winkels">
        {role.id === "eigenaar" || role.system
          ? <p className="text-sm text-ink-2">Alle winkels, ook die later gekoppeld worden.</p>
          : (
            <div className="flex flex-col gap-3">
              <Checkbox
                label="Alle winkels"
                description="Ook die later gekoppeld worden."
                checked={draft.stores === "all"}
                disabled={!editable}
                onChange={(on) => setDraft({ ...draft, stores: on ? "all" : scopedStores })}
              />
              {draft.stores !== "all" && STORES.map((s) => (
                <Checkbox
                  key={s.id}
                  label={storeName(s.id)}
                  checked={scopedStores.includes(s.id)}
                  disabled={!editable}
                  onChange={(on) =>
                    setDraft({
                      ...draft,
                      stores: on ? [...scopedStores, s.id] : scopedStores.filter((x) => x !== s.id)
                    })}
                />
              ))}
            </div>
          )}
      </PageSection>

      <p className="text-xs text-ink-3">
        Wie wat mag zien van klantgegevens staat ook onder{" "}
        <Link to={paths.settings("gegevens")} className="underline">Je gegevens</Link>.
      </p>

      <UnsavedBar
        dirty={editable && dirty}
        note={differs.length > 0 ? `${differs.length} onderdelen anders dan ${baseLabel}` : undefined}
        onReset={() => setDraft(role)}
        onSave={() => {
          onSave(draft)
          toast({
            title: `${draft.label} opgeslagen`,
            body: `Geldt meteen voor ${holders.length} ${holders.length === 1 ? "persoon" : "personen"}.`,
            tone: "good"
          })
        }}
      />

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`${role.label} verwijderen?`}
        description="Eerst krijgt iedereen met deze rol een andere. Daarna verdwijnt hij, met een kans om het ongedaan te maken."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>Annuleren</Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeleting(false)
                onDelete(moveTo)
              }}
            >
              Verwijderen
            </Button>
          </>
        }
      >
        <Field label="Zet ze op" hint={holders.length === 0 ? "Niemand heeft deze rol nu." : holders.join(", ")}>
          {(c) => (
            <Select {...c} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {roles.filter((r) => r.id !== role.id && r.id !== "eigenaar").map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </Select>
          )}
        </Field>
      </Dialog>
    </SettingsPage>
  )
}

function NewRoleDialog({ open, from, roles, onClose, onCreate }: {
  readonly open: boolean
  /** A role to copy, or "" for a choice. */
  readonly from: string
  readonly roles: ReadonlyArray<RoleDef>
  readonly onClose: () => void
  readonly onCreate: (role: RoleDef) => void
}) {
  const copying = roles.find((r) => r.id === from)
  const [name, setName] = useState("")
  const [base, setBase] = useState<string>("klantenservice")
  const [tried, setTried] = useState(false)
  const label = name.trim() === "" && copying !== undefined ? `Kopie van ${copying.label}` : name.trim()
  const taken = roles.some((r) => r.label.toLowerCase() === label.toLowerCase())
  const error = !tried
    ? undefined
    : label === ""
    ? "Geef de rol een naam"
    : taken
    ? "Er is al een rol met deze naam"
    : undefined
  const create = () => {
    setTried(true)
    if (label === "" || taken) return
    const source = copying ?? roles.find((r) => r.id === base)
    const basedOn = (source?.system === true ? source.id : source?.basedOn) as Rol | undefined
    onCreate({
      id: `rol-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
      description: source === undefined ? "Begint met niets." : `Begonnen vanuit ${source.label}.`,
      system: false,
      ...(basedOn === undefined ? {} : { basedOn }),
      levels: source?.levels ?? NONE,
      specials: source?.specials.filter((s) => s !== "ai.autonomy") ?? [],
      refundLimit: source?.refundLimit ?? null,
      stores: source?.stores ?? "all"
    })
    setName("")
    setTried(false)
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={copying === undefined ? "Nieuwe rol" : `Kopie van ${copying.label}`}
      description="Begin vanuit de rol die er het dichtst bij zit en pas daarna aan wat anders moet. Je ziet steeds wat er verschilt."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={create}>Rol maken</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Naam" error={error}>
          {(c) => (
            <Input
              {...c}
              placeholder={copying === undefined ? "Retourbalie" : `Kopie van ${copying.label}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {copying === undefined && (
          <Field label="Begin vanuit">
            {(c) => (
              <Select {...c} value={base} onChange={(e) => setBase(e.target.value)}>
                <option value="">Niets, alles op geen</option>
                {roles.filter((r) => r.id !== "eigenaar").map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
    </Dialog>
  )
}
