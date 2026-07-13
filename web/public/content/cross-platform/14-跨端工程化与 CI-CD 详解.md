# 跨端工程化与 CI/CD 详解

---

## 一、Monorepo 架构

跨端项目通常涉及多端代码（iOS/Android/Web/后端），Monorepo 是管理多端代码的常见方案。

### 1.1 Monorepo 工具对比

| 工具 | 语言 | 特点 | 适用场景 |
|------|------|------|---------|
| Nx | JS/TS | 增量构建、任务编排、代码生成 | 前端为主的多端项目 |
| Turborepo | JS/TS | 极速构建、远程缓存 | Next.js 生态 |
| Lerna | JS/TS | NPM 包管理 | NPM 包发布 |
| Bazel | 多语言 | Google 开源、支持多语言 | 大型多语言项目 |
| pnpm workspaces | JS/TS | 轻量、硬链接节省空间 | 中小型项目 |

### 1.2 pnpm workspaces + Turborepo 示例

```
my-monorepo/
├── apps/
│   ├── mobile/          # React Native 应用
│   │   ├── package.json
│   │   └── src/
│   ├── web/             # Web 应用
│   │   ├── package.json
│   │   └── src/
│   └── admin/           # 管理后台
│       ├── package.json
│       └── src/
├── packages/
│   ├── shared/          # 共享工具库
│   │   ├── package.json
│   │   └── src/
│   ├── ui/              # 共享 UI 组件
│   │   ├── package.json
│   │   └── src/
│   └── api/             # API 客户端
│       ├── package.json
│       └── src/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
// turbo.json - 任务编排
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

```json
// package.json (root)
{
  "name": "my-monorepo",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "dev": "turbo run dev --parallel"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

### 1.3 共享包引用

```json
// packages/shared/package.json
{
  "name": "@myapp/shared",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

```json
// apps/mobile/package.json
{
  "dependencies": {
    "@myapp/shared": "workspace:*",
    "@myapp/api": "workspace:*"
  }
}
```

---

## 二、代码规范与质量

### 2.1 ESLint + Prettier

```json
// .eslintrc.json
{
  "root": true,
  "extends": [
    "eslint:recommended",
    "@react-native-community",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint", "react", "react-hooks"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  },
  "ignorePatterns": ["dist", "node_modules", "*.lock"]
}
```

```json
// .prettierrc
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 100,
  "arrowParens": "always"
}
```

### 2.2 Husky + lint-staged

```json
// package.json
{
  "scripts": {
    "prepare": "husky install"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yaml}": [
      "prettier --write"
    ]
  }
}
```

```bash
# 安装 Husky
npx husky add .husky/pre-commit "npx lint-staged"
npx husky add .husky/commit-msg 'npx --no-install commitlint --edit "$1"'
```

### 2.3 CommitLint

```javascript
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // 修复
        'docs',     // 文档
        'style',    // 格式
        'refactor', // 重构
        'perf',     // 性能
        'test',     // 测试
        'build',    // 构建
        'ci',       // CI
        'chore',    // 杂务
        'revert',   // 回滚
      ],
    ],
  },
}
```

---

## 三、CI/CD 流水线

### 3.1 GitHub Actions 完整流水线

```yaml
# .github/workflows/mobile-ci.yml
name: Mobile CI/CD

on:
  push:
    branches: [main, develop]
    paths:
      - 'apps/mobile/**'
      - 'packages/**'
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: '20'
  JAVA_VERSION: '17'

jobs:
  # 1. 代码检查
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm --filter @myapp/mobile type-check

  # 2. 单元测试
  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  # 3. Android 构建
  build-android:
    name: Build Android
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: 'temurin'
      - run: pnpm install --frozen-lockfile
      
      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v3
      
      - name: Build APK (Debug)
        working-directory: apps/mobile/android
        run: ./gradlew assembleDebug
        
      - name: Build AAB (Release)
        working-directory: apps/mobile/android
        run: ./gradlew bundleRelease
        env:
          SIGNING_KEY: ${{ secrets.ANDROID_SIGNING_KEY }}
          SIGNING_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          SIGNING_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}
      
      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: android-build
          path: |
            apps/mobile/android/app/build/outputs/apk/debug/*.apk
            apps/mobile/android/app/build/outputs/bundle/release/*.aab

  # 4. iOS 构建
  build-ios:
    name: Build iOS
    runs-on: macos-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      
      - name: Install CocoaPods
        working-directory: apps/mobile/ios
        run: |
          pod repo update
          pod install
      
      - name: Build (Fastlane)
        working-directory: apps/mobile/ios
        run: |
          fastlane build
        env:
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          APP_STORE_CONNECT_API_KEY: ${{ secrets.APP_STORE_API_KEY }}

  # 5. 发布
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: [build-android, build-ios]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Download Android Artifact
        uses: actions/download-artifact@v4
        with:
          name: android-build
      
      - name: Deploy to Firebase App Distribution
        uses: wzieba/Firebase-Distribution-Github-Action@v1
        with:
          appId: ${{ secrets.FIREBASE_APP_ID_ANDROID }}
          serviceCredentialsFileContent: ${{ secrets.FIREBASE_CREDENTIALS }}
          groups: testers
          file: app-debug.apk
```

### 3.2 Fastlane 配置

```ruby
# ios/fastlane/Fastfile
default_platform(:ios)

platform :ios do
  desc "Build the iOS app"
  lane :build do
    # 1. 证书管理
    match(
      type: "appstore",
      readonly: is_ci
    )
    
    # 2. 增加构建号
    increment_build_number(
      build_number: ENV["GITHUB_RUN_NUMBER"]
    )
    
    # 3. 构建
    build_app(
      scheme: "MyApp",
      export_method: "app-store",
      include_bitcode: false
    )
  end
  
  desc "Upload to TestFlight"
  lane :beta do
    build
    
    upload_to_testflight(
      skip_waiting_for_build_processing: true,
      groups: ["Internal Testers"]
    )
  end
  
  desc "Upload to App Store"
  lane :release do
    build
    
    upload_to_app_store(
      skip_metadata: true,
      skip_screenshots: true
    )
  end
end
```

```ruby
# android/fastlane/Fastfile
default_platform(:android)

platform :android do
  desc "Build and sign Android release"
  lane :build do
    gradle(
      task: "clean bundleRelease",
      project_dir: "android/"
    )
  end
  
  desc "Deploy to Play Store (Internal)"
  lane :beta do
    upload_to_play_store(
      track: "internal",
      aab: "android/app/build/outputs/bundle/release/app-release.aab",
      skip_upload_metadata: true,
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end
end
```

---

## 四、版本管理

### 4.1 语义化版本

```
MAJOR.MINOR.PATCH
   1     2     3

MAJOR: 不兼容的 API 变更
MINOR: 向下兼容的功能新增
PATCH: 向下兼容的问题修复
```

### 4.2 自动化版本管理（Changesets）

```bash
# 1. 添加 changeset
npx changeset

# 2. 发布版本（自动 bump 版本号 + 生成 CHANGELOG）
npx changeset version

# 3. 发布
npx changeset publish
```

### 4.3 React Native 版本管理

```json
// package.json
{
  "version": "1.2.3",
  "scripts": {
    "version:bump": "node scripts/bump-version.js"
  }
}
```

```javascript
// scripts/bump-version.js
const fs = require('fs')
const path = require('path')

// 同步更新 iOS 和 Android 版本号
const packageJson = require('../package.json')
const version = packageJson.version
const [major, minor, patch] = version.split('.').map(Number)
const buildNumber = process.env.BUILD_NUMBER || 1

// iOS: Update Info.plist or project.pbxproj
const pbxprojPath = path.join(__dirname, '../ios/MyApp.xcodeproj/project.pbxproj')
let pbxproj = fs.readFileSync(pbxprojPath, 'utf8')
pbxproj = pbxproj.replace(
  /MARKETING_VERSION = [\d.]+;/g,
  `MARKETING_VERSION = ${version};`
)
pbxproj = pbxproj.replace(
  /CURRENT_PROJECT_VERSION = \d+;/g,
  `CURRENT_PROJECT_VERSION = ${buildNumber};`
)
fs.writeFileSync(pbxprojPath, pbxproj)

// Android: Update build.gradle
const gradlePath = path.join(__dirname, '../android/app/build.gradle')
let gradle = fs.readFileSync(gradlePath, 'utf8')
gradle = gradle.replace(
  /versionCode \d+/,
  `versionCode ${buildNumber}`
)
gradle = gradle.replace(
  /versionName "[\d.]+"/,
  `versionName "${version}"`
)
fs.writeFileSync(gradlePath, gradle)

console.log(`Version updated to ${version} (build ${buildNumber})`)
```

---

## 五、热更新

### 5.1 React Native 热更新

**CodePush（App Center）**：

```bash
# 安装
npm install react-native-code-push

# 配置
# iOS: 在 AppDelegate 中引入 CodePush
# Android: 在 MainApplication 中配置
```

```typescript
// 代码中配置
import codePush from 'react-native-code-push'

const codePushOptions = {
  checkFrequency: codePush.CheckFrequency.ON_APP_RESUME,
  installMode: codePush.InstallMode.ON_NEXT_RESTART,
  mandatoryInstallMode: codePush.InstallMode.IMMEDIATE,
  updateDialog: {
    title: '更新可用',
    optionalUpdateMessage: '新版本可用，是否立即更新？',
    optionalInstallButtonLabel: '更新',
    optionalIgnoreButtonLabel: '稍后',
    mandatoryUpdateMessage: '有重要更新，必须安装',
    mandatoryContinueButtonLabel: '继续',
  },
}

export default codePush(codePushOptions)(App)

// 手动检查更新
async function checkForUpdate() {
  const update = await codePush.checkForUpdate()
  if (update) {
    console.log('Update available:', update.label)
    await codePush.sync({
      installMode: codePush.InstallMode.ON_NEXT_RESTART,
    })
  }
}
```

**发布更新**：

```bash
# 发布到 Staging
appcenter codepush release -a <owner>/<app> -d Staging -c ./dist -t "1.0.0"

# 发布到 Production
appcenter codepush release -a <owner>/<app> -d Production -c ./dist -t "1.0.0" --mandatory
```

### 5.2 Flutter 热更新（Shorebird）

```bash
# 安装 Shorebird CLI
dart pub global activate shorebird_cli

# 初始化
shorebird init

# 创建第一个版本
shorebird release android

# 发布热更新
shorebird patch android
```

```dart
// Flutter 代码中检查更新
import 'package:shorebird_code_push/shorebird_code_push.dart';

final shorebird = ShorebirdCodePush();

Future<void> checkForUpdate() async {
  final isAvailable = await shorebird.isNewPatchAvailableForDownload();
  if (isAvailable) {
    await shorebird.downloadUpdateIfAvailable();
    // 提示用户重启应用
  }
}
```

---

## 六、自动化测试

### 6.1 单元测试

```typescript
// React Native - Jest
// __tests__/useAuth.test.ts
import { renderHook, act } from '@testing-library/react-hooks'
import { useAuth } from '../src/hooks/useAuth'

jest.mock('../src/api/auth', () => ({
  login: jest.fn(),
}))

describe('useAuth', () => {
  it('should login successfully', async () => {
    const { result } = renderHook(() => useAuth())
    
    await act(async () => {
      await result.current.login('test@example.com', 'password')
    })
    
    expect(result.current.user).not.toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
  
  it('should handle login error', async () => {
    const { login } = require('../src/api/auth')
    login.mockRejectedValueOnce(new Error('Invalid credentials'))
    
    const { result } = renderHook(() => useAuth())
    
    await act(async () => {
      try {
        await result.current.login('wrong@example.com', 'wrong')
      } catch (e) {
        // expected
      }
    })
    
    expect(result.current.error).toBe('Invalid credentials')
    expect(result.current.user).toBeNull()
  })
})
```

```dart
// Flutter - test
// test/login_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:my_app/services/auth_service.dart';

class MockAuthService extends Mock implements AuthService {}

void main() {
  group('LoginUseCase', () {
    late MockAuthService authService;
    late LoginUseCase useCase;

    setUp(() {
      authService = MockAuthService();
      useCase = LoginUseCase(authService);
    });

    test('returns user on successful login', () async {
      when(authService.login('test@example.com', 'pass'))
          .thenAnswer((_) async => User(id: 1, name: 'Test'));

      final result = await useCase.execute('test@example.com', 'pass');

      expect(result.name, equals('Test'));
      verify(authService.login('test@example.com', 'pass')).called(1);
    });

    test('throws on invalid credentials', () async {
      when(authService.login('wrong', 'wrong'))
          .thenThrow(AuthException('Invalid credentials'));

      expect(
        () => useCase.execute('wrong', 'wrong'),
        throwsA(isA<AuthException>()),
      );
    });
  });
}
```

### 6.2 E2E 测试（Detox - RN）

```javascript
// e2e/login.e2e.js
describe('Login', () => {
  beforeAll(async () => {
    await device.launchApp()
  })

  beforeEach(async () => {
    await device.reloadReactNative()
  })

  it('should show login form', async () => {
    await expect(element(by.id('email-input'))).toBeVisible()
    await expect(element(by.id('password-input'))).toBeVisible()
    await expect(element(by.id('login-button'))).toBeVisible()
  })

  it('should login with valid credentials', async () => {
    await element(by.id('email-input')).typeText('test@example.com')
    await element(by.id('password-input')).typeText('password123\n')
    await element(by.id('login-button')).tap()

    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10000)
  })

  it('should show error with invalid credentials', async () => {
    await element(by.id('email-input')).typeText('wrong@example.com')
    await element(by.id('password-input')).typeText('wrongpass\n')
    await element(by.id('login-button')).tap()

    await expect(element(by.text('Invalid credentials'))).toBeVisible()
  })
})
```

### 6.3 E2E 测试（integration_test - Flutter）

```dart
// integration_test/login_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:my_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Login Flow', () {
    testWidgets('successful login', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // 输入凭据
      await tester.enterText(
        find.byKey(const Key('email-field')),
        'test@example.com',
      );
      await tester.enterText(
        find.byKey(const Key('password-field')),
        'password123',
      );

      // 点击登录
      await tester.tap(find.byKey(const Key('login-button')));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // 验证跳转到主页
      expect(find.byKey(const Key('home-screen')), findsOneWidget);
    });
  });
}
```

---

## 七、发布流程

### 7.1 发布检查清单

```
发布前检查：
□ 所有 PR 已合并
□ 版本号已更新（package.json, iOS, Android）
□ CHANGELOG 已更新
□ 代码审查通过
□ 单元测试通过
□ E2E 测试通过
□ 性能测试达标（启动时间、FPS、内存）
□ 灰度计划已制定
□ 回滚方案已确认

发布流程：
1. 创建发布分支 release/v1.2.0
2. 运行 CI 构建和测试
3. 生成签名包
4. 上传到测试平台（TestFlight / Play Console Internal）
5. QA 验收
6. 灰度发布（逐步扩大范围）
7. 全量发布
8. 标记 Git Tag
9. 合并到 main 分支
```

### 7.2 灰度发布策略

```yaml
# 灰度阶段
阶段 1: 内部测试 (TestFlight Internal / Play Internal)
  - 范围: 开发团队
  - 时长: 1-2 天
  - 关注: 崩溃率、核心功能

阶段 2: 灰度 5%
  - 范围: 5% 用户
  - 时长: 3-5 天
  - 关注: 崩溃率 < 0.1%、ANR 率、性能指标

阶段 3: 灰度 20%
  - 范围: 20% 用户
  - 时长: 3-5 天
  - 关注: 用户反馈、业务指标

阶段 4: 灰度 50%
  - 范围: 50% 用户
  - 时长: 3-5 天

阶段 5: 全量发布
  - 回滚条件: 崩溃率 > 1%、核心功能不可用
```

---

## 八、监控与告警

### 8.1 崩溃监控（Sentry）

```typescript
// React Native
import * as Sentry from '@sentry/react-native'

Sentry.init({
  dsn: 'https://xxx@sentry.io/xxx',
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,  // 20% 性能采样
  release: `myapp@${AppVersion.version}`,
})

// 主动上报
try {
  await riskyOperation()
} catch (error) {
  Sentry.captureException(error, {
    tags: { module: 'payment' },
    extra: { orderId: '12345' },
  })
}

// 面包屑
Sentry.addBreadcrumb({
  category: 'navigation',
  message: 'Navigated to /home',
  level: 'info',
})
```

```dart
// Flutter
import 'package:sentry_flutter/sentry_flutter.dart';

Future<void> main() async {
  await SentryFlutter.init(
    (options) {
      options.dsn = 'https://xxx@sentry.io/xxx';
      options.tracesSampleRate = 0.2;
    },
    appRunner: () => runApp(MyApp()),
  );
}

// 主动上报
try {
  await riskyOperation();
} catch (e, stackTrace) {
  await Sentry.captureException(
    e,
    stackTrace: stackTrace,
    withScope: (scope) {
      scope.setTag('module', 'payment');
      scope.setExtra('orderId', '12345');
    },
  );
}
```

### 8.2 性能监控

```typescript
// React Native - 性能标记
import { Performance } from 'react-native-performance'

const startTime = performance.now()

// ... 执行操作

const duration = performance.now() - startTime
if (duration > 1000) {
  Analytics.logEvent('slow_operation', {
    operation: 'fetch_user_data',
    duration_ms: duration,
  })
}
```

```dart
// Flutter - 性能监控
void main() {
  FlutterError.onError = (details) {
    // 上报错误
    Sentry.captureException(details.exception, stackTrace: details.stack);
  };

  // 帧率监控
  WidgetsFlutterBinding.instance.addTimingsCallback((timings) {
    for (final timing in timings) {
      final frameTime = timing.buildDuration + timing.rasterDuration;
      if (frameTime > const Duration(milliseconds: 16)) {
        // 上报掉帧
        debugPrint('Jank detected: ${frameTime.inMilliseconds}ms');
      }
    }
  });

  runApp(MyApp());
}
```

---

## 九、小结

跨端工程化的核心在于代码组织（Monorepo）、代码质量保障（Lint/Test）、自动化构建发布（CI/CD）和线上监控（Crash/Performance）。通过 pnpm workspaces + Turborepo 管理多端代码，GitHub Actions + Fastlane 实现自动化构建和发布，CodePush/Shorebird 实现热更新，Sentry 实现崩溃和性能监控。灰度发布策略能有效降低发布风险，确保应用稳定性。
