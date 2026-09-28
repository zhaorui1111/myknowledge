import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import IosModule from '../views/IosModule.vue'
import AlgorithmModule from '../views/AlgorithmModule.vue'
import LlmModule from '../views/LlmModule.vue'
import CrossPlatformModule from '../views/CrossPlatformModule.vue'
import IotModule from '../views/IotModule.vue'
import DocView from '../views/DocView.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/ios', name: 'iOS', component: IosModule },
  { path: '/algorithm', name: 'Algorithm', component: AlgorithmModule },
  { path: '/llm', name: 'LLM', component: LlmModule },
  { path: '/cross-platform', name: 'CrossPlatform', component: CrossPlatformModule },
  { path: '/iot', name: 'IoT', component: IotModule },
  { path: '/doc/:module/:slug', name: 'DocView', component: DocView, props: true },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

const routeTitles: Record<string, string> = {
  Home: '毕生所学',
  iOS: 'iOS 开发 · 毕生所学',
  Algorithm: '算法与数据结构 · 毕生所学',
  LLM: '大模型与 AI Agent · 毕生所学',
  CrossPlatform: '跨端开发 · 毕生所学',
  IoT: '物联网与硬件工程 · 毕生所学',
}

router.afterEach((to) => {
  if (to.name !== 'DocView') {
    const title = (to.name && routeTitles[to.name as string]) || '毕生所学'
    document.title = title
  }
})

export default router
