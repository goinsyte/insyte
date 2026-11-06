# Logos of the integrations, on the landing page

The landing page names the services Insyte connects to with their own marks, so an operator
recognises the software they already use. Every file here is a copy of the console's, taken from
`apps/console/public/logos/` on 28 October 2026 (now `apps/design/public/logos/`, ADR-0026); see
`apps/design/public/logos/BRON.md` for the source of each. Each mark is the property of its owner and is used only to name the product Insyte
connects to (nominative use). Insyte is not affiliated with or endorsed by any of them.

| File                                                                | Source (as recorded in the console's BRON.md)                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `shopify.svg`, `paypal.svg`, `gmail.svg`                            | [gilbarbara/logos](https://github.com/gilbarbara/logos) (CC0)                                    |
| `slack.svg`, `microsoft.svg` (Microsoft 365), `microsoft-teams.svg` | [gilbarbara/logos](https://github.com/gilbarbara/logos) (CC0)                                    |
| `klarna.svg`, `dhl.svg`                                             | [Simple Icons](https://simpleicons.org) 15.22.0 (CC0) path on the brand's own ground and colours |
| `aftership.svg`, `google-sheets.svg`                                | Simple Icons 15.22.0 (CC0) path in the brand hex it records                                      |
| `outlook.png`, `postnl.png`                                         | Each company's own site icon via Google's favicon service at 128 px                              |

Left out on purpose, after review on 28 October 2026: Stripe (the Simple Icons "S" tile read as a
lookalike at small sizes), and Klaviyo, Exact Online, Sendcloud and Gorgias, whose only files were
low-resolution site favicons. Meta and WhatsApp are not named on the page. For a real launch,
replace every file with the vendor's official partner asset.

Added 31 October 2026 for the redesigned hero, the overview stage, the pricing comparison and the
"how it works" orbit (copied from `apps/console/public/logos/`, same sources as recorded there):

| File          | Source                                                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stripe.svg`  | Simple Icons 15.22.0 (CC0) path on Stripe's own `#635BFF` ground; shown at 28 px and up only, where it reads clearly                                                                                                                                                            |
| `zapier.svg`  | Simple Icons 15.22.0 (CC0) path in the brand hex it records                                                                                                                                                                                                                     |
| `klaviyo.png` | klaviyo.com's own site icon via Google's favicon service at 128 px; shown at 40 px and below only                                                                                                                                                                               |
| `google.svg`  | Google's "G" mark in its four published colours, the same paths the console's sign-in button draws (`packages/ui/src/app/onboarding/oauth-buttons.tsx`); used only on the "Toegang aanvragen met Google" action, which opens the access request where Google sign-in is offered |

Added 31 October 2026 for the integrations directory (`/koppelingen`), copied from
`apps/console/public/logos/` with the sources recorded there: `recharge.png`, `yotpo.png`,
`shipbob.png`, `gorgias.png`, `signifyd.png`, `okendo.png`, `postscript.png`, `loop-returns.png`,
`exact.png`, `sendcloud.png` (each company's own site icon via Google's favicon service; shown at
40 px and below only, `shipbob.png` and `postscript.png` at 32 px and below, since those sites
publish 48 px), `google-ads.svg` and `anthropic.svg` ([gilbarbara/logos](https://github.com/gilbarbara/logos), CC0).
