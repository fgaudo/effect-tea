// `messagesSentBy`, the snabbdom bridge's own way to find what a view sends, does what its comment says, without a DOM.
import { describe, expect, test } from 'bun:test'
import { composition, type Dispatch, dispatchTo, type MessageOf, type ModelOf } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Optic from 'effect/Optic'
import { h, thunk } from 'snabbdom'
import { onClick, onInput, shows, type View } from './snabbdom.ts'
import { messagesSentBy } from './snabbdom-testing.ts'

describe('messagesSentBy', () => {
  type Row = 'Tapped'
  type Message =
    | Readonly<{ _tag: 'Typed'; text: string }>
    | Readonly<{ _tag: 'Cleared' }>
    | Readonly<{ _tag: 'Saved' }>
    | Readonly<{ _tag: 'Row'; id: number; message: Row }>
  const send = (dispatch: Dispatch<Message>, message: Message) => () => Effect.runSync(dispatch(message))
  const rowView = (id: number, dispatch: Dispatch<Row>) => h('button', { on: onClick('Tapped', dispatch) }, String(id))
  const view: View<ReadonlyArray<number>, Message> = (ids, dispatch) =>
    h('div', [
      h('input', { on: onInput((text): Message => ({ _tag: 'Typed', text }), dispatch) }),
      h('button', { on: { click: [send(dispatch, { _tag: 'Cleared' }), send(dispatch, { _tag: 'Saved' })] } }),
      // snabbdom calls the listeners of nested lists too, which its types do not show.
      h('button', { on: { click: [[send(dispatch, { _tag: 'Cleared' })]] as unknown as () => void } }),
      ...ids.map((id) => thunk('button', String(id), rowView, [id, dispatchTo(dispatch, 'Row', id)])),
    ])

  test('gives every input the text typed', () => {
    expect(messagesSentBy(view, [], 'Ada')[0]).toEqual({ _tag: 'Typed', text: 'Ada' })
  })

  test('calls each listener of a list, nested or not, in order', () => {
    expect(messagesSentBy(view, []).slice(1)).toEqual([{ _tag: 'Cleared' }, { _tag: 'Saved' }, { _tag: 'Cleared' }])
  })

  test('draws each thunk, and records the message of a child as the root of the program receives it', () => {
    expect(messagesSentBy(view, [1, 2]).slice(4)).toEqual([
      { _tag: 'Row', id: 1, message: 'Tapped' },
      { _tag: 'Row', id: 2, message: 'Tapped' },
    ])
  })

  test('leaves out what is written into an input, which only an element on screen writes', () => {
    type Named = Readonly<{ name: string }>
    const named = composition<{ state: Named }>()
    const program = named.compose({
      init: () => ({ state: { name: '' } }),
      inputs: { Name: named.input(Optic.id<Named>().key('name')) },
      makeModel: (state) => state.name,
    })
    const nameView: View<ModelOf<typeof program>, MessageOf<typeof program>> = (model, dispatch) =>
      h('main', [h('input', shows(model, dispatchTo(dispatch, 'Name')))])
    expect(messagesSentBy(nameView, '', 'Ada')).toEqual([])
  })
})
