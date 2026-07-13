# Swift 与 Objective-C 互操作详解

---

## 一、混编机制概述

### 1.1 为什么需要混编

```
现实中绝大多数 iOS 项目都是 Swift 和 ObjC 共存的：

  - 历史项目用 ObjC 写的，新功能用 Swift 写
  - 大量第三方库仍然是 ObjC 的（如 SDWebImage、AFNetworking）
  - 系统框架底层是 ObjC（UIKit、Foundation）
  - 团队成员技术栈不同，需要两种语言共存

  Apple 提供了完整的互操作方案，让两种语言可以无缝协作：
    - Swift 调用 ObjC：通过 Bridging Header 或 Module
    - ObjC 调用 Swift：通过编译器自动生成的 -Swift.h 头文件
```

### 1.2 互操作的底层基础

```
Swift 和 ObjC 能互操作的根本原因：

  1. 共享 ObjC Runtime
     - Swift 类如果继承自 NSObject，就接入了 ObjC Runtime
     - 可以使用消息机制（objc_msgSend）
     - 可以被 KVO、KVC、Method Swizzling 等运行时特性操作

  2. 共享内存模型
     - NSObject 子类的 Swift 对象和 ObjC 对象使用相同的引用计数机制
     - ARC 在两种语言中行为一致

  3. 类型桥接（Toll-Free Bridging）
     - String <-> NSString
     - Array <-> NSArray
     - Dictionary <-> NSDictionary
     - 这些转换在运行时几乎零开销

  限制：
    - 纯 Swift 特性（struct、enum with associated values、泛型、协议扩展的默认实现等）
      无法直接暴露给 ObjC
    - ObjC 无法使用 Swift 的值类型语义
```

---

## 二、Swift 调用 Objective-C

### 2.1 Bridging Header（桥接头文件）

```
桥接头文件是 Swift 调用 ObjC 的核心机制（用于 App Target）：

  创建方式：
    方式 1：Xcode 自动创建
      - 在 ObjC 项目中首次添加 Swift 文件时
      - 或在 Swift 项目中首次添加 ObjC 文件时
      - Xcode 会弹框询问是否创建 Bridging Header

    方式 2：手动创建
      - 新建头文件，命名为 [ProductModuleName]-Bridging-Header.h
      - 在 Build Settings 中设置路径：
        Objective-C Bridging Header = MyApp/MyApp-Bridging-Header.h

  文件位置：
    通常在项目根目录或主 Target 文件夹下
```

```objc
// MyApp-Bridging-Header.h
// 在这里 import 的所有 ObjC 头文件，Swift 代码都可以直接使用

#import "NetworkManager.h"
#import "UserModel.h"
#import "UIView+Extension.h"
#import <SDWebImage/SDWebImage.h>
#import <AFNetworking/AFNetworking.h>
```

```swift
// Swift 中直接使用，无需额外 import
let manager = NetworkManager.shared()
let user = UserModel()
user.name = "张三"

// ObjC 的类、方法、属性、枚举、宏（简单宏）都可以直接使用
```

```
Bridging Header 注意事项：

  1. 每个 Target 只能有一个 Bridging Header
     - 如果有多个 Target（App + Extension），每个需要各自的 Bridging Header

  2. Bridging Header 中 import 的内容对所有 Swift 文件可见
     - 相当于全局可见，注意不要 import 过多影响编译速度

  3. Framework Target 不能使用 Bridging Header
     - Framework 必须使用 Module（import 方式）
     - 这是因为 Framework 需要独立编译，不能依赖 App 的桥接文件

  4. Bridging Header 中不能 import Swift 头文件
     - 不能在桥接头文件中 import "MyApp-Swift.h"
     - 会导致循环依赖
```

### 2.2 Module（模块化导入）

```swift
// 对于已经支持 Module 的 ObjC 库，可以直接 import（不需要 Bridging Header）

import UIKit           // 系统框架，天然支持 Module
import SDWebImage      // CocoaPods 管理的库自动生成 Module
import AFNetworking    // 同上

// Module 的优势：
//   - 不需要 Bridging Header
//   - 编译更快（Module 只编译一次，后续复用缓存）
//   - 符号隔离，不会污染全局命名空间
//   - Framework Target 必须用这种方式
```

```
如何让自己的 ObjC 代码支持 Module：

  方式 1：将 ObjC 代码封装为 Framework
    - 创建 Framework Target
    - 在 umbrella header 中暴露公开头文件
    - Swift 代码直接 import FrameworkName

  方式 2：使用 modulemap 文件
    // module.modulemap
    module MyObjCModule {
        header "MyClass.h"
        header "MyHelper.h"
        export *
    }

  方式 3：CocoaPods 自动处理
    - pod 'MyLib' 安装后自动生成 Module
    - Swift 代码直接 import MyLib
```

### 2.3 ObjC 类型在 Swift 中的映射

```
基础类型映射（自动转换）：

  ObjC                         Swift
  ─────────────────────────────────────────
  NSString *                   String
  NSArray *                    [Any]
  NSArray<NSString *> *        [String]
  NSDictionary *               [AnyHashable: Any]
  NSDictionary<NSString *, id> [String: Any]
  NSNumber *                   NSNumber（不自动桥接为 Int/Double）
  NSInteger                    Int
  NSUInteger                   UInt
  CGFloat                      CGFloat
  BOOL                         Bool
  void                         Void
  id                           Any
  Class                        AnyClass
  SEL                          Selector
  nil                          nil（Optional）

  指针类型：
  NSError **                   throws（自动转为 Swift 错误处理）
  int *                        UnsafeMutablePointer<Int32>
  const char *                 UnsafePointer<CChar>
  void *                       UnsafeMutableRawPointer
```

```objc
// ObjC 原始定义
@interface UserManager : NSObject

@property (nonatomic, copy) NSString *userName;
@property (nonatomic, strong) NSArray<UserModel *> *users;

- (nullable UserModel *)findUserWithName:(NSString *)name;
- (BOOL)saveUser:(UserModel *)user error:(NSError **)error;
+ (instancetype)sharedManager;

@end
```

```swift
// 在 Swift 中自动映射为：
class UserManager: NSObject {
    var userName: String        // NSString -> String
    var users: [UserModel]      // NSArray<UserModel *> -> [UserModel]
    
    func findUser(withName name: String) -> UserModel?  // nullable -> Optional
    func save(_ user: UserModel) throws                 // NSError ** -> throws
    class func shared() -> Self                         // instancetype -> Self
}

// 使用示例
let manager = UserManager.shared()
manager.userName = "张三"

if let user = manager.findUser(withName: "李四") {
    do {
        try manager.save(user)
    } catch {
        print("保存失败：\(error)")
    }
}
```

### 2.4 Nullability 标注的重要性

```objc
// ObjC 代码没有 nullability 标注时，Swift 会将所有指针视为隐式解包可选值
@interface MyClass : NSObject
- (NSString *)getName;           // Swift 中变成 -> String!（隐式解包）
- (void)setData:(NSArray *)data; // data 参数变成 [Any]!
@end
```

```objc
// 推荐：添加 nullability 标注
NS_ASSUME_NONNULL_BEGIN   // 默认所有指针为 nonnull

@interface MyClass : NSObject

@property (nonatomic, copy) NSString *name;              // -> String
@property (nonatomic, strong, nullable) UIImage *avatar;  // -> UIImage?

- (NSString *)getName;                                    // -> String
- (nullable UserModel *)findUser:(NSString *)name;        // -> UserModel?
- (void)setData:(NSArray<NSString *> *)data;              // -> [String]

@end

NS_ASSUME_NONNULL_END
```

```
Nullability 标注规范：

  nonnull        不可为 nil   -> Swift 非可选类型（String）
  nullable       可以为 nil   -> Swift 可选类型（String?）
  null_unspecified 未指定      -> Swift 隐式解包（String!）不推荐
  null_resettable  getter nonnull, setter nullable -> String!

  属性标注：
    @property (nonatomic, copy, nonnull) NSString *name;
    @property (nonatomic, strong, nullable) UIImage *avatar;

  方法标注：
    - (nonnull NSString *)getName;
    - (nullable UserModel *)findUser:(nonnull NSString *)name;

  简写方式：
    NS_ASSUME_NONNULL_BEGIN
    // 这个区域内默认都是 nonnull，只需标注 nullable 的
    NS_ASSUME_NONNULL_END

  为什么重要：
    - 没有标注的 ObjC 代码在 Swift 中全是隐式解包（!），容易崩溃
    - 正确标注后 Swift 能精确知道哪些可以为 nil
    - 大幅提升代码安全性和 Swift 端的使用体验
```

### 2.5 轻量级泛型

```objc
// ObjC 的轻量级泛型让 Swift 能获得精确的类型信息

// 没有泛型
@property (nonatomic, strong) NSArray *items;       // Swift: [Any]
@property (nonatomic, strong) NSDictionary *map;    // Swift: [AnyHashable: Any]

// 使用泛型
@property (nonatomic, strong) NSArray<NSString *> *names;         // Swift: [String]
@property (nonatomic, strong) NSArray<UserModel *> *users;        // Swift: [UserModel]
@property (nonatomic, strong) NSDictionary<NSString *, NSNumber *> *scores;  // Swift: [String: NSNumber]

// 方法中使用泛型
- (NSArray<UserModel *> *)fetchUsersWithIDs:(NSArray<NSNumber *> *)ids;
// Swift: func fetchUsers(withIDs ids: [NSNumber]) -> [UserModel]
```

```
轻量级泛型的好处：
  - Swift 端获得精确的类型信息，避免大量 as! 强制类型转换
  - 编译器可以做类型检查，减少运行时错误
  - ObjC 端也能获得编译期警告（虽然不强制）

注意：
  - 只有 NSArray、NSDictionary、NSSet、NSOrderedSet 等集合类支持
  - 自定义类的泛型（如 __covariant）在 Swift 中表现有限
```

---

## 三、Objective-C 调用 Swift

### 3.1 自动生成的 -Swift.h 头文件

```
编译器会自动为每个 Target 生成一个头文件，ObjC 通过它来访问 Swift 代码：

  文件名格式：[ProductModuleName]-Swift.h

  使用方式（在 ObjC 文件中）：
    #import "MyApp-Swift.h"        // App Target
    #import <MyFramework/MyFramework-Swift.h>  // Framework Target

  这个文件包含了所有标记为 @objc 的 Swift 声明的 ObjC 接口
```

```objc
// ObjC 中使用 Swift 类
#import "MyApp-Swift.h"

- (void)example {
    // 使用 Swift 中定义的类
    MySwiftManager *manager = [[MySwiftManager alloc] init];
    [manager doSomethingWithName:@"test"];
    
    // 使用 Swift 中定义的枚举
    MySwiftEnum value = MySwiftEnumOptionA;
}
```

```
-Swift.h 的生成规则：

  只有满足以下条件的 Swift 声明才会出现在 -Swift.h 中：

  1. 类必须继承自 NSObject（或标记 @objc）
  2. 方法/属性必须标记 @objc 或类标记 @objcMembers
  3. 访问级别必须是 public 或 open（Framework 中）
     或 internal 以上（App Target 中）
  4. 参数和返回值必须是 ObjC 兼容的类型

  不会出现在 -Swift.h 中的：
    - struct（值类型）
    - enum with associated values
    - 泛型类（受限支持）
    - 纯 Swift 协议（没有 @objc）
    - 使用了 Swift 独有特性的方法（如 inout、默认参数等）
```

### 3.2 @objc 与 @objcMembers

```swift
// @objc — 将单个声明暴露给 ObjC
class MyManager: NSObject {
    
    @objc var name: String = ""           // 属性暴露给 ObjC
    
    @objc func doWork() {                 // 方法暴露给 ObjC
        print("Working...")
    }
    
    @objc(doWorkWithName:count:)          // 自定义 ObjC 方法名
    func doWork(name: String, count: Int) {
        print("\(name): \(count)")
    }
    
    func swiftOnlyMethod() {              // 没有 @objc，ObjC 看不到
        print("Swift only")
    }
}
```

```swift
// @objcMembers — 将类的所有成员都暴露给 ObjC
@objcMembers
class UserService: NSObject {
    
    var userName: String = ""     // 自动 @objc
    var age: Int = 0              // 自动 @objc
    
    func fetchUser() { }          // 自动 @objc
    func saveUser() { }           // 自动 @objc
    
    // 如果某个成员不想暴露，使用 @nonobjc
    @nonobjc
    func internalMethod() { }     // ObjC 看不到
}
```

```
@objc 的作用：
  1. 将 Swift 声明暴露给 ObjC Runtime
  2. 生成对应的 ObjC 接口到 -Swift.h 文件
  3. 使该方法使用消息派发（objc_msgSend）而非直接调用

  隐含 @objc 的情况（不需要手动标记）：
    - NSObject 子类的 @IBAction / @IBOutlet
    - 重写 ObjC 父类的方法
    - 实现 @objc 协议的方法
    - dynamic 修饰的方法

@objcMembers 的注意事项：
  - 会增加二进制大小（每个方法都要生成 ObjC 元数据）
  - 所有方法都使用消息派发，可能略慢于 Swift 的直接/虚表派发
  - 只在确实需要大量方法暴露给 ObjC 时使用
  - 适用场景：需要被 ObjC 大量调用的 Manager 类、Model 类
```

### 3.3 @objc 自定义名称

```swift
// 自定义暴露给 ObjC 的名称

// 自定义类名
@objc(MTUserManager)
class UserManager: NSObject {
    // ObjC 中使用 MTUserManager *manager = ...
}

// 自定义方法名
@objc(fetchUserWithID:completion:)
func fetchUser(id: String, completion: @escaping (User?) -> Void) { }
// ObjC: [manager fetchUserWithID:@"123" completion:^(User *user) { }];

// 自定义枚举名
@objc(MTUserStatus)
enum UserStatus: Int {
    @objc(MTUserStatusOnline)
    case online
    @objc(MTUserStatusOffline)
    case offline
}
// ObjC: MTUserStatus status = MTUserStatusOnline;
```

```
为什么需要自定义名称：

  1. 避免命名冲突
     - Swift 有命名空间（Module），ObjC 没有
     - 不同 Module 中同名的 Swift 类暴露到 ObjC 会冲突
     - 通过 @objc(MTXxx) 添加前缀避免冲突

  2. 符合 ObjC 命名习惯
     - Swift 的方法签名风格和 ObjC 不同
     - 自定义名称让 ObjC 端更自然

  3. NSCoding / Archive 兼容
     - 归档反归档使用类名字符串
     - 如果类的 Module 名变了，反归档会失败
     - @objc(ClassName) 固定类名，避免兼容性问题
```

### 3.4 Swift 类型暴露给 ObjC 的条件

```swift
// 可以暴露给 ObjC 的 Swift 类型

// 1. 继承自 NSObject 的类
class MyClass: NSObject {
    @objc var name: String = ""   // OK
}

// 2. Int 枚举（必须是 Int 原始值）
@objc enum Status: Int {
    case active = 0
    case inactive = 1
}

// 3. 闭包（符合 ObjC Block 签名）
@objc func fetch(completion: @escaping (Bool) -> Void) { }  // OK

// 4. ObjC 兼容的基本类型
@objc var count: Int = 0          // OK - Int
@objc var rate: Double = 0.0      // OK - Double
@objc var flag: Bool = true       // OK - Bool
@objc var name: String = ""       // OK - String (bridged to NSString)
@objc var items: [String] = []    // OK - Array (bridged to NSArray)
@objc var map: [String: Any] = [:] // OK - Dictionary (bridged to NSDictionary)
```

```swift
// 不能暴露给 ObjC 的 Swift 类型

// 1. struct
struct Point {          // 无法 @objc，ObjC 没有值类型
    var x: Double
    var y: Double
}

// 2. enum with associated values
enum Result {
    case success(Data)   // 关联值枚举无法暴露
    case failure(Error)
}

// 3. 非 Int 原始值的枚举
enum Color: String {     // String 原始值无法 @objc
    case red = "red"
}

// 4. 泛型
class Box<T> {           // 泛型类无法完整暴露
    var value: T
}

// 5. 元组
@objc func getResult() -> (Int, String) { }  // 编译错误

// 6. Swift 独有的函数特性
@objc func process(value: Int = 0) { }       // 默认参数：编译错误
@objc func swap(a: inout Int) { }            // inout：编译错误
```

---

## 四、类型桥接（Type Bridging）

### 4.1 自动桥接

```swift
// String <-> NSString
let swiftString: String = "Hello"
let nsString: NSString = swiftString as NSString    // String -> NSString
let backToSwift: String = nsString as String         // NSString -> String

// Array <-> NSArray
let swiftArray: [String] = ["a", "b", "c"]
let nsArray: NSArray = swiftArray as NSArray
let backToArray: [String] = nsArray as! [String]

// Dictionary <-> NSDictionary
let swiftDict: [String: Any] = ["key": "value"]
let nsDict: NSDictionary = swiftDict as NSDictionary

// Set <-> NSSet
let swiftSet: Set<String> = ["a", "b"]
let nsSet: NSSet = swiftSet as NSSet

// Data <-> NSData
let data: Data = Data()
let nsData: NSData = data as NSData

// 这些桥接在运行时几乎零开销（Toll-Free Bridging）
// 编译器在底层直接转换，不创建新对象
```

### 4.2 NSNumber 桥接的特殊性

```swift
// NSNumber 的桥接比较特殊，不像 String 那样直接

// ObjC 方法返回 NSNumber *
// Swift 中得到的是 NSNumber，不会自动变成 Int 或 Double

// 需要手动转换
let nsNumber: NSNumber = NSNumber(value: 42)
let intValue: Int = nsNumber.intValue
let doubleValue: Double = nsNumber.doubleValue

// 反向转换
let number: NSNumber = 42 as NSNumber         // Int -> NSNumber
let number2: NSNumber = 3.14 as NSNumber      // Double -> NSNumber
let number3: NSNumber = true as NSNumber      // Bool -> NSNumber
```

```
NSNumber 桥接的坑：

  ObjC 中经常这样写：
    @property (nonatomic, strong) NSNumber *age;

  Swift 中映射为：
    var age: NSNumber?

  而不是 Int?，使用时需要手动转换：
    let ageInt = user.age?.intValue

  建议：
    如果 ObjC 属性是基本类型（NSInteger、CGFloat、BOOL），
    直接用基本类型声明，Swift 会自动映射为 Int、CGFloat、Bool：
    @property (nonatomic, assign) NSInteger age;    // Swift: var age: Int
    @property (nonatomic, assign) BOOL isActive;    // Swift: var isActive: Bool
```

### 4.3 id 类型与 Any / AnyObject

```swift
// ObjC 的 id 在 Swift 中映射为 Any（Swift 3+ 之后）

// ObjC:
// - (id)getValue;              -> Swift: func getValue() -> Any
// - (void)setValue:(id)value;   -> Swift: func setValue(_ value: Any)

// Any vs AnyObject：
// Any       — 任意类型（值类型 + 引用类型）
// AnyObject — 任意引用类型（class only）

// ObjC 的 id 映射为 Any，因为 Swift 的值类型也可以桥接为 ObjC 对象
let value: Any = "Hello"           // String 可以桥接为 NSString
let value2: Any = 42               // Int 可以桥接为 NSNumber
let value3: Any = [1, 2, 3]        // Array 可以桥接为 NSArray

// 在需要 AnyObject 的地方传 Any，Swift 会自动桥接
let obj: AnyObject = "Hello" as AnyObject  // String -> NSString -> AnyObject
```

```
常见场景 — UserInfo 字典：

  ObjC:
    NSDictionary *userInfo = @{@"name": @"张三", @"age": @(25)};

  Swift:
    let userInfo: [String: Any] = ["name": "张三", "age": 25]

  取值时需要类型转换：
    if let name = userInfo["name"] as? String {
        print(name)
    }
    if let age = userInfo["age"] as? Int {
        print(age)
    }

  这是混编项目中最常见的模式，也是容易出错的地方。
  建议尽快将 [String: Any] 转换为强类型的 struct/class。
```

---

## 五、方法派发与 dynamic

### 5.1 Swift 的三种方法派发方式

```
Swift 有三种方法派发方式，理解它们对混编很重要：

  1. 直接派发（Static Dispatch / Direct Dispatch）
     - 编译时确定调用的具体函数
     - 最快，编译器可以内联优化
     - 用于：struct 方法、final class 方法、协议扩展中的方法

  2. 虚表派发（V-Table Dispatch）
     - 通过虚函数表查找方法实现
     - 用于：class 的非 final 方法
     - 类似 C++ 的虚函数

  3. 消息派发（Message Dispatch）
     - 通过 ObjC Runtime 的 objc_msgSend 查找方法
     - 最慢，但最灵活（支持 KVO、Method Swizzling）
     - 用于：@objc 方法、dynamic 方法、NSObject 子类的方法

  ┌─────────────────────────────────────────────────────┐
  │          修饰符               派发方式               │
  ├─────────────────────────────────────────────────────┤
  │  struct 方法                  直接派发               │
  │  class 方法 (final)           直接派发               │
  │  class 方法 (non-final)       虚表派发               │
  │  @objc 方法                   消息派发               │
  │  dynamic 方法                 消息派发               │
  │  protocol 方法（对象调用时）   虚表/见证表派发         │
  │  protocol extension 方法      直接派发               │
  └─────────────────────────────────────────────────────┘
```

### 5.2 dynamic 关键字

```swift
// dynamic 强制使用 ObjC 消息派发

class MyClass: NSObject {
    
    // 使用虚表派发（默认）
    func regularMethod() { }
    
    // 使用消息派发（@objc 使其可见，但编译器可能优化为虚表）
    @objc func objcMethod() { }
    
    // 强制消息派发（不会被优化，保证运行时可修改）
    @objc dynamic func dynamicMethod() { }
    
    // dynamic 属性
    @objc dynamic var name: String = ""
}
```

```
什么时候必须用 dynamic：

  1. KVO 观察
     Swift 4+ 中，被观察的属性必须标记 @objc dynamic
     let observation = object.observe(\.name) { obj, change in ... }

  2. Method Swizzling
     要被 Swizzle 的方法必须是 dynamic 的
     否则编译器可能将其优化为直接/虚表调用，Swizzle 不生效

  3. Core Data 的 @NSManaged
     Core Data 的属性使用 @NSManaged，隐含了 dynamic

  注意：
    - dynamic 必须搭配 @objc 使用（或类已经标记了 @objcMembers）
    - dynamic 方法比普通方法慢（消息查找 + 缓存开销）
    - 不要滥用，只在需要运行时动态性时使用
```

---

## 六、Selector 与 Protocol

### 6.1 Selector 在 Swift 中的使用

```swift
// Swift 中使用 #selector 引用 ObjC 方法

class MyViewController: UIViewController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Target-Action 模式
        let button = UIButton()
        button.addTarget(self, action: #selector(buttonTapped(_:)), for: .touchUpInside)
        
        // 通知
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleNotification(_:)),
            name: .myNotification,
            object: nil
        )
        
        // Timer
        Timer.scheduledTimer(
            timeInterval: 1.0,
            target: self,
            selector: #selector(timerFired),
            userInfo: nil,
            repeats: true
        )
        
        // 手势识别
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        view.addGestureRecognizer(tap)
    }
    
    // 被 #selector 引用的方法必须是 @objc 的
    @objc func buttonTapped(_ sender: UIButton) { }
    @objc func handleNotification(_ notification: Notification) { }
    @objc func timerFired() { }
    @objc func handleTap(_ gesture: UITapGestureRecognizer) { }
}
```

```
#selector 的编译期检查：

  Swift 的 #selector 会在编译时检查方法是否存在和签名是否正确，
  比 ObjC 的 @selector 安全得多。

  // 编译错误：方法不存在
  button.addTarget(self, action: #selector(nonExistentMethod), for: .touchUpInside)

  // 编译错误：方法没有标记 @objc
  func swiftOnlyMethod() { }
  button.addTarget(self, action: #selector(swiftOnlyMethod), for: .touchUpInside)

  方法重载时需要用完整签名消除歧义：
  @objc func process(name: String) { }
  @objc func process(id: Int) { }
  
  #selector(process(name:))   // 指定第一个
  #selector(process(id:))     // 指定第二个
```

### 6.2 ObjC 协议在 Swift 中的实现

```swift
// ObjC 协议的 @optional 方法在 Swift 中如何处理

// UITableViewDelegate 中有很多 optional 方法
class MyViewController: UIViewController, UITableViewDelegate {
    
    // @required 方法必须实现
    func tableView(_ tableView: UITableView,
                   numberOfRowsInSection section: Int) -> Int {
        return 10
    }
    
    // @optional 方法可以不实现
    // 如果实现了，就会被调用
    func tableView(_ tableView: UITableView,
                   heightForRowAt indexPath: IndexPath) -> CGFloat {
        return 60
    }
}
```

```swift
// Swift 中定义 @objc 协议

@objc protocol MyDelegate: AnyObject {
    
    // 必须实现
    func didFinishLoading()
    
    // 可选实现
    @objc optional func didFailWithError(_ error: Error)
    @objc optional func progressDidUpdate(_ progress: Float)
}

// 调用 optional 方法时使用可选链
class Manager {
    weak var delegate: MyDelegate?
    
    func load() {
        // 如果 delegate 实现了该方法就调用，否则跳过
        delegate?.didFailWithError?(NSError(domain: "", code: 0))
        delegate?.progressDidUpdate?(0.5)
    }
}
```

```
纯 Swift 协议 vs @objc 协议：

  纯 Swift 协议：
    - 支持 struct / enum 遵循
    - 不支持 @optional 方法
    - 使用虚表/见证表派发
    - 性能更好

  @objc 协议：
    - 只有 class（NSObject 子类）可以遵循
    - 支持 @optional 方法
    - 使用消息派发
    - 可以被 ObjC 代码使用

  如果不需要和 ObjC 交互，也不需要 optional 方法，优先使用纯 Swift 协议。
  如果需要 optional 语义，可以用 Swift 协议 + 默认实现替代：

  protocol MyDelegate: AnyObject {
      func didFinishLoading()
      func didFailWithError(_ error: Error)
  }
  
  extension MyDelegate {
      func didFailWithError(_ error: Error) { }  // 默认空实现 = 可选
  }
```

---

## 七、ObjC 宏与 Swift 适配

### 7.1 NS_SWIFT_NAME

```objc
// NS_SWIFT_NAME 自定义 Swift 中看到的名称

// 重命名类
NS_SWIFT_NAME(NetworkConfig)
@interface MTNetworkConfiguration : NSObject
@end
// ObjC 中使用 MTNetworkConfiguration
// Swift 中使用 NetworkConfig

// 重命名方法
- (void)mt_fetchDataWithURL:(NSURL *)url
                 completion:(void (^)(NSData *))completion
    NS_SWIFT_NAME(fetchData(url:completion:));
// ObjC: [manager mt_fetchDataWithURL:url completion:handler];
// Swift: manager.fetchData(url: url, completion: handler)

// 重命名枚举值
typedef NS_ENUM(NSInteger, MTUserStatus) {
    MTUserStatusActive NS_SWIFT_NAME(active),
    MTUserStatusInactive NS_SWIFT_NAME(inactive),
    MTUserStatusPending NS_SWIFT_NAME(pending),
};
// ObjC: MTUserStatusActive
// Swift: MTUserStatus.active

// 将全局函数变为类型方法
NSString *MTFormatDate(NSDate *date) NS_SWIFT_NAME(getter:DateFormatter.formatted(self:));
```

### 7.2 NS_ENUM 与 NS_OPTIONS

```objc
// NS_ENUM — 在 Swift 中映射为 enum
typedef NS_ENUM(NSInteger, MTUserType) {
    MTUserTypeNormal = 0,
    MTUserTypeVIP = 1,
    MTUserTypeSuperVIP = 2,
};
```

```swift
// Swift 中自动映射为：
enum MTUserType: Int {
    case normal = 0
    case vip = 1
    case superVIP = 2
}

let type: MTUserType = .vip
```

```objc
// NS_OPTIONS — 在 Swift 中映射为 OptionSet
typedef NS_OPTIONS(NSUInteger, MTPermission) {
    MTPermissionRead    = 1 << 0,
    MTPermissionWrite   = 1 << 1,
    MTPermissionExecute = 1 << 2,
};
```

```swift
// Swift 中自动映射为：
struct MTPermission: OptionSet {
    let rawValue: UInt
    static let read    = MTPermission(rawValue: 1 << 0)
    static let write   = MTPermission(rawValue: 1 << 1)
    static let execute = MTPermission(rawValue: 1 << 2)
}

let perm: MTPermission = [.read, .write]
if perm.contains(.read) {
    print("可读")
}
```

### 7.3 其他常用适配宏

```objc
// NS_NOESCAPE — 标记闭包不会逃逸
- (void)performBlock:(NS_NOESCAPE void (^)(void))block;
// Swift: func performBlock(_ block: () -> Void)
// 不需要 @escaping

// NS_SWIFT_NOTHROW — 标记方法不使用 Swift 的 throws
- (BOOL)saveData:(NSData *)data error:(NSError **)error NS_SWIFT_NOTHROW;
// 不会转换为 throws，保留原始签名

// NS_SWIFT_UNAVAILABLE — 在 Swift 中不可用
- (instancetype)init NS_SWIFT_UNAVAILABLE("Use init(config:) instead");
// Swift 中看不到这个方法，编译器会提示替代方案

// NS_REFINED_FOR_SWIFT — 在 Swift 中隐藏原始版本，允许 Swift 提供更好的封装
- (NSArray *)fetchItemsWithFilter:(NSDictionary *)filter NS_REFINED_FOR_SWIFT;
// Swift 中原始方法变为 __fetchItems(withFilter:)（双下划线前缀）
// 然后 Swift 可以提供更好的封装：

// extension MyClass {
//     func fetchItems(filter: MyFilter) -> [MyItem] {
//         let raw = __fetchItems(withFilter: filter.toDictionary())
//         return raw.compactMap { $0 as? MyItem }
//     }
// }
```

---

## 八、混编项目最佳实践

### 8.1 项目结构组织

```
推荐的混编项目结构：

  MyApp/
  ├── MyApp-Bridging-Header.h      // 桥接头文件
  ├── ObjC/                        // ObjC 代码目录
  │   ├── Network/
  │   │   ├── MTNetworkManager.h
  │   │   └── MTNetworkManager.m
  │   ├── Model/
  │   │   ├── MTUserModel.h
  │   │   └── MTUserModel.m
  │   └── Category/
  │       ├── UIView+MTExtension.h
  │       └── UIView+MTExtension.m
  ├── Swift/                       // Swift 代码目录
  │   ├── Services/
  │   │   └── UserService.swift
  │   ├── ViewModels/
  │   │   └── HomeViewModel.swift
  │   └── Views/
  │       └── HomeView.swift
  └── Shared/                      // 共享的协议、常量等
      └── Protocols.swift

原则：
  - ObjC 代码和 Swift 代码分目录存放
  - Bridging Header 只 import 需要被 Swift 调用的 ObjC 头文件
  - 新功能用 Swift 写，逐步将 ObjC 迁移为 Swift
  - 公共协议用 @objc 或纯 Swift（根据是否需要双向调用）
```

### 8.2 循环依赖问题

```
混编中最常见的问题：Swift 和 ObjC 之间的循环引用

  场景：
    ObjC 类 A 引用了 Swift 类 B
    Swift 类 B 又引用了 ObjC 类 A

  问题：
    - ObjC 编译需要 -Swift.h，而 -Swift.h 需要 Swift 先编译
    - Swift 编译需要 Bridging Header 中的 ObjC 头文件
    - 形成循环依赖，编译失败

  解决方案：

  方案 1：在 ObjC 头文件中使用 @class 前向声明
    // A.h
    @class MySwiftClass;   // 前向声明，不 import -Swift.h
    @interface A : NSObject
    @property (nonatomic, strong) MySwiftClass *swiftObj;
    @end

    // A.m
    #import "MyApp-Swift.h"   // 在 .m 文件中 import
    @implementation A
    - (void)doWork {
        [self.swiftObj someMethod];
    }
    @end

  方案 2：使用 Protocol 解耦
    // ObjC 端定义协议
    @protocol DataProvider <NSObject>
    - (NSArray *)fetchData;
    @end

    // Swift 实现协议
    class SwiftDataProvider: NSObject, DataProvider {
        func fetchData() -> [Any] { return [] }
    }

    // ObjC 端使用协议类型，不直接引用 Swift 类
    @property (nonatomic, weak) id<DataProvider> provider;

规则总结：
  - ObjC 头文件（.h）中不要 import -Swift.h
  - 在 ObjC 头文件中用 @class / @protocol 前向声明 Swift 类型
  - 只在 ObjC 实现文件（.m）中 import -Swift.h
  - 使用协议解耦双向依赖
```

### 8.3 编译顺序与常见编译错误

```
混编编译顺序：

  1. 编译 ObjC 文件（生成 .o 文件）
  2. 生成 Swift 模块的 ObjC 接口（-Swift.h）
  3. 编译 Swift 文件（可以读取 Bridging Header 中的 ObjC 接口）
  4. 链接所有 .o 文件

常见编译错误及解决：

  错误 1："Use of undeclared identifier 'MySwiftClass'"
    原因：ObjC 文件中没有 import -Swift.h
    解决：在 .m 文件中 #import "MyApp-Swift.h"

  错误 2："-Swift.h file not found"
    原因：Product Module Name 配置不对
    解决：检查 Build Settings 中 Product Module Name
          确保 import 的文件名正确（空格和特殊字符会被替换为下划线）
          如：My App -> My_App-Swift.h

  错误 3："Cannot find type 'XXX' in scope" (Swift 端)
    原因：ObjC 头文件没有在 Bridging Header 中 import
    解决：在 Bridging Header 中添加对应的 #import

  错误 4：编译时大量 "Unknown type name" 错误
    原因：Bridging Header 中的 import 顺序不对，存在依赖关系
    解决：调整 import 顺序，被依赖的放前面

  错误 5：Framework 中使用了 Bridging Header
    原因：Framework Target 不支持 Bridging Header
    解决：将 ObjC 代码封装为 Module，Swift 使用 import 导入
```

### 8.4 渐进式迁移策略

```
从 ObjC 迁移到 Swift 的推荐策略：

  1. 新功能用 Swift 写
     - 新的 ViewController、ViewModel、Service 都用 Swift
     - 通过 Bridging Header 调用已有的 ObjC 代码

  2. 底层向上迁移
     - 先迁移 Model 层（数据模型）
     - 再迁移 Service 层（网络、数据库等）
     - 最后迁移 ViewController

  3. 迁移单个文件的步骤
     a. 创建对应的 Swift 文件
     b. 在 Swift 中重新实现功能
     c. 让 ObjC 代码通过 -Swift.h 调用新的 Swift 实现
     d. 逐步删除 ObjC 端的调用
     e. 最终删除 ObjC 文件

  4. 注意事项
     - 保持双向可调用，避免一次性迁移太多
     - Category 的迁移要谨慎（Swift extension 的 @objc 方法有限制）
     - NSCoding 的类迁移需要注意归档兼容性（类名变化）
     - 单元测试先行，确保迁移不破坏功能
```

---

## 九、C / C++ 混编

### 9.1 Swift 调用 C

```swift
// Swift 可以直接调用 C 函数（通过 Bridging Header 或 Module）

// Bridging Header 中：
// #include "my_c_lib.h"

// C 函数：int add(int a, int b);
let result = add(3, 5)  // 直接调用

// C 字符串
let cString: UnsafePointer<CChar> = "Hello"
let swiftString = String(cString: cString)

// 指针操作
var value: Int32 = 42
withUnsafeMutablePointer(to: &value) { ptr in
    // ptr 是 UnsafeMutablePointer<Int32>
    someCFunction(ptr)
}

// malloc / free
let buffer = UnsafeMutablePointer<Int32>.allocate(capacity: 10)
buffer.initialize(repeating: 0, count: 10)
// 使用 buffer...
buffer.deinitialize(count: 10)
buffer.deallocate()
```

### 9.2 Objective-C++ 桥接 C++

```
Swift 不能直接调用 C++，但可以通过 ObjC++ 作为桥梁：

  Swift -> ObjC++ Wrapper -> C++

  步骤：
    1. 将 ObjC 的 .m 文件改为 .mm（变成 ObjC++ 文件）
    2. 在 .mm 文件中调用 C++ 代码
    3. 用 ObjC 接口包装 C++ 功能
    4. Swift 通过 Bridging Header 调用 ObjC 包装类
```

```objc
// CppWrapper.h — ObjC 头文件（不包含任何 C++ 代码）
@interface CppWrapper : NSObject
- (int)calculateWithX:(int)x y:(int)y;
@end
```

```objc
// CppWrapper.mm — ObjC++ 实现文件
#import "CppWrapper.h"
#include "MyCppClass.hpp"  // C++ 头文件

@implementation CppWrapper {
    MyCppClass *_cppObject;  // C++ 对象
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _cppObject = new MyCppClass();
    }
    return self;
}

- (void)dealloc {
    delete _cppObject;
}

- (int)calculateWithX:(int)x y:(int)y {
    return _cppObject->calculate(x, y);  // 调用 C++ 方法
}

@end
```

```swift
// Swift 中使用
// Bridging Header: #import "CppWrapper.h"
let wrapper = CppWrapper()
let result = wrapper.calculate(withX: 3, y: 5)
```

```
Swift 5.9+ 支持 C++ Interop（实验性）：

  在 Build Settings 中开启：
    C++ and Objective-C Interoperability = C++ / Objective-C++

  开启后 Swift 可以直接调用部分 C++ 代码，
  但目前支持有限，生产环境建议仍使用 ObjC++ 桥接方式。
```

---

## 十、常见问题与坑点

### 10.1 编译相关

```
坑 1：-Swift.h 中找不到某个 Swift 类

  可能原因：
    a. 类没有继承 NSObject
    b. 方法/属性没有标记 @objc
    c. 使用了 ObjC 不兼容的类型（struct、泛型、关联值枚举）
    d. 访问级别不够（private / fileprivate）
    e. 编译错误导致 -Swift.h 未正确生成

  解决：检查上述条件，修复编译错误后 Clean Build

坑 2：Module Name 与文件名不匹配

  -Swift.h 的名称由 Product Module Name 决定
  如果项目名包含空格或特殊字符：
    "My App" -> "My_App-Swift.h"
    "123App" -> "_23App-Swift.h"（数字开头加下划线）

坑 3：CocoaPods 的 Swift Pod 在 ObjC 中不可见

  原因：Swift Pod 默认不生成 ObjC 接口
  解决：在 Pod 的 Swift 文件中使用 @objc public
```

### 10.2 运行时相关

```
坑 4：Swift 类的 KVO 不生效

  原因：被观察的属性没有标记 @objc dynamic
  解决：
    @objc dynamic var name: String = ""
    // 必须两个都有：@objc 暴露给 Runtime，dynamic 保证消息派发

坑 5：Method Swizzling 对 Swift 方法不生效

  原因：Swift 方法默认使用虚表派发，不走 objc_msgSend
  解决：被 Swizzle 的方法必须是 @objc dynamic

坑 6：NSClassFromString 找不到 Swift 类

  原因：Swift 类在 ObjC Runtime 中的名称是 ModuleName.ClassName
  解决：
    // 使用完整名称
    Class cls = NSClassFromString(@"MyApp.UserManager");
    
    // 或者在 Swift 中用 @objc 指定固定名称
    @objc(UserManager)
    class UserManager: NSObject { }
    // 这样 NSClassFromString(@"UserManager") 就能找到

坑 7：NSCoding 归档反归档 Swift 类失败

  原因：Module 名变化后，归档的类名字符串对应不上
  解决：
    @objc(MTUserModel)
    class UserModel: NSObject, NSCoding {
        // @objc(MTUserModel) 固定了 Runtime 类名
        // 不管 Module 名怎么变，归档都能正确反序列化
    }
```

### 10.3 性能相关

```
坑 8：@objcMembers 导致性能下降

  原因：所有方法都变成消息派发，丧失了 Swift 的编译优化
  建议：只对需要暴露给 ObjC 的类使用 @objcMembers
        或者只对需要的方法单独标记 @objc

坑 9：大量类型转换 as 导致性能问题

  场景：频繁将 [Any] 转为 [String]，NSDictionary 转为具体类型
  解决：在数据入口处一次性转换为强类型，后续使用强类型

坑 10：String 和 NSString 的不必要转换

  场景：在 Swift 和 ObjC 之间频繁传递字符串
  说明：实际上 String 和 NSString 的桥接几乎零开销
        但频繁的 as NSString / as String 可能导致不必要的拷贝
  建议：在同一语言内部统一使用一种类型
```

---

## 面试题

### Q1：Swift 调用 ObjC 和 ObjC 调用 Swift 分别是怎么实现的？

```
A：两个方向使用不同的机制：

  Swift 调用 ObjC：
    - App Target：通过 Bridging Header（桥接头文件）
      在桥接头文件中 import ObjC 的头文件，Swift 就能直接使用这些 ObjC 类型
    - Framework Target：通过 Module（import 框架名）

  ObjC 调用 Swift：
    - 编译器自动生成 [ModuleName]-Swift.h 头文件
    - ObjC 在 .m 文件中 import 这个头文件
    - 只有标记了 @objc 的 Swift 声明才会出现在这个头文件中
    - 参数和返回值必须是 ObjC 兼容的类型

  底层原理：
    两种语言能互操作是因为 Swift 的 NSObject 子类接入了 ObjC Runtime，
    共享消息派发机制和引用计数模型，加上 String/Array/Dictionary 等
    类型的自动桥接（Toll-Free Bridging），使得交互几乎无缝。
```

### Q2：@objc 和 dynamic 有什么区别？

```
A：两者的作用不同：

  @objc：
    - 将 Swift 声明暴露给 ObjC Runtime
    - 生成对应的 ObjC 接口到 -Swift.h 文件
    - 但编译器可能仍然使用虚表派发来优化调用性能
    - 使用场景：需要被 ObjC 代码调用的方法

  dynamic：
    - 强制使用 ObjC 的消息派发（objc_msgSend）
    - 保证运行时可以通过 Runtime 修改方法实现
    - 必须搭配 @objc 使用
    - 使用场景：KVO 观察的属性、需要 Method Swizzling 的方法

  简单理解：
    @objc = "让 ObjC 能看到我"
    dynamic = "让 ObjC 能在运行时修改我"
    @objc dynamic = "让 ObjC 能看到我，而且保证走消息派发"
```

### Q3：Nullability 标注为什么重要？

```
A：Nullability 标注直接影响 Swift 端的类型安全性。

  没有标注时：
    ObjC 所有指针类型在 Swift 中都变成隐式解包可选值（String!）
    使用时不会提示可能为 nil，但运行时如果真的是 nil 就会崩溃

  正确标注后：
    nonnull -> String      不可能为 nil，安全使用
    nullable -> String?    可能为 nil，编译器强制检查
    
  这让 Swift 代码能在编译期就发现潜在的空指针问题，
  而不是等到运行时崩溃。

  最佳实践：
    使用 NS_ASSUME_NONNULL_BEGIN / END 包裹头文件，
    默认所有指针为 nonnull，只对可能为 nil 的标注 nullable。
```

### Q4：混编项目中遇到循环依赖怎么解决？

```
A：混编循环依赖是指 ObjC 引用 Swift 类，Swift 又引用 ObjC 类。

  根本原因：
    ObjC 编译依赖 -Swift.h -> Swift 编译依赖 Bridging Header -> 循环

  解决方案：
    1. 在 ObjC 头文件（.h）中不要 import -Swift.h
       用 @class / @protocol 做前向声明
       只在实现文件（.m）中 import -Swift.h

    2. 使用协议解耦
       定义公共协议，让两端依赖协议而非具体类型

    3. 调整代码结构
       将共享的类型抽取到独立模块
       使单向依赖成为可能

  核心规则：头文件中前向声明，实现文件中 import。
```

### Q5：哪些 Swift 类型不能暴露给 ObjC？

```
A：以下 Swift 特性无法暴露给 ObjC：

  类型层面：
    - struct（值类型，ObjC 没有对应概念）
    - enum with associated values（关联值枚举）
    - 非 Int 原始值的 enum（如 String 枚举）
    - 泛型类（受限支持）
    - 元组（Tuple）

  方法层面：
    - 默认参数的方法
    - inout 参数的方法
    - 可变参数的方法（受限）
    - 返回 Swift 独有类型的方法

  本质原因：
    ObjC Runtime 只能处理它能理解的类型。
    Swift 的值语义、泛型、代数类型等在 ObjC Runtime 中没有对应物。
    所以暴露给 ObjC 的 Swift 代码必须限制在 ObjC 能表达的范围内。
```

### Q6：如何让 ObjC 的枚举和位掩码在 Swift 中更好用？

```
A：使用 NS_ENUM 和 NS_OPTIONS 宏：

  NS_ENUM 映射为 Swift enum：
    typedef NS_ENUM(NSInteger, MyType) { MyTypeA, MyTypeB };
    -> enum MyType: Int { case a, b }

  NS_OPTIONS 映射为 Swift OptionSet：
    typedef NS_OPTIONS(NSUInteger, MyOption) { OptionA = 1<<0, OptionB = 1<<1 };
    -> struct MyOption: OptionSet { static let a, b }

  如果不用这些宏，直接用 typedef enum，
  Swift 会把它当作一组独立的常量而非结构化的类型，
  使用体验很差。

  还可以配合 NS_SWIFT_NAME 自定义 Swift 端看到的名字，
  让命名更符合 Swift 风格。
```

### Q7：@objc 属性的要求与限制有哪些？

```
A：@objc 控制 Swift 实体对 ObjC Runtime 的可见性，但有严格限制：

  基本规则：
    - 只有 class/struct/enum/protocol 可以标记 @objc
    - 类必须继承自 NSObject（或 @objcMembers 在类级别）
    - 方法必须使用 ObjC 兼容类型（不能是泛型、元组等）

  限制清单：
    - 泛型方法无法暴露（ObjC 不支持泛型）
    - 函数式类型（(Int) -> String）不可用
    - Swift 独有的类型（Result, Optional 包装非 ObjC 类型）不可用
    - @objc 不能用在 nonisolated 的 Actor 上

  可见性控制：
    - @objc 显式标记单个方法
    - @objcMembers 标记整个类所有成员（但 struct/enum 成员需 @objc）
    - @_disableOutLift 关闭尾调用优化（闭包场景）

  ⚠️ Pitfalls：滥用 @objcMembers 会导致不必要的 Runtime 开销，每个方法都生成 ObjC selector 和消息分发开销。只标记真正需要跨语言调用的成员。

  ✅ Best practice：优先使用 @objc 逐个标记，而非 @objcMembers 全量暴露。对于纯 Swift 内部的工具类，完全不需要 @objc。
```

### Q8：Swift Result Builders 如何桥接到 ObjC？

```
A：Result Builder（@_functionBuilder）是 Swift 独有的元编程特性，ObjC 无对应机制。
核心策略是用 ObjC 可理解的 API 做"外层包装"：

  SwiftUI 官方方案：
    - SwiftUI 内部用 @ViewBuilder 描述 UI 树
    - 桥接时通过 NS_SWIFT_NAME 和生成代码隐藏 Builder 细节
    - ObjC 端看到近似 createWithChildren: 的 API

  自定义桥接模式：
    - 步骤1：定义 ObjC 兼容的中间表示层（NSArray 或 NSSet 包装子元素）
    - 步骤2：Swift 端实现 Builder，收集子项并转换为数组
    - 步骤3：最终暴露给 ObjC 的方法接收 NSArray 参数

`swift
// Swift Builder 层（内部使用）
@_functionBuilder
struct ConfigBuilder {
    static func buildBlock(_ components: ConfigComponent...) -> [ConfigComponent] {
        components
    }
}

// ObjC 桥接层（暴露给 ObjC 调用）
@objc public class ConfigBuilder_Bridge: NSObject {
    @objc public static func build(configComponents: [ConfigComponent]) -> Config {
        return Config(components: configComponents)
    }
}

// ObjC 调用方无需理解 Builder，直接传数组即可
// [[ConfigBuilder_Bridge buildWithConfigComponents:@[...]] ...]
```

⚠️ Pitfalls：Result Builder 的嵌套组合逻辑（buildOptional, buildEither/first/second）无法在 ObjC 端复现，桥接层需手动处理这些变体或简化语义。

✅ Best practice：ObjC 侧提供工厂方法接受 NSArray，Swift 侧用 Builder 语法糖，两者通过中间表示层解耦，避免 ObjC 代码感知 Builder 的存在。
```

### Q9：Swift async/await 如何桥接到 ObjC（swift_bridge）？

```
A：Swift 5.5+ 的 async/await 通过 @concurrent 和 swift_bridge 机制桥接到 ObjC。
ObjC 端无原生 async 支持，需通过 completion handler 或 NS_SWIFT_NAME 桥接。

  核心机制：
    - @concurrent 标记 ObjC 方法，自动从 completion handler 生成 Swift async 签名
    - Swift 的 async 函数无法直接调用 ObjC（逆向不行）
    - swift_bridge（Xcode 15+/iOS 17+）支持 Swift Sendable 跨语言边界

  单向桥接（ObjC → Swift）：

`swift
// ObjC 头文件声明
- (void)fetchDataWithCompletion:(void(^)(NSData *data, NSError *error))completion;

// Swift 端自动获得：
// func fetchData() async throws -> Data
// 编译器自动生成：completion handler ↔ async/await 转换
```.

  逆向桥接（Swift → ObjC）：

`swift
// Swift 并发 API 无法直接暴露给 ObjC
// 必须提供 completion handler 包装层
@objc public class NetworkBridge: NSObject {
    @objc public static func fetchData(completion: @escaping (Data?, Error?) -> Void) {
        Task {
            do {
                let data = try await realAsyncFetch()
                completion(data, nil)
            } catch {
                completion(nil, error)
            }
        }
    }
}
```.

  iOS 17+ @preconcurrency 和 Sendable 桥接：
    - Sendable 类型可安全跨语言传递
    - @preconcurrency 抑制 ObjC 模块的并发检查
    - Swift 的 MainActor 与 ObjC 的 main thread 自动对齐
```

⚠️ Pitfalls：在 Task { } 内桥接 async→completion 时，若未正确处理 error 到 NSError 的转换，会导致 ObjC 端收到 nil error 而难以调试。务必使用 NSSwapEnumeratedBlob 或自定义 NSError domain 包装 Swift Error。

✅ Best practice：ObjC 侧提供 completion handler 接口，Swift 侧用 Task { } 包装 async 函数；返回值统一使用 Sendable 类型，避免跨隔离边界传递非隔离数据导致数据竞争。

### 混合项目中的 @unchecked Sendable

在 Swift/ObjC 混合项目中，许多 ObjC 类型（如 `NSMutableDictionary`、`NSNotificationCenter`）不具备 Swift 的 `Sendable` 保证，直接传递会触发并发隔离警告。`@unchecked Sendable` 允许你告诉编译器"我确认这个类型是线程安全的"，但它绕过了编译时检查，风险完全由开发者承担。

```swift
// ❌ 错误：ObjC 集合类型默认不是 Sendable
func shareConfig(_ config: NSMutableDictionary) async {
    // 警告: Mutation of nonisolated state in a concurrent context
}

// ✅ 正确做法：为 ObjC 类型创建 Sendable 包装
extension NSMutableDictionary: @unchecked Sendable {}
// 注意：这只在确定该实例不被多线程并发修改时才安全

// 更安全的方式：使用 Swift 原生类型作为边界接口
struct ConfigDTO: Sendable {
    let data: [String: AnyHashable]
}

@objc class ConfigBridge: NSObject {
    @objc static func apply(_ dict: [NSString: AnyObject]) {
        let config = UserDefaults.standard
        config.setObject(dict, forKey: "config")
    }
}
```

⚠️ Pitfalls：`@unchecked Sendable` 不会执行任何运行时检查，若类型实际存在数据竞争，可能导致难以复现的崩溃或静默数据损坏。

✅ Best practice：优先将 ObjC 的非 Sendable 类型在语言边界处转换为 Swift 原生 Sendable 值类型，仅在性能临界路径上才使用 `@unchecked Sendable` 扩展。

### 带关联类型的 Swift 协议无法桥接到 ObjC 协议

Swift 中带有 `associatedtype` 的协议（如 `Collection`、`Sequence`）无法被 Objective-C 理解，因为 ObjC 的协议系统不支持泛型关联类型。即使添加 `@objc` 修饰符，编译器也会报错。这是 Swift 与 ObjC 互操作中最常见的限制之一。

```swift
// ❌ 编译错误：不能将带 associatedtype 的协议暴露给 ObjC
@objc public protocol DataParser {
    associatedtype T          // ObjC 无法处理
    func parse(_ data: Data) -> T
}

// ✅ 正确做法：用泛型类/函数替代协议，或通过具体类型桥接
public class JSONParser<T: Decodable>: NSObject {
    @objc public func parse(data: NSData, completion: @escaping (NSString?) -> Void) {
        // 内部使用泛型，对外暴露 ObjC 兼容接口
    }
}

// ✅ 替代方案：去掉 associatedtype，用 Any 或具体类型
@objc public protocol ObjCCompatibleParser {
    func parse(_ data: Data) -> Any  // 编译时类型信息丢失，但可桥接
}
```

⚠️ Pitfalls：使用 `Any` 作为返回值时，ObjC 侧无法在编译期知道返回类型，必须运行时类型检查，易引发崩溃。

✅ Best practice：在 ObjC 边界处使用具体类而非泛型协议，Swift 内部继续使用带 `associatedtype` 的原生协议，通过适配器模式在两层之间转换。

### Swift 枚举桥接到 ObjC（原始值、@_objcEnum）

Swift 的 `@objc enum` 自动桥接为 ObjC 的 `NS_ENUM`/`NS_OPTIONS`，但要求原始值类型为 `Int`（或 `Int` 的子类型如 `UInt`）。非整型原始值（如 `String`）的枚举**无法**直接桥接到 ObjC。

```swift
// ✅ 自动桥接为 ObjC NS_ENUM（原始值必须为 Int）
@objc public enum UserStatus: Int {
    case active, inactive, suspended
}
// ObjC 侧自动看到：typedef NS_ENUM(NSUInteger, UserStatus) { UserStatusActive, ... }

// ✅ 位标志枚举（NS_OPTIONS）
@objc public enum PermissionOptions: Int {
    case read, write, execute
    static var allBasic: PermissionOptions { [.read, .write] }
}
// ObjC 侧自动看到：typedef NS_OPTIONS(NSUInteger, PermissionOptions) { PermissionRead = 1 << 0, ... }

// ❌ 非整型原始值无法桥接
@objc public enum HttpStatus: String {  // 编译错误
    case ok = "200"
}
```

⚠️ Pitfalls：`@_objcEnum` 是编译器内部注解（由 swift-IDESupport 自动添加），手动使用可能导致 ABI 不稳定；始终使用 `@objc enum` 而非 `@_objcEnum`。
✅ Best practice：需要非整型枚举桥接时，在 ObjC 侧定义 `NSString *` 常量（`NSString HttpStatusOK = @"200"`），Swift 侧通过 `rawValue` 手动映射。

### Swift 函数（闭包）桥接到 ObjC block

Swift 闭包与 Objective-C 的 `Block` 在 ABI 层面完全兼容，可以直接相互转换。Swift 的 `(Params) -> ReturnType` 语法在混编环境中自动桥接为 ObjC 的 `^(Params) ReturnType` 块语法。这种桥接是编译器自动完成的，无需手动介入。

```swift
// Swift 侧：闭包传参给 ObjC 方法
class MyClass: NSObject {
    @objc func fetchData(completion: @escaping (String, Error?) -> Void) {
        DispatchQueue.global().async {
            let result = "Hello from Swift"
            completion(result, nil)
        }
    }
}
// ObjC 侧等价的 Block 签名：
// - (void)fetchDataWithCompletion:(void(^)(NSString *result, NSError *error))completion;
```

⚠️ Pitfalls：闭包中捕获 Swift 变量会改变 Block 的内存布局，可能导致 ObjC 侧 `Block_copy` / `Block_release` 与 Swift 的 ARC 引用计数不一致；避免在 Block 中捕获非 `Sendable` 对象用于跨线程回调。

✅ Best practice：在混编回调中始终使用 `@escaping` 修饰闭包参数，确保生命周期由调用方明确管理；回调中仅捕获 `@objc` 兼容类型或 Swift 原生值类型（如 `String`、`Int`、`Data`）。

### @_silgen_name 用于从 ObjC 调用 C/Swift

`@_silgen_name` 是 Swift 编译器内部属性，用于改变函数或变量在目标文件中的**链接名**（link name），使 Objective-C 或 C 代码能通过 `extern` 直接调用 Swift 导出的函数。与 `@_cdecl` 不同，`@_silgen_name` 允许自定义任意 C 兼容的名称，而 `@_cdecl` 仅使用 Swift 标识名并按 C 约定导出。

```swift
// Swift 侧：自定义链接名
@_silgen_name("swift_processData")
public func processData(_ data: Data) -> Int {
    return data.count
}

// @_cdecl 对比：自动使用 Swift 名
@_cdecl("calculateHash")
public func calculateHash(_ input: String) -> Int {
    return input.hashValue
}
```

在 Objective-C 侧调用：

```objc
// Objective-C 侧：通过 extern 声明
extern int swift_processData(const char *data, NSUInteger len);
// 注意：Data 等 Swift 原生类型无法通过 @_silgen_name 桥接
// @_silgen_name 仅适用于纯 C 签名（基础类型、指针、struct）
```

⚠️ Pitfalls：`@_silgen_name` 是 Apple 内部属性，不在官方文档中，未来编译器版本可能改变行为；且**不能**用于桥接 Swift 原生类型（如 `String`、`Data`、`Array`），仅支持 C 基础类型和结构体。

✅ Best practice：优先使用 `@objc` 或 `@_cdecl` 进行混编；仅在需要与现有 C API 精确对接（如系统框架、第三方 C 库）时才使用 `@_silgen_name`，并始终通过封装层隔离以保留未来迁移到官方机制的能力。

### 混合项目中的 Swift 并发（Task、@MainActor）

在 Swift/ObjC 混编项目中，Swift 5.5+ 的结构化并发（async/await、Task、@MainActor）无法直接暴露给 Objective-C 侧。ObjC 仍使用传统的 Block 回调或 Target-Action 模式。混编时的核心挑战是**在两种并发模型之间建立安全的桥接层**，避免主线程违规、数据竞争或生命周期泄漏。

```swift
// Swift 侧：为 ObjC 提供 Block 回调接口
class APIClient: NSObject {
    @objc func fetchData(completion: @escaping (Data?, Error?) -> Void) {
        Task { @MainActor in
            do {
                let data = try await fetchFromServer()
                completion(data, nil)
            } catch {
                completion(nil, error)
            }
        }
    }

    @MainActor func updateUI(with data: Data) {
        // 安全更新 UI
    }
}
```

⚠️ Pitfalls：在 `Task { @MainActor in ... }` 内桥接 async→completion 时，若未正确转换 Swift Error 为 NSError，ObjC 端会收到 nil error；避免在 Block 回调中捕获非 Sendable 对象用于跨隔离边界传递。

✅ Best practice：混编回调统一使用 @objc 兼容类型（NSData、NSError、NSString），Swift 侧用 Task 包装 async 逻辑；UI 更新始终通过 @MainActor 方法或 DispatchQueue.main.async 派发。

### 自动 @objc 合成规则

Swift 编译器会在特定条件下**自动**为 Swift 类、属性、方法、下标和初始化器合成 `@objc` 属性，使其对 Objective-C 可见。无需手动添加 `@objc` 标记，但需满足严格的前提条件。

**自动合成的触发条件：**
- 类继承自 `NSObject` 或 `@objc` 类
- 位于框架或可被 ObjC 访问的模块中（`@objcMembers` 可批量启用）
- 成员签名符合 ObjC 规范（无泛型、无元组、无 Swift 原生类型如 `String`、`Int`、`Optional`）

```swift
class APIService: NSObject {
    // ✅ 自动合成 @objc — 继承自 NSObject + 签名兼容
    var timeout: Int = 30          // ❌ Int 不兼容，不会合成
    var name: String?              // ❌ String? 不兼容
    var title: NSString?           // ✅ 自动合成 @objc
    @objc var count: Int = 0       // ✅ 手动标记可绕过限制
    func handleEvent(_ sender: Any?) -> Bool  // ✅ 自动合成
    func generic<T>(value: T) {}    // ❌ 泛型，不会合成
}
```

⚠️ Pitfalls：Swift 原生类型（String、Int、Bool、Optional、Array、Dictionary、Enum、泛型、元组、闭包、静态成员、final 方法、computed 属性返回值含 Swift 类型）**不会**自动合成 @objc；混编时 ObjC 侧会看不到这些成员，导致运行时崩溃或链接错误。

✅ Best practice：混编接口层统一使用 ObjC 兼容类型（NSString、NSInteger、NSArray、NSError、BOOL、NSData、NSURL、NSDictionary、NSDate、NSObject?）；对确定需要暴露的属性显式添加 @objc；对内部实现使用 swift_private 或 fileprivate 避免不必要的 @objc 膨胀；避免对整个模块使用 @objcMembers，精准标记以减少编译产物体积和运行时开销。

### UIKit 中嵌入 SwiftUI 视图（UIHostingController）及反向嵌入

在混编项目中，SwiftUI 视图通过 `UIHostingController` 嵌入 UIKit 视图层级；反之，UIKit 视图通过 `UIViewRepresentable` / `UIViewControllerRepresentable` 嵌入 SwiftUI 布局。这是 Apple 官方推荐的互操作路径，也是混编迁移的核心模式。

```swift
// 1. SwiftUI → UIKit：用 UIHostingController 承载 SwiftUI 视图
class ContainerViewController: UIViewController {
    func embedSwiftUIView() {
        let swiftUIView = ContentView()
        let hosting = UIHostingController(rootView: swiftUIView)
        addChild(hosting)
        view.addSubview(hosting.view)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hosting.view.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hosting.didMove(toParent: self)
    }
}

// 2. UIKit → SwiftUI：用 UIViewRepresentable 封装 UIKit 视图
struct MapViewWrapper: UIViewRepresentable {
    func makeUIView(context: Context) -> MKMapView { MKMapView() }
    func updateUIView(_ map: MKMapView, context: Context) {}
}
```

⚠️ Pitfalls：`UIHostingController.view` 首次布局时尺寸为零，需在添加为子控制器**之前**设置约束或 `frame`；混用 Auto Layout 与 SwiftUI 布局时注意 `translatesAutoresizingMaskIntoConstraints` 的影响；SwiftUI 侧生命周期与 UIKit 不同步，避免在 `onAppear`/`onDisappear` 中做不可逆操作。

✅ Best practice：封装统一的嵌入辅助方法（如 `UIViewController.makeChildIfNeeded(_:constraints:)`），在迁移期逐步用 SwiftUI 替换 UIKit 子模块；对需要与 ObjC 交互的场景，始终通过 @objc 兼容的 Coordinator 或 Block 回调桥接状态。

### 通过 Bridging Header vs package.clangTarget 导入 C 头文件

在 Swift 与 Objective-C / C 混编项目中，引入非 Swift 代码有两种主流方式：**Bridging Header**（混编桥接文件）和 **package.clangTarget**（Swift Package Manager 的 clang 目标）。两者适用场景、可见范围和构建行为截然不同。

**Bridging Header** 是 Xcode 混编项目的标准方式。在 Target Settings 中设置 `Swift Compiler - General -> Objective-C Bridging Header` 路径，该 `.h` 文件中 `#import` 的所有头文件对 Swift 代码全局可见。

**package.clangTarget** 用于 Swift Package Manager 中引入 C / Objective-C 源码。通过 `.target(name: "CModule", dependencies: ["AnotherCModule"])` 或 `.clangTarget` 配置，SPM 自动处理头文件搜索路径、模块映射和编译产物，无需手动配置 Bridging Header。

```swift
// Package.swift — 在 SPM 中引入 C / ObjC 代码
.target(
    name: "NetworkClient",
    dependencies: ["CURLWrapper", "JSONParser"]
)
// CURLWrapper 是一个包含 C 源码的 target，
// Swift 侧通过 @_exported import 或直接 import NetworkClient 使用
```

⚠️ Pitfalls：Bridging Header 中引入的头文件对**整个 Target**可见，命名冲突或宏污染会影响所有 Swift 文件；SPM 的 clangTarget 不支持混用 Swift 和 ObjC 源码（需用 `.target` 分拆）；Bridging Header 不支持泛型、模块隔离或条件编译粒度控制。

✅ Best practice：混编迁移期使用 Bridging Header 快速接入现有 ObjC 代码；长期维护逐步将 C / ObjC 模块封装为独立 SPM Package，通过 clangTarget 或 public header 暴露最小接口；避免在 Bridging Header 中 `#import <Cocoa/Cocoa.h>` 等 umbrella header，精准引入以减少编译时间和命名冲突。
