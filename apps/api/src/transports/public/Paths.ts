/*
 * What the public Worker answers (ADR-0041 step 5): the API Worker hands it exactly these (`Main.ts`), and the local
 * Worker routes them to it (`Local.ts`). A module of its own, so the API Worker reads it without loading the public API.
 */
export const isPublicPath = (pathname: string): boolean =>
  pathname === "/mcp" || pathname === "/v1" || pathname.startsWith("/v1/")
