# 毕生所学 — 个人知识库

一个工程师的个人知识体系网站，涵盖 iOS 开发、算法与数据结构、大模型与 AI、跨端开发、IoT 物联网五大模块，共 130+ 篇深度技术文章。

线上地址：https://zhaorui1111.github.io/myknowledge/

## 内容概览

| 模块 | 篇数 | 覆盖范围 |
|------|------|----------|
| iOS 开发 | 45 | Objective-C、Swift、Runtime、内存管理、多线程、UI 渲染、网络、架构 |
| 算法与数据结构 | 19 | 数组、链表、栈队列、树、图、排序、动态规划，Swift + ObjC 双语实现 |
| 大模型与 AI | 16 | 神经网络、词向量、注意力机制、Transformer、训练微调、推理优化 |
| 跨端开发 | 15 | React Native、Flutter、混合开发、鸿蒙 ArkUI，架构到工程实战 |
| IoT 物联网 | 38 | 设备配网、蓝牙 BLE、Zigbee/Thread/Matter、MQTT/CoAP、LoRa/NFC |

## 技术栈

- 前端框架：Vue 3 + TypeScript + Vite
- 路由：Vue Router 4（History 模式）
- UI：自研设计系统，支持亮色/暗色主题切换
- Markdown 渲染：markdown-it + highlight.js
- 搜索：前端子序列模糊匹配，⌘K 快捷唤起
- 部署：GitHub Actions → GitHub Pages

## 项目结构

```
myknowledge/
├── content/                # Markdown 文章源文件
│   ├── ios/                #   iOS 模块（含 index.json 目录索引）
│   ├── algorithm/
│   ├── llm/
│   ├── cross-platform/
│   └── iot/
├── web/                    # 前端项目
│   ├── public/content/     # 构建时复制的文章文件（软链接到 ../../content）
│   ├── src/
│   │   ├── views/          # 页面组件（Home、各模块页、文档页）
│   │   ├── components/     # 通用组件（AppLayout、DocContent、SearchBox 等）
│   │   ├── composables/    # 组合式函数（useModuleNav、useSearch、useTheme 等）
│   │   └── router/         # 路由配置
│   └── scripts/gen-index.mjs  # 内容索引生成脚本
└── .github/workflows/      # CI/CD 部署工作流
```

## 本地开发

```bash
cd web
pnpm install
pnpm dev          # 启动开发服务器
pnpm build        # 构建生产版本
pnpm gen-index    # 重新生成内容索引
```

## 部署

推送 `main` 分支即可自动触发 GitHub Actions 构建并部署到 GitHub Pages。

## License

MIT
