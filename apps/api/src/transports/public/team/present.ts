import type { Team } from "@insyte/modules/members/domain/Team"
import type { Roles } from "@insyte/modules/roles/domain/Roles"
import { iso } from "../shared/time.ts"

/* The team in the public shape (M19.2): its members and its roles, each area's level as a word. */

const ACCESS = ["none", "read", "write", "manage"] as const

export const membersV1 = (team: Team) => ({
  data: team.members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: { id: m.roleId, label: m.roleLabel },
    status: m.deactivated ? "deactivated" as const : "active" as const,
    joined_at: iso(m.joinedAt)!,
    last_active_at: iso(m.lastActiveAt)
  }))
})

export const rolesV1 = (list: Roles) => ({
  data: list.roles.map((r) => ({
    id: r.id,
    label: r.label,
    system: r.system,
    access: Object.fromEntries(Object.entries(r.levels).map(([area, level]) => [area, ACCESS[level]!]))
  }))
})
