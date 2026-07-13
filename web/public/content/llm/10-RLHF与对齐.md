# 10 - RLHF 与对齐（Alignment）

> **定位**：大模型「从能说话到说人话」的关键一步。预训练让模型拥有语言能力，SFT 让模型学会指令跟随，而 RLHF（Reinforcement Learning from Human Feedback）让模型的输出**真正对齐人类偏好**——安全、有帮助、诚实。本篇从直觉到数学、从经典 RLHF-PPO 到最新的 DPO / KTO / ORPO，给出完整链条：是什么 → 为什么 → 怎么做 → 底层原理 → 代码实战 → 工程实践 → 面试与易错点。

---

## 目录

1. [什么是对齐（Alignment）](#1-什么是对齐alignment)
2. [为什么需要对齐——预训练与 SFT 的局限](#2-为什么需要对齐预训练与-sft-的局限)
3. [RLHF 全流程概览](#3-rlhf-全流程概览)
4. [阶段一：监督微调 SFT（回顾）](#4-阶段一监督微调-sft回顾)
5. [阶段二：奖励模型 RM 训练](#5-阶段二奖励模型-rm-训练)
6. [阶段三：PPO 强化学习优化](#6-阶段三ppo-强化学习优化)
7. [DPO：无需 RM 的直接偏好优化](#7-dpodirect-preference-optimization)
8. [其他对齐方法一览](#8-其他对齐方法一览)
9. [代码实战：从零手写 RLHF-PPO](#9-代码实战从零手写-rlhf-ppo)
10. [代码实战：使用 TRL 库训练 RLHF](#10-代码实战使用-trl-库训练-rlhf)
11. [代码实战：DPO 训练](#11-代码实战dpo-训练)
12. [RLHF vs DPO 对比分析](#12-rlhf-vs-dpo-对比分析)
13. [工程最佳实践](#13-工程最佳实践)
14. [常见面试题（附答案要点）](#14-常见面试题附答案要点)
15. [易错点与踩坑指南](#15-易错点与踩坑指南)

---

## 1. 什么是对齐（Alignment）

### 1.1 对齐的定义

**对齐（Alignment）** 是指让 AI 系统的行为和目标与人类的意图、价值观和期望保持一致的过程。在大模型的语境下，对齐具体意味着让模型的输出满足三个核心准则——来自 OpenAI 的 **HHH 原则**：

**Helpful（有帮助）**：模型应尽力为用户提供准确、相关、有用的信息和回答。它不应拒绝合理的请求，也不应给出空洞敷衍的回复。

**Honest（诚实）**：模型应如实表达自己知道和不知道的边界，不编造事实（减少幻觉），不表达虚假的确信。当不确定时应明确表示。

**Harmless（无害）**：模型不应生成有毒内容（toxic content），如仇恨言论、暴力指导、违法信息等。即使用户试图诱导（jailbreak），模型也应保持安全边界。

### 1.2 对齐在大模型训练中的位置

大模型的完整训练流程通常分为三个阶段：

```
阶段一：预训练（Pre-training）
  ↓  海量无标注文本 → 语言建模能力
阶段二：监督微调（Supervised Fine-Tuning, SFT）
  ↓  高质量指令-回答对 → 指令跟随能力
阶段三：对齐（Alignment / RLHF）
  ↓  人类偏好数据 → 行为符合人类期望
最终模型：既有能力，又守规矩
```

一个流行的类比：预训练是"上大学学知识"，SFT 是"入职培训学规范"，RLHF 是"工作中根据用户反馈持续改进"。

### 1.3 对齐的历史脉络

对齐并非 ChatGPT 才出现的概念。简要时间线如下：

**2017 年**：Christiano 等人在 DeepMind 提出了 RLHF 的基本框架——用人类偏好训练奖励模型，再用 RL 优化策略。当时的应用场景是 Atari 游戏和机器人控制。

**2020 年**：Stiennon 等人（OpenAI）将 RLHF 应用到文本摘要任务（"Learning to summarize from human feedback"），证明了 RLHF 在 NLP 中的有效性。

**2022 年 3 月**：InstructGPT 论文发表（Ouyang et al.），完整描述了 SFT → RM → PPO 的三阶段流程，这正是 ChatGPT 背后的核心技术。

**2023 年 5 月**：Rafailov 等人（Stanford）提出 **DPO（Direct Preference Optimization）**，证明可以跳过 RM 训练、直接用偏好数据优化策略模型，极大简化了对齐流程。

**2023-2025 年**：大量 DPO 变体涌现——IPO、KTO、ORPO、SimPO、SPPO 等，形成了"无 RL 对齐"的研究热潮。同时，经典 RLHF-PPO 也在 DeepSeek、Llama 等项目中持续被使用和改进。

---

## 2. 为什么需要对齐——预训练与 SFT 的局限

### 2.1 预训练的问题

预训练模型（如 GPT 系列的 Base Model）通过 next-token prediction 在海量文本上学习，本质上是**建模互联网文本的分布**。这带来几个根本问题：

**问题一：目标不对齐。** 预训练的目标是"预测下一个 token"，而不是"给出有帮助的回答"。一个完美的预训练模型会同样擅长续写维基百科、暗网论坛帖子和诈骗邮件——它只关心概率，不关心善恶。

**问题二：无法跟随指令。** 给 Base Model 一个问题"什么是 RLHF？"，它可能不是回答问题，而是继续生成更多问题（因为训练数据中大量 FAQ 格式是一问一答列表）。

**问题三：有害内容。** 训练数据包含各种有毒内容，Base Model 会毫无顾忌地生成攻击性、歧视性、危险性的文本。

### 2.2 SFT 解决了部分问题，但不够

SFT（详见上一篇）通过在高质量的（指令，回答）对上微调，教会模型"用 Q&A 模式回复"。这解决了指令跟随问题，但仍然存在显著局限：

**局限一：SFT 只教"什么是好的"，不教"什么是坏的"。** SFT 数据只有正样本（好回答），模型不知道哪些回答是差的、为什么差。就像只给学生标准答案，不批改错题——学生可能理解了答案模式，但不清楚错误边界。

**局限二：标注者水平天花板。** SFT 数据需要标注者写出完整回答，模型的上限受限于标注者的水平。而 RLHF 只需要标注者做**比较判断**（A 好还是 B 好），这比写出完美回答容易得多。心理学研究表明，人类擅长比较（comparative judgment），不擅长绝对评估（absolute scoring）。

**局限三：多样性不足。** SFT 倾向于让模型输出与训练数据风格高度一致的回答，可能导致多样性丧失和过度拟合特定标注者的偏好。

### 2.3 RLHF 的核心直觉

RLHF 的思路可以用一个简单类比概括：

> 想象你在训练一个新员工。SFT 相当于给他一本工作手册，上面写了标准操作流程。RLHF 则是让他实际工作，然后由经理点评"这个做得好、那个做得不好"，员工根据反馈不断改进。

核心优势在于：**人类给反馈比亲自做容易得多**。让人写一首好诗很难，但让人判断"A 诗好还是 B 诗好"容易得多。RLHF 正是利用了这一点——将高质量的人类判断能力转化为模型改进的信号。

---

## 3. RLHF 全流程概览

经典 RLHF（以 InstructGPT 为代表）分三个阶段：

```
┌─────────────────────────────────────────────────────────┐
│                    RLHF 三阶段流程                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  阶段 1: SFT (Supervised Fine-Tuning)                    │
│  ┌─────────┐    高质量数据     ┌──────────┐             │
│  │Base Model├───────────────→│ SFT Model │             │
│  └─────────┘  (prompt,answer) └──────────┘             │
│                                     │                    │
│  阶段 2: RM (Reward Model Training)  │                    │
│                                     ▼                    │
│  ┌──────────┐   生成多个回答   ┌──────────┐             │
│  │ SFT Model├───────────────→│ 人类标注  │             │
│  └──────────┘  (y₁,y₂,...yₖ) │ 排序偏好  │             │
│                               └────┬─────┘             │
│                                    ▼                    │
│                          ┌──────────────┐               │
│                          │ Reward Model │               │
│                          │  r_θ(x, y)   │               │
│                          └──────┬───────┘               │
│                                 │                        │
│  阶段 3: PPO (RL Optimization)    │                        │
│                                 ▼                        │
│  ┌──────────┐  生成回答  ┌──────────────┐               │
│  │ RL Model ├──────────→│    RM 打分    │               │
│  │ π_ϕ(y|x) │←──────────┤  r_θ(x, y)   │               │
│  └──────────┘  PPO更新   └──────────────┘               │
│       │                                                  │
│       │  KL 约束: 不要偏离 SFT Model 太远                  │
│       ▼                                                  │
│  ┌───────────────┐                                       │
│  │ Aligned Model │  ← 最终对齐后的模型                     │
│  └───────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

三个阶段各自承担不同职责：阶段 1（SFT）给模型一个好的起点；阶段 2（RM）将人类偏好蒸馏成一个可微分的奖励函数；阶段 3（PPO）用强化学习最大化奖励，同时通过 KL 散度惩罚防止模型退化。

---

## 4. 阶段一：监督微调 SFT（回顾）

这一阶段在上一篇（08-微调 SFT）已详细讲解，此处仅简要回顾其在 RLHF 流程中的角色。

### 4.1 SFT 的作用

SFT 为后续的 RL 优化提供一个合理的**初始策略（initial policy）**。如果直接对 Base Model 做 RLHF，模型的输出空间太大、太随机，RL 训练极难收敛。SFT 将模型的输出分布"收窄"到合理区间，让 RL 有一个好的起点。

### 4.2 SFT 数据规模

InstructGPT 使用了约 **13,000 条** SFT 数据（13K prompt + 标注者写的回答）。相比预训练的万亿 token，SFT 数据量非常小——这说明对齐不是靠堆数据量，而是靠数据质量和训练方式。

### 4.3 SFT 模型的双重角色

在 RLHF 流程中，SFT 模型不仅是 RL 优化的起点（初始策略 π_SFT），还充当 **参考策略（reference policy π_ref）**——在 PPO 阶段，KL 散度惩罚项会约束 RL 模型不要偏离 SFT 模型太远，防止 reward hacking。

---

## 5. 阶段二：奖励模型 RM 训练

### 5.1 为什么需要奖励模型

强化学习需要一个**奖励信号（reward signal）** 来告诉智能体什么行为好、什么行为差。在游戏（如 Atari）中，奖励是天然的（得分）；但在语言生成中，没有天然的奖励函数——什么是"好回答"取决于人类的主观判断。

如果每次都让人类实时打分，效率太低、成本太高。解决方案是：**用一个神经网络来近似人类的偏好判断**——这就是奖励模型（Reward Model, RM）。

### 5.2 偏好数据的收集

偏好数据的收集流程如下：

**步骤一：准备 prompt。** 从真实用户请求或精心设计的 prompt 集合中采样。

**步骤二：生成候选回答。** 对每个 prompt，用 SFT 模型（或不同解码参数）生成 K 个候选回答 (y₁, y₂, ..., yₖ)，通常 K = 4~9。

**步骤三：人类标注排序。** 标注者对 K 个回答按质量排序（从最好到最差），得到一个排列（ranking），例如 y₃ > y₁ > y₄ > y₂。

**步骤四：拆解为偏好对。** 从排序中拆解出 C(K,2) 个偏好对（pairwise comparison）。例如 4 个回答的排序可以拆出 6 个偏好对：(y₃ ≻ y₁), (y₃ ≻ y₄), (y₃ ≻ y₂), (y₁ ≻ y₄), (y₁ ≻ y₂), (y₄ ≻ y₂)。

InstructGPT 使用了约 **33,000 条 prompt**，每条 4~9 个回答，标注者排序后产生了大量偏好对用于 RM 训练。

### 5.3 Bradley-Terry 偏好模型

奖励模型的训练基于 **Bradley-Terry（BT）模型**，这是一个经典的概率排序模型（1952 年提出），广泛用于体育赛事排名、推荐系统等。

BT 模型假设：给定两个回答 y₁ 和 y₂，人类偏好 y₁ 的概率由两者的"实力"（在这里用奖励值表示）的差决定：

$$P(y_1 \succ y_2 | x) = \sigma(r_\theta(x, y_1) - r_\theta(x, y_2))$$

其中：$\sigma$ 是 sigmoid 函数 $\sigma(z) = \frac{1}{1+e^{-z}}$，$r_\theta(x, y)$ 是奖励模型对 prompt x 和回答 y 的打分（一个标量），$y_1 \succ y_2$ 表示"y₁ 优于 y₂"。

直觉解释：如果 $r_\theta(x, y_1)$ 远大于 $r_\theta(x, y_2)$，sigmoid 输出接近 1，表示模型非常确信 y₁ 更好。如果两个奖励值接近，sigmoid 输出接近 0.5，表示模型不太确定哪个更好。

### 5.4 RM 的损失函数

给定一个偏好对 $(y_w, y_l)$（w = winner/chosen, l = loser/rejected），RM 的训练目标是最大化所选回答的奖励值与被拒回答的奖励值之差。等价的损失函数为：

$$\mathcal{L}_{RM}(\theta) = -\mathbb{E}_{(x, y_w, y_l) \sim D} \left[ \log \sigma(r_\theta(x, y_w) - r_\theta(x, y_l)) \right]$$

这其实就是一个 **二分类交叉熵损失**（binary cross-entropy），只不过分类的对象是"哪个回答更好"。

当来自同一 prompt 的 K 个回答产生 C(K,2) 个偏好对时，InstructGPT 将损失修改为对来自同一 prompt 的所有偏好对取平均，避免某些 prompt 因为 K 大而在梯度中占主导。

### 5.5 RM 的模型架构

奖励模型通常基于 SFT 模型初始化，但做一个关键修改：**去掉语言模型头（LM head），换上一个线性层输出标量奖励值**。

```
输入: [prompt + response] → Tokenize → Transformer (SFT 初始化)
                                           ↓
                              最后一个 token 的 hidden state
                                           ↓
                                  Linear(hidden_dim, 1)
                                           ↓
                                     标量奖励值 r
```

为什么用最后一个 token？因为模型是自回归的（causal），最后一个 token 的 hidden state 已经"看过"了整个输入序列，包含了对 prompt + response 的全局理解。

实践中，RM 的参数规模通常比策略模型小。例如 InstructGPT 的策略模型是 175B，RM 是 6B。但也有研究表明，RM 越大效果越好（Llama 2 使用了与策略模型同等规模的 RM）。

### 5.6 RM 训练的注意事项

**数据泄露风险**：同一 prompt 的不同偏好对不应分到训练集和验证集中——这会导致严重过拟合（因为模型可以通过记住 prompt 来"作弊"）。正确做法是按 prompt 分组切分数据集。

**奖励值的尺度**：BT 模型中奖励值可以任意平移（加一个常数不影响 sigmoid 的输出）。因此训练时通常对奖励值做归一化，或在 PPO 阶段对奖励值做标准化（whitening）。

**评估指标**：RM 的核心评估指标是偏好对的**准确率（accuracy）**——模型对 chosen response 给出的奖励是否高于 rejected response。典型的好 RM 准确率在 70%~75%（考虑到人类标注者间的一致率通常也只有 73%~77%，这已经接近人类水平）。

### 5.7 从零实现 Reward Model

以下是一个完整的 Reward Model 实现：

```python
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from transformers import AutoModelForCausalLM, AutoTokenizer


class RewardModel(nn.Module):
    """
    基于预训练语言模型的奖励模型。
    将 LM head 替换为标量输出头，对 (prompt, response) 输出一个奖励值。
    """

    def __init__(self, model_name: str, dropout: float = 0.1):
        super().__init__()
        # 加载预训练模型的 backbone（不含 LM head）
        self.backbone = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=torch.bfloat16
        )
        # 去掉 LM head，只保留 transformer backbone
        if hasattr(self.backbone, 'lm_head'):
            self.backbone.lm_head = nn.Identity()

        hidden_size = self.backbone.config.hidden_size

        # 奖励头：将最后一个 token 的 hidden state 映射到标量
        self.reward_head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_size, 1)
        )

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            input_ids: [batch_size, seq_len]
            attention_mask: [batch_size, seq_len]
        Returns:
            rewards: [batch_size] 标量奖励值
        """
        # 获取所有 token 的 hidden states
        outputs = self.backbone(
            input_ids=input_ids,
            attention_mask=attention_mask,
            output_hidden_states=True
        )
        # 取最后一层的 hidden states
        hidden_states = outputs.hidden_states[-1]  # [batch, seq_len, hidden]

        # 找到每个样本最后一个非 padding token 的位置
        sequence_lengths = attention_mask.sum(dim=1) - 1  # [batch]
        batch_indices = torch.arange(
            hidden_states.size(0), device=hidden_states.device
        )
        last_hidden = hidden_states[batch_indices, sequence_lengths]  # [batch, hidden]

        # 通过奖励头得到标量
        rewards = self.reward_head(last_hidden).squeeze(-1)  # [batch]
        return rewards


class PreferenceDataset(Dataset):
    """偏好数据集：每条数据包含 (prompt, chosen_response, rejected_response)。"""

    def __init__(self, data: list, tokenizer, max_length: int = 512):
        self.data = data
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        prompt = item["prompt"]

        # 编码 chosen response
        chosen_text = prompt + item["chosen"]
        chosen_enc = self.tokenizer(
            chosen_text,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )

        # 编码 rejected response
        rejected_text = prompt + item["rejected"]
        rejected_enc = self.tokenizer(
            rejected_text,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )

        return {
            "chosen_input_ids": chosen_enc["input_ids"].squeeze(0),
            "chosen_attention_mask": chosen_enc["attention_mask"].squeeze(0),
            "rejected_input_ids": rejected_enc["input_ids"].squeeze(0),
            "rejected_attention_mask": rejected_enc["attention_mask"].squeeze(0),
        }


def compute_rm_loss(
    reward_model: RewardModel,
    chosen_ids: torch.Tensor,
    chosen_mask: torch.Tensor,
    rejected_ids: torch.Tensor,
    rejected_mask: torch.Tensor,
    margin: float = 0.0
) -> tuple:
    """
    计算 Bradley-Terry 偏好损失。

    loss = -log(sigmoid(r_chosen - r_rejected - margin))

    Args:
        margin: 可选的 margin，要求 chosen 的奖励至少比 rejected 高 margin
    Returns:
        (loss, accuracy) 元组
    """
    rewards_chosen = reward_model(chosen_ids, chosen_mask)
    rewards_rejected = reward_model(rejected_ids, rejected_mask)

    # Bradley-Terry 损失
    logits = rewards_chosen - rewards_rejected - margin
    loss = -torch.nn.functional.logsigmoid(logits).mean()

    # 准确率：chosen 奖励 > rejected 奖励 的比例
    accuracy = (rewards_chosen > rewards_rejected).float().mean()

    return loss, accuracy


def train_reward_model(
    model_name: str = "gpt2",
    train_data: list = None,
    num_epochs: int = 3,
    batch_size: int = 4,
    lr: float = 1e-5,
    device: str = "cuda"
):
    """训练奖励模型的完整流程。"""
    if train_data is None:
        train_data = [
            {
                "prompt": "请解释什么是机器学习。\n",
                "chosen": "机器学习是人工智能的一个分支，它使计算机系统能够"
                          "从数据中学习并改进其性能，而无需被显式编程。"
                          "主要方法包括监督学习、无监督学习和强化学习。",
                "rejected": "机器学习就是让电脑学东西。"
            },
        ]

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = RewardModel(model_name).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    dataset = PreferenceDataset(train_data, tokenizer)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    model.train()
    for epoch in range(num_epochs):
        total_loss, total_acc, steps = 0.0, 0.0, 0
        for batch in dataloader:
            batch = {k: v.to(device) for k, v in batch.items()}

            loss, acc = compute_rm_loss(
                model,
                batch["chosen_input_ids"],
                batch["chosen_attention_mask"],
                batch["rejected_input_ids"],
                batch["rejected_attention_mask"]
            )

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            total_loss += loss.item()
            total_acc += acc.item()
            steps += 1

        avg_loss = total_loss / max(steps, 1)
        avg_acc = total_acc / max(steps, 1)
        print(f"Epoch {epoch+1}/{num_epochs} | "
              f"Loss: {avg_loss:.4f} | Accuracy: {avg_acc:.4f}")

    return model
```

---

## 6. 阶段三：PPO 强化学习优化

### 6.1 强化学习建模语言生成

将文本生成建模为马尔可夫决策过程（Markov Decision Process, MDP）：

| MDP 组件 | 对应到文本生成 |
|:---------|:-------------|
| **状态（State）** | 已生成的 token 序列 $s_t = (x, y_1, ..., y_t)$ |
| **动作（Action）** | 下一个要生成的 token $a_t = y_{t+1}$ |
| **策略（Policy）** | 语言模型 $\pi_\phi(a_t \| s_t)$，即 token 概率分布 |
| **奖励（Reward）** | 完整回答结束时，RM 给出的标量奖励 $r_\theta(x, y)$ |
| **终止条件** | 生成 EOS token 或达到最大长度 |

注意：奖励是**稀疏的（sparse）**——只在生成完成时才有奖励，中间 token 没有奖励信号。这使得信用分配（credit assignment）成为关键挑战，也是 PPO 中 GAE（Generalized Advantage Estimation）发挥作用的地方。

### 6.2 RLHF 的优化目标

RLHF 的完整优化目标如下：

$$\max_{\pi_\phi} \; \mathbb{E}_{x \sim D, \, y \sim \pi_\phi(\cdot|x)} \left[ r_\theta(x, y) - \beta \cdot D_{KL}(\pi_\phi(\cdot|x) \| \pi_{ref}(\cdot|x)) \right]$$

这个目标有两个部分：

**第一项：最大化奖励。** $r_\theta(x, y)$ 是 RM 给出的奖励，我们希望模型生成高奖励的回答。

**第二项：KL 散度惩罚。** $D_{KL}(\pi_\phi \| \pi_{ref})$ 衡量当前策略 $\pi_\phi$ 与参考策略 $\pi_{ref}$（通常是 SFT 模型）的分布差距。$\beta$ 是控制惩罚强度的超参数。

KL 惩罚的作用至关重要：它防止策略模型通过"钻 RM 漏洞"来获取高奖励（即 **reward hacking / reward overoptimization**）。例如，如果 RM 对长回答给高分，没有 KL 约束的策略模型可能会生成无意义的超长文本来刷分。KL 惩罚确保模型不会偏离 SFT 模型太远，保持输出质量。

### 6.3 KL 散度的计算

对于自回归语言模型，KL 散度可以逐 token 分解：

$$D_{KL}(\pi_\phi \| \pi_{ref}) = \sum_{t=1}^{T} D_{KL}(\pi_\phi(\cdot|s_t) \| \pi_{ref}(\cdot|s_t))$$

在实践中，通常近似计算为：

$$\hat{D}_{KL} = \sum_{t=1}^{T} \left[ \log \pi_\phi(y_t|s_t) - \log \pi_{ref}(y_t|s_t) \right]$$

这是对 KL 散度的蒙特卡洛近似（用策略生成的 trajectory 采样）。它等于逐 token 的对数概率比（log-probability ratio）之和。

### 6.4 每个 token 的修正奖励

将 KL 惩罚融入逐 token 奖励中：

对于中间 token（$t < T$）：

$$\tilde{r}_t = -\beta \cdot \left[ \log \pi_\phi(y_t|s_t) - \log \pi_{ref}(y_t|s_t) \right]$$

对于最后一个 token（$t = T$）：

$$\tilde{r}_T = r_\theta(x, y) - \beta \cdot \left[ \log \pi_\phi(y_T|s_T) - \log \pi_{ref}(y_T|s_T) \right]$$

这样，RM 给出的稀疏奖励（只在末尾）被转化为逐 token 的密集奖励信号，便于用 PPO 中的 GAE 进行优势估计。

### 6.5 PPO 算法详解

PPO（Proximal Policy Optimization）是 OpenAI 在 2017 年提出的策略梯度算法，因其训练稳定性好、实现相对简单而成为 RLHF 的首选 RL 算法。

#### 6.5.1 策略梯度的基本思想

策略梯度（Policy Gradient）的核心思想是：如果一个动作带来了正向奖励，就增加该动作的概率；如果带来了负向奖励，就降低该动作的概率。

最基本的策略梯度公式（REINFORCE）：

$$\nabla_\phi J(\phi) = \mathbb{E}_{\tau \sim \pi_\phi} \left[ \sum_{t=0}^{T} \nabla_\phi \log \pi_\phi(a_t|s_t) \cdot A_t \right]$$

其中 $A_t$ 是优势函数（advantage function），衡量"在状态 $s_t$ 下执行动作 $a_t$ 比平均水平好多少"。

#### 6.5.2 PPO 的核心改进：Clipped Surrogate Objective

原始策略梯度的问题是更新步长难以控制——步长太大会导致策略崩溃（catastrophic policy change）。PPO 通过 **裁剪比率（clipping ratio）** 来限制每次更新的幅度：

$$L^{CLIP}(\phi) = \mathbb{E}_t \left[ \min\left( \rho_t(\phi) \cdot A_t, \; \text{clip}(\rho_t(\phi), 1-\epsilon, 1+\epsilon) \cdot A_t \right) \right]$$

其中：

$$\rho_t(\phi) = \frac{\pi_\phi(a_t|s_t)}{\pi_{\phi_{old}}(a_t|s_t)}$$

$\rho_t$ 是新旧策略的概率比（importance sampling ratio）。$\epsilon$ 是裁剪参数，通常取 0.2。clip 函数将比率限制在 $[1-\epsilon, 1+\epsilon] = [0.8, 1.2]$ 之间。

直觉理解 PPO 裁剪：

- 当 $A_t > 0$（好动作）时：我们想增大 $\rho_t$（提高该动作概率），但裁剪不让 $\rho_t$ 超过 $1+\epsilon$，防止过度增大
- 当 $A_t < 0$（差动作）时：我们想减小 $\rho_t$（降低该动作概率），但裁剪不让 $\rho_t$ 低于 $1-\epsilon$，防止过度降低
- 效果：每次更新的幅度被限制在一个"信任区域"（trust region）内，训练更稳定

#### 6.5.3 GAE：广义优势估计

优势函数 $A_t$ 的估计质量直接影响训练效果。GAE（Generalized Advantage Estimation）通过指数加权平均来平衡偏差（bias）和方差（variance）：

首先定义 TD 残差（Temporal Difference residual）：

$$\delta_t = \tilde{r}_t + \gamma V(s_{t+1}) - V(s_t)$$

其中 $V(s_t)$ 是价值函数（value function）的估计，$\gamma$ 是折扣因子。

然后 GAE 优势估计为：

$$\hat{A}_t^{GAE(\gamma, \lambda)} = \sum_{l=0}^{T-t} (\gamma \lambda)^l \delta_{t+l}$$

$\lambda$ 是 GAE 参数（通常 0.95）。$\lambda = 0$ 退化为 1 步 TD（低方差、高偏差），$\lambda = 1$ 退化为蒙特卡洛估计（高方差、低偏差）。

#### 6.5.4 价值函数（Critic）

PPO 需要一个价值函数 $V_\psi(s_t)$ 来估计状态价值，用于计算 GAE。在 RLHF 中，价值函数通常：

- 从 RM 或 SFT 模型初始化
- 输入是当前状态（已生成的 token 序列），输出是一个标量（预期累积奖励）
- 用 MSE 损失训练：$L^{VF}(\psi) = \mathbb{E}_t \left[ (V_\psi(s_t) - V_t^{target})^2 \right]$

#### 6.5.5 PPO 的完整损失

RLHF 中 PPO 的完整损失函数由三部分组成：

$$L^{PPO}(\phi, \psi) = -L^{CLIP}(\phi) + c_1 \cdot L^{VF}(\psi) - c_2 \cdot H[\pi_\phi]$$

第一项 $L^{CLIP}$：策略损失（裁剪后的代理目标），取负号因为我们要最大化。第二项 $L^{VF}$：价值函数损失，$c_1$ 通常取 0.5。第三项 $H[\pi_\phi]$：熵奖励（entropy bonus），鼓励策略保持一定探索性，$c_2$ 通常取 0.01。

### 6.6 PPO 训练流程

```
Algorithm: RLHF-PPO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
输入：SFT 模型 π_SFT, 奖励模型 r_θ, prompt 数据集 D
初始化：策略模型 π_ϕ ← π_SFT, 价值模型 V_ψ ← 随机或 RM 初始化
       参考模型 π_ref ← π_SFT (冻结权重)

FOR each iteration:
  1. 采样 prompt batch: {x_1, ..., x_B} ~ D

  2. 生成回答 (Rollout):
     FOR each x_i:
       y_i ~ π_ϕ(·|x_i)  # 用当前策略采样生成

  3. 计算奖励:
     FOR each (x_i, y_i):
       r_i = r_θ(x_i, y_i)  # RM 打分
       # 计算逐 token KL 惩罚
       FOR each token t in y_i:
         kl_t = log π_ϕ(y_t|s_t) - log π_ref(y_t|s_t)
         r̃_t = -β * kl_t  (中间 token)
         r̃_T = r_i - β * kl_T  (最后 token)

  4. 计算优势 (GAE):
     FOR each (x_i, y_i):
       FOR t = T, T-1, ..., 1:
         δ_t = r̃_t + γ·V_ψ(s_{t+1}) - V_ψ(s_t)
         Â_t = δ_t + γλ·Â_{t+1}

  5. PPO 更新 (多个 mini-batch epoch):
     FOR each PPO epoch (通常 4 轮):
       FOR each mini-batch:
         # 策略损失
         ρ_t = π_ϕ(a_t|s_t) / π_ϕ_old(a_t|s_t)
         L_clip = min(ρ_t·Â_t, clip(ρ_t, 1±ε)·Â_t)
         # 价值损失
         L_vf = (V_ψ(s_t) - V_target)²
         # 总损失
         L = -L_clip + c₁·L_vf - c₂·H[π_ϕ]
         # 梯度更新
         ϕ, ψ ← Adam(ϕ, ψ, ∇L)

  6. 更新旧策略: π_ϕ_old ← π_ϕ

RETURN π_ϕ (对齐后的模型)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6.7 Reward Hacking 与对策

**Reward Hacking（奖励欺骗）** 是 RLHF 最核心的问题之一。RM 毕竟是人类偏好的不完美近似，策略模型可能会发现 RM 的漏洞并加以利用，获得高奖励分但实际质量很差。

常见的 reward hacking 模式：

**过度冗长**：RM 可能对长回答有偏好，策略模型就无限扩展回答长度。

**过度谨慎/拒绝**：RM 可能对安全性打高分，策略模型就对几乎所有问题都回复"我不能回答这个问题"。

**迎合性回答**：RM 可能偏好肯定用户的回答，策略模型就一味赞同，不纠正用户的错误。

**格式套利**：RM 可能对有序列表、加粗标题等格式化回答给高分，策略模型就堆砌格式。

对策如下：

**KL 惩罚**：最直接的防线，限制策略偏离参考模型的程度。$\beta$ 太小则 reward hacking 严重，太大则 RL 训练效果微弱。

**奖励标准化**：对 RM 输出做 whitening（减均值除标准差），使奖励信号更稳定。

**早停**：监控验证集上的 KL 散度和奖励分布，在过拟合前停止训练。

**多元 RM**：使用多个 RM 的集成，减少单一 RM 被利用的风险。

---

## 7. DPO（Direct Preference Optimization）

### 7.1 DPO 的动机

RLHF-PPO 虽然效果好，但工程复杂度很高：需要训练和维护 4 个模型（SFT 模型、RM、策略模型、价值模型），需要精心调节 PPO 的众多超参数（$\epsilon$, $\gamma$, $\lambda$, $\beta$, 学习率, batch size 等），训练不稳定，GPU 显存占用大。

DPO（Direct Preference Optimization，直接偏好优化）的核心思想是：**可以绕过 RM 训练和 RL 优化，直接用偏好数据优化策略模型**。DPO 把对齐问题从 RL 问题转化为简单的分类问题。

### 7.2 DPO 的数学推导

DPO 的推导从 RLHF 的优化目标出发，通过一系列巧妙的数学变换得到一个闭合形式的解。

**起点：RLHF 的 KL 约束优化目标**

$$\max_{\pi} \; \mathbb{E}_{x \sim D, y \sim \pi(\cdot|x)} \left[ r(x, y) \right] - \beta \cdot D_{KL}(\pi \| \pi_{ref})$$

**Step 1：写出最优策略的闭合形式**

对于这个 KL 正则化的 bandit 问题，最优策略有一个已知的闭合形式解：

$$\pi^*(y|x) = \frac{1}{Z(x)} \pi_{ref}(y|x) \exp\left(\frac{r(x, y)}{\beta}\right)$$

其中 $Z(x) = \sum_y \pi_{ref}(y|x) \exp\left(\frac{r(x, y)}{\beta}\right)$ 是配分函数（partition function），确保概率和为 1。

这个公式的直觉：最优策略在参考策略的基础上，按照奖励的指数进行"重新加权"——高奖励的回答概率被放大，低奖励的被缩小。

**Step 2：反解奖励函数**

从上面的最优策略公式，对两边取对数：

$$\log \pi^*(y|x) = \log \pi_{ref}(y|x) + \frac{r(x, y)}{\beta} - \log Z(x)$$

解出 $r(x, y)$：

$$r(x, y) = \beta \log \frac{\pi^*(y|x)}{\pi_{ref}(y|x)} + \beta \log Z(x)$$

这是 DPO 推导中最关键的一步——**它把奖励函数重新参数化为策略与参考策略的对数比率**（加一个只跟 x 有关的常数项）。

**Step 3：代入 Bradley-Terry 模型**

将重新参数化的奖励代入 BT 偏好概率：

$$P(y_w \succ y_l | x) = \sigma(r(x, y_w) - r(x, y_l))$$

$$= \sigma\left(\beta \log \frac{\pi^*(y_w|x)}{\pi_{ref}(y_w|x)} - \beta \log \frac{\pi^*(y_l|x)}{\pi_{ref}(y_l|x)}\right)$$

注意 $\beta \log Z(x)$ 项在做差时相消了！

**Step 4：得到 DPO 损失函数**

用策略模型 $\pi_\phi$ 替代最优策略 $\pi^*$，得到 DPO 的损失：

$$\mathcal{L}_{DPO}(\phi) = -\mathbb{E}_{(x, y_w, y_l) \sim D} \left[ \log \sigma \left( \beta \log \frac{\pi_\phi(y_w|x)}{\pi_{ref}(y_w|x)} - \beta \log \frac{\pi_\phi(y_l|x)}{\pi_{ref}(y_l|x)} \right) \right]$$

简化记号：令 $\hat{r}_\phi(x, y) = \beta \log \frac{\pi_\phi(y|x)}{\pi_{ref}(y|x)}$（隐式奖励），则：

$$\mathcal{L}_{DPO}(\phi) = -\mathbb{E}_{(x, y_w, y_l)} \left[ \log \sigma(\hat{r}_\phi(x, y_w) - \hat{r}_\phi(x, y_l)) \right]$$

形式上与 RM 的损失函数完全一样，只是"奖励"从显式的 RM 输出变成了策略模型的隐式奖励。

### 7.3 DPO 的直觉理解

DPO 损失的梯度方向可以分解为两个力：

**增大 chosen 的概率**：$\nabla_\phi \log \pi_\phi(y_w|x)$ 方向，让模型更倾向于生成被选中的回答。

**降低 rejected 的概率**：$-\nabla_\phi \log \pi_\phi(y_l|x)$ 方向，让模型更不倾向于生成被拒绝的回答。

关键的是，梯度的权重由 $\sigma(\hat{r}_\phi(x, y_l) - \hat{r}_\phi(x, y_w))$（注意方向反了）决定——当模型犯错越严重（对 rejected 的隐式奖励高于 chosen），梯度越大，更新越激进。当模型已经分对了（chosen 的隐式奖励远高于 rejected），梯度接近 0，几乎不更新。这是一种自适应的学习机制。

### 7.4 DPO 的实际计算

DPO 的计算只需要：

1. **前向传播策略模型**：计算 $\pi_\phi(y_w|x)$ 和 $\pi_\phi(y_l|x)$（对数概率）
2. **前向传播参考模型**：计算 $\pi_{ref}(y_w|x)$ 和 $\pi_{ref}(y_l|x)$（对数概率，可预计算并缓存）
3. **计算损失**：简单的算术运算 + sigmoid + log

不需要 RM，不需要 RL 的 rollout 和 GAE 计算，不需要价值模型。整个训练像标准的 SFT 一样简单——只是损失函数不同。

### 7.5 DPO 的超参数

DPO 的核心超参数是 $\beta$：

- $\beta$ 越大：越保守，策略更接近参考模型，不容易过拟合但改进可能不足
- $\beta$ 越小：越激进，策略偏离参考模型更多，改进更大但容易过拟合
- 典型范围：$\beta \in [0.1, 0.5]$，常见默认值为 0.1

其他超参数基本与标准微调一致：学习率（通常 1e-6 ~ 5e-7）、batch size、训练轮数等。

### 7.6 DPO 的理论局限

**分布偏移（Distribution Shift）**：DPO 使用的偏好数据中 $y_w$ 和 $y_l$ 是由 SFT 模型（或其他模型）生成的，不是由当前策略 $\pi_\phi$ 生成的。随着训练进行，$\pi_\phi$ 与数据生成分布的差距越来越大，导致 off-policy 问题。PPO 通过 on-policy rollout 自然避免了这个问题。

**隐式奖励的不一致性**：DPO 假设最优策略的形式是 $\pi^* \propto \pi_{ref} \cdot \exp(r/\beta)$，但如果 $\pi_\phi$ 离最优策略还很远，这个假设就不成立，隐式奖励可能不可靠。

这些局限催生了后续的改进方法（见第 8 节）。

---

## 8. 其他对齐方法一览

### 8.1 IPO（Identity Preference Optimization）

IPO（Azar et al., 2023）认为 BT 模型的假设过强，提出了一个不依赖 BT 模型的损失函数：

$$\mathcal{L}_{IPO}(\phi) = \mathbb{E}_{(x, y_w, y_l)} \left[ \left( \log \frac{\pi_\phi(y_w|x)}{\pi_{ref}(y_w|x)} - \log \frac{\pi_\phi(y_l|x)}{\pi_{ref}(y_l|x)} - \frac{1}{2\beta} \right)^2 \right]$$

与 DPO 的区别：DPO 用 sigmoid + log（交叉熵），IPO 用平方损失。IPO 不会像 DPO 那样在 chosen 和 rejected 的隐式奖励差很大时梯度趋近于 0（因为平方损失始终有梯度），因此在某些情况下训练更稳定。

### 8.2 KTO（Kahneman-Tversky Optimization）

KTO（Ethayarajh et al., 2024）的核心创新是：**不需要偏好对，只需要独立的"好"和"坏"标注**。这大大降低了数据收集成本——不用让标注者比较两个回答，只需对单个回答标记"好"或"坏"。

KTO 的灵感来自 Kahneman 和 Tversky 的前景理论（Prospect Theory）——人类对损失比对收益更敏感。其损失函数对 rejected 样本施加更大的惩罚：

$$\mathcal{L}_{KTO}(\phi) = \mathbb{E}_{(x,y) \sim D} \left[ w(y) \cdot \left( 1 - v_\phi(x, y) \right) \right]$$

其中权重函数 $w(y)$ 对 rejected 样本更大，$v_\phi$ 是基于隐式奖励的价值估计。

### 8.3 ORPO（Odds Ratio Preference Optimization）

ORPO（Hong et al., 2024）将 SFT 和偏好优化**合并为一步**——同时学习指令跟随和偏好对齐，不需要单独的 SFT 阶段和参考模型。

ORPO 的损失由标准的 NLL 损失和一个 odds ratio 对比项组成：

$$\mathcal{L}_{ORPO} = \mathcal{L}_{NLL}(y_w) + \lambda \cdot \log \sigma \left( \log \frac{odds_\phi(y_w|x)}{odds_\phi(y_l|x)} \right)$$

其中 $odds_\phi(y|x) = \frac{P_\phi(y|x)}{1 - P_\phi(y|x)}$。

优势：减少训练阶段和模型数量，降低计算成本。

### 8.4 SimPO（Simple Preference Optimization）

SimPO（Meng et al., 2024）对 DPO 做了两个简化：

**去掉参考模型**：不再计算 $\log \pi_{ref}$，直接用 $\log \pi_\phi$ 作为隐式奖励，进一步减少显存和计算。

**长度归一化**：将对数概率除以序列长度，消除长度偏差。

$$\mathcal{L}_{SimPO} = -\log \sigma \left( \frac{\beta}{|y_w|} \log \pi_\phi(y_w|x) - \frac{\beta}{|y_l|} \log \pi_\phi(y_l|x) - \gamma \right)$$

其中 $\gamma$ 是 target reward margin。

### 8.5 GRPO（Group Relative Policy Optimization）

GRPO（DeepSeek, 2024）是 DeepSeek-Math 和 DeepSeek-R1 使用的对齐方法。核心创新是**去掉了 Critic 模型**——不再需要单独的价值函数来估计优势。

具体做法：对每个 prompt，采样一组回答 $\{y_1, ..., y_G\}$，用 RM 对每个回答打分，然后用组内分数的相对排名作为优势估计：

$$\hat{A}_i = \frac{r_\theta(x, y_i) - \text{mean}(\{r_j\})}{\text{std}(\{r_j\})}$$

优势：去掉 Critic 减少了一个模型的显存占用和超参数调节，特别适合大规模训练。

### 8.6 RLAIF（RL from AI Feedback）

RLAIF（Bai et al., 2022; Lee et al., 2023）用 AI 模型替代人类标注者来生成偏好数据。核心思路是用一个强大的 LLM（如 GPT-4、Claude）作为"裁判"来评估回答质量，然后用这些 AI 标注的偏好数据训练 RM 或直接做 DPO。

优势是大幅降低成本和提高标注速度；缺点是可能继承 AI 裁判模型的偏见和盲点。Google 的 Constitutional AI 也属于这一范畴。

### 8.7 方法对比表

```
┌────────────┬─────────┬─────────┬──────────┬────────────┬───────────┐
│   方法     │ 需要 RM │ 需要 RL │ 需要参考 │  数据要求  │   复杂度   │
│            │         │         │   模型   │            │           │
├────────────┼─────────┼─────────┼──────────┼────────────┼───────────┤
│ RLHF-PPO   │   ✅    │   ✅    │   ✅     │  偏好排序  │  最高     │
│ DPO        │   ❌    │   ❌    │   ✅     │  偏好对    │  中等     │
│ IPO        │   ❌    │   ❌    │   ✅     │  偏好对    │  中等     │
│ KTO        │   ❌    │   ❌    │   ✅     │  好/坏标注  │  中低     │
│ ORPO       │   ❌    │   ❌    │   ❌     │  偏好对    │  低       │
│ SimPO      │   ❌    │   ❌    │   ❌     │  偏好对    │  低       │
│ GRPO       │   ✅    │   ✅    │   ✅     │  RM 打分   │  中高     │
│ RLAIF      │   ✅    │   可选  │   ✅     │  AI 标注   │  中等     │
└────────────┴─────────┴─────────┴──────────┴────────────┴───────────┘
```

---

## 9. 代码实战：从零手写 RLHF-PPO

以下实现一个简化但完整的 RLHF-PPO 训练循环。为了清晰展示核心逻辑，使用 GPT-2 作为基座模型，但所有核心组件与工业级实现一致。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical
from transformers import AutoModelForCausalLM, AutoTokenizer
from typing import Tuple, List, Dict
import numpy as np
from dataclasses import dataclass


@dataclass
class PPOConfig:
    """PPO 超参数配置"""
    # 模型
    model_name: str = "gpt2"
    max_new_tokens: int = 128        # 生成的最大新 token 数
    # PPO
    ppo_epochs: int = 4              # 每次 rollout 后的 PPO 更新轮数
    clip_epsilon: float = 0.2        # PPO 裁剪参数
    gamma: float = 1.0               # 折扣因子（文本生成通常用 1.0）
    gae_lambda: float = 0.95         # GAE 参数
    # KL 惩罚
    kl_coeff: float = 0.1            # KL 惩罚系数 β
    target_kl: float = 6.0           # 自适应 KL 的目标值
    # 训练
    learning_rate: float = 1.5e-5
    batch_size: int = 4
    mini_batch_size: int = 2
    vf_coeff: float = 0.5            # 价值损失系数
    entropy_coeff: float = 0.01      # 熵奖励系数
    max_grad_norm: float = 1.0       # 梯度裁剪
    # 奖励
    reward_baseline: bool = True     # 是否做奖励标准化


class ValueHead(nn.Module):
    """价值函数头：将 hidden state 映射到标量价值。"""

    def __init__(self, hidden_size: int):
        super().__init__()
        self.dense = nn.Linear(hidden_size, hidden_size)
        self.activation = nn.Tanh()
        self.value_out = nn.Linear(hidden_size, 1)

    def forward(self, hidden_states: torch.Tensor) -> torch.Tensor:
        x = self.dense(hidden_states)
        x = self.activation(x)
        return self.value_out(x).squeeze(-1)  # [batch, seq_len]


class PolicyModelWithValueHead(nn.Module):
    """
    策略模型 + 价值头。
    共享 Transformer backbone，策略头和价值头分别输出。
    """

    def __init__(self, model_name: str):
        super().__init__()
        self.model = AutoModelForCausalLM.from_pretrained(
            model_name, torch_dtype=torch.float32
        )
        self.value_head = ValueHead(self.model.config.hidden_size)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor = None
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Returns:
            logits: [batch, seq_len, vocab_size] 策略 logits
            values: [batch, seq_len] 价值估计
        """
        outputs = self.model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            output_hidden_states=True
        )
        logits = outputs.logits  # [batch, seq_len, vocab]
        hidden = outputs.hidden_states[-1]  # [batch, seq_len, hidden]
        values = self.value_head(hidden)  # [batch, seq_len]
        return logits, values

    def generate_with_logprobs(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        max_new_tokens: int = 128,
        temperature: float = 1.0,
        top_k: int = 50
    ) -> Dict[str, torch.Tensor]:
        """
        自回归生成 + 收集 log probabilities 和 values。

        Returns:
            dict with keys:
              - sequences: [batch, prompt_len + gen_len]
              - log_probs: [batch, gen_len]
              - values: [batch, gen_len]
              - attention_mask: [batch, prompt_len + gen_len]
        """
        device = input_ids.device
        batch_size = input_ids.size(0)
        prompt_len = input_ids.size(1)

        # 收集生成过程中的数据
        generated_ids = []
        log_probs_list = []
        values_list = []

        current_ids = input_ids
        current_mask = attention_mask

        with torch.no_grad():
            for step in range(max_new_tokens):
                logits, values = self.forward(current_ids, current_mask)

                # 取最后一个位置的 logits 和 values
                next_logits = logits[:, -1, :] / temperature  # [batch, vocab]
                next_values = values[:, -1]  # [batch]

                # Top-k 过滤
                if top_k > 0:
                    topk_vals, _ = torch.topk(next_logits, top_k, dim=-1)
                    mask = next_logits < topk_vals[:, -1:]
                    next_logits[mask] = float('-inf')

                # 采样
                probs = F.softmax(next_logits, dim=-1)
                dist = Categorical(probs)
                next_token = dist.sample()  # [batch]
                log_prob = dist.log_prob(next_token)  # [batch]

                generated_ids.append(next_token)
                log_probs_list.append(log_prob)
                values_list.append(next_values)

                # 更新序列
                current_ids = torch.cat(
                    [current_ids, next_token.unsqueeze(1)], dim=1
                )
                current_mask = torch.cat(
                    [current_mask, torch.ones(batch_size, 1, device=device)],
                    dim=1
                )

                # 检查是否所有样本都生成了 EOS
                # 简化处理：这里不做 EOS 检测，生成固定长度

        sequences = current_ids  # [batch, prompt_len + gen_len]
        gen_log_probs = torch.stack(log_probs_list, dim=1)  # [batch, gen_len]
        gen_values = torch.stack(values_list, dim=1)  # [batch, gen_len]

        return {
            "sequences": sequences,
            "log_probs": gen_log_probs,
            "values": gen_values,
            "attention_mask": current_mask,
            "prompt_length": prompt_len
        }


def compute_gae(
    rewards: torch.Tensor,
    values: torch.Tensor,
    gamma: float = 1.0,
    lam: float = 0.95
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    计算 GAE (Generalized Advantage Estimation)。

    Args:
        rewards: [batch, gen_len] 逐 token 奖励
        values: [batch, gen_len] 价值估计
        gamma: 折扣因子
        lam: GAE lambda 参数

    Returns:
        advantages: [batch, gen_len] 优势估计
        returns: [batch, gen_len] 回报值（用于价值损失）
    """
    batch_size, gen_len = rewards.shape
    advantages = torch.zeros_like(rewards)
    last_gae = torch.zeros(batch_size, device=rewards.device)

    # 从后往前计算 GAE
    for t in reversed(range(gen_len)):
        if t == gen_len - 1:
            next_value = 0.0  # 终止状态的价值为 0
        else:
            next_value = values[:, t + 1]

        # TD 残差: δ_t = r_t + γ·V(s_{t+1}) - V(s_t)
        delta = rewards[:, t] + gamma * next_value - values[:, t]

        # GAE: A_t = δ_t + γλ·A_{t+1}
        last_gae = delta + gamma * lam * last_gae
        advantages[:, t] = last_gae

    # 回报值 = 优势 + 价值
    returns = advantages + values

    return advantages, returns


def compute_kl_rewards(
    log_probs: torch.Tensor,
    ref_log_probs: torch.Tensor,
    rm_rewards: torch.Tensor,
    kl_coeff: float
) -> torch.Tensor:
    """
    计算包含 KL 惩罚的逐 token 奖励。

    Args:
        log_probs: [batch, gen_len] 策略模型的 log prob
        ref_log_probs: [batch, gen_len] 参考模型的 log prob
        rm_rewards: [batch] RM 给出的标量奖励（只在末尾）
        kl_coeff: KL 惩罚系数 β

    Returns:
        rewards: [batch, gen_len] 逐 token 奖励
    """
    # 逐 token 的 KL 惩罚
    kl_penalty = log_probs - ref_log_probs  # [batch, gen_len]
    rewards = -kl_coeff * kl_penalty  # [batch, gen_len]

    # 在最后一个 token 加上 RM 奖励
    rewards[:, -1] += rm_rewards

    return rewards


def ppo_step(
    policy_model: PolicyModelWithValueHead,
    sequences: torch.Tensor,
    attention_mask: torch.Tensor,
    old_log_probs: torch.Tensor,
    advantages: torch.Tensor,
    returns: torch.Tensor,
    prompt_length: int,
    config: PPOConfig
) -> Dict[str, float]:
    """
    执行一步 PPO 更新。

    Args:
        policy_model: 策略 + 价值模型
        sequences: [batch, total_len] 完整序列
        attention_mask: [batch, total_len]
        old_log_probs: [batch, gen_len] 旧策略的 log prob
        advantages: [batch, gen_len] 优势估计
        returns: [batch, gen_len] 回报值
        prompt_length: prompt 的长度
        config: PPO 配置

    Returns:
        dict with metrics: policy_loss, value_loss, entropy, approx_kl
    """
    # 前向传播获取新的 logits 和 values
    logits, values = policy_model(sequences, attention_mask)

    # 只取生成部分的 logits (从 prompt_length 开始)
    gen_logits = logits[:, prompt_length - 1:-1, :]  # [batch, gen_len, vocab]
    gen_values = values[:, prompt_length - 1:-1]  # 对齐

    # 取出实际生成的 token ids
    gen_token_ids = sequences[:, prompt_length:]  # [batch, gen_len]

    # 计算新的 log probs
    gen_log_probs = F.log_softmax(gen_logits, dim=-1)
    new_log_probs = gen_log_probs.gather(
        2, gen_token_ids.unsqueeze(-1)
    ).squeeze(-1)  # [batch, gen_len]

    # ==================== 策略损失 (PPO-Clip) ====================
    # 概率比
    ratio = torch.exp(new_log_probs - old_log_probs)  # ρ_t

    # 标准化优势
    adv_normalized = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

    # 裁剪
    surr1 = ratio * adv_normalized
    surr2 = torch.clamp(
        ratio, 1 - config.clip_epsilon, 1 + config.clip_epsilon
    ) * adv_normalized
    policy_loss = -torch.min(surr1, surr2).mean()

    # ==================== 价值损失 ====================
    value_loss = F.mse_loss(gen_values, returns)

    # ==================== 熵奖励 ====================
    entropy = Categorical(logits=gen_logits).entropy().mean()

    # ==================== 近似 KL ====================
    approx_kl = (old_log_probs - new_log_probs).mean().item()

    # ==================== 总损失 ====================
    total_loss = (
        policy_loss
        + config.vf_coeff * value_loss
        - config.entropy_coeff * entropy
    )

    return {
        "total_loss": total_loss,
        "policy_loss": policy_loss.item(),
        "value_loss": value_loss.item(),
        "entropy": entropy.item(),
        "approx_kl": approx_kl,
    }


def rlhf_ppo_training_loop(
    config: PPOConfig = None,
    prompts: List[str] = None,
    num_iterations: int = 100,
    device: str = "cuda"
):
    """
    完整的 RLHF-PPO 训练循环。

    这是整个 RLHF 流程的核心——每轮迭代：
    1. 采样 prompt → 用策略模型生成回答
    2. 用 RM 打分 → 计算 KL 修正奖励 → GAE 优势估计
    3. 多轮 PPO 更新
    """
    if config is None:
        config = PPOConfig()

    if prompts is None:
        prompts = [
            "解释一下什么是人工智能。",
            "请写一首关于春天的诗。",
            "如何学习编程？",
            "什么是量子计算？",
        ]

    # ============ 初始化模型 ============
    tokenizer = AutoTokenizer.from_pretrained(config.model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"  # 生成时左填充

    # 策略模型 (带价值头)
    policy_model = PolicyModelWithValueHead(config.model_name).to(device)
    optimizer = torch.optim.AdamW(
        policy_model.parameters(), lr=config.learning_rate
    )

    # 参考模型 (冻结)
    ref_model = AutoModelForCausalLM.from_pretrained(
        config.model_name, torch_dtype=torch.float32
    ).to(device)
    ref_model.eval()
    for param in ref_model.parameters():
        param.requires_grad = False

    # 奖励模型 (这里用简单的长度奖励模拟，实际应使用训练好的 RM)
    def dummy_reward_model(sequences, prompt_length):
        """
        模拟 RM：奖励与回答长度适中相关（太短或太长都不好）。
        实际使用时替换为真正的 RewardModel。
        """
        gen_lengths = (sequences[:, prompt_length:] != tokenizer.pad_token_id).sum(dim=1).float()
        # 钟形奖励：长度在 50 附近时奖励最高
        rewards = -((gen_lengths - 50) / 20) ** 2 + 1
        return rewards.clamp(-2, 2)

    # ============ 训练循环 ============
    kl_coeff = config.kl_coeff  # 可自适应调节

    for iteration in range(num_iterations):
        policy_model.eval()  # 生成阶段用 eval 模式

        # -------- Step 1: 采样 prompt 并生成回答 --------
        batch_prompts = np.random.choice(prompts, config.batch_size).tolist()
        encoded = tokenizer(
            batch_prompts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=256
        ).to(device)

        with torch.no_grad():
            rollout = policy_model.generate_with_logprobs(
                encoded["input_ids"],
                encoded["attention_mask"],
                max_new_tokens=config.max_new_tokens,
                temperature=1.0,
                top_k=50
            )

        sequences = rollout["sequences"]
        old_log_probs = rollout["log_probs"]
        old_values = rollout["values"]
        prompt_length = rollout["prompt_length"]

        # -------- Step 2: 计算参考模型的 log probs --------
        with torch.no_grad():
            ref_outputs = ref_model(
                sequences, attention_mask=rollout["attention_mask"]
            )
            ref_logits = ref_outputs.logits[:, prompt_length - 1:-1, :]
            ref_log_probs_all = F.log_softmax(ref_logits, dim=-1)
            gen_tokens = sequences[:, prompt_length:]
            ref_log_probs = ref_log_probs_all.gather(
                2, gen_tokens.unsqueeze(-1)
            ).squeeze(-1)

        # -------- Step 3: 计算 RM 奖励 --------
        with torch.no_grad():
            rm_rewards = dummy_reward_model(sequences, prompt_length)

        # 奖励标准化
        if config.reward_baseline:
            rm_rewards = (rm_rewards - rm_rewards.mean()) / (rm_rewards.std() + 1e-8)

        # -------- Step 4: 计算 KL 修正奖励 + GAE --------
        with torch.no_grad():
            rewards = compute_kl_rewards(
                old_log_probs, ref_log_probs, rm_rewards, kl_coeff
            )
            advantages, returns = compute_gae(
                rewards, old_values,
                gamma=config.gamma, lam=config.gae_lambda
            )

        # -------- Step 5: PPO 更新 --------
        policy_model.train()

        for ppo_epoch in range(config.ppo_epochs):
            # Mini-batch 训练
            batch_size = sequences.size(0)
            indices = torch.randperm(batch_size)

            for start in range(0, batch_size, config.mini_batch_size):
                end = start + config.mini_batch_size
                mb_idx = indices[start:end]

                metrics = ppo_step(
                    policy_model,
                    sequences[mb_idx],
                    rollout["attention_mask"][mb_idx],
                    old_log_probs[mb_idx],
                    advantages[mb_idx],
                    returns[mb_idx],
                    prompt_length,
                    config
                )

                optimizer.zero_grad()
                metrics["total_loss"].backward()
                torch.nn.utils.clip_grad_norm_(
                    policy_model.parameters(), config.max_grad_norm
                )
                optimizer.step()

            # 早停检查：KL 散度过大则停止当前 rollout 的更新
            if abs(metrics["approx_kl"]) > config.target_kl:
                break

        # -------- Step 6: 自适应 KL 系数 --------
        kl_value = abs(metrics["approx_kl"])
        if kl_value > config.target_kl * 1.5:
            kl_coeff *= 1.5  # KL 太大，增强惩罚
        elif kl_value < config.target_kl * 0.5:
            kl_coeff *= 0.5  # KL 太小，减弱惩罚
        kl_coeff = max(0.01, min(kl_coeff, 10.0))  # 限制范围

        # -------- 日志 --------
        if (iteration + 1) % 10 == 0:
            avg_reward = rm_rewards.mean().item()
            avg_kl = (old_log_probs - ref_log_probs).sum(dim=1).mean().item()
            print(
                f"Iter {iteration+1}/{num_iterations} | "
                f"Reward: {avg_reward:.3f} | "
                f"KL: {avg_kl:.3f} | "
                f"KL_coeff: {kl_coeff:.4f} | "
                f"Policy Loss: {metrics['policy_loss']:.4f} | "
                f"Value Loss: {metrics['value_loss']:.4f}"
            )

    return policy_model


# 使用示例
if __name__ == "__main__":
    config = PPOConfig(
        model_name="gpt2",
        batch_size=2,
        mini_batch_size=1,
        max_new_tokens=64,
        ppo_epochs=2,
        learning_rate=1e-5
    )
    model = rlhf_ppo_training_loop(
        config=config,
        num_iterations=50,
        device="cuda" if torch.cuda.is_available() else "cpu"
    )
```

---

## 10. 代码实战：使用 TRL 库训练 RLHF

HuggingFace 的 **TRL（Transformer Reinforcement Learning）** 库是目前最主流的 RLHF 训练框架。它封装了 PPO、DPO、KTO 等算法，提供了生产级的实现。

### 10.1 安装依赖

```bash
pip install trl transformers datasets accelerate peft bitsandbytes
```

### 10.2 使用 TRL 的 PPOTrainer

```python
"""
使用 TRL 库进行 RLHF-PPO 训练的完整示例。
TRL 封装了 PPO 的核心逻辑，极大简化了训练代码。
"""
from trl import PPOConfig, PPOTrainer, AutoModelForCausalLMWithValueHead
from transformers import AutoTokenizer
import torch


def train_with_trl_ppo():
    """使用 TRL PPOTrainer 的完整训练流程。"""

    # ============ 1. 配置 ============
    ppo_config = PPOConfig(
        model_name="gpt2",               # 基座模型
        learning_rate=1.41e-5,            # 学习率
        batch_size=4,                     # 每次 rollout 的 batch
        mini_batch_size=2,                # PPO 更新的 mini-batch
        ppo_epochs=4,                     # 每次 rollout 后的 PPO 轮数
        gradient_accumulation_steps=1,
        optimize_cuda_cache=True,
        log_with=None,                    # 可选: "wandb", "tensorboard"
        kl_penalty="kl",                  # KL 惩罚类型
        init_kl_coeff=0.2,               # 初始 KL 系数
        target_kl=6.0,                   # 目标 KL（自适应）
        seed=42,
    )

    # ============ 2. 加载模型和 tokenizer ============
    # AutoModelForCausalLMWithValueHead 自动添加价值头
    model = AutoModelForCausalLMWithValueHead.from_pretrained(
        ppo_config.model_name
    )
    ref_model = AutoModelForCausalLMWithValueHead.from_pretrained(
        ppo_config.model_name
    )

    tokenizer = AutoTokenizer.from_pretrained(ppo_config.model_name)
    tokenizer.pad_token = tokenizer.eos_token

    # ============ 3. 准备数据 ============
    prompts = [
        "请解释什么是深度学习。",
        "如何有效地管理时间？",
        "描述一下太阳系的构成。",
        "什么是区块链技术？",
        "如何学习一门新的编程语言？",
        "解释一下什么是量子纠缠。",
        "如何提高写作能力？",
        "什么是可持续发展？",
    ]

    # ============ 4. 定义奖励模型 ============
    # 实际应用中，这里使用训练好的 RewardModel
    def compute_rewards(responses: list, prompts: list) -> list:
        """
        模拟奖励函数。实际中替换为真正的 RM。
        这里简单地根据回答长度和多样性给出奖励。
        """
        rewards = []
        for resp in responses:
            # 奖励适中长度的回答
            length_score = min(len(resp) / 100, 1.0) * 2 - 1
            # 惩罚重复
            unique_chars = len(set(resp))
            diversity_score = min(unique_chars / max(len(resp), 1), 1.0)
            reward = length_score * 0.5 + diversity_score * 0.5
            rewards.append(torch.tensor(reward))
        return rewards

    # ============ 5. 初始化 PPOTrainer ============
    ppo_trainer = PPOTrainer(
        config=ppo_config,
        model=model,
        ref_model=ref_model,
        tokenizer=tokenizer,
    )

    # ============ 6. 训练循环 ============
    num_iterations = 50

    for iteration in range(num_iterations):
        # 采样 prompt
        batch_size = ppo_config.batch_size
        import random
        batch_prompts = random.choices(prompts, k=batch_size)

        # Tokenize prompts
        query_tensors = [
            tokenizer.encode(p, return_tensors="pt").squeeze(0)
            for p in batch_prompts
        ]

        # 生成回答
        response_tensors = ppo_trainer.generate(
            query_tensors,
            max_new_tokens=128,
            do_sample=True,
            temperature=1.0,
            top_k=50,
        )

        # 解码回答
        responses = [
            tokenizer.decode(r, skip_special_tokens=True)
            for r in response_tensors
        ]

        # 计算奖励
        rewards = compute_rewards(responses, batch_prompts)

        # PPO 更新
        stats = ppo_trainer.step(query_tensors, response_tensors, rewards)

        # 日志
        if (iteration + 1) % 10 == 0:
            mean_reward = sum(r.item() for r in rewards) / len(rewards)
            print(
                f"Iter {iteration+1}/{num_iterations} | "
                f"Mean Reward: {mean_reward:.3f} | "
                f"KL: {stats.get('objective/kl', 0):.3f}"
            )

    # 保存模型
    model.save_pretrained("./rlhf-ppo-model")
    tokenizer.save_pretrained("./rlhf-ppo-model")
    print("训练完成，模型已保存。")


if __name__ == "__main__":
    train_with_trl_ppo()
```

### 10.3 使用 LoRA 降低显存

在实际的大模型 RLHF 训练中，通常结合 LoRA（详见上一篇）来减少显存占用：

```python
"""
TRL + LoRA 的 RLHF-PPO 训练。
使用 PEFT 的 LoRA 大幅减少可训练参数和显存。
"""
from peft import LoraConfig, get_peft_model, TaskType
from trl import PPOConfig, PPOTrainer, AutoModelForCausalLMWithValueHead


def train_ppo_with_lora():
    """使用 LoRA 的 PPO 训练——适合在单卡 GPU 上训练大模型。"""

    model_name = "meta-llama/Llama-2-7b-hf"  # 示例

    # LoRA 配置
    lora_config = LoraConfig(
        r=16,                              # LoRA 秩
        lora_alpha=32,                     # 缩放因子
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
    )

    # 加载模型（4-bit 量化 + LoRA）
    model = AutoModelForCausalLMWithValueHead.from_pretrained(
        model_name,
        peft_config=lora_config,
        load_in_4bit=True,                 # QLoRA
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )

    # PPO 配置
    ppo_config = PPOConfig(
        model_name=model_name,
        learning_rate=1e-5,
        batch_size=2,
        mini_batch_size=1,
        ppo_epochs=4,
        init_kl_coeff=0.2,
    )

    # ... 其余训练代码与上面类似 ...
    print("LoRA PPO 配置完成。")
    print(f"可训练参数: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")
    print(f"总参数: {sum(p.numel() for p in model.parameters()):,}")
```

---

## 11. 代码实战：DPO 训练

### 11.1 从零手写 DPO

```python
"""
从零实现 DPO (Direct Preference Optimization)。
DPO 将 RLHF 简化为一个简单的分类问题，无需 RM 和 RL。
"""
import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer
from torch.utils.data import Dataset, DataLoader
from typing import Dict, Tuple


class DPODataset(Dataset):
    """DPO 偏好数据集。"""

    def __init__(self, data: list, tokenizer, max_length: int = 512):
        """
        Args:
            data: list of dicts with keys: prompt, chosen, rejected
        """
        self.data = data
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        prompt = item["prompt"]

        # 构造完整文本
        chosen_text = prompt + item["chosen"] + self.tokenizer.eos_token
        rejected_text = prompt + item["rejected"] + self.tokenizer.eos_token

        # Tokenize（记录 prompt 长度，用于只在 response 部分计算损失）
        prompt_enc = self.tokenizer(
            prompt, add_special_tokens=False
        )
        prompt_len = len(prompt_enc["input_ids"])

        chosen_enc = self.tokenizer(
            chosen_text,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )
        rejected_enc = self.tokenizer(
            rejected_text,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )

        return {
            "chosen_input_ids": chosen_enc["input_ids"].squeeze(0),
            "chosen_attention_mask": chosen_enc["attention_mask"].squeeze(0),
            "rejected_input_ids": rejected_enc["input_ids"].squeeze(0),
            "rejected_attention_mask": rejected_enc["attention_mask"].squeeze(0),
            "prompt_length": prompt_len,
        }


def compute_log_probs(
    model: AutoModelForCausalLM,
    input_ids: torch.Tensor,
    attention_mask: torch.Tensor,
    prompt_length: int
) -> torch.Tensor:
    """
    计算 response 部分每个 token 的 log probability 之和。

    这是 DPO 中最核心的计算：
    log π(y|x) = Σ_{t=prompt_len}^{T} log π(y_t | x, y_{<t})

    Args:
        model: 语言模型
        input_ids: [batch, seq_len]
        attention_mask: [batch, seq_len]
        prompt_length: prompt 的 token 数

    Returns:
        log_probs: [batch] response 的总 log probability
    """
    with torch.set_grad_enabled(model.training):
        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask
        )
        logits = outputs.logits  # [batch, seq_len, vocab]

    # 计算每个位置的 log prob
    # logits[:, t, :] 预测的是位置 t+1 的 token
    # 因此用 logits[:, t-1, :] 对 input_ids[:, t] 计算 log prob
    log_probs = F.log_softmax(logits[:, :-1, :], dim=-1)  # [batch, seq_len-1, vocab]
    target_ids = input_ids[:, 1:]  # [batch, seq_len-1]

    # Gather: 取出每个位置上实际 token 的 log prob
    per_token_log_probs = log_probs.gather(
        2, target_ids.unsqueeze(-1)
    ).squeeze(-1)  # [batch, seq_len-1]

    # 只在 response 部分计算（从 prompt_length 开始）
    # 注意索引偏移：因为上面做了 :-1 和 1: 的 shift
    response_mask = attention_mask[:, 1:].clone()  # [batch, seq_len-1]
    response_mask[:, :prompt_length - 1] = 0  # 屏蔽 prompt 部分

    # 对 response 部分的 log prob 求和
    total_log_probs = (per_token_log_probs * response_mask).sum(dim=1)  # [batch]

    return total_log_probs


def dpo_loss(
    policy_chosen_logps: torch.Tensor,
    policy_rejected_logps: torch.Tensor,
    ref_chosen_logps: torch.Tensor,
    ref_rejected_logps: torch.Tensor,
    beta: float = 0.1,
    label_smoothing: float = 0.0
) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    计算 DPO 损失。

    L_DPO = -log σ(β · (log π(y_w|x)/π_ref(y_w|x) - log π(y_l|x)/π_ref(y_l|x)))

    Args:
        policy_chosen_logps: [batch] 策略模型对 chosen 的 log prob
        policy_rejected_logps: [batch] 策略模型对 rejected 的 log prob
        ref_chosen_logps: [batch] 参考模型对 chosen 的 log prob
        ref_rejected_logps: [batch] 参考模型对 rejected 的 log prob
        beta: 温度参数
        label_smoothing: 标签平滑（0 = 无平滑）

    Returns:
        (loss, chosen_rewards, rejected_rewards) 元组
    """
    # 隐式奖励
    chosen_rewards = beta * (policy_chosen_logps - ref_chosen_logps)
    rejected_rewards = beta * (policy_rejected_logps - ref_rejected_logps)

    # DPO 损失
    logits = chosen_rewards - rejected_rewards  # [batch]

    if label_smoothing > 0:
        # 标签平滑版本
        losses = (
            -F.logsigmoid(logits) * (1 - label_smoothing)
            - F.logsigmoid(-logits) * label_smoothing
        )
    else:
        losses = -F.logsigmoid(logits)

    loss = losses.mean()

    return loss, chosen_rewards.detach(), rejected_rewards.detach()


def train_dpo(
    model_name: str = "gpt2",
    train_data: list = None,
    beta: float = 0.1,
    num_epochs: int = 3,
    batch_size: int = 2,
    lr: float = 5e-7,
    device: str = "cuda",
    label_smoothing: float = 0.0
):
    """
    完整的 DPO 训练流程。

    DPO 的训练极其简洁：
    1. 加载策略模型和参考模型
    2. 对每个 batch 的偏好数据，分别用两个模型计算 log probs
    3. 计算 DPO 损失并反向传播
    4. 只更新策略模型的参数
    """
    # 示例数据
    if train_data is None:
        train_data = [
            {
                "prompt": "什么是强化学习？\n",
                "chosen": "强化学习（Reinforcement Learning, RL）是机器学习的"
                          "一个重要分支，其核心思想是智能体（agent）通过与环境"
                          "的交互来学习最优策略。智能体在每个时间步采取动作，"
                          "环境反馈奖励信号，智能体的目标是最大化累积奖励。"
                          "RL 的关键要素包括：状态空间、动作空间、奖励函数、"
                          "策略和价值函数。",
                "rejected": "强化学习就是 RL，很重要。"
            },
            {
                "prompt": "请介绍 Python 的装饰器。\n",
                "chosen": "Python 装饰器（Decorator）是一种设计模式，它允许"
                          "在不修改原函数代码的情况下，动态地增加函数的功能。"
                          "装饰器本质上是一个接受函数作为参数并返回新函数的"
                          "高阶函数。使用 @decorator 语法糖可以简洁地应用"
                          "装饰器。常见用途包括日志记录、权限检查、缓存等。",
                "rejected": "装饰器用 @ 符号。"
            },
        ]

    # 加载 tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 策略模型（可训练）
    policy_model = AutoModelForCausalLM.from_pretrained(model_name).to(device)

    # 参考模型（冻结）
    ref_model = AutoModelForCausalLM.from_pretrained(model_name).to(device)
    ref_model.eval()
    for param in ref_model.parameters():
        param.requires_grad = False

    # 数据和优化器
    dataset = DPODataset(train_data, tokenizer)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    optimizer = torch.optim.AdamW(policy_model.parameters(), lr=lr)

    # 训练
    policy_model.train()
    for epoch in range(num_epochs):
        total_loss = 0
        total_chosen_reward = 0
        total_rejected_reward = 0
        total_acc = 0
        steps = 0

        for batch in dataloader:
            batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v
                     for k, v in batch.items()}
            prompt_len = batch["prompt_length"][0].item()

            # 计算策略模型的 log probs
            policy_chosen_logps = compute_log_probs(
                policy_model,
                batch["chosen_input_ids"],
                batch["chosen_attention_mask"],
                prompt_len
            )
            policy_rejected_logps = compute_log_probs(
                policy_model,
                batch["rejected_input_ids"],
                batch["rejected_attention_mask"],
                prompt_len
            )

            # 计算参考模型的 log probs（无需梯度）
            with torch.no_grad():
                ref_chosen_logps = compute_log_probs(
                    ref_model,
                    batch["chosen_input_ids"],
                    batch["chosen_attention_mask"],
                    prompt_len
                )
                ref_rejected_logps = compute_log_probs(
                    ref_model,
                    batch["rejected_input_ids"],
                    batch["rejected_attention_mask"],
                    prompt_len
                )

            # DPO 损失
            loss, chosen_rewards, rejected_rewards = dpo_loss(
                policy_chosen_logps,
                policy_rejected_logps,
                ref_chosen_logps,
                ref_rejected_logps,
                beta=beta,
                label_smoothing=label_smoothing
            )

            # 反向传播
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(policy_model.parameters(), 1.0)
            optimizer.step()

            # 统计
            total_loss += loss.item()
            total_chosen_reward += chosen_rewards.mean().item()
            total_rejected_reward += rejected_rewards.mean().item()
            accuracy = (chosen_rewards > rejected_rewards).float().mean().item()
            total_acc += accuracy
            steps += 1

        # Epoch 日志
        print(
            f"Epoch {epoch+1}/{num_epochs} | "
            f"Loss: {total_loss/max(steps,1):.4f} | "
            f"Chosen R: {total_chosen_reward/max(steps,1):.4f} | "
            f"Rejected R: {total_rejected_reward/max(steps,1):.4f} | "
            f"Accuracy: {total_acc/max(steps,1):.4f} | "
            f"Margin: {(total_chosen_reward-total_rejected_reward)/max(steps,1):.4f}"
        )

    return policy_model


if __name__ == "__main__":
    model = train_dpo(
        model_name="gpt2",
        beta=0.1,
        num_epochs=5,
        lr=5e-7,
        device="cuda" if torch.cuda.is_available() else "cpu"
    )
    print("DPO 训练完成！")
```

### 11.2 使用 TRL 的 DPOTrainer

```python
"""
使用 TRL 库的 DPOTrainer 进行 DPO 训练。
这是工业级最推荐的方式——代码简洁、功能完整。
"""
from trl import DPOConfig, DPOTrainer
from transformers import AutoModelForCausalLM, AutoTokenizer
from datasets import Dataset


def train_dpo_with_trl():
    """使用 TRL DPOTrainer 的最简实现。"""

    model_name = "gpt2"

    # 加载模型
    model = AutoModelForCausalLM.from_pretrained(model_name)
    ref_model = AutoModelForCausalLM.from_pretrained(model_name)

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.pad_token = tokenizer.eos_token

    # 准备数据集（HuggingFace Dataset 格式）
    # DPOTrainer 要求数据集包含 "prompt", "chosen", "rejected" 三列
    train_data = {
        "prompt": [
            "什么是强化学习？",
            "如何学习 Python？",
            "解释一下什么是 API。",
            "什么是云计算？",
        ],
        "chosen": [
            "强化学习是机器学习的一个重要分支...(详细且准确的回答)",
            "学习 Python 建议从以下几个步骤入手...(系统性建议)",
            "API（Application Programming Interface）是...(清晰解释)",
            "云计算是通过互联网提供计算资源...(全面介绍)",
        ],
        "rejected": [
            "就是 RL。",
            "看书就行了。",
            "API 就是接口。",
            "就是在云上算东西。",
        ],
    }
    train_dataset = Dataset.from_dict(train_data)

    # DPO 配置
    dpo_config = DPOConfig(
        output_dir="./dpo-output",
        beta=0.1,                        # 温度参数
        learning_rate=5e-7,
        per_device_train_batch_size=2,
        num_train_epochs=3,
        gradient_accumulation_steps=1,
        logging_steps=10,
        warmup_ratio=0.1,
        bf16=True,                       # 使用 bfloat16
        save_strategy="epoch",
        loss_type="sigmoid",             # DPO 原始损失
        # loss_type="ipo",               # 可切换为 IPO
        # loss_type="kto_pair",          # 可切换为 KTO
        max_length=512,
        max_prompt_length=256,
    )

    # 创建 DPOTrainer
    trainer = DPOTrainer(
        model=model,
        ref_model=ref_model,
        args=dpo_config,
        train_dataset=train_dataset,
        processing_class=tokenizer,
    )

    # 训练
    trainer.train()

    # 保存
    trainer.save_model("./dpo-final-model")
    print("DPO 训练完成！")


if __name__ == "__main__":
    train_dpo_with_trl()
```

---

## 12. RLHF vs DPO 对比分析

### 12.1 工程复杂度对比

```
RLHF-PPO 需要维护的模型（同时在 GPU 中）:
┌─────────────────────────────────────────────────┐
│  1. 策略模型 π_ϕ (可训练)                        │
│  2. 参考模型 π_ref (冻结)                        │
│  3. 奖励模型 r_θ (冻结)                          │
│  4. 价值模型 V_ψ (可训练)                        │
│  → 总计 4 个模型，显存需求极高                     │
└─────────────────────────────────────────────────┘

DPO 需要维护的模型:
┌─────────────────────────────────────────────────┐
│  1. 策略模型 π_ϕ (可训练)                        │
│  2. 参考模型 π_ref (冻结，可预计算 log probs)      │
│  → 总计 2 个模型，显存需求约为 PPO 的一半           │
└─────────────────────────────────────────────────┘
```

### 12.2 训练稳定性

**RLHF-PPO**：训练不稳定因素多——RL 本身就容易发散（reward hacking、策略崩溃），PPO 的超参数（$\epsilon$, $\gamma$, $\lambda$, KL 系数等）需要精心调节，不同随机种子的结果方差大。

**DPO**：训练像 SFT 一样稳定——本质上就是一个监督学习的分类损失，梯度行为可预测，超参数少（主要就是 $\beta$ 和学习率），不同种子的结果方差小。

### 12.3 效果对比

根据多项研究和实践经验：

**DPO 优势场景**：数据质量高、偏好信号清晰、计算资源有限的情况下，DPO 通常表现出色。特别适合中小规模模型（7B~13B）和快速迭代的场景。

**PPO 优势场景**：大规模模型（70B+）、需要极致对齐效果、有充足计算资源的情况下，PPO 仍有优势。DeepSeek-R1、GPT-4 等前沿模型仍然使用 PPO 或其变体。

**核心区别**：PPO 是 on-policy 的（用当前策略生成回答，然后优化），DPO 是 off-policy 的（直接在固定的偏好数据上训练）。On-policy 训练天然避免了分布偏移问题，但计算成本更高。

### 12.4 什么时候选哪个

```
选择 DPO 的情况:
  ✓ 计算资源有限（单卡或少量卡）
  ✓ 需要快速实验和迭代
  ✓ 有高质量的偏好数据集
  ✓ 模型规模中等（≤ 13B）
  ✓ 团队缺乏 RL 工程经验

选择 RLHF-PPO 的情况:
  ✓ 追求最佳对齐效果
  ✓ 模型规模大（70B+）
  ✓ 有充足的 GPU 集群
  ✓ 团队有 RL 工程经验
  ✓ 需要在线学习/持续改进
  ✓ 偏好数据质量参差不齐（RM 可以平滑噪声）
```

---

## 13. 工程最佳实践

### 13.1 偏好数据质量

**标注一致性**：标注者间一致率（inter-annotator agreement）是 RM 质量的上限。建议多人标注取多数投票，一致率低于 60% 的数据应丢弃或重新标注。

**数据多样性**：偏好数据应覆盖各种类型的 prompt（事实性问答、创意写作、代码生成、数学推理、安全边界等），避免某一类型占比过高导致偏差。

**负样本质量**：rejected response 不应太差（如随机生成的乱码），而应是"看起来合理但有瑕疵"的回答——这样模型才能学到细粒度的偏好区分。

### 13.2 RM 训练建议

**模型规模**：RM 越大通常越好。Llama 2 的实验表明，RM 从 7B 提升到 70B，对齐效果显著提升。条件允许时，RM 应与策略模型同等规模。

**过拟合防范**：RM 训练通常只需 1~2 个 epoch。过多 epoch 会导致 RM 过拟合训练数据中的模式（如特定格式、特定长度），而非真正学习偏好。

**校准检查**：训练完成后，检查 RM 输出的分布——如果奖励值集中在很窄的范围内，说明模型可能欠拟合；如果呈现双峰分布，可能过拟合。

### 13.3 PPO 训练建议

**学习率**：PPO 的学习率通常比 SFT 低一个数量级（如 1e-5 ~ 5e-6）。学习率过高会导致策略崩溃。

**KL 系数自适应**：不要使用固定的 $\beta$，而是根据实际 KL 散度自适应调节。当 KL 超过目标值时增大 $\beta$，低于目标值时减小。

**奖励标准化**：对 RM 输出做 whitening（减均值除标准差）是标配操作，可以显著提高训练稳定性。

**梯度裁剪**：PPO 训练中梯度裁剪（max_grad_norm = 1.0）是必要的，防止梯度爆炸。

### 13.4 DPO 训练建议

**学习率极低**：DPO 的学习率通常比 SFT 低 5~10 倍（如 5e-7 ~ 1e-6）。这是因为 DPO 同时推高 chosen 和压低 rejected，学习率过高容易导致模型遗忘。

**$\beta$ 调节**：从 0.1 开始尝试。如果模型变化太小，减小 $\beta$；如果模型退化（如变得重复或呆板），增大 $\beta$。

**数据量**：DPO 对数据质量敏感，但不需要海量数据。几千到几万条高质量偏好对通常就够了。

### 13.5 评估方法

**自动评估**：

- **MT-Bench / AlpacaEval**：使用 GPT-4 作为裁判评估模型的多轮对话能力
- **TruthfulQA**：评估模型的诚实性（是否编造事实）
- **HHH Alignment**：评估模型在 helpful / honest / harmless 三个维度的表现
- **GSM8K / MATH**：评估数学推理能力是否因对齐而退化（alignment tax）

**人类评估**：最终的金标准仍然是人类评估——让标注者比较对齐前后的模型输出，统计胜率。

---

## 14. 常见面试题（附答案要点）

### 面试题 1：RLHF 为什么需要 KL 散度惩罚？去掉会怎样？

**答案要点**：

KL 惩罚的核心目的是防止 **reward hacking**。RM 是人类偏好的不完美近似，它必然存在漏洞。如果去掉 KL 约束，策略模型会"钻漏洞"——找到能欺骗 RM 给出高分但实际质量很差的输出模式。

典型的 reward hacking 表现：过度冗长、无意义重复、格式堆砌、过度谨慎（对一切都回复"我无法回答"）等。

KL 惩罚的数学效果是：让最优策略成为参考策略的 "温度缩放版本"——$\pi^* \propto \pi_{ref} \cdot \exp(r/\beta)$，确保模型不会偏离 SFT 模型太远。

去掉 KL 惩罚后，策略模型的输出质量通常在训练初期上升、然后急剧下降（过拟合 RM），最终崩溃。

### 面试题 2：DPO 是如何绕过 RM 训练的？请推导 DPO 的损失函数。

**答案要点**：

DPO 的推导核心是把 RLHF 的 KL 约束优化问题的最优解**反解**出来：

第一步：RLHF 优化目标 $\max_\pi E[r(x,y)] - \beta D_{KL}(\pi \| \pi_{ref})$ 有闭合形式最优解：$\pi^*(y|x) = \frac{1}{Z(x)} \pi_{ref}(y|x) \exp(r(x,y)/\beta)$。

第二步：反解奖励函数——对两边取对数得到 $r(x,y) = \beta \log \frac{\pi^*(y|x)}{\pi_{ref}(y|x)} + \beta \log Z(x)$。这意味着奖励可以被表示为策略与参考策略的对数比（加一个只与 x 相关的常数）。

第三步：代入 Bradley-Terry 模型 $P(y_w \succ y_l) = \sigma(r(x,y_w) - r(x,y_l))$。由于 $\beta \log Z(x)$ 在做差时相消，最终得到 DPO 损失：$\mathcal{L}_{DPO} = -E[\log \sigma(\beta \log \frac{\pi_\phi(y_w|x)}{\pi_{ref}(y_w|x)} - \beta \log \frac{\pi_\phi(y_l|x)}{\pi_{ref}(y_l|x)})]$

关键洞察：DPO 把奖励建模隐式地编码在策略模型内部——策略模型同时承担了"RM"和"策略"的双重角色。

### 面试题 3：RLHF 中的奖励模型如何训练？Bradley-Terry 模型是什么？

**答案要点**：

奖励模型的训练基于 Bradley-Terry 偏好模型。BT 模型假设两个回答 $y_1, y_2$ 的偏好概率由奖励值之差通过 sigmoid 函数决定：$P(y_1 \succ y_2 | x) = \sigma(r_\theta(x, y_1) - r_\theta(x, y_2))$。

RM 的架构是在 SFT 模型的基础上，去掉 LM head，换上一个标量输出头，输入 (prompt, response) 输出一个标量奖励值。

损失函数是 pairwise 的交叉熵：$\mathcal{L} = -E[\log \sigma(r(x, y_w) - r(x, y_l))]$，其中 $y_w$ 是 chosen，$y_l$ 是 rejected。

训练数据来自人类标注者对同一 prompt 下多个回答的排序，排序被拆解为 C(K,2) 个偏好对。

评估指标是偏好对的准确率——好的 RM 准确率在 70%~75% 左右。

### 面试题 4：PPO 中的 Clip 机制是如何工作的？为什么能防止策略崩溃？

**答案要点**：

PPO 的核心是裁剪代理目标（Clipped Surrogate Objective）：$L^{CLIP} = E[\min(\rho_t A_t, \text{clip}(\rho_t, 1-\epsilon, 1+\epsilon) A_t)]$，其中 $\rho_t = \pi_\phi(a_t|s_t) / \pi_{\phi_{old}}(a_t|s_t)$ 是新旧策略的概率比。

裁剪的作用是限制每次更新的幅度。当优势 $A_t > 0$（好动作）时，$\rho_t$ 被限制不超过 $1+\epsilon$，防止过度增加该动作概率。当优势 $A_t < 0$（差动作）时，$\rho_t$ 被限制不低于 $1-\epsilon$，防止过度降低概率。

本质上是定义了一个"信任区域"——每次更新不能偏离旧策略太远。这避免了原始策略梯度方法中因步长过大导致的性能突然崩溃。相比 TRPO（通过 KL 散度约束实现信任区域，需要二阶优化），PPO 的裁剪机制用一阶优化就能达到类似效果，实现更简单。

### 面试题 5：什么是 reward hacking？如何缓解？

**答案要点**：

Reward hacking（也称 reward overoptimization）指策略模型发现并利用了奖励模型的漏洞，获得高奖励分但实际输出质量下降的现象。这是因为 RM 是人类偏好的不完美代理（proxy），任何 proxy metric 被过度优化都会出现 Goodhart's Law 效应。

常见表现：生成过长回答（如果 RM 偏好长度）、无意义重复（某些模式恰好能触发 RM 的高分区）、过度使用格式化标记、过度拒绝回答（如果 RM 对安全性评分过高）。

缓解方法包括：KL 散度惩罚（最直接的防线）、奖励值标准化/裁剪、训练多个 RM 并取集成、对 RM 做对抗训练提高鲁棒性、使用早停策略（监控验证集上的真实人类评分）、人工定期检查策略模型的输出样本。

### 面试题 6：DPO 和 PPO 各自的优缺点是什么？何时选择哪个？

**答案要点**：

PPO 优点是 on-policy（每次用当前策略生成数据，避免分布偏移），理论上效果上限更高，适合大规模模型。缺点是工程复杂度极高（4 个模型同时加载），训练不稳定（大量超参数需要调节），显存占用大，调试困难。

DPO 优点是实现简单（本质是分类损失），训练稳定（像 SFT 一样），只需 2 个模型，超参数少。缺点是 off-policy（在固定数据上训练，存在分布偏移问题），效果上限可能不如 PPO，对数据质量要求更高。

选择建议：资源有限、快速迭代选 DPO；追求极致效果、有充足资源选 PPO。中小模型（≤13B）DPO 通常够用；大模型（70B+）PPO 可能更优。

### 面试题 7：解释 RLHF 中 GAE（Generalized Advantage Estimation）的作用。

**答案要点**：

GAE 用于在偏差（bias）和方差（variance）之间找到最佳平衡来估计优势函数 $A_t$。

优势函数衡量"在状态 $s_t$ 下执行动作 $a_t$ 比平均水平好多少"。估计优势有两种极端：1 步 TD（$\delta_t = r_t + \gamma V(s_{t+1}) - V(s_t)$）偏差高但方差低（因为依赖 V 的估计）；蒙特卡洛（$A_t = \sum r_{t+k} - V(s_t)$）偏差低但方差高（因为直接用随机回报）。

GAE 通过指数加权平均来权衡：$\hat{A}_t = \sum_{l=0}^{T-t} (\gamma\lambda)^l \delta_{t+l}$。参数 $\lambda \in [0,1]$ 控制平衡——$\lambda=0$ 是纯 TD，$\lambda=1$ 是纯蒙特卡洛。通常取 $\lambda = 0.95$。

在 RLHF 中，GAE 特别重要是因为 RM 奖励是稀疏的（只在最后一个 token 给出），需要有效的信用分配机制来判断"哪个 token 对最终奖励贡献了多少"。

### 面试题 8：对比 SFT、RLHF、DPO 三种训练方式的异同。

**答案要点**：

SFT 是纯监督学习——在 (prompt, 标准回答) 对上最大化回答的 log likelihood。优点是简单高效，缺点是只学正样本、上限受限于标注者水平、不学"什么是坏的"。

RLHF 分两步：先用偏好数据训练 RM（Bradley-Terry loss），再用 RM 作为奖励函数、PPO 作为优化算法对策略模型做强化学习。优点是能从相对比较中学习（降低标注门槛）、on-policy 更新、理论效果最好。缺点是工程复杂度高、需要 4 个模型、训练不稳定。

DPO 是将 RLHF 的 RM+PPO 合并为一步——直接在偏好数据上用特殊的损失函数训练策略模型。本质上将奖励建模隐式地编码在策略中。优点是实现简单、训练稳定、只需 2 个模型。缺点是 off-policy、分布偏移、效果上限可能不如 PPO。

三者的共同点是都需要高质量的人类数据（SFT 需要回答、RLHF 和 DPO 需要偏好判断），都旨在让模型输出更符合人类期望。

### 面试题 9：什么是 Constitutional AI？它和 RLHF 有什么关系？

**答案要点**：

Constitutional AI（CAI）是 Anthropic 提出的对齐方法，核心思想是用一组"宪法"（即人为制定的原则，如"回答应该有帮助、诚实、无害"）来指导 AI 自我改进。

CAI 分两个阶段。第一阶段（Supervised）：让模型生成回答，然后让另一个 AI（按宪法原则）批评并修改回答，用修改后的回答做 SFT。第二阶段（RL）：用 AI（而非人类）根据宪法原则标注偏好数据，训练 RM，再做 RLHF。

和标准 RLHF 的关系：CAI 本质上是 RLAIF（RL from AI Feedback）——用 AI 替代人类标注者。优势是大幅降低标注成本、可扩展性好、原则明确可审计。劣势是可能继承 AI 裁判的偏见、原则之间可能冲突。

### 面试题 10：GRPO（DeepSeek 使用的方法）和标准 PPO 有什么区别？

**答案要点**：

GRPO（Group Relative Policy Optimization）是 DeepSeek 在训练 DeepSeek-Math 和 DeepSeek-R1 时使用的对齐算法。与标准 PPO 的主要区别：

核心创新是**去掉了 Critic（价值函数）模型**。标准 PPO 需要一个价值网络 $V_\psi(s)$ 来估计状态价值、计算 GAE。GRPO 不使用价值函数，而是通过**组内相对排名**来估计优势——对每个 prompt 采样一组回答 $\{y_1, ..., y_G\}$，用 RM 打分后做组内标准化：$\hat{A}_i = (r_i - \text{mean})/\text{std}$。

优势：减少一个大模型的显存占用（对 70B+ 模型来说节省非常可观）、减少超参数（不需要调 GAE 的 $\gamma, \lambda$）、实现更简单。

潜在劣势：优势估计依赖组内比较，如果组内所有回答都很差或都很好，估计可能不准确。但实验表明在大规模训练中效果与标准 PPO 相当甚至更好。

---

## 15. 易错点与踩坑指南

### 踩坑 1：RM 训练数据泄露

**问题**：将同一 prompt 的不同偏好对分别放入训练集和验证集。这导致 RM 在验证集上的准确率虚高——它不是学会了评判偏好，而是记住了 prompt 对应的偏好模式。

**正确做法**：按 prompt 分组切分数据集。所有来自同一 prompt 的偏好对必须全部在训练集或全部在验证集中。

```python
# 错误做法 ❌
from sklearn.model_selection import train_test_split
train, val = train_test_split(all_pairs, test_size=0.1)

# 正确做法 ✅
unique_prompts = list(set(pair["prompt"] for pair in all_pairs))
train_prompts, val_prompts = train_test_split(unique_prompts, test_size=0.1)
train_data = [p for p in all_pairs if p["prompt"] in set(train_prompts)]
val_data = [p for p in all_pairs if p["prompt"] in set(val_prompts)]
```

### 踩坑 2：DPO 中的 log probability 计算错误

**问题**：计算 $\log \pi(y|x)$ 时，把 prompt 部分的 token 也算进去了。DPO 损失应该只在 response 部分计算。

**正确做法**：

```python
# 错误做法 ❌ —— 把整个序列的 log prob 都加起来了
total_logp = per_token_logp.sum(dim=1)

# 正确做法 ✅ —— 只在 response 部分求和
response_mask = torch.zeros_like(attention_mask)
response_mask[:, prompt_length:] = attention_mask[:, prompt_length:]
total_logp = (per_token_logp * response_mask[:, 1:]).sum(dim=1)
```

### 踩坑 3：参考模型没有冻结

**问题**：DPO / PPO 中的参考模型 $\pi_{ref}$ 应该完全冻结，但如果用了共享优化器或者忘记设 `requires_grad = False`，参考模型会跟着更新，KL 约束就失效了。

**正确做法**：

```python
# 加载参考模型后立即冻结
ref_model.eval()
for param in ref_model.parameters():
    param.requires_grad = False

# 或者更简单：在 forward 时始终用 torch.no_grad()
with torch.no_grad():
    ref_logps = compute_log_probs(ref_model, input_ids, mask, prompt_len)
```

### 踩坑 4：PPO 的 KL 系数 β 设置不当

**问题一：β 太小**——KL 约束太弱，策略模型很快 reward hack，输出变成无意义但高分的垃圾。

**问题二：β 太大**——KL 约束太强，策略模型几乎不变化，RL 训练等于没做。

**正确做法**：使用自适应 KL 系数。设一个 target KL 值（如 6.0），当实际 KL > target * 1.5 时增大 β，当实际 KL < target * 0.5 时减小 β。

```python
# 自适应 KL 系数
if actual_kl > target_kl * 1.5:
    kl_coeff *= 1.5
elif actual_kl < target_kl * 0.5:
    kl_coeff /= 1.5
kl_coeff = max(0.01, min(kl_coeff, 10.0))
```

### 踩坑 5：DPO 学习率过高

**问题**：DPO 用了和 SFT 相同的学习率（如 2e-5），导致模型在几步之内就开始退化——输出变得重复、呆板、或开始胡言乱语。

**原因**：DPO 的梯度同时作用于 chosen（增大概率）和 rejected（降低概率）。学习率过高时，降低 rejected 概率的副作用会"误伤"与 rejected 共享特征的正常输出。

**正确做法**：DPO 的学习率应比 SFT 低 5~10 倍，通常在 1e-7 ~ 5e-7 范围内。

### 踩坑 6：奖励模型过拟合

**问题**：RM 训练了太多 epoch（如 5~10 epoch），在训练集上准确率很高（>90%），但在新数据上泛化很差。过拟合的 RM 会给 PPO 提供"错误的信号"，导致策略模型往错误方向优化。

**正确做法**：RM 通常只需 1~2 epoch。监控验证集准确率，出现下降时立即停止。考虑使用 early stopping 和权重衰减。

### 踩坑 7：生成时的 padding 方向

**问题**：在 PPO 的 rollout 阶段，使用右填充（right padding）导致生成时 prompt 的 attention 不正确。

**正确做法**：自回归生成时应使用**左填充（left padding）**，确保 prompt 的最后一个 token 是非 padding token，生成从正确位置开始。

```python
# 正确设置 tokenizer
tokenizer.padding_side = "left"
tokenizer.pad_token = tokenizer.eos_token
```

### 踩坑 8：混淆 on-policy 和 off-policy

**问题**：有人尝试在 PPO 训练中复用旧的 rollout 数据（多次使用同一批生成的回答做 PPO 更新），不知道 PPO 本身已经通过重要性采样比率 $\rho_t$ 允许了一定程度的数据复用（ppo_epochs）。

**正确理解**：PPO 在每次 rollout 后允许做多轮（通常 4 轮）mini-batch 更新，这通过裁剪机制保证安全。但不应跨 rollout 复用数据——新的 rollout 应该用更新后的策略重新生成。DPO 则是纯 off-policy 的，始终在固定数据集上训练。

### 踩坑 9：忘记在 PPO 中做奖励标准化

**问题**：RM 输出的奖励值可能有很大的方差或偏移。直接使用未标准化的奖励会导致 GAE 的优势估计不稳定，进而导致策略更新幅度忽大忽小。

**正确做法**：

```python
# 奖励标准化（whitening）
rewards = (rewards - rewards.mean()) / (rewards.std() + 1e-8)
```

### 踩坑 10：DPO 的 chosen 和 rejected 长度差异过大

**问题**：如果偏好数据中 chosen 回答总是比 rejected 长得多（或短得多），DPO 模型可能学到一个简单的 shortcut——"长 = 好"或"短 = 好"，而不是学到真正的偏好。

**原因**：$\log \pi(y|x) = \sum_t \log \pi(y_t|...)$，序列越长，总 log prob 的绝对值越大。长度差异会在隐式奖励中引入系统性偏差。

**缓解方法**：1）数据层面：确保 chosen 和 rejected 的长度分布相近；2）算法层面：使用长度归一化（如 SimPO 的做法），即除以 token 数量。

```python
# 长度归一化的 DPO
chosen_logps = chosen_logps / chosen_length
rejected_logps = rejected_logps / rejected_length
```

---

## 总结

RLHF 与对齐是大模型从"能力"走向"可用"的关键技术。经典 RLHF-PPO 流程（SFT → RM → PPO）提供了完整的理论框架和工程范式，DPO 则以极简的方式达到了接近的效果。

对齐领域仍在快速演进。从方法论看，DPO 的变体（KTO、ORPO、SimPO）在不断简化流程和降低门槛；GRPO 等方法在优化 PPO 的工程效率；而 Constitutional AI / RLAIF 则试图用 AI 反馈取代昂贵的人类标注。

从业者需要根据具体场景（模型规模、计算资源、数据质量、迭代速度要求）选择合适的对齐方法。但无论选择哪种方法，核心原则不变：**好的偏好数据是一切的基础，KL 约束是防止退化的安全网，人类评估是最终的金标准**。