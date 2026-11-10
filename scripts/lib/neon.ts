import { STAGES } from "../../infra/stages.ts"

/*
 * The read-write host of a Neon branch in the project the previews live in (nonprod, `infra/stages.ts`; NEON_PROJECT_ID
 * overrides it), from Neon's API with NEON_API_KEY. Prints and returns the host only, never a secret.
 */
export const branchHost = async (name: string): Promise<string> => {
  const key = process.env["NEON_API_KEY"]
  const project = process.env["NEON_PROJECT_ID"] ?? STAGES.preview.neonProjectId
  if (key === undefined) throw new Error("needs NEON_API_KEY")
  const api = async <T>(path: string): Promise<T> => {
    const response = await fetch(`https://console.neon.tech/api/v2/projects/${project}${path}`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" }
    })
    if (!response.ok) throw new Error(`Neon ${path}: ${response.status}`)
    return response.json() as Promise<T>
  }
  const { branches } = await api<{ branches: Array<{ id: string; name: string }> }>(
    `/branches?search=${encodeURIComponent(name)}`
  )
  const branch = branches.find((b) => b.name === name)
  if (branch === undefined) throw new Error(`no branch named ${name}`)
  const { endpoints } = await api<{ endpoints: Array<{ host: string; type: string }> }>(
    `/branches/${branch.id}/endpoints`
  )
  const host = endpoints.find((e) => e.type === "read_write")?.host
  if (host === undefined) throw new Error(`branch ${name} has no read-write compute`)
  return host
}
