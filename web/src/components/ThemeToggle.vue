<script setup lang="ts">
import { computed } from 'vue'
import { Sun, Moon, Monitor } from 'lucide-vue-next'
import { useTheme } from '../composables/useTheme'

const { mode, cycleTheme } = useTheme()

const icon = computed(() => {
  if (mode.value === 'light') return Sun
  if (mode.value === 'dark') return Moon
  return Monitor
})

const label = computed(() => {
  if (mode.value === 'light') return '亮色'
  if (mode.value === 'dark') return '暗色'
  return '跟随系统'
})

const title = computed(() => `主题：${label.value}（点击切换）`)
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :title="title"
    :aria-label="title"
    @click="cycleTheme"
  >
    <component :is="icon" class="theme-toggle__icon" :size="18" />
    <span class="theme-toggle__text">{{ label }}</span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-bg-soft);
  color: var(--color-text-soft);
  font-size: 0.85rem;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease);
}

.theme-toggle:hover {
  color: var(--color-text);
  border-color: var(--color-brand);
  box-shadow: var(--shadow-sm);
}

.theme-toggle:active {
  transform: scale(0.96);
}

.theme-toggle__icon {
  display: block;
  color: var(--color-brand);
}

.theme-toggle__text {
  line-height: 1;
}

@media (max-width: 640px) {
  .theme-toggle__text {
    display: none;
  }
  .theme-toggle {
    padding: 0;
    width: 36px;
    justify-content: center;
  }
}
</style>
