<script setup lang="ts">
import { ref } from 'vue'
import { Smartphone } from 'lucide-vue-next'
import AppLayout from '../components/AppLayout.vue'
import DocContent from '../components/DocContent.vue'
import StatePlaceholder from '../components/StatePlaceholder.vue'
import { useModuleNav } from '../composables/useModuleNav'

const { groups, total, loading } = useModuleNav('ios')
const currentSlug = ref('')

function handleSelect(slug: string) {
  currentSlug.value = slug
}
</script>

<template>
  <AppLayout
    module="ios"
    title="iOS 开发"
    subtitle="原生开发知识体系"
    :groups="groups"
    :active-slug="currentSlug"
    @select="handleSelect"
  >
    <!-- 未选中专题时显示欢迎 hero -->
    <template v-if="!currentSlug">
      <header class="module-hero">
        <div class="module-hero__icon module-hero__icon--ios">
          <Smartphone :size="26" />
        </div>
        <div>
          <h1 class="module-hero__title">iOS 开发知识体系</h1>
          <p class="module-hero__desc">
            涵盖 Runtime、内存管理、多线程、UI 渲染、网络、架构等核心主题，
            共规划 25 个专题，配套源码级剖析与实战案例。
          </p>
        </div>
      </header>

      <StatePlaceholder
        v-if="loading"
        kind="loading"
        title="正在加载目录"
        desc="即将列出全部 iOS 专题"
      />
      <StatePlaceholder
        v-else-if="total === 0"
        kind="empty"
        title="该模块暂无内容"
        desc="内容接入后将自动生成目录导航，敬请期待。"
      />
      <p v-else class="module-tip">
        从左侧目录选择一个专题开始阅读，共 {{ total }} 篇。
      </p>
    </template>

    <!-- 选中专题时直接展示文档内容 -->
    <DocContent
      v-else
      module="ios"
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
.module-hero__icon--ios {
  background: linear-gradient(135deg, #6366f1, #818cf8);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
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
