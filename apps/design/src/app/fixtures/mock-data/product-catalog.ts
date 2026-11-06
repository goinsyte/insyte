/*
 * The shop-facing side of each product: its Dutch title, the copy on its product page and its
 * photographs (Unsplash, free licence). Keyed by the working title the mock catalogue uses, so the
 * two can be merged without touching ids.
 */

const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&q=80&auto=format&fit=crop`;

export const CATALOG: Record<string, { title: string; description: string; images: string[] }> = {
	"Aurora Hooded Fleece": {
		title: "Aurora fleece met capuchon",
		description:
			"Zachte fleece hoodie van geborsteld katoen met een gevoerde capuchon en een ruime buidelzak. Valt los en iets langer, zodat je er makkelijk een shirt onder draagt. Wasbaar op 30 graden.",
		images: [img("1620799140188-3b2a02fd9a77"), img("1592485641225-bdbadeaa601e"), img("1564557287817-3785e38ec1f5")],
	},
	"Coastline Bomber Jacket": {
		title: "Coastline bomberjack",
		description:
			"Licht bomberjack van gerecycled nylon met geribde boorden aan hals, mouwen en zoom. Een dunne voering maakt hem geschikt voor voorjaar en najaar. Normale pasvorm; neem je gewone maat.",
		images: [img("1591047139829-d91aecb6caea"), img("1760126070359-5b82710274fe")],
	},
	"Mariner Wool Beanie": {
		title: "Mariner wollen muts",
		description:
			"Grofgebreide muts van merinowol met een brede omslag. Warm zonder te kriebelen en blijft goed zitten, ook als het waait. Eén maat, rekt mee.",
		images: [img("1576871337632-b9aef4c17ab9"), img("1606453914790-b9be7cdb321f"), img("1664289321749-07316ab5e374")],
	},
	"Drift Crewneck": {
		title: "Drift sweater met ronde hals",
		description:
			"Sweater met ronde hals van zwaar katoen met een zachte binnenkant. Recht model met geribde boorden die hun vorm houden, ook na vaak wassen. Draag hem los of over een overhemd.",
		images: [img("1620799140408-edc6dcb6d633"), img("1607160199580-1b0c9b736b66"), img("1614975059251-992f11792b9f")],
	},
	"Field Pant · Olive": {
		title: "Field broek · olijf",
		description:
			"Stevige broek van katoenen twill in olijfgroen, met een rechte pijp en ruime zakken. Het materiaal is licht voorgewassen en wordt bij elke wasbeurt soepeler. Lengtemaat 32.",
		images: [img("1789110519915-7548f7e2c0d8"), img("1652845008007-2a785735199c"), img("1789110853466-4a541d4183a3")],
	},
	"Field Pant · Stone": {
		title: "Field broek · steen",
		description:
			"Stevige broek van katoenen twill in een lichte steenkleur, met een rechte pijp en ruime zakken. Het materiaal is licht voorgewassen en wordt bij elke wasbeurt soepeler. Lengtemaat 32.",
		images: [img("1711443813147-def27861b9af"), img("1791573391881-98b6b072e7ff"), img("1789238052416-d6c439162025")],
	},
	"Skyline Tote": {
		title: "Skyline draagtas",
		description:
			"Ruime draagtas van dik canvas met lange hengsels, zodat je hem ook over je schouder draagt. Er past een laptop van 15 inch in, en binnenin zit een klein vak voor je sleutels.",
		images: [img("1574365569389-a10d488ca3fb"), img("1544816155-12df9643f363")],
	},
	"Anchor Belt · Tan": {
		title: "Anchor riem · cognac",
		description:
			"Riem van volnerf leer in cognac met een geborstelde metalen gesp. Het leer kleurt met de tijd iets donkerder. 3,5 cm breed, past door de lussen van de meeste broeken.",
		images: [img("1624222247344-550fb60583dc"), img("1711443982852-b3df5c563448"), img("1664286074176-5206ee5dc878")],
	},
	"Trailhead Shorts": {
		title: "Trailhead korte broek",
		description:
			"Korte broek van sneldrogende katoenmix met een elastische tailleband en koord. Licht genoeg voor warme dagen en wandelingen. Valt tot net boven de knie.",
		images: [img("1793083873431-24bcd8769e02"), img("1589431665783-99ede05457c6"), img("1629185752193-0d25bb978c04")],
	},
	"Boulevard Linen Shirt": {
		title: "Boulevard linnen overhemd",
		description:
			"Luchtig overhemd van puur linnen met korte mouwen en een kleine opstaande kraag. Linnen kreukt een beetje, en dat hoort zo. Iets ruimer gesneden voor een ontspannen pasvorm.",
		images: [img("1713881587420-113c1c43e28a"), img("1713881676551-b16f22ce4719"), img("1713881604560-085594ed2c3d")],
	},
	"Harbor Raincoat": {
		title: "Harbor regenjas",
		description:
			"Waterdichte regenjas met getapete naden en een verstelbare capuchon. Valt over de heupen en heeft ruimte voor een trui eronder. De ritszakken houden je telefoon droog.",
		images: [img("1527192250228-1ece59813102"), img("1567955465163-c355df3b74bf")],
	},
	"Sailor Stripe Tee": {
		title: "Sailor gestreept T-shirt",
		description:
			"T-shirt van zwaar katoenen jersey met een klassieke streep. Ronde hals, rechte pasvorm en een stof die niet doorschijnt. Krimpt niet in de was.",
		images: [img("1591224615614-e300d72e37c5"), img("1789110854245-20cc83c4ec51")],
	},
	"Cloud Joggers": {
		title: "Cloud joggingbroek",
		description:
			"Joggingbroek van zachte sweatstof met een elastische tailleband, koord en manchetten aan de enkels. Gemaakt voor thuis en onderweg. Normale pasvorm met iets taps toelopende pijpen.",
		images: [img("1602573991155-21f0143bb45c"), img("1779676086744-a83b1f0e00bd")],
	},
	"Meridian Daypack": {
		title: "Meridian rugzak",
		description:
			"Compacte rugzak van 20 liter met een gevoerd laptopvak en een ritsvak aan de voorkant. De schouderbanden zijn verstelbaar en licht gevoerd. Geschikt voor werk, school en dagtochten.",
		images: [img("1553062407-98eeb64c6a62"), img("1622560480605-d83c853bc5c3"), img("1680039211156-66c721b87625")],
	},
	"Switchback Cap": {
		title: "Switchback pet",
		description:
			"Pet van gewassen katoenen canvas met een voorgevormde klep. Met de verstelbare sluiting achterop past hij bijna iedereen. Licht genoeg om de hele dag te dragen.",
		images: [img("1521369909029-2afed882baee"), img("1691256676359-20e5c6d4bc92")],
	},
	"Heartland Henley": {
		title: "Heartland henley-shirt",
		description:
			"Shirt met lange mouwen en een knoopsluiting van drie knopen aan de hals, van gebreide katoenen wafelstof. Zit nauw zonder te knellen. Draag hem los of onder een overhemd.",
		images: [img("1774294067490-b7e2a5964cf5"), img("1629796164825-e79d309c9aed")],
	},
	"Pacific Sandal": {
		title: "Pacific sandaal",
		description:
			"Sandaal met twee verstelbare leren banden en een voetbed van kurk dat zich naar je voet vormt. De rubberen zool geeft grip op natte ondergrond. Valt normaal op maat.",
		images: [img("1758274406801-53151bcb4af7"), img("1628375385879-1af64230c2e1"), img("1596523027665-9da35ced2388")],
	},
	"Sequoia Flannel": {
		title: "Sequoia flanellen overhemd",
		description:
			"Overhemd van geborsteld katoenflanel met een ruit en twee borstzakken. Warm genoeg om in de herfst als jasje te dragen. Ruime pasvorm; wil je hem strakker, neem dan een maat kleiner.",
		images: [img("1760124128502-66d9ceaa418b"), img("1782226728289-f81457b760f5"), img("1782227286076-4f5153a8cdac")],
	},
	"Cascade Puffer": {
		title: "Cascade pufferjas",
		description:
			"Gewatteerde winterjas met een synthetische vulling die ook warm blijft als hij nat wordt. Hoge kraag, een capuchon en een waterafstotende buitenstof. Valt ruim, zodat er een dikke trui onder past.",
		images: [img("1614079290101-0c2181ac8ea3"), img("1769689387719-f11faac08cbe")],
	},
	"Granite Wallet": {
		title: "Granite portemonnee",
		description:
			"Dunne portemonnee van plantaardig gelooid leer met zes pasjesvakken en een vak voor briefgeld. Past makkelijk in je voorzak. Het leer krijgt na verloop van tijd een mooie glans.",
		images: [img("1620109176813-e91290f6c795"), img("1579014134953-1580d7f123f3"), img("1601592996763-f05c9c80a7f1")],
	},
};
