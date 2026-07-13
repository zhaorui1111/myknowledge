<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Smartphone, Binary, BrainCircuit, ArrowRight, Sparkles, Layers, Cpu } from 'lucide-vue-next'

/**
 * 首页 Home
 * - 英雄区（Hero）：大标题 + 副标题 + 渐变高光
 * - 四大模块卡片：iOS / 算法 / 大模型 / 跨端，带图标、文章数徽标、hover 抬升动效
 *
 * 文章数策略（B2 阶段）：
 *  - 先以「规划数」作为初始/兜底徽标值，保证首屏即有合理数字；
 *  - 运行时再异步探测 /content/<module>/index.json 清单（若存在）以校正为真实数。
 *    清单文件将在阶段 B5「模块目录生成」产出；在此之前 fetch 失败则静默回退到规划数。
 *  - 不使用 import.meta.glob 直接加载 md：该工程的 vite8 + rolldown 会把 md 纳入模块图
 *    并尝试解析，导致中文标题触发 PARSE_ERROR。运行时 fetch 清单更稳健、零构建耦合。
 */

// 各模块规划数（兜底）：iOS 已有 25 篇详解；算法 14 篇、大模型按 TODOLIST 规划逐步补齐。
const PLANNED = { ios: 26, algorithm: 19, llm: 16, 'cross-platform': 15, iot: 18 } as const

const iosCount = ref<number>(PLANNED.ios)
const algoCount = ref<number>(PLANNED.algorithm)
const llmCount = ref<number>(PLANNED.llm)
const cpCount = ref<number>(PLANNED['cross-platform'])
const iotCount = ref<number>(PLANNED.iot)

/** 尝试读取某模块的内容清单（B5 产出），失败则保留兜底值。 */
async function probeCount(mod: string, target: { value: number }) {
  try {
    const res = await fetch(`/content/${mod}/index.json`)
    if (!res.ok) return
    const data = await res.json()
    let n = NaN
    if (Array.isArray(data)) {
      n = data.length
    } else if (Array.isArray(data?.files)) {
      n = data.files.length
    } else if (Array.isArray(data?.groups)) {
      n = data.groups.reduce((sum: number, g: any) => sum + (Array.isArray(g?.items) ? g.items.length : 0), 0)
    }
    if (Number.isFinite(n) && n > 0) target.value = n
  } catch {
    /* 清单尚未生成，保留规划数 */
  }
}

onMounted(() => {
  probeCount('ios', iosCount)
  probeCount('algorithm', algoCount)
  probeCount('llm', llmCount)
  probeCount('cross-platform', cpCount)
  probeCount('iot', iotCount)
})

interface ModuleCard {
  to: string
  title: string
  desc: string
  icon: any
  count: number
  /** 卡片主题色（用于图标底色与高光） */
  accent: string
  accentRgb: string
}

const cards = computed<ModuleCard[]>(() => [
  {
    to: '/ios',
    title: 'iOS 开发',
    desc: '25 篇深度详解，覆盖 Runtime、内存管理、并发、UI 渲染等核心主题。',
    icon: Smartphone,
    count: iosCount.value,
    accent: '#6366f1',
    accentRgb: '99, 102, 241',
  },
  {
    to: '/algorithm',
    title: '算法与数据结构',
    desc: 'Swift + Objective-C 双语实现，从数组到动态规划的完整算法体系。',
    icon: Binary,
    count: algoCount.value,
    accent: '#0ea5e9',
    accentRgb: '14, 165, 233',
  },
  {
    to: '/llm',
    title: '大模型与 AI',
    desc: 'Transformer、训练、微调、推理优化，Python / PyTorch 工程实战。',
    icon: BrainCircuit,
    count: llmCount.value,
    accent: '#ec4899',
    accentRgb: '236, 72, 153',
  },
  {
    to: '/cross-platform',
    title: '跨端开发',
    desc: 'React Native、Flutter、混合开发、鸿蒙 ArkUI，从架构到工程实战。',
    icon: Layers,
    count: cpCount.value,
    accent: '#10b981',
    accentRgb: '16, 185, 129',
  },
  {
    to: '/iot',
    title: 'IoT 物联网',
    desc: '设备配网、广播协议、Zigbee/Thread/Matter、MQTT/CoAP、LoRa/NFC，IoT 全链路协议栈。',
    icon: Cpu,
    count: iotCount.value,
    accent: '#f59e0b',
    accentRgb: '245, 158, 11',
  },
])

const totalCount = computed(() => iosCount.value + algoCount.value + llmCount.value + cpCount.value + iotCount.value)
</script>

<template>
  <div class="home">
    <!-- ===== Hero ===== -->
    <section class="hero">
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="hero__badge">
        <Sparkles :size="14" />
        <span>一个工程师的知识体系 · 共 {{ totalCount }} 篇</span>
      </div>
      <h1 class="hero__title">
        我的毕生<span class="hero__title-accent">所学</span>的知识
      </h1>
      <p class="hero__subtitle">
        把 iOS、算法、大模型、跨端开发沉淀为一座可检索、可生长的个人知识库 —— 严谨、全面、由浅入深。
      </p>
      <div class="hero__actions">
        <router-link to="/ios" class="btn btn--primary">
          开始阅读
          <ArrowRight :size="18" />
        </router-link>
        <router-link to="/algorithm" class="btn btn--ghost">浏览算法</router-link>
      </div>
    </section>

    <!-- ===== Module cards ===== -->
    <section class="modules">
      <router-link
        v-for="card in cards"
        :key="card.to"
        :to="card.to"
        class="card"
        :style="{ '--accent': card.accent, '--accent-rgb': card.accentRgb }"
      >
        <span class="card__badge">{{ card.count }} 篇</span>
        <span class="card__icon">
          <component :is="card.icon" :size="26" :stroke-width="2" />
        </span>
        <h2 class="card__title">{{ card.title }}</h2>
        <p class="card__desc">{{ card.desc }}</p>
        <span class="card__more">
          进入模块
          <ArrowRight :size="16" />
        </span>
      </router-link>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) var(--space-7);
}

/* ===================== Hero ===================== */
.hero {
  position: relative;
  text-align: center;
  padding: var(--space-8) var(--space-4) var(--space-7);
  overflow: hidden;
}

.hero__glow {
  position: absolute;
  top: -120px;
  left: 50%;
  transform: translateX(-50%);
  width: 720px;
  max-width: 120%;
  height: 360px;
  background: radial-gradient(
    ellipse at center,
    rgba(var(--color-brand-rgb), 0.28) 0%,
    rgba(236, 72, 153, 0.12) 40%,
    transparent 72%
  );
  filter: blur(8px);
  pointer-events: none;
  z-index: 0;
}

.hero > *:not(.hero__glow) {
  position: relative;
  z-index: 1;
}

.hero__badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text-soft);
  font-size: 0.82rem;
  font-weight: 500;
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--space-5);
}
.hero__badge svg {
  color: var(--color-brand);
}

.hero__title {
  font-size: clamp(2.2rem, 6vw, 3.6rem);
  line-height: var(--leading-heading);
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--color-heading);
  margin: 0 0 var(--space-4);
}
.hero__title-accent {
  background: var(--gradient-brand);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.hero__subtitle {
  max-width: 620px;
  margin: 0 auto var(--space-6);
  font-size: clamp(1rem, 2.2vw, 1.18rem);
  line-height: var(--leading-body);
  color: var(--color-text-soft);
}

.hero__actions {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-md);
  font-size: 0.98rem;
  font-weight: 600;
  transition: transform var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease),
    background-color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.btn--primary {
  color: #fff;
  background: var(--gradient-brand);
  box-shadow: var(--shadow-glow);
}
.btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 36px rgba(var(--color-brand-rgb), 0.4);
}
.btn--ghost {
  color: var(--color-text);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
}
.btn--ghost:hover {
  transform: translateY(-2px);
  border-color: var(--color-brand);
  color: var(--color-brand);
}

/* ===================== Module cards ===================== */
.modules {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-5);
  margin-top: var(--space-7);
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: transform var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
/* 顶部一条渐变高光，hover 时显现 */
.card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--accent) 0%,
    rgba(var(--accent-rgb), 0.2) 100%
  );
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.card:hover {
  transform: translateY(-6px);
  border-color: rgba(var(--accent-rgb), 0.5);
  box-shadow: 0 16px 40px rgba(var(--accent-rgb), 0.18);
}
.card:hover::before {
  opacity: 1;
}

.card__badge {
  position: absolute;
  top: var(--space-5);
  right: var(--space-5);
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  border: 1px solid rgba(var(--accent-rgb), 0.22);
}

.card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.12);
  margin-bottom: var(--space-4);
  transition: transform var(--dur) var(--ease);
}
.card:hover .card__icon {
  transform: scale(1.08) rotate(-3deg);
}

.card__title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-heading);
  margin: 0 0 var(--space-2);
}

.card__desc {
  font-size: 0.92rem;
  line-height: var(--leading-body);
  color: var(--color-text-soft);
  margin: 0 0 var(--space-5);
  flex: 1;
}

.card__more {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--accent);
}
.card__more svg {
  transition: transform var(--dur-fast) var(--ease);
}
.card:hover .card__more svg {
  transform: translateX(4px);
}

/* ===================== Responsive ===================== */
@media (max-width: 1100px) {
  .modules {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 640px) {
  .modules {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .home {
    padding: var(--space-6) var(--space-4) var(--space-6);
  }
  .hero {
    padding: var(--space-6) var(--space-2) var(--space-5);
  }
}
</style>
