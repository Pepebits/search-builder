// Lets TypeScript (and vue-tsc's host) resolve `.vue` imports from `.ts` files.
// vue-tsc replaces this with the real SFC types when it type-checks a `.vue`
// file directly; this declaration only covers a `.ts`/`.js` file that imports one.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
