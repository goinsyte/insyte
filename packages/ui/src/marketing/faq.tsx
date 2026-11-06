import { HOME_FAQ } from "./faq-data.ts"
import { Frame } from "./frame.tsx"
import { useMarketingLinks } from "./links.tsx"
import { QuestionList } from "./pages/accordion.tsx"
import { ArrowLink } from "./parts.tsx"

/*
 * The homepage's short list of questions. The questions and answers live in `faq-data.ts`, which
 * /vragen reads in full, so the two never disagree.
 */
export function Faq() {
  const links = useMarketingLinks()
  return (
    <section id="vragen" aria-labelledby="vragen-kop" className="bg-glacier">
      <Frame inner="py-24 sm:py-32">
        <div className="mx-auto max-w-[816px]">
          <h2 id="vragen-kop" className="text-center font-medium text-4xl text-ink sm:text-display-sm">
            Vragen
          </h2>
          <QuestionList items={HOME_FAQ} size="xl" className="mt-14" />
          <div className="mt-8 flex justify-center">
            <ArrowLink href={links.page("/vragen")}>Alle vragen</ArrowLink>
          </div>
        </div>
      </Frame>
    </section>
  )
}
