// For the tests of the timer and of the list of timers: a parent's reader calls its children's, so a child's is
// shared as its model is.
import * as Opt from 'effect/Option'
import type * as Timer from './timer.ts'

// #region reader
/** What a timer's model holds: the messages of its controls, a case at a time. */
export const timerMessages = (model: Timer.Model): ReadonlyArray<Timer.Message> => {
  switch (model._tag) {
    case 'Setting':
      return [model.more, ...Opt.toArray(model.less), model.start]
    case 'Running':
      return [model.pause, model.reset]
    case 'Paused':
      return [model.resume, model.reset]
    case 'Finished':
      return [model.reset]
  }
}
// #endregion reader
