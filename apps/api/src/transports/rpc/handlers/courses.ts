import { CoursesRpcs } from "@insyte/api/rpc/CoursesRpcs"
import { CoursesService } from "@insyte/modules/courses/Courses"
import { Effect } from "effect"

export const CoursesHandlers = CoursesRpcs.toLayer(Effect.gen(function*() {
  const courses = yield* CoursesService
  return CoursesRpcs.of({
    "Courses.list": () => courses.list,
    "CourseChapters.add": (input) => courses.addChapter(input),
    "CourseChapters.rename": (input) => courses.renameChapter(input),
    "CourseChapters.addModule": (input) => courses.addModule(input),
    "CourseChapters.renameModule": (input) => courses.renameModule(input),
    "CourseChapters.reorder": (input) => courses.reorderChapters(input),
    "Courses.create": (input) => courses.create(input),
    "Courses.save": (input) => courses.save(input),
    "Courses.publish": (input) => courses.publish(input),
    "Courses.setStatus": (input) => courses.setStatus(input),
    "Courses.duplicate": (input) => courses.duplicate(input),
    "Courses.remove": (input) => courses.remove(input),
    "Courses.restore": (input) => courses.restore(input),
    "Courses.reorder": (input) => courses.reorder(input),
    "Courses.remind": (input) => courses.remind(input),
    "CourseProgress.step": (input) => courses.step(input),
    "CourseProgress.finish": (input) => courses.finish(input),
    "CourseProgress.retake": (input) => courses.retake(input),
    "CourseProgress.reset": (input) => courses.reset(input),
    "CourseQuestions.ask": (input) => courses.ask(input),
    "CourseQuestions.answer": (input) => courses.answer(input)
  })
}))
