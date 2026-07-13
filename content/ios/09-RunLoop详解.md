# RunLoop 详解

---

## 一、RunLoop 概述

### 1.1 什么是 RunLoop

```
RunLoop（运行循环）是 iOS/macOS 中管理线程事件和消息的基础机制。

核心思想：
  线程不执行任务时 → 休眠（节省 CPU）
  有事件到来时      → 唤醒并处理
  处理完毕后        → 再次休眠

没有 RunLoop 的线程：
  void threadEntry() {
      doSomething();
      // 任务完成，线程退出，不再可用
  }

有 RunLoop 的线程：
  void threadEntry() {
      while (alive) {
          休眠，等待事件...
          处理事件
      }
      // 只有显式退出才结束
  }

主线程之所以能持续响应用户操作而不退出，就是因为主线程 RunLoop 一直在运行。
```

### 1.2 RunLoop 与线程的关系

```objc
// 核心规则：
// 1. 每个线程最多只有一个 RunLoop（一一对应）
// 2. 主线程 RunLoop 在 App 启动时自动创建
// 3. 子线程默认没有 RunLoop，首次获取时懒加载创建
// 4. RunLoop 存储在一个全局 Dictionary 中，key 是线程，value 是 RunLoop
// 5. RunLoop 在线程销毁时一并销毁

// 获取当前线程的 RunLoop（不存在则创建）
NSRunLoop *currentLoop = [NSRunLoop currentRunLoop];
CFRunLoopRef cfLoop = CFRunLoopGetCurrent();

// 获取主线程的 RunLoop
NSRunLoop *mainLoop = [NSRunLoop mainRunLoop];
CFRunLoopRef cfMainLoop = CFRunLoopGetMain();

// ⚠️ 不能手动创建 RunLoop，只能通过以上 API 获取
// ⚠️ [NSRunLoop currentRunLoop] 必须在目标线程内部调用才会创建该线程的 RunLoop
```

### 1.3 两套 API

```
RunLoop 有两套 API：

Foundation 层：
  NSRunLoop（Objective-C 对象封装，非线程安全）

Core Foundation 层：
  CFRunLoopRef（C 语言接口，线程安全）

NSRunLoop 是对 CFRunLoopRef 的封装：
  CFRunLoopRef ref = [myRunLoop getCFRunLoop];

日常开发中可以使用 NSRunLoop。
如果需要更精细的控制（如添加 Observer），需要使用 CFRunLoopRef。
```

---

## 二、RunLoop 内部结构

### 2.1 CFRunLoopRef 核心结构

```
CFRunLoopRef 的核心组成：

┌──────────────────────────────────────────────┐
│              CFRunLoop                        │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │  currentMode  → 当前正在运行的 Mode      │ │
│  ├─────────────────────────────────────────┤ │
│  │  modes        → 所有注册的 Mode 集合      │ │
│  │               {                          │ │
│  │                 kCFRunLoopDefaultMode,    │ │
│  │                 UITrackingRunLoopMode,    │ │
│  │                 ...                      │ │
│  │               }                          │ │
│  ├─────────────────────────────────────────┤ │
│  │  commonModes  → 标记为 common 的 Mode 集合│ │
│  ├─────────────────────────────────────────┤ │
│  │  commonModeItems → 需要同步到所有         │ │
│  │                    commonMode 的 items    │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

每个 Mode（CFRunLoopMode）包含：
┌──────────────────────────────────────┐
│         CFRunLoopMode                │
│                                      │
│  name      → Mode 名称               │
│  sources0  → Source0 集合（Set）       │
│  sources1  → Source1 集合（Set）       │
│  observers → Observer 数组（Array）    │
│  timers    → Timer 数组（Array）       │
└──────────────────────────────────────┘
```

### 2.2 Mode（运行模式）

```objc
// RunLoop 同一时刻只能运行在一个 Mode 下
// 切换 Mode 时必须退出当前循环，重新指定 Mode 进入

// ===== 常用 Mode =====

// 1. kCFRunLoopDefaultMode（NSDefaultRunLoopMode）
//    默认模式，App 通常在此模式下运行
//    大部分事件都在此模式下处理

// 2. UITrackingRunLoopMode
//    ScrollView 滚动时进入的模式
//    保证滑动流畅，优先处理滑动事件

// 3. kCFRunLoopCommonModes（NSRunLoopCommonModes）
//    不是一个真正的 Mode，而是一个 "标记"
//    添加到 CommonModes 的 item，会被自动同步到所有被标记为 common 的 Mode 中
//    默认情况下 DefaultMode 和 TrackingMode 都被标记为 common

// 4. UIInitializationRunLoopMode
//    App 启动时使用的私有 Mode
//    启动完成后不再使用

// 5. GSEventReceiveRunLoopMode
//    接收系统事件的内部 Mode


// ===== Mode 切换示意 =====
//
//  正常状态                    滑动 ScrollView
//  ┌─────────────────┐       ┌─────────────────┐
//  │ DefaultMode     │ ───→  │ TrackingMode     │
//  │ Timer ✓         │       │ Timer ✗（暂停）   │
//  │ Source ✓        │       │ 滑动事件 ✓       │
//  └─────────────────┘       └─────────────────┘
//           ↑                         │
//           └─────── 停止滑动 ────────┘


// ===== Mode 隔离的经典问题 =====

// Timer 在滑动时停止
NSTimer *timer = [NSTimer scheduledTimerWithTimeInterval:1.0
                                                  target:self
                                                selector:@selector(tick)
                                                userInfo:nil
                                                 repeats:YES];
// scheduledTimer 默认加入 DefaultMode
// 滑动时 RunLoop 切到 TrackingMode → Timer 不触发

// 解决方案：加入 CommonModes
[[NSRunLoop mainRunLoop] addTimer:timer forMode:NSRunLoopCommonModes];
// Timer 会同时存在于 DefaultMode 和 TrackingMode 中
```

### 2.3 Source（输入源）

```
RunLoop 有两种 Source，用于接收事件：

┌──────────────────────────────────────────────────────┐
│                    Source0                             │
│                                                      │
│  非基于端口的事件源（App 内部事件）                      │
│                                                      │
│  触发方式：手动标记为待处理 + 手动唤醒 RunLoop            │
│                                                      │
│  常见场景：                                            │
│  - 触摸事件（UIEvent）                                 │
│  - performSelector:onThread:                          │
│  - 自定义 Source0                                     │
│                                                      │
│  处理流程：                                            │
│  1. 某处调用 CFRunLoopSourceSignal(source) 标记源       │
│  2. 调用 CFRunLoopWakeUp(runloop) 唤醒 RunLoop         │
│  3. RunLoop 检查 Source0 队列并处理                     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                    Source1                             │
│                                                      │
│  基于 Mach Port 的事件源（内核/系统事件）                │
│                                                      │
│  触发方式：通过内核 Mach Port 自动唤醒 RunLoop           │
│                                                      │
│  常见场景：                                            │
│  - 硬件事件（触摸/锁屏/摇晃等）的初始接收               │
│  - CFMachPort / CFMessagePort                        │
│  - NSPort 端口通信                                    │
│                                                      │
│  处理流程：                                            │
│  1. 内核向 Mach Port 发送消息                          │
│  2. RunLoop 被自动唤醒                                 │
│  3. RunLoop 调用 Source1 的回调处理事件                  │
└──────────────────────────────────────────────────────┘


触摸事件的完整传递路径：

  用户触摸屏幕
       ↓
  IOKit.framework 检测到硬件信号
       ↓
  生成 IOHIDEvent 事件
       ↓
  通过 Mach Port 发送给 SpringBoard 进程
       ↓
  SpringBoard 判断前台 App，通过 Mach Port 转发（Source1）
       ↓
  App 主线程 RunLoop 被唤醒
       ↓
  触发 Source1 回调 → __IOHIDEventSystemClientQueueCallback
       ↓
  回调内部将事件包装为 UIEvent，标记一个 Source0
       ↓
  Source0 回调 → __UIApplicationHandleEventQueue
       ↓
  通过 hitTest 找到目标视图，分发事件
```

### 2.4 Timer（定时器源）

```objc
// CFRunLoopTimerRef 与 NSTimer 是 toll-free bridged 的

// Timer 加入 RunLoop 才会工作
NSTimer *timer = [NSTimer timerWithTimeInterval:1.0
                                         target:self
                                       selector:@selector(doWork)
                                       userInfo:nil
                                        repeats:YES];
[[NSRunLoop mainRunLoop] addTimer:timer forMode:NSRunLoopCommonModes];

// scheduledTimerWithTimeInterval 会自动加入当前 RunLoop 的 DefaultMode
NSTimer *timer2 = [NSTimer scheduledTimerWithTimeInterval:1.0
                                                   target:self
                                                 selector:@selector(doWork)
                                                 userInfo:nil
                                                  repeats:YES];

// ⚠️ Timer 的精度问题
// Timer 不是实时机制，它依赖 RunLoop 的循环来触发
// 如果 RunLoop 正在执行耗时操作，Timer 的触发会被延迟
// Timer 有一个 tolerance 属性可以设置容忍偏差

timer.tolerance = 0.1;  // 允许 0.1 秒的偏差，有助于系统节能


// ===== performSelector 延迟执行 =====
// performSelector:withObject:afterDelay: 实际上创建了一个 Timer 加入 RunLoop
[self performSelector:@selector(doWork) withObject:nil afterDelay:2.0];

// 因此子线程中调用 performSelector:afterDelay: 需要开启 RunLoop
// 否则 Timer 不会被触发
```

### 2.5 Observer（观察者）

```objc
// CFRunLoopObserver 可以监听 RunLoop 的状态变化

// RunLoop 的活动状态：
typedef CF_OPTIONS(CFOptionFlags, CFRunLoopActivity) {
    kCFRunLoopEntry         = (1UL << 0),  // 即将进入 RunLoop
    kCFRunLoopBeforeTimers  = (1UL << 1),  // 即将处理 Timer
    kCFRunLoopBeforeSources = (1UL << 2),  // 即将处理 Source
    kCFRunLoopBeforeWaiting = (1UL << 5),  // 即将进入休眠
    kCFRunLoopAfterWaiting  = (1UL << 6),  // 刚从休眠中唤醒
    kCFRunLoopExit          = (1UL << 7),  // 即将退出 RunLoop
    kCFRunLoopAllActivities = 0x0FFFFFFFU  // 监听所有状态
};

// 创建 Observer
CFRunLoopObserverRef observer = CFRunLoopObserverCreateWithHandler(
    kCFAllocatorDefault,
    kCFRunLoopAllActivities,  // 监听所有活动
    YES,                       // 重复监听
    0,                         // 优先级
    ^(CFRunLoopObserverRef observer, CFRunLoopActivity activity) {
        switch (activity) {
            case kCFRunLoopEntry:
                NSLog(@"进入 RunLoop");
                break;
            case kCFRunLoopBeforeTimers:
                NSLog(@"即将处理 Timer");
                break;
            case kCFRunLoopBeforeSources:
                NSLog(@"即将处理 Source");
                break;
            case kCFRunLoopBeforeWaiting:
                NSLog(@"即将休眠");
                break;
            case kCFRunLoopAfterWaiting:
                NSLog(@"从休眠中唤醒");
                break;
            case kCFRunLoopExit:
                NSLog(@"退出 RunLoop");
                break;
        }
    }
);

// 添加到 RunLoop
CFRunLoopAddObserver(CFRunLoopGetCurrent(), observer, kCFRunLoopCommonModes);

// 移除
CFRunLoopRemoveObserver(CFRunLoopGetCurrent(), observer, kCFRunLoopCommonModes);
CFRelease(observer);
```

---

## 三、RunLoop 运行流程

### 3.1 完整的运行循环

```
RunLoop 每次循环的完整步骤：

┌─────────────────────────────────────────────────┐
│              RunLoop 进入（Entry）                 │
│              通知 Observer: kCFRunLoopEntry        │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Step 1: 通知 Observer: kCFRunLoopBeforeTimers    │
│          即将处理 Timer                           │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Step 2: 通知 Observer: kCFRunLoopBeforeSources   │
│          即将处理 Source0                          │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Step 3: 处理所有已标记的 Source0 事件              │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Step 4: 如果有 Source1 就绪                      │
│          → 直接跳到 Step 8 处理                   │
└──────────┬───────────┬──────────────────────────┘
           │ 无         │ 有
           ↓            ↓ → Step 8
┌─────────────────────────────────────────────────┐
│  Step 5: 通知 Observer: kCFRunLoopBeforeWaiting   │
│          即将进入休眠                              │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Step 6: 休眠，等待以下事件唤醒：                   │
│          - Source1（Mach Port 消息）               │
│          - Timer 到期                             │
│          - 外部手动唤醒 CFRunLoopWakeUp             │
│          - 超时时间到                              │
│                                                  │
│  底层调用 mach_msg() 进入内核态等待                 │
│  线程真正休眠，不消耗 CPU                          │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Step 7: 通知 Observer: kCFRunLoopAfterWaiting    │
│          从休眠中被唤醒                            │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Step 8: 处理唤醒事件：                            │
│          - Timer 到期 → 执行 Timer 回调            │
│          - Source1 事件 → 执行 Source1 回调          │
│          - dispatch_get_main_queue → 处理 GCD 回调 │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Step 9: 判断是否退出？                            │
│          - 手动调用 CFRunLoopStop → 退出            │
│          - 运行参数中设定了超时 → 超时退出            │
│          - Mode 中没有任何 Source/Timer → 退出      │
│          - 否则 → 回到 Step 1 继续循环              │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│              RunLoop 退出（Exit）                  │
│              通知 Observer: kCFRunLoopExit         │
└─────────────────────────────────────────────────┘
```

### 3.2 休眠的实现原理

```
RunLoop 的休眠不是简单的 sleep()，而是通过 Mach 内核的消息机制实现：

用户态                              内核态
┌──────────┐                    ┌──────────────┐
│  RunLoop  │                   │   Mach 内核    │
│          │  mach_msg()        │              │
│  即将休眠 │ ─────────────────→ │  等待消息     │
│          │                    │  线程挂起     │
│          │                    │  不占 CPU     │
│          │                    │              │
│          │  ← ← ← ← ← ← ←  │  收到消息     │
│  被唤醒  │   mach_msg 返回     │  唤醒线程     │
└──────────┘                    └──────────────┘

mach_msg() 是一个系统调用：
  - 发送消息时，如果对端没有准备好接收 → 可以选择阻塞等待
  - 接收消息时，如果没有消息到达 → 可以选择阻塞等待
  
RunLoop 在休眠时调用 mach_msg() 接收消息（接收模式），
内核将线程挂起（真正的休眠），直到以下情况发生：
  - 有消息到达 Mach Port（Source1 事件、Timer 到期等）
  - 手动调用 CFRunLoopWakeUp（内部也是向 Port 发送消息）
```

---

## 四、RunLoop 的启动与退出

### 4.1 三种启动方式

```objc
// ===== 方式1：run =====
[[NSRunLoop currentRunLoop] run];

// 特点：
// - 无条件运行，内部反复调用 runMode:beforeDate:
// - 无法停止！即使调用 CFRunLoopStop 也只是停止一次内部循环
// - 适用场景：需要线程永久存活，且不需要停止


// ===== 方式2：runUntilDate: =====
[[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:10]];

// 特点：
// - 指定超时时间
// - 到期后自动退出
// - 适用场景：需要线程运行指定时长


// ===== 方式3：runMode:beforeDate:（推荐） =====
BOOL shouldKeepRunning = YES;
while (shouldKeepRunning) {
    [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                             beforeDate:[NSDate distantFuture]];
}

// 特点：
// - 每次处理完一个事件后就返回
// - 通过外部标志位控制是否继续运行
// - 可以被 CFRunLoopStop 停止
// - 适用场景：需要精确控制 RunLoop 的生命周期
```

### 4.2 退出方式

```objc
// ===== 方式1：CFRunLoopStop =====
CFRunLoopStop(CFRunLoopGetCurrent());
// 停止当前这一次 RunLoop 运行
// 如果是 [NSRunLoop run] 启动的，外层会立即重新进入，所以看起来停不掉

// ===== 方式2：设置超时时间 =====
// runUntilDate: 到期后自动退出

// ===== 方式3：移除所有 Source 和 Timer =====
// 如果 Mode 中没有任何 Source、Timer，RunLoop 会自动退出

// ===== 方式4：外部标志位（配合 runMode:beforeDate:）=====
// 设置 shouldKeepRunning = NO，RunLoop 处理完当前事件后即退出循环
```

---

## 五、RunLoop 与 AutoreleasePool

### 5.1 主线程 AutoreleasePool 管理

```
系统在主线程 RunLoop 中注册了两个 Observer 来管理 AutoreleasePool：

Observer 1（优先级最高，最先调用）：
  监听 kCFRunLoopEntry
  回调：调用 _objc_autoreleasePoolPush()
  作用：进入 RunLoop 时创建一个 AutoreleasePool

Observer 2（优先级最低，最后调用）：
  监听 kCFRunLoopBeforeWaiting
  回调：先 _objc_autoreleasePoolPop()，再 _objc_autoreleasePoolPush()
  作用：休眠前释放旧 Pool，创建新 Pool

  监听 kCFRunLoopExit
  回调：_objc_autoreleasePoolPop()
  作用：退出 RunLoop 时释放最终的 Pool

整个过程：

  Entry → Push Pool
       ↓
  处理事件...（autorelease 对象加入当前 Pool）
       ↓
  BeforeWaiting → Pop Pool（释放对象）→ Push 新 Pool
       ↓
  休眠...
       ↓
  唤醒 → 处理事件...
       ↓
  BeforeWaiting → Pop Pool → Push 新 Pool
       ↓
  ...循环...
       ↓
  Exit → Pop Pool（释放最后的对象）

结论：
  主线程中的 autorelease 对象不是在作用域结束时释放，
  而是在 RunLoop 即将休眠（BeforeWaiting）时统一释放。
```

### 5.2 子线程的 AutoreleasePool

```objc
// 子线程的 autorelease 对象：
// - 如果没有手动创建 AutoreleasePool，系统会在需要时自动创建
// - 但自动创建的 Pool 何时释放不可预测
// - 最佳实践：在子线程中手动管理

- (void)backgroundTask {
    @autoreleasepool {
        // 大量创建临时对象时，手动嵌套 Pool 控制内存峰值
        for (int i = 0; i < 100000; i++) {
            @autoreleasepool {
                NSString *str = [NSString stringWithFormat:@"item_%d", i];
                // str 在内层 pool 结束时释放
                [self processString:str];
            }
        }
    }
}
```

---

## 六、RunLoop 与 GCD

### 6.1 dispatch_get_main_queue 与 RunLoop

```objc
// GCD dispatch 到主队列的任务，由主线程 RunLoop 来处理

dispatch_async(dispatch_get_main_queue(), ^{
    // 这个 block 会在主线程 RunLoop 的循环中被调用
    // RunLoop 在 Step 8 中检查是否有 dispatch_main_queue 的任务
});

// GCD 定时器不依赖 RunLoop
dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0,
                                                  dispatch_get_global_queue(0, 0));
dispatch_source_set_timer(timer,
                          dispatch_time(DISPATCH_TIME_NOW, 0),
                          1.0 * NSEC_PER_SEC,
                          0.01 * NSEC_PER_SEC);
dispatch_source_set_event_handler(timer, ^{
    NSLog(@"GCD Timer 触发");
});
dispatch_resume(timer);

// ⚠️ GCD Timer 与 NSTimer 的区别：
// NSTimer 依赖 RunLoop，受 Mode 切换影响
// GCD Timer 由 GCD 内核管理，不受 RunLoop Mode 影响，精度更高
```

---

## 七、常驻线程

### 7.1 创建常驻线程

```objc
// 场景：需要一个后台线程持续存活，随时可以派发任务
// 比如 AFNetworking 2.x 就创建了一个常驻线程来接收 NSURLConnection 的回调

@interface PermanentThread : NSObject
@property (nonatomic, strong) NSThread *innerThread;
@end

@implementation PermanentThread

- (instancetype)init {
    self = [super init];
    if (self) {
        self.innerThread = [[NSThread alloc] initWithTarget:self
                                                   selector:@selector(threadEntryPoint)
                                                     object:nil];
        [self.innerThread start];
    }
    return self;
}

- (void)threadEntryPoint {
    @autoreleasepool {
        // 添加一个 Port 保证 RunLoop 不会因为没有 Source 而退出
        [[NSRunLoop currentRunLoop] addPort:[NSMachPort port]
                                    forMode:NSDefaultRunLoopMode];

        // 可控退出方式
        _shouldKeepRunning = YES;
        while (_shouldKeepRunning) {
            [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                                     beforeDate:[NSDate distantFuture]];
        }
    }
}

// 在常驻线程上执行任务
- (void)executeTask:(void(^)(void))task {
    if (!self.innerThread) return;
    [self performSelector:@selector(innerExecuteTask:)
                 onThread:self.innerThread
               withObject:task
            waitUntilDone:NO];
}

- (void)innerExecuteTask:(void(^)(void))task {
    if (task) task();
}

// 停止常驻线程
- (void)stop {
    if (!self.innerThread) return;
    [self performSelector:@selector(innerStop)
                 onThread:self.innerThread
               withObject:nil
            waitUntilDone:YES];
    self.innerThread = nil;
}

- (void)innerStop {
    _shouldKeepRunning = NO;
    CFRunLoopStop(CFRunLoopGetCurrent());
}

- (void)dealloc {
    [self stop];
}

@end


// 使用
PermanentThread *thread = [[PermanentThread alloc] init];
[thread executeTask:^{
    NSLog(@"在常驻线程执行：%@", [NSThread currentThread]);
}];
// 不再需要时
[thread stop];
```

### 7.2 为什么需要添加 Port

```
RunLoop 启动后，如果当前 Mode 中没有任何 Source、Timer、Observer → 立即退出。

添加一个 NSMachPort（Source1）的作用：
  - 让 Mode 中存在至少一个 Source
  - 保证 RunLoop 不会因为 "Mode 为空" 而退出
  - 这个 Port 不需要真正收发消息，仅仅是为了维持 RunLoop 的运行

替代方案：
  // 也可以添加一个不会触发的 Timer
  [[NSRunLoop currentRunLoop] addTimer:[NSTimer timerWithTimeInterval:DBL_MAX
                                                               target:self
                                                             selector:@selector(noop)
                                                             userInfo:nil
                                                              repeats:YES]
                               forMode:NSDefaultRunLoopMode];
```

---

## 八、卡顿监控

### 8.1 原理

```
主线程卡顿的本质：RunLoop 在处理事件时耗时过长。

具体来说，卡顿可以理解为以下两个阶段耗时过长：
  1. kCFRunLoopBeforeSources → kCFRunLoopBeforeWaiting
     即处理 Source 的阶段（处理事件）
  2. kCFRunLoopAfterWaiting → 下一次 kCFRunLoopBeforeSources
     即唤醒后处理事件的阶段

监控思路：
  - 在子线程创建一个信号量（dispatch_semaphore）
  - 主线程 RunLoop 的 Observer 在关键节点发送信号（signal）
  - 子线程等待信号（wait），超时则判定为卡顿
```

### 8.2 实现

```objc
@interface LagMonitor : NSObject
@property (nonatomic, assign) CFRunLoopObserverRef observer;
@property (nonatomic, assign) CFRunLoopActivity currentActivity;
@property (nonatomic, strong) dispatch_semaphore_t semaphore;
@end

@implementation LagMonitor

- (void)startMonitoring {
    // 创建信号量
    self.semaphore = dispatch_semaphore_create(0);

    // 创建 Observer 监听 RunLoop 状态
    CFRunLoopObserverRef observer = CFRunLoopObserverCreateWithHandler(
        kCFAllocatorDefault,
        kCFRunLoopAllActivities,
        YES, 0,
        ^(CFRunLoopObserverRef obs, CFRunLoopActivity activity) {
            self.currentActivity = activity;
            // 每次 RunLoop 状态变化时发送信号
            dispatch_semaphore_signal(self.semaphore);
        }
    );
    CFRunLoopAddObserver(CFRunLoopGetMain(), observer, kCFRunLoopCommonModes);
    self.observer = observer;

    // 在子线程中持续监控
    dispatch_async(dispatch_get_global_queue(0, 0), ^{
        while (YES) {
            // 等待信号，超时时间设为 50ms（约 3 帧）
            long result = dispatch_semaphore_wait(self.semaphore,
                dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC));

            if (result != 0) {
                // 超时，说明 RunLoop 在某个阶段停留过久
                if (self.currentActivity == kCFRunLoopBeforeSources ||
                    self.currentActivity == kCFRunLoopAfterWaiting) {
                    // 主线程正在处理事件 → 卡顿
                    // 连续超时 N 次可以确认为卡顿（减少误报）
                    NSLog(@"检测到主线程卡顿，抓取调用栈...");
                    [self reportCallStack];
                }
            }
        }
    });
}

- (void)reportCallStack {
    // 使用 BSBacktraceLogger、PLCrashReporter 等工具抓取主线程调用栈
    // 上报到服务端进行分析
}

- (void)stopMonitoring {
    if (self.observer) {
        CFRunLoopRemoveObserver(CFRunLoopGetMain(), self.observer, kCFRunLoopCommonModes);
        CFRelease(self.observer);
        self.observer = NULL;
    }
}

@end
```

---

## 九、RunLoop 与 performSelector

### 9.1 各种 performSelector 与 RunLoop 的关系

```objc
// ===== 1. performSelector:withObject:afterDelay: =====
[self performSelector:@selector(doWork) withObject:nil afterDelay:2.0];
// 内部创建一个 Timer 加入当前线程的 RunLoop
// ⚠️ 如果当前线程没有 RunLoop（子线程），则不会执行！

// 子线程中正确使用：
dispatch_async(dispatch_get_global_queue(0, 0), ^{
    [self performSelector:@selector(doWork) withObject:nil afterDelay:2.0];
    [[NSRunLoop currentRunLoop] run];  // 必须开启 RunLoop
});


// ===== 2. performSelector:onThread:withObject:waitUntilDone: =====
[self performSelector:@selector(doWork)
             onThread:someThread
           withObject:nil
        waitUntilDone:NO];
// 向目标线程的 RunLoop 提交一个 Source0 事件
// ⚠️ 目标线程必须有 RunLoop 在运行，否则不会执行


// ===== 3. performSelectorOnMainThread:withObject:waitUntilDone: =====
[self performSelectorOnMainThread:@selector(updateUI) withObject:nil waitUntilDone:NO];
// 等同于在主线程 RunLoop 中添加 Source0
// 主线程 RunLoop 始终运行，所以总是有效的


// ===== 4. performSelector:withObject:afterDelay:inModes: =====
[self performSelector:@selector(doWork)
           withObject:nil
           afterDelay:2.0
              inModes:@[NSRunLoopCommonModes]];
// 可以指定 Mode，解决 Timer 在滑动时不触发的问题


// ===== 5. cancelPreviousPerformRequestsWithTarget: =====
[NSObject cancelPreviousPerformRequestsWithTarget:self
                                         selector:@selector(doWork)
                                           object:nil];
// 取消之前通过 performSelector:afterDelay: 安排的调用
```

---

## 十、RunLoop 任务分发（优化大量任务）

### 10.1 利用 RunLoop 分散任务

```objc
// 场景：一次性需要加载大量 Cell 或图片，造成卡顿
// 思路：将任务拆散，每次 RunLoop 循环只执行一个小任务

typedef void(^RunLoopTask)(void);

@interface TaskDistributor : NSObject
@property (nonatomic, strong) NSMutableArray<RunLoopTask> *tasks;
@property (nonatomic, assign) NSUInteger maxTasksPerLoop;  // 每次循环最多执行几个任务
@end

@implementation TaskDistributor

- (instancetype)init {
    self = [super init];
    if (self) {
        _tasks = [NSMutableArray array];
        _maxTasksPerLoop = 1;
        [self setupRunLoopObserver];
    }
    return self;
}

- (void)addTask:(RunLoopTask)task {
    [self.tasks addObject:task];
}

- (void)setupRunLoopObserver {
    CFRunLoopObserverRef observer = CFRunLoopObserverCreateWithHandler(
        kCFAllocatorDefault,
        kCFRunLoopBeforeWaiting,  // 在即将休眠时执行
        YES, 0,
        ^(CFRunLoopObserverRef obs, CFRunLoopActivity activity) {
            if (self.tasks.count == 0) return;

            // 每次 RunLoop 循环取出一个（或几个）任务执行
            NSUInteger count = MIN(self.maxTasksPerLoop, self.tasks.count);
            for (NSUInteger i = 0; i < count; i++) {
                RunLoopTask task = self.tasks.firstObject;
                [self.tasks removeObjectAtIndex:0];
                if (task) task();
            }
        }
    );
    CFRunLoopAddObserver(CFRunLoopGetMain(), observer, kCFRunLoopCommonModes);
}

@end


// 使用示例：TableView 加载大量图片
TaskDistributor *distributor = [[TaskDistributor alloc] init];

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"Cell"
                                                           forIndexPath:indexPath];
    // 基本内容先设置
    cell.textLabel.text = self.dataList[indexPath.row];

    // 图片加载放入任务分发器，每次 RunLoop 循环加载一张
    [distributor addTask:^{
        UIImage *image = [self loadImageForIndex:indexPath.row];
        UITableViewCell *targetCell = [tableView cellForRowAtIndexPath:indexPath];
        targetCell.imageView.image = image;
    }];

    return cell;
}
```

---

## 十一、RunLoop 在系统框架中的应用

### 11.1 系统使用 RunLoop 的典型场景

```
1. AutoreleasePool 管理（详见第五章）
   - 主线程 RunLoop 通过 Observer 在 Entry/BeforeWaiting/Exit 时 push/pop Pool

2. 事件响应
   - 触摸事件通过 Source1 接收（IOHIDEvent → Mach Port）
   - 然后封装为 Source0 进行分发（UIApplicationHandleEventQueue）

3. 手势识别
   - 识别到手势后，通过 Source0 标记待处理
   - RunLoop 在 BeforeWaiting 时处理手势回调

4. UI 更新
   - setNeedsLayout / setNeedsDisplay 不会立即触发
   - 而是标记为待处理，在 RunLoop 的 BeforeWaiting 时统一处理
   - 这就是为什么连续多次调用 setNeedsLayout 只会触发一次 layoutSubviews

5. NSTimer
   - Timer 加入 RunLoop 的指定 Mode
   - RunLoop 在循环中检查并触发到期的 Timer

6. performSelector:afterDelay:
   - 内部创建 Timer 加入 RunLoop

7. CADisplayLink
   - 内部通过 Source1（vsync 信号通过 Mach Port）触发
   - 每次屏幕刷新时回调

8. Networking
   - NSURLConnection / NSURLSession 的底层使用 RunLoop 处理回调
   - AFNetworking 2.x 创建常驻线程，在 RunLoop 上监听 Source1
```

---

## 十二、Swift 中使用 RunLoop

### 12.1 Swift RunLoop API

```swift
// 获取 RunLoop
let mainLoop = RunLoop.main
let currentLoop = RunLoop.current

// 获取 CFRunLoop
let cfLoop = mainLoop.getCFRunLoop()

// 添加 Timer
let timer = Timer(timeInterval: 1.0, repeats: true) { timer in
    print("Timer fired")
}
RunLoop.main.add(timer, forMode: .common)

// Timer 的 block 版本（iOS 10+）
Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
    print("Timer fired")
}

// 使用 RunLoop.Mode
RunLoop.main.add(timer, forMode: .default)     // NSDefaultRunLoopMode
RunLoop.main.add(timer, forMode: .tracking)    // UITrackingRunLoopMode
RunLoop.main.add(timer, forMode: .common)      // NSRunLoopCommonModes

// 运行 RunLoop
RunLoop.current.run()
RunLoop.current.run(until: Date(timeIntervalSinceNow: 10))
RunLoop.current.run(mode: .default, before: .distantFuture)

// 添加 Observer（需要使用 CF API）
let observer = CFRunLoopObserverCreateWithHandler(kCFAllocatorDefault,
    CFRunLoopActivity.allActivities.rawValue, true, 0) { _, activity in
    switch activity {
    case .entry:         print("进入 RunLoop")
    case .beforeTimers:  print("即将处理 Timer")
    case .beforeSources: print("即将处理 Source")
    case .beforeWaiting: print("即将休眠")
    case .afterWaiting:  print("被唤醒")
    case .exit:          print("退出 RunLoop")
    default: break
    }
}
CFRunLoopAddObserver(CFRunLoopGetMain(), observer, CFRunLoopMode.commonModes)
```

### 12.2 Swift Concurrency 与 RunLoop

```swift
// Swift Concurrency 的 async/await 模型与 RunLoop 的关系：

// 1. @MainActor 任务最终由主线程 RunLoop 调度
@MainActor
func updateUI() {
    // 在主线程 RunLoop 循环中执行
    label.text = "Updated"
}

// 2. GCD dispatch 到主线程的任务由 RunLoop 处理
Task { @MainActor in
    // 底层仍然通过 RunLoop 调度到主线程
    self.view.backgroundColor = .red
}

// 3. Combine 中的 RunLoop Scheduler
import Combine

let publisher = Timer.publish(every: 1.0, on: .main, in: .common)
    .autoconnect()
    .sink { date in
        print("Combine Timer: \(date)")
    }

// RunLoop 可以作为 Combine 的 Scheduler
publisher
    .receive(on: RunLoop.main)
    .sink { value in
        // 在主线程 RunLoop 中接收
    }
```

---

## 十三、常见面试题

### Q1：什么是 RunLoop？它和线程的关系是什么？

```
RunLoop 是管理线程事件和消息的循环机制。
它让线程在没有任务时休眠（节省 CPU），有任务时被唤醒处理。

与线程的关系：
  - 一一对应，存在全局 Dictionary 中
  - 主线程 RunLoop 自动创建
  - 子线程 RunLoop 懒加载，首次获取时创建
  - 随线程销毁而销毁
  - 不能手动创建，只能通过 API 获取
```

### Q2：RunLoop 有哪些 Mode？为什么 Timer 在滑动时会停？怎么解决？

```
常用 Mode：
  - NSDefaultRunLoopMode：默认模式
  - UITrackingRunLoopMode：ScrollView 滑动时的模式
  - NSRunLoopCommonModes：标记集合（包含 Default + Tracking）

Timer 停止的原因：
  NSTimer 默认加入 DefaultMode。滑动 ScrollView 时 RunLoop 切换到 TrackingMode，
  DefaultMode 中的 Timer 就不会被处理。

解决方案：
  1. 将 Timer 加入 CommonModes
  2. 使用 GCD Timer（不受 RunLoop Mode 影响）
```

### Q3：RunLoop 内部流程是怎样的？

```
Entry → 通知 BeforeTimers → 通知 BeforeSources → 处理 Source0
     → 如果有 Source1 就绪则处理
     → 通知 BeforeWaiting → 休眠（mach_msg）
     → 唤醒 → 通知 AfterWaiting → 处理事件（Timer/Source1/GCD 主队列）
     → 判断是否退出 → 循环或退出

休眠通过 mach_msg() 系统调用实现真正的线程挂起。
```

### Q4：AutoreleasePool 和 RunLoop 的关系？

```
主线程 RunLoop 注册了两个 Observer：
  1. Entry 时 Push Pool
  2. BeforeWaiting 时 Pop Pool + Push 新 Pool（释放旧对象）
  3. Exit 时 Pop Pool

所以主线程的 autorelease 对象是在 RunLoop 即将休眠时统一释放，
而不是在变量作用域结束时释放。
```

### Q5：如何利用 RunLoop 实现卡顿监控？

```
原理：主线程 RunLoop 在处理事件阶段（BeforeSources 到 BeforeWaiting，
或 AfterWaiting 到下一次循环）如果耗时过长，就是卡顿。

实现：
  1. 添加 Observer 监听 RunLoop 状态
  2. 子线程用信号量等待，设置超时阈值（如 50ms）
  3. 超时且处于事件处理阶段 → 判定卡顿
  4. 抓取主线程调用栈上报分析
```

### Q6：如何创建一个常驻线程？

```
1. 创建 NSThread 并启动
2. 在线程入口中获取 RunLoop
3. 添加一个 Source（如 NSMachPort）防止 RunLoop 因空 Mode 退出
4. 使用 runMode:beforeDate: 启动 RunLoop（可控退出）
5. 通过标志位控制 RunLoop 退出

注意：
  - [NSRunLoop run] 无法停止，需要用 runMode:beforeDate: + 标志位
  - 必须添加 Source 或 Timer 保持 RunLoop 运行
```

### Q7：NSTimer 和 GCD Timer 有什么区别？

```
NSTimer：
  - 依赖 RunLoop，必须加入 RunLoop 才能触发
  - 受 RunLoop Mode 切换影响（滑动时可能暂停）
  - 精度受 RunLoop 当前任务影响，可能延迟
  - 有 target 循环引用风险

GCD Timer（dispatch_source_t）：
  - 不依赖 RunLoop，由 GCD 内核管理
  - 不受 Mode 切换影响
  - 精度更高
  - 无循环引用问题（block 捕获方式不同）
  - 需要手动管理生命周期（resume/cancel）
```

### Q8：[NSRunLoop run] 和 runMode:beforeDate: 有什么区别？

```
[NSRunLoop run]：
  - 内部无限调用 runMode:beforeDate:
  - 无法被 CFRunLoopStop 真正停止
  - 适合永远不需要退出的场景

runMode:beforeDate:：
  - 每次只处理一个事件就返回
  - 可以配合外部标志位精确控制退出
  - 可以被 CFRunLoopStop 停止
  - 推荐在需要可控退出的场景使用
```

### Q9：RunLoop 和 UI 刷新的关系？

```
setNeedsLayout / setNeedsDisplay 调用后不会立即执行：
  - 它们只是标记 "需要刷新"
  - 在 RunLoop 的 BeforeWaiting 阶段，系统统一执行 layout 和 display
  - 这就是为什么多次调用 setNeedsLayout 只触发一次 layoutSubviews

CATransaction 的提交也在 BeforeWaiting 时执行：
  - 隐式动画、视图属性变化等都通过 CATransaction 管理
  - RunLoop 即将休眠时提交所有待处理的 Transaction
```

### Q10：Source0 和 Source1 的区别？

```
Source0：
  - 非基于端口，需要手动触发
  - 需要先 Signal 再 WakeUp
  - 典型场景：触摸事件分发、performSelector:onThread:

Source1：
  - 基于 Mach Port，内核自动触发
  - 通过端口消息唤醒 RunLoop
  - 典型场景：硬件事件的初始接收、进程间通信

触摸事件的传递就同时涉及两者：
  Source1 接收 IOHIDEvent → 转换 → Source0 分发 UIEvent
```

### Q10 扩展：CFRunLoopSource0 vs Source1 深度解析

```
Source0（非基于端口）：
  - 由应用层手动 signal，本质是一个函数指针回调
  - 必须先通过 CFRunLoopPerformSignal 唤醒 RunLoop，再执行回调
  - 典型 API：CFRunLoopSourceCreate(order, context, perform)
  - 典型场景：dispatch_async 到主线程、performSelector:onThread:

Source1（基于 Mach Port）：
  - 由内核通过 Mach Port 消息自动通知，不依赖手动唤醒
  - 注册到 RunLoop 的 Port Set，内核有事件时自动 wake up
  - 典型 API：CFMachPortRef / CFMessagePortRef
  - 典型场景：IOKit 硬件事件、CFMessagePort 进程通信

关键区别：
  - Source0：用户态触发，需要外部唤醒 RunLoop（不能休眠时响应）
  - Source1：内核态触发，自动唤醒 RunLoop（可休眠等待）

实际触摸事件链路：
  Source1(IOGentleShutdown) → IOHIDLib 接收 → NSEvent → Source0 分发到 UIApplication
```

代码示例：

```swift
// 创建 Source0 示例
var context = CFRunLoopSourceContext(version: 0)
context.perform = { info in
    if let block = info as? (() -> Void) { block() }
}
let source = CFRunLoopSourceCreate(nil, 0, &context)
CFRunLoopAddSource(CFRunLoopGetMain(), source, .defaultMode)

// Signal 触发（必须手动唤醒）
CFRunLoopPerformSignal(source)
CFRunLoopWakeUp(CFRunLoopGetMain())
```

💣 Pitfalls：Source0 不会自动唤醒 RunLoop，RunLoop 处于休眠状态时 signal 不会立即执行，必须配合 WakeUp 调用。

✅ Best Practice：主线程异步任务优先使用 GCD（dispatch_get_main_queue），仅在需要与 RunLoop 深度集成时才手动创建 Source。

### Q11：CFRunLoopObserver 各阶段详解

CFRunLoopObserver 可以在 RunLoop 生命周期中的 7 个关键节点被回调，是监控和干预 RunLoop 行为的核心机制：

```
Entry         → RunLoop 即将开始处理事件
BeforeTimers  → 即将处理 Timer（NSTimer 触发前）
BeforeSources → 即将处理 Source（触摸事件处理前）
BeforeWaiting → 即将进入休眠（在此刻添加 Timer 可防止休眠）
AfterWaiting  → 刚从休眠唤醒
Exit          → RunLoop 即将结束本次循环
Stop          → RunLoop 停止运行
```

最典型的用途：在 BeforeWaiting 阶段插入源，实现「懒加载定时器」——只有 RunLoop 即将休眠时才注册 Timer，避免不必要的 wake-up。

代码示例：

```swift
let context = UnsafeMutableRawPointer(Unmanaged.passRetained(42).toOpaque())
var ctx = CFRunLoopObserverContext(version: 0, info: context, retain: nil, release: nil, copyDescription: nil)

let observer = CFRunLoopObserverCreate(kCFAllocatorDefault,
    CFRunLoopActivity.BeforeWaiting.rawValue,  // 监听阶段
    true, 0, { observer, activity in
        print("RunLoop 即将进入休眠，activity: \(activity)")
    }, &ctx)

CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
```

💣 Pitfalls：Observer 的 activity 参数是位掩码，一个回调可能收到多个阶段（如 Entry | Exit），需用位运算逐一判断。

✅ Best Practice：将 Observer 添加到 .commonModes 而非 .defaultMode，确保在 UI 交互场景下也能被触发。

### GCD 队列与 RunLoop 的关联（主队列）

GCD 的主队列（main queue）本质上是 RunLoop 的一个 Source0。当你 dispatch_async 到主队列时，任务被放入 RunLoop 的事件队列中，由 RunLoop 在下一个循环迭代时执行。这意味着：**RunLoop 是 GCD 主队列的执行引擎**。

```swift
// GCD 主队列 → RunLoop 内部 Source0
DispatchQueue.main.async {
    print("这条任务由 RunLoop 调度执行")
}

// 等价于在 RunLoop 中注册一个 Source0 的 perform block
var context = CFRunLoopSourceContext(version: 0)
context.perform = { _ in
    print("同等的 RunLoop 调用方式")
}
let source = CFRunLoopSourceCreate(nil, 0, &context)
CFRunLoopAddSource(CFRunLoopGetMain(), source, .defaultMode)
CFRunLoopPerformSignal(source)
```

**关键机制：**
- 子线程的 GCD 队列使用内部线程池，与 RunLoop 无关
- 只有主队列（dispatch_get_main_queue）才依赖主线程 RunLoop
- RunLoop 停止后（如 main() 结束），主队列不再执行任何任务
- `RunLoop.main.run()` 就是保持主线程 RunLoop 持续运行的入口

💣 Pitfalls：在主线程同步 dispatch（`DispatchQueue.main.sync`）会导致死锁——当前线程的 RunLoop 被阻塞，无法执行队首的同步任务。

✅ Best Practice：理解 GCD 主队列与 RunLoop 的绑定关系，才能解释为何 UI 更新必须在主线程且为何 `@MainActor` 能正确工作。

### NSTimer 基于 RunLoop 的调度

NSTimer 是通过向 RunLoop 注册 Timer 模式端口来实现定时触发的。创建 timer 时，默认添加到当前 RunLoop 的 `.defaultMode`。当 RunLoop 进入事件循环，会在 Timer 触发时刻前唤醒并执行其回调。

```swift
// Timer 自动加入当前 RunLoop 的 defaultMode
let timer = Timer(timeInterval: 1.0, repeats: true) { _ in
    print("每秒触发一次")
}
RunLoop.current.add(timer, forMode: .defaultMode)

// 更常见的写法：scheduledTimer 自动 add + fire
let timer2 = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    print("自动添加到当前 RunLoop")
}
```

**核心机制：**
- Timer 是 RunLoop 的 Timer 输入源，RunLoop 内部维护一个按触发时间排序的 Timer 列表
- RunLoop 每次迭代时检查是否有到期的 Timer，有的话激活执行
- Timer 回调精度非绝对：RunLoop 进入休眠/处理其他事件时可能延迟触发，典型偏差 50-200ms
- 滚动交互时 `.defaultMode` 的 Timer 暂停（因 RunLoop 切换到 `.trackingMode`）

💣 Pitfalls：滚动 UITableView 时 defaultMode 的 Timer 会暂停，导致定时任务中断。这是最常见的 Timer "不工作" 原因。

✅ Best Practice：需要滚动时持续触发的 Timer，使用 `.commonModes` 或切换为 CADisplayLink。精度要求高时永远不要用 NSTimer，改用 CADisplayLink 或 GCD 方案。


### RunLoop 与 CADisplayLink 的交互

CADisplayLink 是一个与屏幕刷新率同步的定时器，其内部通过向 RunLoop 注册一个特殊 Timer 实现。与 NSTimer 不同，CADisplayLink 的回调在每次屏幕刷新**之前**触发，保证与 display server 的 VSync 信号对齐。

```swift
// CADisplayLink 绑定到 RunLoop，每帧触发一次（60Hz = ~16.67ms）
let link = CADisplayLink(target: self, selector: #selector(onTick))
link.add(to: .main, forMode: .default)

@objc func onTick(link: CADisplayLink) {
    print("当前帧时间戳: \(link.timestamp)")
    print("累积运行时间: \(link.duration)")  // 每帧间隔
}
```

**RunLoop 交互机制：**
- CADisplayLink 底层注册为 RunLoop Timer，但由 display server 通过 port 通知唤醒
- RunLoop 收到 VSync 信号 → 激活 CADisplayLink Timer → 执行 selector 回调 → 继续渲染管道
- 若回调执行时间超过一帧（>16.67ms），CADisplayLink 自动跳帧，不会累积 backlog
- 通过 `link.isPaused` 控制暂停/恢复，比 invalidate + 重建更高效

💣 Pitfalls：CADisplayLink 回调在主线程执行，耗时操作会阻塞渲染管道导致掉帧，回调内只做轻量计算。

✅ Best Practice：动画循环优先使用 CADisplayLink 而非 NSTimer，利用 `timestamp` 计算 delta 时间实现帧率无关的运动逻辑。

### RunLoop 模式（Default、Tracking、ModalPanel、Hosting）

RunLoop 通过 NSRunLoopMode 实现互斥的事件处理分组。同一时刻只有一个 Mode 活跃，该 Mode 内的 Source/Timer/Observer 才会被响应，其他 Mode 中的事件源被暂时挂起。

```swift
// 四个系统预定义 Mode
RunLoop.main.run(mode: .default, before: Date())  // 默认模式，90%场景使用
RunLoop.main.run(mode: .tracking, before: Date())  // 用户追踪模式（滚动/拖拽）
RunLoop.main.run(mode: .eventTracking, before: Date()) // iOS 9+ 取代 .tracking
// .commonModes 是集合，添加到 commonModes 的 source 在所有默认 mode 中生效

// 将 Timer 加入 common 模式 —— 滚动时不停止
timer.add(to: .main, forMode: .common)  // 同时存在于 default + tracking + modalPanel
```

**核心机制：**
- `.defaultMode`：RunLoop 空闲状态使用的模式，处理普通事件和 Timer
- `.trackingMode`（NSRunLoopCommonModes）：ScrollView 滚动时自动切换到此模式
- `.commonModes` 不是真实 Mode，而是模式集合别名 —— 向 commonModes 注册的 source 会同步到 default、tracking、modalPanel
- 开发者可自定义 Mode：`RunLoopMode(rawValue: "CustomMode")`，实现完全隔离的事件通道

💣 Pitfalls：自定义 Mode 必须手动调用 `run(mode:before:)` 激活，RunLoop 不会自动进入自定义 Mode。

✅ Best Practice：后台线程如需 RunLoop 处理自定义 source，先添加一个永不触发的 Timer 到 commonMode 防止 RunLoop 退出，再注册真正的 source。


### NSConnection / Port Set 内部机制

NSConnection 是 macOS/iOS 底层 IPC 机制，基于 Mach port 实现进程间通信。每个 NSPort 对应一个 Mach receive port，RunLoop 通过 CFRunLoopAddSource 将其注册为 Source1（基于端口的事件源）。当 Mach 消息到达时，kernel 通过 port set 统一通知，RunLoop 唤醒并分发消息到对应 Port。

```swift
// NSPortDriver 底层实现 —— 每个驱动绑定一个 Mach port
let conn = NSMachPortWrapper().connection
conn.listen(on: nil, withParameters: nil)  // 注册到当前 RunLoop 的 defaultMode
conn.requestReceivers(onConnection: conn)   // 开始接收消息
// 内部流程:
//   1. mach_port_allocate(MACH_MSGH_TYPE_RECEIVE) 创建 receive port
//   2. port_set 将多个 receive port 聚合为一个通知端口
//   3. CFRunLoopAddSource 注册到 RunLoop
//   4. __CFPortPerform 在 kernel 通知时执行 dispatch 回调
```

**Port Set 机制：**
- port set 是 Mach 提供的端口聚合机制，多个 receive port 加入一个 port set
- 只要任一 member port 收到消息，port set 本身被标记为活跃
- RunLoop 只需监听一个 port set 即可管理所有 NSPort，避免 CFSocketDispatcher 轮询
- NSConnection 利用此机制实现多客户端同时连接，kernel 层统一通知后由用户态分发

💣 Pitfalls：NSPort 回调在主线程 RunLoop 中执行，大消息处理会阻塞 UI，需异步转发到后台队列。
✅ Best Practice：现代开发优先使用 XPC 替代 NSConnection，XPC 提供更安全的进程隔离、自动重启和多线程支持。

### RunLoop 阻塞与超时策略

RunLoop 提供多种阻塞等待机制，核心区别在于是否需要等待特定事件以及是否支持超时退出。开发中最常见的是 `run(mode:before:)` 带超时的调用方式和 `run()` 无限阻塞。

```swift
// 方式1：超时阻塞 —— 等待直到 CF 类型时间或事件触发
let nextFireDate = Date(timeIntervalSinceNow: 5.0)
RunLoop.current.run(mode: .default, before: nextFireDate)
// 返回 false 表示超时退出（无事件），true 表示有事件处理

// 方式2：无限阻塞 —— 直到手动停止（后台线程常用）
RunLoop.current.run()  // 等价于 CFRunLoopRun()

// 方式3：手动退出阻塞 —— 从外部线程唤醒
DispatchQueue.global().async {
    RunLoop.main.perform(inMode: .default) {
        // 这段代码会唤醒主线程 RunLoop
    }
}

// 方式4：配合 Condition 实现精准超时
let condition = NSCondition()
condition.wait(for: nextFireDate)  // 阻塞直到 signal() 或超时
```

**超时策略选择：**
- **UI 线程**：永远使用带超时的 `run(mode:before:)`，避免阻塞主线程
- **后台线程**：用 `run()` 无限阻塞 + `exit()` 退出，实现事件驱动循环
- **线程同步**：`NSCondition.wait(for:)` 比 RunLoop 阻塞更轻量，适合生产者-消费者模式
- **dispatch_semaphore**：C 语言级等待，优先级最高但需手动信号解除

💣 Pitfalls：`RunLoop.run()` 无限阻塞前必须确保至少有一个 Source/Timer/Observer 注册，否则 RunLoop 立即退出（无事件可等）。

✅ Best Practice：后台服务线程使用 `while running { runLoop.run(mode: .default, before: deadline) }` 循环模式，每次超时检查退出标志，实现优雅关闭。

### CADisplayLink 与 RunLoop 模式切换（滚动场景）

CADisplayLink 是一个精确到屏幕刷新率的 Timer（60Hz/120Hz），内部通过 `__CFLayerTimer` 绑定到 RunLoop。在 UIScrollView 滚动场景中，Apple 会将默认 mode 切换为 `UITrackingRunLoopMode`，此时普通 NSTimer 停止而 CADisplayLink 继续回调，确保滚动动画不卡顿。

```swift
// CADisplayLink 自动适配刷新率 —— ProMotion 下从 60Hz 动态跳到 120Hz
let link = CADisplayLink(target: self, selector: #selector(tick))
link.add(to: .main, forMode: .default)  // 添加后每帧触发一次 tick()
// 关键：link.timestamp 返回当前帧精确时间（CFTimeInterval）
// link.duration 返回当前刷新间隔（1/60 或 1/120 秒）
@objc func tick() {
    let elapsed = link.timestamp - startTimestamp
    view.alpha = min(elapsed / 2.0, 1.0)  // 基于时间的动画，不受帧率影响
}
```

**滚动模式切换机制：**
- 手指按下时：RunLoop 模式从 `.default` → `.tracking`，普通 Timer 暂停
- 手指释放后：短暂保持 `.tracking` 处理惯性滚动，再切回 `.default`
- CADisplayLink 若在 `.default` 注册，滚动期间会停止回调 → 动画卡顿
- 正确做法：同时在 `.default` 和 `.tracking` 注册，或使用 `.commonModes`

💣 Pitfalls：CADisplayLink 在锁屏/切后台时自动暂停，返回前台后 `timestamp` 会跳变，直接用 delta 计算会导致动画瞬移，需用 `abs(current - last)` 并设上限。
✅ Best Practice：自定义动画始终基于 `timestamp` 差值计算进度（time-based animation），而非帧计数器（frame-based），确保在不同刷新率设备上动画时长一致。

### TLS + RunLoop 模式用于线程本地数据

TLS（Thread Local Storage）与 RunLoop 的结合是 iOS 后台线程管理的核心模式。每个 NSThread 创建时自动分配独立的 RunLoop 实例，RunLoop 内部通过 pthread_key 存储线程上下文数据，形成天然的线程本地存储机制。理解这一模式对于 debug 多线程状态泄漏、避免跨线程数据竞争至关重要。

```swift
// 1. 每个线程有独立 RunLoop —— 主线程自动创建，后台线程需手动获取
let bgThread = Thread()
bgThread.start()
// 在后台线程内：
bgThread.install()  // 确保 RunLoop 被创建
RunLoop.current.perform {
    print(Thread.isMainThread)  // false
    print("线程专属 RunLoop:", RunLoop.current)
}

// 2. TLS 存储线程状态（线程安全，无需锁）
private var TLS_KEY: UInt8 = 0
func currentThreadContext() -> String? {
    return pthread_getspecific(&TLS_KEY) as? String
}
func setThreadContext(_ name: String) {
    pthread_setspecific(&TLS_KEY, UnsafeMutableRawPointer(&name))
}

// 3. RunLoop 自动感知线程生命周期 —— 线程退出时 RunLoop 自动释放
```

**TLS + RunLoop 模式要点：**
- **RunLoop 线程绑定**：`CFRunLoopGetCurrent()` 返回当前线程的 RunLoop，`CFRunLoopGetMain()` 始终返回主线程 RunLoop，二者不可混淆
- **线程状态追踪**：利用 TLS 存储每线程独立的 request ID、trace context，实现分布式追踪
- **自动清理**：pthread_key 支持 destructor 回调，线程退出时自动释放关联资源

💣 Pitfalls：后台线程的 RunLoop 默认不自动启动，必须调用 `RunLoop.current.run()` 或添加 Source/Timer 后才能响应 `perform` 事件，否则任务永远不执行。
✅ Best Practice：后台工作线程使用 `RunLoop.current.install()` + `perform` 模式调度任务，避免手动管理 pthread 复杂度和信号量同步。

### RunLoop 与能耗效率（空闲休眠）

RunLoop 是 iOS 能耗管理的核心机制：当 Source、Timer、Observer 全部空闲时，RunLoop 自动进入休眠状态，内核通过 `kevent()` 将线程挂起，CPU 释放给其他进程。这种 idle-to-sleep 的零开销等待是 App 低功耗的基础。一旦有事件到达（如触摸、网络响应），内核立即唤醒线程处理。

```swift
// 能耗优化：避免空闲线程轮询 —— RunLoop 自动休眠
// ❌ 轮询模式（CPU 持续占用，无法休眠）
while !hasNewData() { Thread.sleep(forTimeInterval: 0.01) }

// ✅ 事件驱动模式（RunLoop 自动挂起，CPU 空闲时释放）
let source = DispatchSource.makeTimerSource(queue: .main)
source.schedule(deadline: .now(), repeating: .infinity)  // 按需触发
source.setEventHandler { /* 仅在事件到达时执行 */ }
source.resume()

// 诊断工具：用 Instruments → Energy Log 定位 RunLoop 未休眠的线程
// CFRunLoopPerformBlock() 插入一次性能任务，不阻塞主循环
CFRunLoopPerformBlock(CFRunLoopGetMain(), nil, {
    print("仅在下次 RunLoop 迭代时执行 —— 零延迟插入")
})
```

**能耗关键点：**
- **自动休眠**：RunLoop 空转时调用 `mach_msg()` 进入内核等待，CPU 使用率趋近 0
- **唤醒源**：触摸事件、Timer 到期、Port 消息、`perform:` 插入，均可触发唤醒
- **后台模式**：进入后台后主 RunLoop 受限，长任务应使用 `BGTaskScheduler` 而非保持 RunLoop 活跃

💣 Pitfalls：后台线程调用 `RunLoop.current.run()` 会永久阻塞线程，必须配合 Timer 或 Port 设置超时，否则线程无法响应 deinit 或 cancellation 信号。
✅ Best Practice：优先用 GCD/Async-Await 替代手动 RunLoop 管理，确需保持线程活跃时使用 `CFRunLoopSource` 或 `NSPort` 作为可控唤醒源，定期用 Energy Log 审计线程唤醒频率。


### CFRunLoopGetMain() vs CFRunLoopGetCurrent()

`CFRunLoopGetMain()` 始终返回主线程的 RunLoop，`CFRunLoopGetCurrent()` 返回当前线程的 RunLoop。二者的核心区别在于绑定目标：前者固定指向主线程，后者取决于调用所在的线程上下文。在多线程环境中混用二者是导致事件调度错误的常见根源。

```swift
// ✅ 正确：在主线程获取主 RunLoop
DispatchQueue.main.async {
    let mainLoop = CFRunLoopGetMain()     // 主线程
    let currentLoop = CFRunLoopGetCurrent() // 也是主线程 —— 等价
    assert(mainLoop == currentLoop)
}

// ❌ 错误：在后台线程中用 GetMain 调度本应后台执行的任务
 DispatchQueue.global().async {
    let mainLoop = CFRunLoopGetMain()      // 拿到主线程 RunLoop
    let currentLoop = CFRunLoopGetCurrent() // 拿到后台线程 RunLoop
    assert(mainLoop != currentLoop)         // 二者不同！
    CFRunLoopPerformBlock(currentLoop, nil, { /* 后台执行 ✅ */ })
    CFRunLoopPerformBlock(mainLoop, nil, { /* 主线程执行 ✅ 但意图不同 */ })
}
```

💣 Pitfalls：在后台线程中误用 `CFRunLoopGetMain()` 导致任务被错误调度到主线程，或反之将主线程任务发到未初始化的后台 RunLoop 中丢失执行。
✅ Best Practice：需要跨线程调度时显式指定目标 RunLoop；同线程内优先用 `RunLoop.current`（Swift 层封装）替代 CF 函数，语义更清晰。


### Xcode Thread Sanitizer 在 RunLoop 上下文中的误报

Thread Sanitizer (TSan) 在检测 RunLoop 相关代码时频繁产生误报，因为 RunLoop 内部大量使用 `pthread_mutex`、`os_unfair_lock` 和 `mach_port` 等底层同步原语，而 TSan 无法识别这些 Apple 私有实现的互斥语义。最常见的误报场景：主线程 RunLoop 中的 Source 回调访问共享变量，以及 `CFRunLoopPerformBlock()` 跨线程调度时的数据竞争假阳性。

```swift
// 典型误报场景：RunLoop Source 回调访问全局变量
var sharedCounter = 0  // TSan 报告 "write of size 8 at 0x..."

let source = CFRunLoopSourceCreate(nil, 0, &context)
CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
// 触发 source → sharedCounter += 1 → TSan 误报 data race
// 实际上主线程是串行执行，不存在真正竞争

// 正确应对：使用 Thread Sanitizer 注解抑制已知误报
// 在项目根目录创建 tsan_suppressions.txt：
// race:CFRunLoopPerformBlock
// race:CFRunLoopSourceSignal
// 然后设置 Run Scheme → Diagnostics → Thread Sanitizer → Suppressiosns
```

💣 Pitfalls：盲目相信 TSan 报告删除 RunLoop 调度代码，或过度使用 `@synchronized` 锁定本不需要的共享变量，导致不必要的性能损耗。
✅ Best Practice：对 TSan 误报建立项目级 suppressions 文件，仅在确认真实竞争时使用 `DispatchBarrier` 或 `os_unfair_lock` 保护共享状态。
