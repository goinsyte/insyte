import { SupplierContact } from "@insyte/api/rpc/SupplierContact"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentSupplierContact, NotSupplierContact } from "@insyte/modules/supplier-portal/domain/Portal"
import { SupplierPortalService } from "@insyte/modules/supplier-portal/SupplierPortal"
import { Effect, Layer } from "effect"

/**
 * `CurrentPrincipal` and `CurrentSupplierContact` from the person's supplier contacts (M16 step 2): the newest. Read
 * per call, so a contact the brand revoked a moment ago is out now.
 */
export const SupplierContactLive = Layer.effect(
  SupplierContact,
  Effect.map(
    Effect.service(SupplierPortalService),
    (portal) =>
      SupplierContact.of((effect) =>
        Effect.flatMap(portal.held, (held) => {
          const active = held[0]
          return active === undefined
            ? Effect.fail(new NotSupplierContact())
            : effect.pipe(
              Effect.provideService(CurrentPrincipal, active.principal),
              Effect.provideService(CurrentSupplierContact, active.contact)
            )
        })
      )
  )
)
