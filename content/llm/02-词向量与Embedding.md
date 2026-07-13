# 词向量与 Embedding（Word Vectors & Embeddings）

> 大模型系列第二篇：从离散符号到连续向量空间，深入理解词向量的数学原理、经典模型（Word2Vec / GloVe / FastText）与现代上下文相关 Embedding，掌握 NLP 的基石。
> 代码语言：Python / PyTorch

---

## 目录

1. [概述与核心直觉](#1-概述与核心直觉)
2. [词的离散表示：One-Hot 编码](#2-词的离散表示one-hot-编码)
3. [分布式假说与语义空间](#3-分布式假说与语义空间)
4. [共现矩阵与 SVD 方法](#4-共现矩阵与-svd-方法)
5. [Word2Vec 详解](#5-word2vec-详解)
6. [负采样与层次 Softmax](#6-负采样与层次-softmax)
7. [GloVe：全局向量表示](#7-glove全局向量表示)
8. [FastText：子词级 Embedding](#8-fasttext子词级-embedding)
9. [Embedding 层的数学本质](#9-embedding-层的数学本质)
10. [Word2Vec 从零实现（PyTorch）](#10-word2vec-从零实现pytorch)
11. [预训练词向量的加载与使用](#11-预训练词向量的加载与使用)
12. [上下文相关 Embedding（ELMo → BERT）](#12-上下文相关-embeddingelmo--bert)
13. [Embedding 的可视化与评估](#13-embedding-的可视化与评估)
14. [工程实践与调优经验](#14-工程实践与调优经验)
15. [常见面试题与解答](#15-常见面试题与解答)
16. [易错点与最佳实践](#16-易错点与最佳实践)
17. [横向对比与知识网络](#17-横向对比与知识网络)
18. [参考文献](#18-参考文献)

---

## 1. 概述与核心直觉

### 1.1 为什么需要词向量

自然语言处理（Natural Language Processing, NLP）的第一个基本问题是：**如何让计算机理解词语**？计算机只能处理数字，无法直接理解"猫"、"狗"这样的符号。我们需要一种方法将离散的文字符号映射到连续的数值空间——这就是词向量（Word Vector / Word Embedding）要解决的核心问题。

一个好的词向量应当满足以下性质：

**语义相近的词距离近**：vec("猫") 与 vec("狗") 的距离应小于 vec("猫") 与 vec("经济") 的距离。

**语义关系可类比**：vec("国王") - vec("男人") + vec("女人") ≈ vec("女王")，即向量运算能捕获语义关系。

**维度有限且稠密**：典型维度为 50~1024 维，远小于词表大小（通常 3 万~10 万），每个维度都承载信息。

**支持代数运算**：向量加减法具有语义含义，可用于类比推理、语义组合等任务。

### 1.2 发展时间线

| 年份 | 里程碑 | 核心思想 |
|------|--------|----------|
| 1954 | Harris 分布式假说 | 词的含义由其上下文决定 |
| 1986 | Rumelhart 分布式表示 | 用连续向量表示离散符号 |
| 2000 | Bengio NNLM | 神经网络语言模型学习词向量 |
| 2013 | Mikolov Word2Vec | Skip-Gram / CBOW 高效训练 |
| 2014 | Pennington GloVe | 结合全局统计与局部窗口 |
| 2016 | Bojanowski FastText | 子词级 n-gram 表示 |
| 2018 | Peters ELMo | 上下文相关词向量（双向 LSTM） |
| 2018 | Devlin BERT | Transformer 上下文 Embedding |
| 2020+ | GPT-3/4 等 | 超大规模语言模型的 Embedding |

### 1.3 核心直觉：从离散到连续

将词从「独热编码的稀疏高维空间」映射到「稠密低维向量空间」的过程，本质上是一种**有损压缩**——我们用有限维度捕获词的核心语义属性。这些维度没有预设的含义，而是通过训练数据中的统计模式自动学习得到。

```
传统表示（50000维稀疏）：
  "猫" → [0, 0, 1, 0, ..., 0]
  "狗" → [0, 1, 0, 0, ..., 0]
  任意两个不同词的余弦相似度 = 0

词向量表示（300维稠密）：
  "猫" → [0.21, -0.53, 0.82, ..., 0.15]
  "狗" → [0.19, -0.48, 0.79, ..., 0.18]
  余弦相似度("猫","狗") ≈ 0.92（语义相近！）
```

### 1.4 Embedding 这个词的含义

Embedding 一词来自数学中的"嵌入"（Embedding）概念：将一个数学结构映射到另一个结构中，同时保持某种性质不变。在 NLP 中，Word Embedding 是将离散的词符号"嵌入"到连续的欧氏空间 ℝᵈ 中，使得词之间的语义关系在向量空间中得到保持。

在深度学习框架中，`nn.Embedding` 本质上就是一个可学习的查找表（Lookup Table），输入词的索引 i，输出对应的 d 维向量——这等价于用 One-Hot 向量乘以权重矩阵 W ∈ ℝ^{|V|×d}：

```
embedding(i) = W[i] = one_hot(i) · W
```

---

## 2. 词的离散表示：One-Hot 编码

### 2.1 定义与形式化

给定词表 V = {w₁, w₂, ..., wₙ}，其中 N = |V| 为词表大小。词 wᵢ 的 One-Hot 编码定义为一个 N 维向量 e_i ∈ {0,1}^N：

```
e_i[j] = 1  如果 j = i
e_i[j] = 0  如果 j ≠ i
```

即 e_i 是标准基向量。整个词表的 One-Hot 编码构成 N 维空间的标准正交基。

### 2.2 Python 实现

```python
import numpy as np
from typing import Dict, List, Optional

class OneHotEncoder:
    """One-Hot 词编码器"""
    
    def __init__(self, vocabulary: List[str]):
        assert len(vocabulary) == len(set(vocabulary)), "词表中有重复词"
        self.word2idx: Dict[str, int] = {w: i for i, w in enumerate(vocabulary)}
        self.idx2word: Dict[int, str] = {i: w for i, w in enumerate(vocabulary)}
        self.vocab_size: int = len(vocabulary)
    
    def encode(self, word: str) -> np.ndarray:
        """将单词编码为 One-Hot 向量"""
        if word not in self.word2idx:
            raise ValueError(f"Word '{word}' not in vocabulary (OOV)")
        vec = np.zeros(self.vocab_size, dtype=np.float32)
        vec[self.word2idx[word]] = 1.0
        return vec
    
    def similarity(self, word1: str, word2: str) -> float:
        """计算两个词的余弦相似度"""
        v1, v2 = self.encode(word1), self.encode(word2)
        dot = np.dot(v1, v2)
        norm = np.linalg.norm(v1) * np.linalg.norm(v2)
        return float(dot / (norm + 1e-8))


# 演示
vocab = ["the", "cat", "sat", "on", "mat", "dog", "ran"]
encoder = OneHotEncoder(vocab)
print(f"sim(cat, dog) = {encoder.similarity('cat', 'dog'):.4f}")  # 0.0000
print(f"sim(cat, cat) = {encoder.similarity('cat', 'cat'):.4f}")  # 1.0000
# "cat"与"dog"语义相近，但 One-Hot 完全无法体现
```

### 2.3 One-Hot 的致命缺陷

**维度灾难**：词表 N 通常为 3~10 万，向量极度稀疏，存储与计算代价高。第一层参数量 = N × hidden_size。

**语义鸿沟**：任意两个不同词内积为 0（正交），无法表达语义相似度。

**无泛化能力**：从"猫坐在垫子上"学到的知识无法迁移到"狗坐在垫子上"。

**OOV 问题**：词表外的新词无法表示，词表定义后不可扩展。

---

## 3. 分布式假说与语义空间

### 3.1 分布式假说（Distributional Hypothesis）

> "You shall know a word by the company it keeps." — J.R. Firth, 1957

核心思想：**一个词的语义由其上下文决定**。如果两个词经常出现在相似的上下文中，它们的语义就相似。

形式化：对词 w，定义其上下文分布 P(c|w)。两词语义相似度 ∝ 上下文分布相似度：

```
sem_sim(w₁, w₂) ∝ similarity(P(c|w₁), P(c|w₂))
```

### 3.2 两条技术路线

**路线一：基于计数（Count-based）** — 构建共现矩阵 → 矩阵分解 → 词向量。代表：LSA、PPMI+SVD、GloVe。

**路线二：基于预测（Prediction-based）** — 训练神经网络预测上下文/目标词，模型参数即词向量。代表：Word2Vec、FastText。

**统一观点（Levy & Goldberg, 2014）**：Word2Vec Skip-Gram + 负采样等价于对 PMI 矩阵的隐式分解。两条路线数学本质统一。

### 3.3 PMI 的数学定义

逐点互信息（Pointwise Mutual Information）：

```
PMI(w, c) = log₂ [ P(w, c) / (P(w) · P(c)) ]
PPMI(w, c) = max(0, PMI(w, c))
```

PMI > 0 表示正相关（共现超出预期），PMI < 0 表示负相关。PPMI 滤掉负值噪声。

```python
import numpy as np
from collections import defaultdict
from typing import List, Dict, Tuple

def build_cooccurrence(corpus: List[List[str]], window: int = 2):
    """构建共现矩阵与 PPMI 矩阵"""
    vocab = sorted(set(w for sent in corpus for w in sent))
    word2idx = {w: i for i, w in enumerate(vocab)}
    V = len(vocab)
    
    matrix = np.zeros((V, V), dtype=np.float64)
    for sentence in corpus:
        for i, w in enumerate(sentence):
            for j in range(max(0, i-window), min(len(sentence), i+window+1)):
                if i != j:
                    matrix[word2idx[w]][word2idx[sentence[j]]] += 1.0
    
    # PPMI
    total = matrix.sum()
    p_wc = matrix / total
    p_w = matrix.sum(axis=1) / total
    p_c = matrix.sum(axis=0) / total
    expected = np.outer(p_w, p_c)
    with np.errstate(divide='ignore', invalid='ignore'):
        pmi = np.log2(p_wc / (expected + 1e-18))
    ppmi = np.maximum(0, np.nan_to_num(pmi, nan=0.0))
    
    return matrix, ppmi, word2idx, vocab
```

---

## 4. 共现矩阵与 SVD 方法

### 4.1 方法流程

```
语料 → 共现矩阵 X ∈ ℝ^{|V|×|V|} → PPMI 变换 → 截断 SVD → 词向量 ∈ ℝ^{|V|×d}
```

### 4.2 SVD 数学原理

对矩阵 M ∈ ℝ^{m×n}，奇异值分解：M = U · Σ · Vᵀ

截断 SVD 只保留最大的 d 个奇异值：M ≈ U_d · Σ_d · V_d^T

词向量取法：W = U_d · Σ_d^α，其中 α 通常取 0.5（几何平均）或 1。

**Eckart-Young 定理**：截断 SVD 是 Frobenius 范数下的最优低秩逼近。直觉：大奇异值方向 = 语义主成分，小奇异值 = 噪声。

### 4.3 完整实现

```python
import numpy as np
from scipy.sparse.linalg import svds
from scipy.spatial.distance import cosine

class SVDWordVectors:
    """基于 PPMI + SVD 的词向量模型"""
    
    def __init__(self, embedding_dim: int = 50, window: int = 5, alpha: float = 0.5):
        self.dim = embedding_dim
        self.window = window
        self.alpha = alpha  # 奇异值的幂次
        self.vectors = None
        self.word2idx = None
        self.vocab = None
    
    def fit(self, corpus: List[List[str]]):
        """从语料训练词向量"""
        # 1. 构建词表
        self.vocab = sorted(set(w for sent in corpus for w in sent))
        self.word2idx = {w: i for i, w in enumerate(self.vocab)}
        V = len(self.vocab)
        
        # 2. 构建共现矩阵
        cooccur = np.zeros((V, V), dtype=np.float64)
        for sentence in corpus:
            for i, w in enumerate(sentence):
                wi = self.word2idx[w]
                for j in range(max(0, i-self.window), min(len(sentence), i+self.window+1)):
                    if i != j:
                        cj = self.word2idx[sentence[j]]
                        cooccur[wi][cj] += 1.0
        
        # 3. PPMI 变换
        total = cooccur.sum()
        if total == 0:
            self.vectors = np.zeros((V, self.dim))
            return self
            
        p_wc = cooccur / total
        p_w = cooccur.sum(axis=1) / total
        p_c = cooccur.sum(axis=0) / total
        expected = np.outer(p_w, p_c)
        with np.errstate(divide='ignore', invalid='ignore'):
            pmi = np.log2(p_wc / (expected + 1e-18))
        ppmi = np.maximum(0, np.nan_to_num(pmi, nan=0.0))
        
        # 4. 截断 SVD
        k = min(self.dim, V - 1)
        U, S, Vt = svds(ppmi, k=k)
        
        # 按奇异值降序排列
        order = np.argsort(-S)
        U = U[:, order]
        S = S[order]
        
        # 5. 提取词向量：W = U · Σ^α
        self.vectors = U * (S ** self.alpha)
        return self
    
    def get_vector(self, word: str) -> np.ndarray:
        """获取词向量"""
        if word not in self.word2idx:
            raise KeyError(f"'{word}' not in vocabulary")
        return self.vectors[self.word2idx[word]]
    
    def most_similar(self, word: str, topk: int = 5) -> List[Tuple[str, float]]:
        """查找最相似的词"""
        vec = self.get_vector(word)
        sims = []
        for w, idx in self.word2idx.items():
            if w == word:
                continue
            other = self.vectors[idx]
            sim = 1 - cosine(vec, other)  # cosine similarity
            sims.append((w, sim))
        sims.sort(key=lambda x: -x[1])
        return sims[:topk]
    
    def analogy(self, a: str, b: str, c: str, topk: int = 3):
        """类比推理：a - b + c ≈ ?"""
        vec = self.get_vector(a) - self.get_vector(b) + self.get_vector(c)
        sims = []
        exclude = {a, b, c}
        for w, idx in self.word2idx.items():
            if w in exclude:
                continue
            sim = 1 - cosine(vec, self.vectors[idx])
            sims.append((w, sim))
        sims.sort(key=lambda x: -x[1])
        return sims[:topk]


# 演示（小语料）
corpus = [
    "the king ruled the kingdom with wisdom".split(),
    "the queen ruled the kingdom with grace".split(),
    "the man worked in the field".split(),
    "the woman worked in the garden".split(),
    "a boy played with the dog".split(),
    "a girl played with the cat".split(),
    "the king and queen lived in the castle".split(),
    "the man and woman lived in the village".split(),
]

model = SVDWordVectors(embedding_dim=10, window=3)
model.fit(corpus)

print("与 'king' 最相似:")
for w, s in model.most_similar("king", topk=3):
    print(f"  {w}: {s:.4f}")
```

### 4.4 SVD 方法的优缺点

| 维度 | 优点 | 缺点 |
|------|------|------|
| 理论 | 最优低秩逼近有数学保证 | 假设线性关系，忽略高阶交互 |
| 全局性 | 利用完整的全局共现统计 | 高频词主导，需要权重调整 |
| 效率 | 一次性分解，无需迭代 | O(|V|²) 内存，大词表不可行 |
| 增量 | — | 新词加入需要重新分解 |
| 实践 | 小语料表现不错 | 大规模语料不如 Word2Vec |

### 4.5 改进技巧

**上下文分布平滑（Context Distribution Smoothing, CDS）**：对上下文频率做 0.75 次幂平滑，削弱高频词的影响：

```
P_α(c) = #(c)^α / Σ_c' #(c')^α,  α = 0.75
```

**动态窗口加权**：距离越近的上下文词权重越高：weight = 1 / |i - j|

**脏词过滤**：去除极高频停用词（the, is, a），它们贡献的语义信息极少但共现计数极大。

---

## 5. Word2Vec 详解

### 5.1 概述

Word2Vec（Mikolov et al., 2013）是词向量领域最具影响力的模型。它并非一种单一算法，而是两种模型架构（CBOW 和 Skip-Gram）加两种训练技巧（层次 Softmax 和负采样）的组合。

Word2Vec 的核心创新在于：用一个极其简单的浅层网络（只有一个隐藏层，无非线性激活），配合高效的训练技巧，在超大规模语料上快速训练出高质量词向量。

### 5.2 CBOW 模型（Continuous Bag of Words）

**任务**：给定上下文词，预测中心词。

**架构**：

```
输入层        投影层（隐藏层）    输出层
w(t-2) → 
w(t-1) →    求平均 → h        → softmax → P(w(t)|context)
w(t+1) →
w(t+2) →
```

**形式化**：

给定上下文窗口 C = {w_{t-k}, ..., w_{t-1}, w_{t+1}, ..., w_{t+k}}，CBOW 的目标是最大化：

```
P(w_t | C) = softmax(v'_{w_t}ᵀ · h)

其中 h = (1/2k) · Σ_{w∈C} v_w    （上下文词向量的平均）
```

这里有两组词向量：
- v_w ∈ ℝᵈ：词 w 作为"上下文"时的向量（输入向量，来自权重矩阵 W_in）
- v'_w ∈ ℝᵈ：词 w 作为"目标"时的向量（输出向量，来自权重矩阵 W_out）

**训练目标**（最大化对数似然）：

```
J = (1/T) Σ_{t=1}^T log P(w_t | w_{t-k}, ..., w_{t+k})
```

### 5.3 Skip-Gram 模型

**任务**：给定中心词，预测上下文词（与 CBOW 方向相反）。

**架构**：

```
输入层         投影层          输出层
                            → P(w(t-2)|w(t))
                            → P(w(t-1)|w(t))
w(t) →     v_{w(t)}        → P(w(t+1)|w(t))
                            → P(w(t+2)|w(t))
```

**形式化**：

给定中心词 w_t，Skip-Gram 最大化周围词出现的概率：

```
P(w_o | w_t) = exp(v'_{w_o}ᵀ · v_{w_t}) / Σ_{w∈V} exp(v'_wᵀ · v_{w_t})
```

**训练目标**：

```
J = (1/T) Σ_{t=1}^T Σ_{-k≤j≤k, j≠0} log P(w_{t+j} | w_t)
```

### 5.4 CBOW vs Skip-Gram 对比

| 维度 | CBOW | Skip-Gram |
|------|------|-----------|
| 预测方向 | 上下文 → 中心词 | 中心词 → 上下文 |
| 训练速度 | 更快（一次更新一个词） | 更慢（一次更新多个词对） |
| 低频词效果 | 较差（低频词信号被平均稀释） | 更好（每个词对独立贡献梯度） |
| 高频词效果 | 更好（更多训练信号） | 一般 |
| 常用场景 | 大语料、一般任务 | 小语料、需要高质量低频词向量 |
| 参数更新 | 上下文词的梯度平均后更新 | 每个 (center, context) 对独立更新 |

### 5.5 Softmax 的计算瓶颈

无论 CBOW 还是 Skip-Gram，输出层都需要计算 softmax：

```
P(w_o | w_t) = exp(v'_{w_o}ᵀ · v_{w_t}) / Σ_{w=1}^{|V|} exp(v'_wᵀ · v_{w_t})
```

分母需要遍历整个词表 |V|（通常 3~10 万），计算量 O(|V| · d)，这是不可接受的。

解决方案：负采样（Negative Sampling）或层次 Softmax（Hierarchical Softmax）。

---

## 6. 负采样与层次 Softmax

### 6.1 负采样（Negative Sampling, NEG）

**核心思想**：不去精确计算完整的 softmax（涉及 |V| 个类别的归一化），而是将问题转化为若干个二分类问题——区分"真正的上下文词"（正样本）和"随机采的噪声词"（负样本）。

**目标函数**（Skip-Gram + Negative Sampling, SGNS）：

对于一个正样本对 (w, c)（中心词 w 与其真实上下文词 c），以及 K 个负样本 {c₁⁻, c₂⁻, ..., cₖ⁻}（随机采样的非上下文词），最大化：

```
J(w, c) = log σ(v'_c · v_w) + Σ_{i=1}^K E_{c_i⁻ ~ P_n(w)} [log σ(-v'_{c_i⁻} · v_w)]
```

其中 σ(x) = 1/(1+e^{-x}) 是 sigmoid 函数，P_n(w) 是噪声分布（负采样分布）。

**直觉理解**：
- 第一项：让正样本对的向量内积大（→ σ 接近 1 → log 接近 0）
- 第二项：让负样本对的向量内积小（→ σ(-x) 接近 1 → log 接近 0）

**负采样分布 P_n(w)**：

Mikolov 提出使用词频的 3/4 次幂分布（经验效果最好）：

```
P_n(w) = f(w)^{3/4} / Σ_{w'} f(w')^{3/4}
```

其中 f(w) 是词 w 的频率。3/4 次幂的效果是：相比均匀分布，它提升了低频词被采为负样本的概率（使得模型更多地学习区分低频词），同时相比原始频率分布，降低了高频词被过度采样的问题。

**为什么是 3/4 次幂？**

| 分布 | unigram (α=1) | α=3/4 | uniform (α=0) |
|------|---------------|-------|----------------|
| 高频词"the" | 被采过多 | 适中 | 采样不足 |
| 低频词"quarantine" | 几乎不被采 | 适度提升 | 过度采样 |
| 实际效果 | 差 | 最优 | 差 |

### 6.2 负采样数 K 的选择

- 小语料：K = 5~20（需要更多负样本来获得稳定梯度）
- 大语料：K = 2~5（正样本多，不需要太多负样本）
- Google 论文推荐：小数据集 K=5~20，大数据集 K=2~5

### 6.3 层次 Softmax（Hierarchical Softmax）

**核心思想**：用 Huffman 树组织词表，将 |V| 分类问题转化为 O(log|V|) 个二分类问题。

**结构**：构建一棵二叉 Huffman 树，叶子节点是词表中的词（高频词离根更近），每个内部节点有一个参数向量 θ_n。

**概率计算**：从根到叶子 w 的路径上，每个内部节点 n 做一次二分类（sigmoid），走左子树 P=σ(v_w^T · θ_n)，走右子树 P=1-σ(v_w^T · θ_n)。

```
P(w|context) = ∏_{n∈path(root→w)} σ(d_n · v_context^T · θ_n)
```

其中 d_n ∈ {-1, +1} 表示在节点 n 处走左还是右。

**复杂度**：从 O(|V|) 降到 O(log|V|)。对于 |V|=10万的词表，从 10万次运算降到约 17 次。

**Huffman 编码的优势**：高频词路径短，低频词路径长。由于高频词被预测的次数多，短路径意味着更少的计算量，整体效率最优。

```python
import heapq
from typing import List, Tuple, Optional
import numpy as np

class HuffmanNode:
    """Huffman 树节点"""
    def __init__(self, word: Optional[str] = None, freq: int = 0):
        self.word = word          # 叶子节点存储词
        self.freq = freq          # 频率
        self.left = None
        self.right = None
        self.vector = None        # 内部节点的参数向量
        self.code = []            # Huffman 编码（路径）
        self.path = []            # 路径上的内部节点列表
    
    def __lt__(self, other):
        return self.freq < other.freq


def build_huffman_tree(word_freq: List[Tuple[str, int]], dim: int = 100) -> dict:
    """构建 Huffman 树
    
    Args:
        word_freq: [(word, frequency), ...] 列表
        dim: 内部节点向量维度
    
    Returns:
        word2node: 词到叶子节点的映射（含编码和路径信息）
    """
    # 创建叶子节点并构建最小堆
    heap = [HuffmanNode(word=w, freq=f) for w, f in word_freq]
    heapq.heapify(heap)
    
    # 自底向上合并
    while len(heap) > 1:
        left = heapq.heappop(heap)
        right = heapq.heappop(heap)
        parent = HuffmanNode(freq=left.freq + right.freq)
        parent.left = left
        parent.right = right
        # 内部节点初始化参数向量
        parent.vector = np.random.randn(dim) * 0.01
        heapq.heappush(heap, parent)
    
    root = heap[0]
    
    # DFS 生成编码
    word2node = {}
    stack = [(root, [], [])]  # (node, code, path)
    while stack:
        node, code, path = stack.pop()
        if node.word is not None:  # 叶子节点
            node.code = code
            node.path = path
            word2node[node.word] = node
        else:
            if node.right:
                stack.append((node.right, code + [1], path + [node]))
            if node.left:
                stack.append((node.left, code + [0], path + [node]))
    
    return word2node


# 演示
word_freq = [("the", 100), ("cat", 30), ("dog", 28), ("sat", 20),
             ("on", 45), ("mat", 10), ("a", 60), ("rug", 8)]

word2node = build_huffman_tree(word_freq, dim=50)

print("Huffman 编码:")
for word in ["the", "a", "cat", "rug"]:
    node = word2node[word]
    print(f"  '{word}' (freq={next(f for w,f in word_freq if w==word)}): "
          f"code={node.code}, path_len={len(node.path)}")
# 高频词 "the" 路径短，低频词 "rug" 路径长
```

### 6.4 负采样 vs 层次 Softmax 对比

| 特性 | 负采样（NEG） | 层次 Softmax（HS） |
|------|--------------|-------------------|
| 复杂度 | O(K)，K=5~20 | O(log|V|) |
| 实际速度 | 更快（K 通常 < log|V|） | 稍慢但仍远优于全 Softmax |
| 低频词 | 表示质量一般 | 更好（每个词都有唯一路径） |
| 高频词 | 表示质量好 | 路径短，更新频繁 |
| 实现复杂度 | 简单 | 需构建和维护 Huffman 树 |
| 实际使用 | **主流选择**（gensim 默认） | 较少使用 |
| 理论解释 | 等价于隐式 PMI 矩阵分解 | 等价于最大化对数似然的近似 |

**工程建议**：优先使用负采样（Skip-Gram + Negative Sampling, 即 SGNS），这是最常用的 Word2Vec 配置。

### 6.5 Subsampling 高频词

Word2Vec 还引入了高频词降采样（Subsampling）技术：对频率过高的词（如 "the"、"a"、"is"）以一定概率丢弃，避免它们主导训练过程。

丢弃概率：

```
P(discard wᵢ) = 1 - sqrt(t / f(wᵢ))
```

其中 f(wᵢ) 是词 wᵢ 的频率，t 是阈值（默认 10⁻⁵）。

效果：频率为 1% 的词被丢弃的概率约 97%；频率为 0.001% 的词几乎不被丢弃。这大幅提升了训练速度和低频词的表示质量。

---

## 7. GloVe：全局向量表示

### 7.1 GloVe 的动机

GloVe（Global Vectors for Word Representation, Pennington et al. 2014）的设计动机是**统一基于计数和基于预测的两类方法的优点**：

- 基于计数（如 SVD）：利用全局统计信息，但线性模型表达力有限
- 基于预测（如 Word2Vec）：捕获复杂模式，但只用了局部窗口信息

GloVe 直接对全局共现矩阵建模，但用了非线性的目标函数。

### 7.2 核心直觉：共现比率

GloVe 的关键洞察：**词之间的语义关系体现在共现概率的比率中**，而非绝对共现概率。

考虑词 "ice"（冰）和 "steam"（蒸汽）：

| 探测词 k | P(k|ice) | P(k|steam) | P(k|ice)/P(k|steam) |
|----------|----------|------------|---------------------|
| solid    | 大       | 小         | **>> 1**（与 ice 相关） |
| gas      | 小       | 大         | **<< 1**（与 steam 相关） |
| water    | 大       | 大         | **≈ 1**（与两者都相关） |
| fashion  | 小       | 小         | **≈ 1**（与两者都无关） |

比率（而非绝对值）才能有效区分相关性方向！

### 7.3 数学推导

**目标**：找到词向量 wᵢ, wⱼ 和偏置 bᵢ, bⱼ，使得：

```
wᵢᵀ · wⱼ + bᵢ + bⱼ ≈ log(Xᵢⱼ)
```

其中 Xᵢⱼ 是词 i 与词 j 的共现计数。

**损失函数**：

```
J = Σᵢ,ⱼ f(Xᵢⱼ) · (wᵢᵀ · wⱼ + bᵢ + bⱼ - log Xᵢⱼ)²
```

**权重函数 f(x)**：

```
f(x) = (x/x_max)^α   如果 x < x_max
f(x) = 1              如果 x ≥ x_max
```

其中 x_max = 100, α = 0.75 是默认超参数。

权重函数的设计考虑：
- f(0) = 0：共现为 0 的词对不参与训练（避免 log(0)）
- 当 x 较小时，f(x) 较小：减少低频共现（噪声）的影响
- 有上界 f(x_max)=1：避免高频共现主导损失

### 7.4 GloVe 的实现

```python
import numpy as np
from typing import Dict, List, Tuple
from collections import defaultdict

class GloVe:
    """GloVe 词向量模型的简化实现
    
    核心思想：词向量的内积应近似等于共现计数的对数。
    损失函数对高频共现做截断加权，对低频共现做幂律降权。
    """
    
    def __init__(self, vocab_size: int, embedding_dim: int = 100,
                 x_max: float = 100.0, alpha: float = 0.75,
                 learning_rate: float = 0.05):
        """
        Args:
            vocab_size: 词表大小
            embedding_dim: 词向量维度
            x_max: 权重函数截断阈值
            alpha: 权重函数幂次
            learning_rate: 学习率
        """
        self.vocab_size = vocab_size
        self.dim = embedding_dim
        self.x_max = x_max
        self.alpha = alpha
        self.lr = learning_rate
        
        # 初始化参数：每个词有两组向量（作为中心词和作为上下文词）
        scale = 1.0 / self.dim
        self.W = np.random.uniform(-scale, scale, (vocab_size, embedding_dim))  # 中心词向量
        self.W_ctx = np.random.uniform(-scale, scale, (vocab_size, embedding_dim))  # 上下文向量
        self.b = np.zeros(vocab_size)       # 中心词偏置
        self.b_ctx = np.zeros(vocab_size)   # 上下文词偏置
        
        # AdaGrad 累积梯度
        self.grad_sq_W = np.ones((vocab_size, embedding_dim))
        self.grad_sq_W_ctx = np.ones((vocab_size, embedding_dim))
        self.grad_sq_b = np.ones(vocab_size)
        self.grad_sq_b_ctx = np.ones(vocab_size)
    
    def weight_func(self, x: float) -> float:
        """权重函数 f(x)：对共现计数做加权"""
        if x >= self.x_max:
            return 1.0
        return (x / self.x_max) ** self.alpha
    
    def train_step(self, cooccurrences: List[Tuple[int, int, float]]) -> float:
        """执行一步训练
        
        Args:
            cooccurrences: [(word_i, word_j, X_ij), ...] 共现数据
            
        Returns:
            本步的平均损失
        """
        total_loss = 0.0
        
        for i, j, x_ij in cooccurrences:
            if x_ij == 0:
                continue
            
            # 计算预测值与目标值的差
            diff = np.dot(self.W[i], self.W_ctx[j]) + self.b[i] + self.b_ctx[j] - np.log(x_ij)
            
            # 加权
            weight = self.weight_func(x_ij)
            weighted_diff = weight * diff
            
            # 损失
            total_loss += 0.5 * weight * diff * diff
            
            # 计算梯度
            grad_w_i = weighted_diff * self.W_ctx[j]
            grad_w_j = weighted_diff * self.W[i]
            grad_b_i = weighted_diff
            grad_b_j = weighted_diff
            
            # AdaGrad 更新
            self.grad_sq_W[i] += grad_w_i ** 2
            self.grad_sq_W_ctx[j] += grad_w_j ** 2
            self.grad_sq_b[i] += grad_b_i ** 2
            self.grad_sq_b_ctx[j] += grad_b_j ** 2
            
            self.W[i] -= self.lr * grad_w_i / np.sqrt(self.grad_sq_W[i])
            self.W_ctx[j] -= self.lr * grad_w_j / np.sqrt(self.grad_sq_W_ctx[j])
            self.b[i] -= self.lr * grad_b_i / np.sqrt(self.grad_sq_b[i])
            self.b_ctx[j] -= self.lr * grad_b_j / np.sqrt(self.grad_sq_b_ctx[j])
        
        return total_loss / len(cooccurrences)
    
    def get_embedding(self, word_idx: int) -> np.ndarray:
        """获取最终词向量（两组向量的平均）"""
        return (self.W[word_idx] + self.W_ctx[word_idx]) / 2.0
    
    def fit(self, cooccurrences: List[Tuple[int, int, float]], 
            epochs: int = 50, verbose: bool = True) -> List[float]:
        """训练 GloVe 模型
        
        Args:
            cooccurrences: 所有非零共现 (i, j, X_ij)
            epochs: 训练轮数
            verbose: 是否打印损失
            
        Returns:
            每轮的损失列表
        """
        losses = []
        for epoch in range(epochs):
            # 打乱顺序
            np.random.shuffle(cooccurrences)
            loss = self.train_step(cooccurrences)
            losses.append(loss)
            if verbose and (epoch + 1) % 10 == 0:
                print(f"Epoch {epoch+1}/{epochs}, Loss: {loss:.6f}")
        return losses


# ===== 演示 =====
# 使用之前构建的共现矩阵
corpus = [
    "the cat sat on the mat".split(),
    "the dog sat on the rug".split(),
    "a cat lay on the mat".split(),
    "a dog lay on the rug".split(),
    "the cat chased the dog".split(),
    "the dog chased the cat".split(),
    "cats and dogs are pets".split(),
    "the pet cat sleeps on the mat".split(),
]

# 构建词表和共现
vocab = sorted(set(w for sent in corpus for w in sent))
word2idx = {w: i for i, w in enumerate(vocab)}
V = len(vocab)

# 构建共现列表
cooccur_list = []
window = 3
for sentence in corpus:
    for i, w in enumerate(sentence):
        for j in range(max(0, i-window), min(len(sentence), i+window+1)):
            if i != j:
                cooccur_list.append((word2idx[w], word2idx[sentence[j]], 1.0))

# 合并相同词对的计数
from collections import Counter
pair_counts = Counter()
for i, j, _ in cooccur_list:
    pair_counts[(i, j)] += 1

cooccurrences = [(i, j, float(c)) for (i, j), c in pair_counts.items()]

print(f"词表大小: {V}, 非零共现对: {len(cooccurrences)}")

# 训练 GloVe
glove = GloVe(vocab_size=V, embedding_dim=50, learning_rate=0.05)
losses = glove.fit(cooccurrences, epochs=100, verbose=True)

# 计算相似度
def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-8)

print("\nGloVe 训练后的词向量相似度:")
for w1, w2 in [("cat", "dog"), ("sat", "lay"), ("cat", "on"), ("mat", "rug")]:
    if w1 in word2idx and w2 in word2idx:
        v1 = glove.get_embedding(word2idx[w1])
        v2 = glove.get_embedding(word2idx[w2])
        sim = cosine_similarity(v1, v2)
        print(f"  sim({w1}, {w2}) = {sim:.4f}")
```

### 7.5 GloVe 的优势与特点

**与 Word2Vec 的关系**：

| 维度 | Word2Vec (SGNS) | GloVe |
|------|----------------|-------|
| 信息来源 | 局部窗口（在线） | 全局共现矩阵 |
| 训练方式 | SGD 逐窗口 | 对所有非零共现一起优化 |
| 目标函数 | 最大化上下文预测概率 | 最小化加权最小二乘 |
| 数学等价 | 隐式分解 PMI 矩阵 | 显式拟合 log共现 |
| 稀有词 | 需要足够训练样本 | 有加权函数辅助 |
| 训练速度 | 大语料更快（在线） | 需先统计共现，再迭代 |
| 并行性 | 可多线程（异步SGD） | 天然可并行（矩阵运算） |

**GloVe 的命名含义**："Global Vectors" 强调它利用了全局统计信息（整个共现矩阵），而非像 Word2Vec 那样只看局部窗口。

---

## 8. FastText：子词级 Embedding

### 8.1 动机：解决 OOV 问题

Word2Vec 和 GloVe 都有一个共同限制：**只能为训练时见过的词生成向量**，对词表外（Out-of-Vocabulary, OOV）的词完全无能为力。

FastText（Bojanowski et al., 2016，Facebook/Meta AI）通过引入**子词（Subword）级别的 n-gram 表示**解决了这个问题。其核心思想：一个词的向量 = 该词所有字符 n-gram 向量的和。

### 8.2 子词 n-gram 的构造

对于词 w，FastText 会：

1. 添加边界标记：在词首加 `<`，词尾加 `>`
2. 提取所有长度为 3~6 的字符 n-gram
3. 加上词本身的完整形式

示例（词 "where"，n=3~6）：

```
原词: where → <where>

3-gram: <wh, whe, her, ere, re>
4-gram: <whe, wher, here, ere>
5-gram: <wher, where, here>
6-gram: <where, where>

词的向量 = 上述所有 n-gram 向量之和 + 词本身的向量
```

### 8.3 数学形式

对词 w，设其 n-gram 集合为 G_w，则词向量为：

```
v_w = z_w + Σ_{g ∈ G_w} z_g
```

其中 z_w 是词 w 本身的向量，z_g 是 n-gram g 的向量。

Skip-Gram 的目标函数变为：

```
score(w, c) = (z_w + Σ_{g ∈ G_w} z_g)ᵀ · v_c
```

### 8.4 OOV 处理

对于训练时未见过的词（OOV），只需将其拆解为 n-gram，然后将已知 n-gram 的向量求和：

```
v_unknown = Σ_{g ∈ G_unknown, g ∈ known_ngrams} z_g
```

由于大量 n-gram 在训练时已被学习到（如 "un-"、"-tion"、"-ing"），这使得 FastText 对未登录词也能生成合理的向量。

### 8.5 FastText 的实现

```python
import numpy as np
from typing import Set, List, Dict
from collections import defaultdict

class FastTextModel:
    """FastText 子词级词向量模型（简化版）
    
    核心创新：将词表示为其字符 n-gram 向量之和，
    解决 OOV 问题并利用词的形态学信息。
    """
    
    def __init__(self, embedding_dim: int = 100, 
                 min_n: int = 3, max_n: int = 6,
                 bucket_size: int = 2000000):
        """
        Args:
            embedding_dim: 向量维度
            min_n: 最小 n-gram 长度
            max_n: 最大 n-gram 长度
            bucket_size: n-gram 哈希桶大小
        """
        self.dim = embedding_dim
        self.min_n = min_n
        self.max_n = max_n
        self.bucket_size = bucket_size
        
        # n-gram 向量（用哈希映射到固定数量的桶）
        self.ngram_vectors = np.random.randn(bucket_size, embedding_dim) * 0.01
        
        # 词本身的向量
        self.word_vectors: Dict[str, np.ndarray] = {}
    
    def get_ngrams(self, word: str) -> List[str]:
        """提取词的所有字符 n-gram
        
        Args:
            word: 输入词
            
        Returns:
            n-gram 列表
        """
        # 添加边界标记
        padded = f"<{word}>"
        ngrams = []
        
        for n in range(self.min_n, self.max_n + 1):
            for i in range(len(padded) - n + 1):
                ngrams.append(padded[i:i+n])
        
        return ngrams
    
    def hash_ngram(self, ngram: str) -> int:
        """将 n-gram 哈希到桶索引
        
        使用 FNV-1a 哈希（简化版）
        """
        h = 2166136261  # FNV offset basis
        for char in ngram:
            h ^= ord(char)
            h = (h * 16777619) & 0xFFFFFFFF  # FNV prime
        return h % self.bucket_size
    
    def get_word_vector(self, word: str) -> np.ndarray:
        """获取词向量（词本身向量 + 所有 n-gram 向量之和）
        
        对 OOV 词也能生成向量！
        """
        ngrams = self.get_ngrams(word)
        
        # n-gram 向量之和
        vec = np.zeros(self.dim)
        count = 0
        for ng in ngrams:
            idx = self.hash_ngram(ng)
            vec += self.ngram_vectors[idx]
            count += 1
        
        # 加上词本身的向量（如果有）
        if word in self.word_vectors:
            vec += self.word_vectors[word]
            count += 1
        
        # 平均化
        if count > 0:
            vec /= count
        
        return vec
    
    def similarity(self, word1: str, word2: str) -> float:
        """计算两个词的余弦相似度"""
        v1 = self.get_word_vector(word1)
        v2 = self.get_word_vector(word2)
        dot = np.dot(v1, v2)
        norm = np.linalg.norm(v1) * np.linalg.norm(v2)
        return float(dot / (norm + 1e-8))


# ===== 演示 =====
model = FastTextModel(embedding_dim=50, min_n=3, max_n=6)

# 查看 n-gram 分解
word = "where"
ngrams = model.get_ngrams(word)
print(f"'{word}' 的 n-gram ({len(ngrams)} 个):")
for n in range(3, 7):
    ng_n = [ng for ng in ngrams if len(ng) == n]
    print(f"  {n}-gram: {ng_n}")

print()

# 形态相似的词应有相似的向量（因为共享 n-gram）
pairs = [("running", "runner"), ("running", "jumped"), 
         ("unhappy", "unhelpful"), ("cat", "catalog")]

print("形态相似词的相似度（未训练，仅基于 n-gram 共享）:")
for w1, w2 in pairs:
    # 计算共享 n-gram
    ng1 = set(model.get_ngrams(w1))
    ng2 = set(model.get_ngrams(w2))
    shared = ng1 & ng2
    sim = model.similarity(w1, w2)
    print(f"  sim({w1}, {w2}) = {sim:.4f}  (共享 {len(shared)} 个 n-gram)")
```

### 8.6 FastText 的优势与局限

**优势**：

| 优势 | 说明 |
|------|------|
| 处理 OOV | 通过 n-gram 组合为任意词生成向量 |
| 捕获形态学 | 前缀/后缀信息自动编码（un-, -ing, -tion） |
| 拼写容错 | 拼写相近的词有相似向量（typo-robust） |
| 稀有词 | 低频词通过 n-gram 共享获得更好表示 |
| 多语言 | 对形态丰富的语言（德语、芬兰语、土耳其语）效果显著 |

**局限**：

| 局限 | 说明 |
|------|------|
| 向量维度膨胀 | n-gram 数量远大于词表，需要哈希压缩 |
| 语义误导 | 形态相似但语义无关的词也会有高相似度（如 cat 与 catalog） |
| 中文适配 | 中文无天然词边界，需要先分词或用字符级 |
| 静态表示 | 仍是一词一向量，不能处理多义词 |

---

## 9. Embedding 层的数学本质

### 9.1 从 One-Hot 到 Embedding 的矩阵视角

在深度学习中，`nn.Embedding(V, d)` 层本质上是一个权重矩阵 W ∈ ℝ^{V×d}，给定词索引 i，返回第 i 行向量：

```
embedding(i) = W[i, :]      （直接索引，O(1)）
```

这等价于用 One-Hot 向量乘以权重矩阵：

```
embedding(i) = one_hot(i) · W = eᵢᵀ · W = W[i, :]
```

但实现上直接查表（index select），不做矩阵乘法——这是一个重要的工程优化。

### 9.2 梯度与更新

在反向传播时，设损失 L 对 Embedding 输出的梯度为 ∂L/∂e ∈ ℝ^d，则：

```
∂L/∂W[i, :] = ∂L/∂e      （只有第 i 行有梯度）
∂L/∂W[j, :] = 0           （j ≠ i，未被选中的行梯度为零）
```

这意味着每次只更新被选中词的向量，其余不变——这是 Embedding 训练高效的关键（稀疏更新）。

### 9.3 PyTorch 中的 nn.Embedding

```python
import torch
import torch.nn as nn

# ===== nn.Embedding 基础用法 =====

# 创建 Embedding 层：词表大小 10000，向量维度 300
vocab_size = 10000
embed_dim = 300
embedding = nn.Embedding(num_embeddings=vocab_size, embedding_dim=embed_dim)

print(f"Embedding 权重矩阵 shape: {embedding.weight.shape}")  # [10000, 300]
print(f"参数量: {embedding.weight.numel():,}")  # 3,000,000

# 输入：词索引（batch_size=4, seq_len=5）
input_ids = torch.tensor([[1, 42, 99, 3, 7],
                          [5, 21, 88, 0, 6],
                          [3, 77, 12, 5, 9],
                          [8, 33, 66, 2, 4]])

# 前向传播：查表
output = embedding(input_ids)
print(f"输入 shape: {input_ids.shape}")   # [4, 5]
print(f"输出 shape: {output.shape}")      # [4, 5, 300]

# 验证：output[0, 0] == embedding.weight[1]
assert torch.allclose(output[0, 0], embedding.weight[1])
print("✓ embedding(idx) == weight[idx]")

# ===== padding_idx：指定填充索引 =====
# padding_idx 对应的向量永远为零，不参与梯度更新
embedding_padded = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
print(f"\npadding idx=0 的向量: {embedding_padded.weight[0]}")  # 全零

# 即使经过训练，padding 向量仍保持全零
fake_loss = embedding_padded(torch.tensor([0, 1, 2])).sum()
fake_loss.backward()
print(f"padding 向量梯度: {embedding_padded.weight.grad[0]}")  # 全零

# ===== 用预训练权重初始化 =====
pretrained_weights = torch.randn(vocab_size, embed_dim)  # 假设从文件加载
embedding_pretrained = nn.Embedding.from_pretrained(
    pretrained_weights, 
    freeze=False  # False=可微调, True=冻结
)
print(f"\n预训练 Embedding freeze={embedding_pretrained.weight.requires_grad}")

# ===== 稀疏梯度优化 =====
# 对大词表，使用 sparse=True 可以显著减少内存
embedding_sparse = nn.Embedding(vocab_size, embed_dim, sparse=True)
# 需要配合 SparseAdam 优化器
optimizer = torch.optim.SparseAdam(embedding_sparse.parameters(), lr=0.01)
```

### 9.4 Embedding 与线性层的区别

```python
import torch
import torch.nn as nn

vocab_size, embed_dim = 1000, 128

# 方式一：Embedding（查表）
emb = nn.Embedding(vocab_size, embed_dim)

# 方式二：Linear（矩阵乘法）
linear = nn.Linear(vocab_size, embed_dim, bias=False)

# 让两者权重相同
with torch.no_grad():
    linear.weight.copy_(emb.weight.T)  # Linear 的 weight 是转置的

# 用 Embedding 的方式
idx = torch.tensor([42])
out_emb = emb(idx)  # shape: [1, 128]

# 用 Linear 的方式（需要先转 one-hot）
one_hot = torch.zeros(1, vocab_size)
one_hot[0, 42] = 1.0
out_linear = linear(one_hot)  # shape: [1, 128]

# 两者结果相同！
print(f"最大差异: {(out_emb - out_linear).abs().max().item():.2e}")  # ≈ 0

# 但效率差异巨大：
# Embedding: O(d) —— 直接取第 i 行
# Linear:    O(V*d) —— 完整矩阵乘法
# 当 V=50000, d=512 时，Embedding 快 50000 倍！
```

---

## 10. Word2Vec 从零实现（PyTorch）

### 10.1 完整的 Skip-Gram + 负采样实现

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from collections import Counter
from typing import List, Tuple, Dict
import time


class Word2VecDataset(Dataset):
    """Word2Vec 训练数据集
    
    实现 Skip-Gram 的数据准备：
    1. 构建词表（含频率统计）
    2. 高频词降采样
    3. 生成 (中心词, 上下文词) 正样本对
    4. 为每个正样本生成 K 个负样本
    """
    
    def __init__(self, corpus: List[List[str]], 
                 min_count: int = 5,
                 window_size: int = 5,
                 neg_samples: int = 5,
                 subsample_threshold: float = 1e-5):
        """
        Args:
            corpus: 分词后的语料列表
            min_count: 最小词频阈值
            window_size: 上下文窗口大小
            neg_samples: 每个正样本对应的负样本数
            subsample_threshold: 高频词降采样阈值
        """
        self.window_size = window_size
        self.neg_samples = neg_samples
        
        # Step 1: 统计词频，过滤低频词
        word_counts = Counter(w for sent in corpus for w in sent)
        self.vocab = [w for w, c in word_counts.items() if c >= min_count]
        self.word2idx = {w: i for i, w in enumerate(self.vocab)}
        self.idx2word = {i: w for i, w in enumerate(self.vocab)}
        self.vocab_size = len(self.vocab)
        
        # 词频（用于负采样分布）
        freqs = np.array([word_counts[w] for w in self.vocab], dtype=np.float64)
        total = freqs.sum()
        self.word_freqs = freqs / total
        
        # Step 2: 负采样分布（频率的 3/4 次方）
        # P_noise(w) ∝ f(w)^{3/4}
        self.noise_dist = np.power(self.word_freqs, 0.75)
        self.noise_dist /= self.noise_dist.sum()
        
        # Step 3: 高频词降采样概率
        # P(discard w) = 1 - sqrt(t / f(w))
        self.discard_probs = 1.0 - np.sqrt(subsample_threshold / self.word_freqs)
        self.discard_probs = np.clip(self.discard_probs, 0, 1)
        
        # Step 4: 生成训练样本
        self.data = self._build_training_data(corpus)
        print(f"词表大小: {self.vocab_size}")
        print(f"训练样本数: {len(self.data)}")
    
    def _build_training_data(self, corpus: List[List[str]]) -> List[Tuple[int, int]]:
        """生成 (center, context) 正样本对"""
        pairs = []
        for sentence in corpus:
            # 转换为索引，过滤 OOV
            indices = [self.word2idx[w] for w in sentence if w in self.word2idx]
            
            # 高频词降采样
            indices = [idx for idx in indices 
                      if np.random.random() > self.discard_probs[idx]]
            
            # 生成窗口内的 (center, context) 对
            for i, center in enumerate(indices):
                # 动态窗口：实际窗口大小在 [1, window_size] 随机
                actual_window = np.random.randint(1, self.window_size + 1)
                left = max(0, i - actual_window)
                right = min(len(indices), i + actual_window + 1)
                
                for j in range(left, right):
                    if i != j:
                        pairs.append((center, indices[j]))
        
        return pairs
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        center, context = self.data[idx]
        
        # 采样负样本
        neg_samples = np.random.choice(
            self.vocab_size, 
            size=self.neg_samples,
            replace=True,  # 允许重复
            p=self.noise_dist
        )
        # 确保负样本不是真正的上下文词
        neg_samples = [n for n in neg_samples if n != context]
        while len(neg_samples) < self.neg_samples:
            n = np.random.choice(self.vocab_size, p=self.noise_dist)
            if n != context:
                neg_samples.append(n)
        neg_samples = neg_samples[:self.neg_samples]
        
        return (
            torch.tensor(center, dtype=torch.long),
            torch.tensor(context, dtype=torch.long),
            torch.tensor(neg_samples, dtype=torch.long)
        )


class SkipGramModel(nn.Module):
    """Skip-Gram with Negative Sampling (SGNS) 模型
    
    架构：
    - 中心词 Embedding: W_center ∈ ℝ^{V×d}
    - 上下文 Embedding: W_context ∈ ℝ^{V×d}
    - 最终词向量 = W_center（或两者的平均）
    """
    
    def __init__(self, vocab_size: int, embedding_dim: int):
        super().__init__()
        self.vocab_size = vocab_size
        self.embed_dim = embedding_dim
        
        # 两组 Embedding
        self.center_embedding = nn.Embedding(vocab_size, embedding_dim)
        self.context_embedding = nn.Embedding(vocab_size, embedding_dim)
        
        # 初始化
        init_range = 0.5 / embedding_dim
        self.center_embedding.weight.data.uniform_(-init_range, init_range)
        self.context_embedding.weight.data.uniform_(-init_range, init_range)
    
    def forward(self, center: torch.Tensor, context: torch.Tensor, 
                neg_samples: torch.Tensor) -> torch.Tensor:
        """计算负采样损失
        
        Args:
            center: 中心词索引 [batch_size]
            context: 正样本上下文词索引 [batch_size]
            neg_samples: 负样本索引 [batch_size, K]
            
        Returns:
            标量损失
        """
        batch_size = center.shape[0]
        
        # 获取向量
        v_center = self.center_embedding(center)     # [B, d]
        v_context = self.context_embedding(context)   # [B, d]
        v_neg = self.context_embedding(neg_samples)   # [B, K, d]
        
        # 正样本损失：-log σ(v_c^T · v_w)
        pos_score = torch.sum(v_center * v_context, dim=1)  # [B]
        pos_loss = -torch.nn.functional.logsigmoid(pos_score)  # [B]
        
        # 负样本损失：-Σ log σ(-v_neg^T · v_w)
        # v_center: [B, d] → [B, d, 1]
        # v_neg: [B, K, d]
        neg_score = torch.bmm(v_neg, v_center.unsqueeze(2)).squeeze(2)  # [B, K]
        neg_loss = -torch.nn.functional.logsigmoid(-neg_score).sum(dim=1)  # [B]
        
        # 总损失
        loss = (pos_loss + neg_loss).mean()
        return loss
    
    def get_embedding(self, word_idx: int) -> np.ndarray:
        """获取词向量（使用中心词 Embedding）"""
        with torch.no_grad():
            return self.center_embedding.weight[word_idx].cpu().numpy()
    
    def get_all_embeddings(self) -> np.ndarray:
        """获取所有词向量"""
        with torch.no_grad():
            return self.center_embedding.weight.cpu().numpy()
    
    def most_similar(self, word_idx: int, word2idx: dict, idx2word: dict, 
                     top_k: int = 10) -> List[Tuple[str, float]]:
        """找到最相似的 top_k 个词"""
        with torch.no_grad():
            query = self.center_embedding.weight[word_idx]  # [d]
            all_vecs = self.center_embedding.weight          # [V, d]
            
            # 余弦相似度
            query_norm = query / (query.norm() + 1e-8)
            all_norms = all_vecs / (all_vecs.norm(dim=1, keepdim=True) + 1e-8)
            sims = torch.mv(all_norms, query_norm)  # [V]
            
            # 排除自身，取 top_k
            sims[word_idx] = -1
            top_indices = sims.argsort(descending=True)[:top_k]
            
            results = []
            for idx in top_indices.tolist():
                results.append((idx2word[idx], sims[idx].item()))
            return results


def train_word2vec(corpus: List[List[str]], 
                  embedding_dim: int = 100,
                  window_size: int = 5,
                  neg_samples: int = 5,
                  min_count: int = 5,
                  epochs: int = 5,
                  batch_size: int = 512,
                  learning_rate: float = 0.025,
                  device: str = 'cpu') -> Tuple[SkipGramModel, Dict]:
    """训练 Word2Vec 模型的完整流程
    
    Args:
        corpus: 分词后的语料
        embedding_dim: 词向量维度
        window_size: 窗口大小
        neg_samples: 负采样数量
        min_count: 最小词频
        epochs: 训练轮数
        batch_size: 批大小
        learning_rate: 初始学习率
        device: 训练设备
    
    Returns:
        训练好的模型和词表信息
    """
    # 准备数据
    dataset = Word2VecDataset(
        corpus, min_count=min_count, window_size=window_size, neg_samples=neg_samples
    )
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    
    # 创建模型
    model = SkipGramModel(dataset.vocab_size, embedding_dim).to(device)
    optimizer = optim.Adam(model.parameters(), lr=learning_rate)
    
    # 学习率线性衰减
    total_steps = len(dataloader) * epochs
    scheduler = optim.lr_scheduler.LinearLR(
        optimizer, start_factor=1.0, end_factor=0.01, total_iters=total_steps
    )
    
    # 训练循环
    print(f"\n开始训练 (device={device}, epochs={epochs}, total_steps≈{total_steps})")
    for epoch in range(epochs):
        total_loss = 0.0
        num_batches = 0
        start_time = time.time()
        
        for center, context, neg in dataloader:
            center = center.to(device)
            context = context.to(device)
            neg = neg.to(device)
            
            loss = model(center, context, neg)
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            scheduler.step()
            
            total_loss += loss.item()
            num_batches += 1
        
        avg_loss = total_loss / num_batches
        elapsed = time.time() - start_time
        lr = scheduler.get_last_lr()[0]
        print(f"Epoch {epoch+1}/{epochs} | Loss: {avg_loss:.4f} | "
              f"LR: {lr:.6f} | Time: {elapsed:.1f}s")
    
    info = {
        'word2idx': dataset.word2idx,
        'idx2word': dataset.idx2word,
        'vocab_size': dataset.vocab_size,
    }
    return model, info


# ===== 训练示例（小语料演示） =====
# 实际使用需要大规模语料（如维基百科），这里用小数据演示流程

# 模拟语料
sample_corpus = [
    "the king ruled the kingdom with wisdom".split(),
    "the queen governed the land with grace".split(),
    "a man walked to the store".split(),
    "a woman walked to the market".split(),
    "the prince is the son of the king".split(),
    "the princess is the daughter of the queen".split(),
    "cats and dogs are popular pets".split(),
    "the cat sat on the mat quietly".split(),
    "the dog ran in the park happily".split(),
    "birds fly in the blue sky above".split(),
] * 100  # 重复以增加训练数据

# 由于是小数据演示，降低 min_count
model, info = train_word2vec(
    sample_corpus,
    embedding_dim=50,
    window_size=3,
    neg_samples=5,
    min_count=2,  # 小语料用低阈值
    epochs=10,
    batch_size=64,
    learning_rate=0.01
)

# 查看相似词
if 'king' in info['word2idx']:
    print("\n与 'king' 最相似的词:")
    results = model.most_similar(
        info['word2idx']['king'], info['word2idx'], info['idx2word'], top_k=5
    )
    for word, sim in results:
        print(f"  {word}: {sim:.4f}")
```

### 10.2 类比推理测试

```python
def analogy(model: SkipGramModel, word2idx: dict, idx2word: dict,
            a: str, b: str, c: str, top_k: int = 5) -> List[Tuple[str, float]]:
    """词类比推理：a - b + c = ?
    
    经典示例：king - man + woman = queen
    
    Args:
        a, b, c: 类比关系中的三个词
        
    Returns:
        最可能的答案词列表
    """
    if a not in word2idx or b not in word2idx or c not in word2idx:
        missing = [w for w in [a,b,c] if w not in word2idx]
        print(f"词不在词表中: {missing}")
        return []
    
    with torch.no_grad():
        va = model.center_embedding.weight[word2idx[a]]
        vb = model.center_embedding.weight[word2idx[b]]
        vc = model.center_embedding.weight[word2idx[c]]
        
        # 目标向量：a - b + c
        target = va - vb + vc
        
        # 归一化
        target_norm = target / (target.norm() + 1e-8)
        all_vecs = model.center_embedding.weight
        all_norms = all_vecs / (all_vecs.norm(dim=1, keepdim=True) + 1e-8)
        
        # 计算余弦相似度
        sims = torch.mv(all_norms, target_norm)
        
        # 排除输入词
        for w in [a, b, c]:
            sims[word2idx[w]] = -1
        
        # Top-K
        top_indices = sims.argsort(descending=True)[:top_k]
        results = [(idx2word[idx.item()], sims[idx].item()) for idx in top_indices]
    
    return results


# 测试类比（需要足够大的训练语料才能有好效果）
print("\n类比测试: king - man + woman = ?")
results = analogy(model, info['word2idx'], info['idx2word'], 
                  'king', 'man', 'woman', top_k=3)
for word, sim in results:
    print(f"  {word}: {sim:.4f}")
```

---

## 11. 预训练词向量的加载与使用

### 11.1 主流预训练词向量资源

| 模型 | 维度 | 词表大小 | 训练语料 | 下载大小 |
|------|------|---------|---------|----------|
| Word2Vec (Google) | 300 | 300万 | Google News 1000亿词 | 3.6 GB |
| GloVe 6B | 50/100/200/300 | 40万 | Wikipedia+Gigaword 60亿词 | 822 MB |
| GloVe 840B | 300 | 220万 | Common Crawl 8400亿词 | 5.6 GB |
| FastText (Wiki) | 300 | 100万+ | Wikipedia 各语言 | 每语言 ~7GB |
| FastText (Crawl) | 300 | 200万 | Common Crawl | ~5 GB |

### 11.2 加载 GloVe 预训练向量

```python
import numpy as np
import torch
import torch.nn as nn
from typing import Dict, Tuple
import os

def load_glove_vectors(glove_path: str, 
                       embedding_dim: int = 300) -> Tuple[Dict[str, int], np.ndarray]:
    """加载 GloVe 预训练词向量
    
    Args:
        glove_path: GloVe 文件路径（如 glove.6B.300d.txt）
        embedding_dim: 词向量维度
    
    Returns:
        word2idx: 词到索引的映射
        embeddings: numpy 数组 shape=(vocab_size, embedding_dim)
    """
    word2idx = {}
    vectors = []
    
    print(f"加载 GloVe 向量: {glove_path}")
    with open(glove_path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            parts = line.strip().split()
            word = parts[0]
            vec = np.array(parts[1:], dtype=np.float32)
            
            if len(vec) != embedding_dim:
                continue  # 跳过异常行
            
            word2idx[word] = len(word2idx)
            vectors.append(vec)
            
            if (i + 1) % 100000 == 0:
                print(f"  已加载 {i+1} 个词...")
    
    embeddings = np.array(vectors)
    print(f"加载完成: {len(word2idx)} 个词, shape={embeddings.shape}")
    return word2idx, embeddings


def create_embedding_layer(word2idx: Dict[str, int], 
                           embeddings: np.ndarray,
                           task_vocab: Dict[str, int],
                           freeze: bool = False) -> nn.Embedding:
    """根据任务词表创建 Embedding 层，用预训练向量初始化
    
    对任务词表中不在预训练向量里的词，使用随机初始化。
    
    Args:
        word2idx: 预训练向量的词表
        embeddings: 预训练向量矩阵
        task_vocab: 任务的词到索引映射
        freeze: 是否冻结 Embedding（不微调）
    
    Returns:
        初始化好的 nn.Embedding
    """
    vocab_size = len(task_vocab)
    embed_dim = embeddings.shape[1]
    
    # 初始化：均匀分布 [-0.25, 0.25]
    weight_matrix = np.random.uniform(-0.25, 0.25, (vocab_size, embed_dim))
    
    # 用预训练向量覆盖已知词
    found = 0
    for word, idx in task_vocab.items():
        if word in word2idx:
            weight_matrix[idx] = embeddings[word2idx[word]]
            found += 1
    
    coverage = found / vocab_size * 100
    print(f"词表覆盖率: {found}/{vocab_size} ({coverage:.1f}%)")
    
    # 创建 Embedding 层
    embedding_layer = nn.Embedding(vocab_size, embed_dim)
    embedding_layer.weight = nn.Parameter(
        torch.tensor(weight_matrix, dtype=torch.float32),
        requires_grad=not freeze
    )
    
    return embedding_layer


# ===== 使用示例 =====
# 假设我们有一个文本分类任务的词表
task_vocab = {"<pad>": 0, "<unk>": 1, "the": 2, "cat": 3, 
              "sat": 4, "on": 5, "mat": 6, "dog": 7, "is": 8, "good": 9}

# 模拟预训练向量（实际使用时从文件加载）
np.random.seed(42)
fake_pretrained_w2i = {"the": 0, "cat": 1, "dog": 2, "sat": 3, 
                       "on": 4, "is": 5, "good": 6, "mat": 7}
fake_pretrained_emb = np.random.randn(len(fake_pretrained_w2i), 50).astype(np.float32)

# 创建任务 Embedding
task_embedding = create_embedding_layer(
    fake_pretrained_w2i, fake_pretrained_emb, task_vocab, freeze=False
)
print(f"Embedding shape: {task_embedding.weight.shape}")
print(f"requires_grad: {task_embedding.weight.requires_grad}")
```

### 11.3 使用 gensim 加载与查询

```python
# gensim 是最常用的词向量工具库
# pip install gensim

from gensim.models import KeyedVectors
import gensim.downloader as api

# 方式一：加载本地文件
# Word2Vec 格式（二进制）
# model = KeyedVectors.load_word2vec_format('GoogleNews-vectors-negative300.bin', binary=True)

# GloVe 格式（文本）
# model = KeyedVectors.load_word2vec_format('glove.6B.300d.txt', no_header=True)

# 方式二：自动下载（小模型演示）
# model = api.load("glove-wiki-gigaword-100")  # 100维 GloVe

# ===== 查询示例（假设已加载） =====
# 最相似词
# model.most_similar('king', topn=10)
# 输出: [('queen', 0.72), ('prince', 0.66), ('monarch', 0.64), ...]

# 类比推理
# model.most_similar(positive=['king', 'woman'], negative=['man'], topn=5)
# 输出: [('queen', 0.71), ...]

# 相似度
# model.similarity('cat', 'dog')  # ≈ 0.76
# model.similarity('cat', 'car')  # ≈ 0.20

# 找不相关的词
# model.doesnt_match(['breakfast', 'lunch', 'dinner', 'computer'])
# 输出: 'computer'

print("gensim 使用示例（注释中展示了典型 API）")
print("常用方法: most_similar, similarity, doesnt_match, get_vector")
```

---

## 12. 上下文相关 Embedding（ELMo → BERT）

### 12.1 静态 Embedding 的局限

Word2Vec / GloVe / FastText 产生的是**静态词向量**——一个词无论在什么上下文中，向量都相同。但自然语言充满多义词：

```
"bank" 在不同上下文中的含义：
  ① "I deposited money in the bank"  → 银行
  ② "The river bank was muddy"       → 河岸
  ③ "I bank on you to help me"       → 依靠

静态词向量只有一个 vec("bank")，无法区分三种含义！
```

### 12.2 ELMo（Embeddings from Language Models, 2018）

Peters et al. 提出用**双向 LSTM 语言模型**生成上下文相关的词向量：

**架构**：
- 字符级 CNN 生成初始词表示
- L 层双向 LSTM
- 每层 LSTM 产生一个隐状态 h_l

**ELMo 表示**：对 L+1 层表示做加权和：

```
ELMo_k = γ · Σ_{l=0}^{L} s_l · h_{l,k}
```

其中 s_l 是可学习的层权重（softmax 归一化），γ 是缩放因子，k 是词位置。

**关键创新**：不同下游任务可以学习不同的层权重 s_l——底层（l=0）更偏句法，高层更偏语义。

```python
# ELMo 的概念性实现（简化版）
import torch
import torch.nn as nn

class SimplifiedELMo(nn.Module):
    """ELMo 简化实现（演示核心思想）
    
    真实 ELMo 使用字符 CNN + 双向 LSTM，
    这里用简化的 Embedding + BiLSTM 演示原理。
    """
    
    def __init__(self, vocab_size: int, embed_dim: int = 128,
                 hidden_dim: int = 256, num_layers: int = 2):
        super().__init__()
        self.num_layers = num_layers
        
        # 词 Embedding（第 0 层表示）
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        
        # 前向 LSTM
        self.forward_lstms = nn.ModuleList([
            nn.LSTM(embed_dim if l == 0 else hidden_dim, 
                   hidden_dim, batch_first=True)
            for l in range(num_layers)
        ])
        
        # 后向 LSTM
        self.backward_lstms = nn.ModuleList([
            nn.LSTM(embed_dim if l == 0 else hidden_dim,
                   hidden_dim, batch_first=True)
            for l in range(num_layers)
        ])
        
        # 投影层：将每层输出统一到相同维度
        self.projections = nn.ModuleList([
            nn.Linear(embed_dim if l == 0 else hidden_dim * 2, embed_dim)
            for l in range(num_layers + 1)
        ])
    
    def forward(self, input_ids: torch.Tensor) -> list:
        """前向传播，返回每层的上下文相关表示
        
        Args:
            input_ids: [batch_size, seq_len]
            
        Returns:
            layer_outputs: L+1 个张量的列表，每个 shape=[B, T, embed_dim]
        """
        # 第 0 层：静态 Embedding
        x = self.embedding(input_ids)  # [B, T, embed_dim]
        
        layer_outputs = [self.projections[0](x)]  # 第0层
        
        forward_input = x
        backward_input = x.flip(dims=[1])  # 反转序列
        
        for l in range(self.num_layers):
            # 前向 LSTM
            forward_out, _ = self.forward_lstms[l](forward_input)
            # 后向 LSTM
            backward_out, _ = self.backward_lstms[l](backward_input)
            backward_out = backward_out.flip(dims=[1])  # 反转回来
            
            # 拼接双向
            bidir = torch.cat([forward_out, backward_out], dim=-1)  # [B, T, 2*hidden]
            projected = self.projections[l + 1](bidir)  # [B, T, embed_dim]
            layer_outputs.append(projected)
            
            # 下一层输入
            forward_input = forward_out
            backward_input = backward_out.flip(dims=[1])
        
        return layer_outputs


class ELMoForTask(nn.Module):
    """为下游任务组合 ELMo 各层表示"""
    
    def __init__(self, elmo: SimplifiedELMo):
        super().__init__()
        self.elmo = elmo
        num_layers = elmo.num_layers + 1
        
        # 可学习的层权重和缩放因子
        self.layer_weights = nn.Parameter(torch.zeros(num_layers))
        self.gamma = nn.Parameter(torch.ones(1))
    
    def forward(self, input_ids: torch.Tensor) -> torch.Tensor:
        """获取 ELMo 表示
        
        Returns:
            上下文相关的词向量 [B, T, embed_dim]
        """
        layer_outputs = self.elmo(input_ids)  # L+1 个 [B, T, d]
        
        # Softmax 归一化层权重
        weights = torch.softmax(self.layer_weights, dim=0)
        
        # 加权和
        elmo_repr = torch.zeros_like(layer_outputs[0])
        for l, output in enumerate(layer_outputs):
            elmo_repr += weights[l] * output
        
        return self.gamma * elmo_repr


# 演示
vocab_size = 5000
elmo_base = SimplifiedELMo(vocab_size, embed_dim=128, hidden_dim=256, num_layers=2)
elmo_task = ELMoForTask(elmo_base)

# 模拟输入
input_ids = torch.randint(0, vocab_size, (2, 10))  # batch=2, seq_len=10
output = elmo_task(input_ids)
print(f"ELMo 输出 shape: {output.shape}")  # [2, 10, 128]
print(f"层权重: {torch.softmax(elmo_task.layer_weights, dim=0).data}")
```

### 12.3 BERT 的 Embedding（简述）

BERT（Bidirectional Encoder Representations from Transformers, 2018）将上下文 Embedding 推向了新高度：

**BERT 的 Embedding 组成**（三者相加）：

```
BERT_embedding(token_i) = TokenEmb(token_i) + SegmentEmb(segment_i) + PosEmb(position_i)
```

- **Token Embedding**：WordPiece 子词的向量（类似 FastText 的思路）
- **Segment Embedding**：区分句子 A/B（只有两个向量）
- **Position Embedding**：可学习的绝对位置向量（最长 512）

**与 ELMo 的关键区别**：

| 维度 | ELMo | BERT |
|------|------|------|
| 编码器 | 双向 LSTM（分开训练前后向） | Transformer（真正双向注意力） |
| 预训练任务 | 语言模型（预测下一个词） | MLM + NSP（掩码预测 + 句对关系） |
| 上下文交互 | 有限（受 LSTM 长距离衰减） | 全局（自注意力直接关联任意位置） |
| 使用方式 | 固定 ELMo，学习层权重 | 整体微调所有参数 |
| 效果 | 当时 SOTA | 大幅超越 ELMo |

```python
# 使用 HuggingFace transformers 获取 BERT Embedding
# pip install transformers

from transformers import BertTokenizer, BertModel
import torch

# 加载预训练 BERT
tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
model = BertModel.from_pretrained('bert-base-uncased')
model.eval()

# 同一个词在不同上下文中的表示不同
sentences = [
    "I deposited money in the bank",      # bank = 银行
    "The river bank was covered in mud",   # bank = 河岸
]

for sent in sentences:
    inputs = tokenizer(sent, return_tensors='pt')
    with torch.no_grad():
        outputs = model(**inputs)
    
    # 获取 'bank' 的上下文向量
    tokens = tokenizer.tokenize(sent)
    bank_idx = tokens.index('bank') + 1  # +1 for [CLS]
    bank_vec = outputs.last_hidden_state[0, bank_idx]
    print(f"'{sent}'")
    print(f"  'bank' 向量前5维: {bank_vec[:5].tolist()}")
    print(f"  向量范数: {bank_vec.norm().item():.4f}")
    print()

# 两个 'bank' 的向量不同——因为上下文不同！
```

### 12.4 从静态到动态 Embedding 的演进总结

```
1. One-Hot (稀疏、无语义) 
   → 2. Word2Vec/GloVe (稠密、有语义、静态)
   → 3. ELMo (上下文相关、多层融合)
   → 4. BERT/GPT (Transformer、深度上下文、可微调)
   → 5. GPT-3/4 (超大规模、涌现能力)
```

每一代 Embedding 的进步核心：
- 1→2：从稀疏到稠密，获得语义相似度
- 2→3：从静态到动态，解决多义词
- 3→4：从浅层到深层，获得深度语义理解
- 4→5：从中等规模到超大规模，获得涌现能力

---

## 13. Embedding 的可视化与评估

### 13.1 可视化方法

将高维词向量降到 2D/3D 进行可视化，常用方法：

**t-SNE（t-distributed Stochastic Neighbor Embedding）**：
- 非线性降维，保持局部邻域结构
- 适合可视化聚类结构
- 缺点：全局距离不可靠，不同运行结果不同

**PCA（Principal Component Analysis）**：
- 线性降维，保持全局方差
- 快速，可解释（每个主成分有含义）
- 缺点：线性假设，可能丢失非线性结构

**UMAP（Uniform Manifold Approximation and Projection）**：
- 比 t-SNE 更好地保持全局结构
- 速度更快
- 近年使用越来越多

```python
import numpy as np
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
# import matplotlib.pyplot as plt  # 实际使用时取消注释

def visualize_embeddings(embeddings: np.ndarray, words: list, 
                         method: str = 'tsne', perplexity: int = 30):
    """可视化词向量
    
    Args:
        embeddings: shape=(n_words, dim) 的词向量矩阵
        words: 对应的词列表
        method: 'tsne' 或 'pca'
        perplexity: t-SNE 的困惑度参数
    """
    if method == 'tsne':
        reducer = TSNE(n_components=2, perplexity=min(perplexity, len(words)-1),
                      random_state=42, n_iter=1000)
        coords = reducer.fit_transform(embeddings)
    elif method == 'pca':
        reducer = PCA(n_components=2)
        coords = reducer.fit_transform(embeddings)
        explained = reducer.explained_variance_ratio_
        print(f"PCA 解释方差: PC1={explained[0]:.3f}, PC2={explained[1]:.3f}")
    else:
        raise ValueError(f"Unknown method: {method}")
    
    # 打印坐标（文本形式替代图形）
    print(f"\n{method.upper()} 降维结果:")
    for i, word in enumerate(words):
        print(f"  {word:12s} → ({coords[i,0]:7.3f}, {coords[i,1]:7.3f})")
    
    # 实际使用时用 matplotlib 画图：
    # plt.figure(figsize=(12, 8))
    # plt.scatter(coords[:, 0], coords[:, 1], alpha=0.6)
    # for i, word in enumerate(words):
    #     plt.annotate(word, (coords[i, 0], coords[i, 1]))
    # plt.title(f'Word Embeddings ({method.upper()})')
    # plt.savefig('word_embeddings.png', dpi=150)
    
    return coords


# 演示
np.random.seed(42)
# 模拟一些有聚类结构的词向量
words = ['king', 'queen', 'prince', 'princess',  # 王室
         'cat', 'dog', 'bird', 'fish',            # 动物
         'happy', 'sad', 'angry', 'calm']          # 情感

# 模拟向量：同类词向量接近
embeddings = np.random.randn(12, 50) * 0.1
# 人为让同类词接近
for i in range(0, 4):   embeddings[i] += np.array([1.0] * 25 + [0.0] * 25)
for i in range(4, 8):   embeddings[i] += np.array([0.0] * 25 + [1.0] * 25)
for i in range(8, 12):  embeddings[i] += np.array([-1.0] * 25 + [-1.0] * 25)

coords = visualize_embeddings(embeddings, words, method='pca')
```

### 13.2 内在评估（Intrinsic Evaluation）

内在评估直接测量词向量质量，不依赖下游任务：

**词类比测试（Word Analogy）**：
- 数据集：Google Analogy Dataset（19544 题）
- 任务：a:b :: c:? → 找 d 使得 vec(d) ≈ vec(b) - vec(a) + vec(c)
- 类别：语义类比（king:queen :: man:woman）、句法类比（walk:walked :: run:ran）

**词相似度测试（Word Similarity）**：
- 数据集：WordSim-353, SimLex-999, MEN
- 任务：计算词对的余弦相似度，与人类评分做 Spearman 相关

```python
import numpy as np
from scipy.stats import spearmanr
from typing import List, Tuple, Dict

def evaluate_word_similarity(
    embeddings: np.ndarray,
    word2idx: Dict[str, int],
    test_pairs: List[Tuple[str, str, float]]
) -> Tuple[float, int]:
    """词相似度评估
    
    Args:
        embeddings: 词向量矩阵
        word2idx: 词到索引映射
        test_pairs: [(word1, word2, human_score), ...]
    
    Returns:
        (spearman_correlation, num_evaluated_pairs)
    """
    human_scores = []
    model_scores = []
    
    for w1, w2, score in test_pairs:
        if w1 not in word2idx or w2 not in word2idx:
            continue
        
        v1 = embeddings[word2idx[w1]]
        v2 = embeddings[word2idx[w2]]
        
        # 余弦相似度
        cos_sim = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-8)
        
        human_scores.append(score)
        model_scores.append(cos_sim)
    
    if len(human_scores) < 2:
        return 0.0, 0
    
    correlation, p_value = spearmanr(human_scores, model_scores)
    return correlation, len(human_scores)


def evaluate_analogy(
    embeddings: np.ndarray,
    word2idx: Dict[str, int],
    idx2word: Dict[int, str],
    analogies: List[Tuple[str, str, str, str]]
) -> Tuple[float, int, int]:
    """词类比评估
    
    Args:
        analogies: [(a, b, c, d), ...] 其中 a:b :: c:d
    
    Returns:
        (accuracy, correct, total)
    """
    correct = 0
    total = 0
    
    # 预计算所有向量的归一化版本
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-8
    normalized = embeddings / norms
    
    for a, b, c, d in analogies:
        if any(w not in word2idx for w in [a, b, c, d]):
            continue
        
        total += 1
        
        # 目标向量: b - a + c
        va = normalized[word2idx[a]]
        vb = normalized[word2idx[b]]
        vc = normalized[word2idx[c]]
        target = vb - va + vc
        
        # 归一化目标
        target = target / (np.linalg.norm(target) + 1e-8)
        
        # 计算与所有词的余弦相似度
        sims = normalized @ target
        
        # 排除输入词
        for w in [a, b, c]:
            sims[word2idx[w]] = -np.inf
        
        # 预测
        predicted_idx = np.argmax(sims)
        if idx2word[predicted_idx] == d:
            correct += 1
    
    accuracy = correct / total if total > 0 else 0.0
    return accuracy, correct, total


# ===== 评估示例 =====
# 模拟测试数据
test_similarity = [
    ("cat", "dog", 7.5),
    ("cat", "car", 2.1),
    ("happy", "glad", 8.9),
    ("happy", "sad", 1.5),
]

test_analogy = [
    ("man", "king", "woman", "queen"),
    ("walk", "walked", "run", "ran"),
]

print("词相似度评估和类比评估的框架已实现")
print("实际评估需要加载预训练向量和标准测试集")
```

### 13.3 外在评估（Extrinsic Evaluation）

外在评估通过下游 NLP 任务间接评价词向量质量：

| 任务 | 说明 | 衡量指标 |
|------|------|----------|
| 文本分类 | 用词向量初始化，在分类任务上评估 | Accuracy / F1 |
| 命名实体识别 | 作为 NER 模型的输入特征 | F1 |
| 句法分析 | 依存分析或短语结构分析 | UAS / LAS |
| 机器翻译 | 作为编码器的初始 Embedding | BLEU |
| 情感分析 | 判断文本情感极性 | Accuracy |

一般规律：在内在评估上表现好的词向量，在外在评估上也倾向于表现好，但不绝对。选择词向量时应以目标任务的性能为最终标准。

---

## 14. 工程实践与调优经验

### 14.1 词向量维度选择

| 场景 | 推荐维度 | 理由 |
|------|---------|------|
| 小语料（<1亿词） | 50~100 | 数据量不足以支撑高维向量 |
| 中等语料（1~10亿词） | 100~300 | 主流选择，效果与效率的平衡 |
| 大语料（>10亿词） | 300~1024 | 充足数据支撑更多维度 |
| Transformer 模型内部 | 768~4096 | 模型容量大，需要高维表示 |
| 移动端/嵌入式 | 32~64 | 内存受限，可用量化进一步压缩 |

**经验法则**：维度 d 的选择与词表大小 V 和语料大小 N 相关。Mikolov 建议 d ∝ log(V)，但实践中 300 维是最常用的通用选择。

### 14.2 训练超参数建议

```python
# Word2Vec 最佳实践配置
word2vec_config = {
    # 模型选择
    'architecture': 'skip-gram',      # skip-gram 适合小语料、稀有词
                                       # cbow 适合大语料、高频词
    
    # 核心超参数
    'embedding_dim': 300,              # 标准维度
    'window_size': 5,                  # skip-gram 用 5~10，cbow 用 5
    'min_count': 5,                    # 过滤低频词（大语料可用 10~50）
    'neg_samples': 5,                  # 负采样数（小语料用 10~20）
    'subsample_threshold': 1e-5,       # 高频词降采样
    
    # 训练参数
    'learning_rate': 0.025,            # Skip-Gram 初始学习率
    'lr_decay': 'linear',             # 线性衰减到 min_lr
    'min_lr': 0.0001,
    'epochs': 5,                       # 大语料 1~5 轮，小语料 10~50 轮
    'workers': 8,                      # 多线程训练
}

# GloVe 最佳实践配置
glove_config = {
    'embedding_dim': 300,
    'window_size': 15,                 # GloVe 通常用更大窗口
    'x_max': 100,                      # 权重函数截断
    'alpha': 0.75,                     # 权重函数幂次
    'learning_rate': 0.05,             # AdaGrad 学习率
    'epochs': 50,                      # 迭代次数（比 W2V 多）
    'min_count': 5,
}

# FastText 最佳实践配置
fasttext_config = {
    'embedding_dim': 300,
    'window_size': 5,
    'min_count': 5,
    'min_n': 3,                        # 最小 n-gram 长度
    'max_n': 6,                        # 最大 n-gram 长度
    'neg_samples': 5,
    'learning_rate': 0.05,
    'epochs': 5,
}

print("超参数配置示例已定义")
print("实际训练时需根据语料规模和目标任务调整")
```

### 14.3 常见陷阱与解决方案

**陷阱 1：词表过大导致内存溢出**

```python
# 问题：100万词 × 300维 × 4字节 = 1.2 GB 仅 Embedding 层
# 解决方案：

# 方案一：限制词表大小
max_vocab_size = 50000  # 通常 3~5 万已覆盖 95%+ 文本

# 方案二：使用子词模型（BPE/WordPiece/SentencePiece）
# 将词表控制在 3~5 万个 subword unit

# 方案三：权重共享（Weight Tying）
# 输入 Embedding 和输出 Softmax 层共享权重
class SharedEmbeddingModel(nn.Module):
    def __init__(self, vocab_size, embed_dim):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        self.output_proj = nn.Linear(embed_dim, vocab_size, bias=False)
        # 共享权重！
        self.output_proj.weight = self.embedding.weight
    
    def forward(self, x):
        emb = self.embedding(x)
        logits = self.output_proj(emb)
        return logits
```

**陷阱 2：微调 vs 冻结预训练 Embedding**

```python
# 经验法则：
# - 训练数据充足（>10万样本）：微调（freeze=False）
# - 训练数据稀缺（<1万样本）：冻结（freeze=True）
# - 折中方案：先冻结训练几轮，再解冻微调

class GradualUnfreeze:
    """渐进解冻策略"""
    def __init__(self, model, unfreeze_epoch=3):
        self.model = model
        self.unfreeze_epoch = unfreeze_epoch
        # 初始冻结
        model.embedding.weight.requires_grad = False
    
    def step(self, epoch):
        if epoch >= self.unfreeze_epoch:
            self.model.embedding.weight.requires_grad = True
            print(f"Epoch {epoch}: Embedding 解冻，开始微调")
```

**陷阱 3：OOV 处理策略**

```python
def handle_oov(word: str, word2idx: dict, embeddings: np.ndarray, 
               strategy: str = 'random') -> np.ndarray:
    """处理未登录词
    
    策略：
    1. random: 随机初始化（均匀分布）
    2. zero: 零向量
    3. avg: 所有已知词的平均向量
    4. subword: 子词组合（类似 FastText）
    """
    if word in word2idx:
        return embeddings[word2idx[word]]
    
    dim = embeddings.shape[1]
    
    if strategy == 'random':
        # 初始化范围与已有向量的标准差匹配
        std = embeddings.std()
        return np.random.randn(dim).astype(np.float32) * std
    elif strategy == 'zero':
        return np.zeros(dim, dtype=np.float32)
    elif strategy == 'avg':
        return embeddings.mean(axis=0)
    elif strategy == 'subword':
        # 简化的子词方法：取词的所有 3-gram 中已知词的平均
        ngrams = [word[i:i+3] for i in range(len(word)-2)]
        known_vecs = [embeddings[word2idx[ng]] for ng in ngrams if ng in word2idx]
        if known_vecs:
            return np.mean(known_vecs, axis=0)
        else:
            return np.random.randn(dim).astype(np.float32) * embeddings.std()
    else:
        raise ValueError(f"Unknown strategy: {strategy}")
```

### 14.4 词向量的存储与加载

```python
import numpy as np
import json
import struct
from typing import Dict

def save_word2vec_format(filepath: str, word2idx: Dict[str, int], 
                         embeddings: np.ndarray, binary: bool = True):
    """以 Word2Vec 格式保存词向量
    
    兼容 gensim 加载格式
    """
    vocab_size, dim = embeddings.shape
    
    if binary:
        with open(filepath, 'wb') as f:
            # 头部：词表大小 维度
            header = f"{vocab_size} {dim}\n"
            f.write(header.encode('utf-8'))
            
            # 按索引顺序写入
            idx2word = {i: w for w, i in word2idx.items()}
            for i in range(vocab_size):
                word = idx2word[i]
                f.write(f"{word} ".encode('utf-8'))
                f.write(embeddings[i].tobytes())  # float32 二进制
                f.write(b'\n')
    else:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"{vocab_size} {dim}\n")
            idx2word = {i: w for w, i in word2idx.items()}
            for i in range(vocab_size):
                word = idx2word[i]
                vec_str = ' '.join(f"{v:.6f}" for v in embeddings[i])
                f.write(f"{word} {vec_str}\n")
    
    print(f"保存完成: {filepath} ({vocab_size} words, {dim}d, {'binary' if binary else 'text'})")


# 使用 numpy 的高效格式（推荐用于内部使用）
def save_numpy_format(filepath: str, word2idx: Dict[str, int], embeddings: np.ndarray):
    """用 numpy 格式保存（加载速度最快）"""
    np.savez_compressed(
        filepath,
        embeddings=embeddings,
        vocab=json.dumps(word2idx)  # 词表作为 JSON 字符串
    )
    print(f"保存完成: {filepath}.npz")

def load_numpy_format(filepath: str):
    """加载 numpy 格式的词向量"""
    data = np.load(filepath + '.npz' if not filepath.endswith('.npz') else filepath)
    embeddings = data['embeddings']
    word2idx = json.loads(str(data['vocab']))
    return word2idx, embeddings
```

---

## 15. 常见面试题与解答

### Q1: Word2Vec 的 Skip-Gram 和 CBOW 有什么区别？各自适用场景？

**答**：

Skip-Gram 给定中心词预测上下文，CBOW 给定上下文预测中心词。

Skip-Gram 对每个 (center, context) 对产生一个训练样本，相当于对低频词有更多的训练机会（每个上下文位置都产生一个样本）。CBOW 把所有上下文取平均作为输入，对高频词有平滑效果。

适用场景：Skip-Gram 在小语料上和低频词上表现更好；CBOW 训练更快（一个窗口只产生一次预测），在大语料和高频词上效果好。工业界最常用 Skip-Gram + Negative Sampling（SGNS）。

### Q2: Word2Vec 中负采样的作用是什么？为什么用 3/4 次方？

**答**：

作用：避免对整个词表做 Softmax（O(|V|) 太贵），只对 K 个负样本做二分类判别（O(K)）。本质是把多分类问题转化为多个二分类问题。

为什么用 P(w)^{3/4}：
- 如果用均匀分布采样，高频词和低频词被选中概率相同，但低频词本来就很少作为正样本出现，应该更多被采为负样本
- 如果按原始频率采样 P(w)^1，高频词（the, a, is）会被过度采样为负样本
- P(w)^{3/4} 是折中：相对均匀提升了低频词的采样概率，但没有完全抹平频率差异

### Q3: GloVe 和 Word2Vec 的本质区别是什么？

**答**：

表面区别：GloVe 基于全局共现矩阵，Word2Vec 基于局部窗口预测。GloVe 直接优化加权最小二乘损失，Word2Vec 优化交叉熵/负采样损失。

本质联系：Levy & Goldberg (2014) 证明 SGNS 等价于隐式分解移位后的 PMI 矩阵。GloVe 直接对 log 共现矩阵做加权拟合。两者都在捕获词的共现统计信息，只是方式不同。

实践差异：GloVe 需要先统计全局共现（内存开销大），但训练过程可并行；Word2Vec 在线训练，内存友好，适合流式数据。

### Q4: 为什么 Embedding 维度不是越大越好？

**答**：

维度过大的问题：过拟合（特别是训练数据不够时）、计算开销增加（下游模型参数量增加）、稀疏性（高维空间中点趋于等距，"维度诅咒"）。

经验：维度 d 应与训练数据量 N 匹配。经验公式 d ∝ N^{1/4}（来自理论分析）。实践中 300 维是被验证的黄金维度——在多数基准测试上，300 维与 1000 维差距极小，但计算量小得多。

### Q5: 如何处理词向量中的偏见（Bias）？

**答**：

问题：词向量从训练语料中学到的不仅有语义，还有社会偏见。如 vec("he") - vec("she") 方向与 vec("doctor") - vec("nurse") 方向高度相关。

解决方案：
- 去偏（Debiasing）：Bolukbasi et al. (2016) 提出识别偏见方向（如性别方向），然后将与该方向相关但不应有性别含义的词投影到垂直于偏见方向的超平面上
- 反事实数据增强（CDA）：在训练数据中交换性别词（he↔she, king↔queen），使模型学到对称表示
- 约束训练：在目标函数中加入公平性约束

### Q6: nn.Embedding 和 nn.Linear 的区别与联系？

**答**：

数学上等价：embedding(i) = one_hot(i) × W = W[i]。nn.Embedding 就是 nn.Linear（无偏置）在输入为 One-Hot 时的特例。

实现区别：nn.Embedding 直接用索引查表（O(d)），nn.Linear 做完整矩阵乘法（O(V×d)）。当 V 很大时（如5万），Embedding 快 V 倍。

梯度区别：Embedding 只有被选中的行有梯度（稀疏更新），Linear 整个权重矩阵都参与计算。Embedding 可以用 sparse=True 配合 SparseAdam 进一步优化。

### Q7: 预训练词向量应该微调还是冻结？

**答**：

取决于两个因素：下游任务的训练数据量，以及预训练向量与目标领域的匹配度。

- 数据充足 + 领域匹配：微调（效果最好）
- 数据充足 + 领域不匹配：微调（让向量适应新领域）
- 数据稀缺 + 领域匹配：冻结或轻微微调（避免过拟合）
- 数据稀缺 + 领域不匹配：冻结预训练部分，只训练上层

最佳实践：先冻结训练几轮（让上层参数warm up），再解冻 Embedding 一起微调。学习率可以对 Embedding 设置更小的值（discriminative fine-tuning）。

### Q8: Word2Vec 如何处理多义词？

**答**：

标准 Word2Vec 无法处理多义词——每个词只有一个向量。这是静态词向量的根本局限。

解决方案：
- 多原型模型（Huang et al. 2012）：为每个词学习多个向量（通过聚类上下文）
- ELMo（2018）：用 BiLSTM 语言模型生成上下文相关向量
- BERT（2018）：Transformer 注意力机制生成深度上下文表示

现代 NLP 中，多义词问题已被上下文 Embedding 彻底解决。

### Q9: 词向量如何用于句子/文档表示？

**答**：

简单方法：
- 平均池化：句向量 = 所有词向量的均值（简单有效的 baseline）
- 加权平均：用 TF-IDF 或 SIF（Smooth Inverse Frequency）权重
- 最大池化：每个维度取所有词向量中的最大值

高级方法：
- Doc2Vec / Paragraph Vector：学习文档级向量（Word2Vec 的扩展）
- Sentence-BERT：用 BERT + 对比学习生成句向量
- SimCSE：无监督/有监督对比学习的句向量

### Q10: 词向量训练的语料预处理有哪些注意事项？

**答**：

关键预处理步骤：
- 分词：英文通常按空格，中文需要 jieba/pkuseg 等分词工具
- 大小写处理：通常统一为小写（除非大小写有语义区分）
- 去除/保留标点：语言模型通常保留，纯词向量训练可去除
- 数字处理：可替换为统一 token（如 <NUM>）或保留
- 低频词过滤：min_count=5~10 过滤噪声
- 高频词降采样：t=1e-5 降低 the/a/is 等停用词的影响
- 特殊 token：添加 <PAD>、<UNK>、<BOS>、<EOS> 等

---

## 16. 易错点与最佳实践

### 16.1 常见错误

**错误 1：混淆相似度和距离**

```python
# ❌ 错误：直接用欧氏距离比较不同模型的词向量
# 不同训练的词向量空间不可比（因为存在旋转不变性）
dist = np.linalg.norm(model_A['cat'] - model_B['cat'])  # 无意义！

# ✓ 正确：在同一模型内用余弦相似度
sim = cosine_similarity(model['cat'], model['dog'])
```

**错误 2：忘记归一化**

```python
# ❌ 错误：直接用内积做相似度
sim = np.dot(v1, v2)  # 受向量长度影响！高频词通常范数小

# ✓ 正确：使用余弦相似度（L2 归一化后的内积）
sim = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

# 或者预先归一化所有向量
normalized_embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
```

**错误 3：在小数据上训练 Word2Vec**

```python
# ❌ 错误：在 1000 条句子上训练 Word2Vec
# 结果：向量质量极差，不如随机

# ✓ 正确做法：
# 1. 小数据直接用预训练向量（GloVe/FastText）
# 2. 如果必须训练，用小维度（50维）、更多 epoch、更多负样本
# 3. 或者用 BERT 等预训练模型的 Embedding
```

**错误 4：Embedding 层的 padding_idx 处理**

```python
# ❌ 错误：忘记设置 padding_idx，导致 PAD token 有非零向量
embedding = nn.Embedding(vocab_size, dim)
# PAD token 的向量会参与后续计算，引入噪声

# ✓ 正确：
embedding = nn.Embedding(vocab_size, dim, padding_idx=0)
# padding_idx=0 的向量始终为零且不更新
```

**错误 5：类比推理时不排除输入词**

```python
# ❌ 错误：king - man + woman 的最近邻可能就是 king 本身
target = v_king - v_man + v_woman
result = most_similar(target)  # 很可能返回 'king'！

# ✓ 正确：排除输入词后再找最近邻
exclude = {'king', 'man', 'woman'}
result = most_similar(target, exclude=exclude)
```

### 16.2 最佳实践总结

| 实践 | 说明 |
|------|------|
| 优先用预训练向量 | 除非有大规模领域语料，否则用 GloVe/FastText 预训练向量 |
| 领域适配 | 在通用预训练基础上，用领域语料继续训练（增量训练） |
| 维度选择 | 通用 300 维；资源受限用 100 维；Transformer 内部 768+ |
| OOV 策略 | 优先用 FastText（子词）；否则用 <UNK> 的随机初始化 |
| 评估 | 内在评估（类比/相似度）快速迭代 + 外在评估（目标任务）最终决策 |
| 去偏 | 在公平性敏感场景（招聘、信贷）必须做去偏处理 |
| 版本管理 | 词向量版本与模型绑定，避免训练/推理不一致 |

---

## 17. 横向对比与知识网络

### 17.1 词向量方法全景对比

| 方法 | 类型 | 信息来源 | OOV | 多义词 | 训练速度 | 表示质量 |
|------|------|---------|-----|--------|---------|----------|
| One-Hot | 离散 | 无 | ✗ | ✗ | N/A | 差 |
| TF-IDF | 稀疏 | 文档频率 | ✗ | ✗ | 快 | 一般 |
| SVD (PPMI) | 稠密/静态 | 全局共现 | ✗ | ✗ | 慢 | 良 |
| Word2Vec | 稠密/静态 | 局部窗口 | ✗ | ✗ | 快 | 良 |
| GloVe | 稠密/静态 | 全局+局部 | ✗ | ✗ | 中 | 良 |
| FastText | 稠密/静态 | 局部+子词 | ✓ | ✗ | 中 | 良+ |
| ELMo | 稠密/动态 | 双向LM | ✗ | ✓ | 慢 | 优 |
| BERT | 稠密/动态 | 双向Transformer | ✓(子词) | ✓ | 很慢 | 优+ |
| GPT | 稠密/动态 | 单向Transformer | ✓(子词) | ✓ | 很慢 | 优+ |

### 17.2 知识网络：Embedding 在 NLP 中的位置

```
                         NLP 技术栈
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    文本预处理          表示学习            下游任务
    (分词/BPE)      (Embedding)        (分类/NER/QA)
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    静态 Embedding   动态 Embedding   多模态 Embedding
    (W2V/GloVe)     (BERT/GPT)      (CLIP/ViLBERT)
         │              │
    ┌────┴────┐    ┌───┴────┐
    │         │    │        │
  计数型   预测型  LSTM型  Transformer型
  (SVD)   (SGNS) (ELMo)  (BERT/GPT)
```

### 17.3 与后续章节的联系

- **第3篇·注意力机制**：注意力计算的基础是向量内积/相似度 → 直接建立在 Embedding 空间上
- **第4篇·Transformer**：输入 Embedding + 位置编码 → 本篇的延伸
- **第5篇·位置编码**：给 Embedding 注入位置信息，弥补其对位置的不敏感
- **第6篇·Tokenizer**：BPE/WordPiece 决定了 Embedding 的基本单位（从词级到子词级）
- **第7篇·预训练**：GPT/BERT 的预训练本质上是在学习更好的上下文 Embedding

---

## 18. 参考文献

1. Mikolov, T., et al. (2013). "Efficient Estimation of Word Representations in Vector Space." arXiv:1301.3781
2. Mikolov, T., et al. (2013). "Distributed Representations of Words and Phrases and their Compositionality." NeurIPS 2013
3. Pennington, J., Socher, R., Manning, C. (2014). "GloVe: Global Vectors for Word Representation." EMNLP 2014
4. Bojanowski, P., et al. (2017). "Enriching Word Vectors with Subword Information." TACL 2017
5. Levy, O., Goldberg, Y. (2014). "Neural Word Embedding as Implicit Matrix Factorization." NeurIPS 2014
6. Peters, M., et al. (2018). "Deep contextualized word representations (ELMo)." NAACL 2018
7. Devlin, J., et al. (2019). "BERT: Pre-training of Deep Bidirectional Transformers." NAACL 2019
8. Harris, Z. (1954). "Distributional Structure." Word 10(2-3)
9. Bengio, Y., et al. (2003). "A Neural Probabilistic Language Model." JMLR 2003
10. Bolukbasi, T., et al. (2016). "Man is to Computer Programmer as Woman is to Homemaker? Debiasing Word Embeddings." NeurIPS 2016
11. Goldberg, Y., Levy, O. (2014). "word2vec Explained: Deriving Mikolov et al.'s Negative-Sampling Word-Embedding Method." arXiv:1402.3722
12. Rong, X. (2014). "word2vec Parameter Learning Explained." arXiv:1411.2738