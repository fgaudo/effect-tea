// Draws the README's ```mermaid blocks, which TypeDoc leaves as `<pre><code class="mermaid">`, in the theme the
// reader picked, and again when they switch it. TypeDoc keeps that choice in `data-theme`: `os`, `light` or `dark`.
import mermaid from 'mermaid'

const diagrams = Array.from(document.querySelectorAll('pre > code.mermaid'), (code) => {
  const figure = document.createElement('div')
  figure.className = 'mermaid-diagram'
  code.parentElement?.replaceWith(figure)
  return { figure, source: code.textContent ?? '' }
})
const osDark = window.matchMedia('(prefers-color-scheme: dark)')

const isDark = () => {
  const theme = document.documentElement.dataset.theme
  return theme === 'dark' || (theme !== 'light' && osDark.matches)
}

// Each render needs an id of its own: mermaid uses it for a temporary element.
let renders = 0

const draw = async () => {
  mermaid.initialize({ startOnLoad: false, theme: isDark() ? 'dark' : 'default' })
  for (const { figure, source } of diagrams) {
    const { svg } = await mermaid.render(`mermaid-${renders++}`, source)
    figure.innerHTML = svg
  }
}

if (diagrams.length > 0) {
  void draw()
  osDark.addEventListener('change', () => void draw())
  new MutationObserver(() => void draw()).observe(document.documentElement, { attributeFilter: ['data-theme'] })
}
