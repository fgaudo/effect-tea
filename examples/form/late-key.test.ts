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
import * as Scheduler from 'effect/Scheduler'
import * as Stream from 'effect/Stream'
import { form, type Message, type Model } from './form.ts'
import { Storage } from './storage.ts'

type Screen = {
  held: Shown<string> | undefined
  text: string
  onInput: ((text: string) => void) | undefined
  onSave: (() => void) | undefined
}

// A run of the form with a storage that answers at once, its screen, and the animation frame, which the test fires.
// It runs on Effect's own scheduler, but for the turns of the event loop it would wait for: it keeps them until
// `settle`, so that a test, not the clock, says when the run goes on, and so which comes first of what the run does
// and an animation frame.
const started = () => {
  const held = new Set<() => void>()
  const scheduler = new Scheduler.MixedScheduler('async', (task) => {
    held.add(task)
    return () => held.delete(task)
  })
  /** Lets the run and the renderer do all they can before the next animation frame. */
  const settle = () => {
    for (let turns = 0; held.size > 0; turns += 1) {
      if (turns === 10_000) throw new Error('The run never settles: a fiber yields forever')
      for (const task of [...held]) if (held.delete(task)) task()
    }
  }
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
    { scheduler },
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
    settle,
    end: () => {
      const ended = Effect.runPromise(Fiber.interrupt(fiber))
      settle()
      return ended
    },
  }
}

// The user types "Ada" and clicks Save; the save completes, and `SaveSucceeded` is applied, within one animation
// frame of the click, so the renderer never draws `Saving`: the screen still shows "Ada", enabled, with the handler of
// the frame drawn before the save. The user types one more key into it.
const savedWithinOneFrame = (form: ReturnType<typeof started>) => {
  form.settle()
  expect(form.waitingForFrame()).toBe(true)
  form.type('Ada')
  form.settle()
  expect(form.count('Name')).toBe(1)
  form.animationFrame()
  form.settle()
  expect(form.waitingForFrame()).toBe(true)
  form.screen.onSave?.()
  form.settle()
  expect(form.count('SaveSucceeded')).toBe(1)
  expect(form.drawn).toEqual(['', 'Ada'])
  expect(form.screen.text).toBe('Ada')
  expect(form.screen.onInput).toBeDefined()
}

describe('a key typed into the input drawn before a save completed', () => {
  // The order when the run's loop wakes before the browser's next rendering: the key reaches the program first.
  test('is rejected, and the input on screen is emptied, as the save left it', async () => {
    const run = started()
    try {
      savedWithinOneFrame(run)
      run.type('Ada x')
      run.settle()
      expect(run.ignored).toHaveLength(1)
      run.animationFrame()
      run.settle()
      expect(run.drawn).toHaveLength(3)
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
      savedWithinOneFrame(run)
      run.type('Ada x')
      run.animationFrame()
      // Drawn in the callback itself, before the loop has taken the key: the frame has not seen the key, but holds
      // neither what the input showed before it nor after it, so the state has moved on, and the input is emptied.
      expect(run.drawn.at(-1)).toBe('')
      expect(run.screen.text).toBe('')
      expect(run.ignored).toEqual([])
      run.settle()
      expect(run.ignored).toHaveLength(1)
      run.animationFrame()
      run.settle()
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
