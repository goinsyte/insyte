import { productMeta, ProductPage } from "@insyte/ui/marketing/pages/product"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../../links.ts"
import { meta } from "../../meta.ts"

export const Route = createFileRoute("/product/chargebacks")({
  head: () => ({ ...meta({ path: "/product/chargebacks", ...productMeta("chargebacks") }) }),
  component: () => <ProductPage links={siteLinks} area="chargebacks" />
})
