# 监督微调（SFT）详解

> **关键词**：监督微调（Supervised Fine-Tuning, SFT）、指令微调（Instruction Tuning）、对话微调（Chat Fine-Tuning）、全参数微调（Full Fine-Tuning）、损失函数掩码（Loss Masking）、数据配比（Data Mixing）、过拟合（Overfitting）、灾难性遗忘（Catastrophic Forgetting）
>
> **前置知识**：[07-预训练（GPT与BERT）](./07-预训练（GPT与BERT）.md)、[04-Transformer架构详解](./04-Transformer架构详解.md)、[01-神经网络与反向传播基础](./01-神经网络与反向传播基础.md)
>
> **代码环境**：Python 3.10+、PyTorch 2.x、transformers 4.x、datasets、trl、peft、accelerate

---

## 目录

1. [什么是监督微调（SFT）](#1-什么是监督微调sft)
2. [为什么需要 SFT：预训练模型的局限性](#2-为什么需要-sft预训练模型的局限性)
3. [SFT 在大模型训练流程中的位置](#3-sft-在大模型训练流程中的位置)
4. [SFT 的数学原理](#4-sft-的数学原理)
5. [SFT 数据工程](#5-sft-数据工程)
6. [全参数微调的实现](#6-全参数微调的实现)
7. [从零实现一个完整的 SFT 训练流程](#7-从零实现一个完整的-sft-训练流程)
8. [使用 Hugging Face TRL 进行 SFT](#8-使用-hugging-face-trl-进行-sft)
9. [多轮对话微调](#9-多轮对话微调)
10. [SFT 的关键训练技巧](#10-sft-的关键训练技巧)
11. [灾难性遗忘与缓解策略](#11-灾难性遗忘与缓解策略)
12. [SFT 的评估方法](#12-sft-的评估方法)
13. [SFT 与其他微调范式的对比](#13-sft-与其他微调范式的对比)
14. [工程实践与生产部署](#14-工程实践与生产部署)
15. [常见坑与最佳实践](#15-常见坑与最佳实践)
16. [面试题精选与解析](#16-面试题精选与解析)
17. [参考资料](#17-参考资料)

---

## 1. 什么是监督微调（SFT）

### 1.1 定义

监督微调（Supervised Fine-Tuning, SFT）是指在一个已经完成预训练的大语言模型基础上，使用人工标注的「输入-输出」配对数据（即有监督数据），继续训练模型以使其学会按照人类期望的方式生成回答。

形式化定义：给定一个预训练模型 $f_\theta$（参数为 $\theta$），以及一个有监督数据集 $\mathcal{D}_{sft} = \{(x_i, y_i)\}_{i=1}^N$，其中 $x_i$ 为输入指令/问题，$y_i$ 为期望的输出回答，SFT 的目标是：

$$\theta^* = \arg\min_\theta \sum_{i=1}^N \mathcal{L}(f_\theta(x_i), y_i)$$

其中 $\mathcal{L}$ 通常为交叉熵损失（Cross-Entropy Loss），在自回归模型中对应负对数似然（Negative Log-Likelihood）。

### 1.2 SFT 的本质：行为克隆

从强化学习视角看，SFT 本质上是一种**行为克隆**（Behavioral Cloning）：模型通过模仿专家（人工标注者）的行为来学习在给定输入下应该产生什么样的输出。这与传统的模仿学习（Imitation Learning）有着深刻的联系：

- **专家策略**：人工标注者提供的 (指令, 回答) 对
- **学习策略**：模型通过最大似然估计拟合专家的输出分布
- **目标**：使模型在给定指令时，生成与人类标注者风格一致的回答

行为克隆的数学等价关系：

$$\pi_{SFT}(y|x) = \arg\min_\pi D_{KL}(\pi_{expert}(y|x) \| \pi(y|x))$$

即 SFT 模型学到的策略是与专家策略 KL 散度最小的策略。当专家数据为确定性映射（每个输入只有一个正确输出）时，这退化为标准的最大似然估计。

### 1.3 SFT 与传统微调的区别

传统微调（如 BERT 时代的 Fine-Tuning）通常指在预训练模型后面加一个任务特定的分类头，然后在特定任务数据上训练。SFT 特指大语言模型时代的范式，两者有本质区别：

| 维度 | 传统微调（BERT 时代） | SFT（LLM 时代） |
|------|----------------------|-----------------|
| 模型结构 | 预训练 Encoder + 任务分类头 | 纯 Decoder，不加额外头 |
| 输出形式 | 分类标签/回归值 | 自由文本生成 |
| 数据格式 | (文本, 标签) | (指令, 回答) 或对话 |
| 任务范围 | 单一任务（NER、情感分析等） | 通用指令遵循 |
| 训练目标 | 分类/回归 Loss | 自回归语言模型 Loss |
| 数据量级 | 几千~几十万 | 几万~几百万 |
| 泛化目标 | 同任务不同样本 | 不同任务不同格式 |

### 1.4 指令微调（Instruction Tuning）

指令微调是 SFT 的一种重要形式，特指使用「指令-回答」格式的数据进行微调。其核心洞察来自 FLAN（Finetuned Language Net, Google 2022）和 InstructGPT（OpenAI 2022）：

> 通过在多样化的指令数据上微调，模型可以泛化到未见过的指令类型。

这是一种 **zero-shot 泛化** 能力：模型在训练时见过「翻译」「摘要」「问答」类任务，推理时面对一个新的任务类型（如「写诗」），也能正确理解和执行。

指令微调数据的典型格式：

```json
{
  "instruction": "请将以下英文翻译成中文",
  "input": "The quick brown fox jumps over the lazy dog.",
  "output": "敏捷的棕色狐狸跳过了那只懒狗。"
}
```

FLAN 的关键发现：在 60+ 个 NLP 任务上指令微调后，模型在未见任务上的 zero-shot 性能大幅提升，某些情况下甚至超过 few-shot prompting。

---

## 2. 为什么需要 SFT：预训练模型的局限性

### 2.1 预训练模型的能力与缺陷

预训练模型（如 GPT-3 基座、LLaMA 基座）虽然具备强大的语言知识和推理能力，但存在以下关键问题：

**问题一：能力存在但不可控**

预训练模型学会了世界知识，但它被训练为「预测下一个 token」而非「回答问题」。给它一个问题，它可能会继续生成更多问题而不是给出答案：

```
输入:  "What is the capital of France?"

GPT-3 基座输出: "What is the capital of Germany? What is the capital
of Italy? These are common geography questions that..."

SFT 模型输出:  "The capital of France is Paris. Paris is located in
the north-central part of France, along the Seine River."
```

**问题二：风格不可控**

基座模型可能输出冗长、离题、重复或格式混乱的文本，因为它学到的是互联网文本的分布，而互联网文本本身就风格各异。

**问题三：安全性缺失**

基座模型没有学会拒绝有害请求。由于预训练数据中包含各类内容，模型在面对有害问题时可能直接回答而不加拒绝。

**问题四：角色混乱**

基座模型不知道自己应该扮演什么角色。它可能像论文一样写作、像小说一样叙述，但不会像一个AI助手一样交互。

### 2.2 SFT 解决的核心问题

SFT 通过有监督数据教会模型四个关键能力：

**1. 指令遵循（Instruction Following）**

让模型理解「用户在问我问题，我需要回答」这个基本交互模式。无论指令多复杂（多步骤、有约束条件），模型都能解析并执行。

**2. 格式控制（Format Control）**

教会模型按照预期格式输出：Markdown 列表、JSON 结构、代码块、表格等。用户说「用JSON格式返回」时，模型确实输出合法的 JSON。

**3. 风格对齐（Style Alignment）**

统一输出风格：简洁、有帮助、客观、不冗余。训练数据中标注者的写作风格会被模型内化。

**4. 角色设定（Role Playing）**

让模型稳定扮演「AI 助手」角色：有礼貌地回应、适时表达不确定性、在需要时拒绝不当请求。

### 2.3 实验证据

**InstructGPT**（Ouyang et al., 2022）的核心发现：

- 1.3B 参数的 SFT 模型在人类偏好评估中优于 175B 的 GPT-3 基座
- 仅使用约 13,000 条标注数据即可显著提升模型的指令遵循能力
- 人类标注者以 85% 的概率偏好 SFT 模型的输出而非基座模型

**LIMA**（Zhou et al., 2023）进一步证明：

- 仅 1,000 条高质量 SFT 数据就能让 65B LLaMA 达到接近 GPT-4 的对话质量
- **数据质量远比数据数量重要**
- 提出了 Surface Alignment Hypothesis

**Alpaca**（Stanford, 2023）的贡献：

- 用 52K 条 GPT-3.5 生成的数据微调 7B LLaMA，成本仅 $500
- 证明了 SFT + 模型蒸馏的可行性
- 但也暴露了低质量合成数据的局限性

### 2.4 从信息论视角理解 SFT

从信息论角度，预训练模型学到了 $P(\text{text})$ 的分布。SFT 的作用是引入条件化：从 $P(\text{text})$ 转变为 $P(\text{response}|\text{instruction})$。

这个条件化过程只需要很少的数据，因为：
- 模型已经知道「什么是好的文本」（语法、逻辑、事实）
- 模型只需要学会「什么时候输出什么类型的文本」（格式、触发条件）

类比：一个博学的人已经知道所有知识，SFT 只是教他「当别人问你问题时，你应该简洁地回答，而不是写一篇论文」。

---

## 3. SFT 在大模型训练流程中的位置

### 3.1 三阶段训练范式

现代大语言模型的训练通常遵循三阶段流水线（以 InstructGPT / ChatGPT 为代表）：

```
阶段 1：预训练（Pre-training）
  数据：数万亿 token 的无标注互联网文本
  目标：下一 token 预测（自回归）
  习得：语言结构、世界知识、推理能力
  计算：数千~数万 GPU 天，数百万~数千万美元成本
         |
         v
阶段 2：监督微调（SFT）
  数据：数万~数百万条 (指令, 回答) 对
  目标：条件语言模型（只在回答部分计算 loss）
  习得：指令遵循、格式控制、角色扮演
  计算：数十~数百 GPU 天
         |
         v
阶段 3：人类反馈对齐（RLHF / DPO）
  数据：数万~数十万条偏好对比数据 (chosen, rejected)
  目标：使模型输出更符合人类偏好
  习得：输出质量排序、安全拒绝、细粒度偏好
  计算：数十~数百 GPU 天
```

### 3.2 各阶段的量化对比

| 维度 | 预训练 | SFT | RLHF/DPO |
|------|--------|-----|-----------|
| 数据量 | 1~15T tokens | 10K~1M 条 | 10K~500K 对 |
| 训练时长 | 数周~数月 | 数小时~数天 | 数小时~数天 |
| 学习率 | 1e-4 ~ 3e-4 | 1e-5 ~ 2e-5 | 1e-6 ~ 5e-6 |
| Epoch | 1~2 | 2~5 | 1~3 |
| 核心能力变化 | 从零学习语言 | 解锁交互能力 | 精调输出偏好 |
| 失败后果 | 模型完全不可用 | 不遵循指令 | 不够好但能用 |

### 3.3 表面对齐假说（Surface Alignment Hypothesis）

LIMA 论文提出了一个影响深远的假说：

> A model's knowledge and capabilities are learnt almost entirely during pretraining, while alignment teaches it which subdistribution of formats should be used when interacting with users.

用通俗的话说：

- 预训练 = 学习「知道什么」（知识、推理、语言能力）
- SFT = 学习「怎么表达」（格式、风格、交互方式）

这意味着：
1. SFT 不应该（也不需要）教模型新知识
2. SFT 的数据量不需要很大（1K~100K 即可）
3. SFT 的数据质量（格式/风格一致性）比数量重要
4. 如果模型在某个领域表现差，问题出在预训练而非 SFT

### 3.4 SFT 作为 RLHF 的前置条件

在 InstructGPT/ChatGPT 的训练流程中，SFT 模型是后续阶段的基础：

```
Base Model --SFT数据--> SFT Model --偏好数据--> RLHF/DPO Model
                             |                       ^
                             |    +------------------+
                             v    |
                        生成候选回答 -> 人类排序 -> 训练 Reward Model
```

为什么不能跳过 SFT：
- 基座模型输出质量太差，人类无法有效排序
- RLHF 需要一个合理的起点（policy initialization）
- 从随机策略做 RL 收敛极慢且不稳定

### 3.5 新兴趋势：SFT 的简化与替代

近期研究出现了对 SFT 必要性的重新审视：

**Direct Alignment from Base（直接从基座对齐）**：一些研究尝试跳过独立的 SFT 阶段，直接对基座模型做 DPO。如 Zephyr-beta 的做法是将 SFT 和 DPO 数据合并训练。

**Pre-training with Alignment Data（在预训练中混入对齐数据）**：如 Qwen-2.5 在预训练后期混入少量高质量对话数据，减少对独立 SFT 阶段的依赖。

但目前主流实践仍然是分阶段训练，因为：
- 分阶段训练更可控、更易调试
- 不同阶段使用不同学习率和超参更合理
- 工业实践已证明分阶段方案的可靠性

---

## 4. SFT 的数学原理

### 4.1 自回归语言模型的条件生成

对于自回归语言模型，给定输入序列 $x = (x_1, ..., x_m)$（指令/prompt 部分）和目标输出序列 $y = (y_1, ..., y_n)$（回答部分），模型以自回归方式分解联合概率：

$$P(y|x; \theta) = \prod_{t=1}^n P(y_t | x_1, ..., x_m, y_1, ..., y_{t-1}; \theta)$$

每个位置的条件概率通过 softmax 计算：

$$P(y_t | \text{context}; \theta) = \text{softmax}(W_{lm} \cdot h_t + b_{lm})[y_t] = \frac{\exp(z_t[y_t])}{\sum_{v=1}^{|V|} \exp(z_t[v])}$$

其中：
- $h_t \in \mathbb{R}^d$ 是 Transformer 最后一层在位置 $t$ 的隐藏状态
- $W_{lm} \in \mathbb{R}^{|V| \times d}$ 是语言模型头（LM Head）的权重矩阵
- $z_t = W_{lm} \cdot h_t + b_{lm} \in \mathbb{R}^{|V|}$ 是 logits 向量
- $|V|$ 是词表大小

### 4.2 训练目标：条件负对数似然

SFT 的核心训练目标是最小化条件负对数似然（Conditional NLL）：

$$\mathcal{L}_{SFT}(\theta) = -\frac{1}{|\mathcal{D}|}\sum_{(x,y) \in \mathcal{D}} \frac{1}{|y|} \sum_{t=1}^{|y|} \log P(y_t | x, y_{<t}; \theta)$$

几个关键细节：

**长度归一化**：除以 $|y|$ 避免长回答主导梯度。某些实现不做归一化（如 Hugging Face 的 Trainer 默认对所有非 -100 的 token 取均值）。两种做法各有优劣：
- 有归一化：每条样本贡献相等，短回答和长回答权重相同
- 无归一化（按 token 平均）：相当于长回答有更大权重，可能更好地学习长文本生成

**与预训练 Loss 的关系**：预训练 Loss 是无条件的 $-\frac{1}{T}\sum_{t=1}^T \log P(s_t|s_{<t})$，对所有 token 计算。SFT Loss 只对回答部分计算，本质上是条件化的版本。

### 4.3 Loss Masking 的详细实现

Loss Masking 是 SFT 与普通语言模型训练的核心区别。实现方式是将指令部分的 label 设为 `ignore_index`（通常为 -100）：

```
完整序列:  [BOS] How do you sort a list in Python? [SEP] You can use sorted()... [EOS]
Token IDs:   1   1128  356  366  3349  264  1274  297 13160   2   887  541  938 ...  2
Labels:    -100  -100 -100 -100 -100  -100 -100 -100 -100  -100  887  541  938 ...  2
                                                                  ^
                                                       从这里开始计算 loss
```

PyTorch 的 `CrossEntropyLoss(ignore_index=-100)` 自动跳过 label 为 -100 的位置。

**为什么要做 Loss Masking？**

1. **避免学习生成指令**：如果对指令部分也计算 loss，模型会学习生成指令文本，这不是我们想要的
2. **聚焦学习回答生成**：所有梯度信号都来自「如何更好地生成回答」
3. **提高训练效率**：梯度只从有意义的 token 反传

**是否mask的消融实验**（来自多项研究的共识）：

| 策略 | 效果 |
|------|------|
| 只对回答计算 loss（标准做法） | 最佳指令遵循能力 |
| 对全序列计算 loss | 稍差，且可能生成指令文本 |
| 对回答+部分指令计算 loss | 某些场景略有帮助 |

### 4.4 Packing 策略与注意力掩码

#### 4.4.1 为什么需要 Packing

GPU 在处理 batch 内所有序列时，以最长序列为基准进行 padding。如果 batch 内序列长度差异大，大量计算浪费在 padding token 上。

Packing 的核心思想是将多条短序列拼接到一个固定长度的序列中，大幅提高 GPU 利用率（从 30-50% 提升到 90%+）。

#### 4.4.2 Packing 的注意力掩码

拼接后的多个样本之间不应互相注意，需要使用 Block-diagonal Attention Mask：

```python
import torch
from typing import List

def create_block_causal_mask(sample_lengths: List[int], total_length: int) -> torch.Tensor:
    """
    为 Packing 场景创建 block-diagonal causal attention mask

    每个样本内部是标准因果掩码（下三角），样本间完全不可见。

    Args:
        sample_lengths: 每个样本的 token 长度列表
        total_length: padding 后的总长度

    Returns:
        mask: (total_length, total_length) 的布尔掩码，True 表示可注意
    """
    mask = torch.zeros(total_length, total_length, dtype=torch.bool)

    start = 0
    for length in sample_lengths:
        end = start + length
        # 在样本内部区域创建因果掩码（下三角）
        causal_block = torch.tril(torch.ones(length, length, dtype=torch.bool))
        mask[start:end, start:end] = causal_block
        start = end

    return mask


# 示例：3 个样本拼接
sample_lens = [4, 3, 5]  # 三个样本长度分别为 4, 3, 5
total_len = sum(sample_lens)  # = 12
mask = create_block_causal_mask(sample_lens, total_len)
```

#### 4.4.3 Position IDs 重置

Packing 时还需要重置 position IDs，每个样本从 0 开始计数：

```python
def create_packing_position_ids(sample_lengths: List[int]) -> torch.Tensor:
    """为 Packing 序列生成 position IDs"""
    position_ids = []
    for length in sample_lengths:
        position_ids.extend(range(length))
    return torch.tensor(position_ids, dtype=torch.long)

# 样本长度 [4, 3, 5]
# Position IDs: [0, 1, 2, 3, 0, 1, 2, 0, 1, 2, 3, 4]
```

### 4.5 梯度分析与优化动力学

#### 4.5.1 单 token 梯度

对于 softmax + 交叉熵的组合，关于 logits $z_t$ 的梯度有解析形式：

$$\frac{\partial \mathcal{L}_t}{\partial z_t[k]} = P(k|\text{context};\theta) - \mathbb{1}[k = y_t]$$

- 当 $k = y_t$（正确 token）：梯度为 $p_k - 1 < 0$（减小 loss -> 增大该 token 概率）
- 当 $k \neq y_t$（错误 token）：梯度为 $p_k > 0$（减小 loss -> 减小该 token 概率）
- 模型越确信（$p_{y_t} \to 1$），梯度越小 -> 自动聚焦于不确定的 token

#### 4.5.2 SFT 的优化景观特点

相比预训练，SFT 的优化有以下特点：

1. **更小的学习率**：预训练通常用 1e-4 ~ 3e-4，SFT 用 1e-5 ~ 2e-5。因为模型已在较好的参数区域，大学习率会破坏已学知识。

2. **更少的训练步数**：通常 1~5 个 epoch。过度训练会导致过拟合和灾难性遗忘。

3. **更平坦的 Loss 曲线**：SFT 的 loss 从较低起点开始（模型已有语言能力），下降幅度比预训练小得多（如从 2.5 降到 1.5，而预训练可能从 10 降到 2.5）。

4. **梯度范数更小**：由于起点已较优，梯度天然较小，不需要激进的 warmup。

---

## 5. SFT 数据工程

### 5.1 数据格式规范

#### 5.1.1 Alpaca 格式（最简单的单轮格式）

```json
[
  {
    "instruction": "将下面的英文句子翻译成中文。",
    "input": "Artificial intelligence is transforming every industry.",
    "output": "人工智能正在改变每一个行业。"
  },
  {
    "instruction": "写一个 Python 函数，计算斐波那契数列的第 n 项。",
    "input": "",
    "output": "def fibonacci(n: int) -> int:\n    if n <= 1:\n        return n\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b"
  }
]
```

#### 5.1.2 对话格式（多轮，业界主流）

```json
{
  "messages": [
    {"role": "system", "content": "你是一个专业的编程助手，擅长 Python 和算法。"},
    {"role": "user", "content": "什么是动态规划？"},
    {"role": "assistant", "content": "动态规划（Dynamic Programming, DP）是一种将复杂问题分解为重叠子问题的算法设计方法..."},
    {"role": "user", "content": "能给我一个具体的例子吗？比如爬楼梯问题？"},
    {"role": "assistant", "content": "当然！爬楼梯问题是经典的 DP 入门题..."}
  ]
}
```

#### 5.1.3 Chat Template 详解

不同模型使用不同的特殊 token 标记对话结构。正确应用 chat template 是 SFT 的关键步骤：

**Llama-2-Chat 模板**：
```
<s>[INST] <<SYS>>
{system_prompt}
<</SYS>>

{user_message_1} [/INST] {assistant_response_1} </s><s>[INST] {user_message_2} [/INST]
```

**ChatML（用于 Qwen、Yi 等）**：
```
<|im_start|>system
{system_prompt}<|im_end|>
<|im_start|>user
{user_message_1}<|im_end|>
<|im_start|>assistant
{assistant_response_1}<|im_end|>
```

**Llama-3 模板**：
```
<|begin_of_text|><|start_header_id|>system<|end_header_id|>

{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>

{user_message}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

{assistant_response}<|eot_id|>
```

使用 Hugging Face tokenizer 自动应用模板：

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3-8B-Instruct")

messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is Python?"},
]

# 自动应用该模型的 chat template
formatted = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True  # 添加 assistant 前缀，触发生成
)
print(formatted)
```

### 5.2 数据质量的核心地位

#### 5.2.1 LIMA 的震撼结论

| 配置 | 数据量 | 来源 | 效果 |
|------|--------|------|------|
| LIMA | 1,000 | 人工精选 SO/wikiHow | 接近 GPT-4 |
| Alpaca | 52,000 | GPT-3.5 自动生成 | 一般 |
| Vicuna v1.5 | 125,000 | ShareGPT | 优秀 |

1000 条精选数据超过 52000 条普通数据，说明数据工程的核心是**质量而非规模**。

#### 5.2.2 高质量 SFT 数据的六大标准

**1. 正确性（Correctness）**：事实无误，代码可执行，数学准确

**2. 一致性（Consistency）**：风格一致，格式统一，无矛盾

**3. 完整性（Completeness）**：覆盖问题所有方面，不留悬念

**4. 适度性（Appropriate Length）**：简单问题短回答，复杂问题长回答

**5. 多样性（Diversity）**：覆盖不同任务类型、难度级别、输出格式

**6. 安全性（Safety）**：包含拒绝有害请求的示范样本

#### 5.2.3 数据质量过滤 Pipeline

```python
"""
完整的 SFT 数据质量过滤管线
包含：长度过滤、去重、质量打分、安全过滤
"""

import re
import hashlib
from typing import List, Dict, Tuple
from collections import Counter

class SFTDataQualityFilter:
    """多阶段 SFT 数据质量过滤器"""

    def __init__(self, config: Dict = None):
        self.config = config or {
            "min_instruction_chars": 10,
            "max_instruction_chars": 2000,
            "min_output_chars": 20,
            "max_output_chars": 8000,
            "min_output_words": 10,
            "max_repetition_ratio": 0.4,
            "min_unique_trigram_ratio": 0.5,
        }
        self.stats = Counter()

    def filter(self, dataset: List[Dict]) -> Tuple[List[Dict], Dict]:
        """执行完整过滤管线"""
        # 阶段 1: 基础格式检查
        data = self._filter_format(dataset)
        # 阶段 2: 长度过滤
        data = self._filter_length(data)
        # 阶段 3: 精确去重
        data = self._dedup_exact(data)
        # 阶段 4: 模糊去重（Jaccard 相似度）
        data = self._dedup_fuzzy(data)
        # 阶段 5: 质量评分过滤
        data = self._filter_quality(data)

        self.stats["final_count"] = len(data)
        return data, dict(self.stats)

    def _filter_format(self, data: List[Dict]) -> List[Dict]:
        """检查数据格式完整性"""
        filtered = []
        for item in data:
            if "instruction" not in item or "output" not in item:
                self.stats["format_rejected"] += 1
                continue
            if not item["instruction"].strip() or not item["output"].strip():
                self.stats["format_rejected"] += 1
                continue
            filtered.append(item)
        return filtered

    def _filter_length(self, data: List[Dict]) -> List[Dict]:
        """长度过滤"""
        filtered = []
        cfg = self.config
        for item in data:
            inst_len = len(item["instruction"])
            out_len = len(item["output"])
            out_words = len(item["output"].split())
            if (cfg["min_instruction_chars"] <= inst_len <= cfg["max_instruction_chars"]
                and cfg["min_output_chars"] <= out_len <= cfg["max_output_chars"]
                and out_words >= cfg["min_output_words"]):
                filtered.append(item)
            else:
                self.stats["length_rejected"] += 1
        return filtered

    def _dedup_exact(self, data: List[Dict]) -> List[Dict]:
        """精确去重（基于指令的 MD5 哈希）"""
        seen = set()
        filtered = []
        for item in data:
            key = hashlib.md5(
                item["instruction"].strip().lower().encode()
            ).hexdigest()
            if key not in seen:
                seen.add(key)
                filtered.append(item)
            else:
                self.stats["exact_dedup_rejected"] += 1
        return filtered

    def _dedup_fuzzy(self, data: List[Dict], threshold: float = 0.7) -> List[Dict]:
        """模糊去重（基于 Jaccard 相似度）"""
        def get_shingles(text: str, k: int = 3) -> set:
            words = text.lower().split()
            return set(tuple(words[i:i+k]) for i in range(len(words) - k + 1))

        filtered = []
        shingle_cache = []

        for item in data:
            current = get_shingles(item["instruction"])
            is_dup = False
            for prev in shingle_cache[-1000:]:
                if not current or not prev:
                    continue
                jaccard = len(current & prev) / len(current | prev)
                if jaccard > threshold:
                    is_dup = True
                    break
            if not is_dup:
                filtered.append(item)
                shingle_cache.append(current)
            else:
                self.stats["fuzzy_dedup_rejected"] += 1
        return filtered

    def _filter_quality(self, data: List[Dict]) -> List[Dict]:
        """质量评分过滤"""
        filtered = []
        for item in data:
            output = item["output"]
            words = output.split()
            if len(words) > 20:
                trigrams = [tuple(words[i:i+3]) for i in range(len(words)-2)]
                unique_ratio = len(set(trigrams)) / max(len(trigrams), 1)
                if unique_ratio < self.config["min_unique_trigram_ratio"]:
                    self.stats["quality_repetition_rejected"] += 1
                    continue
            filtered.append(item)
        return filtered
```

### 5.3 数据配比与混合策略

#### 5.3.1 多源数据混合

```python
"""
多源 SFT 数据配比管理器
支持比例控制、上采样/下采样
"""
import random
from dataclasses import dataclass
from typing import List, Dict

@dataclass
class DataSource:
    name: str
    data: List[Dict]
    target_ratio: float
    max_upsample_factor: int = 3

def create_mixed_dataset(
    sources: List[DataSource],
    target_total: int = 100000,
    seed: int = 42
) -> List[Dict]:
    """按比例混合多源数据"""
    random.seed(seed)
    mixed = []

    for source in sources:
        needed = int(target_total * source.target_ratio)
        available = len(source.data)

        if available >= needed:
            sampled = random.sample(source.data, needed)
        else:
            actual_needed = min(needed, available * source.max_upsample_factor)
            repeats = actual_needed // available + 1
            sampled = (source.data * repeats)[:actual_needed]

        for item in sampled:
            item["_source"] = source.name
        mixed.extend(sampled)

    random.shuffle(mixed)
    return mixed

# 推荐的工业级配比方案
# general_qa: 25%, code: 20%, math: 15%, complex_instruction: 12%,
# creative_writing: 10%, knowledge: 8%, safety: 5%, multilingual: 5%
```

### 5.4 合成数据生成方法

#### 5.4.1 Self-Instruct

Self-Instruct（Wang et al., 2022）是第一个系统性的 SFT 数据自动生成框架：

核心思想：用少量种子任务引导 LLM 生成更多多样化的指令-回答对。

流程：
1. 准备 ~175 条人工编写的种子任务
2. 从种子池中随机采样 few-shot 示例
3. 调用 LLM 生成新的指令和回答
4. 去重过滤，加入种子池
5. 重复直到达到目标数据量

#### 5.4.2 Evol-Instruct（WizardLM 方法）

核心思想：通过多轮进化，将简单指令逐步变为复杂指令。

进化策略包括：
- 增加约束（Add Constraints）
- 深化问题（Deepen）
- 具体化（Concretize）
- 增加推理步骤（Increase Reasoning）
- 复杂化输入（Complicate Input）

每轮进化有 80% 概率做深度进化（增加难度），20% 概率做广度进化（生成同领域新任务）。

---

## 6. 全参数微调的实现

### 6.1 基本流程

```
加载预训练权重 theta_pretrained
          |
准备 SFT 数据集（tokenize + masking）
          |
以较小学习率训练:  theta <- theta - eta * grad(L_SFT)
          |
训练 1~5 个 epoch
          |
保存完整权重 theta_sft
```

### 6.2 显存需求分析

对于参数量为 P 的模型（如 7B = 7e9 参数），全参数微调需要的 GPU 显存：

| 组件 | 精度 | 显存 | 7B 实际 |
|------|------|------|---------|
| 模型参数 | bf16 | 2P bytes | 14 GB |
| 梯度 | bf16 | 2P bytes | 14 GB |
| AdamW 优化器 m | fp32 | 4P bytes | 28 GB |
| AdamW 优化器 v | fp32 | 4P bytes | 28 GB |
| 激活值 | 混合 | 变化 | 5~30 GB |
| **总计** | | ~16P + 激活值 | **~90~115 GB** |

不同规模模型的硬件需求：

| 模型大小 | 显存需求 | 最低配置 |
|---------|---------|---------|
| 1.3B | ~20 GB | 1x A100-40GB |
| 7B | ~90 GB | 2x A100-80GB |
| 13B | ~170 GB | 4x A100-80GB |
| 70B | ~900 GB | 8~16x A100-80GB |

### 6.3 显存优化技术栈

#### 6.3.1 混合精度训练

```python
import torch
from transformers import AutoModelForCausalLM

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3-8B",
    torch_dtype=torch.bfloat16,  # bf16 比 fp16 更稳定
    device_map="auto"
)

# bf16 推荐用于 Ampere 及以上 GPU (A100, H100)
# 不需要 GradScaler，不会梯度下溢
```

#### 6.3.2 梯度累积

```python
accumulation_steps = 8
micro_batch_size = 2
# 有效 batch_size = 2 * 8 = 16 (单卡)

optimizer.zero_grad()
for step, batch in enumerate(dataloader):
    outputs = model(**batch)
    loss = outputs.loss / accumulation_steps  # 关键：归一化
    loss.backward()

    if (step + 1) % accumulation_steps == 0:
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        lr_scheduler.step()
        optimizer.zero_grad()
```

#### 6.3.3 梯度检查点

```python
model.gradient_checkpointing_enable(
    gradient_checkpointing_kwargs={"use_reentrant": False}
)
# 显存减少 50-70%（激活值部分）
# 训练速度下降约 25-35%（需要重新计算前向）
```

#### 6.3.4 DeepSpeed ZeRO

| ZeRO Stage | 分片内容 | 显存节约 | 通信开销 |
|------------|---------|---------|---------|
| Stage 1 | 优化器状态 | ~4x | 与 DDP 相同 |
| Stage 2 | 优化器状态 + 梯度 | ~8x | 略高 |
| Stage 3 | 全部（含参数） | ~线性扩展 | 较高 |

---

## 7. 从零实现一个完整的 SFT 训练流程

### 7.1 数据处理类

```python
"""
SFT 数据集类
核心功能：tokenize + loss masking
"""
import torch
import json
import copy
from torch.utils.data import Dataset
from transformers import PreTrainedTokenizer
from typing import Dict

class SFTDataset(Dataset):
    """SFT 数据集，正确实现 loss masking"""

    PROMPT_TEMPLATE = (
        "Below is an instruction that describes a task. "
        "Write a response that appropriately completes the request.\n\n"
        "### Instruction:\n{instruction}\n\n"
        "### Response:\n"
    )

    def __init__(self, data_path: str, tokenizer: PreTrainedTokenizer, max_length: int = 2048):
        self.tokenizer = tokenizer
        self.max_length = max_length

        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        with open(data_path, "r", encoding="utf-8") as f:
            self.raw_data = json.load(f)

    def __len__(self) -> int:
        return len(self.raw_data)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        item = self.raw_data[idx]
        instruction = item["instruction"]
        input_text = item.get("input", "")
        output = item["output"]

        # 构造 prompt
        if input_text:
            prompt = self.PROMPT_TEMPLATE.replace("{instruction}",
                f"{instruction}\n\nInput: {input_text}")
        else:
            prompt = self.PROMPT_TEMPLATE.replace("{instruction}", instruction)

        full_text = prompt + output + self.tokenizer.eos_token

        # Tokenize
        prompt_ids = self.tokenizer.encode(prompt, add_special_tokens=True)
        full_ids = self.tokenizer.encode(full_text, add_special_tokens=True)

        # 截断
        if len(full_ids) > self.max_length:
            full_ids = full_ids[:self.max_length]

        # Labels: mask prompt 部分
        labels = copy.deepcopy(full_ids)
        prompt_len = min(len(prompt_ids), len(labels))
        labels[:prompt_len] = [-100] * prompt_len

        # Padding
        attention_mask = [1] * len(full_ids)
        pad_len = self.max_length - len(full_ids)
        if pad_len > 0:
            full_ids += [self.tokenizer.pad_token_id] * pad_len
            labels += [-100] * pad_len
            attention_mask += [0] * pad_len

        return {
            "input_ids": torch.tensor(full_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_mask, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }
```

### 7.2 训练器实现

```python
"""
从零实现 SFT Trainer
展示底层训练逻辑
"""
import torch
import time
import math
from pathlib import Path
from torch.utils.data import DataLoader
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR, LinearLR, SequentialLR
from transformers import AutoModelForCausalLM, AutoTokenizer
from dataclasses import dataclass

@dataclass
class SFTConfig:
    model_name_or_path: str = "meta-llama/Llama-3-8B"
    data_path: str = "sft_data.json"
    max_length: int = 2048
    num_epochs: int = 3
    per_device_batch_size: int = 2
    gradient_accumulation_steps: int = 8
    learning_rate: float = 2e-5
    weight_decay: float = 0.01
    warmup_ratio: float = 0.03
    max_grad_norm: float = 1.0
    bf16: bool = True
    gradient_checkpointing: bool = True
    output_dir: str = "./sft_output"
    save_steps: int = 500
    logging_steps: int = 10

class SFTTrainer:
    def __init__(self, config: SFTConfig):
        self.config = config
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._setup_model()
        self._setup_data()
        self._setup_optimizer()
        self.global_step = 0

    def _setup_model(self):
        dtype = torch.bfloat16 if self.config.bf16 else torch.float32
        self.tokenizer = AutoTokenizer.from_pretrained(self.config.model_name_or_path)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.config.model_name_or_path,
            torch_dtype=dtype,
            device_map="auto",
        )
        if self.config.gradient_checkpointing:
            self.model.gradient_checkpointing_enable(
                gradient_checkpointing_kwargs={"use_reentrant": False}
            )
        self.model.train()

    def _setup_data(self):
        dataset = SFTDataset(self.config.data_path, self.tokenizer, self.config.max_length)
        self.dataloader = DataLoader(
            dataset, batch_size=self.config.per_device_batch_size,
            shuffle=True, num_workers=4, pin_memory=True, drop_last=True
        )
        self.total_steps = (
            len(self.dataloader) * self.config.num_epochs
            // self.config.gradient_accumulation_steps
        )

    def _setup_optimizer(self):
        # Weight decay 分组：不对 bias/LayerNorm 做 decay
        decay_params, no_decay_params = [], []
        for name, param in self.model.named_parameters():
            if not param.requires_grad:
                continue
            if "bias" in name or "norm" in name:
                no_decay_params.append(param)
            else:
                decay_params.append(param)

        self.optimizer = AdamW([
            {"params": decay_params, "weight_decay": self.config.weight_decay},
            {"params": no_decay_params, "weight_decay": 0.0},
        ], lr=self.config.learning_rate, betas=(0.9, 0.95))

        # Warmup + Cosine decay
        warmup_steps = int(self.total_steps * self.config.warmup_ratio)
        warmup = LinearLR(self.optimizer, start_factor=1e-8/self.config.learning_rate,
                         end_factor=1.0, total_iters=warmup_steps)
        decay = CosineAnnealingLR(self.optimizer, T_max=self.total_steps - warmup_steps,
                                  eta_min=self.config.learning_rate * 0.1)
        self.scheduler = SequentialLR(self.optimizer, [warmup, decay], milestones=[warmup_steps])

    def train(self):
        print(f"Total steps: {self.total_steps}")
        running_loss = 0.0
        start_time = time.time()

        for epoch in range(self.config.num_epochs):
            for step, batch in enumerate(self.dataloader):
                batch = {k: v.to(self.device) for k, v in batch.items()}

                with torch.cuda.amp.autocast(dtype=torch.bfloat16, enabled=self.config.bf16):
                    outputs = self.model(**batch)
                    loss = outputs.loss / self.config.gradient_accumulation_steps

                loss.backward()
                running_loss += loss.item()

                if (step + 1) % self.config.gradient_accumulation_steps == 0:
                    grad_norm = torch.nn.utils.clip_grad_norm_(
                        self.model.parameters(), self.config.max_grad_norm)
                    self.optimizer.step()
                    self.scheduler.step()
                    self.optimizer.zero_grad()
                    self.global_step += 1

                    if self.global_step % self.config.logging_steps == 0:
                        avg_loss = running_loss / self.config.logging_steps
                        lr = self.scheduler.get_last_lr()[0]
                        print(f"[Step {self.global_step}/{self.total_steps}] "
                              f"Loss: {avg_loss:.4f} | LR: {lr:.2e} | GradNorm: {grad_norm:.3f}")
                        running_loss = 0.0

                    if self.global_step % self.config.save_steps == 0:
                        save_path = Path(self.config.output_dir) / f"checkpoint-{self.global_step}"
                        save_path.mkdir(parents=True, exist_ok=True)
                        self.model.save_pretrained(save_path)
                        self.tokenizer.save_pretrained(save_path)

        # Save final
        final_path = Path(self.config.output_dir) / "final_model"
        final_path.mkdir(parents=True, exist_ok=True)
        self.model.save_pretrained(final_path)
        self.tokenizer.save_pretrained(final_path)
        print(f"Training done in {(time.time()-start_time)/3600:.2f}h")
```

---

## 8. 使用 Hugging Face TRL 进行 SFT

### 8.1 最简 SFT 训练

```python
from trl import SFTTrainer, SFTConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from datasets import load_dataset

model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3-8B", torch_dtype="bfloat16")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3-8B")
dataset = load_dataset("json", data_files="sft_data.json", split="train")

training_args = SFTConfig(
    output_dir="./sft_output",
    num_train_epochs=3,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    learning_rate=2e-5,
    bf16=True,
    gradient_checkpointing=True,
    logging_steps=10,
    save_steps=500,
    max_seq_length=2048,
)

trainer = SFTTrainer(
    model=model, args=training_args,
    train_dataset=dataset, processing_class=tokenizer,
)
trainer.train()
```

### 8.2 生产级配置（含 LoRA + 评估）

```python
from trl import SFTTrainer, SFTConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_dataset
import torch

# 4-bit 量化配置（消费级 GPU 可用）
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3-8B",
    quantization_config=bnb_config,
    device_map="auto",
)

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3-8B")
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# LoRA 配置
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=64, lora_alpha=128, lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    bias="none",
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# 输出示例: trainable params: 167,772,160 || all params: 8,197,771,264 || 2.05%

# 数据
dataset = load_dataset("json", data_files="sft_data.json", split="train")
split = dataset.train_test_split(test_size=0.05, seed=42)

# 训练
training_args = SFTConfig(
    output_dir="./sft_lora_output",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,  # LoRA 可以用更大学习率
    lr_scheduler_type="cosine",
    warmup_ratio=0.03,
    bf16=True,
    gradient_checkpointing=True,
    max_seq_length=2048,
    packing=True,
    eval_strategy="steps",
    eval_steps=200,
    save_strategy="steps",
    save_steps=200,
    save_total_limit=3,
    load_best_model_at_end=True,
    logging_steps=10,
    max_grad_norm=1.0,
)

trainer = SFTTrainer(
    model=model, args=training_args,
    train_dataset=split["train"],
    eval_dataset=split["test"],
    processing_class=tokenizer,
)
trainer.train()
trainer.save_model("./sft_lora_final")
```

---

## 9. 多轮对话微调

### 9.1 Loss Masking 策略

多轮对话中最推荐的策略是**对所有 assistant 回复计算 loss**：

```
System: ...       -> mask (-100)
User: msg1        -> mask (-100)
Assistant: resp1  -> 计算 loss
User: msg2        -> mask (-100)
Assistant: resp2  -> 计算 loss
```

原因：
- 每轮 assistant 回复都是有效的训练信号
- 模型学会在多轮上下文中保持一致性
- 训练效率高（一条多轮数据 = 多条训练信号）

### 9.2 实现

```python
def process_multi_turn_conversation(messages, tokenizer, max_length=4096):
    """
    处理多轮对话，只对 assistant 部分计算 loss
    """
    full_text = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=False
    )
    full_ids = tokenizer(full_text, add_special_tokens=False, max_length=max_length,
                         truncation=True)["input_ids"]

    # 初始化 labels 全为 -100
    labels = [-100] * len(full_ids)

    # 逐轮找到 assistant 回复的 token 范围
    current_len = 0
    for i, msg in enumerate(messages):
        partial = tokenizer.apply_chat_template(
            messages[:i+1], tokenize=False, add_generation_prompt=False
        )
        partial_ids = tokenizer(partial, add_special_tokens=False)["input_ids"]
        new_len = len(partial_ids)

        if msg["role"] == "assistant":
            for pos in range(current_len, min(new_len, len(labels))):
                labels[pos] = full_ids[pos]

        current_len = new_len

    attention_mask = [1] * len(full_ids)
    pad_len = max_length - len(full_ids)
    if pad_len > 0:
        full_ids += [tokenizer.pad_token_id] * pad_len
        labels += [-100] * pad_len
        attention_mask += [0] * pad_len

    return {"input_ids": full_ids, "labels": labels, "attention_mask": attention_mask}
```

### 9.3 数据增强：截断增强

```python
def augment_multi_turn(conversations):
    """将 N 轮对话截断为 1,2,...,N 轮的独立训练样本"""
    augmented = []
    for conv in conversations:
        messages = conv["messages"]
        assistant_indices = [i for i, m in enumerate(messages) if m["role"] == "assistant"]
        for end_idx in assistant_indices:
            augmented.append({"messages": messages[:end_idx + 1]})
    return augmented
```

---

## 10. SFT 的关键训练技巧

### 10.1 学习率选择

| 模型规模 | 全参数 SFT | LoRA |
|---------|-----------|------|
| 1B~3B | 2e-5 ~ 5e-5 | 1e-4 ~ 3e-4 |
| 7B~13B | 1e-5 ~ 2e-5 | 5e-5 ~ 2e-4 |
| 30B~70B | 5e-6 ~ 1e-5 | 2e-5 ~ 1e-4 |

### 10.2 Batch Size

有效 Batch Size = per_device_batch_size x gradient_accumulation_steps x n_gpus

推荐范围：64~128。增大 batch size 时可等比增大学习率。

### 10.3 训练 Epoch 数

| 数据量 | 推荐 Epoch |
|--------|-----------|
| < 10K | 3~5 |
| 10K~100K | 2~3 |
| > 100K | 1~2 |

通过验证集 loss 监控过拟合，使用 early stopping。

### 10.4 NEFTune：Embedding 噪声

NEFTune 在训练时给 embedding 输出添加均匀噪声，在 AlpacaEval 上提升 15-20%：

```python
import torch
import torch.nn as nn

class NEFTuneHook:
    """在 embedding 层添加训练时噪声"""
    def __init__(self, model, noise_alpha=5.0):
        self.model = model
        self.noise_alpha = noise_alpha
        self.hook_handle = None

    def _noise_hook(self, module, input, output):
        if self.model.training:
            dims = torch.tensor(output.shape[1] * output.shape[2], dtype=output.dtype)
            mag = self.noise_alpha / torch.sqrt(dims)
            noise = torch.zeros_like(output).uniform_(-mag, mag)
            return output + noise
        return output

    def register(self):
        embed_layer = self.model.get_input_embeddings()
        self.hook_handle = embed_layer.register_forward_hook(self._noise_hook)
        return self

    def remove(self):
        if self.hook_handle:
            self.hook_handle.remove()

# 使用: NEFTuneHook(model, noise_alpha=5.0).register()
```

### 10.5 其他关键技巧

- **Warmup**: 3~10% 步数做线性 warmup
- **Weight Decay**: 0.01（不对 bias/norm 参数）
- **梯度裁剪**: max_norm = 1.0
- **bf16 优先于 fp16**：更稳定，不需要 loss scaling
- **Flash Attention 2**：长序列必用，减少显存、加速计算
- **Packing**：短序列拼接，提高 GPU 利用率到 90%+

---

## 11. 灾难性遗忘与缓解策略

### 11.1 什么是灾难性遗忘

模型在学习新任务时丧失对旧任务的记忆。在 SFT 中表现为：
- 特定领域微调后通用能力下降
- 长时间训练后多样性降低（mode collapse）

### 11.2 缓解策略

**策略1：混合预训练数据**（推荐，简单有效）
```python
# 在 SFT 数据中混入 5-10% 预训练数据
mixed_data = sft_data + random.sample(pretrain_data, int(len(sft_data) * 0.1))
```

**策略2：少训练 Epoch**
- 1-3 epoch 通常最佳
- 过度训练是遗忘的主要原因

**策略3：使用 LoRA**
- 只更新少量参数（2-5%），基座不变
- 天然防止遗忘

**策略4：EWC 正则化**

$$\mathcal{L}_{total} = \mathcal{L}_{sft} + \lambda \sum_i F_i (\theta_i - \theta_{pretrain,i})^2$$

对重要参数（Fisher 信息大）施加更强的约束，防止偏离预训练参数。

**策略5：较小学习率**
- 限制参数更新幅度

---

## 12. SFT 的评估方法

### 12.1 自动评估

| 指标/基准 | 评估维度 | 方法 |
|----------|---------|------|
| Perplexity | 拟合度 | 验证集 NLL |
| MMLU | 学科知识 | 多选题准确率 |
| GSM8K | 数学推理 | 答案准确率 |
| HumanEval | 代码生成 | pass@k |
| MT-Bench | 多轮对话 | GPT-4 打分 1-10 |
| AlpacaEval | 指令遵循 | GPT-4 胜率 |
| IFEval | 精确指令遵循 | 准确率 |

### 12.2 人工评估

- 盲测对比（Blind A/B Test）
- 多维度评分：有用性、无害性、诚实性、流畅性
- Chatbot Arena Elo 评分

### 12.3 最佳实践

```python
def comprehensive_eval(model, tokenizer):
    """综合评估"""
    # 1. Perplexity（快速）
    ppl = compute_perplexity(model, eval_loader)
    # 2. 知识保持：MMLU 子集
    # 3. 生成质量：采样关键 prompt 检查输出
    # 4. 对比：与基座模型、上一版本对比
    return {"perplexity": ppl}
```

---

## 13. SFT 与其他微调范式的对比

| 方法 | 训练信号 | 数据需求 | 适用场景 |
|------|---------|---------|---------|
| SFT | 有监督 (x,y) 对 | 数万条 | 通用指令遵循 |
| LoRA + SFT | 同 SFT | 同 SFT | 资源受限 |
| RLHF (PPO) | 偏好排序 + RM | 偏好对 + RM | 精细对齐 |
| DPO | 偏好对 (y_w, y_l) | 偏好对 | 简化对齐 |
| KTO | 好/坏二元信号 | 单条评价 | 数据获取容易 |

**SFT 的优势**：简单稳定，不需要额外模型，数据收集成本可控

**SFT 的局限**：只能学习标注中的行为（behavior cloning 天花板）；无法超越标注者水平

**何时选 LoRA**：GPU 受限、需要多场景切换 adapter、数据量小防过拟合

---

## 14. 工程实践与生产部署

### 14.1 硬件选择

| 模型规模 | 推荐配置 | 框架 |
|---------|---------|------|
| 7B | 4x A100-80G | DeepSpeed ZeRO-2 |
| 13B | 8x A100-80G | DeepSpeed ZeRO-3 |
| 70B | 多节点 | FSDP / Megatron |

### 14.2 模型合并与导出

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

# 合并 LoRA adapter
base_model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3-8B", torch_dtype=torch.bfloat16, device_map="auto")
model = PeftModel.from_pretrained(base_model, "./sft_lora_output")
model = model.merge_and_unload()  # 合并到基座
model.save_pretrained("./merged_model")
```

### 14.3 训练监控要点

- Loss 爆炸检测（loss > 10 告警）
- Loss 停滞检测（连续 100 步无下降）
- NaN 检测（立即停止）
- 梯度范数异常（过大/过小）
- 定期生成采样，人工检查输出质量

---

## 15. 常见坑与最佳实践

### 15.1 常见错误

| 错误 | 后果 | 正确做法 |
|------|------|---------|
| 不 mask 指令的 loss | 模型生成指令文本 | 指令部分 label=-100 |
| padding side 不一致 | 推理输出乱码 | 训练 right pad，推理 left pad |
| 学习率过高 | 灾难性遗忘 | 7B: 1e-5~2e-5 |
| 没有 EOS token | 推理不停止 | 回答末尾加 EOS |
| 数据泄露 | 评估失真 | 严格划分数据集 |
| Batch size 过小 | 训练不稳定 | 有效 BS >= 32 |

### 15.2 最佳实践清单

**数据**：质量 > 数量；去重；长短混合；含拒绝样本

**训练**：lr=2e-5（7B）；2-3 epoch；warmup 3%；grad_clip=1.0；bf16；梯度检查点

**评估**：不只看 loss；多维度基准；对比基线；人工抽查

---

## 16. 面试题精选与解析

### Q1: SFT 和 RLHF 的区别？

SFT 用有监督数据做行为克隆，上限是标注者水平。RLHF 用偏好信号做策略优化，可超越标注者。典型流程是先 SFT 再 RLHF/DPO。

### Q2: 为什么要 Loss Masking？

避免模型学习生成指令文本；聚焦于学习回答生成；实现方式是将指令部分 labels 设为 -100。

### Q3: SFT 数据量多少合适？

质量远比数量重要。LIMA 证明 1K 精选 > 52K 普通。推荐 10K~100K 质量筛选后的数据。

### Q4: 如何防止灾难性遗忘？

混合预训练数据（5-10%）；少 epoch（2-3）；小学习率；LoRA；EWC 正则化。

### Q5: Packing 是什么？注意事项？

将多条短序列拼接到固定长度，提高 GPU 利用率。需要 block-diagonal attention mask 防止样本间互相注意，position IDs 每个样本重新从 0 开始。

### Q6: NEFTune 原理？

训练时在 embedding 输出加均匀噪声做正则化，防止过拟合。推理不加。AlpacaEval 提升 15-20%。

### Q7: 全参数 SFT vs LoRA？

全参数效果上限更高但显存需求大、遗忘风险高。LoRA 资源友好、防遗忘、支持多场景 adapter 切换，但效果天花板稍低。

### Q8: Chat Template 为什么重要？

模型在 SFT 时学会了响应特定格式的特殊 token。推理时必须用相同 template，否则模型无法正确识别角色边界。

### Q9: SFT 学习率为什么比预训练低？

模型已在好的参数区域；大 lr 会破坏预训练知识；数据量小易过拟合；任务目标一致只需微调方向。

### Q10: 表面对齐假说（Surface Alignment Hypothesis）？

LIMA 提出：知识和能力几乎全在预训练阶段学到，SFT 只是教模型用正确的格式和风格表达。因此 SFT 数据量少但质量高即可。

---

## 17. 参考资料

1. Ouyang et al., 2022. "Training language models to follow instructions with human feedback." (InstructGPT) NeurIPS 2022.
2. Zhou et al., 2023. "LIMA: Less Is More for Alignment." NeurIPS 2023.
3. Wang et al., 2022. "Self-Instruct: Aligning Language Models with Self-Generated Instructions." ACL 2023.
4. Wei et al., 2022. "Finetuned Language Models Are Zero-Shot Learners." (FLAN) ICLR 2022.
5. Xu et al., 2023. "WizardLM: Empowering Large Language Models to Follow Complex Instructions."
6. Taori et al., 2023. "Stanford Alpaca: An Instruction-following LLaMA model."
7. Jain et al., 2023. "NEFTune: Noisy Embeddings Improve Instruction Finetuning." ICLR 2024.
8. Hugging Face TRL Library. https://github.com/huggingface/trl
9. Rafailov et al., 2023. "Direct Preference Optimization." (DPO) NeurIPS 2023.
10. Touvron et al., 2023. "LLaMA: Open and Efficient Foundation Language Models."
11. Muennighoff et al., 2023. "Scaling Data-Constrained Language Models." NeurIPS 2023.
12. Liu et al., 2024. "What Makes Good Data for Alignment?" (Deita) ICLR 2024.
13. Hu et al., 2022. "LoRA: Low-Rank Adaptation of Large Language Models." ICLR 2022.
