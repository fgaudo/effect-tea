// A key typed into the input of a frame drawn before the save completed, once the save has replaced that input: two
// histories through a run, which end with the key rejected, since it carries the revision of the input it was typed
// into. The renderer draws as the examples' bridges do: synchronously when it takes a frame, then it waits for the
// next animation frame before taking another, while `run` keeps only the latest state. The screen is one input,
// created with the text of the frame that first draws its key (`initialValue`, `defaultValue`), and then the
// user's own; its handlers are those of the last frame drawn.
import { describe, expect, test } from 'bun:test'
import { dispatchTo, type Field, type Frame, run, write } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Stream from 'effect/Stream'
import { form, type Message, type Model } from './form.ts'
import { Storage } from './storage.ts'

type Screen = {
  key: number
  text: string
  onInput: ((text: string) => void) | undefined
  onSave: (() => void) | undefined
}

const ticks = (n: number) =>
  Array.from({ length: n }).reduce<Promise<void>>(
    (previous) => previous.then(() => new Promise((resolve) => setTimeout(resolve, 0))),
    Promise.resolve(),
  )

const until = async (done: () => boolean) => {
  for (let i = 0; i < 1000 && !done(); i++) await ticks(1)
  expect(done()).toBe(true)
  // What the run publishes reaches the renderer's buffer through fibers of its own: let them catch up.
  await ticks(10)
}

// A run of the form with a storage that answers at once, its screen, and the animation frame, which the test fires.
const started = () => {
  const screen: Screen = { key: -1, text: '', onInput: undefined, onSave: undefined }
  const drawn: Array<Field<string>> = []
  const saved: Array<ReadonlyArray<string>> = []
  const applied: Array<Message['_tag']> = []
  const ignored: Array<Message['_tag']> = []
  let nextFrame: (() => void) | undefined
  const draw = ({ model, dispatch }: Frame<Model, Message>) => {
    const { name, editor } = model
    drawn.push(name)
    saved.push(model.saved)
    if (screen.key !== name.revision) {
      screen.key = name.revision
      screen.text = name.value
    }
    // As the bridges' `onWrite`: into the field this frame drew.
    screen.onInput = editor._tag === 'Saving'
      ? undefined
      : (text) => Effect.runSync(dispatchTo(dispatch, 'Name')(write(name, text)))
    screen.onSave = editor._tag === 'Named' ? () => Effect.runSync(dispatch(editor.save)) : undefined
  }
  const render = (frames: Stream.Stream<Frame<Model, Message>>) =>
    Stream.runForEach(frames, (frame) =>
      Effect.sync(() => draw(frame)).pipe(
        Effect.andThen(Effect.callback<void>((resume) => {
          nextFrame = () => resume(Effect.void)
        })),
      ))
  const fiber = Effect.runFork(
    run(form, render, {
      onApplied: ({ message }) => Effect.sync(() => applied.push(message._tag)),
      onIgnored: ({ message }) => Effect.sync(() => ignored.push(message._tag)),
    }).pipe(
      Effect.provideService(Storage, Storage.of({ save: () => Effect.void })),
    ),
  )
  return {
    screen,
    drawn,
    saved,
    applied,
    ignored,
    count: (tag: Message['_tag']) => applied.filter((applied) => applied === tag).length,
    /** The user types into the input on screen: it shows the text, and its handler sends it. */
    type: (text: string) => {
      screen.text = text
      screen.onInput?.(text)
    },
    /** The browser's next animation frame: the renderer resumes in its callback, and draws the latest state. */
    animationFrame: () => {
      const resume = nextFrame
      nextFrame = undefined
      resume?.()
    },
    waitingForFrame: () => nextFrame !== undefined,
    end: () => Effect.runPromise(Fiber.interrupt(fiber)),
  }
}

// The user types "Ada" and clicks Save; the save completes, and `SaveSucceeded` is applied, within one animation
// frame of the click, so the renderer never draws `Saving`: the screen still shows the input of revision 0, enabled,
// with the handler of the frame drawn before the save. The user types one more key into it.
const savedWithinOneFrame = async (form: ReturnType<typeof started>) => {
  await until(form.waitingForFrame)
  form.type('Ada')
  await until(() => form.count('Name') === 1)
  form.animationFrame()
  await until(() => form.drawn.length === 2 && form.waitingForFrame())
  form.screen.onSave?.()
  await until(() => form.count('SaveSucceeded') === 1)
  expect(form.drawn).toEqual([{ value: '', revision: 0 }, { value: 'Ada', revision: 0 }])
  expect(form.screen).toMatchObject({ key: 0, text: 'Ada' })
  expect(form.screen.onInput).toBeDefined()
}

describe('a key typed into the input drawn before a save completed', () => {
  // The order when the run's loop wakes before the browser's next rendering: the key reaches the program first.
  test('is rejected, and the new input is created empty, as the save left it', async () => {
    const run = started()
    try {
      await savedWithinOneFrame(run)
      run.type('Ada x')
      await until(() => run.ignored.length === 1)
      run.animationFrame()
      await until(() => run.drawn.length === 3)
      expect(run.drawn.at(-1)).toEqual({ value: '', revision: 1 })
      expect(run.screen).toMatchObject({ key: 1, text: '' })
      expect(run.ignored).toEqual(['Name'])
      expect(run.applied).toEqual(['Name', 'SaveClicked', 'SaveSucceeded'])
    } finally {
      await run.end()
    }
  })

  // The order when the browser renders between the task of the key and the task that wakes the run's loop: a
  // dispatch only queues the message, and the renderer resumes in the callback of the animation frame, at once.
  test('is rejected once the new, empty input is on screen, which offers no save', async () => {
    const run = started()
    try {
      await savedWithinOneFrame(run)
      run.type('Ada x')
      run.animationFrame()
      // Drawn in the callback itself, before the loop has taken the key.
      expect(run.drawn.at(-1)).toEqual({ value: '', revision: 1 })
      expect(run.ignored).toEqual([])
      await until(() => run.ignored.length === 1)
      run.animationFrame()
      await ticks(20)
      // The state is what the screen shows: an empty input, and nothing to save.
      expect(run.drawn.at(-1)).toEqual({ value: '', revision: 1 })
      expect(run.screen).toMatchObject({ key: 1, text: '' })
      expect(run.screen.onSave).toBeUndefined()
      expect(run.saved.at(-1)).toEqual(['Ada'])
      expect(run.ignored).toEqual(['Name'])
      expect(run.applied).toEqual(['Name', 'SaveClicked', 'SaveSucceeded'])
    } finally {
      await run.end()
    }
  })
})
