import { describe, expect, it } from "vitest"
import { sizedImage } from "../src/app/lib/image.ts"

/* A photograph is asked for at twice the size it is shown, from the CDNs that resize; anything else is left alone. */

describe("a photograph at the size it is shown", () => {
  it("asks Shopify's CDN and Unsplash for twice the width", () => {
    expect(sizedImage("https://cdn.shopify.com/s/files/1/0001/products/shirt.jpg?v=17", 48)).toBe(
      "https://cdn.shopify.com/s/files/1/0001/products/shirt.jpg?v=17&width=96"
    )
    expect(sizedImage("https://images.unsplash.com/photo-1?w=900&q=80", 64)).toBe(
      "https://images.unsplash.com/photo-1?w=128&q=80"
    )
  })

  it("leaves any other address, and one that is not a URL, as it is", () => {
    expect(sizedImage("https://example.com/a.jpg", 48)).toBe("https://example.com/a.jpg")
    expect(sizedImage("/local.png", 48)).toBe("/local.png")
  })
})
