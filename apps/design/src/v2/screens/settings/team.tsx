import { useState } from "react"
import {
  INVITE_LINK,
  invitesFor,
  LINK_DAYS,
  member,
  membersFor,
  relative,
  roleLabel,
  ROLES,
  SEATS,
  storesLabel
} from "../../fixtures/settings.ts"
import type { Invite, Member } from "../../fixtures/settings.ts"
import { PEOPLE, STORES } from "../../fixtures/workspace.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Status, Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { MoreHorizontal, UserPlus, Users } from "../../ui/icons.tsx"
import { Field, Input, SearchField, Select, Textarea } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { PageSection } from "../../ui/page.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Toggle } from "../../ui/toggle.tsx"
import { useView } from "../../view.ts"
import { CopyValue, SettingsPage, useSaved } from "./parts.tsx"

const NOW = new Date(2026, 10, 23, 14, 30).getTime()
const first = (name: string) => name.split(" ")[0] ?? name
const nameOf = (id: string | undefined) => (id === undefined ? undefined : member(id)?.name)

/**
 * Team: who works in the workspace, with their role, their stores and who invited them; the
 * invitations still open; and the link that lets someone in with one role. A row opens the person's
 * own page. The current demo's `settings/team`.
 */
export function TeamScreen() {
  const view = useView()
  const { edit } = useAccess("team")
  const [members, setMembers] = useSaved<ReadonlyArray<Member>>("team.members", membersFor(view.staat))
  const [invites, setInvites] = useSaved<ReadonlyArray<Invite>>("team.invites", invitesFor(view.staat))
  const [link, setLink] = useSaved("team.link", {
    on: view.staat !== "leeg",
    token: INVITE_LINK.token,
    roleId: INVITE_LINK.roleId as string,
    days: String(INVITE_LINK.days)
  })
  const [query, setSearch] = useState("")
  const [inviting, setInviting] = useState(false)
  const [roleFor, setRoleFor] = useState<Member | null>(null)

  const used = members.filter((m) => m.deactivated !== true).length +
    invites.filter((i) => i.expires.getTime() > NOW).length
  const seats = SEATS.included + SEATS.extra
  const full = used >= seats
  const q = query.trim().toLowerCase()
  const shown = members.filter((m) =>
    q === "" || `${m.name} ${m.email} ${roleLabel(m.roleId)}`.toLowerCase().includes(q)
  )
  const linkUrl = `https://app.goinsyte.com/join/${link.token}`

  const setActive = (m: Member, active: boolean) => {
    const apply = (on: boolean) => setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, deactivated: !on } : x)))
    apply(active)
    toast({
      title: active ? `${m.name} weer actief` : `${m.name} gedeactiveerd`,
      body: active
        ? "Kan weer inloggen met de rol van eerst."
        : "Kan niet meer inloggen. Toegewezen tickets blijven staan.",
      action: { label: "Ongedaan maken", onClick: () => apply(!active) }
    })
  }
  const resend = (inv: Invite) => {
    setInvites((all) =>
      all.map((x) => (x.id === inv.id ? { ...x, sent: new Date(NOW), expires: new Date(NOW + 7 * 86_400_000) } : x))
    )
    toast({
      title: `Opnieuw verstuurd naar ${inv.email}`,
      body: "De nieuwe link is 7 dagen geldig; de oude werkt niet meer.",
      tone: "good"
    })
  }
  const revoke = (inv: Invite) => {
    setInvites((all) => all.filter((x) => x.id !== inv.id))
    toast({
      title: `Uitnodiging aan ${inv.email} ingetrokken`,
      body: "De link werkt niet meer. De plek is weer vrij.",
      action: { label: "Ongedaan maken", onClick: () => setInvites((all) => [...all, inv]) }
    })
  }

  return (
    <SettingsPage
      title="Team"
      width="record"
      area="team"
      what="het team"
      meta={
        <>
          <span className="figure">{members.length}</span> {members.length === 1 ? "persoon" : "personen"} ·{" "}
          <span className="figure">{used}</span> van <span className="figure">{seats}</span> plekken in gebruik
        </>
      }
      actions={edit
        ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate(paths.settings("rollen"))}>Rollen</Button>
            {full
              ? (
                <Button size="sm" variant="primary" onClick={() => navigate(paths.settings("facturatie"))}>
                  Plek bijkopen
                </Button>
              )
              : (
                <Button size="sm" variant="primary" icon={<UserPlus />} onClick={() => setInviting(true)}>
                  Collega uitnodigen
                </Button>
              )}
          </>
        )
        : undefined}
    >
      <PageSection
        id="leden"
        title="Teamleden"
        meta={String(members.length)}
        actions={
          <SearchField
            label="Personen zoeken"
            placeholder="Personen zoeken"
            value={query}
            onChange={setSearch}
            className="w-56"
          />
        }
      >
        {members.length === 1 && q === ""
          ? (
            <>
              <MemberTable rows={shown} edit={edit} onRole={setRoleFor} onActive={setActive} />
              <EmptyState
                size="sm"
                glyph={Users}
                title="Je werkt hier nog alleen."
                action={edit
                  ? <Button icon={<UserPlus />} onClick={() => setInviting(true)}>Collega uitnodigen</Button>
                  : undefined}
              >
                Nodig je team uit. Ieder krijgt een rol die bepaalt wat hij ziet en mag.
              </EmptyState>
            </>
          )
          : shown.length === 0
          ? <p className="py-6 text-sm text-ink-3">Niemand gevonden voor “{query}”.</p>
          : <MemberTable rows={shown} edit={edit} onRole={setRoleFor} onActive={setActive} />}
      </PageSection>

      <PageSection id="uitnodigingen" title="Openstaande uitnodigingen" meta={String(invites.length)}>
        {invites.length === 0
          ? (
            <EmptyState size="sm" glyph={UserPlus} title="Geen uitnodigingen open.">
              Wie je uitnodigt staat hier tot die accepteert, met wanneer de link verloopt. Je kunt hem opnieuw sturen,
              de rol aanpassen of intrekken.
            </EmptyState>
          )
          : (
            <List divided label="Openstaande uitnodigingen">
              {invites.map((inv) => {
                const expired = inv.expires.getTime() < NOW
                const days = Math.round(Math.abs(inv.expires.getTime() - NOW) / 86_400_000)
                return (
                  <ListRow
                    key={inv.id}
                    padded={false}
                    lead={<Avatar name={inv.email} size={28} />}
                    title={inv.email}
                    meta={`${roleLabel(inv.roleId)} · ${storesLabel(inv.stores)} · door ${
                      first(nameOf(inv.invitedBy) ?? "")
                    } · verstuurd ${relative(inv.sent)}`}
                    trail={
                      <>
                        {expired
                          ? <Status tone="warn">Verlopen</Status>
                          : <span className="hidden text-ink-3 sm:inline">verloopt over {days} dagen</span>}
                        {edit && (
                          <>
                            <Button size="sm" onClick={() => resend(inv)}>
                              {expired ? "Opnieuw versturen" : "Herinneren"}
                            </Button>
                            <DropdownMenu
                              label={`Uitnodiging aan ${inv.email}`}
                              placement="bottom-end"
                              trigger={(props) => (
                                <button
                                  {...props}
                                  type="button"
                                  aria-label="Meer"
                                  className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                              )}
                            >
                              <DropdownItem
                                onSelect={() => {
                                  void navigator.clipboard?.writeText(`https://app.goinsyte.com/join/${inv.id}`).catch(
                                    () => undefined
                                  )
                                  toast({ title: "Link gekopieerd", tone: "good" })
                                }}
                              >
                                Link kopiëren
                              </DropdownItem>
                              <DropdownSeparator />
                              <DropdownItem tone="danger" onSelect={() => revoke(inv)}>Intrekken</DropdownItem>
                            </DropdownMenu>
                          </>
                        )}
                      </>
                    }
                  />
                )
              })}
            </List>
          )}
      </PageSection>

      <SettingsSection
        id="link"
        title="Uitnodigen via link"
        description="Wie de link opent, komt binnen met de rol die je kiest. Handig voor een tijdelijke kracht; zet hem uit als niemand hem meer nodig heeft."
      >
        <SettingRow
          title={link.on ? "Link staat aan" : "Link staat uit"}
          description={link.on
            ? `${INVITE_LINK.joined} persoon kwam via deze link binnen.`
            : "Niemand kan via een link binnenkomen."}
          control={
            <Toggle
              label="Uitnodigen via link"
              on={link.on}
              disabled={!edit}
              onChange={(on) => {
                setLink({ ...link, on })
                toast({ title: on ? "Link staat aan" : "Link staat uit", tone: on ? "good" : "neutral" })
              }}
            />
          }
        />
        {link.on && (
          <>
            <SettingRow
              title="Rol"
              htmlFor="link-role"
              control={
                <Select
                  id="link-role"
                  className="w-48"
                  disabled={!edit}
                  value={link.roleId}
                  onChange={(e) => setLink({ ...link, roleId: e.target.value })}
                >
                  {ROLES.filter((r) => r.id !== "eigenaar").map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </Select>
              }
            />
            <SettingRow
              title="Geldig"
              htmlFor="link-days"
              control={
                <Select
                  id="link-days"
                  className="w-48"
                  disabled={!edit}
                  value={link.days}
                  onChange={(e) => setLink({ ...link, days: e.target.value })}
                >
                  {LINK_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              }
            />
            <SettingRow
              title="Link"
              stack
              control={
                <div className="flex w-full flex-wrap items-center justify-between gap-2 pb-1">
                  <CopyValue value={linkUrl} label="Link" className="min-w-0 flex-1" />
                  {edit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setLink({ ...link, token: Math.random().toString(36).slice(2, 10) })
                        toast({ title: "Nieuwe link gemaakt", body: "De vorige link werkt niet meer.", tone: "good" })
                      }}
                    >
                      Nieuwe link maken
                    </Button>
                  )}
                </div>
              }
            />
          </>
        )}
      </SettingsSection>

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onInvite={(inv) => {
          setInvites((all) => [inv, ...all])
          setInviting(false)
          toast({ title: `Uitnodiging verstuurd naar ${inv.email}`, body: "De link is 7 dagen geldig.", tone: "good" })
        }}
      />
      <RoleDialog
        member={roleFor}
        onClose={() => setRoleFor(null)}
        onSave={(m, roleId) => {
          setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, roleId } : x)))
          setRoleFor(null)
          toast({ title: `${first(m.name)} is nu ${roleLabel(roleId)}`, tone: "good" })
        }}
      />
    </SettingsPage>
  )
}

function MemberTable({ rows, edit, onRole, onActive }: {
  readonly rows: ReadonlyArray<Member>
  readonly edit: boolean
  readonly onRole: (m: Member) => void
  readonly onActive: (m: Member, active: boolean) => void
}) {
  return (
    <Table label="Teamleden" minWidth={760}>
      <THead>
        <Th>Teamlid</Th>
        <Th>Rol</Th>
        <Th>Winkels</Th>
        <Th>Laatst actief</Th>
        <Th>Uitgenodigd door</Th>
        <Th>Status</Th>
        <Th width={44}>
          <span className="sr-only">Acties</span>
        </Th>
      </THead>
      <TBody>
        {rows.map((m) => (
          <Tr
            key={m.id}
            onOpen={m.id.startsWith("busy-") ? undefined : () => navigate(paths.person(m.id))}
          >
            <Td header>
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={m.name} size={28} presence={m.presence} />
                <span className="flex min-w-0 flex-col">
                  {m.id.startsWith("busy-")
                    ? <span className="truncate text-sm text-ink">{m.name}</span>
                    : (
                      <Link to={paths.person(m.id)} className="truncate text-sm text-ink hover:underline">
                        {m.name}
                      </Link>
                    )}
                  <span className="truncate text-xs text-ink-3">{m.email}</span>
                </span>
              </span>
            </Td>
            <Td>{roleLabel(m.roleId)}</Td>
            <Td>{m.stores === "all" ? "Alle" : `${m.stores.length} van ${STORES.length}`}</Td>
            <Td muted>{m.presence === "online" ? "Nu" : relative(m.lastSeen)}</Td>
            <Td muted>{m.roleId === "eigenaar" ? "Maakte de werkruimte" : nameOf(m.invitedBy) ?? "—"}</Td>
            <Td>
              {m.deactivated === true
                ? <Status tone="neutral">Gedeactiveerd</Status>
                : <Status tone="good">Actief</Status>}
            </Td>
            <Td align="right">
              {m.roleId === "eigenaar" || m.id === PEOPLE.elena.id
                ? <Tag>Eigenaar</Tag>
                : (
                  <DropdownMenu
                    label={`Acties voor ${m.name}`}
                    placement="bottom-end"
                    trigger={(props) => (
                      <button
                        {...props}
                        type="button"
                        aria-label={`Acties voor ${m.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    )}
                  >
                    {m.id.startsWith("busy-")
                      ? null
                      : <DropdownItem onSelect={() => navigate(paths.person(m.id))}>Openen</DropdownItem>}
                    <DropdownItem disabled={!edit} onSelect={() => onRole(m)}>Rol wijzigen</DropdownItem>
                    <DropdownSeparator />
                    {m.deactivated === true
                      ? <DropdownItem disabled={!edit} onSelect={() => onActive(m, true)}>Weer activeren</DropdownItem>
                      : (
                        <DropdownItem tone="danger" disabled={!edit} onSelect={() => onActive(m, false)}>
                          Deactiveren
                        </DropdownItem>
                      )}
                  </DropdownMenu>
                )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

function InviteDialog({ open, onClose, onInvite }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly onInvite: (inv: Invite) => void
}) {
  const [email, setEmail] = useState("")
  const [roleId, setRoleId] = useState("klantenservice")
  const [stores, setStores] = useState<ReadonlyArray<string>>(STORES.filter((s) => s.connected).map((s) => s.id))
  const [message, setMessage] = useState("")
  const [tried, setTried] = useState(false)
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const send = () => {
    setTried(true)
    if (!valid || stores.length === 0) return
    onInvite({
      id: `inv_${Math.random().toString(36).slice(2, 10)}`,
      email: email.trim(),
      roleId,
      stores,
      invitedBy: PEOPLE.elena.id,
      sent: new Date(NOW),
      expires: new Date(NOW + 7 * 86_400_000),
      ...(message.trim() === "" ? {} : { message: message.trim() })
    })
    setEmail("")
    setMessage("")
    setTried(false)
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Collega uitnodigen"
      description="Ze krijgen een mail met een link die 7 dagen geldig is. De rol bepaalt wat ze zien en mogen."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={send}>Uitnodiging versturen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="E-mailadres" error={tried && !valid ? "Vul een geldig e-mailadres in" : undefined}>
          {(c) => (
            <Input
              {...c}
              type="email"
              placeholder="naam@northwindclothing.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Rol" hint={ROLES.find((r) => r.id === roleId)?.description}>
          {(c) => (
            <Select {...c} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {ROLES.filter((r) => r.id !== "eigenaar").map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-ink">Winkels</legend>
          {STORES.map((s) => (
            <Checkbox
              key={s.id}
              label={s.name}
              description={s.connected ? undefined : "Ontkoppeld"}
              checked={stores.includes(s.id)}
              onChange={(on) => setStores((all) => (on ? [...all, s.id] : all.filter((x) => x !== s.id)))}
            />
          ))}
          {tried && stores.length === 0 && <p className="text-xs text-bad-ink">Kies minstens één winkel</p>}
        </fieldset>
        <Field label="Bericht" optional>
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              placeholder="Begin met de tickets die aan jou zijn toegewezen."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

export function RoleDialog({ member: m, onClose, onSave }: {
  readonly member: Member | null
  readonly onClose: () => void
  readonly onSave: (m: Member, roleId: string) => void
}) {
  const [roleId, setRoleId] = useState<string | null>(null)
  const current = roleId ?? m?.roleId ?? "alleen-lezen"
  return (
    <Dialog
      open={m !== null}
      onClose={() => {
        setRoleId(null)
        onClose()
      }}
      title={m === null ? "Rol wijzigen" : `Rol van ${m.name}`}
      description="De nieuwe rol geldt meteen, ook in een sessie die al openstaat."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={m === null || current === m.roleId}
            onClick={() => {
              if (m !== null) onSave(m, current)
              setRoleId(null)
            }}
          >
            Opslaan
          </Button>
        </>
      }
    >
      <Field label="Rol" hint={ROLES.find((r) => r.id === current)?.description}>
        {(c) => (
          <Select {...c} value={current} onChange={(e) => setRoleId(e.target.value)}>
            {ROLES.filter((r) => r.id !== "eigenaar").map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        )}
      </Field>
    </Dialog>
  )
}
