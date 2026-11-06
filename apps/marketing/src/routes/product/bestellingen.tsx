import { productMeta, ProductPage } from "@insyte/ui/marketing/pages/product"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../../links.ts"
import { meta } from "../../meta.ts"

export const Route = createFileRoute("/product/bestellingen")({
  head: () => ({ ...meta({ path: "/product/bestellingen", ...productMeta("bestellingen") }) }),
  component: () => <ProductPage links={siteLinks} area="bestellingen" />
})
