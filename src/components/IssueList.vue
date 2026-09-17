<script setup>
import { findPerson, labelColor } from '../data/filters.js'
import { toneHue } from '../core/index.ts'

defineProps({
  issues: { type: Array, required: true }
})

const ago = (days) => (days === 1 ? 'yesterday' : `${days} days ago`)
</script>

<template>
  <ul class="issues">
    <li v-for="issue in issues" :key="issue.id" class="issue">
      <span
        class="issue-state"
        role="img"
        :aria-label="issue.state === 'opened' ? 'Open' : 'Closed'"
        :style="{ background: issue.state === 'opened' ? 'var(--fs-ok)' : 'var(--fs-closed)' }"
      />
      <div class="issue-body">
        <h3>{{ issue.title }}</h3>
        <p class="issue-meta">
          <span class="mono">#{{ issue.id }}</span>
          <span>{{ issue.type }}</span>
          <span>{{ issue.milestone }}</span>
          <span>updated {{ ago(issue.days) }}</span>
          <span v-if="issue.comments">{{ issue.comments }} comments</span>
          <span v-if="issue.confidential === 'yes'" class="issue-lock">confidential</span>
        </p>
        <ul v-if="issue.labels.length" class="issue-labels">
          <li v-for="name in issue.labels" :key="name" class="issue-chip">
            <span class="dot" :style="{ background: labelColor(name) }" aria-hidden="true" />{{ name }}
          </li>
        </ul>
      </div>
      <!-- `title` alone is not an accessible name: the initials get a real one. -->
      <span class="issue-who" :style="{ '--fs-tone-h': toneHue(issue.assignee) }">
        <span aria-hidden="true">{{ findPerson(issue.assignee)?.initials ?? '–' }}</span>
        <span class="issue-vh">{{
          findPerson(issue.assignee) ? `Assigned to ${findPerson(issue.assignee).label}` : 'Unassigned'
        }}</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.issues { list-style: none; margin: 0; padding: 0; }
.issue { display: flex; gap: 12px; align-items: flex-start; padding: 13px 16px; border-top: 1px solid var(--fs-line); }
/* Direct child only: a descendant selector here also matched the first label pill
   in every row and took its top border away. */
.issues > li:first-child { border-top: 0; }
.issue-state { flex: none; margin-top: 3px; width: 9px; height: 9px; border-radius: 50%; }
.issue-body { min-width: 0; flex: 1; }
.issue-body h3 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.35; letter-spacing: -.005em; }
.issue-meta {
  display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center;
  margin: 5px 0 0; font-size: 12.5px; color: var(--fs-ink-3);
}
.mono { font-family: var(--fs-mono); }
.issue-lock {
  font-family: var(--fs-mono); font-size: 11px; color: var(--fs-clay);
  border: 1px dashed var(--fs-clay); border-radius: 3px; padding: 0 5px;
}
/* `align-items: center`, not the default stretch: two pills whose text happens to
   measure a fraction apart must not be pulled to different heights. */
.issue-labels { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.issue-chip {
  display: inline-flex; align-items: center; gap: 6px; font-family: var(--fs-mono); font-size: 11.5px;
  /* A fixed, whole-pixel box: the same 22px for every label, whatever its glyphs. */
  box-sizing: border-box; height: 22px; line-height: 1;
  border: 1px solid var(--fs-line-strong); border-radius: 999px; padding: 0 8px 0 6px; color: var(--fs-ink-2);
}
.dot { width: 8px; height: 8px; border-radius: 50%; }
.issue-vh {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
.issue-who {
  flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%;
  font-family: var(--fs-mono); font-size: 10.5px; font-weight: 600;
  background: oklch(var(--fs-av-l) var(--fs-av-c) var(--fs-tone-h, 160));
  color: oklch(var(--fs-av-ink-l) var(--fs-av-ink-c) var(--fs-tone-h, 160));
}
</style>
