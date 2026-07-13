# Swift Package Manager 详解

## 一、SPM 概述

Swift Package Manager（SPM）是 Apple 官方的包管理工具，随 Swift 工具链一起分发。它取代了 CocoaPods 的角色，成为 iOS 开发的官方包管理方案。

SPM 的核心优势：Xcode 原生集成（无需额外安装）、Swift 语言级支持（Package.swift 用 Swift 编写）、支持二进制分发、跨 Apple 平台（iOS/macOS/watchOS/tvOS/visionOS）、开源生态（Swift Package Index 社区索引）。

CocoaPods 仍然广泛使用，但 Apple 的方向明确是 SPM。新项目推荐 SPM，存量项目可以逐步迁移。

## 二、创建 Package

### 2.1 命令行创建

```bash
mkdir MyLibrary
cd MyLibrary
swift package init --type library
```

生成的目录结构：

```
MyLibrary/
├── Package.swift
├── Sources/
│   └── MyLibrary/
│       └── MyLibrary.swift
├── Tests/
│   └── MyLibraryTests/
│       └── MyLibraryTests.swift
└── README.md
```

### 2.2 Package.swift 清单文件

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MyLibrary",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(name: "MyLibrary", targets: ["MyLibrary"]),
    ],
    dependencies: [
        .package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.8.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.5.0"),
    ],
    targets: [
        .target(
            name: "MyLibrary",
            dependencies: [
                .product(name: "Alamofire", package: "Alamofire"),
                .product(name: "Logging", package: "swift-log"),
            ]
        ),
        .testTarget(
            name: "MyLibraryTests",
            dependencies: ["MyLibrary"]
        ),
    ]
)
```

### 2.3 关键字段说明

`swift-tools-version`：声明此 Package 使用的工具版本。Xcode 根据此值确定兼容性。

`platforms`：声明最低支持的平台版本。未列出的平台不支持。

`products`：对外暴露的产物。一个 Package 可以有多个 library 产物。

`dependencies`：依赖的其他 Package。`from: "5.8.0"` 表示使用 >= 5.8.0 且 < 6.0.0 的版本。

`targets`：编译目标。`.target` 是库或可执行文件，`.testTarget` 是测试目标，`.binaryTarget` 是二进制框架。

## 三、依赖管理

### 3.1 版本约束语法

```swift
// 上至下一个主版本（推荐）
.package(url: "...", from: "1.2.0")  // >= 1.2.0 且 < 2.0.0

// 精确版本
.package(url: "...", exact: "1.2.0")

// 版本范围
.package(url: "...", "1.2.0"..<"2.0.0")  // >= 1.2.0 且 < 2.0.0
.package(url: "...", "1.2.0"..."1.5.0")  // >= 1.2.0 且 <= 1.5.0

// 分支
.package(url: "...", branch: "main")

// 提交
.package(url: "...", revision: "abc123")
```

### 3.2 分辨率规则

SPM 使用语义化版本（SemVer）。当多个包依赖同一个包的不同版本时，SPM 会自动选择满足所有约束的最高版本。如果版本冲突无法解决，构建会失败。

主版本升级（1.x → 2.x）意味着可能有 breaking change，`from:` 不会自动跨越主版本边界。需要手动修改版本号来升级主版本。

### 3.3 Package.resolved

首次解析依赖后，SPM 生成 `Package.resolved` 文件，记录每个依赖的精确版本。此文件应提交到版本控制，确保团队成员和 CI 使用相同的依赖版本。

## 四、在 Xcode 中使用 SPM

### 4.1 添加依赖

在 Xcode 中：File → Add Package Dependencies → 输入仓库 URL → 选择版本约束 → 选择 Target。

或通过 `Package.swift` 直接添加（如果项目本身就是 Package）。

### 4.2 在 App 项目中依赖 Package

普通 App 项目不创建 Package.swift，而是在 Xcode 的项目设置 → Package Dependencies 中添加。Xcode 会自动管理依赖。

### 4.3 本地 Package 开发

开发中的本地 Package 可以通过路径引用：

```swift
.package(path: "../MyLocalLibrary")
```

或者在 Xcode 中拖拽 Package 文件夹到项目导航器中。

## 五、资源文件

### 5.1 资源处理

SPM 5.3+ 支持在 Package 中包含资源文件：

```swift
.target(
    name: "MyLibrary",
    dependencies: [],
    resources: [
        .process("Resources"),      // 处理目录（优化图片等）
        .copy("Templates"),         // 原样拷贝
        .process("config.json"),    // 处理单个文件
    ]
)
```

`.process` 让 SPM 优化资源（如压缩图片、编译 Storyboard）。`.copy` 原样拷贝文件到 bundle 中。

### 5.2 访问资源

```swift
// SPM 中资源被放在 module bundle 中
if let url = Bundle.module.url(forResource: "config", withExtension: "json") {
    let data = try Data(contentsOf: url)
}
```

注意使用 `Bundle.module` 而非 `Bundle.main`。SPM 会为每个 target 生成独立的资源 bundle。

## 六、二进制框架分发

### 6.1 XCFramework

XCFramework 是 Apple 推荐的二进制分发格式，支持多架构（arm64/x86_64）和多平台：

```bash
# 创建 XCFramework
xcodebuild -create-xcframework \
    -library build/MyLibrary.a \
    -headers build/Headers \
    -output MyLibrary.xcframework

# 或从 framework 创建
xcodebuild -create-xcframework \
    -framework build/MyLibrary.framework \
    -output MyLibrary.xcframework
```

### 6.2 二进制 Target

```swift
.binaryTarget(
    name: "MyBinaryLibrary",
    path: "MyBinaryLibrary.xcframework"
)

// 从远程 URL 引用
.binaryTarget(
    name: "MyBinaryLibrary",
    url: "https://example.com/MyBinaryLibrary.xcframework.zip",
    checksum: "abc123..."
)
```

二进制 Target 不需要源码，但无法在 SPM 层面调试和查看实现。checksum 保证下载的文件未被篡改。

## 七、模块化架构

### 7.1 多 Target 架构

大型项目可以用 SPM 实现模块化：

```swift
targets: [
    .target(name: "CoreKit", dependencies: []),
    .target(name: "NetworkKit", dependencies: ["CoreKit"]),
    .target(name: "UIKit", dependencies: ["CoreKit"]),
    .target(name: "FeatureHome", dependencies: ["CoreKit", "NetworkKit", "UIKit"]),
    .target(name: "FeatureProfile", dependencies: ["CoreKit", "NetworkKit", "UIKit"]),
    .target(name: "App", dependencies: ["FeatureHome", "FeatureProfile"]),
]
```

这种架构清晰表达了模块间的依赖关系，防止循环依赖，编译器在编译期检查访问权限。

### 7.2 访问控制

```swift
// CoreKit
public struct User {           // 对外可见
    public let id: String
    public let name: String
    internal var cache: [String: String]  // 仅模块内可见
}

public protocol UserRepository {  // 对外可见
    func fetchUser(id: String) async throws -> User
}

struct DefaultUserRepository: UserRepository {  // 仅模块内可见（不暴露实现细节）
    // ...
}
```

`public`：对外模块可见。`internal`（默认）：仅当前模块可见。`open`：public + 可被继承/重写（仅类和类成员）。

## 八、从 CocoaPods 迁移到 SPM

### 8.1 评估迁移可行性

检查所有依赖是否提供 SPM 支持。大部分主流库（Alamofire、SnapKit、Kingfisher、SwiftyJSON 等）已支持 SPM。少数老旧或私有 Pod 可能仅支持 CocoaPods。

可以混合使用 SPM 和 CocoaPods——先迁移已支持的依赖，保留未支持的 Pod，逐步完成全量迁移。

### 8.2 迁移步骤

1. 在 Xcode 中逐个添加 SPM 依赖（Add Package Dependencies）
2. 从 Podfile 中移除对应的 Pod
3. 运行 `pod install` 更新 CocoaPods
4. 检查 import 语句（SPM 的模块名可能与 Pod 名不同）
5. 处理编译错误（API 差异、平台宏等）
6. 提交 Package.resolved

### 8.3 注意事项

模块名差异：CocoaPods 的 Pod 名与 SPM 的模块名可能不同。例如 CocoaPods 中的 `import AFNetworking` 在 SPM 中可能变为 `import Alamofire`。

ObjC 兼容：SPM 对 ObjC/Swift 混编的支持在逐步完善。纯 ObjC 库需要确保有 modulemap。

编译速度：SPM 的增量编译可能比 CocoaPods 快（SPM 支持模块级增量编译），但也取决于项目结构。

## 九、私有 Package 仓库

### 9.1 私有 Git 仓库

```swift
.package(url: "git@github.com:MyOrg/PrivateLibrary.git", from: "1.0.0")
```

使用 SSH 地址时需要确保 SSH key 配置正确。CI 环境需要配置 deploy key。

### 9.2 私有 Registry

Apple 推荐使用 Swift Package Registry（如 Artifactory）管理私有 Package：

```bash
swift package-registry set https://registry.myorg.com
```

Registry 提供更好的访问控制和缓存机制，适合大型团队。
