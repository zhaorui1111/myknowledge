# Objective-C 消息机制与 Runtime 详解

---

## 一、消息机制的本质

### 1.1 方法调用 ≠ 函数调用

```objc
// ObjC 的方法调用是"消息发送"，不是函数调用
[person sayHello];

// 编译器将其翻译为：
objc_msgSend(person, @selector(sayHello));

// 带参数的：
[person setName:@"张三" age:25];
// → objc_msgSend(person, @selector(setName:age:), @"张三", 25)
```

```
C++ 函数调用（编译期确定）：
    编译 → 直接跳转到函数地址（静态绑定）

ObjC 消息发送（运行时确定）：
    编译 → objc_msgSend(receiver, selector, ...)
         → 运行时查找方法实现（动态绑定）
         → 跳转到对应 IMP
```

### 1.2 objc_msgSend 的执行流程

```
objc_msgSend(receiver, selector, ...)
│
├── 1. 检查 receiver 是否为 nil
│     ├── nil → 返回 0/nil（消息发送给 nil 安全）
│     └── 非 nil → 继续
│
├── 2. 在 receiver 的类对象中查找方法
│     ├── 缓存查找（方法缓存列表）
│     │     └── 命中 → 跳转到 IMP
│     ├── 当前类的方法列表查找
│     │     └── 命中 → 跳转到 IMP，加入缓存
│     └── 父类方法列表逐级查找
│           ├── 命中 → 跳转到 IMP，加入缓存
│           └── 直到 NSObject 仍未找到 → 进入消息转发
│
└── 3. 消息转发（三步补救）
      ├── resolveInstanceMethod / resolveClassMethod
      ├── forwardingTargetForSelector
      └── forwardInvocation
```

---

## 二、Runtime 核心数据结构

### 2.1 objc_object（对象）

```c
// ObjC 对象的底层结构
struct objc_object {
    isa_t isa;  // 指向类对象的指针
};

// isa 的位域（ARM64，64 位）
// nonpointer = 1: 优化过的 isa
// shiftcls: 类对象的地址（33 位）
// extra_rc: 额外引用计数（8 位，存不下的部分在 SideTable 中）
// has_sidetable_rc: 引用计数是否溢出到 SideTable
// weakly_referenced: 是否有 weak 引用
// deallocating: 是否正在释放
```

```
ARM64 isa 位域分布（64 位）：

  63        55   52   49   46   44   43   36   35   32   31            0
  ┌─────────┬────┬────┬────┬────┬────┬────┬────┬────┬─────────────────┐
  │  ISA_MAGIC  │non-│has_│has_│shif│ M  │weak│dea-│has_sidetable_│extra_rc│
  │  _MASK   │ptr │assoc│cxx │tcls│ AG│ref │lloc│    rc        │        │
  └─────────┴────┴────┴────┴────┴────┴────┴────┴────┴─────────────────┘
```

### 2.2 objc_class（类）

```c
// ObjC 类的底层结构
struct objc_class : objc_object {
    isa_t isa;              // 指向元类（metaclass）
    Class superclass;       // 指向父类
    cache_t cache;          // 方法缓存
    class_data_bits_t bits; // 指向 class_rw_t
};

// class_rw_t（可读写数据，运行时生成）
struct class_rw_t {
    uint32_t flags;
    const class_ro_t *ro;        // 指向只读数据
    method_array_t methods;      // 方法列表
    property_array_t properties; // 属性列表
    protocol_array_t protocols;  // 协议列表
    Class firstSubclass;
    Class nextSiblingClass;
};

// class_ro_t（只读数据，编译期确定）
struct class_ro_t {
    const char *name;                  // 类名
    const method_list_t *baseMethods;  // 基础方法列表
    const protocol_list_t *baseProtocols;
    const ivar_list_t *ivars;          // 实例变量列表
    const property_list_t *baseProperties;
};
```

### 2.3 类对象、元类与继承链

```
                    ┌─────────────┐
                    │  NSObject   │
                    │  meta class │
                    │   (root)    │
                    └──────┬──────┘
                           │ isa 指向自己
                    ┌──────▼──────┐
                    │  NSObject   │
                    │ meta class  │←── root metaclass 的 isa 指向自己
                    │   (root)    │
                    └──────┬──────┘
                           │ superclass
         ┌─────────────────┴─────────────────┐
         │                                   │
  ┌──────▼──────┐                     ┌──────▼──────┐
  │  Person     │                     │   Animal    │
  │  meta class │                     │  meta class │
  └──────┬──────┘                     └──────┬──────┘
         │ isa                                │ isa
  ┌──────▼──────┐                     ┌──────▼──────┐
  │   Person    │                     │   Animal    │
  │  (class)    │                     │  (class)    │
  └──────┬──────┘                     └──────┬──────┘
         │ isa                                │ isa
  ┌──────▼──────┐                     ┌──────▼──────┐
  │   Person    │                     │   Animal    │
  │  instance   │                     │  instance   │
  └─────────────┘                     └─────────────┘

核心规则：
1. instance 的 isa   → class（类对象）
2. class 的 isa      → metaclass（元类）
3. metaclass 的 isa  → root metaclass
4. root metaclass 的 isa → 自己
5. class 的 superclass → 父 class
6. metaclass 的 superclass → 父 metaclass
7. root metaclass 的 superclass → root class（NSObject）

实例方法存在 class 的 method_list 中
类方法存在 metaclass 的 method_list 中
```

### 2.4 Method / Ivar / Property / Category

```c
// 方法
struct method_t {
    SEL name;           // 方法选择器
    const char *types;  // 类型编码（返回值+参数类型）
    MethodListIMP imp;  // 方法实现函数指针
};

// 实例变量
struct ivar_t {
    int32_t *offset;
    const char *name;
    const char *type;
    uint32_t alignment_raw;
    uint32_t size;
};

// 属性
struct property_t {
    const char *name;
    const char *attributes;
};

// 分类
struct category_t {
    const char *name;
    classref_t cls;
    struct method_list_t *instanceMethods;   // 实例方法
    struct method_list_t *classMethods;      // 类方法
    struct protocol_list_t *protocols;
    struct property_list_t *instanceProperties;
};
```

---

## 三、方法查找流程详解

### 3.1 缓存查找（cache_t）

```c
// cache_t 结构
struct cache_t {
    struct bucket_t *_buckets;  // 哈希桶数组
    mask_t _mask;               // 哈希掩码（桶数量-1）
    mask_t _occupied;           // 已占用数量
};

// bucket_t 结构
struct bucket_t {
    cache_key_t _key;  // SEL（方法选择器）
    IMP _imp;          // 方法实现
};

// 查找过程：
// 1. 用 SEL 计算哈希值：index = _mask & SEL
// 2. 在 _buckets[index] 处查找
// 3. 命中 → 返回 IMP
// 4. 未命中 → 哈希冲突，线性探测（index-1），循环查找
// 5. 遇到空桶 → 缓存未命中，进入方法列表查找

// 缓存扩容：occupied > 3/4 capacity 时扩容为原来的 2 倍
// 扩容时丢弃旧缓存（不复制），重新从方法列表查找填充
```

### 3.2 方法列表查找

```c
// 在 class_rw_t 的 methods 中查找
// methods 是二维数组（因为 Category 会追加方法列表）

// 查找过程：
// 1. 遍历 methods 中的每个 method_list_t
// 2. 已排序：二分查找 findSortedMethod()
//    未排序：线性查找 findMethodInUnsortedList()
// 3. 找到后返回 method_t，获取 IMP
// 4. 将结果写入缓存

// ⚠️ Category 方法在 methods 数组的前面（先被遍历到）
// 所以 Category 方法会"覆盖"同名原类方法
// 实际上原类方法仍在列表中，只是查找靠后
```

### 3.3 完整查找流程图

```
objc_msgSend(receiver, sel)
     │
     ▼
 receiver == nil? ──YES──→ return 0
     │
     NO
     ▼
 查 receiver->isa (class) 的 cache
     │
     ├─ 命中 → return IMP
     │
     └─ 未命中
         ▼
     查 class 的 method_list（含 Category 方法）
         │
         ├─ 命中 → cache_fill → return IMP
         │
         └─ 未命中
             ▼
         查 superclass 的 cache → method_list
             │
             ├─ 命中 → return IMP
             │
             └─ 逐级向上直到 NSObject 仍未找到
                     │
                     ▼
                 ┌──────────────────┐
                 │   消息转发流程    │
                 └──────────────────┘
```

---

## 四、消息转发机制

### 4.1 三步转发流程

```
消息发送失败（方法未找到）
         │
         ▼
┌─────────────────────────────────┐
│ 第1步：动态方法解析              │
│ +resolveInstanceMethod:         │
│ +resolveClassMethod:            │
│ → 返回 YES 表示已添加方法       │
│ → Runtime 重新走一遍查找流程    │
└──────────┬──────────────────────┘
           │ 返回 NO
           ▼
┌─────────────────────────────────┐
│ 第2步：备用接收者                │
│ -forwardingTargetForSelector:   │
│ → 返回能处理该消息的对象        │
│ → Runtime 直接向该对象发消息    │
└──────────┬──────────────────────┘
           │ 返回 nil
           ▼
┌─────────────────────────────────┐
│ 第3步：完整消息转发              │
│ -methodSignatureForSelector:    │
│ -forwardInvocation:             │
│ → 可以修改目标/方法/参数后转发  │
└──────────┬──────────────────────┘
           │ 仍未处理
           ▼
┌─────────────────────────────────┐
│ doesNotRecognizeSelector:       │
│ → 崩溃！unrecognized selector   │
│   sent to instance              │
└─────────────────────────────────┘
```

### 4.2 第1步：动态方法解析

```objc
// 适合场景：@dynamic 属性、动态添加方法
@interface Person : NSObject
@property (nonatomic, copy) NSString *name;
@dynamic name;  // 告诉编译器 getter/setter 运行时提供
@end

@implementation Person

+ (BOOL)resolveInstanceMethod:(SEL)sel {
    if (sel == @selector(setName:)) {
        class_addMethod(self, sel, (IMP)setNameIMP, "v@:@");
        return YES;  // 已添加方法，Runtime 重新查找
    }
    if (sel == @selector(name)) {
        class_addMethod(self, sel, (IMP)getNameIMP, "@@:");
        return YES;
    }
    return [super resolveInstanceMethod:sel];
}

// C 函数实现（self + _cmd 是隐藏参数）
void setNameIMP(id self, SEL _cmd, NSString *name) {
    objc_setAssociatedObject(self, "nameKey", name, OBJC_ASSOCIATION_COPY_NONATOMIC);
}

NSString *getNameIMP(id self, SEL _cmd) {
    return objc_getAssociatedObject(self, "nameKey");
}

@end
```

### 4.3 第2步：备用接收者

```objc
// 适合场景：将消息转发给另一个对象处理（模拟多继承）
@interface Proxy : NSObject
- (void)forwardMethod;
@end

@implementation Proxy
- (void)forwardMethod {
    NSLog(@"Proxy 处理了 forwardMethod");
}
@end

@interface MyClass : NSObject
@end

@implementation MyClass

- (id)forwardingTargetForSelector:(SEL)aSelector {
    if (aSelector == @selector(forwardMethod)) {
        return self.proxy;  // 返回能处理该消息的对象
    }
    return [super forwardingTargetForSelector:aSelector];  // nil → 进入第3步
}

@end

// ⚠️ 此方式无法修改消息内容（selector/参数），只能原样转发
// ⚠️ 不会触发第3步的 forwardInvocation
```

### 4.4 第3步：完整消息转发

```objc
// 适合场景：需要修改消息内容（目标/方法/参数）后转发
@implementation MyClass

// 1. 返回方法签名（必须实现，否则不会调用 forwardInvocation）
- (NSMethodSignature *)methodSignatureForSelector:(SEL)aSelector {
    NSMethodSignature *sig = [super methodSignatureForSelector:aSelector];
    if (!sig) {
        sig = [self.proxy methodSignatureForSelector:aSelector];
    }
    return sig;
}

// 2. 转发 invocation
- (void)forwardInvocation:(NSInvocation *)anInvocation {
    SEL sel = anInvocation.selector;
    if ([self.proxy respondsToSelector:sel]) {
        // 直接转发给 proxy
        [anInvocation invokeWithTarget:self.proxy];
    } else {
        // 可以修改目标、方法、参数
        // [anInvocation setSelector:@selector(differentMethod)];
        // [anInvocation setArgument:&newArg atIndex:2];
        // [anInvocation invokeWithTarget:otherTarget];
        [super forwardInvocation:anInvocation];
    }
}

@end
```

### 4.5 NSInvocation 详解

```objc
// NSInvocation 封装了一个完整消息：target + selector + 参数 + 返回值

// 创建
NSMethodSignature *sig = [target methodSignatureForSelector:@selector(addNumber:toNumber:)];
NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
[inv setTarget:target];
[inv setSelector:@selector(addNumber:toNumber:)];

// 设置参数（index 从 2 开始：0=self, 1=_cmd）
NSInteger a = 3, b = 5;
[inv setArgument:&a atIndex:2];
[inv setArgument:&b atIndex:3];

// 执行
[inv invoke];

// 获取返回值
NSInteger result;
[inv getReturnValue:&result];  // result = 8
```

### 4.6 消息转发的典型应用

```objc
// 应用1：NSProxy 实现弱引用代理（解决 Timer 循环引用）
@interface WeakProxy : NSProxy
@property (nonatomic, weak) id target;
@end

@implementation WeakProxy
- (instancetype)initWithTarget:(id)target {
    _target = target;
    return self;
}

// NSProxy 的消息转发直接走第2步（跳过 resolve）
- (id)forwardingTargetForSelector:(SEL)sel {
    return self.target;  // nil 时消息发给 nil，安全
}

- (NSMethodSignature *)methodSignatureForSelector:(SEL)sel {
    return [self.target methodSignatureForSelector:sel];
}

- (void)forwardInvocation:(NSInvocation *)invocation {
    [invocation invokeWithTarget:self.target];
}
@end

// 应用2：多继承效果
@interface MultiDelegate : NSObject
@property (nonatomic, strong) NSHashTable<id> *delegates;  // 弱引用集合
@end

@implementation MultiDelegate
- (NSMethodSignature *)methodSignatureForSelector:(SEL)aSelector {
    for (id delegate in self.delegates) {
        if ([delegate respondsToSelector:aSelector]) {
            return [delegate methodSignatureForSelector:aSelector];
        }
    }
    return [super methodSignatureForSelector:aSelector];
}

- (void)forwardInvocation:(NSInvocation *)anInvocation {
    for (id delegate in self.delegates) {
        if ([delegate respondsToSelector:anInvocation.selector]) {
            [anInvocation invokeWithTarget:delegate];
        }
    }
}
@end
```

---

## 五、Method Swizzling

### 5.1 基本用法

```objc
#import <objc/runtime.h>

@implementation UIViewController (Tracking)

+ (void)load {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        Class cls = [self class];

        SEL originalSel = @selector(viewWillAppear:);
        SEL swizzledSel = @selector(swizzled_viewWillAppear:);

        Method originalMethod = class_getInstanceMethod(cls, originalSel);
        Method swizzledMethod = class_getInstanceMethod(cls, swizzledSel);

        // ⚠️ 关键：先尝试添加，避免父类方法被替换
        BOOL didAddMethod = class_addMethod(cls,
                                            originalSel,
                                            method_getImplementation(swizzledMethod),
                                            method_getTypeEncoding(swizzledMethod));

        if (didAddMethod) {
            // 当前类没有原方法实现（继承自父类），已添加成功
            // 将 swizzled_sel 指向父类的实现
            class_replaceMethod(cls,
                                swizzledSel,
                                method_getImplementation(originalMethod),
                                method_getTypeEncoding(originalMethod));
        } else {
            // 当前类已实现该方法，直接交换 IMP
            method_exchangeImplementations(originalMethod, swizzledMethod);
        }
    });
}

- (void)swizzled_viewWillAppear:(BOOL)animated {
    // 此时 swizzled_viewWillAppear 的 IMP 已经是原来的 viewWillAppear
    // 所以不会死循环
    [self swizzled_viewWillAppear:animated];
    NSLog(@"%@ viewWillAppear", self);
}

@end
```

### 5.2 为什么必须用 class_addMethod 判断？

```
场景：UIViewController 有 viewWillAppear:
      子类 MyVC 没有重写 viewWillAppear:

直接 method_exchangeImplementations：
  class_getInstanceMethod(MyVC, @selector(viewWillAppear:))
  → 返回的是 UIViewController 的 Method（因为 MyVC 没有）
  交换后：UIViewController 的 viewWillAppear 被替换！
  → 所有 ViewController 的 viewWillAppear 都受影响 ❌

先 class_addMethod：
  1. 给 MyVC 添加 viewWillAppear:（IMP 为 swizzled 实现）
  2. 添加成功 → 说明 MyVC 原本没有这个方法
  3. 用 class_replaceMethod 将 swizzled_sel 指向父类实现
  → 只影响 MyVC，不影响父类 ✅
```

### 5.3 Swizzle 的 AOP 实战

```objc
// 页面统计埋点
@implementation UIViewController (Analytics)

+ (void)load {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        [self swizzleInstanceMethod:@selector(viewWillAppear:)
                          withMethod:@selector(analytics_viewWillAppear:)];
        [self swizzleInstanceMethod:@selector(viewWillDisappear:)
                          withMethod:@selector(analytics_viewWillDisappear:)];
    });
}

- (void)analytics_viewWillAppear:(BOOL)animated {
    [self analytics_viewWillAppear:animated];  // 调用原实现
    [AnalyticsManager trackPageEnter:NSStringFromClass([self class])];
}

- (void)analytics_viewWillDisappear:(BOOL)animated {
    [self analytics_viewWillDisappear:animated];  // 调用原实现
    [AnalyticsManager trackPageLeave:NSStringFromClass([self class])];
}

// 封装安全 Swizzle 方法
+ (void)swizzleInstanceMethod:(SEL)origSel withMethod:(SEL)newSel {
    Method orig = class_getInstanceMethod(self, origSel);
    Method new  = class_getInstanceMethod(self, newSel);
    BOOL added = class_addMethod(self, origSel,
                                  method_getImplementation(new),
                                  method_getTypeEncoding(new));
    if (added) {
        class_replaceMethod(self, newSel,
                            method_getImplementation(orig),
                            method_getTypeEncoding(orig));
    } else {
        method_exchangeImplementations(orig, new);
    }
}

@end
```

### 5.4 Swizzle 最佳实践

```objc
// 1. 只在 +load 中执行（不推荐 +initialize）
//    +load：每个类加载时调用一次，不会被子类触发
//    +initialize：首次使用时调用，子类未实现时会调用父类的

// 2. 使用 dispatch_once 防止重复执行
static dispatch_once_t onceToken;
dispatch_once(&onceToken, ^{ ... });

// 3. 方法命名规范：swizzled_ 前缀或项目前缀
- (void)swizzled_viewWillAppear:(BOOL)animated;
- (void)xx_viewWillAppear:(BOOL)animated;

// 4. 多个 Swizzle 执行顺序（栈式，后进先出）
// A swizzle method1 → method1 = A.wrap → 原method1
// B 再 swizzle method1 → method1 = B.wrap → A.wrap → 原method1
// 调用 method1 时：B的代码 → A的代码 → 原方法

// 5. 不要 swizzle 父类方法来影响子类（用 class_addMethod 判断）

// 6. 注意死循环：swizzled 方法中调用自己要用 swizzled 名，不能用原名
```

---

## 六、动态特性

### 6.1 动态添加方法

```objc
@interface DynamicClass : NSObject
@end

@implementation DynamicClass

+ (BOOL)resolveInstanceMethod:(SEL)sel {
    if (sel == @selector(hello)) {
        class_addMethod(self, sel, (IMP)helloIMP, "v@:");
        return YES;
    }
    return [super resolveInstanceMethod:sel];
}

// C 函数：self = 消息接收者, _cmd = 方法选择器
void helloIMP(id self, SEL _cmd) {
    NSLog(@"Hello from dynamically added method!");
}

@end

DynamicClass *obj = [[DynamicClass alloc] init];
[obj hello];  // 第一次：触发 resolve → 添加方法 → 执行
[obj hello];  // 第二次：直接走缓存
```

### 6.2 关联对象（Associated Objects）

```objc
// 分类中添加"属性"
@interface NSObject (Tag)
@property (nonatomic, copy) NSString *tag;
@end

@implementation NSObject (Tag)

- (NSString *)tag {
    return objc_getAssociatedObject(self, _cmd);
}

- (void)setTag:(NSString *)tag {
    objc_setAssociatedObject(self,
                             @selector(tag),  // 用 selector 作 key
                             tag,
                             OBJC_ASSOCIATION_COPY_NONATOMIC);
}

@end

// 关联策略
// OBJC_ASSOCIATION_ASSIGN         — weak（不常用，对象释放不置 nil）
// OBJC_ASSOCIATION_RETAIN_NONATOMIC — strong nonatomic
// OBJC_ASSOCIATION_COPY_NONATOMIC   — copy nonatomic
// OBJC_ASSOCIATION_RETAIN           — strong atomic
// OBJC_ASSOCIATION_COPY             — copy atomic
```

### 6.3 关联对象的底层实现

```
AssociationsManager（全局管理器）
├── AssociationsHashMap（全局哈希表）
│   ├── Key: 对象地址（disguised_ptr_t）
│   └── Value: ObjectAssociationMap
│       ├── Key: 关联键（void *）
│       └── Value: ObjcAssociation
│           ├── policy: 关联策略
│           └── value: 关联的值
│
│ 示例：
│ 对象 A 的地址 → { @selector(tag) → (COPY, @"hello"),
│                    @selector(data) → (RETAIN, someObj) }
│ 对象 B 的地址 → { @selector(tag) → (RETAIN, @"world") }

对象 dealloc 时的清理：
1. 调用 _object_remove_assocations
2. 在 AssociationsHashMap 中找到该对象的所有关联
3. 根据 policy 释放（RETAIN/COPY 的值 release）
4. 从全局表中移除该对象的条目
5. 将 has_assoc 标志位清零
```

### 6.4 Runtime 遍历类信息

```objc
// 遍历实例变量
unsigned int count = 0;
Ivar *ivars = class_copyIvarList(cls, &count);
for (unsigned int i = 0; i < count; i++) {
    const char *name = ivar_getName(ivars[i]);
    const char *type = ivar_getTypeEncoding(ivars[i]);
    NSLog(@"%s (%s)", name, type);
}
free(ivars);

// 遍历方法
Method *methods = class_copyMethodList(cls, &count);
for (unsigned int i = 0; i < count; i++) {
    NSLog(@"%@", NSStringFromSelector(method_getName(methods[i])));
}
free(methods);

// 遍历属性
objc_property_t *props = class_copyPropertyList(cls, &count);
for (unsigned int i = 0; i < count; i++) {
    NSLog(@"%s (%s)", property_getName(props[i]), property_getAttributes(props[i]));
}
free(props);

// 遍历协议
Protocol * __unsafe_unretained *protocols = class_copyProtocolList(cls, &count);
for (unsigned int i = 0; i < count; i++) {
    NSLog(@"%@", NSStringFromProtocol(protocols[i]));
}
free(protocols);

// 实战：字典转模型
+ (instancetype)modelWithDict:(NSDictionary *)dict {
    id obj = [[self alloc] init];
    unsigned int count = 0;
    objc_property_t *props = class_copyPropertyList(self, &count);
    for (unsigned int i = 0; i < count; i++) {
        NSString *key = @(property_getName(props[i]));
        id value = dict[key];
        if (value) [obj setValue:value forKey:key];
    }
    free(props);
    return obj;
}
```

---

## 七、KVO 底层实现

### 7.1 KVO 的本质：ISA-Swizzling

```objc
// 添加 KVO 前
person → isa → Person class
                  └── setName: → Person 的 setName: IMP

// 添加观察者后
[person addObserver:self forKeyPath:@"name" options:NSKeyValueObservingNew context:nil];

person → isa → NSKVONotifying_Person（Runtime 动态创建的子类）
                  ├── setName: → _NSSetObjectValueAndNotify
                  │              (1) [self willChangeValueForKey:@"name"]
                  │              (2) 调用原 setName: IMP（通过 super）
                  │              (3) [self didChangeValueForKey:@"name"]
                  │              (4) 通知观察者 observeValueForKeyPath:...
                  ├── class → 返回 Person（伪装成原类，不暴露 KVO 子类）
                  ├── dealloc → 清理 KVO 相关信息
                  └── _isKVOA → YES（标记是 KVO 子类）
```

### 7.2 验证 KVO 底层

```objc
Person *p = [Person new];

// KVO 前
NSLog(@"%s", object_getClassName(p));  // "Person"

[p addObserver:self forKeyPath:@"name" options:NSKeyValueObservingNew context:nil];

// KVO 后
NSLog(@"%s", object_getClassName(p));  // "NSKVONotifying_Person"
NSLog(@"%@", [p class]);               // "Person"（Apple 故意隐藏！）

// 查看 KVO 子类的方法列表
unsigned int count = 0;
Method *methods = class_copyMethodList(object_getClass(p), &count);
for (unsigned int i = 0; i < count; i++) {
    NSLog(@"%@", NSStringFromSelector(method_getName(methods[i])));
}
// 输出：setName: / class / dealloc / _isKVOA
```

### 7.3 KVO 触发机制

```
自动触发（默认）：
  setter 调用时 → KVO 子类的 setName: → _NSSetObjectValueAndNotify
  → willChangeValueForKey: → 原实现 → didChangeValueForKey: → 通知观察者

手动触发：
  直接修改 ivar 不经过 setter 时，KVO 不会触发
  需要手动调用 willChangeValueForKey: / didChangeValueForKey:
```

```objc
// 禁用自动触发
+ (BOOL)automaticallyNotifiesObserversForKey:(NSString *)key {
    if ([key isEqualToString:@"name"]) return NO;
    return [super automaticallyNotifiesObserversForKey:key];
}

// 手动触发
- (void)updateName:(NSString *)name {
    [self willChangeValueForKey:@"name"];
    _name = name;
    [self didChangeValueForKey:@"name"];
}
```

### 7.4 KVO 的依赖键

```objc
// 间接依赖：fullName 依赖 firstName 和 lastName
+ (NSSet<NSString *> *)keyPathsForValuesAffectingFullName {
    return [NSSet setWithObjects:@"firstName", @"lastName", nil];
}

// 观察 fullName 时，firstName 或 lastName 变化也会触发
[person addObserver:self forKeyPath:@"fullName" options:0 context:nil];
```

---

## 八、KVC 底层实现

### 8.1 setValue:forKey: 查找顺序

```
setValue:forKey:@"name"

1. 查找 setter 方法（按优先级）
   ├── setName:
   └── _setName:

2. 查找类方法 +accessInstanceVariablesDirectly
   ├── 返回 YES → 继续查找实例变量
   └── 返回 NO  → setValue:forUndefinedKey:（抛异常）

3. 查找实例变量（按优先级）
   ├── _name       （下划线+属性名）
   ├── _isName     （下划线+is+首字母大写）
   ├── name        （属性名）
   └── isName      （is+首字母大写）
   找到 → 直接赋值（绕过 setter，不触发 KVO！）

4. 都没找到 → setValue:forUndefinedKey: → NSUndefinedKeyException
```

### 8.2 valueForKey: 查找顺序

```
valueForKey:@"name"

1. 查找 getter 方法（按优先级）
   ├── getName
   ├── name
   ├── isName
   └── _getName

2. 查找类方法 +accessInstanceVariablesDirectly
   ├── 返回 YES → 继续查找实例变量
   └── 返回 NO  → valueForUndefinedKey:（抛异常）

3. 查找实例变量（按优先级）
   ├── _name
   ├── _isName
   ├── name
   └── isName
   找到 → 直接取值

4. 都没找到 → valueForUndefinedKey: → NSUndefinedKeyException
```

### 8.3 KVC 集合操作

```objc
// 数组操作
[array valueForKey:@"name"];       // 返回所有元素的 name 属性组成的数组
[dict setValue:@"hello" forKey:@"key"];  // 设置字典键值

// 集合运算符
// 平均值
[employees valueForKeyPath:@"@avg.salary"];
// 求和
[employees valueForKeyPath:@"@sum.salary"];
// 计数
[employees valueForKeyPath:@"@count"];
// 最大/最小
[employees valueForKeyPath:@"@max.salary"];
[employees valueForKeyPath:@"@min.salary"];
// 去重
[employees valueForKeyPath:@"@distinctUnionOfObjects.department"];
// 不去重
[employees valueForKeyPath:@"@unionOfObjects.department"];
// 嵌套集合
[arrayOfArrays valueForKeyPath:@"@distinctUnionOfArrays.name"];
```

---

## 九、类型编码（Type Encoding）

### 9.1 常见类型编码

```objc
// Runtime 用字符串编码描述方法的返回值和参数类型
// 格式：返回值类型 + 参数类型（self + _cmd + 显式参数）

// 常见编码
// c → char
// i → int
// l → long (32-bit)
// q → long long
// f → float
// d → double
// B → BOOL (C++)
// v → void
// @ → id (对象类型)
// # → Class
// : → SEL
// ^type → 指向 type 的指针

// 示例
- (void)setName:(NSString *)name age:(NSInteger)age;
// 编码：v@:@q
// v   = void 返回值
// @   = id self
// :   = SEL _cmd
// @   = NSString * name
// q   = NSInteger age

- (NSString *)name;
// 编码：@@:
// @   = NSString * 返回值
// @   = id self
// :   = SEL _cmd
```

### 9.2 获取类型编码

```objc
// 通过 Method 获取
Method method = class_getInstanceMethod([Person class], @selector(setName:));
const char *encoding = method_getTypeEncoding(method);
NSLog(@"%s", encoding);  // "v@:@"

// 通过 NSMethodSignature 获取
NSMethodSignature *sig = [Person instanceMethodSignatureForSelector:@selector(setName:)];
for (NSUInteger i = 0; i < sig.numberOfArguments; i++) {
    NSLog(@"arg%lu: %s", (unsigned long)i, [sig getArgumentTypeAtIndex:i]);
}
// arg0: @  (self)
// arg1: :  (_cmd)
// arg2: @  (name)
```

---

## 十、objc_msgSendSuper

### 10.1 用法

```objc
// objc_msgSendSuper：从父类开始查找方法
// 典型场景：在子类方法中调用父类实现

struct objc_super superInfo = {
    .receiver = self,
    .super_class = class_getSuperclass([self class])
};

// 等价于 [super method]
objc_msgSendSuper(&superInfo, @selector(method));

// 带返回值的版本
objc_msgSendSuper_stret(&superInfo, @selector(method));

// ⚠️ [super message] 的本质：
// receiver 仍然是 self（不是父类对象！）
// 只是从父类的方法列表开始查找
```

### 10.2 super 的本质

```objc
// super 不是父类对象！
// super 是编译器指令，告诉编译器从父类开始查找方法

@implementation Student
- (void)introduce {
    // [super introduce] 编译为：
    struct objc_super s = { self, class_getSuperclass([Student class]) };
    objc_msgSendSuper(&s, @selector(introduce));

    // receiver 是 self（Student 实例）
    // 查找起点是 Person（父类）
    // 所以 self 和 super 指向同一个对象
}
@end

// 经典面试题
@interface Person : NSObject
@end

@implementation Person
- (Class)class { return [Person class]; }
@end

@interface Student : Person
@end

@implementation Student
- (void)test {
    NSLog(@"%@", [self class]);   // Student
    NSLog(@"%@", [super class]); // Student！不是 Person
    // 因为 class 方法最终调的是 NSObject 的实现
    // NSObject 的 -class 返回的是 self.isa
    // 而 self 一直是 Student 实例
    // 所以 [super class] 也返回 Student
}
@end
```

---

## 十一、Runtime 实战应用

### 11.1 JSON 模型转换

```objc
@implementation BaseModel (JSON)

+ (instancetype)modelWithJSON:(NSDictionary *)json {
    if (!json || ![json isKindOfClass:[NSDictionary class]]) return nil;

    id obj = [[self alloc] init];
    unsigned int count = 0;
    objc_property_t *props = class_copyPropertyList(self, &count);

    for (unsigned int i = 0; i < count; i++) {
        const char *cname = property_getName(props[i]);
        NSString *key = @(cname);

        // 支持下划线映射
        id value = json[key] ?: json[[key stringByReplacingOccurrencesOfString:@"_" withString:@""]];

        if (value) {
            // 获取属性类型
            const char *type = property_getAttributes(props[i]);
            NSString *typeStr = @(type);

            if ([typeStr hasPrefix:@"T@\"]NSString\""] && [value isKindOfClass:[NSNumber class]]) {
                value = [value stringValue];  // NSNumber → NSString
            }
            [obj setValue:value forKey:key];
        }
    }
    free(props);
    return obj;
}

@end
```

### 11.2 自动归档/解档

```objc
@implementation NSObject (AutoCoding)

- (void)encodeWithCoder:(NSCoder *)coder {
    unsigned int count = 0;
    objc_property_t *props = class_copyPropertyList([self class], &count);
    for (unsigned int i = 0; i < count; i++) {
        const char *name = property_getName(props[i]);
        NSString *key = @(name);
        id value = [self valueForKey:key];
        if (value) [coder encodeObject:value forKey:key];
    }
    free(props);
}

- (instancetype)initWithCoder:(NSCoder *)coder {
    self = [self init];
    if (self) {
        unsigned int count = 0;
        objc_property_t *props = class_copyPropertyList([self class], &count);
        for (unsigned int i = 0; i < count; i++) {
            const char *name = property_getName(props[i]);
            NSString *key = @(name);
            id value = [coder decodeObjectForKey:key];
            if (value) [self setValue:value forKey:key];
        }
        free(props);
    }
    return self;
}

@end
```

### 11.3 防止 Button 重复点击

```objc
@implementation UIControl (PreventRepeated)

+ (void)load {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        [self swizzleInstanceMethod:@selector(sendAction:to:forEvent:)
                          withMethod:@selector(xx_sendAction:to:forEvent:)];
    });
}

- (void)xx_sendAction:(SEL)action to:(id)target forEvent:(UIEvent *)event {
    if (!self.xx_acceptEventInterval) return;

    NSTimeInterval now = [[NSDate date] timeIntervalSince1970];
    if (now - self.xx_lastEventTime < self.xx_acceptEventInterval) {
        return;  // 间隔太短，忽略
    }

    self.xx_lastEventTime = now;
    [self xx_sendAction:action to:target forEvent:event];  // 调用原实现
}

@end
```

---

## 十二、常见面试题

### Q1: objc_msgSend 的执行流程？

```
1. 检查 receiver 是否 nil → nil 返回 0
2. 在 receiver 的 isa（类对象）的 cache 中查找 → 命中返回 IMP
3. 在类对象的 method_list 中查找（含 Category）→ 命中返回 IMP 并缓存
4. 沿 superclass 链逐级查找 → 命中返回 IMP 并缓存
5. 全部未找到 → 进入消息转发
   a. resolveInstanceMethod → 动态添加方法
   b. forwardingTargetForSelector → 转发到其他对象
   c. methodSignatureForSelector + forwardInvocation → 完整转发
6. 转发也未处理 → doesNotRecognizeSelector → 崩溃
```

### Q2: Category 的实现原理？

```
编译期：
  Category 编译为 category_t 结构体，包含方法列表、属性列表、协议列表

运行时（Category 加载）：
  1. 通过 obj-c Runtime 的 _category_init 加载 Category
  2. 将 Category 的方法列表追加到 class_rw_t 的 methods 数组前面
  3. 因为查找方法是从前向后遍历，所以 Category 方法"覆盖"原类方法
  4. 多个 Category 时，后编译的在前面（取决于 Compile Sources 顺序）

Category 不能添加实例变量的原因：
  class_ro_t 的 ivars 在编译期确定，运行时不可修改
  但可通过关联对象模拟属性
```

### Q3: ISA 指针的作用？

```
1. 实例的 isa → 类对象：确定实例的方法列表在哪里
2. 类对象的 isa → 元类：确定类方法的方法列表在哪里
3. 元类的 isa → 根元类：统一归属
4. 根元类的 isa → 自己：闭环

ARM64 优化：
  nonpointer isa 不存储完整类地址，只存 shiftcls（33位）
  剩余位存储引用计数、弱引用标志等，减少 SideTable 访问
```

### Q4: Method Swizzling 的注意事项？

```
1. 在 +load 中执行，用 dispatch_once 保证一次性
2. 先 class_addMethod 判断当前类是否有该方法
   - 避免替换父类方法影响所有子类
3. 方法命名加前缀，避免冲突
4. 注意多个 Swizzle 的栈式执行顺序
5. 不要在 swizzled 方法中直接调用原方法名（会死循环）
   应调用 swizzled 方法名（IMP 已交换）
```

### Q5: KVO 的底层原理？

```
1. 注册 KVO 时，Runtime 动态创建 NSKVONotifying_XXX 子类
2. 将对象的 isa 指向该子类（ISA-Swizzling）
3. 子类重写被观察属性的 setter
4. 重写的 setter 调用 willChangeValueForKey → 原实现 → didChangeValueForKey
5. didChange 后通知所有观察者
6. 子类重写 class 方法返回原类，隐藏 KVO 实现
7. 移除观察者后，isa 恢复为原类（部分实现会保留子类）
```

### Q6: 消息转发有哪些应用？

```
1. 动态方法解析：@dynamic 属性、CoreData NSManagedObject
2. 备用接收者：NSProxy 代理、多委托分发
3. 完整转发：修改消息内容后转发
4. Method Swizzling：AOP 埋点、防重复点击
5. 关联对象：分类添加属性
6. 字典转模型：遍历属性列表
7. 自动归档解档：遍历属性列表
8. 解决无法识别的选择器崩溃：统一拦截
```

### Q7: objc_msgSend 汇编层面的消息发送流程

```
消息发送不是 C 函数调用，而是由汇编内联代码直接实现的。

1. mov x16, self       // 第1个参数: 接收者对象
2. mov x0, selector     // 第2个参数: SEL (C字符串地址)
3. bl objc_msgSend      // 尾调用跳转至 Runtime
4. 返回 IMP 结果        // 直接在 x0 中返回

Runtime 执行流程：
  a. 通过 isa 获取 class 指针
  b. 在 class->method_list 中按 SEL hash 查找方法
  c. 找到 → 跳转到 IMP 执行，未找到 → 消息转发
  d. ARM64 下，前8个参数通过 x0-x7 寄存器传递

关键优化：
  - 方法查找表采用两级哈希：先查 class，再查 category
  - 内联缓存(LDH)：将最近一次查找的 IMP 缓存到 class 结构中
  - Fixed-up pointer：编译器将频繁调用直接补丁为 IMP 地址，跳过 msgSend
```

**Pitfalls**: 直接调用 IMP 前必须确认方法已被绑定，未绑定的 IMP 是 objc_msgSend 占位符而非真实函数地址。

**Best Practice**: 频繁调用的消息（如 setter/getter）使用固定指针优化，避免每次查找 method list，性能提升可达 5-10 倍。

### Q8: 消息优化机制：内联缓存与固定指针

```
现代 objc_msgSend 不是每次都查表，而是通过多级优化避免重复查找。

1. 内联缓存 (Inline Cache / LStab):
   - 每个 class 维护一个 dispatch_once_t + IMP 的缓存槽
   - 首次调用时查 method_list 找到 IMP，缓存到 class 结构
   - 后续同 SEL 调用直接 hit 缓存，跳过 hash 查找
   - 缓存失效（如 category 添加方法）时 fallback 到完整查找

2. 固定指针 (Fixed-up Pointer / MSG_SEND_OPT):
   - 编译器链接阶段分析调用点，将 msgSend 直接 patch 为 IMP
   - 编译时已知 SEL 且调用频率高的场景（如 getter/setter）
   - 完全跳过 objc_msgSend 入口，直接调用目标函数
   - LLVM 的 -objc-msgsend-fixup 优化实现

性能对比：
  固定指针 → 内联缓存 hit → 内联缓存 miss → 完整消息转发
  ~1 个周期 → ~5 个周期 → ~50 个周期 → ~500+ 个周期
```

**Pitfalls**: Category 添加方法会清空内联缓存，导致首次调用性能骤降。大量 category 方法在运行时注册时需注意缓存失效的累积影响。

**Best Practice**: 热路径上的 getter/setter 天然受益固定指针优化，无需手动干预。避免在高性能循环中使用不确定的 SEL（如 NSStringFromSelector），这会阻止编译器做固定指针优化。

### Q9: 消息转发完整链路（resolveMethod → forwardingTarget → forwardInvocation → doesNotRecognize）

```
当消息无法被直接响应时，Runtime 按以下四阶段逐步转发：

阶段1: 动态方法解析 (resolveMethod)
  - +resolveInstanceMethod: / +resolveClassMethod:
  - 最后一次机会：用 class_addMethod 动态添加实现
  - 返回 YES → 重新发送消息；返回 NO → 进入阶段2

阶段2: 备用接收者 (forwardingTargetSelector)
  - 返回另一个能响应该 SEL 的对象
  - 只能转发一次，不能链式转发
  - 最高效的转发方式：零额外开销

阶段3: 完整消息转发 (forwardInvocation)
  - 收到 NSInvocation 对象，可修改 target、selector、参数
  - 将 NSInvocation 传递给真正的处理者
  - 最灵活的转发方式：完全控制消息分发过程

阶段4: 无法识别 (doesNotRecognizeSelector)
  - 最终兜底：抛出 NSInvalidArgumentException 崩溃
  - 可重写用于统一错误处理（如埋点上报）

典型场景：URL Scheme 分发、多委托转发、热修复占位
```

**Pitfalls**: forwardingTargetSelector 不能返回 self，否则会无限递归。阶段3中 methodSignatureForSelector 必须正确实现，否则 forwardInvocation 根本不会被调用。

**Best Practice**: 优先使用阶段2（备用接收者）做转发，性能最好；仅在需要修改参数时才用阶段3（完整转发）。所有转发机制都要考虑 doesNotRecognize 的兜底处理。

### methodSignatureForSelector 实现策略

```
methodSignatureForSelector: 是 NSInvocation 创建的前提，返回方法的参数类型与返回值信息。

三种实现策略：

1. 默认行为（系统实现）
   - 从 class 的 method_list 查找 SEL 对应的 method_encoding
   - 用 encoding 构造 NSSignature 并缓存
   - 找不到时返回 nil → forwardInvocation 不会被调用

2. 重写返回已知签名
   - 对于转发给其他对象的消息，返回目标类型的签名
   - [super methodSignatureForSelector:] 获取父类签名
   - 适用于 proxy 模式：用目标类的签名包装自身

3. 动态构造签名
   - [NSMethodSignature signatureWithObjCTypes:] 手动拼类型编码
   - 例: "@?@:" 表示 id (^)(id, SEL) 即普通实例方法签名
   - 适用于协议代理转发或动态生成的接口

类型编码速查：
  id → @  SEL → :  int → i  float → f  double → d
  void → v  char → c  BOOL → c  struct → {name=...}
  泛指针 → ^  块 → ^{block}
```

**Pitfalls**: methodSignatureForSelector 返回 nil 时 forwardInvocation: 不会触发，消息直接跳到 doesNotRecognizeSelector 导致崩溃。重写时必须确保所有转发路径的签名都正确。

**Best Practice**: 转发场景优先用 [super methodSignatureForSelector:] 获取兼容签名，避免手动拼写类型编码出错。

### NSInvocation 内部机制与创建方式

NSInvocation 是 Objective-C 中封装一次完整方法调用的对象，包含 target、selector、参数和返回值。它是消息转发机制的核心载体。

**创建方式**：
```objc
// 1. 通过 methodSignature 创建（最常用）
NSMethodSignature *sig = [obj methodSignatureForSelector:@selector(setName:)];
NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
[inv setTarget:obj];
[inv setSelector:@selector(setName:)];
NSString *name = @"new_name";
[inv setArgument:&name atIndex:2];  // 0:self, 1:_cmd
[inv invoke];

// 2. 手动构造签名创建
char *types = (char *)"v@:@";  // void (id, SEL, id)
NSMethodSignature *manual = [NSMethodSignature signatureWithObjCTypes:types];
NSInvocation *inv2 = [NSInvocation invocationWithMethodSignature:manual];

// 3. forwardInvocation 中直接复用
- (void)forwardInvocation:(NSInvocation *)inv {
    [inv setTarget:proxy];  // 重定向 target 即可转发
    [inv invoke];
}
```

**内部结构**：NSInvocation 本质是一个 C struct 的封装，参数按 ABI 规范存储在连续内存中。atIndex:0 是 self，1 是 _cmd，从 2 开始才是方法参数。

**Pitfalls**: setArgument:atIndex: 使用指针拷贝，必须传局部变量地址而非实例变量地址；返回值的获取需按类型匹配使用 getReturnValue:。

**Best Practice**: 消息转发中优先复用 forwardInvocation 传入的 NSInvocation，仅修改 target 后再次 invoke，避免重复创建签名和 invocation 对象。

### 关联对象策略（OBJC_ASSOCIATION_*）内存语义

objc_setAssociatedObject 将对象与任意 key（通常是静态指针）绑定，底层使用哈希表存储。关联策略（OBJC_ASSOCIATION_*）决定了指针的语义和内存管理行为：

```objc
// 6 种策略对应 retain / copy / assign 语义
OBJC_ASSOCIATION_ASSIGN         // __unsafe_unretained，弱引用，对象释放后不自动清理
OBJC_ASSOCIATION_RETAIN_NONATOMIC   // 非原子 retain，默认策略
OBJC_ASSOCIATION_RETAIN         // 原子 retain，线程安全但有额外开销
OBJC_ASSOCIATION_COPY_NONATOMIC     // 非原子 copy（NSString/NSData 等首选）
OBJC_ASSOCIATION_COPY           // 原子 copy
OBJC_ASSOCIATION_WEAK           // weak 引用，对象释放后自动 nil

// 使用示例
static char kTimestampKey;
objc_setAssociatedObject(self, &kTimestampKey, date, OBJC_ASSOCIATION_COPY_NONATOMIC);
NSDate *ts = objc_getAssociatedObject(self, &kTimestampKey);
objc_setAssociatedObject(self, &kTimestampKey, nil, OBJC_ASSOCIATION_COPY_NONATOMIC);  // 删除
```

**Pitfalls**: 使用 ASSIGN 策略时，被关联对象释放后指针悬空，访问会导致野指针崩溃；WEAK 策略下对象释放自动 nil 化，不会触发 KVO 通知。

**Best Practice**: 绝大多数场景用 RETAIN_NONATOMIC 或 COPY_NONATOMIC，无需原子操作时避免用 RETAIN/COPY（无性能优势且增加死锁风险）。

### 运行时动态创建类（objc_allocateClassPair / class_register）

Objective-C Runtime 允许在程序运行时动态创建新类，无需在编译时预先声明。核心 API 是 objc_allocateClassPair 分配类结构，class_addMethod 添加方法实现，最后 class_register 注册到 Runtime 系统中。

```objc
#import <objc/runtime.h>

// 1. 动态分配父-子类对
Class dynClass = objc_allocateClassPair([NSObject class], "DynamicWidget", 0);

// 2. 添加方法（IMP 必须是 C 函数，签名 "v@:" = void (id, SEL)）
class_addMethod(dynClass, @selector(render), (IMP)renderIMP, "v@:");

// 3. 添加实例变量（必须在 class_register 之前！）
class_addIvar(dynClass, "tag", sizeof(int), log2(sizeof(int)), "i");

// 4. 注册到 Runtime（不可逆操作，注册后不能再 addMethod/addIvar）
class_register(dynClass);

// 5. 实例化使用
id obj = [[dynClass alloc] init];
[obj performSelector:@selector(render)];
```

**Pitfalls**: class_register 之后调用 class_addMethod/class_addIvar 直接崩溃；重复注册同名类也会崩溃，需先 class_getClass 检查。

**Best Practice**: 封装动态类工厂 — 用 dispatch_once 保证类只注册一次，缓存 Class 对象避免重复创建。


### KVC 键值编码访问器搜索顺序

当通过 `valueForKey:` 访问属性时，KVC 按以下顺序搜索对应的 getter 方法，**第一个匹配即停止**：

```objc
// 查找顺序（以 key = "userName" 为例）
// 1. - (id)userName;                  // 直接属性名 getter
// 2. - (id)isUserName;                 // is 前缀（BOOL 属性常见）
// 3. + (NSValueTransformer *)userNameValueTransformer;  // 值转换器
// 4. - (id)accessInstanceVariablesDirectly; returns NO → 跳过 ivar
// 5. _userName, userName, _isUserName  // 按优先级搜索实例变量
// 6. - (id)valueForUndefinedKey:       // 兜底方法，可自定义逻辑
```

设 count 属性值为 0：
```objc
// valueForKey:@"count" 会命中 NSKeyValueCoding 合成的 getter
// 而非实际定义的 -count 方法！因为 count 是 NSKeyValueCoding 保留字
```

**Pitfalls**: 属性名与 Cocoa 框架保留字冲突时（如 `count`、`length`、`size`、`class`），KVC 会返回框架合成的值而非属性值；直接使用 `valueForKey:@"count"` 可能返回 `self` 本身。

**Best Practice**: 避免使用框架保留字作为 KVC key；必须使用时，重写 `accessInstanceVariablesDirectly` 返回 `NO` 并在 `valueForUndefinedKey:` 中手动返回属性值，或改用 `@property (nonatomic) NSInteger item_count` 规避冲突。

### KVC 可变数组访问器（mutableArrayValueForKey:）

当通过 `mutableArrayValueForKey:` 访问一个数组属性时，KVC 返回一个 **NSOrderedSet 代理对象**，而非原始数组本身。对代理的所有修改（insert、remove、replace）都会通过约定的 accessor 方法转发回原始数组，从而触发 KVO 通知。

```objc
@interface DataManager : NSObject
@property (nonatomic, strong) NSMutableArray<NSString *> *tags;
@end

// KVC 返回 proxy，而非直接返回 self.tags
id proxy = [dataManager mutableArrayValueForKey:@"tags"];

// 以下操作触发 KVO 通知（NSKeyValueChangeInsertion 等）
[proxy addObject:@"swift"];
// KVC 搜索顺序：
// 1. insertObject:inTagsAtIndex:     // 优先
// 2. insertTags:atIndexes:           // 批量
// 3. addTagsObject:                  // 最常用
// 4. 直接操作 self.tags（无 KVO 通知）

// 直接 [dataManager.tags addObject:] 不会触发 KVO！
```

**Pitfalls**: proxy 不是真正的 NSMutableArray，是遵循 NSFastEnumeration 协议的代理 — 不支持 objectAtIndexedSubscript 下标访问；proxy 生命周期短暂，仅在一次 run loop 内有效，不可跨线程缓存。

**Best Practice**: 数组属性暴露给 KVC/KVO 场景时，始终通过 `mutableArrayValueForKey:` 获取 proxy 进行修改，确保变更可被观察；实现对应的 `insertObjects:inTagsAtIndexes:` 等标准 accessor 方法以获取最佳兼容性。

### KVO 手动实现（willChangeValueForKey:）

当你在代码中直接修改被观察的属性（绕过 KVC accessor），KVO 通知不会自动触发。此时需手动调用 `willChangeValueForKey:` 和 `didChangeValueForKey:` 来确保观察者被通知。

```objc
@interface Model : NSObject
@property (nonatomic, copy) NSString *status;
@end

// 场景：直接修改 ivar 绕过 setter，仍需 KVO 通知
- (void)updateStatusDirectly {
    [self willChangeValueForKey:@"status"];  // ① 标记变更前
    _status = @"completed";                    // ② 直接改 ivar（不触发 setter）
    [self didChangeValueForKey:@"status"];    // ③ 标记变更后 → KVO 通知发出
}

// 对应的 KVO 观察者回调会被正确调用
- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary *)change
                       context:(void *)context {
    if ([keyPath isEqualToString:@"status"]) {
        // change 中包含 NSKeyValueChangeOldKey 和 NSKeyValueChangeNewKey
    }
}
```

**Pitfalls**: `willChangeValueForKey:` 和 `didChangeValueForKey:` 必须成对出现，漏掉任何一个都会导致 KVO 内部计数失衡，后续该 key 的 KVO 通知全部失效，且无任何警告。

**Best Practice**: 封装统一的属性变更方法，在内部自动包裹 will/did 调用对，或使用 `@try/@finally` 保证 `didChangeValueForKey:` 即使异常也能执行，避免 KVO 计数泄漏。

### KVO isa-swizzling 实现细节

KVO 的核心机制是 **运行时动态创建子类**（NSKeyValueObserving_XXX），通过修改被观察对象的 isa 指针指向这个生成的 subclass，从而拦截 setter 调用。当被观察对象的属性被修改时，subclass 的 override 方法被调用，内部依次触发 willChangeValueForKey: → 原始 setter → didChangeValueForKey: → notify observers。

```objc
// 验证 KVO isa-swizzling（手动实现 KVO）
@interface Person : NSObject
@property (nonatomic, copy) NSString *name;
@end

Person *p = [[Person alloc] init];
Class origClass = object_getClass(p);        // Person
[p addObserver:self forKeyPath:@"name" ...];
Class kvoClass = object_getClass(p);          // NSKVONotifying_Person
NSLog(@"%@ -> %@", NSStringFromClass(origClass), NSStringFromClass(kvoClass));

// 手动实现等价逻辑
Class dynClass = subclass_registerName(...);  // 创建 NSKVONotifying_XXX
object_setClass(p, dynClass);                  // isa-swizzling
// 动态生成 - (void)setName:(NSString *)name {
//     [self willChangeValueForKey:@"name"];
//     origClass_instancemethod(self, @selector(setName:), name);
//     [self didChangeValueForKey:@"name"];
// }
```

**Pitfalls**: isa-swizzling 在 `dealloc` 时自动还原，但若在 `observeValueForKeyPath:` 中修改同 key 的属性会触发递归通知导致崩溃；多线程环境下 isa 修改非原子操作，极端竞态可能导致观察丢失。

**Best Practice**: 生产环境优先使用 Apple 原生 KVO API，手动 isa-swizzling 仅用于理解原理或实现自定义观察框架时，务必处理线程安全和递归防护。

### KVO vs NotificationCenter vs Delegate vs Block 回调方式对比

iOS 四大通信机制各有适用场景。**KVO** 基于 isa-swizzling 实现属性变更监听，适合一对一属性观察但性能开销最大；**NotificationCenter** 是发布-订阅模式的 OC 实现，支持一对多广播但无类型检查且容易内存泄漏；**Delegate** 基于协议的一对一个通信，编译期类型安全且性能最优，但仅限单代理场景；**Block 回调** 语法简洁、闭包捕获上下文方便，但易形成循环引用导致内存泄漏。

```objc
// KVO — 属性变更监听（性能开销最大）
[self.model addObserver:self forKeyPath:@"status" options:0 context:nil];

// NotificationCenter — 一对多广播（无类型检查）
[[NSNotificationCenter defaultCenter] postNotificationName:@"StatusChanged" object:self];

// Delegate — 一对一类型安全（性能最优）
@protocol ViewControllerDelegate <NSObject>
- (void)didFinish:(UIViewController *)vc;
@end

// Block 回调 — 闭包捕获上下文（注意循环引用）
self.completionBlock = ^(BOOL success) { if (success) { /* ... */ } };
```

**Pitfalls**: Block 回调最常见的陷阱是 `self` 隐式强引用 → 循环引用。Delegate 委托协议方法声明为 `@optional` 时，调用前必须检查 `respondsToSelector:`，否则直接崩溃。NotificationCenter 忘记移除观察者会导致向已释放对象发消息。

**Best Practice**: 优先 Delegate（一对一）> Block（异步回调）> NotificationCenter（一对多解耦）> KVO（属性监听），按性能到灵活度递减排序。Block 统一使用 `__weak`/`weak` 捕获 self，Delegate 区分 `@required`/`@optional`。

### Runtime 方法缓存（bucket 表、哈希查找）

Objective-C 方法调用的核心是 `objc_msgSend`，其底层维护了一个两级查找结构：**方法缓存**（bucket 哈希表）和 **方法列表**（method list）。首次调用某方法时，Runtime 在类的 method list 中线性查找 SEL 对应的 IMP，查到后将 (SEL, IMP) 对写入缓存的 bucket 表。后续同一方法的调用直接通过哈希查找 bucket，O(1) 命中，跳过整个 msgSend 查找链。

缓存使用 open addressing（开放寻址）的哈希表实现，负载因子约 0.6 时触发 rehash 扩容。每个 bucket 存储 SEL 和 IMP 两个指针，缓存以 class 为粒度独立维护，子类继承父类的缓存条目（通过 buckets->mask 快速定位）。方法缓存的命中率直接决定了 msgSend 的性能表现。

```objc
// 查看方法缓存命中率
Class cls = [NSArray class];
struct objc_cache *cache = class_getCache(cls);
// 首次调用 — 未命中，从 method list 查找并写入缓存
id arr = [[NSArray alloc] init];
// 再次调用 — 命中 bucket 缓存，直接跳转 IMP
[arr count];

// 强制清除缓存（测试/调试用，生产勿用）
class_flushCache(cls);  // 清空该类的全部缓存
class_flushCaches();     // 清空所有类缓存
```

**Pitfalls**: 热更新框架（JSPatch、Raison）通过 `class_replaceMethod` 修改方法实现时，不会自动清除缓存，导致旧 IMP 仍在 bucket 中生效，补丁看似未生效，实际是缓存命中了旧地址。

**Best Practice**: 动态修改方法实现后务必调用 `class_flushCache(targetClass)` 清除对应类的缓存；Method Swizzling 在 `+load` 中执行时缓存尚未建立，无需手动 flush。

### SEL vs IMP vs Method 数据结构

Runtime 消息 dispatch 的三大核心数据结构。**SEL**（Selector）是方法选择器，本质是一个 C 字符串指针（`const char *`），全局唯一，通过 `sel_registerName()` 注册，同一个 SEL 在不同 class 可能对应不同实现。**IMP**（Implementation）是函数指针（`id (*)(id, SEL, ...)`），指向方法实际执行的机器代码入口，在 Runtime 编译时确定。**Method**（`struct objc_method`）是 SEL + IMP + 编码字符串（`const char *`）的三元组，完整描述了一个方法的签名与实现。

```objc
// 三大结构体的核心定义（简化版）
typedef const char *SEL;                    // SEL = 方法名字符串
typedef id (*IMP)(id, SEL, ...);           // IMP = 函数指针

struct objc_method {
    SEL   method_name;      // 方法选择器（SEL）
    const char *method_types;  // 参数和返回值类型编码
    IMP   method_impl;      // 实际函数指针
};
struct objc_method_list {
    struct objc_method_list *obsolete;
    int method_count;
    struct objc_method method_list[RECORDSIZE];
};
```

**Pitfalls**: SEL 仅包含方法名不含参数类型，`@selector(setValue:)` 在不同 class 是同一个 SEL，`performSelector:` 调用时 Runtime 按接收者 class 查找 IMP，类型不匹配直接 SIGABRT 崩溃，编译器无法做静态检查。

**Best Practice**: 避免在热路径频繁使用 `performSelector:`（绕过编译期类型检查 + 禁用 ARC 释放语义），优先直接调用方法；必须动态分发时用 `objc_msgSend` 替代，手动传参并确保签名一致。

### 快速转发（iOS 13+）__objc_forward_quick

iOS 13 引入的快速转发机制，是传统的 `forwardInvocation:` 的高性能替代方案。在 `methodSignatureForSelector:` 之后，Runtime 优先调用 `forwardTarget(forMethod:)` 和 `forwardInvocation:`，而 `__objc_forward_quick` 绕过了 `NSInvocation` 的创建开销，直接以内联方式将消息转发给目标对象，性能提升可达 3-5 倍。

```objc
// iOS 13+ 快速转发 — 绕过 NSInvocation 创建开销
- (id)forwardingTargetForSelector:(SEL)sel {
    if ([self.proxy respondsToSelector:sel]) {
        return self.proxy;  // __objc_forward_quick 路径
    }
    return [super forwardingTargetForSelector:sel];
}

// 传统转发路径（iOS 13 以下 / fallback）
- (NSMethodSignature *)methodSignatureForSelector:(SEL)sel {
    if ([self.proxy methodSignatureForSelector:sel]) {
        return [self.proxy methodSignatureForSelector:sel];
    }
    return [super methodSignatureForSelector:sel];
}

- (void)forwardInvocation:(NSInvocation *)invocation {
    [invocation invokeWithMethodTarget:self.proxy];  // NSInvocation 路径
}
```

**Pitfalls**: `forwardingTargetForSelector:` 返回 `nil` 时仍会落入 `forwardInvocation:` 路径，`NSInvocation` 的创建和参数拷贝开销在热路径下不可接受。快速转发要求目标对象和发送者对同一 SEL 有兼容的签名，签名不匹配直接崩溃且无 traceback。

**Best Practice**: 代理/桥接模式优先实现 `forwardingTargetForSelector:` 走快速转发路径；需要动态修改参数或返回值时才使用 `forwardInvocation:`；混合使用时确保两种路径行为一致。

### +initialize vs +load 执行顺序与线程安全

`+load` 和 `+initialize` 是 Runtime 自动调用的两个 class-level 方法，**执行时机和线程安全截然不同**。`+load` 在动态库加载时调用（`dyld`阶段），每个 class 和 category 的 `+load` 仅执行一次，**无锁保护**，类别的 `+load` 按声明顺序执行。**`+initialize`** 在 class 首次接收消息时调用（懒初始化），Runtime 加锁保证**每个 class 只执行一次**，且由**主线程**触发（首次消息通常来自主线程）。

```objc
// +load：dyld 加载时调用，所有 class 和 category 都会触发
+ (void)load {
    // ⚠️ 无锁保护，多线程环境下需自行加锁
    // ⚠️ Category 的 +load 也会执行，可能覆盖原 class 实现
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        staticClassVar = [[SomeClass alloc] init];
    });
}

// +initialize：class 首次接收消息时调用，Runtime 自动加锁
+ (void)initialize {
    if (self == [MyClass class]) {  // 防止子类重复执行
        defaultConfig = @{ @"key": @"value" };
    }
    // ✅ Runtime 保证线程安全，仅执行一次
}
```

**Pitfalls**: `+load` 在 `main()` 之前执行，此时绝大多数框架尚未初始化（如 `UIApplication`、`UserDefaults` 可能不可用），且所有 `+load` 并发调用无锁保护，`dispatch_once` 是唯一安全的初始化方式。Category 定义的 `+initialize` 会覆盖原 class 实现，子类不会自动继承父类的 `+initialize`（需显式 `[super initialize]`）。

**Best Practice**: 方法 Swizzling 放在 `+load` 中（缓存未建立）；静态变量初始化用 `+initialize` + `if (self == [MyClass class])` 防止子类重复；`+load` 中只用 `dispatch_once` 保证线程安全，避免访问未就绪的框架 API。

### Category 方法解析顺序

当 Class 和 Category 定义了同名方法时，Runtime 的解析遵循 **Category 优先** 的原则：Category 的方法会插入到 class 方法链表的**头部**，在消息分发时优先被查找命中。多个 Category 之间按 **linker 链接顺序**排列（编译链接时后链接的 Category 排在前面，即 `objc_lazyBindCategories` 中后注册的优先级更高）。

```objc
// MyClass 原始实现
@implementation MyClass
- (void)greet { NSLog(@"Hello from MyClass"); }
@end

// Category A (先编译链接)
@implementation MyClass (CategoryA)
- (void)greet { NSLog(@"Hello from CategoryA"); }
@end

// Category B (后编译链接 — 优先级更高)
@implementation MyClass (CategoryB)
- (void)greet { NSLog(@"Hello from CategoryB"); }
@end

// [obj greet] → "Hello from CategoryB"  ✅ 后链接的 Category 优先
// 原始 MyClass 的 greet 被完全隐藏，无法通过常规方式调用
```

**Pitfalls**: Category 覆盖同名方法的行为依赖 linker 链接顺序（`-ObjC` / `-all_load` 标志影响），在多 target 或动态框架场景中链接顺序**不可控**，同一项目不同 build 可能产生不同结果。Xcode 15+ 有时会重新排序 `.o` 文件导致 Category 优先级翻转，CI 构建与本地不一致是常见来源。

**Best Practice**: 避免用 Category 覆盖已有方法（用 method swizzling 替代）；Category 仅用于扩展新方法或组织代码；必须在多个 Category 间保证确定性行为时，使用 `class_addMethod` + `method_setImplementation` 在 `+load` 中手动控制替换顺序。

### Swift 动态派发 vs ObjC 消息发送（witness table、thunk）

Swift 的协议派发和 ObjC 的消息发送是两套独立的机制。ObjC 使用 **`objc_msgSend`** 基于 SEL 在 method_list 中线性/缓存查找实现动态分派；Swift 的 protocol 则通过 **witness table** 实现：每个 conforming type 生成一份 witness table，记录协议方法到具体实现的映射 thunk 指针，编译器在已知 concrete type 时直接生成间接尾调用（indirect tail call），而非 Runtime 查找。

```swift
protocol Drawable {
    func render(in context: Context)
}

struct Circle: Drawable {
    // witness table: { render → Circle.render }
    func render(in context: Context) { /* ... */ }
}

func draw(_ item: some Drawable, in context: Context) {
    // ✅ erased: 编译为 indirect call through witness table thunk
    item.render(in: context)
}
// ObjC 对比：obj.render() → objc_msgSend(obj, @selector(render))
// Swift protocol → witness table lookup → thunk → concrete impl
```

**Pitfalls**: `@objc protocol` 约束 class 时编译器可降级走 ObjC 消息发送，性能取决于 Runtime cache 命中率，与 pure Swift witness table 完全不同。泛型约束走静态 monomorphization，每次类型组合生成独立 witness table 导致 binary bloat。

**Best Practice**: 值类型遵循的协议始终用 witness table 派发，无 Runtime 开销；动态行为用 `any Drawable`（existential，有装箱开销）；性能敏感场景优先 `some` 语法保持静态派发。
