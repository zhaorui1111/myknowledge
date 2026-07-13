# Transformer 架构详解（Transformer Architecture）

> **前置知识**：神经网络与反向传播（01）、词向量与 Embedding（02）、注意力机制（03）  
> **核心地位**：Transformer 是现代大语言模型（GPT、BERT、LLaMA、Claude 等）的统一底座架构，理解它等于理解整个 LLM 时代的技术基石  
> **本篇目标**：从论文 "Attention Is All You Need"（Vaswani et al., 2017）出发，完整拆解 Encoder-Decoder 结构的每个子模块，给出维度追踪、数学推导、完整 PyTorch 实现、训练技巧与工程实践

---

## 目录

1. [概述与历史背景](#1-概述与历史背景)
2. [整体架构鸟瞰](#2-整体架构鸟瞰)
3. [输入表示：Token Embedding + 位置编码](#3-输入表示token-embedding--位置编码)
4. [Multi-Head Self-Attention 子层](#4-multi-head-self-attention-子层)
5. [前馈网络子层（FFN / MLP）](#5-前馈网络子层ffn--mlp)
6. [残差连接与层归一化](#6-残差连接与层归一化)
7. [Encoder 结构详解](#7-encoder-结构详解)
8. [Decoder 结构详解](#8-decoder-结构详解)
9. [输出层与生成策略](#9-输出层与生成策略)
10. [维度追踪：从输入到输出的张量变化](#10-维度追踪从输入到输出的张量变化)
11. [完整 PyTorch 实现](#11-完整-pytorch-实现)
12. [训练技巧与优化细节](#12-训练技巧与优化细节)
13. [Transformer 变体演进](#13-transformer-变体演进)
14. [工程实践与性能分析](#14-工程实践与性能分析)
15. [对比辨析](#15-对比辨析)
16. [常见面试题（附答案要点）](#16-常见面试题附答案要点)
17. [易错点与最佳实践](#17-易错点与最佳实践)

---

## 1. 概述与历史背景

### 1.1 什么是 Transformer

Transformer 是一种完全基于注意力机制（Attention Mechanism）的序列到序列（Sequence-to-Sequence）神经网络架构。它于 2017 年由 Google Brain 团队在论文 "Attention Is All You Need" 中提出，彻底摒弃了 RNN（循环神经网络）和 CNN（卷积神经网络）中的循环/卷积结构，仅通过自注意力（Self-Attention）和前馈网络（Feed-Forward Network）来建模序列中任意位置之间的依赖关系。

核心创新点可以概括为三个词：**并行化**、**全局依赖**、**可扩展性**。

### 1.2 为什么 Transformer 能取代 RNN/CNN

**RNN 的根本问题：**

- **串行计算**：RNN 按时间步顺序处理，第 $t$ 时刻的计算依赖 $t-1$ 时刻的隐状态，无法充分利用 GPU 并行能力。序列长度为 $n$ 时，计算需要 $O(n)$ 个串行步骤。
- **长距离遗忘**：即使有 LSTM/GRU 的门控机制，当序列超过几百个 token 时，早期信息仍会衰减。梯度在反向传播中经过数百步后容易消失。
- **无法扩展**：由于串行瓶颈，增加模型宽度的收益被训练速度瓶颈抵消。

**CNN 的局限：**

- **局部感受野**：标准 CNN 每层只能看到固定窗口大小的上下文，建模长距离依赖需要堆叠很多层（$O(\log n)$ 层 dilated conv 或 $O(n/k)$ 层标准 conv）。
- **位置信息不自然**：CNN 通过相对位置隐式编码顺序，对需要精确位置关系的任务不够灵活。

**Transformer 的优势：**

| 特性 | RNN | CNN | Transformer |
|------|-----|-----|-------------|
| 序列长度 $n$ 的并行度 | $O(1)$ | $O(n)$ | $O(n)$ |
| 最大路径长度 | $O(n)$ | $O(n/k)$ 或 $O(\log_k n)$ | $O(1)$ |
| 每层计算复杂度 | $O(n \cdot d^2)$ | $O(k \cdot n \cdot d^2)$ | $O(n^2 \cdot d)$ |
| 可扩展性 | 差 | 中 | 极强 |

当 $d > n$ 时（现代 LLM 的常见情况：$d=4096$，$n=2048$），Self-Attention 的 $O(n^2 \cdot d)$ 实际上并不比 RNN 的 $O(n \cdot d^2)$ 慢，且可以完全并行。

### 1.3 历史脉络

```
2014  Seq2Seq (Sutskever et al.) — 奠定 Encoder-Decoder 范式
2015  Attention (Bahdanau et al.) — 解决固定瓶颈，引入注意力
2017  Transformer (Vaswani et al.) — "Attention Is All You Need"
2018  GPT-1 (OpenAI) — Decoder-only，预训练+微调
2018  BERT (Google) — Encoder-only，双向掩码预训练
2019  GPT-2 — 15亿参数，zero-shot 能力涌现
2020  GPT-3 — 1750亿参数，few-shot 学习
2020  Vision Transformer (ViT) — Transformer 进入 CV
2023  GPT-4 / LLaMA / Claude — 指令对齐、多模态
2024  Mamba/RWKV — 线性注意力挑战者出现
```

### 1.4 三种主流架构变体

原始 Transformer 是 Encoder-Decoder 结构，但后续演化出三种主流变体：

- **Encoder-only**（如 BERT）：只用编码器，适合理解/分类任务。输入双向可见，通过 [CLS] token 或所有 token 的输出做下游任务。
- **Decoder-only**（如 GPT 系列、LLaMA、Claude）：只用解码器，适合生成任务，当今主流 LLM 架构。因果掩码确保自回归生成。
- **Encoder-Decoder**（如 T5、BART、mBART）：完整结构，适合翻译/摘要等输入和输出都是序列的任务。

本篇以原始 Encoder-Decoder 为主线，同时指出各变体的差异点。

---

## 2. 整体架构鸟瞰

### 2.1 宏观结构

原始 Transformer 的整体结构如下（ASCII 图）：

```
输入序列 (source)                          输出序列 (target, shifted right)
     │                                              │
     ▼                                              ▼
┌──────────────┐                          ┌──────────────────┐
│ Input Embed  │                          │ Output Embed     │
│ × sqrt(d)   │                          │ × sqrt(d)        │
│ + Pos Enc   │                          │ + Pos Enc        │
└──────┬───────┘                          └────────┬─────────┘
       │                                           │
       ▼                                           ▼
┌──────────────┐  ×N                      ┌──────────────────┐  ×N
│  Encoder     │─────── K, V ──────────▶  │    Decoder       │
│  Layer       │   (cross-attention)      │    Layer         │
└──────────────┘                          └────────┬─────────┘
                                                   │
                                                   ▼
                                          ┌──────────────────┐
                                          │  Linear + Softmax│
                                          │  → vocab probs   │
                                          └──────────────────┘
```

### 2.2 Encoder Layer 内部结构

每个 Encoder Layer 包含两个子层（sub-layer），每个子层都配有残差连接（Residual Connection）和层归一化（Layer Normalization）：

```
Input x
  │
  ├─────────────────────────┐
  ▼                         │ (residual)
┌────────────────────┐      │
│ Multi-Head         │      │
│ Self-Attention     │      │
└─────────┬──────────┘      │
          ▼                 │
     LayerNorm(x + sublayer(x))
          │
          ├─────────────────────────┐
          ▼                         │ (residual)
┌────────────────────┐              │
│ Position-wise FFN  │              │
└─────────┬──────────┘              │
          ▼                         │
     LayerNorm(x + sublayer(x))
          │
          ▼
       Output
```

### 2.3 Decoder Layer 内部结构

每个 Decoder Layer 包含三个子层：

```
Input x (decoder)
  │
  ├─────────────────────────┐
  ▼                         │ (residual)
┌────────────────────┐      │
│ Masked Multi-Head  │      │
│ Self-Attention     │      │
└─────────┬──────────┘      │
          ▼                 │
     LayerNorm(x + sublayer(x))
          │
          ├─────────────────────────┐
          ▼                         │ (residual)
┌────────────────────┐              │
│ Multi-Head         │              │
│ Cross-Attention    │◄── Encoder Output (K, V)
└─────────┬──────────┘              │
          ▼                         │
     LayerNorm(x + sublayer(x))
          │
          ├─────────────────────────┐
          ▼                         │ (residual)
┌────────────────────┐              │
│ Position-wise FFN  │              │
└─────────┬──────────┘              │
          ▼                         │
     LayerNorm(x + sublayer(x))
          │
          ▼
       Output
```

### 2.4 关键超参数（原始论文配置）

| 参数 | 符号 | Base 模型 | Big 模型 |
|------|------|-----------|----------|
| 模型维度 | $d_{model}$ | 512 | 1024 |
| 注意力头数 | $h$ | 8 | 16 |
| 每头维度 | $d_k = d_v = d_{model}/h$ | 64 | 64 |
| FFN 中间维度 | $d_{ff}$ | 2048 | 4096 |
| Encoder 层数 | $N$ | 6 | 6 |
| Decoder 层数 | $N$ | 6 | 6 |
| Dropout | $p$ | 0.1 | 0.3 |
| 最大序列长度 | $n_{max}$ | 512 | 512 |
| 词表大小 | $|V|$ | ~37000 (BPE) | ~37000 |
| 总参数量 | — | ~65M | ~213M |

**现代 LLM 的超参数对比**（供参考）：

| 模型 | $d_{model}$ | $h$ | $d_{ff}$ | Layers | Params |
|------|-------------|-----|-----------|--------|--------|
| GPT-2 | 1600 | 25 | 6400 | 48 | 1.5B |
| GPT-3 | 12288 | 96 | 49152 | 96 | 175B |
| LLaMA-2 7B | 4096 | 32 | 11008 | 32 | 7B |
| LLaMA-2 70B | 8192 | 64 | 28672 | 80 | 70B |

---

## 3. 输入表示：Token Embedding + 位置编码

### 3.1 Token Embedding

输入文本首先通过分词器（Tokenizer）切分为 token 序列 $(x_1, x_2, ..., x_n)$，每个 $x_i$ 是词表中的索引（整数）。通过嵌入矩阵 $W_E \in \mathbb{R}^{|V| \times d_{model}}$ 将其映射为连续向量：

$$E(x_i) = W_E[x_i] \in \mathbb{R}^{d_{model}}$$

**关键细节：缩放因子**。原论文中，嵌入向量会乘以 $\sqrt{d_{model}}$：

$$\text{embed}(x_i) = W_E[x_i] \cdot \sqrt{d_{model}}$$

原因：embedding 权重初始化时均值为 0、方差约为 $1/d_{model}$（Xavier 初始化），乘以 $\sqrt{d_{model}}$ 后方差变为 1，使得 embedding 的量级与位置编码相当，两者相加时不会一方淹没另一方。

### 3.2 正弦位置编码（Sinusoidal Positional Encoding）

由于 Transformer 没有循环/卷积结构，它无法从架构上感知 token 的顺序。位置编码（Positional Encoding, PE）为模型注入位置信息。

原始论文使用固定的正弦/余弦函数：

$$PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$

$$PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$

其中 $pos$ 是 token 在序列中的位置（0-indexed），$i$ 是维度索引（$0 \le i < d_{model}/2$）。

**为什么这个设计有效？三个核心原因：**

**原因 1：每个位置有唯一编码。** 不同频率的正弦/余弦组合确保每个位置的编码向量不同，类似二进制编码中低位变化快、高位变化慢的模式。

**原因 2：相对位置可通过线性变换表达。** 对于固定偏移 $k$，存在矩阵 $M_k$（仅依赖 $k$，不依赖 $pos$）使得 $PE_{pos+k} = M_k \cdot PE_{pos}$。具体证明：对于每个频率分量 $\omega_i = 1/10000^{2i/d_{model}}$，有旋转矩阵关系：

$$\begin{pmatrix} \sin(\omega_i(pos+k)) \\ \cos(\omega_i(pos+k)) \end{pmatrix} = \begin{pmatrix} \cos(\omega_i k) & \sin(\omega_i k) \\ -\sin(\omega_i k) & \cos(\omega_i k) \end{pmatrix} \begin{pmatrix} \sin(\omega_i \cdot pos) \\ \cos(\omega_i \cdot pos) \end{pmatrix}$$

这意味着模型可以通过学习一个线性投影来捕获相对位置信息。

**原因 3：泛化到训练时未见的长度。** 正弦函数是连续的，理论上可外推到更长序列（虽然实际效果会退化）。

### 3.3 可学习位置编码 vs 固定位置编码

| 类型 | 代表 | 优点 | 缺点 |
|------|------|------|------|
| 固定正弦 | 原始 Transformer | 无需训练，可泛化 | 表达力有限 |
| 可学习绝对 | BERT、GPT-2 | 表达力更强 | 无法外推超过训练长度 |
| 旋转位置编码 RoPE | LLaMA、Qwen | 相对位置建模好，可扩展 | 实现稍复杂 |
| ALiBi | BLOOM | 训练快，外推好 | 对某些任务不如 RoPE |

（位置编码的详细对比见 05-位置编码.md）

### 3.4 最终输入

Encoder 的输入为：

$$\text{Input} = \text{Embedding}(X) \cdot \sqrt{d_{model}} + PE$$

维度为 $(B, n, d_{model})$，其中 $B$ 是 batch size，$n$ 是序列长度。

### 3.5 代码实现

```python
import torch
import torch.nn as nn
import math


class TokenEmbedding(nn.Module):
    """Token 嵌入层，包含 sqrt(d_model) 缩放"""
    
    def __init__(self, vocab_size: int, d_model: int):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.d_model = d_model
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch_size, seq_len) — token indices
        Returns:
            (batch_size, seq_len, d_model) — scaled embeddings
        """
        return self.embedding(x) * math.sqrt(self.d_model)


class SinusoidalPositionalEncoding(nn.Module):
    """正弦位置编码（固定，不参与训练）"""
    
    def __init__(self, d_model: int, max_len: int = 5000, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        
        # 预计算位置编码矩阵: (max_len, d_model)
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)  # (max_len, 1)
        
        # div_term: 10000^(2i/d_model) 的倒数
        # 用 exp(-log(10000) * 2i/d_model) 技巧避免大数溢出
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )  # (d_model/2,)
        
        pe[:, 0::2] = torch.sin(position * div_term)  # 偶数维度: sin
        pe[:, 1::2] = torch.cos(position * div_term)  # 奇数维度: cos
        
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)，方便 broadcast
        self.register_buffer("pe", pe)  # 注册为 buffer，不参与梯度更新
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch_size, seq_len, d_model) — 已经过 embedding 的输入
        Returns:
            (batch_size, seq_len, d_model) — 加上位置编码后的结果
        """
        seq_len = x.size(1)
        x = x + self.pe[:, :seq_len, :]
        return self.dropout(x)
```

---

## 4. Multi-Head Self-Attention 子层

### 4.1 回顾：Scaled Dot-Product Attention

（完整推导见 03-注意力机制.md，此处回顾核心公式）

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right) V$$

输入维度：$Q \in \mathbb{R}^{n \times d_k}$，$K \in \mathbb{R}^{m \times d_k}$，$V \in \mathbb{R}^{m \times d_v}$

输出维度：$\mathbb{R}^{n \times d_v}$

缩放因子 $\sqrt{d_k}$ 的必要性：当 $d_k$ 很大时，$Q$ 和 $K$ 的点积的方差为 $d_k$（假设各维度独立且均值 0、方差 1），导致 softmax 输入值过大，梯度趋近于零。除以 $\sqrt{d_k}$ 将方差归一化回 1。

### 4.2 Multi-Head Attention 机制

单头注意力只能捕获一种关注模式。Multi-Head Attention 通过并行的多个注意力头，让模型同时从不同表示子空间中提取信息：

$$\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, ..., \text{head}_h) W^O$$

每个头独立计算注意力：

$$\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$$

投影矩阵维度：
- $W_i^Q \in \mathbb{R}^{d_{model} \times d_k}$
- $W_i^K \in \mathbb{R}^{d_{model} \times d_k}$
- $W_i^V \in \mathbb{R}^{d_{model} \times d_v}$
- $W^O \in \mathbb{R}^{hd_v \times d_{model}}$

通常取 $d_k = d_v = d_{model} / h$，这样多头注意力的总计算量与单头全维度注意力相当。

### 4.3 Self-Attention vs Cross-Attention

在 Transformer 中，Multi-Head Attention 有三种使用方式：

**1. Encoder Self-Attention**：Q=K=V 都来自 Encoder 的输入/上一层输出。每个位置可以关注所有位置（无 mask），因此是双向的。

**2. Decoder Masked Self-Attention**：Q=K=V 都来自 Decoder 的输入/上一层输出。但加了因果掩码（Causal Mask），位置 $i$ 只能看到 $\le i$ 的位置，确保自回归生成时不会"偷看"未来。

**3. Decoder Cross-Attention**：Q 来自 Decoder 当前层的输出，K 和 V 来自 Encoder 最终层的输出。Decoder 通过它"查询"源序列的信息。这是连接 Encoder 和 Decoder 的桥梁。

### 4.4 维度追踪示例

以 Base 模型为例（$d_{model}=512$，$h=8$，$d_k=d_v=64$，序列长度 $n=20$）：

```
输入 X: (batch, 20, 512)

===== 线性投影（实际中 8 个头合并计算）=====
W_Q: (512, 512)  — 内部可理解为 8 个 (512, 64) 拼接
Q = X @ W_Q: (batch, 20, 512) @ (512, 512) → (batch, 20, 512)
K = X @ W_K: (batch, 20, 512) @ (512, 512) → (batch, 20, 512)
V = X @ W_V: (batch, 20, 512) @ (512, 512) → (batch, 20, 512)

===== 分头 =====
Q: (batch, 20, 512) → view(batch, 20, 8, 64) → transpose(1,2) → (batch, 8, 20, 64)
K: 同上 → (batch, 8, 20, 64)
V: 同上 → (batch, 8, 20, 64)

===== 注意力计算 =====
scores = Q @ K^T / 8.0:  (batch, 8, 20, 64) @ (batch, 8, 64, 20) → (batch, 8, 20, 20)
                          除以 sqrt(64) = 8

应用 mask + softmax:
attn_weights: (batch, 8, 20, 20)  — 每行和为 1

加权求和:
context = attn_weights @ V: (batch, 8, 20, 20) @ (batch, 8, 20, 64) → (batch, 8, 20, 64)

===== 拼接 + 输出投影 =====
context: (batch, 8, 20, 64) → transpose(1,2) → (batch, 20, 8, 64)
                              → reshape → (batch, 20, 512)
output = context @ W_O: (batch, 20, 512) @ (512, 512) → (batch, 20, 512)
```

**参数量**：$4 \times d_{model}^2 = 4 \times 512^2 = 1,048,576 \approx 1M$

### 4.5 代码实现

```python
class MultiHeadAttention(nn.Module):
    """多头注意力机制（支持 self-attention 和 cross-attention）"""
    
    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        assert d_model % num_heads == 0, "d_model must be divisible by num_heads"
        
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads  # 每头维度
        self.scale = math.sqrt(self.d_k)
        
        # Q, K, V, O 四个投影矩阵
        self.W_q = nn.Linear(d_model, d_model, bias=False)
        self.W_k = nn.Linear(d_model, d_model, bias=False)
        self.W_v = nn.Linear(d_model, d_model, bias=False)
        self.W_o = nn.Linear(d_model, d_model, bias=False)
        
        self.attn_dropout = nn.Dropout(dropout)
    
    def split_heads(self, x: torch.Tensor) -> torch.Tensor:
        """(batch, seq_len, d_model) → (batch, num_heads, seq_len, d_k)"""
        batch_size, seq_len, _ = x.size()
        x = x.view(batch_size, seq_len, self.num_heads, self.d_k)
        return x.transpose(1, 2)
    
    def merge_heads(self, x: torch.Tensor) -> torch.Tensor:
        """(batch, num_heads, seq_len, d_k) → (batch, seq_len, d_model)"""
        batch_size, _, seq_len, _ = x.size()
        x = x.transpose(1, 2).contiguous()
        return x.view(batch_size, seq_len, self.d_model)
    
    def forward(
        self,
        query: torch.Tensor,
        key: torch.Tensor,
        value: torch.Tensor,
        mask: torch.Tensor = None
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            query: (batch, seq_q, d_model)
            key:   (batch, seq_k, d_model)
            value: (batch, seq_k, d_model)
            mask:  broadcastable to (batch, num_heads, seq_q, seq_k)
                   0 表示需要屏蔽的位置，1 表示可见位置
        Returns:
            output: (batch, seq_q, d_model)
            attn_weights: (batch, num_heads, seq_q, seq_k)
        """
        # 1. 线性投影
        Q = self.W_q(query)  # (batch, seq_q, d_model)
        K = self.W_k(key)    # (batch, seq_k, d_model)
        V = self.W_v(value)  # (batch, seq_k, d_model)
        
        # 2. 分头
        Q = self.split_heads(Q)  # (batch, heads, seq_q, d_k)
        K = self.split_heads(K)  # (batch, heads, seq_k, d_k)
        V = self.split_heads(V)  # (batch, heads, seq_k, d_k)
        
        # 3. 计算注意力分数
        # (batch, heads, seq_q, d_k) @ (batch, heads, d_k, seq_k)
        scores = torch.matmul(Q, K.transpose(-2, -1)) / self.scale
        
        # 4. 应用 mask（将被屏蔽位置设为 -inf，softmax 后为 0）
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float("-inf"))
        
        # 5. Softmax 归一化 + Dropout
        attn_weights = torch.softmax(scores, dim=-1)
        attn_weights = self.attn_dropout(attn_weights)
        
        # 6. 加权求和: (batch, heads, seq_q, seq_k) @ (batch, heads, seq_k, d_k)
        context = torch.matmul(attn_weights, V)  # (batch, heads, seq_q, d_k)
        
        # 7. 合并多头
        context = self.merge_heads(context)  # (batch, seq_q, d_model)
        
        # 8. 输出投影
        output = self.W_o(context)  # (batch, seq_q, d_model)
        
        return output, attn_weights
```

### 4.6 计算复杂度分析

对于序列长度 $n$、模型维度 $d$：

| 操作 | FLOPs | 说明 |
|------|-------|------|
| QKV 投影 | $3 \times 2nd^2 = 6nd^2$ | 三个矩阵乘法 |
| 注意力分数 $QK^T$ | $2n^2d$ | $(n,d) \times (d,n)$ |
| 加权求和 | $2n^2d$ | $(n,n) \times (n,d)$ |
| 输出投影 | $2nd^2$ | $(n,d) \times (d,d)$ |
| **总计** | $8nd^2 + 4n^2d$ | — |

当 $n < 2d$ 时（如 $n=2048, d=4096$），投影操作主导；当 $n > 2d$ 时，注意力矩阵计算主导。

**内存瓶颈**：注意力矩阵 $(B, h, n, n)$ 占用 $O(Bhn^2)$ 内存，这是长序列时的主要瓶颈（$n=4096, h=32, B=4$ 时约 8GB）。

---

## 5. 前馈网络子层（FFN / MLP）

### 5.1 结构定义

每个 Transformer 层中的 FFN 是一个逐位置（position-wise）的两层全连接网络：

$$\text{FFN}(x) = \max(0, xW_1 + b_1)W_2 + b_2$$

即：先升维到 $d_{ff}$（通常 $d_{ff} = 4 \times d_{model}$），经过激活函数，再降维回 $d_{model}$。

维度变化：
- $W_1 \in \mathbb{R}^{d_{model} \times d_{ff}}$：升维
- $W_2 \in \mathbb{R}^{d_{ff} \times d_{model}}$：降维
- 中间表示：$(B, n, d_{ff})$

"逐位置"意味着：对序列中每个位置的向量独立地应用相同的 FFN（共享参数）。等价于两层 kernel_size=1 的 1D 卷积。

### 5.2 为什么需要 FFN

Self-Attention 的本质是一个**加权平均**操作——将序列中各位置的 Value 进行线性组合。即使加上投影矩阵，它本质上仍是线性变换+softmax。单独的注意力层缺乏非线性变换能力。

FFN 的作用：
1. **引入非线性**：ReLU/GELU 等激活函数赋予模型逼近任意函数的能力
2. **独立特征变换**：注意力负责"交流信息"，FFN 负责"处理信息"
3. **存储知识**：研究表明 FFN 的权重中存储了大量事实知识（类似 key-value memory）
4. **增加模型容量**：FFN 参数量是注意力层的 2 倍（$2 \times d_{model} \times d_{ff} = 8d_{model}^2$ vs $4d_{model}^2$）

### 5.3 激活函数的演进

| 模型 | 激活函数 | 公式 | 特点 |
|------|---------|------|------|
| 原始 Transformer | ReLU | $\max(0, x)$ | 简单，但有"死神经元"问题 |
| GPT-2/BERT | GELU | $x \cdot \Phi(x)$ | 平滑版 ReLU，效果更好 |
| LLaMA/PaLM | SwiGLU | $\text{Swish}(xW_1) \odot (xW_2)$ | 门控机制，当前最优 |
| Mistral | SiLU (Swish) | $x \cdot \sigma(x)$ | SwiGLU 的基础 |

**GELU**（Gaussian Error Linear Units）：

$$\text{GELU}(x) = x \cdot \Phi(x) = x \cdot \frac{1}{2}\left[1 + \text{erf}\left(\frac{x}{\sqrt{2}}\right)\right]$$

近似公式：$\text{GELU}(x) \approx 0.5x\left(1 + \tanh\left[\sqrt{2/\pi}(x + 0.044715x^3)\right]\right)$

**SwiGLU**（Swish-Gated Linear Unit）：

$$\text{SwiGLU}(x) = \text{SiLU}(xW_{\text{gate}}) \odot (xW_{\text{up}})$$
$$\text{SiLU}(x) = x \cdot \sigma(x) = \frac{x}{1 + e^{-x}}$$

注意 SwiGLU 有三个权重矩阵（gate, up, down），实际 $d_{ff}$ 需要调整为原来的 $2/3$ 以保持参数量一致：$d_{ff} = \frac{2}{3} \times 4d_{model}$，LLaMA 中取 $d_{ff} = \frac{8}{3}d_{model}$ 再向上取整到 256 的倍数。

### 5.4 FFN 作为 Key-Value 记忆

Geva et al. (2021) 的研究 "Transformer Feed-Forward Layers Are Key-Value Memories" 揭示了一个深刻的视角：

将 FFN 展开：$\text{FFN}(x) = \text{ReLU}(xW_1)W_2$

令 $k_i$ 为 $W_1$ 的第 $i$ 列，$v_i$ 为 $W_2$ 的第 $i$ 行：

$$\text{FFN}(x) = \sum_{i=1}^{d_{ff}} \text{ReLU}(x \cdot k_i) \cdot v_i$$

这可以理解为：$k_i$ 是"模式"（key），$x \cdot k_i$ 计算输入与模式的匹配度，$v_i$ 是对应的"知识"（value）。匹配度高时输出对应知识，匹配度低时 ReLU 裁剪为 0。这解释了为什么大模型能记住大量事实——知识分布式存储在 FFN 的权重中。

### 5.5 代码实现

```python
class PositionwiseFFN(nn.Module):
    """逐位置前馈网络（原始版本，ReLU 激活）"""
    
    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len, d_model)
        Returns:
            (batch, seq_len, d_model)
        """
        # x → (batch, seq_len, d_ff) → ReLU → dropout → (batch, seq_len, d_model)
        return self.linear2(self.dropout(torch.relu(self.linear1(x))))


class SwiGLUFFN(nn.Module):
    """SwiGLU 前馈网络（LLaMA/Mistral 风格）"""
    
    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        # SwiGLU 需要三个投影矩阵
        self.w_gate = nn.Linear(d_model, d_ff, bias=False)
        self.w_up = nn.Linear(d_model, d_ff, bias=False)
        self.w_down = nn.Linear(d_ff, d_model, bias=False)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len, d_model)
        Returns:
            (batch, seq_len, d_model)
        """
        # gate: SiLU(x @ W_gate)
        gate = torch.nn.functional.silu(self.w_gate(x))
        # up: x @ W_up
        up = self.w_up(x)
        # 逐元素相乘 + 降维
        return self.w_down(self.dropout(gate * up))
```

### 5.6 参数量与计算量

| 变体 | 参数量 | FLOPs/token |
|------|--------|-------------|
| 标准 FFN (ReLU) | $2 \times d_{model} \times d_{ff} = 8d^2$ | $2 \times 2nd \times d_{ff} = 16nd^2$ |
| SwiGLU ($d_{ff}' = \frac{8}{3}d$) | $3 \times d \times \frac{8}{3}d = 8d^2$ | $3 \times 2nd \times \frac{8}{3}d = 16nd^2$ |

两者参数量和计算量相当（SwiGLU 通过缩小 $d_{ff}$ 来补偿额外的 gate 矩阵）。

---

## 6. 残差连接与层归一化

### 6.1 残差连接（Residual Connection）

每个子层的输出不直接传递，而是加上该子层的输入：

$$\text{output} = x + \text{SubLayer}(x)$$

**为什么需要残差连接？**

1. **梯度通路**：深层网络中，梯度需要通过数十层反向传播。残差连接提供了一条"高速公路"——梯度可以直接从输出层流到输入层而不经过中间的非线性变换，缓解梯度消失。
2. **恒等映射基线**：如果某一层不需要对输入做任何变换，它只需要让 $\text{SubLayer}(x) \approx 0$ 即可。这比从零学习恒等映射容易得多。
3. **训练稳定性**：初始化时子层输出接近零，整体行为接近恒等映射，训练起步更稳定。

数学上，对于 $L$ 层网络：

$$x_L = x_0 + \sum_{l=0}^{L-1} F_l(x_l)$$

反向传播时：

$$\frac{\partial \mathcal{L}}{\partial x_0} = \frac{\partial \mathcal{L}}{\partial x_L} \cdot \left(1 + \frac{\partial}{\partial x_0}\sum_{l=0}^{L-1} F_l(x_l)\right)$$

注意第一项 $\frac{\partial \mathcal{L}}{\partial x_L} \cdot 1$ 确保梯度始终能无损传回。

### 6.2 层归一化（Layer Normalization）

层归一化对单个样本的所有特征维度进行归一化：

$$\text{LayerNorm}(x) = \frac{x - \mu}{\sqrt{\sigma^2 + \epsilon}} \cdot \gamma + \beta$$

其中：
- $\mu = \frac{1}{d}\sum_{i=1}^{d} x_i$（沿特征维度求均值）
- $\sigma^2 = \frac{1}{d}\sum_{i=1}^{d} (x_i - \mu)^2$（沿特征维度求方差）
- $\gamma, \beta \in \mathbb{R}^d$ 是可学习的 scale 和 shift 参数
- $\epsilon$ 是防除零的小常数（如 $10^{-5}$）

**为什么是 Layer Norm 而不是 Batch Norm？**

| 特性 | Batch Norm | Layer Norm |
|------|-----------|-----------|
| 归一化维度 | batch 维度 | feature 维度 |
| 依赖 batch size | 是 | 否 |
| 推理时行为 | 需要记录 running mean/var | 与训练完全一致 |
| 适用场景 | CV（固定大小输入） | NLP（变长序列） |
| 序列长度变化 | 不同位置统计量不同 | 每个 token 独立归一化 |

对于 NLP 任务，不同 batch 中的序列长度不同，同一 batch 中 padding 位置不应参与统计，Layer Norm 天然适合。

### 6.3 Pre-Norm vs Post-Norm

**Post-Norm**（原始 Transformer）：

$$x' = \text{LayerNorm}(x + \text{SubLayer}(x))$$

归一化在残差加法之后。

**Pre-Norm**（GPT-2 及之后的主流选择）：

$$x' = x + \text{SubLayer}(\text{LayerNorm}(x))$$

归一化在子层之前。

**对比：**

| 特性 | Post-Norm | Pre-Norm |
|------|-----------|----------|
| 训练稳定性 | 较差，需要 warmup | 更稳定，可用更大 lr |
| 最终性能 | 略优（充分训练后） | 略低 |
| 是否需要 warmup | 必须 | 可以不用 |
| 深度扩展 | 难以超过 12 层不加 warmup | 可轻松训练 100+ 层 |
| 代表模型 | 原始 Transformer、BERT | GPT-2、GPT-3、LLaMA |

现代 LLM 几乎都使用 Pre-Norm。另外 LLaMA 进一步使用 **RMSNorm**（Root Mean Square Normalization）替代 Layer Norm：

$$\text{RMSNorm}(x) = \frac{x}{\sqrt{\frac{1}{d}\sum_{i=1}^d x_i^2 + \epsilon}} \cdot \gamma$$

RMSNorm 去掉了均值中心化和偏置项，计算更快，效果相当。

### 6.4 代码实现

```python
class LayerNorm(nn.Module):
    """标准 Layer Normalization"""
    
    def __init__(self, d_model: int, eps: float = 1e-6):
        super().__init__()
        self.gamma = nn.Parameter(torch.ones(d_model))
        self.beta = nn.Parameter(torch.zeros(d_model))
        self.eps = eps
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        mean = x.mean(dim=-1, keepdim=True)
        std = x.std(dim=-1, keepdim=True)
        return self.gamma * (x - mean) / (std + self.eps) + self.beta


class RMSNorm(nn.Module):
    """RMS Normalization（LLaMA 风格）"""
    
    def __init__(self, d_model: int, eps: float = 1e-6):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(d_model))
        self.eps = eps
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        rms = torch.sqrt(x.pow(2).mean(dim=-1, keepdim=True) + self.eps)
        return x / rms * self.weight


class SublayerConnection(nn.Module):
    """残差 + 层归一化的封装（Post-Norm 版本）"""
    
    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.norm = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor, sublayer_output: torch.Tensor) -> torch.Tensor:
        """Post-Norm: LayerNorm(x + Dropout(SubLayer(x)))"""
        return self.norm(x + self.dropout(sublayer_output))


class PreNormSublayer(nn.Module):
    """残差 + 层归一化的封装（Pre-Norm 版本）"""
    
    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.norm = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor, sublayer_fn) -> torch.Tensor:
        """Pre-Norm: x + Dropout(SubLayer(LayerNorm(x)))"""
        return x + self.dropout(sublayer_fn(self.norm(x)))
```

---

## 7. Encoder 结构详解

### 7.1 单层 Encoder

一个 Encoder Layer 由两个子层组成，每个子层配有残差连接和 Layer Norm：

1. **Multi-Head Self-Attention**：让每个位置关注输入序列的所有位置
2. **Position-wise FFN**：对每个位置独立进行非线性变换

整体公式（Post-Norm）：

$$h' = \text{LN}(x + \text{MHA}(x, x, x))$$
$$\text{output} = \text{LN}(h' + \text{FFN}(h'))$$

Pre-Norm 版本：

$$h' = x + \text{MHA}(\text{LN}(x), \text{LN}(x), \text{LN}(x))$$
$$\text{output} = h' + \text{FFN}(\text{LN}(h'))$$

### 7.2 完整 Encoder（$N$ 层堆叠）

$N$ 个相同结构的 Encoder Layer 顺序堆叠。每层的参数独立（不共享）。最终输出作为 Decoder 的 Cross-Attention 的 Key 和 Value。

```python
class EncoderLayer(nn.Module):
    """单层 Encoder（Post-Norm 版本，忠于原论文）"""
    
    def __init__(self, d_model: int, num_heads: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.self_attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.ffn = PositionwiseFFN(d_model, d_ff, dropout)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout1 = nn.Dropout(dropout)
        self.dropout2 = nn.Dropout(dropout)
    
    def forward(
        self,
        x: torch.Tensor,
        src_mask: torch.Tensor = None
    ) -> torch.Tensor:
        """
        Args:
            x: (batch, src_len, d_model)
            src_mask: (batch, 1, 1, src_len) — padding mask
        Returns:
            (batch, src_len, d_model)
        """
        # Sub-layer 1: Multi-Head Self-Attention
        attn_output, _ = self.self_attn(x, x, x, mask=src_mask)
        x = self.norm1(x + self.dropout1(attn_output))
        
        # Sub-layer 2: FFN
        ffn_output = self.ffn(x)
        x = self.norm2(x + self.dropout2(ffn_output))
        
        return x


class Encoder(nn.Module):
    """完整 Encoder：N 层 EncoderLayer 堆叠"""
    
    def __init__(
        self,
        num_layers: int,
        d_model: int,
        num_heads: int,
        d_ff: int,
        dropout: float = 0.1
    ):
        super().__init__()
        self.layers = nn.ModuleList([
            EncoderLayer(d_model, num_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        self.norm = nn.LayerNorm(d_model)  # 最终的 LayerNorm（部分实现有）
    
    def forward(
        self,
        x: torch.Tensor,
        src_mask: torch.Tensor = None
    ) -> torch.Tensor:
        """
        Args:
            x: (batch, src_len, d_model) — 已加上位置编码的输入
            src_mask: (batch, 1, 1, src_len)
        Returns:
            (batch, src_len, d_model) — Encoder 最终输出
        """
        for layer in self.layers:
            x = layer(x, src_mask)
        return self.norm(x)
```

### 7.3 Encoder 的信息流

```
Token IDs: [How, are, you, <pad>]
         ↓  Embedding + Scale
Embeddings: (batch, 4, 512)
         ↓  + Positional Encoding
Input:      (batch, 4, 512)
         ↓  Encoder Layer 1
            - Self-Attention: 每个词看所有词（pad 被 mask 掉）
            - FFN: 独立处理每个位置
         ↓  Encoder Layer 2
         ...
         ↓  Encoder Layer 6
Output:     (batch, 4, 512)  → 送给 Decoder 作为 K, V
```

---

## 8. Decoder 结构详解

### 8.1 单层 Decoder

Decoder Layer 比 Encoder Layer 多一个子层，共三个子层：

1. **Masked Multi-Head Self-Attention**：因果掩码，防止看到未来位置
2. **Multi-Head Cross-Attention**：Query 来自 Decoder，Key/Value 来自 Encoder 输出
3. **Position-wise FFN**：与 Encoder 中相同

公式（Post-Norm）：

$$h_1 = \text{LN}(x + \text{MaskedMHA}(x, x, x))$$
$$h_2 = \text{LN}(h_1 + \text{MHA}(h_1, \text{enc\_out}, \text{enc\_out}))$$
$$\text{output} = \text{LN}(h_2 + \text{FFN}(h_2))$$

### 8.2 因果掩码（Causal Mask）

因果掩码确保位置 $i$ 只能关注位置 $\le i$。实现方式是构造一个下三角矩阵：

$$\text{CausalMask}[i][j] = \begin{cases} 1 & \text{if } j \le i \\ 0 & \text{if } j > i \end{cases}$$

例如序列长度为 4：

```
[[1, 0, 0, 0],
 [1, 1, 0, 0],
 [1, 1, 1, 0],
 [1, 1, 1, 1]]
```

被 mask 的位置在 softmax 前设为 $-\infty$，softmax 后变为 0。

**为什么需要因果掩码？**

在训练时，Decoder 使用 Teacher Forcing——同时输入完整的目标序列。如果不加掩码，位置 $i$ 可以"偷看"位置 $i+1, i+2, ...$ 的 token，相当于直接看到了答案，模型就无法学会真正的生成能力。因果掩码确保训练行为与推理行为一致（推理时自回归生成，天然看不到未来）。

### 8.3 Cross-Attention 的作用

Cross-Attention 是 Encoder 和 Decoder 之间的"桥梁"：

- **Query**：来自 Decoder 上一个子层的输出——"我现在需要什么信息？"
- **Key, Value**：来自 Encoder 的最终输出——"源序列提供的所有信息"

这允许 Decoder 在生成每个 token 时，根据当前状态动态地"查询"源序列中最相关的部分。例如在机器翻译中，翻译到"猫"时，cross-attention 会关注源句中 "cat" 对应的 encoder 输出。

### 8.4 代码实现

```python
class DecoderLayer(nn.Module):
    """单层 Decoder（Post-Norm 版本）"""
    
    def __init__(self, d_model: int, num_heads: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.masked_self_attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.cross_attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.ffn = PositionwiseFFN(d_model, d_ff, dropout)
        
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.norm3 = nn.LayerNorm(d_model)
        
        self.dropout1 = nn.Dropout(dropout)
        self.dropout2 = nn.Dropout(dropout)
        self.dropout3 = nn.Dropout(dropout)
    
    def forward(
        self,
        x: torch.Tensor,
        encoder_output: torch.Tensor,
        tgt_mask: torch.Tensor = None,
        src_mask: torch.Tensor = None
    ) -> torch.Tensor:
        """
        Args:
            x: (batch, tgt_len, d_model) — Decoder 输入
            encoder_output: (batch, src_len, d_model) — Encoder 输出
            tgt_mask: (1, 1, tgt_len, tgt_len) — 因果掩码（下三角）
            src_mask: (batch, 1, 1, src_len) — 源序列 padding mask
        Returns:
            (batch, tgt_len, d_model)
        """
        # Sub-layer 1: Masked Self-Attention
        attn1, _ = self.masked_self_attn(x, x, x, mask=tgt_mask)
        x = self.norm1(x + self.dropout1(attn1))
        
        # Sub-layer 2: Cross-Attention (Q from decoder, K/V from encoder)
        attn2, _ = self.cross_attn(x, encoder_output, encoder_output, mask=src_mask)
        x = self.norm2(x + self.dropout2(attn2))
        
        # Sub-layer 3: FFN
        ffn_out = self.ffn(x)
        x = self.norm3(x + self.dropout3(ffn_out))
        
        return x


class Decoder(nn.Module):
    """完整 Decoder：N 层 DecoderLayer 堆叠"""
    
    def __init__(
        self,
        num_layers: int,
        d_model: int,
        num_heads: int,
        d_ff: int,
        dropout: float = 0.1
    ):
        super().__init__()
        self.layers = nn.ModuleList([
            DecoderLayer(d_model, num_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        self.norm = nn.LayerNorm(d_model)
    
    def forward(
        self,
        x: torch.Tensor,
        encoder_output: torch.Tensor,
        tgt_mask: torch.Tensor = None,
        src_mask: torch.Tensor = None
    ) -> torch.Tensor:
        for layer in self.layers:
            x = layer(x, encoder_output, tgt_mask, src_mask)
        return self.norm(x)
```

### 8.5 Teacher Forcing 与 Decoder 输入

训练时使用 **Teacher Forcing**：

- 目标序列 `<sos> I am a student <eos>` 
- Decoder 输入（shifted right）：`<sos> I am a student`
- 预测目标（labels）：`I am a student <eos>`

每个位置预测下一个 token，因果掩码确保不偷看未来。这允许整个目标序列并行计算（不需要自回归），极大加速训练。

推理时则是自回归（autoregressive）：一个 token 接一个 token 生成，每步将已生成的序列作为 Decoder 输入。

---

## 9. 输出层与生成策略

### 9.1 输出投影与 Softmax

Decoder 最终输出 $(B, n, d_{model})$ 需要映射到词表分布：

$$\text{logits} = \text{DecoderOutput} \cdot W_{\text{vocab}} + b$$

其中 $W_{\text{vocab}} \in \mathbb{R}^{d_{model} \times |V|}$。

概率分布：$P(y_t | y_{<t}, x) = \text{softmax}(\text{logits}_t)$

**权重共享（Weight Tying）**：原始论文中，输出投影矩阵 $W_{\text{vocab}}$ 与 Embedding 矩阵 $W_E$ 共享权重（转置关系）。好处：减少参数量（词表大时很显著），且语义上合理——相似词的 embedding 接近，输出时也倾向于预测相似词。

### 9.2 训练目标：交叉熵损失

$$\mathcal{L} = -\sum_{t=1}^{T} \log P(y_t^* | y_{<t}, x)$$

其中 $y_t^*$ 是目标序列的第 $t$ 个 token。在实现中使用 `nn.CrossEntropyLoss`，它内部包含 softmax。

**Label Smoothing**：原论文使用 $\epsilon_{ls} = 0.1$ 的标签平滑：

$$q(k) = \begin{cases} 1 - \epsilon_{ls} & \text{if } k = y^* \\ \epsilon_{ls} / (|V| - 1) & \text{otherwise} \end{cases}$$

防止模型过于自信，提升泛化性能（在 BLEU 评分上有 0.5-1 的提升）。

### 9.3 推理时的生成策略

**贪心解码（Greedy Decoding）**：每步选概率最大的 token。快但质量不一定最优。

$$y_t = \arg\max_w P(w | y_{<t}, x)$$

**束搜索（Beam Search）**：维护 $k$ 个候选序列（beam），每步扩展所有可能，保留概率最高的 $k$ 个。机器翻译中常用 $k=4\sim10$。

**采样策略**（用于开放式生成）：
- **Temperature Sampling**：$P(w) = \text{softmax}(\text{logits} / T)$，$T>1$ 更多样，$T<1$ 更确定
- **Top-k Sampling**：只从概率最高的 $k$ 个 token 中采样
- **Top-p (Nucleus) Sampling**：从累积概率 $\ge p$ 的最小 token 集合中采样
- **组合使用**：先 top-p 过滤，再 temperature 调节，最后采样

### 9.4 代码实现

```python
class OutputProjection(nn.Module):
    """输出投影层：d_model → vocab_size"""
    
    def __init__(self, d_model: int, vocab_size: int, share_embedding: nn.Embedding = None):
        super().__init__()
        if share_embedding is not None:
            # 权重共享：使用 embedding 的权重的转置
            self.projection = lambda x: torch.matmul(x, share_embedding.weight.T)
        else:
            self.projection = nn.Linear(d_model, vocab_size, bias=False)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len, d_model)
        Returns:
            logits: (batch, seq_len, vocab_size)
        """
        return self.projection(x)


def top_p_sampling(logits: torch.Tensor, p: float = 0.9, temperature: float = 1.0):
    """Top-p (nucleus) sampling with temperature"""
    # 温度调节
    logits = logits / temperature
    
    # 排序
    sorted_logits, sorted_indices = torch.sort(logits, descending=True, dim=-1)
    sorted_probs = torch.softmax(sorted_logits, dim=-1)
    cumulative_probs = torch.cumsum(sorted_probs, dim=-1)
    
    # 找到累积概率超过 p 的位置，将其 logits 设为 -inf
    sorted_indices_to_remove = cumulative_probs - sorted_probs > p
    sorted_logits[sorted_indices_to_remove] = float("-inf")
    
    # 还原顺序
    logits = sorted_logits.scatter(dim=-1, index=sorted_indices, src=sorted_logits)
    
    # 采样
    probs = torch.softmax(logits, dim=-1)
    next_token = torch.multinomial(probs, num_samples=1)
    return next_token
```

---

## 10. 维度追踪：从输入到输出的张量变化

以一个具体例子追踪完整前向传播的张量维度。设置：$B=2, n_{src}=10, n_{tgt}=8, d=512, h=8, d_{ff}=2048, |V|=32000$。

```
========== ENCODER ==========

源 Token IDs:          (2, 10)              — 整数索引
    ↓ TokenEmbedding
Token Embeddings:      (2, 10, 512)         — × sqrt(512)
    ↓ + PositionalEncoding
Encoder Input:         (2, 10, 512)         — 加 PE + dropout

--- Encoder Layer 1 ---
    ↓ Self-Attention
    Q = K = V:         (2, 10, 512)         — 输入
    分头后:             (2, 8, 10, 64)       — (B, h, n, d_k)
    Attn Scores:       (2, 8, 10, 10)       — QK^T / sqrt(64)
    Attn Weights:      (2, 8, 10, 10)       — softmax
    Context:           (2, 8, 10, 64)       — weights @ V
    合并后:             (2, 10, 512)         — concat + W_O
    ↓ Add & Norm
    Sub-layer 1 out:   (2, 10, 512)

    ↓ FFN
    升维:               (2, 10, 2048)        — W_1
    ReLU:              (2, 10, 2048)
    降维:               (2, 10, 512)         — W_2
    ↓ Add & Norm
    Sub-layer 2 out:   (2, 10, 512)

--- Encoder Layer 2~6: 同结构 ---

Encoder Final Output:  (2, 10, 512)         — 送入 Decoder


========== DECODER ==========

目标 Token IDs:        (2, 8)               — shifted right
    ↓ TokenEmbedding
Token Embeddings:      (2, 8, 512)
    ↓ + PositionalEncoding
Decoder Input:         (2, 8, 512)

--- Decoder Layer 1 ---
    ↓ Masked Self-Attention
    Q = K = V:         (2, 8, 512)
    Causal Mask:       (1, 1, 8, 8)         — 下三角
    Attn Scores:       (2, 8, 8, 8)         — 未来位置为 -inf
    Context:           (2, 8, 512)
    ↓ Add & Norm
    Sub-layer 1 out:   (2, 8, 512)

    ↓ Cross-Attention
    Q:                 (2, 8, 512)          — 来自 Decoder
    K, V:              (2, 10, 512)         — 来自 Encoder output
    Attn Scores:       (2, 8, 8, 10)       — (B, h, tgt_len, src_len)
    Context:           (2, 8, 512)
    ↓ Add & Norm
    Sub-layer 2 out:   (2, 8, 512)

    ↓ FFN
    ...
    ↓ Add & Norm
    Sub-layer 3 out:   (2, 8, 512)

--- Decoder Layer 2~6: 同结构 ---

Decoder Final Output:  (2, 8, 512)


========== OUTPUT ==========

    ↓ Linear (weight tying with embedding)
Logits:                (2, 8, 32000)        — 每个位置的词表分布
    ↓ Softmax (在 loss 中计算)
Probabilities:         (2, 8, 32000)        — 每行和为 1
    ↓ CrossEntropyLoss
Scalar Loss
```

---

## 11. 完整 PyTorch 实现

### 11.1 Mask 生成工具

```python
def create_padding_mask(seq: torch.Tensor, pad_idx: int = 0) -> torch.Tensor:
    """
    生成 padding mask：pad 位置为 0，其他为 1
    Args:
        seq: (batch, seq_len) — token indices
    Returns:
        (batch, 1, 1, seq_len) — 可以 broadcast 到 (batch, heads, seq_q, seq_k)
    """
    return (seq != pad_idx).unsqueeze(1).unsqueeze(2).float()


def create_causal_mask(size: int) -> torch.Tensor:
    """
    生成因果掩码（下三角矩阵）
    Args:
        size: 序列长度
    Returns:
        (1, 1, size, size) — 下三角为 1，上三角为 0
    """
    mask = torch.tril(torch.ones(size, size)).unsqueeze(0).unsqueeze(0)
    return mask  # (1, 1, size, size)


def create_decoder_mask(tgt: torch.Tensor, pad_idx: int = 0) -> torch.Tensor:
    """
    Decoder 的组合 mask = padding mask AND causal mask
    Args:
        tgt: (batch, tgt_len)
    Returns:
        (batch, 1, tgt_len, tgt_len)
    """
    tgt_len = tgt.size(1)
    # Padding mask: (batch, 1, 1, tgt_len)
    pad_mask = create_padding_mask(tgt, pad_idx)
    # Causal mask: (1, 1, tgt_len, tgt_len)
    causal_mask = create_causal_mask(tgt_len).to(tgt.device)
    # 组合: (batch, 1, tgt_len, tgt_len) — 两个 mask 的交集
    return pad_mask & causal_mask
```

### 11.2 完整 Transformer 模型

```python
class Transformer(nn.Module):
    """
    完整的 Transformer Encoder-Decoder 模型
    忠于 "Attention Is All You Need" 原始论文实现
    """
    
    def __init__(
        self,
        src_vocab_size: int,
        tgt_vocab_size: int,
        d_model: int = 512,
        num_heads: int = 8,
        num_encoder_layers: int = 6,
        num_decoder_layers: int = 6,
        d_ff: int = 2048,
        max_seq_len: int = 5000,
        dropout: float = 0.1,
        pad_idx: int = 0
    ):
        super().__init__()
        
        self.pad_idx = pad_idx
        self.d_model = d_model
        
        # Embedding 层
        self.src_embedding = TokenEmbedding(src_vocab_size, d_model)
        self.tgt_embedding = TokenEmbedding(tgt_vocab_size, d_model)
        
        # 位置编码（源和目标共享同一个 PE）
        self.positional_encoding = SinusoidalPositionalEncoding(d_model, max_seq_len, dropout)
        
        # Encoder & Decoder
        self.encoder = Encoder(num_encoder_layers, d_model, num_heads, d_ff, dropout)
        self.decoder = Decoder(num_decoder_layers, d_model, num_heads, d_ff, dropout)
        
        # 输出投影（与 target embedding 共享权重）
        self.output_projection = nn.Linear(d_model, tgt_vocab_size, bias=False)
        # 权重共享
        self.output_projection.weight = self.tgt_embedding.embedding.weight
        
        # 初始化参数
        self._init_parameters()
    
    def _init_parameters(self):
        """Xavier uniform 初始化（原论文推荐）"""
        for p in self.parameters():
            if p.dim() > 1:
                nn.init.xavier_uniform_(p)
    
    def encode(
        self,
        src: torch.Tensor,
        src_mask: torch.Tensor = None
    ) -> torch.Tensor:
        """
        Encoder 前向传播
        Args:
            src: (batch, src_len) — 源序列 token IDs
            src_mask: (batch, 1, 1, src_len)
        Returns:
            (batch, src_len, d_model)
        """
        src_embed = self.positional_encoding(self.src_embedding(src))
        return self.encoder(src_embed, src_mask)
    
    def decode(
        self,
        tgt: torch.Tensor,
        encoder_output: torch.Tensor,
        tgt_mask: torch.Tensor = None,
        src_mask: torch.Tensor = None
    ) -> torch.Tensor:
        """
        Decoder 前向传播
        Args:
            tgt: (batch, tgt_len) — 目标序列 token IDs
            encoder_output: (batch, src_len, d_model)
            tgt_mask: (batch, 1, tgt_len, tgt_len)
            src_mask: (batch, 1, 1, src_len)
        Returns:
            (batch, tgt_len, d_model)
        """
        tgt_embed = self.positional_encoding(self.tgt_embedding(tgt))
        return self.decoder(tgt_embed, encoder_output, tgt_mask, src_mask)
    
    def forward(
        self,
        src: torch.Tensor,
        tgt: torch.Tensor
    ) -> torch.Tensor:
        """
        完整前向传播
        Args:
            src: (batch, src_len) — 源序列
            tgt: (batch, tgt_len) — 目标序列（shifted right）
        Returns:
            logits: (batch, tgt_len, tgt_vocab_size)
        """
        # 生成 mask
        src_mask = create_padding_mask(src, self.pad_idx)
        tgt_mask = create_decoder_mask(tgt, self.pad_idx)
        
        # Encode
        encoder_output = self.encode(src, src_mask)
        
        # Decode
        decoder_output = self.decode(tgt, encoder_output, tgt_mask, src_mask)
        
        # 输出投影 → logits
        logits = self.output_projection(decoder_output)
        
        return logits
    
    @torch.no_grad()
    def generate(
        self,
        src: torch.Tensor,
        max_len: int = 100,
        sos_idx: int = 1,
        eos_idx: int = 2
    ) -> torch.Tensor:
        """
        自回归推理（贪心解码）
        Args:
            src: (batch, src_len) — 源序列
            max_len: 最大生成长度
            sos_idx: 起始 token ID
            eos_idx: 结束 token ID
        Returns:
            (batch, generated_len) — 生成的 token 序列
        """
        self.eval()
        batch_size = src.size(0)
        device = src.device
        
        # Encode（只需计算一次）
        src_mask = create_padding_mask(src, self.pad_idx)
        encoder_output = self.encode(src, src_mask)
        
        # 初始化 decoder 输入：只有 <sos>
        tgt = torch.full((batch_size, 1), sos_idx, dtype=torch.long, device=device)
        
        for _ in range(max_len - 1):
            tgt_mask = create_causal_mask(tgt.size(1)).to(device)
            
            # Decode
            decoder_output = self.decode(tgt, encoder_output, tgt_mask, src_mask)
            
            # 取最后一个位置的 logits
            logits = self.output_projection(decoder_output[:, -1:, :])  # (batch, 1, vocab)
            next_token = logits.argmax(dim=-1)  # (batch, 1)
            
            # 拼接
            tgt = torch.cat([tgt, next_token], dim=1)
            
            # 检查是否所有序列都生成了 <eos>
            if (next_token == eos_idx).all():
                break
        
        return tgt
```

### 11.3 使用示例

```python
# 模型配置（Base 模型）
model = Transformer(
    src_vocab_size=32000,
    tgt_vocab_size=32000,
    d_model=512,
    num_heads=8,
    num_encoder_layers=6,
    num_decoder_layers=6,
    d_ff=2048,
    dropout=0.1
)

# 检查参数量
total_params = sum(p.numel() for p in model.parameters())
print(f"Total parameters: {total_params:,}")  # 约 65M

# 模拟输入
src = torch.randint(1, 32000, (2, 10))  # (batch=2, src_len=10)
tgt = torch.randint(1, 32000, (2, 8))   # (batch=2, tgt_len=8)

# 前向传播
logits = model(src, tgt)
print(f"Logits shape: {logits.shape}")  # (2, 8, 32000)

# 推理
generated = model.generate(src, max_len=20)
print(f"Generated shape: {generated.shape}")  # (2, <=20)
```

### 11.4 Decoder-Only 变体（GPT 风格）

现代 LLM 大多使用 Decoder-Only 架构，去掉了 Encoder 和 Cross-Attention：

```python
class GPTBlock(nn.Module):
    """GPT 风格的 Decoder-Only Block（Pre-Norm）"""
    
    def __init__(self, d_model: int, num_heads: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.norm1 = nn.LayerNorm(d_model)
        self.attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.norm2 = nn.LayerNorm(d_model)
        self.ffn = PositionwiseFFN(d_model, d_ff, dropout)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        # Pre-Norm + Causal Self-Attention
        normed = self.norm1(x)
        attn_out, _ = self.attn(normed, normed, normed, mask=mask)
        x = x + self.dropout(attn_out)
        
        # Pre-Norm + FFN
        normed = self.norm2(x)
        ffn_out = self.ffn(normed)
        x = x + self.dropout(ffn_out)
        
        return x


class GPTModel(nn.Module):
    """简化的 GPT 模型（Decoder-Only Transformer）"""
    
    def __init__(
        self,
        vocab_size: int,
        d_model: int = 768,
        num_heads: int = 12,
        num_layers: int = 12,
        d_ff: int = 3072,
        max_seq_len: int = 1024,
        dropout: float = 0.1
    ):
        super().__init__()
        self.token_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(max_seq_len, d_model)  # 可学习位置编码
        self.dropout = nn.Dropout(dropout)
        
        self.blocks = nn.ModuleList([
            GPTBlock(d_model, num_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        
        self.ln_f = nn.LayerNorm(d_model)  # 最终 LayerNorm
        self.head = nn.Linear(d_model, vocab_size, bias=False)
        
        # 权重共享
        self.head.weight = self.token_emb.weight
    
    def forward(self, idx: torch.Tensor) -> torch.Tensor:
        """
        Args:
            idx: (batch, seq_len) — token indices
        Returns:
            logits: (batch, seq_len, vocab_size)
        """
        B, T = idx.size()
        device = idx.device
        
        # Embedding
        tok_emb = self.token_emb(idx)  # (B, T, d_model)
        pos = torch.arange(T, device=device).unsqueeze(0)  # (1, T)
        pos_emb = self.pos_emb(pos)    # (1, T, d_model)
        x = self.dropout(tok_emb + pos_emb)
        
        # 因果掩码
        causal_mask = create_causal_mask(T).to(device)
        
        # Transformer blocks
        for block in self.blocks:
            x = block(x, mask=causal_mask)
        
        # 最终 LN + 输出投影
        x = self.ln_f(x)
        logits = self.head(x)
        
        return logits
```

---

## 12. 训练技巧与优化细节

### 12.1 学习率调度：Warmup + Cosine/InvSqrt Decay

原始论文使用了特殊的学习率调度策略：

$$lr = d_{model}^{-0.5} \cdot \min(step^{-0.5}, step \cdot warmup\_steps^{-1.5})$$

这意味着：
- 前 $warmup\_steps$ 步（论文中为 4000）：学习率线性增加
- 之后：学习率按 $step^{-0.5}$ 衰减

**为什么需要 warmup？**

1. 训练初期，模型参数随机，梯度方向不稳定。如果一开始就用大学习率，会导致参数大幅震荡甚至发散。
2. Layer Norm 的统计量在初期不稳定（特别是 Post-Norm），需要几步"热身"。
3. Adam 优化器的二阶矩估计需要几步才能收敛到合理值。

```python
class TransformerLRScheduler:
    """原始 Transformer 学习率调度器"""
    
    def __init__(self, optimizer, d_model: int, warmup_steps: int = 4000):
        self.optimizer = optimizer
        self.d_model = d_model
        self.warmup_steps = warmup_steps
        self.step_num = 0
    
    def step(self):
        self.step_num += 1
        lr = self._get_lr()
        for param_group in self.optimizer.param_groups:
            param_group['lr'] = lr
    
    def _get_lr(self):
        return self.d_model ** (-0.5) * min(
            self.step_num ** (-0.5),
            self.step_num * self.warmup_steps ** (-1.5)
        )
```

现代实践中更常用 **Cosine Annealing with Warmup**：

$$lr = \begin{cases}
lr_{max} \cdot \frac{step}{warmup} & \text{if } step < warmup \\
lr_{min} + (lr_{max} - lr_{min}) \cdot \frac{1 + \cos(\pi \cdot \frac{step - warmup}{total - warmup})}{2} & \text{otherwise}
\end{cases}$$

### 12.2 优化器选择

| 优化器 | 使用场景 | 特点 |
|--------|---------|------|
| Adam (原论文) | 通用 | $\beta_1=0.9, \beta_2=0.98, \epsilon=10^{-9}$ |
| AdamW | BERT/GPT 之后的标准 | 解耦权重衰减，效果更好 |
| Lion | Google 2023 | 内存省一半（只存 sign），效果相当 |
| Adafactor | T5 | 低内存（分解二阶矩），适合超大模型 |

### 12.3 正则化技巧

**1. Dropout**（原论文中的三处）：
- 注意力权重的 dropout（softmax 之后）
- 子层输出的 dropout（残差加法之前）
- 位置编码后的 dropout

**2. Label Smoothing**（$\epsilon = 0.1$）：
- 让模型对正确答案的概率不要过于接近 1
- 实际上是对 KL 散度做了正则

**3. 权重衰减（Weight Decay）**：
- 通常 0.01~0.1
- 注意：LayerNorm 的 $\gamma, \beta$ 和 bias 项不应该施加权重衰减

**4. Gradient Clipping**：
- 防止梯度爆炸，通常 clip 到 1.0
- `torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)`

### 12.4 混合精度训练

使用 FP16/BF16 + FP32 混合精度可以：
- 减少 50% 显存占用
- 利用 Tensor Core 加速 2-3 倍
- 需要 Loss Scaling 防止 FP16 下溢

```python
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()

for batch in dataloader:
    optimizer.zero_grad()
    
    with autocast(dtype=torch.float16):
        logits = model(src, tgt)
        loss = criterion(logits.view(-1, vocab_size), labels.view(-1))
    
    scaler.scale(loss).backward()
    scaler.unscale_(optimizer)
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    scaler.step(optimizer)
    scaler.update()
```

**BF16 vs FP16**：BF16 有更大的指数范围（与 FP32 相同），不容易下溢，因此不需要 Loss Scaling。LLaMA、GPT-4 等都使用 BF16。

### 12.5 数据与 Batch

- **动态 Batching**：按 token 数而非句子数组 batch，确保 GPU 利用率最大化
- **梯度累积**：等效增大 batch size（内存不够时的替代方案）
- **序列打包（Packing）**：多个短序列拼成一个长序列，减少 padding 浪费

---

## 13. Transformer 变体演进

### 13.1 架构变体总览

```
                    Original Transformer (2017)
                           |
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    Encoder-Only      Decoder-Only     Encoder-Decoder
    (BERT, 2018)      (GPT, 2018)      (T5, 2019)
          |                |                |
    RoBERTa           GPT-2/3          mBART
    ALBERT            LLaMA            mT5
    DeBERTa           Mistral          FLAN-T5
    ELECTRA           Qwen             UL2
```

### 13.2 关键改进时间线

| 时间 | 改进 | 代表 | 说明 |
|------|------|------|------|
| 2018 | Pre-Norm | GPT-2 | 训练更稳定 |
| 2019 | Sparse Attention | Sparse Transformer | $O(n\sqrt{n})$ 复杂度 |
| 2020 | Rotary Position (RoPE) | — | 更好的相对位置编码 |
| 2020 | SwiGLU 激活 | GLU Variants | 替代 ReLU/GELU |
| 2021 | Flash Attention | Dao et al. | IO-aware 精确注意力 |
| 2021 | RMSNorm | — | 替代 LayerNorm，更快 |
| 2022 | GQA | Multi-Query/GQA | 减少 KV Cache 内存 |
| 2023 | Sliding Window | Mistral | 有限上下文+效率 |
| 2023 | Mixture of Experts | Mixtral | 稀疏激活，更多参数 |
| 2024 | Mamba/RWKV | — | 线性复杂度替代方案 |

### 13.3 Encoder-Only：BERT 家族

BERT 的核心改变：
- 去掉 Decoder，只保留 Encoder
- 用 Masked Language Model (MLM) 预训练：随机遮蔽 15% token，让模型预测
- 双向注意力：每个 token 都能看到全部上下文
- 适合理解类任务（分类、NER、问答）

### 13.4 Decoder-Only：GPT 家族

GPT 的核心改变：
- 去掉 Encoder 和 Cross-Attention
- 因果语言模型（Causal LM）：只预测下一个 token
- Pre-Norm（从 GPT-2 开始）
- Scaling Law：更大的模型+数据 = 更好的性能

**LLaMA 的具体改进（集现代最佳实践之大成）**：
1. Pre-Norm with RMSNorm
2. SwiGLU activation in FFN
3. Rotary Position Embedding (RoPE)
4. Grouped-Query Attention (GQA)（70B 版本）
5. 无 bias 项

### 13.5 高效注意力变体

**Flash Attention**（Dao et al., 2022）：
- 不是近似注意力，而是 IO-aware 的精确实现
- 核心思想：避免将完整的 $n \times n$ 注意力矩阵写入 HBM，通过分块（tiling）在 SRAM 中计算
- 减少 HBM 访问次数：从 $O(n^2)$ 降到 $O(n^2 / M)$（$M$ 为 SRAM 大小）
- 实际加速 2-4 倍，内存从 $O(n^2)$ 降到 $O(n)$

**Grouped-Query Attention (GQA)**：
- 标准 MHA：$h$ 组独立的 Q, K, V
- Multi-Query (MQA)：所有头共享一组 K, V
- GQA：$g$ 组 K, V（$1 < g < h$），每组被 $h/g$ 个 Q 头共享
- 目的：减少 KV Cache 大小，加速推理，质量损失很小

### 13.6 线性复杂度挑战者

**Mamba（Gu & Dao, 2023）**：
- 基于 State Space Model (SSM)
- 选择性状态空间：输入依赖的参数
- $O(n)$ 时间和空间复杂度
- 在某些任务上匹配 Transformer 性能

**RWKV**：
- 线性注意力的 RNN 变体
- 训练时可并行（像 Transformer），推理时是 RNN（$O(1)$ 每步）
- 参数量从 0.1B 到 14B 都有

目前这些挑战者在长序列任务上有优势，但在需要精确全局信息检索的任务上仍不如标准 Transformer。

---

## 14. 工程实践与性能分析

### 14.1 参数量计算公式

对于 Decoder-Only Transformer（$L$ 层，$d$ 维，$h$ 头，$d_{ff}$，词表 $V$）：

```
每层参数：
  Self-Attention:  4 × d² (Q, K, V, O 投影)
  FFN (标准):      2 × d × d_ff = 8d² (当 d_ff=4d)
  LayerNorm:       2 × 2d = 4d (两个 LN 的 γ, β)
  每层总计:        ≈ 12d²

全模型：
  Embedding:       V × d
  所有层:          L × 12d²
  最终 LN:         2d
  输出头:          V × d (通常与 embedding 共享)
  
  总计 ≈ L × 12d² + V × d
```

验证 LLaMA-7B：$L=32, d=4096, d_{ff}=11008, V=32000$
- 每层 Attention: $4 \times 4096^2 = 67M$
- 每层 FFN (SwiGLU): $3 \times 4096 \times 11008 = 135M$
- 每层总计: $\approx 202M$
- 32 层: $202M \times 32 = 6.46B$
- Embedding: $32000 \times 4096 = 131M$
- 总计: $\approx 6.7B$ ✓

### 14.2 FLOPs 计算

对于自回归训练（每个 token 的 FLOPs）：

$$\text{FLOPs/token} \approx 6 \times N_{\text{params}}$$

其中因子 6 来自：2（矩阵乘法 FLOPs = 2mn）× 3（前向+反向传播，反向约为前向的 2 倍）。

对于 7B 模型、2T tokens 训练：$6 \times 7 \times 10^9 \times 2 \times 10^{12} = 8.4 \times 10^{22}$ FLOPs

在 A100 (312 TFLOPS BF16) 上，假设 50% 利用率：$8.4 \times 10^{22} / (312 \times 10^{12} \times 0.5) / 3600 / 24 \approx 62$ 天（单卡），用 128 卡约 12 小时。

### 14.3 内存占用分析

训练 7B 模型的内存构成：

| 组件 | 大小 | 说明 |
|------|------|------|
| 模型参数 (BF16) | 14 GB | $7B \times 2$ bytes |
| 梯度 (BF16) | 14 GB | 与参数同大小 |
| 优化器状态 (FP32) | 56 GB | Adam: $m$ + $v$ + master weight = $4 \times 4$ bytes × 7B |
| 激活值 | 可变 | 取决于 batch size、seq len、是否用 gradient checkpointing |
| **总计** | ~84 GB+ | 单张 A100 80GB 放不下 |

解决方案：
- **ZeRO**（DeepSpeed）：将参数/梯度/优化器状态分片到多 GPU
- **Gradient Checkpointing**：用计算换内存，减少激活值存储
- **Flash Attention**：减少注意力层的激活值内存

### 14.4 KV Cache 与推理优化

自回归生成时，每生成一个 token 都需要重新计算所有 Attention。但 K 和 V 的历史部分不变，可以缓存：

```python
class CachedMultiHeadAttention(MultiHeadAttention):
    """带 KV Cache 的注意力（推理加速）"""
    
    def forward_with_cache(
        self,
        x: torch.Tensor,
        kv_cache: tuple = None,
        mask: torch.Tensor = None
    ):
        """
        Args:
            x: (batch, 1, d_model) — 当前步的输入（只有一个新 token）
            kv_cache: (cached_K, cached_V)，各为 (batch, heads, past_len, d_k)
        Returns:
            output: (batch, 1, d_model)
            new_kv_cache: (new_K, new_V)
        """
        batch_size = x.size(0)
        
        # 当前步的 Q, K, V
        Q = self.split_heads(self.W_q(x))   # (batch, heads, 1, d_k)
        K_new = self.split_heads(self.W_k(x))  # (batch, heads, 1, d_k)
        V_new = self.split_heads(self.W_v(x))  # (batch, heads, 1, d_k)
        
        # 拼接历史缓存
        if kv_cache is not None:
            K_cached, V_cached = kv_cache
            K = torch.cat([K_cached, K_new], dim=2)  # (batch, heads, past+1, d_k)
            V = torch.cat([V_cached, V_new], dim=2)
        else:
            K, V = K_new, V_new
        
        # 注意力计算（Q 只有 1 个位置，K/V 有所有历史）
        scores = torch.matmul(Q, K.transpose(-2, -1)) / self.scale  # (batch, heads, 1, total_len)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float("-inf"))
        attn_weights = torch.softmax(scores, dim=-1)
        context = torch.matmul(attn_weights, V)  # (batch, heads, 1, d_k)
        
        # 合并 + 输出投影
        output = self.W_o(self.merge_heads(context))
        
        return output, (K, V)
```

**KV Cache 内存**：每层需要 $2 \times B \times h \times n \times d_k$ 个元素。对于 LLaMA-7B（$L=32, h=32, d_k=128$），序列长度 4096，batch=1，BF16：

$$32 \times 2 \times 1 \times 32 \times 4096 \times 128 \times 2 \text{ bytes} = 2 \text{ GB}$$

这就是为什么需要 GQA/MQA 来压缩 KV Cache。

### 14.5 常见实现框架

| 框架 | 特点 | 适用场景 |
|------|------|---------|
| Hugging Face Transformers | 最全的预训练模型库 | 使用/微调现有模型 |
| PyTorch Lightning | 训练封装 | 中等规模训练 |
| DeepSpeed | ZeRO、Pipeline Parallelism | 大规模分布式训练 |
| Megatron-LM | Tensor/Pipeline/Data Parallelism | 超大模型预训练 |
| vLLM | PagedAttention | 高吞吐推理服务 |
| TensorRT-LLM | GPU 极致优化 | 生产环境推理 |

---

## 15. 对比辨析

### 15.1 Transformer vs RNN vs CNN（综合对比）

| 维度 | Transformer | RNN (LSTM/GRU) | CNN (1D Conv) |
|------|-------------|----------------|---------------|
| 并行能力 | 完全并行 | 严格串行 | 完全并行 |
| 长距离依赖 | $O(1)$ 路径 | $O(n)$ 路径 | $O(\log n)$ 或 $O(n/k)$ |
| 参数共享方式 | 层间不共享，层内头间不共享 | 所有时间步共享 | 所有位置共享 |
| 位置感知 | 需要额外编码 | 天然具备 | 通过相对位置 |
| 内存复杂度 | $O(n^2)$（标准），$O(n)$（Flash） | $O(n)$ | $O(n)$ |
| 计算复杂度 | $O(n^2d)$ | $O(nd^2)$ | $O(knd^2)$ |
| 可扩展性 | 极强（Scaling Law） | 差 | 中等 |
| 推理效率 | 自回归时较慢（可优化） | 每步 $O(d^2)$ | 非自回归快 |

### 15.2 Post-Norm vs Pre-Norm

| 特性 | Post-Norm | Pre-Norm |
|------|-----------|----------|
| 残差分支的输出范围 | 归一化后有界 | 可能无界增长 |
| 训练深度极限 | ~12 层（无 warmup） | 100+ 层 |
| warmup 必要性 | 必须 | 可选 |
| 最终性能（充分训练） | 略优 | 略低 |
| 工程复杂度 | 需要仔细调参 | 相对鲁棒 |
| 代表模型 | BERT, 原始 Transformer | GPT-2/3, LLaMA |

### 15.3 Encoder-Decoder vs Decoder-Only

| 维度 | Encoder-Decoder | Decoder-Only |
|------|-----------------|--------------|
| 典型任务 | 翻译、摘要 | 通用生成 |
| 输入处理 | 双向编码 | 单向（因果） |
| 参数效率 | 编码器参数不直接产出 | 所有参数都参与生成 |
| Few-shot 能力 | 较弱 | 强（in-context learning） |
| Scaling 表现 | 好 | 极好（GPT-3 证明） |
| 当前主流 | T5 家族 | GPT/LLaMA/Claude |

### 15.4 各种 Attention 变体对比

| 变体 | KV 头数 | KV Cache 大小 | 质量 | 推理速度 |
|------|---------|---------------|------|----------|
| MHA | $h$ | $2Lnhd_k$ | 最高 | 基准 |
| MQA | 1 | $2Lnd_k$ | 略低 | 最快 |
| GQA ($g=8$) | 8 | $2Ln \cdot 8d_k$ | 接近 MHA | 较快 |

---

## 16. 常见面试题（附答案要点）

### 面试题 1：为什么 Transformer 要除以 $\sqrt{d_k}$？

**答案要点**：假设 Q 和 K 的各维度独立同分布，均值 0，方差 1，则点积 $q \cdot k = \sum_{i=1}^{d_k} q_i k_i$ 的方差为 $d_k$（各项独立，方差可加）。当 $d_k=64$ 时，点积的标准差为 8，这意味着 softmax 的输入值可以很大（绝对值远大于 1），导致 softmax 输出趋近于 one-hot（梯度接近零）。除以 $\sqrt{d_k}$ 将方差归一化回 1，确保 softmax 工作在梯度有效的区域。

### 面试题 2：为什么用 Layer Norm 而不用 Batch Norm？

**答案要点**：三个原因：(1) NLP 序列长度不固定，BN 需要在 batch 维度统计均值/方差，不同长度的序列难以对齐；(2) padding 位置不应参与统计，BN 处理起来很麻烦；(3) BN 在推理时依赖训练阶段的 running statistics，但 NLP 的输入分布变化大（不同领域/语言），统计量不稳定。LN 对每个样本的 feature 维度独立归一化，不依赖 batch，天然适合变长序列。

### 面试题 3：Multi-Head Attention 相比 Single-Head 的优势？

**答案要点**：(1) 多子空间：每个头在不同的线性子空间中学习不同的关注模式（如有的头关注语法，有的关注语义，有的关注位置关系）；(2) 参数不增：由于 $d_k = d_{model}/h$，MHA 的参数量和计算量与 single-head 相当；(3) 鲁棒性：多个头的平均比单头更稳定；(4) 实验验证：论文中 $h=8$ 显著优于 $h=1$，但继续增大 $h$ 收益递减。

### 面试题 4：Transformer 的位置编码为什么要加到 Embedding 上，而不是拼接？

**答案要点**：(1) 维度效率：拼接会增加 $d_{model}$（如 $d_{model} + d_{pos}$），增加后续所有层的计算量；加法保持维度不变。(2) 信息融合：加法让内容信息和位置信息在同一空间中混合，后续的线性投影（QKV）可以自然地学习到内容-位置的交互。(3) 实验效果：加法和拼接效果接近，但加法更节省计算。(4) 注意：RoPE 的做法更优雅——它通过旋转而非加法来注入位置，使得 $q_i^T k_j$ 天然依赖相对位置 $i-j$。

### 面试题 5：为什么 GPT 用 Decoder-Only 而不用 Encoder-Decoder？

**答案要点**：(1) 统一建模：Decoder-Only 可以把所有任务统一为"给定前缀，续写"的形式（prompt + completion），不需要区分"输入"和"输出"；(2) 简洁性：少了 Encoder 和 Cross-Attention，架构更简单，更容易 Scale；(3) In-Context Learning：Decoder-Only 的因果注意力天然支持 few-shot 示例在 context 中传递；(4) 研究证据：Scaling Law 表明 Decoder-Only 在同参数量下 perplexity 更低；(5) 工程原因：推理时只需要维护一个 KV Cache，而 Encoder-Decoder 需要两套。

### 面试题 6：Transformer 的计算瓶颈在哪里？如何解决？

**答案要点**：瓶颈是注意力矩阵的 $O(n^2)$ 复杂度。当序列长度 $n$ 很大时（如 100K+），注意力计算和内存都成为瓶颈。解决方案包括：(1) Flash Attention：不降低复杂度但减少 IO，实际加速 2-4x；(2) Sparse Attention：只关注局部+全局锚点，复杂度 $O(n\sqrt{n})$；(3) Linear Attention：用核方法将 softmax 近似为线性操作，$O(n)$；(4) Sliding Window：限制注意力范围（Mistral）；(5) 外部记忆：分块处理+可检索的外部存储。

### 面试题 7：请解释 KV Cache 的工作原理和内存计算。

**答案要点**：在自回归生成时，每生成一个新 token，需要用它对所有历史 token 做注意力。如果每次都重新计算所有 token 的 K 和 V，则生成 $n$ 个 token 的总计算为 $O(n^3)$。KV Cache 将每一层的 K 和 V 存起来，新 token 只需计算自己的 Q/K/V 然后与缓存拼接，将每步计算从 $O(n^2)$ 降为 $O(n)$，总计算 $O(n^2)$。内存：$L \times 2 \times B \times h \times n \times d_k \times \text{bytes}$。对 7B 模型（$L=32, h=32, d_k=128$），seq_len=4096，BF16 约 2GB/sample。

### 面试题 8：Pre-Norm 和 Post-Norm 各自的优缺点？

**答案要点**：Post-Norm（原始）在残差加法之后做 LN：$\text{LN}(x + F(x))$。优点是最终性能略好（因为归一化约束了残差的范围），缺点是深度大时训练不稳定，必须配合 warmup。Pre-Norm 在子层之前做 LN：$x + F(\text{LN}(x))$。优点是训练非常稳定（梯度直通残差不经过 LN），可以训练很深的网络且不需要 warmup。缺点是随深度增加残差分支的贡献越来越小（指数衰减效应），最终性能略低。现代 LLM 都用 Pre-Norm 因为稳定性更重要。

### 面试题 9：Transformer 的参数量和 FLOPs 如何计算？

**答案要点**：参数量：每层约 $12d^2$（Attention $4d^2$ + FFN $8d^2$），$L$ 层总计 $12Ld^2$，加上 Embedding $Vd$，加上 LN 和 bias（可忽略）。FLOPs/token：每层约 $24d^2$（矩阵乘法 FLOPs = 2mn），$L$ 层 $24Ld^2$，加上注意力矩阵 $4n \cdot d$ 和 logits $2Vd$。近似规则：FLOPs ≈ $6 \times N$ × tokens（训练时，含前向+反向）。

### 面试题 10：为什么说 FFN 存储了知识？如何验证？

**答案要点**：Geva et al. (2021) 发现 FFN 可以理解为 key-value memory：$\text{FFN}(x) = \sum_i \text{ReLU}(x \cdot k_i) \cdot v_i$，其中 $k_i$ 是 $W_1$ 的列（作为 pattern detector），$v_i$ 是 $W_2$ 的行（存储的知识）。验证方法：(1) 修改特定 FFN 神经元可以改变模型输出的事实（如"巴黎是...的首都"）；(2) 知识编辑方法（ROME）直接修改 FFN 权重实现事实更新；(3) FFN 参数量占模型的 2/3（对于标准 $d_{ff}=4d$），是主要的存储容量。

---

## 17. 易错点与最佳实践

### 易错点 1：忘记 Embedding 缩放

```python
# ❌ 错误：直接用 embedding，值太小
x = self.embedding(tokens)

# ✅ 正确：乘以 sqrt(d_model)
x = self.embedding(tokens) * math.sqrt(self.d_model)
```

不缩放时，embedding 的方差约为 $1/d_{model}$（Xavier 初始化），加上 PE（方差约 0.5）后，PE 主导信息，模型难以收敛。

### 易错点 2：Mask 的维度和含义搞混

```python
# ❌ 错误：mask 含义搞反（1 表示遮蔽）
scores = scores.masked_fill(mask == 1, float("-inf"))

# ✅ 正确：mask=0 的位置需要被遮蔽
scores = scores.masked_fill(mask == 0, float("-inf"))

# ❌ 错误：causal mask 维度不对
mask = torch.tril(torch.ones(seq_len, seq_len))  # (seq_len, seq_len)

# ✅ 正确：需要扩展到 (1, 1, seq_len, seq_len) 以便 broadcast
mask = torch.tril(torch.ones(seq_len, seq_len)).unsqueeze(0).unsqueeze(0)
```

### 易错点 3：Teacher Forcing 时的 shift 错误

```python
# ❌ 错误：decoder 输入和 labels 相同
decoder_input = target_sequence
labels = target_sequence

# ✅ 正确：decoder 输入是 shifted right，labels 是 shifted left
decoder_input = target_sequence[:, :-1]  # [<sos>, w1, w2, ..., wn-1]
labels = target_sequence[:, 1:]           # [w1, w2, ..., wn-1, <eos>]
```

### 易错点 4：Cross-Attention 中 Q/K/V 来源搞错

```python
# ❌ 错误：cross-attention 中 Q 来自 encoder
cross_attn_out = self.cross_attn(encoder_output, decoder_hidden, decoder_hidden)

# ✅ 正确：Q 来自 decoder，K/V 来自 encoder
cross_attn_out = self.cross_attn(
    query=decoder_hidden,      # Q: decoder 当前状态（"我需要什么"）
    key=encoder_output,        # K: encoder 输出（"源序列有什么"）
    value=encoder_output       # V: encoder 输出（"提供什么信息"）
)
```

### 易错点 5：权重共享时忘记缩放

```python
# 当 output embedding 与 output projection 共享权重时
# output logits = hidden @ embedding_weight.T
# 必须在 embedding 时乘以 sqrt(d_model)，否则共享后量级不匹配

# 正确做法
class TransformerWithSharedWeights(nn.Module):
    def __init__(self, vocab_size, d_model):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.d_model = d_model
        # output projection 直接用 embedding.weight（转置）
    
    def encode_tokens(self, x):
        return self.embedding(x) * math.sqrt(self.d_model)  # 别忘了缩放！
    
    def output_logits(self, hidden):
        # hidden @ embedding.weight.T，不需要额外缩放
        return torch.matmul(hidden, self.embedding.weight.T)
```

### 易错点 6：推理时忘记因果掩码

```python
# 错误：推理时不加掩码，导致"偷看"后面的 token
def generate_wrong(model, prompt_ids):
    logits = model(prompt_ids)  # 如果模型内部没有自动加 causal mask，结果是错的
    return logits[:, -1, :].argmax(dim=-1)

# 正确：确保 causal mask 始终存在
def generate_correct(model, prompt_ids):
    seq_len = prompt_ids.size(1)
    causal_mask = torch.tril(torch.ones(seq_len, seq_len)).unsqueeze(0).unsqueeze(0)
    logits = model(prompt_ids, mask=causal_mask)
    return logits[:, -1, :].argmax(dim=-1)
```

### 易错点 7：Post-Norm 训练深层模型时梯度爆炸

```python
# Post-Norm（原始 Transformer）在层数很多（>12）时容易训练不稳定
# 解决方案 1：使用 Pre-Norm（推荐）
# 解决方案 2：如果必须用 Post-Norm，使用学习率 warmup + 梯度裁剪

# Pre-Norm 天然更稳定的原因：
# Post-Norm: LayerNorm(x + SubLayer(x)) — 残差路径上没有归一化，梯度可能累积
# Pre-Norm:  x + SubLayer(LayerNorm(x)) — 残差路径是恒等映射，梯度直接传播
```

### 易错点 8：beam search 中 KV Cache 处理不当

```python
# beam search 需要在 beam 维度上正确索引 KV Cache
# 错误：直接复制 KV Cache 给所有 beam
# 正确：每次选中 beam 后，用 gather 选出对应的 cache

def beam_search_step(kv_cache, beam_indices):
    """
    kv_cache: (batch*num_beams, num_heads, seq_len, d_k)
    beam_indices: (batch*num_beams,) — 每个 beam 选中的来源 beam 索引
    """
    # 按 beam_indices 重排 KV Cache
    new_cache = kv_cache.index_select(0, beam_indices)
    return new_cache
```

### 易错点 9：混淆 attention mask 的 0/1 含义

```python
# 不同框架对 mask 的约定不同：
# PyTorch nn.MultiheadAttention: True = 被遮蔽（不参与注意力）
# HuggingFace Transformers:      1 = 参与注意力，0 = 被遮蔽
# 自己实现时:                     通常 1 = 参与，0 = 被遮蔽（加 -inf）

# 极易出错的场景：从 HuggingFace 切换到自定义实现时忘记反转 mask
# 排查方法：打印 attention weights，看 padding 位置权重是否为 0

# HuggingFace 风格
attention_mask_hf = torch.tensor([[1, 1, 1, 0, 0]])  # 后两个是 padding

# 转为自定义实现的风格（如果自定义用 masked_fill(mask==0, -inf)）
# 直接使用即可，因为 padding 位置是 0，会被填充 -inf

# 转为 PyTorch 官方 nn.MHA 风格（True = 被遮蔽）
key_padding_mask_pytorch = (attention_mask_hf == 0)  # [False, False, False, True, True]
```

### 易错点 10：训练与推理模式不一致

```python
# Dropout 在训练时随机丢弃，推理时不丢弃
# 如果忘记切换 model.eval()，推理结果会有随机性

model.train()   # 训练模式：Dropout 生效
model.eval()    # 推理模式：Dropout 关闭

# 另一个常见问题：LayerNorm 在 train/eval 模式下行为一样
# 但 BatchNorm 不一样（Transformer 一般不用 BN，但混合架构要注意）

# 最佳实践：推理时始终用 torch.no_grad() + model.eval()
with torch.no_grad():
    model.eval()
    output = model(input_ids)
```

---

## 最佳实践总结

| 实践 | 原因 | 适用场景 |
|------|------|----------|
| 使用 Pre-Norm | 训练更稳定，无需精细调参 | 深层模型（>12层） |
| Warmup + Cosine Decay | 避免早期梯度爆炸 + 后期收敛 | 所有 Transformer 训练 |
| 权重共享（Embed ↔ Output） | 减少参数、提升泛化 | 词表较大时 |
| 梯度裁剪 max_norm=1.0 | 防止梯度爆炸 | 标配 |
| KV Cache | 推理加速 $O(n)$ → $O(1)$ 每步 | 自回归生成 |
| FlashAttention | 减少显存、提升速度 2-4× | 长序列训练/推理 |
| GQA | 在精度与效率间取平衡 | 大规模部署 |
| Mixed Precision (BF16) | 训练速度翻倍、显存减半 | 现代 GPU (A100+) |
| Gradient Checkpointing | 用计算换显存 | 显存不足时 |
| Rotary Position Embedding (RoPE) | 更好的长度外推能力 | 现代 LLM 标配 |

---

> **下一篇**：[05-位置编码](./05-位置编码.md) — 深入探讨各种位置编码方案（绝对、相对、RoPE、ALiBi），它们的数学原理与实际效果对比。
