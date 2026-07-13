# Swift 语言基础详解

---

## 一、数据类型

### 1.1 整数

```swift
// 固定宽度
Int8 / UInt8       // 8 位
Int16 / UInt16     // 16 位
Int32 / UInt32     // 32 位
Int64 / UInt64     // 64 位

// 平台自适应（推荐使用）
Int   // 64 位平台等于 Int64，32 位平台等于 Int32
UInt  // 无符号版本

// Swift 中 Int 是默认整数类型，即使值已知非负也优先用 Int
let count: Int = 42

// 溢出运算符（不触发运行时错误而是截断）
var a: UInt8 = 255
// a + 1  // ❌ 运行时崩溃
a &+ 1    // ✅ 0（溢出截断）
a &- 1    // ✅ 254
a &* 2    // ✅ 254
```

### 1.2 浮点数

```swift
// Double：64 位，至少 15 位小数精度（默认浮点类型）
let pi: Double = 3.141592653589793

// Float：32 位，至少 6 位小数精度
let f: Float = 3.14

// 浮点数特殊值
Double.infinity        // ∞
Double.nan             // NaN
Double.leastNormalMagnitude  // 最小正正规数

// NaN 比较特性
Double.nan == Double.nan  // false！
Double.nan.isNaN          // true
```

### 1.3 布尔

```swift
let isSwift = true
let isObjC = false

// Swift 布尔严格，不会将非零整数当作 true
// if 1 { }  // ❌ 编译错误
// if true { }  // ✅
```

### 1.4 字符串

```swift
// String 是值类型（结构体），传值时自动 Copy-on-Write
let greeting = "Hello, Swift!"

// 多行字符串
let multiline = """
    第一行
    第二行
    第三行
    """

// 字符串插值
let name = "世界"
let message = "你好，\(name)！"        // "你好，世界！"
let calc = "3 + 5 = \(3 + 5)"        // "3 + 5 = 8"

// 扩展字符串分隔符（避免转义）
let regex = #"\\d{3}-\d{4}"#         // 不需要双反斜杠
let withInterp = #"Hello \#(name)"#  // 插值需用 \#()

// 常用操作
str.count                    // 字符数（非字节数）
str.isEmpty
str.hasPrefix("Hello")
str.hasSuffix("!")
str.uppercased()
str.lowercased()
str.replacingOccurrences(of: "a", with: "b")
str.split(separator: " ")    // [Substring]
str.components(separatedBy: " ")  // [String]（Foundation）

// Substring — 字符串切片，共享原字符串内存
let sub = str[str.index(str.startIndex, offsetBy: 2)...]  // Substring
let realStr = String(sub)  // 转为独立 String

// 索引操作（String 不能用整数下标）
let index = str.index(str.startIndex, offsetBy: 3)
str[index]                            // Character
str[str.startIndex..<index]           // Substring
str.insert("X", at: index)           // 插入
str.remove(at: index)                // 删除
```

### 1.5 Character

```swift
let char: Character = "A"
let emoji: Character = "🇨🇳"  // 一个 Character 可以由多个 Unicode 标量组成

// 遍历
for char in "Hello" {
    print(char)  // H e l l o
}

// 字符串转字符数组
let chars = Array("Hello")  // [Character]
```

### 1.6 元组（Tuple）

```swift
// 命名元组
let person = (name: "张三", age: 25)
person.name  // "张三"
person.age   // 25

// 匿名元组
let coords = (120.0, 30.0)
coords.0  // 120.0
coords.1  // 30.0

// 分解
let (x, y) = coords
print(x, y)  // 120.0 30.0

// 忽略部分值
let (name, _) = person

// 函数返回多值
func minMax(array: [Int]) -> (min: Int, max: Int)? {
    guard let first = array.first else { return nil }
    var min = first, max = first
    for value in array {
        if value < min { min = value }
        if value > max { max = value }
    }
    return (min, max)
}
```

### 1.7 类型别名

```swift
typealias AudioSample = UInt16
var maxAmplitude = AudioSample.min  // 0

typealias Completion = (Bool, Error?) -> Void
typealias StringDict = [String: String]
```

---

## 二、可选类型（Optional）

### 2.1 基本概念

```swift
// Optional<Wrapped> 枚举，表示有值或无值
var name: String? = "Hello"  // Optional("Hello")
name = nil                    // nil

// 非可选变量不能为 nil
var age: Int = 25
// age = nil  // ❌ 编译错误

// Optional 本质
enum Optional<Wrapped> {
    case some(Wrapped)
    case none
}
```

### 2.2 解包方式

```swift
// 1. 强制解包（确定有值时使用，否则崩溃）
let len = name!.count  // ⚠️ name 为 nil 时崩溃

// 2. 可选绑定（if let）
if let name = name {
    print(name.count)  // name 是 String 类型
}

// 3. 可选绑定（guard let，提前退出）
func process(name: String?) {
    guard let name = name else { return }
    // 之后直接用 name: String
    print(name)
}

// 4. 隐式解包可选（Implicitly Unwrapped Optional）
var assumed: String! = "Hello"
print(assumed.count)  // 直接使用，不需要 ! 或 if let
// ⚠️ 为 nil 时同样崩溃，只在确定始终有值时使用

// 5. 空合运算符（Nil-Coalescing）
let displayName = name ?? "匿名"  // name 为 nil 时用默认值

// 6. 可选链（Optional Chaining）
let upper = name?.uppercased()  // 返回 String?

// 7. 多重可选绑定
if let a = dict["key1"], let b = dict["key2"], b.count > 0 {
    // a 和 b 都非 nil 且 b 不为空
}

// 8. guard let 多重绑定
guard let a = optionalA, let b = optionalB else { return }
```

### 2.3 可选映射

```swift
// map / flatMap
let count = name.map { $0.count }           // Int?
let nested: String?? = "hello"
let flat = nested.flatMap { $0 }             // String?（拍平一层）
```

---

## 三、运算符

### 3.1 基本运算符

```swift
// 算术
+ - * / %
10 % 3  // 1
-10 % 3 // -1（Swift 中余数与被除数同号）

// 一元正负
let positive = +5
let negative = -5

// 复合赋值
+= -= *= /= %=

// 比较
== != > < >= <=

// 引用比较（类实例）
=== !==

// 逻辑
&& || !

// 三目
let result = condition ? a : b

// 空合
let value = optional ?? defaultValue

// 区间
1...5     // 闭区间 [1, 5]
1..<5     // 半开区间 [1, 5)
...5      // 单侧区间 (-∞, 5]
1...      // 单侧区间 [1, +∞)
```

### 3.2 自定义运算符

```swift
// 前缀运算符
prefix operator ✅
prefix func ✅ (value: Bool) -> String {
    return value ? "通过" : "未通过"
}
✅ true  // "通过"

// 后缀运算符
postfix operator ★
postfix func ★ (value: Int) -> Int {
    return value * 2
}
5★  // 10

// 中缀运算符
infix operator ±: AdditionPrecedence
func ± (left: Double, right: Double) -> Double {
    return (left + right) / 2
}
10.0 ± 20.0  // 15.0
```

---

## 四、控制流

### 4.1 if / else

```swift
let score = 85
if score >= 90 {
    print("优秀")
} else if score >= 60 {
    print("及格")
} else {
    print("不及格")
}

// if 作为表达式（Swift 5.9+）
let message = if score >= 60 { "通过" } else { "不通过" }
```

### 4.2 switch

```swift
// 基本用法（不需要 break，默认不贯穿）
let direction = "north"
switch direction {
case "north":    print("北")
case "south":    print("南")
case "east":     print("东")
case "west":     print("西")
default:         print("未知")
}

// 区间匹配
switch score {
case 90...100:   print("A")
case 80..<90:    print("B")
case 60..<80:    print("C")
default:         print("D")
}

// 元组匹配
let point = (1, -1)
switch point {
case (0, 0):                print("原点")
case (_, 0):                print("x 轴")
case (0, _):                print("y 轴")
case (let x, let y) where x * y > 0:  print("第一/三象限")
case (let x, let y):        print("坐标 (\(x), \(y))")
}

// 值绑定
switch point {
case (let x, 0):  print("x = \(x)")
case (0, let y):  print("y = \(y)")
case (let x, let y): print("(\(x), \(y))")
}

// fallthrough（显式贯穿，不检查下一个 case 条件）
switch score {
case 90...100:
    print("优秀")
    fallthrough  // 继续执行下一个 case
case 80..<90:
    print("良好")  // 即使不是 80-90 也会执行
default:
    break
}
```

### 4.3 循环

```swift
// for-in
for i in 0..<5 {
    print(i)  // 0 1 2 3 4
}

for item in array {
    print(item)
}

// 同时获取索引和值
for (index, value) in array.enumerated() {
    print("\(index): \(value)")
}

// 步长
for i in stride(from: 0, to: 10, by: 2) {
    print(i)  // 0 2 4 6 8
}

// while
while condition {
    // 先判断后执行
}

// repeat-while
repeat {
    // 至少执行一次
} while condition

// break / continue
// 标签语句
outerLoop: for i in 0..<10 {
    for j in 0..<10 {
        if j == 5 { break outerLoop }
    }
}
```

### 4.4 guard

```swift
// guard：条件不满足时提前退出，避免金字塔嵌套
func process(age: Int?, name: String?) {
    guard let age = age, age >= 0 else {
        print("年龄无效")
        return
    }
    guard let name = name, !name.isEmpty else {
        print("姓名无效")
        return
    }
    // age 和 name 都是解包后的非可选值
    print("\(name)，\(age) 岁")
}

// guard 与可选绑定
guard let url = URL(string: urlString) else { return }
// guard 与条件判断
guard !array.isEmpty else { return }
```

---

## 五、函数

### 5.1 定义与调用

```swift
// 基本函数
func greet(person: String) -> String {
    return "Hello, \(person)!"
}
greet(person: "World")  // 参数标签 "person" 必须写

// 省略参数标签
func sayHello(_ name: String) -> String {
    return "Hello, \(name)!"
}
sayHello("World")  // 调用时省略标签

// 自定义参数标签
func greet(person name: String, from hometown: String) -> String {
    return "Hello, \(name)! from \(hometown)"
}
greet(person: "John", from: "NYC")
```

### 5.2 默认参数与可变参数

```swift
// 默认参数值
func power(base: Int, exponent: Int = 2) -> Int {
    return Int(pow(Double(base), Double(exponent)))
}
power(base: 3)           // 9（exponent 默认 2）
power(base: 3, exponent: 3)  // 27

// 可变参数（函数内视为数组）
func average(_ numbers: Double...) -> Double {
    return numbers.reduce(0, +) / Double(numbers.count)
}
average(1, 2, 3, 4)  // 2.5
```

### 5.3 inout 参数

```swift
// inout：在函数内修改外部变量
func swapValues(_ a: inout Int, _ b: inout Int) {
    let temp = a
    a = b
    b = temp
}

var x = 10, y = 20
swapValues(&x, &y)  // x=20, y=20（注意 & 前缀）
```

### 5.4 函数类型

```swift
// 函数类型：(参数类型) -> 返回类型
let add: (Int, Int) -> Int = { $0 + $1 }
let multiply: (Int, Int) -> Int = { $0 * $1 }

// 函数作为参数
func calculate(a: Int, b: Int, using operation: (Int, Int) -> Int) -> Int {
    return operation(a, b)
}
calculate(a: 3, b: 5, using: add)       // 8
calculate(a: 3, b: 5, using: multiply)  // 15

// 函数作为返回值
func stepForward(_ input: Int) -> Int { input + 1 }
func stepBackward(_ input: Int) -> Int { input - 1 }

func chooseStepFunction(backward: Bool) -> (Int) -> Int {
    return backward ? stepBackward : stepForward
}
```

### 5.5 嵌套函数

```swift
func makeIncrementer(increment amount: Int) -> () -> Int {
    var total = 0
    func incrementer() -> Int {
        total += amount  // 捕获外部变量
        return total
    }
    return incrementer
}

let inc = makeIncrementer(increment: 5)
inc()  // 5
inc()  // 10
```

---

## 六、闭包（Closure）

### 6.1 闭包语法

```swift
// 完整语法
{ (parameters) -> return type in
    statements
}

// 排序示例的多种写法
let names = ["Chris", "Alex", "Barry"]

// 1. 完整闭包
let sorted1 = names.sorted(by: { (s1: String, s2: String) -> Bool in
    return s1 < s2
})

// 2. 类型推断省略
let sorted2 = names.sorted(by: { s1, s2 in return s1 < s2 })

// 3. 隐式 return
let sorted3 = names.sorted(by: { s1, s2 in s1 < s2 })

// 4. 缩写参数名 $0, $1...
let sorted4 = names.sorted(by: { $0 < $1 })

// 5. 尾随闭包
let sorted5 = names.sorted { $0 < $1 }

// 6. 运算符函数
let sorted6 = names.sorted(by: <)
```

### 6.2 尾随闭包

```swift
// 最后一个参数是闭包时，可写在括号外
func perform(_ action: () -> Void) { action() }

perform({
    print("内联闭包")
})

perform() {
    print("尾随闭包")
}

perform {   // 括号可省略（仅一个闭包参数时）
    print("尾随闭包省略括号")
}

// 多个尾随闭包（Swift 5.3+）
func animate(duration: TimeInterval,
             animations: () -> Void,
             completion: () -> Void) { ... }

animate(duration: 0.3) {
    // animations
} completion: {
    // completion
}
```

### 6.3 逃逸闭包 @escaping

```swift
// 闭包在函数返回后才执行（如异步回调），必须标记 @escaping
class DataManager {
    var completionHandlers: [() -> Void] = []

    func fetch(completion: @escaping () -> Void) {
        completionHandlers.append(completion)  // 存储闭包 → 逃逸
    }
}

// @escaping 闭包中用 self 必须显式写
class MyClass {
    var value = 0
    func doWork(completion: @escaping () -> Void) {
        DispatchQueue.main.async {
            self.value += 1      // ✅ 显式 self
            completion()
        }
    }
}

// 非 @escaping 闭包中 self 可省略（编译器保证闭包执行时 self 仍存在）
```

### 6.4 自动闭包 @autoclosure

```swift
// @autoclosure：将表达式自动包装为闭包，延迟求值
func assert(_ condition: @autoclosure () -> Bool,
            _ message: @autoclosure () -> String) {
    if !condition() {
        print(message())  // 只有断言失败时才求值 message
    }
}

assert(2 > 1, "不可能")  // 调用时写普通表达式，编译器自动包成闭包

// 实际应用：?? 运算符、assert、Log 宏
```

### 6.5 闭包捕获与循环引用

```swift
// 闭包捕获变量（引用捕获）
var counter = 0
let increment = {
    counter += 1
}
increment()  // counter = 1
increment()  // counter = 2

// 循环引用解决
class NetworkManager {
    var data: String?

    func fetch() {
        // ❌ 循环引用
        URLSession.shared.dataTask(with: url) { data, _, _ in
            self.data = String(data: data!, encoding: .utf8)
        }

        // ✅ weak 引用
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self else { return }
            self.data = String(data: data!, encoding: .utf8)
        }

        // ✅ unowned 引用（确定 self 生命周期 >= 闭包时使用）
        URLSession.shared.dataTask(with: url) { [unowned self] data, _, _ in
            self.data = String(data: data!, encoding: .utf8)
        }
    }
}
```

---

## 七、枚举

### 7.1 基本枚举

```swift
enum CompassPoint {
    case north
    case south
    case east
    case west
    // 也可 case north, south, east, west
}

var direction = CompassPoint.north
direction = .south  // 类型已知时可省略枚举名

// switch 匹配（必须穷举）
switch direction {
case .north: print("北")
case .south: print("南")
case .east:  print("东")
case .west:  print("西")
}
```

### 7.2 原始值（Raw Value）

```swift
// Int 原始值（自动递增）
enum Planet: Int {
    case mercury = 1, venus, earth, mars
}
Planet.earth.rawValue      // 3
Planet(rawValue: 2)        // Optional(Planet.venus)

// String 原始值（默认为 case 名）
enum Direction: String {
    case north, south, east, west
}
Direction.north.rawValue   // "north"

// Character 原始值
enum ASCIIControl: Character {
    case tab = "\t"
    case lineFeed = "\n"
    case carriageReturn = "\r"
}
```

### 7.3 关联值（Associated Values）

```swift
enum Barcode {
    case upc(Int, Int, Int, Int)
    case qrCode(String)
}

var product = Barcode.upc(8, 85909, 51226, 3)
product = .qrCode("ABCDEFG")

// 提取关联值
switch product {
case .upc(let a, let b, let c, let d):
    print("UPC: \(a)-\(b)-\(c)-\(d)")
case .qrCode(let code):
    print("QR: \(code)")
}

// 简写（let 放在前面）
switch product {
case let .upc(a, b, c, d): print("UPC: \(a)-\(b)-\(c)-\(d)")
case let .qrCode(code):    print("QR: \(code)")
}

// if case 提取单个
if case let .qrCode(code) = product {
    print("QR: \(code)")
}

// guard case
guard case let .qrCode(code) = product else { return }
```

### 7.4 递归枚举

```swift
// indirect 关键字表示递归
indirect enum ArithmeticExpression {
    case number(Int)
    case addition(ArithmeticExpression, ArithmeticExpression)
    case multiplication(ArithmeticExpression, ArithmeticExpression)
}

let expr: ArithmeticExpression = .addition(
    .number(5),
    .multiplication(.number(3), .number(2))
)

func evaluate(_ expr: ArithmeticExpression) -> Int {
    switch expr {
    case .number(let value):
        return value
    case .addition(let left, let right):
        return evaluate(left) + evaluate(right)
    case .multiplication(let left, let right):
        return evaluate(left) * evaluate(right)
    }
}
evaluate(expr)  // 5 + (3 * 2) = 11
```

### 7.5 枚举的方法与属性

```swift
enum Beverage: CaseIterable {
    case coffee, tea, juice

    // 计算属性
    var isCaffeinated: Bool {
        switch self {
        case .coffee, .tea: return true
        case .juice: return false
        }
    }

    // 方法
    func describe() -> String {
        switch self {
        case .coffee: return "咖啡"
        case .tea:    return "茶"
        case .juice:  return "果汁"
        }
    }

    // CaseIterable：获取所有 case
    static var allCases: [Beverage] { [.coffee, .tea, .juice] }
}
Beverage.allCases.count  // 3
```

---

## 八、结构体与类

### 8.1 结构体（Struct）

```swift
struct Point {
    var x: Double
    var y: Double

    // 自动生成 memberwise initializer
    // Point(x: 1.0, y: 2.0)

    // 计算属性
    var magnitude: Double {
        return sqrt(x * x + y * y)
    }

    // 方法
    func distance(to other: Point) -> Double {
        return sqrt(pow(x - other.x, 2) + pow(y - other.y, 2))
    }

    // mutating：修改自身属性的方法需标记
    mutating func moveBy(dx: Double, dy: Double) {
        x += dx
        y += dy
    }
}

var p1 = Point(x: 3, y: 4)
p1.magnitude          // 5.0
p1.moveBy(dx: 1, dy: 1)  // p1 = Point(x: 4, y: 5)

// 值类型：赋值/传参时自动复制（Copy-on-Write 优化）
var p2 = p1     // p2 是 p1 的独立副本
p2.x = 100      // 不影响 p1
```

### 8.2 类（Class）

```swift
class Person {
    var name: String
    var age: Int

    // 指定初始化器（Designated Initializer）
    init(name: String, age: Int) {
        self.name = name
        self.age = age
    }

    // 便利初始化器（Convenience Initializer）
    convenience init(name: String) {
        self.init(name: name, age: 0)
    }

    // 析构器
    deinit {
        print("\(name) 被释放")
    }

    // 方法
    func introduce() -> String {
        return "我叫\(name)，\(age)岁"
    }
}

// 引用类型：赋值/传参时共享同一实例
let p1 = Person(name: "张三", age: 25)
let p2 = p1         // p2 和 p1 指向同一对象
p2.age = 30
print(p1.age)       // 30（p1 也变了）

// 身份比较
p1 === p2  // true（同一对象）
```

### 8.3 属性

```swift
struct SomeStruct {
    // 存储属性
    var value: Int

    // 惰性存储属性（首次访问时初始化，必须 var）
    lazy var data: [Int] = {
        var arr = [Int]()
        for i in 0..<1000 { arr.append(i) }
        return arr
    }()

    // 计算属性
    var doubled: Int {
        return value * 2
    }

    // 只读计算属性（省略 get）
    var tripled: Int {
        value * 3
    }

    // 可写计算属性
    var squared: Int {
        get { value * value }
        set { value = Int(sqrt(Double(newValue))) }
    }

    // 属性观察器
    var observed: Int = 0 {
        willSet { print("即将从 \(observed) 变为 \(newValue)") }
        didSet  { print("已从 \(oldValue) 变为 \(observed)") }
    }

    // 类型属性（static — 结构体/枚举，class — 类可重写）
    static let constant = 42
    static var count = 0
}
```

### 8.4 值类型 vs 引用类型

| 特性 | Struct（值类型） | Class（引用类型） |
|------|-----------------|------------------|
| 赋值 | 复制副本 | 共享引用 |
| 传参 | 值传递 | 引用传递 |
| 继承 | 不支持 | 支持 |
| 析构器 | 无 | deinit |
| 引用计数 | 无 | ARC |
| mutating | 修改属性需标记 | 不需要 |
| 初始化器 | 自动 memberwise | 需手动 |
| 多态 | 不支持 | 支持 |
| Equatable | 需实现（值语义） | 默认引用比较 |

> **何时用 struct / class**：优先 struct，只在需要引用语义、继承、或 ObjC 兼容时用 class。

---

## 九、协议

### 9.1 协议定义

```swift
protocol Named {
    var name: String { get }         // 只读属性要求
    var nickname: String { get set } // 可读写属性要求

    func introduce()                 // 方法要求
    func greet(to person: Named)     // 参数为协议类型

    init(name: String)               // 初始化器要求
}

// 协议继承
protocol Aged: Named {
    var age: Int { get }
}
```

### 9.2 协议遵从

```swift
struct User: Aged {
    var name: String
    var nickname: String
    var age: Int

    func introduce() -> String {
        return "我叫\(name)"
    }

    func greet(to person: Named) {
        print("你好，\(person.name)")
    }

    init(name: String) {
        self.name = name
        self.nickname = name
        self.age = 0
    }
}
```

### 9.3 协议扩展（默认实现）

```swift
extension Named {
    func introduce() -> String {
        return "我是\(name)"
    }

    func sayHello() {
        print("Hello!")
    }
}
// 遵循 Named 的类型自动获得默认实现，也可以重写
```

### 9.4 协议组合

```swift
func celebrate(person: some Named & Aged) {
    print("\(person.name) \(person.age) 岁生日快乐！")
}

// 或用 typealias
typealias NamedAged = Named & Aged
func celebrate(person: some NamedAged) { ... }
```

### 9.5 常见标准协议

```swift
// Equatable — 相等比较
struct Point: Equatable {
    var x: Int, y: Int
    // 自动合成实现（所有存储属性都 Equatable）
}
Point(x: 1, y: 2) == Point(x: 1, y: 2)  // true

// Hashable — 哈希值（用于 Set/Dictionary key）
struct User: Hashable {
    var id: Int
    var name: String
    // 自动合成
}

// Comparable — 比较
struct Score: Comparable {
    var value: Int
    static func < (lhs: Score, rhs: Score) -> Bool {
        lhs.value < rhs.value
    }
}

// CustomStringConvertible — 自定义打印
extension User: CustomStringConvertible {
    var description: String { "User(\(id), \(name))" }
}

// Codable — 编解码
struct Config: Codable {
    var host: String
    var port: Int
}
let data = try JSONEncoder().encode(config)
let decoded = try JSONDecoder().decode(Config.self, from: data)
```

---

## 十、泛型

### 10.1 泛型函数与类型

```swift
// 泛型函数
func swapValues<T>(_ a: inout T, _ b: inout T) {
    let temp = a; a = b; b = temp
}

// 泛型类型
struct Stack<Element> {
    private var items: [Element] = []

    mutating func push(_ item: Element) { items.append(item) }
    mutating func pop() -> Element? { items.popLast() }
    var top: Element? { items.last }
    var isEmpty: Bool { items.isEmpty }
}

var intStack = Stack<Int>()
intStack.push(1)
intStack.push(2)
intStack.pop()  // Optional(2)
```

### 10.2 类型约束

```swift
// T 必须遵循 Equatable
func findIndex<T: Equatable>(of value: T, in array: [T]) -> Int? {
    for (index, item) in array.enumerated() {
        if item == value { return index }
    }
    return nil
}

// 多约束
func someFunc<T: Equatable & Hashable, U: Comparable>(a: T, b: U) { ... }
```

### 10.3 关联类型

```swift
protocol Container {
    associatedtype Item
    var count: Int { get }
    subscript(i: Int) -> Item { get }
    mutating func append(_ item: Item)
}

struct IntStack: Container {
    typealias Item = Int  // 可省略，编译器推断
    private var items: [Int] = []

    var count: Int { items.count }
    subscript(i: Int) -> Int { items[i] }
    mutating func append(_ item: Int) { items.append(item) }
}
```

### 10.4 some 与 any

```swift
// some — 不透明返回类型（隐藏具体类型，但固定）
func makeContainer() -> some Container {
    return IntStack()
}
// 返回值的具体类型是固定的，调用方只知道它遵循 Container

// any — 存在类型（类型擦除，动态派发）
func process(container: any Container) {
    // container 可以是任意 Container 类型
    // 运行时多态，有性能开销
}

// 优先使用 some（编译时确定，性能更好）
// 需要 heterogeneous 集合时使用 any
var containers: [any Container] = [IntStack(), GenericStack<String>()]
```

---

## 十一、错误处理

### 11.1 定义与抛出

```swift
// 错误类型遵循 Error 协议
enum NetworkError: Error {
    case invalidURL
    case requestFailed(statusCode: Int)
    case decodingFailed
}

// 抛出错误
func fetchUser(id: String) throws -> User {
    guard let url = URL(string: "https://api.example.com/users/\(id)") else {
        throw NetworkError.invalidURL
    }
    // ...
}
```

### 11.2 处理错误

```swift
// do-catch
do {
    let user = try fetchUser(id: "123")
    print(user)
} catch NetworkError.invalidURL {
    print("URL 无效")
} catch NetworkError.requestFailed(let code) {
    print("请求失败，状态码: \(code)")
} catch {
    print("其他错误: \(error)")
}

// try? — 转为 Optional（错误时返回 nil）
let user = try? fetchUser(id: "123")  // User?

// try! — 强制执行（错误时崩溃）
let user = try! fetchUser(id: "123")  // User
```

### 11.3 Result 类型

```swift
// Result<Success, Failure>
func fetchUser(id: String) -> Result<User, NetworkError> {
    guard !id.isEmpty else { return .failure(.invalidURL) }
    // ...
    return .success(user)
}

let result = fetchUser(id: "123")
switch result {
case .success(let user):  print(user)
case .failure(let error): print(error)
}

// Result 的 map / flatMap
let nameResult = result.map { $0.name }
```

### 11.4 rethrows

```swift
// rethrows：函数本身不抛出，但传入的闭包可能抛出
func perform(_ action: () throws -> Void) rethrows {
    try action()
}

// 如果传入的闭包不抛出，调用时也不需要 try
perform { print("safe") }               // 无需 try
perform { try fetchUser(id: "123") }    // 需要 try
```

---

## 十二、扩展

```swift
// 扩展方法
extension Int {
    var isEven: Bool { self % 2 == 0 }
    func squared() -> Int { self * self }
    mutating func square() { self = self * self }
}
4.isEven      // true
3.squared()   // 9

// 扩展计算属性（不能添加存储属性）
extension Double {
    var km: Double { self * 1000 }
    var m: Double { self }
    var cm: Double { self / 100 }
}
let distance = 5.0.km  // 5000.0

// 扩展协议遵从
extension User: CustomStringConvertible {
    var description: String { "User(\(name))" }
}

// 条件扩展
extension Array where Element: Equatable {
    func unique() -> [Element] {
        var result: [Element] = []
        for item in self {
            if !result.contains(item) { result.append(item) }
        }
        return result
    }
}

// 扩展泛型类型
extension Stack {
    var topTwo: (Element, Element)? {
        guard items.count >= 2 else { return nil }
        return (items[items.count - 2], items[items.count - 1])
    }
}
```

---

## 十三、访问控制

```swift
// 7 个访问级别（从高到低）
// open       — 模块外可访问+可重写+可子类化（仅类）
// public     — 模块外可访问
// package    — 同包内可访问（Swift 5.9+）
// internal   — 模块内可访问（默认）
// fileprivate — 同文件内可访问
// private    — 同作用域内可访问
// (nested private — Swift 4+ 私有可在扩展中访问)

// 规则：
// 1. 子类的访问级别不能高于父类
// 2. 属性的访问级别不能高于其类型
// 3. 方法的访问级别不能高于其参数/返回类型
// 4. 扩展的成员默认与原类型同级别

public class PublicClass {
    public var publicProp = 0
    internal var internalProp = 0         // 默认
    private var privateProp = 0

    public func publicMethod() {}
    func internalMethod() {}              // 默认 internal
}
```

---

## 十四、类型转换与检查

```swift
// is — 类型检查
if item is Movie { ... }

// as? — 安全转换（返回 Optional）
if let movie = item as? Movie { ... }

// as! — 强制转换（失败崩溃）
let movie = item as! Movie

// as — 无损转换（编译期确定）
let num = 42 as Double  // Int → Double

// Any / AnyObject
var things: [Any] = [0, "hello", 3.14, (1, 2)]
class AnyObjectList {
    var objects: [AnyObject] = []  // 只能放类实例
}

// 类型判断最佳实践
for thing in things {
    switch thing {
    case let intVal as Int:    print("Int: \(intVal)")
    case let strVal as String: print("String: \(strVal)")
    case let dblVal as Double: print("Double: \(dblVal)")
    default:                   print("其他")
    }
}
```

---

## 十五、高阶函数

```swift
let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// map — 变换
let doubled = numbers.map { $0 * 2 }
// [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

// compactMap — 变换 + 过滤 nil
let strings = ["1", "two", "3", "four"]
let ints = strings.compactMap { Int($0) }
// [1, 3]

// flatMap — 降维
let nested = [[1, 2], [3, 4], [5, 6]]
let flat = nested.flatMap { $0 }
// [1, 2, 3, 4, 5, 6]

// filter — 过滤
let evens = numbers.filter { $0 % 2 == 0 }
// [2, 4, 6, 8, 10]

// reduce — 聚合
let sum = numbers.reduce(0, +)
// 55

let total = numbers.reduce(0) { result, value in
    result + value
}

// sorted — 排序
let desc = numbers.sorted { $0 > $1 }
// [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

// forEach — 遍历（不能 break/continue）
numbers.forEach { print($0) }

// zip — 合并两个序列
let names = ["a", "b", "c"]
let paired = zip(names, numbers).map { "\($0): \($1)" }
// ["a: 1", "b: 2", "c: 3"]

// 链式调用
let result = numbers
    .filter { $0 % 2 == 0 }
    .map { $0 * $0 }
    .reduce(0, +)
// 4 + 16 + 36 + 64 + 100 = 220
```


## 十六、Swift 6 严格并发 / @Sendable / MainActor

Swift 6 引入了**严格并发检查**（Strict Concurrency Checking），编译器在编译期检测数据竞争（data races），而非运行时崩溃。核心概念：

- **@Sendable**：标记类型是线程安全的。值类型（struct/enum）自动 Sendable；引用类型需显式标注且所有 stored properties 必须 Sendable。
- **MainActor**：标注必须在主线程执行的代码。`@MainActor` 修饰的属性/方法自动调度到主线程，访问隔离域外的 nonisolated 代码需 `await`。
- **actor**：Swift 6 中 actor 提供结构化隔离。actor 内部状态天然线程安全，通过 `actor` 关键字替代传统的 `DispatchQueue` 串行队列管理状态。

```swift
@MainActor class ViewModel {
    var title: String = ""
    var items: [String] = []

    func updateUI() {  // 自动调度到主线程
        print("UI update: \(title)")
    }
}

actor DataStore {
    private var cache: [String: Data] = [:]

    func get(key: String) -> Data? { cache[key] }
    func set(key: String, value: Data) { cache[key] = value }
}

// 使用：跨隔离域访问必须 await
let store = DataStore()
let data = await store.get(key: "user")

// 错误：从非 MainActor 上下文直接修改 MainActor 属性
// viewModel.title = "new"  // ❌ 编译错误
await viewModel.updateUI()  // ✅ 正确
```

**⚠️ Pitfalls**：在 `nonisolated` 方法中访问 `@MainActor` 属性会触发数据竞争编译错误，必须使用 `await MainActor.run {}` 或标记为 `main actor` 上下文。

**✅ Best Practice**：所有 UI 相关状态用 `@MainActor` 管理，后台数据用 `actor` 隔离，避免在 closure 中捕获非 Sendable 的 self 导致隐式数据竞争。


## 十七、Swift 5.9+ 宏（@MemberMacro、@ExpressionMacro）

Swift 5.9 引入了**宏系统**（Macro System），允许开发者在编译期生成代码，类似于 C/C++ 的宏但类型安全且语法树感知。Swift 提供 6 种宏类型：

- **@MemberMacro**：为类型（struct/class/enum）自动生成成员属性或方法。最常见的用例是自动合成协议实现，如 `@AutoContentCoding` 自动为 `CustomContentCodable` 生成 `encode/decode` 方法。
- **@ExpressionMacro**：替换表达式级别的代码，编译时将宏调用展开为完整的 Swift 代码。典型示例 `#colorLiteral` 就是内建 ExpressionMacro。
- **@PeerMacro**：在当前类型旁边生成新的 peer 类型（如为 View 生成对应的 Diffable 类型）。
- **@AttachedMacro**（代码属主）：修改已存在代码的生成方式（如 `@Observable` 自动生成 `willSet` 通知逻辑）。
- **@CodeItemMacro**：在代码块内生成局部代码（如 SwiftUI 的 `#Preview`）。
- **@MemberAttributeMacro**：为类型的每个成员附加属性注解。

```swift
// 示例：@Observable 宏（iOS 17+，AttachedMacro）
@Observable class UserProfile {
    var name: String = ""
    var age: Int = 0
    var email: String = ""
    // 编译器自动生成 willSet { withChangeTracking() } 到每个属性
}

// 示例：自定义 ExpressionMacro
macro logValue<T>(_ expression: T) -> T = #externalMacro(
    type: LogValueMacro.self, module: "MyMacros"
)
// 使用：let x = #logValue(compute()) // 自动打印调用位置和返回值

// 示例：@Observable 在 SwiftUI 中的使用
struct ProfileView: View {
    @Bindable var profile: UserProfile  // Bindable 由 @Observable 宏生成
    var body: some View {
        TextField("Name", text: $profile.name)  // 双向绑定 + 自动刷新
    }
}
```

**⚠️ Pitfalls**：宏在编译期执行，无法访问运行时信息；宏展开失败会导致整个编译失败（而非警告）；宏模块需要单独的 Swift Package 且依赖 `swift-syntax` 库。

**✅ Best Practice**：优先使用官方提供的宏（如 `@Observable`、`#Preview`、`#Availability`），自定义宏仅用于团队内部重复模式消除；在宏实现中始终处理边界情况并使用 `diagnostics` 提供清晰的错误提示。

### 16.3 Swift 6 actor 隔离 vs nonisolated(unsafe)

Swift 6 引入**严格并发检查**（Strict Concurrency），所有跨线程/actor 边界的访问必须通过 `await` 进行。`actor` 类型保证串行访问其内部状态，而非 actor 代码访问 actor 属性必须 `await`。

**`nonisolated`** 方法在 actor 外部调用时不进入 actor 队列，适合纯计算或只读操作（需标记为 `Sendable`）。**`nonisolated(unsafe)`** 则绕过并发检查，直接访问 actor 内部状态——编译器不保证线程安全，仅在极端性能场景使用。

```swift
actor ConfigStore {
    private var data: [String: String] = [:]

    func get(key: String) -> String? {
        data[key]  // ✅ actor 隔离内自由访问
    }

    nonisolated func computeHash(of values: [String]) -> Int {
        // ✅ 不依赖 actor 状态，可在任意线程调用（无需 await）
        values.reduce(0) { $0 + $1.hashValue }
    }

    nonisolated(unsafe) func rawAccess() -> [String: String] {
        // ⚠️ 绕过并发检查，直接返回内部状态——可能导致数据竞争
        return data
    }
}

// 调用
let store = ConfigStore()
let val = await store.get(key: "theme")   // 需要 await
let hash = store.computeHash(of: ["a"])   // 无需 await
let raw = store.rawAccess()                // 无需 await 但极不安全
```

**⚠️ Pitfalls**：`nonisolated(unsafe)` 完全跳过数据竞争检测，在 Release 模式下可能静默崩溃；`nonisolated` 方法若访问了非 `Sendable` 的 actor 状态会编译失败。

**✅ Best Practice**：优先使用 `actor` + `await` 保证安全；仅在性能剖析确认 actor 队列成为瓶颈时，才考虑 `nonisolated`；`nonisolated(unsafe)` 仅用于桥接 C API 等完全不受 actor 影响的场景，且必须添加明确的文档注释说明风险。


### 16.4 Result Builders（@ViewBuilder 模式深度解析）

`@resultBuilder`（Swift 5.1+）允许将多个表达式合并为单一返回值，是 SwiftUI 的基石。编译器将 `@ViewBuilder` 块中的条件分支、循环转化为嵌套的 `Optional`、`[]` 和 `TupleView` 组合。

```swift
@resultBuilder
struct MyBuilder {
    static func buildBlock(_ components: Component...) -> [Component] {
        components
    }
    static func buildIf(_ component: Component?) -> [Component] {
        component.map { [$0] } ?? []
    }
    static func buildEither(first: Component) -> [Component] { [first] }
    static func buildEither(second: Component) -> [Component] { [second] }
}

@MyBuilder func makeContent(_ show: Bool) -> [Component] {
    TextComponent("Always")
    if show { TextComponent("Conditional") }  // buildIf 处理 Optional
}
```

**⚠️ Pitfalls**：`buildLimitedAvailability` 缺失会导致条件编译块报错；返回类型必须是构建块所有路径的共同类型；`buildOptional` 和 `buildIf` 都返回数组时注意语义差异。

**✅ Best Practice**：为自定义 DSL 使用 `@resultBuilder` 时，实现所有标准组合方法（`buildBlock`、`buildIf`、`buildEither`、`buildArray`、`buildLimitedAvailability`），确保与 `if`、`switch`、`for` 完全兼容。

**编译器转换原理**：`@resultBuilder` 块中的每个子表达式被转换为对应的构建方法调用。`if` 分支调用 `buildIf(:)` 包装为 `Optional` 再扁平化；`if-else` 调用 `buildEither(first:)` / `buildEither(second:)` ；`for` 循环调用 `buildArray(:)` 。当多个顶层语句共存时，`buildBlock(_:)` 接收变长参数并合并结果。

```swift
// SwiftUI 内部 @ViewBuilder 的完整方法签名
struct ViewBuilder {
    static func buildBlock<each C: View>() -> Never                       // 空块
    static func buildBlock<C: View>(_ c: C) -> C                           // 单视图
    static func buildBlock<C0: View, C1: View>(_ c0: C0, _ c1: C1) -> TupleView<(C0, C1)>
    static func buildBlock<each C: View>(_ components: repeat each C) -> TupleView<(repeat each C)>
    static func buildIf<C: View>(_ c: C?) -> ConditionalContent<C>         // 可选
    static func buildEither(first: View) -> View                            // if-else 左分支
    static func buildEither(second: View) -> View                           // if-else 右分支
    static func buildArray(_ c: [View]) -> ForEach                           // 循环
}
```

**⚠️ Pitfalls**：不同分支返回类型不兼容时编译器报错信息极其晦涩（"Cannot convert value of type X to expected element type View"）；`buildLimitedAvailability` 未实现时 `#unavailable` 条件编译块会编译失败；在 `@resultBuilder` 中混用泛型约束极易触发类型推导失败。

**✅ Best Practice**：自定义 Result Builder 时始终实现全部 7 个标准方法（`buildBlock` 重载链 + `buildIf` + `buildEither` ×2 + `buildArray` + `buildLimitedAvailability`）；优先让所有分支返回同一具体类型而非依赖 `any View` ；调试编译器错误时，将复杂 builder 块拆分为多个小函数逐步定位类型不匹配点。

### 16.5 Swift 所有权模型（Swift 5.10+ 移动语义）

Swift 5.10 引入正式的所有权模型（SE-0411），从语言层面支持「移动」语义，消除隐式拷贝。通过 `borrowing`/`consuming`/`sending`/`@noSend` 等关键字，开发者可以精确控制值的生命周期，为高性能零拷贝传递奠定基础。

```swift
struct DataChunk {
    var buffer: [UInt8]
    init(size: Int) { buffer = .init(count: size, repeatedValue: 0) }
}

// consuming 参数：调用者必须 move，值被消费后不再可用
func process(_ data: consuming DataChunk) {
    print("Processed \(data.buffer.count) bytes")
    // data 在此函数结束后可选 release（编译器自动插入）
}

// borrowing 参数：只读借用，不转移所有权
func inspect(borrowing data: DataChunk) -> Int {
    data.buffer.count  // 只读访问，零拷贝
}

var chunk = DataChunk(size: 1024)
process(&chunk)   // 必须用 & 操作符显式 move
// chunk 已无效，不可再访问
```

**⚠️ Pitfalls**：`consuming` 参数调用必须使用 `&` 操作符，忘记加 `&` 会触发编译错误；`borrowing` 参数不能逃逸到函数作用域之外；目前（Swift 5.10）所有权模型处于实验阶段，部分特性行为可能调整。

**✅ Best Practice**：对大结构体（如包含大数组的 model）优先使用 `borrowing` 参数避免拷贝；仅在确实需要消费值的场景（如解析后不再使用）使用 `consuming`；项目渐进迁移，先在热点路径试点，不要一次性重构所有 API。


### 16.6 @escaping vs @noescape 闭包语义

Swift 中闭包参数默认标记为 `@noescape`（不可逃逸），意味着闭包只能在函数执行期间被调用，不能存储或异步使用。`@escaping` 允许闭包在函数返回后仍然被调用，如回调、存储到属性、或异步任务中使用。

```swift
// 默认 @noescape：闭包不能在函数返回后被调用
func process(completion: (Result) -> Void) {
    completion(success)  // ✅ 同步调用，安全
    // self.callback = completion  // ❌ 编译错误：可能逃逸
}

// @escaping：闭包可以逃逸到函数作用域之外
class DataLoader {
    var callback: ((Data) -> Void)?  // 存储闭包
    
    func fetchData(url: URL, completion: @escaping (Data) -> Void) {
        self.callback = completion  // ✅ 存储到属性，函数返回后调用
        URLSession.shared.dataTask(with: url) { data, _, _ in
            completion(data!)  // ✅ 异步回调
        }.resume()
    }
}

// @Sendable + @escaping：并发安全标记
func asyncTask(handler: @escaping @Sendable (String) -> Void) {
    DispatchQueue.global().async {
        handler("done")  // 跨线程调用，需 Sendable 保证安全
    }
}
```

**⚠️ Pitfalls**：`@escaping` 闭包中捕获 `self` 时容易形成循环引用导致内存泄漏；在 `@noescape` 闭包中访问 `self` 不需要 `weak` 因为闭包生命周期不超过函数作用域；Swift 6 起 `@escaping` 默认要求 `@Sendable` 并发安全性检查。

**✅ Best Practice**：优先使用 `@noescape`（即不加 `@escaping`），仅在确实需要异步回调或存储闭包时才添加 `@escaping`；`@escaping` 闭包中捕获 `self` 时始终使用 `[weak self]` 防止循环引用；Swift 6 项目中为异步回调显式标注 `@Sendable`。

### 16.7 带关联类型的 Swift 协议 vs Objective-C 协议桥接限制

Swift 协议如果包含 `AssociatedType`（关联类型）或 `Self` 约束，**无法桥接到 Objective-C** 的 `@objc protocol`。这是因为 Objective-C 是纯运行时语言，没有泛型和关联类型的编译时概念。尝试将带 `associatedtype` 的协议标记为 `@objc` 会直接触发编译错误。

```swift
// ❌ 无法桥接：关联类型 + @objc 互斥
@objc protocol ItemProvider {        // 编译错误！
    associatedtype Item              // @objc 不支持 associatedtype
    func provideItem() -> Item
}

// ✅ 方案1：纯 Swift 协议（无 @objc），仅限 Swift 内部使用
protocol SwiftOnlyProvider {
    associatedtype T
    func provide() -> T
}

// ✅ 方案2：用泛型类代替协议，Objective-C 侧用具体类型
class Provider<Base> {
    func provide() -> Base { fatalError() }
}

// ✅ 方案3：用 AnyObject + Any 模拟运行时多态（运行时检查）
@objc protocol AnyObjectProvider {   // 可桥接
    func provideItem() -> Any         // 用 Any 代替泛型
    var itemType: String { get }      // 运行时类型标识
}
```

**⚠️ Pitfalls**：在混编项目中，Objective-C 无法直接使用带 `associatedtype` 的 Swift 协议作为类型约束，导致接口断裂；Swift 泛型函数也不能被 Objective-C 调用。

**✅ Best Practice**：需要跨语言共享的协议避免使用 `associatedtype`，改用具体类型或 `Any` + 运行时检查；架构层将泛型协议限定在 Swift-only 模块内部，公开接口使用 `@objc` 兼容的简化版本。

### 16.8 Actor 隔离与 Sendable 检查

Swift 5.5+ 引入的 `actor` 是一种特殊的引用类型，它通过 **actor 隔离** 保证内部状态的线程安全。所有 `actor` 的属性访问默认是隔离的，外部必须通过 `await` 异步访问。`Sendable` 协议则用于编译期检查值是否能安全跨并发任务传递。

```swift
// ✅ Actor：自动串行化状态访问
actor ScoreBoard {
    private var scores: [String: Int] = [:]
    
    func updateScore(for player: String, points: Int) {
        scores[player, default: 0] += points  // 互斥访问
    }
    
    func getScore(for player: String) -> Int {
        scores[player, default: 0]  // 外部需 await 调用
    }
}

// ✅ Sendable：编译期并发安全检查
struct Config: Sendable {           // 纯值类型自动 Sendable
    let apiKey: String
    let timeout: TimeInterval
}

// ❌ 非 Sendable 类型跨任务传递会报错
class NonSendableConfig {            // 可变引用类型不是 Sendable
    var mutable: Int = 0
}

// ✅ 手动标记 Sendable（需确保所有属性线程安全）
class SharedConfig: @unchecked Sendable {
    let config: String               // 不可变属性是线程安全的
}
```

**⚠️ Pitfalls**：`@MainActor` 修饰的类中访问非主线程资源时需显式 `await`；`@unchecked Sendable` 跳过编译检查，滥用会导致数据竞争；Swift 6 严格并发模式下所有跨任务数据传递强制要求 `Sendable`。

**✅ Best Practice**：优先使用 `actor` 管理共享可变状态替代锁（`DispatchQueue`/`NSLock`）；对不可变数据使用自动 `Sendable` 派生；仅在确定线程安全时才使用 `@unchecked Sendable`，并添加注释说明理由。

### 16.9 Swift 6 严格并发模式 (Strict Concurrency)

Swift 6 引入的 **Strict Conconciliation** 模式在编译期强制检查所有数据竞争。开启后，任何非 `Sendable` 类型的值跨任务传递都会触发编译错误。Xcode 16+ 的新项目默认启用此模式，老项目可通过 Build Settings 中的 `ENABLE_STRICT_CONCURRENCY` 逐步迁移。

```swift
// ✅ Swift 6 下每个跨任务传递的类型必须 Sendable
actor NetworkCache {
    private var entries: [String: Data] = [:]
    
    func set(_ data: Data, forKey key: String) {
        entries[key] = data  // actor 隔离内安全写入
    }
    
    func get(forKey key: String) -> Data? {
        entries[key]  // 外部调用需 await
    }
}

// ✅ MainActor 隔离：UI 相关操作自动调度到主线程
@MainActor
class ViewModel {
    func updateUI(with data: Data) {
        // 自动在主线程执行，无需 dispatchAsync
    }
}

// ❌ Swift 6 严格模式下的编译错误
Task {
    let config = NonSendableConfig()  // 错误：NonSendableConfig 不是 Sendable
    await config.mutate()             // 无法跨任务传递
}
```

**⚠️ Pitfalls**：开启严格并发后，第三方库若未标注 `Sendable` 会导致大量编译错误；使用 `@preconcurrency` 可临时抑制非 Swift 并发库的检查，但会失去数据竞争保护。

**✅ Best Practice**：使用 `swift package clean-concurrency` 命令自动修复发送性问题；优先将可变共享状态迁移到 `actor`，不可变数据依赖自动 `Sendable` 派生；老项目分模块逐步启用严格模式，避免一次性迁移。

### 16.10 Swift Package Libraries (SPM) 高级特性

SPM 不仅是包管理器，还支持**条件编译**、**内部依赖分组**、**预构建二进制**等高级特性，适合大型项目管理复杂依赖关系和资源分发。

```swift
// Package.swift - 条件编译与平台专用依赖
let package = Package(
    name: "MyApp",
    platforms: [.iOS(.v15), .macOS(.v13)],
    targets: [
        .target(
            name: "Core",
            dependencies: [
                .product(name: "CryptoKit", package: "Security",
                         condition: .when(platforms: [.iOS, .macOS])),  // 平台条件
            ],
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency"),
                .headerPath("include/"),  // C 头文件搜索路径
            ],
            linkerSettings: [
                .linkedLibrary("sqlite3"),  // 系统库链接
            ],
        ),
        .testTarget(name: "CoreTests", dependencies: ["Core", .product(name: "XCTMain", package: "Testing")]),
    ],
)
```

**⚠️ Pitfalls**：SPM 的 `resources` 只能包含 Bundle 资源文件，不支持直接嵌入二进制库；大型项目过度使用 `upToNextMajorVersion` 可能导致依赖解析冲突；条件编译产物在模拟器与真机间可能不一致。

**✅ Best Practice**：使用 `Products` 分发布公/私有 API 面，用 `.when(platforms:)` 隔离平台专属代码；对频繁变动的第三方库使用精确版本锁定；CI 中定期执行 `swift package resolve` 验证依赖树一致性。


### 16.11 didSet/willSet 性能注意事项

`willSet` 和 `didSet` 是 Swift 属性观察器，在属性值变化前/后被自动调用。但它们会在**每次赋值时**触发，包括 `init` 之外的一次性初始化赋值，过度使用可能导致不必要的性能损耗和递归调用风险。

```swift
class User {
    var name: String = "" {
        didSet {
            guard name != oldValue else { return }  // ✅ 避免重复触发
            print("Name changed from \(oldValue) to \(name)")
            // 避免在此处直接修改 name，否则会导致无限递归
        }
    }
    
    var age: Int = 0 {
        willSet { print("Age will change to \(newValue)") }
    }
}

// ❌ 性能陷阱：init 中赋值也会触发 didSet（Swift 5+ 中 init 内不触发，但重构时容易误改）
// ❌ 递归陷阱：didSet 内部修改自身属性导致无限循环
user.name = "Alice"  // 触发 didSet
user.name = "Alice"  // guard 保护下不会重复处理
```

**⚠️ Pitfalls**：`didSet` 中修改同一属性会导致无限递归崩溃；属性观察器不能用于 `let` 常量或 `lazy` 属性；在 computed property 上无法使用观察器（需用 getter/setter 手动实现）。

**✅ Best Practice**：在 `didSet` 开头用 `guard value != oldValue` 过滤无意义更新；避免在观察器中执行耗时操作（如网络请求），改为发事件或使用 `Publisher`；对频繁更新的属性考虑用 `@published` 或自定义通知机制替代。


### 16.12 Swift algorithms 包（.indexed()、.chunked()）

Swift Algorithms 是由 Apple 开源的算法扩展库，提供了标准库中缺失但日常高频使用的集合操作。`.indexed()` 返回 `(offset, element)` 元组序列（类似 `enumerated()` 但更语义化），`.chunked(size:)` 将集合按固定大小分块，避免手动索引计算的错误。

```swift
import Algorithms

// .indexed() — 获取带偏移量的元素
let fruits = ["apple", "banana", "cherry"]
for (i, fruit) in fruits.indexed() {
    print(f"[{i}] {fruit}")  // [0] apple, [1] banana...
}

// .chunked(size:) — 固定大小分块
for chunk in [1,2,3,4,5,6,7].chunked(size: 3) {
    print(Array(chunk))  // [1,2,3], [4,5,6], [7]
}

// 组合使用：分页数据时同时需要索引和分块
for (page, chunk) in fruits.chunked(size: 2).indexed() {
    print(f"Page {page}: {Array(chunk)}")
}
```

**⚠️ Pitfalls**：`.chunked()` 返回的是懒序列，不能直接下标访问，需转为 `Array` 后再索引；在 `while` 循环中修改原集合时不要使用 `.indexed()`，否则偏移量会失效。

**✅ Best Practice**：通过 SPM 添加 `import Algorithms` 依赖；优先使用 `.indexed()` 替代 `.enumerated()` 以提升代码可读性；分块操作结合 `AsyncSequence` 可高效处理大数据集分页场景。

### 16.13 @_disfavoredOverload 与函数重载解析

`@_disfavoredOverload` 是 Swift 编译器内部使用的属性，用于在多个重载函数匹配时降低某个候选的优先级。当编译器遇到歧义调用时，带有此属性的重载会被排在最后考虑。虽然这是私有 API，但理解其机制有助于设计清晰的重载策略，避免客户端代码需要显式类型标注。

```swift
// 模拟 @_disfavoredOverload 的效果：引导编译器优先选择特定重载
func process(_ items: [String]) {
    print("处理字符串数组")
}

// 更通用的重载 — 通过泛型约束限制，让具体版本优先
func process<T: Sequence>(_ items: T) where T.Element == String {
    print("处理任何String序列")  // 只有在无法匹配数组时才会调用
}

// 客户端调用 — 编译器优先选择更具体的 [String] 版本
process(["a", "b"])         // "处理字符串数组"
process(["a", "b"].lazy)    // "处理任何String序列"

// Swift 标准库内部大量使用 @_disfavoredOverload
// 例如 Array 的 filter 优先于 Sequence 的 filter
```

**⚠️ Pitfalls**：`@_disfavoredOverload` 是私有 API，不应在生产代码中使用；过度依赖重载优先级会导致代码脆弱，编译器版本升级可能改变选择行为；设计 API 时应优先通过不同的函数名或约束类型来区分，而非依赖重载消歧。

**✅ Best Practice**：通过更具体的类型约束（如 `[String]` vs `Sequence where Element == String`）自然引导编译器选择；需要多个变体时使用不同的方法名（如 `filter()` vs `filterIsSuffix()`）；参考标准库的重载设计模式，让具体类型版本优先于泛型版本。


### 16.13 @_disfavoredOverload 与函数重载解析

`@_disfavoredOverload` 是 Swift 编译器内部使用的属性，用于在多个重载函数匹配时降低某个候选的优先级。当编译器遇到歧义调用时，带有此属性的重载会被排在最后考虑。虽然这是私有 API，但理解其机制有助于设计清晰的重载策略，避免客户端代码需要显式类型标注。

```swift
// 模拟 @_disfavoredOverload 的效果：引导编译器优先选择特定重载
func process(_ items: [String]) {
    print("处理字符串数组")
}

// 更通用的重载 — 通过泛型约束限制，让具体版本优先
func process<T: Sequence>(_ items: T) where T.Element == String {
    print("处理任何String序列")
}

// 客户端调用 — 编译器优先选择更具体的 [String] 版本
process(["a", "b"])         // "处理字符串数组"
process(["a", "b"].lazy)    // "处理任何String序列"

// Swift 标准库内部大量使用 @_disfavoredOverload
// 例如 Array 的 filter 优先于 Sequence 的 filter
```

**⚠️ Pitfalls**：`@_disfavoredOverload` 是私有 API，不应在生产代码中使用；过度依赖重载优先级会导致代码脆弱，编译器版本升级可能改变选择行为；设计 API 时应优先通过不同的函数名或约束类型来区分，而非依赖重载消歧。

**✅ Best Practice**：通过更具体的类型约束（如 `[String]` vs `Sequence where Element == String`）自然引导编译器选择；需要多个变体时使用不同的方法名（如 `filter()` vs `filterIsSuffix()`）；参考标准库的重载设计模式，让具体类型版本优先于泛型版本。

### 16.14 Swift 不透明返回类型（some Protocol）vs 泛型约束

`some Protocol`（不透明返回类型）隐藏了函数的具体返回类型，但编译器在编译时固定了该类型。泛型约束 `<T: Protocol>` 则允许调用方传入或指定任意符合协议的类型。两者的核心区别在于：**不透明类型由函数定义方决定具体类型，泛型由调用方决定**。

```swift
// some 不透明返回 — 调用方不知道具体类型，由实现方决定
func makeView() -> some View {
    return Text("Hello")  // 固定为 Text，不能返回不同视图类型
}

// 泛型约束 — 调用方决定具体类型
func process<T: View>(_ view: T) -> T {
    return view  // 输入什么类型，就返回什么类型
}

// 关键区别：some 是类型擦除的一种形式
func factory(id: Int) -> some View {
    if id == 1 { return Text("A") }       // OK：都是 Text
    // if id == 2 { return Image("B") }   // ❌ 编译错误：返回类型必须固定
}

// 泛型保留类型信息，some 隐藏但不丢失
let t: Text = process(Text("x"))  // ✅ 泛型保留具体类型
// let v: ??? = makeView()         // 调用方无法指定具体类型
```

**⚠️ Pitfalls**：`some` 返回类型必须是编译时常量，不能在运行时条件返回不同具体类型；使用 `some` 后，函数签名的具体类型信息对调用方不可见，导致无法通过类型进行模式匹配或存储到具名变量中。

**✅ Best Practice**：API 返回值优先使用 `some Protocol` 以隐藏实现细节（如 SwiftUI 视图工厂）；当函数需要保留类型信息供调用方使用时（如管道式处理），改用泛型约束 `<T: Protocol>`；避免在同一个 API 表面混用两种风格造成困惑。

### 16.15 @unchecked Sendable 风险与正确用法

`@unchecked Sendable` 告诉编译器跳过对一个类型的 Sendable 并发安全检查。适用于类型内部线程安全但编译器无法自动推导的场景（如 C 指针、`os_unfair_lock`、线程安全的单例等）。**滥用是 Swift 并发模型中数据竞争的主要来源**。

```swift
// ❌ 错误用法：编译器跳过了检查，但实际并不可线程安全
class BadConfig: @unchecked Sendable {
    var title: String = ""  // 可变属性 — 数据竞争！
    var count: Int = 0
}

// ✅ 正确用法：内部使用同步原语保证线程安全
class SafeConfig: @unchecked Sendable {
    var _lock: os_unfair_lock = os_unfair_lock()
    var _value: String = ""
    var value: String {
        get {
            os_unfair_lock_lock(&_lock)
            defer { os_unfair_lock_unlock(&_lock) }
            return _value
        }
        set {
            os_unfair_lock_lock(&_lock)
            defer { os_unfair_lock_unlock(&_lock) }
            _value = newValue
        }
    }
}

// ✅ 更优方案：优先使用 actor 而非 @unchecked Sendable
actor ActorConfig {
    var value: String = ""
}
```

**⚠️ Pitfalls**：`@unchecked Sendable` 完全绕过 Data Race Checker (DRC)，Release 模式下竞态条件可能静默崩溃或导致内存损坏；闭包捕获非 Sendable 的 `self` 时 DRC 不会报警，问题只在特定调度顺序下暴露。

**✅ Best Practice**：优先使用 `actor` 管理共享可变状态，仅在 actor 无法满足需求（如桥接 C API、零拷贝场景）时才用 `@unchecked Sendable`；使用时在类定义处添加注释说明线程安全保证；每个 `@unchecked Sendable` 实例都应在 code review 中单独审查其并发保证。
