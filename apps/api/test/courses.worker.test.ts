import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Courses (M17 step 4): the owner makes a chapter and a course, is told what stands in the way of publishing it, and
 * publishes it for the team; a colleague (Klantenservice: Cursussen · Bekijken) hears of it, takes it in a fixed order,
 * sees a question's right answer only once theirs is in, is scored here, retakes it, and asks a question the owner
 * answers. Wiping their progress, removing the course and an image's way in and out, each with its Undo or its gate.
 */

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

const media = (courseId: string, cookie: string, type = "image/png") =>
  call(`http://api.test/api/courses/${courseId}/media`, {
    method: "PUT",
    headers: { cookie, "content-type": type, "x-file-name": encodeURIComponent("pakbon.png") },
    body: PNG
  })

const list = async (cookie: string) => ok(await rpc("Courses.list", undefined, cookie))

const undo = async (cookie: string, token: string | undefined) =>
  ok(await rpc("Shared.undo", { token: token! }, cookie))

describe("courses", () => {
  it("authors, publishes, takes, scores, asks and answers, with Undo and the gates", async () => {
    const owner = await person("courses-owner", "Cursus Co.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const email = `courses-${run}-service@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" as const }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const colleague = await join(email)

    // A chapter comes with its first module; a course goes in it as a draft for the whole team.
    const chapter = ok(await rpc("CourseChapters.add", { title: "Basis" }, owner.cookie))
    const empty = await list(owner.cookie)
    expect(empty.chapters).toEqual([{
      id: chapter.id,
      title: "Basis",
      modules: [{ id: expect.any(String), title: "Algemeen" }]
    }])
    const moduleId = empty.chapters[0]!.modules[0]!.id
    const made = ok(await rpc("Courses.create", { title: "Retouren", chapterId: chapter.id!, moduleId }, owner.cookie))
    const id = made.id!
    const draft = (await list(owner.cookie)).courses.find((c) => c.id === id)!
    expect(draft).toMatchObject({ title: "Retouren", status: "draft", audience: { kind: "all" }, blocks: [] })

    // Not ready: what stands in the way, as codes.
    const course = {
      title: "Retouren",
      description: "",
      chapterId: chapter.id!,
      moduleId,
      blocks: [] as Array<never>,
      order: "fixed" as const,
      audience: { kind: "all" as const },
      suppliers: { kind: "none" as const },
      deadline: "",
      badge: "parcel" as const,
      passMark: 80 as const,
      questions: true
    }
    expect(failure(await rpc("Courses.publish", { id, course }, owner.cookie))).toMatchObject({
      _tag: "CourseNotReady",
      blockers: ["description", "blocks"]
    })

    // An image goes up for the course: the owner's, in the formats an image block takes.
    expect((await media(id, owner.cookie, "application/zip")).status).toBe(415)
    expect((await media(id, colleague)).status).toBe(403)
    const uploaded = await media(id, owner.cookie)
    expect(uploaded.status).toBe(201)
    const { id: fileId } = await uploaded.json() as { id: string }

    const ready = {
      ...course,
      description: "Hoe een retour loopt",
      blocks: [
        { id: "b1", kind: "text" as const, title: "Intro", body: "Een retour begint bij de klant." },
        { id: "b2", kind: "image" as const, title: "Pakbon", fileId, caption: "" },
        {
          id: "b3",
          kind: "quiz" as const,
          question: "Wie betaalt de retour?",
          options: [{ id: "a", text: "De winkel" }, { id: "b", text: "De klant" }],
          correct: "b",
          explain: "Tenzij het product kapot is."
        }
      ]
    }
    expect(failure(await rpc("Courses.save", { id, course: ready, expectedUpdatedAt: 1 }, owner.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "stale_version" })
    expect(failure(await rpc("Courses.save", { id, course: ready }, colleague))).toMatchObject({ _tag: "Forbidden" })
    ok(await rpc("Courses.publish", { id, course: ready, expectedUpdatedAt: draft.updatedAt }, owner.cookie))

    // The colleague hears of it once the window has passed; the owner, who published it, does not.
    await pastUndo(workspace)
    await relay(workspace)
    const assigned = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, colleague)).items
    expect(assigned.find((n) => n.kind === "course.assigned")).toMatchObject({
      subjectId: id,
      data: { title: "Retouren" }
    })
    const mine = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, owner.cookie)).items
    expect(mine.some((n) => n.kind === "course.assigned")).toBe(false)

    // A learner's copy hides the right answer until theirs is in; the image is theirs to see.
    const seen = (await list(colleague)).courses.find((c) => c.id === id)!
    expect(seen.blocks[2]).toMatchObject({ kind: "quiz", correct: "", explain: "" })
    expect((await call(`http://api.test/api/files/${fileId}`, { headers: { cookie: colleague } })).status).toBe(200)

    // Fixed order: the question waits for the blocks before it. The first answer is the one that counts.
    expect(failure(await rpc("CourseProgress.step", { courseId: id, blockId: "b3", answer: "b" }, colleague)))
      .toMatchObject({ _tag: "Invalid", fields: { blockId: "locked" } })
    ok(await rpc("CourseProgress.step", { courseId: id, blockId: "b1" }, colleague))
    expect(failure(await rpc("CourseProgress.finish", { courseId: id }, colleague))).toMatchObject({ _tag: "Invalid" })
    ok(await rpc("CourseProgress.step", { courseId: id, blockId: "b2" }, colleague))
    expect(ok(await rpc("CourseProgress.step", { courseId: id, blockId: "b3", answer: "a" }, colleague)))
      .toMatchObject({ correct: "b", explain: "Tenzij het product kapot is." })
    ok(await rpc("CourseProgress.step", { courseId: id, blockId: "b3", answer: "b" }, colleague))
    const checked = await list(colleague)
    expect(checked.courses.find((c) => c.id === id)!.blocks[2]).toMatchObject({ correct: "b" })
    expect(checked.progress.find((p) => p.courseId === id)!.answers).toEqual({ b3: "a" })
    expect(ok(await rpc("CourseProgress.finish", { courseId: id }, colleague))).toEqual(
      expect.objectContaining({ score: 0, passed: false })
    )

    // A retake starts over; the score is the server's.
    ok(await rpc("CourseProgress.retake", { courseId: id }, colleague))
    for (const blockId of ["b1", "b2"]) ok(await rpc("CourseProgress.step", { courseId: id, blockId }, colleague))
    ok(await rpc("CourseProgress.step", { courseId: id, blockId: "b3", answer: "b" }, colleague))
    expect(ok(await rpc("CourseProgress.finish", { courseId: id }, colleague))).toEqual(
      expect.objectContaining({ score: 100, passed: true })
    )
    const passed = (await list(owner.cookie)).progress.find((p) => p.courseId === id)!
    expect(passed).toMatchObject({ attempts: 2, score: 100 })

    // A question reaches the course's maker; the answer goes back, once.
    const asked = ok(
      await rpc("CourseQuestions.ask", { courseId: id, blockId: "b3", text: "Ook bij sale?" }, colleague)
    )
    await pastUndo(workspace)
    await relay(workspace)
    const told = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, owner.cookie)).items
    expect(told.find((n) => n.kind === "course.question")).toMatchObject({ subjectId: id })
    expect(failure(await rpc("CourseQuestions.answer", { id: asked.id!, text: "Ja." }, colleague))).toMatchObject({
      _tag: "Forbidden"
    })
    ok(await rpc("CourseQuestions.answer", { id: asked.id!, text: "Ja, ook bij sale." }, owner.cookie))
    expect(failure(await rpc("CourseQuestions.answer", { id: asked.id!, text: "Nog eens" }, owner.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "answered" })
    await pastUndo(workspace)
    await relay(workspace)
    const answered = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, colleague)).items
    expect(answered.find((n) => n.kind === "course.answered")).toMatchObject({ subjectId: id })
    expect((await list(colleague)).questions[0]).toMatchObject({ text: "Ook bij sale?", answer: "Ja, ook bij sale." })

    // Wiping a teammate's progress is Beheren's, and Undo puts it back.
    const me = (await list(colleague)).me.id
    expect(failure(await rpc("CourseProgress.reset", { courseId: id, memberId: me }, colleague))).toMatchObject({
      _tag: "Forbidden"
    })
    const wiped = ok(await rpc("CourseProgress.reset", { courseId: id, memberId: me }, owner.cookie))
    expect((await list(owner.cookie)).progress.filter((p) => p.courseId === id)).toEqual([])
    await undo(owner.cookie, wiped.undo?.token)
    expect((await list(owner.cookie)).progress.find((p) => p.courseId === id)).toMatchObject({ score: 100 })

    // A copy is a draft right after it, with blocks and an image of its own.
    const copy = ok(await rpc("Courses.duplicate", { id }, owner.cookie))
    const copied = (await list(owner.cookie)).courses.find((c) => c.id === copy.id)!
    expect(copied).toMatchObject({ title: "Retouren (kopie)", status: "draft" })
    expect(copied.blocks.map((b) => b.id)).not.toContain("b1")
    expect(copied.blocks[1]).toMatchObject({ kind: "image", fileId: expect.not.stringMatching(fileId) })

    // Removed, it is gone for everyone; Undo brings it back.
    const removed = ok(await rpc("Courses.remove", { ids: [id] }, owner.cookie))
    expect((await list(colleague)).courses.some((c) => c.id === id)).toBe(false)
    expect(failure(await rpc("CourseProgress.retake", { courseId: id }, colleague))).toMatchObject({
      _tag: "CourseNotOpen"
    })
    await undo(owner.cookie, removed.undo?.token)
    expect((await list(colleague)).courses.some((c) => c.id === id)).toBe(true)
  }, 120_000)
})
