import { type ComponentType, createContext, useContext } from "react";
import type { Stock } from "../lib/catalog";
import type { Product } from "../lib/types/domain";
import type { IndexItem } from "../marketing-sections/link-index";
import type { Facet, RowAction } from "../table/data-table";

/**
 * What the products list reads and does, from whoever hosts it: the design app from its demo stores, the console from
 * `Products.list` (M6.4). The list's markup is the design's; the figures beside each product (stock, cost, margin,
 * supplier, delivery time, rating) are the host's, and a column the host has no figure for is hidden (`hidden`), as
 * domain.md says of "Beoordeling" until a reviews source exists.
 */

export type TeamGate = { ok: boolean; reason: string };

/** A product as the list shows it. */
export type ProductRow = Product & {
	stock: Stock;
	category: string;
	margin: number;
	supplierName: string;
	avgDelivery: string;
	feedback: string;
	sku: string;
};

export interface ProductsSource {
	products: ReadonlyArray<Product>;
	loading: boolean;
	/** The row's figures; `index` is the product's place in the list. */
	rowOf: (product: Product, index: number) => ProductRow;
	/** The line beside the title, from the rows. */
	standing: (rows: ReadonlyArray<ProductRow>) => string | undefined;
	/** What the returns queue and the quality checks say about a product (the panel's Aandacht cuts). */
	attentionOf: (product: Product) => { returnHigh: boolean; complaints: number; checkRunning: boolean };
	facets: ReadonlyArray<Facet>;
	/** Columns the host has no figures for. */
	hidden: ReadonlyArray<string>;
	actions: (openMargins: (rows: ProductRow[]) => void) => ReadonlyArray<RowAction<ProductRow>>;
	canCreate: TeamGate;
	NewProduct?: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void }> | undefined;
	Margin?: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; picked: ProductRow[] }> | undefined;
	LowStock?: ComponentType<{ products: Product[] }> | undefined;
	/** Whether the categories view (`?view=categories`) has its figures. */
	categories: boolean;
	starts?: IndexItem[] | undefined;
	Closing?: ComponentType<{ empty: boolean }> | undefined;
	open?: ((product: ProductRow) => void) | undefined;
}

const ProductsSourceContext = createContext<ProductsSource | null>(null);

export const ProductsSourceProvider = ProductsSourceContext.Provider;

export function useProductsSource(): ProductsSource {
	const source = useContext(ProductsSourceContext);
	if (source === null) throw new Error("A products screen needs a ProductsSourceProvider around it.");
	return source;
}
