# SwiftUI 与声明式 UI 详解

## 一、从命令式到声明式

传统的 UIKit 开发是命令式（Imperative）的：你创建视图、设置属性、添加约束、手动管理状态同步。SwiftUI 彻底转变为声明式（Declarative）：你描述界面在各个状态下的样子，框架负责根据状态变化自动更新界面。

```swift
// UIKit 命令式
let label = UILabel()
label.text = "Hello"
label.textColor = .red
view.addSubview(label)

// SwiftUI 声明式
struct ContentView: View {
    var body: some View {
        Text("Hello")
            .foregroundColor(.red)
    }
}
```

命令式中"怎么做"的步骤由开发者控制，声明式中"做什么"的描述由开发者给出，"怎么做"的执行由框架接管。这带来了几个根本变化：状态是数据的函数（`view = f(state)`），UI 更新自动完成，不需要手动调用 `setNeedsLayout` 或 `reloadData`。

## 二、View 协议与构建器

### 2.1 View 协议

所有 SwiftUI 视图都遵循 `View` 协议，核心只需实现 `body` 计算属性：

```swift
struct ContentView: View {
    var body: some View {
        Text("Hello, World!")
    }
}
```

`body` 的返回类型是 `some View`——不透明返回类型（Opaque Return Type）。这意味着"返回某种遵循 View 协议的具体类型，但调用方不需要知道具体是哪种"。编译器在编译期就知道确切类型，因此能生成高效的 diff 算法，同时对外隐藏实现细节。

### 2.2 ViewBuilder

`@ViewBuilder` 允许用 `if-else` 等控制流语法在 `body` 中组合多个视图。它本质上是一个结果构建器（Result Builder），将多个表达式收集并组合为 `TupleView` 或 `_ConditionalContent`：

```swift
struct ConditionalView: View {
    var isLoggedIn: Bool

    var body: some View {
        if isLoggedIn {
            ProfileView()
        } else {
            LoginView()
        }
    }
}
```

注意 `if-else` 产生的是 `_ConditionalContent<ProfileView, LoginView>`，两分支必须都存在。Swift 5.9+ 支持 `if #available` 在 ViewBuilder 中使用，但 `switch` 在早期版本中有限制，Swift 5.10 后完整支持。

### 2.3 Never 与 EmptyView

如果视图不需要渲染内容，可以用 `EmptyView`。某些 ViewBuilder 场景下，`Never` 类型会被自动映射为 `EmptyView`。

## 三、状态管理

SwiftUI 的状态管理是核心难点，关键在于理解四种属性包装器的适用场景。

### 3.1 @State

`@State` 用于视图内部的简单值类型状态。SwiftUI 会在存储层管理这个值，当值变化时自动触发视图重新计算。

```swift
struct CounterView: View {
    @State private var count = 0

    var body: some View {
        VStack {
            Text("Count: \(count)")
            Button("Increment") { count += 1 }
        }
    }
}
```

`@State` 应标记为 `private`，因为它是视图的内部实现细节。存储实际不在结构体实例中——SwiftUI 将其持久化在框架管理的特殊存储区，即使结构体被重建，状态值也保持。

### 3.2 @Binding

`@Binding` 创建对某个状态的引用，用于父子视图之间的双向数据传递：

```swift
struct ChildView: View {
    @Binding var count: Int

    var body: some View {
        Button("Count: \(count)") { count += 1 }
    }
}

struct ParentView: View {
    @State private var count = 0
    var body: some View {
        ChildView(count: $count)
    }
}
```

`$` 前缀创建一个 `Binding`，传递的是引用而非拷贝。`@Binding` 不拥有数据，只是读写代理。

### 3.3 @ObservedObject 与 @StateObject

当状态是引用类型（class）且需要被多个视图共享时，使用 `ObservableObject` 协议 + `@Published` 属性包装器：

```swift
class UserModel: ObservableObject {
    @Published var name: String = ""
    @Published var age: Int = 0
}

struct ProfileView: View {
    @StateObject var user = UserModel()  // 视图拥有并创建

    var body: some View {
        ChildProfileView(user: user)
    }
}

struct ChildProfileView: View {
    @ObservedObject var user: UserModel  // 视图接收但不拥有

    var body: some View {
        Text(user.name)
    }
}
```

关键区别：`@StateObject` 由当前视图创建并拥有生命周期，即使视图重建也不会重新初始化；`@ObservedObject` 只是引用外部传入的对象，不管理其生命周期。规则是：谁创建谁用 `@StateObject`，谁接收谁用 `@ObservedObject`。

### 3.4 @EnvironmentObject

`@EnvironmentObject` 用于跨多层级视图共享数据，避免逐层传递：

```swift
// 顶层注入
@main
struct MyApp: App {
    @StateObject var appState = AppState()
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}

// 任意子视图直接读取
struct DeepChildView: View {
    @EnvironmentObject var appState: AppState
    var body: some View {
        Text(appState.userName)
    }
}
```

### 3.5 @Observable 宏（iOS 17+ / macOS 14+）

iOS 17 引入了 Observation 框架，用 `@Observable` 宏替代 `ObservableObject` + `@Published`：

```swift
@Observable
class UserModel {
    var name: String = ""
    var age: Int = 0
    var internalCache: [String: String] = [:]  // 不会被自动追踪
}
```

`@Observable` 的优势：不需要 `@Published` 标注（自动追踪属性访问），性能更好（只有被视图读取的属性变化才触发更新），支持 `withObservationTracking` 精确控制。使用时 `@State` 替代 `@StateObject`，`@Environment` 替代 `@EnvironmentObject`。

### 3.6 选择决策树

| 场景 | 选择 |
|------|------|
| 视图内部简单值类型 | `@State` |
| 父子双向传递值 | `@Binding` |
| 外部传入的引用类型 | `@ObservedObject`（iOS 16-）或直接传 `@Observable` |
| 本视图创建的引用类型 | `@StateObject`（iOS 16-）或 `@State`（iOS 17+） |
| 全局共享 | `@EnvironmentObject`（iOS 16-）或 `@Environment`（iOS 17+） |

## 四、布局系统

### 4.1 HStack / VStack / ZStack

三个基础容器视图，分别表示水平、垂直、层叠排列：

```swift
HStack(spacing: 16) {
    Image(systemName: "person.fill")
    VStack(alignment: .leading, spacing: 4) {
        Text("Name")
        Text("email@example.com")
            .font(.caption)
    }
    Spacer()
}
.padding()
```

### 4.2 布局修饰符的顺序

SwiftUI 中修饰符顺序至关重要。`.padding().background()` 和 `.background().padding()` 产生不同效果：

```swift
// 背景只紧贴文字
Text("Hello")
    .background(Color.red)
    .padding()

// 背景包含 padding 区域
Text("Hello")
    .padding()
    .background(Color.red)
```

每个修饰符返回一个新视图包裹原视图，所以顺序决定了嵌套层级。

### 4.3 Layout 协议（iOS 16+）

可以自定义布局逻辑：

```swift
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = flow(subviews: subviews, proposal: proposal)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = flow(subviews: subviews, proposal: proposal)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }
    // ... flow 算法实现
}
```

### 4.4 GeometryReader

`GeometryReader` 提供父容器的尺寸信息，用于需要根据可用空间自适应的布局：

```swift
GeometryReader { geo in
    Text("Width: \(geo.size.width)")
        .frame(width: geo.size.width, height: geo.size.height)
}
```

注意 `GeometryReader` 会贪婪地占满所有可用空间，且不自动居中内容。它是最接近 UIKit Auto Layout 的灵活布局工具，但应优先考虑用 `HStack`/`VStack` + `Spacer`/`alignment` 实现。

### 4.5 PreferenceKey

子视图向父视图传递布局信息的机制，常用于测量子视图尺寸：

```swift
struct SizePreferenceKey: PreferenceKey {
    static var defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        value = nextValue()
    }
}

struct MeasurableView: View {
    var body: some View {
        Text("Hello")
            .background(GeometryReader { geo in
                Color.clear.preference(key: SizePreferenceKey.self, value: geo.size)
            })
    }
}
```

## 五、列表与导航

### 5.1 List

```swift
List {
    Section("Fruits") {
        ForEach(fruits, id: \.self) { fruit in
            Text(fruit)
        }
    }
    Section("Settings") {
        Toggle("Notifications", isOn: $notificationsEnabled)
        Toggle("Dark Mode", isOn: $darkMode)
    }
}
.listStyle(.insetGrouped)
```

`List` 类似 UIKit 的 `UITableView`，但支持懒加载和自动 diff。`ForEach` 要求元素遵循 `Identifiable` 协议或提供 `id` 参数。

### 5.2 NavigationStack

iOS 16+ 用 `NavigationStack` 替代 `NavigationView`，支持类型安全路由：

```swift
NavigationStack(path: $path) {
    List(items) { item in
        NavigationLink(value: item) {
            Text(item.name)
        }
    }
    .navigationDestination(for: Item.self) { item in
        DetailView(item: item)
    }
}
```

通过 `path` 绑定可以实现编程式导航，如深度链接跳转。

### 5.3 TabView

```swift
TabView {
    HomeView()
        .tabItem { Label("Home", systemImage: "house") }
    SettingsView()
        .tabItem { Label("Settings", systemImage: "gear") }
}
```

## 六、动画与过渡

### 6.1 隐式动画

```swift
Text("Hello")
    .scaleEffect(isScaled ? 1.5 : 1.0)
    .animation(.easeInOut(duration: 0.3), value: isScaled)
```

### 6.2 显式动画

```swift
withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
    isExpanded.toggle()
}
```

### 6.3 过渡动画

```swift
if showDetails {
    DetailView()
        .transition(.slide.combined(with: .opacity))
}
```

### 6.4 PhaseAnimator 与 KeyframeAnimator（iOS 17+）

```swift
PhaseAnimator([false, true]) { content, phase in
    content
        .scaleEffect(phase ? 1.2 : 1.0)
        .opacity(phase ? 0.5 : 1.0)
} animation: { phase in
    phase ? .easeInOut(duration: 0.5) : .easeInOut(duration: 0.2)
}
```

## 七、SwiftUI 与 UIKit 互操作

### 7.1 UIViewRepresentable

在 SwiftUI 中使用 UIKit 视图：

```swift
struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // 当 SwiftUI 状态变化时更新 UIView
    }
}
```

### 7.2 UIViewControllerRepresentable

```swift
struct ImagePicker: UIViewControllerRepresentable {
    @Binding var image: UIImage?

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiView: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ImagePicker
        init(_ parent: ImagePicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            parent.image = info[.originalImage] as? UIImage
            picker.dismiss(animated: true)
        }
    }
}
```

### 7.3 在 UIKit 中嵌入 SwiftUI

```swift
let hostingController = UIHostingController(rootView: ContentView())
addChild(hostingController)
view.addSubview(hostingController.view)
// 设置约束...
hostingController.didMove(toParent: self)
```

## 八、性能注意事项

### 8.1 避免不必要的重绘

`body` 应该是纯函数——相同的输入产生相同的输出。避免在 `body` 中做副作用操作（网络请求、日志等）。视图结构应尽量扁平，减少嵌套层级。

### 8.2 Equatable 视图

对于复杂视图，遵循 `Equatable` 并使用 `.equatable()` 修饰符可以让 SwiftUI 跳过未变化视图的重新计算：

```swift
struct ExpensiveView: View, Equatable {
    let data: ComplexData

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.data == rhs.data
    }

    var body: some View {
        // 复杂渲染逻辑
    }
}

// 使用
ExpensiveView(data: data).equatable()
```

### 8.3 列表性能

`List` 已经内置懒加载。对于动态内容，确保 `Identifiable` 的 `id` 稳定且唯一。避免在 `ForEach` 中用 `\.self`（数组索引或自身作为 id），因为删除/插入时会导致错误 diff。

### 8.4 Instruments 检测

使用 SwiftUI Instruments 模板检测视图重绘次数。红色高亮表示频繁重绘的视图，应优化其依赖的状态范围。

## 九、SwiftUI 设计思想总结

SwiftUI 的核心理念是"状态驱动 UI"。视图是状态的纯函数映射，状态变化自动触发 diff 和更新。开发者不再手动操作视图树，而是描述"在某个状态下界面应该长什么样"。

这套范式带来的收益：代码量大幅减少（典型场景减少 40-60%），状态同步 bug 基本消除，跨平台复用（iOS/iPadOS/macOS/watchOS/tvOS/visionOS），内置无障碍支持。

代价是学习曲线（声明式思维转换、状态管理选择）、调试困难（框架内部行为不透明）、以及与 UIKit 互操作时的复杂度。对于重度自定义渲染引擎（如 Flexbox 布局引擎）的场景，UIKit 仍然是更灵活的选择，但可以通过 `UIViewRepresentable` 渐进式引入 SwiftUI。
