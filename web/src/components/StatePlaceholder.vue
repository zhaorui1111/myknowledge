<script setup lang="ts">
import { Loader2, Inbox } from 'lucide-vue-next'

/**
 * 通用状态占位组件：加载态 / 空状态。
 * - kind="loading"：显示旋转图标 + 文案
 * - kind="empty"：显示空状态图标 + 文案（可附说明）
 */
withDefaults(
  defineProps<{
    kind: 'loading' | 'empty'
    title?: string
    desc?: string
  }>(),
  {
    title: '',
    desc: '',
  },
)
</script>

<template>
  <div class="state" :class="`state--${kind}`">
    <div class="state__icon">
      <Loader2 v-if="kind === 'loading'" :size="28" class="state__spin" />
      <Inbox v-else :size="28" />
    </div>
    <p class="state__title">
      {{ title || (kind === 'loading' ? '加载中…' : '暂无内容') }}
    </p>
    <p v-if="desc" class="state__desc">{{ desc }}</p>
  </div>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-4);
  text-align: center;
}
.state__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-lg);
  background: var(--color-bg-mute);
  color: var(--color-text-mute);
}
.state--loading .state__icon {
  color: var(--color-brand);
}
.state__spin {
  animation: state-spin 0.9s linear infinite;
}
@keyframes state-spin {
  to {
    transform: rotate(360deg);
  }
}
.state__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-soft);
}
.state__desc {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-mute);
  max-width: 420px;
  line-height: var(--leading-body);
}

@media (prefers-reduced-motion: reduce) {
  .state__spin {
    animation-duration: 2s;
  }
}
</style>
