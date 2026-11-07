import { LOCAL_OWNER_URL } from "./local-db.ts"

/*
 * Where a script that changes the schema or its rows connects, as `insyte_owner` (migrations, the seed): the compose
 * database (`--local`), a Neon branch by host (`--host`, with INSYTE_OWNER_DB_PASSWORD), or DATABASE_URL_OWNER.
 */

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

/** The owner's URL for a branch's host, with the password from INSYTE_OWNER_DB_PASSWORD. */
export const ownerUrlFor = (host: string, password: string) =>
  `postgresql://insyte_owner:${encodeURIComponent(password)}@${host}/insyte?sslmode=require`

export const ownerUrl = (): { readonly environment: string | undefined; readonly url: string | undefined } => {
  const local = process.argv.includes("--local")
  const host = arg("--host")
  const password = process.env["INSYTE_OWNER_DB_PASSWORD"]
  return {
    environment: local ? "local" : arg("--env"),
    url: local
      ? LOCAL_OWNER_URL
      : host !== undefined && password !== undefined
      ? ownerUrlFor(host, password)
      : process.env["DATABASE_URL_OWNER"]
  }
}
