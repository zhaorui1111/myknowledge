<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

/* ─── Types ─── */
interface TocItem {
  id: string
  text: string
  level: number
}

/* ─── Props ─── */
const props = defineProps<{
  module: string
  slug: string
}>()

const emit = defineEmits<{
  (e: 'navigate', slug: string): void
}>()

/* ─── State ─── */
const html = ref('')
const loading = ref(true)
const error = ref('')
const toc = ref<TocItem[]>([])
const activeId = ref('')
const contentEl = ref<HTMLElement | null>(null)

/* ─── Markdown-it instance ─── */
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')

let headingIndex = 0

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str: string, lang: string): string {
    const langLabel = lang || 'text'
    let highlighted: string
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(str, { language: lang }).value
      } catch {
        highlighted = md.utils.escapeHtml(str)
      }
    } else {
      highlighted = md.utils.escapeHtml(str)
    }
    return (
      `<div class="code-block" data-lang="${md.utils.escapeHtml(langLabel)}">` +
      `<div class="code-block__header">` +
      `<span class="code-block__lang">${md.utils.escapeHtml(langLabel)}</span>` +
      `<button class="code-block__copy" data-code="${encodeURIComponent(str)}" title="复制代码">` +
      `<svg class="copy-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>` +
      `<svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polyline points="20 6 9 17 4 12"/></svg>` +
      `</button>` +
      `</div>` +
      `<pre class="hljs"><code>${highlighted}</code></pre>` +
      `</div>`
    )
  },
})

md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]
  const inlineToken = tokens[idx + 1]
  const text = inlineToken ? inlineToken.children
    ?.filter(t => t.type === 'text' || t.type === 'code_inline')
    .map(t => t.content)
    .join('') ?? '' : ''
  const slug = slugify(text) || `heading-${headingIndex}`
  headingIndex++
  token.attrSet('id', slug)
  token.attrSet('class', 'doc-heading')
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.heading_close = (tokens, idx, options, _env, self) => {
  return self.renderToken(tokens, idx, options)
}

/* ─── Extract TOC from tokens ─── */
function extractToc(src: string): TocItem[] {
  const tokens = md.parse(src, {})
  const items: TocItem[] = []
  let hi = 0
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') {
      const level = parseInt(tokens[i].tag.slice(1), 10)
      const inlineToken = tokens[i + 1]
      const text = inlineToken ? inlineToken.children
        ?.filter(t => t.type === 'text' || t.type === 'code_inline')
        .map(t => t.content)
        .join('') ?? '' : ''
      const slug = slugify(text) || `heading-${hi}`
      hi++
      if (level >= 2 && level <= 4) {
        items.push({ id: slug, text, level })
      }
    }
  }
  return items
}

/* ─── Load document ─── */
async function loadDoc() {
  loading.value = true
  error.value = ''
  toc.value = []
  activeId.value = ''
  headingIndex = 0
  try {
    const res = await fetch(`/content/${props.module}/${props.slug}.md`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    toc.value = extractToc(text)
    headingIndex = 0
    html.value = md.render(text)
    await nextTick()
    initScrollSpy()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

/* ─── Scroll spy for TOC ─── */
let observer: IntersectionObserver | null = null

function initScrollSpy() {
  if (observer) observer.disconnect()
  const headings = contentEl.value?.querySelectorAll('.doc-heading')
  if (!headings || headings.length === 0) return

  const headingIds: string[] = []
  headings.forEach(h => {
    const id = h.getAttribute('id')
    if (id) headingIds.push(id)
  })

  const visibleIds = new Set<string>()

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        const id = entry.target.getAttribute('id')
        if (!id) return
        if (entry.isIntersecting) {
          visibleIds.add(id)
        } else {
          visibleIds.delete(id)
        }
      })
      for (const hId of headingIds) {
        if (visibleIds.has(hId)) {
          activeId.value = hId
          return
        }
      }
    },
    {
      rootMargin: '-80px 0px -70% 0px',
      threshold: 0,
    }
  )

  headings.forEach(h => observer!.observe(h))
}

/* ─── Content click handler (copy + md link interception) ─── */
function handleContentClick(e: MouseEvent) {
  // Handle copy button clicks
  const btn = (e.target as HTMLElement).closest('.code-block__copy') as HTMLElement | null
  if (btn) {
    const code = decodeURIComponent(btn.getAttribute('data-code') || '')
    navigator.clipboard.writeText(code).then(() => {
      const copyIcon = btn.querySelector('.copy-icon') as SVGElement | null
      const checkIcon = btn.querySelector('.check-icon') as SVGElement | null
      if (copyIcon) copyIcon.style.display = 'none'
      if (checkIcon) checkIcon.style.display = 'block'
      setTimeout(() => {
        if (copyIcon) copyIcon.style.display = 'block'
        if (checkIcon) checkIcon.style.display = 'none'
      }, 2000)
    })
    return
  }

  // Handle .md link clicks - intercept and emit navigate event
  const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
  if (anchor) {
    const href = anchor.getAttribute('href') || ''
    // Match relative .md links like "03-内存管理详解.md" or "./03-内存管理详解.md"
    const mdMatch = href.match(/^(?:\.\/)?(.+)\.md$/)
    if (mdMatch) {
      e.preventDefault()
      const targetSlug = decodeURIComponent(mdMatch[1])
      emit('navigate', targetSlug)
    }
  }
}

/* ─── TOC click ─── */
function scrollToHeading(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    activeId.value = id
    history.replaceState(null, '', `#${id}`)
  }
}

/* ─── TOC visibility ─── */
const showToc = computed(() => toc.value.length > 0)

/* ─── Lifecycle ─── */
onMounted(() => {
  loadDoc()
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
})

watch(
  () => props.module + '/' + props.slug,
  () => {
    loadDoc()
  }
)
</script>

<template>
  <div class="doc-content">
    <article
      ref="contentEl"
      class="doc-content__body markdown-body"
      v-if="!loading && !error"
      v-html="html"
      @click="handleContentClick"
    />

    <div v-if="loading" class="doc-content__status">
      <div class="doc-content__spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-if="error" class="doc-content__status doc-content__status--error">
      <span>加载失败: {{ error }}</span>
    </div>

    <!-- Right-side TOC -->
    <aside v-if="showToc && !loading && !error" class="doc-content__toc">
      <div class="toc__wrapper">
        <h4 class="toc__title">目录</h4>
        <nav class="toc__nav">
          <a
            v-for="item in toc"
            :key="item.id"
            :href="`#${item.id}`"
            class="toc__link"
            :class="[
              `toc__link--l${item.level}`,
              { 'toc__link--active': activeId === item.id }
            ]"
            @click.prevent="scrollToHeading(item.id)"
          >
            {{ item.text }}
          </a>
        </nav>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.doc-content {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: var(--space-4);
}

.doc-content__body {
  min-width: 0;
  padding-bottom: var(--space-8);
}

.doc-content__status {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8);
  color: var(--color-text-mute);
  font-size: 0.95rem;
}
.doc-content__status--error {
  color: var(--color-danger);
}

.doc-content__spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-brand);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.doc-content__toc {
  position: relative;
}

.toc__wrapper {
  position: sticky;
  top: calc(var(--nav-height) + var(--space-6));
  max-height: calc(100vh - var(--nav-height) - var(--space-8));
  overflow-y: auto;
  padding-left: var(--space-4);
  border-left: 1px solid var(--color-border-soft);
}

.toc__title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-mute);
  margin-bottom: var(--space-3);
}

.toc__nav {
  display: flex;
  flex-direction: column;
}

.toc__link {
  display: block;
  padding: 4px 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--color-text-mute);
  text-decoration: none;
  transition: color var(--dur-fast) var(--ease);
  border-left: 2px solid transparent;
  margin-left: -1px;
  padding-left: var(--space-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc__link--l3 {
  padding-left: calc(var(--space-3) + var(--space-3));
  font-size: 0.78rem;
}

.toc__link--l4 {
  padding-left: calc(var(--space-3) + var(--space-5));
  font-size: 0.76rem;
}

.toc__link:hover {
  color: var(--color-text-soft);
}

.toc__link--active {
  color: var(--color-brand);
  border-left-color: var(--color-brand);
  font-weight: 500;
}

/* Code block styles */
:deep(.code-block) {
  position: relative;
  margin: var(--space-5) 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  background: var(--color-code-bg);
}

:deep(.code-block__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-mute);
  border-bottom: 1px solid var(--color-border-soft);
}

:deep(.code-block__lang) {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-mute);
}

:deep(.code-block__copy) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-mute);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}

:deep(.code-block__copy:hover) {
  background: var(--color-bg-soft);
  color: var(--color-brand);
}

:deep(.code-block pre.hljs) {
  margin: 0;
  padding: var(--space-4) var(--space-5);
  overflow-x: auto;
  background: transparent !important;
  border-radius: 0;
  border: none;
}

:deep(.code-block pre.hljs code) {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.65;
  tab-size: 4;
}

:deep(.doc-heading) {
  position: relative;
  scroll-margin-top: calc(var(--nav-height) + var(--space-5));
}

:deep(.doc-heading:hover::before) {
  content: '#';
  position: absolute;
  left: -1.2em;
  color: var(--color-brand);
  opacity: 0.6;
  font-weight: 400;
}

:deep(.markdown-body h1) {
  font-size: 2rem;
  margin: var(--space-6) 0 var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-soft);
}
:deep(.markdown-body h2) {
  font-size: 1.55rem;
  margin: var(--space-7) 0 var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border-soft);
}
:deep(.markdown-body h3) {
  font-size: 1.25rem;
  margin: var(--space-6) 0 var(--space-3);
}
:deep(.markdown-body h4) {
  font-size: 1.1rem;
  margin: var(--space-5) 0 var(--space-3);
}

:deep(.markdown-body p) {
  margin: var(--space-4) 0;
  line-height: var(--leading-body);
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-left: 1.8em;
  margin: var(--space-4) 0;
}

:deep(.markdown-body li) {
  margin: var(--space-2) 0;
}

:deep(.markdown-body blockquote) {
  padding: var(--space-3) var(--space-4);
  margin: var(--space-4) 0;
  border-left: 3px solid var(--color-brand);
  background: var(--color-bg-soft);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--color-text-soft);
}

:deep(.markdown-body img) {
  border-radius: var(--radius-md);
  max-width: 100%;
}

:deep(.markdown-body table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-radius: var(--radius-md);
  border-collapse: collapse;
  margin: var(--space-5) 0;
}

:deep(.markdown-body code:not(pre code)) {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--color-code-inline-bg);
  color: var(--color-code-inline-text);
}

:deep(.markdown-body hr) {
  border: none;
  height: 1px;
  background: var(--color-border);
  margin: var(--space-7) 0;
}

@media (max-width: 1100px) {
  .doc-content {
    grid-template-columns: 1fr;
  }
  .doc-content__toc {
    display: none;
  }
}

@media (max-width: 768px) {
  :deep(.code-block pre.hljs) {
    padding: var(--space-3) var(--space-4);
  }
  :deep(.code-block pre.hljs code) {
    font-size: 0.8rem;
  }
}
</style>
