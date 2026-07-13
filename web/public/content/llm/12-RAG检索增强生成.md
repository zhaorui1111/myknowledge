# RAG 检索增强生成（Retrieval-Augmented Generation）详解

> 大模型虽然拥有海量参数化知识，但仍然面临知识过时、幻觉生成、领域知识不足等核心问题。RAG（Retrieval-Augmented Generation，检索增强生成）通过在推理时引入外部知识库检索，让模型的回答有据可依，是当前大模型落地最广泛、最实用的技术范式之一。本文将从直觉到数学原理、从基础实现到高级工程实践，系统讲透 RAG 的方方面面。

---

## 目录

1. [什么是 RAG](#1-什么是-rag)
2. [为什么需要 RAG](#2-为什么需要-rag)
3. [RAG 的核心架构](#3-rag-的核心架构)
4. [文档处理与分块策略](#4-文档处理与分块策略)
5. [Embedding 向量化](#5-embedding-向量化)
6. [向量数据库与索引](#6-向量数据库与索引)
7. [检索策略](#7-检索策略)
8. [重排序 Reranking](#8-重排序-reranking)
9. [Prompt 构建与上下文注入](#9-prompt-构建与上下文注入)
10. [完整 RAG Pipeline 实现](#10-完整-rag-pipeline-实现)
11. [Advanced RAG 进阶技术](#11-advanced-rag-进阶技术)
12. [RAG 评估体系](#12-rag-评估体系)
13. [RAG vs Fine-tuning 对比辨析](#13-rag-vs-fine-tuning-对比辨析)
14. [工程实践与常见坑](#14-工程实践与常见坑)
15. [前沿进展与趋势](#15-前沿进展与趋势)
16. [面试题精选与解析](#16-面试题精选与解析)
17. [易错点与最佳实践总结](#17-易错点与最佳实践总结)

---

## 1. 什么是 RAG

### 1.1 定义与直觉

RAG（Retrieval-Augmented Generation）是一种将**信息检索**（Information Retrieval, IR）与**文本生成**（Text Generation）相结合的技术范式。其核心思想非常直觉化：当模型需要回答一个问题时，不是仅凭自己的"记忆"（参数化知识，Parametric Knowledge）来回答，而是先从外部知识库中**检索**（Retrieve）相关文档片段，然后将这些片段作为上下文**增强**（Augment）输入，最后由生成模型基于这些证据来**生成**（Generate）答案。

用一个形象的类比来理解：传统 LLM 像是一个闭卷考试的学生，只能靠记忆答题；而 RAG 增强后的 LLM 像是一个开卷考试的学生——可以随时翻阅参考资料，然后根据资料组织出准确、有据可依的答案。

### 1.2 概念溯源与数学形式化

RAG 的概念最早由 Meta AI（当时的 Facebook AI Research）在 2020 年的论文 **"Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"**（Lewis et al., NeurIPS 2020）中正式提出。

该论文将 RAG 建模为一个边际化（Marginalization）过程。给定输入序列 $x$，RAG 模型对输出序列 $y$ 的生成概率定义为对潜在检索文档 $z$ 的边际化：

**RAG-Sequence 模型**——对整个输出序列共享同一组检索文档：

$$P_{\text{RAG-Seq}}(y|x) = \sum_{z \in \text{top-k}(p(\cdot|x))} p_\eta(z|x) \prod_{i=1}^{N} p_\theta(y_i | x, z, y_{1:i-1})$$

**RAG-Token 模型**——每个 token 可以依赖不同的检索文档（理论更灵活，工程中少用）：

$$P_{\text{RAG-Token}}(y|x) = \prod_{i=1}^{N} \sum_{z \in \text{top-k}(p(\cdot|x))} p_\eta(z|x) \cdot p_\theta(y_i | x, z, y_{1:i-1})$$

其中：
- $p_\eta(z|x)$ 是**检索模型**（Retriever）给出的文档相关性概率，参数为 $\eta$，通常由 Dense Passage Retriever (DPR) 实现
- $p_\theta(y_i|x,z,y_{1:i-1})$ 是**生成模型**（Generator）的条件概率，参数为 $\theta$，通常由 BART 或 GPT 类模型实现
- $\text{top-k}$ 取相关性最高的 $k$ 篇文档（通常 $k=5$ 或 $k=10$）

原论文中，检索模型使用 DPR（Dense Passage Retriever），其相关性分数通过 query encoder 和 document encoder 的内积计算：

$$p_\eta(z|x) \propto \exp\big(\text{Enc}_Q(x)^T \cdot \text{Enc}_D(z)\big)$$

### 1.3 RAG 的三代演进

**Naive RAG（朴素 RAG，2020-2022）**：最基本的"检索-拼接-生成"三步流程。用户提问 → Embedding 向量化 → 向量检索 top-k → 将检索到的文档拼接进 Prompt → LLM 生成回答。Naive RAG 的问题很多：检索质量完全依赖 Embedding 模型的能力、用户查询和文档之间可能存在语义鸿沟、top-k 文档中可能有大量噪声、LLM 可能无视上下文而编造答案等。

**Advanced RAG（高级 RAG，2023）**：在 Naive RAG 基础上，引入了三组关键优化：

- **预检索优化**：查询改写（Query Rewriting）——用 LLM 把口语化查询改写为更精确的搜索语句；查询扩展（Query Expansion）——从多个角度改写查询，增加召回覆盖面；HyDE（Hypothetical Document Embedding）——让 LLM 先生成假想答案，用假想答案的 Embedding 去检索
- **检索优化**：混合检索（Hybrid Search）——同时用向量检索和 BM25 关键词检索，然后融合结果；元数据过滤——在向量搜索时附加结构化过滤条件（日期、文档类型、部门等）
- **检索后处理**：重排序（Reranking）——用 Cross-Encoder 模型对候选文档重新排序，精度远高于 Bi-Encoder；上下文压缩（Context Compression）——去除检索文档中与问题无关的部分，减少噪声

**Modular RAG（模块化 RAG，2024+）**：将 RAG 拆解为可插拔、可编排的标准化模块（Retriever、Reranker、Reader、Generator、Router 等），每个模块可独立优化和热替换。关键创新包括：

- **路由（Routing）**：根据查询类型智能选择检索策略（向量搜索 vs SQL 查询 vs API 调用 vs 不需要检索）
- **自适应检索（Adaptive Retrieval）**：LLM 自行判断是否需要检索，避免不必要的检索开销
- **迭代检索（Iterative Retrieval）**：第一轮检索结果不满意时，自动改写查询重试
- **多步推理（Multi-step Reasoning）**：将复杂问题分解为子问题，逐步检索和回答

---

## 2. 为什么需要 RAG

### 2.1 LLM 的固有缺陷

尽管 GPT-4、Claude、Llama、Qwen 等大模型展现了惊人的能力，但它们有几个根本性的局限：

**知识截止（Knowledge Cutoff）**：模型的知识停留在训练数据的截止日期。例如 GPT-4 的训练数据截止到 2023 年底，对于 2024 年发生的事件它一无所知。这不是模型能力问题，而是数据覆盖问题——模型不可能知道训练后才出现的信息。

**幻觉（Hallucination）**：模型会自信地生成看似合理但实际错误的内容。这是语言模型的固有属性——它的训练目标是最大化下一个 token 的条件概率 $\max \sum_i \log P(y_i | y_{<i}, x; \theta)$，而非保证事实准确性。当模型在训练数据中没有见过确切答案时，它会基于统计规律"合理外推"，生成流畅但可能错误的内容。例如询问一篇不存在的论文，模型可能编造逼真的标题、作者和摘要。

**领域知识不足**：通用大模型在特定垂直领域（医疗诊断、法律条文、金融合规、企业内部制度）的表现往往不够专业和精确。虽然可以通过微调（Fine-tuning）注入领域知识，但微调成本高（需要 GPU 训练数小时到数天）、更新不灵活（每次知识更新都要重新训练）、且可能导致灾难性遗忘（Catastrophic Forgetting）。

**不可溯源（Lack of Attribution）**：模型给出的答案无法追溯到具体的信息来源，用户无法验证答案的可靠性。在法律、医疗、金融等高风险领域，"AI 说的"不构成有效依据，必须能指向原始资料。

### 2.2 RAG 如何解决这些问题

RAG 通过在推理时动态引入外部知识源，优雅地解决了上述问题：

**知识时效性**：知识库可以随时更新——新增、修改、删除文档只需更新向量索引，无需重新训练模型。今天发布的政策文件，入库后今天就能被检索到并用于回答。更新一份文档的索引只需几秒钟，而微调模型可能需要数小时。

**减少幻觉**：模型的回答基于检索到的真实文档片段，有据可依。通过精心设计的 Prompt（如"仅基于以下参考资料回答，如果资料不足请明确说明，不要编造"），可以将模型的幻觉率从 30%+ 大幅降低到 5% 以下。检索到的文档起到了"锚定"作用，约束模型的生成范围。

**领域适配**：只需将领域文档（技术手册、法规条文、产品文档、内部 wiki）导入知识库，无需修改模型参数。对于企业应用，这意味着可以在数小时内构建基于内部知识的 AI 助手，而非花费数周准备数据和微调模型。

**可溯源**：检索到的文档片段可以作为引用来源一并返回给用户，实现答案的可验证性。用户可以点击来源链接查看原文，自行判断答案的可靠性。这在合规要求严格的行业中至关重要。

### 2.3 方案对比与成本分析

从工程落地角度对比不同的知识增强方案：

| 方案 | 知识更新成本 | 单次推理成本 | 部署复杂度 | 知识容量上限 | 可溯源 | 典型延迟增加 |
|------|------------|------------|-----------|------------|--------|------------|
| 加大上下文窗口 | 低 | 极高 O(n^2) | 低 | 受限于窗口长度 | 是 | 高 |
| 模型全量微调 | 极高（重训全模型） | 中 | 高 | 受限于训练数据 | 否 | 无 |
| LoRA/QLoRA 微调 | 高（仍需训练） | 中 | 中 | 受限于训练数据 | 否 | 无 |
| RAG | 低（更新索引） | 中 | 中 | 近乎无限 | 是 | 100-500ms |
| RAG + 微调 | 中 | 中 | 高 | 近乎无限 | 是 | 100-500ms |

从上表可以看出，RAG 在知识更新成本、知识容量和可溯源性方面具有压倒性优势。它的主要代价是增加了一次检索的延迟（通常 100-500ms）和检索基础设施的运维成本。

---

## 3. RAG 的核心架构

### 3.1 整体流程

一个标准的 RAG 系统包含两大阶段：**离线索引阶段（Indexing Phase）** 和 **在线服务阶段（Serving Phase）**。

```
离线索引阶段（Offline Indexing）
+-------------------------------------------------------------------+
|  原始文档              文档清洗           文档分块                    |
|  (PDF/Word/HTML/DB) --> Clean --> Text Splitter                    |
|                                    |                               |
|                                    v                               |
|                              Embedding Model --> Vector Database   |
|                              (文本 -> 向量)      (存储+索引)        |
|                                                                    |
|  同时构建：BM25 倒排索引（用于混合检索）                              |
+-------------------------------------------------------------------+

在线服务阶段（Online Serving）
+-------------------------------------------------------------------+
|  用户查询                                                          |
|    |                                                               |
|    v                                                               |
|  [查询预处理] --> 查询改写 / 查询扩展 / HyDE                        |
|    |                                                               |
|    v                                                               |
|  [混合检索] --> 向量检索 + BM25 检索 --> RRF/加权融合                 |
|    |                                                               |
|    v                                                               |
|  [重排序] --> Cross-Encoder Reranker --> top-k 精排结果              |
|    |                                                               |
|    v                                                               |
|  [Prompt 构建] --> System Prompt + 检索上下文 + 用户问题             |
|    |                                                               |
|    v                                                               |
|  [LLM 生成] --> 生成回答（含来源引用）                                |
|    |                                                               |
|    v                                                               |
|  [后处理] --> 格式化 + 来源链接 + 置信度标注                          |
+-------------------------------------------------------------------+
```

### 3.2 核心组件

**Document Loader（文档加载器）**：负责从各种数据源加载原始文档。常见的加载器包括：PDF Loader（基于 pymupdf、pdfplumber 或 unstructured）、Word Loader（基于 python-docx）、HTML Loader（基于 BeautifulSoup）、CSV/Excel Loader（基于 pandas）、Database Loader（SQL 查询）、API Loader（REST/GraphQL 调用）。LangChain 框架提供了 160+ 种开箱即用的 Loader。

**Text Splitter（文本分块器）**：将长文档拆分为适合检索和上下文窗口的小块（Chunk）。这是 RAG 系统中**最容易被低估但影响最大**的环节。分块策略直接决定了检索精度（块太大 → 语义稀释 → 检索到不相关的噪声；块太小 → 信息碎片化 → 丢失必要上下文）和生成质量（上下文窗口有限，必须最大化信息密度）。

**Embedding Model（向量化模型）**：将文本块映射为高维稠密向量 $\mathbf{v} \in \mathbb{R}^d$（通常 $d = 384, 768, 1024, 1536$ 或 $3072$）。好的 Embedding 模型能让语义相近的文本在向量空间中余弦相似度更高：$\text{sim}(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{|\mathbf{u}| \cdot |\mathbf{v}|}$。

**Vector Store（向量数据库）**：存储和索引 Embedding 向量，支持高效的近似最近邻（ANN, Approximate Nearest Neighbor）检索。核心挑战是在百万~亿级向量中快速（<100ms）找到与查询向量最相似的 top-k 个向量。

**Retriever（检索器）**：执行实际的检索操作。生产系统通常采用混合检索——同时运行向量检索（语义匹配）和 BM25 检索（关键词匹配），然后用 RRF（Reciprocal Rank Fusion）融合两路结果。

**Reranker（重排序器）**：对检索召回的候选文档做二次精排。初步检索用轻量级 Bi-Encoder（query 和 doc 分别编码，内积计算相似度，速度快但精度有限），重排序用重量级 Cross-Encoder（query 和 doc 拼接后一起编码，输出精确的相关性分数，精度高但速度慢）。典型流程：Bi-Encoder 召回 top-50 → Cross-Encoder 精排 → 取 top-5。

**Generator（生成器）**：接收用户查询和检索到的上下文片段，构建完整的 Prompt，送入 LLM（如 GPT-4o、Claude、Qwen）生成最终答案。Prompt 工程在这一环节至关重要——需要明确指示模型基于上下文回答、标注来源、不确定时说明。

---

## 4. 文档处理与分块策略

### 4.1 为什么分块至关重要

分块（Chunking）是 RAG 流程中**最容易被低估但影响最大**的环节。一项经验数据表明，仅优化分块策略就能将 RAG 系统的 Recall@5 提升 15~25%。分块策略直接影响以下三个方面：

**检索精度**：如果块太大（比如整篇 5000 字的文章作为一个块），Embedding 向量会"稀释"不同段落的语义，导致查询"什么是 ARC？"也可能匹配到一篇既讲 ARC 又讲 GCD 又讲 RunLoop 的长文。如果块太小（比如每句话一个块），单个块缺乏足够上下文，"该方法的时间复杂度为 O(n log n)"这样的句子脱离上下文后无法确定"该方法"指什么。

**生成质量**：LLM 的上下文窗口有限（即使 128K 窗口的模型，实验表明超过 ~4K token 的上下文就开始出现"中间遗忘"效应——Lost in the Middle），合理的分块可以最大化送入 LLM 的信息密度。

**系统性能**：块的数量和大小直接影响向量数据库的存储、索引构建时间和检索延迟。100 万个 256 维向量和 100 万个 1024 维向量的存储和检索开销差异巨大。

### 4.2 常见分块策略

#### 4.2.1 固定大小分块（Fixed-Size Chunking）

最简单直接的策略：按固定字符数（或 token 数）切分文本，相邻块之间设置一定重叠（overlap）以避免在关键信息处断裂。

```python
from typing import List


def fixed_size_chunking(
    text: str,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> List[str]:
    """
    固定大小分块：按字符数切分，带重叠。
    
    这是最基础的分块策略，适合快速原型和日志类文本。
    
    Args:
        text: 待分块的原始文本
        chunk_size: 每个块的最大字符数
        chunk_overlap: 相邻块之间的重叠字符数，
                       用于避免在句子中间切断导致信息丢失
    
    Returns:
        分块后的文本列表
    
    Raises:
        ValueError: 当 chunk_overlap >= chunk_size 时
    
    复杂度：
        时间 O(n)，空间 O(n)，其中 n 为文本长度
    """
    if chunk_overlap >= chunk_size:
        raise ValueError(
            f"chunk_overlap ({chunk_overlap}) 必须小于 "
            f"chunk_size ({chunk_size})"
        )
    
    chunks: List[str] = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = text[start:end]
        
        # 跳过纯空白的块
        if chunk.strip():
            chunks.append(chunk)
        
        # 步长 = chunk_size - overlap
        # 这样相邻块会有 overlap 个字符的重叠
        start += chunk_size - chunk_overlap
    
    return chunks


# ===== 使用示例 =====
if __name__ == "__main__":
    sample = "这是一段示例文本，用来演示固定大小分块。" * 50
    chunks = fixed_size_chunking(sample, chunk_size=200, chunk_overlap=30)
    print(f"原文长度: {len(sample)} 字符")
    print(f"分块数量: {len(chunks)}")
    print(f"首块长度: {len(chunks[0])}, 末块长度: {len(chunks[-1])}")
    
    # 验证重叠
    if len(chunks) >= 2:
        overlap_text = chunks[0][-30:]  # 第一块的最后30字符
        assert overlap_text in chunks[1], "重叠验证失败！"
        print(f"重叠部分: '{overlap_text}'")
```

**优点**：实现极简、速度快、块数量可预测（约 `n / (chunk_size - overlap)`）。
**缺点**：完全不考虑文本语义结构，可能在句子甚至单词中间截断。
**适用场景**：日志类文本、格式统一的结构化文本、快速原型验证。

#### 4.2.2 递归字符分块（Recursive Character Splitting）

LangChain 推荐的默认分块方式，也是实际项目中最常用的方法。核心思想是按层级分隔符递归切分——优先在段落边界切（`\n\n`），段落太长则在换行处切（`\n`），还太长则在句子边界切（`。`/`.`），最后才在字符级别切。

```python
from typing import List, Optional


def recursive_character_split(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    separators: Optional[List[str]] = None,
) -> List[str]:
    """
    递归字符分块：按层级分隔符递归切分，尽量保持语义完整。
    
    这是 LangChain RecursiveCharacterTextSplitter 核心逻辑的简化实现。
    分隔符优先级：段落 > 换行 > 句号 > 空格 > 单字符
    
    Args:
        text: 待分块的文本
        chunk_size: 每个块的目标最大字符数
        chunk_overlap: 相邻块之间的重叠字符数
        separators: 分隔符优先级列表（从"大"到"小"），
                    默认 ["\n\n", "\n", "。", ".", " ", ""]
    
    Returns:
        分块后的文本列表
    
    设计思路：
        1. 从最高优先级分隔符开始，尝试切分文本
        2. 切分后，将小片段合并到 chunk_size 以内
        3. 如果单个片段仍超过 chunk_size，递归用下一级分隔符切分
        4. 相邻 chunk 保留 overlap 以维持上下文连贯
    """
    if separators is None:
        separators = ["\n\n", "\n", "。", ".", " ", ""]
    
    # 基本情况：文本已经够短
    if len(text) <= chunk_size:
        return [text] if text.strip() else []
    
    final_chunks: List[str] = []
    
    # 找到能切分文本的最高优先级分隔符
    separator = separators[-1]  # 兜底
    new_separators: List[str] = []
    for i, sep in enumerate(separators):
        if sep == "":
            separator = sep
            break
        if sep in text:
            separator = sep
            new_separators = separators[i + 1:]
            break
    
    # 用该分隔符切分
    if separator:
        splits = text.split(separator)
    else:
        splits = list(text)
    
    # 合并小片段，直到接近 chunk_size
    current_pieces: List[str] = []
    current_length = 0
    
    for split in splits:
        piece_len = len(split) + (len(separator) if separator else 0)
        
        if current_length + piece_len > chunk_size and current_pieces:
            # 当前块已足够大，保存
            chunk_text = separator.join(current_pieces)
            if chunk_text.strip():
                final_chunks.append(chunk_text.strip())
            
            # 保留重叠部分：从尾部回溯
            overlap_pieces: List[str] = []
            overlap_len = 0
            for prev in reversed(current_pieces):
                if overlap_len + len(prev) > chunk_overlap:
                    break
                overlap_pieces.insert(0, prev)
                overlap_len += len(prev) + (len(separator) if separator else 0)
            
            current_pieces = overlap_pieces
            current_length = overlap_len
        
        # 如果单个 split 超过 chunk_size，递归用更细的分隔符
        if len(split) > chunk_size and new_separators:
            sub_chunks = recursive_character_split(
                split, chunk_size, chunk_overlap, new_separators
            )
            # 将递归结果中的第一个与当前 pieces 合并
            if sub_chunks:
                if current_pieces:
                    merged = separator.join(current_pieces) + separator + sub_chunks[0]
                    if len(merged) <= chunk_size:
                        current_pieces = [merged]
                        current_length = len(merged)
                        final_chunks.extend(sub_chunks[1:])
                    else:
                        if current_pieces:
                            chunk_text = separator.join(current_pieces)
                            if chunk_text.strip():
                                final_chunks.append(chunk_text.strip())
                        final_chunks.extend(sub_chunks)
                        current_pieces = []
                        current_length = 0
                else:
                    final_chunks.extend(sub_chunks)
        else:
            current_pieces.append(split)
            current_length += piece_len
    
    # 处理最后剩余的块
    if current_pieces:
        chunk_text = separator.join(current_pieces)
        if chunk_text.strip():
            final_chunks.append(chunk_text.strip())
    
    return final_chunks
```

**优点**：在自然边界处切分，语义完整性好；实现简单，适用于绝大多数文本类型。
**缺点**：仍然是基于规则的启发式方法，无法真正理解语义边界。
**适用场景**：通用文本分块的默认推荐方案。

#### 4.2.3 语义分块（Semantic Chunking）

基于句子间的 Embedding 语义相似度变化来动态确定分块边界。当连续句子间的语义相似度出现显著下降（表明话题切换）时，在该处切分。

```python
import numpy as np
from typing import List, Tuple
import re


def split_into_sentences(text: str) -> List[str]:
    """
    将文本分割为句子列表。
    
    支持中英文混合文本的句子分割。
    实际生产环境建议使用 spaCy 或 stanza 的分句器。
    """
    # 按中英文句号、问号、感叹号分句
    pattern = r'(?<=[。！？.!?\n])\s*'
    sentences = re.split(pattern, text)
    return [s.strip() for s in sentences if s.strip()]


def semantic_chunking(
    text: str,
    embedding_model,  # SentenceTransformer 实例
    threshold_percentile: int = 85,
    min_chunk_size: int = 100,
    max_chunk_size: int = 2000,
) -> List[str]:
    """
    语义分块：基于句子间 Embedding 相似度的断点检测。
    
    核心思想：
    1. 将文本分成句子
    2. 计算每个句子的 Embedding
    3. 计算相邻句子的余弦相似度
    4. 相似度骤降的位置 = 话题切换点 = 分块边界
    
    这种方法能让同一主题的内容自然聚合在同一个 chunk 中。
    
    Args:
        text: 原始文本
        embedding_model: 已加载的 SentenceTransformer 模型实例
        threshold_percentile: 相似度距离的百分位阈值（0~100）。
            值越大 -> 越少的分块点 -> chunk 越大。
            经验值：80~90 适合大多数场景。
        min_chunk_size: 每个块的最小字符数（避免过于碎片化）
        max_chunk_size: 每个块的最大字符数（防止单块过大）
    
    Returns:
        语义分块后的文本列表
    
    注意事项：
    - 需要额外的 Embedding 计算开销（每个句子都要编码）
    - 对分句质量有依赖（分句不好 -> 分块不好）
    - 适合多主题长文档，对单主题短文档效果不明显
    """
    # 1. 分句
    sentences = split_into_sentences(text)
    
    if len(sentences) <= 1:
        return [text] if text.strip() else []
    
    # 2. 计算每个句子的 Embedding
    embeddings = embedding_model.encode(
        sentences,
        normalize_embeddings=True,  # 归一化，方便直接用内积算余弦相似度
        show_progress_bar=False,
    )  # shape: (n_sentences, dim)
    
    # 3. 计算相邻句子的余弦相似度
    similarities: List[float] = []
    for i in range(len(embeddings) - 1):
        # 因为已经 L2 归一化，内积 = 余弦相似度
        cos_sim = float(np.dot(embeddings[i], embeddings[i + 1]))
        similarities.append(cos_sim)
    
    # 4. 计算语义"距离"（1 - 相似度）
    distances = [1.0 - s for s in similarities]
    
    # 5. 用百分位数确定断点阈值
    threshold = float(np.percentile(distances, threshold_percentile))
    
    # 6. 找到所有超过阈值的断点（话题切换点）
    breakpoints: List[int] = []
    for i, dist in enumerate(distances):
        if dist >= threshold:
            breakpoints.append(i + 1)  # 在第 i+1 个句子之前切分
    
    # 7. 按断点分块，并处理过大/过小的块
    chunks: List[str] = []
    start = 0
    
    for bp in breakpoints:
        chunk_text = "".join(sentences[start:bp])
        
        if len(chunk_text) < min_chunk_size and chunks:
            # 块太小，并入前一个块
            chunks[-1] += chunk_text
        elif len(chunk_text) > max_chunk_size:
            # 块太大，用固定大小进一步切分
            sub_chunks = fixed_size_chunking(
                chunk_text, chunk_size=max_chunk_size, chunk_overlap=100
            )
            chunks.extend(sub_chunks)
        else:
            chunks.append(chunk_text)
        
        start = bp
    
    # 处理最后一段
    remaining = "".join(sentences[start:])
    if remaining.strip():
        if len(remaining) < min_chunk_size and chunks:
            chunks[-1] += remaining
        else:
            chunks.append(remaining)
    
    return chunks


# ===== 使用示例 =====
"""
from sentence_transformers import SentenceTransformer

# 加载中文 Embedding 模型
model = SentenceTransformer("BAAI/bge-small-zh-v1.5")

text = '''
第一段关于机器学习的内容。机器学习是人工智能的一个分支。
它使用数据来训练模型。

第二段完全不同的话题。今天天气很好。适合出去散步。
公园里的花都开了。

第三段又回到技术话题。深度学习使用多层神经网络。
卷积神经网络擅长图像识别任务。
'''

chunks = semantic_chunking(text, model, threshold_percentile=85)
for i, chunk in enumerate(chunks):
    print(f"--- Chunk {i+1} ---")
    print(chunk[:100])
"""
```

**优点**：真正基于语义的切分，同一主题的内容自然聚合在同一块中，跨主题不会混淆。
**缺点**：需要额外的 Embedding 计算开销；对句子分割质量有依赖；单主题文档效果不明显。
**适用场景**：多主题长文档、会议记录、研究报告。

#### 4.2.4 基于文档结构的分块

利用文档本身的结构化信息（Markdown 标题层级、HTML DOM 树、PDF 布局信息）来指导分块。每个标题下的内容自然构成一个语义块，同时保留标题层级作为元数据（metadata），检索时可以提供额外的上下文信息。

```python
import re
from typing import List, Dict, Any


def markdown_header_chunking(
    markdown_text: str,
    headers_to_split_on: List[str] = None,
    max_chunk_size: int = 2000,
) -> List[Dict[str, Any]]:
    """
    基于 Markdown 标题结构的分块。
    
    按照标题层级切分文档，每个块保留完整的标题层级信息。
    这对于技术文档、API 文档、wiki 等结构化内容特别有效。
    
    Args:
        markdown_text: Markdown 格式的文本
        headers_to_split_on: 在哪些级别的标题处切分，
                              默认 ["#", "##", "###"]
        max_chunk_size: 单个块的最大字符数，超过则二次拆分
    
    Returns:
        分块列表，每个元素为 {
            "content": "块的文本内容",
            "metadata": {
                "h1": "一级标题",
                "h2": "二级标题",
                ...
            }
        }
    
    设计优势：
    - 保留文档结构信息，检索时可作为过滤条件
    - 自然的语义边界，不会跨章节切分
    - 标题层级信息可以增强 Embedding 质量
    """
    if headers_to_split_on is None:
        headers_to_split_on = ["#", "##", "###"]
    
    lines = markdown_text.split("\n")
    chunks: List[Dict[str, Any]] = []
    current_headers: Dict[str, str] = {}
    current_content_lines: List[str] = []
    
    # 匹配 Markdown 标题
    header_pattern = re.compile(r"^(#{1,6})\s+(.*)")
    
    def save_current_chunk():
        """保存当前积累的内容为一个 chunk"""
        content = "\n".join(current_content_lines).strip()
        if content:
            chunks.append({
                "content": content,
                "metadata": dict(current_headers),
            })
    
    for line in lines:
        match = header_pattern.match(line)
        
        if match:
            level_str = match.group(1)   # e.g., "##"
            title = match.group(2).strip()
            level = len(level_str)
            
            # 检查是否在切分标题级别中
            if level_str in headers_to_split_on:
                # 保存之前积累的内容
                if current_content_lines:
                    save_current_chunk()
                    current_content_lines = []
                
                # 更新标题层级：清除同级及更低级的标题
                keys_to_remove = [
                    k for k in current_headers
                    if int(k[1:]) >= level  # "h2" -> 2
                ]
                for k in keys_to_remove:
                    del current_headers[k]
                
                current_headers[f"h{level}"] = title
        
        current_content_lines.append(line)
    
    # 保存最后一个 chunk
    save_current_chunk()
    
    # 对超大 chunk 做二次拆分
    final_chunks: List[Dict[str, Any]] = []
    for chunk in chunks:
        if len(chunk["content"]) > max_chunk_size:
            # 用递归字符分块做二次拆分
            sub_texts = recursive_character_split(
                chunk["content"],
                chunk_size=max_chunk_size,
                chunk_overlap=200,
            )
            for sub in sub_texts:
                final_chunks.append({
                    "content": sub,
                    "metadata": chunk["metadata"].copy(),
                })
        else:
            final_chunks.append(chunk)
    
    return final_chunks


# ===== 使用示例 =====
if __name__ == "__main__":
    md = """# RAG 技术详解

## 1. 概述

RAG 是检索增强生成技术...
这是第一段正文。

## 2. 核心组件

### 2.1 检索器

检索器负责从知识库中获取相关文档...

### 2.2 生成器

生成器基于检索结果生成回答...

## 3. 工程实践

部署 RAG 系统需要考虑...
"""
    
    chunks = markdown_header_chunking(md)
    for i, chunk in enumerate(chunks):
        print(f"\n--- Chunk {i+1} ---")
        print(f"Headers: {chunk['metadata']}")
        print(f"Content: {chunk['content'][:80]}...")
```

### 4.3 分块大小的选择与经验指南

分块大小没有万能的最优值，需要根据 Embedding 模型的上下文窗口、LLM 的上下文预算、文档类型和检索精度需求综合确定。以下是经验性的指导：

| 应用场景 | 推荐块大小（字符） | 推荐重叠 | 推荐分块方法 | 理由 |
|---------|-------------------|---------|------------|------|
| 精确问答 | 300~600 | 50~100 | 递归/结构 | 问题通常对应文档中的局部段落 |
| 文档摘要 | 1000~2000 | 200~400 | 递归/语义 | 需要更多上下文保持连贯 |
| 代码检索 | 按函数/类 | 含签名 | 语法树 | 代码有天然的逻辑边界 |
| 法律合同 | 按条款/条 | 100~200 | 结构分块 | 法律文本有明确的层级结构 |
| 对话记录 | 按轮次 | 1~2 轮 | 自定义 | 保持对话的连贯性 |
| 技术文档 | 500~1500 | 100~200 | 标题分块 | 自然的章节结构 |

**核心经验法则：检索用小块，生成用大块**。可以用小块做检索（语义精确匹配），但将命中块的上下文（前后相邻块或父级块）一起送入 LLM 生成（提供完整信息）。这就是 **Parent Document Retrieval**（也叫 **Small-to-Big**）策略——下文会详细介绍。

---

## 5. Embedding 向量化

### 5.1 文本 Embedding 的本质

文本 Embedding 是将自然语言文本映射到一个固定维度的稠密向量空间中的过程。数学上，它是一个函数：

$$f: \text{Text} \rightarrow \mathbb{R}^d$$

其中 $d$ 是向量维度（通常为 384、768、1024 或 1536）。好的 Embedding 函数具有以下性质：

- **语义保持性**：语义相近的文本映射到向量空间中的邻近位置，余弦相似度高
- **区分性**：语义不同的文本映射到距离较远的位置
- **泛化性**：对未见过的文本也能生成合理的向量表示

Embedding 模型通常基于 Transformer 架构，通过对比学习（Contrastive Learning）训练：将语义相近的文本对（正例）拉近，语义不相关的文本对（负例）推远。训练目标类似于 InfoNCE loss：

$$\mathcal{L} = -\log \frac{\exp(\text{sim}(q, d^+) / \tau)}{\exp(\text{sim}(q, d^+) / \tau) + \sum_{j=1}^{K} \exp(\text{sim}(q, d_j^-) / \tau)}$$

其中 $\text{sim}$ 是余弦相似度，$\tau$ 是温度系数，$d^+$ 是正例文档，$d_j^-$ 是负例文档。

### 5.2 主流 Embedding 模型

**开源模型（推荐私有化部署）**：

| 模型 | 维度 | 最大 Token | 语言 | MTEB 排名 | 特点 |
|------|------|-----------|------|----------|------|
| BAAI/bge-large-zh-v1.5 | 1024 | 512 | 中文 | 中文 Top | 中文场景首选 |
| BAAI/bge-m3 | 1024 | 8192 | 多语言 | Top 10 | 支持稠密+稀疏+ColBERT |
| intfloat/e5-large-v2 | 1024 | 512 | 英文 | Top 20 | 需加 "query:" 前缀 |
| Alibaba/gte-Qwen2-7B-instruct | 3584 | 131072 | 多语言 | Top 5 | 超长上下文，7B 参数 |
| nomic-ai/nomic-embed-text-v1.5 | 768 | 8192 | 英文 | Top 20 | 可变维度，完全开源 |
| sentence-transformers/all-MiniLM-L6-v2 | 384 | 256 | 英文 | - | 极轻量，入门首选 |

**商业 API 模型**：

| 提供商 | 模型 | 维度 | 最大 Token | 特点 |
|--------|------|------|-----------|------|
| OpenAI | text-embedding-3-large | 3072 | 8191 | 可选降维，精度顶尖 |
| OpenAI | text-embedding-3-small | 1536 | 8191 | 性价比高 |
| Cohere | embed-v3 | 1024 | 512 | 区分搜索/分类任务类型 |
| Voyage AI | voyage-3 | 1024 | 32000 | 代码检索出色 |
| 智谱 AI | embedding-3 | 2048 | 8192 | 中文优化 |

### 5.3 Embedding 模型选型指南

选择 Embedding 模型时需要综合考虑以下因素：

**语言匹配**：中文场景优先选择 bge-large-zh-v1.5 或 bge-m3；英文场景 OpenAI text-embedding-3 或 GTE 都是优秀选择。**切勿用纯英文模型处理中文文本**——效果会极差。

**维度与存储**：维度越高表达力越强，但存储和检索开销也线性增加。1M 个 1024 维 float32 向量需要 ~4GB 内存。如果预算有限，可以选择支持维度缩减的模型（如 OpenAI text-embedding-3 支持将 3072 维降到 256 维，精度损失可控）。

**上下文长度**：大多数模型最大 512 token，如果 chunk 较长（>512 token），需要选择支持长上下文的模型（如 bge-m3 支持 8192，GTE-Qwen2 支持 131K）。

**Query 前缀**：部分模型（如 bge 系列、E5 系列）要求为查询添加特定前缀（如 "query: "），文档添加 "passage: " 前缀。忘记加前缀是一个非常常见的错误，会导致检索效果大幅下降。

**延迟与吞吐**：本地部署需关注模型大小——MiniLM（22M 参数）单次编码 ~2ms，bge-large（326M 参数）单次编码 ~15ms，GTE-7B 需要 GPU 推理。API 模式关注网络延迟和限流策略。

```python
from sentence_transformers import SentenceTransformer
import numpy as np
import time

# ===== Embedding 模型使用示例 =====


def embedding_demo():
    """
    演示如何使用开源 Embedding 模型进行文本向量化。
    
    关键点：
    1. bge 系列模型需要为查询加 "query: " 前缀
    2. 务必设置 normalize_embeddings=True 保证余弦相似度正确
    3. 批量编码比逐条编码快得多
    """
    # 1. 加载模型（首次会自动下载）
    model = SentenceTransformer("BAAI/bge-large-zh-v1.5")
    
    # 2. 准备文本
    query = "什么是注意力机制？"
    documents = [
        "注意力机制是 Transformer 的核心组件，它允许模型关注输入序列的不同部分。",
        "卷积神经网络使用卷积核提取局部特征。",
        "自注意力（Self-Attention）计算序列中每对元素之间的关联权重。",
        "循环神经网络通过隐藏状态传递序列信息。",
        "多头注意力将注意力计算分成多个子空间，捕获不同类型的依赖关系。",
    ]
    
    # 3. 编码查询（注意：bge 模型需要加 "query: " 前缀！）
    query_embedding = model.encode(
        f"query: {query}",           # 查询加前缀
        normalize_embeddings=True,   # L2 归一化
    )
    
    # 4. 编码文档（可选加 "passage: " 前缀）
    doc_embeddings = model.encode(
        documents,
        batch_size=32,               # 批量编码
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    
    # 5. 计算余弦相似度（因为已归一化，内积 = 余弦相似度）
    similarities = doc_embeddings @ query_embedding
    
    # 6. 排序输出
    ranked_indices = np.argsort(similarities)[::-1]
    print(f"查询: {query}\n")
    for rank, idx in enumerate(ranked_indices):
        print(f"  #{rank+1} [相似度: {similarities[idx]:.4f}] {documents[idx]}")


def embedding_performance_test():
    """
    Embedding 模型性能测试：测量编码速度。
    """
    model = SentenceTransformer("BAAI/bge-large-zh-v1.5")
    
    # 准备 1000 个文本
    texts = [f"这是第 {i} 个测试文本，内容是关于机器学习的。" for i in range(1000)]
    
    # 逐条编码
    start = time.time()
    for t in texts[:100]:
        model.encode(t, normalize_embeddings=True)
    single_time = (time.time() - start) / 100
    print(f"逐条编码: {single_time*1000:.1f} ms/条")
    
    # 批量编码
    start = time.time()
    model.encode(texts, batch_size=64, normalize_embeddings=True)
    batch_time = (time.time() - start) / len(texts)
    print(f"批量编码 (batch=64): {batch_time*1000:.1f} ms/条")
    print(f"批量 vs 逐条加速比: {single_time/batch_time:.1f}x")


if __name__ == "__main__":
    embedding_demo()
```

---

## 6. 向量数据库与索引

### 6.1 为什么需要专门的向量数据库

传统关系型数据库（MySQL、PostgreSQL）基于 B-Tree 索引做精确匹配或范围查询，对于高维向量的近似最近邻（ANN, Approximate Nearest Neighbor）搜索无能为力。要在 100 万个 1024 维向量中找到与查询向量最接近的 top-10，暴力扫描需要计算 100 万次余弦相似度——在 CPU 上需要数秒，这对于在线服务不可接受。

向量数据库通过专门的 ANN 索引算法，将查询时间从 O(N) 降到 O(log N) 甚至 O(1)（以少量精度损失为代价），同时提供生产级的特性：元数据过滤、分布式扩展、持久化存储、CRUD 操作等。

### 6.2 ANN 索引算法

#### HNSW（Hierarchical Navigable Small World）

当前最主流的 ANN 算法，几乎所有向量数据库都将其作为默认或推荐索引。

**核心原理**：构建一个多层的近似图结构。底层（Layer 0）包含所有向量节点，每个节点与其最近的 M 个邻居相连。高层按概率（约 1/ln(M) 的概率晋升到上一层）保留部分节点，形成稀疏的"快速通道"。

**查询过程**：
1. 从最高层的入口点（Entry Point）开始
2. 在当前层做贪心搜索（Greedy Search），沿着图的边向查询向量最近的方向移动
3. 当前层无法继续改善时，下降到下一层，继续搜索
4. 在底层（Layer 0）得到最终的最近邻候选

```
Layer 3:  [A]----------[D]                    (稀疏快速通道)
             \        /
Layer 2:  [A]---[B]---[D]------[F]            (中层)
             \   |   / \      / 
Layer 1:  [A]-[B]-[C]-[D]-[E]-[F]-[G]         (密集)
           |  / \  |  /|\  |  /|\  |
Layer 0:  [A][B][C][D][E][F][G][H][I][J]...   (全量节点)
```

**关键参数**：
- **M**：每个节点的最大连接数。M 越大 → 图越密 → recall 越高 → 内存越大、构建越慢。推荐 16~64
- **efConstruction**：构建时的搜索宽度。越大 → 构建越慢 → 图质量越高。推荐 100~200
- **efSearch**：查询时的搜索宽度。越大 → 查询越慢 → recall 越高。推荐 50~200

**复杂度**：
- 查询：O(log N)（平均）
- 构建：O(N * log N)
- 内存：O(N * M * 8)（每个连接存储一个 int32 ID + float32 距离）

#### IVF（Inverted File Index）

**核心原理**：先用 K-Means 将向量空间划分为 `nlist` 个聚类（Voronoi Cell），每个向量分配到最近的聚类中心。查询时只在最近的 `nprobe` 个聚类内做精确搜索，大幅缩小搜索范围。

**复杂度**：
- 查询：O(nprobe * N / nlist)
- 训练：O(N * nlist * iterations)

#### PQ（Product Quantization，乘积量化）

**核心原理**：将 D 维向量切分为 M 个子空间（每个 D/M 维），对每个子空间独立做 K-Means 聚类（通常 K=256），用 1 字节的聚类 ID 代替原始的 D/M 个 float32。

**压缩效果**：768 维 * 4 字节/float = 3072 字节 → 96 个子空间 * 1 字节 = 96 字节，压缩 32 倍！

### 6.3 主流向量数据库对比

| 数据库 | 类型 | 默认索引 | 元数据过滤 | 分布式 | 部署模式 | 适用场景 |
|--------|------|---------|-----------|--------|---------|----------|
| FAISS | 本地库 | IVF/HNSW/PQ | 不支持 | 不支持 | 嵌入式 | 研究实验、单机原型 |
| ChromaDB | 嵌入式 DB | HNSW | 支持 | 有限 | 嵌入式/客户端 | 快速原型、小规模 |
| Pinecone | 云服务 | 专有 | 支持 | 全托管 | SaaS | 零运维生产环境 |
| Milvus | 分布式 DB | HNSW/IVF/DiskANN | 支持 | 原生 | 自建/云 | 大规模生产 |
| Weaviate | 数据库 | HNSW | 支持+GraphQL | 支持 | 自建/云 | 语义搜索应用 |
| Qdrant | 数据库 | HNSW | 支持 | 支持 | 自建/云 | 推荐/搜索系统 |
| pgvector | PG 扩展 | IVFFlat/HNSW | SQL 原生 | PG 生态 | 扩展 | 已有 PG 基础设施 |

### 6.4 FAISS 实战

```python
import numpy as np
import faiss
import time


def faiss_index_comparison():
    """
    FAISS 不同索引类型的对比实验。
    
    对比 Flat（精确）、HNSW、IVF、IVF+PQ 四种索引的
    查询速度、recall 和内存占用。
    """
    # 1. 准备数据
    d = 768          # 向量维度（与 bge-large 一致）
    nb = 100_000     # 数据库向量数量
    nq = 100         # 查询向量数量
    k = 10           # top-k
    
    np.random.seed(42)
    xb = np.random.random((nb, d)).astype("float32")
    xq = np.random.random((nq, d)).astype("float32")
    
    # 归一化（模拟真实 embedding 已归一化的情况）
    faiss.normalize_L2(xb)
    faiss.normalize_L2(xq)
    
    # ---------- Flat Index（精确搜索，作为 baseline） ----------
    index_flat = faiss.IndexFlatIP(d)  # 内积（归一化后 = 余弦相似度）
    index_flat.add(xb)
    
    start = time.time()
    D_exact, I_exact = index_flat.search(xq, k)
    flat_time = (time.time() - start) * 1000
    
    print(f"=== Flat Index (精确搜索) ===")
    print(f"  查询时间: {flat_time:.1f} ms (100 queries)")
    print(f"  内存占用: {nb * d * 4 / 1024**2:.1f} MB")
    
    # ---------- HNSW Index ----------
    index_hnsw = faiss.IndexHNSWFlat(d, 32)  # M=32
    index_hnsw.hnsw.efConstruction = 200
    index_hnsw.hnsw.efSearch = 64
    
    start = time.time()
    index_hnsw.add(xb)
    build_time = time.time() - start
    
    start = time.time()
    D_hnsw, I_hnsw = index_hnsw.search(xq, k)
    hnsw_time = (time.time() - start) * 1000
    
    recall_hnsw = compute_recall(I_exact, I_hnsw, k)
    print(f"\n=== HNSW Index (M=32, efSearch=64) ===")
    print(f"  构建时间: {build_time:.1f} s")
    print(f"  查询时间: {hnsw_time:.1f} ms (100 queries)")
    print(f"  Recall@{k}: {recall_hnsw:.4f}")
    
    # ---------- IVF Index ----------
    nlist = 256  # 聚类数
    quantizer = faiss.IndexFlatIP(d)
    index_ivf = faiss.IndexIVFFlat(quantizer, d, nlist)
    
    index_ivf.train(xb)
    index_ivf.add(xb)
    index_ivf.nprobe = 16  # 搜索时探测的聚类数
    
    start = time.time()
    D_ivf, I_ivf = index_ivf.search(xq, k)
    ivf_time = (time.time() - start) * 1000
    
    recall_ivf = compute_recall(I_exact, I_ivf, k)
    print(f"\n=== IVF Index (nlist=256, nprobe=16) ===")
    print(f"  查询时间: {ivf_time:.1f} ms (100 queries)")
    print(f"  Recall@{k}: {recall_ivf:.4f}")
    
    # ---------- IVF + PQ Index（内存极度压缩） ----------
    m = 96  # 子量化器数量（d 须被 m 整除，768/96=8）
    index_ivfpq = faiss.IndexIVFPQ(quantizer, d, nlist, m, 8)
    index_ivfpq.train(xb)
    index_ivfpq.add(xb)
    index_ivfpq.nprobe = 32
    
    start = time.time()
    D_pq, I_pq = index_ivfpq.search(xq, k)
    pq_time = (time.time() - start) * 1000
    
    recall_pq = compute_recall(I_exact, I_pq, k)
    pq_memory = nb * m / 1024**2  # 每个向量 m 字节
    print(f"\n=== IVF+PQ Index (m=96, nprobe=32) ===")
    print(f"  查询时间: {pq_time:.1f} ms (100 queries)")
    print(f"  Recall@{k}: {recall_pq:.4f}")
    print(f"  内存占用: ~{pq_memory:.1f} MB (压缩 {nb*d*4/1024**2/pq_memory:.0f}x)")


def compute_recall(exact: np.ndarray, approx: np.ndarray, k: int) -> float:
    """
    计算 Recall@k：近似结果中命中精确结果的比例。
    
    Args:
        exact: 精确搜索结果的 ID 矩阵，shape (nq, k)
        approx: 近似搜索结果的 ID 矩阵，shape (nq, k)
        k: top-k
    
    Returns:
        平均 Recall@k（0~1）
    """
    hits = 0
    nq = len(exact)
    for i in range(nq):
        hits += len(set(exact[i, :k]) & set(approx[i, :k]))
    return hits / (nq * k)


if __name__ == "__main__":
    faiss_index_comparison()
```

---

## 7. 检索策略

### 7.1 混合检索（Hybrid Search）

单纯的向量检索和单纯的关键词检索各有盲区：

- **向量检索（Dense Retrieval）**：擅长语义匹配（"快乐" 能匹配 "开心"），但对精确关键词不敏感（搜索 "ERROR_CODE_1042" 可能匹配不到包含该错误码的文档）
- **BM25 检索（Sparse Retrieval）**：擅长精确关键词匹配，但无法理解语义同义词（搜索 "机器学习" 匹配不到只提 "ML" 的文档）

混合检索结合两者优势，是生产级 RAG 系统的标配方案。

```python
import math
from collections import Counter
from dataclasses import dataclass, field
from typing import List, Tuple, Dict
import numpy as np


class BM25Index:
    """
    BM25 算法实现（Okapi BM25）。
    
    BM25 是信息检索领域最经典的排序算法之一，基于词袋模型。
    
    核心公式：
    score(Q, D) = sum_i IDF(qi) * (f(qi,D) * (k1+1)) / (f(qi,D) + k1*(1 - b + b*|D|/avgdl))
    
    其中：
    - IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5) + 1)
        N = 文档总数，n(qi) = 包含词 qi 的文档数
    - f(qi, D) = 词 qi 在文档 D 中的出现频率
    - |D| = 文档 D 的长度（词数）
    - avgdl = 所有文档的平均长度
    - k1 = 词频饱和参数（默认 1.5），控制词频的边际收益递减速度
    - b = 长度归一化参数（默认 0.75），控制文档长度对评分的影响程度
    """
    
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.doc_freqs: Dict[str, int] = {}   # 词 -> 出现在多少文档中
        self.doc_lens: List[int] = []          # 每个文档的长度
        self.avgdl: float = 0.0                # 平均文档长度
        self.n_docs: int = 0                   # 文档总数
        self.doc_term_freqs: List[Dict[str, int]] = []  # 每个文档的词频
        self.documents: List[str] = []
    
    def _tokenize(self, text: str) -> List[str]:
        """
        简单分词。
        
        生产环境应使用 jieba（中文）+ NLTK/spaCy（英文）。
        这里用正则做最基本的中英文分词。
        """
        import re
        # 中文按字（单字粒度），英文按词，数字保持
        tokens = re.findall(r'[\u4e00-\u9fff]|[a-zA-Z0-9_]+', text.lower())
        return tokens
    
    def fit(self, documents: List[str]) -> "BM25Index":
        """
        构建 BM25 索引。
        
        Args:
            documents: 文档列表
        
        Returns:
            self（支持链式调用）
        
        复杂度：O(N * L)，N 为文档数，L 为平均文档长度
        """
        self.documents = documents
        self.n_docs = len(documents)
        self.doc_term_freqs = []
        self.doc_lens = []
        self.doc_freqs = {}
        
        for doc in documents:
            tokens = self._tokenize(doc)
            self.doc_lens.append(len(tokens))
            
            term_freq = dict(Counter(tokens))
            self.doc_term_freqs.append(term_freq)
            
            # 统计文档频率（一个词在多少文档中出现）
            for term in set(tokens):
                self.doc_freqs[term] = self.doc_freqs.get(term, 0) + 1
        
        self.avgdl = (
            sum(self.doc_lens) / self.n_docs if self.n_docs > 0 else 0
        )
        return self
    
    def _idf(self, term: str) -> float:
        """计算逆文档频率 IDF"""
        n = self.doc_freqs.get(term, 0)
        return math.log((self.n_docs - n + 0.5) / (n + 0.5) + 1)
    
    def score(self, query: str, doc_idx: int) -> float:
        """计算查询与指定文档的 BM25 分数"""
        query_tokens = self._tokenize(query)
        doc_tf = self.doc_term_freqs[doc_idx]
        doc_len = self.doc_lens[doc_idx]
        
        score = 0.0
        for token in query_tokens:
            if token not in doc_tf:
                continue
            tf = doc_tf[token]
            idf = self._idf(token)
            numerator = tf * (self.k1 + 1)
            denominator = tf + self.k1 * (
                1 - self.b + self.b * doc_len / self.avgdl
            )
            score += idf * numerator / denominator
        
        return score
    
    def search(
        self, query: str, top_k: int = 10
    ) -> List[Tuple[int, float]]:
        """
        检索 top-k 相关文档。
        
        Returns:
            [(doc_idx, score), ...] 按分数降序排列
        """
        scores = [
            (i, self.score(query, i)) for i in range(self.n_docs)
        ]
        scores.sort(key=lambda x: x[1], reverse=True)
        return [(idx, s) for idx, s in scores[:top_k] if s > 0]


def reciprocal_rank_fusion(
    ranked_lists: List[List[Tuple[str, float]]],
    k: int = 60,
    top_n: int = 10,
) -> List[Tuple[str, float]]:
    """
    RRF（Reciprocal Rank Fusion）融合算法。
    
    将多个排名列表融合为一个统一排名，不依赖原始分数的量纲。
    
    公式：RRF_score(d) = sum_i 1 / (k + rank_i(d))
    
    其中 k 是平滑常数（默认 60，原始论文推荐值），
    rank_i(d) 是文档 d 在第 i 个排名列表中的排名（从 1 开始）。
    
    RRF 的优雅之处在于它只依赖排名顺序，不依赖原始分数，
    因此可以直接融合来自不同量纲的检索结果（如向量相似度 0~1 
    和 BM25 分数 0~20+）。
    
    Args:
        ranked_lists: 多个排名列表，每个为 [(doc_id, score), ...]
                      已按分数降序排列
        k: 平滑常数。k 越大 -> 排名靠后的文档贡献越接近 ->
           排名差异的影响越小
        top_n: 返回数量
    
    Returns:
        融合后的排名列表 [(doc_id, rrf_score), ...]
    """
    rrf_scores: Dict[str, float] = {}
    
    for ranked_list in ranked_lists:
        for rank, (doc_id, _original_score) in enumerate(ranked_list, start=1):
            if doc_id not in rrf_scores:
                rrf_scores[doc_id] = 0.0
            rrf_scores[doc_id] += 1.0 / (k + rank)
    
    # 按 RRF 分数降序排列
    sorted_results = sorted(
        rrf_scores.items(), key=lambda x: x[1], reverse=True
    )
    return sorted_results[:top_n]


def hybrid_search_demo():
    """
    混合检索完整演示。
    """
    # 模拟文档
    documents = [
        "Transformer 模型使用自注意力机制处理序列数据。",
        "BM25 是一种经典的信息检索排名算法。",
        "注意力机制允许模型聚焦于输入的不同部分。",
        "向量数据库支持高效的近似最近邻搜索。",
        "BERT 通过双向 Transformer 预训练学习语言表示。",
    ]
    
    query = "注意力机制是什么"
    
    # 1. BM25 检索
    bm25 = BM25Index()
    bm25.fit(documents)
    bm25_results = bm25.search(query, top_k=5)
    
    print("BM25 检索结果：")
    bm25_ranked = []
    for idx, score in bm25_results:
        print(f"  [{score:.3f}] {documents[idx]}")
        bm25_ranked.append((str(idx), score))
    
    # 2. 向量检索（此处用随机向量模拟，实际应用中用 Embedding 模型）
    np.random.seed(42)
    doc_embs = np.random.randn(len(documents), 128).astype("float32")
    q_emb = np.random.randn(128).astype("float32")
    
    # 归一化
    doc_embs = doc_embs / np.linalg.norm(doc_embs, axis=1, keepdims=True)
    q_emb = q_emb / np.linalg.norm(q_emb)
    
    vec_scores = doc_embs @ q_emb
    vec_ranked = sorted(
        [(str(i), float(s)) for i, s in enumerate(vec_scores)],
        key=lambda x: x[1], reverse=True,
    )
    
    print("\n向量检索结果：")
    for doc_id, score in vec_ranked[:5]:
        print(f"  [{score:.3f}] {documents[int(doc_id)]}")
    
    # 3. RRF 融合
    fused = reciprocal_rank_fusion(
        [bm25_ranked, vec_ranked], k=60, top_n=5
    )
    
    print("\nRRF 融合结果：")
    for doc_id, rrf_score in fused:
        print(f"  [RRF: {rrf_score:.5f}] {documents[int(doc_id)]}")


if __name__ == "__main__":
    hybrid_search_demo()
```

### 7.2 查询转换（Query Transformation）

用户的原始查询往往不是最优的检索 query——可能过短、含糊、口语化或存在语义鸿沟。通过 LLM 对查询做预处理，可以显著提升检索效果。

#### HyDE（Hypothetical Document Embedding）

核心思想：让 LLM 先生成一个"假想的回答文档"，用假想文档的 Embedding 去检索，因为假想文档在语义空间中更接近真实答案文档。

```python
def hyde_retrieval(
    query: str,
    llm_client,
    embedding_model,
    vector_store,
    top_k: int = 5,
) -> list:
    """
    HyDE 检索：用假想文档的 Embedding 替代原始查询的 Embedding 进行检索。
    
    原理分析：
    - 用户查询："RAG 怎么减少幻觉？"（很短，信息量少）
    - 假想文档："RAG 通过在生成前检索相关文档来减少幻觉。
      具体而言，它将检索到的文档作为上下文注入 Prompt，
      并要求模型仅基于提供的信息回答..."（更接近真实文档的表述）
    - 假想文档的 Embedding 在向量空间中更靠近真实文档
    
    性能开销：增加一次 LLM 调用（~500ms），但 recall 通常提升 10~20%
    """
    # Step 1: 让 LLM 生成假想文档
    hyde_prompt = (
        f"请针对以下问题写一段详细的说明文字（约 200 字），"
        f"作为该问题的参考回答。即使不确定也请给出合理的内容：\n\n"
        f"问题：{query}\n\n说明："
    )
    hypothetical_doc = llm_client.generate(hyde_prompt)
    
    # Step 2: 用假想文档的 Embedding 做检索
    hyde_embedding = embedding_model.encode(
        hypothetical_doc,
        normalize_embeddings=True,
    )
    
    results = vector_store.similarity_search_by_vector(
        hyde_embedding, k=top_k
    )
    return results


def multi_query_retrieval(
    query: str,
    llm_client,
    retriever,
    n_variants: int = 3,
    top_k: int = 5,
) -> list:
    """
    多查询检索：让 LLM 从不同角度改写查询，扩大召回覆盖面。
    
    原理：同一个问题用不同措辞搜索，能覆盖更多相关文档。
    比如 "什么是 RAG" 可以改写为：
    - "RAG 检索增强生成的定义和原理"
    - "Retrieval-Augmented Generation 技术介绍"
    - "大模型如何结合知识库检索来回答问题"
    """
    # 生成查询变体
    expand_prompt = (
        f"请将以下问题从 {n_variants} 个不同角度改写为搜索查询，"
        f"每行一个，不要编号，不要解释：\n\n"
        f"原始问题：{query}"
    )
    
    expanded = llm_client.generate(expand_prompt)
    variants = [q.strip() for q in expanded.strip().split("\n") if q.strip()]
    all_queries = [query] + variants[:n_variants]
    
    # 分别检索并合并去重
    seen_ids = set()
    merged_results = []
    
    for q in all_queries:
        results = retriever.search(q, top_k=top_k)
        for doc in results:
            if doc.id not in seen_ids:
                seen_ids.add(doc.id)
                merged_results.append(doc)
    
    return merged_results[:top_k]
```

---

## 8. 重排序（Reranking）

### 8.1 为什么需要重排序

初步检索（无论是向量检索还是 BM25）使用的是 **Bi-Encoder** 架构——query 和 document 分别独立编码为向量，然后通过内积/余弦相似度比较。这种方式速度极快（可以预计算所有文档向量），但精度有限，因为 query 和 document 之间没有直接的交互注意力。

**Cross-Encoder** 将 query 和 document 拼接后一起送入 Transformer，让两段文本在每一层都有充分的交互注意力。精度远高于 Bi-Encoder，但因为每个 (query, doc) 对都需要独立推理，速度很慢——不能预计算。

因此，最佳实践是：**Bi-Encoder 粗筛 + Cross-Encoder 精排**。

```
全量文档（100万）
    |
    v  [Bi-Encoder: 向量检索] ~50ms
Top-50 候选
    |
    v  [Cross-Encoder: 重排序] ~200ms
Top-5 精排结果
    |
    v  [LLM 生成]
最终回答
```

### 8.2 重排序实现

```python
from sentence_transformers import CrossEncoder
from typing import List, Dict, Tuple


def rerank_documents(
    query: str,
    documents: List[Dict],
    model_name: str = "BAAI/bge-reranker-v2-m3",
    top_k: int = 5,
    batch_size: int = 32,
) -> List[Dict]:
    """
    使用 Cross-Encoder 对检索结果重排序。
    
    Cross-Encoder vs Bi-Encoder 精度对比（以 MS MARCO 为例）：
    - Bi-Encoder (bge-large): MRR@10 = 0.364
    - Cross-Encoder (bge-reranker-v2): MRR@10 = 0.421 (+15.7%)
    
    推荐的 Reranker 模型：
    - BAAI/bge-reranker-v2-m3: 多语言，精度高
    - BAAI/bge-reranker-large: 中文场景
    - Cohere Rerank v3: 商业 API，免部署
    - cross-encoder/ms-marco-MiniLM-L-12-v2: 英文轻量
    
    Args:
        query: 用户查询
        documents: 候选文档列表，每个元素需有 "content" 字段
        model_name: Cross-Encoder 模型名
        top_k: 重排后保留的文档数
        batch_size: 批量推理大小
    
    Returns:
        重排后的文档列表（前 top_k 个），每个文档增加 "rerank_score" 字段
    """
    if not documents:
        return []
    
    # 加载 Cross-Encoder
    reranker = CrossEncoder(model_name)
    
    # 构建 (query, document) 对
    pairs = [(query, doc["content"]) for doc in documents]
    
    # 批量计算相关性分数
    scores = reranker.predict(
        pairs,
        batch_size=batch_size,
        show_progress_bar=False,
    )
    
    # 将分数附加到文档上
    for i, score in enumerate(scores):
        documents[i]["rerank_score"] = float(score)
    
    # 按重排分数降序排列
    documents.sort(key=lambda x: x["rerank_score"], reverse=True)
    
    return documents[:top_k]
```

---

## 9. Prompt 构建与上下文注入

### 9.1 RAG Prompt 模板设计

Prompt 设计是影响 RAG 生成质量的关键环节。一个好的 RAG Prompt 需要明确以下几点：

1. **角色定义**：告诉 LLM 它是什么角色
2. **行为约束**：只基于提供的资料回答，不编造
3. **引用要求**：回答时标注来源
4. **不确定处理**：信息不足时如何应对

```python
# ===== RAG Prompt 模板集合 =====

# 模板 1：标准 RAG（带引用）
STANDARD_RAG_PROMPT = """你是一个严谨的知识助手。请根据以下【参考资料】回答用户的问题。

核心规则：
1. 只使用参考资料中的信息回答，不要添加你自己的知识
2. 每个关键论断后用 [来源N] 标注出处（N 是资料编号）
3. 如果参考资料不足以回答问题，明确说明"根据现有资料无法完整回答"
4. 如果不同资料有矛盾，指出差异并呈现各方观点

【参考资料】
{context}

---

用户问题：{query}

请回答（含来源标注）："""


# 模板 2：防幻觉增强版
ANTI_HALLUCINATION_PROMPT = """请仔细阅读以下参考资料，然后回答问题。

重要约束：
- 你只能使用下方【参考资料】中明确包含的信息
- 对于资料中没有涉及的内容，回答"资料中未提及此信息"
- 不要推测、猜测或使用你的训练知识来补充
- 如果只能部分回答，回答已知部分并说明哪些无法确认

【参考资料】
{context}

问题：{query}

回答："""


# 模板 3：带思维链的 RAG
COT_RAG_PROMPT = """你是一个专业的分析师。请根据参考资料回答问题。

回答步骤：
1. 首先列出与问题相关的关键信息（从资料中提取）
2. 分析这些信息如何回答问题
3. 给出最终答案
4. 标注所有引用来源

【参考资料】
{context}

问题：{query}

请按以上步骤回答："""


def build_context(
    retrieved_docs: List[Dict],
    max_tokens: int = 4000,
    include_metadata: bool = True,
) -> str:
    """
    将检索到的文档构建为 LLM 上下文字符串。
    
    关键设计点：
    1. 按相关度排序（最相关的在前面）—— LLM 倾向于更关注开头的内容
    2. 控制总 token 数，避免超出预算
    3. 包含元数据（来源文件名），方便引用
    4. 编号标注，方便 LLM 在回答中引用 [来源1] [来源2]
    """
    context_parts = []
    total_chars = 0
    max_chars = max_tokens * 2  # 粗略估算：1 token ≈ 2 个字符（中文）
    
    for i, doc in enumerate(retrieved_docs):
        source = doc.get("metadata", {}).get("source", "未知来源")
        content = doc["content"]
        
        # 构建单条资料
        if include_metadata:
            part = f"【资料 {i+1}】（来源：{source}）\n{content}\n"
        else:
            part = f"【资料 {i+1}】\n{content}\n"
        
        # 检查是否超出 token 预算
        if total_chars + len(part) > max_chars:
            remaining = max_chars - total_chars
            if remaining > 100:
                part = part[:remaining] + "\n...(截断)\n"
                context_parts.append(part)
            break
        
        context_parts.append(part)
        total_chars += len(part)
    
    return "\n".join(context_parts)
```

---

## 10. 完整 RAG Pipeline 实现

以下是一个生产级可用的完整 RAG Pipeline，集成了前述所有关键组件：

```python
"""
完整 RAG Pipeline 实现
======================

集成组件：
- 文档加载与分块（递归字符分块 + Markdown 标题分块）
- Embedding 向量化（bge / OpenAI）
- 向量存储（ChromaDB）
- BM25 索引
- 混合检索（向量 + BM25 + RRF 融合）
- Cross-Encoder 重排序
- LLM 生成（带引用的 Prompt）

依赖安装：
pip install chromadb sentence-transformers openai tiktoken pymupdf
"""

import os
import hashlib
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Optional, Generator
import numpy as np


@dataclass
class RAGConfig:
    """RAG 系统配置"""
    # Embedding
    embedding_model: str = "BAAI/bge-large-zh-v1.5"
    embedding_dim: int = 1024
    embedding_query_prefix: str = "query: "
    
    # Chunking
    chunk_size: int = 800
    chunk_overlap: int = 150
    
    # Retrieval
    top_k_retrieve: int = 20
    top_k_rerank: int = 5
    use_reranker: bool = True
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    
    # Generation
    llm_model: str = "gpt-4o"
    max_context_tokens: int = 4000
    temperature: float = 0.1
    
    # Storage
    collection_name: str = "knowledge_base"
    persist_dir: str = "./chroma_db"


class RAGPipeline:
    """
    端到端 RAG Pipeline。
    
    使用流程：
    1. 初始化：rag = RAGPipeline(config)
    2. 索引文档：rag.index_documents(["doc1.md", "doc2.pdf"])
    3. 问答：result = rag.ask("你的问题")
    
    架构概览：
    index_documents() -> chunk -> embed -> store to ChromaDB + BM25
    ask() -> retrieve (hybrid) -> rerank -> build prompt -> LLM generate
    """
    
    def __init__(self, config: Optional[RAGConfig] = None):
        self.config = config or RAGConfig()
        self._init_components()
    
    def _init_components(self):
        """初始化各子系统"""
        import chromadb
        from sentence_transformers import SentenceTransformer
        
        # Embedding 模型
        print(f"加载 Embedding 模型: {self.config.embedding_model}")
        self.embedder = SentenceTransformer(self.config.embedding_model)
        
        # 向量数据库
        self.chroma_client = chromadb.PersistentClient(
            path=self.config.persist_dir
        )
        self.collection = self.chroma_client.get_or_create_collection(
            name=self.config.collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        
        # BM25 索引
        self.bm25 = BM25Index()
        self._bm25_docs: List[str] = []
        self._bm25_ids: List[str] = []
        
        # Reranker
        if self.config.use_reranker:
            from sentence_transformers import CrossEncoder
            print(f"加载 Reranker: {self.config.reranker_model}")
            self.reranker = CrossEncoder(self.config.reranker_model)
        
        # LLM
        from openai import OpenAI
        self.llm = OpenAI()
        
        # 如果已有索引数据，重建 BM25
        self._rebuild_bm25_index()
    
    # ==================== Indexing ====================
    
    def index_documents(self, file_paths: List[str]) -> int:
        """
        索引文档：加载 -> 分块 -> Embedding -> 存入向量数据库。
        
        支持增量索引（基于内容 hash 去重，相同内容不会重复索引）。
        
        Args:
            file_paths: 文件路径列表，支持 .md, .txt, .pdf
        
        Returns:
            新增的 chunk 数量
        """
        all_chunks = []
        all_ids = []
        all_metadatas = []
        
        for file_path in file_paths:
            path = Path(file_path)
            if not path.exists():
                print(f"  [跳过] 文件不存在: {file_path}")
                continue
            
            # 加载文件
            text = self._load_file(path)
            if not text.strip():
                print(f"  [跳过] 文件内容为空: {file_path}")
                continue
            
            # 分块（根据文件类型选择策略）
            if path.suffix.lower() == ".md":
                chunks_data = markdown_header_chunking(text)
                chunks = [c["content"] for c in chunks_data]
                chunk_metas = [c.get("metadata", {}) for c in chunks_data]
            else:
                chunks = recursive_character_split(
                    text,
                    self.config.chunk_size,
                    self.config.chunk_overlap,
                )
                chunk_metas = [{}] * len(chunks)
            
            for i, (chunk, meta) in enumerate(zip(chunks, chunk_metas)):
                # 基于内容 hash 生成稳定 ID（避免重复索引）
                chunk_id = hashlib.md5(
                    f"{file_path}::{chunk[:200]}".encode()
                ).hexdigest()
                
                all_chunks.append(chunk)
                all_ids.append(chunk_id)
                all_metadatas.append({
                    "source": path.name,
                    "file_path": str(path),
                    "chunk_index": i,
                    **meta,
                })
        
        if not all_chunks:
            print("没有需要索引的内容。")
            return 0
        
        # 批量 Embedding
        print(f"正在编码 {len(all_chunks)} 个 chunks...")
        embeddings = self.embedder.encode(
            all_chunks,
            batch_size=32,
            normalize_embeddings=True,
            show_progress_bar=True,
        ).tolist()
        
        # 存入 ChromaDB（upsert 自动去重）
        batch_size = 500
        for start in range(0, len(all_chunks), batch_size):
            end = min(start + batch_size, len(all_chunks))
            self.collection.upsert(
                ids=all_ids[start:end],
                documents=all_chunks[start:end],
                embeddings=embeddings[start:end],
                metadatas=all_metadatas[start:end],
            )
        
        # 重建 BM25 索引
        self._rebuild_bm25_index()
        
        print(f"完成！已索引 {len(all_chunks)} 个 chunks。")
        return len(all_chunks)
    
    def _load_file(self, path: Path) -> str:
        """加载文件内容"""
        suffix = path.suffix.lower()
        if suffix in (".txt", ".md"):
            return path.read_text(encoding="utf-8")
        elif suffix == ".pdf":
            try:
                import fitz
                doc = fitz.open(str(path))
                text = "\n\n".join(page.get_text() for page in doc)
                doc.close()
                return text
            except ImportError:
                print("  [警告] 需安装 pymupdf: pip install pymupdf")
                return ""
        else:
            return path.read_text(encoding="utf-8", errors="ignore")
    
    def _rebuild_bm25_index(self):
        """从 ChromaDB 重建 BM25 索引"""
        result = self.collection.get(include=["documents"])
        if result["documents"]:
            self._bm25_docs = result["documents"]
            self._bm25_ids = result["ids"]
            self.bm25.fit(self._bm25_docs)
    
    # ==================== Retrieval ====================
    
    def retrieve(self, query: str) -> List[Dict]:
        """
        混合检索 + 重排序。
        
        流程：
        1. 向量检索 top-k（语义匹配）
        2. BM25 检索 top-k（关键词匹配）
        3. RRF 融合两路结果
        4. Cross-Encoder 重排序
        
        Returns:
            [{
                "content": "...",
                "metadata": {...},
                "score": 0.95,
            }, ...]
        """
        top_k = self.config.top_k_retrieve
        
        # 1. 向量检索
        query_with_prefix = self.config.embedding_query_prefix + query
        query_emb = self.embedder.encode(
            query_with_prefix, normalize_embeddings=True
        ).tolist()
        
        vec_results = self.collection.query(
            query_embeddings=[query_emb],
            n_results=min(top_k, self.collection.count()),
            include=["documents", "metadatas", "distances"],
        )
        
        # 2. BM25 检索
        bm25_results = self.bm25.search(query, top_k=top_k)
        
        # 3. RRF 融合
        vec_ranked = []
        if vec_results["ids"] and vec_results["ids"][0]:
            vec_ranked = [
                (vec_results["ids"][0][i], 1 - vec_results["distances"][0][i])
                for i in range(len(vec_results["ids"][0]))
            ]
        
        bm25_ranked = [
            (self._bm25_ids[idx], score)
            for idx, score in bm25_results
            if score > 0
        ]
        
        if not vec_ranked and not bm25_ranked:
            return []
        
        fused = reciprocal_rank_fusion(
            [vec_ranked, bm25_ranked], k=60, top_n=top_k
        )
        
        # 4. 获取融合后的文档
        fused_ids = [doc_id for doc_id, _ in fused]
        if not fused_ids:
            return []
        
        fetched = self.collection.get(
            ids=fused_ids, include=["documents", "metadatas"]
        )
        
        id_to_doc = {}
        for i, doc_id in enumerate(fetched["ids"]):
            id_to_doc[doc_id] = {
                "content": fetched["documents"][i],
                "metadata": fetched["metadatas"][i] if fetched["metadatas"] else {},
            }
        
        candidates = []
        for doc_id, rrf_score in fused:
            if doc_id in id_to_doc:
                candidates.append({
                    "id": doc_id,
                    "content": id_to_doc[doc_id]["content"],
                    "metadata": id_to_doc[doc_id]["metadata"],
                    "score": rrf_score,
                })
        
        # 5. 重排序
        if self.config.use_reranker and candidates:
            pairs = [(query, c["content"]) for c in candidates]
            rerank_scores = self.reranker.predict(
                pairs, show_progress_bar=False
            )
            for i, score in enumerate(rerank_scores):
                candidates[i]["score"] = float(score)
            candidates.sort(key=lambda x: x["score"], reverse=True)
        
        return candidates[: self.config.top_k_rerank]
    
    # ==================== Generation ====================
    
    def ask(
        self, query: str, stream: bool = False
    ) -> Dict | Generator:
        """
        一站式问答接口。
        
        Args:
            query: 用户问题
            stream: 是否流式输出
        
        Returns:
            非流式：{"answer": "...", "sources": [...], "query": "..."}
            流式：Generator[str]
        """
        # 检索
        retrieved = self.retrieve(query)
        
        # 构建上下文
        context = build_context(
            retrieved, max_tokens=self.config.max_context_tokens
        )
        
        # 构建消息
        messages = [
            {"role": "system", "content": (
                "你是一个严谨的知识问答助手。"
                "请根据提供的参考资料回答用户的问题。"
                "只基于资料回答，标注来源 [来源N]，"
                "信息不足时明确说明。"
            )},
            {"role": "user", "content": (
                f"参考资料：\n{context}\n\n"
                f"---\n\n"
                f"问题：{query}\n\n"
                f"请回答（含来源标注）："
            )},
        ]
        
        if stream:
            return self._stream(messages)
        
        response = self.llm.chat.completions.create(
            model=self.config.llm_model,
            messages=messages,
            temperature=self.config.temperature,
            max_tokens=2000,
        )
        
        return {
            "answer": response.choices[0].message.content,
            "sources": [
                {
                    "source": doc["metadata"].get("source", "unknown"),
                    "score": doc["score"],
                    "preview": doc["content"][:150] + "...",
                }
                for doc in retrieved
            ],
            "query": query,
        }
    
    def _stream(self, messages) -> Generator[str, None, None]:
        """流式生成"""
        stream = self.llm.chat.completions.create(
            model=self.config.llm_model,
            messages=messages,
            temperature=self.config.temperature,
            max_tokens=2000,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# ===== 使用示例 =====

if __name__ == "__main__":
    # 初始化
    config = RAGConfig(
        embedding_model="BAAI/bge-large-zh-v1.5",
        chunk_size=800,
        top_k_retrieve=20,
        top_k_rerank=5,
        llm_model="gpt-4o",
    )
    rag = RAGPipeline(config)
    
    # 索引文档
    rag.index_documents([
        "./docs/technical_spec.md",
        "./docs/api_reference.md",
        "./docs/user_guide.pdf",
    ])
    
    # 问答
    result = rag.ask("如何配置数据库连接池？")
    print(f"\n回答：\n{result['answer']}")
    print(f"\n引用来源：")
    for src in result["sources"]:
        print(f"  - {src['source']} (score: {src['score']:.3f})")
    
    # 流式问答
    print("\n\n流式回答：")
    for token in rag.ask("RAG 的核心组件有哪些？", stream=True):
        print(token, end="", flush=True)
    print()
```


---

## 11. Advanced RAG 进阶技术

### 11.1 Parent Document Retrieval（父文档检索）

核心思想：**检索用小块（精准匹配），生成用大块（完整上下文）**。

小 chunk 语义聚焦，向量检索精度高；但直接把小 chunk 送给 LLM 可能缺乏足够上下文。解决方案是建立"父子"关系：用小 chunk 做检索，命中后返回对应的父 chunk（更大的上下文块）给 LLM。

```python
from typing import List, Dict
import hashlib


def build_parent_child_index(
    text: str,
    parent_chunk_size: int = 2000,
    child_chunk_size: int = 400,
    child_overlap: int = 50,
) -> List[Dict]:
    """
    构建父子 Chunk 索引。
    
    结构示意：
    Parent Chunk (2000 chars):
        "这是一段完整的关于 Transformer 注意力机制的讲解..."
        |
        +-- Child Chunk 1 (400 chars): "注意力机制的核心是..."
        +-- Child Chunk 2 (400 chars): "多头注意力将..."
        +-- Child Chunk 3 (400 chars): "自注意力的计算..."
    
    检索时：用 Child 的 Embedding 匹配查询
    返回时：将命中 Child 对应的 Parent 送给 LLM
    
    Args:
        text: 原始文本
        parent_chunk_size: 父 chunk 大小
        child_chunk_size: 子 chunk 大小
        child_overlap: 子 chunk 重叠
    
    Returns:
        [{
            "child_id": "...",
            "parent_id": "...",
            "child_content": "...",   # 用于 Embedding + 检索
            "parent_content": "...",  # 检索到后返回这个给 LLM
        }, ...]
    """
    # 1. 切父 chunk
    parents = recursive_character_split(text, parent_chunk_size, 0)
    
    results = []
    for p_idx, parent in enumerate(parents):
        parent_id = hashlib.md5(
            f"parent_{p_idx}_{parent[:50]}".encode()
        ).hexdigest()
        
        # 2. 每个父 chunk 内部切子 chunk
        children = fixed_size_chunking(
            parent,
            chunk_size=child_chunk_size,
            chunk_overlap=child_overlap,
        )
        
        for c_idx, child in enumerate(children):
            child_id = hashlib.md5(
                f"child_{p_idx}_{c_idx}_{child[:50]}".encode()
            ).hexdigest()
            
            results.append({
                "child_id": child_id,
                "parent_id": parent_id,
                "child_content": child,
                "parent_content": parent,
            })
    
    return results
```

### 11.2 Contextual Embedding（上下文增强 Embedding）

Anthropic 在 2024 年提出的方法：在每个 chunk 前面拼接一段由 LLM 生成的上下文说明，让 Embedding 携带全局信息。

**问题**：chunk "该方法的时间复杂度为 O(n log n)" 脱离上下文后，无法确定"该方法"指什么。
**解决**：在 chunk 前拼接 "[上下文：本段描述的是归并排序算法的时间复杂度分析]"，让 Embedding 捕获到"归并排序"这个关键语义。

```python
def add_contextual_prefix(
    document: str,
    chunks: List[str],
    llm_client,
) -> List[str]:
    """
    为每个 chunk 添加 LLM 生成的上下文前缀。
    
    Anthropic 的实验数据：
    - 仅加上下文前缀：检索 Recall@20 提升 ~35%
    - 上下文前缀 + BM25 混合：Recall@20 提升 ~49%
    
    代价：每个 chunk 需要一次 LLM 调用（可批量化 + 缓存）
    """
    # 生成文档级摘要
    summary_prompt = (
        "请用 2-3 句话概括以下文档的主题和核心内容：\n\n"
        f"{document[:3000]}"
    )
    doc_summary = llm_client.generate(summary_prompt)
    
    enhanced_chunks = []
    for chunk in chunks:
        # 为每个 chunk 生成上下文说明
        context_prompt = (
            f"文档主题：{doc_summary}\n\n"
            f"以下是文档中的一个片段。"
            f"请用 1 句话说明这个片段讨论的具体内容和主题：\n\n"
            f"片段：{chunk[:500]}\n\n"
            f"上下文说明："
        )
        context = llm_client.generate(context_prompt)
        
        # 拼接：上下文 + 原始 chunk
        enhanced = f"[上下文：{context.strip()}]\n\n{chunk}"
        enhanced_chunks.append(enhanced)
    
    return enhanced_chunks
```

### 11.3 Self-RAG（自反思 RAG）

Self-RAG（Asai et al., 2023）让 LLM 在生成过程中自主判断四件事：

1. **是否需要检索**（Retrieve Token）：[Retrieval] = Yes/No
2. **检索结果是否相关**（IsREL Token）：[IsREL] = Relevant/Irrelevant  
3. **生成内容是否被上下文支持**（IsSUP Token）：[IsSUP] = Fully/Partially/No
4. **生成内容是否有用**（IsUSE Token）：[IsUSE] = 1~5

```python
def self_rag(
    query: str,
    rag_pipeline,
    llm_client,
    max_retries: int = 2,
) -> Dict:
    """
    Self-RAG：带自反思的 RAG Pipeline。
    
    流程：
    1. 判断是否需要检索
    2. 如需检索，执行检索
    3. 评估检索结果相关性
    4. 生成回答
    5. 自检回答是否忠实于上下文
    6. 如不忠实，重新生成（最多 max_retries 次）
    
    Self-RAG 的关键创新在于引入了「反思 token」(reflection tokens)，
    让模型在推理过程中持续自我评估，类似于人类的"我刚说的对吗？"的自省过程。
    """
    # Step 1: 判断是否需要检索
    need_retrieval_prompt = (
        "判断以下问题是否需要查阅外部资料才能准确回答。\n"
        "如果是常识性问题或简单计算，回答 NO。\n"
        "如果涉及具体事实、数据、最新信息，回答 YES。\n"
        f"只回答 YES 或 NO。\n\n"
        f"问题：{query}\n\n需要检索：")
    
    need_retrieval = llm_client.generate(
        need_retrieval_prompt
    ).strip().upper()
    
    if "NO" in need_retrieval:
        answer = llm_client.generate(f"请简洁准确地回答：{query}")
        return {
            "answer": answer,
            "used_retrieval": False,
            "sources": [],
        }
    
    # Step 2: 检索
    retrieved = rag_pipeline.retrieve(query)
    context = "\n\n".join([doc["content"] for doc in retrieved])
    
    # Step 3: 评估检索结果相关性
    relevance_prompt = (
        "判断以下检索结果是否与用户问题相关。\n"
        "回答 RELEVANT 或 IRRELEVANT。\n\n"
        f"问题：{query}\n"
        f"检索结果摘要：{context[:500]}\n\n"
        f"相关性判断："
    )
    
    relevance = llm_client.generate(relevance_prompt).strip().upper()
    
    if "IRRELEVANT" in relevance:
        return {
            "answer": f"未找到与「{query}」相关的信息。建议换个角度提问。",
            "used_retrieval": True,
            "retrieval_relevant": False,
            "sources": [],
        }
    
    # Step 4 + 5: 生成回答并自检忠实度（带重试）
    for attempt in range(max_retries + 1):
        # 生成
        result = rag_pipeline.generate(query, retrieved)
        answer = result["answer"]
        
        # 自检忠实度
        faithfulness_prompt = (
            "检查回答是否完全基于参考资料，"
            "没有添加参考资料中不存在的信息。\n"
            "回答 FAITHFUL 或 NOT_FAITHFUL。\n\n"
            f"参考资料：{context[:1000]}\n\n"
            f"回答：{answer}\n\n"
            f"忠实度检查："
        )
        
        check = llm_client.generate(faithfulness_prompt).strip().upper()
        
        if "FAITHFUL" in check and "NOT" not in check:
            return {
                "answer": answer,
                "used_retrieval": True,
                "retrieval_relevant": True,
                "faithful": True,
                "attempts": attempt + 1,
                "sources": result.get("sources", []),
            }
    
    # 重试后仍不忠实，返回并标注警告
    return {
        "answer": answer + "\n\n[注意：此回答可能包含未经资料验证的内容]",
        "used_retrieval": True,
        "faithful": False,
        "attempts": max_retries + 1,
        "sources": result.get("sources", []),
    }
```

### 11.4 GraphRAG

Microsoft 在 2024 年提出的 GraphRAG 将传统的"文本 → 向量"索引扩展为"文本 → 知识图谱"索引，特别适合需要**多跳推理**和**全局理解**的复杂问题。

**核心思路**：

1. **索引阶段**：
   - 用 LLM 从文档中抽取实体（人物、组织、概念、事件）和关系
   - 构建知识图谱（Knowledge Graph）
   - 对图谱做社区检测（Community Detection，如 Leiden 算法）
   - 为每个社区生成摘要（Community Summary）

2. **检索阶段**：
   - **Local Search**：从与查询最相关的实体出发，沿着图谱的边遍历相关实体和关系，收集子图作为上下文。适合需要具体细节的问题。
   - **Global Search**：利用社区摘要回答需要全局视角的问题（如"这篇报告的主要发现是什么？"）。Map 阶段并行查询所有社区摘要 → Reduce 阶段汇总。

**适用场景**：法律文档分析（多个条款之间的关联）、人物关系分析、复杂技术文档的跨章节推理。

**局限性**：索引构建成本极高（每个 chunk 都需要多次 LLM 调用来抽取实体和关系）；对于简单的事实查询，效果不一定优于 Advanced RAG。

---

## 12. RAG 评估体系

### 12.1 评估维度

RAG 系统的评估需要分别衡量**检索质量**和**生成质量**，以及**端到端效果**：

**检索质量指标**：

| 指标 | 定义 | 含义 | 适用场景 |
|------|------|------|---------|
| Recall@k | 相关且被召回的 / 总相关数 | top-k 中找回了多少相关文档 | 衡量召回覆盖面 |
| Precision@k | 相关且被召回的 / k | top-k 中有多少是相关的 | 衡量召回精确度 |
| MRR | 1 / 第一个相关文档的排名 | 第一个正确结果排多前 | 衡量排序质量 |
| NDCG@k | DCG@k / IDCG@k | 考虑排名位置的信息增益 | 综合排序质量 |
| Hit Rate | 至少有一个相关文档在 top-k 中的概率 | 最基本的召回指标 | 快速评估 |

**生成质量指标**：

| 指标 | 评估方法 | 含义 |
|------|---------|------|
| Faithfulness（忠实度） | LLM-as-Judge | 回答是否忠实于检索上下文，不编造 |
| Answer Relevancy（答案相关性） | LLM-as-Judge | 回答是否切题回答了用户问题 |
| Context Relevancy（上下文相关性） | LLM-as-Judge | 检索到的上下文是否与问题相关 |
| Hallucination Rate（幻觉率） | 人工+LLM | 回答中有多少不在上下文中的信息 |
| Completeness（完整性） | 人工评估 | 回答是否覆盖了所有关键要点 |

### 12.2 RAGAS 评估框架

RAGAS（Retrieval-Augmented Generation Assessment）是最流行的 RAG 评估框架：

```python
"""
RAGAS 评估示例

安装：pip install ragas datasets

RAGAS 的核心指标：
1. Faithfulness: 回答的每个论断是否都能从上下文中找到依据
2. Answer Relevancy: 回答是否与问题相关（反向检验：从回答生成问题，看与原问题的相似度）
3. Context Precision: 相关上下文在检索结果中的排名是否靠前
4. Context Recall: 上下文是否覆盖了标准答案中的所有关键信息
"""

from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from datasets import Dataset


def evaluate_rag_with_ragas(
    rag_pipeline,
    test_data: List[Dict],
) -> Dict:
    """
    使用 RAGAS 评估 RAG 系统。
    
    Args:
        rag_pipeline: RAG Pipeline 实例
        test_data: 测试数据
            [{
                "question": "什么是 RAG？",
                "ground_truth": "RAG 是检索增强生成..."
            }, ...]
    
    Returns:
        各维度的评估分数
    """
    questions = []
    answers = []
    contexts = []
    ground_truths = []
    
    for item in test_data:
        query = item["question"]
        
        # 运行 RAG
        retrieved = rag_pipeline.retrieve(query)
        result = rag_pipeline.ask(query)
        
        questions.append(query)
        answers.append(result["answer"])
        contexts.append([doc["content"] for doc in retrieved])
        ground_truths.append(item["ground_truth"])
    
    # 构建 RAGAS 数据集
    eval_dataset = Dataset.from_dict({
        "question": questions,
        "answer": answers,
        "contexts": contexts,
        "ground_truth": ground_truths,
    })
    
    # 运行评估
    result = evaluate(
        eval_dataset,
        metrics=[
            faithfulness,
            answer_relevancy,
            context_precision,
            context_recall,
        ],
    )
    
    print("RAGAS 评估结果：")
    print(f"  Faithfulness:      {result['faithfulness']:.4f}")
    print(f"  Answer Relevancy:  {result['answer_relevancy']:.4f}")
    print(f"  Context Precision: {result['context_precision']:.4f}")
    print(f"  Context Recall:    {result['context_recall']:.4f}")
    
    return dict(result)
```

### 12.3 手工检索评估

```python
import numpy as np
from typing import List, Dict


def evaluate_retrieval_metrics(
    queries: List[str],
    ground_truth_ids: List[List[str]],
    retrieved_ids: List[List[str]],
    k: int = 5,
) -> Dict[str, float]:
    """
    手工计算检索评估指标。
    
    Args:
        queries: 查询列表
        ground_truth_ids: 每个查询的真实相关文档 ID
        retrieved_ids: 每个查询的检索结果 ID
        k: 评估的 top-k
    
    Returns:
        {"Precision@k": ..., "Recall@k": ..., "MRR": ..., "Hit Rate": ...}
    """
    n = len(queries)
    precisions, recalls, mrrs = [], [], []
    hits = 0
    
    for gt, ret in zip(ground_truth_ids, retrieved_ids):
        gt_set = set(gt)
        ret_k = ret[:k]
        ret_set = set(ret_k)
        
        # Precision@k
        relevant_in_k = len(gt_set & ret_set)
        precisions.append(relevant_in_k / k if k > 0 else 0)
        
        # Recall@k
        recalls.append(
            relevant_in_k / len(gt_set) if gt_set else 0
        )
        
        # MRR: 第一个相关文档的排名倒数
        mrr = 0.0
        for rank, doc_id in enumerate(ret_k, start=1):
            if doc_id in gt_set:
                mrr = 1.0 / rank
                break
        mrrs.append(mrr)
        
        # Hit Rate
        if gt_set & ret_set:
            hits += 1
    
    results = {
        f"Precision@{k}": float(np.mean(precisions)),
        f"Recall@{k}": float(np.mean(recalls)),
        "MRR": float(np.mean(mrrs)),
        "Hit Rate": hits / n if n > 0 else 0,
    }
    
    for metric, value in results.items():
        print(f"  {metric}: {value:.4f}")
    
    return results
```

---

## 13. RAG vs Fine-tuning 对比辨析

这是大模型工程实践中最核心的技术选型问题之一。

| 对比维度 | RAG | Fine-tuning |
|---------|-----|-------------|
| 知识更新 | 实时（更新文档即生效） | 需要重新训练（小时~天） |
| 训练成本 | 无模型训练 | GPU 训练（LoRA: ~1h, 全量: ~1d+） |
| 推理成本 | 多一次检索（+100~500ms） | 与基座模型相同 |
| 知识容量 | 近乎无限（取决于存储） | 受限于训练数据量和模型容量 |
| 可解释性 | 高（可追溯来源文档） | 低（知识融入参数，不可追溯） |
| 幻觉控制 | 较好（有据可查、可约束） | 较难（仍会编造） |
| 领域深度 | 取决于检索质量 | 深度内化（输出更"专业"） |
| 数据隐私 | 数据不进入模型参数 | 数据融入模型权重 |
| 适用场景 | 知识库QA、客服、搜索增强 | 风格/格式、专业术语、推理增强 |

**决策指南**：

- **选 RAG**：当知识需要频繁更新、需要引用溯源、数据隐私敏感、或知识量巨大（超过模型微调能吃下的量）
- **选 Fine-tuning**：当需要特定输出风格/格式、深度领域推理能力、或减少推理延迟
- **两者结合**（最佳实践）：先用 SFT/LoRA 训练模型学会 RAG 格式（正确引用、不编造、结构化输出），再在推理时用 RAG 提供实时知识

---

## 14. 工程实践与常见坑

### 14.1 十大常见陷阱

**1. 忘记 Embedding 模型的 query 前缀**

bge 系列、E5 系列等模型要求为查询添加特定前缀。这是最常见的新手错误，会导致检索效果断崖式下降：

```python
# 错误！直接编码 query
query_emb = model.encode("什么是 RAG？")

# 正确：bge 需要加 "query: " 前缀
query_emb = model.encode("query: 什么是 RAG？")

# 文档编码不需要前缀（或加 "passage: "）
doc_emb = model.encode("RAG 是检索增强生成...")
```

**2. 未对 Embedding 做 L2 归一化**

如果向量未归一化而直接用内积作相似度度量，高范数向量会获得不公平的高分：

```python
# 错误：未归一化
emb = model.encode("文本")
similarity = np.dot(emb_a, emb_b)  # 受向量长度影响

# 正确：编码时归一化
emb = model.encode("文本", normalize_embeddings=True)
similarity = np.dot(emb_a, emb_b)  # 等价于余弦相似度
```

**3. Chunk 之间完全不重叠**

不设置 overlap 会导致关键信息恰好在切分点被截断，两个相邻 chunk 各持有一半信息。建议设置 10~20% 的 overlap。

**4. top_k 设置不当**

top_k 太小（如 1~2）可能漏掉相关文档；太大（如 50+）则引入大量噪声，且增加 LLM 的上下文成本。推荐：初步召回 top_k=15~30 → rerank 后保留 top_k=3~5。

**5. 忽略文档更新时的索引同步**

文档被修改或删除后，向量数据库中的旧 chunk 仍然存在。必须实现增量更新机制：更新文档时先删除该文档的所有旧 chunk，再插入新 chunk。

**6. 中文分词对 BM25 的影响**

BM25 依赖分词质量。如果用简单的字级分词，关键短语会被拆散。建议使用 jieba 分词（精确模式）：

```python
import jieba

# 差：按字分词
tokens = list("自然语言处理")  # ["自", "然", "语", "言", "处", "理"]

# 好：用 jieba
tokens = list(jieba.cut("自然语言处理", cut_all=False))  # ["自然语言", "处理"]
```

**7. 过度依赖 temperature=0**

temperature=0 虽然减少随机性，但可能导致模型在多个同等概率的 token 中选择次优选项。建议设置 temperature=0.1（几乎确定性但保留微小灵活性）。

**8. 不记录检索和生成的中间结果**

没有可观测性就无法调试。必须记录：查询 → 检索到的文档 → rerank 分数 → 完整的 LLM prompt → LLM 输出 → 用户反馈。

**9. 文档清洗不充分**

PDF 提取的文本通常包含页眉页脚、水印、奇怪的换行。不清洗直接索引会严重影响 Embedding 质量和检索效果。

**10. 将所有类型的查询都走 RAG**

有些查询不需要检索（如"1+1等于几"、"帮我写首诗"），强行检索反而引入噪声。应该加一个路由层，判断查询是否需要检索。

### 14.2 生产环境架构清单

一个生产级 RAG 系统需要包含以下关键组件：

- **接入层**：API Gateway（认证、限流、日志）
- **路由层**：意图识别（需要检索 / 直接回答 / 工具调用）
- **检索层**：混合检索 + 元数据过滤 + Reranker
- **生成层**：Prompt 模板 + LLM + 引用提取
- **缓存层**：语义缓存（相似查询复用结果）
- **索引层**：异步增量索引 pipeline + 文档变更监听
- **评估层**：在线指标监控 + 离线评测 + A/B 测试框架
- **安全层**：输入过滤（防 prompt 注入）+ 输出过滤（防敏感信息泄露）+ 文档权限控制

---

## 15. 前沿进展与趋势

### 15.1 长上下文 vs RAG

随着 LLM 上下文窗口不断增大（GPT-4o 128K, Gemini 1M+, Claude 200K），有观点认为可以直接将所有文档塞进上下文，RAG 将被淘汰。但实际情况是：

**RAG 仍不可替代的四个原因**：

1. **成本**：128K 上下文每次查询的 token 费用是 4K 的 32 倍。对于高并发服务不可承受
2. **Lost in the Middle**：实验表明 LLM 对超长上下文中间部分的信息关注度显著降低。在 100 页文档中找答案的准确率远低于只提供 5 段相关内容
3. **延迟**：处理 128K token 的首 token 延迟（TTFT）远高于 4K token
4. **规模**：企业知识库可能有数百万文档，总 token 数远超任何上下文窗口

**最可行的方案**：RAG 做粗筛（从百万文档中找出 top-k 相关文档），长上下文做精读（将 top-k 完整文档放入长上下文做深度分析）。二者是互补而非替代关系。

### 15.2 多模态 RAG

将 RAG 从纯文本扩展到图片、表格、音视频：

- **ColPali/ColQwen**：直接对 PDF 页面截图做 Embedding（无需 OCR），用视觉 Transformer 理解文档的布局和排版
- **图表理解**：将图表转换为结构化数据表或自然语言描述后再索引
- **音视频索引**：Whisper 转录音频为文字 + 视觉模型提取关键帧

### 15.3 Agentic RAG

将 RAG 与 Agent 结合，实现更智能的检索和推理：

- **路由式 RAG**：Agent 根据查询类型自动选择检索策略（向量搜索 / SQL 查询 / API 调用 / Web 搜索）
- **迭代式 RAG**：Agent 评估检索结果质量，不满意时自动改写查询重试
- **多步推理 RAG**：Agent 将复杂问题分解为子问题，逐步检索和推理

---

## 16. 面试题精选与解析

### Q1: RAG 的核心流程是什么？和直接用 LLM 有什么区别？

**答案要点**：RAG 在 LLM 生成之前增加了一个检索环节。标准流程：查询 → Embedding → 向量检索（可加 BM25 混合检索）→ 重排序 → 构建 Prompt（上下文 + 问题）→ LLM 生成 → 返回答案 + 来源引用。与直接用 LLM 的区别：一是知识可更新（改文档不改模型）；二是可溯源（回答可引用具体文档）；三是减少幻觉（有据可查）；四是知识容量近乎无限（不受模型参数限制）。

### Q2: 如何选择 chunk_size？太大太小分别有什么问题？

**答案要点**：chunk_size 过小 → 语义碎片化，单个 chunk 缺乏上下文（如「该方法时间复杂度 O(n)」脱离上下文不知指哪个方法），检索虽精确但信息量不足；过大 → 语义被稀释，一个 chunk 包含多主题导致 Embedding 不聚焦，且浪费 LLM 上下文窗口。最佳实践：根据 Embedding 模型上下文窗口和 LLM prompt 预算，通常 500~1500 字符，overlap 10~20%。关键技巧——检索用小块（精确匹配），生成用大块（Parent Document Retrieval），即检索命中小 chunk 后返回其所属的大 chunk 给 LLM。

### Q3: 向量检索和 BM25 各有什么优劣？为什么要混合检索？

**答案要点**：向量检索（Dense Retrieval）基于 Embedding 的余弦相似度做语义匹配，能理解同义词和语义等价表述（「快乐」匹配「开心」），但对精确关键词不敏感（搜「ERROR_CODE_1042」可能匹配不到）。BM25（Sparse Retrieval）基于词频和逆文档频率做精确关键词匹配，对专有名词、错误码、API 名敏感，但无法理解语义（搜「机器学习」匹配不到只写「ML」的文档）。混合检索结合两者：向量检索负责语义召回，BM25 负责精确召回，通过 RRF 或加权融合合并结果。实测 recall 通常比单路高 10~20%。

### Q4: 解释 HNSW 索引的原理和参数调优。

**答案要点**：HNSW 构建多层的可导航小世界图。底层包含全量节点，每层按概率保留部分节点作为「快速通道」。查询从最高层入口点开始，每层做贪心搜索，找到局部最近邻后下降到下一层，在底层得到最终结果。关键参数：M（每节点连接数，影响图密度和内存，推荐 16~64），efConstruction（构建时搜索宽度，越大图质量越高但构建越慢，推荐 100~200），efSearch（查询时搜索宽度，越大 recall 越高但越慢，推荐 50~200）。调优策略：先固定较大的 efConstruction 构建高质量索引，然后通过调 efSearch 在速度和 recall 之间取得平衡。复杂度：查询 O(log N)，构建 O(N log N)，内存 O(N * M)。

### Q5: 什么是 RAG 中的幻觉？如何减少？

**答案要点**：RAG 中的幻觉指 LLM 生成了检索上下文中不存在的信息——即回答「超出了参考资料的范围」。减少幻觉的方法：(1) Prompt 约束——明确指示「只基于参考资料回答，无法回答时说明」；(2) 要求引用——让 LLM 标注 [来源N]，有引用约束的回答幻觉率显著降低；(3) 提高检索质量——确保上下文确实包含答案，LLM 找不到答案才会编造；(4) 降低 temperature（如 0.1）减少随机性；(5) Self-RAG 自反思——让 LLM 生成后自检答案是否忠实于上下文；(6) 使用 RAGAS faithfulness 等指标量化监控。

### Q6: 如何评估 RAG 系统的质量？

**答案要点**：分两个维度。检索质量用 IR 指标：Recall@k（top-k 中找回多少相关文档）、Precision@k（top-k 中有多少是相关的）、MRR（第一个正确结果的排名）、NDCG@k（考虑排名位置的增益）。生成质量用 LLM-as-Judge 或人工评估：Faithfulness（忠实度，回答是否基于上下文）、Answer Relevancy（回答是否切题）、Context Relevancy（上下文是否相关）、Hallucination Rate（幻觉率）。推荐框架 RAGAS 提供自动化评估 pipeline。端到端评估关注业务指标：用户满意度、回答正确率、首次解决率。

### Q7: 什么是 HyDE？为什么能提升检索效果？

**答案要点**：HyDE（Hypothetical Document Embedding）是一种查询转换技术。流程：用户查询 → LLM 生成一段假想回答 → 用假想回答的 Embedding 去检索。原理：用户查询通常很短（5~20 字），Embedding 信息量有限，在向量空间中可能与真实答案文档距离较远；而假想回答是一段 200 字左右的描述性文本，语义表达更丰富，在向量空间中与真实文档更接近。代价：增加一次 LLM 调用（约 500ms + token 费用），但 recall 通常提升 10~20%，性价比高。

### Q8: RAG 和 Fine-tuning 怎么选？能否结合？

**答案要点**：RAG 适合：知识频繁更新、需要可溯源、数据隐私敏感（数据不入模型参数）、需要大量外部知识的场景。Fine-tuning 适合：需要深度内化领域知识和术语、需要特定输出格式/风格、提升模型推理能力的场景。两者可以结合：用 SFT 训练模型学会 RAG 格式（正确引用来源、不编造、遵循检索上下文），然后推理时用 RAG 提供实时知识。这种 RAG + Fine-tuning 的组合在企业级应用中很常见。

### Q9: 如何设计一个企业级知识库问答系统？

**答案要点**：分层架构设计。接入层：API Gateway 做认证、限流、负载均衡。检索层：混合检索（向量 + BM25）+ 元数据过滤（按部门/日期/文档类型）+ Reranker 重排序。生成层：带引用的 Prompt 模板 + temperature 0.1 + 防幻觉约束。工程要素：增量索引 pipeline（文档变更自动触发重索引）、语义缓存（相似查询复用结果，降成本）、权限控制（文档级 ACL，用户只能搜到有权限的文档）、可观测性（全链路日志 + 检索/生成质量看板）、降级策略（检索失败降级为纯 LLM + 标注「未经资料验证」）。安全方面：Prompt 注入防护、敏感信息脱敏、输出内容审核。

### Q10: 长上下文 LLM（128K/1M）会取代 RAG 吗？

**答案要点**：短期内不会，RAG 仍有四个不可替代的优势。(1) 成本——128K 上下文每次查询的 token 费用是 4K 的 32 倍，百万文档全塞上下文经济上不可行。(2) 准确性——Lost in the Middle 效应导致超长上下文中间部分信息容易被忽略（实验显示模型更关注开头和结尾的信息）。(3) 延迟——处理 128K token 的推理延迟远高于 4K token（Transformer 自注意力 O(n^2)）。(4) 规模——企业知识库可能有数百万文档/数十亿 token，远超任何上下文窗口。更合理的方案是结合使用：RAG 做粗筛（从百万文档中召回 top-k），长上下文做精读（将 top-k 完整文档放入上下文深度分析）。

---

## 17. 易错点与最佳实践总结

### 17.1 常见陷阱

**陷阱 1：忘记给 Embedding 模型加查询前缀**

部分 Embedding 模型（如 bge 系列、E5 系列）在训练时区分了 query 和 passage 两种输入类型，需要为查询文本添加 "query: " 前缀。忘记加前缀会导致检索效果大幅下降（实测 Recall 可能降低 20~30%）：

```python
# 错误：query 和 document 用相同方式编码
query_emb = model.encode("什么是 RAG？")

# 正确：bge 系列需要为 query 加前缀
query_emb = model.encode("query: 什么是 RAG？")
doc_emb = model.encode("RAG 是检索增强生成...")  # passage 可不加前缀
```

**陷阱 2：Embedding 未归一化导致相似度计算错误**

余弦相似度要求向量 L2 归一化。如果向量未归一化而直接用内积（dot product）作为相似度，高范数的向量会获得不公平的高分数：

```python
# 错误：未归一化直接算内积
score = np.dot(query_emb, doc_emb)  # 结果受向量范数影响

# 正确方式 1：手动归一化
q_norm = query_emb / np.linalg.norm(query_emb)
d_norm = doc_emb / np.linalg.norm(doc_emb)
score = np.dot(q_norm, d_norm)  # 余弦相似度

# 正确方式 2：编码时直接归一化（推荐）
emb = model.encode(text, normalize_embeddings=True)
```

**陷阱 3：Chunk 重叠不足导致信息断裂**

完全不重叠（overlap=0）的 chunk 可能恰好在关键句子或段落中间截断，导致两个 chunk 都缺乏完整信息。设置 10~20% 的 overlap 可以有效缓解这个问题，代价仅是少量的索引存储增加。

**陷阱 4：文档更新后未同步更新索引**

文档内容更新后，向量数据库中的旧 chunk 仍然存在，导致检索到过时甚至错误的信息。必须实现增量更新机制：文档更新时先删除对应的旧 chunk，再插入新 chunk。

**陷阱 5：检索数量（top_k）设置不当**

top_k 太小（如 1~2）→ 高概率漏掉相关文档；太大（如 50~100）→ 引入大量噪声，浪费 LLM 上下文窗口，增加成本和延迟。建议：初步召回 top_k=20~50，经 Reranker 精排后保留 top_k=3~5。

**陷阱 6：Prompt 未明确约束导致幻觉**

如果 Prompt 中没有明确要求「只基于参考资料回答」，LLM 会自由发挥，可能生成大量不在上下文中的内容。务必在 System Prompt 中设置严格的行为约束。

### 17.2 最佳实践清单

生产级 RAG 系统的建设清单：

**检索优化**：先用 BM25 + 向量的混合检索建立 baseline，再逐步优化；必须使用 Reranker（Cross-Encoder），这是提升精度性价比最高的手段；考虑 HyDE 或 Multi-Query 做查询扩展；为不同文档类型定制分块策略（代码用语法树，文档用标题，对话用轮次）。

**Embedding 选型**：在目标语言和领域上实测，不能只看 MTEB 通用榜单；注意是否需要加查询前缀；务必归一化向量。

**生成优化**：Prompt 明确约束引用来源 + 不编造 + 信息不足时说明；temperature 建议 0.1（降低随机性）；上下文按相关度排序（最相关的放前面）。

**评估与监控**：建立评估数据集（至少 50~100 条标注的 query-answer 对）；用 RAGAS 或自建评估 pipeline 定期回归测试；记录全链路日志（query → 检索结果 → rerank 分数 → LLM IO → 用户反馈）；定期回顾 bad case，持续优化。

**工程保障**：增量索引 + 内容去重；语义缓存降低成本（相似查询直接返回缓存结果）；权限控制（文档级 ACL）；降级策略（检索/LLM 异常时的兜底方案）。

---

## 参考资料

- Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", NeurIPS 2020
- Gao et al., "Retrieval-Augmented Generation for Large Language Models: A Survey", 2024
- Microsoft GraphRAG: https://github.com/microsoft/graphrag
- RAGAS 评估框架: https://github.com/explodinggradients/ragas
- LangChain RAG: https://python.langchain.com/docs/use_cases/question_answering/
- LlamaIndex: https://docs.llamaindex.ai/
- Anthropic Contextual Retrieval: https://www.anthropic.com/news/contextual-retrieval
- MTEB Leaderboard: https://huggingface.co/spaces/mteb/leaderboard
- Pinecone RAG Guide: https://www.pinecone.io/learn/retrieval-augmented-generation/
- ChromaDB: https://docs.trychroma.com/
