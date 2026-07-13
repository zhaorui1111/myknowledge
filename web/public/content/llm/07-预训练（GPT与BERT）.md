# 预训练（GPT 与 BERT）详解

> **关键词**：预训练（Pre-training）、自回归（Autoregressive）、自编码（Autoencoding）、GPT（Generative Pre-trained Transformer）、BERT（Bidirectional Encoder Representations from Transformers）、语言建模（Language Modeling）、掩码语言模型（Masked Language Model, MLM）、下一句预测（Next Sentence Prediction, NSP）、因果语言模型（Causal Language Model, CLM）
>
> **前置知识**：[04-Transformer架构详解](./04-Transformer架构详解.md)、[06-Tokenizer与BPE](./06-Tokenizer与BPE.md)、[01-神经网络与反向传播基础](./01-神经网络与反向传播基础.md)
>
> **代码环境**：Python 3.10+、PyTorch 2.x、transformers 4.x、datasets

---

## 目录

1. [什么是预训练](#1-什么是预训练)
2. [为什么预训练如此重要](#2-为什么预训练如此重要)
3. [预训练范式的演进历程](#3-预训练范式的演进历程)
4. [语言模型基础：自回归与自编码](#4-语言模型基础自回归与自编码)
5. [GPT 系列详解](#5-gpt-系列详解)
6. [BERT 详解](#6-bert-详解)
7. [GPT vs BERT：两种范式的深度对比](#7-gpt-vs-bert两种范式的深度对比)
8. [预训练的数据工程](#8-预训练的数据工程)
9. [预训练的训练策略](#9-预训练的训练策略)
10. [从零实现 GPT 预训练](#10-从零实现-gpt-预训练)
11. [从零实现 BERT 预训练](#11-从零实现-bert-预训练)
12. [使用 Hugging Face 加载与使用预训练模型](#12-使用-hugging-face-加载与使用预训练模型)
13. [预训练的规模定律（Scaling Laws）](#13-预训练的规模定律scaling-laws)
14. [后 GPT/BERT 时代的预训练模型](#14-后-gptbert-时代的预训练模型)
15. [预训练的工程实践](#15-预训练的工程实践)
16. [常见坑与最佳实践](#16-常见坑与最佳实践)
17. [复杂度分析](#17-复杂度分析)
18. [面试题精选与解析](#18-面试题精选与解析)
19. [参考资料](#19-参考资料)

---

## 1. 什么是预训练

### 1.1 定义

预训练（Pre-training）是指在大规模无标注文本语料上，通过自监督学习（Self-supervised Learning）任务训练模型，使其学会语言的通用表示。预训练模型随后可以通过微调（Fine-tuning）或提示（Prompting）适配各种下游任务。

形式化地说，给定一个大规模文本语料库 D = {x_1, x_2, ..., x_N}，预训练的目标是学习一个参数化模型 f_θ，使其最大化某个自监督目标函数：

```
θ* = argmax_θ Σ_{x∈D} L(x; θ)
```

其中 L 的具体形式取决于预训练策略（自回归或自编码）。

### 1.2 "预"字的含义

"预"（Pre-）强调这是在"正式任务"之前的训练阶段。类比人类学习：

- **预训练** ≈ 通识教育：在大量文本中学习语言的词法、句法、语义、常识、推理模式
- **微调** ≈ 专业培训：针对特定任务（如情感分析、问答、翻译）进行少量有监督训练
- **提示** ≈ 考试出题：通过精心设计的指令引导模型输出正确答案

### 1.3 预训练的核心假设

预训练基于一个深刻的假设——语言本身蕴含着大量的世界知识，而这些知识可以通过预测文本中的缺失部分来习得。这一假设有两个理论支撑：

**分布假设（Distributional Hypothesis）**：词的含义由其上下文决定。正如 J.R. Firth 在 1957 年所言："You shall know a word by the company it keeps."

**压缩即理解（Compression is Comprehension）**：能够高效压缩（预测）文本的模型，必然对文本中蕴含的知识有深刻理解。这一观点与 Hutter Prize（通过压缩维基百科来衡量智能）的理念一致。

---

## 2. 为什么预训练如此重要

### 2.1 标注数据的瓶颈

在深度学习时代之前，NLP 系统严重依赖人工标注数据。标注成本高昂、领域迁移困难：

| 任务 | 典型标注成本 | 标注数据规模 |
|------|-------------|-------------|
| 情感分析 | 每条 0.5-2 元 | 数万条 |
| 命名实体识别 | 每条 5-20 元 | 数千至万条 |
| 机器翻译 | 每句 5-30 元 | 数百万平行句对 |
| 阅读理解 | 每题 20-100 元 | 数万题 |

而互联网上有数万亿 token 的无标注文本可以免费获取。预训练正是利用了这一免费资源。

### 2.2 迁移学习的威力

预训练的核心价值在于迁移学习（Transfer Learning）：在大语料上学到的语言知识可以迁移到各种下游任务。实验表明：

- BERT-base（1.1 亿参数）在 11 项 NLP 任务上超越了所有之前需要大量任务特定设计的模型
- GPT-3（1750 亿参数）仅通过少样本提示就能完成翻译、推理、代码生成等数百种任务
- 预训练+微调范式通常只需原任务 1%-10% 的标注数据即可达到甚至超越之前的 SOTA

### 2.3 涌现能力

当预训练模型规模足够大（通常 >10B 参数）时，会涌现出训练目标中并未显式优化的能力：

- **链式推理**（Chain-of-thought）：模型学会了逐步推导复杂问题
- **代码理解与生成**：即使主要训练在自然语言上，也能理解和编写代码
- **多语言迁移**：在一种语言上学到的知识可以跨语言应用
- **世界模型**：对物理世界、社会规范、因果关系的隐式建模

这些涌现能力被认为是预训练通过大规模语言建模"理解"了语言和世界结构的证据。

### 2.4 预训练的经济学

从经济角度看，预训练解决了 NLP 领域的一个根本矛盾：

- **供给侧**：高质量模型需要大量计算和数据
- **需求侧**：绝大多数用户/团队无法承担从头训练的成本

预训练模型的共享（如 Hugging Face Model Hub）使得"训练一次，到处微调"成为可能，极大地降低了 AI 应用的门槛。

---

## 3. 预训练范式的演进历程

### 3.1 时间线

```
2013  Word2Vec / GloVe — 静态词向量，第一次大规模预训练
  |
2015  语言模型作为特征提取器的早期探索（Semi-supervised Sequence Learning）
  |
2018.02  ELMo — 上下文相关的动态词向量（双向 LSTM）
  |
2018.06  GPT-1 — 第一个基于 Transformer decoder 的预训练模型
  |
2018.10  BERT — 双向 Transformer encoder，刷新 11 项任务 SOTA
  |
2019.02  GPT-2 — 15 亿参数，zero-shot 能力初现
  |
2019-2020  RoBERTa / ALBERT / ELECTRA / T5 / XLNet — BERT 变体大爆发
  |
2020.05  GPT-3 — 1750 亿参数，few-shot 成为新范式
  |
2022  Chinchilla / PaLM — 规模定律的深入理解
  |
2023-2024  LLaMA / Mistral / GPT-4 — 开源生态与闭源能力的双重发展
```

### 3.2 三代预训练范式

| 代际 | 代表 | 预训练方式 | 使用方式 | 数据规模 |
|------|------|-----------|---------|---------|
| 第一代 | Word2Vec, GloVe | 词级共现统计 | 作为固定 embedding | 数十亿词 |
| 第二代 | ELMo, GPT-1, BERT | 序列级语言模型 | 微调（Fine-tune） | 数十亿词 |
| 第三代 | GPT-3, PaLM, LLaMA | 超大规模 CLM | 提示（Prompt） | 数万亿 token |

### 3.3 从 Feature-based 到 Fine-tuning 到 Prompting

**Feature-based（ELMo 时代）**：预训练模型输出作为固定特征向量，喂给下游任务特定模型。优点是灵活，缺点是无法利用预训练模型的深层知识。

**Fine-tuning（BERT/GPT-1 时代）**：预训练模型所有参数参与下游任务训练，端到端优化。优点是效果好，缺点是每个任务需要一份完整模型副本。

**Prompting（GPT-3+ 时代）**：不修改模型参数，通过设计输入格式引导模型输出。优点是零/少样本即可工作，缺点是对 prompt 设计敏感、模型需要足够大。

---

## 4. 语言模型基础：自回归与自编码

### 4.1 自回归语言模型（Autoregressive LM）

自回归语言模型将文本的联合概率分解为条件概率的乘积（链式法则）：

```
P(x_1, x_2, ..., x_T) = ∏_{t=1}^{T} P(x_t | x_1, x_2, ..., x_{t-1})
```

训练目标是最大化对数似然：

```
L_CLM = Σ_{t=1}^{T} log P(x_t | x_{<t}; θ)
```

**核心特点**：

1. **单向性**：每个位置只能看到左侧上下文（通过因果注意力掩码实现）
2. **生成友好**：天然支持从左到右逐 token 生成
3. **训练信号密集**：每个 token 都参与 loss 计算（100% 利用率）
4. **代表模型**：GPT 系列、LLaMA、PaLM 等

**因果注意力掩码**（Causal Attention Mask）：

```
Mask[i][j] = 0       if j <= i  （允许注意）
           = -inf    if j > i   （禁止注意未来位置）
```

可视化（4 个位置的例子）：
```
     pos1  pos2  pos3  pos4
pos1  ✓     ✗     ✗     ✗
pos2  ✓     ✓     ✗     ✗
pos3  ✓     ✓     ✓     ✗
pos4  ✓     ✓     ✓     ✓
```

### 4.2 自编码语言模型（Autoencoding LM）

自编码语言模型不按顺序预测，而是从被破坏的输入中恢复原始文本：

```
L_MLM = Σ_{i∈M} log P(x_i | x_{\M}; θ)
```

其中 M 是被 mask 的位置集合，x_{\M} 是未被 mask 的上下文。

**核心特点**：

1. **双向性**：每个位置能同时看到左右两侧上下文
2. **理解友好**：双向注意力使模型对每个 token 有更完整的表示
3. **训练信号稀疏**：只有被 mask 的 15% token 参与 loss 计算
4. **不适合生成**：因为训练时见过所有位置的上下文，无法自然地逐步生成
5. **代表模型**：BERT、RoBERTa、ELECTRA 等

### 4.3 两种范式的信息论视角

从信息论角度看两种预训练目标的本质差异：

**自回归 = 联合概率建模 = 无损压缩**：自回归模型建模的是文本的完整联合分布 P(X)。根据 Shannon 编码定理，最优压缩码长等于 -log P(x)，因此训练目标等价于最小化压缩后的码长。交叉熵 loss 的下界就是文本的熵（不可约损失）。

**自编码 = 条件概率建模 = 去噪/修复**：自编码模型建模的是条件分布 P(X_masked | X_visible)。这等价于学习一个去噪器：给定噪声输入（mask），恢复原始信号。

**效率对比**：自回归模型对每个 token 都计算 loss，训练信号密度为 100%；MLM 只对 15% 的 mask 位置计算 loss。但自编码模型每次前向传播对所有位置都有双向注意力，信息利用更充分。

### 4.4 其他预训练范式

除了纯自回归和纯自编码，还有多种混合范式：

| 范式 | 代表 | 核心思想 | 优势 |
|------|------|---------|------|
| Prefix LM | UniLM, GLM | 前缀部分双向注意力，生成部分因果注意力 | 兼顾理解与生成 |
| Permutation LM | XLNet | 对所有排列做自回归，间接获得双向信息 | 无 mask 的双向建模 |
| Seq2Seq | T5, BART | Encoder 双向 + Decoder 自回归 | 统一的文本到文本框架 |
| Replace Token Detection | ELECTRA | 判断每个 token 是否被生成器替换 | 100% token 参与训练 |
| Denoising | BART, UL2 | 多种噪声策略（mask/delete/shuffle）的去噪 | 更丰富的预训练信号 |

---

## 5. GPT 系列详解

### 5.1 GPT-1：证明预训练+微调的可行性

#### 5.1.1 论文信息

- **论文**：*Improving Language Understanding by Generative Pre-Training*（Radford et al., 2018）
- **机构**：OpenAI
- **核心贡献**：首次将 Transformer decoder 用于大规模语言模型预训练，并证明"预训练+微调"范式在多种 NLP 任务上的有效性

#### 5.1.2 模型架构

GPT-1 使用 12 层 Transformer decoder（仅 decoder，无 cross-attention）：

| 超参数 | 值 |
|--------|-----|
| 层数（L） | 12 |
| 隐藏维度（d_model） | 768 |
| 注意力头数（h） | 12 |
| 每头维度（d_head） | 64 |
| FFN 维度 | 3072（4 × 768） |
| 最大序列长度 | 512 |
| 总参数量 | ~117M |
| 词汇表大小 | 40,000（BPE） |
| 位置编码 | 可学习绝对位置编码 |
| 激活函数 | GELU |
| LayerNorm | Post-Norm |

#### 5.1.3 预训练目标

标准的因果语言模型目标：

```
L_GPT1 = -Σ_{i=1}^{T} log P(u_i | u_1, ..., u_{i-1}; Θ)
```

其中 (u_1, ..., u_T) 是一段连续文本的 token 序列。模型通过 softmax 输出下一个 token 的概率分布。

#### 5.1.4 预训练数据

- **BooksCorpus**：约 7000 本未出版书籍，约 8 亿词
- 选择书籍数据的理由：（1）句子连贯性好，包含长距离依赖；（2）语言质量较高，错别字和噪声少；（3）主题多样，涵盖小说、科普等多种类型

#### 5.1.5 微调策略

GPT-1 的创新微调方式——将所有下游任务统一转化为序列格式：

```
分类任务：   [Start] text [Extract]         → [Extract] 位置的隐藏状态做分类
文本蕴含：   [Start] premise [Delim] hypothesis [Extract]  → 三分类
语义相似度： 双方向拼接后分别编码再合并
多项选择：   对每个选项独立编码后评分
```

微调损失函数结合了任务损失和语言模型辅助损失：

```
L_total = L_task + λ · L_LM    (λ = 0.5)
```

辅助 LM 损失的作用：（1）防止灾难性遗忘；（2）提供正则化效果；（3）加速收敛。

#### 5.1.6 GPT-1 的成绩

在 12 个任务中的 9 个达到 SOTA，证明了预训练+微调范式的有效性。但仍然需要为每个任务单独微调。

### 5.2 GPT-2：零样本能力的初步展示

#### 5.2.1 核心理念

**论文标题**：*Language Models are Unsupervised Multitask Learners*

核心主张：一个足够强大的语言模型不需要微调就能完成各种任务。任务信息可以通过自然语言"指令"嵌入到输入中。

这个理念在当时非常超前——大多数人认为每个任务都需要专门训练。GPT-2 初步证明了"涌现"的可能性。

#### 5.2.2 模型规模升级

| 维度 | GPT-1 | GPT-2 (最大) |
|------|-------|-------------|
| 参数量 | 117M | 1.5B (约 13 倍) |
| 层数 | 12 | 48 |
| 隐藏维度 | 768 | 1600 |
| 注意力头数 | 12 | 25 |
| 上下文长度 | 512 | 1024 |
| 训练数据 | 8 亿词 | ~100 亿词 |

GPT-2 实际有 4 个版本：Small (117M), Medium (345M), Large (762M), XL (1.5B)。

#### 5.2.3 关键架构改进

GPT-2 引入了几个后来成为标准的改动：

**1. Pre-Norm（前置归一化）**

```
GPT-1 (Post-Norm):
  x → MultiHeadAttention → Add(x, ·) → LayerNorm → FFN → Add(·, ·) → LayerNorm

GPT-2 (Pre-Norm):
  x → LayerNorm → MultiHeadAttention → Add(x, ·) → LayerNorm → FFN → Add(·, ·)
```

Pre-Norm 的优势：梯度在残差路径上直接流通，不被 LayerNorm 阻断。这使得深层网络（48 层）的训练更稳定。

**2. 最终 LayerNorm**：在最后一个 Transformer block 之后、logits 投影之前额外添加一个 LayerNorm，进一步稳定输出分布。

**3. 残差路径缩放初始化**：残差连接中的投影矩阵（c_proj）初始化时权重缩小为 1/√(2N)，其中 N 为层数。目的是防止残差累积导致激活值随深度增长。

**4. Byte-Level BPE**：词汇表扩大到 50,257，基于 UTF-8 字节序列做 BPE，理论上可以编码任何 Unicode 文本，无需 [UNK] token。

#### 5.2.4 WebText 数据集

GPT-2 自建了高质量训练数据集 WebText：

- **来源**：Reddit 上被投票（karma >= 3）的外链 URL 对应的网页
- **规模**：约 800 万文档，40GB 文本（~100 亿 token）
- **质量控制**：社区投票机制自然过滤低质量内容
- **去重**：移除了与常见评测数据集的重叠内容
- **未公开**：为防止滥用，WebText 数据集未正式发布；后来社区复现了 OpenWebText

#### 5.2.5 零样本任务完成

GPT-2 无需微调，仅通过合适的输入格式就能完成多种任务：

```python
# 翻译（zero-shot）
"Translate English to French: cheese =>"

# 摘要（zero-shot）
article_text + "\nTL;DR:"

# 阅读理解（zero-shot）
passage + "\nQ: " + question + "\nA:"
```

性能虽不如专门微调的模型，但展示了可能性——模型在预训练中隐式学会了多种任务的执行模式。

### 5.3 GPT-3：规模带来质变

#### 5.3.1 核心发现

**论文标题**：*Language Models are Few-Shot Learners*

GPT-3 的核心发现：当模型规模达到 1750 亿参数时，仅通过输入中提供少量示例（few-shot prompting），就能在众多任务上接近甚至超越专门微调的小模型。这一发现开创了 In-Context Learning 的新范式。

#### 5.3.2 模型规模

GPT-3 训练了 8 种不同规模的模型，验证了 Scaling Laws：

| 版本 | 参数量 | 层数 | d_model | 注意力头 | 上下文长度 |
|------|--------|------|---------|---------|-----------|
| GPT-3 Small | 125M | 12 | 768 | 12 | 2048 |
| GPT-3 Medium | 350M | 24 | 1024 | 16 | 2048 |
| GPT-3 Large | 760M | 24 | 1536 | 16 | 2048 |
| GPT-3 XL | 1.3B | 24 | 2048 | 24 | 2048 |
| GPT-3 2.7B | 2.7B | 32 | 2560 | 32 | 2048 |
| GPT-3 6.7B | 6.7B | 32 | 4096 | 32 | 2048 |
| GPT-3 13B | 13B | 40 | 5140 | 40 | 2048 |
| **GPT-3 175B** | **175B** | **96** | **12288** | **96** | **2048** |

#### 5.3.3 训练数据

| 数据集 | Token 量 | 采样权重 | 训练 epochs |
|--------|----------|---------|------------|
| Common Crawl（清洗后） | 410B | 60% | 0.44 |
| WebText2 | 19B | 22% | 2.9 |
| Books1 | 12B | 8% | 1.9 |
| Books2 | 55B | 8% | 0.43 |
| Wikipedia | 3B | 3% | 3.4 |

训练总计消耗约 300B token（一些高质量数据集被多次遍历）。

#### 5.3.4 In-Context Learning（上下文学习）

GPT-3 定义了三种使用模式（不更新参数）：

**Zero-shot**：只给任务描述，不给示例。

```
Translate English to French:
cheese =>
```

**One-shot**：给一个示例。

```
Translate English to French:
sea otter => loutre de mer
cheese =>
```

**Few-shot**：给多个示例（受限于上下文窗口大小，通常 10-100 个）。

```
Translate English to French:
sea otter => loutre de mer
peppermint => menthe poivrée
plush giraffe => girafe en peluche
cheese =>
```

**为什么 In-Context Learning 有效？** 这是一个活跃的研究话题，主流解释包括：

1. **隐式贝叶斯推断**（Xie et al., 2021）：预训练数据可以看作由不同"概念"（任务）生成的混合分布。In-context 示例帮助模型做后验推断，定位到正确的概念。

2. **梯度下降的隐式实现**（Akyürek et al., 2022; Von Oswald et al., 2023）：Transformer 的前向传播过程可以被证明等价于对示例做隐式梯度下降。注意力机制充当了"软"的参数更新器。

3. **模式匹配与复制**：预训练中见过大量"输入-输出"对的格式（如翻译对、问答对），few-shot 示例激活了对应的生成模式。

#### 5.3.5 GPT-3 的局限与后续发展

**事实性问题**：GPT-3 会自信地生成不正确的信息（"幻觉"），因为语言模型的目标是生成流畅文本而非事实正确的文本。

**对齐问题**：模型可能生成有害、偏见、不符合人类意图的内容。这直接催生了 InstructGPT（2022）——通过 RLHF 对齐模型行为与人类偏好。

**推理能力有限**：对需要多步推理的任务（数学、逻辑），即使 175B 参数也常出错。后续通过 Chain-of-Thought prompting 和更大规模模型（GPT-4）部分解决。

### 5.4 GPT 核心代码实现

```python
"""
GPT 模型核心实现（GPT-2 风格，Pre-Norm + GELU）
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math
from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass
class GPTConfig:
    """GPT 模型超参数配置"""
    vocab_size: int = 50257       # BPE 词汇表大小
    max_seq_len: int = 1024       # 最大上下文长度
    n_layers: int = 12            # Transformer 层数
    n_heads: int = 12             # 注意力头数
    d_model: int = 768            # 隐藏维度
    d_ff: int = 3072              # FFN 中间维度（通常 4*d_model）
    dropout: float = 0.1          # Dropout 概率
    bias: bool = True             # 线性层是否使用 bias

    @property
    def d_head(self) -> int:
        """每个注意力头的维度"""
        assert self.d_model % self.n_heads == 0, "d_model 必须被 n_heads 整除"
        return self.d_model // self.n_heads


class CausalSelfAttention(nn.Module):
    """
    带因果掩码的多头自注意力。
    
    核心思想：每个 token 只能注意到它自己和它左边的 token，
    通过一个下三角掩码矩阵实现。
    """

    def __init__(self, config: GPTConfig):
        super().__init__()
        self.n_heads = config.n_heads
        self.d_head = config.d_head
        self.d_model = config.d_model

        # Q, K, V 合并为一个线性层（减少 kernel launch 开销）
        self.c_attn = nn.Linear(config.d_model, 3 * config.d_model, bias=config.bias)
        # 输出投影
        self.c_proj = nn.Linear(config.d_model, config.d_model, bias=config.bias)

        self.attn_dropout = nn.Dropout(config.dropout)
        self.resid_dropout = nn.Dropout(config.dropout)

        # 注册因果掩码（下三角矩阵），不作为模型参数
        self.register_buffer(
            "causal_mask",
            torch.tril(torch.ones(config.max_seq_len, config.max_seq_len))
                 .view(1, 1, config.max_seq_len, config.max_seq_len)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch_size, seq_len, d_model) — 输入隐藏状态
        Returns:
            (batch_size, seq_len, d_model) — 注意力输出
        """
        B, T, C = x.size()

        # 计算 Q, K, V（三合一投影后拆分）
        qkv = self.c_attn(x)  # (B, T, 3*C)
        q, k, v = qkv.split(self.d_model, dim=2)

        # 重塑为多头形式: (B, n_heads, T, d_head)
        q = q.view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        k = k.view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        v = v.view(B, T, self.n_heads, self.d_head).transpose(1, 2)

        # 缩放点积注意力
        scale = 1.0 / math.sqrt(self.d_head)
        attn_scores = (q @ k.transpose(-2, -1)) * scale  # (B, n_heads, T, T)

        # 应用因果掩码：将未来位置设为 -inf（softmax 后趋近于 0）
        attn_scores = attn_scores.masked_fill(
            self.causal_mask[:, :, :T, :T] == 0, float("-inf")
        )

        attn_weights = F.softmax(attn_scores, dim=-1)
        attn_weights = self.attn_dropout(attn_weights)

        # 加权聚合 value
        out = attn_weights @ v  # (B, n_heads, T, d_head)
        # 合并多头
        out = out.transpose(1, 2).contiguous().view(B, T, C)

        # 输出投影 + 残差 dropout
        out = self.c_proj(out)
        out = self.resid_dropout(out)
        return out


class MLP(nn.Module):
    """
    前馈网络（Feed-Forward Network）。
    使用 GELU 激活函数，GPT 的标配。
    
    结构: Linear(d_model → d_ff) → GELU → Linear(d_ff → d_model) → Dropout
    """

    def __init__(self, config: GPTConfig):
        super().__init__()
        self.c_fc = nn.Linear(config.d_model, config.d_ff, bias=config.bias)
        self.c_proj = nn.Linear(config.d_ff, config.d_model, bias=config.bias)
        self.act = nn.GELU()
        self.dropout = nn.Dropout(config.dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.c_fc(x)       # 升维: d_model → d_ff
        x = self.act(x)        # GELU 非线性
        x = self.c_proj(x)     # 降维: d_ff → d_model
        x = self.dropout(x)
        return x


class TransformerBlock(nn.Module):
    """
    GPT-2 风格的 Transformer Block（Pre-Norm 变体）。
    
    Pre-Norm: LayerNorm 在子层之前，而非之后。
    这使得残差路径上没有 LayerNorm，梯度可以直接流过，
    有利于深层网络的训练稳定性。
    """

    def __init__(self, config: GPTConfig):
        super().__init__()
        self.ln_1 = nn.LayerNorm(config.d_model)
        self.attn = CausalSelfAttention(config)
        self.ln_2 = nn.LayerNorm(config.d_model)
        self.mlp = MLP(config)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Attention 子层（Pre-Norm + 残差连接）
        x = x + self.attn(self.ln_1(x))
        # FFN 子层（Pre-Norm + 残差连接）
        x = x + self.mlp(self.ln_2(x))
        return x


class GPT(nn.Module):
    """
    完整 GPT 语言模型。
    
    组成：Token Embedding + Position Embedding + N × TransformerBlock + LM Head
    """

    def __init__(self, config: GPTConfig):
        super().__init__()
        self.config = config

        self.transformer = nn.ModuleDict(dict(
            # Token Embedding: vocab_size → d_model
            wte=nn.Embedding(config.vocab_size, config.d_model),
            # Position Embedding: max_seq_len → d_model
            wpe=nn.Embedding(config.max_seq_len, config.d_model),
            # Embedding Dropout
            drop=nn.Dropout(config.dropout),
            # N 层 Transformer Block
            h=nn.ModuleList([TransformerBlock(config) for _ in range(config.n_layers)]),
            # 最终 LayerNorm（GPT-2 新增）
            ln_f=nn.LayerNorm(config.d_model),
        ))

        # Language Model Head: d_model → vocab_size
        self.lm_head = nn.Linear(config.d_model, config.vocab_size, bias=False)

        # Weight Tying: LM Head 与 Token Embedding 共享权重
        # 这样做的理由：token 的 embedding 表示和预测该 token 的 logit 应该在同一语义空间
        self.transformer.wte.weight = self.lm_head.weight

        # 参数初始化
        self.apply(self._init_weights)
        # 残差路径缩放：越深的层残差贡献越小
        for pn, p in self.named_parameters():
            if pn.endswith("c_proj.weight"):
                torch.nn.init.normal_(
                    p, mean=0.0, std=0.02 / math.sqrt(2 * config.n_layers)
                )

        n_params = sum(p.numel() for p in self.parameters())
        print(f"GPT model initialized: {n_params/1e6:.1f}M parameters")

    def _init_weights(self, module: nn.Module):
        """标准初始化：正态分布 N(0, 0.02)"""
        if isinstance(module, nn.Linear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(
        self,
        input_ids: torch.Tensor,                    # (B, T)
        targets: Optional[torch.Tensor] = None,     # (B, T)
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        """
        前向传播。
        
        Args:
            input_ids: token ID 序列, shape (batch_size, seq_len)
            targets: 目标 token ID（右移一位），用于计算 loss
            
        Returns:
            logits: (B, T, vocab_size)
            loss: 标量，如果提供了 targets
        """
        B, T = input_ids.size()
        assert T <= self.config.max_seq_len, \
            f"序列长度 {T} 超过最大限制 {self.config.max_seq_len}"

        # 1. Embedding: Token + Position
        pos = torch.arange(0, T, dtype=torch.long, device=input_ids.device)  # (T,)
        tok_emb = self.transformer.wte(input_ids)   # (B, T, d_model)
        pos_emb = self.transformer.wpe(pos)         # (T, d_model)，广播到 batch
        x = self.transformer.drop(tok_emb + pos_emb)

        # 2. N 层 Transformer Block
        for block in self.transformer.h:
            x = block(x)

        # 3. 最终 LayerNorm
        x = self.transformer.ln_f(x)

        # 4. LM Head: 投影到词汇表维度
        logits = self.lm_head(x)  # (B, T, vocab_size)

        # 5. 计算损失（如果提供了目标）
        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),    # (B*T, vocab_size)
                targets.view(-1),                     # (B*T,)
                ignore_index=-1,                      # -1 表示忽略（padding）
            )

        return logits, loss

    @torch.no_grad()
    def generate(
        self,
        input_ids: torch.Tensor,
        max_new_tokens: int = 100,
        temperature: float = 1.0,
        top_k: Optional[int] = None,
        top_p: Optional[float] = None,
    ) -> torch.Tensor:
        """
        自回归生成：逐 token 采样。
        
        Args:
            input_ids: 初始 prompt 的 token IDs, (1, prompt_len)
            max_new_tokens: 最多生成多少个新 token
            temperature: 采样温度（>1 更随机，<1 更确定）
            top_k: 只从概率最高的 k 个 token 中采样
            top_p: Nucleus sampling，从累积概率 >= p 的最小集合中采样
        """
        self.eval()
        for _ in range(max_new_tokens):
            # 截断到最大上下文长度
            idx_cond = input_ids if input_ids.size(1) <= self.config.max_seq_len \
                       else input_ids[:, -self.config.max_seq_len:]

            # 前向传播获取 logits
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :]  # 只取最后一个位置 (B, vocab_size)

            # 温度缩放
            logits = logits / temperature

            # Top-k 过滤
            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = float("-inf")

            # Top-p (Nucleus) 过滤
            if top_p is not None:
                sorted_logits, sorted_indices = torch.sort(logits, descending=True)
                cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
                # 移除累积概率超过 top_p 的 token
                sorted_indices_to_remove = cumulative_probs > top_p
                sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
                sorted_indices_to_remove[..., 0] = 0
                indices_to_remove = sorted_indices_to_remove.scatter(
                    1, sorted_indices, sorted_indices_to_remove
                )
                logits[indices_to_remove] = float("-inf")

            # 采样
            probs = F.softmax(logits, dim=-1)
            next_id = torch.multinomial(probs, num_samples=1)  # (B, 1)
            input_ids = torch.cat([input_ids, next_id], dim=1)

        return input_ids


# ===== 使用示例 =====
def demo_gpt_forward():
    """演示 GPT 模型的前向传播和生成"""
    config = GPTConfig(
        vocab_size=50257,
        max_seq_len=256,
        n_layers=6,
        n_heads=6,
        d_model=384,
        d_ff=1536,
        dropout=0.1,
    )
    model = GPT(config)

    # 前向传播
    batch_size, seq_len = 4, 64
    input_ids = torch.randint(0, config.vocab_size, (batch_size, seq_len))
    targets = torch.randint(0, config.vocab_size, (batch_size, seq_len))
    logits, loss = model(input_ids, targets)
    print(f"Logits shape: {logits.shape}")   # (4, 64, 50257)
    print(f"Loss: {loss.item():.4f}")        # ~10.8 (= ln(50257))

    # 生成
    prompt = torch.randint(0, config.vocab_size, (1, 5))
    generated = model.generate(prompt, max_new_tokens=20, temperature=0.8, top_k=50)
    print(f"Generated shape: {generated.shape}")  # (1, 25)


if __name__ == "__main__":
    demo_gpt_forward()
```

### 5.5 GPT 系列关键设计决策总结

| 设计决策 | GPT-1 | GPT-2 | GPT-3 |
|---------|-------|-------|-------|
| Norm 位置 | Post-Norm | Pre-Norm | Pre-Norm |
| 位置编码 | 可学习绝对 | 可学习绝对 | 可学习绝对 |
| 权重初始化 | 标准 N(0,0.02) | 残差缩放 1/√(2N) | 残差缩放 1/√(2N) |
| Weight Tying | 是 | 是 | 否（太大，节省计算） |
| BPE 类型 | 标准 BPE 40K | Byte-Level BPE 50K | Byte-Level BPE 50K |
| 上下文长度 | 512 | 1024 | 2048 |
| 训练精度 | FP32 | FP32 | FP16 混合精度 |
| 学习率调度 | Warmup + 余弦衰减 | Warmup + 余弦衰减 | Warmup + 余弦衰减 |
| 批大小策略 | 固定 | 固定 | 渐进增大 |

---

## 6. BERT 详解

### 6.1 动机与背景

#### 6.1.1 论文信息

- **论文**：*BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding*（Devlin et al., 2018）
- **机构**：Google AI Language
- **发布时间**：2018 年 10 月（比 GPT-1 晚 4 个月）
- **核心贡献**：通过创新的 Masked Language Model 实现了真正的深度双向预训练，在 11 项 NLP 任务上全面达到 SOTA

#### 6.1.2 解决的核心问题

GPT-1 已经证明了"预训练+微调"的有效性，但有一个根本限制：单向注意力。

考虑填空任务 "The [MASK] sat on the mat"：
- 单向模型（GPT）：只能看到 "The"，无法利用 "sat on the mat" 的信息
- 双向模型（BERT）：同时看到 "The" 和 "sat on the mat"，能轻松推断出 "cat"

对于自然语言理解任务（分类、匹配、问答），双向上下文几乎总是优于单向。但挑战在于：如何实现双向预训练？

**难点**：如果简单地用全双向注意力做语言建模（预测下一个 token），模型可以"偷看"到答案——位置 t 的输出可以直接从位置 t 的输入中获取信息。BERT 通过 masking 巧妙解决了这个问题。

### 6.2 模型架构

BERT 使用标准 Transformer encoder（全双向注意力，无因果掩码）：

| 超参数 | BERT-base | BERT-large |
|--------|-----------|------------|
| 层数（L） | 12 | 24 |
| 隐藏维度（H） | 768 | 1024 |
| 注意力头数（A） | 12 | 16 |
| 每头维度 | 64 | 64 |
| FFN 维度 | 3072 (4H) | 4096 (4H) |
| 总参数量 | 110M | 340M |
| 最大序列长度 | 512 | 512 |
| 词汇表大小 | 30,522（WordPiece） | 30,522 |
| 位置编码 | 可学习绝对 | 可学习绝对 |
| 激活函数 | GELU | GELU |
| LayerNorm | Post-Norm | Post-Norm |

**与 GPT-1 的对比**：BERT-base 和 GPT-1 参数量相当（~110M），且使用相同的隐藏维度（768）和层数（12）。主要区别在于注意力方向（双向 vs 单向）。

### 6.3 输入表示

BERT 的输入由三种 embedding 相加构成：

```
Input Embedding = Token Embedding + Segment Embedding + Position Embedding
```

**Token Embedding**：通过 WordPiece 分词后的 token ID 映射到 d_model 维向量。

**Segment Embedding**：区分两个句子。只有两个可能值 E_A（segment 0）和 E_B（segment 1），用于句对任务。单句任务中全部为 E_A。

**Position Embedding**：可学习的绝对位置编码，维度范围 [0, 511]。

**特殊 Token**：

| Token | ID | 作用 |
|-------|-----|------|
| [CLS] | 101 | 句首，其输出作为整句的聚合表示 |
| [SEP] | 102 | 分隔两个句子 / 句末标记 |
| [MASK] | 103 | 替代被掩码的 token |
| [PAD] | 0 | 填充至统一长度 |
| [UNK] | 100 | 未知 token（WordPiece 无法处理时） |

**完整输入示例**：

```
原始文本: "I love NLP" + "It is great"

Tokens:   [CLS]  I   love  NLP  [SEP]  It  is  great  [SEP]  [PAD]  [PAD]
Type IDs:   0    0    0     0     0     1   1    1      1      0      0
Position:   0    1    2     3     4     5   6    7      8      9     10
Attn Mask:  1    1    1     1     1     1   1    1      1      0      0
```

### 6.4 预训练任务一：Masked Language Model（MLM）

#### 6.4.1 核心思想

MLM 的灵感来自完形填空测试（Cloze Test）。随机将输入中 15% 的 token 选中进行"破坏"，让模型根据未被破坏的双向上下文预测这些 token 的原始值。

关键洞察：mask 机制解决了"双向注意力中信息泄漏"的问题——被 mask 的位置无法从自身获取原始 token 信息，只能依赖上下文。

#### 6.4.2 80-10-10 策略

对于被选中的 15% token，应用以下随机替换策略：

- **80% 概率**：替换为特殊 token [MASK]
- **10% 概率**：替换为词汇表中的随机 token
- **10% 概率**：保持原始 token 不变

**为什么不全部替换为 [MASK]？**

问题在于预训练-微调不一致（Pretrain-Finetune Discrepancy）：
- 预训练时输入中有 [MASK] token
- 微调和推理时输入中没有 [MASK] token

如果模型只在有 [MASK] 的输入上训练，可能学会了"只在看到 [MASK] 时才输出有意义的预测"，导致在无 [MASK] 的微调场景下表现退化。

**各部分的作用**：
- 80% [MASK]：主要训练信号，让模型学习根据上下文预测
- 10% 随机替换：迫使模型不盲目信任输入，对每个位置都保持警惕
- 10% 保持不变：让模型学会在输入正确时输出正确答案（缓解预训练-微调不一致）

#### 6.4.3 MLM 的数学形式

```
L_MLM = - (1/|M|) Σ_{i∈M} log P(x_i^{orig} | x^{corrupted}; θ)
```

其中：
- M：被选中的位置集合（约占序列长度的 15%）
- x_i^{orig}：位置 i 的原始 token
- x^{corrupted}：经过 80-10-10 处理后的输入序列

**训练效率问题**：每次前向传播只有 15% 的 token 提供梯度信号（loss），相比 GPT 的 100% 效率低。这意味着 BERT 可能需要更多训练步数才能充分学习。后续的 ELECTRA 通过让所有 token 参与判别任务解决了这一问题。

#### 6.4.4 Whole Word Masking

原始 BERT 是在 WordPiece token 级别做 mask，可能导致部分遮盖一个单词：

```
原始: "playing" → WordPiece: ["play", "##ing"]
随机 mask: ["play", "[MASK]"]  ← 只 mask 了后缀，太容易预测
```

**Whole Word Masking (WWM)** 改进：如果一个单词的任何 WordPiece token 被选中，则该单词的所有 token 都被 mask：

```
WWM: ["[MASK]", "[MASK]"]  ← 需要真正理解上下文才能预测
```

WWM 在中文等语言上效果提升更明显（中文的字粒度 mask 太容易）。

### 6.5 预训练任务二：Next Sentence Prediction（NSP）

#### 6.5.1 动机

许多下游任务需要理解两个句子之间的关系（如自然语言推理、问答）。MLM 只能捕获 token 级别的信息，无法直接学习句间关系。NSP 通过句子级别的二分类任务补充这一能力。

#### 6.5.2 构建方式

对于每个训练样本，从语料中构建句子对 (A, B)：

- **50% 正例（IsNext）**：B 是语料中紧跟在 A 后面的真实下一句
- **50% 负例（NotNext）**：B 是从语料中随机采样的句子

模型取 [CLS] 位置的最终隐藏状态，通过一个线性分类器判断 IsNext / NotNext。

#### 6.5.3 NSP 的实现

```python
class NSPHead(nn.Module):
    """Next Sentence Prediction 分类头"""
    
    def __init__(self, hidden_size: int):
        super().__init__()
        # BERT 在 [CLS] 的输出上先过一个"pooler"（Linear + Tanh）
        self.pooler = nn.Sequential(
            nn.Linear(hidden_size, hidden_size),
            nn.Tanh(),
        )
        self.classifier = nn.Linear(hidden_size, 2)
    
    def forward(self, cls_hidden_state: torch.Tensor) -> torch.Tensor:
        """
        Args:
            cls_hidden_state: [CLS] token 的最终隐藏状态, (B, H)
        Returns:
            (B, 2) — IsNext / NotNext 的 logits
        """
        pooled = self.pooler(cls_hidden_state)
        return self.classifier(pooled)
```

#### 6.5.4 NSP 的争议与替代方案

RoBERTa（2019）的实验发现移除 NSP 后性能反而提升。原因分析：

1. **负例太简单**：随机采样的句子通常来自完全不同的主题，模型只需做"主题匹配"即可，无需真正理解句间逻辑关系
2. **干扰 MLM**：NSP 需要将两个句子拼接，但这限制了每个句子的长度，减少了 MLM 的上下文窗口
3. **不匹配下游任务**：大部分下游任务并不直接涉及"下一句预测"

**替代方案**：

| 方法 | 模型 | 思想 | 效果 |
|------|------|------|------|
| 移除 NSP | RoBERTa | 只用 MLM | 显著提升 |
| SOP (Sentence Order Prediction) | ALBERT | 判断两个连续句子的顺序 | 比 NSP 有效 |
| 增大输入长度 | RoBERTa | 不再拼接两个短句，使用完整长文档 | 提升 MLM 效果 |

### 6.6 预训练数据与超参数

#### 6.6.1 训练数据

| 数据集 | 规模 | 特点 |
|--------|------|------|
| BooksCorpus | ~800M 词 | 长文本，连贯叙述 |
| English Wikipedia | ~2,500M 词 | 结构化知识，去除了表格和列表 |
| **总计** | **~3.3B 词** | 约 16GB 文本 |

相比 GPT-2 的 40GB WebText，BERT 的训练数据规模较小，但质量较高。

#### 6.6.2 训练超参数

| 超参数 | 值 | 说明 |
|--------|-----|------|
| Batch Size | 256 序列 | 相当于 256 × 512 = 131K token |
| 序列长度 | 前 90% 步用 128，后 10% 用 512 | 两阶段策略 |
| 学习率 | 1e-4 | Adam |
| Warmup 步数 | 10,000 | 前 1% 步线性 warmup |
| 总训练步数 | 1,000,000 | 约 40 epoch |
| 优化器 | Adam (β1=0.9, β2=0.999, ε=1e-6) | |
| 权重衰减 | 0.01 | L2 正则化 |
| Dropout | 0.1 | 所有层 |
| 激活函数 | GELU | 而非 ReLU |

**两阶段序列长度策略的意义**：
- 前 90% 步使用短序列（128 token）：这样每个 batch 包含更多样本，加速训练且不浪费 padding
- 后 10% 步切换到完整长度（512 token）：让模型学习处理长距离依赖和长序列的位置编码

#### 6.6.3 训练资源

- **BERT-base**：4 Cloud TPU Pods（16 TPU chips），训练 4 天
- **BERT-large**：16 Cloud TPU Pods（64 TPU chips），训练 4 天
- 估计计算量：BERT-base ≈ 3.3 × 10^18 FLOPs

### 6.7 BERT 微调策略

BERT 微调的核心思想：预训练模型提供了强大的通用表示，只需在顶部添加一个简单的任务头（通常只有一个线性层），然后端到端微调所有参数。

#### 6.7.1 分类任务（句子级）

取 [CLS] 位置的最终隐藏状态作为整句表示，通过线性分类器输出：

```python
class BertForSequenceClassification(nn.Module):
    """BERT + 句子级分类头"""
    
    def __init__(self, bert_model, num_labels: int, hidden_size: int = 768):
        super().__init__()
        self.bert = bert_model
        self.dropout = nn.Dropout(0.1)
        self.classifier = nn.Linear(hidden_size, num_labels)
    
    def forward(self, input_ids, attention_mask, token_type_ids, labels=None):
        # 获取 BERT 输出
        hidden_states = self.bert(input_ids, attention_mask, token_type_ids)
        
        # 取 [CLS] token 的输出
        cls_output = hidden_states[:, 0, :]  # (B, H)
        cls_output = self.dropout(cls_output)
        logits = self.classifier(cls_output)  # (B, num_labels)
        
        loss = None
        if labels is not None:
            loss = F.cross_entropy(logits, labels)
        return logits, loss
```

#### 6.7.2 Token 级分类（NER / POS Tagging）

对每个 token 位置独立做分类：

```python
class BertForTokenClassification(nn.Module):
    """BERT + Token 级分类头（命名实体识别、词性标注等）"""
    
    def __init__(self, bert_model, num_labels: int, hidden_size: int = 768):
        super().__init__()
        self.bert = bert_model
        self.dropout = nn.Dropout(0.1)
        self.classifier = nn.Linear(hidden_size, num_labels)
    
    def forward(self, input_ids, attention_mask, token_type_ids, labels=None):
        hidden_states = self.bert(input_ids, attention_mask, token_type_ids)
        hidden_states = self.dropout(hidden_states)
        logits = self.classifier(hidden_states)  # (B, T, num_labels)
        
        loss = None
        if labels is not None:
            # labels 中 -100 表示不参与 loss（padding 或特殊 token）
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                labels.view(-1),
                ignore_index=-100,
            )
        return logits, loss
```

#### 6.7.3 抽取式问答（SQuAD 风格）

预测答案在 passage 中的起始和结束位置：

```python
class BertForQuestionAnswering(nn.Module):
    """BERT + 抽取式问答头"""
    
    def __init__(self, bert_model, hidden_size: int = 768):
        super().__init__()
        self.bert = bert_model
        # 输出 2 个 logit：start_logit 和 end_logit
        self.qa_outputs = nn.Linear(hidden_size, 2)
    
    def forward(self, input_ids, attention_mask, token_type_ids,
                start_positions=None, end_positions=None):
        hidden_states = self.bert(input_ids, attention_mask, token_type_ids)
        logits = self.qa_outputs(hidden_states)  # (B, T, 2)
        
        start_logits = logits[:, :, 0]  # (B, T) 每个位置是答案开始的分数
        end_logits = logits[:, :, 1]    # (B, T) 每个位置是答案结束的分数
        
        loss = None
        if start_positions is not None and end_positions is not None:
            start_loss = F.cross_entropy(start_logits, start_positions)
            end_loss = F.cross_entropy(end_logits, end_positions)
            loss = (start_loss + end_loss) / 2
        
        return start_logits, end_logits, loss
```

#### 6.7.4 微调超参数建议

| 超参数 | 推荐值 | 说明 |
|--------|--------|------|
| 学习率 | 2e-5 ~ 5e-5 | 远小于预训练的 1e-4 |
| Batch Size | 16 ~ 32 | 受限于 GPU 显存 |
| Epochs | 2 ~ 4 | 过多容易过拟合 |
| Warmup | 总步数的 6%~10% | |
| 权重衰减 | 0.01 | |
| 最大序列长度 | 128 ~ 512 | 按任务需求选择 |

微调的计算成本极低：在单张 V100 GPU 上，BERT-base 微调 GLUE 任务通常只需 1-3 小时。

### 6.8 BERT 完整模型实现

```python
"""
BERT 模型完整实现（含预训练和微调模式）
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math
from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass
class BertConfig:
    """BERT 模型配置"""
    vocab_size: int = 30522           # WordPiece 词汇表
    max_position_embeddings: int = 512  # 最大序列长度
    type_vocab_size: int = 2          # Segment 类型数（A=0, B=1）
    n_layers: int = 12                # Transformer 层数
    n_heads: int = 12                 # 注意力头数
    d_model: int = 768                # 隐藏维度
    d_ff: int = 3072                  # FFN 中间维度
    dropout: float = 0.1              # Dropout
    layer_norm_eps: float = 1e-12     # LayerNorm epsilon

    @property
    def d_head(self) -> int:
        return self.d_model // self.n_heads


class BertEmbeddings(nn.Module):
    """
    BERT 输入嵌入层。
    将 token IDs 转换为稠密向量：Token + Position + Segment embedding。
    """

    def __init__(self, config: BertConfig):
        super().__init__()
        self.word_embeddings = nn.Embedding(config.vocab_size, config.d_model)
        self.position_embeddings = nn.Embedding(config.max_position_embeddings, config.d_model)
        self.token_type_embeddings = nn.Embedding(config.type_vocab_size, config.d_model)
        # Embedding 后接 LayerNorm + Dropout（BERT 特有设计）
        self.LayerNorm = nn.LayerNorm(config.d_model, eps=config.layer_norm_eps)
        self.dropout = nn.Dropout(config.dropout)

    def forward(
        self,
        input_ids: torch.Tensor,                         # (B, T)
        token_type_ids: Optional[torch.Tensor] = None,   # (B, T)
    ) -> torch.Tensor:
        B, T = input_ids.size()
        
        if token_type_ids is None:
            token_type_ids = torch.zeros_like(input_ids)
        
        # 位置 ID: 0, 1, 2, ..., T-1
        position_ids = torch.arange(T, device=input_ids.device).unsqueeze(0)  # (1, T)
        
        # 三种 embedding 相加
        embeddings = (
            self.word_embeddings(input_ids)            # (B, T, H)
            + self.position_embeddings(position_ids)  # (1, T, H) 广播
            + self.token_type_embeddings(token_type_ids)  # (B, T, H)
        )
        
        # LayerNorm + Dropout
        embeddings = self.LayerNorm(embeddings)
        embeddings = self.dropout(embeddings)
        return embeddings


class BertSelfAttention(nn.Module):
    """
    BERT 多头自注意力（全双向，无因果掩码）。
    与 GPT 的唯一区别：没有因果掩码，每个位置可以注意到所有其他位置。
    """

    def __init__(self, config: BertConfig):
        super().__init__()
        self.n_heads = config.n_heads
        self.d_head = config.d_head
        self.d_model = config.d_model

        self.query = nn.Linear(config.d_model, config.d_model)
        self.key = nn.Linear(config.d_model, config.d_model)
        self.value = nn.Linear(config.d_model, config.d_model)
        self.out_proj = nn.Linear(config.d_model, config.d_model)
        self.dropout = nn.Dropout(config.dropout)

    def forward(
        self,
        hidden_states: torch.Tensor,                      # (B, T, H)
        attention_mask: Optional[torch.Tensor] = None,    # (B, 1, 1, T)
    ) -> torch.Tensor:
        B, T, _ = hidden_states.size()

        # 分别计算 Q, K, V
        q = self.query(hidden_states).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        k = self.key(hidden_states).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        v = self.value(hidden_states).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        # q, k, v: (B, n_heads, T, d_head)

        # 缩放点积注意力
        scores = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_head)  # (B, n_heads, T, T)

        # Padding mask：将 padding 位置的注意力分数设为极大负数
        if attention_mask is not None:
            scores = scores + attention_mask  # attention_mask 中 padding=−1e9, 非 padding=0

        attn_weights = F.softmax(scores, dim=-1)
        attn_weights = self.dropout(attn_weights)

        # 聚合
        context = (attn_weights @ v)  # (B, n_heads, T, d_head)
        context = context.transpose(1, 2).contiguous().view(B, T, self.d_model)

        # 输出投影
        output = self.out_proj(context)
        return output


class BertLayer(nn.Module):
    """
    BERT Transformer Layer（Post-Norm 变体）。
    
    Post-Norm: 残差连接之后再做 LayerNorm。
    结构: x + SubLayer(x) → LayerNorm
    """

    def __init__(self, config: BertConfig):
        super().__init__()
        # Self-Attention 子层
        self.attention = BertSelfAttention(config)
        self.attention_norm = nn.LayerNorm(config.d_model, eps=config.layer_norm_eps)
        self.attention_dropout = nn.Dropout(config.dropout)
        
        # FFN 子层
        self.ffn = nn.Sequential(
            nn.Linear(config.d_model, config.d_ff),
            nn.GELU(),
            nn.Linear(config.d_ff, config.d_model),
            nn.Dropout(config.dropout),
        )
        self.ffn_norm = nn.LayerNorm(config.d_model, eps=config.layer_norm_eps)

    def forward(
        self,
        hidden_states: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        # Self-Attention + Residual + LayerNorm
        attn_output = self.attention(hidden_states, attention_mask)
        hidden_states = self.attention_norm(hidden_states + self.attention_dropout(attn_output))

        # FFN + Residual + LayerNorm
        ffn_output = self.ffn(hidden_states)
        hidden_states = self.ffn_norm(hidden_states + ffn_output)

        return hidden_states


class BertModel(nn.Module):
    """
    BERT 基础模型（编码器主体，不含任务头）。
    输入 token IDs → 输出每个位置的上下文表示。
    """

    def __init__(self, config: BertConfig):
        super().__init__()
        self.config = config
        self.embeddings = BertEmbeddings(config)
        self.layers = nn.ModuleList([BertLayer(config) for _ in range(config.n_layers)])

    def forward(
        self,
        input_ids: torch.Tensor,                         # (B, T)
        attention_mask: Optional[torch.Tensor] = None,   # (B, T): 1=real, 0=padding
        token_type_ids: Optional[torch.Tensor] = None,   # (B, T): 0=A, 1=B
    ) -> torch.Tensor:
        # 将 attention_mask (B, T) → (B, 1, 1, T) 的 additive mask
        if attention_mask is not None:
            # 0→-1e9 (忽略), 1→0 (正常)
            extended_mask = (1.0 - attention_mask.unsqueeze(1).unsqueeze(2).float()) * -1e9
        else:
            extended_mask = None

        # Embedding
        hidden_states = self.embeddings(input_ids, token_type_ids)

        # N 层 Transformer
        for layer in self.layers:
            hidden_states = layer(hidden_states, extended_mask)

        return hidden_states  # (B, T, d_model)


class BertForPreTraining(nn.Module):
    """
    BERT 预训练模型：MLM + NSP 双任务。
    """

    def __init__(self, config: BertConfig):
        super().__init__()
        self.bert = BertModel(config)

        # MLM Head: hidden → hidden → GELU → LayerNorm → vocab
        self.mlm_head = nn.Sequential(
            nn.Linear(config.d_model, config.d_model),
            nn.GELU(),
            nn.LayerNorm(config.d_model, eps=config.layer_norm_eps),
        )
        self.mlm_decoder = nn.Linear(config.d_model, config.vocab_size, bias=True)
        # MLM decoder 通常与 word embedding 共享权重
        self.mlm_decoder.weight = self.bert.embeddings.word_embeddings.weight

        # NSP Head: [CLS] → pooler → 2-class
        self.pooler = nn.Sequential(
            nn.Linear(config.d_model, config.d_model),
            nn.Tanh(),
        )
        self.nsp_classifier = nn.Linear(config.d_model, 2)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
        token_type_ids: Optional[torch.Tensor] = None,
        mlm_labels: Optional[torch.Tensor] = None,      # (B, T): -100 表示不参与
        nsp_labels: Optional[torch.Tensor] = None,       # (B,): 0=IsNext, 1=NotNext
    ) -> Tuple[torch.Tensor, torch.Tensor, Optional[torch.Tensor]]:
        
        hidden_states = self.bert(input_ids, attention_mask, token_type_ids)
        # hidden_states: (B, T, H)

        # === MLM 预测 ===
        mlm_hidden = self.mlm_head(hidden_states)          # (B, T, H)
        mlm_logits = self.mlm_decoder(mlm_hidden)          # (B, T, vocab_size)

        # === NSP 预测 ===
        cls_hidden = hidden_states[:, 0, :]                 # (B, H)
        pooled_output = self.pooler(cls_hidden)             # (B, H)
        nsp_logits = self.nsp_classifier(pooled_output)     # (B, 2)

        # === 计算损失 ===
        total_loss = None
        if mlm_labels is not None and nsp_labels is not None:
            mlm_loss = F.cross_entropy(
                mlm_logits.view(-1, mlm_logits.size(-1)),
                mlm_labels.view(-1),
                ignore_index=-100,  # 忽略未被 mask 的位置
            )
            nsp_loss = F.cross_entropy(nsp_logits, nsp_labels)
            total_loss = mlm_loss + nsp_loss

        return mlm_logits, nsp_logits, total_loss


# ===== 使用示例 =====
def demo_bert():
    """演示 BERT 预训练模型的前向传播"""
    config = BertConfig(
        vocab_size=30522,
        max_position_embeddings=128,
        n_layers=6,
        n_heads=6,
        d_model=384,
        d_ff=1536,
    )
    model = BertForPreTraining(config)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"BERT model: {n_params/1e6:.1f}M parameters")

    # 模拟输入
    B, T = 4, 64
    input_ids = torch.randint(1000, 5000, (B, T))
    input_ids[:, 0] = 101   # [CLS]
    input_ids[:, -1] = 102  # [SEP]
    attention_mask = torch.ones(B, T, dtype=torch.long)
    token_type_ids = torch.zeros(B, T, dtype=torch.long)
    token_type_ids[:, T//2:] = 1  # 后半为 segment B

    # MLM 标签：只有少数位置有标签
    mlm_labels = torch.full((B, T), -100, dtype=torch.long)
    mlm_labels[:, 5:10] = torch.randint(0, config.vocab_size, (B, 5))
    nsp_labels = torch.randint(0, 2, (B,))

    # 前向传播
    mlm_logits, nsp_logits, loss = model(
        input_ids, attention_mask, token_type_ids, mlm_labels, nsp_labels
    )
    print(f"MLM logits: {mlm_logits.shape}")  # (4, 64, 30522)
    print(f"NSP logits: {nsp_logits.shape}")  # (4, 2)
    print(f"Loss: {loss.item():.4f}")


if __name__ == "__main__":
    demo_bert()
```

### 6.9 BERT 的重要变体

| 模型 | 年份 | 核心改进 | 效果 |
|------|------|---------|------|
| RoBERTa | 2019 | 去除 NSP，更多数据(160GB)，更大 batch，动态 mask | 全面超越 BERT |
| ALBERT | 2019 | 参数共享 + 因式分解 embedding + SOP 替代 NSP | 参数量大幅减少 |
| ELECTRA | 2020 | 用 Generator+Discriminator 替代 MLM | 训练效率提升 4x |
| DeBERTa | 2021 | 解耦注意力（位置与内容分开） | 超越 RoBERTa |
| SpanBERT | 2020 | Mask 连续 span 而非随机 token | 改善 span 相关任务 |

---

## 7. GPT vs BERT：两种范式的深度对比

### 7.1 架构对比

| 维度 | GPT | BERT |
|------|-----|------|
| Transformer 类型 | Decoder-only | Encoder-only |
| 注意力方向 | 单向（因果掩码） | 双向（全连接） |
| 预训练任务 | CLM（预测下一个 token） | MLM（15%）+ NSP |
| 训练信号利用率 | 100%（每个 token 都有 loss） | ~15%（只有 mask 位置） |
| LayerNorm 位置 | Pre-Norm (GPT-2+) | Post-Norm |
| 生成能力 | 强（天然自回归） | 弱（需要特殊技巧） |
| 理解能力（NLU） | 较弱（单向信息有限） | 强（双向上下文） |

### 7.2 适用任务对比

| 任务类型 | 最佳范式 | 原因 |
|---------|---------|------|
| 开放域文本生成 | GPT | 天然支持自回归解码 |
| 对话系统 | GPT | 需要持续生成回复 |
| 文本摘要 | GPT | 需要生成摘要文本 |
| 机器翻译 | GPT（或 Seq2Seq） | 需要生成目标语言 |
| 文本分类 | BERT | 双向上下文对语义理解更准确 |
| 命名实体识别 | BERT | 每个 token 都需要双向上下文判断 |
| 抽取式问答 | BERT | 需要精确定位答案位置 |
| 语义匹配/相似度 | BERT | 需要深度双向理解两个句子 |
| 自然语言推理 | BERT | 需要理解前提与假设的逻辑关系 |

### 7.3 训练效率分析

**信号密度**：GPT 每个 token 都参与 loss（利用率 100%），BERT 只有 15% 的 token 参与（利用率 15%）。这意味着处理相同数据量时，GPT 的有效训练信号是 BERT 的 ~6.7 倍。

**每个 token 的信息量**：但 BERT 的双向注意力使每个 token 的表示质量更高——同一个位置可以同时获取左右所有上下文的信息。单向模型需要多层才能间接传播信息。

**实际训练效果**：ELECTRA 的论文通过实验精确量化了 MLM 的低效——让所有 token 都参与判别任务后，相同计算量下性能显著优于 BERT。

### 7.4 信息流可视化

```
GPT（自回归，因果掩码）:
Token:  The  cat  sat  on  the  mat
        ←    ←←   ←←←  ←←←← ←←←←← ←←←←←←
        每个位置只能看到左边的信息

BERT（双向，无掩码）:
Token:  The  cat  sat  on  the  mat
        ↔↔↔  ↔↔↔  ↔↔↔  ↔↔↔ ↔↔↔  ↔↔↔
        每个位置可以看到所有位置的信息
```

### 7.5 为什么 GPT 路线最终胜出？

从 2020 年 GPT-3 起，大模型发展明显偏向 decoder-only 自回归路线。核心原因：

**1. 生成是更通用的能力**：理解可以被建模为"生成正确答案"，但生成无法被简化为理解。一个完美的生成模型（能生成任何正确答案）隐含了完美的理解能力。

**2. 统一接口**：所有任务都可以表述为 "input text → output text" 的格式，无需为每个任务设计专门的头。这大大简化了系统设计和部署。

**3. 涌现与对齐**：In-Context Learning、Chain-of-Thought、RLHF 等关键能力都是在自回归模型上自然实现的。

**4. Scaling Laws 更清晰**：自回归 LM 的 loss 与规模呈极为平滑的幂律关系，便于工程规划和投资决策。

**5. 推理优化**：KV-Cache 使自回归模型的推理效率大幅提升（生成每个新 token 只需一次前向传播），而 BERT 类模型每次都要重新编码整个序列。

**6. 数据效率**：每个 token 都参与训练，无需人为设计 mask 策略，简化了训练流程。

### 7.6 BERT 并未"消亡"

尽管大模型发展偏向 GPT 路线，BERT 类模型在以下场景仍有不可替代的价值：

- **轻量级部署**：BERT-base 只有 110M 参数，延迟极低，适合线上服务
- **嵌入模型**：Sentence-BERT、DeBERTa 仍是最好的 embedding 模型之一
- **搜索/排序**：双向理解对相关性判断更准确
- **边缘设备**：手机、IoT 设备无法运行大模型，BERT 的小尺寸是优势
- **特定领域**：医学、法律等领域的分类/抽取任务，微调 BERT 仍是高效选择

---

## 8. 预训练的数据工程

### 8.1 数据来源

大规模预训练需要多样化的高质量数据：

| 数据源 | 代表数据集 | 特点 | 典型规模 |
|--------|-----------|------|---------|
| 网页爬取 | Common Crawl, C4, FineWeb | 规模最大但质量参差不齐 | 万亿 token |
| 书籍 | BooksCorpus, Books3, Gutenberg | 长篇连贯叙述，高质量 | 百亿 token |
| 代码 | GitHub, The Stack | 逻辑性强，提升推理能力 | 千亿 token |
| 学术论文 | arXiv, S2ORC | 科学知识，公式丰富 | 百亿 token |
| 百科 | Wikipedia（多语言） | 结构化事实知识 | 数十亿 token |
| 论坛/社交 | Reddit, StackOverflow | 对话风格，问答格式 | 千亿 token |
| 新闻 | CC-News, RealNews | 时事信息 | 百亿 token |

### 8.2 数据清洗流水线

```python
"""
预训练数据清洗流水线（概念实现，展示关键步骤）
"""

import hashlib
import re
from typing import List, Set
from dataclasses import dataclass


@dataclass
class QualityMetrics:
    """文档质量指标"""
    word_count: int
    avg_word_length: float
    punct_ratio: float
    alpha_ratio: float
    unique_line_ratio: float
    max_line_repetition: int
    perplexity: float = 0.0  # 需要语言模型计算


class PretrainingDataPipeline:
    """
    预训练数据清洗流水线。
    
    典型流程：
    1. 语言检测 → 2. 启发式质量过滤 → 3. 去重 → 4. 有害内容过滤 → 5. 去污染
    """
    
    def __init__(self, target_language: str = "en"):
        self.target_language = target_language
    
    # ==================== 1. 语言检测 ====================
    def filter_language(self, documents: List[str]) -> List[str]:
        """
        使用 fasttext 的语言检测模型（lid.176.bin）过滤非目标语言文档。
        阈值通常设为 0.5-0.7 的置信度。
        """
        filtered = []
        for doc in documents:
            lang, confidence = self._detect_language(doc)
            if lang == self.target_language and confidence > 0.5:
                filtered.append(doc)
        return filtered
    
    def _detect_language(self, text: str):
        # 实际使用: fasttext.load_model("lid.176.bin").predict(text.replace("\n", " "))
        return "en", 0.9  # placeholder
    
    # ==================== 2. 启发式质量过滤 ====================
    def filter_quality(self, documents: List[str]) -> List[str]:
        """
        基于启发式规则的质量过滤（参考 C4、FineWeb 的做法）。
        """
        filtered = []
        for doc in documents:
            metrics = self._compute_metrics(doc)
            if self._passes_quality_checks(metrics, doc):
                filtered.append(doc)
        return filtered
    
    def _compute_metrics(self, text: str) -> QualityMetrics:
        """计算文档的各项质量指标"""
        words = text.split()
        lines = text.split("\n")
        
        word_count = len(words)
        avg_word_length = sum(len(w) for w in words) / max(word_count, 1)
        
        # 标点符号比例
        punct_chars = sum(1 for c in text if c in ".,;:!?\"'()-")
        punct_ratio = punct_chars / max(len(text), 1)
        
        # 字母比例
        alpha_chars = sum(1 for c in text if c.isalpha())
        alpha_ratio = alpha_chars / max(len(text), 1)
        
        # 唯一行比例（检测重复内容）
        unique_line_ratio = len(set(lines)) / max(len(lines), 1)
        
        # 最大连续重复行数
        max_rep = 1
        current_rep = 1
        for i in range(1, len(lines)):
            if lines[i] == lines[i-1] and lines[i].strip():
                current_rep += 1
                max_rep = max(max_rep, current_rep)
            else:
                current_rep = 1
        
        return QualityMetrics(
            word_count=word_count,
            avg_word_length=avg_word_length,
            punct_ratio=punct_ratio,
            alpha_ratio=alpha_ratio,
            unique_line_ratio=unique_line_ratio,
            max_line_repetition=max_rep,
        )
    
    def _passes_quality_checks(self, m: QualityMetrics, text: str) -> bool:
        """应用质量过滤规则"""
        # 规则 1: 最少 50 词
        if m.word_count < 50:
            return False
        
        # 规则 2: 平均词长合理（排除乱码）
        if m.avg_word_length < 3 or m.avg_word_length > 10:
            return False
        
        # 规则 3: 字母占比不能太低（排除数字表格等）
        if m.alpha_ratio < 0.5:
            return False
        
        # 规则 4: 不能有过多重复行
        if m.unique_line_ratio < 0.3:
            return False
        if m.max_line_repetition > 10:
            return False
        
        # 规则 5: 不能以 "javascript" 等关键词开头（排除网页模板）
        first_words = text[:200].lower()
        boilerplate_markers = ["javascript", "cookie", "privacy policy", "terms of service"]
        if any(marker in first_words for marker in boilerplate_markers):
            return False
        
        # 规则 6: 过滤"需要登录"类页面
        login_markers = ["please log in", "sign in to continue", "create an account"]
        if any(marker in text.lower()[:500] for marker in login_markers):
            return False
        
        return True
    
    # ==================== 3. 去重 ====================
    def deduplicate(self, documents: List[str]) -> List[str]:
        """
        多级去重策略：
        1. 精确去重（hash）
        2. 近似去重（MinHash + LSH，阈值 Jaccard > 0.8）
        3. 子串去重（可选，移除在多个文档中出现的长重复段落）
        """
        # Step 1: 精确去重
        seen_hashes: Set[str] = set()
        unique_docs = []
        
        for doc in documents:
            doc_hash = hashlib.md5(doc.encode()).hexdigest()
            if doc_hash not in seen_hashes:
                seen_hashes.add(doc_hash)
                unique_docs.append(doc)
        
        # Step 2: 近似去重（MinHash + LSH）
        # 实际实现使用 datasketch 库或自定义 MinHash
        # 这里省略具体实现，核心思想是：
        # - 将每个文档表示为 n-gram 集合的 MinHash 签名
        # - 用 LSH 找到相似文档对
        # - 在相似集群中只保留一份
        
        return unique_docs
    
    # ==================== 4. 有害内容过滤 ====================
    def filter_toxic(self, documents: List[str]) -> List[str]:
        """
        过滤有害内容：
        - 使用预训练的毒性分类器（如 Perspective API、Jigsaw Toxic）
        - 关键词黑名单
        - NSFW 分类器
        """
        return [doc for doc in documents if not self._is_toxic(doc)]
    
    def _is_toxic(self, text: str) -> bool:
        """毒性检测（简化版）"""
        # 实际使用专门训练的分类器
        return False
    
    # ==================== 5. 测试集去污染 ====================
    def decontaminate(self, train_docs: List[str], eval_samples: List[str], n: int = 13) -> List[str]:
        """
        从训练数据中移除与评测集重叠的内容。
        
        方法：如果训练文档包含任何评测样本中的 13-gram，则移除该文档。
        这是 GPT-3 论文使用的方法。
        
        Args:
            train_docs: 训练文档列表
            eval_samples: 评测集样本列表
            n: n-gram 长度（13 是常用值）
        """
        # 构建评测集的 n-gram 集合
        eval_ngrams: Set[tuple] = set()
        for sample in eval_samples:
            words = sample.lower().split()
            for i in range(len(words) - n + 1):
                eval_ngrams.add(tuple(words[i:i+n]))
        
        # 过滤训练数据
        clean_docs = []
        contaminated_count = 0
        
        for doc in train_docs:
            words = doc.lower().split()
            is_contaminated = False
            for i in range(len(words) - n + 1):
                if tuple(words[i:i+n]) in eval_ngrams:
                    is_contaminated = True
                    break
            
            if is_contaminated:
                contaminated_count += 1
            else:
                clean_docs.append(doc)
        
        print(f"Removed {contaminated_count} contaminated documents "
              f"({contaminated_count/len(train_docs)*100:.2f}%)")
        return clean_docs
    
    # ==================== 主流程 ====================
    def process(self, documents: List[str], eval_samples: List[str] = None) -> List[str]:
        """执行完整数据清洗流水线"""
        print(f"Starting pipeline with {len(documents)} documents")
        
        documents = self.filter_language(documents)
        print(f"After language filter: {len(documents)}")
        
        documents = self.filter_quality(documents)
        print(f"After quality filter: {len(documents)}")
        
        documents = self.deduplicate(documents)
        print(f"After deduplication: {len(documents)}")
        
        documents = self.filter_toxic(documents)
        print(f"After toxic filter: {len(documents)}")
        
        if eval_samples:
            documents = self.decontaminate(documents, eval_samples)
            print(f"After decontamination: {len(documents)}")
        
        return documents
```

### 8.3 数据配比策略

不同数据源的配比直接影响模型的能力分布：

| 策略 | 描述 | 代表 | 优缺点 |
|------|------|------|--------|
| 按比例采样 | 各数据集按 token 数等比采样 | GPT-2 | 简单但低质量数据占比过大 |
| 质量加权上采样 | 高质量数据集被多次采样 | GPT-3 | 高质量数据过拟合风险 |
| 温度采样 | 用 T 参数平滑各数据集的采样概率 | mT5 | 平衡多样性与质量 |
| 领域平衡 | 确保各领域（科学/代码/通识）均有覆盖 | PaLM | 能力更均衡 |
| DoReMi | 根据小模型的 loss 动态调整权重 | DoReMi (2023) | 自动化但计算成本高 |

---

## 9. 预训练的训练策略

### 9.1 学习率调度

预训练标配：Warmup + Cosine Decay

```python
import math


def get_cosine_schedule_with_warmup(
    step: int,
    warmup_steps: int,
    total_steps: int,
    max_lr: float,
    min_lr: float,
) -> float:
    """
    学习率调度：线性 warmup + 余弦衰减。
    
    - Warmup 阶段（0 → warmup_steps）: 学习率从 0 线性增长到 max_lr
    - Decay 阶段（warmup_steps → total_steps）: 余弦衰减到 min_lr
    
    为什么用余弦衰减而非线性衰减？
    1. 余弦衰减在训练中期下降更慢，让模型有更长时间在较高学习率下探索
    2. 在训练末期快速下降，帮助模型精细收敛
    3. 实验表明余弦衰减的最终 loss 优于线性衰减
    """
    if step < warmup_steps:
        # 线性 warmup
        return max_lr * (step / warmup_steps)
    
    if step >= total_steps:
        return min_lr
    
    # 余弦衰减
    progress = (step - warmup_steps) / (total_steps - warmup_steps)
    cosine_factor = 0.5 * (1.0 + math.cos(math.pi * progress))
    return min_lr + (max_lr - min_lr) * cosine_factor


# GPT-3 175B 的实际参数
# max_lr = 6e-5, min_lr = 6e-6 (0.1x), warmup = 375 steps
# 注意：更大的模型用更小的学习率！
```

### 9.2 混合精度训练

```python
"""
FP16/BF16 混合精度训练：减半显存占用，加速计算。

核心思想：
- 前向计算和大部分反向传播使用半精度（FP16/BF16）
- 模型参数的主副本（master weights）保持 FP32
- Loss 缩放（Loss Scaling）防止 FP16 梯度下溢
"""

import torch
from torch.cuda.amp import autocast, GradScaler


class MixedPrecisionTrainer:
    """混合精度训练器"""
    
    def __init__(self, model, optimizer, use_bf16: bool = False):
        self.model = model
        self.optimizer = optimizer
        self.scaler = GradScaler() if not use_bf16 else None  # BF16 不需要 scaler
        self.dtype = torch.bfloat16 if use_bf16 else torch.float16
    
    def training_step(self, batch: dict) -> float:
        """单步训练"""
        self.optimizer.zero_grad()
        
        # 混合精度前向传播
        with autocast(dtype=self.dtype):
            logits, loss = self.model(batch["input_ids"], batch["targets"])
        
        if self.scaler is not None:
            # FP16: 使用 loss scaling
            self.scaler.scale(loss).backward()
            self.scaler.unscale_(self.optimizer)
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.scaler.step(self.optimizer)
            self.scaler.update()
        else:
            # BF16: 不需要 loss scaling（动态范围与 FP32 相同）
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()
        
        return loss.item()
```

### 9.3 梯度累积与有效批大小

```python
def train_with_gradient_accumulation(
    model, dataloader, optimizer,
    accumulation_steps: int = 8,
    max_grad_norm: float = 1.0,
):
    """
    梯度累积：当 GPU 显存无法容纳大 batch 时，通过多次小 batch
    累积梯度来模拟大 batch 训练。
    
    物理 batch = 4 × accumulation = 8 → 有效 batch = 32
    
    注意：loss 需要除以 accumulation_steps，否则梯度会偏大。
    """
    model.train()
    optimizer.zero_grad()
    
    for step, batch in enumerate(dataloader):
        # 前向 + 反向（梯度累加到 .grad 中）
        logits, loss = model(batch["input_ids"], batch["targets"])
        loss = loss / accumulation_steps  # 关键：归一化
        loss.backward()
        
        # 每 accumulation_steps 步执行一次参数更新
        if (step + 1) % accumulation_steps == 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
            optimizer.step()
            optimizer.zero_grad()
```

### 9.4 优化器配置

```python
def configure_optimizer(
    model: torch.nn.Module,
    learning_rate: float = 3e-4,
    weight_decay: float = 0.1,
    betas: tuple = (0.9, 0.95),
) -> torch.optim.AdamW:
    """
    配置 AdamW 优化器。
    
    关键设计决策：
    1. 不对 bias 和 LayerNorm 参数应用 weight decay
       - bias 本身就是低维参数，正则化会损害性能
       - LayerNorm 的 gamma/beta 控制归一化，不应被衰减
    
    2. 使用解耦权重衰减（AdamW vs Adam + L2）
       - AdamW: w = w - lr * (adam_update + wd * w)
       - Adam + L2: gradient += wd * w → adam_update includes wd
       - AdamW 的衰减不受 Adam 的动量调节，更稳定
    """
    # 将参数分为需要/不需要权重衰减的两组
    decay_params = []
    no_decay_params = []
    
    for name, param in model.named_parameters():
        if not param.requires_grad:
            continue
        # 1D 参数（bias、LayerNorm scale/shift）不衰减
        if param.dim() == 1 or "bias" in name:
            no_decay_params.append(param)
        else:
            decay_params.append(param)
    
    param_groups = [
        {"params": decay_params, "weight_decay": weight_decay},
        {"params": no_decay_params, "weight_decay": 0.0},
    ]
    
    optimizer = torch.optim.AdamW(
        param_groups,
        lr=learning_rate,
        betas=betas,
        eps=1e-8,
    )
    
    print(f"Optimizer: {len(decay_params)} params with WD, "
          f"{len(no_decay_params)} params without WD")
    return optimizer
```

### 9.5 分布式训练策略

大规模预训练必须使用多 GPU/多节点并行：

| 策略 | 适用场景 | 原理 |
|------|---------|------|
| Data Parallel (DP) | 模型能放入单 GPU | 每个 GPU 处理不同数据，同步梯度 |
| ZeRO (DeepSpeed) | 模型略超单 GPU 显存 | 将优化器状态/梯度/参数分片到不同 GPU |
| Tensor Parallel (TP) | 单层参数太大 | 将每层的矩阵沿不同维度切分到多 GPU |
| Pipeline Parallel (PP) | 层数极多 | 不同 GPU 负责不同层，流水线式前向/反向 |
| 3D Parallel | 超大模型 (>100B) | TP + PP + DP 组合使用 |

---

## 10. 从零实现 GPT 预训练

### 10.1 完整的训练脚本

```python
"""
GPT 预训练完整流程（教学版，可在单 GPU 上运行缩小版模型）
"""

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import time
import math
from typing import Optional


class TextDataset(Dataset):
    """
    将连续文本切分为固定长度的训练样本。
    
    对于 GPT 预训练：
    - 输入 x = tokens[i : i + block_size]
    - 目标 y = tokens[i+1 : i + block_size + 1]（右移一位）
    """
    
    def __init__(self, tokens: list, block_size: int = 256):
        self.tokens = torch.tensor(tokens, dtype=torch.long)
        self.block_size = block_size
    
    def __len__(self) -> int:
        return max(0, len(self.tokens) - self.block_size - 1)
    
    def __getitem__(self, idx: int) -> dict:
        chunk = self.tokens[idx : idx + self.block_size + 1]
        return {
            "input_ids": chunk[:-1],   # (block_size,)
            "targets": chunk[1:],       # (block_size,)
        }


class PreTrainer:
    """GPT 预训练训练器"""
    
    def __init__(self, model, dataset, config: dict):
        self.model = model
        self.config = config
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        
        # 优化器
        self.optimizer = configure_optimizer(
            model, config["lr"], config.get("weight_decay", 0.1)
        )
        
        # 数据加载器
        self.loader = DataLoader(
            dataset,
            batch_size=config["batch_size"],
            shuffle=True,
            num_workers=2,
            pin_memory=True,
            drop_last=True,
        )
        
        self.step = 0
        self.tokens_processed = 0
    
    def train(self) -> list:
        """执行预训练，返回 loss 历史"""
        max_steps = self.config["max_steps"]
        accum_steps = self.config.get("gradient_accumulation", 1)
        log_interval = self.config.get("log_interval", 100)
        
        self.model.train()
        loss_history = []
        running_loss = 0.0
        data_iter = iter(self.loader)
        t0 = time.time()
        
        while self.step < max_steps:
            # 学习率调度
            lr = get_cosine_schedule_with_warmup(
                self.step,
                self.config["warmup_steps"],
                max_steps,
                self.config["lr"],
                self.config["lr"] * 0.1,
            )
            for pg in self.optimizer.param_groups:
                pg["lr"] = lr
            
            # 梯度累积
            self.optimizer.zero_grad()
            micro_loss = 0.0
            
            for _ in range(accum_steps):
                try:
                    batch = next(data_iter)
                except StopIteration:
                    data_iter = iter(self.loader)
                    batch = next(data_iter)
                
                x = batch["input_ids"].to(self.device)
                y = batch["targets"].to(self.device)
                
                _, loss = self.model(x, y)
                (loss / accum_steps).backward()
                micro_loss += loss.item() / accum_steps
            
            # 梯度裁剪 + 更新
            nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
            self.optimizer.step()
            
            self.step += 1
            self.tokens_processed += (
                self.config["batch_size"] * accum_steps * self.config["block_size"]
            )
            running_loss += micro_loss
            
            # 日志
            if self.step % log_interval == 0:
                avg_loss = running_loss / log_interval
                elapsed = time.time() - t0
                tps = self.tokens_processed / elapsed  # tokens per second
                
                print(
                    f"Step {self.step:6d}/{max_steps} | "
                    f"Loss {avg_loss:.4f} | PPL {math.exp(avg_loss):.1f} | "
                    f"LR {lr:.2e} | {tps:.0f} tok/s"
                )
                loss_history.append(avg_loss)
                running_loss = 0.0
        
        return loss_history
```

---

## 11. 从零实现 BERT 预训练

### 11.1 MLM 数据构建

```python
"""
BERT MLM 预训练数据构建器
"""

import random
import torch
from typing import List, Tuple


class MLMDataCollator:
    """
    BERT MLM 数据整理器。
    
    对每个 batch 动态创建 MLM 标签（动态 masking，RoBERTa 的改进）。
    动态 masking vs 静态 masking：
    - 静态：预处理时一次性确定 mask 位置，每个 epoch 看到相同的 mask
    - 动态：每次取样时重新随机选择 mask 位置，数据更多样
    """
    
    def __init__(
        self,
        vocab_size: int,
        mask_token_id: int = 103,
        special_token_ids: set = None,
        mask_prob: float = 0.15,
    ):
        self.vocab_size = vocab_size
        self.mask_token_id = mask_token_id
        self.special_token_ids = special_token_ids or {0, 101, 102}  # PAD, CLS, SEP
        self.mask_prob = mask_prob
    
    def __call__(self, batch: List[dict]) -> dict:
        """对一个 batch 应用 MLM masking"""
        input_ids = torch.stack([item["input_ids"] for item in batch])
        attention_mask = torch.stack([item["attention_mask"] for item in batch])
        token_type_ids = torch.stack([item.get("token_type_ids", 
                                               torch.zeros_like(item["input_ids"])) 
                                     for item in batch])
        
        masked_input, mlm_labels = self._mask_tokens(input_ids)
        
        return {
            "input_ids": masked_input,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids,
            "mlm_labels": mlm_labels,
        }
    
    def _mask_tokens(
        self, input_ids: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        对输入应用 80-10-10 masking 策略。
        
        Returns:
            masked_input: 被破坏后的输入
            labels: 原始 token（非 mask 位置设为 -100）
        """
        labels = input_ids.clone()
        masked_input = input_ids.clone()
        
        # 构建可 mask 的位置（排除特殊 token）
        probability_matrix = torch.full(input_ids.shape, self.mask_prob)
        for special_id in self.special_token_ids:
            probability_matrix.masked_fill_(input_ids == special_id, 0.0)
        
        # 采样决定 mask 位置
        masked_indices = torch.bernoulli(probability_matrix).bool()
        labels[~masked_indices] = -100  # 非 mask 位置不参与 loss
        
        # 80%: [MASK]
        replace_mask = torch.bernoulli(
            torch.full(input_ids.shape, 0.8)
        ).bool() & masked_indices
        masked_input[replace_mask] = self.mask_token_id
        
        # 10%: 随机 token（在剩余 20% 中的一半）
        random_mask = torch.bernoulli(
            torch.full(input_ids.shape, 0.5)
        ).bool() & masked_indices & ~replace_mask
        random_tokens = torch.randint(
            0, self.vocab_size, input_ids.shape, dtype=input_ids.dtype
        )
        masked_input[random_mask] = random_tokens[random_mask]
        
        # 剩余 10%: 保持不变
        
        return masked_input, labels
```

---

## 12. 使用 Hugging Face 加载与使用预训练模型

### 12.1 GPT-2 文本生成

```python
"""
使用 Hugging Face transformers 加载和使用预训练模型
"""

from transformers import GPT2LMHeadModel, GPT2Tokenizer, GPT2Config
import torch


def gpt2_text_generation():
    """GPT-2 文本生成示例"""
    
    # 加载预训练模型和分词器
    model_name = "gpt2"  # 可选: gpt2, gpt2-medium, gpt2-large, gpt2-xl
    tokenizer = GPT2Tokenizer.from_pretrained(model_name)
        model = GPT2LMHeadModel.from_pretrained(model_name)
    model.eval()
    
    # 编码输入
    prompt = "The future of artificial intelligence is"
    input_ids = tokenizer.encode(prompt, return_tensors="pt")
    
    # 生成文本
    with torch.no_grad():
        output = model.generate(
            input_ids,
            max_new_tokens=100,
            do_sample=True,           # 采样（而非贪心）
            temperature=0.8,          # 控制随机性
            top_k=50,                 # Top-K 过滤
            top_p=0.95,               # Nucleus Sampling
            repetition_penalty=1.2,   # 惩罚重复
            no_repeat_ngram_size=3,   # 禁止 3-gram 重复
            pad_token_id=tokenizer.eos_token_id,
        )
    
    # 解码输出
    generated_text = tokenizer.decode(output[0], skip_special_tokens=True)
    print(f"Generated text:\n{generated_text}")


def gpt2_perplexity():
    """计算 GPT-2 在给定文本上的困惑度"""
    
    tokenizer = GPT2Tokenizer.from_pretrained("gpt2")
    model = GPT2LMHeadModel.from_pretrained("gpt2")
    model.eval()
    
    text = "The quick brown fox jumps over the lazy dog."
    input_ids = tokenizer.encode(text, return_tensors="pt")
    
    with torch.no_grad():
        outputs = model(input_ids, labels=input_ids)
        # outputs.loss 是平均交叉熵 loss
        perplexity = torch.exp(outputs.loss)
    
    print(f"Text: {text}")
    print(f"Perplexity: {perplexity.item():.2f}")
    # 困惑度 ≈ 模型对每个 token 的平均"惊讶度"
    # PPL = exp(CE_loss) = exp(-1/T * Σ log P(x_t|x_<t))


### 12.2 BERT 特征提取与微调

```python
from transformers import BertModel, BertTokenizer, BertForSequenceClassification
from transformers import AdamW, get_linear_schedule_with_warmup
import torch


def bert_feature_extraction():
    """使用 BERT 提取文本特征"""
    
    tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
    model = BertModel.from_pretrained("bert-base-uncased")
    model.eval()
    
    text = "The movie was absolutely fantastic!"
    
    # 分词并编码
    inputs = tokenizer(
        text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=128,
    )
    
    with torch.no_grad():
        outputs = model(**inputs)
    
    # outputs.last_hidden_state: (1, seq_len, 768) — 每个 token 的表示
    # outputs.pooler_output: (1, 768) — [CLS] 的池化表示
    
    # 三种获取句子表示的方式
    # 方式 1: [CLS] token
    cls_embedding = outputs.last_hidden_state[:, 0, :]
    
    # 方式 2: Mean pooling（通常效果最好）
    attention_mask = inputs["attention_mask"].unsqueeze(-1).float()
    mean_embedding = (outputs.last_hidden_state * attention_mask).sum(1) / attention_mask.sum(1)
    
    # 方式 3: Pooler output（BERT 的 pooler = Linear + Tanh on [CLS]）
    pooler_embedding = outputs.pooler_output
    
    print(f"CLS embedding shape: {cls_embedding.shape}")      # (1, 768)
    print(f"Mean embedding shape: {mean_embedding.shape}")    # (1, 768)


def bert_fine_tuning_example():
    """BERT 微调示例（情感分类）"""
    
    # 加载带分类头的 BERT
    model = BertForSequenceClassification.from_pretrained(
        "bert-base-uncased",
        num_labels=2,  # 正面/负面
    )
    tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
    
    # 微调超参数（BERT 论文推荐）
    optimizer = AdamW(model.parameters(), lr=2e-5, weight_decay=0.01)
    
    # 模拟一个训练步
    texts = ["I love this movie!", "This was terrible."]
    labels = torch.tensor([1, 0])  # 1=正面, 0=负面
    
    inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True)
    
    model.train()
    outputs = model(**inputs, labels=labels)
    loss = outputs.loss
    logits = outputs.logits
    
    loss.backward()
    optimizer.step()
    
    print(f"Loss: {loss.item():.4f}")
    print(f"Predictions: {logits.argmax(dim=-1).tolist()}")
```

---

## 13. 预训练的规模定律（Scaling Laws）

### 13.1 Kaplan Scaling Laws（2020）

OpenAI 的 Kaplan 等人发现，语言模型的测试 loss 与三个因素呈现平滑的幂律关系：

```
L(N) ∝ N^(-0.076)    模型参数数 N
L(D) ∝ D^(-0.095)    训练数据量 D (token 数)
L(C) ∝ C^(-0.050)    计算量 C (FLOPs)
```

核心发现：

1. **平滑性**：loss 下降极其平滑（在 5 个数量级上！），几乎没有 phase transition
2. **可预测性**：可以通过小模型的 loss 曲线准确预测大模型的最终 loss
3. **计算最优分配**：固定计算预算时，应将大部分算力分配给"更大的模型+更少的数据"而非"更小的模型+更多的数据"

### 13.2 Chinchilla Scaling Laws（2022）

DeepMind 的 Hoffmann 等人修正了 Kaplan 的结论：

**核心修正**：最优模型大小和训练数据量应该等比例增长。

```
Chinchilla 最优：训练 token 数 ≈ 20 × 模型参数数

对于 N 参数的模型，最优训练 token 数 D ≈ 20N

例如：
- 1B 模型 → 20B token
- 10B 模型 → 200B token
- 70B 模型 → 1.4T token
```

这一发现意味着 GPT-3（175B 参数，300B token）严重"训练不足"——按 Chinchilla 法则，它应该用 3.5T token 训练。Chinchilla（70B 参数，1.4T token）虽然参数量只有 GPT-3 的 40%，但由于训练更充分，性能反而更好。

### 13.3 Scaling Laws 的实际影响

```python
"""
Scaling Laws 预测器：根据幂律关系估算模型性能和计算需求
"""

import math


def predict_loss(
    N: float = None,  # 参数量
    D: float = None,  # 训练 token 数
    C: float = None,  # 计算量 (FLOPs)
) -> dict:
    """
    使用 Chinchilla scaling laws 预测 loss。
    
    公式（Chinchilla 论文的参数化形式）：
    L(N, D) = E + A/N^α + B/D^β
    
    其中 E ≈ 1.69（不可约损失，由数据本身的熵决定）
         A ≈ 406.4, α ≈ 0.34
         B ≈ 410.7, β ≈ 0.28
    """
    E = 1.69       # 不可约损失（数据熵下界）
    A = 406.4      # 模型规模系数
    alpha = 0.34   # 模型规模指数
    B = 410.7      # 数据规模系数
    beta = 0.28    # 数据规模指数
    
    results = {}
    
    if N is not None and D is not None:
        loss = E + A / (N ** alpha) + B / (D ** beta)
        results["predicted_loss"] = loss
        results["predicted_ppl"] = math.exp(loss)
    
    if N is not None and D is None:
        # Compute-optimal: D ≈ 20N (Chinchilla rule)
        D_optimal = 20 * N
        results["optimal_tokens"] = D_optimal
        loss = E + A / (N ** alpha) + B / (D_optimal ** beta)
        results["optimal_loss"] = loss
    
    if C is not None:
        # 给定计算预算，计算最优 N 和 D
        # 近似: C ≈ 6ND (前向+反向≈6倍参数量×数据量)
        # Chinchilla optimal: D = 20N → C = 6N * 20N = 120N²
        N_optimal = math.sqrt(C / 120)
        D_optimal = 20 * N_optimal
        results["optimal_N"] = N_optimal
        results["optimal_D"] = D_optimal
        results["compute_budget"] = C
    
    return results


# 实际案例分析
examples = [
    ("GPT-3", 175e9, 300e9),
    ("Chinchilla", 70e9, 1.4e12),
    ("LLaMA-2 70B", 70e9, 2e12),
    ("LLaMA-3 70B", 70e9, 15e12),  # 远超 Chinchilla optimal
]

for name, N, D in examples:
    result = predict_loss(N=N, D=D)
    chinchilla_optimal_D = 20 * N
    ratio = D / chinchilla_optimal_D
    print(f"{name:15s} | N={N/1e9:.0f}B | D={D/1e12:.1f}T | "
          f"D/D_optimal={ratio:.1f}x | Loss≈{result['predicted_loss']:.3f}")
```

### 13.4 超越 Chinchilla：推理时计算

2024 年的趋势是"过度训练"（Over-training）：用远超 Chinchilla 最优的数据量训练较小模型，因为推理成本与模型大小正相关，而训练是一次性的。

```
LLaMA-3 8B: 15T token（Chinchilla 建议仅 160B）→ 93.75x over-trained
动机: 8B 模型推理极快，适合部署；用更多数据弥补参数不足
```

---

## 14. 后 GPT/BERT 时代的预训练模型

### 14.1 模型族谱

```
GPT 路线（Decoder-only, Autoregressive）:
GPT-1 → GPT-2 → GPT-3 → InstructGPT → GPT-4
                       → LLaMA → LLaMA-2 → LLaMA-3
                       → PaLM → PaLM-2 → Gemini
                       → Mistral → Mixtral
                       → Qwen → Qwen-2

BERT 路线（Encoder-only, Autoencoding）:
BERT → RoBERTa → DeBERTa → DeBERTa-v3
     → ALBERT → ELECTRA
     → MacBERT → Chinese-BERT-wwm

Encoder-Decoder 路线（Seq2Seq）:
T5 → mT5 → Flan-T5
BART → mBART
```

### 14.2 关键演进方向

| 方向 | 代表工作 | 核心创新 |
|------|---------|---------|
| 指令对齐 | InstructGPT, RLHF | 人类反馈强化学习对齐模型行为 |
| 高效架构 | Mistral (SWA + GQA) | 滑动窗口注意力 + 分组查询注意力 |
| 长上下文 | LongFormer, YaRN | 线性注意力 / 位置编码外推 |
| 混合专家 | Mixtral, Switch-T | 条件计算，稀疏激活 |
| 多模态 | GPT-4V, LLaVA | 视觉-语言联合预训练 |
| 位置编码 | RoPE (LLaMA) | 旋转位置编码，更好的外推性 |
| 开源生态 | LLaMA, Mistral | 开放权重推动社区创新 |

### 14.3 位置编码演进

```python
"""
RoPE (Rotary Position Embedding) — 现代 LLM 的标配位置编码
"""

import torch
import math


def compute_rope_frequencies(d_head: int, max_len: int = 8192, base: float = 10000.0):
    """
    计算 RoPE 的旋转频率。
    
    RoPE 的核心思想：
    1. 将位置信息编码为旋转角度
    2. 两个位置的内积只依赖于它们的相对距离
    3. 因此天然具有相对位置编码的性质
    
    公式: freq_i = 1 / (base^(2i/d))，i = 0, 1, ..., d/2-1
    """
    freqs = 1.0 / (base ** (torch.arange(0, d_head, 2).float() / d_head))
    positions = torch.arange(max_len).float()
    # 外积：(max_len, d_head/2)，每个位置对应一组旋转角度
    angles = torch.outer(positions, freqs)
    return angles


def apply_rope(q: torch.Tensor, k: torch.Tensor, angles: torch.Tensor):
    """
    对 Q, K 应用 RoPE。
    
    对每对相邻维度 (x, y)，应用旋转矩阵：
    [cos θ  -sin θ] [x]   [x cos θ - y sin θ]
    [sin θ   cos θ] [y] = [x sin θ + y cos θ]
    
    Args:
        q, k: (batch, n_heads, seq_len, d_head)
        angles: (seq_len, d_head/2)
    """
    seq_len = q.shape[2]
    angles = angles[:seq_len]  # 截取到当前序列长度
    
    cos = torch.cos(angles).unsqueeze(0).unsqueeze(0)  # (1, 1, T, d_head/2)
    sin = torch.sin(angles).unsqueeze(0).unsqueeze(0)
    
    def rotate(x):
        # 将 d_head 维度拆成两半
        x1 = x[..., :x.shape[-1]//2]  # 前半
        x2 = x[..., x.shape[-1]//2:]  # 后半
        # 旋转
        rotated = torch.cat([x1 * cos - x2 * sin, x1 * sin + x2 * cos], dim=-1)
        return rotated
    
    return rotate(q), rotate(k)


# RoPE vs 其他位置编码的对比
# ============================================
# | 方法           | 相对位置 | 可外推 | 计算方式        |
# |---------------|---------|--------|----------------|
# | 绝对可学习     | 否      | 否     | 查表加法        |
# | Sinusoidal    | 否      | 有限   | 正弦函数加法    |
# | ALiBi         | 是      | 是     | 注意力偏置      |
# | RoPE          | 是      | 有限*  | Q/K 旋转       |
# | YaRN          | 是      | 是     | RoPE + 频率缩放|
# ============================================
```

---

## 15. 预训练的工程实践

### 15.1 训练稳定性

大规模预训练中常见的不稳定问题及解决方案：

| 问题 | 现象 | 解决方案 |
|------|------|---------|
| Loss Spike | Loss 突然跳高几倍 | 降低学习率、增大 batch、梯度裁剪 |
| 梯度爆炸 | Grad norm 飙升 | 梯度裁剪 (max_norm=1.0)、Pre-Norm |
| 梯度消失 | 深层梯度为 0 | 残差连接、Pre-Norm、初始化缩放 |
| NaN/Inf | 数值溢出 | 使用 BF16 而非 FP16、降低学习率 |
| 振荡不收敛 | Loss 来回波动 | 增大 batch size、检查数据质量 |
| 过拟合小数据集 | 训练 loss 下降但验证 loss 上升 | 更多数据、增大 dropout |

### 15.2 检查点管理

```python
"""检查点保存与恢复策略"""

import os
import torch
from typing import Optional


class CheckpointManager:
    """
    训练检查点管理器。
    
    策略：
    - 每 N 步保存一次（如 1000 步）
    - 只保留最近 K 个检查点（如 5 个），避免磁盘爆满
    - 同时保留"里程碑"检查点（如每 10K 步），永不删除
    """
    
    def __init__(
        self,
        save_dir: str,
        max_checkpoints: int = 5,
        milestone_interval: int = 10000,
    ):
        self.save_dir = save_dir
        self.max_checkpoints = max_checkpoints
        self.milestone_interval = milestone_interval
        self.recent_paths = []
        os.makedirs(save_dir, exist_ok=True)
    
    def save(self, model, optimizer, step: int, loss: float, extra: dict = None):
        """保存检查点"""
        is_milestone = (step % self.milestone_interval == 0)
        
        ckpt = {
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "step": step,
            "loss": loss,
            **(extra or {}),
        }
        
        path = os.path.join(self.save_dir, f"ckpt_step{step}.pt")
        torch.save(ckpt, path)
        
        if is_milestone:
            print(f"[Checkpoint] Milestone saved at step {step}: {path}")
        else:
            self.recent_paths.append(path)
            # 删除旧的非里程碑检查点
            while len(self.recent_paths) > self.max_checkpoints:
                old_path = self.recent_paths.pop(0)
                if os.path.exists(old_path):
                    os.remove(old_path)
    
    def load_latest(self, model, optimizer) -> Optional[int]:
        """加载最新检查点（用于恢复训练）"""
        ckpts = sorted(
            [f for f in os.listdir(self.save_dir) if f.startswith("ckpt_")],
            key=lambda x: int(x.split("step")[1].split(".")[0]),
        )
        if not ckpts:
            return None
        
        path = os.path.join(self.save_dir, ckpts[-1])
        ckpt = torch.load(path, map_location="cpu")
        model.load_state_dict(ckpt["model_state_dict"])
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        print(f"[Checkpoint] Resumed from step {ckpt['step']}, loss={ckpt['loss']:.4f}")
        return ckpt["step"]
```

### 15.3 监控与告警

预训练过程中需要监控的关键指标：

| 指标 | 健康范围 | 异常信号 |
|------|---------|---------|
| Training Loss | 平滑下降 | 突然跳升、长时间停滞 |
| Gradient Norm | 0.1-10.0 | >100 梯度爆炸；<0.001 梯度消失 |
| Learning Rate | 按预设 schedule | 意外为 0 |
| GPU 利用率 | >90% | <50% 说明数据加载瓶颈 |
| GPU 显存 | 稳定 | 持续增长说明内存泄漏 |
| Token 吞吐量 | 稳定 | 大幅波动说明有 straggler 节点 |
| Validation Loss | 缓慢下降 | 上升说明过拟合 |

---

## 16. 常见坑与最佳实践

### 16.1 预训练常见错误

| 错误 | 后果 | 正确做法 |
|------|------|---------|
| 学习率太大 | 训练不稳定或发散 | BERT: 1e-4, GPT-3: 6e-5 |
| 不用 warmup | 初期 loss 爆炸 | 至少 warmup 1% 总步数 |
| FP16 不加 loss scaling | 梯度全为 0 | 使用 GradScaler 或改用 BF16 |
| 数据未 shuffle | 模型学到数据顺序的 bias | 按文档级别充分打乱 |
| 序列拼接时忽略文档边界 | 模型将不相关文本当做连续 | 在文档边界处添加 [SEP] 或重新计算注意力掩码 |
| 评测集泄露到训练数据 | 虚高的评测指标 | n-gram 去污染 |
| 单一数据来源 | 模型能力偏科 | 多源混合采样 |
| 不做梯度裁剪 | 偶尔的坏 batch 导致训练崩溃 | grad_norm clip = 1.0 |

### 16.2 微调最佳实践

| 实践 | 理由 | 建议值 |
|------|------|--------|
| 学习率远小于预训练 | 避免破坏已学知识 | 2e-5 ~ 5e-5 |
| 只微调几个 epoch | 防止在小数据上过拟合 | 2-4 epochs |
| Layer-wise LR decay | 底层（通用特征）更新更少 | decay=0.95/层 |
| 先冻结再解冻（渐进微调） | 避免初期大梯度破坏底层 | 前几百步冻结 encoder |
| 使用任务特定的序列长度 | 节省计算，避免过多 padding | 按任务最大需求设 |
| 评估用多个随机种子 | BERT 微调方差较大 | 至少 3-5 次 |

### 16.3 选择预训练模型的决策树

```
你需要什么？
├── 文本生成（对话/创作/代码/推理）
│   ├── 需要 SOTA 能力 → GPT-4 / Claude / Gemini (API)
│   ├── 需要开源自部署 → LLaMA-3 / Qwen-2 / Mistral
│   └── 边缘设备 → Phi-3 Mini / LLaMA-3 8B 量化
│
├── 文本理解（分类/匹配/NER/问答）
│   ├── 追求极致性能 → DeBERTa-v3 large 微调
│   ├── 平衡性能与速度 → BERT-base / RoBERTa-base 微调
│   └── 低延迟线上部署 → DistilBERT / TinyBERT / ALBERT
│
├── 文本嵌入（搜索/检索/语义相似度）
│   ├── 英文 → sentence-transformers / E5 / GTE
│   └── 中文 → text2vec / BGE / M3E
│
└── 多语言
    ├── 理解 → XLM-RoBERTa / mDeBERTa
    └── 生成 → mT5 / BLOOM / Qwen
```

---

## 17. 复杂度分析

### 17.1 Transformer 的计算复杂度

| 组件 | 时间复杂度 | 空间复杂度 | 说明 |
|------|-----------|-----------|------|
| Self-Attention | O(T² · d) | O(T² + T · d) | T² 来自注意力矩阵 |
| FFN | O(T · d · d_ff) | O(T · d_ff) | 通常 d_ff = 4d |
| 单层总计 | O(T² · d + T · d²) | O(T² + T · d) | d² 来自 FFN |
| N 层总计 | O(N(T² · d + T · d²)) | O(N · T² + N · T · d) | |

**瓶颈分析**：

- 当 T << d 时（短序列，如 BERT 的 512），FFN 的 O(T · d²) 占主导 → 计算密集
- 当 T >> d 时（长序列，如 GPT-4 的 128K），Attention 的 O(T²·d) 占主导 → 显存密集

### 17.2 预训练的计算量估算

```
总 FLOPs ≈ 6 × N × D

其中：
- N = 模型参数数
- D = 训练 token 数
- 6 = 前向传播(2) + 反向传播(4) 的乘数

例如：
- BERT-base: 6 × 110M × 137B ≈ 9 × 10^19 FLOPs ≈ 90 ExaFLOPs
  (实际约 3.3 × 10^18，因为只训练了 3.3B token × 40 epoch ≈ 132B token)
  
- GPT-3: 6 × 175B × 300B ≈ 3.15 × 10^23 FLOPs
  约需 1024 A100 训练 34 天

- LLaMA-3 70B: 6 × 70B × 15T ≈ 6.3 × 10^24 FLOPs
```

### 17.3 推理效率对比

| 模型 | 首 token 延迟 | 生成速度 (tok/s) | 显存占用 |
|------|--------------|-----------------|---------|
| BERT-base | 5ms（整句） | N/A（非生成） | ~0.5GB |
| GPT-2 (1.5B) | 50ms | ~50 | ~3GB |
| LLaMA-2 7B (FP16) | 100ms | ~30 | ~14GB |
| LLaMA-2 70B (FP16) | 500ms | ~10 | ~140GB |
| GPT-4 (API) | 200-500ms | ~40 | N/A |

GPT 类模型的 KV-Cache：
- 首次 prompt 处理: O(T_prompt × d)
- 每个新 token 生成: O(d)（只需一次前向）
- KV-Cache 显存: O(N_layers × T × d_head × n_heads × 2)

---

## 18. 面试题精选与解析

### 18.1 基础概念题

**Q1: BERT 的 [CLS] token 有什么特殊含义？为什么用它做句子级任务？**

A: [CLS] 是 BERT 输入的第一个特殊 token。由于 Transformer 的全连接注意力，[CLS] 的最终隐藏状态可以聚合整个序列的信息。但它并不是"天然"的句子表示——它之所以有效，是因为 NSP 任务让 [CLS] 的输出被训练来判断句对关系，从而学会了句子级的语义聚合。在实际应用中，Mean Pooling 通常比直接用 [CLS] 效果更好（尤其在语义相似度任务上），因为它不依赖 NSP 训练信号。

**Q2: 为什么 GPT 不能做双向注意力？如果让 GPT 做双向会怎样？**

A: GPT 的训练目标是预测下一个 token P(x_t|x_{<t})。如果允许双向注意力，位置 t 的表示可以直接"看到"位置 t 的 token（通过从右侧传递的信息），这使得预测任务变得平凡（直接抄答案），模型学不到有用的表示。而 BERT 通过 masking 绕开了这个问题——被 mask 的位置没有原始 token 信息可以抄。

**Q3: 解释 BERT 中 80-10-10 masking 策略的设计理由。如果改成 100-0-0 会怎样？**

A: 100-0-0（全部替换为 [MASK]）会导致严重的预训练-微调不一致：模型只在"输入中有 [MASK] 标记"时学会预测，但微调时输入中没有 [MASK]。10% 随机替换迫使模型不完全信任输入（像一个鲁棒的去噪器），10% 保持不变让模型学会在输入正确时也能给出正确预测。实验表明，这个比例对最终性能有 ~0.5% 的影响，不是特别敏感，但完全不做这个处理会有明显退化。

### 18.2 进阶分析题

**Q4: 为什么 GPT 路线最终胜过了 BERT 路线成为主流？从技术和工程角度分析。**

A:

技术层面：(1) 生成是更通用的能力，所有任务都可以用文本生成的形式统一建模；(2) 自回归目标每个 token 都提供训练信号（100% 利用率），而 MLM 只有 15%，大规模训练时自回归的数据效率更高；(3) In-Context Learning 使得无需微调就能适应新任务，统一了使用接口；(4) KV-Cache 使自回归生成的推理效率很高。

工程层面：(1) 单一解码器架构比编码器+分类头的组合更简单；(2) Scaling Laws 在自回归模型上更平滑、可预测；(3) RLHF 等对齐技术在自回归模型上自然实现；(4) 统一的 API 接口简化了产品开发。

但 BERT 路线并未消亡——在需要低延迟、轻量级、高精度理解的场景（搜索、实体识别、文本嵌入）中仍是最佳选择。

**Q5: Scaling Laws 告诉我们什么？如果你有 $10M 预算训练模型，应该如何分配？**

A: Chinchilla Scaling Laws 告诉我们：固定计算预算下，模型大小和数据量应等比例增长（D ≈ 20N）。但 2024 年的实践发现，如果更关心推理效率（部署成本），应该"过度训练"较小模型——用更多数据训练更小的模型（如 LLaMA-3 8B 用 15T token），虽然训练成本不是 Chinchilla-optimal 的，但部署成本低得多。

具体分配：假设用 $10M 可以获得约 10^24 FLOPs 的算力，如果面向部署效率，可以选择 ~7B 模型 + 2-3T token；如果面向纯性能（如研究论文），选择 ~50-60B 模型 + 1T token。

**Q6: BERT 的 MLM 训练效率只有 15%，如何改进？**

A: 主要改进方案：(1) ELECTRA: 用小型生成器替换 token，然后让判别器判断每个位置是否被替换，所有 token 都参与训练（100% 效率），同等计算量下显著优于 BERT；(2) RoBERTa: 去除 NSP、动态 masking、更多数据、更大 batch，间接提升了训练效率；(3) Whole Word Masking / Span Masking: 增大 mask 粒度，每个 mask 位置提供更多信息；(4) 增大 mask 比例（如 40%）配合更激进的训练策略。

### 18.3 系统设计题

**Q7: 设计一个从零开始的 BERT 预训练系统，需要考虑哪些方面？**

A: 完整方案应涵盖：

数据准备：网页爬取 → 语言过滤 → 质量过滤 → 去重（精确+近似）→ 有害内容过滤 → 分词 → 预处理为训练格式。数据量建议 16GB+ 文本。

模型配置：根据计算预算选择规模。BERT-base (110M) 需约 4 天 × 4 TPU；BERT-large (340M) 需约 4 天 × 16 TPU。

训练策略：两阶段序列长度（128→512）、Adam(β1=0.9, β2=0.999)、线性 warmup + 线性衰减、动态 masking（RoBERTa 风格）、大 batch size (8K sequences)。

工程考虑：混合精度 (BF16)、ZeRO Stage 2 显存优化、梯度检查点、异步数据加载、检查点管理、监控告警。

评估方案：训练中监控 MLM accuracy 和 validation loss；阶段性在 GLUE 子集上评估微调效果。

**Q8: GPT 推理时 KV-Cache 是什么？如何计算其显存占用？**

A: 在自回归生成时，每生成一个新 token 都需要对之前所有 token 做注意力。如果不缓存，第 t 步需要重新编码 t 个 token（O(t) 次计算）。KV-Cache 将之前所有步的 Key 和 Value 缓存下来，每步只需计算新 token 的 Q·K^T，将复杂度从 O(T²) 降到 O(T)。

显存计算：
```
KV-Cache 大小 = 2 × n_layers × seq_len × n_heads × d_head × batch_size × 2 bytes(FP16)

例如 LLaMA-2 70B, batch=1, seq_len=4096:
= 2 × 80 × 4096 × 64 × 128 × 1 × 2 bytes
= 2 × 80 × 4096 × 8192 × 2
≈ 10.7 GB
```

这就是为什么长上下文 LLM 的显存瓶颈往往在 KV-Cache 而非模型参数。GQA（分组查询注意力，如 LLaMA-2 用 8 组 KV 对应 64 个 Q head）可以将 KV-Cache 缩小 8 倍。

---

## 19. 参考资料

### 核心论文

1. Radford, A., Narasimhan, K., Salimans, T., & Sutskever, I. (2018). *Improving Language Understanding by Generative Pre-Training*. (GPT-1)
2. Radford, A., Wu, J., Child, R., Luan, D., Amodei, D., & Sutskever, I. (2019). *Language Models are Unsupervised Multitask Learners*. (GPT-2)
3. Brown, T. B., et al. (2020). *Language Models are Few-Shot Learners*. NeurIPS 2020. (GPT-3)
4. Devlin, J., Chang, M.-W., Lee, K., & Toutanova, K. (2019). *BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding*. NAACL 2019.
5. Liu, Y., et al. (2019). *RoBERTa: A Robustly Optimized BERT Pretraining Approach*.
6. Clark, K., Luong, M.-T., Le, Q. V., & Manning, C. D. (2020). *ELECTRA: Pre-training Text Encoders as Discriminators Rather Than Generators*. ICLR 2020.
7. Kaplan, J., et al. (2020). *Scaling Laws for Neural Language Models*.
8. Hoffmann, J., et al. (2022). *Training Compute-Optimal Large Language Models*. (Chinchilla)
9. Touvron, H., et al. (2023). *LLaMA: Open and Efficient Foundation Language Models*.
10. Vaswani, A., et al. (2017). *Attention is All You Need*. NeurIPS 2017.

### 推荐学习资源

- Andrej Karpathy: *Let's build GPT from scratch* (YouTube, 2023)
- Jay Alammar: *The Illustrated Transformer / BERT / GPT-2* (Blog)
- Lilian Weng: *The Transformer Family* (Blog, lilianweng.github.io)
- Hugging Face NLP Course: https://huggingface.co/learn/nlp-course
- Stanford CS224N: Natural Language Processing with Deep Learning

### 开源实现

- nanoGPT (Andrej Karpathy): 极简 GPT 训练代码 (~300 行)
- minGPT (Karpathy): GPT 的教学实现
- HuggingFace Transformers: 工业级预训练模型库
- Megatron-LM (NVIDIA): 大规模模型并行训练框架
- DeepSpeed (Microsoft): ZeRO 优化器和训练工具
- LitGPT (Lightning AI): 多种 LLM 的统一训练/微调框架

---

> **本文总结**：预训练是现代 NLP 的基石，GPT（自回归）和 BERT（自编码）代表了两条互补的技术路线。GPT 通过因果语言模型获得了强大的生成能力，在规模化后展现出惊人的涌现现象；BERT 通过双向 MLM 实现了更深度的语言理解，在分类和信息抽取任务上仍是轻量级部署的首选。理解两者的设计哲学、训练策略和适用场景，是掌握现代 LLM 技术的基础。
