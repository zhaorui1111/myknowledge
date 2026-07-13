# Kotlin Multiplatform 与其他跨端方案

---

## 一、Kotlin Multiplatform (KMP)

### 1.1 KMP 概述

Kotlin Multiplatform 是 JetBrains 推出的跨平台技术，允许使用 Kotlin 编写共享业务逻辑，各平台保留原生 UI。与 Flutter/RN 不同，KMP 不替代 UI 层，而是聚焦于逻辑层共享。

```
┌─────────────────────────────────────────────────────────────────┐
│                    KMP 架构                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐      │
│   │            Common Module (shared Kotlin)              │      │
│   │  ┌─────────┐  ┌──────────┐  ┌─────────────────┐    │      │
│   │  │ Domain  │  │ Data     │  │   Network       │    │      │
│   │  │ (Logic) │  │ (Repo)   │  │   (Ktor)        │    │      │
│   │  └─────────┘  └──────────┘  └─────────────────┘    │      │
│   │  ┌─────────────────────────────────────────────┐   │      │
│   │  │         expect/actual platform declarations   │   │      │
│   │  └─────────────────────────────────────────────┘   │      │
│   └─────────────────────────────────────────────────────┘      │
│              ↕                    ↕                    ↕       │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐  │
│   │   Android     │     │     iOS      │     │    Desktop   │  │
│   │  (Jetpack     │     │  (SwiftUI/   │     │  (Compose    │  │
│   │  Compose)     │     │   UIKit)     │     │  Desktop)    │  │
│   └──────────────┘     └──────────────┘     └──────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 KMP vs 其他跨端方案

| 特性 | KMP | Flutter | React Native |
|------|-----|---------|--------------|
| 共享范围 | 业务逻辑 | UI + 逻辑 | UI + 逻辑 |
| UI 实现 | 各平台原生 | 自绘 | 原生组件映射 |
| 语言 | Kotlin | Dart | JavaScript/TypeScript |
| 互操作 | 与原生无缝 | 需 Platform Channel | 需 Native Module |
| 编译产物 | 各平台原生二进制 | 自带引擎 | JS Bundle |
| 学习曲线 | 低（Kotlin 开发者） | 中 | 低（前端开发者） |
| 生态 | Kotlin 生态 | Dart 生态 | NPM 生态 |

### 1.3 项目结构

```
MyKMPApp/
├── shared/                      # 共享模块
│   ├── build.gradle.kts
│   └── src/
│       ├── commonMain/          # 平台无关代码
│       │   └── kotlin/
│       │       ├── domain/
│       │       │   ├── model/User.kt
│       │       │   └── usecase/LoginUseCase.kt
│       │       ├── data/
│       │       │   ├── api/ApiClient.kt
│       │       │   └── db/DatabaseHelper.kt
│       │       └── Platform.kt  # expect 声明
│       ├── androidMain/         # Android 实现
│       │   └── kotlin/
│       │       └── Platform.kt  # actual 实现
│       └── iosMain/             # iOS 实现
│           └── kotlin/
│               └── Platform.kt  # actual 实现
├── androidApp/                  # Android 应用
├── iosApp/                      # iOS 应用
└── build.gradle.kts
```

### 1.4 expect/actual 机制

```kotlin
// commonMain/Platform.kt
expect class Platform() {
    val platform: String
}

expect fun getPlatformVersion(): String

expect class DateTimeFormatter() {
    fun format(epochMillis: Long): String
}

// androidMain/Platform.kt
actual class Platform actual constructor() {
    actual val platform: String = "Android ${Build.VERSION.RELEASE}"
}

actual fun getPlatformVersion(): String = Build.VERSION.SDK_INT.toString()

actual class DateTimeFormatter actual constructor() {
    actual fun format(epochMillis: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        return sdf.format(Date(epochMillis))
    }
}

// iosMain/Platform.kt
actual class Platform actual constructor() {
    actual val platform: String = UIDevice.currentDevice.systemVersion()
        .let { "iOS $it" }
}

actual fun getPlatformVersion(): String = 
    UIDevice.currentDevice.systemVersion

actual class DateTimeFormatter actual constructor() {
    actual fun format(epochMillis: Long): String {
        val formatter = NSDateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        val date = NSDate(timeIntervalSince1970 = epochMillis / 1000.0)
        return formatter.string(from = date)
    }
}
```

### 1.5 网络请求（Ktor）

```kotlin
// commonMain
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class User(
    val id: Int,
    val name: String,
    val email: String
)

class UserRepository {
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
    }
    
    suspend fun getUser(id: Int): User {
        return client.get("https://api.example.com/users/$id").body()
    }
    
    suspend fun login(email: String, password: String): User {
        return client.post("https://api.example.com/login") {
            header("Content-Type", "application/json")
            setBody(mapOf("email" to email, "password" to password))
        }.body()
    }
}
```

### 1.6 本地存储（SQLDelight）

```kotlin
// commonMain - 定义 SQL 查询
// .sq 文件
// CREATE TABLE User (
//   id INTEGER NOT NULL PRIMARY KEY,
//   name TEXT NOT NULL,
//   email TEXT NOT NULL
// );
//
// selectAll:
// SELECT * FROM User;
//
// insert:
// INSERT INTO User(id, name, email) VALUES (?, ?, ?);

// commonMain - 使用
class UserDatabase(driver: SqlDriver) {
    private val database = AppDatabase(driver)
    
    fun getAllUsers(): List<User> {
        return database.userQueries.selectAll().executeAsList()
    }
    
    fun insertUser(user: User) {
        database.userQueries.insert(
            id = user.id,
            name = user.name,
            email = user.email
        )
    }
}

// androidMain
actual fun createDriver(): SqlDriver = AndroidSqliteDriver(
    schema = AppDatabase.Schema,
    context = context,
    name = "app.db"
)

// iosMain
actual fun createDriver(): SqlDriver = NativeSqliteDriver(
    AppDatabase.Schema,
    "app.db"
)
```

### 1.7 依赖注入（Koin）

```kotlin
// commonMain
val sharedModule = module {
    single { HttpClient { install(ContentNegotiation) { json() } } }
    single<UserRepository> { UserRepositoryImpl(get()) }
    single<UserDatabase> { UserDatabase(createDriver()) }
    single<LoginUseCase> { LoginUseCase(get()) }
}

// androidApp
fun initKoin() {
    startKoin {
        modules(sharedModule, androidModule)
    }
}

// iosApp (Swift)
class KoinHelper {
    static func start() {
        KoinKt.start { _ in
            // 初始化
        }
    }
}
```

---

## 二、Compose Multiplatform

Compose Multiplatform 是 KMP 的 UI 扩展，允许用 Jetpack Compose 编写多平台 UI。

### 2.1 支持平台

| 平台 | UI 状态 |
|------|--------|
| Android | 稳定 |
| Desktop (JVM) | 稳定 |
| iOS | Beta |
| Web (Wasm) | Alpha |

### 2.2 共享 UI 示例

```kotlin
// commonMain - 共享 UI
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    val state by viewModel.state.collectAsState()
    
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Login",
            style = MaterialTheme.typography.headlineMedium
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        OutlinedTextField(
            value = state.email,
            onValueChange = viewModel::onEmailChange,
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChange,
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = viewModel::login,
            enabled = state.isLoading.not(),
            modifier = Modifier.fillMaxWidth()
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp
                )
            } else {
                Text("Login")
            }
        }
    }
}

// ViewModel
class LoginViewModel(
    private val loginUseCase: LoginUseCase
) : ViewModel() {
    private val _state = MutableStateFlow(LoginState())
    val state: StateFlow<LoginState> = _state.asStateFlow()
    
    fun onEmailChange(email: String) {
        _state.update { it.copy(email = email) }
    }
    
    fun onPasswordChange(password: String) {
        _state.update { it.copy(password = password) }
    }
    
    fun login() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                val user = loginUseCase(_state.value.email, _state.value.password)
                _state.update { it.copy(isLoading = false, user = user) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

// Android 使用
class LoginActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                LoginScreen(viewModel = get())
            }
        }
    }
}

// iOS 使用（通过 ComposeUIViewController）
fun MainViewController() = ComposeUIViewController {
    MaterialTheme {
        LoginScreen(viewModel = get())
    }
}

// Swift 中使用
let viewController = MainKt.MainViewController()
window.rootViewController = viewController
```

---

## 三、HarmonyOS (鸿蒙) ArkTS/ArkUI

### 3.1 ArkTS 语言

ArkTS 是华为在 TypeScript 基础上的扩展，增加了声明式 UI 和状态管理：

```typescript
// ArkTS 声明式 UI
@Entry
@Component
struct LoginPage {
  @State email: string = ''
  @State password: string = ''
  @State isLoading: boolean = false
  @State errorMessage: string = ''

  build() {
    Column({
      space: 16
    }) {
      Text('Login')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .margin({ bottom: 32 })

      TextInput({
        placeholder: 'Email',
        text: this.email
      })
        .type(InputType.Email)
        .onChange((value) => {
          this.email = value
        })
        .width('100%')

      TextInput({
        placeholder: 'Password',
        text: this.password
      })
        .type(InputType.Password)
        .onChange((value) => {
          this.password = value
        })
        .width('100%')

      if (this.errorMessage) {
        Text(this.errorMessage)
          .fontSize(14)
          .fontColor(Color.Red)
      }

      Button(this.isLoading ? 'Loading...' : 'Login')
        .width('100%')
        .enabled(!this.isLoading)
        .onClick(() => {
          this.handleLogin()
        })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .padding(24)
  }

  private handleLogin(): void {
    this.isLoading = true
    this.errorMessage = ''
    
    // 网络请求
    http.createHttp().request(
      'https://api.example.com/login',
      {
        method: http.RequestMethod.POST,
        header: { 'Content-Type': 'application/json' },
        extraData: JSON.stringify({
          email: this.email,
          password: this.password
        })
      },
      (err, data) => {
        this.isLoading = false
        if (err) {
          this.errorMessage = err.message
        } else {
          const result = JSON.parse(data.result as string)
          // 跳转主页
          router.pushUrl({ url: 'pages/Home' })
        }
      }
    )
  }
}
```

### 3.2 状态管理

```typescript
// @State: 组件内状态
@State count: number = 0

// @Prop: 父→子单向传递
@Prop title: string

// @Link: 父↔子双向同步
@Link count: number

// @Provide / @Consume: 跨组件层级传递
@Provide theme: Theme
@Consume theme: Theme

// @Observed / @ObjectLink: 对象观察
@Observed
class User {
  name: string
  age: number
}

@Component
struct UserCard {
  @ObjectLink user: User
  build() { /* ... */ }
}

// AppStorage: 全局状态
AppStorage.SetOrCreate('token', '')
@StorageLink('token') token: string  // 双向绑定
@StorageProp('token') token: string  // 只读

// PersistentStorage: 持久化
PersistentStorage.PersistProps([
  { key: 'token', default: '' }
])
```

### 3.3 ArkUI 组件体系

```typescript
// 常用组件
Column() { /* 垂直布局 */ }
Row() { /* 水平布局 */ }
Stack() { /* 层叠布局 */ }
Flex() { /* 弹性布局 */ }
Grid() { /* 网格布局 */ }
List() { /* 列表 */ }
Swiper() { /* 轮播 */ }
Tabs() { /* 标签页 */ }
Navigation() { /* 导航 */ }

// 常用基础组件
Text('Hello')
Image($r('app.media.icon'))
TextInput({ placeholder: 'Input' })
Button('Click')
Checkbox()
DatePicker()
```

### 3.4 Stage 模型（应用模型）

```json
// module.json5
{
  "module": {
    "name": "entry",
    "type": "entry",
    "abilities": [
      {
        "name": "EntryAbility",
        "srcEntry": "./ets/entryability/EntryAbility.ets",
        "startWindowIcon": "$media:icon",
        "startWindowBackground": "$color:start_window_background"
      }
    ]
  }
}
```

```typescript
// EntryAbility.ets
import UIAbility from '@ohos.app.ability.UIAbility'
import window from '@ohos.window'

export default class EntryAbility extends UIAbility {
  onCreate(want, launchParam) {
    // 初始化
  }

  onWindowStageCreate(windowStage: window.WindowStage) {
    // 加载页面
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        console.error('Failed to load content:', JSON.stringify(err))
      }
    })
  }
}
```

---

## 四、其他跨端方案

### 4.1 Taro（京东）

React 语法多端编译方案：

```tsx
// 一套 React 代码编译到多端
import { View, Text, Button } from '@tarojs/components'
import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  
  return (
    <View>
      <Text>Count: {count}</Text>
      <Button onClick={() => setCount(count + 1)}>Add</Button>
    </View>
  )
}

// 编译到：微信小程序、支付宝小程序、H5、React Native
```

### 4.2 uni-app（DCloud）

Vue 语法多端编译方案：

```vue
<template>
  <view class="container">
    <text>Count: {{ count }}</text>
    <button @click="increment">Add</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'

const count = ref(0)
const increment = () => count.value++
</script>

<!-- 编译到：微信小程序、支付宝小程序、App (WebView/Weex)、H5 -->
```

### 4.3 .NET MAUI（微软）

```csharp
// C# 跨平台
public class MainPage : ContentPage
{
    private int count = 0;
    private Label counterLabel;

    public MainPage()
    {
        counterLabel = new Label { Text = "Count: 0" };
        
        var button = new Button { Text = "Add" };
        button.Clicked += (s, e) => {
            count++;
            counterLabel.Text = $"Count: {count}";
        };

        Content = new StackLayout {
            Children = { counterLabel, button }
        };
    }
}
```

---

## 五、跨端方案横向对比

```
┌─────────────────────────────────────────────────────────────────────┐
│                      跨端方案综合对比                                │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┤
│          │ RN       │ Flutter  │ KMP+CMP  │ ArkUI    │ WebView      │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ 语言     │ TS/JS    │ Dart     │ Kotlin   │ ArkTS    │ HTML/JS/CSS  │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ UI 渲染  │ 原生组件  │ 自绘     │ 原生/CMP │ 原生     │ WebView      │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ 性能     │ 良好      │ 优秀     │ 优秀     │ 优秀     │ 一般         │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ 生态     │ NPM(大)  │ Pub(中)  │ Kotlin   │ 鸿蒙生态  │ Web(最大)   │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ 动态化   │ CodePush │ Shorebird│ 无       │ 无       │ 天然支持     │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ iOS/安卓 │ ✅       │ ✅       │ ✅       │ ❌       │ ✅           │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ Web      │ ✅       │ ✅       │ ✅(CMP)  │ ❌       │ ✅           │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ 鸿蒙     │ ❌       │ ❌       │ ❌       │ ✅       │ ✅           │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│ 桌面端   │ ⚠️       │ ✅       │ ✅       │ ❌       │ ✅           │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘
```

---

## 六、小结

Kotlin Multiplatform 聚焦于业务逻辑层的跨平台共享，UI 保留各平台原生实现，具有互操作性好、学习成本低的优势。Compose Multiplatform 进一步扩展了 UI 共享能力。HarmonyOS 的 ArkTS/ArkUI 是华为为鸿蒙生态打造的声明式 UI 框架，语法类似 TS 但加入了状态管理和组件系统。各跨端方案有各自的定位和适用场景，实际项目中常采用组合策略：核心页面用原生或 Flutter/RN，内容页用 WebView，业务逻辑层用 KMP 共享。
