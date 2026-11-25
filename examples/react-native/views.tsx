import type { View } from "@fgaudo/effect-tea/react"
import * as Opt from "effect/Option"
import { Pressable, Text, TextInput, View as Box } from "react-native"
import type { Message as CounterMessage, Model as CounterModel } from "../counter/counter.ts"
import type { Message as FormMessage, Model as FormModel } from "../form/form.ts"

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
