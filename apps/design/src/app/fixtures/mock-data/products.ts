import { byScenario } from "../scenario";
import { CATALOG } from "./product-catalog";
import type { Product } from "@insyte/ui/app/lib/types/domain";

const RAW: Array<{
	title: string;
	price: number;
	cost: number;
	stock: number;
	supplier: string;
	tags: string[];
	status?: "active" | "draft" | "archived";
}> = [
	{
		title: "Aurora Hooded Fleece",
		price: 89,
		cost: 32,
		stock: 412,
		supplier: "sup_allure",
		tags: ["bestseller"],
	},
	{
		title: "Coastline Bomber Jacket",
		price: 145,
		cost: 58,
		stock: 87,
		supplier: "sup_allure",
		tags: ["nieuw"],
	},
	{
		title: "Mariner Wool Beanie",
		price: 35,
		cost: 9,
		stock: 1240,
		supplier: "sup_dpc",
		tags: [],
	},
	{
		title: "Drift Crewneck",
		price: 65,
		cost: 22,
		stock: 60,
		supplier: "sup_allure",
		tags: ["bestseller"],
	},
	{
		title: "Field Pant · Olive",
		price: 110,
		cost: 38,
		stock: 230,
		supplier: "sup_dpc",
		tags: [],
	},
	{
		title: "Field Pant · Stone",
		price: 110,
		cost: 38,
		stock: 0,
		supplier: "sup_dpc",
		tags: ["nabestelling"],
	},
	{
		title: "Skyline Tote",
		price: 55,
		cost: 14,
		stock: 540,
		supplier: "sup_kestrel",
		tags: [],
	},
	{
		title: "Anchor Belt · Tan",
		price: 48,
		cost: 16,
		stock: 320,
		supplier: "sup_kestrel",
		tags: [],
	},
	{
		title: "Trailhead Shorts",
		price: 70,
		cost: 24,
		stock: 180,
		supplier: "sup_allure",
		tags: ["zomer"],
	},
	{
		title: "Boulevard Linen Shirt",
		price: 95,
		cost: 32,
		stock: 96,
		supplier: "sup_allure",
		tags: ["nieuw"],
	},
	{
		title: "Harbor Raincoat",
		price: 220,
		cost: 80,
		stock: 42,
		supplier: "sup_allure",
		tags: ["bestseller"],
	},
	{
		title: "Sailor Stripe Tee",
		price: 38,
		cost: 11,
		stock: 920,
		supplier: "sup_dpc",
		tags: [],
	},
	{
		title: "Cloud Joggers",
		price: 82,
		cost: 28,
		stock: 210,
		supplier: "sup_allure",
		tags: [],
	},
	{
		title: "Meridian Daypack",
		price: 120,
		cost: 40,
		stock: 64,
		supplier: "sup_kestrel",
		tags: ["bestseller"],
	},
	{
		title: "Switchback Cap",
		price: 32,
		cost: 8,
		stock: 1100,
		supplier: "sup_kestrel",
		tags: [],
	},
	{
		title: "Heartland Henley",
		price: 58,
		cost: 18,
		stock: 320,
		supplier: "sup_dpc",
		tags: [],
	},
	{
		title: "Pacific Sandal",
		price: 78,
		cost: 24,
		stock: 0,
		supplier: "sup_blackcedar",
		tags: ["nabestelling"],
		status: "draft",
	},
	{
		title: "Sequoia Flannel",
		price: 92,
		cost: 30,
		stock: 215,
		supplier: "sup_dpc",
		tags: [],
	},
	{
		title: "Cascade Puffer",
		price: 235,
		cost: 90,
		stock: 38,
		supplier: "sup_allure",
		tags: ["beperkte oplage"],
	},
	{
		title: "Granite Wallet",
		price: 65,
		cost: 18,
		stock: 410,
		supplier: "sup_kestrel",
		tags: [],
	},
];

const LONG = [" · extra lange uitvoering in gerecycled materiaal", " · limited edition in samenwerking met lokale makers", " · winterversie met gewatteerde voering en capuchon"];
const BUSY_RAW: typeof RAW = Array.from({ length: 60 }, (_, i) => {
	const p = RAW[i % RAW.length]!;
	return { ...p, title: `${p.title}${LONG[i % LONG.length]}`, stock: (p.stock * (i + 3)) % 900 };
});

function catalogFor(title: string) {
	const base = Object.keys(CATALOG).find((k) => title === k || title.startsWith(`${k} · `));
	const c = base ? CATALOG[base] : undefined;
	return { title: c ? c.title + title.slice(base!.length) : title, images: c?.images ?? [], description: c?.description ?? "" };
}

const build = (raw: typeof RAW): Product[] => raw.map((p, i) => ({
	id: `prod_${2000 + i}`,
	store_id: "store_us",
	shopify_id: `gid://shopify/Product/${7000000 + i}`,
	// The busy week's extra rows carry a long suffix on a catalog title; the base is what the shop sells.
	...catalogFor(p.title),
	price: p.price,
	cost: p.cost,
	margin: ((p.price - p.cost) / p.price) * 100,
	currency: "USD",
	supplier_id: p.supplier,
	variants: [
		{
			id: `var_${2000 + i}_s`,
			product_id: `prod_${2000 + i}`,
			sku: `SKU-${2000 + i}-S`,
			title: "Klein",
			price: p.price,
			inventory_level: Math.floor(p.stock * 0.3),
			supplier_id: p.supplier,
		},
		{
			id: `var_${2000 + i}_m`,
			product_id: `prod_${2000 + i}`,
			sku: `SKU-${2000 + i}-M`,
			title: "Middel",
			price: p.price,
			inventory_level: Math.floor(p.stock * 0.4),
			supplier_id: p.supplier,
		},
		{
			id: `var_${2000 + i}_l`,
			product_id: `prod_${2000 + i}`,
			sku: `SKU-${2000 + i}-L`,
			title: "Groot",
			price: p.price,
			inventory_level: Math.floor(p.stock * 0.3),
			supplier_id: p.supplier,
		},
	],
	status: p.status ?? "active",
	tags: p.tags,
	created_at: `2025-${String(((i * 2) % 12) + 1).padStart(2, "0")}-12T09:00:00Z`,
}));

export const products: Product[] = byScenario({ empty: [], settled: build(RAW), busy: () => build([...RAW, ...BUSY_RAW]) });
