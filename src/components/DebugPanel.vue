<script setup>
/**
 * Demo only. Shows what the bar exchanges with the rest of the app: the
 * contract a backend would publish, the definitions the bar consumes, the
 * tokens it emits, the request they compile to, the core's state and the
 * sentences the live region has spoken. A tab list, so each view has a name.
 */
import { ref } from 'vue'

const props = defineProps({
  /** [{ id, label, hint, text }] — `text` is already formatted. */
  tabs: { type: Array, required: true }
})

const active = ref(props.tabs[0]?.id ?? null)

/** Which panel was just copied, for the two-second "Copied" confirmation. */
const copied = ref(null)
/** Sentence for the live region, so a screen reader hears the outcome too. */
const copyStatus = ref('')
let copiedTimer = null

async function copy (tab) {
  let ok = false
  try {
    await navigator.clipboard.writeText(tab.text)
    ok = true
  } catch {
    // No clipboard permission, or an insecure context: fall back to selecting the
    // text so a manual copy is one keystroke away.
    const code = document.getElementById(panelId(tab.id))?.querySelector('code')
    if (code && window.getSelection) {
      const range = document.createRange()
      range.selectNodeContents(code)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }
  copied.value = ok ? tab.id : null
  copyStatus.value = ok ? `${tab.label} copied to the clipboard.` : `Could not copy. ${tab.label} is selected, press Ctrl+C.`
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = null }, 2000)
}
const tabId = (id) => `debug-tab-${id}`
const panelId = (id) => `debug-panel-${id}`

/** Arrow keys move between tabs, the WAI-ARIA tabs pattern with automatic activation. */
function onKeydown (event, index) {
  const count = props.tabs.length
  let next = null
  if (event.key === 'ArrowRight') next = (index + 1) % count
  if (event.key === 'ArrowLeft') next = (index - 1 + count) % count
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  active.value = props.tabs[next].id
  event.currentTarget.parentElement.querySelectorAll('[role=tab]')[next]?.focus()
}
</script>

<template>
  <section class="debug" aria-labelledby="debug-title" data-debug="panel">
    <div class="debug-head">
      <h2 id="debug-title" class="debug-title">Under the hood</h2>
      <p class="debug-sub">{{ tabs.find((t) => t.id === active)?.hint }}</p>
    </div>
    <div class="debug-tabs" role="tablist" aria-label="Debug views">
      <button
        v-for="(tab, index) in tabs"
        :id="tabId(tab.id)"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="tab.id === active ? 'true' : 'false'"
        :aria-controls="panelId(tab.id)"
        :tabindex="tab.id === active ? 0 : -1"
        :data-debug-tab="tab.id"
        @click="active = tab.id"
        @keydown="onKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div
      v-for="tab in tabs"
      :id="panelId(tab.id)"
      :key="tab.id"
      role="tabpanel"
      :aria-labelledby="tabId(tab.id)"
      :hidden="tab.id !== active"
      :data-debug="tab.id"
      class="debug-panel"
    >
      <button
        type="button"
        class="debug-copy"
        :data-copied="copied === tab.id ? 'true' : null"
        :aria-label="`Copy ${tab.label.toLowerCase()}`"
        data-debug-copy
        @click="copy(tab)"
      >
        <svg v-if="copied !== tab.id" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
        </svg>
        <svg v-else width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M3 8.5l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{{ copied === tab.id ? 'Copied' : 'Copy' }}</span>
      </button>
      <pre><code>{{ tab.text }}</code></pre>
    </div>
    <p class="debug-vh" role="status" aria-live="polite">{{ copyStatus }}</p>
  </section>
</template>

<style scoped>
.debug {
  background: var(--fs-surface); border: 1px solid var(--fs-line); border-radius: 8px;
  box-shadow: var(--fs-shadow); overflow: hidden;
}
.debug-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; padding: 14px 16px 0; }
.debug-title { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
.debug-sub { margin: 0; font-size: 12.5px; color: var(--fs-ink-3); }
.debug-tabs {
  display: flex; gap: 2px; flex-wrap: wrap; padding: 10px 12px 0;
  border-bottom: 1px solid var(--fs-line);
}
.debug-tabs [role=tab] {
  font: inherit; font-family: var(--fs-mono); font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase;
  color: var(--fs-ink-3); background: transparent; border: 0; border-bottom: 2px solid transparent;
  padding: 7px 10px 9px; margin-bottom: -1px; cursor: pointer; border-radius: 3px 3px 0 0;
}
.debug-tabs [role=tab]:hover { color: var(--fs-ink); background: var(--fs-surface-3); }
.debug-tabs [role=tab][aria-selected=true] { color: var(--fs-accent-ink); border-bottom-color: var(--fs-accent); }
.debug-tabs [role=tab]:focus-visible { outline: 2px solid var(--fs-accent); outline-offset: -2px; }
.debug-panel { margin: 0; position: relative; }
.debug-copy {
  position: absolute; top: 10px; right: 12px; z-index: 1;
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit; font-size: 12px; color: var(--fs-ink-2);
  background: var(--fs-surface); border: 1px solid var(--fs-line-strong); border-radius: 4px;
  padding: 4px 8px; cursor: pointer;
}
.debug-copy:hover { color: var(--fs-ink); background: var(--fs-surface-2); }
.debug-copy:focus-visible { outline: 2px solid var(--fs-accent); outline-offset: 2px; }
.debug-copy[data-copied] { color: var(--fs-accent-ink); border-color: var(--fs-accent-line); background: var(--fs-accent-soft); }
.debug-vh {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
.debug-panel pre {
  margin: 0; padding: 14px 96px 14px 16px; max-height: 360px; overflow: auto;
  font-family: var(--fs-mono); font-size: 12px; line-height: 1.5; color: var(--fs-ink-2);
  background: var(--fs-surface-3); tab-size: 2;
}
</style>
