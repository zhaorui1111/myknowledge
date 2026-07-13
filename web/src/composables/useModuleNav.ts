import { ref, onMounted } from 'vue'
import type { NavGroup } from '../components/AppLayout.vue'

export interface ModuleNavState {
  groups: NavGroup[]
  loading: boolean
  error: string | null
  total: number
}

/**
 * 运行时 fetch /content/<module>/index.json，返回响应式的导航数据。
 * 若 index.json 不存在（模块暂无内容），则 groups 为空数组。
 */
export function useModuleNav(module: string) {
  const groups = ref<NavGroup[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  const total = ref(0)

  onMounted(async () => {
    try {
      const res = await fetch(`/content/${module}/index.json`)
      if (!res.ok) {
        // 404 等情况：模块暂无内容
        groups.value = []
        return
      }
      const data = await res.json()
      groups.value = data.groups || []
      total.value = groups.value.reduce(
        (sum: number, g: NavGroup) => sum + g.items.length,
        0,
      )
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  })

  return { groups, loading, error, total }
}
