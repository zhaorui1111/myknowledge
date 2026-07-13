#!/usr/bin/env node
/**
 * gen-index.mjs
 * 扫描 ~/MyKnowledge/content/<module>/ 下的 .md 文件，
 * 为每个模块生成 content/<module>/index.json。
 *
 * index.json 格式：
 * {
 *   "groups": [
 *     { "label": "分组名", "items": [{ "slug": "01-xxx", "title": "01 · xxx" }] }
 *   ]
 * }
 *
 * 分组策略：
 * - iOS：按已知分组规则（知识体系 vs 核心专题）
 * - Algorithm：按序号区间划分（线性结构/树与图/算法思想）
 * - LLM：按序号区间划分（基础与架构/训练与对齐/应用与工程）
 * - Cross-platform：按序号区间划分（RN/Flutter/混合开发/其他方案与工程化/面试）
 * - 其他模块：不分组，直接扁平列表
 */

import { readdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'fs'
import { resolve, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ROOT = resolve(__dirname, '..', '..')
const CONTENT_DIR = resolve(ROOT, 'content')

/** 从 md 文件名提取 slug 和 title */
function parseFileName(filename) {
  const slug = filename.replace(/\.md$/, '')
  const match = slug.match(/^(\d+)-(.+)$/)
  if (match) {
    const num = match[1]
    const name = match[2]
    return { slug, title: `${num} · ${name}` }
  }
  return { slug, title: slug }
}

/** 读取 md 文件第一个 # 标题作为 display title */
function extractTitle(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8').slice(0, 500)
    const match = content.match(/^#\s+(.+)$/m)
    if (match) return match[1].trim()
  } catch { /* ignore */ }
  return null
}

/** iOS 模块分组策略 */
function groupIos(items) {
  const overview = items.filter(it => !it.slug.match(/^\d+-/))
  const chapters = items.filter(it => it.slug.match(/^\d+-/))
  const groups = []
  if (overview.length) groups.push({ label: '知识体系', items: overview })
  if (chapters.length) groups.push({ label: '核心专题', items: chapters })
  return groups.length ? groups : [{ items }]
}

/** Algorithm 模块分组策略 */
function groupAlgorithm(items) {
  const linear = []
  const tree = []
  const thinking = []
  const other = []
  for (const item of items) {
    const m = item.slug.match(/^(\d+)-/)
    if (!m) { other.push(item); continue }
    const n = parseInt(m[1], 10)
    if (n <= 7) linear.push(item)
    else if (n <= 12) tree.push(item)
    else thinking.push(item)
  }
  const groups = []
  if (linear.length) groups.push({ label: '线性结构', items: linear })
  if (tree.length) groups.push({ label: '树与图', items: tree })
  if (thinking.length) groups.push({ label: '算法思想', items: thinking })
  if (other.length) groups.push({ label: '其他', items: other })
  return groups.length ? groups : [{ items }]
}

/** LLM 模块分组策略 */
function groupLlm(items) {
  const base = []
  const train = []
  const app = []
  const other = []
  for (const item of items) {
    const m = item.slug.match(/^(\d+)-/)
    if (!m) { other.push(item); continue }
    const n = parseInt(m[1], 10)
    if (n <= 6) base.push(item)
    else if (n <= 10) train.push(item)
    else app.push(item)
  }
  const groups = []
  if (base.length) groups.push({ label: '基础与架构', items: base })
  if (train.length) groups.push({ label: '训练与对齐', items: train })
  if (app.length) groups.push({ label: '应用与工程', items: app })
  if (other.length) groups.push({ label: '其他', items: other })
  return groups.length ? groups : [{ items }]
}

/** Cross-platform 模块分组策略 */
function groupCrossPlatform(items) {
  const rn = []
  const flutter = []
  const hybrid = []
  const other = []
  const interview = []
  const misc = []
  for (const item of items) {
    const m = item.slug.match(/^(\d+)-/)
    if (!m) { misc.push(item); continue }
    const n = parseInt(m[1], 10)
    if (n <= 6) rn.push(item)
    else if (n <= 11) flutter.push(item)
    else if (n === 12) hybrid.push(item)
    else if (n <= 14) other.push(item)
    else interview.push(item)
  }
  const groups = []
  if (rn.length) groups.push({ label: 'React Native', items: rn })
  if (flutter.length) groups.push({ label: 'Flutter', items: flutter })
  if (hybrid.length) groups.push({ label: '混合开发', items: hybrid })
  if (other.length) groups.push({ label: '其他跨端方案与工程化', items: other })
  if (interview.length) groups.push({ label: '技术选型与面试', items: interview })
  if (misc.length) groups.push({ label: '其他', items: misc })
  return groups.length ? groups : [{ items }]
}


/** IoT 模块分组策略 */
function groupIot(items) {
  const provisioning = []
  const protocol = []
  const engineering = []
  const iosDev = []
  const commDesign = []
  const perfOpt = []
  const other = []
  for (const item of items) {
    const m = item.slug.match(/^(\d+)-/)
    if (!m) { other.push(item); continue }
    const n = parseInt(m[1], 10)
    if (n <= 6 || (n >= 22 && n <= 24)) provisioning.push(item)
    else if (n <= 15) protocol.push(item)
    else if (n <= 21) engineering.push(item)
    else if (n <= 31) iosDev.push(item)
    else if (n <= 36) commDesign.push(item)
    else perfOpt.push(item)
  }
  const groups = []
  if (provisioning.length) groups.push({ label: '设备配网与安全', items: provisioning })
  if (protocol.length) groups.push({ label: '通信协议详解', items: protocol })
  if (engineering.length) groups.push({ label: '工程实践', items: engineering })
  if (iosDev.length) groups.push({ label: 'iOS 开发与架构', items: iosDev })
  if (commDesign.length) groups.push({ label: '设备通信协议设计', items: commDesign })
  if (perfOpt.length) groups.push({ label: '性能优化与问题攻关', items: perfOpt })
  if (other.length) groups.push({ label: '其他', items: other })
  return groups.length ? groups : [{ items }]
}

/** 为指定模块生成 index.json */
function generateModuleIndex(moduleName) {
  const moduleDir = resolve(CONTENT_DIR, moduleName)
  if (!existsSync(moduleDir)) {
    console.log(`  [skip] content/${moduleName}/ does not exist`)
    return
  }

  const files = readdirSync(moduleDir)
    .filter(f => extname(f) === '.md')
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))

  const items = files.map(f => {
    const parsed = parseFileName(f)
    const mdTitle = extractTitle(resolve(moduleDir, f))
    if (mdTitle) {
      const numMatch = parsed.slug.match(/^(\d+)-/)
      if (numMatch) {
        parsed.title = mdTitle.match(/^\d+/) ? mdTitle : `${numMatch[1]} · ${mdTitle}`
      } else {
        parsed.title = mdTitle
      }
    }
    return parsed
  })

  let groups
  switch (moduleName) {
    case 'ios': groups = groupIos(items); break
    case 'algorithm': groups = groupAlgorithm(items); break
    case 'llm': groups = groupLlm(items); break
    case 'cross-platform': groups = groupCrossPlatform(items); break
    case 'iot': groups = groupIot(items); break
    default: groups = items.length ? [{ items }] : []
  }

  groups = groups.filter(g => g.items.length > 0)
  const outFile = resolve(moduleDir, 'index.json')
  writeFileSync(outFile, JSON.stringify({ groups }, null, 2), 'utf-8')
  console.log(`  [done] content/${moduleName}/index.json (${items.length} items)`)
}

// ===== Main =====
console.log('[gen-index] Scanning content directory ...')

const modules = readdirSync(CONTENT_DIR).filter(name => {
  try {
    const st = statSync(resolve(CONTENT_DIR, name))
    return st.isDirectory()
  } catch { return false }
})

for (const mod of modules) {
  generateModuleIndex(mod)
}

console.log('[gen-index] Done.')
