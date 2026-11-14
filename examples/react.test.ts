// React's bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints. What the other tests
// cannot see: how often `renderInto` draws, that a click on a drawn button reaches the program, and that what the user
// types into an uncontrolled input survives the frames drawn while they type, with its focus, caret and selection,
// which a replacement loses, that a slider writes its number and is drawn anew within bounds that narrow, and that a
// write the input on screen did not make parts the state from the screen, which a source that belongs to the control,
// writing into the input on screen, does not.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  composition,
  type Dispatch,
  dispatchTo,
  field,
  type Field,
  type Frame,
  type MessageOf,
  type ModelOf,
  ProgramDefect,
  run,
  type View,
  write,
  type Written,
} from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Optic from 'effect/Optic'
import type * as Stream from 'effect/Stream'
import { createElement, type ReactNode, useEffect, useEffectEvent, useRef } from 'react'
import { counter } from './counter/counter.ts'
import { form } from './form/form.ts'
import { Storage } from './form/storage.ts'
import { type Message as VolumeMessage, type Model as VolumeModel, volume } from './volume/volume.ts'

// The callbacks waiting for the next screen refresh: none runs until `paint`.
const waiting = new Map<number, FrameRequestCallback>()
let requested = 0

/** Lets the program, the renderer and React's scheduler do what they can without a screen refresh. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

/** One screen refresh, then what follows from it. */
const paint = async () => {
  const due = [...waiting.values()]
  waiting.clear()
  for (const callback of due) callback(performance.now())
  await settle()
}

// React DOM reads the DOM when it is loaded, so the bridge and the views are loaded once there is one.
let bridge: typeof import('./react.ts')
let counterView: typeof import('./counter-react/view.tsx').view
let formView: typeof import('./form-react/view.tsx').view

beforeAll(async () => {
  GlobalRegistrator.register()
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      requested += 1
      waiting.set(requested, callback)
      return requested
    },
    cancelAnimationFrame: (id: number) => waiting.delete(id),
  })
  bridge = await import('./react.ts')
  counterView = (await import('./counter-react/view.tsx')).view
  formView = (await import('./form-react/view.tsx')).view
})

// React's scheduler may still have work queued by the last unmount, which reads the DOM.
afterAll(async () => {
  await settle()
  await GlobalRegistrator.unregister()
})

let running: Fiber.Fiber<void> | undefined

const stop = async () => {
  if (running !== undefined) await Effect.runPromise(Fiber.interrupt(running))
  running = undefined
}

afterEach(async () => {
  await stop()
  waiting.clear()
})

/** Starts a program drawn by React with `view` into a fresh page; `views` counts the trees drawn, one per frame. */
const mount = <Model, Message>(
  view: View<Model, Message, ReactNode>,
  start: (render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>) => Effect.Effect<void>,
) => {
  document.body.innerHTML = '<div id="app"></div>'
  const root = document.getElementById('app') as HTMLElement
  let views = 0
  running = Effect.runFork(start(bridge.renderInto(root, (model, dispatch) => {
    views += 1
    return view(model, dispatch)
  })))
  return { views: () => views }
}

const element = <E extends Element>(selector: string): E => {
  const found = document.querySelector<E>(selector)
  if (found === null) throw new Error(`Nothing drawn matches ${selector}`)
  return found
}

const button = (text: string) => {
  const found = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === text)
  if (found === undefined) throw new Error(`No button "${text}" is drawn`)
  return found
}

// React tracks an input's value through its `value` setter, and ignores an `input` event that left it as
// tracked: a key is the element's own setter, then the event, which React hears at its root.
const setValue = (input: HTMLInputElement, text: string) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)

const type = (input: HTMLInputElement, text: string) => {
  setValue(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('renderInto, with React', () => {
  test('draws the first frame at once, then at most once per screen refresh, the latest frame', async () => {
    const app = mount(counterView, (render) => run(counter, render))
    await settle()
    expect(app.views()).toBe(1)
    expect(element('output').textContent).toBe('0')
    for (let click = 0; click < 5; click += 1) {
      button('+').click()
      await settle()
    }
    expect(app.views()).toBe(1)
    expect(element('output').textContent).toBe('0')
    await paint()
    expect(app.views()).toBe(2)
    expect(element('output').textContent).toBe('5')
    await paint()
    expect(app.views()).toBe(2)
  })

  test('a click on a drawn button reaches the program, and the next refresh shows it', async () => {
    mount(counterView, (render) => run(counter, render))
    await settle()
    button('+').click()
    await paint()
    expect(element('output').textContent).toBe('1')
    button('−').click()
    await paint()
    expect(element('output').textContent).toBe('0')
  })

  test('unmounts what it drew when the run ends', async () => {
    mount(counterView, (render) => run(counter, render))
    await settle()
    expect(element('output').textContent).toBe('0')
    await stop()
    await settle()
    expect(element('#app').childElementCount).toBe(0)
  })

  test('a component that throws ends the run, which dies in the renderer with what it threw', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const root = element<HTMLElement>('#app')
    const thrown = new Error('A component that cannot draw')
    const Broken = (): ReactNode => {
      throw thrown
    }
    const exit = await Effect.runPromiseExit(run(counter, bridge.renderInto(root, () => createElement(Broken))))
    const died = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(died).toBeInstanceOf(ProgramDefect)
    expect(died).toMatchObject({ where: 'render', cause: thrown })
  })
})

describe('inputs the user types into, with React', () => {
  const saving = Storage.of({ save: () => Effect.void })
  const mountForm = () =>
    mount(
      formView,
      (render) => run(form, render).pipe(Effect.provideService(Storage, saving)),
    )

  test('a frame drawn while the user types does not take back what they typed since', async () => {
    mountForm()
    await settle()
    const input = element<HTMLInputElement>('input')
    type(input, 'A')
    await settle()
    // The next key is in the input before its message reaches the program: the frame drawn now knows only "A".
    setValue(input, 'Ad')
    await paint()
    expect(element('input')).toBe(input)
    expect(input.value).toBe('Ad')
    expect(button('Save')).toBeDefined()
  })

  test('a text the program puts in the field is shown by a new input', async () => {
    mountForm()
    await settle()
    const input = element<HTMLInputElement>('input')
    type(input, 'Ada')
    await paint()
    button('Save').click()
    await paint()
    await paint()
    const replaced = element<HTMLInputElement>('input')
    expect(replaced).not.toBe(input)
    expect(replaced.value).toBe('')
    expect(element('li').textContent).toBe('Ada')
  })
})

describe('a slider the user drags, with React', () => {
  // The view of `volume/view.ts`, in React, as a test's own.
  const volumeView: View<VolumeModel, VolumeMessage, ReactNode> = (model, dispatch) => {
    const limit = model.limit._tag === 'Quiet'
      ? { message: model.limit.full, label: 'Full volume' }
      : { message: model.limit.quiet, label: 'Quiet hours' }
    return createElement(
      'main',
      null,
      createElement('input', {
        key: model.level.revision,
        type: 'range',
        min: 0,
        max: model.max,
        step: 1,
        defaultValue: model.level.value,
        disabled: model.sound._tag === 'Muted',
        onChange: model.sound._tag === 'Muted'
          ? undefined
          : bridge.onSlide(model.level, dispatchTo(dispatch, 'Level')),
      }),
      createElement('output', null, String(model.level.value)),
      createElement('button', { type: 'button', onClick: bridge.onClick<VolumeMessage>(limit.message, dispatch) }, limit.label),
    )
  }

  const drag = (slider: HTMLInputElement, value: number) => {
    setValue(slider, String(value))
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  }

  test('writes its number, and a frame drawn while it is dragged keeps it', async () => {
    mount(volumeView, (render) => run(volume, render))
    await settle()
    const slider = element<HTMLInputElement>('input')
    drag(slider, 80)
    await paint()
    expect(element('input')).toBe(slider)
    expect(element('output').textContent).toBe('80')
  })

  // A level within the new bounds is the same value: the program asks for a new slider with `renewed`.
  test('bounds that narrow draw a new slider within them, even for a level that was within them', async () => {
    mount(volumeView, (render) => run(volume, render))
    await settle()
    for (const [dragged, shown] of [[20, '20'], [80, '30']] as const) {
      if (element('main').textContent?.includes('Full volume')) {
        button('Full volume').click()
        await paint()
      }
      const slider = element<HTMLInputElement>('input')
      drag(slider, dragged)
      await paint()
      button('Quiet hours').click()
      await paint()
      const quiet = element<HTMLInputElement>('input')
      expect(quiet).not.toBe(slider)
      expect(quiet.max).toBe('30')
      expect(quiet.value).toBe(shown)
    }
  })
})

describe('what a replacement loses, and what a write the input did not make does, with React', () => {
  // A note the program clears on a message that no control drawn sends, as a source that exists whatever is drawn
  // would.
  type Note = Readonly<{ note: Field<string> }>
  const { input, compose } = composition<{ state: Note }>()
  const note = compose({
    init: () => ({ state: { note: field('') } }),
    inputs: { Note: input(Optic.id<Note>().key('note')) },
    update: (_: 'Cleared') => () => ({ state: { note: field('') } }),
    makeModel: (state) => state.note,
  })
  type Model = ModelOf<typeof note>
  type Message = MessageOf<typeof note>
  const noteView: View<Model, Message, ReactNode> = (model, dispatch) =>
    createElement(
      'main',
      null,
      createElement('input', {
        key: model.revision,
        defaultValue: model.value,
        onChange: bridge.onWrite(model, dispatchTo(dispatch, 'Note')),
      }),
    )
  const mountNote = (view = noteView) => {
    let drawn: Readonly<{ model: Model; dispatch: Dispatch<Message> }> | undefined
    mount<Model, Message>((model, dispatch) => {
      drawn = { model, dispatch }
      return view(model, dispatch)
    }, (render) => run(note, render))
    const last = () => {
      if (drawn === undefined) throw new Error('No frame is drawn')
      return drawn
    }
    return {
      field: () => last().model,
      send: (message: Message) => Effect.runSync(last().dispatch(message)),
    }
  }

  test('a frame drawn while the user types keeps the focus, the caret and the selection of the input', async () => {
    mountNote()
    await settle()
    const typed = element<HTMLInputElement>('input')
    type(typed, 'Ada')
    typed.focus()
    typed.setSelectionRange(1, 3)
    await paint()
    expect(element('input')).toBe(typed)
    expect(document.activeElement).toBe(typed)
    expect([typed.selectionStart, typed.selectionEnd]).toEqual([1, 3])
  })

  test('a replacement draws a new input, which has neither the focus nor the caret nor the selection', async () => {
    const app = mountNote()
    await settle()
    const typed = element<HTMLInputElement>('input')
    type(typed, 'Ada')
    typed.focus()
    typed.setSelectionRange(1, 3)
    await paint()
    app.send('Cleared')
    await paint()
    const replaced = element<HTMLInputElement>('input')
    expect(replaced).not.toBe(typed)
    expect(replaced.value).toBe('')
    expect(document.activeElement).not.toBe(replaced)
    expect([replaced.selectionStart, replaced.selectionEnd]).toEqual([0, 0])
  })

  test('a write the input did not make parts the state from the screen, and the next key erases it', async () => {
    const app = mountNote()
    await settle()
    const typed = element<HTMLInputElement>('input')
    type(typed, 'Hel')
    await paint()
    // At the revision on screen, from elsewhere than the element: what a scanner would send if it could write.
    app.send({ _tag: 'Note', message: write(app.field(), 'SCAN') })
    await paint()
    expect(app.field().value).toBe('SCAN')
    expect(element('input')).toBe(typed)
    expect(typed.value).toBe('Hel')
    type(typed, 'Help')
    await paint()
    expect(app.field().value).toBe('Help')
  })

  describe('a source that belongs to the control, as a dictation that streams partial results, with React', () => {
    // The control listens to the source, not the program: each result is put into the element on screen, and
    // written into the field of the latest frame, at its revision.
    const dictation = () => {
      const listeners = new Set<(text: string) => void>()
      return {
        listen: (listener: (text: string) => void) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        say: (text: string) => {
          for (const listener of [...listeners]) listener(text)
        },
      }
    }
    type Dictation = ReturnType<typeof dictation>
    type DictatedProps = Readonly<{ field: Field<string>; dispatch: Dispatch<Written<string>>; source: Dictation }>
    const Dictated = ({ field, dispatch, source }: DictatedProps): ReactNode => {
      const element = useRef<HTMLInputElement>(null)
      const heard = useEffectEvent((text: string) => {
        if (element.current === null) return
        element.current.value = text
        Effect.runSync(dispatch(write(field, text)))
      })
      useEffect(() => source.listen(heard), [source])
      return createElement('input', {
        key: field.revision,
        ref: element,
        defaultValue: field.value,
        onChange: bridge.onWrite(field, dispatch),
      })
    }
    const dictatedView = (source: Dictation): typeof noteView => (model, dispatch) =>
      createElement(
        'main',
        null,
        createElement(Dictated, { field: model, dispatch: dispatchTo(dispatch, 'Note'), source }),
      )

    test('each result is shown by the input on screen, which keeps the focus, and is stored', async () => {
      const source = dictation()
      const app = mountNote(dictatedView(source))
      await settle()
      const typed = element<HTMLInputElement>('input')
      type(typed, 'Note: ')
      typed.focus()
      await paint()
      source.say('Note: hel')
      await settle()
      source.say('Note: hello')
      // A dispatch only queues the message: the program applies it in a later step of the scheduler.
      await settle()
      await paint()
      expect(element('input')).toBe(typed)
      expect(document.activeElement).toBe(typed)
      expect(typed.value).toBe('Note: hello')
      expect(app.field().value).toBe('Note: hello')
      type(typed, 'Note: hello!')
      await paint()
      expect(app.field().value).toBe('Note: hello!')
    })

    test('after a replacement, the results go to the new input, and none to the one replaced', async () => {
      const source = dictation()
      const app = mountNote(dictatedView(source))
      await settle()
      const typed = element<HTMLInputElement>('input')
      source.say('Ada')
      await paint()
      app.send('Cleared')
      await paint()
      source.say('Bob')
      await paint()
      const replaced = element<HTMLInputElement>('input')
      expect(replaced).not.toBe(typed)
      expect(typed.value).toBe('Ada')
      expect(replaced.value).toBe('Bob')
      expect(app.field().value).toBe('Bob')
    })
  })
})
