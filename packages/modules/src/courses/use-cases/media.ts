import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import type { Audience, CourseStatus } from "../domain/Courses.ts"
import { levelOf, takes } from "./read.ts"
import { audit } from "./shared.ts"

/*
 * A course's images (M17 step 4): uploaded in the editor at Bewerken, one file per image block, kept as the course's
 * (`files.owner_type = 'course'`, kind `course_image`). Read back through `GET /api/files/:id` by whoever may take or
 * read the course. Video blocks name a URL; the design has no video upload.
 */

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024
const UPLOADS_PER_COURSE = 100
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }

/** "Afbeelding kiezen" in an image block: the file, kept for the course; the block names its id when saved. */
export const upload = Effect.fn("Courses.upload")(function*(input: {
  readonly courseId: string
  readonly name: string
  readonly mime: string
  readonly bytes: Uint8Array
}) {
  yield* Policy.require("courses", 2)
  const principal = yield* CurrentPrincipal
  const mime = input.mime.toLowerCase()
  const extension = TYPES[mime]
  if (extension === undefined) return yield* new Invalid({ fields: { file: "type" } })
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_IMAGE_BYTES) {
    return yield* new Invalid({ fields: { file: "size" } })
  }
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [c] = yield* sql<{ id: string }>`select id from courses where id = ${input.courseId} and deleted_at is null`
      if (c === undefined) return yield* new NotFound({ entity: "course", id: input.courseId })
      const [count] = yield* sql<{ n: number }>`
        select count(*)::int as n from files where owner_type = 'course' and owner_id = ${c.id}`
      if ((count?.n ?? 0) >= UPLOADS_PER_COURSE) return yield* new Invalid({ fields: { file: "count" } })
      const id = mintId("fil")
      const key = `${principal.workspaceId}/courses/${c.id}/${id}.${extension}`
      // A bucket that does not take the file is a defect, as a database that does not answer.
      yield* Effect.flatMap(Effect.service(FileStore), (files) => files.put(key, input.bytes, mime)).pipe(Effect.orDie)
      yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                    uploaded_by)
                 values (${id}, ${principal.workspaceId}, ${key}, ${
        input.name.slice(0, 200) || `afbeelding.${extension}`
      },
                         ${mime}, ${input.bytes.byteLength}, 'course_image', 'course', ${c.id}, ${principal.id})`
      yield* audit(sql, "course.image_uploaded", c.id, { fileId: id })
      return { id }
    })
  )
})

/** A copy's own images ("Dupliceren"): each file copied under the new course, so either can go without the other. */
export const copyImages = Effect.fn("Courses.copyImages")(function*(
  sql: SqlClient.SqlClient,
  courseId: string,
  fileIds: ReadonlyArray<string>
) {
  const principal = yield* CurrentPrincipal
  const store = yield* FileStore
  const copied = new Map<string, string>()
  if (fileIds.length === 0) return copied
  const rows = yield* sql<{ id: string; r2Key: string; name: string; mime: string; sizeBytes: string }>`
    select id, r2_key, name, mime, size_bytes from files
    where id in ${sql.in([...fileIds])} and kind = 'course_image' and deleted_at is null`
  for (const f of rows) {
    const stored = yield* store.get(f.r2Key)
    if (stored === undefined) continue
    const id = mintId("fil")
    const key = `${principal.workspaceId}/courses/${courseId}/${id}.${f.r2Key.split(".").pop() ?? "bin"}`
    yield* store.put(key, stored.bytes, f.mime).pipe(Effect.orDie)
    yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                  uploaded_by)
               values (${id}, ${principal.workspaceId}, ${key}, ${f.name}, ${f.mime}, ${f.sizeBytes}, 'course_image',
                       'course', ${courseId}, ${principal.id})`
    copied.set(f.id, id)
  }
  return copied
})

/** Whether the principal may have a course's file: they may take the course, or read the catalogue. */
export const mayRead = Effect.fn("Courses.mayReadFile")(function*(sql: SqlClient.SqlClient, courseId: string) {
  const principal = yield* CurrentPrincipal
  if (levelOf(principal) >= 1) return true
  const [c] = yield* sql<{ status: CourseStatus; deletedAt: Date | null; audience: Audience }>`
    select status, deleted_at, audience from courses where id = ${courseId}`
  return c !== undefined && takes(principal, c)
})
