<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { PanelLeftClose, PanelLeftOpen, ChevronDown, FileText, X } from 'lucide-vue-next'
import { useSidebar } from '../composables/useSidebar'

/** 单个文档条目 */
export interface NavItem {
  /** 路由 slug，最终跳转到 /doc/:module/:slug */
  slug: string
  /** 展示标题 */
  title: string
}

/** 一个可折叠分组 */
export interface NavGroup {
  /** 分组标题，可选；无标题则为扁平列表 */
  label?: string
  items: NavItem[]
}

const props = withDefaults(
  defineProps<{
    /** 模块标识，用于拼接 /doc/:module/:slug 路由 */
    module: string
    /** 侧栏顶部标题 */
    title: string
    /** 侧栏副标题（可选） */
    subtitle?: string
    /** 目录数据（分组形式） */
    groups?: NavGroup[]
    /** 当前选中的 slug */
    activeSlug?: string
  }>(),
  {
    subtitle: '',
    groups: () => [],
    activeSlug: '',
  },
)

const emit = defineEmits<{
  (e: 'select', slug: string): void
}>()

const { drawerOpen, closeDrawer, setHasSidebar } = useSidebar()

// 桌面端：整栏折叠（仅大屏有意义）
const collapsed = ref(false)

// 分组展开状态：默认全部展开
const openGroups = ref<Record<number, boolean>>({})

function ensureGroupState() {
  const next: Record<number, boolean> = {}
  props.groups.forEach((_, i) => {
    next[i] = openGroups.value[i] ?? true
  })
  openGroups.value = next
}

function toggleGroup(index: number) {
  openGroups.value[index] = !openGroups.value[index]
}

// 当前条目数量（用于副标题兜底展示）
const totalCount = computed(() =>
  props.groups.reduce((sum, g) => sum + g.items.length, 0),
)

// 判断某条目是否为当前阅读项
function isActive(slug: string): boolean {
  return props.activeSlug === slug
}

// 点击导航项
function handleNavClick(slug: string) {
  emit('select', slug)
  // 移动端点击后收起抽屉
  closeDrawer()
}

onMounted(() => {
  setHasSidebar(true)
  ensureGroupState()
})

onBeforeUnmount(() => {
  setHasSidebar(false)
})

watch(
  () => props.groups,
  () => ensureGroupState(),
  { deep: false },
)
</script>

<template>
  <div class="layout" :class="{ 'layout--collapsed': collapsed }">
    <!-- 移动端遮罩 -->
    <transition name="fade">
      <div v-if="drawerOpen" class="layout__scrim" @click="closeDrawer" />
    </transition>

    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ 'sidebar--open': drawerOpen }">
      <div class="sidebar__head">
        <div class="sidebar__titles">
          <h2 class="sidebar__title">{{ title }}</h2>
          <p class="sidebar__subtitle">
            {{ subtitle || `共 ${totalCount} 篇` }}
          </p>
        </div>
        <!-- 移动端关闭按钮 -->
        <button class="sidebar__close" aria-label="关闭目录" @click="closeDrawer">
          <X :size="18" />
        </button>
      </div>

      <nav class="sidebar__nav">
        <p v-if="!groups.length" class="sidebar__empty">
          目录即将生成…
        </p>

        <div
          v-for="(group, gi) in groups"
          :key="gi"
          class="nav-group"
        >
          <button
            v-if="group.label"
            class="nav-group__header"
            :aria-expanded="openGroups[gi]"
            @click="toggleGroup(gi)"
          >
            <ChevronDown
              class="nav-group__chevron"
              :class="{ 'nav-group__chevron--closed': !openGroups[gi] }"
              :size="16"
            />
            <span class="nav-group__label">{{ group.label }}</span>
            <span class="nav-group__count">{{ group.items.length }}</span>
          </button>

          <transition name="collapse">
            <ul v-show="!group.label || openGroups[gi]" class="nav-list">
              <li v-for="item in group.items" :key="item.slug">
                <a
                  class="nav-link"
                  :class="{ 'nav-link--active': isActive(item.slug) }"
                  href="javascript:void(0)"
                  @click="handleNavClick(item.slug)"
                >
                  <FileText class="nav-link__icon" :size="15" />
                  <span class="nav-link__text">{{ item.title }}</span>
                </a>
              </li>
            </ul>
          </transition>
        </div>
      </nav>

      <!-- 桌面端折叠按钮 -->
      <button class="sidebar__collapse" @click="collapsed = !collapsed">
        <component :is="collapsed ? PanelLeftOpen : PanelLeftClose" :size="16" />
        <span class="sidebar__collapse-text">收起目录</span>
      </button>
    </aside>

    <!-- 折叠后的展开把手（桌面端） -->
    <button
      v-if="collapsed"
      class="layout__expand"
      aria-label="展开目录"
      @click="collapsed = false"
    >
      <PanelLeftOpen :size="18" />
    </button>

    <!-- 内容区 -->
    <section class="content">
      <div class="content__inner">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  min-height: calc(100vh - var(--nav-height));
  transition: grid-template-columns var(--dur) var(--ease);
}

.layout--collapsed {
  grid-template-columns: 0 minmax(0, 1fr);
}

/* ===== Sidebar ===== */
.sidebar {
  position: sticky;
  top: var(--nav-height);
  align-self: start;
  height: calc(100vh - var(--nav-height));
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-soft);
  overflow: hidden;
  transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease);
}

.layout--collapsed .sidebar {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}

.sidebar__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-5) var(--space-5) var(--space-4);
  border-bottom: 1px solid var(--color-border-soft);
}

.sidebar__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-heading);
  margin: 0;
  line-height: var(--leading-heading);
}

.sidebar__subtitle {
  margin: var(--space-1) 0 0;
  font-size: 0.78rem;
  color: var(--color-text-mute);
}

.sidebar__close {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-soft);
  cursor: pointer;
}
.sidebar__close:hover {
  background: var(--color-bg-mute);
  color: var(--color-text);
}

.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3) var(--space-3) var(--space-5);
  scrollbar-width: thin;
}

.sidebar__empty {
  padding: var(--space-4);
  color: var(--color-text-mute);
  font-size: 0.85rem;
  font-style: italic;
}

/* ===== Nav group ===== */
.nav-group + .nav-group {
  margin-top: var(--space-2);
}

.nav-group__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  background: transparent;
  color: var(--color-text-soft);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: var(--radius-md);
}
.nav-group__header:hover {
  color: var(--color-text);
}

.nav-group__chevron {
  flex-shrink: 0;
  transition: transform var(--dur) var(--ease);
}
.nav-group__chevron--closed {
  transform: rotate(-90deg);
}

.nav-group__label {
  flex: 1;
  text-align: left;
}

.nav-group__count {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-mute);
  background: var(--color-bg-mute);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}

.nav-list {
  list-style: none;
  margin: var(--space-1) 0 0;
  padding: 0;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  margin: 1px 0;
  border-radius: var(--radius-md);
  color: var(--color-text-soft);
  font-size: 0.875rem;
  line-height: 1.4;
  text-decoration: none;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.nav-link:hover {
  background: var(--color-bg-mute);
  color: var(--color-text);
}

.nav-link__icon {
  flex-shrink: 0;
  color: var(--color-text-mute);
}
.nav-link:hover .nav-link__icon {
  color: var(--color-brand);
}

.nav-link__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-link--active {
  background: rgba(var(--color-brand-rgb), 0.12);
  color: var(--color-brand);
  font-weight: 600;
}
.nav-link--active .nav-link__icon {
  color: var(--color-brand);
}

/* ===== Collapse button (desktop) ===== */
.sidebar__collapse {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border: none;
  border-top: 1px solid var(--color-border-soft);
  background: transparent;
  color: var(--color-text-mute);
  font-size: 0.8rem;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease);
}
.sidebar__collapse:hover {
  color: var(--color-text);
}

/* ===== Expand handle when collapsed ===== */
.layout__expand {
  position: fixed;
  top: calc(var(--nav-height) + var(--space-4));
  left: var(--space-3);
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  color: var(--color-text-soft);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease);
}
.layout__expand:hover {
  color: var(--color-brand);
  transform: translateX(2px);
}

/* ===== Content ===== */
.content {
  min-width: 0;
  padding: var(--space-7) var(--space-6) var(--space-8);
}

.content__inner {
  max-width: var(--content-max);
  margin: 0 auto;
}

/* ===== Scrim (mobile) ===== */
.layout__scrim {
  display: none;
}

/* ===== Transitions ===== */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.collapse-enter-active,
.collapse-leave-active {
  transition: opacity var(--dur-fast) var(--ease);
}
.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
}

/* ===== Responsive: tablet ===== */
@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .layout--collapsed {
    grid-template-columns: 0 minmax(0, 1fr);
  }
}

/* ===== Responsive: mobile (drawer) ===== */
@media (max-width: 768px) {
  .layout,
  .layout--collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    position: fixed;
    top: var(--nav-height);
    left: 0;
    bottom: 0;
    width: min(82vw, 320px);
    height: calc(100vh - var(--nav-height));
    z-index: 50;
    transform: translateX(-100%);
    opacity: 1;
    box-shadow: var(--shadow-lg);
  }
  .layout--collapsed .sidebar {
    transform: translateX(-100%);
    opacity: 1;
    pointer-events: auto;
  }
  .sidebar--open {
    transform: translateX(0) !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  }

  .sidebar__close {
    display: inline-flex;
  }

  /* 移动端用抽屉，不显示桌面折叠/展开控件 */
  .sidebar__collapse,
  .layout__expand {
    display: none;
  }

  .layout__scrim {
    display: block;
    position: fixed;
    top: var(--nav-height);
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 45;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  .content {
    padding: var(--space-5) var(--space-4) var(--space-7);
  }
}
</style>
