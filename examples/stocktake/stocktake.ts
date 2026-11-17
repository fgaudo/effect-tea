// The stock-take of one aisle, as one program: the items are loaded from the server, a scanner feed adds to the item
// it scans, and the counts are submitted once every item holds a whole number. The count of each item is an input by
// id: what is typed is stored by the library, and no `update` sees it. An item is no child: the sheet reads its count.
import { program, defect, type MessageOf, type ModelOf, reject } from '@fgaudo/effect-tea'
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'

/** An item as the server lists it. */
export type ServerItem = Readonly<{ id: string; code: string; name: string; expected: number }>

/** A counted quantity, as the server takes it. */
export type Counted = Readonly<{ id: string; counted: number }>

export class ServerError extends Data.TaggedError('ServerError')<{ readonly message: string }> { }

/** The server of the warehouse. */
export class Server extends Context.Service<Server, {
  readonly load: (aisle: string) => Effect.Effect<ReadonlyArray<ServerItem>, ServerError>
  readonly submit: (aisle: string, counts: ReadonlyArray<Counted>) => Effect.Effect<void, ServerError>
}>()('stocktake/Server') { }

/** The barcode scanner: a feed of scanned item codes, which ends when the scanner is unplugged. */
export class Scanner extends Context.Service<Scanner, {
  readonly scans: Stream.Stream<string>
}>()('stocktake/Scanner') { }

/** An item of the sheet: what the server says of it, and the count as typed or scanned. */
export type Line = Readonly<{ id: string; code: string; name: string; expected: number; text: string }>

export type Listening = Data.TaggedEnum<{ Listening: object; Disconnected: object }>

export const Listening = Data.taggedEnum<Listening>()

export type Submit = Data.TaggedEnum<{
  Editing: object
  Submitting: object
  Failed: { error: string }
  Submitted: object
}>

export const Submit = Data.taggedEnum<Submit>()

export type Sheet = Readonly<{
  lines: ReadonlyArray<Line>
  unknown: ReadonlyArray<string>
  scanner: Listening
  submit: Submit
}>

export type Load = Data.TaggedEnum<{
  Loading: object
  Failed: { error: string }
  Loaded: { sheet: Sheet }
}>

export const Load = Data.taggedEnum<Load>()

export type State = Readonly<{ aisle: string; load: Load }>

export type Flags = Readonly<{ aisle: string }>

export type Own = Data.TaggedEnum<{
  RetryClicked: object
  Loaded: { items: ReadonlyArray<ServerItem> }
  LoadFailed: { error: string }
  Scanned: { code: string }
  ScannerDisconnected: object
  ReconnectClicked: object
  SubmitClicked: object
  SubmitSucceeded: object
  SubmitFailed: { error: string }
}>

const Own = Data.taggedEnum<Own>()

export type Command = Data.TaggedEnum<{
  Load: { aisle: string }
  Submit: { aisle: string; counts: ReadonlyArray<Counted> }
}>

export const Command = Data.taggedEnum<Command>()

/** What the text of a count says. */
export type Count = Data.TaggedEnum<{
  Empty: object
  Invalid: object
  Valid: { count: number }
}>

export const Count = Data.taggedEnum<Count>()

/** A whole number of zero or more, or nothing typed, or anything else. */
export const countOf = (text: string): Count => {
  if (text === '') return Count.Empty()
  if (!/^[0-9]+$/.test(text)) return Count.Invalid()
  const count = Number(text)
  return Number.isSafeInteger(count) ? Count.Valid({ count }) : Count.Invalid()
}

// A scan adds one to a whole number; over nothing typed, or over a text that is no number, it starts the count at one.
const scanned = (text: string): string => {
  const count = countOf(text)
  return String(count._tag === 'Valid' ? count.count + 1 : 1)
}

const runCommand = (command: Command) => {
  switch (command._tag) {
    case 'Load':
      return Effect.flatMap(Effect.service(Server), (server) => server.load(command.aisle)).pipe(
        Effect.match({
          onSuccess: (items): Own => Own.Loaded({ items }),
          onFailure: (error): Own => Own.LoadFailed({ error: error.message }),
        }),
        Effect.asSome,
      )
    case 'Submit':
      return Effect.flatMap(Effect.service(Server), (server) => server.submit(command.aisle, command.counts)).pipe(
        Effect.match({
          onSuccess: (): Own => Own.SubmitSucceeded(),
          onFailure: (error): Own => Own.SubmitFailed({ error: error.message }),
        }),
        Effect.asSome,
      )
  }
}

// The feed, a stream, as a subscription whose end says that the scanner is gone.
const scans = Channel.unwrap(Effect.map(Effect.service(Scanner), (scanner) =>
  scanner.scans.pipe(
    Stream.map((code): Own => Own.Scanned({ code })),
    Stream.toChannel,
    Channel.flattenArray,
    Channel.mapDone((): Own => Own.ScannerDisconnected()),
  )))

const sheetOf = (state: State): Opt.Option<Sheet> =>
  state.load._tag === 'Loaded' ? Opt.some(state.load.sheet) : Opt.none()

/** The counts are open while the sheet is edited: read-only while it is submitted, and once it is closed. */
const isOpen = (sheet: Sheet): boolean => sheet.submit._tag === 'Editing' || sheet.submit._tag === 'Failed'

/** The scanner is listened to while the sheet is open and the scanner plugged. */
const listens = (sheet: Sheet): boolean => sheet.scanner._tag === 'Listening' && sheet.submit._tag !== 'Submitted'

/** Each item's whole number, or `None` when any is empty or invalid. */
const countsOf = (sheet: Sheet): Opt.Option<ReadonlyArray<Counted>> =>
  Opt.all(Arr.map(sheet.lines, ({ id, text }) => {
    const count = countOf(text)
    return count._tag === 'Valid' ? Opt.some({ id, counted: count.count }) : Opt.none()
  }))

const withSheet = (state: State, sheet: Sheet): State => ({ ...state, load: Load.Loaded({ sheet }) })

const withText = (sheet: Sheet, id: string, text: (was: string) => string): Sheet => ({
  ...sheet,
  lines: Arr.map(sheet.lines, (line) => line.id === id ? { ...line, text: text(line.text) } : line),
})

const { make, inputById } = program<{ state: State; command: Command; flags: Flags }>()

export const stocktake = make({
  init: ({ aisle }) => ({ state: { aisle, load: Load.Loading() }, commands: [Command.Load({ aisle })] }),
  inputs: {
    // Only the count of an open sheet is a place to write into: a write over a locked one finds no place, and is
    // rejected.
    Count: inputById({
      get: (state, id: string) =>
        Opt.flatMap(Opt.filter(sheetOf(state), isOpen), (sheet) =>
          Opt.map(Arr.findFirst(sheet.lines, (line) => line.id === id), (line) => line.text)),
      set: (state, id, text) =>
        Opt.match(sheetOf(state), {
          onNone: () => state,
          onSome: (sheet) => withSheet(state, withText(sheet, id, () => text)),
        }),
    }),
  },
  update: (message: Own) => (state) => {
    switch (message._tag) {
      case 'RetryClicked':
        return state.load._tag === 'Failed'
          ? { state: { ...state, load: Load.Loading() }, commands: [Command.Load({ aisle: state.aisle })] }
          : reject
      case 'Loaded':
        return state.load._tag === 'Loading'
          ? {
            state: withSheet(state, {
              lines: Arr.map(message.items, (item) => ({ ...item, text: '' })),
              unknown: [],
              scanner: Listening.Listening(),
              submit: Submit.Editing(),
            }),
          }
          : defect('A load completed while nothing was loading')
      case 'LoadFailed':
        return state.load._tag === 'Loading'
          ? { state: { ...state, load: Load.Failed({ error: message.error }) } }
          : defect('A load failed while nothing was loading')
      case 'Scanned': {
        if (state.load._tag !== 'Loaded' || !listens(state.load.sheet)) {
          return defect('A scan while the scanner was not listened to')
        }
        const sheet = state.load.sheet
        // A scan while the counts are being submitted does not apply: the counts are locked.
        if (sheet.submit._tag === 'Submitting') return reject
        return Opt.match(Arr.findFirst(sheet.lines, (line) => line.code === message.code), {
          onSome: ({ id }) => ({ state: withSheet(state, withText(sheet, id, scanned)) }),
          onNone: () => ({
            state: withSheet(state, { ...sheet, unknown: Arr.take([message.code, ...sheet.unknown], 5) }),
          }),
        })
      }
      case 'ScannerDisconnected':
        return state.load._tag === 'Loaded' && listens(state.load.sheet)
          ? { state: withSheet(state, { ...state.load.sheet, scanner: Listening.Disconnected() }) }
          : defect('The scanner ended while it was not listened to')
      case 'ReconnectClicked':
        return state.load._tag === 'Loaded' && state.load.sheet.scanner._tag === 'Disconnected'
          && state.load.sheet.submit._tag !== 'Submitted'
          ? { state: withSheet(state, { ...state.load.sheet, scanner: Listening.Listening() }) }
          : reject
      case 'SubmitClicked': {
        if (state.load._tag !== 'Loaded') return reject
        const sheet = state.load.sheet
        if (!isOpen(sheet)) return reject
        return Opt.match(countsOf(sheet), {
          onNone: () => reject,
          onSome: (counts) => ({
            state: withSheet(state, { ...sheet, submit: Submit.Submitting() }),
            commands: [Command.Submit({ aisle: state.aisle, counts })],
          }),
        })
      }
      case 'SubmitSucceeded':
        return state.load._tag === 'Loaded' && state.load.sheet.submit._tag === 'Submitting'
          ? { state: withSheet(state, { ...state.load.sheet, submit: Submit.Submitted() }) }
          : defect('A submit completed while nothing was submitted')
      case 'SubmitFailed':
        return state.load._tag === 'Loaded' && state.load.sheet.submit._tag === 'Submitting'
          ? { state: withSheet(state, { ...state.load.sheet, submit: Submit.Failed({ error: message.error }) }) }
          : defect('A submit failed while nothing was submitted')
    }
  },
  runCommand,
  subscriptions: (state) =>
    Opt.match(sheetOf(state), {
      onNone: () => HashMap.empty(),
      onSome: (sheet) => listens(sheet) ? HashMap.make(['scanner', scans]) : HashMap.empty(),
    }),
  makeModel: (state): Model => {
    switch (state.load._tag) {
      case 'Loading':
        return { _tag: 'Loading' }
      case 'Failed':
        return { _tag: 'LoadFailed', error: state.load.error, retry: Own.RetryClicked() }
      case 'Loaded': {
        const sheet = state.load.sheet
        const open = isOpen(sheet)
        const items = Arr.map(sheet.lines, ({ id, name, expected, text }): ItemLine => ({
          id,
          model: {
            name,
            expected,
            count: countOf(text),
            entry: open ? { _tag: 'Editable', text } : { _tag: 'ReadOnly', text },
          },
        }))
        const total = Arr.reduce(items, 0, (sum, { model }) =>
          sum + (model.count._tag === 'Valid' ? model.count.count : 0))
        if (sheet.submit._tag === 'Submitted') {
          const differing = Arr.filter(items, ({ model }) =>
            model.count._tag !== 'Valid' || model.count.count !== model.expected).length
          return { _tag: 'Closed', items, total, differing }
        }
        return {
          _tag: 'Counting',
          unknown: sheet.unknown,
          scanner: sheet.scanner._tag === 'Listening'
            ? { _tag: 'Listening' }
            : { _tag: 'Disconnected', reconnect: Own.ReconnectClicked() },
          items,
          total,
          submit: sheet.submit._tag === 'Submitting'
            ? { _tag: 'Submitting' }
            : Opt.isSome(countsOf(sheet))
              ? { _tag: 'Ready', submit: Own.SubmitClicked() }
              : { _tag: 'Blocked' },
          error: sheet.submit._tag === 'Failed' ? Opt.some(sheet.submit.error) : Opt.none(),
        }
      }
    }
  },
})

export type ItemModel = Readonly<{
  name: string
  expected: number
  count: Count
  entry: Readonly<{ _tag: 'Editable'; text: string }> | Readonly<{ _tag: 'ReadOnly'; text: string }>
}>

export type ItemLine = Readonly<{ id: string; model: ItemModel }>

export type Model =
  | Readonly<{ _tag: 'Loading' }>
  | Readonly<{ _tag: 'LoadFailed'; error: string; retry: Own }>
  | Readonly<{
    _tag: 'Counting'
    unknown: ReadonlyArray<string>
    scanner: Readonly<{ _tag: 'Listening' }> | Readonly<{ _tag: 'Disconnected'; reconnect: Own }>
    items: ReadonlyArray<ItemLine>
    total: number
    submit: Readonly<{ _tag: 'Ready'; submit: Own }> | Readonly<{ _tag: 'Blocked' }> | Readonly<{ _tag: 'Submitting' }>
    error: Opt.Option<string>
  }>
  | Readonly<{ _tag: 'Closed'; items: ReadonlyArray<ItemLine>; total: number; differing: number }>

export type Message = MessageOf<typeof stocktake>

export type StocktakeModel = ModelOf<typeof stocktake>
