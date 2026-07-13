# Swift 并发新模型详解（async/await、Actor、Sendable）

## 一、为什么需要新的并发模型

GCD（Grand Central Dispatch）和 OperationQueue 服务了 iOS 开发者十多年，但它们有几个根本性问题：

**回调地狱**。异步操作通过闭包回调串联，多层嵌套导致代码可读性极差、错误处理分散。

```swift
// 传统回调方式
fetchUser { result in
    switch result {
    case .success(let user):
        fetchPosts(userId: user.id) { result in
            switch result {
            case .success(let posts):
                fetchComments(postId: posts[0].id) { result in
                    // 无尽嵌套...
                }
            case .failure(let error): print(error)
            }
        }
    case .failure(let error): print(error)
    }
}
```

**竞态条件难以避免**。GCD 不提供数据竞争保护，开发者需要手动加锁，容易遗漏。

**取消语义缺失**。GCD 任务一旦提交就无法取消，`DispatchWorkItem` 的 cancel 只能阻止未执行的任务。

**线程爆炸**。多层嵌套 dispatch_async 可能创建过多线程，每线程占用 512KB-1MB 栈空间。

Swift 5.5 引入的 async/await + Actor + Structured Concurrency 从语言层面解决了这些问题。

## 二、async/await

### 2.1 基本语法

```swift
func fetchUser() async throws -> User {
    let (data, _) = try await URLSession.shared.data(from: url)
    return try JSONDecoder().decode(User.self, from: data)
}

// 调用
Task {
    do {
        let user = try await fetchUser()
        print(user.name)
    } catch {
        print("Error: \(error)")
    }
}
```

`async` 标记函数为异步函数，`await` 标记暂停点。在 `await` 处，当前线程被释放（不阻塞），函数可以挂起等待结果。挂起期间线程可以执行其他任务，提高资源利用率。

### 2.2 顺序与并发

默认是顺序执行，每个 await 等待前一个完成：

```swift
// 顺序执行，总时间 = 时间A + 时间B
let user = try await fetchUser()
let posts = try await fetchPosts(userId: user.id)

// 并发执行，总时间 = max(时间A, 时间B)
async let user = fetchUser()
async let posts = fetchPosts(userId: userId)
let (u, p) = try await (user, posts)
```

### 2.3 Task Group

`async let` 适合固定数量的并发任务。对于动态数量的并发，使用 Task Group：

```swift
func fetchAllProfiles(ids: [String]) async throws -> [Profile] {
    try await withThrowingTaskGroup(of: Profile.self) { group in
        for id in ids {
            group.addTask {
                try await fetchProfile(id: id)
            }
        }

        var results: [Profile] = []
        for try await profile in group {
            results.append(profile)
        }
        return results
    }
}
```

Task Group 保证：所有子任务完成后父任务才完成（结构化并发），子任务的取消会传播到所有兄弟任务，子任务的错误会取消整个组。

### 2.4 并发转换

```swift
// 从回调 API 包装为 async
func fetchImage(url: URL) async throws -> UIImage {
    try await withCheckedThrowingContinuation { continuation in
        URLSession.shared.dataTask(with: url) { data, _, error in
            if let error = error {
                continuation.resume(throwing: error)
            } else if let data = data, let image = UIImage(data: data) {
                continuation.resume(returning: image)
            } else {
                continuation.resume(throwing: URLError(.badServerResponse))
            }
        }.resume()
    }
}
```

`withCheckedThrowingContinuation` 将回调式 API 桥接为 async/await。注意 continuation 必须且只能 resume 一次。

## 三、Actor

### 3.1 数据竞争问题

```swift
// 经典数据竞争
class Counter {
    var count = 0
    func increment() {
        count += 1  // 非原子操作：读-改-写
    }
}

// 多线程调用 counter.increment() 可能丢失更新
```

传统方案是加锁（NSLock、dispatch_queue、os_unfair_lock），但容易遗漏或死锁。

### 3.2 Actor 声明

Actor 是一种引用类型，编译器自动对其可变状态进行隔离保护：

```swift
actor Counter {
    var count = 0

    func increment() {
        count += 1
    }

    func value() -> Int {
        count
    }
}

// 调用
let counter = Counter()
Task {
    await counter.increment()  // 必须用 await
    let v = await counter.value()
    print(v)
}
```

Actor 的核心规则：从 Actor 外部访问其属性或方法必须用 `await`。编译器在编译期检查这条规则。Actor 内部的方法调用不需要 `await`。

### 3.3 Actor 隔离模型

Actor 使用协作式调度——同一时刻只有一个任务在 Actor 内部执行。不需要锁，不会死锁，编译器保证。

```swift
actor BankAccount {
    let id: String
    private(set) var balance: Double

    init(id: String, balance: Double) {
        self.id = id
        self.balance = balance
    }

    func deposit(_ amount: Double) {
        balance += amount
    }

    func withdraw(_ amount: Double) -> Bool {
        guard balance >= amount else { return false }
        balance -= amount
        return true
    }
}
```

### 3.4 nonisolated

某些属性或方法不需要隔离保护，可以用 `nonisolated` 标记：

```swift
actor BankAccount {
    let id: String  // let 属性自动 nonisolated

    nonisolated var description: String { "Account \(id)" }

    nonisolated func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// 可以直接访问，不需要 await
print(account.description)
```

`let` 属性天然安全（不可变），编译器自动视为 `nonisolated`。遵循 `Hashable`、`Equatable` 的方法通常需要 `nonisolated`。

### 3.5 MainActor

`@MainActor` 是一个特殊的 Actor，代表主线程。UI 操作必须在主线程执行：

```swift
@MainActor
class ViewModel: ObservableObject {
    @Published var data: [Item] = []

    func refresh() async {
        let items = try await fetchItems()  // 后台执行
        data = items  // 自动在主线程更新
    }
}
```

标记 `@MainActor` 的类型，其所有方法都在主线程执行。从非主线程调用时需要 `await`。

### 3.6 Global Actor

可以定义全局 Actor，为跨类型的隔离提供统一约束：

```swift
@globalActor
struct MyActor {
    actor MyActorInstance {}
    static let shared = MyActorInstance()
}

@MyActor
class MyService {
    func doWork() { /* 隔离在 MyActor 中 */ }
}
```

## 四、Sendable

### 4.1 什么是 Sendable

`Sendable` 是一个标记协议（Marker Protocol），表示类型可以安全地跨并发域传递（即跨 Actor 边界）。编译器在编译期检查 Sendable 约束。

```swift
// 值类型且只包含 Sendable 属性 → 自动 Sendable
struct User: Sendable {
    let id: UUID
    let name: String
}

// 引用类型需要显式声明并确保线程安全
final class ThreadSafeCache: Sendable {
    private let storage: NSLock<[String: String]> = .init([:])
    // ... 线程安全实现
}
```

### 4.2 Sendable 检查

```swift
// 编译错误：MutableUser 不是 Sendable，因为它有可变属性
struct MutableUser {
    var name: String
}

actor DataStore {
    func save(_ user: MutableUser) async {
        // 编译警告：跨 Actor 传递 non-Sendable 类型
    }
}
```

### 4.3 @unchecked Sendable

当你确认类型线程安全但编译器无法自动推断时，用 `@unchecked Sendable`：

```swift
final class LockedBox<T>: @unchecked Sendable {
    private var _value: T
    private let lock = NSLock()

    init(_ value: T) { self._value = value }

    var value: T {
        lock.lock()
        defer { lock.unlock() }
        return _value
    }
}
```

使用 `@unchecked Sendable` 要非常谨慎，必须自行保证线程安全。

## 五、Structured Concurrency（结构化并发）

### 5.1 核心原则

结构化并发要求：子任务的生命周期不能超出父任务。父任务在退出前必须等待所有子任务完成。这意味着任务之间形成严格的树形结构，取消和错误会沿树传播。

### 5.2 Task

```swift
// 非结构化任务（脱离当前上下文）
Task {
    let result = try await someWork()
    print(result)
}

// Task with priority
Task(priority: .userInitiated) {
    // 高优先级任务
}
```

### 5.3 Task 取消

```swift
let task = Task {
    for i in 0..<1000 {
        try Task.checkCancellation()  // 检查取消
        await process(i)
    }
}

// 取消
task.cancel()
```

`Task.checkCancellation()` 在任务被取消时抛出 `CancellationError`。也可以用 `Task.isCancelled` 检查但不抛出。

### 5.4 Task Timeout

```swift
func withTimeout<T: Sendable>(
    seconds: TimeInterval,
    operation: @Sendable @escaping () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw URLError(.timedOut)
        }
        let result = try await group.next()!  // 第一个完成
        group.cancelAll()  // 取消另一个
        return result
    }
}
```

### 5.5 AsyncSequence

```swift
for try await event in eventStream {
    handle(event)
}
```

`AsyncSequence` 是异步版的 `Sequence`。常见实现：`URLSession.bytes`、`AsyncStream`、Notification 监听等。

```swift
// 自定义 AsyncStream
let stream = AsyncStream<Int> { continuation in
    for i in 0..<10 {
        continuation.yield(i)
    }
    continuation.finish()
}

for await num in stream {
    print(num)
}
```

## 六、实际应用模式

### 6.1 并发数据加载

```swift
func loadDashboard() async throws -> Dashboard {
    async let profile = fetchProfile()
    async let notifications = fetchNotifications()
    async let stats = fetchStats()

    return Dashboard(
        profile: try await profile,
        notifications: try await notifications,
        stats: try await stats
    )
}
```

### 6.2 Actor 作为状态管理器

```swift
actor ImageCache {
    private var cache: [URL: UIImage] = [:]
    private var inflight: [URL: Task<UIImage, Error>] = [:]

    func image(for url: URL) async throws -> UIImage {
        if let cached = cache[url] { return cached }
        if let task = inflight[url] { return try await task.value }

        let task = Task { try await downloadImage(url: url) }
        inflight[url] = task
        defer { inflight[url] = nil }

        let image = try await task.value
        cache[url] = image
        return image
    }
}
```

### 6.3 与 GCD 互操作

```swift
// GCD → async
func legacyAsyncWork() async -> String {
    await withCheckedContinuation { continuation in
        DispatchQueue.global().async {
            let result = expensiveComputation()
            continuation.resume(returning: result)
        }
    }
}

// async → GCD
func legacyCallback(completion: @escaping (String) -> Void) {
    Task {
        let result = try await modernAsyncWork()
        completion(result)
    }
}
```

## 七、Swift 6 严格并发检查

### 7.1 并发检查模式

Swift 6 将并发检查从 opt-in 警告升级为编译错误。通过 `SwiftLanguageMode` 设置：

- **Swift 5 模式**：并发问题产生警告
- **Swift 6 模式**：并发问题产生错误

### 7.2 迁移策略

逐步迁移：先用 `@preconcurrency` 标记暂时无法满足 Sendable 的接口，逐步为类型添加 `Sendable` 一致性，将共享状态迁移到 Actor。

```swift
// 暂时抑制跨模块的 Sendable 检查
@preconcurrency import LegacyModule
```

### 7.3 常见迁移问题

全局可变状态：全局 `var` 在 Swift 6 中报错。迁移方案：包装为 Actor 或使用 `Mutex`/`OSAllocatedUnfairLock`。

@Sendable 闭包捕获：闭包捕获的变量必须 Sendable。注意 `self` 捕获——如果 `self` 是引用类型且非 Sendable，需要重构。

MainActor 假设：Swift 6 更严格地推断 MainActor 上下文。`@MainActor` 标注不完整会导致编译错误。完整的 `@MainActor` 标注（类级别）通常能解决大部分问题。

## 八、性能与最佳实践

避免在 Actor 中执行长时间阻塞操作——Actor 是协作式调度，阻塞会卡住所有等待该 Actor 的任务。CPU 密集型任务应放在 Task Group 中执行，只将状态访问交给 Actor。

优先使用值类型减少跨域传递的同步开销。值类型的拷贝语义天然安全，不需要 Actor 隔离。

`AsyncSequence` 的遍历是串行的——如果需要并发处理元素，用 Task Group 而非 `for await` 循环。

`Task.detached` 会创建脱离当前 Actor 上下文的任务，但继承优先级。尽量少用 `detached`，除非确实需要脱离当前执行上下文。大多数场景用 `Task { }` 即可，它会继承当前 Actor 上下文。
