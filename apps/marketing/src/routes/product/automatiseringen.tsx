import { productMeta, ProductPage } from "@insyte/ui/marketing/pages/product"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../../links.ts"
import { meta } from "../../meta.ts"

export const Route = createFileRoute("/product/automatiseringen")({
  head: () => ({ ...meta({ path: "/product/automatiseringen", ...productMeta("automatiseringen") }) }),
  component: () => <ProductPage links={siteLinks} area="automatiseringen" />
})
