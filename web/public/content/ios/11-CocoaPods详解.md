# CocoaPods 详解

---

## 一、CocoaPods 概述

### 1.1 什么是 CocoaPods

```
CocoaPods 是 iOS/macOS 生态中最主流的依赖管理工具。

核心作用：
  - 管理第三方库的下载、版本控制和集成
  - 自动处理依赖关系（A 依赖 B，B 依赖 C → 自动拉取 B 和 C）
  - 自动配置 Xcode 工程（Header Search Paths、Link Flags 等）
  - 支持创建和发布私有/公有库

工作原理概览：

  开发者                  CocoaPods                Spec Repo
  ┌──────┐              ┌──────────┐            ┌───────────┐
  │      │  pod install │          │  查询依赖  │ 公有 Repo  │
  │ 编辑  │ ──────────→  │ 解析依赖  │ ─────────→│ (GitHub)  │
  │Podfile│              │ 下载源码  │            │           │
  │      │              │ 生成工程  │ ─────────→│ 私有 Repo  │
  └──────┘              └──────────┘            └───────────┘
                              │
                              ↓
                     ┌──────────────────┐
                     │  .xcworkspace     │
                     │  ├── 主工程        │
                     │  └── Pods 工程     │
                     │      ├── AFN      │
                     │      ├── SDWebImage│
                     │      └── ...      │
                     └──────────────────┘

CocoaPods 用 Ruby 编写，通过 Gem 安装：
  sudo gem install cocoapods
  # 或使用 Homebrew
  brew install cocoapods
```

### 1.2 核心组件

```
CocoaPods 的核心组件：

1. Podfile
   - 项目根目录下的依赖描述文件
   - 类似 npm 的 package.json

2. Podfile.lock
   - 锁定具体版本号的文件
   - 类似 npm 的 package-lock.json
   - 确保团队成员安装一致的版本

3. Podspec（.podspec）
   - 库的描述文件，定义库的名称、版本、源码路径、依赖等
   - 类似 npm 的 package.json（但专用于库的发布）

4. Spec Repo（规格仓库）
   - 存储所有 podspec 的 Git 仓库
   - 公有：https://github.com/CocoaPods/Specs（trunk）
   - 私有：公司内部自建 Spec Repo

5. Pods 目录
   - pod install 后生成，存放下载的依赖源码

6. .xcworkspace
   - pod install 后生成的工作空间
   - 包含主工程和 Pods 工程
```

---

## 二、Podfile 详解

### 2.1 基本结构

```ruby
# Podfile 使用 Ruby DSL 语法

# 指定 CocoaPods CDN 源（默认，推荐）
source 'https://cdn.cocoapods.org/'

# 也可以指定 Git 源
# source 'https://github.com/CocoaPods/Specs.git'

# 私有 Spec Repo
source 'https://git.company.com/ios-specs.git'

# 全局平台版本
platform :ios, '15.0'

# 全局禁止警告（所有 Pod 的编译警告都被屏蔽）
inhibit_all_warnings!

# 定义 Target
target 'MyApp' do
  # 使用 frameworks 而非 static libraries
  use_frameworks!

  # 依赖声明
  pod 'AFNetworking', '~> 4.0'
  pod 'SDWebImage'
  pod 'Masonry'
  pod 'MBProgressHUD', '~> 1.2'

  # 测试 Target
  target 'MyAppTests' do
    inherit! :search_paths  # 继承父 Target 的搜索路径
    pod 'OCMock'
  end

  # UI 测试 Target
  target 'MyAppUITests' do
    inherit! :search_paths
  end
end

# 多 Target 共享 Pod
target 'MyAppExtension' do
  pod 'KeychainAccess'
end
```

### 2.2 版本控制语法

```ruby
# ===== 版本号规则 =====

# 精确版本
pod 'AFNetworking', '4.0.1'

# 大于等于某版本
pod 'AFNetworking', '>= 4.0'

# 大于某版本
pod 'AFNetworking', '> 4.0'

# 小于某版本
pod 'AFNetworking', '< 5.0'

# 区间
pod 'AFNetworking', '>= 4.0', '< 5.0'

# ~>（悲观版本约束，最常用）
pod 'AFNetworking', '~> 4.0'
# 等价于 >= 4.0 且 < 5.0（最后一位可以增长）

pod 'AFNetworking', '~> 4.0.1'
# 等价于 >= 4.0.1 且 < 4.1.0

# 不指定版本（安装最新版，不推荐）
pod 'AFNetworking'


# ===== 语义化版本（SemVer）=====
#
#  MAJOR.MINOR.PATCH
#    │     │     │
#    │     │     └── 修复 bug，向后兼容
#    │     └──────── 新功能，向后兼容
#    └────────────── 不兼容的 API 变更
#
# ~> 4.0  表示信任 MINOR 和 PATCH 升级
# ~> 4.0.1 表示只信任 PATCH 升级
```

### 2.3 特殊来源

```ruby
# ===== 从 Git 仓库直接引用 =====

# 指定分支
pod 'AFNetworking', :git => 'https://github.com/AFNetworking/AFNetworking.git',
                    :branch => 'develop'

# 指定 tag
pod 'AFNetworking', :git => 'https://github.com/AFNetworking/AFNetworking.git',
                    :tag => '4.0.1'

# 指定 commit
pod 'AFNetworking', :git => 'https://github.com/AFNetworking/AFNetworking.git',
                    :commit => 'a1b2c3d'


# ===== 本地路径引用（本地开发调试时常用）=====
pod 'MyPrivateLib', :path => '../MyPrivateLib'
# 路径指向包含 .podspec 的目录
# 修改本地库代码后，pod install 即可同步（不需要重新发布版本）


# ===== 指定 Subspecs（子模块）=====
pod 'AFNetworking'                            # 安装全部子模块
pod 'AFNetworking/Serialization'              # 只安装 Serialization 子模块
pod 'AFNetworking/Reachability'               # 只安装 Reachability 子模块
pod 'AFNetworking', :subspecs => ['Serialization', 'Reachability']  # 安装多个子模块
```

### 2.4 高级配置

```ruby
# ===== use_frameworks! vs use_modular_headers! =====

# use_frameworks!
# 将所有 Pod 编译为动态框架（.framework）
# Swift Pod 必须使用 frameworks
use_frameworks!

# use_frameworks! :linkage => :static
# iOS 13+ 推荐：编译为静态框架（减少启动时间）
use_frameworks! :linkage => :static

# use_modular_headers!
# 为所有 Pod 启用模块化头文件（支持 @import）
# 不使用 frameworks 时的替代方案
use_modular_headers!

# 为单个 Pod 指定
pod 'AFNetworking', :modular_headers => true
pod 'MBProgressHUD', :modular_headers => false


# ===== 配置某个 Pod 的编译选项 =====
pod 'SomePod', :configurations => ['Debug']     # 只在 Debug 配置下集成
pod 'Flipper', :configurations => ['Debug']      # Flipper 调试工具只在 Debug


# ===== 继承方式 =====
target 'MyAppTests' do
  inherit! :search_paths    # 只继承搜索路径，不继承依赖
  # inherit! :complete      # 完全继承（默认）
  # inherit! :none          # 不继承
end


# ===== install 钩子 =====
# 在 pod install 完成后执行自定义脚本

post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # 设置最低部署版本
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'

      # 禁用 bitcode
      config.build_settings['ENABLE_BITCODE'] = 'NO'

      # 排除 arm64 模拟器架构（M1 Mac 兼容问题）
      config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64'
    end
  end
end

pre_install do |installer|
  # pod install 之前执行
end


# ===== 多平台支持 =====
platform :ios, '15.0'

target 'MyApp-iOS' do
  platform :ios, '15.0'
  pod 'AFNetworking'
end

target 'MyApp-macOS' do
  platform :osx, '12.0'
  pod 'AFNetworking'
end
```

---

## 三、pod install 与 pod update

### 3.1 pod install

```
pod install 的完整流程：

  1. 读取 Podfile
       ↓
  2. 解析依赖关系（Dependency Resolution）
     - 根据版本约束计算所有库的兼容版本
     - 使用 Molinillo 算法（回溯依赖解析）
       ↓
  3. 对比 Podfile.lock
     - 已有 lock 文件 → 优先使用 lock 中的版本
     - 新增的 Pod → 解析最新兼容版本
     - Podfile.lock 不存在 → 全部重新解析
       ↓
  4. 下载源码
     - 从 Spec Repo 获取 podspec
     - 从指定的 source（Git/CDN）下载源码到 Pods 目录
       ↓
  5. 生成 Pods 工程
     - 创建 Pods.xcodeproj
     - 每个 Pod 创建一个 Target
     - 配置编译设置（Header Paths、Linker Flags 等）
       ↓
  6. 生成 .xcworkspace
     - 包含主工程 + Pods 工程
       ↓
  7. 生成辅助文件
     - Manifest.lock（Pods 目录下的 lock 副本）
     - Pods-MyApp-frameworks.sh（复制 framework 的脚本）
     - Pods-MyApp-resources.sh（复制资源的脚本）
     - Pods-MyApp.debug.xcconfig / release.xcconfig
       ↓
  8. 更新 Podfile.lock
       ↓
  9. 执行 post_install 钩子


⚠️ pod install 的核心原则：
  - 只解析 Podfile.lock 中没有的新 Pod
  - 已在 lock 中的 Pod 不会更新版本
  - 这保证了团队成员安装一致的版本
```

### 3.2 pod update

```bash
# 更新所有 Pod 到 Podfile 允许的最新版本
pod update

# 只更新指定的 Pod
pod update AFNetworking
pod update AFNetworking SDWebImage

# pod update 会忽略 Podfile.lock 中对应 Pod 的版本锁定
# 重新根据 Podfile 的版本约束解析最新版本
# 然后更新 Podfile.lock
```

### 3.3 install vs update 对比

```
┌──────────────┬──────────────────────┬──────────────────────┐
│              │  pod install          │  pod update          │
├──────────────┼──────────────────────┼──────────────────────┤
│ lock 文件    │ 尊重 lock 中的版本    │ 忽略 lock，重新解析   │
│ 新增 Pod     │ 解析最新版本并加入lock │ 解析最新版本          │
│ 已有 Pod     │ 保持 lock 中的版本    │ 更新到最新兼容版本    │
│ 使用场景     │ 日常安装、CI/CD       │ 有意升级依赖版本时    │
│ 团队协作     │ 保证版本一致          │ 可能导致版本变化      │
└──────────────┴──────────────────────┴──────────────────────┘

最佳实践：
  - 日常开发用 pod install
  - 需要升级某个库时用 pod update SomePod
  - 避免无脑 pod update（可能引入不兼容的版本）
  - Podfile.lock 必须提交到 Git
```

### 3.4 常用命令

```bash
# 安装依赖
pod install

# 更新依赖
pod update
pod update AFNetworking          # 只更新指定 Pod

# 查看过时的 Pod
pod outdated

# 搜索 Pod
pod search AFNetworking

# 查看 Pod 信息
pod info AFNetworking

# 查看本地 Spec 缓存
pod cache list
pod cache clean --all            # 清除所有缓存
pod cache clean AFNetworking     # 清除指定 Pod 缓存

# 初始化 Podfile
pod init

# 验证 podspec 文件
pod spec lint MyLib.podspec
pod lib lint MyLib.podspec       # 更严格的本地验证

# 更新本地 Spec Repo
pod repo update
pod repo update trunk            # 只更新 trunk

# 加速选项
pod install --no-repo-update     # 跳过 Spec Repo 更新（节省时间）
pod install --verbose            # 显示详细日志

# 反安装（删除 Pods 目录和 workspace）
# 没有内置命令，手动操作：
rm -rf Pods/ Podfile.lock *.xcworkspace
```

---

## 四、Podfile.lock 详解

### 4.1 文件结构

```yaml
# Podfile.lock 示例

PODS:
  - AFNetworking (4.0.1):
    - AFNetworking/NSURLSession (= 4.0.1)
    - AFNetworking/Reachability (= 4.0.1)
    - AFNetworking/Security (= 4.0.1)
    - AFNetworking/Serialization (= 4.0.1)
    - AFNetworking/UIKit (= 4.0.1)
  - AFNetworking/NSURLSession (4.0.1):
    - AFNetworking/Reachability
    - AFNetworking/Security
    - AFNetworking/Serialization
  - SDWebImage (5.18.0):
    - SDWebImage/Core (= 5.18.0)
  - SDWebImage/Core (5.18.0)
  - Masonry (1.1.0)

DEPENDENCIES:
  - AFNetworking (~> 4.0)
  - Masonry
  - SDWebImage

SPEC REPOS:
  trunk:
    - AFNetworking
    - Masonry
    - SDWebImage

SPEC CHECKSUMS:
  AFNetworking: 3bd23d814e976cd148d7d44c3ab78017b744cd58
  Masonry: 678fab65091a9290e40e2832a55e7ab731aad201
  SDWebImage: 066c47b573f408f18caa467d71deace7c0f8280d

PODFILE CHECKSUM: 7c8e3a0c8e7d5f9e8b1a2d3c4f5e6a7b8c9d0e1f

COCOAPODS: 1.14.3
```

### 4.2 各部分含义

```
PODS:
  列出所有安装的 Pod 及其精确版本号
  包括 Pod 之间的子依赖关系

DEPENDENCIES:
  来自 Podfile 中直接声明的依赖及其版本约束
  是 "顶层" 依赖

SPEC REPOS:
  每个 Pod 来自哪个 Spec Repo

SPEC CHECKSUMS:
  每个 Pod 的 podspec 文件的 SHA1 校验值
  用于检测 podspec 是否被篡改

PODFILE CHECKSUM:
  Podfile 文件本身的校验值
  如果 Podfile 改了但没有重新 pod install，校验不匹配会警告

COCOAPODS:
  生成此 lock 文件时使用的 CocoaPods 版本


⚠️ Podfile.lock 必须加入版本控制（Git）
   它保证了所有团队成员和 CI 安装完全相同版本的依赖
```

### 4.3 Manifest.lock

```
pod install 后会在 Pods/ 目录下生成 Manifest.lock
它是 Podfile.lock 的副本

Xcode 编译时会执行一个 Build Phase 脚本：
  [CP] Check Pods Manifest.lock

这个脚本对比 Podfile.lock 和 Manifest.lock：
  - 一致 → 正常编译
  - 不一致 → 编译报错：
    "The sandbox is not in sync with the Podfile.lock.
     Run 'pod install' or update your CocoaPods installation."

作用：确保开发者在 Podfile 或 Podfile.lock 变化后执行了 pod install
```

---

## 五、Podspec 文件详解

### 5.1 基本结构

```ruby
Pod::Spec.new do |s|
  # ===== 基本信息 =====
  s.name             = 'MyLibrary'
  s.version          = '1.0.0'
  s.summary          = '一个优秀的 iOS 工具库'
  s.description      = <<-DESC
    MyLibrary 提供了一系列常用的 iOS 开发工具，
    包括网络请求、图片处理、缓存管理等功能。
  DESC
  s.homepage         = 'https://github.com/user/MyLibrary'
  s.license          = { :type => 'MIT', :file => 'LICENSE' }
  s.author           = { 'Your Name' => 'email@example.com' }
  s.source           = { :git => 'https://github.com/user/MyLibrary.git',
                          :tag => s.version.to_s }

  # ===== 平台与版本 =====
  s.ios.deployment_target = '13.0'
  # s.osx.deployment_target = '10.15'
  # s.tvos.deployment_target = '13.0'
  # s.watchos.deployment_target = '6.0'

  # ===== 源码 =====
  s.source_files = 'MyLibrary/Classes/**/*'
  # 常见写法：
  # 'Sources/**/*.{h,m}'         # OC 文件
  # 'Sources/**/*.{swift}'       # Swift 文件
  # 'Sources/**/*.{h,m,swift}'   # 混编

  # ===== 公开头文件 =====
  s.public_header_files = 'MyLibrary/Classes/**/*.h'

  # ===== 资源文件 =====
  s.resource_bundles = {
    'MyLibrary' => ['MyLibrary/Assets/**/*']
  }
  # resource_bundles 比 resources 更推荐（避免资源命名冲突）

  # ===== 系统框架依赖 =====
  s.frameworks = 'UIKit', 'Foundation', 'CoreData'
  s.weak_frameworks = 'SwiftUI'  # 弱引用（低版本系统不存在时不崩溃）

  # ===== 系统库依赖 =====
  s.libraries = 'z', 'sqlite3', 'c++'

  # ===== 第三方 Pod 依赖 =====
  s.dependency 'AFNetworking', '~> 4.0'
  s.dependency 'SDWebImage', '~> 5.0'

  # ===== 编译设置 =====
  s.requires_arc = true            # 是否需要 ARC（默认 true）
  s.swift_versions = ['5.0', '5.5', '5.9']  # 支持的 Swift 版本
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => 'COCOAPODS'
  }
  s.user_target_xcconfig = { 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'arm64' }

  # ===== 静态库/动态框架 =====
  # s.static_framework = true      # 强制编译为静态框架
end
```

### 5.2 Subspecs（子模块）

```ruby
Pod::Spec.new do |s|
  s.name    = 'MyLibrary'
  s.version = '1.0.0'
  # ... 基本信息 ...

  # 默认子模块（pod 'MyLibrary' 时安装的内容）
  s.default_subspecs = 'Core', 'Networking'

  # ===== Core 子模块 =====
  s.subspec 'Core' do |core|
    core.source_files = 'MyLibrary/Core/**/*'
    core.frameworks = 'Foundation'
  end

  # ===== Networking 子模块 =====
  s.subspec 'Networking' do |net|
    net.source_files = 'MyLibrary/Networking/**/*'
    net.dependency 'MyLibrary/Core'           # 依赖自己的 Core 子模块
    net.dependency 'AFNetworking', '~> 4.0'   # 依赖第三方库
  end

  # ===== ImageCache 子模块 =====
  s.subspec 'ImageCache' do |img|
    img.source_files = 'MyLibrary/ImageCache/**/*'
    img.dependency 'MyLibrary/Core'
    img.dependency 'SDWebImage', '~> 5.0'
  end

  # ===== Database 子模块 =====
  s.subspec 'Database' do |db|
    db.source_files = 'MyLibrary/Database/**/*'
    db.dependency 'MyLibrary/Core'
    db.frameworks = 'CoreData'
  end
end


# 使用者可以按需安装：
# pod 'MyLibrary'                     # 安装 Core + Networking（默认）
# pod 'MyLibrary/ImageCache'          # 安装 ImageCache + Core（自动）
# pod 'MyLibrary', :subspecs => ['Core', 'Database']  # 指定多个
```

### 5.3 资源管理

```ruby
# ===== resource_bundles（推荐）=====
s.resource_bundles = {
  'MyLibrary' => [
    'MyLibrary/Assets/*.png',
    'MyLibrary/Assets/*.xcassets',
    'MyLibrary/Assets/*.xib',
    'MyLibrary/Assets/*.storyboard',
    'MyLibrary/Assets/*.json'
  ]
}

# resource_bundles 会生成一个独立的 .bundle 文件
# 资源命名不会与主工程或其他 Pod 冲突


# ===== 在代码中加载 Bundle 中的资源 =====
```

```objc
// Objective-C
+ (NSBundle *)resourceBundle {
    // use_frameworks! 时
    NSBundle *frameworkBundle = [NSBundle bundleForClass:[self class]];
    NSURL *bundleURL = [frameworkBundle URLForResource:@"MyLibrary" withExtension:@"bundle"];
    return [NSBundle bundleWithURL:bundleURL];
}

// 加载图片
UIImage *image = [UIImage imageNamed:@"icon"
                            inBundle:[self resourceBundle]
       compatibleWithTraitCollection:nil];

// 加载 Xib
UINib *nib = [UINib nibWithNibName:@"MyCell"
                            bundle:[self resourceBundle]];

// 加载本地化字符串
NSString *text = NSLocalizedStringFromTableInBundle(@"key", nil, [self resourceBundle], nil);
```

```swift
// Swift
extension Bundle {
    static var myLibrary: Bundle {
        let frameworkBundle = Bundle(for: MyLibraryClass.self)
        guard let url = frameworkBundle.url(forResource: "MyLibrary", withExtension: "bundle"),
              let bundle = Bundle(url: url) else {
            return frameworkBundle
        }
        return bundle
    }
}

// 加载图片
let image = UIImage(named: "icon", in: .myLibrary, compatibleWith: nil)

// 加载 Storyboard
let storyboard = UIStoryboard(name: "Main", bundle: .myLibrary)
```

---

## 六、创建私有 Pod 库

### 6.1 创建模板工程

```bash
# 使用 CocoaPods 模板创建
pod lib create MyPrivateLib

# 交互式选择：
# What platform do you want to use? → iOS
# What language do you want to use? → ObjC / Swift
# Would you like to include a demo application? → Yes
# Which testing frameworks? → Quick / XCTest
# Would you like to do view based testing? → No

# 生成的目录结构：
# MyPrivateLib/
# ├── Example/                 # 示例工程
# │   ├── MyPrivateLib.xcodeproj
# │   ├── MyPrivateLib.xcworkspace
# │   ├── Podfile
# │   └── ...
# ├── MyPrivateLib/
# │   ├── Assets/              # 资源文件
# │   └── Classes/             # 源码（在这里写代码）
# │       └── ReplaceMe.swift
# ├── MyPrivateLib.podspec     # Pod 描述文件
# ├── LICENSE
# └── README.md
```

### 6.2 开发与本地调试

```ruby
# 在示例工程或主工程中使用本地路径引用
# Podfile:
pod 'MyPrivateLib', :path => '../MyPrivateLib'

# 修改本地库代码后执行 pod install 即可同步
# 本地路径引用不受版本号限制
# 非常适合开发阶段调试
```

### 6.3 创建私有 Spec Repo

```bash
# ===== 第一步：在 Git 服务器上创建一个空仓库 =====
# 例如：https://git.company.com/ios-team/Specs.git
# 这个仓库专门存放所有私有库的 podspec 文件


# ===== 第二步：将私有 Repo 添加到本地 CocoaPods =====
pod repo add company-specs https://git.company.com/ios-team/Specs.git

# 查看已添加的 Repo
pod repo list
# 输出：
# company-specs
# - Type: git (remotes/origin/master)
# - URL:  https://git.company.com/ios-team/Specs.git
# - Path: ~/.cocoapods/repos/company-specs
#
# trunk
# - Type: CDN
# - URL:  https://cdn.cocoapods.org/
# - Path: ~/.cocoapods/repos/trunk


# ===== 第三步：在 Podfile 中声明私有 Repo =====
# Podfile:
source 'https://git.company.com/ios-team/Specs.git'  # 私有
source 'https://cdn.cocoapods.org/'                    # 公有（必须同时声明）
```

### 6.4 发布私有 Pod

```bash
# ===== 第一步：验证 podspec =====

# 本地验证（只检查 spec 文件本身）
pod lib lint MyPrivateLib.podspec --verbose

# 如果依赖私有库，需要指定 sources
pod lib lint MyPrivateLib.podspec \
  --sources='https://git.company.com/ios-team/Specs.git,https://cdn.cocoapods.org/' \
  --allow-warnings

# 远程验证（同时检查 Git 源码）
pod spec lint MyPrivateLib.podspec \
  --sources='https://git.company.com/ios-team/Specs.git,https://cdn.cocoapods.org/'


# ===== 第二步：给源码仓库打 Tag =====
git add .
git commit -m "Release 1.0.0"
git tag '1.0.0'
git push origin master --tags


# ===== 第三步：推送到私有 Spec Repo =====
pod repo push company-specs MyPrivateLib.podspec \
  --sources='https://git.company.com/ios-team/Specs.git,https://cdn.cocoapods.org/' \
  --allow-warnings

# 推送成功后，私有 Spec Repo 的目录结构：
# Specs/
# └── MyPrivateLib/
#     └── 1.0.0/
#         └── MyPrivateLib.podspec.json


# ===== 使用私有 Pod =====
# 其他同事的 Podfile:
source 'https://git.company.com/ios-team/Specs.git'
source 'https://cdn.cocoapods.org/'

target 'SomeApp' do
  pod 'MyPrivateLib', '~> 1.0'
end
```

### 6.5 版本更新流程

```bash
# 1. 修改代码

# 2. 更新 podspec 中的版本号
# s.version = '1.1.0'

# 3. 提交代码并打新 Tag
git add .
git commit -m "Release 1.1.0 - 新增 XX 功能"
git tag '1.1.0'
git push origin master --tags

# 4. 验证
pod lib lint MyPrivateLib.podspec --sources=...

# 5. 推送新版本到 Spec Repo
pod repo push company-specs MyPrivateLib.podspec --sources=...

# 6. 使用者更新
pod update MyPrivateLib
```

---

## 七、CocoaPods 工作原理

### 7.1 Pods 工程结构

```
执行 pod install 后的工程结构：

MyApp.xcworkspace
├── MyApp.xcodeproj                    # 主工程
│   └── MyApp Target
│       └── Link: Pods_MyApp.framework（或 libPods-MyApp.a）
│
└── Pods/
    ├── Pods.xcodeproj                 # Pods 工程
    │   ├── AFNetworking Target        # 每个 Pod 一个 Target
    │   ├── SDWebImage Target
    │   ├── Masonry Target
    │   └── Pods-MyApp Target          # 聚合 Target（umbrella）
    │
    ├── AFNetworking/                  # Pod 源码
    ├── SDWebImage/
    ├── Masonry/
    │
    ├── Target Support Files/
    │   ├── AFNetworking/
    │   │   ├── AFNetworking.debug.xcconfig
    │   │   └── AFNetworking.release.xcconfig
    │   ├── Pods-MyApp/
    │   │   ├── Pods-MyApp.debug.xcconfig     # 主工程的编译配置
    │   │   ├── Pods-MyApp.release.xcconfig
    │   │   ├── Pods-MyApp-frameworks.sh       # 复制 framework 脚本
    │   │   └── Pods-MyApp-resources.sh        # 复制资源脚本
    │   └── ...
    │
    ├── Manifest.lock
    └── Headers/                       # 头文件索引（Private/Public）
```

### 7.2 集成方式对比

```
CocoaPods 支持两种集成方式：

┌────────────────┬────────────────────────┬────────────────────────┐
│                │  Static Library         │  Framework              │
│                │  (默认/不加 use_frame)  │  (use_frameworks!)      │
├────────────────┼────────────────────────┼────────────────────────┤
│ 产物           │ .a 静态库              │ .framework 框架         │
│ 头文件导入     │ #import "Header.h"     │ @import Module          │
│                │ 或 #import <Pod/H.h>   │ 或 import Module        │
│ Swift 支持     │ 不支持                 │ 支持                    │
│ 启动时间       │ 快（链接时合并到二进制）│ 稍慢（需加载动态库）     │
│ 包体积         │ 只包含用到的符号       │ 包含完整框架             │
│ 资源           │ 复制到主 Bundle        │ 在各自 framework Bundle  │
└────────────────┴────────────────────────┴────────────────────────┘

iOS 13+ 推荐方案：
  use_frameworks! :linkage => :static
  
  将 Pod 编译为静态框架：
  - 支持 Swift（有 module 结构）
  - 启动速度快（静态链接，不额外加载动态库）
  - 兼顾两种方式的优点
```

### 7.3 xcconfig 机制

```
CocoaPods 通过 xcconfig 文件配置主工程的编译设置：

Pods-MyApp.debug.xcconfig 中的关键配置：

  FRAMEWORK_SEARCH_PATHS = "$(PODS_ROOT)/..."
  → 告诉编译器去哪里找 framework

  HEADER_SEARCH_PATHS = "$(PODS_ROOT)/Headers/Public" ...
  → 告诉编译器去哪里找头文件

  OTHER_LDFLAGS = -framework "AFNetworking" -framework "SDWebImage"
  → 链接时需要链接的框架

  GCC_PREPROCESSOR_DEFINITIONS = COCOAPODS=1
  → 预处理宏，可用于 #ifdef COCOAPODS 条件编译

  PODS_BUILD_DIR / PODS_CONFIGURATION_BUILD_DIR
  → Pod 编译产物的输出路径

主工程的 Build Settings 中可以看到：
  Based on: Pods-MyApp.debug.xcconfig

⚠️ 不要在 Xcode 中手动修改被 xcconfig 管理的设置
   否则会被下次 pod install 覆盖
   如需自定义，在 Podfile 的 post_install 中设置
```

---

## 八、CocoaPods 与 Swift Package Manager 对比

### 8.1 功能对比

```
┌──────────────────┬───────────────────────┬────────────────────────┐
│                  │  CocoaPods             │  SPM                    │
├──────────────────┼───────────────────────┼────────────────────────┤
│ 配置文件         │ Podfile (Ruby DSL)     │ Package.swift (Swift)   │
│ 集成方式         │ 生成 xcworkspace       │ Xcode 原生集成          │
│ 中心化           │ 是（Spec Repo）        │ 去中心化（直接用 Git）  │
│ 依赖解析         │ Molinillo 算法         │ PubGrub 算法           │
│ ObjC 支持        │ 完善                  │ 支持但生态少            │
│ 二进制分发       │ 支持 vendored_framework│ Binary Target           │
│ 私有库           │ 私有 Spec Repo         │ 私有 Git 仓库直接引用   │
│ 资源管理         │ resource_bundles       │ Bundle.module           │
│ Subspecs         │ 支持                  │ 通过多 Target 实现      │
│ Xcode 版本绑定   │ 无                    │ 有（部分功能需高版本）  │
│ 安装额外工具     │ 需要（gem install）    │ 不需要（Xcode 内置）    │
│ 生态丰富度       │ 最丰富               │ 持续增长                │
│ 编译速度         │ 中等                  │ 较快（增量编译）        │
│ post_install 钩子│ 支持                  │ 不支持                  │
└──────────────────┴───────────────────────┴────────────────────────┘
```

### 8.2 选择建议

```
选择 CocoaPods 的场景：
  - 项目依赖大量 ObjC 库
  - 需要精细控制编译设置（post_install 钩子）
  - 需要 Subspecs 按需引入子模块
  - 已有成熟的私有 Spec Repo 体系
  - 历史项目迁移成本高

选择 SPM 的场景：
  - 新项目，纯 Swift 或 Swift 为主
  - 追求简洁，不想安装额外工具
  - Apple 官方库（如 swift-collections、swift-algorithms）
  - 不需要复杂的编译配置

混合使用：
  很多项目同时使用 CocoaPods + SPM
  - 大型私有库用 CocoaPods（Subspecs + 二进制化）
  - 小型开源 Swift 库用 SPM
  - 两者可以共存，没有冲突
```

---

## 九、二进制化

### 9.1 为什么需要二进制化

```
源码编译的问题：
  大型项目的 Pods 可能有几十甚至上百个
  每次 Clean Build 都要编译所有 Pod 的源码 → 编译时间过长

二进制化方案：
  将 Pod 预编译为 .framework 或 .xcframework
  集成时直接使用编译好的二进制产物 → 大幅缩短编译时间

典型效果：
  100+ Pod 源码编译：10-20 分钟
  二进制化后：2-5 分钟
```

### 9.2 实现方案

```ruby
# ===== 方案1：vendored_frameworks =====
# 在 podspec 中直接引用预编译的 framework

Pod::Spec.new do |s|
  s.name    = 'MyLib'
  s.version = '1.0.0'
  # ...

  # 引用预编译的 xcframework
  s.vendored_frameworks = 'Frameworks/MyLib.xcframework'

  # 或 .framework
  s.vendored_frameworks = 'Frameworks/MyLib.framework'

  # 不再需要 source_files
end


# ===== 方案2：cocoapods-binary 插件 =====
# 自动将源码 Pod 预编译为二进制

# Gemfile:
gem 'cocoapods-binary'

# Podfile:
plugin 'cocoapods-binary'

target 'MyApp' do
  pod 'AFNetworking', :binary => true
  pod 'SDWebImage', :binary => true
  pod 'MyDevLib'  # 开发中的库保持源码
end


# ===== 方案3：自建二进制化服务 =====
# 大公司通常自建二进制化 CI 流程：
#
#   Pod 版本发布
#        ↓
#   CI 自动构建（模拟器 + 真机）
#        ↓
#   生成 xcframework
#        ↓
#   上传到二进制存储（CDN / Artifactory）
#        ↓
#   修改 podspec 指向二进制地址
#        ↓
#   pod install 时下载二进制而非源码
```

### 9.3 xcframework 构建

```bash
# xcframework 支持多架构打包（真机 + 模拟器 + Mac Catalyst）

# 构建真机
xcodebuild archive \
  -scheme MyLib \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "./build/iOS" \
  SKIP_INSTALL=NO \
  BUILD_LIBRARY_FOR_DISTRIBUTION=YES

# 构建模拟器
xcodebuild archive \
  -scheme MyLib \
  -configuration Release \
  -destination "generic/platform=iOS Simulator" \
  -archivePath "./build/iOS-Simulator" \
  SKIP_INSTALL=NO \
  BUILD_LIBRARY_FOR_DISTRIBUTION=YES

# 合成 xcframework
xcodebuild -create-xcframework \
  -framework "./build/iOS.xcarchive/Products/Library/Frameworks/MyLib.framework" \
  -framework "./build/iOS-Simulator.xcarchive/Products/Library/Frameworks/MyLib.framework" \
  -output "./build/MyLib.xcframework"

# BUILD_LIBRARY_FOR_DISTRIBUTION=YES 会生成 .swiftinterface 文件
# 保证不同 Swift 版本编译的二进制也能互相兼容
```

---

## 十、常见问题与解决

### 10.1 CDN 源问题

```bash
# 报错：CDN: trunk URL couldn't be downloaded

# 原因：网络问题或 CDN 源不稳定

# 解决1：使用 Git 源替代 CDN
# Podfile 中：
source 'https://github.com/CocoaPods/Specs.git'

# 解决2：更换镜像源
source 'https://mirrors.tuna.tsinghua.edu.cn/git/CocoaPods/Specs.git'

# 解决3：清除缓存重试
pod cache clean --all
pod repo remove trunk
pod setup
```

### 10.2 版本冲突

```bash
# 报错：[!] CocoaPods could not find compatible versions for pod "AFNetworking"

# 原因：多个 Pod 对同一个依赖的版本要求冲突
# 例如：
#   Pod-A 要求 AFNetworking >= 4.0, < 5.0
#   Pod-B 要求 AFNetworking >= 3.0, < 4.0
#   → 无法同时满足

# 解决方案：
# 1. 检查冲突的 Pod 版本
pod install --verbose  # 查看详细的版本解析过程

# 2. 升级或降级相关 Pod
pod update Pod-A  # 看新版本是否放宽了依赖限制

# 3. 使用 Git 引用特定版本
pod 'Pod-A', :git => '...', :branch => 'fix-dependency'
```

### 10.3 头文件找不到

```bash
# 报错：'SomeHeader.h' file not found

# 原因1：Pod 使用了 use_frameworks! 但代码用了 #import "Header.h"
# 解决：改为 @import Module; 或 #import <Module/Header.h>

# 原因2：Pod 没有正确配置 public_header_files
# 解决：检查 podspec 中的 public_header_files 路径

# 原因3：modular_headers 问题
# 解决：在 Podfile 中为该 Pod 开启或关闭 modular_headers
pod 'SomePod', :modular_headers => true
```

### 10.4 M1/M2 Mac 兼容问题

```bash
# 报错：building for iOS Simulator, but linking in object file built for iOS

# 原因：M1 Mac 模拟器使用 arm64，与真机 arm64 冲突

# 解决1：排除模拟器的 arm64
# Podfile post_install:
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64'
    end
  end
end

# 解决2：使用 Rosetta 运行模拟器
# Product → Destination → 选择带 (Rosetta) 的模拟器

# 解决3（推荐）：使用 xcframework（天然支持多架构）
```

### 10.5 pod install 慢

```bash
# 加速方案：

# 1. 跳过 Repo 更新
pod install --no-repo-update

# 2. 使用 CDN 源（比 Git Clone 快）
source 'https://cdn.cocoapods.org/'

# 3. 国内镜像
source 'https://mirrors.tuna.tsinghua.edu.cn/git/CocoaPods/Specs.git'

# 4. 二进制化（见第九章）

# 5. 预生成 Pods 目录并提交到 Git
# 避免 CI 每次都 pod install
# 争议大：Pods 目录体积大，但省去了安装时间

# 6. 使用 cocoapods-generate 只安装需要开发的 Pod
```

---

## 十一、CocoaPods 插件

### 11.1 常用插件

```ruby
# Gemfile 中声明插件
source 'https://rubygems.org'

gem 'cocoapods', '~> 1.14'
gem 'cocoapods-binary'          # 自动二进制化
gem 'cocoapods-packager'        # 打包为 framework
gem 'cocoapods-keys'            # 安全管理 API Key
gem 'cocoapods-generate'        # 为单个 Pod 生成独立工程


# ===== cocoapods-generate =====
# 组件化开发时，为单个 Pod 生成独立可编译的工程
# 避免编译整个主工程

pod gen MyPrivateLib.podspec
# 生成 gen/MyPrivateLib/ 目录，包含独立的 xcworkspace


# ===== cocoapods-keys =====
# 将 API Key 等敏感信息从代码中分离
# Podfile:
plugin 'cocoapods-keys', {
  :project => "MyApp",
  :keys => [
    "GoogleMapsAPIKey",
    "FabricAPIKey"
  ]
}
# 使用时：
# MyAppKeys *keys = [[MyAppKeys alloc] init];
# NSString *apiKey = keys.googleMapsAPIKey;
```

---

## 十二、Podfile 最佳实践

### 12.1 团队项目推荐配置

```ruby
# Podfile 最佳实践模板

source 'https://git.company.com/ios-team/Specs.git'
source 'https://cdn.cocoapods.org/'

platform :ios, '15.0'
inhibit_all_warnings!

# 推荐使用静态框架（兼顾 Swift 支持和启动速度）
use_frameworks! :linkage => :static

def shared_pods
  # 网络
  pod 'AFNetworking', '~> 4.0'
  pod 'Alamofire', '~> 5.8'

  # 图片
  pod 'SDWebImage', '~> 5.18'

  # UI
  pod 'Masonry', '~> 1.1'
  pod 'SnapKit', '~> 5.6'
  pod 'MBProgressHUD', '~> 1.2'

  # 工具
  pod 'YYModel', '~> 1.0'

  # 私有库
  pod 'CompanyFoundation', '~> 2.0'
  pod 'CompanyUIKit', '~> 3.0'
end

def debug_pods
  pod 'FLEX', '~> 5.22', :configurations => ['Debug']
  pod 'LookinServer', :configurations => ['Debug']
end

target 'MyApp' do
  shared_pods
  debug_pods

  target 'MyAppTests' do
    inherit! :search_paths
    pod 'OCMock'
    pod 'OHHTTPStubs/Swift'
  end
end

post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
    end
  end

  # 修复 Xcode 14+ 签名问题
  installer.pods_project.targets.each do |target|
    if target.respond_to?(:product_type) && target.product_type == "com.apple.product-type.bundle"
      target.build_configurations.each do |config|
        config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
      end
    end
  end
end
```

### 12.2 Git 提交策略

```
必须提交：
  ✅ Podfile          — 依赖声明
  ✅ Podfile.lock     — 版本锁定（最重要！）
  ✅ .xcworkspace     — 工作空间配置

可选（两种策略）：
  ── 策略1：不提交 Pods 目录 ──
  .gitignore 中添加 Pods/
  优点：仓库体积小
  缺点：clone 后需要 pod install，CI 需要安装 CocoaPods

  ── 策略2：提交 Pods 目录 ──
  优点：clone 后即可编译，不依赖 CocoaPods 环境
  缺点：仓库体积大，PR diff 噪音多

推荐策略1（不提交 Pods），但 CI 环境需要缓存 Pods 目录加速构建。
```

---

## 十三、常见面试题

### Q1：pod install 和 pod update 的区别？

```
pod install：
  - 尊重 Podfile.lock 中已有的版本
  - 只为新增的 Pod 解析版本
  - 日常开发和 CI 应该用这个
  - 保证团队版本一致

pod update：
  - 忽略 Podfile.lock（对指定 Pod）
  - 重新解析最新兼容版本
  - 仅在有意升级时使用
  - 用完后需要提交更新的 Podfile.lock
```

### Q2：CocoaPods 的工作原理？

```
1. 读取 Podfile 中的依赖声明
2. 从 Spec Repo 获取每个 Pod 的 podspec
3. 使用 Molinillo 算法解析依赖树，确定所有库的兼容版本
4. 下载源码到 Pods/ 目录
5. 生成 Pods.xcodeproj（每个 Pod 一个 Target）
6. 通过 xcconfig 文件将编译设置注入主工程
7. 生成 .xcworkspace 包含主工程和 Pods 工程
8. 生成辅助脚本（复制 frameworks、resources）
9. 更新 Podfile.lock
```

### Q3：use_frameworks! 和默认（Static Library）的区别？

```
默认（Static Library）：
  - 编译为 .a 静态库
  - 链接时合并到主二进制中
  - 启动快（无需额外加载）
  - 不支持 Swift

use_frameworks!：
  - 编译为 .framework（默认动态）
  - 支持 Swift
  - 启动时需要加载动态库

use_frameworks! :linkage => :static（推荐）：
  - 编译为静态 .framework
  - 兼具两者优点：支持 Swift + 启动快
```

### Q4：Podfile.lock 的作用？为什么必须提交到 Git？

```
Podfile.lock 记录了所有 Pod 的精确版本号和依赖关系。

不提交 lock 的后果：
  - 开发者 A 安装了 SDWebImage 5.18.0
  - 开发者 B 一周后安装了 5.19.0（有 breaking change）
  - B 的代码在 A 的环境上编译失败
  - CI 每次构建可能用不同版本

提交 lock 后：
  - 所有人 pod install 得到完全一致的版本
  - 只有显式 pod update 才会更新版本
```

### Q5：如何创建和发布一个私有 Pod？

```
1. pod lib create MyLib 创建模板
2. 在 Classes/ 中编写代码
3. 完善 MyLib.podspec（源码路径、依赖、资源等）
4. pod lib lint 本地验证
5. 提交代码并打 Tag（Tag 版本要和 podspec 中一致）
6. pod repo push private-repo MyLib.podspec 推到私有 Spec Repo
7. 使用者在 Podfile 中声明 source 和 pod 即可安装
```

### Q6：什么是二进制化？为什么需要它？

```
二进制化是将 Pod 从源码预编译为 .framework/.xcframework。

解决的问题：
  - 大型项目有 100+ Pod，全部源码编译需要 10-20 分钟
  - 二进制化后编译时间降到 2-5 分钟

实现方式：
  - vendored_frameworks 直接引用预编译产物
  - cocoapods-binary 插件自动化
  - 自建 CI 流水线构建 + CDN 分发

注意事项：
  - 需要 BUILD_LIBRARY_FOR_DISTRIBUTION=YES（Swift 版本兼容）
  - 推荐使用 xcframework（支持多架构）
  - Debug 时可以切回源码方便调试
```

### Q7：CocoaPods 和 SPM 怎么选？

```
CocoaPods 优势：
  - 生态最丰富，几乎所有 iOS 库都支持
  - ObjC 支持完善
  - Subspecs 按需引入
  - post_install 钩子灵活配置
  - 成熟的私有库和二进制化方案

SPM 优势：
  - Apple 官方内置，无需额外安装
  - Swift 原生支持
  - 去中心化，配置简单
  - 编译速度较快

推荐策略：
  - 新纯 Swift 项目优先 SPM
  - 有大量 ObjC 依赖或需要复杂配置用 CocoaPods
  - 两者可以共存
```

### Q8：Subspecs 有什么用？怎么设计？

```
Subspecs 允许一个 Pod 拆分为多个子模块，使用者按需安装。

典型场景：
  - 核心功能 + 可选扩展（如 AFNetworking 拆分 NSURLSession、Reachability 等）
  - 减少引入不需要的代码和依赖
  - 使用者只引入需要的部分

设计原则：
  - Core subspec 包含最基础的功能
  - 其他 subspec 依赖 Core
  - 通过 default_subspecs 定义默认安装的子模块
  - 每个 subspec 有独立的 source_files 和 dependency
```

### Q9：resource_bundles 和 resources 的区别？

```
resources：
  - 直接复制资源到主 Bundle
  - 可能与主工程或其他 Pod 的资源命名冲突
  - 访问资源用 [NSBundle mainBundle]

resource_bundles（推荐）：
  - 为 Pod 创建独立的 .bundle
  - 资源隔离，不会命名冲突
  - 访问资源需要先获取 Pod 的 Bundle
  - [NSBundle bundleForClass:] + URLForResource:

CocoaPods 官方推荐使用 resource_bundles。
```

### Q10：post_install 钩子有哪些常见用法？

```
1. 统一最低部署版本
   config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'

2. 禁用 Bitcode
   config.build_settings['ENABLE_BITCODE'] = 'NO'

3. 修复 M1 模拟器架构问题
   config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64'

4. 修复 Xcode 14+ Resource Bundle 签名问题
   config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'

5. 为特定 Pod 添加编译宏
   if target.name == 'SomePod'
     config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= []
     config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'CUSTOM_FLAG=1'
   end
```

### Q11：abstract_target 和 inherited! 的作用？

```
abstract_target：定义共享依赖但不生成独立 Target 的容器。
  - 所有子 target 自动继承其 dependencies
  - 不会在 Xcode 项目中创建单独的 project
  - 适合多 target 共享同一组 Pods 的场景

inherited!：在 nested target 中标记继承父 abstract_target 的依赖。
  - 写在 target 的 dependencies 之前
  - 避免重复声明 common pods
  - 仅对 abstract_target 内的 target 有效

最佳实践：使用 abstract_target 提取公共依赖，配合 inherited! 减少重复。
```

示例 Podfile：
```ruby
abstract_target 'Common' do
  pod 'AFNetworking'
  pod 'MBProgressHUD'

  target 'App' do
    inherited!
    pod 'lottie-ios'
  end

  target 'AppTests' do
    inherited!
    pod 'OCMock'
  end
end
```

> **Pitfalls**: inherited! 不会传递到 nested 的再下一级 target，仅限一层继承。
> **Best practice**: 公共依赖放 abstract_target，特有依赖放各自 target，保持 Podfile 层级扁平。

### Q12：CocoaPods 仓库结构（specs repo、CDN 迁移）

CocoaPods 的 specs 仓库原本是一个巨大的 git monorepo（https://github.com/CocoaPods/Specs.git），存放所有 Pod 的 spec 元数据。由于体积膨胀至 1GB+，2019 年起 CocoaPods 1.9+ 默认迁移到 CDN 模式。

**CDN 模式核心变化：**
- 每个 Pod 的 spec 独立存储为 JSON，通过 HTTP 分发
- 不再需要 `pod repo update` 拉取整个 git 仓库
- `pod install` 速度提升 5-10 倍，磁盘占用从 GB 级降至 MB 级
- 源配置从 git URL 变为 CDN URL

迁移方式（已在 CocoaPods 1.9+ 自动处理）：
```ruby
# Podfile — 旧方式（git）
source 'https://github.com/CocoaPods/Specs.git'

# Podfile — 新方式（CDN，1.9+ 默认）
source 'https://cdn.cocoapods.org/'
```

清理旧 trunk repo：`pod repo remove trunk`，之后 `pod install` 会自动下载 CDN index。也可手动删除 `$(pod repo path)/trunk` 目录。

> **Pitfalls**: CDN 模式下 `pod repo update` 不再拉取 trunk specs，但第三方 git repo 仍需 `git pull`。混合使用 CDN 和 git source 时注意 `repo_update` 钩子只作用于 git 源。
> **Best practice**: 新项目直接使用 CocoaPods 1.12+ + CDN 模式，旧项目迁移后删除 trunk git repo 释放空间。

### Q13：Pod spec 创建与版本管理最佳实践

创建一个 CocoaPods spec 让第三方可以 `pod 'YourLib'` 安装你的库。spec 是一个 `.podspec` 文件，描述库的元数据、源码位置、依赖和构建配置。

**最小可用的 podspec 示例：**

```ruby
Pod::Spec.new do |s|
  s.name             = 'MyLibrary'
  s.version          = '1.0.0'
  s.summary          = 'A concise one-line description'
  s.description      = 'A detailed multi-sentence description'
  s.homepage         = 'https://github.com/user/MyLibrary'
  s.license          = { type: 'MIT', file: 'LICENSE' }
  s.author           = { 'Author' => 'email@example.com' }
  s.source           = { git: 'https://github.com/user/MyLibrary.git', tag: s.version }
  s.ios.deployment_target = '13.0'
  s.source_files     = 'MyLibrary/**/*.{h,m,swift}'
  s.dependency       'AFNetworking', '~> 4.0'
end
```

验证与发布流程：
1. 本地验证：`pod lib lint --allow-warnings`
2. 推送 tag：`git tag 1.0.0 && git push origin 1.0.0`
3. 发布到 trunk：`pod trunk push MyLibrary.podspec`

**版本管理策略：**
- 遵循 Semantic Versioning：MAJOR.MINOR.PATCH
- MAJOR 不兼容变更，MINOR 新增功能，PATCH bug 修复
- 使用 `~> 1.2` 锁定 MAJOR 版本（允许 1.2.x 升级）
- trunk 上不可覆盖已发布版本，每次必须递增版本号

> **Pitfalls**: podspec 中 source 的 tag 必须与 s.version 完全匹配，且该 tag 已推送到远端，否则 trunk push 失败。
> **Best practice**: 使用 `pod trunk me` 先注册账户，`pod trunk push --verbose` 查看详细日志，发布前务必在 CI 中跑 `pod lib lint`。

### Q14: CocoaPods vs SPM vs Carthage 2024+ 对比

iOS 三大依赖管理工具的核心理念差异：CocoaPods 下载源码集成到 Workspace，SPM 是 Apple 官方标准且与 Xcode 深度集成，Carthage 构建.framework 而非修改项目结构。2024+ 的选型关键不在功能差距，而在团队协作成本和构建性能。

**对比矩阵：**

| 维度 | CocoaPods | SPM | Carthage |
|------|-----------|-----|----------|
| 语言支持 | Swift + ObjC | 仅 Swift | Swift + ObjC |
| Xcode 集成 | 需 .xcworkspace | 原生内置 | 手动添加 |
| 构建产物 | .a/.framework | Swift Package | .framework |
| 缓存机制 | DerivedData + Pods | TCA Cache | Carthage Cache |
| 闭源分发 | s.static_framework | Binary target | XCFramework |
| CI 友好度 | 需 pod install | git clone 即编译 | carthage build |
| 社区生态 | 最丰富 (70k+ pods) | 快速增长 | 中等 |

**选型建议：**
- 纯 Swift 新项目 → SPM（零配置，Apple 背书）
- 混合 ObjC/Swift + 大量第三方库 → CocoaPods（兼容性最好）
- 需要闭源分发 + CI 可控 → Carthage（不侵入项目）
- 混合使用：CocoaPods 管理 ObjC 依赖 + SPM 管理 Swift 依赖（双管齐下）

```ruby
# Podfile 中混合引用 SPM 包（CocoaPods 1.12+）
abstract_target 'Shared' do
  pod 'AFNetworking'          # CocoaPods 依赖
  pod 'Linter/SPM'            # 引入 SPM 包
end
```

> **Pitfalls**: SPM 不支持 Objective-C 库，混合项目中强行全迁 SPM 会导致 ObjC 依赖断裂。CocoaPods 的 `use_frameworks!` 与 SPM 产物共存时需注意 Bitcode 和架构冲突。
> **Best practice**: 新项目优先 SPM，渐进式迁移；存量 CocoaPods 项目通过 `pod 'Linter/SPM'` 桥接，避免一次性重构。
### XCFramework 打包用于二进制分发

XCFramework 是 Apple 推荐的二进制分发格式，支持同时包含模拟器(i386/x86_64/arm64)和真机(arm64)架构，消除传统 .framework 在模拟器切换时的架构冲突问题。自 Xcode 11 引入，已成为闭源库分发的行业标准。

**打包流程：**

```bash
# 1. 构建模拟器架构
xcodebuild archive -scheme MyLibrary -destination 'generic/platform=iOS Simulator' -archivePath build/MyLibrarySim.xcarchive SKIP_INSTALL=NO ONLY_ACTIVE_ARCH=NO

# 2. 构建真机架构
xcodebuild archive -scheme MyLibrary -destination 'generic/platform=iOS' -archivePath build/MyLibraryDevice.xcarchive SKIP_INSTALL=NO ONLY_ACTIVE_ARCH=NO

# 3. 合并为 XCFramework
xcodebuild -create-xcframework \\
  -framework build/MyLibrarySim.xcarchive/Products/usr/local/lib/MyLibrary.framework \\
  -framework build/MyLibraryDevice.xcarchive/Products/usr/local/lib/MyLibrary.framework \\
  -output MyLibrary.xcframework
```

**Podspec 中使用 XCFramework：**

```ruby
s.vendored_frameworks = 'MyLibrary.xcframework'
# 替代传统的 s.frameworks 或 s.libraries
```

> **Pitfalls**: XCFramework 一旦打包不可修改，每次变更需重新构建且版本号递增。Bitcode 已在 Xcode 13 废弃，无需再考虑 bitcode 变体。
> **Best practice**: 在 CI 中自动化打包流程，配合 Fastlane 的 `create_xcframework` action，发布前用 `xcrun xcframework validate` 验证完整性。

### CocoaPods 插件开发（generate、install、update 命令）

CocoaPods 提供了完整的插件 API，允许开发者扩展 `pod` 命令行工具的功能。通过继承 `Pod::Plugin` 接口，可以注册自定义命令、钩子脚本、和 source 扩展。Zalo, Slather, Specta 等知名工具都基于此机制构建。

**核心插件结构：**

```ruby
module MyPodPlugin
  class Generator < Pod::Plugin
    def self.command_define
      Pod::Command::Behavior::Generator.new(
        'generate', 'gen',
        'Generate custom assets'
      ) do |command|
        command.syntax = 'pod gen [TARGET]'
        command argument :name, required: true
        command option '--output PATH'
        def command.execute(target_name)
          puts "Generating for #{target_name}"
          # 访问项目配置
          installer.config
        end
      end
    end

    def self.hooks
      { 'pods-merged' => ->(installer) { puts 'Post-install hook' } }
    end
  end
end
```

**安装与注册：**

```bash
# 作为 gem 发布后
gem install my-pod-plugin
# 插件自动注册，无需额外配置

# 项目级插件（通过 Podfile）
plugin 'my-pod-plugin', { 'verbose' => true }
```

> **Pitfalls**: 插件在 `pod install` 和 `pod update` 的生命周期中多次被加载，避免在 `command_define` 中执行 I/O。Hook 回调中不要修改 `Podfile`，否则导致无限循环。
> **Best practice**: 插件发布到 RubyGems 实现全局可用；项目级配置通过 `plugin` DSL 传递参数，保持灵活性和可复用性。

### Specs CDN vs 基于 git 的 specs repo

CocoaPods 的 specs repository 存储了所有 Pod 的元数据信息。传统方式使用基于 git 的 master specs repo（`https://github.com/CocoaPods/Specs`），每次 install/update 时 clone 整个仓库，包含数十万 spec 文件，导致首次安装极慢。自 CocoaPods 1.1.0 起引入了 CDN specs（`trunk` CDN），将 spec 以独立的 `.json` 文件托管在 CDN 上，只在需要时下载对应版本，大幅提升了速度。

```ruby
# Podfile 中配置 sources
# 传统 git-based specs（慢，首次 clone 约 300MB+）
source 'https://github.com/CocoaPods/Specs.git'

# CDN specs（推荐，仅下载需要的 spec，秒级完成）
source 'https://cdn.cocoapods.org/'

# 混合使用（添加私有 specs 时保留 trunk CDN）
source 'https://cdn.cocoapods.org/'
source 'https://private-specs.internal.com/'
```

**关键差异对比：**

| 特性 | Git-based Specs | CDN Specs |
|------|----------------|-----------|
| 首次安装 | 3-10 分钟（clone 整个 repo） | 5-15 秒（按需下载） |
| 磁盘占用 | ~300MB（完整 repo） | ~10MB（仅缓存已用 spec） |
| 更新速度 | 慢（git pull 大仓库） | 快（仅拉取变更 spec） |
| 搜索支持 | `pod search` 本地索引 | `pod search` 需联网查询 |
| 兼容性 | 所有 CocoaPods 版本 | >= 1.1.0 |

> **Pitfalls**: `pod search` 在 CDN 模式下依赖远程索引，网络不佳时会超时。CocoaPods 1.9.0+ 引入了本地 cache 机制缓解此问题，但仍不如 git 模式的离线搜索体验。迁移后旧项目的 `~/.cocoapods/repos/trunk` 目录可安全删除。
> **Best practice**: 新项目统一使用 `source 'https://cdn.cocoapods.org/'`，私有 specs 通过 `private_host` 配置独立 CDN，避免与公共 specs 混用导致版本冲突。定期 `pod cache clean --everything` 清除过期缓存。

### 私有 Pod 仓库搭建

在实际项目中，团队常需要将内部模块通过 CocoaPods 管理，避免手动拷贝 `.a`/`.framework`。搭建私有 Pod 仓库需要两个核心组件：**Specs Repo**（元数据索引）和 **Package Host**（二进制或源码托管）。

**搭建流程：**

```ruby
# 1. 初始化私有 specs repo
pod repo add PrivateSpecs https://gitlab.internal/specs.git

# 2. 开发私有 Pod
pod lib create MyPrivatePod
# 编辑 podspec 后推送到代码仓库并打 tag
git tag 0.1.0 && git push --tags

# 3. 提交 spec 到私有 specs repo
pod repo push PrivateSpecs MyPrivatePod.podspec
# 或使用 trunk 模式（如 Codyfi）
pod trunk push --sources=https://gitlab.internal/specs.git MyPrivatePod.podspec
```

```ruby
# Podfile 中使用私有 Pod
source 'https://cdn.cocoapods.org/'
source 'https://gitlab.internal/specs.git'

target 'MyApp' do
  pod 'MyPrivatePod', '~> 0.1'
end
```

> **Pitfalls**: 私有 specs repo 必须是 bare git 仓库，否则 `pod repo push` 会失败。Specs 和源码库路径必须一致，`podspec` 中 `source` 字段指向源码库，`source_files` 路径相对于源码根目录。版本号冲突时（trunk 和私有 repo 同时存在同名不同版本），CocoaPods 可能解析错误。
> **Best practice**: 使用 GCDynamicPodspec 或 fastlane supply 自动化 spec 提交流程；内网环境通过 GitLab/GitHub Enterprise 同时托管源码和 specs，配合 Nexus/Artifactory 托管二进制包，实现完整的私有依赖闭环。

### post_install hook 优化

`post_install` 是 Podfile 中最常用的 hook，在依赖安装完成后执行。合理使用可显著缩短构建时间、消除重复编译、统一项目配置。

```ruby
post_install do |installer|
  # 1. 统一 Build Configuration 设置
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # 禁用 Bitcode（Xcode 13+ 已废弃）
      config.build_settings['ENABLE_BITCODE'] = 'NO'
      # 启用 Whole Module Optimization 加速编译
      config.build_settings['ENABLE_WHOLE_MODULE_OPTIMIZATION'] = 'YES'
      # 统一 Swift 版本
      config.build_settings['SWIFT_VERSION'] = '5.9'
      # 释放 Dead Code 减少包体积
      config.build_settings['DEAD_CODE_STRIPPING'] = 'YES'
    end
  end

  # 2. 关闭不需要测试的第三方库测试 target
  installer.pods_project.targets.select { |t| t.name.start_with?('Testing') }.each do |t|
    t.remove_from_project
  end

  # 3. 使用 CocoaPods 内置方法统一配置
  installer.pods_project.targets.each do |target|
    target.native_target_specs.each do |spec|
      spec.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.0'
      end
    end
  end
end
```

> **Pitfalls**: `post_install` 中直接修改 `installer.pods_project` 后必须调用 `installer.pods_project.save` 才会持久化，否则仅影响当前 Xcode project 生成。不要在 hook 中执行网络请求或耗时操作，这会拖慢 `pod install`。修改 `build_settings` 时注意 target 层级：`target.build_configurations` 只影响聚合 target，需遍历 `native_target_specs` 才能覆盖每个 spec 的独立配置。
> **Best practice**: 优先使用 CocoaPods 1.9+ 提供的 `install!` options（如 `deterministic_uuids: true`）替代手动修改；将通用配置抽到共享脚本中通过 `eval(File.read('./shared_post_install.rb'))` 复用。

### 依赖解析算法（版本求解器、subspec 依赖图）

CocoaPods 的依赖解析基于 Cane 求解器（内部使用回溯算法），在 1.8.0+ 版本中引入了基于 CDN 的语义化版本缓存机制。当 `Podfile` 中声明多个 Pod 时，求解器构建有向依赖图，通过约束传播与回溯搜索找到满足所有版本约束的解。

```ruby
# Podfile 示例：subspec 依赖图解析
pod 'Alamofire', '~> 5.8'          # 主 spec + 所有 subspec
pod 'SDWebImage', '~> 5.19' do      # block 语法加载特定 subspec
  pod 'SDWebImage/WebPC'
end
pod 'JTSImageViewController', '~> 2.0'

# 依赖图解析顺序
# 1. 下载所有 spec 元数据（CDN cache 加速）
# 2. 构建依赖有向图：Alamofire → Result, SDWebImage → SDWebImageCore + WebPC
# 3. Cane 求解器：约束传播 → 冲突检测 → 回溯求解
# 4. 输出锁定到 Podfile.lock
```

CocoaPods 的 subspec 机制允许将大型库拆分为独立编译单元。`pod 'SDWebImage'` 加载全部 subspec，而 `pod 'SDWebImage/Core'` 仅加载核心模块，通过 `spec.subspec` 在 `.podspec` 中定义依赖关系。

> **Pitfalls**: 循环依赖是求解失败的最常见原因——A 依赖 B 的 subspec1，B 又依赖 A 的 subspec2 时触发 `circular dependency detected`。版本约束过严（如 `= 1.2.3` 精确匹配）导致与其他 Pod 的传递依赖冲突。`pod update` 全局更新时可能引入不必要的版本跳变，应使用 `pod update PodA PodB` 限定范围。
> **Best practice**: 使用 `pod deref` 可视化依赖图定位冲突源头；优先使用 `~>` 兼容操作符而非 `>=`；subspec 按需加载减少编译时间和包体积；定期清理 `Pods/` 并执行 `pod deintegrate && pod install` 避免锁文件漂移。

### Build Phases 与 Script Phase 注入

CocoaPods 通过自动注入 Build Phases 和 Script Phases 到 Xcode target 中管理依赖编译与链接。每个 Pod target 生成独立的 `.a` 静态库或 `.framework`，主 target 通过 LDFLAGS 链接。

```ruby
# CocoaPods 自动注入的 Build Phase（无需手动配置）
# 1. [CP-Check Pods Manifest.lock] — 验证 Pods/ 完整性
# 2. [CP-User] — 用户自定义 script phase（通过 s.script_phase 定义）
# 3. [CP] check manifests / generate info.plist / embed frameworks

# 在 .podspec 中定义 script phase（运行时执行脚本）
Pod::Spec.new do |s|
  s.script_phase = {
    name: 'Generate API Client',
    execution_position: :before_compile,
    input_files: ['${PODS_TARGET_SRCROOT}/api.yaml'],
    output_files: ['${BUILD_DIR}/GeneratedAPI.swift'],
    script: <<-SCRIPT
      #!/bin/sh
      curl -s http://api.internal/spec | swift-gen > ${SCRIPT_OUTPUT_FILE_0}
    SCRIPT
  }
end
```

CocoaPods 的 script_phase 支持 input/output file 追踪，Xcode 据此实现增量编译——仅当 input 变化时才重新执行脚本。`execution_position` 控制脚本在编译前或后运行，配合 `input_file_lines` 可精准控制触发条件。

> **Pitfalls**: 忘记声明 `input_files` 和 `output_files` 导致每次编译都重新执行脚本，严重拖慢构建速度。脚本中硬编码路径导致跨机器失效，必须使用 Xcode 预定义宏（`${SRCROOT}`, `${PODS_ROOT}`）。多个 Pod 注入同名 script phase 时 Xcode 可能重复执行。
> **Best practice**: 优先使用 `prepare_command`（install 时执行）替代 `script_phase`（build 时执行）；脚本中始终检查输出文件是否已存在且未过期；使用 `input_file_lines` 指定触发行实现细粒度增量编译。
