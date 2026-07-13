# iOS 测试体系详解

## 一、测试金字塔

iOS 测试体系遵循经典的测试金字塔结构：底层是大量单元测试（快速、隔离），中层是适量集成测试（验证模块协作），顶层是少量 UI 测试（验证用户流程）。

单元测试验证单个类/函数的正确性，执行速度极快（毫秒级），不依赖外部系统。集成测试验证多个模块协作的正确性，可能涉及数据库、网络等。UI 测试模拟真实用户操作，执行较慢但覆盖完整用户流程。

## 二、XCTest 单元测试

### 2.1 测试方法结构

```swift
import XCTest
@testable import MyApp

class UserServiceTests: XCTestCase {

    var userService: UserService!

    override func setUp() {
        super.setUp()
        userService = UserService(networkClient: MockNetworkClient())
    }

    override func tearDown() {
        userService = nil
        super.tearDown()
    }

    func testFetchUser_WhenNetworkSucceeds_ReturnsUser() {
        // Given（准备条件）
        let expectedUser = User(id: "1", name: "张三")

        // When（执行操作）
        let user = try? userService.fetchUser(id: "1")

        // Then（验证结果）
        XCTAssertEqual(user?.name, "张三")
        XCTAssertEqual(user?.id, "1")
    }

    func testFetchUser_WhenNetworkFails_ThrowsError() {
        let mockClient = MockNetworkClient(shouldFail: true)
        userService = UserService(networkClient: mockClient)

        XCTAssertThrowsError(try userService.fetchUser(id: "1")) { error in
            guard let serviceError = error as? UserServiceError else {
                XCTFail("Wrong error type")
                return
            }
            XCTAssertEqual(serviceError, .networkError)
        }
    }
}
```

### 2.2 断言方法

```swift
XCTAssertEqual(result, expected)              // 相等
XCTAssertNotEqual(result, unexpected)         // 不等
XCTAssertTrue(condition)                       // 为真
XCTAssertFalse(condition)                      // 为假
XCTAssertNil(value)                            // 为 nil
XCTAssertNotNil(value)                         // 不为 nil
XCTAssertThrowsError(try expression())         // 抛出错误
XCTAssertNoThrow(try expression())             // 不抛出错误
XCTAssertGreaterThan(a, b)                     // a > b
XCTAssertLessThanOrEqual(a, b)                 // a <= b
XCTFail("message")                             // 直接失败
```

### 2.3 异步测试

```swift
func testFetchDataAsync() async throws {
    let result = try await service.fetchData()
    XCTAssertEqual(result.count, 10)
}

// 闭包回调式异步测试
func testFetchDataWithClosure() {
    let expectation = XCTestExpectation(description: "Data fetched")

    service.fetchData { result in
        switch result {
        case .success(let data):
            XCTAssertEqual(data.count, 10)
        case .failure:
            XCTFail("Should succeed")
        }
        expectation.fulfill()
    }

    wait(for: [expectation], timeout: 5.0)
}
```

### 2.4 参数化测试

```swift
func testAddition() {
    let testCases: [(a: Int, b: Int, expected: Int)] = [
        (1, 2, 3),
        (-1, 1, 0),
        (0, 0, 0),
        (100, 200, 300)
    ]

    for testCase in testCases {
        let result = Calculator.add(testCase.a, testCase.b)
        XCTAssertEqual(result, testCase.expected, "Failed for \(testCase.a) + \(testCase.b)")
    }
}
```

## 三、依赖注入与 Mock

### 3.1 为什么要 Mock

单元测试的核心原则是隔离——只测试目标单元，不依赖外部系统（网络、数据库、文件系统）。通过协议抽象依赖，在测试中替换为 Mock 实现。

### 3.2 协议抽象

```swift
// 生产代码
protocol NetworkClientProtocol {
    func fetch(url: URL) async throws -> Data
}

class UserService {
    private let networkClient: NetworkClientProtocol

    init(networkClient: NetworkClientProtocol) {
        self.networkClient = networkClient
    }

    func fetchUser(id: String) async throws -> User {
        let data = try await networkClient.fetch(url: URL(string: "https://api.example.com/users/\(id)")!)
        return try JSONDecoder().decode(User.self, from: data)
    }
}

// 测试 Mock
class MockNetworkClient: NetworkClientProtocol {
    var dataToReturn: Data?
    var errorToThrow: Error?

    func fetch(url: URL) async throws -> Data {
        if let error = errorToThrow { throw error }
        return dataToReturn ?? Data()
    }
}

// 测试
func testFetchUser() async throws {
    let mock = MockNetworkClient()
    mock.dataToReturn = try JSONEncoder().encode(User(id: "1", name: "张三"))

    let service = UserService(networkClient: mock)
    let user = try await service.fetchUser(id: "1")

    XCTAssertEqual(user.name, "张三")
}
```

### 3.3 验证交互

有时需要验证目标对象是否正确调用了依赖的方法：

```swift
class MockNetworkClient: NetworkClientProtocol {
    var fetchCallCount = 0
    var lastFetchURL: URL?

    func fetch(url: URL) async throws -> Data {
        fetchCallCount += 1
        lastFetchURL = url
        return Data()
    }
}

func testFetchUser_CallsNetworkOnce() async throws {
    let mock = MockNetworkClient()
    let service = UserService(networkClient: mock)

    _ = try await service.fetchUser(id: "1")

    XCTAssertEqual(mock.fetchCallCount, 1)
    XCTAssertEqual(mock.lastFetchURL?.path, "/users/1")
}
```

## 四、XCUITest UI 测试

### 4.1 基本 UI 测试

```swift
import XCTest

class LoginUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testLoginFlow() {
        let app = XCUIApplication()
        app.launch()

        // 输入用户名
        let usernameField = app.textFields["usernameTextField"]
        usernameField.tap()
        usernameField.typeText("testuser")

        // 输入密码
        let passwordField = app.secureTextFields["passwordTextField"]
        passwordField.tap()
        passwordField.typeText("password123")

        // 点击登录按钮
        app.buttons["loginButton"].tap()

        // 验证首页显示
        XCTAssertTrue(app.staticTexts["Welcome, testuser"].waitForExistence(timeout: 5))
    }
}
```

### 4.2 查找元素

```swift
// 按 accessibility identifier 查找（推荐）
app.buttons["loginButton"]
app.textFields["emailField"]
app.staticTexts["titleLabel"]

// 按标签查找
app.buttons["Log In"]
app.staticTexts["Welcome"]

// 按索引查找
app.buttons.element(boundBy: 0)
```

### 4.3 交互操作

```swift
element.tap()                         // 点击
element.doubleTap()                   // 双击
element.typeText("text")              // 输入文本
element.swipeUp()                     // 上滑
element.swipeLeft()                   // 左滑
element.press(forDuration: 2)         // 长按
element.adjust(toNormalizedSliderPosition: 0.5)  // 滑块调整
```

### 4.4 启动参数与环境

```swift
let app = XCUIApplication()
app.launchArguments = ["-UITesting", "resetState"]
app.launchEnvironment = ["API_BASE_URL": "https://test-api.example.com"]
app.launch()
```

在应用代码中检测：

```swift
if ProcessInfo.processInfo.arguments.contains("-UITesting") {
    // UI 测试模式，使用 mock 数据
}
```

## 五、测试覆盖率

### 5.1 启用覆盖率

在 Xcode 的 Scheme Editor → Test → Options 中勾选 "Code Coverage"。运行测试后，在 Report Navigator 中查看覆盖率报告。

### 5.2 覆盖率指标

行覆盖率：被执行的代码行数占总行数的比例。分支覆盖率：被执行的条件分支数占总分支数的比例。

目标覆盖率：核心业务逻辑应达到 80%+，工具类和模型可达 90%+，UI 层和配置层可以适当降低。

### 5.3 覆盖率陷阱

高覆盖率不等于高质量。如果测试全是 `XCTAssertTrue(true)` 这样的空断言，覆盖率 100% 也没有意义。关键在于测试断言是否有效验证了行为。

## 六、TDD（测试驱动开发）

### 6.1 Red-Green-Refactor 循环

1. **Red**：写一个失败的测试
2. **Green**：写最少的代码让测试通过
3. **Refactor**：重构代码，保持测试通过

```swift
// Step 1: Red - 写测试
func testFizzBuzz_WhenDivisibleBy3_ReturnsFizz() {
    let result = FizzBuzz.convert(3)
    XCTAssertEqual(result, "Fizz")
}

// Step 2: Green - 最小实现
class FizzBuzz {
    static func convert(_ number: Int) -> String {
        return "Fizz"
    }
}

// Step 3: Red - 写下一个测试
func testFizzBuzz_WhenDivisibleBy5_ReturnsBuzz() {
    let result = FizzBuzz.convert(5)
    XCTAssertEqual(result, "Buzz")
}

// Step 4: Green - 扩展实现
class FizzBuzz {
    static func convert(_ number: Int) -> String {
        if number % 3 == 0 { return "Fizz" }
        if number % 5 == 0 { return "Buzz" }
        return String(number)
    }
}
```

### 6.2 TDD 的价值

TDD 的核心价值不在于测试本身，而在于驱动设计。先写测试迫使你思考接口设计、依赖关系和边界条件。测试先行确保代码天然可测试，减少后期补测试的痛苦。

## 七、测试组织与最佳实践

### 7.1 命名规范

测试方法名应描述行为而非方法名。推荐 `test<行为>_<条件>_<结果>` 格式：

```swift
// 好
func testFetchUser_WhenUserNotFound_ThrowsNotFoundError()
func testCalculatePrice_WhenQuantityIsZero_ReturnsZero()

// 差
func testFetchUser1()
func testCalc()
```

### 7.2 测试文件组织

```
MyAppTests/
├── Services/
│   ├── UserServiceTests.swift
│   ├── OrderServiceTests.swift
│   └── Mocks/
│       └── MockNetworkClient.swift
├── Models/
│   ├── UserTests.swift
│   └── OrderTests.swift
└── ViewModel/
    └── HomeViewModelTests.swift
```

### 7.3 GIVEN-WHEN-THEN 模式

将测试方法分为三段，用注释标注：

```swift
func testUpdateProfile_WhenNameIsEmpty_ThrowsValidationError() {
    // Given
    let user = User(id: "1", name: "")
    let service = ProfileService()

    // When
    XCTAssertThrowsError(try service.updateProfile(user)) { error in
        // Then
        guard let validationError = error as? ValidationError else {
            XCTFail("Expected ValidationError")
            return
        }
        XCTAssertEqual(validationError.field, "name")
    }
}
```

## 八、持续集成中的测试

在 CI 环境中运行测试需要考虑：

模拟器选择：使用 `xcrun simctl` 创建指定设备类型的模拟器。避免使用多设备并行测试（资源消耗大），优先选择 iPhone 15 标准尺寸。

测试结果解析：`xcodebuild test` 输出 `.xcresult` 格式。可以用 `xcrun xcresulttool` 解析测试结果，或用第三方工具（如 Fastlane 的 scan）生成 JUnit XML 报告。

测试速度：大量单元测试应能在 1-2 分钟内完成。如果测试变慢，检查是否有不必要的网络/磁盘 I/O，或使用了过长的超时等待。
