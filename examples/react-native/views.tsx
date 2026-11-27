import { type Dispatch, forwardTo } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/react"
import * as Opt from "effect/Option"
import { Pressable, Text, TextInput, View as Box } from "react-native"
import type { Message as CounterMessage, Model as CounterModel } from "../counter/counter.ts"
import type { Message as FormMessage, Model as FormModel } from "../form/form.ts"
import type * as Note from "./note.ts"
import type { Message as NotesMessage, Model as NotesModel } from "./notes.ts"

// The view of `counter/view-react.tsx`, in React Native: the same model, the same messages.
export const counterView: View<CounterModel, CounterMessage> = (model, dispatch) => (
  <Box>
    {model._tag === "Counting"
      ? (
        <Pressable role="button" onPress={() => dispatch(model.decrement)}>
          <Text>−</Text>
        </Pressable>
      )
      : (
        <Pressable role="button" disabled>
          <Text>−</Text>
        </Pressable>
      )}
    <Text testID="count">{model.count}</Text>
    <Pressable role="button" onPress={() => dispatch(model.increment)}>
      <Text>+</Text>
    </Pressable>
  </Box>
)

// The view of `form/view-react.tsx`, in React Native: the same model, the same messages.
export const formView: View<FormModel, FormMessage> = (model, dispatch) => {
  const { editor } = model
  return (
    <Box>
      {
        /* A controlled `TextInput`, as React Native's documentation draws one: not editable while saving, with no
          handler, since the model holds nothing to type there. */
      }
      {editor._tag === "Saving"
        ? <TextInput testID="name" value={model.name} editable={false} placeholder="A name" />
        : (
          <TextInput
            testID="name"
            value={model.name}
            onChangeText={(value) => dispatch({ ...editor.typed, value })}
            placeholder="A name"
          />
        )}
      {editor._tag === "Named"
        ? (
          <Pressable role="button" onPress={() => dispatch(editor.save)}>
            <Text>Save</Text>
          </Pressable>
        )
        : (
          <Pressable role="button" disabled>
            <Text>{editor._tag === "Saving" ? "Saving…" : "Save"}</Text>
          </Pressable>
        )}
      {Opt.match(model.failed, {
        onNone: () => null,
        onSome: (name) => <Text testID="error">Could not save “{name}”: try again.</Text>
      })}
      {model.saved.map((name, index) => (
        // Names may repeat, and the list only grows at its end: a row's place is its identity.
        <Text key={index} testID="saved">{name}</Text>
      ))}
    </Box>
  )
}

const noteView = (model: Note.Model, dispatch: Dispatch<Note.Message>) =>
  model._tag === "Reading"
    ? (
      <Box>
        <Text testID="note">{model.text}</Text>
        <Pressable role="button" onPress={() => dispatch(model.edit)}>
          <Text>Edit</Text>
        </Pressable>
      </Box>
    )
    : (
      <Box>
        <TextInput testID="draft" value={model.draft} onChangeText={(value) => dispatch({ ...model.typed, value })} />
        <Pressable role="button" onPress={() => dispatch(model.save)}>
          <Text>Save</Text>
        </Pressable>
        <Pressable role="button" onPress={() => dispatch(model.cancel)}>
          <Text>Cancel</Text>
        </Pressable>
      </Box>
    )

// The list, or the page of the note open. A tap may run a handler of a page drawn for an earlier visit, as the screen
// animates: the page's dispatch names its instance, so that such a message is rejected, and its key is the number, so
// that a new visit is drawn as other elements, which keep no handler of the old one.
export const notesView: View<NotesModel, NotesMessage> = (model, dispatch) =>
  model._tag === "List"
    ? (
      <Box>
        {model.notes.map(({ open, text }, index) => (
          // The list's rows are its places, and their texts may repeat: a row's place is its identity.
          <Pressable key={index} role="button" onPress={() => dispatch(open)}>
            <Text>{text}</Text>
          </Pressable>
        ))}
      </Box>
    )
    : (
      <Box key={model.instance}>
        {Opt.match(model.close, {
          onNone: () => null,
          onSome: (close) => (
            <Pressable role="button" onPress={() => dispatch(close)}>
              <Text>Close</Text>
            </Pressable>
          )
        })}
        {noteView(model.model, forwardTo(dispatch, { _tag: "Note", instance: model.instance }))}
      </Box>
    )
