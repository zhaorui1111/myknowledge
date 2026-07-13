# App Extension 生态详解

## 一、App Extension 概述

App Extension 是 iOS 8 引入的机制，允许 App 的功能扩展到系统其他部分。Extension 是独立的二进制，运行在独立进程中，与容器 App 通信受限。

常见的 Extension 类型包括：WidgetKit（小组件）、Share Extension（分享）、Action Extension（操作）、Notification Content/Service Extension（通知扩展）、Custom Keyboard（自定义键盘）、File Provider（文件提供者）、Sticker Pack（贴纸包）、Message Filter（短信过滤）、Clip（App Clip）。

## 二、WidgetKit

### 2.1 Widget 基础

WidgetKit 是 iOS 14 引入的小组件框架，基于 SwiftUI。Widget 显示在主屏幕或今日视图中，展示 App 的关键信息。

```swift
import WidgetKit
import SwiftUI

struct MyWidget: Widget {
    let kind: String = "MyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            MyWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("我的小组件")
        .description("显示今日待办")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
```

### 2.2 Timeline Provider

Widget 通过 Timeline Provider 提供数据。系统按需刷新，开发者不能主动推送更新：

```swift
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), count: 5)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> Void) {
        let entry = SimpleEntry(date: Date(), count: getCurrentCount())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> Void) {
        let now = Date()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: now)!

        let entry = SimpleEntry(date: now, count: getCurrentCount())
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let count: Int
}
```

`policy` 控制下次刷新策略：`.after(date)` 指定最早刷新时间（系统可能延迟）。`.atEnd` 在 timeline 中所有 entry 消费完后刷新。`.never` 不自动刷新。

系统限制 Widget 刷新频率（每天约 40-70 次），不能依赖 Widget 实时更新。

### 2.3 Widget UI

```swift
struct MyWidgetEntryView: View {
    var entry: SimpleEntry

    var body: some View {
        VStack {
            Text("待办")
                .font(.headline)
            Text("\(entry.count)")
                .font(.system(size: 48, weight: .bold))
        }
        .containerBackground(for: .widget) {
            Color.blue.opacity(0.2)
        }
    }
}
```

Widget 必须用 SwiftUI 编写，不支持 UIKit。Widget UI 没有动画和交互（除了 Link 和 App Intent）。

### 2.4 与容器 App 共享数据

Widget 和容器 App 通过 App Groups 共享数据：

```swift
// 共享 UserDefaults
let defaults = UserDefaults(suiteName: "group.com.example.myapp")

// 共享文件
let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.example.myapp")!

// 容器 App 写入数据
defaults?.set(tasks, forKey: "tasks")
WidgetCenter.shared.reloadTimelines(ofKind: "MyWidget")  // 通知 Widget 刷新
```

### 2.5 Interactive Widget（iOS 17+）

iOS 17 引入交互式 Widget，支持按钮和开关：

```swift
struct MyWidgetEntryView: View {
    var entry: SimpleEntry

    var body: some View {
        VStack {
            Text("\(entry.count)")
            Button(intent: CompleteTaskIntent(taskId: entry.taskId)) {
                Image(systemName: "checkmark.circle")
            }
        }
    }
}

struct CompleteTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete Task"
    var taskId: String

    func perform() async throws -> some IntentResult {
        // 执行任务完成逻辑
        return .result()
    }
}
```

## 三、Share Extension

### 3.1 创建 Share Extension

在 Xcode 中 File → New → Target → Share Extension。系统会生成 `ShareViewController` 和 Info.plist。

### 3.2 配置支持的数据类型

在 Info.plist 的 `NSExtension` → `NSExtensionAttributes` → `NSExtensionActivationRule` 中配置：

```xml
<key>NSExtensionActivationRule</key>
<dict>
    <key>NSExtensionActivationSupportsImageWithMaxCount</key>
    <integer>10</integer>
    <key>NSExtensionActivationSupportsText</key>
    <true/>
    <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
    <integer>1</integer>
</dict>
```

### 3.3 处理分享内容

```swift
class ShareViewController: SLComposeServiceViewController {
    override func isContentValid() -> Bool {
        return contentText?.isEmpty == false
    }

    override func didSelectPost() {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem else { return }

        for attachment in item.attachments ?? [] {
            if attachment.hasItemConformingToTypeIdentifier("public.image") {
                attachment.loadItem(forTypeIdentifier: "public.image", options: nil) { data, error in
                    if let url = data as? URL {
                        self.uploadImage(url: url)
                    }
                }
            }
        }
    }
}
```

## 四、Custom Keyboard

### 4.1 创建键盘扩展

File → New → Target → Custom Keyboard Extension。生成 `KeyboardViewController`。

### 4.2 基本实现

```swift
class KeyboardViewController: UIInputViewController {
    var nextKeyboardButton: UIButton!

    override func viewDidLoad() {
        super.viewDidLoad()

        nextKeyboardButton = UIButton(type: .system)
        nextKeyboardButton.setTitle("Next", for: [])
        nextKeyboardButton.addTarget(self, action: #selector(handleNextKeyboard), for: .touchUpInside)
        view.addSubview(nextKeyboardButton)
    }

    override func viewDidLayoutSubviews() {
        nextKeyboardButton.frame = CGRect(x: 0, y: 0, width: 100, height: 40)
    }

    @objc func handleNextKeyboard() {
        advanceToNextInputMode()
    }

    override func textDidChange(_ textInput: UITextInput?) {
        // 文本变化时更新
    }
}
```

### 4.3 限制与安全

键盘扩展有以下限制：
- 默认不能访问网络（需要在 Info.plist 中设置 `RequestsOpenAccess` 为 YES 并请求完全访问权限）
- 不能显示键盘以外的 UI（除 emoji 选择器）
- 不能切换到容器 App
- 自动纠错和输入建议需要完全访问权限

## 五、Action Extension

Action Extension 在系统分享菜单中添加自定义操作：

```swift
class ActionViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let provider = item.attachments?.first else { return }

        provider.loadItem(forTypeIdentifier: "public.text", options: nil) { item, error in
            DispatchQueue.main.async {
                if let text = item as? String {
                    // 处理文本
                    self.processText(text)
                }
            }
        }
    }
}
```

## 六、App Clip

### 6.1 概述

App Clip 是 App 的轻量版本（10MB 以内），用户无需安装完整 App 即可快速体验核心功能。通过扫描 App Clip Code、NFC 标签、Safari 弹窗或地图触发。

### 6.2 创建 App Clip

File → New → Target → App Clip。App Clip 有独立的 Bundle ID（主 App Bundle ID + ".Clip"），但共享代码和资源。

### 7.3 与完整 App 通信

```swift
// App Clip 中引导用户安装完整 App
import AppClip

if let scene = view.window?.windowScene,
   let url = URL(string: "https://apps.apple.com/app/idXXXXXXX") {
    scene.userActivity = NSUserActivity(activityType: "com.example.viewProduct")
    SKOverlay.presentOverlay(in: scene)
}
```

完整 App 通过检查 `NSUserActivity` 获取从 App Clip 传递的上下文。

## 七、Extension 生命周期与限制

### 7.1 生命周期

Extension 由系统管理生命周期。系统在用户触发时启动 Extension，任务完成后终止。Extension 通常只有几秒到几十秒的执行时间。

各类型 Extension 的内存限制不同：Widget 约 30MB，Share Extension 约 120MB，Notification Service Extension 约 24MB。超过限制会被系统杀掉。

### 7.2 与容器 App 通信

Extension 不能直接调用容器 App 的代码或访问其数据。通信方式：

**App Groups**：共享 UserDefaults、文件、CoreData 存储。这是最常用的数据共享方式。

**URL Scheme**：Extension 可以通过 `openURL` 打开容器 App（通过 `extensionContext` 或 `responder chain`）：

```swift
func openContainerApp() {
    var responder: UIResponder? = self
    while let r = responder {
        if let app = r as? UIApplication {
            app.open(URL(string: "myapp://action")!, options: [:], completionHandler: nil)
            return
        }
        responder = r.next
    }
}
```

### 7.3 嵌入 Framework

Extension 和容器 App 可以共享 Framework。将共用代码抽取为 Framework，同时链接到 App 和 Extension Target。这样可以减少代码重复，但要注意 Framework 会增加 Extension 的二进制体积。

## 八、调试

Extension 在独立进程中运行，需要在 Xcode 中选择 Extension Target 运行。Xcode 会提示选择宿主 App（如 Share Extension 的宿主是 Safari、照片等）。

调试 Widget：选择 Widget Extension Target → Run → 选择宿主 App。修改代码后重新编译运行 Widget，使用 `WidgetCenter.shared.reloadAllTimelines()` 触发刷新。
