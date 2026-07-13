# Tokenizer 与 BPE 详解

> **关键词**：Tokenizer（分词器）、Byte Pair Encoding（字节对编码）、WordPiece、Unigram、SentencePiece、tiktoken、子词分词（Subword Tokenization）
>
> **前置知识**：[05-位置编码](./05-位置编码.md)、[02-词向量与Embedding](./02-词向量与Embedding.md)
>
> **代码环境**：Python 3.10+、PyTorch 2.x、transformers 4.x、sentencepiece、tiktoken

---

## 目录

1. [什么是 Tokenizer](#1-什么是-tokenizer)
2. [为什么需要子词分词](#2-为什么需要子词分词)
3. [字符级、词级与子词级分词对比](#3-字符级词级与子词级分词对比)
4. [BPE 算法详解](#4-bpe-算法详解)
5. [BPE 的变体：Byte-Level BPE](#5-bpe-的变体byte-level-bpe)
6. [WordPiece 算法详解](#6-wordpiece-算法详解)
7. [Unigram 语言模型分词](#7-unigram-语言模型分词)
8. [SentencePiece 框架](#8-sentencepiece-框架)
9. [tiktoken 与 OpenAI 的分词方案](#9-tiktoken-与-openai-的分词方案)
10. [从零实现 BPE 分词器](#10-从零实现-bpe-分词器)
11. [使用 Hugging Face tokenizers 库](#11-使用-hugging-face-tokenizers-库)
12. [训练自定义 Tokenizer 实战](#12-训练自定义-tokenizer-实战)
13. [Tokenizer 与模型的关系](#13-tokenizer-与模型的关系)
14. [特殊 Token 的设计与作用](#14-特殊-token-的设计与作用)
15. [中文与多语言分词的挑战](#15-中文与多语言分词的挑战)
16. [Tokenizer 的性能优化](#16-tokenizer-的性能优化)
17. [常见坑与最佳实践](#17-常见坑与最佳实践)
18. [各主流模型 Tokenizer 横向对比](#18-各主流模型-tokenizer-横向对比)
19. [复杂度分析](#19-复杂度分析)
20. [面试题精选与解析](#20-面试题精选与解析)
21. [参考资料](#21-参考资料)

---

## 1. 什么是 Tokenizer

### 1.1 定义与角色

Tokenizer（分词器/标记器）是自然语言处理（NLP）流水线中最基础、最关键的组件之一。它的核心职责是将**原始文本字符串**转换为**离散的 token 序列**（通常表示为整数 ID），使之能被神经网络模型处理。

在大语言模型（LLM）的语境中，Tokenizer 承担着双向转换的角色：编码（Encode）将文本转为 token ID 序列，解码（Decode）将 token ID 序列还原为文本。

这看似简单的过程，实际上蕴含着大量设计决策，直接影响模型的词汇量大小、训练效率、推理速度、多语言能力，甚至生成质量。

### 1.2 Tokenizer 在 LLM 中的位置

在典型的 LLM 架构中，Tokenizer 处于模型的最前端和最末端：

```
用户输入文本
    │
    ▼
┌─────────────────────┐
│  Tokenizer.encode() │  ← 文本 → token IDs
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Embedding Layer    │  ← token ID → 向量
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Transformer Blocks │  ← 核心计算
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  LM Head (Softmax)  │  ← 向量 → token ID 概率
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Tokenizer.decode() │  ← token IDs → 文本
└─────────────────────┘
          │
          ▼
    模型输出文本
```

Tokenizer 不是模型的一部分（不含可学习参数），但它与模型是**强绑定**的：一个模型只能使用训练时匹配的 Tokenizer，否则 token ID 与 Embedding 矩阵的行号对不上，输出就是乱码。

### 1.3 Tokenizer 的核心组成

一个完整的 Tokenizer 通常包含以下几个组件：

| 组件 | 功能 | 示例 |
|------|------|------|
| **Normalizer** | 文本标准化（大小写、Unicode 正规化、去除多余空白等） | NFKC 标准化 |
| **Pre-tokenizer** | 初步切分（按空格、标点等规则预分词） | 按空格和标点分割 |
| **Model（核心算法）** | 子词切分（BPE / WordPiece / Unigram） | 频率驱动的合并或拆分 |
| **Post-processor** | 添加特殊 token | 在首尾添加特殊标记 |
| **Decoder** | 将 token 序列还原为可读文本 | 去除特殊前缀/后缀并拼接 |

---

## 2. 为什么需要子词分词

### 2.1 词级分词的困境

最直觉的分词方式是按空格切分（英文）或按字典匹配切分（中文），得到完整的单词。但这种方式面临严重问题：

**问题一：OOV（Out-of-Vocabulary，未登录词）**

词汇表是固定的，训练时没见过的词在推理时无法处理。例如，如果词汇表里没有 "ChatGPT"，模型就只能将其映射为一个 `[UNK]`（未知）标记，丢失全部语义信息。

```python
# 词级分词的 OOV 问题
vocab = {"I", "love", "Python", "programming"}
text = "I love PyTorch"
tokens = text.split()  # ["I", "love", "PyTorch"]
# "PyTorch" 不在词汇表中 → [UNK]
# 模型完全不知道用户在说什么
```

**问题二：词汇表爆炸**

英语大约有 50 万个常用单词（含各种变形），加上专有名词、技术术语、网络用语等，词汇表很容易膨胀到数百万。而每个词都需要一行 Embedding 向量（通常 768~4096 维），存储和计算开销巨大。

**问题三：无法捕捉形态学规律**

"play"、"plays"、"played"、"playing"、"player" 这些词共享词根 "play"，但在词级分词中它们是完全独立的 token，模型需要从大量数据中自行发现它们的关联。

### 2.2 字符级分词的局限

另一个极端是按单字符切分。这解决了 OOV 问题（字符集是封闭的），但带来新问题：序列过长（Transformer 的自注意力计算量与序列长度的平方成正比 O(n^2)），以及语义稀薄（单个字符几乎不携带语义，增加学习负担）。

### 2.3 子词分词：最佳平衡点

子词分词（Subword Tokenization）是词级与字符级之间的折中方案。核心思想是：**高频词保持完整，低频词拆分为更小的、有意义的子词片段。**

```
"unhappiness" → ["un", "happiness"]  或  ["un", "happi", "ness"]
"ChatGPT"     → ["Chat", "G", "PT"]  或  ["Chat", "GPT"]
```

这样做的好处：词汇表可控（通常 30K~100K 即可），无 OOV（最坏退化为字符级），保留形态学信息（如 "un-" 作为否定前缀），序列长度适中。

### 2.4 子词分词的历史脉络

| 年份 | 方法 | 提出者 / 论文 | 首次应用 |
|------|------|--------------|---------|
| 2015 | BPE for NMT | Sennrich et al. | 机器翻译 |
| 2016 | WordPiece | Schuster & Nakajima（Google） | Google 翻译 |
| 2018 | SentencePiece | Kudo & Richardson（Google） | 多语言 NMT |
| 2018 | Unigram LM | Kudo（Google） | SentencePiece 框架内 |
| 2019 | Byte-Level BPE | Radford et al.（OpenAI） | GPT-2 |
| 2022 | tiktoken | OpenAI | GPT-3.5 / GPT-4 |

---

## 3. 字符级、词级与子词级分词对比

通过一个具体例子来直观对比三种分词粒度的差异：

**输入文本**：`"The transformer architecture revolutionized NLP"`

**词级**：`["The", "transformer", "architecture", "revolutionized", "NLP"]` — 5 个 token，词汇表巨大，新词直接 OOV。

**字符级**：`["T", "h", "e", " ", "t", "r", ...]` — 49 个 token，词汇表极小但序列暴增约 10 倍。

**子词级（BPE）**：`["The", " transform", "er", " architect", "ure", " revolution", "ized", " NL", "P"]` — 9 个 token，高频词完整保留，低频词合理拆分。

### 量化对比

| 维度 | 词级 | 字符级 | 子词级（BPE） |
|------|------|--------|--------------|
| 典型词汇量 | 100K~1M+ | 256~几千 | 30K~100K |
| 序列长度（相对） | 1x | 5~10x | 1.3~2x |
| OOV 风险 | 高 | 无 | 极低 |
| 单 token 语义量 | 高 | 极低 | 中~高 |
| Embedding 矩阵大小 | 巨大 | 极小 | 适中 |
| 主流模型是否采用 | 早期模型 | 极少 | **几乎所有** |

---

## 4. BPE 算法详解

### 4.1 BPE 的起源

BPE（Byte Pair Encoding，字节对编码）最初由 Philip Gage 于 1994 年提出，是一种简单的数据压缩算法。其核心思想是：**反复找到数据中出现频率最高的相邻字节对（byte pair），用一个新的字节替换它们**。

2015 年，Sennrich 等人在论文 *"Neural Machine Translation of Rare Words with Subword Units"* 中将 BPE 引入 NLP，用于构建子词词汇表，成为现代 Tokenizer 的基石。

### 4.2 BPE 训练过程（构建词汇表）

BPE 训练过程的目标是从训练语料中学习出一个子词词汇表和一组合并规则（merge rules）。

**算法步骤**：

```
1. 初始化：将每个词拆分为字符序列，末尾添加特殊结束符（如 </w>）
2. 统计语料中所有相邻字符对（bigram）的出现频率
3. 找到频率最高的字符对
4. 将该字符对在所有词中合并为一个新符号
5. 将新符号加入词汇表，记录此次合并规则
6. 重复步骤 2~5，直到达到目标词汇量或无法继续合并
```

**详细示例**：

假设训练语料统计出以下词频：

```
"low"     : 5 次
"lower"   : 2 次
"newest"  : 6 次
"widest"  : 3 次
```

**Step 0：初始化（字符级拆分）**

```
l o w </w>        : 5
l o w e r </w>    : 2
n e w e s t </w>  : 6
w i d e s t </w>  : 3
```

初始词汇表：`{l, o, w, e, r, n, s, t, i, d, </w>}` — 共 11 个符号

**Step 1：统计所有相邻字符对的频率**

```
(e, s) : 6 + 3 = 9    ← 最高频
(s, t) : 6 + 3 = 9    ← 并列
(t, </w>) : 6 + 3 = 9 ← 并列
(l, o) : 5 + 2 = 7
(o, w) : 5 + 2 = 7
...
```

取第一个最高频对 `(e, s)` 进行合并。

**合并规则 #1**：`e + s → es`

```
l o w </w>         : 5
l o w e r </w>     : 2
n e w es t </w>    : 6
w i d es t </w>    : 3
```

**Step 2**：重新统计，`(es, t)` 出现 9 次为最高频。

**合并规则 #2**：`es + t → est`

如此反复，直到达到预设的词汇量上限（例如 32000 个 token）。

### 4.3 BPE 编码过程（推理时分词）

训练完成后，我们得到一个有序的合并规则列表。对新文本进行分词时：

```
1. 将输入词拆分为字符序列
2. 按照训练时学到的合并规则顺序，依次检查：
   - 如果当前 token 序列中存在规则 (A, B)，就合并为 AB
3. 重复直到没有更多可用的合并规则
```

**示例**：用上面学到的规则对 "lowest" 进行编码

```
初始：  l o w e s t </w>
规则 #1 (e,s)→es：  l o w es t </w>
规则 #2 (es,t)→est： l o w est </w>
规则 #3 (est,</w>)→est</w>： l o w est</w>
规则 #4 (l,o)→lo：  lo w est</w>
最终切分：["lo", "w", "est</w>"]
```

注意 "lowest" 从未在训练语料中出现过，但 BPE 仍然能将其合理地切分为已知子词 — 这就是子词分词的泛化能力。

### 4.4 BPE 的数学本质

BPE 本质上是一种**贪心压缩算法**：每一步都选择能最大程度减少 token 总数的合并操作。

设语料中总 token 数为 N，某字符对 (a, b) 出现 f(a,b) 次，合并后 token 总数减少为：

$$N' = N - f(a, b)$$

因为每次合并将两个相邻 token 替换为一个，总 token 数恰好减少 f(a,b)。BPE 每步选 f(a,b) 最大的对，即每步最大程度压缩语料。但这只是一种贪心策略，不保证全局最优。

### 4.5 BPE 合并规则的存储格式

训练完成后，BPE 模型通常存储为两个文件：

**merges.txt**（合并规则，按训练顺序排列）：
```
e s
es t
est </w>
l o
lo w
```

**vocab.json**（词汇表，token → ID 映射）：
```json
{
  "l": 0, "o": 1, "w": 2, "e": 3, "r": 4,
  "n": 5, "s": 6, "t": 7, "i": 8, "d": 9,
  "</w>": 10, "es": 11, "est": 12, "lo": 14
}
```

---

## 5. BPE 的变体：Byte-Level BPE

### 5.1 传统 BPE 的 Unicode 问题

传统 BPE 在字符级别操作。对于英文（ASCII），基础字符集只有 128 个，没有问题。但当面对全球语言的 Unicode 字符时（约 15 万个字符），初始词汇表就已经非常庞大，而且许多 Unicode 字符（如 emoji、罕见汉字）在训练语料中极其罕见，为它们分配词汇表位置是浪费。

### 5.2 Byte-Level BPE 的解决方案

GPT-2（Radford et al., 2019）提出了 Byte-Level BPE：**不在 Unicode 字符级别操作，而是在原始字节（byte）级别操作。**

任何文本最终都是字节序列（UTF-8 编码），而字节的取值范围固定为 0~255，因此基础词汇表固定为 256 个字节 token，永远不会遇到 OOV 字符，任何语言、任何符号都能处理。

```python
# 传统 BPE：在 Unicode 字符级操作
"你好" → ['你', '好']  # 基础词汇需要包含所有汉字

# Byte-Level BPE：在字节级操作
"你好".encode('utf-8')  # b'\xe4\xbd\xa0\xe5\xa5\xbd' → 6个字节
```

### 5.3 GPT-2 的字节映射表

GPT-2 做了一个巧妙的设计：将 256 个字节值映射为可打印的 Unicode 字符，这样合并规则文件中的内容都是人类可读的。

```python
def bytes_to_unicode():
    """
    GPT-2 的字节到 Unicode 映射。
    将 0~255 的字节值映射为可打印字符：
    - 可打印 ASCII 字符保持不变
    - 不可打印字符映射到 Unicode 256 开始的位置
    """
    bs = (
        list(range(ord("!"), ord("~") + 1))
        + list(range(ord("¡"), ord("¬") + 1))
        + list(range(ord("®"), ord("ÿ") + 1))
    )
    cs = bs[:]
    n = 0
    for b in range(2**8):
        if b not in bs:
            bs.append(b)
            cs.append(2**8 + n)
            n += 1
    cs = [chr(c) for c in cs]
    return dict(zip(bs, cs))

# 示例：字节 0x20（空格）→ 'Ġ'（Unicode 288）
# 这就是为什么 GPT-2 的 token 中有很多 'Ġ' 字符的原因
```

### 5.4 GPT-2 的 Pre-tokenization

GPT-2 在应用 BPE 之前，先用正则表达式进行预分词，防止跨词合并：

```python
import regex as re

# GPT-2 的预分词正则表达式
GPT2_PAT = re.compile(
    r"""'s|'t|'re|'ve|'m|'ll|'d"""
    r"""| ?\p{L}+"""
    r"""| ?\p{N}+"""
    r"""| ?[^\s\p{L}\p{N}]+"""
    r"""|\s+(?!\S)"""
    r"""|\s+"""
)

text = "Hello, world! I'm fine."
pre_tokens = re.findall(GPT2_PAT, text)
# ['Hello', ',', ' world', '!', ' I', "'m", ' fine', '.']
```

这确保了 BPE 合并只在预分词得到的片段内部进行，不会跨词边界合并。

### 5.5 Byte-Level BPE 的优缺点

**优点**：基础词汇表极小（256），适合多语言场景；理论上可以编码任何字节序列，无 OOV；不需要对 Unicode 做特殊处理。

**缺点**：非 ASCII 文本（如中文）每个字符会被拆分为 2~4 个字节 token，序列变长；在 UTF-8 字节层面学习到的"子词"可能跨越字符边界，缺乏语言学意义；需要更大的词汇表才能达到与字符级 BPE 相同的压缩率。

---

## 6. WordPiece 算法详解

### 6.1 与 BPE 的核心差异

WordPiece 最初由 Schuster 和 Nakajima 在 2012 年为 Google 的日语/韩语语音搜索系统开发，后来被 BERT（2018）采用而广为人知。

WordPiece 与 BPE 的训练过程结构相似（都是迭代合并），但**选择合并哪一对**的策略不同：

| 方面 | BPE | WordPiece |
|------|-----|-----------|
| 合并准则 | 选频率最高的对 | 选使语言模型似然增益最大的对 |
| 数学表达 | argmax f(a, b) | argmax f(ab) / (f(a) * f(b)) |
| 直觉 | 贪心压缩 | 互信息最大化 |
| 子词前缀 | 无特殊标记 | 非词首子词加 `##` 前缀 |

### 6.2 WordPiece 的合并得分公式

WordPiece 选择合并对 (a, b) 时，计算的得分是：

$$\text{score}(a, b) = \frac{f(ab)}{f(a) \times f(b)}$$

其中 f(ab) 是 a 和 b 相邻出现的频率，f(a) 和 f(b) 分别是各自出现的总频率。

这个公式本质上是**点互信息（Pointwise Mutual Information, PMI）**的一种形式。它倾向于合并那些"总是一起出现"的对，而不仅仅是"出现次数多"的对。

**直觉理解**：假设 "u" 和 "n" 各自出现 10000 次，但 "un" 相邻出现 5000 次，得分为 5000 / (10000 * 10000) = 0.00005。而 "##iza" 和 "##tion" 各自出现 200 次，"##ization" 出现 190 次，得分为 190 / (200 * 200) = 0.00475。WordPiece 会优先合并后者，因为它们的关联性更强。

### 6.3 WordPiece 的 `##` 前缀

WordPiece 用 `##` 前缀标记**非词首**的子词，这样解码时就能知道哪些 token 需要拼接在一起，哪些是独立的词：

```python
# BERT 的 WordPiece 分词示例
text = "unbelievable"
tokens = ["un", "##bel", "##ie", "##va", "##ble"]
# "un" 是词首，不加 ##
# "##bel" 等是非词首续接部分

# 解码时：去掉 ##，拼接
decoded = "un" + "bel" + "ie" + "va" + "ble" = "unbelievable"
```

与之对比，GPT-2 的 BPE 用空格前缀（`Ġ`）标记词首 token，语义相反但效果等价：

```python
# GPT-2 的 Byte-Level BPE
tokens = ["un", "believ", "able"]
# 注意：实际 GPT-2 会用 Ġ 标记空格位置
```

### 6.4 WordPiece 的编码（推理时）

WordPiece 的编码使用**最长匹配优先（Longest Match First）**策略，也称为贪心最长前缀匹配：

```python
def wordpiece_encode(word, vocab, max_token_length=200):
    """WordPiece 编码算法（贪心最长前缀匹配）"""
    tokens = []
    start = 0
    while start < len(word):
        end = len(word)
        cur_substr = None
        while start < end:
            substr = word[start:end]
            if start > 0:
                substr = "##" + substr
            if substr in vocab:
                cur_substr = substr
                break
            end -= 1
        if cur_substr is None:
            tokens.append("[UNK]")
            start += 1
        else:
            tokens.append(cur_substr)
            start = end
    return tokens

# 示例
vocab = {"un", "##believ", "##able", "##happy", "##ness",
         "transform", "##er", "##s", "[UNK]"}
print(wordpiece_encode("unbelievable", vocab))
# ["un", "##believ", "##able"]
```

这与 BPE 的"按合并规则顺序应用"不同。WordPiece 在推理时不需要合并规则列表，只需要词汇表本身。

### 6.5 BERT 的 WordPiece 配置

BERT 使用的 WordPiece 参数：

| 参数 | 值 |
|------|-----|
| 词汇量 | 30,522（BERT-base） |
| 特殊 token | `[PAD]`, `[UNK]`, `[CLS]`, `[SEP]`, `[MASK]` |
| 大小写处理 | `bert-base-uncased`：全部小写化 |
| 子词前缀 | `##` |
| 词汇表文件 | `vocab.txt`（每行一个 token） |

---

## 7. Unigram 语言模型分词

### 7.1 与 BPE/WordPiece 的根本不同

BPE 和 WordPiece 都是**自底向上**的：从最小单元（字符/字节）开始，逐步合并。Unigram 则是**自顶向下**的：从一个超大的候选词汇表开始，逐步删减。

| 方面 | BPE / WordPiece | Unigram |
|------|----------------|---------|
| 方向 | 自底向上（合并） | 自顶向下（剪枝） |
| 初始状态 | 所有字符 | 所有可能的子串（预挖掘） |
| 每步操作 | 添加一个合并后的新 token | 移除一个损失最小的 token |
| 分词方式 | 确定性（贪心） | 概率性（可采样多种切分） |
| 理论基础 | 贪心压缩 | 信息论（最大似然） |

### 7.2 Unigram 的数学模型

Unigram 假设每个 token 独立出现（unigram 假设），整个序列的概率是各 token 概率的乘积。

给定词汇表 V 和每个 token x_i 的概率 p(x_i)，对于一个词 W 的某种切分 S = (x_1, x_2, ..., x_n)：

$$P(S) = \prod_{i=1}^{n} p(x_i)$$

对数形式：

$$\log P(S) = \sum_{i=1}^{n} \log p(x_i)$$

Unigram 的训练目标是找到一个词汇表 V，使得整个语料在最优切分下的总对数似然最大化：

$$V^* = \arg\max_{V, |V|=K} \sum_{w \in \text{corpus}} \max_{S \in \text{Seg}(w, V)} \log P(S)$$

其中 K 是目标词汇量，Seg(w, V) 是词 w 在词汇表 V 下的所有可能切分。

### 7.3 训练过程

```
1. 初始化：从训练语料中提取一个大的候选词汇表（例如所有出现过的子串，
   按频率取 top-K，K 远大于目标词汇量，通常 2~10 倍）
2. 用 EM 算法估计每个 token 的概率 p(x)
3. 对每个 token 计算：如果移除它，语料的总对数似然会下降多少（loss）
4. 移除 loss 最小的若干 token（通常移除当前词汇量的 10~20%）
5. 重复步骤 2~4，直到词汇量降至目标值
```

### 7.4 Viterbi 分词：寻找最优切分

对于一个给定的词 W = c_1 c_2 ... c_n，Unigram 使用 **Viterbi 算法**（动态规划）寻找概率最高的切分方式：

```python
import math

def viterbi_tokenize(word, token_probs, max_token_len=16):
    """
    Viterbi 算法寻找最优切分
    token_probs: dict, token -> log probability
    """
    n = len(word)
    # best_score[i] = 到位置 i 的最优对数似然
    best_score = [-math.inf] * (n + 1)
    best_score[0] = 0.0
    # best_edge[i] = 最优路径中到位置 i 的前驱位置
    best_edge = [0] * (n + 1)

    for end in range(1, n + 1):
        for begin in range(max(0, end - max_token_len), end):
            token = word[begin:end]
            if token in token_probs:
                score = best_score[begin] + token_probs[token]
                if score > best_score[end]:
                    best_score[end] = score
                    best_edge[end] = begin

    # 回溯
    tokens = []
    pos = n
    while pos > 0:
        begin = best_edge[pos]
        tokens.append(word[begin:pos])
        pos = begin
    tokens.reverse()
    return tokens

# 示例
token_probs = {
    "u": -3.0, "n": -2.5, "un": -2.0,
    "h": -3.0, "a": -2.0, "p": -2.5,
    "happy": -4.0, "happi": -4.5,
    "hap": -3.5, "pi": -3.0,
    "ness": -3.0, "n": -2.0, "e": -2.0, "s": -1.5,
    "unhappy": -6.0, "unhappiness": -9.0,
}
print(viterbi_tokenize("unhappiness", token_probs))
```

### 7.5 Unigram 的概率采样能力

Unigram 独特的优势之一是支持**概率采样**多种切分方式，而不仅仅是最优切分。这在训练时可以作为一种**数据增强**手段（称为 Subword Regularization）。

```python
def sample_tokenize(word, token_probs, temperature=1.0):
    """
    按概率采样一种切分方式（非最优）
    temperature 控制随机性：
    - temperature → 0：退化为 Viterbi（确定性最优）
    - temperature → ∞：均匀随机
    """
    import random
    n = len(word)
    # 用前向-后向算法计算每种切分的概率
    # 然后按概率采样
    # ... （完整实现较复杂，此处省略采样细节）
    pass
```

Sennrich 的 BPE-dropout（2019）是 BPE 中类似的数据增强技巧：训练时随机跳过一些合并规则，产生不同的切分。

### 7.6 Unigram 的优缺点

**优点**：有严格的概率框架，分词结果有概率解释；支持概率采样，可做数据增强；全局优化（非贪心），理论上词汇表质量更高。

**缺点**：训练过程更复杂（需要 EM + Viterbi）；需要预先生成大量候选子串；实际效果与 BPE 差异不大，但实现更复杂。

---

## 8. SentencePiece 框架

### 8.1 SentencePiece 是什么

SentencePiece 是 Google 开发的一个**与语言无关**的分词框架。它不是一种新的算法，而是一个将 BPE 和 Unigram 算法进行了工程化封装的工具库，核心特性是：

**直接处理原始文本，不依赖预分词（pre-tokenization）**。

传统 BPE/WordPiece 通常需要先按空格切分单词（英文），或先做分词（中文/日文），然后在单词内部再做子词切分。但这种做法对于没有空格的语言（中文、日文、泰文等）不适用。

SentencePiece 的解决方案是：将**空格也视为普通字符**（用特殊符号 `▁`（U+2581）替代），然后在整个句子级别（而非单词级别）直接运行 BPE 或 Unigram。

```python
# 传统 BPE：先按空格切分，再在词内做 BPE
"Hello world" → split → ["Hello", "world"] → BPE → [["Hel", "lo"], ["world"]]

# SentencePiece：直接在句子级操作（空格变 ▁）
"Hello world" → "▁Hello▁world" → BPE/Unigram → ["▁Hel", "lo", "▁world"]
```

### 8.2 SentencePiece 的使用

```python
import sentencepiece as spm

# 1. 训练
spm.SentencePieceTrainer.Train(
    input='corpus.txt',
    model_prefix='my_spm',
    vocab_size=32000,
    model_type='bpe',  # 或 'unigram'
    character_coverage=0.9995,  # Unicode 字符覆盖率
    pad_id=0,
    unk_id=1,
    bos_id=2,
    eos_id=3,
)

# 2. 加载
sp = spm.SentencePieceProcessor()
sp.Load('my_spm.model')

# 3. 编码
text = "Hello, how are you?"
ids = sp.EncodeAsIds(text)
pieces = sp.EncodeAsPieces(text)
print(f"IDs:    {ids}")
print(f"Pieces: {pieces}")
# Pieces: ['▁Hello', ',', '▁how', '▁are', '▁you', '?']

# 4. 解码
decoded = sp.DecodeIds(ids)
print(f"Decoded: {decoded}")
# Decoded: Hello, how are you?

# 5. 概率采样（仅 Unigram 模型）
sampled = sp.SampleEncodeAsPieces(text, nbest_size=-1, alpha=0.5)
print(f"Sampled: {sampled}")
# 每次调用可能得到不同的切分结果
```

### 8.3 SentencePiece 的关键参数

| 参数 | 含义 | 推荐值 |
|------|------|--------|
| `vocab_size` | 目标词汇量 | 32000（中等）、64000（大型） |
| `model_type` | 分词算法 | `bpe`（稳定）或 `unigram`（概率性） |
| `character_coverage` | 覆盖训练语料中多大比例的字符 | 英文 1.0，含 CJK 0.9995 |
| `byte_fallback` | 未覆盖字符是否回退为字节 | True（推荐） |
| `split_digits` | 是否将数字逐个拆分 | True（LLaMA 采用） |
| `add_dummy_prefix` | 是否在句首添加 `▁` | True（默认） |
| `normalization_rule_name` | Unicode 正规化规则 | `nfkc` 或 `identity` |

### 8.4 哪些模型使用 SentencePiece

| 模型 | 算法 | 词汇量 |
|------|------|--------|
| T5 / mT5 | SentencePiece (Unigram) | 32,000 / 250,000 |
| ALBERT | SentencePiece (Unigram) | 30,000 |
| XLNet | SentencePiece (Unigram) | 32,000 |
| LLaMA / LLaMA 2 | SentencePiece (BPE) | 32,000 |
| Baichuan | SentencePiece (BPE) | 64,000 |
| ChatGLM | SentencePiece | 130,344 |

---

## 9. tiktoken 与 OpenAI 的分词方案

### 9.1 tiktoken 是什么

tiktoken 是 OpenAI 在 2022 年开源的 BPE 分词库，用于 GPT-3.5、GPT-4 等模型。相比 Hugging Face 的 Python 实现，tiktoken 的核心编码/解码逻辑用 **Rust** 编写，通过 Python 绑定提供接口，速度极快（比 Hugging Face tokenizers 快 3~6 倍）。

### 9.2 tiktoken 的使用

```python
import tiktoken

# 获取特定模型的编码器
enc = tiktoken.encoding_for_model("gpt-4")
# 或直接指定编码方案
enc = tiktoken.get_encoding("cl100k_base")

# 编码
text = "Hello, world! 你好世界"
tokens = enc.encode(text)
print(f"Token IDs: {tokens}")
print(f"Token 数量: {len(tokens)}")

# 查看每个 token 对应的字节
for t in tokens:
    print(f"  ID={t:6d} → {enc.decode([t])!r}")

# 解码
decoded = enc.decode(tokens)
assert decoded == text

# 查看词汇量
print(f"词汇量: {enc.n_vocab}")
```

### 9.3 OpenAI 的编码方案演进

| 编码方案 | 对应模型 | 词汇量 | 正则预分词 |
|----------|---------|--------|-----------|
| `r50k_base` | GPT-2、GPT-3 早期 | 50,257 | GPT-2 正则 |
| `p50k_base` | Codex、text-davinci-002 | 50,281 | 改进的代码处理 |
| `cl100k_base` | GPT-3.5、GPT-4 | 100,277 | 大幅改进 |
| `o200k_base` | GPT-4o | 200,019 | 进一步优化 |

### 9.4 cl100k_base 的改进

相比 GPT-2 的 r50k_base，cl100k_base 做了多项改进：

**1. 更大的词汇表**：100K vs 50K，更多的高频词/子词可以完整编码，降低平均 token 数。

**2. 改进的正则预分词**：

```python
# cl100k_base 的预分词正则（简化版）
import regex as re

CL100K_PAT = re.compile(
    r"""'(?i:[sdmt]|ll|ve|re)"""      # 缩写
    r"""|[^\r\n\p{L}\p{N}]?+\p{L}+"""  # 字母序列
    r"""|\p{N}{1,3}"""                  # 最多 3 位数字一组
    r"""| ?[^\s\p{L}\p{N}]++[\r\n]*"""  # 标点 + 可选换行
    r"""|\s*[\r\n]"""                   # 换行前的空白
    r"""|\s+(?!\S)"""                   # 尾部空白
    r"""|\s+"""                         # 其他空白
)
```

关键改进：数字按最多 3 位分组（"123456" → ["123", "456"]），防止长数字变成一个 token；更好的空白处理。

**3. 更好的多语言支持**：词汇表中包含更多非英语的 token，中文分词效率提升约 30%。

### 9.5 tiktoken 的性能优势

tiktoken 快的原因：

- 核心编码/解码用 **Rust** 实现（通过 PyO3 绑定）
- 合并规则存储为排序后的字节数组，使用二分查找
- 预编译正则表达式
- 利用 SIMD 指令加速字节处理

```python
import tiktoken
import time

enc = tiktoken.get_encoding("cl100k_base")
text = "Hello world! " * 10000

start = time.perf_counter()
for _ in range(100):
    tokens = enc.encode(text)
elapsed = time.perf_counter() - start

print(f"tiktoken: {elapsed:.3f}s for 100 iterations")
print(f"Throughput: {len(text) * 100 / elapsed / 1e6:.1f} MB/s")
# 通常可达 50+ MB/s
```

---

## 10. 从零实现 BPE 分词器

下面我们用纯 Python 从零实现一个完整的 BPE 分词器，包括训练和推理两个阶段。

### 10.1 完整实现

```python
"""
从零实现 Byte Pair Encoding (BPE) 分词器
包含训练（学习合并规则）和推理（编码/解码）两个阶段
"""
from collections import Counter, defaultdict
from typing import List, Dict, Tuple, Optional
import re


class SimpleBPETokenizer:
    """一个简单但完整的 BPE 分词器实现"""

    def __init__(self):
        self.merges: List[Tuple[str, str]] = []  # 有序合并规则
        self.vocab: Dict[str, int] = {}           # token → ID
        self.id_to_token: Dict[int, str] = {}     # ID → token
        self.word_end = "</w>"                     # 词尾标记

    def _get_word_freqs(self, corpus: str) -> Dict[Tuple[str, ...], int]:
        """统计语料中的词频，每个词拆分为字符元组"""
        word_freqs = Counter()
        # 简单的按空格和标点预分词
        words = re.findall(r'\w+|[^\w\s]', corpus.lower())
        for word in words:
            # 将词拆分为字符，末尾加 </w>
            char_tuple = tuple(list(word) + [self.word_end])
            word_freqs[char_tuple] += 1
        return dict(word_freqs)

    def _get_pair_freqs(
        self, word_freqs: Dict[Tuple[str, ...], int]
    ) -> Counter:
        """统计所有相邻 token 对的频率"""
        pair_freqs = Counter()
        for word, freq in word_freqs.items():
            for i in range(len(word) - 1):
                pair = (word[i], word[i + 1])
                pair_freqs[pair] += freq
        return pair_freqs

    def _merge_pair(
        self,
        word_freqs: Dict[Tuple[str, ...], int],
        pair: Tuple[str, str]
    ) -> Dict[Tuple[str, ...], int]:
        """在所有词中将指定的 pair 合并为新 token"""
        new_word_freqs = {}
        a, b = pair
        merged = a + b

        for word, freq in word_freqs.items():
            new_word = []
            i = 0
            while i < len(word):
                if (i < len(word) - 1 and
                    word[i] == a and word[i + 1] == b):
                    new_word.append(merged)
                    i += 2
                else:
                    new_word.append(word[i])
                    i += 1
            new_word_freqs[tuple(new_word)] = freq

        return new_word_freqs

    def train(self, corpus: str, vocab_size: int = 500,
              verbose: bool = False):
        """
        训练 BPE 分词器

        Args:
            corpus: 训练语料文本
            vocab_size: 目标词汇量
            verbose: 是否打印训练过程
        """
        # Step 1: 统计词频
        word_freqs = self._get_word_freqs(corpus)

        # Step 2: 初始化词汇表（所有单字符 + 词尾标记）
        chars = set()
        for word in word_freqs:
            for ch in word:
                chars.add(ch)
        base_vocab = sorted(chars)

        if verbose:
            print(f"初始字符集大小: {len(base_vocab)}")
            print(f"目标词汇量: {vocab_size}")
            print(f"需要学习 {vocab_size - len(base_vocab)} 条合并规则")
            print()

        # Step 3: 迭代合并
        num_merges = vocab_size - len(base_vocab)
        self.merges = []

        for i in range(num_merges):
            pair_freqs = self._get_pair_freqs(word_freqs)

            if not pair_freqs:
                if verbose:
                    print(f"第 {i+1} 步：无更多可合并的对，提前终止")
                break

            # 找频率最高的对
            best_pair = pair_freqs.most_common(1)[0]
            pair, freq = best_pair

            if verbose and i < 20:  # 只打印前 20 步
                print(f"合并 #{i+1}: '{pair[0]}' + '{pair[1]}' "
                      f"→ '{pair[0]+pair[1]}' (频率={freq})")

            # 记录合并规则
            self.merges.append(pair)

            # 执行合并
            word_freqs = self._merge_pair(word_freqs, pair)

        # Step 4: 构建最终词汇表
        all_tokens = set(base_vocab)
        for a, b in self.merges:
            all_tokens.add(a + b)

        # 添加特殊 token
        special_tokens = ["<pad>", "<unk>", "<s>", "</s>"]
        self.vocab = {}
        for i, t in enumerate(special_tokens):
            self.vocab[t] = i
        for i, t in enumerate(sorted(all_tokens), len(special_tokens)):
            self.vocab[t] = i

        self.id_to_token = {v: k for k, v in self.vocab.items()}

        if verbose:
            print(f"\n训练完成！最终词汇量: {len(self.vocab)}")

    def encode(self, text: str) -> List[int]:
        """将文本编码为 token ID 序列"""
        # 预分词
        words = re.findall(r'\w+|[^\w\s]', text.lower())
        all_ids = []

        for word in words:
            tokens = list(word) + [self.word_end]

            # 按顺序应用合并规则
            for a, b in self.merges:
                merged = a + b
                new_tokens = []
                i = 0
                while i < len(tokens):
                    if (i < len(tokens) - 1 and
                        tokens[i] == a and tokens[i + 1] == b):
                        new_tokens.append(merged)
                        i += 2
                    else:
                        new_tokens.append(tokens[i])
                        i += 1
                tokens = new_tokens

            # 转换为 ID
            for t in tokens:
                if t in self.vocab:
                    all_ids.append(self.vocab[t])
                else:
                    all_ids.append(self.vocab["<unk>"])

        return all_ids

    def decode(self, ids: List[int]) -> str:
        """将 token ID 序列解码为文本"""
        tokens = [self.id_to_token.get(i, "<unk>") for i in ids]
        text = "".join(tokens)
        # 将 </w> 替换为空格，去除末尾空格
        text = text.replace(self.word_end, " ").strip()
        return text

    def tokenize(self, text: str) -> List[str]:
        """将文本切分为 token 字符串列表（不转 ID）"""
        ids = self.encode(text)
        return [self.id_to_token[i] for i in ids]


# ===== 使用示例 =====

corpus = """
The cat sat on the mat. The cat ate the rat.
A quick brown fox jumps over the lazy dog.
The transformer architecture revolutionized natural language processing.
Natural language processing has seen tremendous progress in recent years.
The attention mechanism is the core of the transformer model.
Language models can generate coherent and fluent text.
"""

# 训练
tokenizer = SimpleBPETokenizer()
tokenizer.train(corpus, vocab_size=100, verbose=True)

# 编码
text = "the cat sat"
tokens = tokenizer.tokenize(text)
ids = tokenizer.encode(text)
print(f"\n输入: '{text}'")
print(f"Tokens: {tokens}")
print(f"IDs: {ids}")

# 解码
decoded = tokenizer.decode(ids)
print(f"解码: '{decoded}'")

# 测试泛化能力（编码训练时未见过的词）
unseen = "the transformer sat"
tokens = tokenizer.tokenize(unseen)
print(f"\n未见过的输入: '{unseen}'")
print(f"Tokens: {tokens}")
```

### 10.2 运行结果分析

```
初始字符集大小: 27  (26个字母 + </w>)
目标词汇量: 100
需要学习 73 条合并规则

合并 #1: 't' + 'h' → 'th' (频率=16)
合并 #2: 'th' + 'e' → 'the' (频率=12)
合并 #3: 'e' + '</w>' → 'e</w>' (频率=11)
合并 #4: 'the</w>' 需要先合并 'the' + '</w>' → ...
...

训练完成！最终词汇量: 100

输入: 'the cat sat'
Tokens: ['the</w>', 'c', 'a', 't</w>', 's', 'a', 't</w>']
IDs: [52, 8, 4, 48, 22, 4, 48]
解码: 'the cat sat'
```

高频词 "the" 被合并为一个完整 token，而较低频的 "cat" 和 "sat" 则被拆分为更小的子词。

---

## 11. 使用 Hugging Face tokenizers 库

### 11.1 tokenizers 库概述

Hugging Face 的 `tokenizers` 库是目前最流行的 Tokenizer 工具库，用 Rust 实现核心逻辑，Python 封装，兼具性能和易用性。

### 11.2 用 tokenizers 训练 BPE

```python
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.trainers import BpeTrainer
from tokenizers.pre_tokenizers import Whitespace, ByteLevel
from tokenizers.processors import TemplateProcessing

# 1. 创建 BPE tokenizer
tokenizer = Tokenizer(BPE(unk_token="[UNK]"))

# 2. 设置预分词器
tokenizer.pre_tokenizer = Whitespace()

# 3. 创建训练器
trainer = BpeTrainer(
    vocab_size=32000,
    min_frequency=2,
    special_tokens=["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"],
    show_progress=True,
)

# 4. 从文件训练
tokenizer.train(files=["corpus.txt"], trainer=trainer)

# 5. 设置后处理（添加 [CLS] 和 [SEP]）
tokenizer.post_processor = TemplateProcessing(
    single="[CLS] $A [SEP]",
    pair="[CLS] $A [SEP] $B:1 [SEP]:1",
    special_tokens=[
        ("[CLS]", tokenizer.token_to_id("[CLS]")),
        ("[SEP]", tokenizer.token_to_id("[SEP]")),
    ],
)

# 6. 保存
tokenizer.save("my_tokenizer.json")

# 7. 使用
output = tokenizer.encode("Hello, world!")
print(f"Tokens: {output.tokens}")
print(f"IDs: {output.ids}")
print(f"Attention mask: {output.attention_mask}")
```

### 11.3 用 tokenizers 训练 WordPiece

```python
from tokenizers import Tokenizer
from tokenizers.models import WordPiece
from tokenizers.trainers import WordPieceTrainer
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.normalizers import NFD, Lowercase, StripAccents, Sequence

# 1. 创建 WordPiece tokenizer
tokenizer = Tokenizer(WordPiece(unk_token="[UNK]"))

# 2. 设置标准化器（BERT 风格）
tokenizer.normalizer = Sequence([NFD(), Lowercase(), StripAccents()])

# 3. 设置预分词器
tokenizer.pre_tokenizer = Whitespace()

# 4. 创建训练器
trainer = WordPieceTrainer(
    vocab_size=30522,
    special_tokens=["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"],
)

# 5. 训练
tokenizer.train(files=["corpus.txt"], trainer=trainer)

# 6. 使用
output = tokenizer.encode("unbelievable")
print(f"Tokens: {output.tokens}")
# ['un', '##bel', '##ie', '##va', '##ble'] (取决于训练语料)
```

### 11.4 加载预训练模型的 Tokenizer

```python
from transformers import AutoTokenizer

# GPT-2
gpt2_tok = AutoTokenizer.from_pretrained("gpt2")
print(gpt2_tok.encode("Hello, world!"))
print(gpt2_tok.tokenize("Hello, world!"))

# BERT
bert_tok = AutoTokenizer.from_pretrained("bert-base-uncased")
print(bert_tok.encode("Hello, world!"))
print(bert_tok.tokenize("Hello, world!"))

# LLaMA
llama_tok = AutoTokenizer.from_pretrained(
    "meta-llama/Llama-2-7b-hf"
)
print(llama_tok.encode("Hello, world!"))

# 对比同一段文本在不同 Tokenizer 下的 token 数量
text = "The quick brown fox jumps over the lazy dog."
for name, tok in [("GPT-2", gpt2_tok), ("BERT", bert_tok)]:
    tokens = tok.encode(text)
    print(f"{name}: {len(tokens)} tokens → {tok.tokenize(text)}")
```

---

## 12. 训练自定义 Tokenizer 实战

### 12.1 场景：为中英混合语料训练 Tokenizer

```python
"""
实战：为中英混合技术文档训练一个 BPE Tokenizer
目标：中文和英文都能高效编码
"""
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.trainers import BpeTrainer
from tokenizers.pre_tokenizers import (
    ByteLevel, Sequence as PreSequence
)
from tokenizers.normalizers import NFKC
import json

# 1. 准备训练数据
train_data = [
    "Transformer 是一种基于自注意力机制的深度学习架构",
    "BERT 使用双向编码器进行预训练",
    "GPT 系列模型采用自回归方式生成文本",
    "大语言模型通过海量数据进行预训练学习语言规律",
    "注意力机制让模型能够捕捉长距离依赖关系",
    "The Transformer architecture has revolutionized NLP",
    "Large language models are trained on massive datasets",
    "Attention mechanism enables capturing long-range dependencies",
    "Pre-training and fine-tuning is the dominant paradigm",
    "Tokenization is the first step in any NLP pipeline",
] * 100  # 重复以模拟更大的语料

# 写入临时文件
with open("/tmp/train_corpus.txt", "w") as f:
    f.write("\n".join(train_data))

# 2. 配置 Tokenizer
tokenizer = Tokenizer(BPE(unk_token="<unk>"))
tokenizer.normalizer = NFKC()
tokenizer.pre_tokenizer = ByteLevel(add_prefix_space=False)

# 3. 训练
trainer = BpeTrainer(
    vocab_size=8000,
    min_frequency=2,
    special_tokens=[
        "<pad>", "<unk>", "<s>", "</s>", "<mask>",
        "<|im_start|>", "<|im_end|>",  # ChatML 格式
    ],
    show_progress=True,
    initial_alphabet=ByteLevel.alphabet(),
)

tokenizer.train(files=["/tmp/train_corpus.txt"], trainer=trainer)

# 4. 测试
test_texts = [
    "Transformer 模型的核心是自注意力机制",
    "BERT uses WordPiece tokenization",
    "大模型训练需要大量计算资源和数据",
]

for text in test_texts:
    output = tokenizer.encode(text)
    print(f"输入: {text}")
    print(f"  Token 数: {len(output.ids)}")
    print(f"  Tokens: {output.tokens}")
    print()

# 5. 保存
tokenizer.save("zh_en_tokenizer.json")
```

### 12.2 评估 Tokenizer 质量

```python
def evaluate_tokenizer(tokenizer, test_texts):
    """评估 Tokenizer 的质量指标"""
    total_chars = 0
    total_tokens = 0
    unk_count = 0
    unk_id = tokenizer.token_to_id("<unk>")

    for text in test_texts:
        output = tokenizer.encode(text)
        total_chars += len(text)
        total_tokens += len(output.ids)
        unk_count += output.ids.count(unk_id) if unk_id else 0

    compression_ratio = total_chars / total_tokens
    unk_rate = unk_count / total_tokens if total_tokens > 0 else 0

    print("=== Tokenizer 评估报告 ===")
    print(f"测试样本数: {len(test_texts)}")
    print(f"总字符数: {total_chars}")
    print(f"总 token 数: {total_tokens}")
    print(f"压缩比 (chars/token): {compression_ratio:.2f}")
    print(f"UNK 率: {unk_rate:.4%}")
    print(f"平均 token 长度: {total_chars/total_tokens:.1f} 字符")

    return {
        "compression_ratio": compression_ratio,
        "unk_rate": unk_rate,
        "avg_token_length": total_chars / total_tokens,
    }
```

### 12.3 Tokenizer 质量的关键指标

| 指标 | 含义 | 好的范围 |
|------|------|---------|
| **压缩比**（chars/token） | 每个 token 平均代表多少字符 | 英文 3~5，中文 1.5~3 |
| **UNK 率** | 未识别 token 的比例 | < 0.01% |
| **续行率（Continuation Rate）** | 非词首 token 的比例 | 英文 30~50% |
| **词汇表利用率** | 实际使用的词汇表比例 | > 80% |
| **编码一致性** | 相同文本是否总产生相同编码 | 100%（BPE/WP）或可变（Unigram） |

---

## 13. Tokenizer 与模型的关系

### 13.1 绑定关系

Tokenizer 与模型之间存在**不可分割的绑定关系**：

```
Tokenizer 词汇表大小 = 模型 Embedding 矩阵的行数 = 模型输出层 LM Head 的维度
```

一旦模型训练完成，就不能随意更换 Tokenizer。如果更换了，会出现以下问题：

- 原来 ID=42 对应 "hello"，新 Tokenizer 中 ID=42 可能对应 "xyz"
- Embedding 矩阵中学到的权重与新 token 的语义不匹配
- 输出层的概率分布与新词汇表不对应

### 13.2 词汇表大小的权衡

词汇表大小 V 是一个重要的超参数：

**V 太小**（如 8K）：每个文本需要更多的 token 来表示，序列更长，推理更慢，Transformer 的上下文窗口利用率低。

**V 太大**（如 500K）：Embedding 矩阵 (V × d_model) 和 LM Head 矩阵 (d_model × V) 占用大量参数；低频 token 训练不充分（欠拟合）；softmax 计算变慢。

**主流选择**：

| 模型 | 词汇量 | 理由 |
|------|--------|------|
| GPT-2 | 50,257 | 英文为主，较紧凑 |
| BERT | 30,522 | 英文 + 小量多语言 |
| LLaMA | 32,000 | SentencePiece，通用 |
| GPT-4 | 100,277 | 多语言优化 |
| GPT-4o | 200,019 | 极致多语言+多模态 |
| Qwen | 151,936 | 中英双优 |

### 13.3 Tokenizer 对模型性能的影响

Tokenizer 不仅影响效率，还影响模型的能力边界：

**数学能力**：如果 Tokenizer 把 "12345" 切成 ["123", "45"]，模型做个位数加法都需要先"理解"这个切分。而如果每个数字是独立 token（"1", "2", "3", "4", "5"），模型更容易学会算术运算。这就是为什么很多模型（如 LLaMA）在训练 Tokenizer 时设置 `split_digits=True`。

**代码能力**：缩进、空格、换行的编码方式极大影响代码理解。GPT-4 的 cl100k_base 对代码中的空格做了特殊优化。

**多语言公平性**：如果 Tokenizer 主要在英文上训练，中文一个字可能需要 3~4 个 token，而英文一个词只需要 1~2 个 token。这意味着同样的上下文窗口（如 4096 tokens），能容纳的中文内容远少于英文。

---

## 14. 特殊 Token 的设计与作用

### 14.1 常见特殊 Token

| Token | 全称 | 作用 | 使用模型 |
|-------|------|------|---------|
| `[PAD]` | Padding | 填充短序列使 batch 内长度一致 | BERT |
| `[UNK]` | Unknown | 表示词汇表中不存在的 token | BERT、WordPiece |
| `[CLS]` | Classification | 句子/序列级别的分类表示 | BERT |
| `[SEP]` | Separator | 分隔两个句子（如问答对） | BERT |
| `[MASK]` | Mask | MLM 预训练中的遮掩标记 | BERT |
| `<s>` | Begin of Sequence | 序列起始标记 | GPT、LLaMA |
| `</s>` | End of Sequence | 序列结束标记 | GPT、LLaMA、T5 |
| `<pad>` | Padding | 同 [PAD] | GPT-NeoX、LLaMA |
| `<\|endoftext\|>` | End of Text | 文档边界 / 序列结束 | GPT-2 |
| `<\|im_start\|>` | IM Start | ChatML 对话角色起始 | ChatGPT、Qwen |
| `<\|im_end\|>` | IM End | ChatML 对话角色结束 | ChatGPT、Qwen |

### 14.2 ChatML 格式中的特殊 Token

```python
# ChatML 格式示例（GPT-3.5/GPT-4 使用）
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"},
    {"role": "assistant", "content": "Hi there!"},
]

# 编码后的 token 序列结构：
# <|im_start|> system \n You are a helpful assistant. <|im_end|> \n
# <|im_start|> user \n Hello! <|im_end|> \n
# <|im_start|> assistant \n Hi there! <|im_end|> \n
```

### 14.3 添加自定义特殊 Token

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("gpt2")

# 添加新的特殊 token
new_special_tokens = {
    "additional_special_tokens": [
        "<tool_call>", "</tool_call>",
        "<tool_result>", "</tool_result>",
        "<thinking>", "</thinking>",
    ]
}
num_added = tokenizer.add_special_tokens(new_special_tokens)
print(f"新增 {num_added} 个特殊 token")
print(f"新词汇量: {len(tokenizer)}")

# 注意：添加新 token 后，模型的 Embedding 层也需要调整
# model.resize_token_embeddings(len(tokenizer))
```

---

## 15. 中文与多语言分词的挑战

### 15.1 中文分词的特殊性

中文没有空格分隔词语，且存在以下挑战：

**字符集庞大**：常用汉字约 6000~8000 个，总 Unicode 汉字超过 9 万个。在字符级 BPE 中，光是基础字符就占用大量词汇表位置。

**词边界模糊**："研究生命的起源" 可以切分为 "研究/生命/的/起源" 或 "研究生/命/的/起源"，含义完全不同。

**跨语言不公平**：在以英文为主训练的 Tokenizer 中，一个英文单词通常是 1~2 个 token，而一个中文字可能需要 2~4 个 token（因为 UTF-8 编码中每个汉字占 3 字节）。

### 15.2 不同 Tokenizer 对中文的效率

```python
import tiktoken

# GPT-4 的 cl100k_base
enc = tiktoken.get_encoding("cl100k_base")

texts = {
    "英文": "The quick brown fox jumps over the lazy dog",
    "中文": "敏捷的棕色狐狸跳过了懒惰的狗",
    "中英混合": "Transformer 模型是深度学习的重大突破",
}

for label, text in texts.items():
    tokens = enc.encode(text)
    ratio = len(text) / len(tokens)
    print(f"{label}: {len(text)} 字符 → {len(tokens)} tokens "
          f"(压缩比 {ratio:.2f})")
```

典型输出：
```
英文: 44 字符 → 9 tokens (压缩比 4.89)
中文: 14 字符 → 14 tokens (压缩比 1.00)  ← 每个汉字约 1 token
中英混合: 18 字符 → 11 tokens (压缩比 1.64)
```

### 15.3 多语言 Tokenizer 的设计策略

**策略一：增大词汇表**。GPT-4o 把词汇表从 100K 扩到 200K，大幅增加中文/日文等语言的 token 条目，使压缩率接近英文。

**策略二：多语言平衡训练**。在训练 Tokenizer 时，按比例混合多种语言的语料，确保各语言都有足够的高频子词被合并。

**策略三：字符级后备（Byte Fallback）**。SentencePiece 的 `byte_fallback=True` 选项：对于词汇表中没有覆盖到的字符，用特殊的字节 token（如 `<0xE4>`）表示，避免 UNK。

```python
# LLaMA 的 SentencePiece 配置就启用了 byte_fallback
# 这样即使词汇表只有 32000，也能无 OOV 地编码所有 Unicode 文本
```

### 15.4 各模型中文编码效率对比

| 模型 | Tokenizer | 中文压缩比 (字符/token) | 等效上下文长度* |
|------|-----------|----------------------|---------------|
| GPT-2 | r50k_base | ~0.33 (3 bytes/char) | ~1,400 字 |
| GPT-3.5/4 | cl100k_base | ~1.0 | ~4,000 字 |
| GPT-4o | o200k_base | ~1.4 | ~5,600 字 |
| LLaMA | SP (32K) | ~0.6 | ~2,400 字 |
| Qwen | 自定义 (152K) | ~1.5 | ~6,000 字 |
| ChatGLM | SP (130K) | ~1.8 | ~7,200 字 |

*等效上下文长度：在 4096 token 窗口下能容纳的中文字数

---

## 16. Tokenizer 的性能优化

### 16.1 编码速度优化

在生产环境中，Tokenizer 的编码速度直接影响推理延迟：

```python
"""
Tokenizer 性能基准测试
"""
import time

def benchmark_tokenizer(tokenizer, texts, num_iterations=1000):
    """基准测试 Tokenizer 编码速度"""
    # 预热
    for text in texts:
        tokenizer.encode(text)

    # 计时
    total_chars = sum(len(t) for t in texts)
    start = time.perf_counter()
    for _ in range(num_iterations):
        for text in texts:
            tokenizer.encode(text)
    elapsed = time.perf_counter() - start

    throughput = total_chars * num_iterations / elapsed
    print(f"  吞吐量: {throughput/1e6:.2f} M chars/s")
    print(f"  总耗时: {elapsed:.3f}s ({num_iterations} 轮)")
    return throughput
```

### 16.2 批量编码

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")

# 单条编码（慢）
texts = ["Hello world", "How are you", "Fine thanks"]
results_slow = [tokenizer.encode(t) for t in texts]

# 批量编码（快，利用 Rust 并行）
results_fast = tokenizer(
    texts,
    padding=True,
    truncation=True,
    max_length=128,
    return_tensors="pt",
)
# results_fast 直接返回 PyTorch tensor，可以送入模型
print(results_fast["input_ids"].shape)  # (3, 128)
```

### 16.3 流式解码

在 LLM 推理中，生成是逐 token 进行的，需要流式解码：

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("gpt2")

# 流式解码的挑战：部分 token 可能无法独立解码
# 例如 UTF-8 的多字节字符拆成了多个 byte token

class StreamDecoder:
    """流式解码器，处理部分 token 的拼接"""

    def __init__(self, tokenizer):
        self.tokenizer = tokenizer
        self.buffer_ids = []

    def decode_token(self, token_id: int) -> str:
        """
        接收一个新 token，尝试解码。
        如果当前 buffer 无法完整解码（如 UTF-8 多字节序列的中间字节），
        返回空字符串并继续缓冲。
        """
        self.buffer_ids.append(token_id)

        # 尝试解码
        try:
            text = self.tokenizer.decode(
                self.buffer_ids,
                skip_special_tokens=True,
            )
            # 检查是否解码出有效的 Unicode
            text.encode('utf-8')
            self.buffer_ids = []
            return text
        except UnicodeDecodeError:
            # 还需要更多 token 才能完整解码
            return ""

# 使用示例
decoder = StreamDecoder(tokenizer)
generated_ids = [15496, 11, 995, 0]  # "Hello, world!"
for tid in generated_ids:
    text = decoder.decode_token(tid)
    if text:
        print(text, end="", flush=True)
print()
```

---

## 17. 常见坑与最佳实践

### 17.1 常见陷阱

**陷阱一：Tokenizer 与模型不匹配**

```python
# 错误示范：用 GPT-2 的 Tokenizer 给 BERT 模型编码
from transformers import GPT2Tokenizer, BertModel

tokenizer = GPT2Tokenizer.from_pretrained("gpt2")  # 50257 词汇量
model = BertModel.from_pretrained("bert-base-uncased")  # 30522 词汇量

text = "Hello world"
ids = tokenizer.encode(text)
# 如果某个 ID > 30521，model 会报 IndexError
```

**陷阱二：空格敏感性**

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")

# 注意空格的影响
print(enc.encode("hello"))       # [15339]
print(enc.encode(" hello"))      # [24748]   ← 带前导空格，完全不同的 token！
print(enc.encode("hello "))      # [15339, 220]

# 这就是为什么 "Say hello" 中的 "hello" 和单独的 "hello" 可能是不同的 token
```

**陷阱三：数字编码不一致**

```python
# 不同数字的 token 数量差异巨大
numbers = ["42", "1234", "3.14159", "2024-06-15"]
for num in numbers:
    tokens = enc.encode(num)
    print(f"'{num}' → {len(tokens)} tokens: {tokens}")
# '42'         → 1 token
# '1234'       → 2 tokens (可能是 ['123', '4'])
# '3.14159'    → 4 tokens
# '2024-06-15' → 5 tokens
```

**陷阱四：特殊字符导致的意外切分**

```python
# 换行符、制表符、连续空格的编码行为可能出乎意料
texts = [
    "hello\nworld",      # 换行
    "hello\tworld",      # 制表符
    "hello    world",    # 多空格
    "hello\r\nworld",    # Windows 换行
]
for text in texts:
    tokens = enc.encode(text)
    print(f"{repr(text):25s} → {len(tokens)} tokens")
```

### 17.2 最佳实践

**实践一：始终使用模型配套的 Tokenizer**

```python
from transformers import AutoTokenizer, AutoModel

model_name = "bert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModel.from_pretrained(model_name)
# 这样 Tokenizer 和模型保证匹配
```

**实践二：注意 token 数量限制**

```python
def safe_encode(tokenizer, text, max_length=4096):
    """安全编码：截断过长文本"""
    tokens = tokenizer.encode(
        text,
        truncation=True,
        max_length=max_length,
    )
    if len(tokens) == max_length:
        print(f"警告: 文本被截断 (原始约 {len(text)} 字符)")
    return tokens
```

**实践三：预估 token 数量**

```python
def estimate_token_count(text: str, lang: str = "en") -> int:
    """粗略估计 token 数量（不调用 Tokenizer）"""
    if lang == "en":
        # 英文：约 4 字符/token（经验值）
        return len(text) // 4
    elif lang == "zh":
        # 中文：约 1~2 字符/token（取决于 Tokenizer）
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        other_chars = len(text) - chinese_chars
        return chinese_chars + other_chars // 4
    else:
        return len(text) // 3  # 通用估计

# 这在不方便调用 Tokenizer 时（如前端）很有用
```

**实践四：处理特殊字符和 Unicode**

```python
import unicodedata

def normalize_text(text: str) -> str:
    """标准化文本，避免 Unicode 相关的分词问题"""
    # NFKC 标准化：统一全角/半角、合字母等
    text = unicodedata.normalize("NFKC", text)
    # 替换不可见的 Unicode 控制字符
    text = "".join(
        c for c in text
        if unicodedata.category(c) != "Cc" or c in "\n\t\r"
    )
    return text
```

---

## 18. 各主流模型 Tokenizer 横向对比

### 18.1 总览表

| 模型 | 算法 | 框架 | 词汇量 | 基础单元 | 特殊标记风格 |
|------|------|------|--------|---------|-------------|
| GPT-2 | BPE | 自研 | 50,257 | 字节级 | `<\|endoftext\|>` |
| GPT-3.5/4 | BPE | tiktoken | 100,277 | 字节级 | `<\|im_start\|>` |
| GPT-4o | BPE | tiktoken | 200,019 | 字节级 | 同上 |
| BERT | WordPiece | HF | 30,522 | 字符级 | `[CLS]` `[SEP]` |
| RoBERTa | BPE | HF | 50,265 | 字节级 | `<s>` `</s>` |
| T5 | Unigram | SentencePiece | 32,000 | 字符级 | `</s>` `<pad>` |
| LLaMA | BPE | SentencePiece | 32,000 | 字节级+fallback | `<s>` `</s>` |
| LLaMA 3 | BPE | tiktoken | 128,256 | 字节级 | `<\|begin_of_text\|>` |
| Qwen | BPE | tiktoken | 151,936 | 字节级 | `<\|im_start\|>` |
| ChatGLM | BPE | SentencePiece | 130,344 | 字符级 | `[gMASK]` `<sop>` |
| Mistral | BPE | SentencePiece | 32,000 | 字节级 | `<s>` `</s>` |

### 18.2 编码效率对比

以同一段中英混合文本测试各 Tokenizer 的效率：

```
测试文本: "Transformer 架构通过自注意力机制实现了序列到序列的建模"
（30 个字符，含空格和标点）

GPT-2 (r50k):     28 tokens  (压缩比 1.07)
GPT-4 (cl100k):   15 tokens  (压缩比 2.00)
GPT-4o (o200k):   11 tokens  (压缩比 2.73)
BERT (WordPiece): 22 tokens  (压缩比 1.36)
LLaMA (SP 32K):   20 tokens  (压缩比 1.50)
Qwen (152K):      12 tokens  (压缩比 2.50)
```

更大的词汇表 + 多语言训练 = 更好的中文压缩率。

---

## 19. 复杂度分析

### 19.1 训练复杂度

**BPE 训练**：

设语料词汇量为 W（不同的词数），平均词长 L，目标合并次数 M：

- 初始化：O(W × L) — 拆分所有词为字符
- 每步合并：
  - 统计所有 pair：O(W × L)
  - 找最大频率 pair：O(P)，P 为不同 pair 数
  - 执行合并：O(W × L)
- 总复杂度：**O(M × W × L)**

当 M ≈ 30K~100K，W ≈ 100K~1M，L ≈ 10 时，训练通常需要几分钟到几小时。

**优化**：使用优先队列（堆）维护 pair 频率，每步合并后只更新受影响的 pair，可降低常数因子。Hugging Face `tokenizers` 库用 Rust 实现了这一优化。

**Unigram 训练**：

由于涉及 Viterbi 分词（O(n × K) 每个词，n=词长，K=最大 token 长度）和 EM 迭代，总复杂度更高：**O(I × W × L × K)**，其中 I 为 EM 迭代次数。

### 19.2 编码复杂度

**BPE 编码**（单个词）：

- 按合并规则顺序扫描：O(M × L)
- M 为合并规则数，L 为词长
- 优化后（使用 hash 查找）：O(L^2) 或 O(L × log L)

**WordPiece 编码**（单个词）：

- 贪心最长前缀匹配：O(L^2)（最坏情况，每个位置从最长到最短尝试）
- 平均情况接近 O(L)

**Unigram 编码**（Viterbi）：

- O(L × K)，K 为最大 token 长度
- 通常 K ≤ 16，接近 O(L)

### 19.3 空间复杂度

| 组件 | 空间 |
|------|------|
| 词汇表 | O(V)，V 为词汇量 |
| 合并规则（BPE） | O(M)，M 为合并次数 |
| Embedding 矩阵 | O(V × d)，d 为隐层维度 |
| LM Head 矩阵 | O(d × V) |

以 GPT-4（V=100K, d=4096）为例，Embedding + LM Head 约占 100K × 4096 × 2 × 4 bytes ≈ 3.2 GB（FP32），或 0.8 GB（FP16）。

---

## 20. 面试题精选与解析

### 面试题 1：请解释 BPE 算法的训练和编码过程

**答案要点**：

训练阶段是自底向上的迭代合并过程：首先将所有词拆分为字符，然后反复统计语料中最高频的相邻 token 对，将其合并为新的 token 加入词汇表，直到达到目标词汇量。每步的选择标准是**频率最高**的相邻对。

编码阶段是将训练学到的合并规则按顺序应用到新文本：先将文本拆分为字符，然后按照合并规则的训练顺序，依次检查并执行可用的合并，直到没有更多可用规则。

关键点：BPE 是一种贪心算法，训练时每步选择局部最优（最高频对），不保证全局最优分词；编码是确定性的，同一文本总是产生相同的 token 序列。

### 面试题 2：BPE、WordPiece 和 Unigram 有什么区别？各用于哪些模型？

**答案要点**：

三者的核心差异在于：方向、合并/剪枝策略、分词方式。

BPE 自底向上合并，选频率最高的对（贪心压缩），确定性分词。用于 GPT 系列、LLaMA、RoBERTa。

WordPiece 同样自底向上合并，但选互信息最大（而非纯频率）的对，用 `##` 标记非词首子词，编码时用贪心最长前缀匹配。用于 BERT、DistilBERT。

Unigram 自顶向下剪枝，从大候选表开始逐步移除似然损失最小的 token，用 Viterbi 动态规划寻找最优切分，支持概率采样。用于 T5、ALBERT、XLNet（通过 SentencePiece 框架）。

### 面试题 3：什么是 Byte-Level BPE？为什么 GPT-2 采用它？

**答案要点**：

传统 BPE 在 Unicode 字符级别操作，面临两个问题：基础字符集可能非常庞大（Unicode 有 15 万个字符），且罕见字符可能导致 OOV。

Byte-Level BPE 在原始 UTF-8 字节级别操作。由于字节取值范围固定为 0~255，基础词汇表仅 256 个，且任何数据都是字节序列，因此永远不会 OOV。

GPT-2 采用它的原因：一个 Tokenizer 即可处理所有语言和符号，简化工程实现；不需要对不同语言做特殊的预处理；代码、emoji、数学符号等都能自然处理。

代价是非 ASCII 文本（如中文、日文）每个字符可能产生 2~4 个 token（因为 UTF-8 中这些字符占 2~4 字节），编码效率降低。

### 面试题 4：Tokenizer 的词汇量大小对模型有什么影响？

**答案要点**：

词汇量 V 影响多个方面：

模型参数量方面，Embedding 矩阵是 V × d_model，LM Head 是 d_model × V。GPT-4 的 V=100K vs GPT-2 的 V=50K，仅这两层就多出约 2×50K×4096=4 亿参数。

序列长度方面，V 越大，高频词/词组越可能是单个 token，平均序列越短。序列越短意味着推理越快（自注意力是 O(n^2)）、同样上下文窗口能容纳更多内容。

训练效率方面，V 太大会导致低频 token 训练不充分（embedding 欠拟合）；softmax 在 V 维上计算变慢。

多语言公平性方面，V 小的 Tokenizer 训练在英文上时，中文/日文等非拉丁语系需要更多 token，等效上下文窗口更短。

业界共识是 32K~100K 为甜点区间。近期趋势是向更大词汇表发展（GPT-4o 200K，Qwen 152K），以提升多语言效率。

### 面试题 5：为什么 Tokenizer 和模型必须绑定使用？

**答案要点**：

Tokenizer 定义了 token 到 ID 的映射。模型的 Embedding 层是一个矩阵，第 i 行是 token ID=i 的向量表示，这些向量是在训练过程中学习到的。如果更换 Tokenizer，同一个 ID 可能对应完全不同的 token，导致向量语义错乱。

同理，模型输出层的 softmax 也是在原始词汇表上计算概率分布。更换 Tokenizer 后，输出概率对应的 token 也会错乱。

因此 Tokenizer 虽然不含可学习参数，但与模型是不可分割的。这也是为什么分享模型时总是同时分享 Tokenizer 配置文件（tokenizer.json / merges.txt / vocab.json 等）。

### 面试题 6：如何评估一个 Tokenizer 的质量？

**答案要点**：

关键指标包括：压缩率（chars/token，越高越好，说明编码效率高），理想值英文 4~5，中文 1.5~3；UNK 率（越低越好，现代 byte-level 方案可做到 0%）；编码速度（MB/s，影响推理延迟）；多语言均衡性（不同语言的压缩率差异越小越好）；下游任务表现（最终还是要看模型在具体任务上的效果）。

一个好的 Tokenizer 应该在压缩率、词汇表大小、编码速度之间取得平衡，并且不应显著偏向某一种语言。

### 面试题 7：SentencePiece 解决了什么问题？

**答案要点**：

SentencePiece 解决的核心问题是**预分词的语言依赖性**。传统 BPE/WordPiece 假设文本可以先按空格切分为单词（英文），但这个假设对中文、日文、泰文等无空格语言不成立。

SentencePiece 的解决方案是将空格视为普通字符（替换为 `▁`），直接在整个句子级别运行分词算法（BPE 或 Unigram），从而实现与语言无关（language-agnostic）的分词。

这使得一套代码、一个模型就能处理所有语言，极大简化了多语言 NLP 系统的工程实现。LLaMA、T5、mT5 等多语言模型都采用了 SentencePiece。

### 面试题 8：请解释 Subword Regularization 及其作用

**答案要点**：

Subword Regularization 是一种基于 Tokenizer 的数据增强技术，核心思想是在训练时对同一段文本使用不同的切分方式。

Unigram 天然支持概率采样（因为它有概率模型），可以按概率分布采样非最优的切分方式。例如 "unhappiness" 可能被切为 ["un", "happiness"] 或 ["un", "happi", "ness"] 或其他组合，每次训练时随机选一种。

BPE 的类似技术叫 BPE-dropout：在编码时随机跳过一定比例的合并规则（例如以 10% 的概率跳过每条规则），产生更细粒度的切分。

作用：增加训练数据的多样性，减少模型对特定分词方式的过拟合，提升对 OOV 和罕见词的鲁棒性。在机器翻译等任务中可带来 1~2 个 BLEU 点的提升。

### 面试题 9：在实际生产中使用 Tokenizer 有哪些坑？

**答案要点**：

空格敏感性是最常见的坑：" hello" 和 "hello" 可能编码为完全不同的 token。在拼接文本时（如 prompt engineering），多一个或少一个空格就可能改变分词结果和模型行为。

数字编码不一致：不同长度的数字被切分为不同数量的 token，"123" 和 "1234" 的 token 数可能不同。这影响模型的数学推理能力。

token 数量估算：API 按 token 计费，需要准确估算 token 数。简单的字符数/4（英文）只是粗略估计，实际应调用 Tokenizer 精确计算。

特殊字符处理：换行符、制表符、Unicode 控制字符的编码行为可能出乎意料，建议在输入模型前做文本标准化。

上下文窗口溢出：长文本可能超出模型的上下文窗口限制，需要做截断或分块处理，截断点应尽量在句子边界而非 token 中间。

### 面试题 10：请从零手写一个 BPE 分词器的训练和编码函数

**答案要点**：

参见第 10 节的完整实现。核心要点是：

训练函数需要实现词频统计、pair 频率统计、最高频 pair 查找、pair 合并、重复迭代这五个步骤。

编码函数需要将输入文本拆分为字符，然后按训练时学到的合并规则顺序依次应用每条规则。

解码函数将 token 拼接并去除词尾标记。

面试时的加分点：提到时间复杂度 O(M×W×L)、提到可以用优先队列优化、提到 Byte-Level 变体、提到与 WordPiece 的区别（频率 vs 互信息）。

---

## 21. 参考资料

### 核心论文

1. **Sennrich, R., Haddow, B., & Birch, A.** (2016). *Neural Machine Translation of Rare Words with Subword Units.* ACL 2016. — BPE 引入 NLP 的开创性论文。

2. **Schuster, M. & Nakajima, K.** (2012). *Japanese and Korean Voice Search.* ICASSP 2012. — WordPiece 原始论文。

3. **Kudo, T.** (2018). *Subword Regularization: Improving Neural Network Translation Models with Multiple Subword Candidates.* ACL 2018. — Unigram 语言模型分词。

4. **Kudo, T. & Richardson, J.** (2018). *SentencePiece: A simple and language independent subword tokenizer and detokenizer for Neural Text Processing.* EMNLP 2018. — SentencePiece 框架。

5. **Radford, A. et al.** (2019). *Language Models are Unsupervised Multitask Learners.* OpenAI. — GPT-2 论文，引入 Byte-Level BPE。

### 工具与库

- **Hugging Face tokenizers**: https://github.com/huggingface/tokenizers — Rust 实现的高性能 Tokenizer 库
- **SentencePiece**: https://github.com/google/sentencepiece — Google 的语言无关分词框架
- **tiktoken**: https://github.com/openai/tiktoken — OpenAI 的 BPE 实现（Rust 核心）
- **Hugging Face Tokenizer 教程**: https://huggingface.co/docs/tokenizers — 详细的 API 文档和教程

### 推荐阅读

- Andrej Karpathy 的视频 *"Let's build the GPT Tokenizer"* — 从零手写 BPE 的绝佳教程
- Hugging Face NLP Course Chapter 6: Tokenizers — 系统介绍三种子词分词算法
- Lilian Weng 的博客 *"The Transformer Family"* — 包含 Tokenizer 在整体架构中的位置分析
