import type { ReactElement } from "react"
import type { Urls } from "../MailUrls.ts"
import ExistingAccount, * as existingAccount from "./auth/existing-account.tsx"
import NewSignIn, * as newSignIn from "./auth/new-sign-in.tsx"
import ResetPassword, * as resetPassword from "./auth/reset-password.tsx"
import SignInLocked, * as signInLocked from "./auth/sign-in-locked.tsx"
import VerifyEmail, * as verifyEmail from "./auth/verify-email.tsx"
import ConnectStoreNudge, * as connectStoreNudge from "./marketing/connect-store-nudge.tsx"
import ProductUpdate, * as productUpdate from "./marketing/product-update.tsx"
import ReEngagement, * as reEngagement from "./marketing/re-engagement.tsx"
import Welcome, * as welcome from "./marketing/welcome.tsx"
import AffiliatePayout, * as affiliatePayout from "./platform/affiliate-payout.tsx"
import BetaAccess, * as betaAccess from "./platform/beta-access.tsx"
import ConnectionIncident, * as connectionIncident from "./platform/connection-incident.tsx"
import DailyDigest, * as dailyDigest from "./platform/daily-digest.tsx"
import ExportReady, * as exportReady from "./platform/export-ready.tsx"
import GdprRequest, * as gdprRequest from "./platform/gdpr-request.tsx"
import Notification, * as notification from "./platform/notification.tsx"
import StatementReady, * as statementReady from "./platform/statement-ready.tsx"
import StoreSynced, * as storeSynced from "./platform/store-synced.tsx"
import SupplierDigest, * as supplierDigest from "./platform/supplier-digest.tsx"
import SupplierOrder, * as supplierOrder from "./platform/supplier-order.tsx"
import OrderDelayed, * as orderDelayed from "./shopper/order-delayed.tsx"
import ReturnApproved, * as returnApproved from "./shopper/return-approved.tsx"
import ReturnLabel, * as returnLabel from "./shopper/return-label.tsx"
import ReturnReceived, * as returnReceived from "./shopper/return-received.tsx"
import ReturnRejected, * as returnRejected from "./shopper/return-rejected.tsx"
import ReturnResolved, * as returnResolved from "./shopper/return-resolved.tsx"
import AffiliateInvite, * as affiliateInvite from "./team/affiliate-invite.tsx"
import CourseReminder, * as courseReminder from "./team/course-reminder.tsx"
import Invitation, * as invitation from "./team/invitation.tsx"
import SupplierInvite, * as supplierInvite from "./team/supplier-invite.tsx"

/*
 * Every mail Insyte sends, by kind: its template, its subject, which group it belongs to, whether a real send uses it
 * yet, and its preview props (the dev server's, and the tests', for any origin). The kinds the `Mailer` port names
 * (`auth.*`, `team.invite`, `supplier.order`, the shopper's `return.*` and `order.delayed`) are wired; the rest are
 * specified in docs/backend and wait for the slice that sends them. Marketing mails are templates only: nothing sends
 * them. The shopper's mails (M9.3, M10.2) are a store's to its customer, sent in the store's name.
 */

export type Group = "auth" | "team" | "platform" | "shopper" | "marketing"

export interface Email<P> {
  readonly group: Group
  /** A real send renders it today. */
  readonly wired: boolean
  readonly Template: (props: P) => ReactElement
  readonly subject: (props: P) => string
  readonly preview: (urls: Urls) => P
}

const email = <P>(
  group: Group,
  wired: boolean,
  Template: (props: P) => ReactElement,
  module: { readonly subject: (props: P) => string; readonly preview: (urls: Urls) => P }
): Email<P> => ({ group, wired, Template, subject: module.subject, preview: module.preview })

export const EMAILS = {
  "auth.verify": email("auth", true, VerifyEmail, verifyEmail),
  "auth.reset": email("auth", true, ResetPassword, resetPassword),
  "auth.signup_existing": email("auth", true, ExistingAccount, existingAccount),
  "auth.new_sign_in": email("auth", false, NewSignIn, newSignIn),
  "auth.sign_in_locked": email("auth", false, SignInLocked, signInLocked),

  "team.invite": email("team", true, Invitation, invitation),
  "team.supplier_invite": email("team", false, SupplierInvite, supplierInvite),
  "team.affiliate_invite": email("team", false, AffiliateInvite, affiliateInvite),
  "team.course_reminder": email("team", false, CourseReminder, courseReminder),

  "platform.beta_access": email("platform", false, BetaAccess, betaAccess),
  "platform.store_synced": email("platform", false, StoreSynced, storeSynced),
  "platform.connection_incident": email("platform", false, ConnectionIncident, connectionIncident),
  "platform.notification": email("platform", true, Notification, notification),
  "platform.daily_digest": email("platform", true, DailyDigest, dailyDigest),
  "platform.gdpr_request": email("platform", false, GdprRequest, gdprRequest),
  "platform.export_ready": email("platform", false, ExportReady, exportReady),
  "platform.supplier_digest": email("platform", false, SupplierDigest, supplierDigest),
  "supplier.order": email("platform", true, SupplierOrder, supplierOrder),
  "platform.statement_ready": email("platform", false, StatementReady, statementReady),
  "platform.affiliate_payout": email("platform", false, AffiliatePayout, affiliatePayout),

  "return.received": email("shopper", true, ReturnReceived, returnReceived),
  "return.approved": email("shopper", true, ReturnApproved, returnApproved),
  "return.rejected": email("shopper", true, ReturnRejected, returnRejected),
  "return.label": email("shopper", true, ReturnLabel, returnLabel),
  "return.resolved": email("shopper", true, ReturnResolved, returnResolved),
  "order.delayed": email("shopper", true, OrderDelayed, orderDelayed),

  "marketing.welcome": email("marketing", false, Welcome, welcome),
  "marketing.connect_store": email("marketing", false, ConnectStoreNudge, connectStoreNudge),
  "marketing.product_update": email("marketing", false, ProductUpdate, productUpdate),
  "marketing.re_engagement": email("marketing", false, ReEngagement, reEngagement)
} as const

export type EmailKind = keyof typeof EMAILS

/** The props a kind's template takes. */
export type EmailProps<K extends EmailKind> = (typeof EMAILS)[K] extends Email<infer P> ? P : never
