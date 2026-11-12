/*
 * Neon's API for the project CI works in (NEON_PROJECT_ID), with NEON_API_KEY. Callers print hosts and names only,
 * never a secret.
 */
export const neonApi = async <T>(path: string, init?: { method: string; body: string }): Promise<T> => {
  const key = process.env["NEON_API_KEY"]
  const project = process.env["NEON_PROJECT_ID"]
  if (key === undefined || project === undefined) throw new Error("needs NEON_API_KEY and NEON_PROJECT_ID")
  const response = await fetch(`https://console.neon.tech/api/v2/projects/${project}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json",
      ...(init === undefined ? {} : { "content-type": "application/json" })
    },
    ...(init === undefined ? {} : { body: init.body })
  })
  if (!response.ok) throw new Error(`Neon ${path}: ${response.status}`)
  return response.json() as Promise<T>
}

/* The read-write host of a Neon branch. */
export const branchHost = async (name: string): Promise<string> => {
  const { branches } = await neonApi<{ branches: Array<{ id: string; name: string }> }>(
    `/branches?search=${encodeURIComponent(name)}`
  )
  const branch = branches.find((b) => b.name === name)
  if (branch === undefined) throw new Error(`no branch named ${name}`)
  const { endpoints } = await neonApi<{ endpoints: Array<{ host: string; type: string }> }>(
    `/branches/${branch.id}/endpoints`
  )
  const host = endpoints.find((e) => e.type === "read_write")?.host
  if (host === undefined) throw new Error(`branch ${name} has no read-write compute`)
  return host
}
