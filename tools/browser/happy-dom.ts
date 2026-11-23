// Stands in for `@happy-dom/global-registrator` in a real browser, where the bridges' tests find the DOM they would
// register: registering happy-dom there would put its window over the browser's.
export const GlobalRegistrator = {
  register: () => {},
  unregister: () => {}
}
