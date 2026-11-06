import { productMeta, ProductPage } from "@insyte/ui/marketing/pages/product"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../../links.ts"
import { meta } from "../../meta.ts"

export const Route = createFileRoute("/product/insyte-ai")({
  head: () => ({ ...meta({ path: "/product/insyte-ai", ...productMeta("insyte-ai") }) }),
  component: () => <ProductPage links={siteLinks} area="insyte-ai" />
})
