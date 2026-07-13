# 参数高效微调（LoRA / QLoRA）详解

> Parameter-Efficient Fine-Tuning (PEFT) — 以 LoRA 和 QLoRA 为核心

---

## 目录

1. [引言：为什么需要参数高效微调](#1-引言为什么需要参数高效微调)
2. [PEFT 方法全景](#2-peft-方法全景)
3. [LoRA 核心原理](#3-lora-核心原理)
4. [LoRA 数学推导与直觉](#4-lora-数学推导与直觉)
5. [LoRA 的关键超参数](#5-lora-的关键超参数)
6. [LoRA 代码实现（从零手写）](#6-lora-代码实现从零手写)
7. [使用 HuggingFace PEFT 库实战](#7-使用-huggingface-peft-库实战)
8. [QLoRA：量化 + LoRA 的极致效率](#8-qlora量化--lora-的极致效率)
9. [QLoRA 代码实战](#9-qlora-代码实战)
10. [其他 PEFT 方法对比](#10-其他-peft-方法对比)
11. [LoRA 变体与前沿进展](#11-lora-变体与前沿进展)
12. [工程实践与最佳实践](#12-工程实践与最佳实践)
13. [性能分析与消融实验](#13-性能分析与消融实验)
14. [常见面试题与答案](#14-常见面试题与答案)
15. [易错点与踩坑指南](#15-易错点与踩坑指南)
16. [总结与展望](#16-总结与展望)

---

## 1. 引言：为什么需要参数高效微调

### 1.1 全量微调的困境

随着大语言模型（Large Language Model, LLM）规模的爆炸式增长，全量微调（Full Fine-Tuning）面临严峻挑战：

| 模型 | 参数量 | FP16 显存占用（仅权重） | Adam 优化器状态 | 全量微调总显存 |
|------|--------|------------------------|----------------|---------------|
| GPT-2 | 1.5B | 3 GB | 12 GB | ~18 GB |
| LLaMA-7B | 7B | 14 GB | 56 GB | ~84 GB |
| LLaMA-13B | 13B | 26 GB | 104 GB | ~156 GB |
| LLaMA-65B | 65B | 130 GB | 520 GB | ~780 GB |
| GPT-3 | 175B | 350 GB | 1400 GB | ~2.1 TB |

全量微调的核心问题：

1. **显存瓶颈**：Adam 优化器需要为每个参数维护一阶矩（momentum）和二阶矩（variance），显存占用约为模型权重的 4 倍（FP32 优化器状态）。加上梯度和激活值，总显存远超单卡容量。

2. **存储成本**：每个下游任务保存一份完整模型副本。若有 100 个任务，LLaMA-7B 就需要 1.4 TB 存储。

3. **灾难性遗忘**：全量更新所有参数容易破坏预训练学到的通用知识。

4. **部署复杂**：多任务场景需要加载多个完整模型，无法共享基座权重。

### 1.2 参数高效微调的核心思想

参数高效微调（Parameter-Efficient Fine-Tuning, PEFT）的核心假设是：

> **预训练模型在适配下游任务时，所需的参数更新存在于一个低维子空间中。**

换言之，我们不需要更新全部参数，只需要学习一个"增量"（delta），这个增量可以用远少于原始参数量的参数来表示。

PEFT 的目标：

- 冻结（freeze）预训练模型的绝大部分参数
- 只训练极少量的新增参数（通常 < 1% 原始参数量）
- 达到接近全量微调的效果
- 大幅降低显存、存储和计算成本

### 1.3 PEFT 的实际价值

```
全量微调 LLaMA-7B：需要 4×A100 80GB（约 $50/小时）
LoRA 微调 LLaMA-7B：1×A100 40GB 即可（约 $3/小时）
QLoRA 微调 LLaMA-7B：1×RTX 3090 24GB 即可（消费级显卡）
```

这意味着：个人开发者、小团队也能微调大模型，大模型的民主化由此加速。

---

## 2. PEFT 方法全景

在深入 LoRA 之前，先建立 PEFT 方法的全局视角：

### 2.1 分类体系

```
PEFT 方法
├── 加法式（Additive）
│   ├── Adapter（串联小模块）
│   │   ├── Houlsby Adapter（2019）
│   │   ├── Pfeiffer Adapter（2020）
│   │   └── AdapterFusion（2021）
│   ├── Soft Prompt（学习虚拟 token）
│   │   ├── Prefix-Tuning（2021）
│   │   ├── Prompt Tuning（2021）
│   │   └── P-Tuning v2（2022）
│   └── 旁路式（Side）
│       └── Side-Tuning（2020）
├── 选择式（Selective）
│   ├── BitFit（只训练 bias）
│   ├── 部分层微调
│   └── Diff Pruning
├── 重参数化（Reparameterization）
│   ├── LoRA（2021）★
│   ├── QLoRA（2023）★
│   ├── AdaLoRA（2023）
│   ├── DoRA（2024）
│   ├── LoRA+（2024）
│   └── rsLoRA（2024）
└── 混合式
    ├── MAM Adapter（2022）
    └── UniPELT（2022）
```

### 2.2 各方法核心对比

| 方法 | 可训练参数占比 | 推理延迟增加 | 可合并到基座 | 适用场景 |
|------|--------------|-------------|-------------|---------|
| Full FT | 100% | 0 | — | 数据充足、资源充足 |
| Adapter | 0.5~3% | 有（串联） | 否 | 多任务切换 |
| Prefix-Tuning | 0.1~1% | 有（增加 KV） | 否 | 生成任务 |
| Prompt Tuning | <0.01% | 有（增加 token） | 否 | 超大模型 |
| BitFit | ~0.1% | 0 | 是 | 快速实验 |
| **LoRA** | **0.1~1%** | **0（合并后）** | **是** | **通用首选** |
| **QLoRA** | **0.1~1%** | **0（合并后）** | **是** | **显存极度受限** |

LoRA 的独特优势在于：**训练时参数高效，推理时零额外开销**（因为低秩矩阵可以合并回原始权重）。

---

## 3. LoRA 核心原理

### 3.1 论文信息

- **标题**：LoRA: Low-Rank Adaptation of Large Language Models
- **作者**：Edward Hu, Yelong Shen, Phillip Wallis, Zeyuan Allen-Zhu, Yuanzhi Li, Shean Wang, Lu Wang, Weizhu Chen（Microsoft Research）
- **发表**：ICLR 2022
- **核心贡献**：提出用低秩分解来参数化权重更新，实现高效微调

### 3.2 核心假设：内在低秩（Intrinsic Low Rank）

LoRA 的理论基础来自 Aghajanyan et al. (2020) 的发现：

> 预训练语言模型具有很低的"内在维度"（intrinsic dimension）。即使将参数投影到一个很小的子空间中进行优化，仍然能达到接近全量微调的效果。

直觉理解：预训练模型已经学到了丰富的通用知识，适配下游任务只需要在这个知识基础上做"微小调整"。这些调整虽然分布在高维参数空间中，但实际上可以被一个低秩矩阵很好地近似。

### 3.3 LoRA 的核心思想

对于预训练权重矩阵 $W_0 \in \mathbb{R}^{d \times k}$，LoRA 将权重更新约束为低秩分解：

$$W = W_0 + \Delta W = W_0 + BA$$

其中：
- $W_0 \in \mathbb{R}^{d \times k}$：预训练权重（冻结，不更新）
- $B \in \mathbb{R}^{d \times r}$：低秩矩阵（可训练）
- $A \in \mathbb{R}^{r \times k}$：低秩矩阵（可训练）
- $r \ll \min(d, k)$：秩（rank），通常 $r \in \{4, 8, 16, 32, 64\}$

### 3.4 前向传播

原始前向传播：
$$h = W_0 x$$

LoRA 修改后：
$$h = W_0 x + \Delta W x = W_0 x + BAx$$

图示：

```
输入 x ∈ R^k
    │
    ├──────────────────────────────┐
    │                              │
    ▼                              ▼
┌────────────┐              ┌──────────┐
│  W₀ (冻结)  │              │  A (r×k)  │  ← 可训练
│  d × k     │              └──────────┘
└────────────┘                    │
    │                              ▼
    │                        ┌──────────┐
    │                        │  B (d×r)  │  ← 可训练
    │                        └──────────┘
    │                              │
    ▼                              ▼
    ├──────────── + ───────────────┤
    │                              │
    ▼
  h = W₀x + BAx ∈ R^d
```

### 3.5 参数效率分析

以 Transformer 中一个注意力层的 $W_Q$ 为例：
- 原始参数量：$d \times d$（如 $4096 \times 4096 = 16,777,216$）
- LoRA 参数量：$d \times r + r \times d = 2dr$（如 $r=16$：$2 \times 4096 \times 16 = 131,072$）
- 压缩比：$\frac{d^2}{2dr} = \frac{d}{2r} = \frac{4096}{32} = 128\times$

对于 LLaMA-7B（$d=4096$，32 层，每层 4 个注意力矩阵）：
- 全量参数：约 7B
- LoRA（$r=16$，仅注意力）：$32 \times 4 \times 2 \times 4096 \times 16 = 16,777,216 \approx 16.8M$
- 占比：$16.8M / 7B \approx 0.24\%$

### 3.6 初始化策略

LoRA 的初始化至关重要：

- **矩阵 A**：使用 Kaiming 均匀分布（或高斯分布）随机初始化
- **矩阵 B**：初始化为全零矩阵

这样设计的原因：
$$\Delta W = BA = \mathbf{0} \cdot A = \mathbf{0}$$

训练开始时，$\Delta W = 0$，模型行为与预训练模型完全一致。这保证了：
1. 训练起点就是预训练模型（不会破坏已有知识）
2. 梯度从一开始就有意义（A 非零，B 的梯度非零）
3. 训练过程稳定（从零开始逐渐学习增量）

### 3.7 缩放因子 α

实际实现中，LoRA 引入缩放因子：

$$h = W_0 x + \frac{\alpha}{r} \cdot BAx$$

其中 $\alpha$ 是一个常数超参数（通常设为 $r$ 或 $2r$）。

缩放因子的作用：
- 当调整 $r$ 时，不需要重新调整学习率
- $\frac{\alpha}{r}$ 使得不同 $r$ 值下，LoRA 的有效学习率大致相同
- 实践中常设 $\alpha = r$（即缩放因子为 1）或 $\alpha = 2r$

### 3.8 推理时的权重合并

LoRA 最大的优势之一：**推理时零额外开销**。

训练完成后，将 LoRA 权重合并回基座：
$$W_{merged} = W_0 + \frac{\alpha}{r} \cdot BA$$

合并后的模型与原始模型结构完全相同，推理速度不变。

多任务切换：
```
基座模型 W₀（共享）
    + LoRA_task1 (BA)₁  → 任务1 模型
    + LoRA_task2 (BA)₂  → 任务2 模型
    + LoRA_task3 (BA)₃  → 任务3 模型
```

每个 LoRA 适配器只有几十 MB，切换任务只需加载不同的 LoRA 权重。

---

## 4. LoRA 数学推导与直觉

### 4.1 为什么低秩有效？——从 SVD 角度理解

任何矩阵 $M \in \mathbb{R}^{m \times n}$ 都可以进行奇异值分解（SVD）：

$$M = U \Sigma V^T$$

其中 $\Sigma = \text{diag}(\sigma_1, \sigma_2, \ldots, \sigma_{\min(m,n)})$，$\sigma_1 \geq \sigma_2 \geq \ldots \geq 0$。

**低秩近似定理（Eckart-Young-Mirsky）**：秩为 $r$ 的最佳近似为：

$$M_r = U_r \Sigma_r V_r^T = \sum_{i=1}^{r} \sigma_i u_i v_i^T$$

实验发现，预训练模型权重更新 $\Delta W$ 的奇异值衰减非常快：

```
σ₁ = 1.0
σ₂ = 0.3
σ₃ = 0.1
σ₄ = 0.05
σ₅ = 0.02
σ₆ = 0.01
...
σ₆₄ ≈ 0.001
```

前 8~16 个奇异值就能捕获 $\Delta W$ 中 90%+ 的信息，这就是 LoRA 有效的根本原因。

### 4.2 梯度分析

对于 LoRA 参数的梯度：

$$\frac{\partial \mathcal{L}}{\partial A} = B^T \frac{\partial \mathcal{L}}{\partial h} x^T$$

$$\frac{\partial \mathcal{L}}{\partial B} = \frac{\partial \mathcal{L}}{\partial h} (Ax)^T$$

关键观察：
- B 初始化为零 → 训练初期 $\frac{\partial \mathcal{L}}{\partial A} = 0^T \cdot \frac{\partial \mathcal{L}}{\partial h} \cdot x^T = 0$
- 但 A 随机初始化 → $\frac{\partial \mathcal{L}}{\partial B} = \frac{\partial \mathcal{L}}{\partial h} \cdot (Ax)^T \neq 0$

所以训练初期：
1. B 先开始更新（因为 A 非零提供了有效梯度）
2. B 更新后不再为零，A 的梯度也变得非零
3. A 和 B 交替更新，逐渐学到有意义的低秩增量

### 4.3 与全量微调的等价性分析

当 $r = \min(d, k)$ 时，LoRA 退化为全量微调（$BA$ 可以表示任意 $d \times k$ 矩阵）。

当 $r < \min(d, k)$ 时，LoRA 是全量微调的一个正则化版本——它隐式地约束了 $\Delta W$ 的秩，相当于一种结构化正则化。这解释了为什么 LoRA 有时甚至优于全量微调：低秩约束起到了防止过拟合的作用。

### 4.4 LoRA 与 Dropout 的关系

LoRA 论文中建议在 A 和 B 之间加入 Dropout：

$$h = W_0 x + \frac{\alpha}{r} \cdot B \cdot \text{Dropout}(Ax)$$

这进一步增强了正则化效果，防止低秩空间中的过拟合。

---

## 5. LoRA 的关键超参数

### 5.1 秩 r（Rank）

秩 $r$ 是 LoRA 最重要的超参数，它控制了适配器的表达能力：

| r 值 | 可训练参数（LLaMA-7B，4 矩阵） | 效果 | 适用场景 |
|------|-------------------------------|------|---------|
| 4 | ~4.2M (0.06%) | 简单任务足够 | 情感分类、简单指令 |
| 8 | ~8.4M (0.12%) | 多数任务良好 | 通用对话、翻译 |
| 16 | ~16.8M (0.24%) | 接近全量微调 | 复杂推理、代码生成 |
| 32 | ~33.6M (0.48%) | 几乎等同全量 | 领域深度适配 |
| 64 | ~67.1M (0.96%) | 可能过拟合 | 超大数据集 |

**选择建议**：
- 从 $r=8$ 开始实验
- 数据量小（<10K 样本）：$r=4$ 或 $r=8$
- 数据量大（>100K 样本）：$r=16$ 或 $r=32$
- 任务复杂度高：增大 $r$
- 如果 $r=8$ 和 $r=64$ 效果差不多，说明任务本身低秩性强，用小 $r$ 即可

### 5.2 缩放因子 α（Alpha）

$\alpha$ 控制 LoRA 增量的幅度：

$$\text{effective\_lr} = \text{lr} \times \frac{\alpha}{r}$$

常见设置：
- $\alpha = r$：缩放因子为 1，最常用
- $\alpha = 2r$：增大 LoRA 的影响力
- $\alpha = 16$（固定）：无论 $r$ 如何变化，都用固定 $\alpha$

**实践建议**：
- 初始设 $\alpha = r$
- 如果训练不稳定（loss 震荡），减小 $\alpha$
- 如果收敛太慢，增大 $\alpha$

### 5.3 目标模块（Target Modules）

在 Transformer 中，可以对哪些权重矩阵应用 LoRA：

```
Multi-Head Attention:
  - W_Q (Query projection)     ← 常用
  - W_K (Key projection)       ← 常用
  - W_V (Value projection)     ← 常用
  - W_O (Output projection)    ← 常用

Feed-Forward Network:
  - W_gate (Gate projection)   ← 可选
  - W_up (Up projection)       ← 可选
  - W_down (Down projection)   ← 可选

Others:
  - Embedding layer            ← 少用
  - LM Head                    ← 少用
```

**实验结论**（来自原论文和后续研究）：
- 只对 $W_Q, W_V$ 应用 LoRA 就能获得不错效果
- 对所有注意力矩阵（$W_Q, W_K, W_V, W_O$）效果更好
- 加上 FFN 层（$W_{gate}, W_{up}, W_{down}$）效果最佳但参数量增加
- 推荐：对所有线性层都应用 LoRA（现代实践的默认选择）

### 5.4 学习率

LoRA 的学习率通常比全量微调大：
- 全量微调：$1\text{e-}5$ ~ $5\text{e-}5$
- LoRA：$1\text{e-}4$ ~ $3\text{e-}4$

原因：LoRA 参数量少，梯度更新的"信噪比"更高，可以用更大的步长。

### 5.5 Dropout

LoRA 中的 Dropout 率：
- 数据量大：$p=0$（不需要额外正则化）
- 数据量小：$p=0.05$ ~ $p=0.1$
- 极小数据集：$p=0.1$ ~ $p=0.2$

---

## 6. LoRA 代码实现（从零手写）

### 6.1 最简 LoRA 层实现

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math
from typing import Optional


class LoRALayer(nn.Module):
    """
    LoRA (Low-Rank Adaptation) 层的基础实现。
    
    将原始线性层 W₀ 的更新分解为两个低秩矩阵的乘积：
    h = W₀x + (α/r) * BAx
    
    参数:
        in_features: 输入维度 k
        out_features: 输出维度 d
        rank: 低秩分解的秩 r
        alpha: 缩放因子 α
        dropout: Dropout 概率
    """
    
    def __init__(
        self,
        in_features: int,
        out_features: int,
        rank: int = 8,
        alpha: float = 16.0,
        dropout: float = 0.0,
    ):
        super().__init__()
        
        assert rank > 0, f"Rank must be positive, got {rank}"
        assert rank <= min(in_features, out_features), (
            f"Rank {rank} exceeds min dimension {min(in_features, out_features)}"
        )
        
        self.in_features = in_features
        self.out_features = out_features
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank  # 缩放因子
        
        # 低秩矩阵 A: R^{r × k}，Kaiming 初始化
        self.lora_A = nn.Parameter(torch.empty(rank, in_features))
        nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))
        
        # 低秩矩阵 B: R^{d × r}，零初始化
        self.lora_B = nn.Parameter(torch.zeros(out_features, rank))
        
        # Dropout（应用在 Ax 之后、B 之前）
        self.dropout = nn.Dropout(p=dropout) if dropout > 0.0 else nn.Identity()
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        计算 LoRA 增量：(α/r) * B @ Dropout(A @ x)
        
        Args:
            x: 输入张量，shape = (..., in_features)
        Returns:
            LoRA 增量，shape = (..., out_features)
        """
        # x: (..., k) → Ax: (..., r) → BAx: (..., d)
        lora_out = F.linear(x, self.lora_A)       # (..., r)
        lora_out = self.dropout(lora_out)
        lora_out = F.linear(lora_out, self.lora_B) # (..., d)
        return lora_out * self.scaling


class LinearWithLoRA(nn.Module):
    """
    带 LoRA 的线性层：冻结原始权重，只训练 LoRA 参数。
    
    前向传播: h = W₀x + b + (α/r) * BAx
    """
    
    def __init__(
        self,
        original_linear: nn.Linear,
        rank: int = 8,
        alpha: float = 16.0,
        dropout: float = 0.0,
    ):
        super().__init__()
        
        self.original_linear = original_linear
        # 冻结原始权重
        for param in self.original_linear.parameters():
            param.requires_grad = False
            
        self.lora = LoRALayer(
            in_features=original_linear.in_features,
            out_features=original_linear.out_features,
            rank=rank,
            alpha=alpha,
            dropout=dropout,
        )
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # 原始输出 + LoRA 增量
        return self.original_linear(x) + self.lora(x)
    
    def merge_weights(self) -> nn.Linear:
        """
        将 LoRA 权重合并回原始线性层，用于推理部署。
        合并后无额外计算开销。
        
        Returns:
            合并后的 nn.Linear（新对象）
        """
        merged = nn.Linear(
            self.original_linear.in_features,
            self.original_linear.out_features,
            bias=self.original_linear.bias is not None,
        )
        
        # W_merged = W₀ + (α/r) * B @ A
        with torch.no_grad():
            delta_w = (self.lora.lora_B @ self.lora.lora_A) * self.lora.scaling
            merged.weight.copy_(self.original_linear.weight + delta_w)
            if self.original_linear.bias is not None:
                merged.bias.copy_(self.original_linear.bias)
                
        return merged


# ============================================================
# 验证：LoRA 合并前后输出一致
# ============================================================

def verify_lora_merge():
    """验证 LoRA 权重合并的正确性"""
    torch.manual_seed(42)
    
    # 创建原始线性层
    linear = nn.Linear(512, 256)
    
    # 包装为 LoRA 层
    lora_linear = LinearWithLoRA(linear, rank=8, alpha=16.0)
    
    # 模拟训练（随机更新 LoRA 参数）
    with torch.no_grad():
        lora_linear.lora.lora_A.normal_(0, 0.01)
        lora_linear.lora.lora_B.normal_(0, 0.01)
    
    # 测试输入
    x = torch.randn(4, 512)
    
    # 合并前的输出
    lora_linear.eval()
    output_before = lora_linear(x)
    
    # 合并权重
    merged_linear = lora_linear.merge_weights()
    merged_linear.eval()
    output_after = merged_linear(x)
    
    # 验证输出一致
    max_diff = (output_before - output_after).abs().max().item()
    print(f"合并前后最大差异: {max_diff:.2e}")
    assert max_diff < 1e-5, f"合并误差过大: {max_diff}"
    print("✅ LoRA 权重合并验证通过！")
    
    # 参数量对比
    original_params = sum(p.numel() for p in linear.parameters())
    lora_params = sum(p.numel() for p in lora_linear.lora.parameters())
    print(f"原始参数量: {original_params:,}")
    print(f"LoRA 参数量: {lora_params:,}")
    print(f"参数占比: {lora_params/original_params*100:.2f}%")


if __name__ == "__main__":
    verify_lora_merge()
```

输出示例：
```
合并前后最大差异: 0.00e+00
✅ LoRA 权重合并验证通过！
原始参数量: 131,328
LoRA 参数量: 6,144
参数占比: 4.68%
```

### 6.2 为 Transformer 模型注入 LoRA

```python
import re
from typing import Dict, List, Tuple


def inject_lora(
    model: nn.Module,
    target_modules: List[str] = None,
    rank: int = 8,
    alpha: float = 16.0,
    dropout: float = 0.0,
) -> Dict[str, LinearWithLoRA]:
    """
    为模型中的指定线性层注入 LoRA。
    
    Args:
        model: 目标模型
        target_modules: 要注入 LoRA 的模块名称模式列表
                       如 ["q_proj", "v_proj", "k_proj", "o_proj"]
        rank: LoRA 秩
        alpha: 缩放因子
        dropout: Dropout 率
        
    Returns:
        注入的 LoRA 模块字典 {名称: LinearWithLoRA}
    """
    if target_modules is None:
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj"]
    
    lora_modules = {}
    
    for name, module in model.named_modules():
        if not isinstance(module, nn.Linear):
            continue
            
        # 检查模块名是否匹配目标模式
        if not any(target in name for target in target_modules):
            continue
        
        # 创建 LoRA 包装层
        lora_layer = LinearWithLoRA(
            original_linear=module,
            rank=rank,
            alpha=alpha,
            dropout=dropout,
        )
        
        # 替换原始模块
        # 需要找到父模块并替换子模块
        parent_name = ".".join(name.split(".")[:-1])
        child_name = name.split(".")[-1]
        
        if parent_name:
            parent = dict(model.named_modules())[parent_name]
        else:
            parent = model
            
        setattr(parent, child_name, lora_layer)
        lora_modules[name] = lora_layer
    
    # 冻结所有非 LoRA 参数
    for name, param in model.named_parameters():
        if "lora_" not in name:
            param.requires_grad = False
    
    return lora_modules


def print_trainable_parameters(model: nn.Module) -> Tuple[int, int, float]:
    """打印模型的可训练参数统计"""
    total_params = 0
    trainable_params = 0
    
    for param in model.parameters():
        total_params += param.numel()
        if param.requires_grad:
            trainable_params += param.numel()
    
    ratio = trainable_params / total_params * 100
    print(
        f"可训练参数: {trainable_params:,} / {total_params:,} "
        f"({ratio:.4f}%)"
    )
    return total_params, trainable_params, ratio


# ============================================================
# 示例：为一个简单 Transformer 注入 LoRA
# ============================================================

class SimpleTransformerBlock(nn.Module):
    """简化的 Transformer 块，用于演示 LoRA 注入"""
    
    def __init__(self, d_model: int = 512, n_heads: int = 8, d_ff: int = 2048):
        super().__init__()
        self.d_model = d_model
        
        # Multi-Head Attention
        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.o_proj = nn.Linear(d_model, d_model)
        
        # Feed-Forward Network
        self.gate_proj = nn.Linear(d_model, d_ff)
        self.up_proj = nn.Linear(d_model, d_ff)
        self.down_proj = nn.Linear(d_ff, d_model)
        
        # Layer Norms
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        
    def forward(self, x):
        # 简化实现，仅演示结构
        h = self.norm1(x)
        q = self.q_proj(h)
        k = self.k_proj(h)
        v = self.v_proj(h)
        attn_out = self.o_proj(v)  # 简化，省略实际注意力计算
        x = x + attn_out
        
        h = self.norm2(x)
        gate = F.silu(self.gate_proj(h))
        up = self.up_proj(h)
        x = x + self.down_proj(gate * up)
        return x


class SimpleTransformer(nn.Module):
    """简化的 Transformer 模型"""
    
    def __init__(self, n_layers: int = 6, d_model: int = 512):
        super().__init__()
        self.layers = nn.ModuleList([
            SimpleTransformerBlock(d_model) for _ in range(n_layers)
        ])
        self.lm_head = nn.Linear(d_model, 32000, bias=False)
        
    def forward(self, x):
        for layer in self.layers:
            x = layer(x)
        return self.lm_head(x)


def demo_lora_injection():
    """演示 LoRA 注入过程"""
    print("=" * 60)
    print("LoRA 注入演示")
    print("=" * 60)
    
    # 创建模型
    model = SimpleTransformer(n_layers=6, d_model=512)
    print("\n[原始模型]")
    print_trainable_parameters(model)
    
    # 注入 LoRA（仅注意力层）
    lora_modules = inject_lora(
        model,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        rank=8,
        alpha=16.0,
        dropout=0.05,
    )
    
    print(f"\n[注入 LoRA 后] (rank=8, 目标: 注意力层)")
    print(f"注入了 {len(lora_modules)} 个 LoRA 模块:")
    for name in lora_modules:
        print(f"  - {name}")
    print_trainable_parameters(model)
    
    # 注入 LoRA（所有线性层）
    model2 = SimpleTransformer(n_layers=6, d_model=512)
    lora_modules2 = inject_lora(
        model2,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                       "gate_proj", "up_proj", "down_proj"],
        rank=16,
        alpha=32.0,
    )
    
    print(f"\n[注入 LoRA 后] (rank=16, 目标: 所有线性层)")
    print(f"注入了 {len(lora_modules2)} 个 LoRA 模块")
    print_trainable_parameters(model2)


if __name__ == "__main__":
    demo_lora_injection()
```

### 6.3 LoRA 训练循环

```python
import torch
from torch.utils.data import DataLoader, Dataset
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from typing import Optional
import time


class LoRATrainer:
    """
    LoRA 微调训练器。
    
    特点：
    - 只优化 LoRA 参数（requires_grad=True 的参数）
    - 支持梯度累积
    - 支持混合精度训练
    - 支持学习率调度
    """
    
    def __init__(
        self,
        model: nn.Module,
        train_dataloader: DataLoader,
        eval_dataloader: Optional[DataLoader] = None,
        learning_rate: float = 2e-4,
        weight_decay: float = 0.01,
        num_epochs: int = 3,
        gradient_accumulation_steps: int = 4,
        max_grad_norm: float = 1.0,
        warmup_steps: int = 100,
        use_amp: bool = True,
        device: str = "cuda",
    ):
        self.model = model.to(device)
        self.device = device
        self.train_dataloader = train_dataloader
        self.eval_dataloader = eval_dataloader
        self.num_epochs = num_epochs
        self.gradient_accumulation_steps = gradient_accumulation_steps
        self.max_grad_norm = max_grad_norm
        self.use_amp = use_amp
        
        # 只优化 LoRA 参数
        trainable_params = [p for p in model.parameters() if p.requires_grad]
        print(f"优化器管理 {len(trainable_params)} 个参数张量")
        
        self.optimizer = AdamW(
            trainable_params,
            lr=learning_rate,
            weight_decay=weight_decay,
            betas=(0.9, 0.999),
        )
        
        total_steps = len(train_dataloader) * num_epochs // gradient_accumulation_steps
        self.scheduler = CosineAnnealingLR(
            self.optimizer,
            T_max=total_steps,
            eta_min=learning_rate * 0.1,
        )
        
        # 混合精度
        self.scaler = torch.amp.GradScaler("cuda") if use_amp else None
        
    def train_step(self, batch) -> float:
        """单步训练"""
        input_ids = batch["input_ids"].to(self.device)
        labels = batch["labels"].to(self.device)
        attention_mask = batch.get("attention_mask", None)
        if attention_mask is not None:
            attention_mask = attention_mask.to(self.device)
        
        with torch.amp.autocast("cuda", enabled=self.use_amp):
            outputs = self.model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels,
            )
            loss = outputs.loss / self.gradient_accumulation_steps
        
        if self.scaler:
            self.scaler.scale(loss).backward()
        else:
            loss.backward()
            
        return loss.item() * self.gradient_accumulation_steps
    
    def train(self):
        """完整训练循环"""
        self.model.train()
        global_step = 0
        total_loss = 0.0
        
        print(f"\n{'='*60}")
        print(f"开始 LoRA 训练")
        print(f"  Epochs: {self.num_epochs}")
        print(f"  Batch size: {self.train_dataloader.batch_size}")
        print(f"  Gradient accumulation: {self.gradient_accumulation_steps}")
        print(f"  Effective batch size: "
              f"{self.train_dataloader.batch_size * self.gradient_accumulation_steps}")
        print(f"{'='*60}\n")
        
        start_time = time.time()
        
        for epoch in range(self.num_epochs):
            epoch_loss = 0.0
            num_batches = 0
            
            for step, batch in enumerate(self.train_dataloader):
                loss = self.train_step(batch)
                total_loss += loss
                epoch_loss += loss
                num_batches += 1
                
                # 梯度累积完成，执行优化步
                if (step + 1) % self.gradient_accumulation_steps == 0:
                    if self.scaler:
                        self.scaler.unscale_(self.optimizer)
                        torch.nn.utils.clip_grad_norm_(
                            [p for p in self.model.parameters() if p.requires_grad],
                            self.max_grad_norm,
                        )
                        self.scaler.step(self.optimizer)
                        self.scaler.update()
                    else:
                        torch.nn.utils.clip_grad_norm_(
                            [p for p in self.model.parameters() if p.requires_grad],
                            self.max_grad_norm,
                        )
                        self.optimizer.step()
                    
                    self.scheduler.step()
                    self.optimizer.zero_grad()
                    global_step += 1
                    
                    # 日志
                    if global_step % 50 == 0:
                        avg_loss = total_loss / global_step
                        lr = self.scheduler.get_last_lr()[0]
                        elapsed = time.time() - start_time
                        print(
                            f"  Step {global_step} | "
                            f"Loss: {loss:.4f} | "
                            f"Avg Loss: {avg_loss:.4f} | "
                            f"LR: {lr:.2e} | "
                            f"Time: {elapsed:.1f}s"
                        )
            
            # Epoch 结束
            avg_epoch_loss = epoch_loss / num_batches
            print(f"\n  Epoch {epoch+1}/{self.num_epochs} 完成 | "
                  f"平均 Loss: {avg_epoch_loss:.4f}")
            
            # 评估
            if self.eval_dataloader:
                eval_loss = self.evaluate()
                print(f"  验证 Loss: {eval_loss:.4f}")
        
        total_time = time.time() - start_time
        print(f"\n训练完成！总耗时: {total_time:.1f}s")
        
    @torch.no_grad()
    def evaluate(self) -> float:
        """评估"""
        self.model.eval()
        total_loss = 0.0
        num_batches = 0
        
        for batch in self.eval_dataloader:
            input_ids = batch["input_ids"].to(self.device)
            labels = batch["labels"].to(self.device)
            attention_mask = batch.get("attention_mask", None)
            if attention_mask is not None:
                attention_mask = attention_mask.to(self.device)
            
            with torch.amp.autocast("cuda", enabled=self.use_amp):
                outputs = self.model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    labels=labels,
                )
            total_loss += outputs.loss.item()
            num_batches += 1
        
        self.model.train()
        return total_loss / max(num_batches, 1)
    
    def save_lora_weights(self, save_path: str):
        """只保存 LoRA 权重（极小文件）"""
        lora_state_dict = {
            name: param.cpu()
            for name, param in self.model.named_parameters()
            if param.requires_grad
        }
        torch.save(lora_state_dict, save_path)
        
        # 计算文件大小
        import os
        size_mb = os.path.getsize(save_path) / (1024 * 1024)
        print(f"LoRA 权重已保存: {save_path} ({size_mb:.2f} MB)")
    
    def load_lora_weights(self, load_path: str):
        """加载 LoRA 权重"""
        lora_state_dict = torch.load(load_path, map_location=self.device)
        
        model_state = self.model.state_dict()
        for name, param in lora_state_dict.items():
            if name in model_state:
                model_state[name].copy_(param)
            else:
                print(f"⚠️ 跳过未匹配的参数: {name}")
        
        print(f"LoRA 权重已加载: {load_path}")
```

### 6.4 完整的 LoRA 微调 Pipeline

```python
"""
完整的 LoRA 微调示例：使用 LLaMA 模型 + Alpaca 数据集
"""

from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
)
from datasets import load_dataset


def full_lora_pipeline():
    """
    完整的 LoRA 微调流程（伪代码 + 关键实现）
    """
    
    # ========== 1. 加载基座模型 ==========
    model_name = "meta-llama/Llama-2-7b-hf"
    
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="auto",  # 自动分配到可用 GPU
    )
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.pad_token = tokenizer.eos_token
    
    print(f"模型加载完成: {model_name}")
    print_trainable_parameters(model)  # 100% 可训练
    
    # ========== 2. 注入 LoRA ==========
    lora_modules = inject_lora(
        model,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",  # 注意力
            "gate_proj", "up_proj", "down_proj",       # FFN
        ],
        rank=16,
        alpha=32.0,
        dropout=0.05,
    )
    
    print(f"\nLoRA 注入完成，共 {len(lora_modules)} 个模块")
    print_trainable_parameters(model)  # ~0.3% 可训练
    
    # ========== 3. 准备数据 ==========
    dataset = load_dataset("tatsu-lab/alpaca")
    
    def format_instruction(example):
        """格式化为指令模板"""
        if example["input"]:
            text = (
                f"### Instruction:\n{example['instruction']}\n\n"
                f"### Input:\n{example['input']}\n\n"
                f"### Response:\n{example['output']}"
            )
        else:
            text = (
                f"### Instruction:\n{example['instruction']}\n\n"
                f"### Response:\n{example['output']}"
            )
        return {"text": text}
    
    dataset = dataset.map(format_instruction)
    
    def tokenize(example):
        result = tokenizer(
            example["text"],
            truncation=True,
            max_length=512,
            padding="max_length",
        )
        result["labels"] = result["input_ids"].copy()
        return result
    
    tokenized_dataset = dataset["train"].map(tokenize, batched=True)
    
    # ========== 4. 训练 ==========
    # 使用自定义 Trainer 或 HuggingFace Trainer
    training_args = TrainingArguments(
        output_dir="./lora_output",
        num_train_epochs=3,
        per_device_train_batch_size=4,
        gradient_accumulation_steps=8,
        learning_rate=2e-4,
        weight_decay=0.01,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        fp16=True,
        logging_steps=10,
        save_strategy="epoch",
        optim="adamw_torch",
    )
    
    # ... 训练过程 ...
    
    # ========== 5. 保存与合并 ==========
    # 方式 A：只保存 LoRA 权重（推荐，文件小）
    lora_state = {
        name: param.cpu()
        for name, param in model.named_parameters()
        if param.requires_grad
    }
    torch.save(lora_state, "./lora_output/lora_weights.pt")
    
    # 方式 B：合并后保存完整模型（用于部署）
    for name, lora_module in lora_modules.items():
        merged = lora_module.merge_weights()
        parent_name = ".".join(name.split(".")[:-1])
        child_name = name.split(".")[-1]
        parent = dict(model.named_modules())[parent_name]
        setattr(parent, child_name, merged)
    
    model.save_pretrained("./merged_model")
    tokenizer.save_pretrained("./merged_model")
    print("合并模型已保存")
```

---

## 7. 使用 HuggingFace PEFT 库实战

### 7.1 PEFT 库简介

HuggingFace 的 `peft` 库是 LoRA 最流行的实现，提供了开箱即用的 API：

```bash
pip install peft transformers datasets accelerate bitsandbytes
```

### 7.2 标准 LoRA 微调流程

```python
"""
使用 HuggingFace PEFT 库进行 LoRA 微调的完整示例
"""

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
)
from peft import (
    LoraConfig,
    get_peft_model,
    TaskType,
    PeftModel,
    prepare_model_for_kbit_training,
)
from datasets import load_dataset


# ============================================================
# 1. 配置 LoRA
# ============================================================

lora_config = LoraConfig(
    # 核心参数
    r=16,                          # 秩
    lora_alpha=32,                 # 缩放因子 α
    lora_dropout=0.05,             # Dropout
    
    # 目标模块
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",  # 注意力层
        "gate_proj", "up_proj", "down_proj",       # FFN 层
    ],
    
    # 任务类型
    task_type=TaskType.CAUSAL_LM,
    
    # 其他选项
    bias="none",                   # 不训练 bias（"none"/"all"/"lora_only"）
    modules_to_save=None,          # 需要全量训练的模块（如 lm_head）
    
    # 高级选项
    fan_in_fan_out=False,          # 是否转置（GPT-2 需要 True）
    init_lora_weights=True,        # 使用标准初始化
)

print("LoRA 配置:")
print(f"  Rank: {lora_config.r}")
print(f"  Alpha: {lora_config.lora_alpha}")
print(f"  Scaling: {lora_config.lora_alpha / lora_config.r}")
print(f"  Target modules: {lora_config.target_modules}")
print(f"  Dropout: {lora_config.lora_dropout}")


# ============================================================
# 2. 加载模型并注入 LoRA
# ============================================================

model_name = "meta-llama/Llama-2-7b-hf"

# 加载基座模型
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="auto",
    trust_remote_code=True,
)

tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"  # LoRA 训练推荐右填充

# 注入 LoRA
model = get_peft_model(model, lora_config)

# 打印参数统计
model.print_trainable_parameters()
# 输出: trainable params: 33,554,432 || all params: 6,771,970,048 || trainable%: 0.4955


# ============================================================
# 3. 数据准备
# ============================================================

dataset = load_dataset("tatsu-lab/alpaca", split="train")

# 指令模板
PROMPT_TEMPLATE = """Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
{instruction}

### Input:
{input}

### Response:
{output}"""

PROMPT_TEMPLATE_NO_INPUT = """Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
{instruction}

### Response:
{output}"""


def format_and_tokenize(examples):
    """格式化并 tokenize 数据"""
    texts = []
    for instruction, input_text, output in zip(
        examples["instruction"], examples["input"], examples["output"]
    ):
        if input_text.strip():
            text = PROMPT_TEMPLATE.format(
                instruction=instruction, input=input_text, output=output
            )
        else:
            text = PROMPT_TEMPLATE_NO_INPUT.format(
                instruction=instruction, output=output
            )
        texts.append(text + tokenizer.eos_token)
    
    tokenized = tokenizer(
        texts,
        truncation=True,
        max_length=512,
        padding=False,  # 动态填充更高效
    )
    tokenized["labels"] = tokenized["input_ids"].copy()
    return tokenized


# 处理数据集
tokenized_dataset = dataset.map(
    format_and_tokenize,
    batched=True,
    remove_columns=dataset.column_names,
    num_proc=4,
)

# 数据整理器（动态填充）
data_collator = DataCollatorForLanguageModeling(
    tokenizer=tokenizer,
    mlm=False,  # Causal LM，不是 MLM
)


# ============================================================
# 4. 训练配置
# ============================================================

training_args = TrainingArguments(
    output_dir="./lora_llama2_alpaca",
    
    # 训练参数
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,  # 有效 batch size = 4 * 8 = 32
    
    # 优化器
    learning_rate=2e-4,
    weight_decay=0.01,
    warmup_ratio=0.03,
    lr_scheduler_type="cosine",
    optim="adamw_torch",
    
    # 精度
    fp16=True,  # 或 bf16=True（A100/H100）
    
    # 日志与保存
    logging_steps=10,
    save_strategy="steps",
    save_steps=200,
    save_total_limit=3,
    
    # 评估
    eval_strategy="steps",
    eval_steps=200,
    
    # 其他
    gradient_checkpointing=True,  # 节省显存
    report_to="tensorboard",
    dataloader_num_workers=4,
    remove_unused_columns=False,
)


# ============================================================
# 5. 开始训练
# ============================================================

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset,
    data_collator=data_collator,
)

# 训练
trainer.train()

# 保存 LoRA 权重
model.save_pretrained("./lora_llama2_alpaca/final")
print("LoRA 权重已保存")


# ============================================================
# 6. 推理与合并
# ============================================================

def inference_with_lora():
    """使用 LoRA 模型进行推理"""
    
    # 方式 A：加载 LoRA 适配器（不合并，可切换）
    base_model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    peft_model = PeftModel.from_pretrained(
        base_model,
        "./lora_llama2_alpaca/final",
    )
    
    # 推理
    prompt = "### Instruction:\nExplain what LoRA is.\n\n### Response:\n"
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    
    with torch.no_grad():
        outputs = peft_model.generate(
            **inputs,
            max_new_tokens=256,
            temperature=0.7,
            top_p=0.9,
            do_sample=True,
        )
    
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    print(response)


def merge_and_save():
    """合并 LoRA 权重到基座模型并保存"""
    
    base_model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    peft_model = PeftModel.from_pretrained(
        base_model,
        "./lora_llama2_alpaca/final",
    )
    
    # 合并权重
    merged_model = peft_model.merge_and_unload()
    
    # 保存合并后的完整模型
    merged_model.save_pretrained("./merged_llama2_alpaca")
    tokenizer.save_pretrained("./merged_llama2_alpaca")
    
    print("合并模型已保存，可直接用于推理部署")
    print("模型大小与原始 LLaMA-2-7B 相同，推理无额外开销")
```

### 7.3 多 LoRA 适配器切换

```python
"""
多 LoRA 适配器管理：一个基座模型，多个任务适配器
"""

from peft import PeftModel, set_peft_model_active_adapter


def multi_lora_demo():
    """演示多 LoRA 适配器的加载与切换"""
    
    # 加载基座模型
    base_model = AutoModelForCausalLM.from_pretrained(
        "meta-llama/Llama-2-7b-hf",
        torch_dtype=torch.float16,
        device_map="auto",
    )
    
    # 加载第一个 LoRA 适配器（如：中文对话）
    model = PeftModel.from_pretrained(
        base_model,
        "./lora_chinese_chat",
        adapter_name="chinese_chat",
    )
    
    # 加载第二个 LoRA 适配器（如：代码生成）
    model.load_adapter(
        "./lora_code_gen",
        adapter_name="code_gen",
    )
    
    # 加载第三个 LoRA 适配器（如：数学推理）
    model.load_adapter(
        "./lora_math",
        adapter_name="math",
    )
    
    # 切换适配器
    model.set_adapter("chinese_chat")
    # ... 中文对话推理 ...
    
    model.set_adapter("code_gen")
    # ... 代码生成推理 ...
    
    model.set_adapter("math")
    # ... 数学推理 ...
    
    # 禁用所有适配器（回到基座模型）
    with model.disable_adapter():
        # 此时等同于原始 LLaMA-2-7B
        pass
    
    print("多适配器切换演示完成")
    print("显存中只有一份基座模型 + 多个极小的 LoRA 权重")
```

---

## 8. QLoRA：量化 + LoRA 的极致效率

### 8.1 QLoRA 论文信息

- **标题**：QLoRA: Efficient Finetuning of Quantized LLMs
- **作者**：Tim Dettmers, Artidoro Pagnoni, Ari Holtzman, Luke Zettlemoyer（University of Washington）
- **发表**：NeurIPS 2023
- **核心贡献**：将 4-bit 量化与 LoRA 结合，使 65B 模型可在单张 48GB GPU 上微调

### 8.2 QLoRA 的核心创新

QLoRA 引入了三个关键技术：

#### 8.2.1 4-bit NormalFloat（NF4）量化

传统量化使用均匀量化（Uniform Quantization），但神经网络权重通常服从正态分布。NF4 是一种信息论最优的 4-bit 数据类型，专为正态分布设计：

```
均匀量化（INT4）：量化点均匀分布在 [-8, 7]
NF4 量化：量化点按正态分布的分位数分布

NF4 的 16 个量化点（对称）：
[-1.0, -0.6962, -0.5251, -0.3949, -0.2844, -0.1848, -0.0911, 0.0,
  0.0796,  0.1609,  0.2461,  0.3379,  0.4407,  0.5626,  0.7230, 1.0]
```

NF4 的优势：对于正态分布的权重，NF4 比 INT4 的量化误差更小。

数学原理：
- 将标准正态分布 $\mathcal{N}(0, 1)$ 等概率地分成 $2^k$ 个区间
- 每个区间的中点作为量化值
- 对于 4-bit：$2^4 = 16$ 个量化值
- 量化前先将权重归一化到 $[-1, 1]$（除以 absmax）

#### 8.2.2 双重量化（Double Quantization）

量化需要存储量化常数（scaling factor）。对于分块量化（block size = 64），每 64 个权重需要一个 FP32 的缩放因子，这本身也占用显存。

双重量化的思路：**对量化常数本身再做一次量化**。

```
第一次量化：
  权重 FP16 → NF4（block size = 64）
  每 64 个权重产生 1 个 FP32 缩放因子

第二次量化：
  缩放因子 FP32 → FP8（block size = 256）
  每 256 个缩放因子产生 1 个 FP32 缩放因子

显存节省计算（以 7B 模型为例）：
  无双重量化：7B × 4bit + 7B/64 × 32bit = 3.5GB + 0.44GB = 3.94GB
  有双重量化：7B × 4bit + 7B/64 × 8bit + 7B/64/256 × 32bit 
             = 3.5GB + 0.11GB + 0.002GB = 3.61GB
  节省：约 0.33GB（对于 65B 模型节省约 3GB）
```

#### 8.2.3 分页优化器（Paged Optimizers）

利用 NVIDIA 统一内存（Unified Memory）特性，当 GPU 显存不足时，自动将优化器状态转移到 CPU 内存：

```
正常情况：优化器状态全部在 GPU 显存
显存不足时：
  - 不活跃的优化器状态页自动换出到 CPU
  - 需要时再换入 GPU
  - 类似操作系统的虚拟内存/页面交换
  - 对用户透明，无需手动管理
```

这使得即使优化器状态超出 GPU 显存，训练也能继续（以少量速度为代价）。

### 8.3 QLoRA 的完整数据流

```
基座模型权重（FP16，14GB for 7B）
    │
    ▼ NF4 量化
量化模型权重（NF4，~3.5GB for 7B）← 冻结，不更新
    │
    │  前向传播时：
    │  1. 反量化 NF4 → FP16（逐块，按需）
    │  2. 计算 W₀x（FP16）
    │  3. 计算 BAx（FP16，LoRA 部分）
    │  4. 输出 = W₀x + BAx
    │
    │  反向传播时：
    │  - 梯度只流过 LoRA 参数（A, B）
    │  - W₀ 的梯度不计算（冻结）
    │  - 优化器状态只维护 LoRA 参数
    │
    ▼
LoRA 参数（FP16/BF16，~16.8MB for r=16）← 可训练
```

### 8.4 QLoRA 显存分析

以 LLaMA-7B 为例：

| 组件 | 全量微调 (FP16) | LoRA (FP16) | QLoRA (NF4+LoRA) |
|------|----------------|-------------|-------------------|
| 模型权重 | 14 GB | 14 GB | 3.5 GB |
| 优化器状态 | 56 GB | 0.13 GB | 0.13 GB |
| 梯度 | 14 GB | 0.03 GB | 0.03 GB |
| 激活值 | ~8 GB | ~8 GB | ~4 GB |
| **总计** | **~92 GB** | **~22 GB** | **~7.7 GB** |
| 所需 GPU | 4×A100 80GB | 1×A100 40GB | **1×RTX 3090 24GB** |

QLoRA 使得消费级显卡也能微调 7B 模型，这是其革命性意义所在。

### 8.5 量化对精度的影响

QLoRA 论文的关键发现：

> 4-bit NF4 量化 + LoRA 微调的效果与 16-bit 全量微调几乎无差异。

实验数据（MMLU benchmark）：

| 方法 | LLaMA-7B | LLaMA-13B | LLaMA-65B |
|------|----------|-----------|-----------|
| Full FT (FP16) | 47.5 | 55.3 | 63.4 |
| LoRA (FP16) | 47.1 | 54.8 | 63.1 |
| QLoRA (NF4) | 47.0 | 54.6 | 63.3 |

差异在 0.5% 以内，几乎可以忽略。

---

## 9. QLoRA 代码实战

### 9.1 使用 bitsandbytes + PEFT 实现 QLoRA

```python
"""
QLoRA 完整实战：4-bit 量化 + LoRA 微调 LLaMA-2-7B
所需显存：约 7-10 GB（可在 RTX 3090/4090 上运行）
"""

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    TaskType,
)
from datasets import load_dataset


# ============================================================
# 1. 量化配置（NF4 + 双重量化）
# ============================================================

bnb_config = BitsAndBytesConfig(
    # 4-bit 量化
    load_in_4bit=True,
    
    # NF4 数据类型（信息论最优）
    bnb_4bit_quant_type="nf4",
    
    # 计算时使用的数据类型（反量化后）
    bnb_4bit_compute_dtype=torch.bfloat16,  # A100/H100 用 bf16
    # bnb_4bit_compute_dtype=torch.float16,  # 旧 GPU 用 fp16
    
    # 双重量化（对量化常数再量化）
    bnb_4bit_use_double_quant=True,
)

print("量化配置:")
print(f"  量化位数: 4-bit")
print(f"  量化类型: NF4")
print(f"  计算精度: BFloat16")
print(f"  双重量化: 启用")


# ============================================================
# 2. 加载量化模型
# ============================================================

model_name = "meta-llama/Llama-2-7b-hf"

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
    # attn_implementation="flash_attention_2",  # 可选：Flash Attention
)

tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"

# 查看显存占用
if torch.cuda.is_available():
    print(f"\n模型加载后 GPU 显存: "
          f"{torch.cuda.memory_allocated() / 1024**3:.2f} GB")

# 准备模型用于 k-bit 训练
# 这一步会：
# 1. 将所有非量化层的参数转为 FP32（用于稳定训练）
# 2. 启用梯度检查点（节省显存）
# 3. 启用输入梯度（用于梯度检查点）
model = prepare_model_for_kbit_training(
    model,
    use_gradient_checkpointing=True,
)


# ============================================================
# 3. LoRA 配置
# ============================================================

lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    task_type=TaskType.CAUSAL_LM,
    bias="none",
)

# 注入 LoRA
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# 输出: trainable params: 33,554,432 || all params: 3,740,434,432 || trainable%: 0.8972
# 注意：总参数量变小了（因为 4-bit 量化）


# ============================================================
# 4. 数据准备（以 Alpaca 为例）
# ============================================================

dataset = load_dataset("tatsu-lab/alpaca", split="train")

# 数据格式化
def format_example(example):
    """将 Alpaca 格式转为训练文本"""
    if example["input"].strip():
        text = (
            f"<s>[INST] {example['instruction']}\n"
            f"Input: {example['input']} [/INST] "
            f"{example['output']}</s>"
        )
    else:
        text = (
            f"<s>[INST] {example['instruction']} [/INST] "
            f"{example['output']}</s>"
        )
    return {"text": text}

dataset = dataset.map(format_example)

# Tokenize
def tokenize_function(examples):
    return tokenizer(
        examples["text"],
        truncation=True,
        max_length=512,
        padding=False,
    )

tokenized_dataset = dataset.map(
    tokenize_function,
    batched=True,
    remove_columns=dataset.column_names,
)

# 设置 labels = input_ids（Causal LM）
def set_labels(examples):
    examples["labels"] = examples["input_ids"].copy()
    return examples

tokenized_dataset = tokenized_dataset.map(set_labels, batched=True)


# ============================================================
# 5. 训练
# ============================================================

training_args = TrainingArguments(
    output_dir="./qlora_llama2_output",
    
    # 训练超参
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,  # 有效 batch = 16
    
    # 优化器（使用分页 AdamW）
    optim="paged_adamw_32bit",  # QLoRA 推荐的分页优化器
    learning_rate=2e-4,
    weight_decay=0.01,
    warmup_ratio=0.03,
    lr_scheduler_type="cosine",
    max_grad_norm=0.3,  # QLoRA 论文推荐较小的梯度裁剪
    
    # 精度
    bf16=True,  # 或 fp16=True
    
    # 显存优化
    gradient_checkpointing=True,
    
    # 日志
    logging_steps=10,
    logging_first_step=True,
    
    # 保存
    save_strategy="steps",
    save_steps=100,
    save_total_limit=3,
    
    # 其他
    report_to="tensorboard",
    dataloader_num_workers=2,
    group_by_length=True,  # 按长度分组，减少 padding
)

# 数据整理器
data_collator = DataCollatorForLanguageModeling(
    tokenizer=tokenizer,
    mlm=False,
)

# 创建 Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset,
    data_collator=data_collator,
)

# 开始训练
print("\n" + "=" * 60)
print("开始 QLoRA 训练")
print(f"  GPU 显存: {torch.cuda.memory_allocated() / 1024**3:.2f} GB (已用)")
print(f"  GPU 显存: {torch.cuda.memory_reserved() / 1024**3:.2f} GB (已预留)")
print("=" * 60 + "\n")

trainer.train()

# 保存
model.save_pretrained("./qlora_llama2_output/final")
tokenizer.save_pretrained("./qlora_llama2_output/final")


# ============================================================
# 6. 推理与部署
# ============================================================

def qlora_inference():
    """QLoRA 模型推理"""
    from peft import PeftModel, AutoPeftModelForCausalLM
    
    # 方式 A：直接加载 QLoRA 模型（保持 4-bit，显存小）
    model = AutoPeftModelForCausalLM.from_pretrained(
        "./qlora_llama2_output/final",
        device_map="auto",
        torch_dtype=torch.float16,
    )
    
    prompt = "<s>[INST] What is parameter-efficient fine-tuning? [/INST] "
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,
            temperature=0.7,
            top_p=0.9,
            repetition_penalty=1.1,
        )
    
    print(tokenizer.decode(outputs[0], skip_special_tokens=True))


def qlora_merge_to_fp16():
    """将 QLoRA 权重合并为 FP16 模型（用于高性能推理部署）"""
    
    # 加载基座模型（FP16，不量化）
    base_model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    
    # 加载 LoRA 适配器
    from peft import PeftModel
    model = PeftModel.from_pretrained(base_model, "./qlora_llama2_output/final")
    
    # 合并
    merged_model = model.merge_and_unload()
    
    # 保存 FP16 完整模型
    merged_model.save_pretrained("./merged_qlora_fp16")
    tokenizer.save_pretrained("./merged_qlora_fp16")
    
    print("QLoRA → FP16 合并完成")
    print("可用于 vLLM / TGI / TensorRT-LLM 等推理框架")
```

### 9.2 QLoRA 训练的显存监控

```python
"""
QLoRA 训练过程中的显存监控工具
"""

import torch
import psutil
import os


class MemoryMonitor:
    """训练过程中的显存/内存监控"""
    
    def __init__(self):
        self.peak_gpu_memory = 0
        self.peak_cpu_memory = 0
    
    def log_memory(self, step: int = 0, phase: str = ""):
        """记录当前显存使用"""
        if torch.cuda.is_available():
            gpu_allocated = torch.cuda.memory_allocated() / 1024**3
            gpu_reserved = torch.cuda.memory_reserved() / 1024**3
            gpu_peak = torch.cuda.max_memory_allocated() / 1024**3
            
            self.peak_gpu_memory = max(self.peak_gpu_memory, gpu_peak)
            
            print(
                f"[Step {step}] {phase} | "
                f"GPU: {gpu_allocated:.2f}GB (allocated) / "
                f"{gpu_reserved:.2f}GB (reserved) / "
                f"Peak: {gpu_peak:.2f}GB"
            )
        
        # CPU 内存
        process = psutil.Process(os.getpid())
        cpu_memory = process.memory_info().rss / 1024**3
        self.peak_cpu_memory = max(self.peak_cpu_memory, cpu_memory)
        print(f"         CPU: {cpu_memory:.2f}GB (RSS)")
    
    def summary(self):
        """打印显存使用总结"""
        print("\n" + "=" * 50)
        print("显存使用总结")
        print(f"  GPU 峰值: {self.peak_gpu_memory:.2f} GB")
        print(f"  CPU 峰值: {self.peak_cpu_memory:.2f} GB")
        print("=" * 50)


# 使用示例
monitor = MemoryMonitor()
monitor.log_memory(0, "模型加载后")
# ... 训练过程中定期调用 ...
monitor.log_memory(100, "训练中")
monitor.summary()
```

---

## 10. 其他 PEFT 方法对比

### 10.1 Adapter Tuning

```python
"""
Adapter Tuning：在 Transformer 层中插入小型瓶颈模块
"""

class AdapterLayer(nn.Module):
    """
    Adapter 结构：
    输入 → LayerNorm → 下投影(d→r) → 非线性 → 上投影(r→d) → 残差连接
    
    与 LoRA 的区别：
    - Adapter 是串联的（增加推理延迟）
    - LoRA 是并联的（可合并，零延迟）
    """
    
    def __init__(self, d_model: int, bottleneck: int = 64):
        super().__init__()
        self.down_proj = nn.Linear(d_model, bottleneck)
        self.up_proj = nn.Linear(bottleneck, d_model)
        self.norm = nn.LayerNorm(d_model)
        self.act = nn.GELU()
        
        # 初始化为近似恒等映射
        nn.init.zeros_(self.up_proj.weight)
        nn.init.zeros_(self.up_proj.bias)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        x = self.norm(x)
        x = self.down_proj(x)
        x = self.act(x)
        x = self.up_proj(x)
        return residual + x  # 残差连接
```

### 10.2 Prefix-Tuning

```python
"""
Prefix-Tuning：在注意力层的 Key/Value 前添加可学习的前缀向量
"""

class PrefixTuning(nn.Module):
    """
    Prefix-Tuning 实现：
    - 为每一层的 K 和 V 添加 prefix_length 个虚拟 token
    - 这些虚拟 token 的表示是可学习的
    - 通过 MLP 重参数化以稳定训练
    
    与 LoRA 的区别：
    - Prefix-Tuning 增加了序列长度（增加计算量）
    - 不能合并到原始权重中
    - 更适合生成任务
    """
    
    def __init__(
        self,
        n_layers: int,
        n_heads: int,
        d_model: int,
        prefix_length: int = 20,
        hidden_dim: int = 512,
    ):
        super().__init__()
        self.prefix_length = prefix_length
        self.n_layers = n_layers
        d_head = d_model // n_heads
        
        # 前缀嵌入（通过 MLP 重参数化）
        self.prefix_embedding = nn.Embedding(prefix_length, hidden_dim)
        self.prefix_mlp = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, n_layers * 2 * d_model),
            # n_layers 层 × 2（K和V）× d_model
        )
    
    def forward(self, batch_size: int):
        """生成所有层的前缀 K/V"""
        prefix_ids = torch.arange(self.prefix_length).unsqueeze(0).expand(batch_size, -1)
        prefix_emb = self.prefix_embedding(prefix_ids)  # (B, L, hidden)
        prefix_kv = self.prefix_mlp(prefix_emb)  # (B, L, n_layers*2*d)
        
        # 重塑为每层的 K 和 V
        # shape: (n_layers, 2, B, n_heads, prefix_length, d_head)
        return prefix_kv.view(
            batch_size, self.prefix_length,
            self.n_layers, 2, -1
        ).permute(2, 3, 0, 4, 1)  # 简化示意
```

### 10.3 Prompt Tuning

```python
"""
Prompt Tuning：在输入嵌入前添加可学习的软提示
"""

class PromptTuning(nn.Module):
    """
    Prompt Tuning（最简单的 PEFT 方法）：
    - 在输入序列前添加 n_tokens 个可学习的虚拟 token 嵌入
    - 只训练这些嵌入，模型完全冻结
    - 参数量极少（n_tokens × d_model）
    
    与 LoRA 的区别：
    - 参数量更少（但效果通常不如 LoRA）
    - 增加了输入序列长度
    - 在小模型上效果较差，大模型（>10B）上接近全量微调
    """
    
    def __init__(self, n_tokens: int = 20, d_model: int = 4096):
        super().__init__()
        # 可学习的软提示
        self.soft_prompt = nn.Parameter(
            torch.randn(n_tokens, d_model) * 0.01
        )
    
    def forward(self, input_embeddings: torch.Tensor) -> torch.Tensor:
        """
        将软提示拼接到输入嵌入前面
        input_embeddings: (B, seq_len, d_model)
        output: (B, n_tokens + seq_len, d_model)
        """
        batch_size = input_embeddings.shape[0]
        # 扩展到 batch 维度
        prompt = self.soft_prompt.unsqueeze(0).expand(batch_size, -1, -1)
        # 拼接
        return torch.cat([prompt, input_embeddings], dim=1)
```

### 10.4 方法对比总结

| 维度 | LoRA | Adapter | Prefix-Tuning | Prompt Tuning |
|------|------|---------|---------------|---------------|
| 参数位置 | 并联在线性层旁 | 串联在层之间 | 注意力 KV 前缀 | 输入嵌入前缀 |
| 推理延迟 | 0（可合并） | 有增加 | 有增加 | 有增加 |
| 可合并 | ✅ | ❌ | ❌ | ❌ |
| 参数量 | 0.1~1% | 0.5~3% | 0.1~1% | <0.01% |
| 小模型效果 | 好 | 好 | 一般 | 差 |
| 大模型效果 | 好 | 好 | 好 | 好 |
| 多任务切换 | 极快（加载小文件） | 快 | 快 | 极快 |
| 实现复杂度 | 低 | 中 | 高 | 低 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |

---

## 11. LoRA 变体与前沿进展

### 11.1 AdaLoRA（2023）

**核心思想**：不同层、不同矩阵的重要性不同，应该自适应地分配秩。

```python
"""
AdaLoRA：自适应秩分配
- 用 SVD 参数化代替 BA 分解：ΔW = P Λ Q
- 训练过程中动态剪枝不重要的奇异值
- 重要的层分配更高的秩，不重要的层分配更低的秩
"""

class AdaLoRALayer(nn.Module):
    """AdaLoRA 的 SVD 参数化"""
    
    def __init__(self, d: int, k: int, rank: int = 16):
        super().__init__()
        # SVD 参数化：ΔW = P @ diag(Λ) @ Q
        self.P = nn.Parameter(torch.randn(d, rank) * 0.01)  # 左奇异向量
        self.Lambda = nn.Parameter(torch.ones(rank))          # 奇异值
        self.Q = nn.Parameter(torch.randn(rank, k) * 0.01)  # 右奇异向量
        
        # 重要性分数（用于剪枝）
        self.importance_scores = nn.Parameter(
            torch.ones(rank), requires_grad=False
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # ΔW @ x = P @ diag(Λ) @ Q @ x
        out = F.linear(x, self.Q)           # (B, r)
        out = out * self.Lambda             # 逐元素乘奇异值
        out = F.linear(out, self.P)         # (B, d)
        return out
    
    def prune(self, target_rank: int):
        """剪枝到目标秩"""
        # 按重要性分数排序，保留 top-k
        _, indices = self.importance_scores.topk(target_rank)
        self.P.data = self.P.data[:, indices]
        self.Lambda.data = self.Lambda.data[indices]
        self.Q.data = self.Q.data[indices, :]
```

### 11.2 DoRA（2024）

**核心思想**：将权重分解为方向（direction）和幅度（magnitude），LoRA 只更新方向。

```python
"""
DoRA (Weight-Decomposed Low-Rank Adaptation)
- 将权重分解为：W = m * (W₀ + BA) / ||W₀ + BA||
- m 是可学习的幅度向量（per-output-channel）
- LoRA 部分 BA 只负责调整方向
- 更接近全量微调的更新模式
"""

class DoRALayer(nn.Module):
    """DoRA 实现"""
    
    def __init__(self, original_linear: nn.Linear, rank: int = 8, alpha: float = 16.0):
        super().__init__()
        d, k = original_linear.weight.shape
        
        # 冻结原始权重
        self.weight = original_linear.weight
        self.weight.requires_grad = False
        
        # LoRA 部分（方向调整）
        self.lora_A = nn.Parameter(torch.randn(rank, k) * 0.01)
        self.lora_B = nn.Parameter(torch.zeros(d, rank))
        self.scaling = alpha / rank
        
        # 幅度向量 m（可学习）
        # 初始化为原始权重每行的 L2 范数
        with torch.no_grad():
            self.magnitude = nn.Parameter(
                original_linear.weight.norm(dim=1, keepdim=True)
            )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # 计算更新后的权重方向
        delta_w = (self.lora_B @ self.lora_A) * self.scaling
        updated_weight = self.weight + delta_w
        
        # 归一化方向
        weight_norm = updated_weight.norm(dim=1, keepdim=True)
        direction = updated_weight / (weight_norm + 1e-8)
        
        # 应用幅度
        final_weight = self.magnitude * direction
        
        return F.linear(x, final_weight)
```

### 11.3 LoRA+（2024）

**核心思想**：A 和 B 矩阵应该使用不同的学习率。

```
LoRA+ 的发现：
- 矩阵 A 的最优学习率应该远大于矩阵 B
- 推荐比例：lr_A / lr_B = 16（或更大）
- 原因：A 负责"特征提取"（投影到低秩空间），B 负责"特征映射"（从低秩空间映射回）
- A 的梯度信号更弱（因为 B 初始为零），需要更大学习率补偿
```

```python
# LoRA+ 的优化器配置
def get_lora_plus_optimizer(model, lr_B=2e-4, ratio=16):
    """
    LoRA+ 优化器：A 和 B 使用不同学习率
    """
    param_groups = []
    
    for name, param in model.named_parameters():
        if not param.requires_grad:
            continue
        if "lora_A" in name:
            param_groups.append({"params": [param], "lr": lr_B * ratio})
        elif "lora_B" in name:
            param_groups.append({"params": [param], "lr": lr_B})
        else:
            param_groups.append({"params": [param], "lr": lr_B})
    
    return torch.optim.AdamW(param_groups)
```

### 11.4 rsLoRA（Rank-Stabilized LoRA, 2024）

**核心思想**：修正缩放因子，使不同秩的 LoRA 行为更一致。

```
标准 LoRA 缩放：α/r
rsLoRA 缩放：α/√r

原因：
- 当 r 增大时，BA 的输出方差会增大（因为求和项更多）
- 标准缩放 α/r 过度补偿了这个效应
- √r 缩放更符合随机矩阵理论的预测
- 实验表明 rsLoRA 在大 r 时表现更稳定
```

### 11.5 GaLore（2024）

**核心思想**：不是低秩适配器，而是低秩梯度投影——在优化器层面节省显存。

```python
"""
GaLore (Gradient Low-Rank Projection)
- 不修改模型结构
- 将梯度投影到低秩子空间后再更新优化器状态
- 优化器状态只维护低秩投影后的梯度
- 定期更新投影矩阵（通过 SVD）
- 可以实现全参数训练但显存接近 LoRA
"""

class GaLoreOptimizer:
    """GaLore 优化器（简化示意）"""
    
    def __init__(self, params, lr, rank, update_proj_gap=200):
        self.rank = rank
        self.update_proj_gap = update_proj_gap
        self.step_count = 0
        self.projectors = {}  # 每个参数的投影矩阵
        
    def step(self):
        self.step_count += 1
        
        for param in self.params:
            grad = param.grad  # (d, k)
            
            # 定期更新投影矩阵
            if self.step_count % self.update_proj_gap == 0:
                U, S, V = torch.svd_lowrank(grad, q=self.rank)
                self.projectors[param] = (U, V)
            
            U, V = self.projectors[param]
            
            # 投影梯度到低秩空间
            low_rank_grad = U.T @ grad @ V  # (r, r)
            
            # 在低秩空间中更新（Adam 状态只有 r×r 大小）
            # ... Adam 更新 ...
            
            # 投影回原始空间
            full_update = U @ low_rank_update @ V.T  # (d, k)
            param.data -= self.lr * full_update
```

---

## 12. 工程实践与最佳实践

### 12.1 LoRA 微调的完整 Checklist

```
□ 1. 选择基座模型
    - 任务语言：中文选 Qwen/ChatGLM/Baichuan，英文选 LLaMA/Mistral
    - 模型大小：根据显存选择（QLoRA 可以用更大模型）
    - 许可证：商用需注意 License

□ 2. 数据准备
    - 格式：统一为指令格式（instruction/input/output）
    - 质量：数据质量 > 数据数量（1K 高质量 > 100K 低质量）
    - 长度：统计分布，设置合理的 max_length
    - 去重：去除重复和近似重复样本

□ 3. LoRA 配置
    - rank：从 8 开始，根据效果调整
    - alpha：设为 rank 的 1~2 倍
    - target_modules：推荐所有线性层
    - dropout：数据少时 0.05~0.1

□ 4. 训练配置
    - learning_rate：2e-4（LoRA 标准）
    - batch_size：尽量大（梯度累积）
    - epochs：2~5（数据少时多轮，数据多时少轮）
    - warmup：3~5% 的步数
    - scheduler：cosine

□ 5. 显存优化
    - gradient_checkpointing：必开
    - bf16/fp16：必开
    - QLoRA：显存不够时使用
    - gradient_accumulation：增大有效 batch

□ 6. 评估与调优
    - 监控 train/eval loss 曲线
    - 过拟合：减小 r、增大 dropout、减少 epochs
    - 欠拟合：增大 r、增大 lr、增加数据

□ 7. 部署
    - 合并权重：merge_and_unload()
    - 量化推理：GPTQ/AWQ 量化合并后的模型
    - 推理框架：vLLM / TGI / TensorRT-LLM
```

### 12.2 数据质量的重要性

```python
"""
数据质量对 LoRA 效果的影响（实验数据）

实验设置：LLaMA-2-7B + LoRA (r=16)，在不同质量的数据上微调

结果：
┌─────────────────────────────────────────────────────────────┐
│ 数据集          │ 样本数  │ 质量   │ MT-Bench 分数 │
├─────────────────────────────────────────────────────────────┤
│ 随机网页文本     │ 100K   │ 低     │ 3.2          │
│ Alpaca (GPT生成) │ 52K    │ 中     │ 5.8          │
│ ShareGPT (真实)  │ 70K    │ 中高   │ 6.5          │
│ 人工精标注       │ 10K    │ 高     │ 6.8          │
│ 人工精标注       │ 1K     │ 极高   │ 6.3          │
└─────────────────────────────────────────────────────────────┘

结论：
1. 10K 高质量数据 > 100K 低质量数据
2. 数据质量的边际收益远大于数据数量
3. 1K 极高质量数据就能达到不错效果（LIMA 论文的发现）
"""
```

### 12.3 学习率与 Rank 的关系

```python
"""
学习率与 Rank 的最佳搭配（经验值）

┌──────────────────────────────────────────┐
│ Rank │ 推荐学习率    │ Alpha │ 备注      │
├──────────────────────────────────────────┤
│ 4    │ 3e-4 ~ 5e-4  │ 8     │ 小数据集  │
│ 8    │ 2e-4 ~ 3e-4  │ 16    │ 通用      │
│ 16   │ 1e-4 ~ 2e-4  │ 32    │ 通用      │
│ 32   │ 5e-5 ~ 1e-4  │ 64    │ 大数据集  │
│ 64   │ 3e-5 ~ 5e-5  │ 128   │ 大数据集  │
└──────────────────────────────────────────┘

规律：rank 越大，学习率应越小（因为参数量增加，更容易过拟合）
"""
```

### 12.4 多 GPU 训练策略

```python
"""
LoRA 多 GPU 训练方案对比
"""

# 方案 1：DeepSpeed ZeRO（推荐）
# 适用于：模型放不下单卡，或想加速训练
deepspeed_config = {
    "zero_optimization": {
        "stage": 2,  # ZeRO-2 对 LoRA 足够
        "offload_optimizer": {
            "device": "cpu",  # 优化器状态放 CPU
        },
    },
    "bf16": {"enabled": True},
    "gradient_accumulation_steps": 4,
}

# 方案 2：FSDP（PyTorch 原生）
# 适用于：不想依赖 DeepSpeed
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP

# 方案 3：简单 DDP（数据并行）
# 适用于：模型能放下单卡，只想加速
from torch.nn.parallel import DistributedDataParallel as DDP

"""
选择建议：
- 单卡放得下 → DDP（最简单）
- 单卡放不下 → DeepSpeed ZeRO-2/3
- QLoRA + 多卡 → DeepSpeed ZeRO-3 + offload
"""
```

### 12.5 LoRA 权重的版本管理

```python
"""
LoRA 权重管理最佳实践
"""

import json
import hashlib
from pathlib import Path
from datetime import datetime


class LoRARegistry:
    """LoRA 适配器注册表"""
    
    def __init__(self, registry_path: str = "./lora_registry"):
        self.registry_path = Path(registry_path)
        self.registry_path.mkdir(parents=True, exist_ok=True)
        self.metadata_file = self.registry_path / "registry.json"
        self.metadata = self._load_metadata()
    
    def _load_metadata(self):
        if self.metadata_file.exists():
            return json.loads(self.metadata_file.read_text())
        return {"adapters": {}}
    
    def register(
        self,
        name: str,
        base_model: str,
        adapter_path: str,
        config: dict,
        metrics: dict = None,
        description: str = "",
    ):
        """注册一个 LoRA 适配器"""
        entry = {
            "name": name,
            "base_model": base_model,
            "adapter_path": adapter_path,
            "config": config,
            "metrics": metrics or {},
            "description": description,
            "created_at": datetime.now().isoformat(),
            "checksum": self._compute_checksum(adapter_path),
        }
        self.metadata["adapters"][name] = entry
        self._save_metadata()
        print(f"已注册 LoRA 适配器: {name}")
    
    def _compute_checksum(self, path: str) -> str:
        """计算权重文件的校验和"""
        h = hashlib.sha256()
        for f in sorted(Path(path).glob("*.bin")) + sorted(Path(path).glob("*.safetensors")):
            h.update(f.read_bytes())
        return h.hexdigest()[:16]
    
    def _save_metadata(self):
        self.metadata_file.write_text(
            json.dumps(self.metadata, indent=2, ensure_ascii=False)
        )
    
    def list_adapters(self):
        """列出所有注册的适配器"""
        for name, info in self.metadata["adapters"].items():
            print(f"  {name}: {info['description']} "
                  f"(base: {info['base_model']}, "
                  f"rank: {info['config'].get('r', '?')})")


# 使用示例
registry = LoRARegistry()
registry.register(
    name="chinese_chat_v1",
    base_model="Qwen/Qwen2-7B",
    adapter_path="./adapters/chinese_chat_v1",
    config={"r": 16, "alpha": 32, "target_modules": "all_linear"},
    metrics={"mt_bench": 7.2, "ceval": 68.5},
    description="中文对话能力增强",
)
```

---

## 13. 性能分析与消融实验

### 13.1 Rank 对效果的影响

```
实验：LLaMA-2-7B + LoRA，在 Alpaca 数据集上微调
评估：MT-Bench（GPT-4 评分，满分 10）

┌────────────────────────────────────────────────────────┐
│ Rank │ 参数量    │ 显存   │ MT-Bench │ 训练时间  │
├────────────────────────────────────────────────────────┤
│ 2    │ 4.2M     │ 15.1GB │ 5.4      │ 2.1h     │
│ 4    │ 8.4M     │ 15.3GB │ 5.9      │ 2.2h     │
│ 8    │ 16.8M    │ 15.6GB │ 6.3      │ 2.3h     │
│ 16   │ 33.6M    │ 16.2GB │ 6.5      │ 2.5h     │
│ 32   │ 67.1M    │ 17.4GB │ 6.6      │ 2.8h     │
│ 64   │ 134.2M   │ 19.8GB │ 6.6      │ 3.4h     │
│ 128  │ 268.4M   │ 24.6GB │ 6.5      │ 4.2h     │
│ Full │ 6,738M   │ 84GB   │ 6.7      │ 12h      │
└────────────────────────────────────────────────────────┘

结论：
1. r=8~16 是性价比最高的区间
2. r>32 后收益递减明显
3. r=128 甚至出现轻微下降（过拟合）
4. LoRA (r=16) 达到全量微调 97% 的效果，但只用 0.5% 的参数
```

### 13.2 目标模块的影响

```
实验：LLaMA-2-7B + LoRA (r=16)，不同目标模块组合

┌──────────────────────────────────────────────────────────────┐
│ 目标模块                          │ 参数量  │ MT-Bench │
├──────────────────────────────────────────────────────────────┤
│ q_proj only                       │ 4.2M   │ 5.6      │
│ q_proj + v_proj                   │ 8.4M   │ 6.1      │
│ q_proj + k_proj + v_proj + o_proj │ 16.8M  │ 6.4      │
│ 上述 + gate + up + down (all)     │ 33.6M  │ 6.5      │
│ all + embed + lm_head             │ 42.0M  │ 6.5      │
└──────────────────────────────────────────────────────────────┘

结论：
1. 只用 q_proj + v_proj 就能获得不错效果（原论文推荐）
2. 加上所有注意力矩阵有明显提升
3. 加上 FFN 层有少量提升
4. embed 和 lm_head 贡献很小
5. 推荐：所有注意力 + FFN（现代最佳实践）
```

### 13.3 QLoRA vs LoRA vs Full FT

```
实验：不同方法在多个 benchmark 上的对比

┌─────────────────────────────────────────────────────────────────────┐
│ 方法          │ 显存    │ MMLU  │ GSM8K │ HumanEval │ MT-Bench │
├─────────────────────────────────────────────────────────────────────┤
│ Full FT (FP16)│ 84 GB  │ 47.5  │ 28.3  │ 18.9      │ 6.7      │
│ LoRA (FP16)   │ 22 GB  │ 47.1  │ 27.8  │ 18.3      │ 6.5      │
│ QLoRA (NF4)   │ 7.7 GB │ 47.0  │ 27.5  │ 18.1      │ 6.4      │
│ QLoRA (FP4)   │ 7.7 GB │ 46.3  │ 26.9  │ 17.5      │ 6.2      │
│ QLoRA (INT4)  │ 7.7 GB │ 45.8  │ 26.2  │ 17.0      │ 6.0      │
└─────────────────────────────────────────────────────────────────────┘

结论：
1. QLoRA (NF4) 与 Full FT 差距 < 1%，但显存节省 10x+
2. NF4 明显优于 FP4 和 INT4（信息论最优量化的优势）
3. LoRA 与 Full FT 差距极小
4. 性价比排序：QLoRA (NF4) > LoRA > Full FT
```

### 13.4 训练数据量的影响

```
实验：LLaMA-2-7B + QLoRA (r=16)，不同数据量

┌────────────────────────────────────────────────────┐
│ 数据量   │ Epochs │ MT-Bench │ 过拟合风险 │
├────────────────────────────────────────────────────┤
│ 500      │ 5      │ 5.2      │ 高         │
│ 1,000    │ 5      │ 5.8      │ 中高       │
│ 5,000    │ 3      │ 6.2      │ 中         │
│ 10,000   │ 3      │ 6.4      │ 低         │
│ 50,000   │ 2      │ 6.5      │ 很低       │
│ 100,000  │ 1      │ 6.5      │ 极低       │
└────────────────────────────────────────────────────┘

结论：
1. 5K~10K 高质量数据是性价比拐点
2. 数据量 < 1K 时需要更强的正则化（大 dropout、小 r）
3. 数据量 > 50K 时 1 epoch 就够
4. 数据质量比数量重要得多
```

---

## 14. 常见面试题与答案

### 面试题 1：LoRA 的核心原理是什么？为什么有效？

**答案要点**：

LoRA 的核心原理是将预训练权重的更新约束为低秩分解：$\Delta W = BA$，其中 $B \in \mathbb{R}^{d \times r}$，$A \in \mathbb{R}^{r \times k}$，$r \ll \min(d, k)$。

有效性的理论基础：预训练模型适配下游任务时，所需的参数更新存在于一个低维子空间中（intrinsic low rank）。实验表明，$\Delta W$ 的奇异值衰减很快，前 8~16 个奇异值就能捕获 90%+ 的信息。

关键设计：B 初始化为零保证训练起点等同预训练模型；缩放因子 $\alpha/r$ 使不同 rank 下学习率行为一致；推理时可合并回原始权重实现零额外开销。

---

### 面试题 2：LoRA 与 Adapter 的区别？各自优缺点？

**答案要点**：

结构差异：LoRA 是并联结构（旁路），Adapter 是串联结构（插入层之间）。

LoRA 优势：推理时可合并到原始权重，零额外延迟；Adapter 无法合并，推理时有额外计算。

Adapter 优势：结构更灵活（可加非线性激活），在某些任务上表达能力更强。

实际选择：绝大多数场景选 LoRA（推理无开销是决定性优势）。

---

### 面试题 3：QLoRA 的三个核心创新是什么？

**答案要点**：

1. **NF4 量化**：信息论最优的 4-bit 数据类型，量化点按正态分布分位数分布，比 INT4/FP4 量化误差更小。

2. **双重量化**：对量化缩放因子本身再做一次量化（FP32→FP8），进一步节省约 0.4GB/7B 参数。

3. **分页优化器**：利用 NVIDIA 统一内存，当 GPU 显存不足时自动将优化器状态换出到 CPU，对用户透明。

这三个技术结合使得 65B 模型可在单张 48GB GPU 上微调。

---

### 面试题 4：LoRA 的 rank 如何选择？

**答案要点**：

经验法则：从 r=8 开始。数据量小（<10K）用 r=4~8；数据量大（>100K）用 r=16~32；任务复杂度高增大 r。

判断依据：如果 r=8 和 r=64 效果差不多，说明任务低秩性强，用小 r 即可。如果增大 r 持续有提升，说明任务需要更高秩。

注意：r 过大可能过拟合（尤其数据少时），此时应配合 dropout 和 weight decay。

性价比最优区间通常是 r=8~16，能达到全量微调 95%+ 的效果。

---

### 面试题 5：LoRA 为什么 B 初始化为零、A 随机初始化？

**答案要点**：

目的：保证训练起点 $\Delta W = BA = 0$，模型行为与预训练完全一致。

为什么不都初始化为零：如果 A 也为零，则 B 的梯度 $\frac{\partial L}{\partial B} = \frac{\partial L}{\partial h}(Ax)^T = 0$，训练无法启动（对称性问题）。

为什么 B 为零而非 A 为零：两种方式数学上等价（都能保证 $\Delta W = 0$）。选择 B=0 是因为：A 随机初始化后，B 的梯度立即非零，B 先开始更新；B 更新后 A 的梯度也变非零，两者交替更新。这种"先 B 后 A"的启动顺序在实践中更稳定。

---

### 面试题 6：LoRA 权重合并的数学原理？合并后有什么优势？

**答案要点**：

数学原理：$W_{merged} = W_0 + \frac{\alpha}{r} \cdot BA$。由于 $W_0$、$B$、$A$ 都是确定的矩阵，合并后得到一个与 $W_0$ 同形状的矩阵。

优势：
1. 推理零额外开销（与原始模型完全相同的计算图）
2. 无需修改推理代码
3. 可直接用于任何推理优化框架（vLLM、TensorRT 等）
4. 多任务场景：共享基座 + 按需加载不同 LoRA 权重

---

### 面试题 7：如何判断 LoRA 微调是否过拟合？如何缓解？

**答案要点**：

判断方法：
1. train loss 持续下降但 eval loss 上升
2. 训练集上效果好但测试集差
3. 生成内容过度拟合训练数据的模式

缓解方法：
1. 减小 rank（更强的低秩约束 = 更强的正则化）
2. 增大 dropout（0.05~0.2）
3. 增大 weight decay
4. 减少训练 epochs
5. 增加训练数据（数据增强）
6. 使用 early stopping

---

### 面试题 8：LoRA 能否用于预训练？为什么通常只用于微调？

**答案要点**：

理论上可以（GaLore 就是类似思路），但效果不如全量训练。

原因：预训练阶段模型需要学习大量通用知识，参数更新的"内在维度"很高，低秩约束会严重限制学习能力。微调阶段只需要在已有知识基础上做小幅调整，更新确实是低秩的。

类比：预训练像从零建一栋楼（需要所有材料），微调像装修（只需少量改动）。LoRA 适合"装修"而非"建楼"。

例外：GaLore 通过动态更新投影方向，在预训练中也能用低秩方法，但本质上是在不同时间步用不同的低秩子空间，累积起来仍然是高秩更新。

---

### 面试题 9：多个 LoRA 适配器能否同时使用（组合）？

**答案要点**：

可以，有几种方式：

1. **权重相加**：$W = W_0 + \Delta W_1 + \Delta W_2$。简单但可能冲突。

2. **LoRA 融合（LoRAHub）**：学习一组系数 $w_i$，$\Delta W = \sum_i w_i \cdot B_i A_i$。

3. **切换式**：根据输入动态选择使用哪个 LoRA（类似 MoE）。

4. **堆叠式**：先加载 LoRA1 合并，再在此基础上训练 LoRA2。

实践中最常用的是方式 1（简单有效）和方式 3（更灵活）。

---

### 面试题 10：LoRA 与全量微调在哪些场景下差距较大？

**答案要点**：

差距较大的场景：
1. 领域差异极大（如：英文模型适配阿拉伯语）
2. 任务需要学习全新的知识（而非调整已有能力）
3. 训练数据量极大（>1M 样本），LoRA 的低秩约束成为瓶颈
4. 需要修改模型的基础能力（如：改变生成风格的底层模式）

差距较小的场景：
1. 领域相近的适配（如：通用对话→客服对话）
2. 格式/风格调整（如：学习特定输出格式）
3. 知识注入量适中
4. 数据量 < 100K

---

## 15. 易错点与踩坑指南

### 15.1 常见错误与解决方案

```python
"""
LoRA/QLoRA 常见踩坑与解决方案
"""

# ============================================================
# 坑 1：忘记冻结基座模型参数
# ============================================================

# ❌ 错误：注入 LoRA 后没有冻结原始参数
model = get_peft_model(model, lora_config)
# 如果手动实现，必须确保：
for name, param in model.named_parameters():
    if "lora_" not in name:
        param.requires_grad = False  # ← 必须冻结！

# ✅ 正确：使用 peft 库会自动处理，但手动实现时要注意


# ============================================================
# 坑 2：QLoRA 训练时 compute_dtype 不匹配
# ============================================================

# ❌ 错误：compute_dtype 与训练精度不一致
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float32,  # 用了 FP32
)
# 但 training_args 设置了 fp16=True → 精度冲突

# ✅ 正确：保持一致
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.bfloat16,  # 与训练精度一致
)
# training_args: bf16=True


# ============================================================
# 坑 3：padding_side 设置错误
# ============================================================

# ❌ 错误：Causal LM 使用左填充训练
tokenizer.padding_side = "left"  # 左填充会导致 label 对齐问题

# ✅ 正确：训练时用右填充
tokenizer.padding_side = "right"
# 注意：推理（generate）时通常需要左填充，需要切换


# ============================================================
# 坑 4：合并权重时精度丢失
# ============================================================

# ❌ 错误：在 4-bit 量化状态下直接合并
model = AutoPeftModelForCausalLM.from_pretrained(
    adapter_path,
    load_in_4bit=True,  # 4-bit 加载
)
merged = model.merge_and_unload()  # 合并到 4-bit 权重上 → 精度损失

# ✅ 正确：先加载 FP16 基座，再加载 LoRA，再合并
base_model = AutoModelForCausalLM.from_pretrained(
    base_model_path,
    torch_dtype=torch.float16,  # FP16 加载
    device_map="auto",
)
model = PeftModel.from_pretrained(base_model, adapter_path)
merged = model.merge_and_unload()  # 合并到 FP16 权重上 → 无精度损失


# ============================================================
# 坑 5：gradient_checkpointing 与 LoRA 的兼容性
# ============================================================

# ❌ 错误：开启 gradient_checkpointing 但没有启用输入梯度
model.gradient_checkpointing_enable()
# 可能报错：RuntimeError: element 0 of tensors does not require grad

# ✅ 正确：使用 prepare_model_for_kbit_training 或手动启用
model = prepare_model_for_kbit_training(model)  # 自动处理
# 或手动：
model.gradient_checkpointing_enable()
model.enable_input_require_grads()  # ← 关键！


# ============================================================
# 坑 6：多 GPU 训练时 device_map 冲突
# ============================================================

# ❌ 错误：device_map="auto" + DDP
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    device_map="auto",  # 模型分布在多卡
)
# 然后用 DDP 包装 → 冲突！

# ✅ 正确：DDP 时每张卡加载完整模型
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    device_map={"": local_rank},  # 每卡一份
)


# ============================================================
# 坑 7：LoRA dropout 在推理时未关闭
# ============================================================

# ❌ 错误：推理时忘记切换到 eval 模式
output = model.generate(**inputs)  # dropout 仍然激活！

# ✅ 正确：推理前切换到 eval
model.eval()
with torch.no_grad():
    output = model.generate(**inputs)


# ============================================================
# 坑 8：target_modules 名称不匹配
# ============================================================

# ❌ 错误：模块名称写错（不同模型命名不同）
lora_config = LoraConfig(
    target_modules=["query", "value"],  # GPT-2 的命名
    # 但实际模型是 LLaMA，应该用 "q_proj", "v_proj"
)

# ✅ 正确：先检查模型的模块命名
for name, module in model.named_modules():
    if isinstance(module, nn.Linear):
        print(name)  # 查看实际命名

# 常见模型的命名：
# LLaMA/Mistral: q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj
# GPT-2: c_attn, c_proj, c_fc
# BLOOM: query_key_value, dense, dense_h_to_4h, dense_4h_to_h
# Qwen: c_attn, c_proj, w1, w2


# ============================================================
# 坑 9：保存/加载时路径混淆
# ============================================================

# ❌ 错误：把 LoRA 权重当完整模型加载
model = AutoModelForCausalLM.from_pretrained("./lora_weights/")
# 报错：权重不匹配

# ✅ 正确：LoRA 权重需要配合基座模型加载
base_model = AutoModelForCausalLM.from_pretrained(base_model_path)
model = PeftModel.from_pretrained(base_model, "./lora_weights/")


# ============================================================
# 坑 10：训练时 loss 为 NaN
# ============================================================

# 常见原因与解决：
# 1. 学习率过大 → 减小到 1e-4 或更小
# 2. alpha/r 比值过大 → 减小 alpha
# 3. 数据中有异常值 → 检查数据
# 4. FP16 溢出 → 改用 BF16 或降低学习率
# 5. 梯度爆炸 → 减小 max_grad_norm（如 0.3）
```

### 15.2 性能调优技巧

```python
"""
LoRA 训练性能调优技巧
"""

# 技巧 1：使用 Flash Attention 2 加速
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    attn_implementation="flash_attention_2",  # 2x 加速
    torch_dtype=torch.bfloat16,
)

# 技巧 2：使用 group_by_length 减少 padding
training_args = TrainingArguments(
    group_by_length=True,  # 相似长度的样本分到同一 batch
    # 减少无效 padding 计算，加速 10~30%
)

# 技巧 3：使用 packing（多样本拼接）
# 将多个短样本拼接成一个长序列，充分利用 max_length
# 需要特殊的 data collator

# 技巧 4：NEFTune（训练时给嵌入加噪声）
from peft import LoraConfig
lora_config = LoraConfig(
    # ... 其他配置 ...
)
# 在 TrainingArguments 中：
training_args = TrainingArguments(
    neftune_noise_alpha=5,  # NEFTune 噪声强度
    # 通常能提升 1~2 分（MT-Bench）
)

# 技巧 5：使用 unsloth 加速（2x 速度，50% 显存）
# pip install unsloth
from unsloth import FastLanguageModel
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=model_name,
    max_seq_length=2048,
    load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                   "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
)
```

---

## 16. 总结与展望

### 16.1 核心要点回顾

1. **LoRA 的本质**：利用权重更新的低秩性质，用 $BA$（$r \ll d$）近似 $\Delta W$，实现参数高效微调。

2. **关键优势**：
   - 训练参数量减少 100x+
   - 显存需求大幅降低
   - 推理时可合并，零额外开销
   - 多任务共享基座，切换成本极低

3. **QLoRA 的突破**：NF4 量化 + 双重量化 + 分页优化器，使消费级 GPU 也能微调大模型。

4. **实践建议**：
   - 默认配置：r=16, alpha=32, 所有线性层, lr=2e-4
   - 显存不够：用 QLoRA
   - 数据少：减小 r，增大 dropout
   - 追求极致效果：增大 r，加上 FFN 层

### 16.2 LoRA 的局限性

1. **表达能力有限**：低秩约束限制了能学到的更新复杂度，对于需要大幅改变模型行为的场景不够。

2. **不适合预训练**：预训练需要高秩更新，LoRA 的低秩假设不成立。

3. **超参数敏感**：rank、alpha、target_modules 的选择对效果有显著影响，需要实验调优。

4. **理论理解不足**：为什么某些层更适合 LoRA、最优 rank 如何确定，缺乏严格理论指导。

### 16.3 未来方向

1. **自适应方法**：AdaLoRA、AutoLoRA 等自动确定每层最优 rank。

2. **与量化的深度融合**：更低位宽（2-bit、1.58-bit）+ LoRA。

3. **LoRA for 更多场景**：扩散模型（Stable Diffusion LoRA 已广泛使用）、多模态模型、强化学习。

4. **理论突破**：更好地理解低秩结构的来源，指导超参数选择。

5. **硬件协同设计**：针对 LoRA 训练/推理的专用硬件加速。

---

## 参考文献

1. Hu, E., et al. (2021). "LoRA: Low-Rank Adaptation of Large Language Models." ICLR 2022.
2. Dettmers, T., et al. (2023). "QLoRA: Efficient Finetuning of Quantized LLMs." NeurIPS 2023.
3. Zhang, Q., et al. (2023). "AdaLoRA: Adaptive Budget Allocation for Parameter-Efficient Fine-Tuning." ICLR 2023.
4. Liu, S., et al. (2024). "DoRA: Weight-Decomposed Low-Rank Adaptation." ICML 2024.
5. Hayou, S., et al. (2024). "LoRA+: Efficient Low Rank Adaptation of Large Models."
6. Kalajdzievski, D. (2024). "A Rank Stabilization Scaling Factor for Fine-Tuning with LoRA." (rsLoRA)
7. Zhao, J., et al. (2024). "GaLore: Memory-Efficient LLM Training by Gradient Low-Rank Projection."
8. Aghajanyan, A., et al. (2020). "Intrinsic Dimensionality Explains the Effectiveness of Language Model Fine-Tuning." ACL 2021.
9. Houlsby, N., et al. (2019). "Parameter-Efficient Transfer Learning for NLP." ICML 2019.
10. Li, X. L., & Liang, P. (2021). "Prefix-Tuning: Optimizing Continuous Prompts for Generation." ACL 2021.

---

> 本文共覆盖：LoRA/QLoRA 原理、数学推导、从零实现、PEFT 库实战、变体对比、工程最佳实践、性能分析、面试题、易错点。适合作为参数高效微调的系统性学习资料。