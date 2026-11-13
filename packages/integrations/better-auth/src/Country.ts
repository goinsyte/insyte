/**
 * The visitor's country as Cloudflare saw it (`cf-ipcountry`, set on the console's request and forwarded by the service
 * binding): two letters, or nothing where it has none (locally, or `XX`/`T1` for unknown and Tor). Apart from
 * `Auth.ts` so the Worker can read it without loading better-auth (`BetterAuth.ts`).
 */
export const countryOf = (headers: Headers | undefined) => {
  const country = headers?.get("cf-ipcountry")?.toUpperCase()
  return country !== undefined && /^[A-Z]{2}$/.test(country) && country !== "XX" ? country : null
}
