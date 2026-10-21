import type { View } from '@fgaudo/effect-tea'
import { h, type VNode } from 'snabbdom'
import { initialValue, onClick, onInput } from '../snabbdom.ts'
import type { Model } from './form.ts'

export const view: View<Model, VNode> = (model, dispatch) => {
  const { editor } = model
  return h('main', [
    h('input', {
      // A new input when the program replaces the name; otherwise the user's own.
      key: model.name.revision,
      ...initialValue(model.name.text),
      props: { disabled: editor._tag === 'Saving', placeholder: 'A name' },
      on: editor._tag === 'Saving' ? {} : onInput(editor.changeName, dispatch),
    }),
    editor._tag === 'Named'
      ? h('button', { on: onClick(editor.save, dispatch) }, 'Save')
      : h('button', { props: { disabled: true } }, editor._tag === 'Saving' ? 'Saving…' : 'Save'),
    ...(model.hasFailed ? [h('p', 'Could not save the name: try again.')] : []),
    h('ul', model.saved.map((name) => h('li', name))),
  ])
}
