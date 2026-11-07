/*
 * Prints the read-write host of a Neon branch, for the steps that follow a preview's deploy (migrations, smoke).
 *
 *   bun scripts/neon-branch-host.ts <branch name>      with NEON_API_KEY and NEON_PROJECT_ID set
 *
 * Reads Neon's API directly: no secret is printed, only the host.
 */
const name = process.argv[2]
const key = process.env["NEON_API_KEY"]
const project = process.env["NEON_PROJECT_ID"]
if (name === undefined || key === undefined || project === undefined) {
  console.error("neon-branch-host: needs a branch name, NEON_API_KEY and NEON_PROJECT_ID")
  process.exit(1)
}

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
if (branch === undefined) {
  console.error(`neon-branch-host: no branch named ${name}`)
  process.exit(1)
}
const { endpoints } = await api<{ endpoints: Array<{ host: string; type: string }> }>(
  `/branches/${branch.id}/endpoints`
)
const host = endpoints.find((e) => e.type === "read_write")?.host
if (host === undefined) {
  console.error(`neon-branch-host: branch ${name} has no read-write compute`)
  process.exit(1)
}
console.log(host)
