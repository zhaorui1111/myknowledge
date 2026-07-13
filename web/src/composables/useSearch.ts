import { ref } from 'vue'

/**
 * 全站搜索数据源 + 模糊匹配。
 *
 * 设计：
 * - 运行时并行 fetch 各模块的 /content/<module>/index.json，
 *   摊平为统一的可搜索条目（module / slug / title / group）。
 * - 索引只加载一次，进程内缓存（模块级单例），避免每次打开搜索都请求。
 * - 模糊匹配采用「子序列匹配 + 评分」：支持非连续输入；连续命中、靠前命中、
 *   整词命中给更高分，结果按分数降序。中文按字符子序列匹配。
 */

export interface SearchItem {
  module: string
  /** 模块的中文名，用于结果展示分类 */
  moduleLabel: string
  slug: string
  title: string
  /** 所属分组标题（可选） */
  group?: string
}

export interface SearchHit extends SearchItem {
  /** 匹配得分，越大越靠前 */
  score: number
  /** 命中字符在 title 中的下标集合，用于高亮 */
  matched: number[]
}

const MODULES: { key: string; label: string }[] = [
  { key: 'ios', label: 'iOS' },
  { key: 'algorithm', label: '算法' },
  { key: 'llm', label: '大模型' },
  { key: 'cross-platform', label: '跨端' },
]

// 进程内缓存（模块级单例）
const index = ref<SearchItem[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

interface RawNavItem {
  slug: string
  title: string
}
interface RawNavGroup {
  label?: string
  items: RawNavItem[]
}

async function loadModule(key: string, label: string): Promise<SearchItem[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}content/${key}/index.json`)
    if (!res.ok) return []
    const data = (await res.json()) as { groups?: RawNavGroup[] }
    const out: SearchItem[] = []
    for (const g of data.groups ?? []) {
      for (const it of g.items ?? []) {
        out.push({
          module: key,
          moduleLabel: label,
          slug: it.slug,
          title: it.title,
          group: g.label,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

/** 确保索引已加载（幂等，并发安全：靠 loaded/loading 标志） */
async function ensureIndex(): Promise<void> {
  if (loaded.value || loading.value) return
  loading.value = true
  error.value = null
  try {
    const results = await Promise.all(
      MODULES.map((m) => loadModule(m.key, m.label)),
    )
    index.value = results.flat()
    loaded.value = true
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

/**
 * 子序列模糊匹配并打分。
 * @returns 命中则返回 { score, matched }，否则返回 null。
 */
function fuzzyMatch(
  query: string,
  text: string,
): { score: number; matched: number[] } | null {
  if (!query) return { score: 0, matched: [] }
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  let qi = 0
  let score = 0
  let prevMatchIdx = -1
  const matched: number[] = []

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matched.push(ti)
      // 连续命中加权
      if (prevMatchIdx === ti - 1) score += 6
      else score += 1
      // 越靠前命中越好（位置惩罚很小）
      score += Math.max(0, 4 - ti) * 0.5
      prevMatchIdx = ti
      qi++
    }
  }

  // 必须把 query 的所有字符都匹配上才算命中
  if (qi < q.length) return null

  // 整词包含给额外奖励
  if (t.includes(q)) score += 10
  // 开头命中再奖励
  if (t.startsWith(q)) score += 8
  // 越短的标题相关性略高（轻微）
  score += Math.max(0, 20 - text.length) * 0.05

  return { score, matched }
}

/** 执行搜索，返回排序后的命中列表（最多 limit 条） */
function search(query: string, limit = 20): SearchHit[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const hits: SearchHit[] = []
  for (const item of index.value) {
    // 同时在 title 与 slug 上尝试匹配，取较高分；高亮以 title 为准
    const onTitle = fuzzyMatch(trimmed, item.title)
    const onSlug = fuzzyMatch(trimmed, item.slug)
    if (!onTitle && !onSlug) continue
    const titleScore = onTitle?.score ?? -1
    const slugScore = onSlug?.score ?? -1
    const bestScore = Math.max(titleScore, slugScore)
    hits.push({
      ...item,
      score: bestScore < 0 ? 0 : bestScore,
      matched: onTitle ? onTitle.matched : [],
    })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}

/**
 * 全站搜索 composable。返回索引状态与 search/ensureIndex 方法。
 * 索引为模块级单例，多个组件共享。
 */
export function useSearch() {
  return {
    loading,
    loaded,
    error,
    total: index,
    ensureIndex,
    search,
  }
}
