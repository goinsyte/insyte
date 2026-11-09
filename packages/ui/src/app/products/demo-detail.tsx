import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { suppliers } from "../../data-source"
import { Loader } from "../../icons"
import { useProduct } from "../hooks/use-operator-data"
import { categoryOf, sellThrough, stockOf, unitsOf } from "../lib/catalog"
import type { Product } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { QualityTab } from "../quality/quality-tab"
import { ProductReturns } from "../returns/product-returns"
import { useProductQuality } from "../stores/quality-store"
import { useWorkspace } from "../stores/workspace-store"
import { type ProductDetailSource, ProductDetailSourceProvider } from "./detail-source"
import { ProductDetail, type ProductSearch } from "./product-screen"

/*
 * One product's source in the design app: the demo workspace's product as the page read it before it had a source,
 * with its edits (saved with Undo), the simulated sync, the supplier's files and delivery time, the paused ads and the
 * quality tab (`?tab=quality&check=`).
 */

const Route = getRouteApi("/_admin/products/$productId")

export function DemoProductDetail() {
  const { productId } = Route.useParams()
  const { data: product, loading } = useProduct(productId)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader className="size-5 animate-spin text-ink-3" strokeWidth={2} />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-base text-ink-3">
          Dit product is niet gevonden. Misschien is het nog niet gesynchroniseerd.
        </p>
        <Link to="/products" className="text-base text-arc-ink hover:underline">
          Terug naar producten
        </Link>
      </div>
    )
  }

  return <DemoProduct product={product} />
}

function DemoProduct({ product }: { product: Product }) {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const quality = useProductQuality(product.id)
  const orders = useWorkspace((s) => s.orders)
  const adsPaused = useWorkspace((s) => s.productEdits[product.id]?.adsPaused === true)
  const leadDays = useWorkspace((s) => s.productEdits[product.id]?.leadDays)
  const media = useWorkspace((s) => s.productMedia[product.id]) ?? []
  const editProducts = useWorkspace((s) => s.editProducts)
  const restore = useWorkspace((s) => s.restoreProducts)
  const pace = sellThrough(product, orders)

  const source: ProductDetailSource = {
    product,
    categoryOf,
    stock: { units: unitsOf(product), daysLeft: pace.daysLeft, level: stockOf(product) },
    variantStock: (v) => v.inventory_level,
    shopifyUrl: `https://admin.shopify.com/products/${product.shopify_id}`,
    edit: {
      save: (draft) => {
        const before = useWorkspace.getState().productEdits
        editProducts({ [product.id]: draft })
        undoable(
          `${draft.title} opgeslagen`,
          () => restore(before),
          "Shopify neemt de nieuwe waarden over bij de volgende synchronisatie."
        )
      },
      sync: async () => {
        await new Promise((r) => setTimeout(r, 1100))
        toast.success("Product gesynchroniseerd vanuit Shopify", {
          description: "Prijs, voorraad en varianten zijn bijgewerkt."
        })
      },
      suppliers,
      leadDays,
      media,
      adsPaused,
      resumeAds: () => {
        const before = useWorkspace.getState().productEdits
        editProducts({ [product.id]: { adsPaused: false } })
        undoable(`Advertenties voor ${product.title} hervat`, () => restore(before))
      }
    },
    quality: {
      tab: search.tab ?? "overview",
      setTab: (id) =>
        void navigate(
          {
            to: ".",
            search: (prev: ProductSearch) => ({
              ...prev,
              tab: id === "quality" ? "quality" : undefined,
              check: undefined
            }),
            replace: true,
            state: (st: unknown) => st
          } as never
        ),
      submitted: quality.checks.filter((c) => c.status === "submitted").length,
      watching: quality.phase === "watch",
      Tab: ({ product: p }) => <QualityTab product={p} openCheck={search.check} />
    },
    Returns: ProductReturns
  }
  return (
    <ProductDetailSourceProvider value={source}>
      <ProductDetail />
    </ProductDetailSourceProvider>
  )
}
