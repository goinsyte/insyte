import { paths } from "../router.tsx"
import { ButtonLink } from "../ui/button.tsx"
import { Page, PageHead } from "../ui/page.tsx"

/**
 * The placeholder an area shows until its pages are built: what will be here, and the page in the
 * current demo it is rebuilt from. Removed area by area as the real pages land.
 */
export function AreaStub({ title, from, path }: {
  readonly title: string
  /** The route in `/app` this page is rebuilt from. */
  readonly from: string
  readonly path: ReadonlyArray<string>
}) {
  return (
    <Page width="text">
      <PageHead
        title={title}
        after={path.length === 0 ? undefined : path.join(" / ")}
        meta={`Wordt opnieuw opgebouwd vanuit ${from} in de huidige demo.`}
      />
      <div className="flex flex-wrap gap-2">
        <ButtonLink to={paths.home} size="sm">Naar Start</ButtonLink>
      </div>
    </Page>
  )
}
