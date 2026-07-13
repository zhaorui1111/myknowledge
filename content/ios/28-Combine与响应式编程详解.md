# Combine 与响应式编程详解

## 一、响应式编程核心思想

响应式编程（Reactive Programming）是一种面向数据流和变化传播的编程范式。在命令式编程中，你主动轮询或回调获取数据变化；在响应式编程中，你声明数据流的依赖关系，当源数据变化时，所有依赖自动更新。

Combine 是 Apple 在 iOS 13 推出的响应式框架，提供了类似 RxSwift/RAC 的能力，但作为系统框架原生集成，无需第三方依赖。

核心概念可以用一条流水线理解：发布者（Publisher）产生数据流 → 操作符（Operator）变换/过滤/组合数据 → 订阅者（Subscriber）消费最终结果。

## 二、Publisher（发布者）

### 2.1 Publisher 协议

```swift
public protocol Publisher {
    associatedtype Output    // 产生的数据类型
    associatedtype Failure : Error  // 错误类型

    func receive<S>(subscriber: S) where S : Subscriber, Self.Failure == S.Failure, Self.Output == S.Input
}
```

Publisher 有两个关键关联类型：`Output`（输出的成功值类型）和 `Failure`（错误类型）。`Failure` 为 `Never` 表示不会失败。

### 2.2 常用内置 Publisher

```swift
// Just：发送单个值然后完成
Just("Hello")
    .sink { value in print(value) }

// Future：发送单个值（异步产生），适合桥接回调
Future<String, Error> { promise in
    fetchData { result in
        switch result {
        case .success(let value): promise(.success(value))
        case .failure(let error): promise(.failure(error))
        }
    }
}

// PassthroughSubject：手动控制发送，无初始值
let subject = PassthroughSubject<String, Never>()
subject.send("A")
subject.send("B")

// CurrentValueSubject：带初始值的 Subject
let countSubject = CurrentValueSubject<Int, Never>(0)
countSubject.send(1)
countSubject.value = 2  // 也可直接赋值
```

### 2.3 Subject

Subject 是一种特殊的 Publisher，可以手动调用 `send()` 注入值。它桥接了命令式世界和响应式世界。

`PassthroughSubject` 像一个管道，当前没有值，新订阅者不会收到历史数据。`CurrentValueSubject` 保留当前值，新订阅者会立即收到当前值。

## 三、Operator（操作符）

操作符是 Combine 的核心威力所在。每个操作符返回一个新的 Publisher，可以链式调用。

### 3.1 变换类

```swift
// map：变换值
[1, 2, 3].publisher
    .map { $0 * 2 }
    .sink { print($0) }  // 2, 4, 6

// flatMap：将每个值映射为新 Publisher 并合并
urlPublisher
    .flatMap { url in URLSession.shared.dataTaskPublisher(for: url) }
    .sink { completion, data in }

// scan：累积值（类似 reduce）
[1, 2, 3].publisher
    .scan(0) { $0 + $1 }
    .sink { print($0) }  // 1, 3, 6

// collect：收集为数组
[1, 2, 3].publisher
    .collect()
    .sink { print($0) }  // [1, 2, 3]
```

### 3.2 过滤类

```swift
// filter：条件过滤
[1, 2, 3, 4, 5].publisher
    .filter { $0 % 2 == 0 }
    .sink { print($0) }  // 2, 4

// removeDuplicates：去重
[1, 1, 2, 2, 3].publisher
    .removeDuplicates()
    .sink { print($0) }  // 1, 2, 3

// compactMap：过滤 nil 并解包
["1", "abc", "3"].publisher
    .compactMap { Int($0) }
    .sink { print($0) }  // 1, 3
```

### 3.3 时间控制类

```swift
// debounce：去抖动，停止变化后等待指定时间才发送
textField.publisher
    .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
    .sink { searchText in search(query: searchText) }

// throttle：节流，固定间隔发送最新值
scrollPublisher
    .throttle(for: .milliseconds(100), scheduler: RunLoop.main, latest: true)
    .sink { offset in updateHeader(offset) }
```

### 3.4 组合类

```swift
// combineLatest：合并两个 Publisher，任一发送新值时组合最新值
namePublisher
    .combineLatest(agePublisher)
    .sink { (name, age) in print("\(name), \(age)") }

// merge：交错合并多个同类型流
// zip：配对合并，等待两边都有值
// switchToLatest：切换到最新的内部 Publisher
```

### 3.5 错误处理类

```swift
// catchError：捕获错误并切换到备用 Publisher
fetchData()
    .catch { error in Just(cachedData) }  // 出错时返回缓存数据
    .sink { data in print(data) }

// retry：重试 N 次
urlSession.dataTaskPublisher(for: url)
    .retry(3)
    .sink(...)
```

## 四、Subscriber（订阅者）

### 4.1 sink

`sink` 是最常用的订阅方式，提供两个闭包：完成回调和值回调：

```swift
let cancellable = publisher
    .sink(
        receiveCompletion: { completion in
            switch completion {
            case .finished: print("Done")
            case .failure(let error): print("Error: \(error)")
            }
        },
        receiveValue: { value in
            print("Received: \(value)")
        }
    )
```

### 4.2 assign

`assign` 将 Publisher 的输出绑定到对象的属性：

```swift
publisher
    .assign(to: \.text, on: label)
```

注意 `assign(to:on:)` 要求 Publisher 的 Failure 为 `Never`（不会失败），否则错误无处处理。

### 4.3 Cancellable

每个订阅返回一个 `AnyCancellable`。当它被 deinit 时，订阅自动取消。通常需要存储在属性中保持订阅活跃：

```swift
class ViewModel {
    private var cancellables = Set<AnyCancellable>()

    init() {
        publisher
            .sink { ... }
            .store(in: &cancellables)
    }
}
```

忘记存储 `AnyCancellable` 会导致订阅立即取消——这是最常见的 Combine bug。

## 五、Combine 与属性包装器

### 5.1 @Published

```swift
class ViewModel: ObservableObject {
    @Published var query: String = ""

    init() {
        $query  // $ 前缀访问 Publisher
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { query in
                // 搜索逻辑
            }
            .store(in: &cancellables)
    }
}
```

`@Published` 自动合成一个 Publisher（通过 `$` 前缀访问），在 `willSet` 时发送新值。

### 5.2 Combine 与 SwiftUI

```swift
class DataModel: ObservableObject {
    @Published var items: [Item] = []

    func load() {
        URLSession.shared.dataTaskPublisher(for: url)
            .map { $0.data }
            .decode(type: [Item].self, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] items in self?.items = items }
            )
            .store(in: &cancellables)
    }
}
```

## 六、Scheduler（调度器）

```swift
publisher
    .subscribe(on: DispatchQueue.global())  // 订阅在后台线程
    .receive(on: DispatchQueue.main)         // 接收在主线程
    .sink { value in
        // 在主线程更新 UI
    }
```

`subscribe(on:)` 影响上游 Publisher 的执行线程。`receive(on:)` 影响下游操作符和订阅者的执行线程。可以在链中多次使用 `receive(on:)` 切换线程。

## 七、实战模式

### 7.1 搜索框防抖

```swift
$searchText
    .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
    .removeDuplicates()
    .filter { !$0.isEmpty }
    .flatMap { query -> AnyPublisher<[SearchResult], Never> in
        searchAPI(query: query)
            .map { $0.results }
            .replaceError(with: [])
            .eraseToAnyPublisher()
    }
    .receive(on: DispatchQueue.main)
    .assign(to: \.searchResults, on: self)
```

### 7.2 多请求并发

```swift
Publishers.Zip3(
    fetchProfile(),
    fetchOrders(),
    fetchRecommendations()
)
.sink { (profile, orders, recommendations) in
    // 三个结果同时到达
}
```

### 7.3 轮询

```swift
Timer.publish(every: 30, on: .main, in: .common)
    .autoconnect()
    .flatMap { _ in fetchStatus() }
    .sink { status in updateUI(status) }
```

### 7.4 链式请求

```swift
fetchToken()
    .flatMap { token -> AnyPublisher<User, Error> in
        fetchUser(token: token).eraseToAnyPublisher()
    }
    .sink(
        receiveCompletion: { _ in },
        receiveValue: { user in print(user) }
    )
```

## 八、Combine vs RxSwift vs async/await

Combine 和 RxSwift 是同一范式（响应式扩展 ReactiveX），API 命名不同但概念一一对应。Combine 的优势是系统集成、无第三方依赖；RxSwift 的优势是跨平台一致性、社区生态更丰富。

async/await 解决的是异步控制流问题，而非数据流问题。对于事件流（持续多次发送的数据），Combine 仍然是更合适的工具。对于一次性异步操作（请求-响应），async/await 更直观。

实践中两者配合使用：用 async/await 处理一次性请求，用 Combine 处理持续事件流（用户输入、传感器数据、WebSocket 消息等）。

## 九、内存管理与常见陷阱

循环引用：`sink` 闭包捕获 `self` 会造成循环引用（如果 `AnyCancellable` 存在 `self` 上）。使用 `[weak self]` 打断。

时序问题：`@Published` 在 `willSet` 时发送值，订阅者在属性实际变化前收到通知。如果需要 `didSet` 时机，需要自定义 Publisher。

线程安全：Combine 不保证线程安全。如果 Publisher 可能在多线程发送值，需要用 `receive(on:)` 确保在预期线程接收。

Backpressure（背压）：Combine 采用 pull 模型——Subscriber 通过 `Demand` 控制接收多少值。但 `sink` 和 `assign` 会请求无限需求，可能在高频率场景下造成内存压力。可以用 `buffer` 操作符控制缓冲。
