<script setup lang="ts">
import { ref } from 'vue'
import { Binary } from 'lucide-vue-next'
import AppLayout from '../components/AppLayout.vue'
import DocContent from '../components/DocContent.vue'
import StatePlaceholder from '../components/StatePlaceholder.vue'
import { useModuleNav } from '../composables/useModuleNav'

const { groups, total, loading } = useModuleNav('algorithm')
const currentSlug = ref('')

function handleSelect(slug: string) {
  currentSlug.value = slug
}
</script>

<template>
  <AppLayout
    module="algorithm"
    title="算法与数据结构"
    subtitle="Swift + Objective-C 双语"
    :groups="groups"
    :active-slug="currentSlug"
    @select="handleSelect"
  >
    <!-- 未选中专题时显示欢迎 hero -->
    <template v-if="!currentSlug">
      <header class="module-hero">
        <div class="module-hero__icon module-hero__icon--algo">
          <Binary :size="26" />
        </div>
        <div>
          <h1 class="module-hero__title">算法与数据结构</h1>
          <p class="module-hero__desc">
            Swift 主实现 + Objective-C 对照，覆盖数组、链表、树、图、动态规划等
            共规划 19 个专题，每篇含原理、图解、复杂度分析、典型题与易错点。
          </p>
        </div>
      </header>

      <StatePlaceholder
        v-if="loading"
        kind="loading"
        title="正在加载目录"
        desc="即将列出全部算法专题"
      />
      <StatePlaceholder
        v-else-if="total === 0"
        kind="empty"
        title="该模块暂无内容"
        desc="内容生成后将自动出现在侧边栏，敬请期待。"
      />
      <p v-else class="module-tip">
        从左侧目录选择一个专题开始阅读，共 {{ total }} 篇。
      </p>
    </template>

    <!-- 选中专题时直接展示文档内容 -->
    <DocContent
      v-else
      module="algorithm"
      :slug="currentSlug"
      @navigate="handleSelect"
    />
  </AppLayout>
</template>

<style scoped>
.module-hero {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border-soft);
}

.module-hero__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  color: #fff;
}
.module-hero__icon--algo {
  background: linear-gradient(135deg, #0ea5e9, #38bdf8);
  box-shadow: 0 8px 24px rgba(14, 165, 233, 0.35);
}

.module-hero__title {
  margin: 0 0 var(--space-2);
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--color-heading);
}

.module-hero__desc {
  margin: 0;
  color: var(--color-text-soft);
  line-height: var(--leading-body);
  max-width: 620px;
}

.module-tip {
  margin-top: var(--space-6);
  color: var(--color-text-mute);
  font-size: 0.9rem;
}
</style>
