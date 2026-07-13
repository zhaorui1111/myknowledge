# 字符串匹配（KMP · Trie · Aho-Corasick · Rabin-Karp）

> **关键词**：String Matching、Pattern Matching、KMP 算法、前缀函数、Trie（前缀树）、Aho-Corasick 自动机、Rabin-Karp、后缀数组
>
> 字符串匹配是计算机科学中最经典的问题之一——给定文本 T 和模式 P，在 T 中找到 P 出现的所有位置。从朴素 O(nm) 到线性 O(n+m)，算法的演进体现了"利用已知信息避免重复计算"这一核心思想。本章将系统覆盖：朴素匹配、KMP 算法（含完整前缀函数推导）、Trie 前缀树、AC 自动机（多模式匹配）、Rabin-Karp 哈希匹配，以及后缀数组/后缀自动机简介。

---

## 一、问题定义与朴素匹配

### 1.1 问题定义

**单模式匹配（Single Pattern Matching）**：给定文本串 `text`（长度 n）和模式串 `pattern`（长度 m），找到 pattern 在 text 中所有出现的起始位置。

**多模式匹配（Multi-Pattern Matching）**：给定文本串 `text` 和 k 个模式串 `patterns[0..k-1]`，找到每个模式在 text 中的所有出现位置。

### 1.2 朴素算法（Brute Force）

对文本中的每一个位置 i，逐字符比较 `text[i..i+m-1]` 和 `pattern[0..m-1]`。

**Swift 实现**：

```swift
/// 朴素字符串匹配 - O(nm)
func bruteForceSearch(text: String, pattern: String) -> [Int] {
    let t = Array(text)
    let p = Array(pattern)
    let n = t.count, m = p.count
    guard m > 0, n >= m else { return [] }
    
    var result: [Int] = []
    for i in 0...(n - m) {
        var matched = true
        for j in 0..<m {
            if t[i + j] != p[j] {
                matched = false
                break
            }
        }
        if matched {
            result.append(i)
        }
    }
    return result
}
```

**Objective-C 实现**：

```objectivec
/// 朴素字符串匹配 - O(nm)
- (NSArray<NSNumber *> *)bruteForceSearchInText:(NSString *)text pattern:(NSString *)pattern {
    NSMutableArray<NSNumber *> *result = [NSMutableArray array];
    NSInteger n = text.length;
    NSInteger m = pattern.length;
    if (m == 0 || n < m) return result;
    
    for (NSInteger i = 0; i <= n - m; i++) {
        BOOL matched = YES;
        for (NSInteger j = 0; j < m; j++) {
            if ([text characterAtIndex:i + j] != [pattern characterAtIndex:j]) {
                matched = NO;
                break;
            }
        }
        if (matched) {
            [result addObject:@(i)];
        }
    }
    return result;
}
```

**复杂度**：
- 最坏时间：O(n × m)，例如 text = "aaa...a"，pattern = "aaa...ab"
- 最好时间：O(n)，第一个字符就不匹配的情况
- 空间：O(1)（不计结果数组）

**问题**：失配时模式串只向右移动 1 位，浪费了已匹配部分包含的信息。KMP 的核心洞察就是利用这些信息跳过不可能匹配的位置。

---

## 二、KMP 算法（Knuth-Morris-Pratt）

### 2.1 核心思想

1970 年代由 Knuth、Morris 和 Pratt 独立提出。核心观察：**当匹配到 `pattern[j]` 失配时，pattern[0..j-1] 已经匹配了 text 的对应子串。如果 pattern[0..j-1] 存在一个"真前缀等于真后缀"的最长长度 k，那么下一次比较可以直接从 pattern[k] 开始，text 指针不需要回退**。

### 2.2 前缀函数（Failure Function / π 函数）

**定义**：对于模式串 P 的每个位置 i（0-indexed），`π[i]` 表示 P[0..i] 的最长"真前缀等于真后缀"的长度。

**例子**：P = "ABACABAB"

```
i:    0  1  2  3  4  5  6  7
P:    A  B  A  C  A  B  A  B
π:    0  0  1  0  1  2  3  2
```

- π[0] = 0（约定单字符无真前缀/后缀）
- π[1] = 0：P[0..1] = "AB"，无相等的真前缀和真后缀
- π[2] = 1：P[0..2] = "ABA"，"A" 既是前缀也是后缀
- π[5] = 2：P[0..5] = "ABACAB"，"AB" 既是前缀也是后缀
- π[6] = 3：P[0..6] = "ABACABA"，"ABA" 既是前缀也是后缀
- π[7] = 2：P[0..7] = "ABACABAB"，"AB" 既是前缀也是后缀

### 2.3 前缀函数计算——增量法

关键递推：计算 π[i] 时，设 `k = π[i-1]`，检查 P[k] 是否等于 P[i]：
- 若相等，则 π[i] = k + 1
- 若不等，令 k = π[k-1]，重复，直到 k = 0 且 P[0] ≠ P[i] 时 π[i] = 0

**正确性证明（直觉）**：π[i-1] = k 意味着 P[0..k-1] = P[i-k..i-1]。若 P[k] = P[i]，则 P[0..k] = P[i-k..i]，得 π[i] = k+1。若不等，我们需要找次长的匹配前后缀——而 P[0..k-1] 自身的最长前后缀就是 π[k-1]，这正是递推的来源。

**时间复杂度**：均摊 O(m)。虽然有内层 while 循环，但 k 最多增加 m 次（每次 π[i] 比 π[i-1] 最多大 1），因此 k 的减少次数总计不超过 m。

### 2.4 KMP 搜索过程

维护两个指针：`i` 扫描文本，`j` 扫描模式。
- 若 text[i] = pattern[j]，两者前进
- 若失配且 j > 0，令 j = π[j-1]（利用前缀函数跳转，i 不回退）
- 若失配且 j = 0，仅 i 前进

当 j 达到 m 时，找到一个匹配，记录位置 i - m，然后 j = π[m-1] 继续搜索。

### 2.5 Swift 完整实现

```swift
/// KMP 字符串匹配算法
/// - 时间复杂度：O(n + m)
/// - 空间复杂度：O(m)
struct KMP {
    
    /// 计算前缀函数（failure function）
    /// - Parameter pattern: 模式串字符数组
    /// - Returns: π 数组，π[i] = P[0..i] 的最长真前缀等于真后缀的长度
    static func computePrefix(_ pattern: [Character]) -> [Int] {
        let m = pattern.count
        var pi = [Int](repeating: 0, count: m)
        var k = 0  // 当前匹配的前缀长度
        
        for i in 1..<m {
            // 失配时回退
            while k > 0 && pattern[k] != pattern[i] {
                k = pi[k - 1]
            }
            // 匹配成功则扩展
            if pattern[k] == pattern[i] {
                k += 1
            }
            pi[i] = k
        }
        return pi
    }
    
    /// 在文本中搜索模式的所有出现位置
    /// - Parameters:
    ///   - text: 文本串
    ///   - pattern: 模式串
    /// - Returns: 所有匹配的起始索引数组
    static func search(text: String, pattern: String) -> [Int] {
        let t = Array(text)
        let p = Array(pattern)
        let n = t.count, m = p.count
        guard m > 0, n >= m else { return [] }
        
        let pi = computePrefix(p)
        var result: [Int] = []
        var j = 0  // 模式串中的当前匹配位置
        
        for i in 0..<n {
            // 失配时利用前缀函数跳转
            while j > 0 && t[i] != p[j] {
                j = pi[j - 1]
            }
            // 当前字符匹配
            if t[i] == p[j] {
                j += 1
            }
            // 完整匹配
            if j == m {
                result.append(i - m + 1)
                j = pi[j - 1]  // 继续搜索下一个匹配
            }
        }
        return result
    }
}

// 使用示例
let positions = KMP.search(text: "ABABDABACDABABCABAB", pattern: "ABABCABAB")
print(positions) // [10]
```

### 2.6 Objective-C 完整实现

```objectivec
@interface KMPMatcher : NSObject

/// 在文本中搜索模式的所有出现位置
/// @param text 文本串
/// @param pattern 模式串
/// @return 所有匹配起始索引
+ (NSArray<NSNumber *> *)searchInText:(NSString *)text pattern:(NSString *)pattern;

@end

@implementation KMPMatcher

/// 计算前缀函数（failure function）
+ (NSArray<NSNumber *> *)computePrefixForPattern:(unichar *)pattern length:(NSInteger)m {
    NSMutableArray<NSNumber *> *pi = [NSMutableArray arrayWithCapacity:m];
    for (NSInteger i = 0; i < m; i++) {
        [pi addObject:@0];
    }
    
    NSInteger k = 0;
    for (NSInteger i = 1; i < m; i++) {
        while (k > 0 && pattern[k] != pattern[i]) {
            k = [pi[k - 1] integerValue];
        }
        if (pattern[k] == pattern[i]) {
            k++;
        }
        pi[i] = @(k);
    }
    return [pi copy];
}

+ (NSArray<NSNumber *> *)searchInText:(NSString *)text pattern:(NSString *)pattern {
    NSMutableArray<NSNumber *> *result = [NSMutableArray array];
    NSInteger n = text.length;
    NSInteger m = pattern.length;
    if (m == 0 || n < m) return result;
    
    // 转换为 unichar 数组，避免反复调用 characterAtIndex:
    unichar *t = (unichar *)malloc(sizeof(unichar) * n);
    unichar *p = (unichar *)malloc(sizeof(unichar) * m);
    [text getCharacters:t range:NSMakeRange(0, n)];
    [pattern getCharacters:p range:NSMakeRange(0, m)];
    
    NSArray<NSNumber *> *pi = [self computePrefixForPattern:p length:m];
    
    NSInteger j = 0;
    for (NSInteger i = 0; i < n; i++) {
        while (j > 0 && t[i] != p[j]) {
            j = [pi[j - 1] integerValue];
        }
        if (t[i] == p[j]) {
            j++;
        }
        if (j == m) {
            [result addObject:@(i - m + 1)];
            j = [pi[j - 1] integerValue];
        }
    }
    
    free(t);
    free(p);
    return [result copy];
}

@end
```

### 2.7 KMP 复杂度分析

| 阶段 | 时间复杂度 | 空间复杂度 |
|------|-----------|-----------|
| 构建前缀函数 | O(m) | O(m) |
| 搜索过程 | O(n) | O(1)（不计结果） |
| **总计** | **O(n + m)** | **O(m)** |

**均摊分析证明**：

定义势能函数 Φ = j（当前模式串指针位置）。每一步中：
- 若匹配成功：i++, j++，实际代价 1，Φ 增加 1
- 若失配 j > 0：j = π[j-1]，j 至少减小 1，Φ 减小至少 1（但 i 不变）
- 若失配 j = 0：i++，实际代价 1，Φ 不变

总均摊代价 = Σ(实际代价 + ΔΦ)。由于 j 从 0 开始，最终 ≤ m，且 j 每次最多增 1，所以 j 的总增量 ≤ n，对应总减量也 ≤ n。因此总操作次数 ≤ 2n = O(n)。

### 2.8 KMP 的变体与扩展

**1. 求最小循环节（Minimum Period）**

定理：字符串 S（长度 n）的最小循环节长度 = n - π[n-1]。如果 n % (n - π[n-1]) == 0，则 S 可以由长度为 (n - π[n-1]) 的子串重复拼接而成。

```swift
/// 判断字符串是否由某子串重复构成，返回最小循环节长度
func minimalPeriod(_ s: String) -> Int {
    let chars = Array(s)
    let n = chars.count
    let pi = KMP.computePrefix(chars)
    let period = n - pi[n - 1]
    return period
}

/// 判断字符串是否为周期串
func isRepeatedPattern(_ s: String) -> Bool {
    let chars = Array(s)
    let n = chars.count
    let pi = KMP.computePrefix(chars)
    let period = n - pi[n - 1]
    return period < n && n % period == 0
}
```

**2. 统计每个前缀出现的次数**

利用 π 函数的"链"特性：位置 i 处，所有出现的前缀为 π[i], π[π[i]-1], π[π[π[i]-1]-1], ...（直到 0）。

**3. KMP 自动机（DFA 构建）**

将 KMP 的失配跳转显式地编码为一个确定性有限自动机（DFA），状态转移表 δ[state][char]，可以 O(1) 处理每个字符。在流式场景（逐字符输入）中非常有用。

```swift
/// KMP 自动机 —— 构建完整 DFA 状态转移表
/// 适用于字符集较小的情况（如 26 个小写字母）
struct KMPAutomaton {
    let dfa: [[Int]]  // dfa[state][charIndex] = nextState
    let m: Int        // 模式串长度 = 接受状态
    
    init(pattern: String, alphabetSize: Int = 26, base: Character = "a") {
        let p = Array(pattern)
        let m = p.count
        self.m = m
        
        // 先计算前缀函数
        let pi = KMP.computePrefix(p)
        
        // 构建 DFA：(m+1) 个状态 × alphabetSize
        var dfa = [[Int]](repeating: [Int](repeating: 0, count: alphabetSize), count: m + 1)
        
        for state in 0...m {
            for c in 0..<alphabetSize {
                let ch = Character(UnicodeScalar(Int(base.asciiValue!) + c)!)
                if state < m && ch == p[state] {
                    dfa[state][c] = state + 1
                } else {
                    // 失配：沿 π 链回退
                    var k = state == 0 ? 0 : pi[state - 1]
                    while k > 0 && p[k] != ch {
                        k = pi[k - 1]
                    }
                    if p[k] == ch {
                        k += 1
                    }
                    dfa[state][c] = (state > 0 || p[0] == ch) ? k : 0
                }
            }
        }
        self.dfa = dfa
    }
    
    /// 流式搜索：逐字符输入，返回是否完成匹配
    func feed(state: inout Int, char: Character, base: Character = "a") -> Bool {
        let idx = Int(char.asciiValue!) - Int(base.asciiValue!)
        state = dfa[state][idx]
        return state == m
    }
}
```

---

## 三、Trie（前缀树 / 字典树）

### 3.1 概念与直觉

Trie（发音 "try"，源自 re**trie**val）是一棵多叉树，用于高效存储和检索字符串集合。每条从根到叶（或标记节点）的路径对应集合中的一个字符串。

**核心优势**：
- 查找/插入/删除 O(L)（L = 字符串长度），与集合大小无关
- 天然支持前缀查询（如自动补全）
- 按字典序遍历

**与哈希表对比**：

| 特性 | Trie | HashMap |
|------|------|---------|
| 查找时间 | O(L) | O(L) 平均（哈希计算） |
| 前缀搜索 | O(prefix_len) | 不支持 |
| 有序遍历 | 天然有序 | 无序 |
| 空间 | 可能浪费（稀疏） | 紧凑 |
| 最坏情况 | O(L) 确定性 | O(n) 哈希冲突 |

### 3.2 基本结构

```
         root
       /  |   \
      a   b    c
     / \   \
    p   n   a
    |   |   |
    p   d   t
    |
    l
    |
    e
    
存储：{"apple", "and", "bat", "cat"}
```

每个节点包含：
- `children`: 映射字符到子节点（数组或哈希表）
- `isEndOfWord`: 标记是否有字符串在此终止
- `count`（可选）: 以该节点为前缀的字符串数量

### 3.3 Swift 实现

```swift
/// Trie（前缀树）完整实现
class TrieNode {
    var children: [Character: TrieNode] = [:]
    var isEndOfWord: Bool = false
    var prefixCount: Int = 0  // 经过该节点的字符串数量
    var wordCount: Int = 0    // 在该节点结束的字符串数量
}

class Trie {
    private let root = TrieNode()
    private(set) var wordCount = 0
    
    /// 插入一个单词 - O(L)
    func insert(_ word: String) {
        var node = root
        for char in word {
            node.prefixCount += 1
            if node.children[char] == nil {
                node.children[char] = TrieNode()
            }
            node = node.children[char]!
        }
        node.prefixCount += 1
        node.isEndOfWord = true
        node.wordCount += 1
        wordCount += 1
    }
    
    /// 精确查找 - O(L)
    func search(_ word: String) -> Bool {
        guard let node = findNode(word) else { return false }
        return node.isEndOfWord
    }
    
    /// 前缀查找：是否存在以 prefix 开头的单词 - O(L)
    func startsWith(_ prefix: String) -> Bool {
        return findNode(prefix) != nil
    }
    
    /// 统计以 prefix 为前缀的单词数量 - O(L)
    func countWordsWithPrefix(_ prefix: String) -> Int {
        guard let node = findNode(prefix) else { return 0 }
        return node.prefixCount
    }
    
    /// 删除一个单词（只删除一次出现）- O(L)
    func delete(_ word: String) -> Bool {
        return deleteHelper(root, Array(word), 0)
    }
    
    /// 获取所有以 prefix 开头的单词（自动补全）- O(总字符数)
    func autocomplete(_ prefix: String) -> [String] {
        guard let node = findNode(prefix) else { return [] }
        var results: [String] = []
        var current = prefix
        collectWords(node, prefix: &current, results: &results)
        return results
    }
    
    /// 字典序最小的单词
    func lexicographicallySmallest() -> String? {
        var result = ""
        var node = root
        while true {
            if node.isEndOfWord && result.count > 0 {
                return result
            }
            guard let minChar = node.children.keys.min() else { return result.isEmpty ? nil : result }
            result.append(minChar)
            node = node.children[minChar]!
        }
    }
    
    // MARK: - Private Helpers
    
    private func findNode(_ prefix: String) -> TrieNode? {
        var node = root
        for char in prefix {
            guard let child = node.children[char] else { return nil }
            node = child
        }
        return node
    }
    
    private func collectWords(_ node: TrieNode, prefix: inout String, results: inout [String]) {
        if node.isEndOfWord {
            results.append(prefix)
        }
        for char in node.children.keys.sorted() {
            prefix.append(char)
            collectWords(node.children[char]!, prefix: &prefix, results: &results)
            prefix.removeLast()
        }
    }
    
    private func deleteHelper(_ node: TrieNode, _ chars: [Character], _ index: Int) -> Bool {
        if index == chars.count {
            guard node.isEndOfWord else { return false }
            node.wordCount -= 1
            if node.wordCount == 0 {
                node.isEndOfWord = false
            }
            node.prefixCount -= 1
            wordCount -= 1
            return true
        }
        
        guard let child = node.children[chars[index]] else { return false }
        let deleted = deleteHelper(child, chars, index + 1)
        if deleted {
            node.prefixCount -= 1
            // 如果子节点不再需要，可以删除
            if child.prefixCount == 0 {
                node.children.removeValue(forKey: chars[index])
            }
        }
        return deleted
    }
}
```

### 3.4 Objective-C 实现

```objectivec
@interface SAKTrieNode : NSObject
@property (nonatomic, strong) NSMutableDictionary<NSString *, SAKTrieNode *> *children;
@property (nonatomic, assign) BOOL isEndOfWord;
@property (nonatomic, assign) NSInteger prefixCount;
@property (nonatomic, assign) NSInteger wordCount;
@end

@implementation SAKTrieNode
- (instancetype)init {
    self = [super init];
    if (self) {
        _children = [NSMutableDictionary dictionary];
        _isEndOfWord = NO;
        _prefixCount = 0;
        _wordCount = 0;
    }
    return self;
}
@end

@interface SAKTrie : NSObject
@property (nonatomic, readonly) NSInteger totalWordCount;
- (void)insert:(NSString *)word;
- (BOOL)search:(NSString *)word;
- (BOOL)startsWith:(NSString *)prefix;
- (NSInteger)countWordsWithPrefix:(NSString *)prefix;
- (BOOL)deleteWord:(NSString *)word;
- (NSArray<NSString *> *)autocomplete:(NSString *)prefix;
@end

@implementation SAKTrie {
    SAKTrieNode *_root;
    NSInteger _totalWordCount;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _root = [[SAKTrieNode alloc] init];
        _totalWordCount = 0;
    }
    return self;
}

- (NSInteger)totalWordCount { return _totalWordCount; }

- (void)insert:(NSString *)word {
    SAKTrieNode *node = _root;
    for (NSInteger i = 0; i < word.length; i++) {
        NSString *ch = [word substringWithRange:NSMakeRange(i, 1)];
        node.prefixCount++;
        if (!node.children[ch]) {
            node.children[ch] = [[SAKTrieNode alloc] init];
        }
        node = node.children[ch];
    }
    node.prefixCount++;
    node.isEndOfWord = YES;
    node.wordCount++;
    _totalWordCount++;
}

- (BOOL)search:(NSString *)word {
    SAKTrieNode *node = [self _findNode:word];
    return node != nil && node.isEndOfWord;
}

- (BOOL)startsWith:(NSString *)prefix {
    return [self _findNode:prefix] != nil;
}

- (NSInteger)countWordsWithPrefix:(NSString *)prefix {
    SAKTrieNode *node = [self _findNode:prefix];
    return node ? node.prefixCount : 0;
}

- (BOOL)deleteWord:(NSString *)word {
    return [self _deleteHelper:_root chars:word index:0];
}

- (NSArray<NSString *> *)autocomplete:(NSString *)prefix {
    SAKTrieNode *node = [self _findNode:prefix];
    if (!node) return @[];
    NSMutableArray<NSString *> *results = [NSMutableArray array];
    [self _collectWords:node prefix:[prefix mutableCopy] results:results];
    return [results copy];
}

#pragma mark - Private

- (SAKTrieNode *)_findNode:(NSString *)prefix {
    SAKTrieNode *node = _root;
    for (NSInteger i = 0; i < prefix.length; i++) {
        NSString *ch = [prefix substringWithRange:NSMakeRange(i, 1)];
        node = node.children[ch];
        if (!node) return nil;
    }
    return node;
}

- (BOOL)_deleteHelper:(SAKTrieNode *)node chars:(NSString *)word index:(NSInteger)idx {
    if (idx == (NSInteger)word.length) {
        if (!node.isEndOfWord) return NO;
        node.wordCount--;
        if (node.wordCount == 0) node.isEndOfWord = NO;
        node.prefixCount--;
        _totalWordCount--;
        return YES;
    }
    NSString *ch = [word substringWithRange:NSMakeRange(idx, 1)];
    SAKTrieNode *child = node.children[ch];
    if (!child) return NO;
    BOOL deleted = [self _deleteHelper:child chars:word index:idx + 1];
    if (deleted) {
        node.prefixCount--;
        if (child.prefixCount == 0) {
            [node.children removeObjectForKey:ch];
        }
    }
    return deleted;
}

- (void)_collectWords:(SAKTrieNode *)node prefix:(NSMutableString *)prefix results:(NSMutableArray *)results {
    if (node.isEndOfWord) {
        [results addObject:[prefix copy]];
    }
    NSArray *sortedKeys = [node.children.allKeys sortedArrayUsingSelector:@selector(compare:)];
    for (NSString *ch in sortedKeys) {
        [prefix appendString:ch];
        [self _collectWords:node.children[ch] prefix:prefix results:results];
        [prefix deleteCharactersInRange:NSMakeRange(prefix.length - 1, 1)];
    }
}

@end
```

### 3.5 Trie 的变体

**1. 压缩 Trie（Compressed Trie / Patricia Trie / Radix Tree）**

将只有单个子节点的节点链合并为一条边，存储字符串片段而非单个字符。适用于稀疏 Trie（如路由表、IP 查找）。

```
原始 Trie:      压缩后:
  root             root
  |                /    \
  r            "omane"  "ubber"
  |    \
  o     u
  |     |
  m     b
  |     |
  a     b
  |     |
  n     e
  |     |
  e     r

存储 "romane", "rubber"
```

**2. 位 Trie（Bitwise Trie）**

按二进制位分支，每个节点只有 0/1 两个子节点。用于：
- XOR 最大值查找（经典题目）
- 整数集合的前缀操作

```swift
/// 位 Trie：用于求最大异或值
class BitTrie {
    private var children: [BitTrie?] = [nil, nil] // 0, 1
    
    /// 插入一个整数（按高位到低位）
    func insert(_ num: Int, bits: Int = 30) {
        var node = self
        for i in stride(from: bits, through: 0, by: -1) {
            let bit = (num >> i) & 1
            if node.children[bit] == nil {
                node.children[bit] = BitTrie()
            }
            node = node.children[bit]!
        }
    }
    
    /// 查询与 num 异或最大的值
    func queryMaxXOR(_ num: Int, bits: Int = 30) -> Int {
        var node = self
        var result = 0
        for i in stride(from: bits, through: 0, by: -1) {
            let bit = (num >> i) & 1
            let wanted = 1 - bit  // 想要相反的位
            if node.children[wanted] != nil {
                result |= (1 << i)
                node = node.children[wanted]!
            } else if node.children[bit] != nil {
                node = node.children[bit]!
            } else {
                break
            }
        }
        return result
    }
}
```

**3. 持久化 Trie（Persistent Trie）**

每次修改产生新版本根节点，共享未修改子树。用于需要访问历史版本的场景。

### 3.6 Trie 复杂度分析

| 操作 | 时间复杂度 | 空间复杂度 |
|------|-----------|-----------|
| 插入 | O(L) | O(L) 最坏新增 L 节点 |
| 查找 | O(L) | O(1) |
| 前缀搜索 | O(L) | O(1) |
| 删除 | O(L) | O(1) |
| 自动补全 | O(L + 结果总长) | O(结果数) |
| 整体空间 | — | O(Σ × N) 最坏（Σ=字符集大小，N=总字符数） |

---

## 四、Aho-Corasick 自动机（多模式匹配）

### 4.1 问题与动机

当需要在一个文本中同时搜索 k 个模式串时，逐个 KMP 需要 O(k × (n + m_i))。AC 自动机将所有模式构建为一棵 Trie，并添加**失败指针（fail link）**，实现 O(n + Σm_i + 匹配数) 的总复杂度。

**应用场景**：敏感词过滤、入侵检测系统（IDS/IPS）、DNA 序列多模式搜索、编译器词法分析。

### 4.2 核心思想

1. **构建 Trie**：将所有模式串插入 Trie
2. **构建失败指针**：BFS 遍历 Trie，对每个节点 u，其 fail 指针指向"Trie 中代表 u 所对应字符串的最长真后缀"的节点。类比 KMP 的 π 函数——KMP 是单串的失败回退，AC 自动机是多串 Trie 上的失败回退。
3. **搜索**：沿 Trie 逐字符匹配文本，失配时沿 fail 指针跳转。在任何标记节点及其 fail 链上的标记节点都报告匹配。

### 4.3 失败指针构建算法

```
对根的所有直接子节点：fail = root
BFS 遍历：
  对于节点 u 的每个子节点 v（边上字符为 c）：
    k = u.fail
    while k ≠ root && k 没有字符 c 的子节点:
        k = k.fail
    v.fail = k 有字符 c 的子节点 ? k.children[c] : root
    if v.fail.isEndOfWord:
        v.output = v.fail  // 字典后缀链接（用于快速遍历匹配）
```

**优化**：同时构建 goto 函数——若节点 u 没有字符 c 的子节点，直接令 `u.children[c] = u.fail.children[c]`（相当于将 Trie 补全为确定性有限自动机），搜索时就不需要循环跟随 fail 指针了。

### 4.4 Swift 完整实现

```swift
/// Aho-Corasick 多模式匹配自动机
class AhoCorasick {
    
    class ACNode {
        var children: [Character: ACNode] = [:]
        var fail: ACNode? = nil
        var output: [Int] = []  // 在此节点匹配的模式串索引
        var dictSuffixLink: ACNode? = nil  // 字典后缀链接
    }
    
    private let root = ACNode()
    private var patterns: [String] = []
    
    /// 构建 AC 自动机
    /// - Parameter patterns: 模式串数组
    init(patterns: [String]) {
        self.patterns = patterns
        // 1. 构建 Trie
        for (index, pattern) in patterns.enumerated() {
            var node = root
            for char in pattern {
                if node.children[char] == nil {
                    node.children[char] = ACNode()
                }
                node = node.children[char]!
            }
            node.output.append(index)
        }
        // 2. BFS 构建失败指针
        buildFailLinks()
    }
    
    private func buildFailLinks() {
        var queue: [ACNode] = []
        
        // 根的直接子节点，fail 指向根
        for (_, child) in root.children {
            child.fail = root
            queue.append(child)
        }
        
        // BFS
        var head = 0
        while head < queue.count {
            let current = queue[head]
            head += 1
            
            for (char, child) in current.children {
                // 计算 child 的 fail 指针
                var failNode = current.fail
                while failNode != nil && failNode!.children[char] == nil {
                    failNode = failNode!.fail
                }
                child.fail = failNode?.children[char] ?? root
                if child.fail === child {
                    child.fail = root  // 防止自环
                }
                
                // 合并输出：child 的 fail 节点的 output 也是 child 的匹配
                child.output += child.fail!.output
                
                // 字典后缀链接
                if !child.fail!.output.isEmpty {
                    child.dictSuffixLink = child.fail
                } else {
                    child.dictSuffixLink = child.fail!.dictSuffixLink
                }
                
                queue.append(child)
            }
        }
    }
    
    /// 在文本中搜索所有模式的出现
    /// - Parameter text: 文本串
    /// - Returns: [(模式索引, 出现位置)] 数组
    func search(in text: String) -> [(patternIndex: Int, position: Int)] {
        var results: [(Int, Int)] = []
        var node = root
        
        for (i, char) in text.enumerated() {
            // 沿 fail 链找到能匹配 char 的节点
            while node !== root && node.children[char] == nil {
                node = node.fail ?? root
            }
            node = node.children[char] ?? root
            
            // 报告所有匹配（当前节点 + fail 链上的匹配）
            for patternIdx in node.output {
                let pos = i - patterns[patternIdx].count + 1
                results.append((patternIdx, pos))
            }
        }
        
        return results
    }
}

// 使用示例
let ac = AhoCorasick(patterns: ["he", "she", "his", "hers"])
let matches = ac.search(in: "ahishers")
// 结果：("his" at 1), ("he" at 4), ("she" at 3), ("hers" at 4)
for (idx, pos) in matches {
    print("Pattern '\(["he", "she", "his", "hers"][idx])' found at position \(pos)")
}
```

### 4.5 Objective-C 实现

```objectivec
@interface SAKACNode : NSObject
@property (nonatomic, strong) NSMutableDictionary<NSString *, SAKACNode *> *children;
@property (nonatomic, weak) SAKACNode *fail;
@property (nonatomic, strong) NSMutableArray<NSNumber *> *output; // 匹配的模式索引
@end

@implementation SAKACNode
- (instancetype)init {
    self = [super init];
    if (self) {
        _children = [NSMutableDictionary dictionary];
        _output = [NSMutableArray array];
    }
    return self;
}
@end

@interface SAKAhoCorasick : NSObject
- (instancetype)initWithPatterns:(NSArray<NSString *> *)patterns;
- (NSArray<NSDictionary *> *)searchInText:(NSString *)text;
@end

@implementation SAKAhoCorasick {
    SAKACNode *_root;
    NSArray<NSString *> *_patterns;
}

- (instancetype)initWithPatterns:(NSArray<NSString *> *)patterns {
    self = [super init];
    if (self) {
        _patterns = [patterns copy];
        _root = [[SAKACNode alloc] init];
        [self _buildTrie];
        [self _buildFailLinks];
    }
    return self;
}

- (void)_buildTrie {
    for (NSInteger idx = 0; idx < _patterns.count; idx++) {
        NSString *pattern = _patterns[idx];
        SAKACNode *node = _root;
        for (NSInteger i = 0; i < pattern.length; i++) {
            NSString *ch = [pattern substringWithRange:NSMakeRange(i, 1)];
            if (!node.children[ch]) {
                node.children[ch] = [[SAKACNode alloc] init];
            }
            node = node.children[ch];
        }
        [node.output addObject:@(idx)];
    }
}

- (void)_buildFailLinks {
    NSMutableArray<SAKACNode *> *queue = [NSMutableArray array];
    
    for (SAKACNode *child in _root.children.allValues) {
        child.fail = _root;
        [queue addObject:child];
    }
    
    NSInteger head = 0;
    while (head < (NSInteger)queue.count) {
        SAKACNode *current = queue[head++];
        
        for (NSString *ch in current.children) {
            SAKACNode *child = current.children[ch];
            SAKACNode *failNode = current.fail;
            
            while (failNode && !failNode.children[ch]) {
                failNode = failNode.fail;
            }
            child.fail = failNode ? failNode.children[ch] : _root;
            if (child.fail == child) child.fail = _root;
            
            // 合并输出
            [child.output addObjectsFromArray:child.fail.output];
            [queue addObject:child];
        }
    }
}

- (NSArray<NSDictionary *> *)searchInText:(NSString *)text {
    NSMutableArray<NSDictionary *> *results = [NSMutableArray array];
    SAKACNode *node = _root;
    
    for (NSInteger i = 0; i < (NSInteger)text.length; i++) {
        NSString *ch = [text substringWithRange:NSMakeRange(i, 1)];
        
        while (node != _root && !node.children[ch]) {
            node = node.fail ?: _root;
        }
        node = node.children[ch] ?: _root;
        
        for (NSNumber *patternIdx in node.output) {
            NSInteger idx = patternIdx.integerValue;
            NSInteger pos = i - (NSInteger)_patterns[idx].length + 1;
            [results addObject:@{@"pattern": _patterns[idx], @"index": @(idx), @"position": @(pos)}];
        }
    }
    return [results copy];
}

@end
```

### 4.6 AC 自动机复杂度

| 阶段 | 时间复杂度 | 说明 |
|------|-----------|------|
| 构建 Trie | O(Σm_i) | 插入所有模式串 |
| 构建 Fail | O(Σm_i × Σ) 或 O(Σm_i) | 取决于实现方式 |
| 搜索 | O(n + 匹配数) | 文本扫描 + 报告匹配 |
| **空间** | O(Σm_i × Σ) | Trie 节点 × 字符集 |

---

## 五、Rabin-Karp 算法（哈希匹配）

### 5.1 核心思想

利用**滚动哈希（Rolling Hash）**将字符串比较转化为数值比较。对文本的每个长度为 m 的窗口计算哈希值，与模式串哈希比较。哈希相等时再逐字符确认（避免假阳性）。

**滚动哈希公式**：

选定基数 base 和模数 mod：
```
hash(s[i..i+m-1]) = (s[i] × base^(m-1) + s[i+1] × base^(m-2) + ... + s[i+m-1]) mod mod
```

滚动更新：
```
hash(s[i+1..i+m]) = (hash(s[i..i+m-1]) - s[i] × base^(m-1)) × base + s[i+m]
```

### 5.2 Swift 实现

```swift
/// Rabin-Karp 字符串匹配
/// - 平均时间 O(n + m)，最坏 O(nm)（大量哈希冲突）
/// - 优势：可同时匹配多个等长模式
struct RabinKarp {
    static let base: UInt64 = 31
    static let mod: UInt64 = 1_000_000_007
    
    /// 单模式搜索
    static func search(text: String, pattern: String) -> [Int] {
        let t = Array(text.unicodeScalars.map { UInt64($0.value) })
        let p = Array(pattern.unicodeScalars.map { UInt64($0.value) })
        let n = t.count, m = p.count
        guard m > 0, n >= m else { return [] }
        
        // 计算 base^(m-1) mod mod
        var basePow: UInt64 = 1
        for _ in 0..<(m - 1) {
            basePow = basePow &* base % mod
        }
        
        // 计算模式串哈希
        var patternHash: UInt64 = 0
        for i in 0..<m {
            patternHash = (patternHash &* base &+ p[i]) % mod
        }
        
        // 计算文本第一个窗口的哈希
        var windowHash: UInt64 = 0
        for i in 0..<m {
            windowHash = (windowHash &* base &+ t[i]) % mod
        }
        
        var result: [Int] = []
        
        for i in 0...(n - m) {
            // 哈希匹配，逐字符确认
            if windowHash == patternHash {
                var match = true
                for j in 0..<m {
                    if t[i + j] != p[j] {
                        match = false
                        break
                    }
                }
                if match {
                    result.append(i)
                }
            }
            
            // 滚动更新哈希（移除首字符，加入新字符）
            if i < n - m {
                windowHash = (windowHash &+ mod &- t[i] &* basePow % mod) % mod
                windowHash = (windowHash &* base &+ t[i + m]) % mod
            }
        }
        
        return result
    }
    
    /// 双哈希降低冲突概率
    static func searchDoubleHash(text: String, pattern: String) -> [Int] {
        let mod2: UInt64 = 1_000_000_009
        let base2: UInt64 = 37
        
        let t = Array(text.unicodeScalars.map { UInt64($0.value) })
        let p = Array(pattern.unicodeScalars.map { UInt64($0.value) })
        let n = t.count, m = p.count
        guard m > 0, n >= m else { return [] }
        
        // 两组哈希参数
        var basePow1: UInt64 = 1, basePow2: UInt64 = 1
        for _ in 0..<(m - 1) {
            basePow1 = basePow1 &* base % mod
            basePow2 = basePow2 &* base2 % mod2
        }
        
        var pH1: UInt64 = 0, pH2: UInt64 = 0
        var wH1: UInt64 = 0, wH2: UInt64 = 0
        for i in 0..<m {
            pH1 = (pH1 &* base &+ p[i]) % mod
            pH2 = (pH2 &* base2 &+ p[i]) % mod2
            wH1 = (wH1 &* base &+ t[i]) % mod
            wH2 = (wH2 &* base2 &+ t[i]) % mod2
        }
        
        var result: [Int] = []
        for i in 0...(n - m) {
            if wH1 == pH1 && wH2 == pH2 {
                // 双哈希匹配，冲突概率极低，可选跳过逐字符确认
                result.append(i)
            }
            if i < n - m {
                wH1 = (wH1 &+ mod &- t[i] &* basePow1 % mod) % mod
                wH1 = (wH1 &* base &+ t[i + m]) % mod
                wH2 = (wH2 &+ mod2 &- t[i] &* basePow2 % mod2) % mod2
                wH2 = (wH2 &* base2 &+ t[i + m]) % mod2
            }
        }
        return result
    }
}
```

### 5.3 Objective-C 实现

```objectivec
@interface SAKRabinKarp : NSObject
+ (NSArray<NSNumber *> *)searchInText:(NSString *)text pattern:(NSString *)pattern;
@end

@implementation SAKRabinKarp

static const uint64_t kBase = 31;
static const uint64_t kMod = 1000000007;

+ (NSArray<NSNumber *> *)searchInText:(NSString *)text pattern:(NSString *)pattern {
    NSMutableArray<NSNumber *> *result = [NSMutableArray array];
    NSInteger n = text.length, m = pattern.length;
    if (m == 0 || n < m) return result;
    
    unichar *t = (unichar *)malloc(sizeof(unichar) * n);
    unichar *p = (unichar *)malloc(sizeof(unichar) * m);
    [text getCharacters:t range:NSMakeRange(0, n)];
    [pattern getCharacters:p range:NSMakeRange(0, m)];
    
    // 计算 base^(m-1) % mod
    uint64_t basePow = 1;
    for (NSInteger i = 0; i < m - 1; i++) {
        basePow = basePow * kBase % kMod;
    }
    
    // 模式串哈希
    uint64_t patternHash = 0;
    for (NSInteger i = 0; i < m; i++) {
        patternHash = (patternHash * kBase + p[i]) % kMod;
    }
    
    // 第一个窗口哈希
    uint64_t windowHash = 0;
    for (NSInteger i = 0; i < m; i++) {
        windowHash = (windowHash * kBase + t[i]) % kMod;
    }
    
    for (NSInteger i = 0; i <= n - m; i++) {
        if (windowHash == patternHash) {
            BOOL match = YES;
            for (NSInteger j = 0; j < m; j++) {
                if (t[i + j] != p[j]) { match = NO; break; }
            }
            if (match) [result addObject:@(i)];
        }
        if (i < n - m) {
            windowHash = (windowHash + kMod - t[i] * basePow % kMod) % kMod;
            windowHash = (windowHash * kBase + t[i + m]) % kMod;
        }
    }
    
    free(t);
    free(p);
    return [result copy];
}

@end
```

### 5.4 Rabin-Karp 复杂度

| 情况 | 时间 | 空间 |
|------|------|------|
| 平均 | O(n + m) | O(1) |
| 最坏 | O(nm) | O(1) |
| 多模式（k 个等长模式） | O(n + km) 平均 | O(km) |

**Rabin-Karp 的独特优势**：
1. 可以同时搜索多个等长模式（哈希值放入 HashSet）
2. 适用于二维模式匹配（图像搜索）
3. 实现简单，实际性能优秀（哈希比较是 O(1)）
4. 可以推广到子串去重（字符串哈希 + 前缀哈希数组）

---

## 六、字符串哈希（前缀哈希数组）

### 6.1 概念

预计算字符串的前缀哈希数组和幂次数组，就可以 O(1) 获取任意子串的哈希值。这是竞赛和工程中极其常用的技巧。

### 6.2 实现

```swift
/// 字符串哈希（前缀哈希数组）
/// 支持 O(1) 查询任意子串哈希
struct StringHash {
    private let prefixHash: [UInt64]
    private let power: [UInt64]
    private let base: UInt64 = 131
    private let mod: UInt64 = 1_000_000_007
    
    init(_ s: String) {
        let chars = Array(s.unicodeScalars.map { UInt64($0.value) })
        let n = chars.count
        
        var h = [UInt64](repeating: 0, count: n + 1)
        var p = [UInt64](repeating: 1, count: n + 1)
        
        for i in 0..<n {
            h[i + 1] = (h[i] &* base &+ chars[i]) % mod
            p[i + 1] = p[i] &* base % mod
        }
        
        self.prefixHash = h
        self.power = p
    }
    
    /// 获取子串 s[l..r]（0-indexed，闭区间）的哈希值
    func hash(l: Int, r: Int) -> UInt64 {
        let raw = (prefixHash[r + 1] &+ mod &- prefixHash[l] &* power[r - l + 1] % mod) % mod
        return raw
    }
    
    /// 判断两个子串是否相等
    func isEqual(l1: Int, r1: Int, l2: Int, r2: Int) -> Bool {
        guard r1 - l1 == r2 - l2 else { return false }
        return hash(l: l1, r: r1) == hash(l: l2, r: r2)
    }
    
    /// 求两个位置开始的最长公共前缀（LCP）
    func lcp(i: Int, j: Int, maxLen: Int) -> Int {
        var lo = 0, hi = maxLen
        while lo < hi {
            let mid = (lo + hi + 1) / 2
            if hash(l: i, r: i + mid - 1) == hash(l: j, r: j + mid - 1) {
                lo = mid
            } else {
                hi = mid - 1
            }
        }
        return lo
    }
}
```

### 6.3 应用场景

1. **判断回文**：正序哈希 vs 逆序哈希
2. **最长公共子串**：二分 + 哈希
3. **字符串去重/计数**：哈希值放入 Set
4. **后缀排序加速**：比较后缀时用 LCP + 哈希

---

## 七、后缀数组与后缀自动机（简介）

### 7.1 后缀数组（Suffix Array）

**定义**：将字符串 S 的所有后缀按字典序排列，得到后缀数组 `sa[i]` = 排名第 i 的后缀的起始位置。

**构建**：
- 朴素：O(n² log n)
- 倍增法（DC3/SA-IS）：O(n log n) 或 O(n)

**LCP 数组**：`lcp[i]` = sa[i] 和 sa[i-1] 对应后缀的最长公共前缀。可用 Kasai 算法 O(n) 构建。

**应用**：最长重复子串、最长公共子串、子串计数、字符串排序等。

```swift
/// 后缀数组（倍增法）- O(n log²n) 简易版本
/// 生产环境可用 SA-IS 达到 O(n)
struct SuffixArray {
    let sa: [Int]       // 后缀数组
    let rank: [Int]     // 排名数组
    let lcp: [Int]      // LCP 数组（Kasai 算法）
    
    init(_ s: String) {
        let chars = Array(s.unicodeScalars.map { Int($0.value) })
        let n = chars.count
        guard n > 0 else {
            sa = []; rank = []; lcp = []
            return
        }
        
        // 倍增法构建 SA
        var sa = Array(0..<n)
        var rank = chars
        var tmp = [Int](repeating: 0, count: n)
        
        var k = 1
        while k < n {
            let r = rank
            let kk = k
            sa.sort { a, b in
                if r[a] != r[b] { return r[a] < r[b] }
                let ra = a + kk < n ? r[a + kk] : -1
                let rb = b + kk < n ? r[b + kk] : -1
                return ra < rb
            }
            tmp[sa[0]] = 0
            for i in 1..<n {
                let same = r[sa[i]] == r[sa[i-1]] &&
                           (sa[i] + kk < n ? r[sa[i] + kk] : -1) ==
                           (sa[i-1] + kk < n ? r[sa[i-1] + kk] : -1)
                tmp[sa[i]] = tmp[sa[i-1]] + (same ? 0 : 1)
            }
            rank = tmp
            if rank[sa[n-1]] == n - 1 { break }
            k *= 2
        }
        
        self.sa = sa
        self.rank = rank
        
        // Kasai 算法构建 LCP
        var lcpArr = [Int](repeating: 0, count: n)
        var h = 0
        for i in 0..<n {
            if rank[i] == 0 { h = 0; continue }
            let j = sa[rank[i] - 1]
            while i + h < n && j + h < n && chars[i + h] == chars[j + h] {
                h += 1
            }
            lcpArr[rank[i]] = h
            if h > 0 { h -= 1 }
        }
        self.lcp = lcpArr
    }
    
    /// 最长重复子串
    func longestRepeatedSubstring(in s: String) -> String {
        guard let maxLcp = lcp.max(), maxLcp > 0 else { return "" }
        let idx = lcp.firstIndex(of: maxLcp)!
        let start = s.index(s.startIndex, offsetBy: sa[idx])
        let end = s.index(start, offsetBy: maxLcp)
        return String(s[start..<end])
    }
}
```

### 7.2 后缀自动机（SAM，简介）

后缀自动机是一个 O(n) 大小的 DAG/DFA，能识别字符串 S 的所有子串。它是字符串领域最强大的数据结构之一，可以解决几乎所有子串相关问题（子串计数、最小表示、最长公共子串等），但实现较为复杂，此处仅做概念介绍。

---

## 八、经典问题与解析

### 问题 1：实现 strStr()（LeetCode 28）

**题意**：在 haystack 中找 needle 的第一次出现位置。

```swift
func strStr(_ haystack: String, _ needle: String) -> Int {
    let positions = KMP.search(text: haystack, pattern: needle)
    return positions.first ?? -1
}
```

### 问题 2：重复的子字符串（LeetCode 459）

**题意**：判断字符串是否由某子串重复多次构成。

**KMP 解法**：利用前缀函数的最小循环节性质。

```swift
func repeatedSubstringPattern(_ s: String) -> Bool {
    let chars = Array(s)
    let n = chars.count
    let pi = KMP.computePrefix(chars)
    let period = n - pi[n - 1]
    return period < n && n % period == 0
}
```

**数学证明**：若 π[n-1] > 0 且 n % (n - π[n-1]) == 0，令 p = n - π[n-1]，则 S[0..n-1-p] = S[p..n-1]（前缀函数定义），即整个字符串可以由长度 p 的片段平移覆盖，而 n/p ≥ 2 说明至少重复两次。

### 问题 3：最短回文串（LeetCode 214）

**题意**：在字符串 s 前面添加最少字符使其成为回文。

**思路**：构造 `s + "#" + reverse(s)`，求其前缀函数。最后的 π 值表示 s 的最长前缀回文的长度。

```swift
func shortestPalindrome(_ s: String) -> String {
    let rev = String(s.reversed())
    let combined = s + "#" + rev  // '#' 防止前后缀跨界
    let pi = KMP.computePrefix(Array(combined))
    let longestPalindromicPrefix = pi[combined.count - 1]
    let suffix = String(s.dropFirst(longestPalindromicPrefix))
    return String(suffix.reversed()) + s
}
```

### 问题 4：实现 Trie（LeetCode 208）

即上文 §3.3 的实现，支持 insert、search、startsWith 三个操作。

### 问题 5：单词搜索 II（LeetCode 212）

**题意**：在 m×n 网格中搜索所有出现的单词（可向四方向移动，同一格不重复使用）。

**解法**：将所有单词构建 Trie，然后对网格每个位置做 DFS，沿 Trie 剪枝。

```swift
func findWords(_ board: [[Character]], _ words: [String]) -> [String] {
    // 构建 Trie
    let trie = Trie()
    for word in words {
        trie.insert(word)
    }
    
    let m = board.count, n = board[0].count
    var result: Set<String> = []
    var visited = [[Bool]](repeating: [Bool](repeating: false, count: n), count: m)
    let dirs = [(0,1),(0,-1),(1,0),(-1,0)]
    
    func dfs(_ i: Int, _ j: Int, _ node: TrieNode, _ path: inout String) {
        let char = board[i][j]
        guard let child = node.children[char] else { return }
        
        path.append(char)
        visited[i][j] = true
        
        if child.isEndOfWord {
            result.insert(path)
        }
        
        for (di, dj) in dirs {
            let ni = i + di, nj = j + dj
            if ni >= 0 && ni < m && nj >= 0 && nj < n && !visited[ni][nj] {
                dfs(ni, nj, child, &path)
            }
        }
        
        visited[i][j] = false
        path.removeLast()
    }
    
    let root = trie.root  // 需要暴露 root
    for i in 0..<m {
        for j in 0..<n {
            var path = ""
            dfs(i, j, root, &path)
        }
    }
    
    return Array(result)
}
```

### 问题 6：添加与搜索单词（LeetCode 211，支持通配符 '.'）

```swift
class WordDictionary {
    private let root = TrieNode()
    
    func addWord(_ word: String) {
        var node = root
        for char in word {
            if node.children[char] == nil {
                node.children[char] = TrieNode()
            }
            node = node.children[char]!
        }
        node.isEndOfWord = true
    }
    
    func search(_ word: String) -> Bool {
        return dfs(Array(word), 0, root)
    }
    
    private func dfs(_ chars: [Character], _ index: Int, _ node: TrieNode) -> Bool {
        if index == chars.count {
            return node.isEndOfWord
        }
        let char = chars[index]
        if char == "." {
            // 通配符：尝试所有子节点
            for child in node.children.values {
                if dfs(chars, index + 1, child) {
                    return true
                }
            }
            return false
        } else {
            guard let child = node.children[char] else { return false }
            return dfs(chars, index + 1, child)
        }
    }
}
```

### 问题 7：数组中两个数的最大异或值（LeetCode 421）

**题意**：给定整数数组，找两个数使得异或值最大。

**位 Trie 解法**：将每个数按二进制高位到低位插入位 Trie，对每个数贪心地尝试走相反位的路径。

```swift
func findMaximumXOR(_ nums: [Int]) -> Int {
    let trie = BitTrie()
    for num in nums {
        trie.insert(num)
    }
    var maxXor = 0
    for num in nums {
        maxXor = max(maxXor, trie.queryMaxXOR(num))
    }
    return maxXor
}
```

### 问题 8：敏感词过滤（AC 自动机实战）

```swift
/// 敏感词过滤器：替换文本中所有敏感词为 ***
class SensitiveWordFilter {
    private let ac: AhoCorasick
    private let patterns: [String]
    
    init(sensitiveWords: [String]) {
        self.patterns = sensitiveWords
        self.ac = AhoCorasick(patterns: sensitiveWords)
    }
    
    func filter(_ text: String) -> String {
        let matches = ac.search(in: text)
        guard !matches.isEmpty else { return text }
        
        var chars = Array(text)
        for (patternIdx, position) in matches {
            let len = patterns[patternIdx].count
            for i in position..<(position + len) {
                if i < chars.count {
                    chars[i] = "*"
                }
            }
        }
        return String(chars)
    }
}
```

---

## 九、算法对比与选择指南

### 9.1 单模式匹配算法对比

| 算法 | 预处理 | 匹配 | 空间 | 特点 |
|------|--------|------|------|------|
| Brute Force | O(0) | O(nm) | O(1) | 实现简单，短模式表现尚可 |
| KMP | O(m) | O(n) | O(m) | 确定性线性，理论最优 |
| Rabin-Karp | O(m) | O(n) 平均 | O(1) | 支持多模式、二维匹配 |
| Boyer-Moore | O(m+Σ) | O(n/m) 最好 | O(m+Σ) | 实际最快（大字符集跳跃） |
| Z-Algorithm | O(m) | O(n) | O(n+m) | 与 KMP 等价，实现略不同 |

### 9.2 多模式匹配算法对比

| 算法 | 预处理 | 匹配 | 适用场景 |
|------|--------|------|---------|
| 逐个 KMP | O(Σm_i) | O(k × n) | 模式数少（<5） |
| AC 自动机 | O(Σm_i) | O(n + 匹配数) | 大规模多模式匹配 |
| Rabin-Karp 集合 | O(Σm_i) | O(n × k) 最坏 | 等长多模式 |

### 9.3 何时选择哪个算法

- **短文本 + 短模式**：朴素即可，开销小于构建前缀函数
- **长文本 + 单模式**：KMP（确定性）或 Boyer-Moore（实际更快）
- **流式输入**：KMP 自动机（DFA）
- **需要前缀查询/自动补全**：Trie
- **多模式同时匹配**：AC 自动机
- **子串判重/哈希比较**：Rabin-Karp / 字符串哈希
- **所有子串问题**：后缀数组 / 后缀自动机

---

## 十、工程实践与应用场景

### 10.1 iOS/macOS 中的字符串匹配

1. **`NSString rangeOfString:options:`**：Foundation 框架内部使用优化的 Boyer-Moore 变体
2. **正则引擎**：`NSRegularExpression` 底层是 ICU 正则引擎，复杂模式可能回溯爆炸
3. **搜索建议**：UISearchBar + Trie 实现快速前缀匹配
4. **富文本高亮**：KMP 找到所有匹配后，用 `NSAttributedString` 添加高亮属性

```swift
/// iOS 搜索高亮示例
import UIKit

extension NSAttributedString {
    static func highlighted(text: String, pattern: String, highlightColor: UIColor = .systemYellow) -> NSAttributedString {
        let attributed = NSMutableAttributedString(string: text)
        let positions = KMP.search(text: text, pattern: pattern)
        for pos in positions {
            let range = NSRange(location: pos, length: pattern.count)
            attributed.addAttribute(.backgroundColor, value: highlightColor, range: range)
        }
        return attributed
    }
}
```

### 10.2 网络安全：入侵检测

IDS/IPS 系统（如 Snort）使用 AC 自动机同时匹配数千条攻击特征签名。网络数据包逐字节通过自动机，一旦命中某个模式就触发告警。

### 10.3 生物信息学：DNA 序列分析

DNA 序列（字符集 {A, C, G, T}）中搜索特定基因片段。序列长度可达数十亿碱基对，高效匹配算法至关重要。

### 10.4 编译器：词法分析

编译器前端的词法分析器本质上是多模式匹配——识别关键字、标识符、运算符等 token。通常编译为 DFA 状态机。

### 10.5 搜索引擎：倒排索引 + 前缀补全

- 倒排索引：对文档分词后建立 term → docList 映射
- 查询自动补全：Trie 或 Ternary Search Tree 支持前缀查询
- 拼写纠错：编辑距离 + Trie 剪枝

### 10.6 文本编辑器：查找与替换

VS Code、Xcode 等编辑器的"查找"功能，对于纯文本搜索使用 Boyer-Moore-Horspool 变体，正则搜索使用 NFA/DFA 引擎。

### 10.7 数据库：LIKE 查询优化

MySQL 的 `LIKE 'prefix%'` 可以利用 B+Tree 索引（本质是前缀匹配）。`LIKE '%substring%'` 则需全表扫描或使用全文索引（倒排索引）。

---

## 十一、Z 函数（Z-Algorithm）

### 11.1 定义

Z 函数 `z[i]` = 字符串 S 从位置 i 开始的子串与 S 本身的最长公共前缀长度。即 S[i..i+z[i]-1] = S[0..z[i]-1]。

约定 z[0] = 0（或 n，取决于定义）。

### 11.2 与 KMP 的关系

Z 函数和前缀函数可以互相转化，两者表达的信息等价。对于字符串匹配：
- 构造 `P + "$" + T`（$ 是分隔符），计算 Z 函数
- 若 z[i] = m（模式长度），则 T 中位置 i - m - 1 有匹配

### 11.3 实现

```swift
/// Z 函数（Z-Algorithm）
/// z[i] = S[i..] 与 S 的最长公共前缀长度
/// - 时间复杂度：O(n)
/// - 空间复杂度：O(n)
func zFunction(_ s: String) -> [Int] {
    let chars = Array(s)
    let n = chars.count
    guard n > 0 else { return [] }
    
    var z = [Int](repeating: 0, count: n)
    var l = 0, r = 0  // [l, r) 是当前匹配最远的 Z-box
    
    for i in 1..<n {
        if i < r {
            z[i] = min(r - i, z[i - l])
        }
        while i + z[i] < n && chars[z[i]] == chars[i + z[i]] {
            z[i] += 1
        }
        if i + z[i] > r {
            l = i
            r = i + z[i]
        }
    }
    return z
}

/// 使用 Z 函数进行字符串匹配
func zSearch(text: String, pattern: String) -> [Int] {
    let combined = pattern + "$" + text
    let z = zFunction(combined)
    let m = pattern.count
    var result: [Int] = []
    for i in (m + 1)..<combined.count {
        if z[i] == m {
            result.append(i - m - 1)
        }
    }
    return result
}
```

### 11.4 Objective-C 实现

```objectivec
/// Z 函数
+ (NSArray<NSNumber *> *)zFunctionForString:(NSString *)s {
    NSInteger n = s.length;
    if (n == 0) return @[];
    
    unichar *chars = (unichar *)malloc(sizeof(unichar) * n);
    [s getCharacters:chars range:NSMakeRange(0, n)];
    
    NSMutableArray<NSNumber *> *z = [NSMutableArray arrayWithCapacity:n];
    for (NSInteger i = 0; i < n; i++) [z addObject:@0];
    
    NSInteger l = 0, r = 0;
    for (NSInteger i = 1; i < n; i++) {
        NSInteger val = 0;
        if (i < r) {
            val = MIN(r - i, [z[i - l] integerValue]);
        }
        while (i + val < n && chars[val] == chars[i + val]) {
            val++;
        }
        z[i] = @(val);
        if (i + val > r) {
            l = i;
            r = i + val;
        }
    }
    
    free(chars);
    return [z copy];
}
```

---

## 十二、面试高频题详解

### 面试题 1：KMP 前缀函数的时间复杂度为什么是 O(m)？

**答案要点**：使用势能分析。令势能 Φ = k（当前匹配长度）。外层 for 循环 m-1 次，每次 k 最多增加 1（总增量 ≤ m-1），while 中 k 每次至少减少 1，而 k 不会为负，所以 while 总执行次数 ≤ m-1。因此总操作 ≤ 2(m-1) = O(m)。

### 面试题 2：Trie 相比 HashMap 有什么优劣？

**答案要点**：
- 优势：天然支持前缀查询 O(L)、字典序遍历、最长公共前缀查询；无哈希冲突
- 劣势：空间可能更大（尤其字符集大时）；缓存不友好（指针跳转多）；对等长、无前缀关系的字符串集合，HashMap 更紧凑

### 面试题 3：AC 自动机和 KMP 的关系？

**答案要点**：AC 自动机 = Trie + Fail 指针，是 KMP 在多模式上的自然推广。KMP 的 π 函数是单串上的"最长前后缀匹配"，AC 的 fail 指针是 Trie 上的"最长后缀匹配到另一个模式的前缀"。两者本质都是利用已匹配信息避免回退文本指针。

### 面试题 4：Rabin-Karp 最坏为何是 O(nm)？如何改善？

**答案要点**：最坏情况在所有位置都哈希匹配（假阳性），每次需 O(m) 确认。极端例子：text = "aaaa...a"，pattern = "aaaa...a"（哈希永远相等）。改善方法：双哈希将冲突概率降至 1/mod² ≈ 10^-18；或选择随机化基数/模数使对手无法构造恶意输入。

### 面试题 5：如何用 Trie 实现 T9 键盘输入预测？

**答案要点**：T9 键盘每个数字键对应 3-4 个字母。将字典中的单词按其 T9 键序列（如 "hello" → "43556"）插入 Trie。用户输入数字序列时，在 Trie 中查找前缀，返回所有匹配单词（按频率排序）。

### 面试题 6：解释 Boyer-Moore 为什么实际比 KMP 快？

**答案要点**：Boyer-Moore 从模式串尾部开始比较。当失配时，利用"坏字符规则"和"好后缀规则"可以跳过大量位置。对于自然语言文本（字符集大），平均每次比较可跳过约 m/Σ 个位置（Σ=字符集大小），最好情况为 O(n/m)——亚线性！而 KMP 最好也只能 O(n)。但 Boyer-Moore 最坏是 O(nm)（虽然 Galil 变体可以做到 O(n)）。

### 面试题 7：给定一个长字符串，如何快速判断某个子串是否出现过？

**答案要点**：
1. **字符串哈希**：预计算前缀哈希数组，O(1) 得到任意子串哈希，放入 HashSet。查询 O(L)。
2. **后缀数组 + 二分**：构建后缀数组后，二分查找目标串。预处理 O(n log n)，查询 O(m log n)。
3. **后缀自动机**：O(n) 预处理，O(m) 查询。

### 面试题 8：字符串匹配在 iOS 开发中有哪些实际应用？

**答案要点**：
1. 搜索功能：UISearchBar 实时搜索用 Trie 前缀匹配
2. 富文本高亮：KMP 找位置 + NSAttributedString 渲染
3. 正则验证：邮箱/手机号格式（NSRegularExpression，底层 NFA/DFA）
4. URL Router：Trie 变体匹配 URL Path（如 JLRoutes）
5. 输入法候选词：Trie + 频率排序
6. 内容审核：AC 自动机过滤违规词
7. 代码补全：Xcode 的 Code Completion 使用前缀树索引符号表

---

## 十三、易错点与最佳实践

### 13.1 常见错误

1. **KMP 前缀函数下标错误**：π 数组从 1 开始计算，但失配跳转用 `π[j-1]`，不是 `π[j]`。许多实现中 j 代表"已匹配长度"，回退时取 `π[j-1]`。

2. **Trie 内存泄漏（OC）**：使用 strong 引用的子节点字典，删除时需要递归清理或依赖 ARC 引用计数。大规模 Trie 注意内存峰值。

3. **Rabin-Karp 溢出**：不加 mod 直接计算哈希值会溢出。Swift 的 `&*` `&+` 可以防止崩溃但产生错误结果。必须在每一步取模。

4. **AC 自动机 fail 指针自环**：构建 fail 时若 `child.fail = child` 会死循环。需要特判。

5. **字符编码问题**：NSString 使用 UTF-16 编码，emoji 等字符占多个 unichar。直接用 `characterAtIndex:` 处理会出错。应使用 `enumerateSubstringsInRange:options:NSStringEnumerationByComposedCharacterSequences` 或 Swift 的 `Character`。

6. **空串边界**：pattern 为空时应返回什么？不同题目定义不同（有的返回 0，有的返回 -1）。一定要处理 m=0 的情况。

### 13.2 最佳实践

1. **选择合适算法**：短模式用朴素，长文本 + 长模式用 KMP/BM，多模式用 AC，需要前缀操作用 Trie。不要过度工程化。

2. **前缀哈希数组优于逐窗口 Rabin-Karp**：如果需要查询多个不同子串，预计算前缀哈希数组一劳永逸。

3. **Trie 的空间优化**：
   - 小字符集（如 26 字母）用固定大小数组代替 HashMap
   - 字符串很多前缀相同时，压缩 Trie（Radix Tree）显著省空间
   - 可用对象池/数组模拟节点避免大量 alloc

4. **KMP 的实际使用**：工程中如果只需一次搜索，语言标准库已经足够好（Swift 的 `range(of:)`、OC 的 `rangeOfString:`）。KMP 在需要自定义匹配逻辑（如忽略大小写但不想生成新字符串）或流式场景中才需要手写。

5. **双哈希 vs 单哈希**：竞赛中建议使用双哈希避免被 hack。工程中单哈希（模数选 2^61 - 1 这样的梅森素数）通常足够。

6. **Unicode 正确性**：处理中文、emoji 等多字节字符时，确保是以"字符"而非"字节"或"码元"为单位操作。Swift 的 String 天然按 grapheme cluster 迭代，安全性好；OC 需要额外注意。

---

## 十四、知识图谱总结

```
                        字符串匹配
                      /     |      \
                单模式     多模式     数据结构
               /  |  \      |        /    \
          朴素 KMP  RK   AC自动机  Trie  后缀数组/SAM
               |    |      |        |
          前缀函数 滚动哈希  Trie+Fail  前缀树
               |                    |
          KMP自动机              位Trie/压缩Trie
               |
          最小循环节

关键联系：
- KMP 的 π 函数 ↔ Z 函数（互相转化）
- AC 自动机 = KMP 的多模式推广 = Trie + Fail 指针
- Rabin-Karp ↔ 字符串哈希（前缀哈希数组是其推广）
- 后缀数组 ↔ 后缀自动机（不同表示，解决同类问题）
- Trie ↔ DFA（Trie 是特殊的 DFA）
```

### 核心洞察

1. **避免重复比较**：KMP 利用前缀函数跳过不可能的位置；Boyer-Moore 利用失配信息跳过多个位置；AC 自动机利用 fail 链共享前缀信息。

2. **空间换时间**：Trie 用 O(NΣ) 空间换来 O(L) 的查找；后缀数组/SAM 用 O(n) 空间支持 O(m) 子串查找。

3. **预处理的威力**：花 O(m) 或 O(n) 预处理，后续每次查询从 O(nm) 降到 O(n) 或 O(m)。这就是"用已知信息消除未来的重复计算"。

4. **哈希的概率性**：Rabin-Karp 和字符串哈希是概率正确的（存在极小误判概率），但实现简单、扩展性好（多维匹配、子串去重）。

---

## 十五、延伸阅读

- *Introduction to Algorithms (CLRS)* Chapter 32: String Matching
- *Algorithms (Sedgewick)* 5.3: Substring Search
- *CP-algorithms.com*: String Processing 系列（prefix function, Z-function, suffix array, aho-corasick）
- Knuth D.E., Morris J.H., Pratt V.R. "Fast Pattern Matching in Strings" (1977)
- Aho A.V., Corasick M.J. "Efficient String Matching: An Aid to Bibliographic Search" (1975)
