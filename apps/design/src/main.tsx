/**
 * The front door of the reference, and the only entry `index.html` loads.
 *
 * It reads the path and mounts ONE section, which brings its own router, its own stylesheet and its
 * own document classes. The sections never share a page: each stylesheet imports Tailwind and the
 * tokens itself (the token kit's is generated beside them), so loading two would emit the base
 * layer twice and repaint whichever came first. Moving between sections is a full page load,
 * which is also what each of them was before — three apps on three ports.
 *
 * `import.meta.glob` rather than four `import()` calls so each section is its own chunk AND so the
 * typechecker does not follow one section into another: the app and the brand book each register a
 * route tree, and those two declarations cannot share a program (see `tsconfig.json`).
 */
const productOnly = import.meta.env.VITE_PRODUCT_ONLY === true

/*
 * Product-only (every build, see `vite.config.ts`): the app is the one section, and any other path
 * goes to it. The literal condition lets the bundler drop the other branch, so the site, the brand
 * book and the front door are not in `dist/` at all, not merely unlinked.
 */
const sections = productOnly
  ? import.meta.glob(["./app/main.tsx"])
  : import.meta.glob([
    "./app/main.tsx",
    "./site/main.tsx",
    "./brand/main.tsx",
    "./brand/tokens.tsx",
    "./home/main.tsx"
  ])

const path = window.location.pathname
const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

if (productOnly && !under("/app")) window.location.replace("/app/dashboard")

const section = productOnly || under("/app")
  ? "./app/main.tsx"
  : under("/site")
  ? "./site/main.tsx"
  : under("/brand/tokens")
  ? "./brand/tokens.tsx"
  : under("/brand")
  ? "./brand/main.tsx"
  : "./home/main.tsx"

/** Each section's title and description, as its own document had them. */
const heads: Record<string, readonly [title: string, description?: string]> = {
  "./app/main.tsx": ["Insyte"],
  "./site/main.tsx": ["Insyte"],
  "./brand/main.tsx": [
    "Merkrichtlijnen · Insyte",
    "De merkrichtlijnen van Insyte: merk, logo, kleur, typografie, patronen en oppervlakken, iconen en illustraties, en beweging. Intern."
  ],
  "./brand/tokens.tsx": [
    "Design system — Insyte",
    "Colour, shape, type and motion, read from the tokens at build time rather than described beside them."
  ],
  "./home/main.tsx": ["Insyte · referentie"]
}

const [title, description] = heads[section] ?? []
if (title !== undefined) document.title = title
if (description !== undefined) document.querySelector("meta[name=description]")?.setAttribute("content", description)

const load = sections[section]
if (load === undefined) throw new Error(`no section at ${section}`)
void load()
