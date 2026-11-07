import { createCsrfMiddleware, createStart } from "@tanstack/react-start"

/**
 * Every route server-rendered (11 §1). Writing this file turns off Start's automatic CSRF middleware for server
 * functions, so it is put back; the console uses none for data, but nothing may slip in unprotected.
 */
export const startInstance = createStart(() => ({
  defaultSsr: true,
  requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })]
}))
