// A key typed into the input of a frame drawn before the save completed, once the save has emptied the name: two
// histories through a run, which end with the key rejected, since it was typed over a name the form no longer holds,
// and the input on screen emptied. The renderer draws as the examples' bridges do: synchronously when it takes a
// frame, then it waits for the next animation frame before taking another, while `run` keeps only the latest state.
// The screen is one input, which the user types into and the frames settle by the library's rule (`typed`, `drawn`),
// as the bridges do; its handlers are those of the last frame drawn.
import { describe, expect, test } from 'bun:test'
import { dispatchTo, drawn as settled, type Frame, run, type Shown, typed } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Stream from 'effect/Stream'
import { form, type Message, type Model } from './form.ts'
import { Storage } from './storage.ts'

type Screen = {
  held: Shown<string> | undefined
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
  const screen: Screen = { held: undefined, text: '', onInput: undefined, onSave: undefined }
  const drawn: Array<string> = []
  const saved: Array<ReadonlyArray<string>> = []
  const applied: Array<Message['_tag']> = []
  const ignored: Array<Message['_tag']> = []
  let nextFrame: (() => void) | undefined
  const draw = ({ model, dispatch, seen }: Frame<Model, Message>) => {
    const { name, editor } = model
    drawn.push(name)
    saved.push(model.saved)
    const next = settled(screen.held, name, seen)
    if (screen.held === undefined || next.value !== screen.held.value) screen.text = next.value
    screen.held = next
    // As the bridges' `shows`: over what the input showed, numbered by the dispatch. Disabled while saving.
    screen.onInput = editor._tag === 'Saving'
      ? undefined
      : (text) => {
        if (screen.held === undefined) return
        const { write, sent } = typed(screen.held, text)
        screen.held = sent(Effect.runSync(dispatchTo(dispatch, 'Name')(write)))
      }
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
// frame of the click, so the renderer never draws `Saving`: the screen still shows "Ada", enabled, with the handler of
// the frame drawn before the save. The user types one more key into it.
const savedWithinOneFrame = async (form: ReturnType<typeof started>) => {
  await until(form.waitingForFrame)
  form.type('Ada')
  await until(() => form.count('Name') === 1)
  form.animationFrame()
  await until(() => form.drawn.length === 2 && form.waitingForFrame())
  form.screen.onSave?.()
  await until(() => form.count('SaveSucceeded') === 1)
  expect(form.drawn).toEqual(['', 'Ada'])
  expect(form.screen.text).toBe('Ada')
  expect(form.screen.onInput).toBeDefined()
}

describe('a key typed into the input drawn before a save completed', () => {
  // The order when the run's loop wakes before the browser's next rendering: the key reaches the program first.
  test('is rejected, and the input on screen is emptied, as the save left it', async () => {
    const run = started()
    try {
      await savedWithinOneFrame(run)
      run.type('Ada x')
      await until(() => run.ignored.length === 1)
      run.animationFrame()
      await until(() => run.drawn.length === 3)
      expect(run.drawn.at(-1)).toBe('')
      expect(run.screen.text).toBe('')
      expect(run.ignored).toEqual(['Name'])
      expect(run.applied).toEqual(['Name', 'SaveClicked', 'SaveSucceeded'])
    } finally {
      await run.end()
    }
  })

  // The order when the browser renders between the task of the key and the task that wakes the run's loop: a
  // dispatch only queues the message, and the renderer resumes in the callback of the animation frame, at once.
  test('is rejected once the input on screen is emptied, which offers no save', async () => {
    const run = started()
    try {
      await savedWithinOneFrame(run)
      run.type('Ada x')
      run.animationFrame()
      // Drawn in the callback itself, before the loop has taken the key: the frame has not seen the key, but holds
      // neither what the input showed before it nor after it, so the state has moved on, and the input is emptied.
      expect(run.drawn.at(-1)).toBe('')
      expect(run.screen.text).toBe('')
      expect(run.ignored).toEqual([])
      await until(() => run.ignored.length === 1)
      run.animationFrame()
      await ticks(20)
      // The state is what the screen shows: an empty input, and nothing to save.
      expect(run.drawn.at(-1)).toBe('')
      expect(run.screen.text).toBe('')
      expect(run.screen.onSave).toBeUndefined()
      expect(run.saved.at(-1)).toEqual(['Ada'])
      expect(run.ignored).toEqual(['Name'])
      expect(run.applied).toEqual(['Name', 'SaveClicked', 'SaveSucceeded'])
    } finally {
      await run.end()
    }
  })
})
