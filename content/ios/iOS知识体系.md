# iOS 开发知识体系

---

## 一、Objective-C  👉 [详解文档](01-Objective-C语言基础详解.md)

### 1.1 语言基础  👉 [详解](01-Objective-C语言基础详解.md)
- 数据类型：基本类型（int, float, double, char）、对象类型（NSString, NSNumber, NSArray, NSDictionary）、id 类型
- 变量与常量：static、extern、const、volatile、typedef
- 运算符与表达式
- 流程控制：if/else、switch、for、while、do-while、for-in
- 预处理器：#define、#ifdef、#ifndef、#import、#include、#pragma

### 1.2 面向对象
- 类与对象：@interface、@implementation、@property、@synthesize、@dynamic
- 继承：单继承、super、self
- 多态：动态绑定、id 类型、isKindOfClass / isMemberOfClass
- 封装：@public、@protected、@private、@package
- 分类（Category）：扩展方法、关联对象（Associated Objects）
- 扩展（Extension）：匿名分类、声明私有方法
- 协议（Protocol）：@required、@optional、委托模式（Delegate）

### 1.3 内存管理 👉 [详解](03-内存管理详解.md)
- MRC：retain、release、autorelease、retainCount
- ARC：__strong、__weak、__unsafe_unretained、__autoreleasing
- 自动释放池：@autoreleasepool、NSAutoreleasePool
- 循环引用：Block 循环引用、Delegate 循环引用、Timer 循环引用
- 属性修饰符：assign、retain、copy、strong、weak、nonatomic/atomic
- Copy 语义：深拷贝 vs 浅拷贝、NSCopying / NSMutableCopying

### 1.4 Block
- Block 语法与类型：^return type(params){ body }
- Block 捕获变量：自动值捕获、__block 修饰符
- Block 的内存管理：栈 Block → 堆 Block 的拷贝
- Block 循环引用与解决方案：weak-self dance、weakSelf/strongSelf
- Block 作为参数与返回值
- typedef Block

### 1.5 消息机制 👉 [详解](04-消息机制与Runtime详解.md)
- objc_msgSend：消息发送、消息转发
- 消息转发流程：resolveInstanceMethod → forwardingTargetForSelector → forwardInvocation
- Method Swizzling：runtime 方法替换、+AOP 实践
- 动态添加方法：class_addMethod
- 动态添加属性：objc_setAssociatedObject / objc_getAssociatedObject

### 1.6 Runtime 👉 [详解](04-消息机制与Runtime详解.md)
- 数据结构：objc_class、objc_object、Method、Ivar、Property、Category
- Class 操作：objc_getClass、object_getClass、class_getInstanceMethod、class_getClassMethod
- Ivar 操作：class_copyIvarList、object_getIvar
- Method 操作：method_exchangeImplementations、class_addMethod、class_replaceMethod
- Protocol 操作：class_copyProtocolList、protocol_getMethodDescription
- KVO 底层实现：ISA-swizzling
- KVC 底层实现：访问顺序与查找机制

### 1.7 常用设计模式
- 单例模式
- 委托模式（Delegate）
- 观察者模式（KVO / NSNotificationCenter）
- 工厂模式
- 策略模式
- 适配器模式
- 命令模式

### 1.8 其他特性
- NSValue、NSNumber、NSString 常用方法
- 字面量语法：@[]、@{}、@()
- 枚举：NS_ENUM、NS_OPTIONS
- 错误处理：NSError、@try/@catch/@finally
- 谓词：NSPredicate
- 排序：NSSortDescriptor

---

## 二、Swift  👉 [详解文档](02-Swift语言基础详解.md)

### 2.1 语言基础  👉 [详解](02-Swift语言基础详解.md)
- 数据类型：Int、Float、Double、Bool、String、Character、Array、Dictionary、Set、Tuple
- 可选类型：Optional、隐式解包（Implicitly Unwrapped Optional）、可选绑定（if let / guard let）、可选链
- 类型推断与类型安全
- 类型别名：typealias
- 元组（Tuple）
- 字面量
- 注释与文档注释

### 2.2 运算符
- 基本运算符：算术、比较、逻辑、赋值
- 区间运算符：闭区间(..._)、半开区间(..<)、单侧区间
- 溢出运算符：&+、&-、&*
- 空合运算符：??
- 自定义运算符

### 2.3 控制流
- 条件语句：if/else、switch（模式匹配、where 子句、fallthrough）
- 循环语句：for-in、while、repeat-while
- 控制转移：break、continue、return、throw
- 标签语句：label: for...
- guard 语句

### 2.4 函数与闭包
- 函数定义与调用
- 参数标签与参数名：外部标签 _ 省略
- 默认参数值、可变参数（variadic）
- 输入输出参数：inout
- 函数类型与类型别名
- 嵌套函数
- 闭包表达式：{ params in body }
- 尾随闭包（Trailing Closure）
- 逃逸闭包：@escaping
- 自动闭包：@autoclosure
- 闭包捕获列表：[weak self]、[unowned self]
- 高阶函数：map、filter、reduce、flatMap、compactMap、forEach、sorted

### 2.5 枚举
- 基本枚举与原始值（rawValue）
- 关联值（Associated Values）
- 递归枚举：indirect
- 枚举的方法与计算属性
- 枚举的模式匹配

### 2.6 结构体与类
- 结构体（Struct）：值类型、自动初始化器
- 类（Class）：引用类型、析构器 deinit
- 值类型 vs 引用类型：写时复制（Copy-on-Write）
- 属性：存储属性、计算属性、惰性属性（lazy）、属性观察器（willSet/didSet）
- 方法：实例方法、类型方法（static / class）
- 下标：subscript
- 继承：重写（override）、final
- 初始化器：指定初始化器、便利初始化器（convenience）、可失败初始化器（failable init?）
- 必需初始化器：required

### 2.7 协议
- 协议定义：属性要求、方法要求、初始化器要求
- 协议继承与组合：& 组合类型
- 协议作为类型：Existential type、any 关键字
- 可选协议方法：@objc optional
- 协议扩展：提供默认实现
- 面向协议编程（POP）
- 常见协议：Equatable、Hashable、Comparable、CustomStringConvertible、Codable

### 2.8 泛型
- 泛型函数与泛型类型
- 类型约束：where 子句
- 关联类型：associatedtype
- 泛型下标
- some 关键字（不透明返回类型 Opaque Return Type）
- any 关键字（存在类型 Existential Type）

### 2.9 错误处理
- Error 协议
- 抛出与传播：throw、throws、rethrows
- do-catch 语句
- try? / try!
- 结果类型：Result<Success, Failure>

### 2.10 并发  👉 [详解](05-多线程与并发详解.md)
- GCD 封装：DispatchQueue.main.async
- async/await：异步函数、异步序列
- Task：创建异步任务、TaskGroup
- Actor：数据隔离、Sendable 协议
- AsyncStream / AsyncThrowingStream
- MainActor
- @MainActor 标注
- structured concurrency vs unstructured concurrency
- Task cancellation：Task.isCancelled、Task.checkCancellation、withTaskCancellationHandler

### 2.11 类型系统
- 类型转换：as、as?、as!
- 类型检查：is
- Any 与 AnyObject
- 元类型：Self.Type、Self.Protocol
- 不透明类型：some
- 存在类型：any

### 2.12 内存管理 👉 [详解](03-内存管理详解.md)
- ARC：强引用、弱引用（weak）、无主引用（unowned）
- 闭包循环引用：捕获列表 [weak self]
- 逃逸闭包与循环引用
- AutoreleasePool

### 2.13 扩展
- 扩展方法、计算属性、下标、初始化器、嵌套类型
- 协议遵从性扩展
- 条件遵从：where 子句

### 2.14 访问控制
- open、public、internal、fileprivate、private
- 访问级别与继承
- 访问级别与扩展

### 2.15 Swift 新特性
- Property Wrappers（@propertyWrapper）
- Result Builder（@resultBuilder）
- async/await（Swift 5.5+）
- Sendable / @Sendable（Swift 5.5+）
- if/switch 表达式（Swift 5.9+）
- 宏（Macros）（Swift 5.9+）
- Noncopyable 类型（~Copyable）（Swift 5.9+）
- Typed throws（Swift 6.0+）
- consume 操作符与所有权

### 2.16 Swift 与 Objective-C 互操作 👉 [详解](15-Swift与Objective-C互操作详解.md)
- 桥接头文件（Bridging Header）
- @objc / @objcMembers
- NSObject 子类化
- Swift 类型与 ObjC 类型的映射
- Selector：#selector
- 动态派发：dynamic 关键字
- NS_SWIFT_NAME / NS_SWIFT_NOTHROW 等宏

---

## 三、Foundation 框架

### 3.1 根类与基础
- NSObject：类与协议
- NSProxy
- NSStringFromClass / NSClassFromString

### 3.2 字符串
- NSString / NSMutableString
- Swift String 与 NSString 桥接
- 字符串编码：UTF-8、UTF-16、Unicode
- 格式化：String(format:)、NSNumberFormatter、DateFormatter
- 正则表达式：NSRegularExpression
- 字符串搜索与替换

### 3.3 集合类型
- NSArray / NSMutableArray
- NSDictionary / NSMutableDictionary
- NSSet / NSMutableSet
- NSCountedSet / NSOrderedSet
- NSHashTable（弱引用集合）
- NSMapTable（弱引用键值映射）
- NSIndexSet
- 集合的浅拷贝与深拷贝
- NSFastEnumeration

### 3.4 日期与时间
- Date / NSDate
- DateFormatter / ISO8601DateFormatter
- Calendar / NSCalendar
- DateComponents
- DateInterval / DateIntervalFormatter
- TimeZone
- Locale
- Timer / NSTimer
- ProcessInfo / NSProcessInfo

### 3.5 数据与文件
- Data / NSData / NSMutableData
- FileManager / NSFileManager
- Bundle / NSBundle
- URL / NSURL
- FileHandle
- NSCoder / NSKeyedArchiver / NSKeyedUnarchiver
- Plist 读写：PropertyListSerialization
- JSON 序列化：JSONSerialization / JSONEncoder / JSONDecoder
- 沙盒目录：Documents、Library、tmp、Bundle

### 3.6 网络基础
- URL / URLRequest / URLResponse
- URLSession：dataTask、uploadTask、downloadTask
- URLSessionConfiguration：default、ephemeral、background
- URLSessionDelegate
- URLCache / URLResponse
- HTTP 方法与状态码
- SSL/TLS 与证书验证
- Reachability / NWPathMonitor

### 3.7 序列化与反序列化
- Codable / Encodable / Decodable
- CodingKeys 自定义
- JSONEncoder / JSONDecoder 策略
- PropertyListEncoder / PropertyListDecoder
- NSCoding 协议

### 3.8 通知与 KVO
- NotificationCenter： addObserver、post、removeObserver
- KVO：addObserver、observeValue、removeObserver
- NSKeyValueObservingOptions：.new、.old、.initial、.prior
- Swift 4+ KVO：observe(_:options:changeHandler)

### 3.9 线程与并发  👉 [详解](05-多线程与并发详解.md)
- Thread / NSThread
- RunLoop / NSRunLoop
- GCD：DispatchQueue、DispatchGroup、DispatchSemaphore、DispatchWorkItem、DispatchSource
- OperationQueue / NSOperationQueue
- BlockOperation / NSBlockOperation
- NSLock / NSRecursiveLock / NSCondition / NSConditionLock  👉 [锁详解](06-锁的底层原理详解.md)
- @synchronized  👉 [锁详解](06-锁的底层原理详解.md)
- DispatchOnce（Swift：static let 懒加载）

### 3.10 RunLoop  👉 [详解](09-RunLoop详解.md)
- RunLoop 模式：default、tracking、commonModes
- RunLoop 与线程的关系
- RunLoop 的内部逻辑：Timer、Source0、Source1、Observers
- RunLoop 应用：Timer 精度、滑动优化、常驻线程

### 3.11 其他 Foundation 类
- NSValue / NSNumber
- NSNull
- NSRange / CFRange
- NSLocale
- NSAttributedString / NSMutableAttributedString
- NSMeasurement / Unit
- Progress / NSProgress
- ProcessInfo / NSProcessInfo
- UserDefaults / NSUserDefaults
- NSCache
- Operation 依赖与优先级

---

## 四、UIKit

### 4.1 应用生命周期  👉 [启动优化详解](08-性能优化详解.md)
- UIApplication / UIApplicationDelegate
- UIScene / UISceneDelegate（iOS 13+）
- App 启动流程
- 状态恢复：State Restoration

### 4.2 视图与控件
- UIView：frame、bounds、center、transform、alpha、clipsToBounds
- CALayer：anchorPoint、cornerRadius、shadow、mask、contents
- UIView 生命周期：init、layoutSubviews、drawRect、didMoveToSuperview/Window
- UILabel
- UIButton：configuration（iOS 15+）、UIButton.Configuration
- UITextField / UITextView
- UIImageView：图片渲染、contentMode
- UIScrollView：contentSize、contentOffset、bounces、pagingEnabled  👉 [详解](14-ScrollView-TableView-CollectionView详解.md)
- UITableView / UITableViewCell  👉 [详解](14-ScrollView-TableView-CollectionView详解.md)
  - 数据源与代理
  - 注册与复用
  - 滑动删除、编辑模式
  - Self-Sizing Cell
  - UITableViewDiffableDataSource（iOS 13+）
- UICollectionView / UICollectionViewCell  👉 [详解](14-ScrollView-TableView-CollectionView详解.md)
  - UICollectionViewLayout / UICollectionViewFlowLayout
  - Compositional Layout（iOS 13+）
  - Supplementary Views / Decoration Views
  - UICollectionViewDiffableDataSource（iOS 13+）
  - Cell Registration（iOS 14+）
  - List Configuration（iOS 14+）
- UISegmentedControl
- UISlider / UISwitch / UIStepper
- UIProgressView / UIActivityIndicatorView
- UIPickerView / UIDatePicker
- UIPageControl
- UIStackView
- UIWebView（已废弃）/ WKWebView
- UISearchBar
- UIToolbar / UITabBar
- UIVisualEffectView

### 4.3 视图控制器  👉 [导航与模态详解](10-导航与模态详解.md)
- UIViewController 生命周期：init → viewDidLoad → viewWillAppear → viewDidAppear → viewWillDisappear → viewDidDisappear → dealloc
- UINavigationController：push/pop、导航栏自定义
- UITabBarController：标签栏配置
- UISplitViewController（iPad 适配）
- UIPageViewController
- UIViewControllerTransitioningDelegate
- 自定义转场动画：UIViewControllerAnimatedTransitioning
- 交互式转场：UIPercentDrivenInteractiveTransition
- Child ViewController：addChild / removeFromParent

### 4.4 事件处理  👉 [详解](07-事件响应链与渲染详解.md)
- UIResponder 链：hitTest、point(inside:)
- UIGestureRecognizer：Tap、Pinch、Rotation、Swipe、Pan、LongPress
- 自定义手势识别器
- touchesBegan / touchesMoved / touchesEnded / touchesCancelled
- UIEvent / UITouch
- 手势冲突处理：require(toFail:)

### 4.5 布局系统
- Auto Layout
  - NSLayoutConstraint
  - NSLayoutAnchor（iOS 9+）
  - UIStackView
  - 内容优先级：Content Hugging / Compression Resistance
- Frame-based 布局：layoutSubviews
- Size Classes：Regular / Compact
- Safe Area / Layout Margins
- 自适应布局：traitCollectionDidChange

### 4.6 导航与模态  👉 [详解](10-导航与模态详解.md)
- UINavigationBar / UINavigationItem
- UIBarButtonItem
- UITabBar / UITabBarItem
- Modal Presentation：fullScreen、pageSheet、overFullScreen、popover
- UIViewControllerTransitioningDelegate

### 4.7 图片与颜色
- UIImage：加载方式（named / contentsOfFile / system）
- Asset Catalog：@1x/@2x/@3x、Symbol Images（SF Symbols）
- UIColor / Dynamic Colors（iOS 13+）
- 渐变：CAGradientLayer
- UIImageRenderingMode
- 图片压缩与缩放

### 4.8 动画  👉 [详解](07-事件响应链与渲染详解.md)
- UIView.animate(withDuration:)
- UIViewPropertyAnimator（iOS 10+）
- Spring 动画
- Keyframe 动画
- Transition 动画
- CAAnimation / CABasicAnimation / CAKeyframeAnimation / CATransition / CAAnimationGroup
- 隐式动画
- CASpringAnimation

### 4.9 滚动视图优化  👉 [详解](14-ScrollView-TableView-CollectionView详解.md)
- Cell 复用机制
- 异步绘制
- 离屏渲染与避免
- 光栅化（shouldRasterize）
- 预排版与缓存高度
- 按需加载

### 4.10 多窗口与尺寸适配
- UIWindowScene（iOS 13+）
- 尺寸类与自适应
- iPad 分屏：Split View、Slide Over
- UISplitViewController
- 窗口多重显示

---

## 五、SwiftUI

### 5.1 基础视图
- Text、Image、Shape
- Button、Toggle、Slider、Stepper、Picker
- TextField、SecureField
- Link

### 5.2 布局
- VStack / HStack / ZStack
- LazyVStack / LazyHStack
- ScrollView / List
- Grid / LazyVGrid / LazyHGrid
- Form
- Group / GroupBox
- spacer / divider / padding / frame / offset

### 5.3 导航  👉 [详解](10-导航与模态详解.md)
- NavigationStack / NavigationView
- NavigationLink
- TabView
- Sheet / FullScreenCover
- Alert / ConfirmationDialog
- Popover

### 5.4 状态管理
- @State
- @Binding
- @StateObject / @ObservedObject
- @EnvironmentObject
- @Environment
- @Published
- ObservableObject / Observable（Swift 5.9+）
- @Observable 宏

### 5.5 动画
- withAnimation
- .animation() modifier
- Spring 动画
- Transition：slide、opacity、scale、move
- matchedGeometryEffect
- PhaseAnimator / TimelineView

### 5.6 高级特性
- 自定义 ShapeStyle
- ViewBuilder
- PreferenceKey
- Toolbar / .toolbar
- .sheet / .fullScreenCover
- @ViewBuilder
- AnyView 与类型擦除
- SwiftUI 生命周期：App 协议、Scene

---

## 六、Core Animation  👉 [详解文档](07-事件响应链与渲染详解.md)

### 6.1 图层基础  👉 [详解](07-事件响应链与渲染详解.md)
- CALayer 与 UIView 的关系
- CALayer 子类：CAShapeLayer、CATextLayer、CAGradientLayer、CAReplicatorLayer、CAEmitterLayer、AVPlayerLayer
- 图层树：model layer tree / presentation layer tree / render tree

### 6.2 动画  👉 [详解](07-事件响应链与渲染详解.md)
- 显式动画：CABasicAnimation、CAKeyframeAnimation、CATransition、CAAnimationGroup、CASpringAnimation
- 隐式动画
- 动画代理：CAAnimationDelegate
- 动画 timing：CAMediaTiming / CAMediaTimingFunction
- 动画暂停与恢复

### 6.3 绘图
- drawRect / draw(_:)
- UIBezierPath / CGPath
- Core Graphics（Quartz 2D）
- CAShapeLayer 绘制

### 6.4 性能  👉 [详解](07-事件响应链与渲染详解.md)
- 离屏渲染
- 光栅化
- 应该使用 CPU 还是 GPU
- Instruments：Core Animation 工具

---

## 七、Core Data & 数据持久化

### 7.1 Core Data
- NSManagedObjectModel
- NSPersistentStoreCoordinator
- NSManagedObjectContext
- NSManagedObject / NSManagedObject 子类
- NSFetchedResultsController
- NSMigrationManager：轻量迁移与自定义迁移
- Core Data with CloudKit

### 7.2 SwiftData（iOS 17+）
- @Model 宏
- ModelContainer / ModelContext
- @Query
- Relationship：@Relationship
- Migration

### 7.3 其他持久化方案
- UserDefaults
- Keychain / KeychainAccess
- SQLite / FMDB / GRDB
- Realm
- 文件存储：Plist、JSON、Archive
- Sandbox 文件管理

---

## 八、网络

### 8.1 URLSession
- dataTask / uploadTask / downloadTask
- URLSessionConfiguration
- 后台下载
- URLCredential / URLAuthenticationChallenge
- Cookie 管理：HTTPCookieStorage

### 8.2 第三方网络库
- Alamofire：请求/响应/上传/下载/Interceptor
- Moya：网络抽象层

### 8.3 数据解析
- JSONSerialization
- Codable / JSONEncoder / JSONDecoder
- XMLParser
- Protobuf

### 8.4 网络优化
- DNS 预解析
- HTTP/2 与 HTTP/3
- 请求合并与缓存
- 网络状态监听
- 请求重试策略
- 弱网优化

---

## 九、多线程与并发  👉 [详解文档](05-多线程与并发详解.md)

### 9.1 GCD  👉 [详解](05-多线程与并发详解.md)
- 串行队列 / 并发队列 / 主队列
- 同步派发 / 异步派发
- DispatchGroup
- DispatchSemaphore
- DispatchWorkItem（取消）
- DispatchSource（定时器、监控）
- barrier 栅栏
- Dispatch_once 替代方案

### 9.2 Operation / OperationQueue  👉 [详解](05-多线程与并发详解.md)
- BlockOperation
- 自定义 Operation：重写 main / start
- 依赖管理：addDependency
- 优先级与取消
- 最大并发数

### 9.3 Thread  👉 [详解](05-多线程与并发详解.md)
- Thread 创建与使用
- Thread.sleep
- Thread.current / Thread.isMainThread

### 9.4 锁  👉 [详解](06-锁的底层原理详解.md)
- NSLock / NSRecursiveLock
- NSCondition / NSConditionLock
- dispatch_semaphore_t
- os_unfair_lock
- POSIX pthread_mutex
- @synchronized
- OSSpinLock（已废弃）

### 9.5 线程安全  👉 [详解](05-多线程与并发详解.md)
- 数据竞争
- 读写锁
- Actor 模型（Swift）
- Sendable 协议

---

## 十、设计模式与架构

### 10.1 设计模式  👉 [MVC/MVP/MVVM 详解](12-MVC-MVP-MVVM架构详解.md)
- MVC
- MVP
- MVVM
- VIPER
- Clean Architecture
- Coordinator Pattern
- Repository Pattern
- Factory Pattern
- Singleton Pattern
- Observer Pattern
- Strategy Pattern
- Decorator Pattern
- Adapter Pattern

### 10.2 响应式编程
- RxSwift / RxCocoa
- ReactiveCocoa
- Combine
  - Publisher / Subscriber
  - Subject：PassthroughSubject、CurrentValueSubject
  - Operators：map、filter、flatMap、merge、zip、combineLatest
  - AnyPublisher / AnyCancellable
  - @Published
  - Scheduler

### 10.3 依赖注入
- Swinject
- 手动 DI
- Property Injection / Constructor Injection

---

## 十一、性能优化  👉 [详解文档](08-性能优化详解.md)

### 11.1 启动优化  👉 [详解](08-性能优化详解.md)
- 冷启动 / 热启动
- pre-main 阶段优化：减少动态库、合并 Category、+load 优化
- post-main 阶段优化：延迟初始化、异步加载
- 启动度量与 Instruments

### 11.2 内存优化  👉 [详解](08-性能优化详解.md)
- 内存泄漏检测：Instruments Leaks / Allocations
- 循环引用排查
- AutoreleasePool 嵌套
- 大图加载与降采样
- 缓存策略：NSCache / SDWebImage 缓存
- 内存警告处理

### 11.3 渲染优化  👉 [详解](07-事件响应链与渲染详解.md)
- 离屏渲染检测
- 光栅化使用场景
- 异步绘制：YYAsyncLayer
- 卡顿监控：RunLoop 监听、CADisplayLink
- 60fps / 120fps

### 11.4 包体积优化  👉 [详解](08-性能优化详解.md)
- 图片压缩：WebP / HEIC
- 无用资源检测
- 代码瘦身：LinkMap 分析
- 动态库 vs 静态库
- App Thinning：Bitcode / Slicing / On-Demand Resources

### 11.5 电量优化  👉 [详解](08-性能优化详解.md)
- 定位策略
- 后台任务优化
- 网络请求策略
- Timer 精度与能耗

---

## 十二、调试与测试

### 12.1 调试工具  👉 [Instruments 详解](08-性能优化详解.md)
- LLDB：breakpoint、expression、frame variable、watchpoint
- Instruments：Time Profiler、Leaks、Allocations、Core Animation、Network
- Charles / Proxyman 抓包
- os_signpost / os_log
- MetricKit

### 12.2 单元测试
- XCTest
- XCTestCase
- XCUITest（UI 测试）
- Mock / Stub
- Quick / Nimble
- 测试覆盖率

### 12.3 性能测试
- measure block
- XCTestPerformanceMetric

---

## 十三、安全

### 13.1 数据安全
- Keychain 存储敏感数据
- 数据加密：AES、RSA、ECC
- SSL Pinning：证书绑定 / 公钥绑定
- ATS（App Transport Security）
- Code Signing / Provisioning

### 13.2 安全防护
- 越狱检测
- 逆向防护：class-dump、IDA Pro、Hopper
- 混淆：代码混淆、字符串加密
- 完整性校验
- 安全输入：UIWebView/JavascriptCore 注入防护

---

## 十四、图形与多媒体

### 14.1 Core Graphics（Quartz 2D）
- CGContext
- 路径绘制：CGPath / UIBezierPath
- 变换：CGAffineTransform
- 颜色空间：CGColorSpace / CGColor
- 图片绘制：CGImage / CGBitmapContext
- PDF 绘制

### 14.2 Core Image
- CIFilter
- CIContext
- CIImage
- 人脸检测：CIDetector
- 自定义滤镜：CIKernel

### 14.3 Metal
- MTLDevice / MTLCommandQueue
- MTLRenderPipelineState
- Shader：Metal Shading Language
- Compute Shader
- Metal Performance Shaders

### 14.4 音视频
- AVFoundation
  - AVPlayer / AVPlayerItem / AVPlayerLayer
  - AVAsset / AVAssetTrack
  - AVCaptureSession（相机采集）
  - AVAudioSession
  - AVAssetExportSession
  - AVComposition / AVMutableComposition
- AudioToolbox
- AudioUnit / AUAudioUnit
- VideoToolbox：硬件编解码
- Core Media：CMSampleBuffer / CMTime
- 实时音视频：WebRTC

---

## 十五、定位与地图

### 15.1 Core Location
- CLLocationManager
- 定位权限：whenInUse / always
- 区域监控：CLRegion / CLCircularRegion
- iBeacon：CLBeaconRegion
- 显著位置变化
- 位置缓存与精度

### 15.2 MapKit
- MKMapView
- MKAnnotation / MKAnnotationView
- MKDirections / MKRoute
- MKLocalSearch
- 自定义地图标注
- 地图快照：MKMapSnapshotter

---

## 十六、推送与通知

### 16.1 本地通知
- UNUserNotificationCenter
- UNNotificationRequest / UNNotificationContent
- UNTimeIntervalNotificationTrigger / UNCalendarNotificationTrigger
- UNLocationNotificationTrigger

### 16.2 远程推送
- APNs 工作流程
- Device Token 注册
- Payload 格式
- 静默推送（content-available）
- 富推送：Notification Service Extension / Notification Content Extension

### 16.3 通知分组与管理
- 通知组（threadIdentifier）
- 已读管理
- 通知角标

---

## 十七、组件化与模块化

### 17.1 组件化方案
- URL 路由：MGJRouter
- Target-Action：CTMediator
- Protocol-Class 注册
- 路由设计原则

### 17.2 CocoaPods  👉 [详解](11-CocoaPods详解.md)
- Podfile / Podspec
- 私有 Spec Repo
- Subspecs
- 资源管理：resource_bundles
- Pod 库的本地开发

### 17.3 SPM（Swift Package Manager）
- Package.swift
- Target / Product / Dependency
- 资源管理
- Binary Target

### 17.4 Carthage
- Cartfile
- 构建与集成方式

---

## 十八、CI/CD 与发布

### 18.1 持续集成
- Fastlane
- Jenkins / GitLab CI
- Xcode Cloud
- xcodebuild / xcrun

### 18.2 证书与配置
- Apple Developer 账号
- 证书：Development / Distribution
- Provisioning Profile
- App ID 注册

### 18.3 发布流程
- Archive / Export
- TestFlight
- App Store Connect
- 审核注意事项
- 分阶段发布

---

## 十九、App Extension

- Today Extension（Widget）
- Share Extension
- Action Extension
- Photo Editing Extension
- Document Provider Extension
- Custom Keyboard Extension
- App Clips
- WidgetKit（iOS 14+）
- Live Activity / ActivityKit（iOS 16+）

---

## 二十、系统框架

### 20.1 UserNotifications
- 授权请求
- 通知内容与触发器
- 通知类别与操作

### 20.2 Photos / PhotosUI
- PHPhotoLibrary
- PHAsset / PHFetchResult
- PHImageManager
- PHPickerViewController（iOS 14+）

### 20.3 Vision
- 文字识别：VNRecognizeTextRequest
- 人脸检测：VNDetectFaceRectanglesRequest
- 条码检测：VNDetectBarcodesRequest
- 物体追踪

### 20.4 Core ML
- 模型集成：mlmodel 文件
- MLModel / MLPrediction
- Core ML Tools
- Create ML

### 20.5 Natural Language
- NLLanguageRecognizer
- NLTagger：词性标注、命名实体识别
- NLTokenizer

### 20.6 Speech
- SFSpeechRecognizer
- SFSpeechAudioBufferRecognitionRequest
- 实时语音识别

### 20.7 ARKit
- ARSession / ARConfiguration
- ARSCNView / ARSKView
- ARAnchor / ARFaceAnchor
- 场景理解：平面检测、光照估计
- ARKit 与 LiDAR

### 20.8 SceneKit / SpriteKit
- SCNScene / SCNNode
- SKScene / SKNode / SKAction
- 3D / 2D 游戏开发基础

### 20.9 EventKit
- EKEventStore
- EKEvent / EKReminder
- 日历权限

### 20.10 Contacts
- CNContactStore
- CNContact / CNMutableContact
- 通讯录权限

### 20.11 StoreKit
- SKProduct / SKPayment
- StoreKit 2（iOS 15+）：Product、Transaction、SubscriptionStore
- 内购验证：App Store Server API
- 订阅管理

### 20.12 WeatherKit
- WeatherService
- 气象数据获取

---

## 二十一、Accessibility（无障碍）

- VoiceOver：isAccessibilityElement、accessibilityLabel、accessibilityHint、accessibilityValue
- Dynamic Type
- 辅助功能 Trait：accessibilityTraits
- 辅助功能导航：accessibilityElements
- 颜色对比度
- 减少动画偏好：UIAccessibility.isReduceMotionEnabled

---

## 二十二、国际化与本地化

- NSLocalizedString / String(localized:)
- .strings / .stringsdict 文件
- .xcstrings（String Catalog，iOS 17+）
- Locale / NumberFormatter / DateFormatter
- 布局方向适配（RTL）
- 复数规则与性别语法

---

## 二十三、HIG 与设计规范

- Human Interface Guidelines
- 导航模式
- 手势交互规范
- 暗色模式适配
- 动态字体
- 安全区域
- 控件尺寸与间距

---

## 二十四、汇编与底层

### 24.1 Mach-O  👉 [详解](13-编译与构建详解.md)
- Mach-O 文件结构：Header / Load Commands / Segments / Sections
- dyld 加载流程
- Lazy Symbol Binding / Non-Lazy Symbol Binding
- fishhook 原理

### 24.2 汇编基础
- ARM64 指令集基础
- 函数调用约定
- 栈帧结构
- 寄存器：x0-x28、sp、lr、fp

### 24.3 进程与线程
- Mach Task / Thread
- POSIX 线程
- 线程栈大小
- 线程优先级

---

## 二十五、Hybrid 与跨平台

### 25.1 WebView 混合开发
- WKWebView
- WKScriptMessageHandler
- JavaScript Core
- JSBridge 设计
- Cookie 共享

### 25.2 跨平台方案
- Flutter：Channel 通信、Platform View
- React Native：Bridge / JSI / TurboModule / Fabric
- Kotlin Multiplatform
- C++ 共享逻辑层

---

## 二十六、常用第三方库

### 26.1 网络
- Alamofire
- Moya
- Kingfisher（图片加载）
- SDWebImage

### 26.2 响应式
- RxSwift / RxCocoa
- ReactiveCocoa
- Combine（系统框架）

### 26.3 数据库
- FMDB
- GRDB
- Realm
- WCDB

### 26.4 JSON 解析
- SwiftyJSON
- Codable（系统原生）
- ObjectMapper

### 26.5 UI
- SnapKit（Auto Layout）
- Masonry
- IQKeyboardManager
- MBProgressHUD / SVProgressHUD
- MJRefresh
- DZNEmptyDataSet
- SkeletonView

### 26.6 工具
- SwifterSwift
- R.swift
- Sourcery
- SwiftGen
- CocoaLumberjack
- XCGLogger

### 26.7 路由
- MGJRouter
- CTMediator
- Router-pattern

---

## 二十七、Xcode 与开发工具  👉 [详解](13-编译与构建详解.md)

### 27.1 Xcode
- Workspace / Project / Target / Scheme
- Build Settings / Build Phases
- xcconfig 配置
- Breakpoint：普通/条件/异常/Symbolic
- View Debugger
- Memory Graph Debugger
- Instruments

### 27.2 开发者工具
- Instruments：Time Profiler、Leaks、Allocations、Network、Core Animation、System Trace
- xcodebuild 命令行
- xcrun
- swift-demangle
- atos / dsymutil
- Metal System Trace

---

## 二十八、Swift Concurrency 深入  👉 [详解](05-多线程与并发详解.md)

### 28.1 Structured Concurrency
- Task 层级与取消传播
- TaskGroup / ThrowingTaskGroup
- withTaskGroup / withThrowingTaskGroup
- AsyncLet

### 28.2 Actor
- Actor 隔离
- Actor reentrancy
- GlobalActor
- @MainActor

### 28.3 Sendable
- Sendable 协议
- @Sendable 闭包
- NonSendable 类型在并发域中的传递

### 28.4 Custom Executor
- SerialExecutor
- UnownedSerialExecutor

---

## 二十九、Apple 新框架与 API

### 29.1 App Intents / SiriKit
- AppIntent 协议
- AppShortcutsProvider
- Siri 对话式交互

### 29.2 WidgetKit
- TimelineProvider
- Widget Configuration
- Live Activity / ActivityKit

### 29.3 Observation Framework（iOS 17+）
- @Observable 宏
- withObservationTracking
- 与 SwiftUI 集成

### 29.4 SwiftData（iOS 17+）
- @Model / @Attribute / @Relationship
- ModelContainer / ModelContext
- #Predicate / #SortDescriptor

### 29.5 TipKit（iOS 17+）
- Tip 协议
- Tips.configure()

### 29.6 StoreKit 2（iOS 15+）
- Product / Transaction / SubscriptionStore
- App Store Server API / Server Notifications V2

### 29.7 MapKit 新特性
- MapContentBuilder
- SwiftUI Map
- Custom Map Markers

---

## 三十、编译与构建  👉 [详解](13-编译与构建详解.md)

### 30.1 编译流程
- 预处理 → 编译 → 汇编 → 链接
- Swift 编译：SIL（Swift Intermediate Language）
- Module / WMO（Whole Module Optimization）

### 30.2 链接
- 静态库 / 动态库
- 符号表
- Strip
- Bitcode

### 30.3 构建优化
- 增量编译
- 编译时间优化
- 模块化与编译隔离
- ccache

---

## 三十一、计算机网络基础  👉 [详解](16-计算机网络基础详解.md)

### 31.1 网络分层模型
- OSI 七层 vs TCP/IP 四层
- 数据封装与解封装

### 31.2 TCP 协议
- 三次握手与四次挥手
- 可靠传输：序列号、超时重传、快速重传
- 流量控制：滑动窗口
- 拥塞控制：慢开始、拥塞避免、快重传、快恢复

### 31.3 UDP 协议
- TCP vs UDP 对比
- 适用场景：实时音视频、DNS、QUIC

### 31.4 HTTP 协议
- HTTP/1.0 / 1.1 / 2 / 3 演进
- 请求/响应格式、HTTP 方法、状态码
- 缓存机制：强缓存（Cache-Control）、协商缓存（ETag / Last-Modified）

### 31.5 HTTPS 与 TLS
- TLS 握手过程（1.2 vs 1.3）
- 证书与 CA 信任链
- SSL Pinning：证书绑定 vs 公钥绑定

### 31.6 DNS 与安全
- DNS 解析流程、记录类型
- DNS 劫持与 HTTPDNS
- CORS、WebSocket、网络安全基础

---

## 三十二、算法与数据结构  👉 [详解](17-算法与数据结构详解.md)

### 32.1 复杂度分析
- 时间复杂度：O(1) / O(log n) / O(n) / O(n log n) / O(n²)
- 空间复杂度

### 32.2 数组与字符串
- 双指针（对撞指针、快慢指针）
- 滑动窗口
- 二分查找（标准、左/右边界、旋转数组）

### 32.3 链表
- 反转链表、链表中点、环检测（Floyd 判圈）
- 合并有序链表、删除倒数第 N 个节点

### 32.4 栈与队列
- 单调栈（下一个更大元素、最大矩形面积）
- 单调队列（滑动窗口最大值）

### 32.5 树
- 二叉树三种遍历（递归 + 迭代）、层序遍历
- BST 验证、第 K 小元素
- 路径总和、最大路径和、最近公共祖先（LCA）

### 32.6 排序算法
- 快速排序、归并排序、堆排序
- 快速选择（Top K）

### 32.7 哈希表
- 两数之和、字母异位词分组、最长连续序列

### 32.8 堆（优先队列）
- Top K 问题、数据流中的第 K 大元素

### 32.9 图
- BFS / DFS、岛屿数量
- 拓扑排序（课程表）、Dijkstra 最短路径

### 32.10 动态规划
- 最大子数组和（Kadane）、爬楼梯
- 最长递增子序列（LIS）、0/1 背包
- 最长公共子序列（LCS）、编辑距离
- 零钱兑换、打家劫舍

### 32.11 回溯算法
- 全排列、子集、组合总和、N 皇后

---

## 三十三、操作系统基础  👉 [详解](18-操作系统基础详解.md)

### 33.1 进程与线程
- 进程 vs 线程的区别（资源、切换开销、通信）
- 进程状态机：新建 → 就绪 → 运行 → 阻塞
- CPU 调度算法：FCFS、SJF、优先级、轮转、多级反馈队列
- iOS QoS 优先级体系

### 33.2 内存管理
- 虚拟内存与地址空间布局（Text / Data / Heap / Stack）
- 分页与缺页中断（Page Fault）
- TLB 缓存
- iOS 启动优化：二进制重排减少 Page Fault
- Dirty Memory vs Clean Memory

### 33.3 进程同步
- 临界区问题、互斥锁、信号量
- 死锁四条件（互斥、持有等待、非抢占、循环等待）
- 死锁预防与避免
- 原子操作（CAS、LDXR/STXR）

### 33.4 文件系统
- APFS 特性：写时复制、快照、加密
- iOS 沙盒目录结构
- I/O 模型：阻塞 / 非阻塞 / 多路复用 / 异步

### 33.5 CPU 架构
- ARM64 寄存器（x0-x30、sp、lr、fp）
- 函数调用约定（ABI）、栈帧结构
- CPU 缓存层次、缓存行、伪共享

### 33.6 iOS 系统架构
- XNU 内核：Mach 微内核 + BSD + I/O Kit
- Mach Port、沙盒、代码签名、ASLR、Secure Enclave

---

## 三十四、设计模式扩展  👉 [详解](19-设计模式扩展详解.md)

### 34.1 创建型模式
- 单例（Singleton）：Swift static let，线程安全
- 工厂方法（Factory Method）：延迟实例化决策
- 建造者（Builder）：链式调用构建复杂对象

### 34.2 结构型模式
- 适配器（Adapter）：兼容不同接口
- 装饰器（Decorator）：动态扩展功能
- 代理（Proxy）：缓存代理、NSProxy 弱引用代理
- 外观（Facade）：简化复杂子系统接口

### 34.3 行为型模式
- 观察者（Observer）：NotificationCenter、KVO、Combine
- 策略（Strategy）：运行时切换算法
- 命令（Command）：封装操作，支持撤销/重做
- 责任链（Chain of Responsibility）：事件响应链
- 模板方法（Template Method）：定义算法骨架
- 状态（State）：状态驱动行为切换

### 34.4 iOS 特有模式
- Delegate（委托）：一对一回调
- Target-Action：UIKit 事件处理
- Coordinator：导航逻辑解耦

### 34.5 Combine 深度
- Publisher / Subscriber / Subject / Operator
- PassthroughSubject vs CurrentValueSubject
- 常用操作符：map、filter、debounce、throttle、combineLatest、zip、merge
- 线程调度：subscribe(on:) / receive(on:)
- 与 MVVM 集成、自定义 Publisher

### 34.6 响应式编程
- 命令式 vs 响应式编程思想
- 单向数据流（Redux 模式）
- 依赖注入（构造器注入、属性注入、DI 容器）

---

## 三十五、逆向与安全  👉 [详解](20-逆向与安全详解.md)

### 35.1 iOS 安全架构
- 多层防御体系：App 层 / 系统框架层 / 内核层 / 硬件层
- 主要威胁：越狱注入、中间人攻击、逆向工程、重打包

### 35.2 逆向工程工具
- 静态分析：IDA Pro、Hopper、class-dump、Ghidra、otool
- 动态分析：Frida（动态插桩）、LLDB、Cycript
- 抓包工具：Charles、Proxyman、Mitmproxy

### 35.3 越狱检测
- 检测越狱文件（/Applications/Cydia.app 等）
- 检测沙盒外写权限
- 检测可疑 URL Scheme（cydia://）
- 检测注入的动态库（MobileSubstrate）
- 检测符号链接、fork 调用
- 对抗方式与加固建议

### 35.4 SSL Pinning
- 证书绑定 vs 公钥绑定（推荐）
- URLSession delegate 实现
- 公钥哈希计算（openssl 命令）
- 绕过方式（SSLKillSwitch2、Frida）与防御

### 35.5 代码混淆
- ObjC 符号混淆（类名宏替换、字符串加密）
- Swift 混淆工具（SwiftShield）
- LLVM 混淆（控制流扁平化、虚假控制流）
- 反调试（ptrace、sysctl、时间检测）

### 35.6 数据安全
- Keychain 存储与访问控制级别
- CryptoKit：AES-GCM 加密、HMAC、RSA
- 文件数据保护级别（FileProtectionType）
- 请求签名（防篡改与重放攻击）
- App 完整性检测（Bundle ID、代码签名、二进制哈希）

---

## 三十六、App 启动优化工程实战  👉 [详解](21-App启动优化工程实战.md)

### 36.1 启动流程全景
- 冷启动完整时间线：创建进程 → dyld 加载 → ObjC Runtime → main() → 首帧上屏
- 热启动 / 温启动 / 冷启动区别
- iOS 13+ 预热启动（Pre-warming）对度量的影响

### 36.2 pre-main 优化
- DYLD_PRINT_STATISTICS 度量各阶段耗时
- 减少动态库数量（目标 ≤ 6 个，合并/改静态库）
- 减少 +load 方法（改用 +initialize / dispatch_once）
- 二进制重排：Clang 插桩 → 收集调用顺序 → 生成 Order File → 减少 Page Fault
- Page Fault 监控与量化（task_vm_info.pageins）

### 36.3 post-main 优化
- 精确度量：进程创建时间（sysctl）作为起点，而非 main() 时间
- didFinishLaunching 分级：同步首屏必需 / RunLoop 空闲 / 后台异步 / 延迟执行
- 利用 RunLoop BeforeWaiting 分散启动任务
- 首屏数据缓存策略（STALE-WHILE-REVALIDATE）
- 启动任务调度框架（优先级 + 依赖关系）

### 36.4 监控与工程化
- 线上启动时间监控（P50/P90/P99 分位数）
- 按设备/版本/启动类型分组统计
- 典型优化案例：pre-main 680ms → 385ms，总启动 1580ms → 785ms

---

## 三十七、卡顿监控与渲染优化  👉 [详解](22-卡顿监控与渲染优化.md)

### 37.1 卡顿本质
- VSync 信号与帧渲染预算（60fps=16.67ms，120fps=8.33ms）
- ProMotion 自适应帧率（CAFrameRateRange 配置）
- 掉帧严重程度分级

### 37.2 卡顿监控方案（5 种对比）
- RunLoop Observer 监控（主流，可定位原因）
- CADisplayLink FPS 监控（实时展示）
- Ping/Pong 主线程监控（实现简单）
- Hook objc_msgSend（精确，仅测试用）
- MetricKit Hang 指标（系统级，24h 延迟）

### 37.3 常见卡顿原因与优化
- 布局计算：Auto Layout 复杂度、预计算高度缓存、手动布局
- 图片解码：后台线程预解码、ImageIO 降采样
- 主线程 I/O：异步 + 内存缓存
- 过度绘制：设置不透明背景（isOpaque = true）

### 37.4 离屏渲染深度分析
- 8 种触发场景（按性能影响排序）
- 圆角优化（后台绘制 / 只设 cornerRadius / cornerCurve）
- 阴影优化（必须设置 shadowPath）
- 光栅化的正确使用场景
- Hitch Rate 指标（目标 < 5ms/s）

### 37.5 异步渲染
- YYAsyncLayer 原理与实现
- 后台线程 Core Graphics 绘制 → 主线程设置 layer.contents
- 取消机制（Sentinel 版本号）

---

## 三十八、热修复与动态化  👉 [详解](23-热修复与动态化.md)

### 38.1 热修复方案分类
- JavaScript 热修复（JSPatch，苹果已明确禁止）
- Method Swizzling 方案（自研，需安全验证）
- 资源热修复（合规，只能修复资源问题）
- Feature Flag（最安全，完全合规）
- RN/Flutter 动态化（JS Bundle 热更新）

### 38.2 Method Swizzling 深度
- 标准实现（class_addMethod + method_exchangeImplementations）
- 常见陷阱：父类方法被替换、多次 Swizzle、+initialize 误用
- 实际应用：AOP 埋点、防崩溃（数组越界防护）、防重复点击

### 38.3 热修复工程设计
- 补丁下发流程（服务端签名 → CDN → 客户端验证 → 应用）
- 安全验证（RSA 签名、格式校验、版本兼容性）
- 补丁应用引擎（Method Swizzling 替换 IMP）

### 38.4 Feature Flag 系统
- 多级开关：功能开关 / Kill Switch / AB 实验
- 灰度策略：按比例 / 用户列表 / 城市 / 版本范围
- 本地缓存 + 服务端同步，启动时立即可用

### 38.5 线上灾难恢复
- 崩溃率监控与 P0 告警
- 强制更新机制
- 崩溃自动恢复（检测上次是否崩溃，清理可疑数据）

---

## 三十九、组件化与工程架构  👉 [详解](24-组件化与工程架构.md)

### 39.1 组件化背景
- 大型 App 的工程痛点：编译慢、协作难、复用差
- 组件层次：业务组件 / 业务基础 / 平台服务 / 基础组件
- 依赖规则：上层依赖下层，同层通过路由/协议通信

### 39.2 路由方案深度对比（三种）
- URL Router（MGJRouter）：支持 Deep Link，类型不安全
- Target-Action（CTMediator）：无头文件依赖，字符串硬编码
- Protocol-Class 注册：类型安全，Swift 友好，不支持 Deep Link
- 实际选择：大型项目混合使用，各司其职

### 39.3 组件间通信
- EventBus（松耦合，一对多）
- 共享数据存储（SharedDataStore 协议）
- 路由回调（URL Router callback）

### 39.4 大规模工程实践
- 组件化落地步骤（梳理依赖 → 抽离基础 → 建路由 → 抽离业务 → 二进制化）
- 循环依赖解决方案（下沉公共部分、协议解耦、事件总线）
- 组件版本管理（本地路径 / Git 分支 / 语义化版本）
- 编译速度优化（二进制化 20min → 3-5min）

---

## 四十、线上性能监控体系  👉 [详解](25-线上性能监控体系.md)

### 40.1 监控指标体系
- 稳定性：崩溃率 < 0.01%、OOM 率 < 0.05%、ANR 率 < 0.1%
- 性能：启动 P90 < 2s、FPS P90 > 55、卡顿率 < 5ms/s
- 资源：内存 < 设备内存 40%、空闲 CPU < 5%
- 网络：请求成功率 > 99%、P90 延迟 < 1s

### 40.2 崩溃监控
- 三种类型：ObjC 异常 / Signal 信号 / Swift 运行时错误
- 完整信息收集：调用栈 + 设备信息 + 面包屑（用户操作路径）
- 崩溃率计算：UV 崩溃率（崩溃用户数 / 活跃用户数）
- 告警策略：P0（> 0.1%）/ P1（> 0.05%）/ P2（长尾问题）

### 40.3 OOM 监控
- OOM 识别（排除法）：异常退出且排除用户退出/已知崩溃/Watchdog
- 内存水位监控（task_vm_info.phys_footprint）
- 分级处理：Warning 释放缓存，Critical 激进释放 + 上报 OOM 风险

### 40.4 网络监控
- URLProtocol 拦截（AOP，业务无感知）
- URLSessionTaskMetrics（DNS/TCP/TLS/TTFB 精确计时）
- HTTPDNS 完整实现（查询 + 缓存 + IP 直连 + SNI 处理）

### 40.5 上报策略
- 采样上报（崩溃 100%，卡顿 10%，内存 5%）
- 批量上报（30s 聚合一次，减少请求数）
- 本地持久化（弱网时不丢数据）
- 后台 URLSession（App 后台时继续上报）

---

> 持续更新中...
