import { describe, expect, it } from "vitest"
import { parseMail, textOfHtml } from "../src/platform/InboundMail.ts"

/*
 * What a raw mail becomes before the inbox stores it (M11 step 1): the encodings real clients send (encoded words,
 * quoted-printable Latin-1, base64 UTF-8), multipart bodies, groups, the threading headers and attachments.
 */

const crlf = (lines: ReadonlyArray<string>) => lines.join("\r\n")

describe("an inbound mail", () => {
  it("reads encoded words, quoted-printable Latin-1 and the threading headers", async () => {
    const mail = await parseMail(crlf([
      "From: =?UTF-8?B?Sm9zw6kgR2FyY8OtYQ==?= <Jose@Voorbeeld.NL>",
      "To: Support <support@winkel.nl>, Iemand <iemand@winkel.nl>",
      "Cc: Team: Anna <anna@winkel.nl>, Bram <bram@winkel.nl>;",
      "Subject: =?ISO-8859-1?Q?Retour_van_mijn_jas_=E9n_sjaal?=",
      "Message-ID: <abc@client.example>",
      "In-Reply-To: <een@winkel.nl>",
      "References: <nul@winkel.nl>\r\n <een@winkel.nl>",
      "Date: Tue, 10 Nov 2026 10:00:00 +0100",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=iso-8859-1",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Graag ruil ik mijn jas voor een maat groter. Dank u wel, Jos=E9",
      ""
    ]))
    expect(mail).toMatchObject({
      messageId: "<abc@client.example>",
      inReplyTo: "<een@winkel.nl>",
      references: ["<nul@winkel.nl>", "<een@winkel.nl>"],
      from: { name: "José García", email: "Jose@Voorbeeld.NL" },
      subject: "Retour van mijn jas én sjaal",
      text: "Graag ruil ik mijn jas voor een maat groter. Dank u wel, José",
      html: null,
      attachments: []
    })
    expect(mail.to.map((a) => a.email)).toEqual(["support@winkel.nl", "iemand@winkel.nl"])
    // A group is its members.
    expect(mail.cc.map((a) => a.email)).toEqual(["anna@winkel.nl", "bram@winkel.nl"])
    expect(mail.date?.toISOString()).toBe("2026-11-10T09:00:00.000Z")
  })

  it("takes the text part of an alternative body, keeps the HTML, and keeps attachments with their kind", async () => {
    const mail = await parseMail(crlf([
      "From: klant@voorbeeld.nl",
      "To: support@winkel.nl",
      "Subject: Factuur",
      "MIME-Version: 1.0",
      "Content-Type: multipart/mixed; boundary=\"m\"",
      "",
      "--m",
      "Content-Type: multipart/alternative; boundary=\"a\"",
      "",
      "--a",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      "SGllcmJpaiBkZSBmYWN0dXVyIOKCrCA0OSw5NS4=",
      "--a",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Hierbij de factuur &euro; 49,95.</p>",
      "--a--",
      "--m",
      "Content-Type: application/pdf; name=factuur.pdf",
      "Content-Disposition: attachment; filename=factuur.pdf",
      "Content-Transfer-Encoding: base64",
      "",
      "JVBERi0xLjQK",
      "--m",
      "Content-Type: image/png",
      "Content-Disposition: inline; filename=logo.png",
      "Content-ID: <logo@winkel>",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
      "--m--",
      ""
    ]))
    expect(mail.text).toBe("Hierbij de factuur € 49,95.")
    expect(mail.html).toContain("<p>Hierbij de factuur")
    expect(mail.attachments.map((a) => ({ ...a, bytes: a.bytes.byteLength }))).toEqual([
      { filename: "factuur.pdf", mime: "application/pdf", bytes: 9, inline: false, contentId: null },
      { filename: "logo.png", mime: "image/png", bytes: 8, inline: true, contentId: "<logo@winkel>" }
    ])
  })

  it("makes text of a body that is HTML only, and stands in for what a mail leaves out", async () => {
    const mail = await parseMail(crlf([
      "To: support@winkel.nl",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<html><head><style>p{}</style></head><body><p>Regel een</p><p>Regel&nbsp;twee &amp; drie</p></body></html>"
    ]))
    expect(mail.from).toEqual({ name: "", email: "onbekend@onbekend" })
    expect(mail.subject).toBe("")
    expect(mail.messageId).toBeNull()
    expect(mail.date).toBeNull()
    expect(mail.text).toContain("Regel een")
    expect(mail.text).toContain("twee & drie")
    expect(textOfHtml("<div>a</div><br>b<script>x</script>")).toBe("a\n\nb")
  })
})
