import type { View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import type { ReactNode } from 'react'
import type { Message, Model } from '../form/form.ts'
import { onClick, onInput } from '../react.ts'

// The view of `form/view.ts`, in React: the same model, the same messages.
export const view: View<Model, Message, ReactNode> = (model, dispatch) => {
  const { editor } = model
  return (
    <main>
      <input
        // Uncontrolled: a new input when the program replaces the name; otherwise the user's own.
        key={model.name.revision}
        defaultValue={model.name.text}
        disabled={editor._tag === 'Saving'}
        placeholder="A name"
        onChange={editor._tag === 'Saving' ? undefined : onInput(editor.changeName, dispatch)}
      />
      {editor._tag === 'Named'
        ? <button type="button" onClick={onClick(editor.save, dispatch)}>Save</button>
        : <button type="button" disabled>{editor._tag === 'Saving' ? 'Saving…' : 'Save'}</button>}
      {Opt.match(model.failed, {
        onNone: () => null,
        onSome: (name) => <p className="error">Could not save “{name}”: try again.</p>,
      })}
      <ul>
        {model.saved.map((name, index) => (
          // Names may repeat, and the list only grows at its end.
          // biome-ignore lint/suspicious/noArrayIndexKey: a row's place is its identity
          <li key={index}>{name}</li>
        ))}
      </ul>
    </main>
  )
}
