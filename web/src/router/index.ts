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

export default router
