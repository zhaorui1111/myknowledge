<script setup lang="ts">
import { onMounted } from 'vue'
import { Menu } from 'lucide-vue-next'
import ThemeToggle from './components/ThemeToggle.vue'
import SearchBox from './components/SearchBox.vue'
import { useTheme } from './composables/useTheme'
import { useSidebar } from './composables/useSidebar'

const { initTheme } = useTheme()
const { hasSidebar, toggleDrawer } = useSidebar()

// Ensure the theme is applied even if a view is the entry point.
onMounted(() => initTheme())
</script>

<template>
  <div id="app">
    <nav class="top-nav">
      <div class="nav-left">
        <!-- 移动端汉堡按钮：仅在拥有侧边栏的页面显示 -->
        <button
          v-if="hasSidebar"
          class="nav-burger"
          aria-label="打开目录"
          @click="toggleDrawer"
        >
          <Menu :size="20" />
        </button>
        <router-link to="/" class="nav-brand">
          <span class="nav-brand__dot"></span>
          毕生所学
        </router-link>
      </div>
      <div class="nav-right">
        <div class="nav-links">
          <router-link to="/ios">iOS</router-link>
          <router-link to="/algorithm">算法</router-link>
          <router-link to="/llm">大模型</router-link>
          <router-link to="/cross-platform">跨端</router-link>
        </div>
        <SearchBox />
        <ThemeToggle />
      </div>
    </nav>
    <main>
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style>
/* ===== Markdown + highlight themes, switched by [data-theme] ===== */
/* Light (default) */
@import "github-markdown-css/github-markdown-light.css";
@import "highlight.js/styles/github.css";

#app {
  min-height: 100vh;
}

.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--nav-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  background: var(--color-bg-overlay);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid var(--color-border);
  z-index: 100;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.nav-burger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-soft);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.nav-burger:hover {
  background: var(--color-bg-mute);
  color: var(--color-text);
}

.nav-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-heading);
  letter-spacing: 0.2px;
}

.nav-brand__dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--gradient-brand);
  box-shadow: var(--shadow-glow);
}

.nav-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.nav-links {
  display: flex;
  gap: var(--space-5);
}

.nav-links a {
  color: var(--color-text-soft);
  font-size: 0.95rem;
  font-weight: 500;
  position: relative;
  padding: var(--space-1) 0;
}

.nav-links a:hover {
  color: var(--color-text);
}

.nav-links a.router-link-active {
  color: var(--color-brand);
}

.nav-links a.router-link-active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2px;
  border-radius: var(--radius-pill);
  background: var(--gradient-brand);
}

main {
  padding-top: var(--nav-height);
  min-height: calc(100vh - var(--nav-height));
}

/* ===== Page transition ===== */
.page-enter-active,
.page-leave-active {
  transition: opacity var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Markdown body uses our tokens regardless of GitHub css defaults. */
.markdown-body {
  background: transparent !important;
  color: var(--color-text) !important;
  font-family: var(--font-sans) !important;
}

@media (max-width: 768px) {
  .nav-burger {
    display: inline-flex;
  }
  .nav-links {
    display: none;
  }
}

@media (max-width: 640px) {
  .top-nav {
    padding: 0 var(--space-4);
  }
  .nav-right {
    gap: var(--space-2);
  }
}

/* ===== Reduced motion: respect user preference globally ===== */
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  .page-enter-active,
  .page-leave-active {
    transition: opacity var(--dur-fast) var(--ease);
  }
  .page-enter-from,
  .page-leave-to {
    transform: none;
  }
}

/* ===== Dark theme: markdown + highlight overrides ===== */
/* We import the LIGHT github css above; in dark mode we override the few
   color-bearing rules with our tokens so a single stylesheet serves both. */
[data-theme="dark"] .markdown-body {
  color: var(--color-text) !important;
}
[data-theme="dark"] .markdown-body h1,
[data-theme="dark"] .markdown-body h2,
[data-theme="dark"] .markdown-body h3,
[data-theme="dark"] .markdown-body h4,
[data-theme="dark"] .markdown-body h5,
[data-theme="dark"] .markdown-body h6 {
  color: var(--color-heading) !important;
  border-bottom-color: var(--color-border) !important;
}
[data-theme="dark"] .markdown-body a {
  color: var(--color-link) !important;
}
[data-theme="dark"] .markdown-body hr {
  background-color: var(--color-border) !important;
}
[data-theme="dark"] .markdown-body blockquote {
  color: var(--color-text-soft) !important;
  border-left-color: var(--color-border) !important;
}
[data-theme="dark"] .markdown-body table tr {
  background-color: var(--color-bg) !important;
  border-top-color: var(--color-border) !important;
}
[data-theme="dark"] .markdown-body table tr:nth-child(2n) {
  background-color: var(--color-bg-soft) !important;
}
[data-theme="dark"] .markdown-body table th,
[data-theme="dark"] .markdown-body table td {
  border-color: var(--color-border) !important;
}
[data-theme="dark"] .markdown-body code:not(pre code) {
  background-color: var(--color-code-inline-bg) !important;
  color: var(--color-code-inline-text) !important;
}
[data-theme="dark"] .markdown-body pre,
[data-theme="dark"] .markdown-body pre code {
  background-color: var(--color-code-bg) !important;
}

/* highlight.js: github (light) is imported; provide a github-dark-ish
   palette for dark mode via tokenized overrides. */
[data-theme="dark"] .hljs {
  color: #c9d1d9;
  background: var(--color-code-bg);
}
[data-theme="dark"] .hljs-comment,
[data-theme="dark"] .hljs-quote {
  color: #8b949e;
}
[data-theme="dark"] .hljs-keyword,
[data-theme="dark"] .hljs-selector-tag,
[data-theme="dark"] .hljs-built_in {
  color: #ff7b72;
}
[data-theme="dark"] .hljs-string,
[data-theme="dark"] .hljs-attr,
[data-theme="dark"] .hljs-template-tag {
  color: #a5d6ff;
}
[data-theme="dark"] .hljs-number,
[data-theme="dark"] .hljs-literal {
  color: #79c0ff;
}
[data-theme="dark"] .hljs-title,
[data-theme="dark"] .hljs-title.function_,
[data-theme="dark"] .hljs-function .hljs-title {
  color: #d2a8ff;
}
[data-theme="dark"] .hljs-type,
[data-theme="dark"] .hljs-class .hljs-title {
  color: #ffa657;
}
[data-theme="dark"] .hljs-variable,
[data-theme="dark"] .hljs-name {
  color: #ffa657;
}
[data-theme="dark"] .hljs-meta {
  color: #79c0ff;
}
[data-theme="dark"] .hljs-symbol,
[data-theme="dark"] .hljs-bullet {
  color: #79c0ff;
}
[data-theme="dark"] .hljs-emphasis {
  font-style: italic;
}
[data-theme="dark"] .hljs-strong {
  font-weight: 700;
}
</style>
