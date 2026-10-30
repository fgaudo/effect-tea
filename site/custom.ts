// TypeDoc loads this on every page, as a classic script. Mermaid weighs megabytes, so it is imported only by a
// page that has a diagram.
if (document.querySelector('pre > code.mermaid') !== null && document.currentScript instanceof HTMLScriptElement) {
  void import(new URL('mermaid/mermaid.js', document.currentScript.src).href)
}
