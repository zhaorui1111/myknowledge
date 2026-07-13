<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, h } from 'vue'
import type { VNode } from 'vue'
import { useRouter } from 'vue-router'
import { Search, CornerDownLeft, ArrowUp, ArrowDown, FileText, X } from 'lucide-vue-next'
import { useSearch, type SearchHit } from '../composables/useSearch'

const router = useRouter()
const { ensureIndex, search, loaded, loading } = useSearch()

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const results = computed<SearchHit[]>(() => search(query.value, 24))

// 是否检测到 Mac，用于显示 ⌘ / Ctrl 提示
const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** 打开搜索面板并聚焦输入框 */
async function openPanel() {
  open.value = true
  // 打开时确保索引已加载
  ensureIndex()
  await nextTick()
  inputEl.value?.focus()
}

function closePanel() {
  open.value = false
  query.value = ''
  activeIndex.value = 0
}

/** 跳转到选中的文档 */
function go(hit: SearchHit) {
  router.push(`/doc/${hit.module}/${hit.slug}`)
  closePanel()
}

function onEnter() {
  const hit = results.value[activeIndex.value]
  if (hit) go(hit)
}

function moveActive(delta: number) {
  const n = results.value.length
  if (n === 0) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  scrollActiveIntoView()
}

async function scrollActiveIntoView() {
  await nextTick()
  const list = listEl.value
  if (!list) return
  const el = list.querySelector<HTMLElement>('.sr-item--active')
  el?.scrollIntoView({ block: 'nearest' })
}

// 输入变化时重置高亮到第一项
watch(query, () => {
  activeIndex.value = 0
})

// 全局快捷键：⌘K / Ctrl+K 打开；Esc 关闭
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (open.value) closePanel()
    else openPanel()
    return
  }
  if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    closePanel()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/**
 * 高亮 title 中命中的字符。返回 VNode 数组（render 函数渲染）。
 * matched 为字符下标集合。
 */
function highlight(title: string, matched: number[]): VNode[] {
  if (!matched.length) return [h('span', title)]
  const set = new Set(matched)
  const nodes: VNode[] = []
  let buf = ''
  let bufHl = false
  const flush = () => {
    if (!buf) return
    nodes.push(bufHl ? h('mark', { class: 'sr-mark' }, buf) : h('span', buf))
    buf = ''
  }
  for (let i = 0; i < title.length; i++) {
    const hl = set.has(i)
    if (hl !== bufHl) {
      flush()
      bufHl = hl
    }
    buf += title[i]
  }
  flush()
  return nodes
}

const HitTitle = (props: { hit: SearchHit }) =>
  h('span', { class: 'sr-title' }, highlight(props.hit.title, props.hit.matched))

/** 模块徽标的色彩类 */
function moduleClass(module: string) {
  return `sr-badge--${module}`
}
</script>

<template>
  <!-- 顶栏触发按钮 -->
  <button class="search-trigger" aria-label="搜索" @click="openPanel">
    <Search :size="16" class="search-trigger__icon" />
    <span class="search-trigger__text">搜索</span>
    <kbd class="search-trigger__kbd">{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
  </button>

  <!-- 搜索面板（teleport 到 body，覆盖全屏） -->
  <Teleport to="body">
    <transition name="sr-fade">
      <div v-if="open" class="sr-overlay" @click.self="closePanel">
        <transition name="sr-pop" appear>
          <div class="sr-panel" role="dialog" aria-modal="true" aria-label="全站搜索">
            <!-- 输入区 -->
            <div class="sr-inputbar">
              <Search :size="18" class="sr-inputbar__icon" />
              <input
                ref="inputEl"
                v-model="query"
                class="sr-input"
                type="text"
                placeholder="搜索标题或文件名…"
                autocomplete="off"
                spellcheck="false"
                @keydown.down.prevent="moveActive(1)"
                @keydown.up.prevent="moveActive(-1)"
                @keydown.enter.prevent="onEnter"
              />
              <button
                v-if="query"
                class="sr-clear"
                aria-label="清空"
                @click="query = ''"
              >
                <X :size="16" />
              </button>
            </div>

            <!-- 结果区 -->
            <div ref="listEl" class="sr-results">
              <!-- 加载态 -->
              <div v-if="!loaded && loading" class="sr-state">
                <span class="sr-spinner" /> 正在加载索引…
              </div>

              <!-- 空查询：提示 -->
              <div v-else-if="!query.trim()" class="sr-state sr-state--hint">
                输入关键字以搜索 iOS / 算法 / 大模型 的文章标题
              </div>

              <!-- 无结果 -->
              <div v-else-if="results.length === 0" class="sr-state">
                没有找到与「{{ query.trim() }}」相关的内容
              </div>

              <!-- 结果列表 -->
              <ul v-else class="sr-list">
                <li
                  v-for="(hit, i) in results"
                  :key="hit.module + '/' + hit.slug"
                  class="sr-item"
                  :class="{ 'sr-item--active': i === activeIndex }"
                  @mouseenter="activeIndex = i"
                  @click="go(hit)"
                >
                  <FileText :size="16" class="sr-item__icon" />
                  <div class="sr-item__main">
                    <HitTitle :hit="hit" />
                    <span v-if="hit.group" class="sr-item__group">{{ hit.group }}</span>
                  </div>
                  <span class="sr-badge" :class="moduleClass(hit.module)">
                    {{ hit.moduleLabel }}
                  </span>
                </li>
              </ul>
            </div>

            <!-- 底部快捷键提示 -->
            <div class="sr-footer">
              <span class="sr-hint"><ArrowUp :size="12" /><ArrowDown :size="12" /> 选择</span>
              <span class="sr-hint"><CornerDownLeft :size="12" /> 打开</span>
              <span class="sr-hint"><kbd>Esc</kbd> 关闭</span>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* ===== Trigger button ===== */
.search-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 34px;
  padding: 0 var(--space-2) 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-soft);
  color: var(--color-text-mute);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease);
}
.search-trigger:hover {
  border-color: var(--color-brand);
  color: var(--color-text);
}
.search-trigger__icon {
  flex-shrink: 0;
}
.search-trigger__kbd {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  line-height: 1;
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-mute);
  border: 1px solid var(--color-border);
  color: var(--color-text-mute);
}

/* ===== Overlay + panel ===== */
.sr-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.sr-panel {
  width: min(92vw, 640px);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

/* ===== Input bar ===== */
.sr-inputbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border-soft);
}
.sr-inputbar__icon {
  flex-shrink: 0;
  color: var(--color-text-mute);
}
.sr-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 1.05rem;
  color: var(--color-text);
  font-family: var(--font-sans);
}
.sr-input::placeholder {
  color: var(--color-text-mute);
}
.sr-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-bg-mute);
  color: var(--color-text-mute);
  cursor: pointer;
}
.sr-clear:hover {
  color: var(--color-text);
}

/* ===== Results ===== */
.sr-results {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
  scrollbar-width: thin;
}

.sr-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-7) var(--space-4);
  color: var(--color-text-mute);
  font-size: 0.9rem;
  text-align: center;
}
.sr-state--hint {
  color: var(--color-text-mute);
}

.sr-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-brand);
  border-radius: 50%;
  animation: sr-spin 0.7s linear infinite;
}
@keyframes sr-spin {
  to {
    transform: rotate(360deg);
  }
}

.sr-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sr-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
}
.sr-item--active {
  background: rgba(var(--color-brand-rgb), 0.12);
}
.sr-item__icon {
  flex-shrink: 0;
  color: var(--color-text-mute);
}
.sr-item--active .sr-item__icon {
  color: var(--color-brand);
}
.sr-item__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sr-title {
  color: var(--color-text);
  font-size: 0.95rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sr-item--active .sr-title {
  color: var(--color-heading);
}
.sr-item__group {
  font-size: 0.75rem;
  color: var(--color-text-mute);
}
.sr-badge {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  color: #fff;
}
.sr-badge--ios {
  background: linear-gradient(135deg, #6366f1, #818cf8);
}
.sr-badge--algorithm {
  background: linear-gradient(135deg, #10b981, #34d399);
}
.sr-badge--llm {
  background: linear-gradient(135deg, #ec4899, #f472b6);
}

/* highlight 命中字符 */
.sr-title :deep(.sr-mark) {
  background: transparent;
  color: var(--color-brand);
  font-weight: 800;
}

/* ===== Footer ===== */
.sr-footer {
  display: flex;
  gap: var(--space-5);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--color-border-soft);
  background: var(--color-bg-soft);
}
.sr-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--color-text-mute);
}
.sr-hint kbd {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-mute);
  border: 1px solid var(--color-border);
}

/* ===== Transitions ===== */
.sr-fade-enter-active,
.sr-fade-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.sr-fade-enter-from,
.sr-fade-leave-to {
  opacity: 0;
}
.sr-pop-enter-active {
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.sr-pop-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}

/* ===== Responsive ===== */
@media (max-width: 640px) {
  .search-trigger__text,
  .search-trigger__kbd {
    display: none;
  }
  .search-trigger {
    width: 34px;
    padding: 0;
    justify-content: center;
  }
  .sr-overlay {
    padding-top: 8vh;
  }
}

/* ===== Reduced motion ===== */
@media (prefers-reduced-motion: reduce) {
  .sr-spinner {
    animation-duration: 1.5s;
  }
  .sr-pop-enter-active,
  .sr-fade-enter-active,
  .sr-fade-leave-active {
    transition: none;
  }
}
</style>
