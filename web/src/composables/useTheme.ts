import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'mk-theme'

// Resolve what the system currently prefers.
function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStored(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'system'
}

// The user's chosen mode (may be 'system').
const mode = ref<ThemeMode>(readStored())
// The actually-applied theme ('light' | 'dark'), derived from mode.
const resolved = ref<'light' | 'dark'>('light')

let mediaQuery: MediaQueryList | null = null
let mediaListenerBound = false

// Apply the resolved theme to <html data-theme="...">.
function applyToDom(theme: 'light' | 'dark') {
  const root = document.documentElement
  // Add a short-lived transition class so switching is smooth, then remove it
  // so it doesn't interfere with route transitions / hover effects.
  root.classList.add('theme-transition')
  root.setAttribute('data-theme', theme)
  window.setTimeout(() => root.classList.remove('theme-transition'), 350)
}

function computeResolved(m: ThemeMode): 'light' | 'dark' {
  if (m === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return m
}

function refresh() {
  const next = computeResolved(mode.value)
  resolved.value = next
  applyToDom(next)
}

// React to OS theme changes only when in 'system' mode.
function bindMediaListener() {
  if (mediaListenerBound || typeof window === 'undefined' || !window.matchMedia) return
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (mode.value === 'system') refresh()
  }
  // addEventListener is the modern API; fall back for old Safari.
  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handler)
  else mediaQuery.addListener(handler)
  mediaListenerBound = true
}

// Persist + re-resolve whenever the chosen mode changes.
watch(mode, (m) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, m)
  refresh()
})

export function setTheme(m: ThemeMode) {
  mode.value = m
}

// Cycle through the three modes for a single-button toggle:
// light -> dark -> system -> light ...
export function cycleTheme() {
  const order: ThemeMode[] = ['light', 'dark', 'system']
  const idx = order.indexOf(mode.value)
  mode.value = order[(idx + 1) % order.length]
}

// Toggle strictly between light and dark (ignores 'system').
export function toggleTheme() {
  mode.value = resolved.value === 'dark' ? 'light' : 'dark'
}

// Call once at app startup, before first paint ideally.
export function initTheme() {
  bindMediaListener()
  refresh()
}

export function useTheme() {
  return { mode, resolved, setTheme, toggleTheme, cycleTheme, initTheme }
}
