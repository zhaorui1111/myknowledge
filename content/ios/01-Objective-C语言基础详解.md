# Objective-C 语言基础详解

---

## 一、数据类型

### 1.1 基本数据类型（C 语言继承）

| 类型 | 字节（64位） | 范围 | 说明 |
|------|------------|------|------|
| `char` | 1 | -128 ~ 127 | 字符型 |
| `short` | 2 | -32768 ~ 32767 | 短整型 |
| `int` | 4 | -2^31 ~ 2^31-1 | 整型 |
| `long` | 8 | -2^63 ~ 2^63-1 | 长整型 |
| `float` | 4 | ±3.4E38 | 单精度浮点 |
| `double` | 8 | ±1.7E308 | 双精度浮点 |
| `BOOL` | 1 | YES/NO | ObjC 布尔（本质 `signed char`） |
| `NSInteger` | 8 | 同 long | 平台自适应整型 |
| `NSUInteger` | 8 | 0 ~ 2^64-1 | 平台自适应无符号整型 |
| `CGFloat` | 8 | 同 double | 平台自适应浮点 |

```objc
// BOOL 的陷阱：非零即 YES
BOOL a = 42;        // YES（非零）
BOOL b = -1;        // YES（非零）
BOOL c = 0;         // NO

// ObjC 布尔 vs C99 布尔
// _Bool / bool：只有 0 和 1
// BOOL：0 和 非0（-1 也是 YES）
```

### 1.2 对象类型

```objc
// 不可变
NSString *name = @"Hello";
NSNumber *num = @42;
NSArray *arr = @[@1, @2, @3];
NSDictionary *dict = @{@"key": @"value"};
NSSet *set = [NSSet setWithArray:arr];

// 可变
NSMutableString *mutableName = [NSMutableString stringWithString:@"Hello"];
NSMutableArray *mutableArr = [NSMutableArray array];
NSMutableDictionary *mutableDict = [NSMutableDictionary dictionary];
NSMutableSet *mutableSet = [NSMutableSet set];
```

### 1.3 id 类型

```objc
// id 是指向任意 ObjC 对象的指针，等价于 NSObject * 但不要求继承 NSObject
id obj = [[NSString alloc] initWithString:@"hello"];
obj = [[NSArray alloc] init];  // 可以指向任意对象类型

// id<Protocol> 限制遵循某协议
id<UITableViewDelegate> delegate = self.delegate;

// instancetype — 返回当前类的实例（编译器类型检查）
@interface Person : NSObject
- (instancetype)init;           // ✅ 推荐
+ (instancetype)person;         // ✅ 推荐
- (id)init;                     // ⚠️ 旧写法，无类型检查
@end
```

### 1.4 nil / Nil / NULL / NSNull

| 值 | 类型 | 含义 |
|----|------|------|
| `nil` | id | ObjC 对象指针为空 |
| `Nil` | Class | ObjC 类指针为空 |
| `NULL` | void * | C 指针为空 |
| `NSNull` | NSNull * | 集合中表示"空值"的单例对象 |

```objc
NSString *str = nil;          // 对象为空
Class cls = Nil;              // 类为空
int *ptr = NULL;              // C 指针为空
[dict setObject:[NSNull null] forKey:@"emptyKey"];  // 集合中放空值
```

> **ObjC 消息发送给 nil 安全**：向 nil 发消息返回 0/nil/0.0/struct零值，不会崩溃。但 `nil` 调用返回 `NSNotFound` 的方法时需注意。

---

## 二、变量与常量

### 2.1 变量修饰符

```objc
// extern — 声明外部全局变量（定义在别处）
extern NSInteger globalCount;

// static — 静态变量
// 1. 修饰全局变量：限制作用域为当前文件（内部链接）
static NSInteger fileScopeVar = 0;

// 2. 修饰局部变量：延长生命周期到程序结束，只初始化一次
- (void)method {
    static NSInteger callCount = 0;
    callCount++;
}

// const — 常量
// 修饰指针时看 * 位置
const int *p1;      // 指向 const int 的指针，*p1 不可改
int * const p2;     // const 指针，p2 不可改
const int * const p3; // 都不可改

// 推荐：全局常量声明方式
// .h
extern NSString * const kNotificationName;
// .m
NSString * const kNotificationName = @"com.app.notification";

// volatile — 告诉编译器不要优化（值可能被外部改变）
volatile BOOL isCancelled;
```

### 2.2 typedef

```objc
// 定义类型别名
typedef NSInteger MyInteger;
typedef void (^CompletionBlock)(BOOL success, NSError *error);
typedef NS_ENUM(NSInteger, Direction) {
    DirectionUp,
    DirectionDown,
    DirectionLeft,
    DirectionRight
};
```

---

## 三、运算符

```objc
// 算术：+ - * / %
int a = 10 % 3;   // 1

// 比较：== != > < >= <=
// 逻辑：&& || !
// 赋值：= += -= *= /= %=

// 位运算
int x = 0b1010;
int y = 0b1100;
x & y;    // 0b1000  按位与
x | y;    // 0b1110  按位或
x ^ y;    // 0b0110  按位异或
~x;       // 按位取反
x << 2;   // 左移
x >> 1;   // 右移

// 三目运算符
NSInteger max = (a > b) ? a : b;

// ObjC 特有：消息发送运算符 []
[object method];          // 发送消息
[Class classMethod];      // 类方法
```

---

## 四、流程控制

### 4.1 条件语句

```objc
// if-else
if (condition) {
    // ...
} else if (anotherCondition) {
    // ...
} else {
    // ...
}

// switch（仅限整型/枚举，必须 break）
switch (direction) {
    case DirectionUp:
        [self moveUp];
        break;
    case DirectionDown:
        [self moveDown];
        break;
    default:
        break;
}
```

### 4.2 循环

```objc
// for
for (NSInteger i = 0; i < 10; i++) {
    // ...
}

// for-in（快速枚举，遵循 NSFastEnumeration）
for (NSString *item in array) {
    NSLog(@"%@", item);
}

// while
while (condition) {
    // ...
}

// do-while
do {
    // 至少执行一次
} while (condition);

// break / continue
// break：跳出整个循环
// continue：跳过当前迭代
```

---

## 五、预处理器

```objc
// 宏定义
#define PI 3.14159
#define MAX(a, b) ((a) > (b) ? (a) : (b))  // 注意括号防歧义
#define LOG(fmt, ...) NSLog(fmt, ##__VA_ARGS__)  // 可变参数宏

// 条件编译
#ifdef DEBUG
    // Debug 模式
#else
    // Release 模式
#endif

#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 150000
    // iOS 15+ API
#endif

// #import vs #include
// #import 自动防重复包含，#include 需要头文件保护
#import <UIKit/UIKit.h>      // 系统框架
#import "MyClass.h"          // 自定义头文件

// #pragma
#pragma mark - Lifecycle     // Xcode 导航标记
#pragma mark -               // 分隔线
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
// 忽略警告的代码
#pragma clang diagnostic pop
```

---

## 六、面向对象

### 6.1 类的声明与实现

```objc
// ========== .h 头文件（公开接口）==========
@interface Person : NSObject <NSCopying>

// 属性
@property (nonatomic, copy) NSString *name;
@property (nonatomic, assign) NSInteger age;

// 初始化器
- (instancetype)initWithName:(NSString *)name age:(NSInteger)age;

// 实例方法
- (void)introduce;

// 类方法
+ (instancetype)personWithName:(NSString *)name age:(NSInteger)age;

@end

// ========== .m 实现文件 ==========
@implementation Person

// 懒加载
- (NSArray *)friends {
    if (!_friends) {
        _friends = [NSArray array];
    }
    return _friends;
}

- (instancetype)initWithName:(NSString *)name age:(NSInteger)age {
    self = [super init];
    if (self) {
        _name = [name copy];
        _age = age;
    }
    return self;
}

+ (instancetype)personWithName:(NSString *)name age:(NSInteger)age {
    return [[self alloc] initWithName:name age:age];
}

- (void)introduce {
    NSLog(@"我叫 %@，今年 %ld 岁", self.name, (long)self.age);
}

- (id)copyWithZone:(NSZone *)zone {
    Person *copy = [[Person allocWithZone:zone] initWithName:self.name age:self.age];
    return copy;
}

@end
```

### 6.2 属性（@property）

```objc
// 属性 = 实例变量 + getter + setter
// @synthesize 自动生成（编译器默认行为）
// @dynamic 告诉编译器 getter/setter 由运行时提供

// 线程安全修饰符
// nonatomic：非线程安全，性能好（绝大多数情况用这个）
// atomic：线程安全，默认值，性能差（只保证 setter/getter 原子性，不保证整体线程安全）

// 语义修饰符
// assign：简单赋值（基本类型、非所有权指针）
// strong：强引用，持有对象（ARC 下默认）
// weak：弱引用，不持有，对象销毁自动置 nil
// copy：拷贝对象，持有副本（NSString、Block 必须用 copy）
// retain：MRC 下的强引用（ARC 下等同 strong）
// unsafe_unretained：弱引用但不自动置 nil（野指针风险）

// 读写修饰符
// readwrite：生成 getter+setter（默认）
// readonly：只生成 getter

// setter/getter 自定义名
@property (nonatomic, getter=isFinished) BOOL finished;
@property (nonatomic, copy, readonly) NSString *identifier;
```

### 6.3 继承

```objc
// ObjC 单继承
@interface Student : Person
@property (nonatomic, copy) NSString *school;
@end

@implementation Student
- (void)introduce {
    [super introduce];  // 调用父类实现
    NSLog(@"就读于 %@", self.school);
}
@end

// 方法重写
// super 不是父类对象，而是告诉编译器从父类方法列表开始查找
```

### 6.4 多态

```objc
// 动态绑定：运行时根据实际类型决定调用哪个方法
Person *p = [[Student alloc] init];
[p introduce];  // 调用 Student 的 introduce

// 类型检查
[p isKindOfClass:[Student class]];    // YES（含子类）
[p isMemberOfClass:[Student class]];  // YES（不含子类）
[p respondsToSelector:@selector(study)]; // 检查是否响应方法
```

#### isKindOfClass: 与 isMemberOfClass: 详解

这两个方法都用于运行时类型检查，区别在于是否考虑继承链：

```objc
@interface Animal : NSObject
@end

@interface Dog : Animal
@end

@interface Husky : Dog
@end

Husky *h = [[Husky alloc] init];

// isKindOfClass: — 沿继承链向上检查，匹配自身或任何父类则返回 YES
[h isKindOfClass:[Husky class]];   // YES（自身）
[h isKindOfClass:[Dog class]];     // YES（父类）
[h isKindOfClass:[Animal class]];  // YES（祖父类）
[h isKindOfClass:[NSObject class]];// YES（根类）

// isMemberOfClass: — 只检查当前类是否完全匹配，不含父类
[h isMemberOfClass:[Husky class]];   // YES（自身）
[h isMemberOfClass:[Dog class]];     // NO（父类不算）
[h isMemberOfClass:[Animal class]];  // NO（祖父类不算）
```

**使用场景**：`isKindOfClass:` 用得最多，适合判断"这个对象是不是某类或其子类"。`isMemberOfClass:` 用得少，只有在需要精确判断"这个对象恰好是这个类，不是它的子类"时才用。

**类簇（Class Cluster）陷阱**：这是实际开发中最常踩的坑。Foundation 中 NSString、NSArray、NSDictionary 等都是类簇，你创建的对象实际类型是私有子类，不是声明的类：

```objc
NSString *str = @"hello";
NSArray *arr = @[@1, @2];

// ❌ 用 isMemberOfClass 判断类簇会失败
[str isMemberOfClass:[NSString class]];  // NO！实际类型是 __NSCFConstantString
[arr isMemberOfClass:[NSArray class]];   // NO！实际类型是 __NSArrayI

// ✅ 用 isKindOfClass: 判断类簇才能正确工作
[str isKindOfClass:[NSString class]];    // YES
[arr isKindOfClass:[NSArray class]];     // YES

// 同理，直接比较 class 也不可靠
[[str class] isEqual:[NSString class]];  // NO
```

**NSMutableArray 陷阱**：

```objc
NSMutableArray *mutableArr = [NSMutableArray array];
[mutableArr isKindOfClass:[NSArray class]];     // YES（NSMutableArray 是 NSArray 子类）
[mutableArr isMemberOfClass:[NSArray class]];   // NO
[mutableArr isKindOfClass:[NSMutableArray class]]; // YES（但实际类型可能是 __NSArrayM）
```

**最佳实践**：判断对象类型时始终用 `isKindOfClass:`，不要用 `isMemberOfClass:` 或直接比较 `[obj class] == [SomeClass class]`。`isMemberOfClass:` 几乎只在源码学习、Runtime 调试等特殊场景下使用，日常开发中不应该出现。

**与 respondsToSelector: 的配合**：类型检查和方法检查可以配合使用，优先用 `respondsToSelector:` 做鸭子类型判断，降低类继承耦合：

```objc
// 不推荐：依赖具体类型
if ([obj isKindOfClass:[Downloadable class]]) {
    [obj startDownload];
}

// 推荐：依赖方法存在性（鸭子类型）
if ([obj respondsToSelector:@selector(startDownload)]) {
    [obj startDownload];
}
```

---

## 七、Category（分类）

### 7.1 基本用法

```objc
// ========== 声明 ==========
@interface NSString (MyAdditions)
- (BOOL)isValidEmail;
+ (NSString *)emptyString;
@end

// ========== 实现 ==========
@implementation NSString (MyAdditions)
- (BOOL)isValidEmail {
    // ...
    return YES;
}
+ (NSString *)emptyString {
    return @"";
}
@end
```

### 7.2 关联对象（为分类添加"属性"）

```objc
#import <objc/runtime.h>

@interface UIView (MyAdditions)
@property (nonatomic, copy) NSString *identifier;  // 分类中 @property 只生成声明
@end

@implementation UIView (MyAdditions)

- (NSString *)identifier {
    return objc_getAssociatedObject(self, _cmd);
}

- (void)setIdentifier:(NSString *)identifier {
    objc_setAssociatedObject(self,
                             @selector(identifier),
                             identifier,
                             OBJC_ASSOCIATION_COPY_NONATOMIC);
    // 关联策略：
    // OBJC_ASSOCIATION_ASSIGN        — weak
    // OBJC_ASSOCIATION_RETAIN_NONATOMIC — strong nonatomic
    // OBJC_ASSOCIATION_COPY_NONATOMIC   — copy nonatomic
    // OBJC_ASSOCIATION_RETAIN           — strong atomic
    // OBJC_ASSOCIATION_COPY             — copy atomic
}
@end
```

### 7.3 Category 的局限

- 不能添加实例变量（只能用关联对象模拟）
- 方法名冲突时，Category 方法覆盖原方法（后编译的覆盖先编译的）
- 不能调用被覆盖的原方法（可用 runtime 解决）

---

## 八、Extension（扩展）

```objc
// 匿名 Category，在 .m 文件中声明私有方法和属性
// ========== Person.m ==========
@interface Person ()
@property (nonatomic, strong) NSMutableArray *internalData;  // 私有属性
- (void)privateMethod;  // 私有方法声明
@end

@implementation Person
- (void)privateMethod {
    // ...
}
@end
```

> **Category vs Extension**：
> - Category 有名字，Extension 匿名
> - Category 不能添加 ivar，Extension 可以
> - Category 运行时生效，Extension 编译时生效
> - Category 可单独文件，Extension 必须在主类 .m 中

---

## 九、Protocol（协议）

```objc
// ========== 声明 ==========
@protocol MyDataSource <NSObject>
@required
- (NSInteger)numberOfItems;           // 必须实现
- (id)itemAtIndex:(NSInteger)index;   // 必须实现

@optional
- (void)didSelectItemAtIndex:(NSInteger)index;  // 可选实现
@end

// ========== 遵循协议 ==========
@interface MyView : UIView
@property (nonatomic, weak) id<MyDataSource> dataSource;  // weak 防循环引用
@property (nonatomic, weak) id<MyDataSource> delegate;
@end

// ========== 调用可选方法前必须检查 ==========
if ([self.delegate respondsToSelector:@selector(didSelectItemAtIndex:)]) {
    [self.delegate didSelectItemAtIndex:index];
}

// 协议继承
@protocol MyAdvancedDataSource <MyDataSource>
- (void)configureItem:(id)item;  // 遵循此协议必须同时实现 MyDataSource 的方法
@end
```

---

## 十、Block

### 10.1 声明与使用

```objc
// 声明
void (^simpleBlock)(void) = ^{
    NSLog(@"Hello Block");
};
simpleBlock();

// 带参数和返回值
NSInteger (^addBlock)(NSInteger, NSInteger) = ^(NSInteger a, NSInteger b) {
    return a + b;
};
addBlock(3, 5);  // 8

// typedef 简化
typedef void (^CompletionBlock)(BOOL success, NSError *error);
- (void)performTaskWithCompletion:(CompletionBlock)completion;
```

### 10.2 变量捕获

```objc
NSInteger value = 10;
void (^block)(void) = ^{
    // value 被捕获为 const 副本（值捕获）
    // NSLog(@"%ld", value);  // 10，不是 20
};
value = 20;
block();

// __block 修饰：允许在 Block 内修改外部变量
__block NSInteger counter = 0;
void (^incrementBlock)(void) = ^{
    counter++;  // 修改的是外部变量本身
};
incrementBlock();  // counter == 1

// 对象类型捕获
NSString *str = @"hello";
void (^objBlock)(void) = ^{
    NSLog(@"%@", str);  // 强引用捕获（ARC 下 Block 自动 copy 到堆）
};
```

### 10.3 Block 的内存管理

```objc
// 栈 Block → 堆 Block
// ARC 下：Block 被赋值给强指针时自动 copy 到堆
// Block 作为方法参数传递时，需要手动 copy 或方法内部 copy

// Block 属性必须用 copy（ARC 下 strong 也可以，但 copy 更语义化）
@property (nonatomic, copy) CompletionBlock completion;

// 三种 Block 类型：
// 1. __NSGlobalBlock__：不捕获外部变量，存在数据段
// 2. __NSStackBlock__：捕获外部变量，存在栈上（ARC 下很少见）
// 3. __NSMallocBlock__：捕获外部变量，copy 到堆上
```

### 10.4 循环引用

```objc
// ❌ 循环引用
self.completion = ^{
    [self doSomething];  // Block 持有 self，self 持有 Block
};

// ✅ weak-self dance
__weak typeof(self) weakSelf = self;
self.completion = ^{
    __strong typeof(weakSelf) strongSelf = weakSelf;
    if (!strongSelf) return;
    [strongSelf doSomething];
};
```

---

## 十一、枚举

```objc
// NS_ENUM — 普通枚举
typedef NS_ENUM(NSInteger, UITableViewCellStyle) {
    UITableViewCellStyleDefault,
    UITableViewCellStyleValue1,
    UITableViewCellStyleValue2,
    UITableViewCellStyleSubtitle
};

// NS_OPTIONS — 位掩码枚举（可组合）
typedef NS_OPTIONS(NSUInteger, UIViewAutoresizing) {
    UIViewAutoresizingNone                 = 0,
    UIViewAutoresizingFlexibleLeftMargin   = 1 << 0,
    UIViewAutoresizingFlexibleWidth        = 1 << 1,
    UIViewAutoresizingFlexibleRightMargin  = 1 << 2,
    UIViewAutoresizingFlexibleTopMargin    = 1 << 3,
    UIViewAutoresizingFlexibleHeight       = 1 << 4,
    UIViewAutoresizingFlexibleBottomMargin = 1 << 5
};

// 组合使用
view.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

// switch 中不要加 default（编译器可检查是否遗漏枚举值）
switch (style) {
    case UITableViewCellStyleDefault: break;
    case UITableViewCellStyleValue1:  break;
    case UITableViewCellStyleValue2:  break;
    case UITableViewCellStyleSubtitle: break;
}
```

---

## 十二、错误处理

```objc
// NSError
NSError *error = nil;
BOOL success = [data writeToFile:path options:nil error:&error];
if (!success) {
    NSLog(@"Error: %@ - %@", error.localizedDescription, error.localizedFailureReason);
}

// NSError 三个关键字段
// domain:  错误域（NSString）
// code:    错误码（NSInteger）
// userInfo: 附加信息（NSDictionary）

// 自定义错误域
NSString * const MyErrorDomain = @"com.app.error";
typedef NS_ENUM(NSInteger, MyErrorCode) {
    MyErrorCodeNetworkFailure = 1001,
    MyErrorCodeInvalidInput   = 1002,
};

NSError *customError = [NSError errorWithDomain:MyErrorDomain
                                           code:MyErrorCodeNetworkFailure
                                       userInfo:@{NSLocalizedDescriptionKey: @"网络请求失败"}];

// @try/@catch（极少使用，ObjC 惯例是 NSError）
@try {
    [riskyMethod];
} @catch (NSException *exception) {
    NSLog(@"Exception: %@", exception);
} @finally {
    // 清理
}
```

---

## 十三、字面量语法

```objc
// NSNumber
NSNumber *intNum = @42;
NSNumber *floatNum = @3.14f;
NSNumber *boolNum = @YES;
NSNumber *charNum = @'A';

// NSArray
NSArray *arr = @[@"a", @"b", @(42)];
arr[0];  // @"a"

// NSDictionary
NSDictionary *dict = @{
    @"name": @"张三",
    @"age": @(25)
};
dict[@"name"];  // @"张三"

// NSString
NSString *str = @"Hello World";
```

---

## 十四、NSValue / NSNumber / NSNull

```objc
// NSNumber：包装基本数值类型
NSNumber *n = @42;
[n intValue];       // 42
[n boolValue];       // YES（非零）
[n compare:@100];    // NSOrderedAscending

// NSValue：包装任意 C 类型（结构体、指针等）
CGPoint point = CGPointMake(10, 20);
NSValue *value = [NSValue valueWithCGPoint:point];
CGPoint p = [value CGPointValue];

CGRect rect = CGRectMake(0, 0, 100, 100);
NSValue *rectValue = [NSValue valueWithCGRect:rect];

// NSNull：集合中表示空值的单例
[dict setObject:[NSNull null] forKey:@"key"];
if (dict[@"key"] == [NSNull null]) {
    // 值为空
}
```

---

## 十五、NSPredicate / NSSortDescriptor

```objc
// NSPredicate — 过滤
NSArray *people = @[
    @{@"name": @"张三", @"age": @25},
    @{@"name": @"李四", @"age": @30},
    @{@"name": @"王五", @"age": @20}
];

// 基本过滤
NSPredicate *predicate = [NSPredicate predicateWithFormat:@"age > 20"];
NSArray *filtered = [people filteredArrayUsingPredicate:predicate];

// 模糊匹配
NSPredicate *namePredicate = [NSPredicate predicateWithFormat:@"name CONTAINS '张'"];

// BETWEEN / IN
NSPredicate *rangePredicate = [NSPredicate predicateWithFormat:@"age BETWEEN {20, 28}"];
NSPredicate *inPredicate = [NSPredicate predicateWithFormat:@"name IN {'张三', '李四'}"];

// NSSortDescriptor — 排序
NSSortDescriptor *sortDesc = [NSSortDescriptor sortDescriptorWithKey:@"age"
                                                           ascending:YES
                                                            selector:@selector(compare:)];
NSArray *sorted = [people sortedArrayUsingDescriptors:@[sortDesc]];
```

---

## 十六、方法签名

```objc
// 方法命名规范
// - 实例方法（对象调用）  + 类方法（类调用）

// 无参
- (void)reloadData;

// 单参
- (void)setTitle:(NSString *)title;

// 多参（每个参数都有标签）
- (void)initWithName:(NSString *)name age:(NSInteger)age;

// 标签名省略（不推荐）
- (void)set:(NSString *)name :(NSInteger)age;  // ❌ 可读性差

// 方法签名 = 返回类型 + 参数类型序列
// 编译器通过方法签名（而非方法名）查找方法
// 这也是 ObjC 不支持方法重载的原因
```

---

## 十七、SEL / IMP / Method

```objc
// SEL：方法选择器，方法名的唯一标识
SEL sel = @selector(viewDidLoad);
SEL sel2 = NSSelectorFromString(@"viewDidLoad");

// IMP：方法实现函数指针
// typedef id (*IMP)(id, SEL, ...);

// Method：方法结构体（包含 SEL + IMP + 类型编码）
Method method = class_getInstanceMethod([self class], @selector(viewDidLoad));

// 关系：
// SEL → 方法名（查表）
// IMP → 方法实现（函数指针）
// Method → SEL + IMP + type encoding

// 通过 SEL 获取 IMP
IMP imp = [self methodForSelector:@selector(doSomething)];
// 直接调用 IMP（跳过消息派发，性能略优）
((void (*)(id, SEL))imp)(self, @selector(doSomething));
```

---

## 十八、自引用与初始化

```objc
// init 规范
- (instancetype)init {
    self = [super init];  // 1. 调用父类初始化
    if (self) {           // 2. 检查返回值
        // 3. 设置默认值
        _name = @"default";
    }
    return self;          // 4. 返回 self
}

// 指定初始化器（Designated Initializer）
- (instancetype)initWithName:(NSString *)name age:(NSInteger)age {
    self = [super init];
    if (self) {
        _name = [name copy];
        _age = age;
    }
    return self;
}

// 便利初始化器（Convenience Initializer）调用指定初始化器
- (instancetype)initWithName:(NSString *)name {
    return [self initWithName:name age:0];
}

// 通用初始化器模式
// 子类指定初始化器必须调用父类指定初始化器
// 便利初始化器必须调用本类的指定初始化器
```

---

## 十九、现代 Protocol（Modern Protocols）

```objc
// ObjC 的 @protocol 不支持 associated types
// Swift 中 Protocol 支持 associatedtype，无法直接桥接

// ObjC 协议：仅支持方法声明 + 可选/必需标记
@protocol DataFetcher <NSObject>
- (void)fetchDataWithCompletion:(void (^)(NSData *data))completion; // 必需
@optional
- (void)cancel;
@end

// Swift 中同等功能需使用 class protocol + 手动扩展
// 无法直接映射 Swift 的 associatedtype 约束
protocol SwiftDataFetcher: AnyObject {
    associatedtype Data: Decodable
    func fetch() async throws -> Data
}

/* 关键差异：
- ObjC @protocol: 运行时存在，支持 respondsToSelector: 检查
- Swift protocol: 编译时约束，associatedtype 版本不桥接到 ObjC
- 互操作方案：
  1. 使用 class protocol（限制为类类型）
  2. 去掉 associatedtype，使用泛型方法代替
  3. ObjC 侧使用 NSObject * + 运行时检查
*/

// 替代方案：使用泛型方法绕过 associatedtype 限制
protocol GenericFetcher: AnyObject {
    func fetch<T>() async throws -> T  // 泛型方法可桥接
}

/* 最佳实践：
- 纯 ObjC 模块使用 @protocol
- 纯 Swift 模块使用 protocol + associatedtype
- 跨语言接口使用 class protocol，避免 associatedtype
*/
```

---

## 二十、轻量级泛型（Lightweight Generics）

```objc
// 语法：NSArray<NSString *> 角度括号标注类型
NSArray<NSString *> *names = @[@"Alice", @"Bob"];
NSDictionary<NSString *, NSNumber *> *scores = @{
    @"Alice" : @95,
    @"Bob" : @87
};
NSSet<id<NSCopying>> *objects = [NSSet setWithObject:@1];

// ⚠️ 编译时检查，运行时无泛型信息
// NSArray<NSString *> 和 NSArray<NSNumber *> 运行时类型相同
// 这是"擦除型"泛型（类似 Java 的类型擦除）

// 编译器会在以下情况发出警告：
NSNumber *num = names[0];  // ⚠️ Incompatible pointer types

// 运行时行为：泛型信息完全擦除
NSArray<NSString *> *typed = @[@"hello"];
NSArray *raw = typed;  // 无警告，编译通过
NSNumber *bad = raw[0];  // ⚠️ 编译器无法检查 raw 的泛型

// NS_SWIFT_NAME 桥接到 Swift 时自动推断泛型参数
// ObjC: NSArray<NSString *> → Swift: [String]
// ObjC: NSDictionary<NSString *, UIImage *> → Swift: [String: UIImage]

/* 最佳实践：
- 所有容器变量都标注泛型类型
- 返回类型标注泛型，调用方才能享受类型检查
- 不要依赖运行时检查泛型类型
- 混合使用 typed 和 raw 容器时格外小心
*/
```


---

## 二十、轻量级泛型（Lightweight Generics）

```objc
// 语法：NSArray<NSString *> 角度括号标注类型
NSArray<NSString *> *names = @[@"Alice", @"Bob"];
NSDictionary<NSString *, NSNumber *> *scores = @{
    @"Alice" : @95,
    @"Bob" : @87
};
NSSet<id<NSCopying>> *objects = [NSSet setWithObject:@1];

// ⚠️ 编译时检查，运行时无泛型信息
// NSArray<NSString *> 和 NSArray<NSNumber *> 运行时类型相同
// 这是"擦除型"泛型（类似 Java 的类型擦除）

// 编译器会在以下情况发出警告：
NSNumber *num = names[0];  // ⚠️ Incompatible pointer types

// 运行时行为：泛型信息完全擦除
NSArray<NSString *> *typed = @[@"hello"];
NSArray *raw = typed;  // 无警告，编译通过
NSNumber *bad = raw[0];  // ⚠️ 编译器无法检查 raw 的泛型

// NS_SWIFT_NAME 桥接到 Swift 时自动推断泛型参数
// ObjC: NSArray<NSString *> → Swift: [String]
// ObjC: NSDictionary<NSString *, UIImage *> → Swift: [String: UIImage]

/* 最佳实践：
- 所有容器变量都标注泛型类型
- 返回类型标注泛型，调用方才能享受类型检查
- 不要依赖运行时检查泛型类型
- 混合使用 typed 和 raw 容器时格外小心
*/
```

---

## 二十一、Nullability 注解（_Nullable / _Nonnull / _Null_unspecified）

```objc
// 三种注解：
// _Nonnull    — 绝对不会为 nil（默认）
// _Nullable   — 可能为 nil
// _Null_unspecified — 未指定（不推荐）

// 基本用法
- (NSString *)loadName;           // 默认 Nonnull
- (NSString *)loadOptionalName;   // 默认 Nonnull（可能误标！）

// 正确标注
- (NSString *_Nullable)loadOptionalName;  // 可能返回 nil
- (void)setName:(NSString *)name;          // 参数默认 Nonnull
- (void)setName:(NSString *_Nullable)name; // 参数可为 nil

// 容器泛型中的 nullability
NSArray<NSString *> *            // 容器 Nonnull，元素 Nonnull
NSArray<NSString * _Nullable *> *   // 容器 Nonnull，元素可为 nil
NSArray<NSString *> * _Nullable    // 容器本身可为 nil

// 桥接到 Swift 的映射：
// _Nonnull  → Swift 非可选类型（String）
// _Nullable → Swift 可选类型（String?）
// _Null_unspecified → Swift 隐式解包可选（String!）

// 常见宏简化写法
typedef NSString * (_Nullable ^NameBlock)(void);
NS_ASSUME_NONNULL_BEGIN  // 默认 Nonnull，减少重复
- (NSString *)name;      // Nonnull
- (NSString *_Nullable)optionalName;  // Nullable
NS_ASSUME_NONNULL_END

/* 常见坑：
- 未标注时默认为 Nonnull，可能导致桥接 Swift 后意外崩溃
- 第三方库未标注 → 所有类型变成 !（隐式解包），隐藏了 nil 风险
- bridged cast (id <NSCopying>)obj 桥接泛型时类型擦除
- 注解不传播：即使参数标注 Nonnull，内部赋值的 ivar 仍需单独标注
*/
```

## NS_DESIGNATED_INITIALIZER 初始化器链模式

### 指定初始化器 vs 便捷初始化器

Objective-C 的初始化体系沿用了 Smalltalk 的设计思想：每个类必须有一个**指定初始化器（Designated Initializer）**和零个或多个**便捷初始化器（Convenience Initializer）**。

- **指定初始化器**：类中功能最完整、参数最全面的初始化方法，负责调用父类的指定初始化器，并初始化所有实例变量
- **便捷初始化器**：通过调用同类中的其他初始化器（通常是指定初始化器）来简化调用，提供默认参数

```objc
// 经典模式：NSPoint 示例
@interface NSPoint : NSObject
- (instancetype)initWithX:(CGFloat)x y:(CGFloat)y;  // 指定初始化器
- (instancetype)init;                                 // 便捷初始化器
@end

@implementation NSPoint
// 便捷初始化器 → 调用指定初始化器（提供默认值）
- (instancetype)init {
    return [self initWithX:0.0 y:0.0];
}

// 指定初始化器 → 调用父类的指定初始化器
- (instancetype)initWithX:(CGFloat)x y:(CGFloat)y {
    self = [super init];  // NSObject 的指定初始化器是 init
    if (self) {
        _x = x;
        _y = y;
    }
    return self;
}
@end
```

初始化器链必须遵循**两条铁律**：
1. 便捷初始化器 → 必须调用同类中的另一个初始化器（通常是本类的指定初始化器）
2. 指定初始化器 → 必须调用**父类**的指定初始化器

### NS_DESIGNATED_INITIALIZER 宏

Clang 3.5（Xcode 6+）引入 `NS_DESIGNATED_INITIALIZER` 宏，在编译时**强制检查**初始化器链的完整性。

```objc
// 定义在 <Foundation/NSObjCRuntime.h>
#if __has_feature(objc_designated_initiators)
#define NS_DESIGNATED_INITIALIZER
#else
#define NS_DESIGNATED_INITIALIZER
#endif
```

在方法声明末尾添加此宏后，编译器会进行以下检查：

```objc
@interface Shape : NSObject
- (instancetype)initWithFrame:(CGRect)frame NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;  // 标记为不可用
- (instancetype)initWithFrame:(CGRect)frame name:(NSString *)name;  // 便捷初始化器，不需要标注
@end
```

编译器强制规则：

```
┌─────────────────────────────────────────────────────────────┐
│  NS_DESIGNATED_INITIALIZER 编译时检查规则                     │
│                                                             │
│  1. 标注了 NS_DESIGNATED_INITIALIZER 的方法                 │
│     → 必须调用父类标注了 NS_DESIGNATED_INITIALIZER 的方法    │
│     → 如果调用未标注的方法，编译器报错 ⚠️                   │
│                                                             │
│  2. 未标注 NS_DESIGNATED_INITIALIZER 的方法                 │
│     → 必须调用同类中其他初始化器（不能跨级调用 super）       │
│     → 如果调用 [super init]，编译器报错 ⚠️                  │
│                                                             │
│  3. 标注了 NS_UNAVAILABLE 的初始化器                         │
│     → 调用者编译时直接报错，无法绕过                         │
└─────────────────────────────────────────────────────────────┘
```

### 完整的类层次示例

```objc
// ========== 基类 ==========
@interface Shape : NSObject

@property (nonatomic, readonly) NSString *name;
@property (nonatomic, readonly) UIColor *color;

- (instancetype)initWithName:(NSString *)name color:(UIColor *)color NS_DESIGNATED_INITIALIZER;
- (instancetype)initWithCoder:(NSCoder *)coder NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@end

@implementation Shape

- (instancetype)initWithName:(NSString *)name color:(UIColor *)color {
    // 指定初始化器：必须调用父类（NSObject）的指定初始化器
    self = [super init];  // ✅ NSObject 的 init 是其指定初始化器
    if (self) {
        _name = [name copy];
        _color = color;
    }
    return self;
}

- (instancetype)initWithCoder:(NSCoder *)coder {
    // 反序列化也是指定初始化器
    self = [super init];
    if (self) {
        _name = [[coder decodeObjectForKey:@"name"] copy];
        _color = [coder decodeObjectOfClass:[UIColor.class] forKey:@"color"];
    }
    return self;
}

@end

// ========== 子类 ==========
@interface Circle : Shape

@property (nonatomic, readonly) CGFloat radius;

- (instancetype)initWithName:(NSString *)name color:(UIColor *)color radius:(CGFloat)r NS_DESIGNATED_INITIALIZER;
- (instancetype)initWithCoder:(NSCoder *)coder NS_DESIGNATED_INITIALIZER;
- (instancetype)initWithColor:(UIColor *)color radius:(CGFloat)r;       // 便捷初始化器
- (instancetype)init NS_UNAVAILABLE;
- (instancetype)initWithName:(NSString *)name NS_UNAVAILABLE;  // 继承的标记为不可用

@end

@implementation Circle

- (instancetype)initWithName:(NSString *)name color:(UIColor *)color radius:(CGFloat)r {
    // 指定初始化器：必须调用父类 Shape 的指定初始化器
    self = [super initWithName:name color:color];  // ✅ 正确
    if (self) {
        _radius = r;
    }
    return self;
}

- (instancetype)initWithCoder:(NSCoder *)coder {
    // 反序列化指定初始化器
    self = [super initWithCoder:coder];  // ✅ 调用父类指定初始化器
    if (self) {
        _radius = [coder decodeFloatForKey:@"radius"];
    }
    return self;
}

// 便捷初始化器：提供默认 name
- (instancetype)initWithColor:(UIColor *)color radius:(CGFloat)r {
    return [self initWithName:@"Circle" color:color radius:r];  // ✅ 调用本类指定初始化器
}

@end
```

### 初始化器链的 ASCII 图

```
调用者                          初始化器链流程
  │
  ├─ [Circle init]                  → ❌ 编译错误！NS_UNAVAILABLE
  │
  ├─ [Circle initWithColor:r:]      → [self initWithName:color:radius:]
  │                                        │
  │                                        ↓
  │                                    [super initWithName:color:]
  │                                        │
  │                                        ↓
  │                                    [super init]  // NSObject
  │                                        │
  │                                        ↓
  │                                    return self ← 逐层返回
  │                                  ← 初始化 radius
  │                                ← 初始化 name, color
  │                              ← 分配内存
  │
  └─ [Circle initWithName:color:radius:] 直接调用指定初始化器
                                    → [super initWithName:color:]
                                        → [super init]
                                            → return self (逐层返回初始化)
```

### 与 Swift 的 `required init` / `convenience init` 对比

| Objective-C | Swift | 说明 |
|---|---|---|
| `NS_DESIGNATED_INITIALIZER` | `required init` / 主 init | 两者都标记"完整初始化器" |
| 未标注的 init | `convenience init` | 便捷初始化器 |
| `NS_UNAVAILABLE` | `init() { fatalError("...") }` 或 `unavailable` | 禁止调用 |
| 编译时链检查 | 编译器强制两阶段初始化 | 机制不同但目标一致 |

```swift
// Swift 等价写法
class Shape: NSObject {
    let name: String
    let color: UIColor

    override required init(coder: NSCoder) {
        self.name = ""
        self.color = .clear
        super.init(coder: coder)
    }

    required init(name: String, color: UIColor) {
        self.name = name
        self.color = color
        super.init()
    }

    convenience override init() {
        self.init(name: "", color: .clear)
    }
}

class Circle: Shape {
    let radius: CGFloat

    convenience init(color: UIColor, radius: CGFloat) {
        self.init(name: "Circle", color: color)  // convenience → 调用 required
        self.radius = radius  // Swift 两阶段：先调用 super，再设 self 属性
    }

    required init(name: String, color: UIColor, radius: CGFloat) {
        self.radius = radius  // 先初始化子类属性
        super.init(name: name, color: color)  // 再调用父类
    }
}
```

### 常见陷阱

**陷阱 1：忘记标注 `NS_DESIGNATED_INITIALIZER`**
```objc
// 错误：忘记在声明中加 NS_DESIGNATED_INITIALIZER
@interface MyView : UIView
- (instancetype)initWithFrame:(CGRect)frame style:(MyStyle)style;  // 忘了标注！
@end

@implementation MyView
- (instancetype)initWithFrame:(CGRect)frame style:(MyStyle)style {
    self = [super initWithFrame:frame];  // ⚠️ 编译器不会检查，因为没标注
    // 子类可能不知道这是指定初始化器，直接调用 [super init]
    return self;
}
@end
```

**陷阱 2：子类忘记标注自己的指定初始化器**
```objc
@interface SubView : MyView
- (instancetype)initWithFrame:(CGRect)frame style:(MyStyle)style cornerRadius:(CGFloat)r;
// 忘了加 NS_DESIGNATED_INITIALIZER！
@end

@implementation SubView
- (instancetype)initWithFrame:(CGRect)frame style:(MyStyle)style cornerRadius:(CGFloat)r {
    self = [super initWithFrame:frame style:style];  // 编译通过但链已断裂
    return self;
}
- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];  // ⚠️ 绕过了 style 参数！编译不报错
    return self;
}
@end
```

**陷阱 3：`initWithCoder:` 也是指定初始化器**
```objc
// 常见遗漏：归档/Storyboard 场景需要处理 initWithCoder:
@interface MyController : UIViewController
- (instancetype)initWithConfig:(MyConfig *)config NS_DESIGNATED_INITIALIZER;
- (instancetype)initWithCoder:(NSCoder *)coder NS_DESIGNATED_INITIALIZER;  // 必须标注！
- (instancetype)init NS_UNAVAILABLE;
@end
```

### 最佳实践

```objc
// ✅ 现代 Objective-C 初始化最佳实践清单
// 1. 声明中明确标注 NS_DESIGNATED_INITIALIZER
// 2. 将不想被调用的 init 标记为 NS_UNAVAILABLE
// 3. 自定义类永远不要只暴露 init，提供有意义的初始化器
// 4. 支持 NSCoding / NSCoder 时，initWithCoder: 必须也标注为指定初始化器
// 5. 自定义 UIView/UIViewController 子类时，注意 initWithFrame: 和 init 的关系
// 6. 使用 NS_ASSUME_NONNULL_BEGIN 包裹整个类声明，减少 nullability 噪音
```

> **参考**：Apple 官方文档 "Class Design" 中的 Initializer Delegation 部分；详见 [Swift 与 Objective-C 互操作](15-Swift与Objective-C互操作.md) 中的 `required init` 桥接注意事项。

## NS_UNAVAILABLE 与重载模式

### NS_UNAVAILABLE 宏

`NS_UNAVAILABLE` 是 Objective-C 中用于**编译期禁用方法**的宏，底层映射为 C 的 `__attribute__((unavailable))`。

```objc
// 定义在 <Foundation/NSObjCRuntime.h>
#if __has_extension(attribute_unavailable_with_message)
#define NS_UNAVAILABLE __attribute__((unavailable))
#else
#define NS_UNAVAILABLE __attribute__((unavailable))
#endif
```

**效果**：任何尝试调用被标记方法的地方，编译器产生硬错误（error，不是 warning），阻止编译。

```objc
@interface RestrictedClass : NSObject
- (instancetype)init NS_UNAVAILABLE;
- (instancetype)initWithCoder:(NSCoder *)coder NS_UNAVAILABLE;
- (instancetype)initWithData:(NSData *)data NS_DESIGNATED_INITIALIZER;
@end

// 使用方：
RestrictedClass *obj = [[RestrictedClass alloc] init];  // ❌ error: 'init' is unavailable
RestrictedClass *obj2 = [[RestrictedClass alloc] initWithData:someData];  // ✅ 唯一合法入口
```

### NS_UNAVAILABLE vs Swift unavailable

| Objective-C | Swift | 行为差异 |
|---|---|---|
| `NS_UNAVAILABLE` | `unavailable` 关键字 | ObjC 是 `__attribute__`，Swift 是独立关键字 |
| 仅影响声明所在类/协议 | 影响整个 Swift 模块 | 作用域相同 |
| 桥接时自动转换为 Swift `unavailable` | 无法反向桥接回 ObjC | ObjC→Swift 自动转换 |

```swift
// ObjC 中 NS_UNAVAILABLE 的方法桥接到 Swift 后
// 自动变成 unavailable，尝试调用同样编译错误
let obj = RestrictedClass()  // ❌ error: 'init' is unavailable
```

### NS_DESIGNATED_INITIALIZER + NS_UNAVAILABLE 组合

这是现代 ObjC API 设计的**黄金组合**，确保调用者只能走正确的初始化路径：

```objc
// 工厂类：强制使用类方法创建，禁止直接 alloc/init
@interface DataLoader : NSObject
+ (instancetype)sharedInstance;
+ (instancetype)dataLoaderWithConfiguration:(DLConfig *)config;
- (instancetype)init NS_UNAVAILABLE;
- (instancetype)initWithCoder:(NSCoder *)coder NS_UNAVAILABLE;
@end

@implementation DataLoader {
    NSMutableDictionary *_requests;
}

+ (instancetype)sharedInstance {
    static DataLoader *shared = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        shared = [[DataLoader alloc] initInternal];  // 私有初始化器
    });
    return shared;
}

+ (instancetype)dataLoaderWithConfiguration:(DLConfig *)config {
    DataLoader *loader = [[DataLoader alloc] initInternal];
    loader._requests = [NSMutableDictionary dictionary];
    // ... apply config
    return loader;
}

// 私有初始化器：不暴露给外部
- (instancetype)initInternal {
    self = [super init];
    if (self) {
        _requests = [NSMutableDictionary dictionary];
    }
    return self;
}

@end
```

### 重载引导模式（Overloading for Compiler Guidance）

通过声明多个不可用的方法重载，**引导调用者使用正确 API**——编译器不仅报错，还能提供修复建议（Fix-It）。

```objc
@interface SafeString : NSObject

// ✅ 唯一合法创建方式
+ (instancetype)safeStringWithTemplate:(NSString *)template arguments:(NSArray<id<NSCopying>> *)args NS_RETURNS_RETAINED NS_SWIFT_NAME(init(template:arguments:));

// ❌ 阻止误用
+ (instancetype)safeStringWithFormat:(NSString *)format, ... NS_UNAVAILABLE;
- (instancetype)init NS_UNAVAILABLE;
- (instancetype)initWithTemplate:(NSString *)t NS_UNAVAILABLE;

@end
```

### Clang 14+ `unavailable_msg` 自定义错误信息

Clang 14（Xcode 14+）支持在 `unavailable` attribute 后添加自定义消息，并配合 `fix-it` 提示：

```objc
// __attribute__((unavailable("message"))) 在 Xcode 14+ 中可以配合 fix-it
@interface LegacyNetworkClient : NSObject

- (instancetype)initWithHost:(NSString *)host
    __attribute__((unavailable("Use initWithConfiguration: instead")));

+ (instancetype)clientWithHost:(NSString *)host
    __attribute__((unavailable("Use clientWithConfiguration: instead")));

- (instancetype)initWithConfiguration:(LNConfig *)config NS_DESIGNATED_INITIALIZER;
+ (instancetype)clientWithConfiguration:(LNConfig *)config;

@end

// Xcode 15+ 更强大的 unavailable_msg 属性：
- (void)old_connectToServer:(NSString *)host
    __attribute__((unavailable_msg("Use connectWithConfiguration: — the API was redesigned for iOS 16+", "connectWithConfiguration:")));

// 效果：Xcode 会显示 Fix-It，自动替换为 connectWithConfiguration:
```

实际使用中最常见的引导模式：

```objc
// JSON 解析器：用重载 + 消息引导迁移
@interface JSONParser : NSObject

// ✅ 推荐 API（iOS 17+ 风格）
- (instancetype)initWithJSON:(NSData *)data options:(JSONParserOptions)opts NS_DESIGNATED_INITIALIZER;
+ (instancetype)parser;  // 便捷工厂方法

// ❌ 旧 API 废弃引导
- (instancetype)initWithString:(NSString *)str __attribute__((unavailable("Strings are ambiguous. Use initWithJSON:options: with [str dataUsingEncoding:NSUTF8StringEncoding]")));

- (instancetype)initWithDictionary:(NSDictionary *)dict
    __attribute__((unavailable("Use initWithJSON:options: — NSDictionary loses type info")));

- (instancetype)init NS_UNAVAILABLE;

@end
```

### 防止构造函数滥用的完整模式

```objc
// 单例 + 受限构造器 + 重载引导 —— 生产级模式
@interface PaymentProcessor : NSObject

@property (nonatomic, readonly) NSString *merchantID;
@property (nonatomic, readonly) BOOL isConfigured;

// ===== 唯一合法入口 =====
+ (instancetype)processorWithMerchantID:(NSString *)mid apiKey:(NSString *)key;
- (instancetype)initWithMerchantID:(NSString *)mid apiKey:(NSString *)key NS_DESIGNATED_INITIALIZER;

// ===== 封锁所有其他入口 =====
- (instancetype)init NS_UNAVAILABLE;
- (instancetype)initWithCoder:(NSCoder *)coder NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;  // 封锁 alloc + new

// ===== 引导迁移 =====
- (instancetype)initWithMerchantID:(NSString *)mid
    __attribute__((unavailable("Missing apiKey parameter — use initWithMerchantID:apiKey:")));

@end

@implementation PaymentProcessor

+ (instancetype)processorWithMerchantID:(NSString *)mid apiKey:(NSString *)key {
    return [[PaymentProcessor alloc] initWithMerchantID:mid apiKey:key];
}

- (instancetype)initWithMerchantID:(NSString *)mid apiKey:(NSString *)key {
    self = [super init];
    if (self) {
        _merchantID = [mid copy];
        // validate & store apiKey securely
    }
    return self;
}

@end
```

### 何时使用 vs 陷阱

**何时使用 `NS_UNAVAILABLE`**：
- 自定义类需要强制特定的初始化路径
- API 迁移期间废弃旧方法，防止遗留代码静默使用
- 工厂类 / 单例类隐藏构造函数
- 协议中排除不适用的方法

**陷阱**：
```objc
// ⚠️ 陷阱 1：NS_UNAVAILABLE 只影响编译期，不影响运行时消息发送
id obj = [[LegacyClass alloc] init];  // 若 LegacyClass 未标记 unavailable，编译通过
[obj performSelector:@selector(init)];  // 运行时可能崩溃！

// ⚠️ 陷阱 2：子类无法覆盖父类的 NS_UNAVAILABLE
@interface Parent : NSObject
- (void)sealedMethod NS_UNAVAILABLE;
@end
@interface Child : Parent
- (void)sealedMethod;  // ❌ error: 不能重新定义不可用方法
@end

// ⚠️ 陷阱 3：动态消息发送绕过检查
[obj performSelector:NSSelectorFromString(@"unavailableMethod")];  // 编译通过，运行时崩溃

// ✅ 解决：结合 respondsToSelector: 做运行时检查
if ([obj respondsToSelector:NSSelectorFromString(@"safeMethod")]) {
    [obj performSelector:NSSelectorFromString(@"safeMethod")];
}
```

> **参考**：详见 [Swift 与 Objective-C 互操作](15-Swift与Objective-C互操作.md) 中 `@_disfavoredOverload` 和 `unavailable` 的跨语言行为。

## @available / API 可用性检查

### @available 属性（Objective-C 端）

Objective-C 使用 `__attribute__((availability(...)))` 声明 API 的系统版本要求。苹果提供便捷宏封装：

```objc
// Foundation 中定义的宏
API_AVAILABLE(ios(8.0))
- (void)performWithNewFeature;

API_AVAILABLE(ios(15.0))
- (void)performModernFeature;

API_UNAVAILABLE(watchos)
- (void)performIOSOnlyFeature;
```

实际展开：

```objc
// API_AVAILABLE 宏定义（简化版）
#define API_AVAILABLE(...) __attribute__((availability(__VA_ARGS__)))
#define API_UNAVAILABLE(...) __attribute__((unavailable(__VA_ARGS__)))

// 完整等价写法
__attribute__((availability(ios, introduced=15.0)))
- (void)performModernFeature;
```

### 与 Swift #available 对比

| Objective-C | Swift |
|---|---|
| `API_AVAILABLE(ios(15.0))` | `#available(iOS 15.0, *)` |
| `API_UNAVAILABLE(watchos)` | `#unavailable` / `@available(*, unavailable, platforms: watchos)` |
| `@available(iOS 15, *)` | `@available(iOS 15, *)`（两者写法相同） |

```objc
// Objective-C：编译期 + 运行时的可用性检查
if (@available(iOS 15.0, *)) {
    [self performModernFeature];  // iOS 15+ 才编译此路径
} else {
    [self performLegacyFeature];  // 兼容旧版本
}
```

```swift
// Swift：写法类似但语法更紧凑
if #available(iOS 15.0, *) {
    self.performModernFeature()
} else {
    self.performLegacyFeature()
}
```

`@available` 在 ObjC 中会触发以下行为：
- **部署目标低于声明版本**：编译器警告（非错误），提醒开发者做运行时检查
- **省略 `@available` 检查直接调用**：产生 `"-Wunguarded-availability"` 警告
- **Swift 桥接时**：自动映射为 `#available`，检查逻辑无缝互通

### API_AVAILABLE / API_UNAVAILABLE 完整用法

```objc
@interface AdvancedImageProcessor : NSObject

// iOS 13+ 引入
API_AVAILABLE(ios(13.0))
- (void)configureWithSceneSession:(UISceneSession *)session;

// iOS 16+ 引入
API_AVAILABLE(ios(16.0))
- (CGRect)computeLayoutInWindowScene:(UIWindowScene *)scene;

// iOS 17+ 引入
API_AVAILABLE(ios(17.0))
- (void)processWithCoreMLPipeline:(MLComputePipeline *)pipeline;

// 所有平台都可用
- (void)processImage:(UIImage *)image completion:(void (^)(UIImage *))handler;

// watchOS 不可用
API_UNAVAILABLE(watchos)
- (void)presentInFullScreen;

@end
```

### 编译期 vs 运行时检查

```
┌──────────────────────────────────────────────────────────────┐
│                    可用性检查双层级                            │
│                                                              │
│  编译期（Compiler）                                          │
│  ├── 部署目标 ≥ 声明版本：正常编译，无需运行时检查            │
│  ├── 部署目标 < 声明版本：产生 -Wunguarded-availability 警告  │
│  └── API_UNAVAILABLE(platform)：硬错误，无法编译             │
│                                                              │
│  运行时（Runtime）                                           │
│  ├── @available(iOS 15, *) ：编译期语法，运行时判断          │
│  └── respondsToSelector: + class_exists()：手动兜底检查       │
└──────────────────────────────────────────────────────────────┘
```

### 运行时检查兜底

当部署目标版本较低，但想利用高版本 API 时，需要运行时检查：

```objc
// 方案 1：@available（推荐，编译器辅助）
- (void)tryModernAPI {
    if (@available(iOS 15.0, *)) {
        // 编译器知道这里 safe 调用
        [self performModernFeature];
        return;
    }
    // Fallback
    [self performLegacyFeature];
}

// 方案 2：respondsToSelector:（纯运行时）
- (void)tryModernAPI {
    SEL sel = @selector(performModernFeature);
    if ([self respondsToSelector:sel]) {
        (void(*)(id, SEL))objc_msgSend(self, sel);
    } else {
        [self performLegacyFeature];
    }
}

// 方案 3：class_exists + respondsToSelector（针对新类）
- (void)tryNewClass {
    if (NSClassFromString(@"UISceneSession") != Nil) {
        // 类存在于当前系统
        if (@available(iOS 13.0, *)) {
            // 安全使用
        }
    }
}
```

### 废弃 API 与迁移引导

```objc
@interface DataFetcher : NSObject

// ✅ 当前推荐 API
- (NSURLSessionTask *)fetchWithURL:(NSURL *)url
                         completion:(void (^)(NSData *data, NSError *error))completion
    NS_DESIGNATED_INITIALIZER;

// ⚠️ 已废弃但有替代方案
- (void)getDataFromURL:(NSURL *)url
         successBlock:(void (^)(NSData *))success
        failureBlock:(void (^)(NSError *))failure
    __attribute__((deprecated("Use fetchWithURL:completion: instead")));

// ⚠️ 完全移除，提供迁移指引
- (void)loadData:(NSString *)urlString
    __attribute__((deprecated_msg(
        "URL strings are unsafe. Use [NSURL URLWithString:] with fetchWithURL:completion:."
    )));

// ❌ 完全不可用
- (void)syncFetch:(NSURL *)url NS_UNAVAILABLE;

@end
```

### `__deprecated_msg` 与 `__unavailable_MSG`

Clang 14（Xcode 14+）引入带自定义消息的废弃属性，支持 Fix-It 自动替换：

```objc
@interface NetworkManager : NSObject

// deprecated_msg：废弃但可编译，显示自定义消息
- (void)connectToHost:(NSString *)host onPort:(NSInteger)port
    __attribute__((deprecated_msg("Use connectWithEndpoint: instead. "
                                   "The host:port pattern doesn't support TLS configuration.")));

// unavailable_msg：不可用 + 提供修复建议（Xcode 15+ Fix-It）
- (void)sendCommand:(NSString *)cmd toHost:(NSString *)host
    __attribute__((unavailable_msg(
        "Replaced by sendCommand:toEndpoint: — endpoints replace raw host addresses.",
        "sendCommand:toEndpoint:"
    )));

// 推荐使用的新 API
- (void)connectWithEndpoint:(NWEndpoint *)endpoint;
- (void)sendCommand:(NSString *)cmd toEndpoint:(NWEndpoint *)endpoint;

@end
```

Xcode 15+ 的实际体验：

```
⚠️ Deprecated: "Use connectWithEndpoint: instead. The host:port pattern doesn't support TLS configuration."
  └─ Fix available: Show Fix menu

❌ Unavailable: "Replaced by sendCommand:toEndpoint: — endpoints replace raw host addresses."
  └─ Fix-It: ⚡ "Replace with 'sendCommand:toEndpoint:'"
```

### 向后兼容的 API 设计完整示例

```objc
// ========== 现代 API 分层设计 ==========
// 部署目标：iOS 11.0（最低），但利用 iOS 17+ 新特性

@interface ModernView : UIView

// ===== 所有版本可用 =====
@property (nonatomic, copy) NSString *title;
- (instancetype)initWithFrame:(CGRect)frame NS_DESIGNATED_INITIALIZER;
- (instancetype)initWithCoder:(NSCoder *)coder NS_DESIGNATED_INITIALIZER;

// ===== iOS 13 引入 =====
API_AVAILABLE(ios(13.0))
@property (nonatomic, strong) UIColor *tintColor;  // 配合 dark mode

API_AVAILABLE(ios(13.0))
- (void)configureForAppearance:(UITraitCollection *)traits;

// ===== iOS 15 引入 =====
API_AVAILABLE(ios(15.0))
@property (nonatomic, assign) UIBarTintAppearance barAppearance;

API_AVAILABLE(ios(15.0))
- (void)applyContainerAttribute:(UIContainerAttribute)attr value:(NSString *)value;

// ===== iOS 16 引入 =====
API_AVAILABLE(ios(16.0))
@property (nonatomic, assign) UIBigButtonStyle bigButtonStyle;

API_AVAILABLE(ios(16.0))
- (void)configureWithWidgetConfiguration:(NCWidgetConfiguration *)config;

// ===== iOS 17 引入 =====
API_AVAILABLE(ios(17.0))
- (void)attachToEnvironment:(UIElementEnvironment *)env;

// ===== 旧 API 废弃链 =====
- (void)setTitleWithColor:(UIColor *)color
    __attribute__((deprecated("Use title + tintColor properties. "
                               "For iOS 13+, tintColor respects dark mode automatically.")));

@end

@implementation ModernView

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) { [self commonSetup]; }
    return self;
}

- (instancetype)initWithCoder:(NSCoder *)coder {
    self = [super initWithCoder:coder];
    if (self) { [self commonSetup]; }
    return self;
}

- (void)commonSetup {
    // 所有版本通用的初始化逻辑
}

API_AVAILABLE(ios(13.0))
- (void)configureForAppearance:(UITraitCollection *)traits {
    // iOS 13+ 专属逻辑
}

API_AVAILABLE(ios(17.0))
- (void)attachToEnvironment:(UIElementEnvironment *)env {
    // iOS 17+ 专属逻辑
}

@end
```

### 使用方：安全调用新版 API

```objc
- (void)configureView:(ModernView *)view {
    // 所有版本
    view.title = @"Hello";

    // iOS 13+ 自适应外观
    if (@available(iOS 13.0, *)) {
        view.tintColor = [UIColor labelColor];
        [view configureForAppearance:self.traitCollection];
    }

    // iOS 15+ 容器属性
    if (@available(iOS 15.0, *)) {
        [view applyContainerAttribute:UIContainerAttributeBackground value:@"secondary"];
    }

    // iOS 17+ Widget 集成
    if (@available(iOS 17.0, *)) {
        // 实际项目中可能是条件编译
        [view attachToEnvironment:self.environment];  // Xcode 15+ 类型安全
    }
}
```

### Xcode 警告行为一览

| 场景 | Xcode 行为 | 警告级别 |
|---|---|---|
| 调用 `API_AVAILABLE(ios(17.0))`，部署目标 iOS 11 | `"-Wunguarded-availability"` 警告 | Warning，可编译 |
| 在 `@available(iOS 17, *)` 块内调用 | 无警告 | ✅ 正常 |
| 调用 `API_UNAVAILABLE(watchos)` 在 watchOS 项目 | `"-Wunguarded-availability"` → Error | ❌ 编译错误 |
| 调用 `NS_UNAVAILABLE` 方法 | `"-Wunavailable"` 错误 | ❌ 编译错误 |
| 调用 `__attribute__((deprecated("...")))` 方法 | `"-Wdeprecated-declarations"` 警告 | Warning，可编译 |
| 调用 `__attribute__((unavailable_msg("...", "fix")))` | 显示 Fix-It | ❌ 编译错误 + 修复建议 |

### 与 Swift 互操作的注意事项

当 Objective-C 带有版本约束的 API 桥接到 Swift 时：

```objc
// ObjC 头文件
API_AVAILABLE(ios(15.0))
@interface iOS15Feature : NSObject
- (void)doThing;
@end
```

```swift
// Swift 中自动映射为：
@available(iOS 15.0, *)
class iOS15Feature: NSObject {
    func doThing()
}

// 使用
if #available(iOS 15.0, *) {
    let feature = iOS15Feature()
    feature.doThing()  // ✅ 编译器知道在可用范围内
} else {
    // fallback
}
```

> **完整跨语言桥接指南**：详见 [Swift 与 Objective-C 互操作](15-Swift与Objective-C互操作.md) 中的 `@_exportedImport`、`@_disfavoredOverload` 和泛型泛化等高级互操作话题。

### 何时使用 & 陷阱总结

**何时使用**：
- 库 / 框架开发者：标记 API 版本依赖，提供平滑升级路径
- 使用 `deprecated` 而非 `unavailable` 给使用者迁移时间
- 部署目标 < API 引入版本时，用 `@available` 做运行时分支
- 内部类 / 私有 API 用 `NS_UNAVAILABLE` 防止误用

**陷阱**：
```
⚠️ 陷阱 1：@available 块不能包含 init 调用
   错误：if (@available(iOS 15, *)) { obj = [[NewClass alloc] init]; }
   正确：if (@available(iOS 15, *)) { obj = [NewClass new]; }
         或在 else 分支中显式设置 obj = nil / fallback

⚠️ 陷阱 2：API_AVAILABLE 只影响编译检查，不阻止运行时
   在 iOS 14 设备上运行 iOS 15 构建的 app 不会崩溃
   （只要 dyld 版本允许加载）

⚠️ 陷阱 3：#pragma clang attribute push/pop 范围控制
   大段代码中使用旧 API 时的抑制警告技巧：

#pragma clang attribute push(__attribute__((availability(ios, deprecated=16.0, message="Legacy API"))) , apply_to=function)
- (void)oldMethod;  // 临时恢复旧 API
#pragma clang attribute pop
```

### NSRange / NSRangeOverflowException

`NSRange` 是 Foundation 中最基础的位置-长度结构体，广泛用于字符串、数组、数据等的子范围操作。它在 64 位系统中使用 `NSUInteger`（64 位），在 32 位系统中使用 `unsigned int`（32 位），定义在 `<Foundation/NSRange.h>` 中。

```objc
// NSRange 基本结构
NSRange range = NSMakeRange(2, 3);        // location=2, length=3
NSRange another = {5, 0};                   // C struct 直接初始化

// 常用宏和函数
NSLocationInRange(0, range);               // 判断位置是否在范围内
NSMaxRange(range);                          // location + length = 5
NSEqualRanges(range, another);             // 判断两个 range 是否相等

// 常见崩溃：NSRangeException
NSArray *arr = @[@1, @2];
[arr objectsInRange:NSMakeRange(0, 10)];    // 💥 NSRangeException
// 错误：Range {0, 10} exceeds bounds of array of size 2
```

**坑**：`NSLocationInRange` 行为违反直觉——当 `location < range.location` 时也返回 NO，不等于简单的 `location < NSMaxRange(range)` 在所有边界情况下都成立。

**最佳实践**：始终在使用 `NSRange` 前检查 bounds，或用 `NSRangeIntersection` / clamp 模式裁剪输入范围，避免越界访问。

### OC 1.0 协议（现代协议与关联类型的替代方案）

Objective-C 的 `@protocol` 系统提供了面向接口编程的能力。OC 1.0 协议是最早的正式协议机制，支持必需方法与可选方法（`@optional`）。现代开发中，OC 协议无法表达 Swift 的关联类型（`associatedtype`），常用泛型包装类作为替代方案。

```objc
// 协议定义：必需 + 可选
@protocol DataFetcher <NSObject>
- (void)fetchData:(void (^)(NSData *data))completion;  // 必需
@optional
- (NSString *)requestDescription;                        // 可选
@end

// 类遵守协议
@interface NetworkService : NSObject <DataFetcher>
@end

// 运行时检查协议合规
if ([obj conformsToProtocol:@protocol(DataFetcher)]) {
    if ([obj respondsToSelector:@selector(requestDescription)]) {
        NSLog(@"Description: %@", [obj requestDescription]);
    }
}
```

**陷阱**：`@optional` 方法在编译时不会检查实现，直接调用未实现的 optional 方法会导致崩溃，必须先通过 `respondsToSelector:` 检查。

**最佳实践**：优先使用协议组合而非继承链，对于需要关联类型的场景，使用泛型类包装或提前在协议中约定具体类型。

### 轻量泛型（NSArray<NSString *>），编译期约束 vs 运行时行为

Objective-C 1.0 引入了轻量级泛型语法，允许在集合类型上声明元素类型约束（如 `NSArray<NSString *>`）。这种泛型是**纯编译期特性**——clang 会进行类型检查并生成警告，但运行时没有任何泛型信息保留（完全依赖于 Objective-C 的 runtime 类型擦除）。

```objc
// 编译期泛型约束
NSArray<NSString *> *names = @[@"Alice", @"Bob"];
NSString *first = names[0];           // ✅ 编译器知道元素是 NSString *
NSNumber *bad = names[0];             // ⚠️ Incompatible pointer types

// 运行时泛型信息完全丢失
NSLog(@"%@", [names class]);           // __NSArrayI（无泛型信息）
id raw = names;
[raw addObject:@42];                   // ✅ 运行时静默通过！破坏了类型安全

// 泛型与 NSException 的协作
@try {
    NSArray<NSNumber *> *nums = @[ @1, @2, @"oops" ];
} @catch (NSException *e) {
    // 编译期无法检测运行时插入的错误类型
}
```

**陷阱**：泛型约束在 bridged 桥接操作（`NSArray<NSString *>` ↔ `const char **`）中完全失效，桥接转换不执行运行时类型检查。

**最佳实践**：将泛型视为编译期辅助工具而非运行时保证，对来自外部来源（UserDefaults、解档、桥接C API）的数据始终手动验证类型。
### _Nullable、_Nonnull、_Null_unspecified 可空性注解及桥接规则

LLVM 注解系统为 Objective-C 指针提供编译期可空性检查。`_Nullable` 表示指针可能为 nil，`_Nonnull` 表示永远不会为 nil，`_Null_unspecified` 用于无法确定可空性的边界接口（如 C API 桥接点）。这些注解在运行时完全不存在——被编译器擦除，零运行时开销。

```objc
// 基本注解使用
- (nullable NSString *)findName:(nonnull NSString *)key;
- (void)setName:(nullable NSString *)name;  // name 可以为 nil

// 桥接 C API 时使用 _Null_unspecified
extern char *CFGetDisplayName(CFStringRef name); // Null_unspecified

// null_unspecified 与 nullable 混用
- (nullable id)getValue:(nonnull NSString *)key NS_RETURNS_RETAINED;

// 块参数注解
typedef void (^CompletionBlock)(nullable id result, NSError * _Nullable error);
```

**陷阱**：将 `_Nullable` 值传入 `_Nonnull` 参数仅产生**警告**而非错误，且 `-Wnullability` 需手动开启，默认不启用完整检查。忽略警告可能导致传入 nil 后崩溃。

**最佳实践**：在所有公共 API 上标注可空性，启用 `-Wnullability` 并将警告视为错误，对 C API 边界始终使用 `_Null_unspecified` 以避免过度约束。

### NS_DESIGNATED_INITIALIZER 指定初始化器模式

在 Objective-C 中，每个类应明确声明一个**指定初始化器**（designated initializer），所有其他便捷初始化器最终必须链式调用它。使用 `NS_DESIGNATED_INITIALIZER` 宏标记后，编译器会强制检查初始化链的完整性，防止漏调或错误的初始化路径。

```objc
@interface Config : NSObject
- (instancetype)initWithHost:(NSString *)host port:(NSInteger)port NS_DESIGNATED_INITIALIZER;
@end

@interface ServerConfig : Config
- (instancetype)initWithHost:(NSString *)host port:(NSInteger)port ssl:(BOOL)ssl NS_DESIGNATED_INITIALIZER;
@end

@implementation ServerConfig
- (instancetype)initWithHost:(NSString *)host port:(NSInteger)port ssl:(BOOL)ssl {
    self = [super initWithHost:host port:port];  // ✅ 链式调用父类 designated
    if (self) { _ssl = ssl; }
    return self;
}
// ⚠️ 未重写父类的 designated → 编译器直接报错！
@end

// 便捷初始化器转发到 designated
- (instancetype)initWithHost:(NSString *)host {
    return [self initWithHost:host port:8080 ssl:NO];
}
@end
```

**陷阱**：子类声明了不同的 designated initializer 但忘记调用父类的 designated，`NS_DESIGNATED_INITIALIZER` 会在编译期捕获此错误，但没有该宏时漏洞将静默存在。

**最佳实践**：每个类只声明一个 designated initializer，便捷初始化器一律通过参数默认值转发到它；子类 designated 必须调用父类 designated。

> **Swift 对比**：Swift 的 `required init` 对应 designated initializer，`convenience init` 对应便捷初始化器，`deferred init` 对应延迟初始化。Swift 编译器严格执行 Two-Phase Initialization（两阶段初始化）：第一阶段完成所有属性赋值，第二阶段调用 `self`。Swift 的子类必须 override 或显式实现父类的 designated initializer，比 Objective-C 的 NS_DESIGNATED_INITIALIZER 更安全且编译期检查更彻底。

### NS_UNAVAILABLE 与 NS_UNAVAILABLE 重载模式

`NS_UNAVAILABLE` 宏用于标记方法或类为不可用，在编译期阻止调用。它通过给方法添加 `unavailable` 属性实现，编译器会在调用点产生**错误**而非警告。与 `NS_DEPRECATED` 不同，`NS_UNAVAILABLE` 不留迁移窗口——调用即报错。

```objc
// 标记方法不可用
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;

// 子类禁用父类方法
- (void)isEqual:(id)obj NS_UNAVAILABLE;

// 重载模式：提供受限接口时禁用默认实现
@interface RestrictedCollection : NSCollection
- (id)objectAtIndexedSubscript:(NSUInteger)idx NS_UNAVAILABLE;
// 强制使用类型安全的访问方法
- (instancetype)typedObjectAtIndex:(NSUInteger)idx NS_RETURNS_RETAINED;
@end

// 禁止整个类实例化
@interface AbstractBase : NSObject
+ (instancetype)new NS_UNAVAILABLE;
- (instancetype)init NS_UNAVAILABLE;
@end
```

**陷阱**：`NS_UNAVAILABLE` 仅影响静态编译——通过 `performSelector:` 或 `objc_msgSend` 动态调用**完全绕过**此限制，运行时不会崩溃。仅依赖它做安全边界是危险的。

**最佳实践**：用 `NS_UNAVAILABLE` 禁用 `init`/`new` 来强制工厂方法模式，子类通过它重写父类 designated initializer 实现接口约束；运行时安全需额外检查。

> **Swift 对比**：Swift 的 `@available(*, unavailable)` 或 `@_disponible` 等价于 `NS_UNAVAILABLE`。Swift 的 `@available` 支持更精细的条件（如平台、版本），且 `required init` + `@available` 组合可实现更严格的抽象基类模式。

### @available / #unavailable API 可用性检查

`@available` 是 Objective-C 10+ 引入的现代可用性注解，用于在编译期检查 API 是否在指定平台版本中可用。它比传统的 `#ifdef __IPHONE_XX_0` 宏更精确，编译器可自动推断作用域并生成**警告**而非静默编译错误。

```objc
// 声明方法需要 iOS 14+
- (void)useModernAPI NS_AVAILABLE_IOS(14_0);

// 运行时检查（推荐组合使用）
if (@available(iOS 14, *)) {
    [self performModernAction];
} else {
    [self fallbackAction];
}

// 类级别可用性
@interface NewFeatureClass : NSObject NS_EXTENSION_UNAVAILABLE_IOS
@end
```

**陷阱**：`@available` 和 `NS_AVAILABLE_IOS` 仅在编译期生效，运行时调用旧设备不存在的 API 会直接 `EXC_BAD_ACCESS`。必须配合 `@available(iOS 14, *)` 运行时检查块使用，两者缺一不可。

**最佳实践**：声明期用 `NS_AVAILABLE_IOS(14_0)` 让编译器知道版本要求，调用期用 `@available(iOS 14, *)` 运行时守卫，双保险策略是 Apple 官方推荐做法。

> **Swift 对比**：Swift 的 `@available(iOS 14, *)` 语法几乎 1:1 对应 OC，但 Swift 编译器更严格——如果 `if @available` 分支调用了不兼容 API，编译器会产生错误而非警告。Swift 还额外支持 `#unavailable(iOS)` 用于条件编译排除。

#### NS_DEPRECATED 与渐进式弃用

`NS_DEPRECATED` 宏标记 API 已弃用但暂不删除，提供引入版本和弃用版本信息。编译器生成 **warning**（非 error），允许过渡期。

```objc
// 声明弃用：iOS 10.0 引入，iOS 13.0 弃用
- (void)oldMethod NS_DEPRECATED_IOS(10_0, 13_0, "useModernMethod");
- (void)modernMethod NS_AVAILABLE_IOS(13_0);

// 弃用 + 替代方案（推荐写法）
NS_CLASS_DEPRECATED_IOS(10_0, 13_0, "Use ModernClass instead")
@interface LegacyClass : NSObject @end
```

**陷阱**：弃用仅触发 warning，持续忽略不会导致编译失败。在 CI 中开启 `-Werror=deprecated-declarations` 可将警告升级为错误。

**最佳实践**：弃用消息必须包含替代 API 名称；长期弃用（1+ 大版本）使用 `NS_DEPRECATED`，立即移除使用 `NS_UNAVAILABLE`。

### NSRange / NSRangeOverflowException

`NSRange` 是 C 结构体 `{NSUInteger location, length}`，用于表示区间。当对 `NSString` 或 `NSArray` 使用超出边界的 `NSRange` 时触发 `NSRangeException`（如 `rangeBeyondBounds`）。Swift 的 `Range` 和 `ClosedRange` 在编译期就能捕获越界，而 OC 的 `NSRange` 只在运行时检查。

```objc
// 安全写法：先检查长度
NSString *text = @"hello";
NSRange search = [text rangeOfString:@"xyz"];
if (search.location != NSNotFound) {
    NSRange result = [text rangeOfString:@"he" options:0 range:search];
}

// 危险写法：直接截取导致 NSRangeException
NSRange bad = {0, 100}; // length 超过字符串长度
NSString *sub = [text substringWithRange:bad]; // 💥 NSRangeException

// 安全截取
NSRange safe = {0, MIN(bad.length, text.length)};
NSString *safeSub = [text substringWithRange:safe];
```

**陷阱**：`NSRange` 基于 UTF-16 码位索引，对包含 Emoji（如 🎉 占 2 个 UTF-16 码位）的字符串使用 `NSRange` 操作会拆字，导致 `CFString` 层崩溃或乱码。`NSString.length` 返回 UTF-16 码位计数而非字符数。

**最佳实践**：对含 Emoji 或组合字符的字符串，使用 `NSString.enumerateSubstringsInRange:options:usingBlock:` 而非 `NSRange` 算术运算；或在 Swift 中直接使用 `String.Index` 获得 Unicode 标量安全访问。

> **Swift 对比**：Swift 的 `String.Index` 基于 Unicode 标量扩展，天然支持 Emoji 和组合字符，`text[text.startIndex...text.endIndex]` 不会拆字。`NSRange` 与 `Range<String.Index>` 可通过 `NSRange(windowRange:range,in:text)` 双向转换，但转换过程可能因代理对计数产生偏移，需谨慎处理边界。

### NS_ASSUME_NONNULL_BEGIN / END 作用域可空性

`NS_ASSUME_NONNULL_BEGIN` / `NS_ASSUME_NONNULL_END` 是一对宏，在两者之间的所有 `id` 类型参数和返回值默认视为 **nonnull**，除非显式标注 `_Nullable`。这是 Apple 推荐的 Nullability 标注方式，大幅减少重复的 `_Nonnull` 书写。

```objc
NS_ASSUME_NONNULL_BEGIN

@interface UserManager : NSObject
@property (nonatomic, copy) NSString *username;        // 默认 nonnull
@property (nonatomic, strong) NSArray<NSDictionary *> *users; // 默认 nonnull
- (nullable NSString *)findById:(NSString *)id;        // 显式 nullable
- (void)fetchUserWithBlock:(void (^)(NSString *name, NSError * _Nullable *error))block;
@end

NS_ASSUME_NONNULL_END
```

**陷阱**：宏的作用域仅限单个 `.h` / `.m` 文件。如果忘记写 `NS_ASSUME_NONNULL_END`，后续所有声明都被错误假设，导致难以定位的空指针崩溃。更隐蔽的是拼写错误（如 `NS_ASSUME_NONNULL_UNKNOW`）不会报错——C 预处理器将其视为空宏。

**最佳实践**：始终成对使用 `BEGIN` / `END`，放在文件最外层；`nullable` 只标注真正可能返回 nil 的参数或返回值，其余依赖默认 nonnull。迁移旧代码时优先标注公共 API，内部方法渐进式添加。

### OC 字面量异常行为（@[].objectAtIndex: 崩溃 vs Swift 安全性）

OC 的字面量语法 `@[]`、`@{}`、`@""` 在编译时转换为对应的 Foundation 类初始化调用。但字面量在**运行时异常处理**上与手动创建有显著差异。`@[]` 创建的 NSArray 是不可变的，调用 `objectAtIndex:` 越界时直接触发 `NSRangeException` 崩溃，而手动 `[NSArray arrayWithObject:]` 的行为在某些旧 SDK 版本中可能返回 nil 而非崩溃（已修复但历史代码中常见不一致）。

```objc
// 字面量创建空数组，访问索引 0 -> 💥 NSRangeException
NSArray *empty = @[];
id obj = empty[0];  // 等价于 [empty objectAtIndex:0]，直接崩溃

// Swift 对比：数组下标越界同样崩溃，但编译期 Optional 包装可避免
let arr: [String] = []
let value = arr.first  // 返回 Optional<String>，nil 而非崩溃

// OC 安全访问：nil 数组调用任何方法返回 nil（nil messaging）
id nilArray = nil;
id result = nilArray[0];  // 💥 同样崩溃！字面量语法不走 nil messaging 路径
// 安全写法
id safeResult = nilArray ? nilArray[0] : nil;
```

**陷阱**：`array[index]` 语法糖等价于 `objectAtIndexedSubscript:`，不享受 nil 消息安全。当数组变量可能为 nil 时，使用下标语法会直接 SIGSEGV。

**最佳实践**：对可能 nil 的集合变量，始终使用 `count` 检查后再索引；或封装分类方法如 `-safeObjectAtIndex:` 替代下标语法；优先在 Swift 侧使用 Optional 链式访问（`arr?.first`）获得编译期安全保障。

### performSelector 内存安全警告（lint 警告，+doesNotRecognizeDynamicSelector）

`performSelector:` 系列方法是 Objective-C 动态消息转发的核心入口，但存在 **内存管理陷阱** 和 **静态分析警告**。现代 Xcode 启用 `-Wperform-selector` lint 检查后，硬编码 `@selector()` 会通过合法性验证，但 `performSelector:withObject:` 最多支持 **两个参数**，且返回值和参数都**不享受 ARC 自动管理**，需要手动 `retain`/`autorelease`。

```objc
// ⚠️ 警告：未通过 Lint 验证的 selector 在 App Store 审核中被 Apple 标记为潜在崩溃风险
[target performSelector:@selector(doTask:with:) withObject:arg1 withObject:arg2];

// ARC 下返回值自动释放，需手动 retain 防止悬空指针
__unused id result = [[target performSelector:@selector(fetchData)] retain];
NSLog(@"%@", result);
[result release];

// Swift 替代方案：使用 #selector 包裹 + sendAction 或直接闭包回调
let sel = #selector(target.doTask(_:with:))
target.perform(sel, with: arg1, with: arg2)
```

**陷阱**：`+doesNotRecognizeDynamicSelector` 是 iOS 15+ 引入的新机制，当类未实现某个 selector 时会直接调用此方法而非 `forwardTarget(for:)`，导致原有动态转发链断裂。遗留的 `performSelector:` 调用可能在 iOS 15+ 上静默失败。

**最佳实践**：新代码优先使用块回调（`void(^)(…)`）或 Swift `#selector` 语法替代 `performSelector:`，利用编译期检查替代运行时动态解析；必须使用时，配合 `@available(iOS 15, *)` 判断是否重写 `doesNotRecognizeDynamicSelector`。

### NS_EXTENSIBLE_CLASS_TYPE 与类簇

Objective-C 中某些 Foundation 类（如 `NSArray`、`NSString`、`NSNumber`）采用**类簇（Class Cluster）**设计模式。公开基类是抽象接口，实际返回的是私有子类实例。`NS_EXTENSIBLE_CLASS_TYPE` 标识了这些可被继承扩展的类类型，允许开发者在类簇中插入自定义子类。

```objc
// NSString 类簇：实际返回可能是 __NSCFConstantString、NSTaggedPointerString 等
NSString *str = @"Hello";
NSLog(@"%@", [str class]); // __NSCFConstantString

// 自定义类簇子类：重写 methodSwizzling 安全的初始化入口
@interface MyColor : UIColor
+ (instancetype)colorWithHue:(CGFloat)hue saturation:(CGFloat)sat brightness:(CGFloat)bri alpha:(CGFloat)alpha;
@end
@implementation MyColor
+ (instancetype)allocWithZone:(struct _NSZone *)zone {
    return [super allocWithZone:zone]; // 必须调用 super
}
- (instancetype)initWithCGColor:(CGColorRef)cgColor {
    self = [super initWithCGColor:cgColor];
    return self;
}
@end
// UIColor 是 NS_EXTENSIBLE_CLASS_TYPE，允许通过 alloc/init 创建自定义子类
MyColor *c = [[MyColor alloc] initWithCGColor:[[UIColor redColor] CGColor]];
```

**陷阱**：非 `NS_EXTENSIBLE_CLASS_TYPE` 的类（如 `NSDictionary`、`NSSet`）不允许直接 `alloc/init` 子类化，调用会返回 nil 或崩溃。类簇的私有子类实现细节随系统版本变化，不应依赖 `[obj class]` 做类型判断。

**最佳实践**：仅对明确标记为 extensible 的类簇基类进行子类化（UIColor、UIView、NSValue 等）；判断类型时始终使用 `-isKindOfClass:` 而非比较具体 class；优先通过公开 API 创建对象，让框架决定最优的私有子类实现。

#### Tagged Pointer 与类簇的内存优化

现代 Foundation 类簇大量使用 **Tagged Pointer** 技术：对于小数值对象（如短字符串、NSNumber 包装的 int/float），指针低 bit 标记类型，高 bit 直接存储值，完全避免堆分配。这使得 `@"Hello"` 或 `@(42)` 的创建成本接近原生类型。但 Tagged Pointer **不响应 `retain/release`**，也不走 ARC 计数路径，且在 `class` 查询时返回的是基类而非具体实现。

```objc
NSNumber *num = @42;
NSLog(@"%@", [num class]);         // NSTaggedNumber — iOS 13+
NSLog(@"%zu", [num retainCount]);  // 1（Tagged Pointer 的 retain 是空操作）

// 类簇内部选择：根据值范围和创建方式自动分配最优实现
NSNumber *bigNum = @(LLONG_MAX);   // 堆分配对象，非 Tagged Pointer
NSString *shortStr = @"Hi";         // Tagged Pointer（单字符/短串）
NSString *longStr = [NSString stringWithUTF8String:longCStr]; // 堆分配
```

**陷阱**：Tagged Pointer 对象传入 C API（如 Core Foundation Bridge）时，`CFGetTypeID()` 可能返回意外类型标识。使用 `CFBridgingRelease` 桥接 Tagged Pointer 到 Core Foundation 会触发内部转换而非简单的指针 casts，性能损失可达 10 倍。

**最佳实践**：高性能循环中避免频繁在 Tagged Pointer 和 Core Foundation 之间桥接；批量操作时优先使用 C 数组 + `NSNumber` 批量构造器（`+numbersWithObjects:count:`）减少对象创建开销；调试时打印 `_CFIsCollectable(obj)` 判断是否为 Tagged Pointer。


### ARM64 中 isa 的 MSR（内存共享识别）位

在 ARM64 的 non-pointer isa 实现中，`isa` 指针是一个 64 位的打包值，除了存储类指针地址外，还编码了多个元数据位。其中 **MSR（Memory Sharing Region，内存共享区域）位** 用于标识对象是否位于可共享内存页（JPAGE）中。当对象位于共享内存时，MSR 位被置位（1），runtime 据此跳过 `retainCount` 相关的引用计数操作。

```objc
// ARM64 non-pointer isa 结构（简化）
// bits  63       16-60       15        0
//  |      class pointer      | has_sidetable_rc | sidetable bits |

// isa 位掩码定义（ objc-config.h ）
#define ISA_MASK        0x0000000ffffffff8ULL
#define ISA_BITS        44  // class pointer 使用 44 位
#define ISA_NONPOINTER_SHIFT  3
#define ISA_NONPOINTER        (1UL << 0)  // bit 0: non-pointer 标志
#define ISA_DEALLOC           (1UL << 45) // dealloc 标志
#define ISA_HAS_CXX_DTOR      (1UL << 44) // C++ 析构器
#define ISA_REQUIRES_RR       (1UL << 43) // requires random routing
// MSR 位（bit 46，某些配置下）标识共享内存区域对象
#define ISA_INDEX_MASK     0x3fffffULL  // sidetable index

// 检查对象是否在共享内存页中
BOOL isSharedMemoryObject(id obj) {
    uintptr_t isa = (uintptr_t)obj->isa;
    // 在 non-pointer isa 模式下，MSR 通过 class 指针的内存布局间接判断
    // 实际实现：检查 class->instancesRequireRawIsa 或内存页属性
    return obj->isa.bits & ISA_MSB; // 简化示意
}
```

**陷阱**：共享内存中的对象（如 `JPager` 管理的只读数据）MSR 位被置位后，**完全不参与引用计数**——`retain`/`release` 成为空操作。对这类对象调用 `CFRetain()` 或手动 `retain` 不会增加引用计数，容易导致过早释放或内存损坏。

**最佳实践**：不要手动检查或修改 `isa` 的 MSR 位；使用 `object_setClass()` 时注意目标类是否位于共享内存页；对于系统框架返回的对象，始终信任其内存管理语义，不要假设 `retainCount` 返回值有意义。


### OC 字符串格式化性能（NSString vs NSMutableString vs NSMutableAttributedString）

在循环中拼接大量字符串时，`NSString` 的 `+stringWithFormat:` 每次都会创建不可变的新对象，产生大量临时分配。`NSMutableString` 通过 `-appendFormat:` 在预分配的缓冲区内追加，避免重复分配。对于需要展示样式的场景，`NSMutableAttributedString` 支持在构建阶段分步添加属性，避免每次都重新创建完整的属性字符串。

```objc
// ❌ 低效：每次循环创建新 NSString 对象
for (int i = 0; i < 1000; i++) {
    result = [NSString stringWithFormat:@"%@%d", result, i]; // 1000次 alloc
}

// ✅ 高效：NSMutableString 预分配 + 原地追加
NSMutableString *sb = [NSMutableString stringWithCapacity:5000];
for (int i = 0; i < 1000; i++) {
    [sb appendFormat:@"%d", i]; // 零临时对象
}

// ✅ AttributedString 分步构建
NSMutableAttributedString *attr = [[NSMutableAttributedString alloc] init];
[attr appendAttributedString:[[NSAttributedString alloc] initWithString:@"Hello "
                                                              attributes:@{NSForegroundColorAttributeName: [UIColor redColor]}]];
[attr appendAttributedString:[[NSAttributedString alloc] initWithString:@"World"
                                                              attributes:@{NSFontAttributeName: boldFont}]];
```

**陷阱**：`-stringWithCapacity:` 只是**提示**而非硬性预分配，Foundation 可能内部使用更小的初始缓冲区。`NSMutableString` 在调用 `CFCopyDescription` 或桥接到 `NSString` 时仍可能触发拷贝。

**最佳实践**：超大数据量拼接优先使用 `NSMutableData` + `CFStringCreateWithBytes` 或直接 C API；`appendFormat` 格式字符串避免使用 `%@`（触发 `description` 调用链开销）；循环内始终使用 `NSMutableString` 而非反复 `stringWithFormat`。


### NSScanner 用法与模式

NSScanner 是 Foundation 提供的字符串扫描器，用于从左到右逐段解析结构化文本。相比正则表达式，它在解析固定格式的文本（如 CSV、简单协议、URL 路径参数）时性能更优且更可读。核心 API 包括 `scanInt:`, `scanString:into:`, `scanUpToString:into:` 等，每个方法内部维护扫描位置索引。

```objc
NSScanner *scanner = [NSScanner scannerWithString:@"key=value;name=test;count=42"];
NSString *key = nil, *value = nil;
NSInteger count = 0;

while (![scanner isAtEnd]) {
    [scanner scanUpToString:@"=" intoString:&key];   // 扫描到 '='
    [scanner scanString:@"=" intoString:nil];         // 跳过 '='
    [scanner scanUpToString:@";" intoString:&value];  // 扫描到 ';'
    if (value) {
        NSLog(@"%@ => %@", key, value);
    }
    [scanner scanString:@";" intoString:nil];         // 跳过 ';'
}

// 常用便捷方法
[scanner scanInt:&count];
[scanner scanDouble:&d];
[scanner scanHexInt:&hex];
[scanner scanBoolean:&flag]; // YES/no, TRUE/FALSE, 1/0
```

**陷阱**：`scanUpToString:into:` 在遇到结束符时会**丢弃该分隔符**，需要手动 `scanString:` 跳过；若输入格式不匹配（如 `scanInt` 遇到非数字），方法返回 `NO` 且扫描位置停在失败点，不会自动跳过。

**最佳实践**：解析前调用 `setCharactersToBeSkipped:nil` 禁用默认的空白字符跳过（处理含空白的结构化文本时关键）；长文本解析优先 NSScanner 而非正则（避免灾难性回溯）；始终检查每个 `scan*` 的返回值。

### NSDecimalNumber vs NSNumber 用于金融计算

NSDecimalNumber 是 Foundation 中专为精确十进制运算设计的类，内部使用 BSDAarithmetic 格式存储，**完全避免 IEEE 754 浮点精度损失**。NSNumber 在包装 float/double 时会产生舍入误差（如 0.1 + 0.2 != 0.3），在金融、货币、税务计算中是灾难性的。

```objc
// ❌ 精度丢失：double 无法精确表示 0.1
NSLog(@"%f", (@0.1 + @0.2).doubleValue); // 0.30000000000000004

// ✅ NSDecimalNumber 精确计算
NSDecimalNumberHandler *behavior = [NSDecimalNumberHandler
    decimalHandlerWithRoundingMode: NSRoundBankers
                      scale: 2
                 raiseOnExactness: NO
                    raiseOnOverflow: NO
                   raiseOnUnderflow: NO
                  raiseOnDivideByZero: YES];

NSDecimalNumber *price = [NSDecimalNumber decimalNumberWithString:@"19.99"];
NSDecimalNumber *tax = [NSDecimalNumber decimalNumberWithString:@"1.27"];
NSDecimalNumber *total = [price decimalNumberByAdding: tax
                                   withBehavior: behavior];
NSLog(@"%@", total); // 21.26，精确无舍入

// 禁止使用：@19.99（字面量是 double 转换，已丢精度）

### NSNotFound 哨兵模式

NSNotFound 是 Foundation 中广泛使用的**哨兵值**（sentinel value），定义为 `NSUIntegerMax`（即 `NSUInteger` 的最大值）。它作为 `-indexOfObject:`、`rangeOfString:`、`NSRange.location` 等特殊返回值的约定，表示"未找到"。这是一种 C 语言级别的模式——用不可能出现的合法值作为错误信号，避免了额外的布尔标志或 Optional 包装。

```objc
// NSNotFound == NSUIntegerMax == 18446744073709551615 (64-bit)
NSArray *arr = @[@1, @2, @3];
NSUInteger idx = [arr indexOfObject:@99];
if (idx == NSNotFound) {
    NSLog(@"未找到对象");
}

// NSRange 中的使用
NSString *text = @"hello world";
NSRange range = [text rangeOfString:@"xyz"];
if (range.location == NSNotFound) {
    NSLog(@"子串不存在");
}

// 错误用法：NSInteger 接收 NSNotFound 导致未定义行为
NSInteger bad = [arr indexOfObject:@99]; // ⚠️ 有符号/无符号转换
```

**陷阱**：`NSNotFound` 是 `NSUInteger` 类型而非 `NSInteger`，与 `NSInteger` 比较时触发有符号/无符号转换警告且可能产生未定义行为；切勿将 `NSNotFound` 直接赋值给 `NSInteger` 变量。

**最佳实践**：统一使用 `NSUInteger` 类型存储索引结果，配合 `== NSNotFound` 判断；在 Swift 混编中，Foundation 会自动将 `NSNotFound` 桥接为 `nil`（Optional），利用 Swift 的可选链式调用替代哨兵检查更安全。
