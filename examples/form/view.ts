import type { View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h, type VNode } from 'snabbdom'
import { initialValue, onClick, onInput } from '../snabbdom.ts'
import type { Message, Model } from './form.ts'

export const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('main', [
    h('input', {
      // A new input when the program replaces the name; otherwise the user's own.
      key: model.name.revision,
      ...initialValue(model.name.text),
      props: { disabled: Opt.isNone(model.changeName), placeholder: 'A name' },
      on: onInput(model.changeName, dispatch),
    }),
    h('button', { props: { disabled: Opt.isNone(model.save) }, on: onClick(model.save, dispatch) }, [
      model.isSaving ? 'Saving…' : 'Save',
    ]),
    ...(model.hasFailed ? [h('p', 'Could not save the name: try again.')] : []),
    h('ul', model.saved.map((name) => h('li', name))),
  ])
