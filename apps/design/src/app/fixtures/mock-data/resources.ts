import type { AffiliateResource } from "@insyte/ui/data-source";
export type { AffiliateResource };


export const affiliateResources: AffiliateResource[] = [
	{
		id: "res_1",
		name: "Logopakket Northwind",
		kind: "logo",
		size: "2,4 MB · ZIP",
		updated_at: "2026-04-12T10:00:00Z",
	},
	{
		id: "res_2",
		name: "Lookbook voorjaar '26",
		kind: "image",
		size: "18 MB · ZIP",
		updated_at: "2026-03-22T10:00:00Z",
	},
	{
		id: "res_3",
		name: "Productreels Aurora fleece",
		kind: "video",
		size: "240 MB · MP4",
		updated_at: "2026-04-01T10:00:00Z",
	},
	{
		id: "res_4",
		name: "Gids voor merkstem en boodschap",
		kind: "doc",
		size: "1,1 MB · PDF",
		updated_at: "2026-02-20T10:00:00Z",
	},
	{
		id: "res_5",
		name: "Affiliatehandboek 2026",
		kind: "guide",
		size: "3,2 MB · PDF",
		updated_at: "2026-01-08T10:00:00Z",
	},
	{
		id: "res_6",
		name: "Kant-en-klare captions voor social",
		kind: "doc",
		size: "120 KB · DOCX",
		updated_at: "2026-04-30T10:00:00Z",
	},
];

export const affiliateFaqs = [
	{
		q: "Wanneer worden uitbetalingen gedaan?",
		a: "Uitbetalingen worden op de 15e van elke maand beoordeeld en binnen 5 werkdagen uitbetaald via PayPal of bankoverschrijving.",
	},
	{
		q: "Mag ik betaalde advertenties draaien op Northwind-zoekwoorden?",
		a: "Nee · bieden op zoekwoorden met de merknaam Northwind is niet toegestaan en kan leiden tot schorsing van je account.",
	},
	{
		q: "Hoelang blijven doorverwijscookies geldig?",
		a: "30 dagen vanaf de eerste klik. Koopt een klant binnen die periode, dan wordt de conversie aan jou toegeschreven.",
	},
];
