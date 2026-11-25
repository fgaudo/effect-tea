// React's refresh runtime, hooked into React DOM before React DOM loads, as a bundler's plugin puts it in a page: so
// that `fast-refresh.test.ts`, which imports this module first, can edit a component as Fast Refresh does.
import * as Refresh from "react-refresh/runtime"

Refresh.injectIntoGlobalHook(window)
