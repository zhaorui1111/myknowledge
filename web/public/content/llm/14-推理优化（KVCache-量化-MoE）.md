# 14. 推理优化：KV Cache、量化与 MoE

> **定位**：大语言模型（Large Language Model, LLM）从"能训出来"到"能用起来"，推理优化是最后一公里也是最关键一公里。本篇系统讲解三大核心推理优化技术——**KV Cache 管理**、**模型量化（Quantization）**、**混合专家模型（Mixture of Experts, MoE）**，并延伸覆盖 FlashAttention、Speculative Decoding、连续批处理等工程实践，配合完整 Python/PyTorch 代码、数学推导与面试题。

---

## 目录

1. [LLM 推理全景：瓶颈在哪里](#1-llm-推理全景瓶颈在哪里)
2. [KV Cache：原理、显存分析与优化](#2-kv-cache原理显存分析与优化)
3. [FlashAttention 系列](#3-flashattention-系列)
4. [连续批处理与调度](#4-连续批处理与调度)
5. [模型量化（Quantization）](#5-模型量化quantization)
6. [Speculative Decoding（投机解码）](#6-speculative-decoding投机解码)
7. [混合专家模型（MoE）](#7-混合专家模型moe)
8. [主流推理引擎对比](#8-主流推理引擎对比)
9. [生产部署最佳实践](#9-生产部署最佳实践)
10. [常见面试题（附答案要点）](#10-常见面试题附答案要点)
11. [易错点与最佳实践](#11-易错点与最佳实践)

---

## 1. LLM 推理全景：瓶颈在哪里

### 1.1 推理 vs 训练的根本区别

训练（Training）是计算密集型（Compute-Bound）任务：大批量矩阵乘法可以充分利用 GPU 算力。推理（Inference）则截然不同——自回归解码（Autoregressive Decoding）每步只生成一个 token，单次计算量极小，但需要从显存读取整个模型权重和历史 KV Cache，是典型的**内存带宽受限（Memory-Bandwidth Bound）**问题。

用 Roofline 模型来量化这个瓶颈。定义**算术强度（Arithmetic Intensity）**为：

$$
\text{AI} = \frac{\text{FLOPs}}{\text{Bytes Accessed}}
$$

对于自回归解码阶段的一次前向传播（batch size = 1）：

- **计算量**：约 $2 \times P$ FLOPs（$P$ 为参数量），例如 LLaMA-70B 约 140 TFLOPs
- **显存访问量**：需读取全部模型参数 + KV Cache，以 FP16 存储的 70B 模型约 140 GB
- **算术强度**：$\text{AI} \approx \frac{2P}{2P} = 1$ FLOP/Byte（batch=1 时每个参数仅用一次）

A100 GPU 的 HBM 带宽为 2 TB/s，峰值算力为 312 TFLOPS（FP16），其**平衡点（Ridge Point）**为：

$$
\text{Ridge} = \frac{312 \times 10^{12}}{2 \times 10^{12}} = 156 \text{ FLOPs/Byte}
$$

batch=1 时的实际 AI ≈ 1，远低于 156 的平衡点，因此 decode 阶段是严重的**带宽受限**。只有将 batch size 提高到 ~156 才能让 GPU 算力被充分利用——这就是 Continuous Batching 的动机所在。

```
┌────────────────────────────────────────────────────────┐
│                  Roofline Model (A100)                  │
│                                                        │
│ TFLOPS │                    ┌──── Peak: 312 TFLOPS     │
│   312  │--------------------│                          │
│        │                   /│                          │
│        │                  / │                          │
│        │   Training ★    /  │                          │
│        │   (bs=256)     /   │                          │
│        │               /    │                          │
│        │              /     │                          │
│        │             /      │                          │
│        │            /       │  HBM bandwidth: 2 TB/s   │
│        │  ★ Decode /        │                          │
│        │  (bs=1)  /         │                          │
│        │─────────/──────────│                          │
│        └────────────────────┘                          │
│              AI (FLOPs/Byte)                           │
└────────────────────────────────────────────────────────┘
```

**关键洞察**：LLM 推理优化的核心目标就是——**减少显存访问量**（KV Cache 压缩、量化）或**提高有效计算密度**（增大 batch、投机解码）。

### 1.2 推理的关键性能指标

| 指标 | 英文 | 含义 | 优化手段 |
|------|------|------|----------|
| 首 Token 延迟 | TTFT (Time To First Token) | 用户发送请求到看到第一个输出 token 的时间 | Prefix Caching、KV Cache 复用 |
| 单 Token 延迟 | TPOT (Time Per Output Token) | 生成每个后续 token 的平均耗时 | 量化、FlashAttention、MQA/GQA |
| 端到端延迟 | Latency | 完整请求的响应时间 | Speculative Decoding |
| 吞吐量 | Throughput (tokens/s) | 系统每秒处理的 token 总量 | Continuous Batching、PagedAttention |

### 1.3 推理优化技术全景图

```
                    LLM 推理优化技术全景
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   模型层面            系统层面           硬件层面
        │                 │                 │
  ┌─────┼─────┐     ┌─────┼─────┐     ┌─────┼─────┐
  │     │     │     │     │     │     │     │     │
量化  蒸馏  剪枝  调度  内存   算子  GPU  专用芯片 互联
  │           │     │   管理   优化        │
GPTQ       结构   连续  │    Flash     H100/B200
AWQ        化剪枝 批处理 │   Attention   TPU
GGUF              │   Paged       │
BitsNBytes        │   Attention   Flash
FP8              投机          Decoding
                 解码
```

---

## 2. KV Cache：原理、显存分析与优化

### 2.1 自回归推理的两阶段

LLM 的推理分为两个截然不同的阶段：

**Prefill 阶段（预填充）**：一次性处理整个输入 prompt，计算所有 token 的 KV 并缓存。这一阶段是计算密集型的，因为涉及大规模的矩阵乘法（GEMM），可以充分利用 GPU 并行能力。

**Decode 阶段（解码/生成）**：每步生成一个 token。新 token 只需与历史 KV Cache 做注意力计算（矩阵-向量乘法，GEMV），但需要读取完整的 KV Cache。这一阶段是内存带宽受限型的。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple, List
import math

class CausalSelfAttention(nn.Module):
    """带 KV Cache 的因果自注意力层，完整演示 Prefill + Decode 两阶段。"""

    def __init__(self, d_model: int, n_heads: int):
        super().__init__()
        assert d_model % n_heads == 0
        self.d_model = d_model
        self.n_heads = n_heads
        self.d_head = d_model // n_heads

        self.W_q = nn.Linear(d_model, d_model, bias=False)
        self.W_k = nn.Linear(d_model, d_model, bias=False)
        self.W_v = nn.Linear(d_model, d_model, bias=False)
        self.W_o = nn.Linear(d_model, d_model, bias=False)

    def forward(
        self,
        x: torch.Tensor,              # (batch, seq_len, d_model)
        kv_cache: Optional[Tuple[torch.Tensor, torch.Tensor]] = None,
        use_cache: bool = False,
    ) -> Tuple[torch.Tensor, Optional[Tuple[torch.Tensor, torch.Tensor]]]:
        B, T, C = x.shape

        Q = self.W_q(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        K = self.W_k(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        V = self.W_v(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)

        # KV Cache 拼接（Decode 阶段核心）
        if kv_cache is not None:
            past_K, past_V = kv_cache
            K = torch.cat([past_K, K], dim=2)
            V = torch.cat([past_V, V], dim=2)

        new_cache = (K, V) if use_cache else None

        # 缩放点积注意力
        S = K.size(2)
        scale = 1.0 / math.sqrt(self.d_head)
        attn_weights = torch.matmul(Q, K.transpose(-2, -1)) * scale

        # 因果掩码：仅在 Prefill 阶段需要（T > 1）
        if T > 1:
            causal_mask = torch.triu(
                torch.ones(T, S, dtype=torch.bool, device=x.device),
                diagonal=S - T + 1,
            )
            attn_weights.masked_fill_(causal_mask.unsqueeze(0).unsqueeze(0), float('-inf'))

        attn_weights = F.softmax(attn_weights, dim=-1)
        output = torch.matmul(attn_weights, V)
        output = output.transpose(1, 2).contiguous().view(B, T, C)
        return self.W_o(output), new_cache


def demo_kv_cache_inference():
    """演示带 KV Cache 的自回归推理流程。"""
    d_model, n_heads = 512, 8
    attn = CausalSelfAttention(d_model, n_heads).eval()

    with torch.no_grad():
        # === Prefill 阶段 ===
        prompt = torch.randn(1, 10, d_model)
        out, cache = attn(prompt, kv_cache=None, use_cache=True)
        print(f"Prefill: output={out.shape}, KV len={cache[0].shape[2]}")
        # output=(1,10,512), KV len=10

        # === Decode 阶段（逐 token 生成）===
        for step in range(5):
            tok = torch.randn(1, 1, d_model)
            out, cache = attn(tok, kv_cache=cache, use_cache=True)
            print(f"Step {step}: output={out.shape}, KV len={cache[0].shape[2]}")
            # KV len 逐步增长: 11, 12, 13, 14, 15

# demo_kv_cache_inference()
```

### 2.2 KV Cache 的数学推导

在标准 MHA 中，对于序列中第 $t$ 个 token 的注意力计算：

$$
\text{Attention}(Q_t, K_{1:t}, V_{1:t}) = \text{softmax}\!\left(\frac{Q_t K_{1:t}^\top}{\sqrt{d_k}}\right) V_{1:t}
$$

没有 KV Cache 时，每生成一个新 token 都要对前面所有 token 重新计算 K 和 V（线性投影），总投影计算量为 $\sum_{t=1}^{n} t = O(n^2)$ 次投影操作。有 KV Cache 时，每步只计算一次投影并追加到缓存，总计 $n$ 次，节省 $O(n)$ 倍的投影计算。

注意力的计算本身（矩阵-向量乘）每步仍为 $O(t \cdot d)$，总计 $O(n^2 \cdot d)$，这一部分无法通过 KV Cache 加速，但可以通过 FlashAttention 减少 HBM 访问。

### 2.3 显存占用精确计算

KV Cache 的显存取决于以下参数：

| 符号 | 含义 | 典型值 |
|------|------|--------|
| $L$ | Transformer 层数 | 32~128 |
| $H_{kv}$ | KV 头数 | 1~128 |
| $d_h$ | 每头维度 | 64~128 |
| $S$ | 序列长度 | 4K~128K |
| $B$ | Batch size | 1~256 |
| $b$ | 字节/元素 | 2 (FP16) |

**总 KV Cache 显存公式**：

$$
\text{KV}_{\text{mem}} = 2 \times L \times H_{kv} \times S \times d_h \times b \times B
$$

```python
def compute_kv_cache_memory(
    n_layers: int,
    n_kv_heads: int,
    d_head: int,
    seq_len: int,
    batch_size: int = 1,
    dtype_bytes: int = 2,
) -> float:
    """返回 KV Cache 的 GB 占用。"""
    total = 2 * n_layers * n_kv_heads * seq_len * d_head * dtype_bytes * batch_size
    return total / (1024 ** 3)


# 对比不同模型
configs = {
    "LLaMA-2-7B (MHA)":   (32, 32, 128),
    "LLaMA-2-70B (MHA)":  (80, 64, 128),
    "LLaMA-3-8B (GQA)":   (32, 8, 128),
    "LLaMA-3-70B (GQA)":  (80, 8, 128),
    "Mistral-7B (GQA)":   (32, 8, 128),
    "DeepSeek-V3 (MLA)":  (61, 1, 512),  # MLA 等效维度
}

print(f"{'Model':<25} {'4K ctx (GB)':>12} {'128K ctx (GB)':>14}")
print("-" * 55)
for name, (layers, kv_h, dh) in configs.items():
    gb_4k = compute_kv_cache_memory(layers, kv_h, dh, 4096)
    gb_128k = compute_kv_cache_memory(layers, kv_h, dh, 131072)
    print(f"{name:<25} {gb_4k:>12.2f} {gb_128k:>14.2f}")
```

### 2.4 Multi-Query Attention (MQA) 与 Grouped-Query Attention (GQA)

标准 MHA 中每个注意力头都有独立的 K 和 V 投影。MQA 和 GQA 通过**共享 KV 头**来降低缓存量：

- **MQA**（Shazeer, 2019）：$H_{kv} = 1$，所有 Q 头共享一组 KV
- **GQA**（Ainslie et al., 2023）：$H_{kv} = G$（$1 < G < H$），每 $H/G$ 个 Q 头共享一组 KV

```
MHA:  Q1→K1,V1  Q2→K2,V2  Q3→K3,V3  Q4→K4,V4 ... Q8→K8,V8    (KV heads = 8)
GQA:  Q1→K1,V1  Q2→K1,V1  Q3→K2,V2  Q4→K2,V2 ... Q8→K4,V4    (KV heads = 4)
MQA:  Q1→K1,V1  Q2→K1,V1  Q3→K1,V1  Q4→K1,V1 ... Q8→K1,V1    (KV heads = 1)
```

GQA 的 KV Cache 减少比例为 $H_{kv}/H$。例如 LLaMA-3-70B 使用 $H=64, H_{kv}=8$，KV Cache 仅为 MHA 版本的 $1/8$。

```python
class GroupedQueryAttention(nn.Module):
    """GQA 完整实现。n_kv_heads=n_heads 时退化为 MHA，=1 时退化为 MQA。"""

    def __init__(self, d_model: int, n_heads: int, n_kv_heads: int):
        super().__init__()
        assert d_model % n_heads == 0
        assert n_heads % n_kv_heads == 0

        self.n_heads = n_heads
        self.n_kv_heads = n_kv_heads
        self.n_rep = n_heads // n_kv_heads  # 每组 KV 服务多少个 Q 头
        self.d_head = d_model // n_heads

        self.W_q = nn.Linear(d_model, n_heads * self.d_head, bias=False)
        self.W_k = nn.Linear(d_model, n_kv_heads * self.d_head, bias=False)
        self.W_v = nn.Linear(d_model, n_kv_heads * self.d_head, bias=False)
        self.W_o = nn.Linear(d_model, d_model, bias=False)

    @staticmethod
    def repeat_kv(x: torch.Tensor, n_rep: int) -> torch.Tensor:
        """将 KV 头扩展（重复）到与 Q 头数匹配。
        输入: (B, n_kv_heads, S, d_head)
        输出: (B, n_heads, S, d_head)
        """
        if n_rep == 1:
            return x
        B, H_kv, S, D = x.shape
        # 先 unsqueeze 再 expand 再 reshape，内存高效（不实际复制）
        return (
            x[:, :, None, :, :]       # (B, H_kv, 1, S, D)
            .expand(B, H_kv, n_rep, S, D)
            .reshape(B, H_kv * n_rep, S, D)
        )

    def forward(
        self,
        x: torch.Tensor,
        kv_cache: Optional[Tuple[torch.Tensor, torch.Tensor]] = None,
        use_cache: bool = False,
    ) -> Tuple[torch.Tensor, Optional[Tuple[torch.Tensor, torch.Tensor]]]:
        B, T, _ = x.shape

        Q = self.W_q(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        K = self.W_k(x).view(B, T, self.n_kv_heads, self.d_head).transpose(1, 2)
        V = self.W_v(x).view(B, T, self.n_kv_heads, self.d_head).transpose(1, 2)

        if kv_cache is not None:
            past_K, past_V = kv_cache
            K = torch.cat([past_K, K], dim=2)
            V = torch.cat([past_V, V], dim=2)

        new_cache = (K, V) if use_cache else None

        # 将 KV 头扩展到与 Q 头一致（利用 expand，零拷贝）
        K_expanded = self.repeat_kv(K, self.n_rep)  # (B, n_heads, S, d_head)
        V_expanded = self.repeat_kv(V, self.n_rep)

        S = K_expanded.size(2)
        scale = 1.0 / math.sqrt(self.d_head)
        attn = torch.matmul(Q, K_expanded.transpose(-2, -1)) * scale

        if T > 1:
            mask = torch.triu(torch.ones(T, S, dtype=torch.bool, device=x.device),
                              diagonal=S - T + 1)
            attn.masked_fill_(mask.unsqueeze(0).unsqueeze(0), float('-inf'))

        attn = F.softmax(attn, dim=-1)
        out = torch.matmul(attn, V_expanded)
        out = out.transpose(1, 2).contiguous().view(B, T, -1)
        return self.W_o(out), new_cache
```

### 2.5 Multi-head Latent Attention (MLA)

**MLA**（DeepSeek-V2/V3 提出）是比 GQA 更激进的 KV Cache 压缩方案。其核心思想是：不存储 K 和 V 本身，而是存储一个**低秩压缩向量** $c_t$，推理时再从 $c_t$ 恢复出 K 和 V。

设压缩维度为 $d_c$（远小于 $H_{kv} \times d_h$），MLA 的 KV 生成过程为：

$$
c_t = W_{\text{down}} \cdot h_t, \quad c_t \in \mathbb{R}^{d_c}
$$

$$
K_t = W_{\text{up}}^K \cdot c_t, \quad V_t = W_{\text{up}}^V \cdot c_t
$$

KV Cache 中只存 $c_t$（$d_c$ 维），而非完整的 K 和 V（$2 \times H \times d_h$ 维）。DeepSeek-V3 中 $d_c = 512$，而完整 KV 需要 $2 \times 128 \times 128 = 32768$ 维，压缩比高达 **64 倍**。

```python
class MultiHeadLatentAttention(nn.Module):
    """MLA (Multi-head Latent Attention) 简化实现。
    
    核心：KV Cache 中只存压缩向量 c_t，推理时恢复 K/V。
    """

    def __init__(self, d_model: int, n_heads: int, d_compress: int):
        super().__init__()
        self.n_heads = n_heads
        self.d_head = d_model // n_heads
        self.d_compress = d_compress

        # Q 正常投影
        self.W_q = nn.Linear(d_model, d_model, bias=False)

        # KV 压缩：先下投影到 d_compress，再上投影恢复
        self.W_down_kv = nn.Linear(d_model, d_compress, bias=False)    # 压缩
        self.W_up_k = nn.Linear(d_compress, d_model, bias=False)       # 恢复 K
        self.W_up_v = nn.Linear(d_compress, d_model, bias=False)       # 恢复 V

        self.W_o = nn.Linear(d_model, d_model, bias=False)

    def forward(
        self,
        x: torch.Tensor,
        c_cache: Optional[torch.Tensor] = None,  # 缓存的是压缩向量
        use_cache: bool = False,
    ):
        B, T, _ = x.shape

        Q = self.W_q(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)

        # 计算压缩向量 c_t
        c_t = self.W_down_kv(x)  # (B, T, d_compress)

        # 拼接历史压缩缓存
        if c_cache is not None:
            c_all = torch.cat([c_cache, c_t], dim=1)  # (B, S, d_compress)
        else:
            c_all = c_t

        new_cache = c_all if use_cache else None

        # 从压缩向量恢复完整 K, V
        K = self.W_up_k(c_all).view(B, -1, self.n_heads, self.d_head).transpose(1, 2)
        V = self.W_up_v(c_all).view(B, -1, self.n_heads, self.d_head).transpose(1, 2)

        S = K.size(2)
        scale = 1.0 / math.sqrt(self.d_head)
        attn = torch.matmul(Q, K.transpose(-2, -1)) * scale

        if T > 1:
            mask = torch.triu(torch.ones(T, S, dtype=torch.bool, device=x.device),
                              diagonal=S - T + 1)
            attn.masked_fill_(mask.unsqueeze(0).unsqueeze(0), float('-inf'))

        attn = F.softmax(attn, dim=-1)
        out = torch.matmul(attn, V).transpose(1, 2).contiguous().view(B, T, -1)
        return self.W_o(out), new_cache
```

> **MLA 的权衡**：存储减少了，但恢复 K/V 需要额外的矩阵乘法（$W_{\text{up}}^K, W_{\text{up}}^V$）。DeepSeek-V3 通过将 $W_{\text{up}}^K$ 吸收到 $W_q$ 中（$W_q' = W_q W_{\text{up}}^{K\top}$）来消除这个开销，但这需要在数学上重新推导注意力公式。

### 2.6 PagedAttention 与 vLLM

**问题**：传统 KV Cache 为每个请求预分配最大序列长度的连续显存。当实际生成长度远短于最大长度时，造成大量显存浪费。多请求并发时，碎片化问题更加严重。

**PagedAttention**（Kwon et al., 2023，vLLM 的核心创新）借鉴操作系统的**虚拟内存分页**思想，将 KV Cache 切分为固定大小的 **Block**（类似内存页），通过 **Block Table**（类似页表）实现逻辑到物理地址的映射。

```
传统方式：连续分配，浪费显存
┌────────────────────────────────────────────┐
│ Request 1: [K₁K₂K₃K₄K₅______waste______] │  预分配 max_len=2048
│ Request 2: [K₁K₂K₃________________waste_] │  实际只用了 3 个位置
│ Request 3: [K₁K₂K₃K₄K₅K₆K₇K₈___waste___] │
└────────────────────────────────────────────┘
内存利用率 < 50%

PagedAttention：按需分配，无浪费
┌────────────────────────────────────┐
│ Physical Blocks (固定大小, 如 16 tokens/block):      │
│ Block 0: [K₁K₂...K₁₆]  ← Req1 的第 1 页          │
│ Block 1: [K₁K₂...K₁₆]  ← Req2 的第 1 页          │
│ Block 2: [K₁K₂...K₁₆]  ← Req1 的第 2 页          │
│ Block 3: [K₁K₂K₃_____]  ← Req3 的第 1 页（部分填充）│
│ ...                                               │
│                                                    │
│ Block Table (逻辑→物理映射):                        │
│ Req1: [Block 0, Block 2]                           │
│ Req2: [Block 1]                                    │
│ Req3: [Block 3]                                    │
└────────────────────────────────────┘
内存利用率 > 95%，按需增长
```

```python
import numpy as np
from dataclasses import dataclass, field

@dataclass
class KVBlock:
    """一个 KV Cache Block，存储固定数量 token 的 KV。"""
    block_size: int
    n_filled: int = 0
    # 实际存储 shape: (2, n_layers, n_kv_heads, block_size, d_head)
    # 这里用 placeholder 演示逻辑
    data: np.ndarray = field(default=None, repr=False)

    @property
    def is_full(self) -> bool:
        return self.n_filled >= self.block_size

    @property
    def free_slots(self) -> int:
        return self.block_size - self.n_filled


class PagedKVCacheManager:
    """PagedAttention 的 KV Cache 管理器。
    
    核心思想：
    1. 预分配一个大的 Block Pool
    2. 每个请求维护一个 Block Table（逻辑块 → 物理块映射）
    3. 按需分配和回收 Block
    """

    def __init__(self, total_blocks: int, block_size: int = 16):
        self.block_size = block_size
        # 物理 Block 池
        self.blocks = [KVBlock(block_size) for _ in range(total_blocks)]
        # 空闲 Block 列表
        self.free_blocks: List[int] = list(range(total_blocks))
        # 每个 request 的 Block Table: req_id → [physical_block_id, ...]
        self.block_tables: dict[int, List[int]] = {}

    def allocate_block(self) -> int:
        """分配一个空闲 Block，返回物理 Block ID。"""
        if not self.free_blocks:
            raise RuntimeError("OOM: 没有空闲 KV Block，需要触发 preemption")
        block_id = self.free_blocks.pop(0)
        self.blocks[block_id].n_filled = 0
        return block_id

    def free_request(self, req_id: int):
        """释放一个请求的所有 Block。"""
        if req_id in self.block_tables:
            for bid in self.block_tables[req_id]:
                self.blocks[bid].n_filled = 0
                self.free_blocks.append(bid)
            del self.block_tables[req_id]

    def append_token(self, req_id: int) -> Tuple[int, int]:
        """为请求追加一个 token 的 KV，返回 (block_id, slot_offset)。"""
        if req_id not in self.block_tables:
            self.block_tables[req_id] = []

        table = self.block_tables[req_id]

        # 检查最后一个 Block 是否有空间
        if not table or self.blocks[table[-1]].is_full:
            new_bid = self.allocate_block()
            table.append(new_bid)

        last_bid = table[-1]
        slot = self.blocks[last_bid].n_filled
        self.blocks[last_bid].n_filled += 1
        return last_bid, slot

    def get_stats(self) -> dict:
        total = len(self.blocks)
        free = len(self.free_blocks)
        return {
            "total_blocks": total,
            "used_blocks": total - free,
            "free_blocks": free,
            "utilization": (total - free) / total * 100,
            "active_requests": len(self.block_tables),
        }


# === 演示 ===
manager = PagedKVCacheManager(total_blocks=100, block_size=16)

# 模拟 3 个请求
for req_id, n_tokens in [(0, 50), (1, 10), (2, 35)]:
    for _ in range(n_tokens):
        manager.append_token(req_id)
    table = manager.block_tables[req_id]
    print(f"Req {req_id}: {n_tokens} tokens → {len(table)} blocks, "
          f"table={table}")

print(f"\nStats: {manager.get_stats()}")

# 请求 1 完成，释放
manager.free_request(1)
print(f"After freeing req 1: {manager.get_stats()}")
```

PagedAttention 的核心优势：

1. **近乎零浪费**：只有最后一个 Block 可能有少量浪费（< block_size 个 slot）
2. **动态增长**：Block 按需分配，不需要预估最大长度
3. **Copy-on-Write**：相同 prefix 的请求可以共享 Block（如 system prompt）
4. **Preemption**：显存不足时可以抢占低优先级请求的 Block

### 2.7 KV Cache 压缩：Token Eviction 与量化

除了减少 KV 头数和分页管理，还可以从两个方向压缩 KV Cache：

**Token Eviction（淘汰/驱逐）**：不是所有历史 token 的 KV 都同等重要。可以根据注意力分数淘汰不重要的 KV 条目。

**代表方法**：
- **H₂O (Heavy-Hitter Oracle)**（Zhang et al., 2023）：观察到注意力分数遵循幂律分布，少量 "Heavy Hitter" token 占据大部分注意力。H₂O 保留注意力分数累计最高的 token 加上最近的 token。
- **StreamingLLM**（Xiao et al., 2024）：发现前几个 token（"attention sink"）无论内容如何都获得高注意力分数。StreamingLLM 保留前 $k$ 个 sink token + 最近的滑动窗口，实现无限长度的流式推理。
- **SnapKV**（Li et al., 2024）：在 prefill 阶段根据注意力模式选择重要 token，decode 阶段只保留这些 token 的 KV。

**KV Cache 量化**：将 KV 的数据类型从 FP16 降低到 INT8/INT4，直接减半/四分之一显存。vLLM 已支持 FP8 KV Cache。

```python
class StreamingLLMCache:
    """StreamingLLM 风格的 KV Cache 管理。
    
    保留策略: [sink tokens (前 n_sink 个)] + [recent tokens (最近 n_recent 个)]
    """

    def __init__(self, n_sink: int = 4, n_recent: int = 508):
        self.n_sink = n_sink
        self.n_recent = n_recent
        self.max_cache = n_sink + n_recent

    def evict(self, kv_cache: Tuple[torch.Tensor, torch.Tensor]
              ) -> Tuple[torch.Tensor, torch.Tensor]:
        """淘汰中间的 token，只保留 sink + recent。
        输入 kv_cache: (K, V)，每个 shape (B, H, S, D)
        """
        K, V = kv_cache
        S = K.size(2)

        if S <= self.max_cache:
            return kv_cache  # 还没超限

        # 保留前 n_sink 个 + 最近 n_recent 个
        sink_K = K[:, :, :self.n_sink, :]
        recent_K = K[:, :, -self.n_recent:, :]
        sink_V = V[:, :, :self.n_sink, :]
        recent_V = V[:, :, -self.n_recent:, :]

        new_K = torch.cat([sink_K, recent_K], dim=2)
        new_V = torch.cat([sink_V, recent_V], dim=2)

        return new_K, new_V
```

---

## 3. FlashAttention 系列

### 3.1 IO 感知的精确注意力

**问题**：标准注意力计算需要将完整的 $S \times S$ 注意力矩阵写入 HBM（高带宽内存），再从 HBM 读回做 softmax 和矩阵乘法。这个中间矩阵的大小为 $O(S^2)$，当 $S = 128K$ 时占据 GB 级显存，且产生大量 HBM 读写。

**FlashAttention**（Dao et al., 2022）的核心洞察：GPU 的 SRAM（片上高速缓存）比 HBM 快 10~20 倍，但容量很小（A100 上约 20 MB vs 80 GB HBM）。FlashAttention 使用 **tiling（分块）** 策略，将注意力计算切分为小块，在 SRAM 中完成全部计算，避免将中间矩阵写入 HBM。

```
标准 Attention 的内存访问模式：
  Q,K,V (HBM) → 计算 S=QK^T → 写回 HBM → 读 S → softmax → 写回 HBM → 读 S → SV → 写 O
  HBM 读写次数: O(S²) — "乒乓"式的 HBM 访问

FlashAttention 的内存访问模式：
  Q,K,V (HBM) → 分块加载到 SRAM → 在 SRAM 内完成 QK^T + softmax + ×V → 写 O 到 HBM
  HBM 读写次数: O(S·d) — 仅线性于序列长度
```

数学上，FlashAttention 的关键技巧是 **Online Softmax**（Milakov & Gimelshein, 2018）：

传统 softmax 需要先计算所有元素找到 max，再做指数运算。FlashAttention 使用增量更新公式：

设已经处理了前 $j$ 块的注意力得分，当前最大值为 $m_j$，softmax 分母为 $\ell_j$，加权 V 的累计和为 $O_j$。当处理第 $j+1$ 块时：

$$
m_{j+1} = \max(m_j, \max(\tilde{S}_{j+1}))
$$

$$
\ell_{j+1} = e^{m_j - m_{j+1}} \cdot \ell_j + \sum_i e^{\tilde{S}_{j+1,i} - m_{j+1}}
$$

$$
O_{j+1} = \frac{e^{m_j - m_{j+1}} \cdot \ell_j}{\ell_{j+1}} \cdot O_j + \frac{1}{\ell_{j+1}} \sum_i e^{\tilde{S}_{j+1,i} - m_{j+1}} V_{j+1,i}
$$

这样就可以一次遍历完成 softmax，无需存储完整的 $S \times S$ 矩阵。

```python
def flash_attention_forward_reference(
    Q: torch.Tensor,  # (B, H, N, d)
    K: torch.Tensor,  # (B, H, N, d)
    V: torch.Tensor,  # (B, H, N, d)
    block_size: int = 64,
) -> torch.Tensor:
    """FlashAttention 的纯 Python 参考实现（演示分块 + Online Softmax 逻辑）。
    
    注意：这不是高性能实现（真正的 FlashAttention 用 Triton/CUDA 写 kernel），
    仅用于理解算法原理。
    """
    B, H, N, d = Q.shape
    scale = 1.0 / math.sqrt(d)
    O = torch.zeros_like(Q)

    # 输出的归一化因子
    l = torch.zeros(B, H, N, 1, device=Q.device, dtype=Q.dtype)  # softmax 分母
    m = torch.full((B, H, N, 1), float('-inf'), device=Q.device, dtype=Q.dtype)  # 当前最大值

    # 对 K/V 分块遍历
    n_blocks = math.ceil(N / block_size)

    for j in range(n_blocks):
        j_start = j * block_size
        j_end = min(j_start + block_size, N)

        K_j = K[:, :, j_start:j_end, :]  # (B, H, block_size, d)
        V_j = V[:, :, j_start:j_end, :]

        # 计算当前块的注意力得分: Q @ K_j^T
        S_j = torch.matmul(Q, K_j.transpose(-2, -1)) * scale  # (B, H, N, block_size)

        # 因果掩码（可选，此处简化省略）

        # Online Softmax 更新
        m_j = S_j.max(dim=-1, keepdim=True).values  # 当前块的 max
        m_new = torch.maximum(m, m_j)               # 全局 max 更新

        # 修正旧的累计值
        exp_old = torch.exp(m - m_new)      # 旧值的修正系数
        exp_new = torch.exp(S_j - m_new)    # 新块的指数

        l_new = exp_old * l + exp_new.sum(dim=-1, keepdim=True)

        # 更新输出: O = (exp_old * l * O + exp_new @ V_j) / l_new
        O = (exp_old * l * O + torch.matmul(exp_new, V_j)) / l_new

        m = m_new
        l = l_new

    return O
```

### 3.2 FlashAttention-1/2/3 演进

| 版本 | 发布时间 | 核心改进 | 性能 |
|------|----------|----------|------|
| FlashAttention-1 | 2022.05 | IO-aware tiling + Online Softmax | A100 上 2~4× 加速 |
| FlashAttention-2 | 2023.07 | 减少非矩阵乘的 FLOPs、优化 warp 间并行、支持 head dim 到 256 | 比 v1 再快 2× |
| FlashAttention-3 | 2024.07 | 针对 H100 的 Hopper 架构优化：WGMMA 指令 + 异步 TMA + pingpong 调度 + FP8 | H100 上达 840 TFLOPS (85% 利用率) |

FlashAttention-2 的关键改进：

1. **减少非 matmul FLOPs**：v1 中有大量标量运算（rescaling），v2 将其最小化
2. **序列长度维度并行**：v1 只在 batch 和 head 维度并行，v2 增加了在序列长度维度上的并行
3. **更优的 warp 分区**：v1 中多个 warp 做冗余计算，v2 让每个 warp 处理不同的 K/V 块

FlashAttention-3 的关键改进（H100 专属）：

1. **WGMMA 异步指令**：利用 H100 的 Tensor Memory Accelerator (TMA) 进行异步内存拷贝
2. **Pingpong 调度**：在两组 warp 间交替执行 GEMM 和 softmax，隐藏非 matmul 延迟
3. **FP8 支持**：利用 H100 原生 FP8 Tensor Core，带逐块量化保持精度，达 1.3 PFLOPs/s

### 3.3 Flash Decoding

**问题**：FlashAttention 在 prefill 阶段（长序列）效果显著，但在 decode 阶段（$Q$ 只有 1 个 token）并行度不足——只能在 batch 和 head 维度上并行。

**Flash Decoding**（Tri Dao et al., 2023）的改进：增加在 **KV 序列长度维度** 上的并行。将 K/V 沿序列维度分成多个子块，每个子块独立计算局部注意力，最后通过 Online Softmax 的 reduction 合并。

```
标准 Decode Attention (并行度 = B × H):
  Q(1 token) × K(S tokens) → 一个 thread block 处理完整 S

Flash Decoding (并行度 = B × H × n_splits):
  Q(1 token) × K_split1  → partial_O1, partial_lse1
  Q(1 token) × K_split2  → partial_O2, partial_lse2
  ...
  Q(1 token) × K_split_k → partial_Ok, partial_lse_k
  → 最终 reduction: merge(partial_O1..k, partial_lse1..k) → O
```

这对长上下文 decode（如 128K）尤其关键，可以将 decode 延迟降低数倍。

---

## 4. 连续批处理与调度

### 4.1 Static Batching vs Continuous Batching

**Static Batching（静态批处理）**：等待收集到固定数量的请求后一起处理。问题：不同请求的生成长度不同，短请求完成后必须等待最长的请求，GPU 大量空转。

**Continuous Batching（连续批处理）**（Yu et al., 2022 — Orca）：在每个 iteration 级别动态调度——短请求完成后立刻退出，新请求立刻加入。

```
Static Batching:
Step:    1   2   3   4   5   6   7   8
Req A:  [=] [=] [=] [=] [=] [=] [=] [=]  ← 生成 8 个 token
Req B:  [=] [=] [=] [_] [_] [_] [_] [_]  ← 生成 3 个 token，但等到第 8 步才释放
Req C:  [=] [=] [=] [=] [=] [_] [_] [_]  ← 生成 5 个 token，等待浪费
GPU利用:  ★   ★   ★   ◇   ◇   ◇   ◇   ◇   ← 后 5 步只有部分利用

Continuous Batching:
Step:    1   2   3   4   5   6   7   8
Req A:  [=] [=] [=] [=] [=] [=] [=] [=]
Req B:  [=] [=] [=]                        ← 第 3 步完成，立即释放
Req D:              [=] [=] [=] [=]        ← 第 4 步加入
Req C:  [=] [=] [=] [=] [=]               ← 第 5 步完成
Req E:                      [=] [=] [=]   ← 第 6 步加入
GPU利用:  ★   ★   ★   ★   ★   ★   ★   ★   ← 每步都满载
```

### 4.2 Iteration-Level Scheduling

Continuous Batching 的实现要点：

1. **Prefill / Decode 混合调度**：新请求做 prefill（计算密集），老请求做 decode（内存密集）。可以在同一 batch 中混合两种类型（Prefill-Decode Disaggregation），也可以分离到不同 GPU（PD Separation）。

2. **Preemption（抢占）**：当 KV Cache 显存不足时，可以暂停低优先级请求，释放其 KV Cache Block，优先服务高优先级请求。vLLM 支持两种抢占策略：
   - **Swap**：将被抢占请求的 KV Cache 交换到 CPU 内存
   - **Recompute**：直接丢弃 KV Cache，下次重新 prefill

```python
from enum import Enum
from dataclasses import dataclass
import time

class RequestState(Enum):
    WAITING = "waiting"       # 等待 prefill
    RUNNING = "running"       # 正在 decode
    PREEMPTED = "preempted"   # 被抢占
    FINISHED = "finished"     # 生成完成

@dataclass
class InferenceRequest:
    req_id: int
    prompt_len: int
    max_gen_len: int
    generated: int = 0
    state: RequestState = RequestState.WAITING
    arrival_time: float = 0.0

    @property
    def is_done(self) -> bool:
        return self.generated >= self.max_gen_len


class ContinuousBatchScheduler:
    """简化的 Continuous Batching 调度器。"""

    def __init__(self, max_batch_size: int, max_kv_blocks: int):
        self.max_batch = max_batch_size
        self.max_kv_blocks = max_kv_blocks
        self.used_kv_blocks = 0

        self.waiting_queue: List[InferenceRequest] = []
        self.running_batch: List[InferenceRequest] = []

    def add_request(self, req: InferenceRequest):
        req.arrival_time = time.time()
        self.waiting_queue.append(req)

    def schedule_step(self) -> dict:
        """执行一个调度步骤，返回本步要执行的操作。"""
        actions = {"prefill": [], "decode": [], "finished": [], "preempted": []}

        # 1. 检查 running batch 中完成的请求
        still_running = []
        for req in self.running_batch:
            if req.is_done:
                req.state = RequestState.FINISHED
                actions["finished"].append(req.req_id)
                self._free_kv(req)
            else:
                still_running.append(req)
                actions["decode"].append(req.req_id)
        self.running_batch = still_running

        # 2. 尝试将 waiting 队列中的请求加入 batch
        while self.waiting_queue and len(self.running_batch) < self.max_batch:
            req = self.waiting_queue[0]
            blocks_needed = self._estimate_blocks(req)
            if self.used_kv_blocks + blocks_needed <= self.max_kv_blocks:
                self.waiting_queue.pop(0)
                req.state = RequestState.RUNNING
                self.used_kv_blocks += blocks_needed
                self.running_batch.append(req)
                actions["prefill"].append(req.req_id)
            else:
                break  # KV Cache 不足，停止调度

        # 3. 模拟 decode：每个 running 请求生成一个 token
        for req in self.running_batch:
            req.generated += 1

        return actions

    def _estimate_blocks(self, req: InferenceRequest, block_size: int = 16) -> int:
        total_tokens = req.prompt_len + req.max_gen_len
        return math.ceil(total_tokens / block_size)

    def _free_kv(self, req: InferenceRequest, block_size: int = 16):
        blocks = math.ceil((req.prompt_len + req.generated) / block_size)
        self.used_kv_blocks = max(0, self.used_kv_blocks - blocks)
```

---

## 5. 模型量化（Quantization）

### 5.1 量化基础：从 FP32 到 INT4

量化（Quantization）将浮点数映射到低位宽整数，核心目的是**减小模型体积**和**提高推理吞吐**（减少显存带宽需求）。

常见数据格式的位宽与动态范围：

| 格式 | 位宽 | 动态范围 | 典型用途 |
|------|------|----------|----------|
| FP32 | 32 bit | ±3.4×10³⁸ | 训练（传统） |
| BF16 | 16 bit | ±3.4×10³⁸ (精度低于 FP32) | 训练（主流） |
| FP16 | 16 bit | ±6.5×10⁴ | 推理（基线） |
| FP8 (E4M3) | 8 bit | ±448 | 推理（H100+） |
| FP8 (E5M2) | 8 bit | ±57344 | 训练梯度 |
| INT8 | 8 bit | -128~127 | 推理量化 |
| INT4 | 4 bit | -8~7 | 极限推理量化 |
| NF4 | 4 bit | 非均匀 | QLoRA/BitsAndBytes |

**量化带来的收益**：

$$
\text{模型大小} = \text{参数量} \times \frac{\text{位宽}}{8} \text{ (bytes)}
$$

例如 LLaMA-70B：FP16 = 140 GB，INT8 = 70 GB，INT4 = 35 GB。INT4 量化后可以在单张 A100 80GB 上运行，而 FP16 需要至少两张。

### 5.2 对称量化与非对称量化

**线性量化**将浮点值 $x$ 映射到整数 $x_q$：

**对称量化（Symmetric）**：

$$
x_q = \text{round}\!\left(\frac{x}{s}\right), \quad s = \frac{\max(|x|)}{2^{b-1} - 1}
$$

$$
\hat{x} = x_q \times s \quad \text{（反量化）}
$$

零点固定在 0，适合权重分布对称的场景。

**非对称量化（Asymmetric）**：

$$
x_q = \text{round}\!\left(\frac{x - z}{s}\right), \quad s = \frac{x_{\max} - x_{\min}}{2^b - 1}, \quad z = x_{\min}
$$

$$
\hat{x} = x_q \times s + z \quad \text{（反量化）}
$$

增加了零点偏移 $z$，适合分布不对称的激活值。

**分组量化（Per-Group / Per-Channel）**：对每行或每 $g$ 个元素独立计算 $s$ 和 $z$，减小量化误差。常见 group_size = 128。

```python
import torch

def symmetric_quantize(
    tensor: torch.Tensor,
    n_bits: int = 8,
    group_size: int = 128,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """对称分组量化。
    
    Args:
        tensor: 待量化的浮点张量
        n_bits: 量化位宽
        group_size: 每组元素数量
    
    Returns:
        (quantized_tensor, scales): 量化后的整数张量和缩放因子
    """
    orig_shape = tensor.shape
    # 将最后一维按 group_size 分组
    assert tensor.shape[-1] % group_size == 0
    tensor = tensor.view(-1, group_size)

    # 计算每组的缩放因子
    qmax = 2 ** (n_bits - 1) - 1  # INT8: 127, INT4: 7
    abs_max = tensor.abs().max(dim=-1, keepdim=True).values.clamp(min=1e-8)
    scales = abs_max / qmax  # (n_groups, 1)

    # 量化
    quantized = torch.round(tensor / scales).clamp(-qmax - 1, qmax).to(torch.int8)

    return quantized.view(orig_shape), scales.view(*orig_shape[:-1], -1)


def symmetric_dequantize(
    quantized: torch.Tensor,
    scales: torch.Tensor,
    group_size: int = 128,
) -> torch.Tensor:
    """反量化：将整数张量恢复为浮点。"""
    orig_shape = quantized.shape
    quantized = quantized.view(-1, group_size).float()
    scales = scales.view(-1, 1)
    return (quantized * scales).view(orig_shape)


# === 演示量化精度损失 ===
torch.manual_seed(42)
W = torch.randn(4096, 4096)  # 模拟一层权重

for bits in [8, 4]:
    W_q, scales = symmetric_quantize(W, n_bits=bits, group_size=128)
    W_hat = symmetric_dequantize(W_q, scales, group_size=128)
    mse = ((W - W_hat) ** 2).mean().item()
    max_err = (W - W_hat).abs().max().item()
    print(f"INT{bits}: MSE={mse:.6f}, Max Error={max_err:.4f}, "
          f"Compression={32/bits:.0f}×")
```

输出示例：
```
INT8: MSE=0.000011, Max Error=0.0157, Compression=4×
INT4: MSE=0.002814, Max Error=0.2891, Compression=8×
```

### 5.3 PTQ vs QAT

**PTQ（Post-Training Quantization，训练后量化）**：在已训练好的模型上直接量化，不需要重新训练。

- **优点**：无需训练数据和 GPU 资源，量化过程快（分钟~小时级）
- **缺点**：低位宽（如 INT4）可能有明显精度损失
- **代表方法**：GPTQ、AWQ、SmoothQuant、GGUF

**QAT（Quantization-Aware Training，量化感知训练）**：在训练过程中模拟量化效果，让模型学会适应量化噪声。

- **优点**：通常精度损失更小
- **缺点**：需要大量训练资源和数据
- **代表方法**：LLM-QAT、PEQA

对于 LLM，由于训练成本极高，**PTQ 是主流方案**。下面重点介绍四种 PTQ 方法。

### 5.4 GPTQ：基于 Hessian 的逐层量化

**GPTQ**（Frantar et al., 2023）是最早的高质量 LLM 量化方法之一。核心思想来自最优脑量化（Optimal Brain Quantization, OBQ）：逐列量化权重矩阵，量化每一列时用该列对应的 Hessian 信息来补偿其他列，最小化整层的输出误差。

**数学原理**：

设一层的权重矩阵为 $W \in \mathbb{R}^{m \times n}$，输入校准数据的协方差矩阵（即 Hessian 近似）为 $H = X X^\top \in \mathbb{R}^{n \times n}$。目标是找到量化后的权重 $\hat{W}$，使得输出误差最小：

$$
\min_{\hat{W}} \|W X - \hat{W} X\|_F^2 = \min_{\hat{W}} \|(W - \hat{W}) X\|_F^2
$$

等价于最小化 $(W - \hat{W}) H (W - \hat{W})^\top$ 的迹。

GPTQ 的逐列量化流程（对第 $i$ 列）：

1. 量化第 $i$ 列：$\hat{w}_i = \text{quant}(w_i)$
2. 计算量化误差：$\delta_i = w_i - \hat{w}_i$
3. 用 Hessian 信息补偿未量化的列：

$$
W_{:, i+1:n} \leftarrow W_{:, i+1:n} - \frac{\delta_i \cdot (H^{-1})_{i, i+1:n}}{(H^{-1})_{i,i}}
$$

这个补偿步骤确保后续列会"吸收"当前列的量化误差，从而最小化整体输出误差。

```python
def gptq_quantize_layer(
    weight: torch.Tensor,    # (out_features, in_features)
    hessian: torch.Tensor,   # (in_features, in_features)
    n_bits: int = 4,
    group_size: int = 128,
    block_size: int = 128,   # 一次处理的列数
) -> Tuple[torch.Tensor, torch.Tensor]:
    """GPTQ 逐列量化的简化实现。
    
    Args:
        weight: 待量化的权重矩阵
        hessian: 输入数据的 Hessian 矩阵 (X @ X.T / n_samples)
        n_bits: 量化位宽
        group_size: 分组量化的组大小
        block_size: 列分块大小
    
    Returns:
        (quantized_weight, scales)
    """
    W = weight.clone().float()
    n_out, n_in = W.shape
    qmax = 2 ** (n_bits - 1) - 1

    # Cholesky 分解 Hessian 的逆（数值稳定）
    # 添加对角正则化
    damp = 0.01 * torch.diag(hessian).mean()
    H = hessian + damp * torch.eye(n_in, device=hessian.device)
    H_inv = torch.linalg.cholesky(torch.linalg.inv(H))

    quantized = torch.zeros_like(W, dtype=torch.int8)
    scales = torch.zeros(n_out, n_in // group_size, device=W.device)

    for col_start in range(0, n_in, block_size):
        col_end = min(col_start + block_size, n_in)
        block_w = W[:, col_start:col_end].clone()
        block_err = torch.zeros_like(block_w)

        for j in range(col_end - col_start):
            col_idx = col_start + j
            group_idx = col_idx // group_size

            # 计算该组的 scale（首次进入该组时）
            if col_idx % group_size == 0:
                g_start = col_idx
                g_end = min(g_start + group_size, n_in)
                group_abs_max = W[:, g_start:g_end].abs().max(dim=1).values.clamp(min=1e-8)
                scales[:, group_idx] = group_abs_max / qmax

            # 量化当前列
            s = scales[:, group_idx]
            w_col = block_w[:, j]
            q_col = torch.round(w_col / s).clamp(-qmax - 1, qmax)
            quantized[:, col_idx] = q_col.to(torch.int8)

            # 量化误差
            err = w_col - q_col * s  # (n_out,)

            # Hessian 补偿：将误差分摊到后续未量化的列
            h_diag = H_inv[col_idx, col_idx]
            if j + 1 < col_end - col_start:
                h_row = H_inv[col_idx, col_start + j + 1:col_end]
                block_w[:, j + 1:] -= err.unsqueeze(1) * (h_row / h_diag).unsqueeze(0)

    return quantized, scales
```

**GPTQ 的实际使用**（通过 auto-gptq 库）：

```python
# pip install auto-gptq
from auto_gptq import AutoGPTQForCausalLM, BaseQuantizeConfig
from transformers import AutoTokenizer

# 配置量化参数
quantize_config = BaseQuantizeConfig(
    bits=4,               # INT4 量化
    group_size=128,       # 每 128 个权重一组
    desc_act=True,        # 按激活值大小排序列（提升精度）
    damp_percent=0.01,    # Hessian 正则化系数
)

# 加载模型
model_name = "meta-llama/Llama-2-7b-hf"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoGPTQForCausalLM.from_pretrained(model_name, quantize_config)

# 准备校准数据（通常 128~256 条）
calibration_texts = [
    "The capital of France is Paris.",
    "Machine learning is a subset of artificial intelligence.",
    # ... 更多校准文本
]
calibration_dataset = [
    tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
    for text in calibration_texts
]

# 执行量化（需要 GPU）
model.quantize(calibration_dataset)

# 保存量化模型
model.save_quantized("./llama2-7b-gptq-4bit")
```

### 5.5 AWQ：激活感知的权重量化

**AWQ（Activation-aware Weight Quantization）**（Lin et al., 2024）的核心洞察与 GPTQ 不同：不是所有权重都同等重要——少量**显著权重（salient weights）** 对模型输出影响巨大，而它们可以通过**激活值的幅度**来识别。

**关键思想**：

1. 观察激活分布，找出激活值幅度大的通道（这些通道对应的权重是"显著"的）
2. 对显著通道的权重乘以一个大的缩放因子 $s_i > 1$（等效于缩小量化步长），减小其量化误差
3. 为保持数学等价，对该通道的激活值除以 $s_i$

$$
Y = (X \cdot \text{diag}(s)^{-1}) \cdot (\text{diag}(s) \cdot W) = X \cdot W
$$

量化时对 $\text{diag}(s) \cdot W$ 量化，由于显著通道被放大了，量化步长相对其值更细，误差更小。

**最优缩放因子的搜索**：

$$
s^* = \arg\min_s \|\text{quant}(s \cdot W) \cdot (s^{-1} \cdot X) - W \cdot X\|
$$

AWQ 使用简单的启发式：$s_i = (|X_i|_{\text{mean}})^\alpha$，其中 $\alpha$ 在 $[0, 1]$ 中搜索最优值（通常 $\alpha \approx 0.5$）。

```python
def awq_search_scale(
    weight: torch.Tensor,      # (out_features, in_features)
    activations: torch.Tensor, # (n_samples, in_features)
    n_bits: int = 4,
    group_size: int = 128,
    n_grid: int = 20,          # α 搜索网格密度
) -> torch.Tensor:
    """AWQ 最优缩放因子搜索的简化实现。"""
    n_out, n_in = weight.shape
    qmax = 2 ** (n_bits - 1) - 1

    # 计算每个输入通道的平均激活幅度
    act_scales = activations.abs().mean(dim=0)  # (in_features,)

    best_error = float('inf')
    best_scales = torch.ones(n_in, device=weight.device)

    # 真实输出（未量化）
    Y_ref = activations @ weight.t()  # (n_samples, out_features)

    for alpha_idx in range(n_grid):
        alpha = alpha_idx / n_grid  # [0, 1)

        # 计算缩放因子
        scales = act_scales.pow(alpha).clamp(min=1e-4)

        # 按组归一化 scales（避免跨组干扰）
        for g_start in range(0, n_in, group_size):
            g_end = min(g_start + group_size, n_in)
            group_scales = scales[g_start:g_end]
            scales[g_start:g_end] = group_scales / group_scales.max()

        # 应用缩放后量化
        W_scaled = weight * scales.unsqueeze(0)  # 放大权重

        # 逐组量化 W_scaled
        W_q = torch.zeros_like(W_scaled, dtype=torch.int8)
        W_deq = torch.zeros_like(W_scaled)
        for g_start in range(0, n_in, group_size):
            g_end = min(g_start + group_size, n_in)
            w_group = W_scaled[:, g_start:g_end]
            abs_max = w_group.abs().max(dim=1, keepdim=True).values.clamp(min=1e-8)
            s = abs_max / qmax
            w_q = torch.round(w_group / s).clamp(-qmax - 1, qmax)
            W_deq[:, g_start:g_end] = w_q * s

        # 反缩放
        W_deq = W_deq / scales.unsqueeze(0)

        # 计算误差
        Y_q = activations @ W_deq.t()
        error = ((Y_ref - Y_q) ** 2).mean().item()

        if error < best_error:
            best_error = error
            best_scales = scales.clone()

    return best_scales
```

**AWQ vs GPTQ 对比**：

| 维度 | GPTQ | AWQ |
|------|------|-----|
| 核心思路 | 基于 Hessian 逐列最优化量化+补偿 | 基于激活分布识别显著权重并保护 |
| 校准数据需求 | 128~256 样本 | 128~256 样本 |
| 量化速度 | 较慢（需要 Hessian 逆 + 逐列补偿） | 较快（只搜索缩放因子） |
| 精度 (Perplexity) | 优秀 | 与 GPTQ 相当或略优 |
| 推理加速 | 需要特定 kernel（如 ExLlama） | Marlin kernel 支持下可达 10× 加速 |
| 代码变更任务时表现 | 一般 | 优秀（保护了重要特征通道） |

### 5.6 GGUF：CPU 友好的量化格式

**GGUF（GPT-Generated Unified Format）** 是 llama.cpp 定义的模型存储格式，专为 **CPU 推理**（以及 CPU+GPU 混合推理）设计。GGUF 不仅仅是一种量化方法，更是一个完整的模型分发格式。

GGUF 的量化类型命名规则：`Q{bits}_{variant}`

| 类型 | 位宽 | 说明 |
|------|------|------|
| Q2_K | ~2.6 bit | 超低位宽，精度损失较大 |
| Q3_K_S/M/L | ~3.4 bit | S/M/L 表示不同的分组策略 |
| Q4_K_S/M | ~4.5 bit | 最常用的"甜点"方案 |
| Q5_K_S/M | ~5.5 bit | 精度接近 FP16 |
| Q6_K | ~6.6 bit | 高精度量化 |
| Q8_0 | 8 bit | 基本无损 |
| IQ4_XS | ~4.3 bit | 重要性加权量化，精度更高 |

**GGUF 的核心特点**：

1. **Self-contained**：模型权重 + 分词器 + 元数据全在一个文件中
2. **CPU 高效**：针对 x86 AVX2/AVX-512 和 ARM NEON 优化
3. **内存映射（mmap）**：可以直接映射到内存，无需反序列化
4. **混合量化**：不同层可以用不同位宽（如注意力层 Q6，FFN 层 Q4）

```bash
# 使用 llama.cpp 量化模型
# 1. 转换 HuggingFace 模型为 GGUF
python convert_hf_to_gguf.py ./Llama-3-8B --outfile llama3-8b-f16.gguf --outtype f16

# 2. 量化
./llama-quantize llama3-8b-f16.gguf llama3-8b-Q4_K_M.gguf Q4_K_M

# 3. 推理
./llama-cli -m llama3-8b-Q4_K_M.gguf -p "Explain quantum computing" -n 256

# 也可以用 Ollama（封装了 llama.cpp）
# ollama run llama3:8b-q4_K_M
```

### 5.7 BitsAndBytes：动态 NF4 量化

**BitsAndBytes**（Dettmers et al.）提供了两个重要的量化能力：

1. **LLM.int8()**：将矩阵乘法分解为 INT8 和 FP16 两部分——异常值（outlier）用 FP16 处理，其余用 INT8
2. **NF4（4-bit NormalFloat）**：专为正态分布设计的非均匀量化类型，是 QLoRA 的基础

**NF4 的数学原理**：

LLM 的预训练权重近似服从正态分布 $\mathcal{N}(0, \sigma^2)$。NF4 将量化区间设计为正态分布的 **等概率分位数**，使得每个量化 bin 覆盖等概率的权重值，从而最大化信息保留。

NF4 的 16 个量化值（4 bit = 16 个 level）为正态分布的 $1/16, 3/16, ..., 31/16$ 分位数，归一化到 $[-1, 1]$：

```python
import scipy.stats as stats
import numpy as np

def compute_nf4_quantization_levels():
    """计算 NF4 的 16 个量化值。"""
    # 将 [0, 1] 概率空间等分为 16 个区间
    # 每个区间的中心概率点
    offsets = np.array([0.5 / 16 + i / 16 for i in range(16)])

    # 用正态分布的逆 CDF（percent point function）将概率映射到值
    nf4_values = stats.norm.ppf(offsets)

    # 归一化到 [-1, 1]
    nf4_values = nf4_values / np.abs(nf4_values).max()

    return nf4_values

nf4 = compute_nf4_quantization_levels()
print("NF4 量化值:")
print(np.round(nf4, 4))
# [-1.     -0.6962 -0.5251 -0.3949 -0.2844 -0.1848 -0.0911  0.
#   0.0796  0.1609  0.2461  0.3379  0.4407  0.5626  0.7230  1.    ]
```

**Double Quantization**：BitsAndBytes 还对量化参数（scales）本身做二次量化（FP32 → FP8），进一步压缩元数据开销。

```python
# 使用 BitsAndBytes 加载 4-bit 模型
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",           # NF4 量化
    bnb_4bit_compute_dtype=torch.bfloat16, # 计算时反量化到 BF16
    bnb_4bit_use_double_quant=True,       # 双重量化（量化 scales）
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3-8B",
    quantization_config=bnb_config,
    device_map="auto",
)
# 显存占用: FP16 约 16GB → NF4 约 5GB

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3-8B")
inputs = tokenizer("The meaning of life is", return_tensors="pt").to("cuda")
outputs = model.generate(**inputs, max_new_tokens=100)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

### 5.8 FP8 量化与硬件原生支持

NVIDIA H100/B200 GPU 原生支持 FP8 Tensor Core 运算，无需特殊量化步骤即可获得 2× 吞吐提升（相比 FP16）。

FP8 有两种格式：

- **E4M3**（4 位指数 + 3 位尾数）：动态范围 ±448，适合推理中的权重和激活
- **E5M2**（5 位指数 + 2 位尾数）：动态范围 ±57344，适合训练中的梯度

vLLM 已支持 FP8 KV Cache 和 FP8 权重推理。DeepSeek-V3 的训练和推理均使用 FP8。

```python
# vLLM FP8 推理示例
from vllm import LLM, SamplingParams

# 使用 FP8 量化的模型
llm = LLM(
    model="neuralmagic/Meta-Llama-3-8B-Instruct-FP8",
    quantization="fp8",
    kv_cache_dtype="fp8_e4m3",  # KV Cache 也用 FP8
    max_model_len=8192,
)

params = SamplingParams(temperature=0.7, max_tokens=256)
outputs = llm.generate(["Explain the theory of relativity"], params)
```

### 5.9 量化方法横向对比

基于 LLaMA-3-8B 在常见 benchmark 上的测试：

| 方法 | 位宽 | 模型大小 | Perplexity (↓) | HumanEval | 推理速度 (tok/s) | 运行环境 |
|------|------|----------|---------------|-----------|-----------------|----------|
| FP16 (基线) | 16 bit | 16 GB | 6.14 | 62.2% | 45 | GPU |
| GPTQ-4bit | 4 bit | 4.5 GB | 6.44 | 56.7% | 85 | GPU |
| AWQ-4bit | 4 bit | 4.5 GB | 6.38 | 60.4% | 120 (Marlin) | GPU |
| GGUF Q4_K_M | ~4.5 bit | 5.0 GB | 6.41 | 59.8% | 35 | CPU/GPU |
| BnB NF4 | 4 bit | 5.0 GB | 6.52 | 58.5% | 40 | GPU |
| FP8 | 8 bit | 8.5 GB | 6.16 | 62.0% | 90 | H100 GPU |

> 注：以上数据为综合多个来源的近似值，实际结果可能因硬件、软件版本和评测数据集有所不同。关键结论：AWQ 4-bit + Marlin kernel 是当前 GPU 推理的"甜点"方案。

### 5.10 代码实战：量化推理全流程

```python
"""
完整的量化推理流程演示：
1. 加载 FP16 模型
2. 用 AWQ 量化到 INT4
3. 用 vLLM 部署量化模型
4. 基准测试
"""

# === 方案一：使用 AutoAWQ 量化 ===
# pip install autoawq
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer

def quantize_model_awq(model_path: str, output_path: str):
    """使用 AWQ 量化模型。"""
    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
    model = AutoAWQForCausalLM.from_pretrained(model_path, device_map="auto")

    quant_config = {
        "zero_point": True,     # 使用非对称量化
        "q_group_size": 128,    # 分组大小
        "w_bit": 4,             # 4-bit 量化
        "version": "GEMM",      # GEMM kernel（通用性最好）
    }

    # 量化（需要校准数据）
    model.quantize(
        tokenizer,
        quant_config=quant_config,
        calib_data="pileval",    # 使用内置校准数据集
        n_samples=128,
        seqlen=512,
    )

    # 保存
    model.save_quantized(output_path)
    tokenizer.save_pretrained(output_path)
    print(f"量化模型已保存到 {output_path}")


# === 方案二：使用 vLLM 部署量化模型 ===
def serve_quantized_model(model_path: str):
    """用 vLLM 部署量化后的模型。"""
    from vllm import LLM, SamplingParams

    llm = LLM(
        model=model_path,
        quantization="awq",
        dtype="auto",
        gpu_memory_utilization=0.9,
        max_model_len=4096,
        enable_prefix_caching=True,  # 开启 prefix caching
    )

    prompts = [
        "What is the difference between TCP and UDP?",
        "Write a Python function to find the longest palindrome substring.",
        "Explain how a transformer model works in simple terms.",
    ]

    params = SamplingParams(
        temperature=0.7,
        top_p=0.9,
        max_tokens=512,
        repetition_penalty=1.1,
    )

    outputs = llm.generate(prompts, params)
    for out in outputs:
        print(f"\nPrompt: {out.prompt[:50]}...")
        print(f"Output: {out.outputs[0].text[:200]}...")


# === 方案三：使用 llama.cpp / Ollama 在 CPU 上运行 ===
# 在终端中:
# ollama run llama3:8b-q4_K_M "Explain quantum computing"
```

---

## 6. Speculative Decoding（投机解码）

### 6.1 核心思想与数学保证

**问题**：自回归解码每步只生成一个 token，模型前向传播一次（读取完整权重 + KV Cache）只产出一个 token 的"价值"。能否让每次前向传播产出多个 token？

**投机解码（Speculative Decoding）**（Leviathan et al., 2022; Chen et al., 2023）的思路：

1. 用一个小模型（Draft Model, $M_d$）快速生成 $K$ 个候选 token
2. 用大模型（Target Model, $M_t$）**一次前向传播**并行验证这 $K$ 个 token
3. 接受符合大模型分布的 token，拒绝不符合的

**数学保证**：投机解码的输出分布**严格等于**大模型的输出分布，不引入任何近似。

设 Draft Model 在位置 $t$ 的预测分布为 $q(x_t)$，Target Model 为 $p(x_t)$。对于 Draft 生成的 token $x$：

- 如果 $q(x) \leq p(x)$：以概率 1 接受（Draft 低估的 token 一定接受）
- 如果 $q(x) > p(x)$：以概率 $p(x)/q(x)$ 接受

当 token 被拒绝时，从修正分布中重新采样：

$$
p'(x) = \text{norm}\big(\max(0, p(x) - q(x))\big) = \frac{\max(0, p(x) - q(x))}{\sum_{x'} \max(0, p(x') - q(x'))}
$$

**定理**：上述接受/拒绝机制保证最终的采样分布严格等于 $p(x)$。

**证明简述**：对于任意 token $x$，其最终被选中的概率为：

$$
P(\text{accept } x) = \min\!\left(1, \frac{p(x)}{q(x)}\right) \cdot q(x) = \min(p(x), q(x))
$$

被拒绝后从 $p'$ 重新采样的概率：

$$
P(\text{reject}) \cdot p'(x) = \left(1 - \sum_{x'} \min(p(x'), q(x'))\right) \cdot \frac{\max(0, p(x) - q(x))}{\sum_{x'} \max(0, p(x') - q(x'))}
$$

两项之和恰好等于 $p(x)$（可通过分 $p(x) \geq q(x)$ 和 $p(x) < q(x)$ 两种情况验证）。

### 6.2 Draft-then-Verify 流程

```
Step 1: Draft Model 快速生成 K=4 个候选 token
  Input: "The capital of France"
  Draft: "is" → "Par" → "is" → "."
  
Step 2: Target Model 一次前向验证所有候选
  Target 并行计算 5 个位置的分布:
    P("is" | "The capital of France") = 0.95     ← q=0.90, 接受 ✓
    P("Par" | "...France is") = 0.88             ← q=0.85, 接受 ✓
    P("is" | "...France is Par") = 0.92          ← q=0.88, 接受 ✓
    P("." | "...is Paris") = 0.15                ← q=0.70, 拒绝 ✗ (p/q=0.21)
    
Step 3: 接受前 3 个 token，在拒绝位置从修正分布重采样
  最终: "is" + "Par" + "is" + resample("," with p'=0.65)
  净增: 4 个 token（比逐个解码的 1 个多了 3 个）

加速比 ≈ (1 + α·K) 倍，α = 平均接受率
```

```python
def speculative_decode(
    target_model,        # 大模型
    draft_model,         # 小模型
    tokenizer,
    prompt_ids: torch.Tensor,   # (1, prompt_len)
    max_new_tokens: int = 100,
    K: int = 5,                  # 每次投机生成的 token 数
    temperature: float = 1.0,
) -> torch.Tensor:
    """投机解码的完整实现。
    
    保证输出分布严格等于 target_model 的分布。
    """
    device = prompt_ids.device
    generated = prompt_ids.clone()
    n_generated = 0

    while n_generated < max_new_tokens:
        # === Step 1: Draft 阶段 ===
        # 用小模型自回归生成 K 个候选 token
        draft_input = generated.clone()
        draft_tokens = []
        draft_probs = []

        for _ in range(K):
            with torch.no_grad():
                logits = draft_model(draft_input).logits[:, -1, :]  # (1, vocab_size)
            probs = F.softmax(logits / temperature, dim=-1)
            token = torch.multinomial(probs, 1)  # (1, 1)

            draft_tokens.append(token.item())
            draft_probs.append(probs.squeeze(0))  # (vocab_size,)
            draft_input = torch.cat([draft_input, token], dim=-1)

        # === Step 2: Verify 阶段 ===
        # 将原始 prompt + K 个 draft token 一起送入大模型（一次前向传播）
        verify_input = torch.cat(
            [generated, torch.tensor([draft_tokens], device=device)], dim=-1
        )
        with torch.no_grad():
            target_logits = target_model(verify_input).logits  # (1, total_len, vocab)

        # 取最后 K+1 个位置的 logits（对应 K 个 draft token 的验证 + 1 个新位置）
        # 位置 -K-1 对应验证 draft_tokens[0] 的分布
        start_pos = generated.shape[1] - 1  # 最后一个已确认 token 的位置
        target_probs_list = []
        for i in range(K + 1):
            logits_i = target_logits[:, start_pos + i, :]
            probs_i = F.softmax(logits_i / temperature, dim=-1)
            target_probs_list.append(probs_i.squeeze(0))

        # === Step 3: 接受/拒绝 ===
        n_accepted = 0
        for i in range(K):
            token = draft_tokens[i]
            p = target_probs_list[i][token].item()  # target 概率
            q = draft_probs[i][token].item()          # draft 概率

            # 接受概率 = min(1, p/q)
            if q == 0:
                accept_prob = 1.0 if p > 0 else 0.0
            else:
                accept_prob = min(1.0, p / q)

            if torch.rand(1).item() < accept_prob:
                # 接受
                n_accepted += 1
                generated = torch.cat(
                    [generated, torch.tensor([[token]], device=device)], dim=-1
                )
                n_generated += 1
                if n_generated >= max_new_tokens:
                    break
            else:
                # 拒绝：从修正分布中采样
                p_vec = target_probs_list[i]
                q_vec = draft_probs[i]
                # p' = norm(max(0, p - q))
                adjusted = torch.clamp(p_vec - q_vec, min=0)
                adjusted_sum = adjusted.sum()
                if adjusted_sum > 0:
                    adjusted = adjusted / adjusted_sum
                else:
                    adjusted = p_vec  # fallback
                new_token = torch.multinomial(adjusted.unsqueeze(0), 1)
                generated = torch.cat([generated, new_token], dim=-1)
                n_generated += 1
                break

        # 如果所有 K 个 token 都被接受，还可以从 target 的下一个位置额外采一个
        if n_accepted == K and n_generated < max_new_tokens:
            bonus_token = torch.multinomial(
                target_probs_list[K].unsqueeze(0), 1
            )
            generated = torch.cat([generated, bonus_token], dim=-1)
            n_generated += 1

    return generated
```

### 6.3 Medusa 与 EAGLE

标准投机解码需要一个独立的 Draft Model，增加了部署复杂度。**Medusa** 和 **EAGLE** 提出了不依赖额外模型的方案：

**Medusa**（Cai et al., 2024）：在 target model 的最后一层之上添加多个**额外的 LM Head**，每个 head 预测未来第 $i$ 个 token。这些 head 是轻量级的（2 层 MLP），通过少量数据微调得到。

```
标准 LM Head:    hidden[-1] → head_0 → 预测 position t
Medusa heads:    hidden[-1] → head_1 → 预测 position t+1
                 hidden[-1] → head_2 → 预测 position t+2
                 hidden[-1] → head_3 → 预测 position t+3
```

优势：不需要额外的 draft model，部署简单。

**EAGLE**（Li et al., 2024）：利用 target model 的倒数第二层特征作为 draft 的上下文，结合一个轻量级的自回归 head 进行多步预测。EAGLE-2/3 进一步通过动态树形验证提升接受率。

### 6.4 加速效果

投机解码的理论加速比：

$$
\text{Speedup} \approx \frac{1 - \alpha^{K+1}}{1 - \alpha} \cdot \frac{c}{1 + K \cdot c_d / c_t}
$$

其中 $\alpha$ 为 draft 的平均接受率（通常 0.7~0.9），$K$ 为 draft 长度，$c_d/c_t$ 为 draft/target 的计算成本比。

实际加速比通常在 **2~3×**，高度依赖 draft model 与 target model 的一致性。

---

## 7. 混合专家模型（MoE）

### 7.1 MoE 的动机与核心思想

**问题**：模型性能通常与参数量正相关（Scaling Law），但推理成本也与激活的参数量正相关。能否实现**大参数量 + 小激活量**？

**混合专家模型（Mixture of Experts, MoE）**的解法：将 FFN（前馈网络）拆分为 $N$ 个"专家"（Expert），每次前向传播只激活其中 $K$ 个（$K \ll N$），通过一个门控网络（Router / Gating Network）动态选择。

这实现了**稀疏激活（Sparse Activation）**：总参数量可以很大（如 671B），但每个 token 的实际计算只涉及少量参数（如 37B），推理成本远低于同参数规模的稠密模型。

```
Dense Model (7B):     每个 token 激活全部 7B 参数
                      FFN: x → Linear(d, 4d) → Activation → Linear(4d, d)

MoE Model (7B×8):    总参数 ~50B，但每个 token 只激活 2 个专家 ≈ 12B 参数
                      Router: x → softmax(x @ W_gate) → top-2 experts
                      Expert_i: x → Linear(d, 4d) → Activation → Linear(4d, d)
                      Output: Σ(gate_i * Expert_i(x)) for i in top-2
```

### 7.2 稀疏门控机制的数学原理

给定输入 token 的隐藏状态 $h \in \mathbb{R}^{d}$，门控网络计算：

$$
g(h) = \text{softmax}(\text{TopK}(h \cdot W_g + \epsilon))
$$

其中 $W_g \in \mathbb{R}^{d \times N}$ 是门控权重，$\epsilon$ 是可选的噪声（训练时添加以促进探索），$\text{TopK}$ 将非 Top-K 位置设为 $-\infty$。

MoE 层的输出：

$$
y = \sum_{i \in \text{TopK}} g_i(h) \cdot E_i(h)
$$

其中 $g_i(h)$ 是第 $i$ 个专家的门控权重（已归一化），$E_i(h)$ 是第 $i$ 个专家的 FFN 输出。

**噪声门控（Noisy Gating）**（Shazeer et al., 2017）：

$$
H(h) = h \cdot W_g + \text{Softplus}(h \cdot W_{\text{noise}}) \cdot \mathcal{N}(0, 1)
$$

训练时添加的噪声帮助探索不同专家，避免所有 token 都路由到相同专家。

### 7.3 负载均衡与辅助损失

**问题**：如果没有约束，路由器很容易陷入**路由坍塌（Routing Collapse）**——大部分 token 都被路由到少数几个"赢家"专家，其他专家几乎不被使用。

**辅助负载均衡损失（Auxiliary Load Balancing Loss）**（Switch Transformer, Fedus et al., 2022）：

定义专家 $i$ 的负载比例 $f_i$ 和路由概率 $P_i$：

$$
f_i = \frac{1}{T} \sum_{t=1}^{T} \mathbb{1}[\text{token } t \text{ 被路由到专家 } i]
$$

$$
P_i = \frac{1}{T} \sum_{t=1}^{T} p_i(h_t)
$$

其中 $p_i(h_t) = \text{softmax}(h_t \cdot W_g)_i$ 是路由器为 token $t$ 分配给专家 $i$ 的概率。

辅助损失为：

$$
\mathcal{L}_{\text{balance}} = \alpha \cdot N \sum_{i=1}^{N} f_i \cdot P_i
$$

直觉：当所有专家负载均匀时（$f_i = P_i = 1/N$），$\mathcal{L}_{\text{balance}} = \alpha$（最小值）。当负载不均衡时，$f_i$ 和 $P_i$ 在某些专家上偏高，乘积之和增大，损失增加。

通常 $\alpha = 0.01 \sim 0.1$，太大会影响主任务性能，太小则无法有效约束。

### 7.4 DeepSeekMoE 架构创新

**DeepSeekMoE**（DeepSeek-AI, 2024）引入了两个关键创新：

**1. 细粒度专家（Fine-Grained Experts）**：

将标准 MoE 的 $N$ 个大专家拆分为 $mN$ 个小专家（每个小专家的隐藏维度为 $d_{\text{ffn}}/m$），同时将 TopK 从 $K$ 增加到 $mK$。总计算量不变，但组合多样性大幅增加：

$$
\binom{mN}{mK} \gg \binom{N}{K}
$$

例如从 $(N=16, K=2)$ 的 $\binom{16}{2} = 120$ 种组合，增加到 $(N=64, K=8)$ 的 $\binom{64}{8} \approx 4.4 \times 10^9$ 种。

**2. 共享专家（Shared Expert）**：

设置 $K_s$ 个**始终激活**的共享专家，负责学习所有 token 都需要的通用知识（如语法结构、常见模式）。路由专家则专注于领域特定知识。

$$
y = \sum_{i=1}^{K_s} E_i^{\text{shared}}(h) + \sum_{j \in \text{TopK}} g_j(h) \cdot E_j^{\text{routed}}(h)
$$

**DeepSeek-V3 的具体配置**（2024.12）：

| 参数 | 值 |
|------|-----|
| 总参数量 | 671B |
| 每 token 激活参数 | 37B |
| 专家总数 | 256 个路由专家 + 1 个共享专家 |
| TopK | 8 |
| 注意力 | MLA (d_compress = 512) |
| 训练 FLOPs | 2.788M H800 GPU hours |
| 训练成本 | < $5.58M |

### 7.5 Mixtral 8×7B 架构

**Mixtral 8×7B**（Mistral AI, 2024.01）是开源 MoE 模型的标杆：

- 8 个专家，每 token 激活 Top-2
- 总参数 46.7B，激活参数 ~12.9B
- 每个专家是一个标准 FFN（与 Mistral-7B 的 FFN 相同）
- 性能接近 LLaMA-2-70B，推理成本仅为其 ~1/3

```
Mixtral 架构（每一层）:
┌─────────────────────────────────────────────┐
│ Input: h ∈ ℝ^d                              │
│                                             │
│ ┌─── Multi-Head Attention (GQA) ───────┐    │
│ │  n_heads=32, n_kv_heads=8, d_head=128│    │
│ └──────────────────────────────────────┘    │
│         ↓ + residual                        │
│ ┌─── MoE Layer ────────────────────────┐    │
│ │  Router: h @ W_gate → softmax → Top2 │    │
│ │  Expert 0: FFN(h) × gate_0           │    │
│ │  Expert 1: FFN(h) × gate_1           │    │
│ │  ...                                  │    │
│ │  Expert 7: FFN(h) × gate_7           │    │
│ │  Output: gate_i * Expert_i + gate_j * Expert_j │
│ └──────────────────────────────────────┘    │
│         ↓ + residual                        │
│ Output: h'                                  │
└─────────────────────────────────────────────┘
```

### 7.6 MoE 推理优化：专家并行与卸载

MoE 模型的推理有独特的挑战：

**1. 专家并行（Expert Parallelism, EP）**：将不同专家分布到不同 GPU 上。需要 All-to-All 通信将 token 路由到对应专家所在的 GPU。

```
GPU 0: Expert 0, 1 (+ Attention)
GPU 1: Expert 2, 3 (+ Attention)
GPU 2: Expert 4, 5 (+ Attention)
GPU 3: Expert 6, 7 (+ Attention)

Token routing: 
  Token A → Expert 1 (GPU 0) + Expert 5 (GPU 2) → All-to-All → 结果聚合
```

**2. 专家卸载（Expert Offloading）**：将不活跃的专家权重放在 CPU 内存或 SSD，需要时加载到 GPU。适合消费级硬件部署大型 MoE 模型。

**3. 专家预取（Expert Prefetching）**：根据前一层的路由结果，提前将下一层可能用到的专家加载到 GPU，隐藏 IO 延迟。

### 7.7 完整 MoE 层实现

```python
class Expert(nn.Module):
    """单个 FFN 专家（SwiGLU 变体）。"""

    def __init__(self, d_model: int, d_ffn: int):
        super().__init__()
        self.w1 = nn.Linear(d_model, d_ffn, bias=False)  # gate projection
        self.w2 = nn.Linear(d_ffn, d_model, bias=False)  # down projection
        self.w3 = nn.Linear(d_model, d_ffn, bias=False)  # up projection

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # SwiGLU: (x @ W1 * silu) ⊙ (x @ W3) → W2
        return self.w2(F.silu(self.w1(x)) * self.w3(x))


class TopKRouter(nn.Module):
    """Top-K 路由器，带可选的负载均衡辅助损失。"""

    def __init__(self, d_model: int, n_experts: int, top_k: int = 2):
        super().__init__()
        self.top_k = top_k
        self.n_experts = n_experts
        self.gate = nn.Linear(d_model, n_experts, bias=False)
        self.aux_loss = 0.0  # 每次 forward 更新

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Args:
            x: (batch_size, seq_len, d_model) or (n_tokens, d_model)
        Returns:
            (gate_weights, expert_indices, router_logits)
            gate_weights: (n_tokens, top_k) — 归一化权重
            expert_indices: (n_tokens, top_k) — 选中的专家编号
            router_logits: (n_tokens, n_experts) — 原始 logits（用于辅助损失）
        """
        orig_shape = x.shape
        if x.dim() == 3:
            x = x.view(-1, orig_shape[-1])  # (n_tokens, d_model)

        logits = self.gate(x)  # (n_tokens, n_experts)
        probs = F.softmax(logits, dim=-1)

        # Top-K 选择
        top_k_weights, top_k_indices = torch.topk(probs, self.top_k, dim=-1)

        # 归一化 Top-K 权重（使其和为 1）
        top_k_weights = top_k_weights / top_k_weights.sum(dim=-1, keepdim=True)

        # 计算辅助负载均衡损失
        if self.training:
            self._compute_aux_loss(probs, top_k_indices)

        return top_k_weights, top_k_indices, logits

    def _compute_aux_loss(self, probs: torch.Tensor, indices: torch.Tensor):
        """计算 Switch Transformer 风格的辅助负载均衡损失。"""
        n_tokens = probs.shape[0]

        # f_i: 每个专家被选中的频率
        one_hot = F.one_hot(indices, self.n_experts).float()  # (n_tokens, top_k, n_experts)
        f = one_hot.sum(dim=1).mean(dim=0)  # (n_experts,)

        # P_i: 每个专家的平均路由概率
        P = probs.mean(dim=0)  # (n_experts,)

        # 辅助损失: N * Σ(f_i * P_i)
        self.aux_loss = self.n_experts * (f * P).sum()


class MoELayer(nn.Module):
    """完整的 Mixture of Experts 层。
    
    支持:
    - Top-K 路由
    - 可选的共享专家（DeepSeekMoE 风格）
    - 负载均衡辅助损失
    """

    def __init__(
        self,
        d_model: int,
        d_ffn: int,
        n_experts: int = 8,
        top_k: int = 2,
        n_shared_experts: int = 0,
        aux_loss_coeff: float = 0.01,
    ):
        super().__init__()
        self.n_experts = n_experts
        self.top_k = top_k
        self.aux_loss_coeff = aux_loss_coeff

        # 路由器
        self.router = TopKRouter(d_model, n_experts, top_k)

        # 路由专家
        self.experts = nn.ModuleList([
            Expert(d_model, d_ffn) for _ in range(n_experts)
        ])

        # 共享专家（始终激活）
        self.shared_experts = nn.ModuleList([
            Expert(d_model, d_ffn) for _ in range(n_shared_experts)
        ]) if n_shared_experts > 0 else None

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch_size, seq_len, d_model)
        Returns:
            output: (batch_size, seq_len, d_model)
        """
        B, T, D = x.shape
        x_flat = x.view(-1, D)  # (n_tokens, d_model)

        # 路由
        gate_weights, expert_indices, _ = self.router(x_flat)
        # gate_weights: (n_tokens, top_k)
        # expert_indices: (n_tokens, top_k)

        # === 路由专家计算 ===
        # 方法：按专家分组处理（比逐 token 循环高效）
        output = torch.zeros_like(x_flat)  # (n_tokens, d_model)

        for i in range(self.n_experts):
            # 找到所有路由到专家 i 的 (token, slot) 对
            mask = (expert_indices == i)  # (n_tokens, top_k)
            if not mask.any():
                continue

            # 取出路由到该专家的 token 索引和对应的 gate 权重
            token_indices, slot_indices = mask.nonzero(as_tuple=True)
            weights = gate_weights[token_indices, slot_indices]  # (n_matched,)

            # 收集输入
            expert_input = x_flat[token_indices]  # (n_matched, d_model)

            # 专家前向
            expert_output = self.experts[i](expert_input)  # (n_matched, d_model)

            # 加权累加到输出
            output.index_add_(
                0, token_indices,
                expert_output * weights.unsqueeze(-1),
            )

        # === 共享专家 ===
        if self.shared_experts is not None:
            for shared_expert in self.shared_experts:
                output = output + shared_expert(x_flat)

        return output.view(B, T, D)

    def get_aux_loss(self) -> torch.Tensor:
        """返回辅助负载均衡损失。"""
        return self.aux_loss_coeff * self.router.aux_loss


class MoETransformerBlock(nn.Module):
    """带 MoE 的 Transformer Block。"""

    def __init__(
        self,
        d_model: int = 4096,
        n_heads: int = 32,
        n_kv_heads: int = 8,
        d_ffn: int = 14336,
        n_experts: int = 8,
        top_k: int = 2,
    ):
        super().__init__()
        self.norm1 = nn.RMSNorm(d_model)
        self.attn = GroupedQueryAttention(d_model, n_heads, n_kv_heads)
        self.norm2 = nn.RMSNorm(d_model)
        self.moe = MoELayer(d_model, d_ffn, n_experts, top_k)

    def forward(self, x: torch.Tensor, kv_cache=None, use_cache=False):
        # Pre-norm + Attention + Residual
        h, cache = self.attn(self.norm1(x), kv_cache, use_cache)
        x = x + h

        # Pre-norm + MoE FFN + Residual
        x = x + self.moe(self.norm2(x))

        return x, cache


# === 演示 ===
def demo_moe():
    d_model = 512
    moe_block = MoETransformerBlock(
        d_model=d_model,
        n_heads=8,
        n_kv_heads=2,
        d_ffn=1408,
        n_experts=8,
        top_k=2,
    )

    x = torch.randn(2, 10, d_model)  # batch=2, seq_len=10
    out, _ = moe_block(x)
    print(f"MoE Block: input={x.shape}, output={out.shape}")

    # 查看路由分布
    with torch.no_grad():
        x_flat = x.view(-1, d_model)
        weights, indices, logits = moe_block.moe.router(x_flat)
        print(f"Router weights shape: {weights.shape}")  # (20, 2)
        print(f"Expert indices shape: {indices.shape}")   # (20, 2)

        # 统计每个专家被选中的次数
        expert_counts = torch.zeros(8)
        for i in range(8):
            expert_counts[i] = (indices == i).sum().item()
        print(f"Expert load distribution: {expert_counts.tolist()}")

# demo_moe()
```

---

## 8. 主流推理引擎对比

### 8.1 vLLM

**vLLM**（Kwon et al., 2023）是目前最广泛使用的 LLM 推理引擎，核心特性包括 PagedAttention、Continuous Batching、Prefix Caching。

关键特性：

- **PagedAttention**：KV Cache 分页管理，显存利用率提升至 >95%
- **Prefix Caching**：相同 system prompt 的请求共享 KV Cache（Copy-on-Write）
- **Chunked Prefill**：长 prompt 分块做 prefill，避免阻塞 decode 请求
- **量化支持**：AWQ/GPTQ/FP8/BitsAndBytes 全支持
- **Speculative Decoding**：内置投机解码支持
- **多模态**：支持 LLaVA 等视觉语言模型
- **分布式**：Tensor Parallel + Pipeline Parallel

```python
# vLLM 部署示例（离线推理）
from vllm import LLM, SamplingParams

llm = LLM(
    model="meta-llama/Llama-3-8B-Instruct",
    tensor_parallel_size=1,
    gpu_memory_utilization=0.9,
    max_model_len=8192,
    enable_prefix_caching=True,
    enable_chunked_prefill=True,
    max_num_batched_tokens=4096,
)

params = SamplingParams(temperature=0.7, top_p=0.9, max_tokens=256)
outputs = llm.generate(["What is machine learning?"], params)

# vLLM 部署示例（在线服务，兼容 OpenAI API）
# python -m vllm.entrypoints.openai.api_server \
#     --model meta-llama/Llama-3-8B-Instruct \
#     --tensor-parallel-size 2 \
#     --gpu-memory-utilization 0.9 \
#     --enable-prefix-caching \
#     --max-model-len 32768
```

### 8.2 TensorRT-LLM

**TensorRT-LLM**（NVIDIA）是 NVIDIA 官方的推理优化库，针对 NVIDIA GPU 深度优化：

- **Kernel 融合**：将多个小算子融合为大 kernel，减少 launch overhead
- **FP8 Tensor Core**：H100 原生支持，2× 吞吐提升
- **In-flight Batching**：类似 Continuous Batching
- **MoE 优化**：专门的 MoE kernel（All-to-All + Expert GEMM 融合）
- **Quantization**：SmoothQuant (INT8)、FP8、AWQ/GPTQ

**优势**：在 NVIDIA GPU 上通常比 vLLM 快 10~30%。**劣势**：仅支持 NVIDIA GPU，部署复杂度较高。

### 8.3 llama.cpp / Ollama

**llama.cpp**（Gerganov et al.）是纯 C/C++ 实现的推理引擎，核心特点是**不依赖 GPU**：

- **CPU 推理**：利用 AVX2/AVX-512/ARM NEON 指令集，纯 CPU 即可运行
- **GPU 加速**：可选 CUDA/Metal/Vulkan/ROCm 加速
- **GGUF 格式**：自定义量化格式，支持 Q2 到 Q8 多种位宽
- **低资源部署**：4-bit 量化的 7B 模型仅需 4GB 内存，可在笔记本上运行
- **内存映射**：mmap 加载，启动快、多进程共享

**Ollama** 是 llama.cpp 的用户友好封装，一行命令即可运行模型：

```bash
# Ollama 使用示例
ollama run llama3:8b-q4_K_M "Explain how transformers work"

# 等价于通过 API 调用
curl http://localhost:11434/api/generate -d '{
  "model": "llama3:8b-q4_K_M",
  "prompt": "Explain how transformers work"
}'
```

### 8.4 SGLang

**SGLang**（Zheng et al., 2024）专注于**结构化生成**和**高级调度**：

- **RadixAttention**：基于基数树（Radix Tree）的 KV Cache 管理，比 vLLM 的 Prefix Caching 更灵活
- **前端 DSL**：Python 嵌入式语言，支持分支、并行、约束生成
- **后端优化**：FlashInfer kernel、Continuous Batching、Speculative Decoding
- **性能**：在多轮对话、Agent 工具调用等场景下通常优于 vLLM

```python
# SGLang 编程模型示例
import sglang as sgl

@sgl.function
def multi_turn_qa(s, question):
    s += sgl.system("You are a helpful assistant.")
    s += sgl.user(question)
    s += sgl.assistant(sgl.gen("answer", max_tokens=256))
    s += sgl.user("Can you elaborate on that?")
    s += sgl.assistant(sgl.gen("elaboration", max_tokens=512))
```

### 推理引擎选型指南

| 场景 | 推荐引擎 | 原因 |
|------|----------|------|
| GPU 生产服务 (通用) | vLLM | 生态最成熟，PagedAttention + Continuous Batching |
| GPU 极致性能 (NVIDIA) | TensorRT-LLM | 深度 kernel 优化，FP8 支持最好 |
| CPU / 边缘部署 | llama.cpp / Ollama | 纯 CPU 推理，低资源友好 |
| 多轮对话 / Agent | SGLang | RadixAttention + 结构化生成 DSL |
| 快速原型 / 本地开发 | Ollama | 一行命令启动，零配置 |

---

## 9. 生产部署最佳实践

### 9.1 显存规划

部署 LLM 前必须精确计算显存需求：

$$
\text{总显存} = \text{模型权重} + \text{KV Cache} + \text{激活值} + \text{框架开销}
$$

```python
def estimate_gpu_memory(
    n_params_billion: float,
    n_layers: int,
    n_kv_heads: int,
    d_head: int,
    max_seq_len: int,
    max_batch_size: int,
    weight_bits: int = 16,   # 16 for FP16, 4 for INT4
    kv_bits: int = 16,
) -> dict:
    """估算 LLM 推理的 GPU 显存需求。"""
    # 1. 模型权重
    weight_gb = n_params_billion * 1e9 * (weight_bits / 8) / (1024 ** 3)

    # 2. KV Cache (最大情况)
    kv_bytes = 2 * n_layers * n_kv_heads * max_seq_len * d_head * (kv_bits / 8) * max_batch_size
    kv_gb = kv_bytes / (1024 ** 3)

    # 3. 激活值 + 临时缓冲 (通常为模型权重的 5~15%)
    activation_gb = weight_gb * 0.1

    # 4. 框架开销 (CUDA context, kernel workspace 等)
    overhead_gb = 1.0  # ~1 GB

    total_gb = weight_gb + kv_gb + activation_gb + overhead_gb

    return {
        "weights_gb": round(weight_gb, 2),
        "kv_cache_gb": round(kv_gb, 2),
        "activations_gb": round(activation_gb, 2),
        "overhead_gb": overhead_gb,
        "total_gb": round(total_gb, 2),
    }


# LLaMA-3-70B，AWQ INT4，GQA 8 heads
result = estimate_gpu_memory(
    n_params_billion=70,
    n_layers=80,
    n_kv_heads=8,
    d_head=128,
    max_seq_len=8192,
    max_batch_size=32,
    weight_bits=4,
    kv_bits=16,
)
print("LLaMA-3-70B (INT4, batch=32, seq=8K):")
for k, v in result.items():
    print(f"  {k}: {v} GB")
```

### 9.2 部署 Checklist

1. **模型选择**：根据任务复杂度选择模型规模，先尝试 8B 级别
2. **量化策略**：优先 AWQ-4bit + Marlin kernel，精度敏感场景用 FP8
3. **推理引擎**：GPU 场景用 vLLM，CPU/边缘用 Ollama
4. **KV Cache 配置**：
   - `gpu_memory_utilization=0.9`（vLLM）
   - 开启 `prefix_caching`（多轮对话场景必开）
   - 长上下文场景考虑 FP8 KV Cache
5. **批处理**：开启 Continuous Batching，设置合理的 `max_num_seqs`
6. **监控**：关注 TTFT、TPOT、吞吐量、GPU 利用率、KV Cache 命中率

### 9.3 常见性能陷阱

- **Prefill 阻塞 Decode**：长 prompt 的 prefill 会阻塞短请求的 decode，开启 Chunked Prefill 解决
- **KV Cache OOM**：batch size 过大或序列过长导致 KV Cache 耗尽显存，需设置合理上限或开启 preemption
- **量化精度下降**：特定任务（如数学推理）对量化敏感，需在具体任务上评测，必要时用更高位宽
- **Tensor Parallel 通信开销**：跨节点 TP 通信延迟高，优先使用节点内 NVLink 互联的多 GPU

---

## 10. 常见面试题（附答案要点）

### 面试题 1：请解释 KV Cache 的原理，为什么它能加速推理？

**答案要点**：自回归生成中，每步只新增一个 token，但标准注意力需要对所有历史 token 重新计算 K 和 V（线性投影）。KV Cache 将历史 token 的 K、V 投影结果缓存下来，新 token 只需计算自己的 K、V 并追加到缓存。这把 QKV 投影的重复计算从 $O(n^2)$ 降低到 $O(n)$。代价是需要额外的显存来存储缓存。

### 面试题 2：GQA 相比 MHA 有什么优势？为什么 LLaMA-3 选择 GQA？

**答案要点**：GQA 将 KV 头数从 $H$（如 64）减少到 $G$（如 8），KV Cache 大小降低 $H/G$ 倍（如 8 倍）。这对长上下文场景至关重要——LLaMA-3-70B 的 128K 上下文下，MHA 需要 343 GB KV Cache，GQA 仅需 43 GB。研究表明 GQA 在不明显损失质量的情况下可以大幅压缩 KV Cache，是精度和效率的最佳平衡点。

### 面试题 3：PagedAttention 解决了什么问题？

**答案要点**：传统 KV Cache 为每个请求预分配最大序列长度的连续显存，导致两个问题：(1) 内部碎片：实际生成长度远短于最大长度，大量显存被浪费；(2) 外部碎片：不同请求完成时间不同，释放的空间不连续。PagedAttention 借鉴 OS 虚拟内存分页，将 KV Cache 切分为固定大小的 Block，通过 Block Table 映射逻辑地址到物理地址，实现按需分配和零碎片回收。显存利用率从 <50% 提升到 >95%。

### 面试题 4：GPTQ 和 AWQ 的量化原理有什么区别？

**答案要点**：GPTQ 基于 Hessian 信息逐列量化权重矩阵——量化每一列时，利用 Hessian 逆矩阵将该列的量化误差最优地分摊到后续未量化的列。AWQ 则从激活分布出发，观察到少量"显著通道"的激活幅度远大于其他通道，对这些通道对应的权重做缩放保护（放大后量化，推理时反缩放），使显著权重获得更细的量化粒度。两者精度相当，AWQ 量化速度更快，且配合 Marlin kernel 推理速度更优。

### 面试题 5：解释投机解码（Speculative Decoding）的原理，它能保证输出和大模型一致吗？

**答案要点**：投机解码用小模型（Draft Model）快速生成 K 个候选 token，然后大模型一次前向验证所有候选。对于每个候选 token $x$，如果大模型概率 $p(x) \geq$ 小模型概率 $q(x)$ 则接受；否则以 $p(x)/q(x)$ 的概率接受。拒绝后从修正分布 $\text{norm}(\max(0, p-q))$ 重新采样。可以严格证明，这个接受/拒绝机制保证最终采样分布完全等于大模型的分布，没有任何近似。加速比取决于 Draft Model 的接受率。

### 面试题 6：MoE 模型的负载均衡问题是什么？如何解决？

**答案要点**：MoE 的门控网络容易路由坍塌——大部分 token 被路由到少数"赢家"专家，其他专家利用率极低。这导致"赢家"专家过载（计算瓶颈），其他专家参数浪费。解决方案是添加辅助负载均衡损失 $\mathcal{L}_{\text{balance}} = \alpha \cdot N \sum f_i \cdot P_i$，其中 $f_i$ 是专家被选中频率，$P_i$ 是路由概率。当负载均匀时损失最小。DeepSeek 还使用了共享专家来分担通用知识的学习压力。

### 面试题 7：FlashAttention 为什么能在不近似的情况下加速注意力计算？

**答案要点**：FlashAttention 不改变注意力的数学结果（是精确的，非近似），而是通过 IO 感知优化减少 HBM 访问。标准注意力需要将 $S \times S$ 的中间矩阵反复读写 HBM，HBM 访问量为 $O(S^2)$。FlashAttention 使用分块（tiling）策略，在 GPU 的 SRAM（快 10~20×但容量小）中完成全部计算，利用 Online Softmax 增量更新避免存储完整矩阵，将 HBM 访问降至 $O(S \cdot d)$。

### 面试题 8：Continuous Batching 相比 Static Batching 的优势是什么？

**答案要点**：Static Batching 中一个 batch 的所有请求必须等最长的请求完成才能释放，短请求完成后 GPU 空转。Continuous Batching 在每个 iteration 级别动态调度——完成的请求立即退出并释放资源，新请求立即加入。这最大化了 GPU 利用率和吞吐量。实际测试显示，Continuous Batching 可将吞吐量提升 2~8×。

### 面试题 9：FP8 和 INT8 量化有什么区别？各适合什么场景？

**答案要点**：INT8 是定点格式，动态范围有限（-128~127），量化时需要仔细选择缩放因子，可能导致溢出或精度损失。FP8 是浮点格式（E4M3 或 E5M2），具有更大的动态范围，能更好地表示激活值中的异常值（outlier），通常精度损失更小。FP8 需要 H100/B200 等支持 FP8 Tensor Core 的硬件。INT8 兼容性更广，适合部署到各种 GPU；FP8 是新一代 GPU 上的最优选择。

### 面试题 10：DeepSeek-V3 如何用 671B 总参数、37B 激活参数实现高性能？

**答案要点**：DeepSeek-V3 采用细粒度 MoE 架构：256 个路由专家 + 1 个共享专家，每 token 激活 Top-8 个路由专家。细粒度设计（把大专家拆成更多小专家）提供了指数级更多的专家组合，增强了模型表达能力。共享专家始终激活，学习通用知识。同时使用 MLA（Multi-head Latent Attention）压缩 KV Cache（64× 压缩比），FP8 混合精度训练降低成本。最终以不到 600 万美元的训练成本，达到了接近 GPT-4 的性能。

---

## 11. 易错点与最佳实践

### 易错点 1：KV Cache 增长导致 OOM

**问题**：KV Cache 随序列长度和 batch size 线性增长，在长上下文或高并发下容易耗尽显存。

**最佳实践**：(1) 设置合理的 `max_model_len` 和 `max_num_seqs`；(2) 使用 GQA/MLA 模型减少 KV Cache；(3) 开启 FP8 KV Cache（减半显存）；(4) 在 vLLM 中配置 preemption 策略。

### 易错点 2：量化后在特定任务上精度大幅下降

**问题**：INT4 量化后在数学推理、代码生成等任务上可能精度下降 5~10%。

**最佳实践**：(1) 必须在目标任务上评测，不能只看 perplexity；(2) 精度敏感任务用 FP8 或 INT8；(3) AWQ 通常比 GPTQ 在代码任务上表现更好；(4) 使用混合精度量化——注意力层用高精度、FFN 层用低精度。

### 易错点 3：Prefix Caching 未开启导致多轮对话延迟高

**问题**：多轮对话中每轮都带相同的 system prompt，不开启 Prefix Caching 会重复计算 KV。

**最佳实践**：在 vLLM 中设置 `enable_prefix_caching=True`，SGLang 默认开启 RadixAttention。

### 易错点 4：MoE 模型推理时显存超预期

**问题**：MoE 模型虽然每 token 只激活部分专家，但**所有专家的权重都需要加载到 GPU 显存**。例如 Mixtral 8×7B 的总参数 46.7B，FP16 下需要 ~93 GB 显存。

**最佳实践**：(1) MoE 模型几乎必须量化；(2) 使用 Expert Offloading 将不活跃专家放在 CPU 内存；(3) 使用 Expert Parallelism 分布到多 GPU。

### 易错点 5：忽略 Prefill 和 Decode 阶段的不同优化需求

**问题**：Prefill 是计算密集型，Decode 是带宽密集型，用同一套策略优化会顾此失彼。

**最佳实践**：(1) Prefill 用 FlashAttention 加速矩阵乘法；(2) Decode 用 Flash Decoding 增加 KV 维度并行度；(3) 生产环境考虑 Prefill-Decode 分离（PD Separation），不同硬件分别优化。

### 易错点 6：投机解码的 Draft Model 选择不当

**问题**：Draft Model 太大则加速比低（自身推理就慢），太小或太差则接受率低（大量 token 被拒绝）。

**最佳实践**：(1) Draft Model 参数量通常为 Target 的 1/10~1/5；(2) Draft Model 与 Target 使用相同 tokenizer；(3) 先测量接受率 $\alpha$，只有 $\alpha > 0.7$ 时投机解码才有明显加速。

### 易错点 7：Continuous Batching 的 Prefill 抢占问题

**问题**：新请求的 Prefill 计算量大，会抢占正在 Decode 的短请求的 GPU 资源，导致后者 TPOT 抖动。

**最佳实践**：开启 Chunked Prefill，将长 Prefill 分成多个小块，与 Decode 请求交替执行。

### 易错点 8：分组量化的 group_size 选择

**问题**：group_size 太大（如 1024），量化误差大；太小（如 32），元数据（scales/zero_points）开销大，实际压缩比下降。

**最佳实践**：group_size = 128 是最广泛验证的"甜点"值，在精度和压缩比间取得最佳平衡。

### 易错点 9：混淆 MoE 的"总参数"和"激活参数"

**问题**：在讨论 MoE 模型性能时，容易混淆总参数量和每 token 激活参数量。

**最佳实践**：始终区分两个概念——Mixtral 8×7B 的总参数 46.7B，激活参数 ~12.9B。与稠密模型对比时，应用"激活参数"作为推理成本的衡量标准，用"总参数"作为模型容量的衡量标准。

### 易错点 10：忽视 KV Cache 的带宽瓶颈

**问题**：即使 KV Cache 没有 OOM，过大的 KV Cache 也会导致 Decode 变慢——每步都要从 HBM 读取全部 KV，带宽成为瓶颈。

**最佳实践**：(1) 使用 GQA/MLA 减少 KV Cache 大小；(2) 使用 Flash Decoding 增加并行度分摊带宽压力；(3) 考虑 KV Cache 量化（FP8/INT8）减少读取量。

### 易错点 11：FP8 的 E4M3 和 E5M2 用途混淆

**问题**：E4M3（4 位指数 + 3 位尾数）适合推理中的权重和激活（精度更高），E5M2（5 位指数 + 2 位尾数）适合训练中的梯度（动态范围更大）。混用会导致溢出或精度损失。

**最佳实践**：推理用 E4M3，训练梯度用 E5M2。vLLM 的 `kv_cache_dtype="fp8_e4m3"` 是正确的推理配置。

### 易错点 12：在 MoE 训练中辅助损失系数设置不当

**问题**：$\alpha$ 太大（如 0.5）会显著影响主任务性能——模型为了负载均衡牺牲了路由质量；$\alpha$ 太小（如 0.001）则无法有效防止路由坍塌。

**最佳实践**：$\alpha = 0.01 \sim 0.1$ 是经验最优范围。DeepSeek-V3 使用了更细致的策略，包括专家级别的负载约束和设备级别的均衡。

### 易错点 13：Online Softmax 精度问题

**问题**：FlashAttention 的 Online Softmax 涉及指数运算的增量更新，使用 FP16 可能因精度不足导致数值偏差。

**最佳实践**：FlashAttention 内部的 softmax 中间结果（max、sum、rescaling 系数）始终用 FP32 计算，输入输出可以是 FP16/BF16。FlashAttention 论文证明了其数值误差不超过标准实现。

### 易错点 14：Speculative Decoding 在 batch 场景下效果减弱

**问题**：投机解码优化的是单请求延迟（latency），在高吞吐 batch 推理场景下，每个请求的 draft 接受数量不同，会导致 batch 内对齐困难。

**最佳实践**：投机解码最适合低延迟、小 batch 场景（如交互式对话）。高吞吐场景优先使用 Continuous Batching + PagedAttention。

---

## 总结

LLM 推理优化是一个横跨模型架构、系统工程和硬件的综合课题。核心技术可以归纳为三条主线：

1. **减少显存占用与带宽需求**：KV Cache 优化（GQA/MLA/PagedAttention）、模型量化（GPTQ/AWQ/FP8）
2. **提高计算效率**：FlashAttention（IO 感知精确注意力）、Continuous Batching（最大化 GPU 利用率）
3. **增加有效计算产出**：Speculative Decoding（每次前向产出多个 token）、MoE（用小成本获得大模型能力）

在实际生产中，这些技术通常组合使用：例如 AWQ-4bit 量化 + vLLM (PagedAttention + Continuous Batching + Prefix Caching) + FlashAttention + FP8 KV Cache，可以在单张 A100 上以 100+ tokens/s 的吞吐服务 70B 级模型。

理解这些技术的原理、权衡和适用场景，是 LLM 工程师必备的核心能力。