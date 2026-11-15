import { dispatchTo, type View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h, type VNode } from 'snabbdom'
import { onClick, shows } from '../snabbdom.ts'
import type { Message, Model } from './form.ts'

export const view: View<Model, Message, VNode> = (model, dispatch) => {
  const { editor } = model
  return h('main', [
    // The same element throughout: the bridge gives it the name when the program changes it, and writes what is
    // typed over what it showed. Disabled while saving, so that nothing is typed into it.
    h('input', {
      ...shows(model.name, dispatchTo(dispatch, 'Name')),
      props: { disabled: editor._tag === 'Saving', placeholder: 'A name' },
    }),
    // snabbdom's props module never removes a prop: the enabled button sets `disabled` too.
    editor._tag === 'Named'
      ? h('button', { props: { disabled: false }, on: onClick<Message>(editor.save, dispatch) }, 'Save')
      : h('button', { props: { disabled: true } }, editor._tag === 'Saving' ? 'Saving…' : 'Save'),
    ...Opt.match(model.failed, {
      onNone: () => [],
      onSome: (name) => [h('p.error', `Could not save “${name}”: try again.`)],
    }),
    h('ul', model.saved.map((name) => h('li', name))),
  ])
}
