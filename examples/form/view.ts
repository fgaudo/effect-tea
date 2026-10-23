import type { View } from '@fgaudo/effect-tea'
import { h, type VNode } from 'snabbdom'
import { initialValue, onClick, onInput } from '../snabbdom.ts'
import type { Message, Model } from './form.ts'

export const view: View<Model, Message, VNode> = (model, dispatch) => {
  const { editor } = model
  return h('main', [
    h('input', {
      // A new input when the program replaces the name; otherwise the user's own.
      key: model.name.revision,
      ...initialValue(model.name.text),
      props: { disabled: editor._tag === 'Saving', placeholder: 'A name' },
      on: editor._tag === 'Saving' ? {} : onInput(editor.changeName, dispatch),
    }),
    // snabbdom's props module never removes a prop: the enabled button sets `disabled` too.
    editor._tag === 'Named'
      ? h('button', { props: { disabled: false }, on: onClick(editor.save, dispatch) }, 'Save')
      : h('button', { props: { disabled: true } }, editor._tag === 'Saving' ? 'Saving…' : 'Save'),
    ...(model.hasFailed ? [h('p.error', 'Could not save the name: try again.')] : []),
    h('ul', model.saved.map((name) => h('li', name))),
  ])
}
