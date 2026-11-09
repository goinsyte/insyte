/* What Shopify is asked when a customer changed in Insyte (M7.4; Admin GraphQL 2026-10). Tags go as for orders. */

export const CUSTOMER_CREATE = `mutation($input: CustomerInput!) {
  customerCreate(input: $input) { customer { id } userErrors { field message } }
}`

export const CUSTOMER_TAGS_ADD = `mutation($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
}`

export const CUSTOMER_TAGS_REMOVE = `mutation($id: ID!, $tags: [String!]!) {
  tagsRemove(id: $id, tags: $tags) { userErrors { field message } }
}`
