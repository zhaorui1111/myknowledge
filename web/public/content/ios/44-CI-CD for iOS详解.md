# CI/CD for iOS 详解

## 一、CI/CD 概念

CI（Continuous Integration，持续集成）是指开发者将代码频繁合并到主分支，每次合并自动运行构建和测试。CD（Continuous Delivery/Deployment，持续交付/部署）是指在 CI 基础上自动打包、分发和发布。

iOS CI/CD 的典型流程：代码提交 → 触发 CI → 依赖安装 → 编译构建 → 单元测试 → UI 测试 → 代码分析 → 签名打包 → TestFlight 分发 → App Store 提交。

## 二、Fastlane

Fastlane 是最流行的 iOS 自动化工具，用 Ruby 编写，提供声明式的 Lane 定义。

### 2.1 安装

```bash
# 通过 Homebrew
brew install fastlane

# 或通过 Gem
sudo gem install fastlane

# 在项目根目录初始化
cd MyProject
fastlane init
```

生成 `fastlane/` 目录，包含 `Fastfile`（流程定义）和 `Appfile`（App 配置）。

### 2.2 Appfile

```ruby
app_identifier("com.example.MyApp")  # Bundle ID
apple_id("developer@example.com")     # Apple ID
team_id("ABCDE12345")                 # Team ID
```

### 2.3 Fastfile

```ruby
default_platform(:ios)

platform :ios do
  desc "运行测试"
  lane :test do
    run_tests(
      project: "MyApp.xcodeproj",
      scheme: "MyApp",
      device: "iPhone 15",
      clean: true
    )
  end

  desc "构建并上传到 TestFlight"
  lane :beta do
    increment_build_number
    build_app(
      scheme: "MyApp",
      export_method: "app-store",
      include_bitcode: false
    )
    upload_to_testflight(
      skip_waiting_for_build_processing: true
    )
  end

  desc "提交到 App Store"
  lane :release do
    build_app(scheme: "MyApp", export_method: "app-store")
    upload_to_app_store(
      skip_metadata: true,
      skip_screenshots: true
    )
  end
end
```

### 2.4 常用 Action

```ruby
# 版本号管理
increment_version_number(version_number: "2.0.0")
increment_build_number

# 签名管理
match(type: "appstore", readonly: true)  # 从 Git 仓库同步证书
get_certificates
get_provisioning_profile

# 构建
gym(scheme: "MyApp", export_method: "ad-hoc")  # 等同于 build_app

# 测试
scan(scheme: "MyApp", device: "iPhone 15")  # 等同于 run_tests

# 截图
capture_screenshots(scheme: "MyAppUITests")

# 上传
upload_to_testflight
upload_to_app_store
pilot  # TestFlight 测试者管理
```

### 2.5 Match 证书管理

Match 将签名证书和描述文件存储在 Git 仓库（加密），团队成员共享：

```bash
# 初始化
fastlane match init
# 选择 git，输入仓库 URL 和加密密码

# 生成并存储证书
fastlane match appstore
fastlane match development
fastlane match adhoc

# CI 中只读模式获取
fastlane match appstore --readonly
```

CI 环境中使用 `MATCH_PASSWORD` 环境变量提供解密密码。确保 Git 仓库是私有的。

## 三、签名与分发

### 3.1 签名方式

Xcode 支持自动签名（Automatically manage signing）和手动签名。CI 中推荐手动签名以获得完全控制。

```bash
# xcodebuild 手动签名
xcodebuild \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -configuration Release \
    -archivePath build/MyApp.xcarchive \
    archive \
    CODE_SIGN_IDENTITY="iPhone Distribution" \
    PROVISIONING_PROFILE_SPECIFIER="MyApp_AppStore_Profile"
```

### 3.2 导出 IPA

```bash
# ExportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>  <!-- app-store / ad-hoc / enterprise / development -->
    <key>teamID</key>
    <string>ABCDE12345</string>
    <key>uploadSymbols</key>
    <true/>
    <key>uploadBitcode</key>
    <false/>
</dict>
</plist>

# 导出
xcodebuild -exportArchive \
    -archivePath build/MyApp.xcarchive \
    -exportOptionsPlist ExportOptions.plist \
    -exportPath build/export
```

### 3.3 TestFlight 分发

```bash
# 通过 xcrun altool 上传
xcrun altool \
    --upload-app \
    -f build/export/MyApp.ipa \
    -t ios \
    -u "developer@example.com" \
    -p "app-specific-password" \
    --verbose

# 或通过 Xcode API（Xcode 14+）
xcrun notarytool submit build/export/MyApp.ipa \
    --apple-id "developer@example.com" \
    --password "app-specific-password" \
    --team-id "ABCDE12345"
```

App-specific password 在 appleid.apple.com 生成。

## 四、GitHub Actions

### 4.1 基本 Workflow

```yaml
# .github/workflows/ios-ci.yml
name: iOS CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v4

      - name: Select Xcode
        run: sudo xcode-select -switch /Applications/Xcode_16.0.app

      - name: Install dependencies
        run: |
          cd MyApp
          pod install

      - name: Build and Test
        run: |
          xcodebuild test \
            -workspace MyApp.xcworkspace \
            -scheme MyApp \
            -destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' \
            -enableCodeCoverage YES \
            | xcpretty --report html

      - name: Upload coverage
        uses: codecov/codecov-action@v4
```

### 4.2 Fastlane 集成

```yaml
- name: Setup Ruby
  uses: ruby/setup-ruby@v1
  with:
    ruby-version: '3.2'

- name: Install Fastlane
  run: gem install fastlane

- name: Run Fastlane
  env:
    MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
    APP_STORE_CONNECT_API_KEY: ${{ secrets.APP_STORE_CONNECT_API_KEY }}
  run: |
    cd MyApp
    fastlane beta
```

### 4.3 缓存优化

```yaml
- name: Cache CocoaPods
  uses: actions/cache@v4
  with:
    path: |
      ~/.cocoapods
      MyApp/Pods
    key: ${{ runner.os }}-pods-${{ hashFiles('**/Podfile.lock') }}
    restore-keys: |
      ${{ runner.os }}-pods-

- name: Cache SPM
  uses: actions/cache@v4
  with:
    path: |
      ~/Library/Developer/Xcode/DerivedData
      .build
    key: ${{ runner.os }}-spm-${{ hashFiles('**/Package.resolved') }}
```

## 五、Xcode Cloud

### 5.1 概述

Xcode Cloud 是 Apple 官方的 CI/CD 服务，集成在 Xcode 和 App Store Connect 中。不需要管理 CI 服务器，直接在 Xcode 中配置。

### 5.2 配置

在 Xcode → Product → Cloud Workflow 中创建工作流：

- **条件**：触发分支、PR 规则
- **环境**：Xcode 版本、iOS 版本
- **操作**：Build、Test、Analyze、Archive
- **后处理**：TestFlight 分发、通知

### 5.3 自定义脚本

在项目中创建 `ci_scripts/ci_post_clone.sh`：

```bash
#!/bin/sh
# 在代码检出后执行
cd $CI_PRIMARY_REPOSITORY_PATH

# 安装依赖
pod install

# 或 SPM
# swift package resolve
```

`ci_post_clone.sh`：代码检出后执行
`ci_pre_xcodebuild.sh`：构建前执行
`ci_post_xcodebuild.sh`：构建后执行

### 5.4 优势与限制

优势：零配置、原生集成、免费额度（25 小时/月）、直接在 App Store Connect 管理。

限制：灵活性不如自建 CI（GitHub Actions/Jenkins）、自定义脚本能力有限、只支持 Apple 平台。

## 六、CI 最佳实践

### 6.1 构建速度优化

选择合适的 Runner：GitHub Actions 的 macOS runner 比自建 Mac Mini 慢，但免维护。对于频繁构建的团队，自建 Mac Mini CI 更经济。

增量构建：缓存 DerivedData、CocoaPods/SPM 依赖。避免每次 `clean`。

并行测试：将测试分割为多个 shard 并行执行：

```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - name: Test shard ${{ matrix.shard }}
    run: |
      fastlane test shard:${{ matrix.shard }} total:4
```

### 6.2 代码质量门禁

```yaml
- name: SwiftLint
  run: |
    brew install swiftlint
    swiftlint --strict --reporter github-actions-logging

- name: Check code coverage
  run: |
    COVERAGE=$(xcrun xccov view --report --json MyApp.xcresult | jq '.lineCoverage')
    if (( $(echo "$COVERAGE < 0.8" | bc -l) )); then
      echo "Coverage $COVERAGE is below 80%"
      exit 1
    fi
```

### 6.3 分发策略

多环境分发：开发版（Debug build → Firebase/AppCenter）、测试版（Release build → TestFlight 内部测试）、灰度版（Release build → TestFlight 外部测试）、正式版（Release build → App Store）。

```ruby
lane :staging do
  # 上传到 Firebase App Distribution
  firebase_app_distribution(
    app: "1:123:ios:abc",
    groups: "testers"
  )
end

lane :beta do
  # TestFlight 内部测试
  upload_to_testflight(
    distribute_external: false,
    groups: ["Internal Testers"]
  )
end
```

## 七、自动截图

### 7.1 Fastlane Snapshot

```ruby
lane :screenshots do
  capture_screenshots(scheme: "MyAppUITests")
end
```

```swift
// MyAppUITests/SnapshotHelper.swift（Fastlane 自动生成）
class ScreenshotTests: XCTestCase {
    func testScreenshots() {
        let app = XCUIApplication()
        app.launch()

        snapshot("01_HomeScreen")

        app.buttons["settings"].tap()
        snapshot("02_SettingsScreen")
    }
}
```

支持多语言和多设备自动截图，截图可以自动上传到 App Store Connect。

## 八、常见问题

**CI 签名失败**：检查证书和描述文件是否正确安装。使用 `match` 统一管理。CI 中使用 `--readonly` 模式。

**模拟器启动超时**：CI 环境模拟器启动较慢，增加超时时间。使用 `xcrun simctl boot` 预先启动模拟器。

**Xcode 版本不匹配**：CI 中的 Xcode 版本应与本地一致。在 workflow 中明确指定 Xcode 版本。

**Pod/SPM 缓存失效**：Podfile.lock 或 Package.resolved 变化时缓存失效是正常的。确保 lock 文件提交到版本控制。
