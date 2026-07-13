# UIScrollView / UITableView / UICollectionView 详解

---

## 一、UIScrollView 基础

### 1.1 核心属性

```
UIScrollView 是所有滚动视图的基类，UITableView 和 UICollectionView 都继承自它。

核心坐标系统：

  ┌───────────────────────────────────────────┐
  │            contentSize（内容大小）           │
  │                                           │
  │    ┌─────────────────────┐                │
  │    │                     │ ← bounds       │
  │    │    屏幕可见区域       │  （视口大小）    │
  │    │                     │                │
  │    └─────────────────────┘                │
  │         ↑                                 │
  │    contentOffset                          │
  │    （内容偏移量，即左上角相对于内容原点的偏移）  │
  │                                           │
  └───────────────────────────────────────────┘

三个最重要的属性：
  - contentSize：内容的完整大小（宽高），决定了能滚动多远
  - contentOffset：当前滚动到的位置（CGPoint）
  - contentInset：内容区域的内边距（UIEdgeInsets）

它们之间的关系：
  实际可滚动范围 = contentSize + contentInset - bounds.size
  最大 contentOffset.y = contentSize.height + contentInset.bottom - bounds.height
  最小 contentOffset.y = -contentInset.top
```

### 1.2 contentInset 与 adjustedContentInset

```
iOS 11 之后，contentInset 的行为发生了重要变化：

  contentInset（开发者设置的）：
    scrollView.contentInset = UIEdgeInsets(top: 20, left: 0, bottom: 20, right: 0)

  safeAreaInsets（系统自动计算的安全区域）：
    例如导航栏 + 状态栏 = 顶部 88pt

  adjustedContentInset（最终生效的 Inset）：
    = contentInset + 系统自动调整的部分

  contentInsetAdjustmentBehavior（控制系统自动调整行为）：
    .automatic    — 默认值，自动调整（推荐）
    .scrollableAxes — 只在可滚动方向调整
    .never        — 不自动调整（内容会被导航栏遮挡）
    .always       — 总是调整

  常见坑：
    设置了 contentInset 但内容位置不对，通常是因为系统又叠加了 safeAreaInsets。
    如果需要完全自己控制，设置 contentInsetAdjustmentBehavior = .never。
```

### 1.3 滚动行为控制

```objc
// 分页滚动
scrollView.isPagingEnabled = YES;
// 每次滚动整数倍的 bounds.size，常用于图片轮播、引导页

// 弹性效果
scrollView.bounces = YES;            // 滚动到边缘是否弹性回弹
scrollView.alwaysBounceVertical = YES;  // 内容不足也允许垂直弹性（下拉刷新必须开启）
scrollView.alwaysBounceHorizontal = NO;

// 滚动指示器
scrollView.showsVerticalScrollIndicator = YES;
scrollView.showsHorizontalScrollIndicator = NO;

// 减速速率
scrollView.decelerationRate = .normal;   // .normal 或 .fast

// 滚动到顶部（点击状态栏）
scrollView.scrollsToTop = YES;
// 坑：如果页面有多个 scrollView，只有一个 scrollsToTop = YES 才会生效
// 如果多个都设为 YES，点击状态栏不会滚动任何一个

// 方向锁定
scrollView.isDirectionalLockEnabled = YES;
// 开启后，开始滚动时只能在一个方向（水平或垂直）滚动
```

### 1.4 常用代理方法

```objc
// 正在滚动（手指拖拽或惯性滚动时持续回调）
- (void)scrollViewDidScroll:(UIScrollView *)scrollView {
    CGFloat offsetY = scrollView.contentOffset.y;
    // 常用于：导航栏渐变、下拉刷新状态判断、上拉加载更多判断
}

// 开始拖拽
- (void)scrollViewWillBeginDragging:(UIScrollView *)scrollView {
    // 常用于：停止播放视频、暂停动画
}

// 将要结束拖拽（手指即将抬起）
- (void)scrollViewWillEndDragging:(UIScrollView *)scrollView
                     withVelocity:(CGPoint)velocity
              targetContentOffset:(inout CGPoint *)targetContentOffset {
    // velocity：手指离开时的速度
    // targetContentOffset：预计停止的位置（可以修改它来实现自定义停靠）
    // 常用于：自定义分页大小（比如每次滚动一个 Cell 的宽度）
}

// 结束拖拽
- (void)scrollViewDidEndDragging:(UIScrollView *)scrollView
                  willDecelerate:(BOOL)decelerate {
    // decelerate = YES 表示还会惯性滑动
    // decelerate = NO 表示直接停止
}

// 减速滚动结束（惯性滑动完全停止）
- (void)scrollViewDidEndDecelerating:(UIScrollView *)scrollView {
    // 常用于：分页后更新页码、加载当前页数据
}

// 代码触发的滚动结束
- (void)scrollViewDidEndScrollingAnimation:(UIScrollView *)scrollView {
    // setContentOffset:animated: 或 scrollRectToVisible:animated: 触发
}
```

### 1.5 UIScrollView 常见问题与坑

```
坑 1：contentSize 设置为 CGSizeZero 却能滚动
  原因：alwaysBounceVertical / alwaysBounceHorizontal 为 YES
  内容不够也能拉动弹回

坑 2：嵌套 ScrollView 手势冲突
  场景：横向 ScrollView 嵌套纵向 ScrollView（如首页 Tab + 列表）
  问题：滑动方向识别不准，容易误触
  解决：
    - 开启 isDirectionalLockEnabled
    - 自定义手势识别，重写 gestureRecognizerShouldBegin:
    - 使用 UIScrollViewDelegate 协调滚动

坑 3：键盘遮挡输入框
  ScrollView 中的 TextField 被键盘遮挡
  解决：
    - 监听 UIResponder.keyboardWillShowNotification
    - 调整 contentInset.bottom = 键盘高度
    - 或使用 scrollRectToVisible 把输入框滚到可见区域

坑 4：Auto Layout 下 contentSize 不对
  原因：ScrollView 的 contentSize 由子视图的约束决定
  规则：子视图必须同时有上下左右的约束到 ScrollView 的 contentLayoutGuide，
        并且子视图本身必须有明确的宽高
  推荐做法：
    - 在 ScrollView 内放一个 contentView
    - contentView 四边约束到 contentLayoutGuide
    - contentView 宽度约束到 frameLayoutGuide（锁定宽度，只纵向滚动）

坑 5：scrollViewDidScroll 频繁回调导致性能问题
  原因：每一帧都回调，在里面做重操作会卡顿
  解决：使用节流（throttle），或在回调中只做轻量计算
```

---

## 二、UITableView 基础用法

### 2.1 数据源与代理模式

```objc
// UITableViewDataSource — 提供数据
@protocol UITableViewDataSource
@required
// 每个 Section 有几行
- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section;
// 每一行的 Cell
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath;
@optional
// 有几个 Section
- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView;
// Section 标题
- (NSString *)tableView:(UITableView *)tableView titleForHeaderInSection:(NSInteger)section;
// 编辑：是否允许编辑
- (BOOL)tableView:(UITableView *)tableView canEditRowAtIndexPath:(NSIndexPath *)indexPath;
// 编辑：提交编辑操作
- (void)tableView:(UITableView *)tableView commitEditingStyle:(UITableViewCellEditingStyle)editingStyle
                                            forRowAtIndexPath:(NSIndexPath *)indexPath;
// 移动：是否允许移动
- (BOOL)tableView:(UITableView *)tableView canMoveRowAtIndexPath:(NSIndexPath *)indexPath;
// 移动：处理移动
- (void)tableView:(UITableView *)tableView moveRowAtIndexPath:(NSIndexPath *)from
                                                  toIndexPath:(NSIndexPath *)to;
@end
```

```objc
// UITableViewDelegate — 交互与外观
@protocol UITableViewDelegate
@optional
// 选中行
- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath;
// 行高（动态高度时使用）
- (CGFloat)tableView:(UITableView *)tableView heightForRowAtIndexPath:(NSIndexPath *)indexPath;
// 预估行高（Self-Sizing Cell 优化）
- (CGFloat)tableView:(UITableView *)tableView estimatedHeightForRowAtIndexPath:(NSIndexPath *)indexPath;
// Header / Footer 视图
- (UIView *)tableView:(UITableView *)tableView viewForHeaderInSection:(NSInteger)section;
- (CGFloat)tableView:(UITableView *)tableView heightForHeaderInSection:(NSInteger)section;
// Cell 即将显示
- (void)tableView:(UITableView *)tableView willDisplayCell:(UITableViewCell *)cell
                                        forRowAtIndexPath:(NSIndexPath *)indexPath;
// Cell 结束显示
- (void)tableView:(UITableView *)tableView didEndDisplayingCell:(UITableViewCell *)cell
                                               forRowAtIndexPath:(NSIndexPath *)indexPath;
// 侧滑操作（iOS 11+）
- (UISwipeActionsConfiguration *)tableView:(UITableView *)tableView
    trailingSwipeActionsConfigurationForRowAtIndexPath:(NSIndexPath *)indexPath;
@end
```

### 2.2 Cell 注册与获取

```objc
// ====== 方式一：注册 Class ======
[tableView registerClass:[MyCell class] forCellReuseIdentifier:@"MyCell"];

// ====== 方式二：注册 Nib ======
UINib *nib = [UINib nibWithNibName:@"MyCell" bundle:nil];
[tableView registerNib:nib forCellReuseIdentifier:@"MyCell"];

// ====== 获取 Cell ======
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    MyCell *cell = [tableView dequeueReusableCellWithIdentifier:@"MyCell" forIndexPath:indexPath];
    // 配置 cell 数据
    cell.titleLabel.text = self.dataArray[indexPath.row];
    return cell;
}
```

```swift
// Swift 版本
tableView.register(MyCell.self, forCellReuseIdentifier: "MyCell")

func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "MyCell", for: indexPath) as! MyCell
    cell.titleLabel.text = dataArray[indexPath.row]
    return cell
}
```

```
两种 dequeue 方法的区别（重要）：

  1. dequeueReusableCellWithIdentifier:
     - 如果复用池没有可复用的 Cell，返回 nil
     - 调用者必须判断 nil 并手动创建
     - 老写法，不推荐

  2. dequeueReusableCellWithIdentifier:forIndexPath:（推荐）
     - 必须提前 register
     - 如果复用池没有，自动创建新的 Cell
     - 永远不会返回 nil
     - 如果忘记 register 会直接 Crash（常见问题）
```

### 2.3 Section Header / Footer

```objc
// 自定义 Section Header
- (UIView *)tableView:(UITableView *)tableView viewForHeaderInSection:(NSInteger)section {
    // 推荐使用复用机制
    MyHeaderView *header = [tableView dequeueReusableHeaderFooterViewWithIdentifier:@"Header"];
    header.titleLabel.text = self.sectionTitles[section];
    return header;
}

- (CGFloat)tableView:(UITableView *)tableView heightForHeaderInSection:(NSInteger)section {
    return 44.0;
}

// 注册 Header/Footer
[tableView registerClass:[MyHeaderView class] forHeaderFooterViewReuseIdentifier:@"Header"];
```

```
常见坑：

  坑 1：Plain 样式下 Header 悬浮
    UITableViewStylePlain 的 Section Header 会在滚动时悬停在顶部
    如果不需要悬停效果，使用 UITableViewStyleGrouped

  坑 2：Grouped 样式多了额外间距
    iOS 15+ 的 Grouped 样式默认有顶部额外间距
    修复：tableView.sectionHeaderTopPadding = 0（iOS 15+）

  坑 3：Header/Footer 返回 nil 但高度不为 0
    如果不需要 Header/Footer，高度必须返回 CGFloat.leastNormalMagnitude（不要返回 0）
    返回 0 在某些情况下会被系统忽略，使用默认高度

    - (CGFloat)tableView:(UITableView *)tableView heightForHeaderInSection:(NSInteger)section {
        return CGFLOAT_MIN; // 极小值，等同于没有 Header
    }
```

---

## 三、UITableView Cell 复用机制

### 3.1 复用池原理

```
Cell 复用是 TableView 性能的核心机制：

  没有复用的情况：
    1000 行数据 → 创建 1000 个 Cell → 内存爆炸

  复用的情况：
    屏幕只能显示 10 个 Cell → 实际只创建 10 + 几个缓冲 Cell

  复用池（Reuse Pool）工作原理：

  ┌──────────────────────────────────────────────┐
  │                 屏幕可见区域                    │
  │                                              │
  │  ┌──────────┐  Cell-A（显示第 5 行数据）       │
  │  ├──────────┤  Cell-B（显示第 6 行数据）       │
  │  ├──────────┤  Cell-C（显示第 7 行数据）       │
  │  ├──────────┤  Cell-D（显示第 8 行数据）       │
  │  ├──────────┤  Cell-E（显示第 9 行数据）       │
  │  └──────────┘  Cell-F（显示第 10 行数据）      │
  │                                              │
  └──────────────────────────────────────────────┘
       ↑ 向下滚动
  ┌──────────┐
  │  Cell-X   │  ← 滚出屏幕的 Cell 进入复用池
  └──────────┘

  当新 Cell 即将出现在屏幕底部：
    1. 先从复用池中查找相同 reuseIdentifier 的 Cell
    2. 如果找到 → 取出 Cell，调用 prepareForReuse，重新配置数据
    3. 如果没找到 → 创建新 Cell

  内部实现（简化）：
    复用池是一个字典：[String: [UITableViewCell]]
    Key 是 reuseIdentifier，Value 是可复用的 Cell 数组
```

### 3.2 prepareForReuse 的作用

```objc
// Cell 被从复用池取出时调用，用于重置状态
- (void)prepareForReuse {
    [super prepareForReuse];
    // 重置 Cell 的状态，避免数据残留

    self.titleLabel.text = nil;
    self.avatarImageView.image = nil;
    self.accessoryType = UITableViewCellAccessoryNone;

    // 取消正在进行的异步操作（非常重要！）
    [self.imageTask cancel];
    self.imageTask = nil;
}
```

```
为什么 prepareForReuse 如此重要：

  场景：一个展示用户头像的 Cell
    1. Cell-A 被用于第 1 行，开始异步加载用户 A 的头像
    2. 用户快速滚动，Cell-A 滚出屏幕，进入复用池
    3. Cell-A 被复用给第 20 行，开始加载用户 B 的头像
    4. 如果没有取消第 1 步的请求，用户 A 的头像可能后到，覆盖用户 B 的头像

  结果：头像显示错乱（复用导致的数据错乱是最常见的 Bug）

  最佳实践：
    1. 在 prepareForReuse 中取消所有异步操作
    2. 在 cellForRowAt 中配置数据时先设置占位图
    3. 异步回调中检查 Cell 是否还对应同一个 IndexPath
```

### 3.3 复用导致的常见问题

```
问题 1：Cell 数据错乱

  现象：快速滚动时，Cell 显示了错误的数据
  原因：异步加载完成时 Cell 已被复用给其他行
  解决方案：

  方案 A：在回调中验证 IndexPath
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "Cell", for: indexPath) as! MyCell
        let model = dataArray[indexPath.row]
        cell.tag = indexPath.row  // 标记当前行
        loadImage(url: model.imageURL) { image in
            if cell.tag == indexPath.row {  // 检查 Cell 是否还是这一行
                cell.avatarImageView.image = image
            }
        }
        return cell
    }

  方案 B：使用 Kingfisher / SDWebImage 等库（内部已处理）
    cell.avatarImageView.kf.setImage(with: url, placeholder: UIImage(named: "placeholder"))

问题 2：Cell 状态错乱

  现象：某个 Cell 的选中状态/展开状态在滚动后跑到其他 Cell 上
  原因：选中/展开这类 UI 状态保存在 Cell 上，复用后状态残留
  解决方案：
    - 将状态保存在数据模型中，不保存在 Cell 上
    - 每次 cellForRowAt 都根据模型重新设置状态

    struct Item {
        var title: String
        var isExpanded: Bool  // 状态保存在模型中
    }

    func cellForRowAt(...) {
        cell.isExpanded = dataArray[indexPath.row].isExpanded  // 从模型恢复状态
    }

问题 3：动态高度 Cell 滚动跳动

  现象：Self-Sizing Cell 列表往回滚动时，内容会突然跳动
  原因：系统用 estimatedRowHeight 预估了高度，实际高度不同导致 contentOffset 变化
  解决方案：
    - 缓存已计算过的行高

    var heightCache: [IndexPath: CGFloat] = [:]

    func tableView(_ tableView: UITableView, willDisplay cell: UITableViewCell,
                   forRowAt indexPath: IndexPath) {
        heightCache[indexPath] = cell.frame.height
    }

    func tableView(_ tableView: UITableView, estimatedHeightForRowAt indexPath: IndexPath) -> CGFloat {
        return heightCache[indexPath] ?? 80
    }
```

### 3.4 多种 Cell 类型的复用

```objc
// 不同类型的 Cell 使用不同的 reuseIdentifier

// 注册多种 Cell
[tableView registerClass:[TextCell class] forCellReuseIdentifier:@"TextCell"];
[tableView registerClass:[ImageCell class] forCellReuseIdentifier:@"ImageCell"];
[tableView registerClass:[VideoCell class] forCellReuseIdentifier:@"VideoCell"];

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    Model *model = self.dataArray[indexPath.row];

    switch (model.type) {
        case ModelTypeText: {
            TextCell *cell = [tableView dequeueReusableCellWithIdentifier:@"TextCell" forIndexPath:indexPath];
            [cell configureWithModel:model];
            return cell;
        }
        case ModelTypeImage: {
            ImageCell *cell = [tableView dequeueReusableCellWithIdentifier:@"ImageCell" forIndexPath:indexPath];
            [cell configureWithModel:model];
            return cell;
        }
        case ModelTypeVideo: {
            VideoCell *cell = [tableView dequeueReusableCellWithIdentifier:@"VideoCell" forIndexPath:indexPath];
            [cell configureWithModel:model];
            return cell;
        }
    }
}
```

```
注意事项：
  - 每种类型的 Cell 必须有独立的 reuseIdentifier
  - 千万不要所有类型都用同一个 identifier，否则取出来的 Cell 类型不对直接 Crash
  - 复用池是按 identifier 分桶的，不同类型之间不会混用
  - Cell 类型过多时要注意内存（每种类型都会缓存几个实例）
```

---

## 四、UITableView 高级用法

### 4.1 批量更新（Batch Updates）

```objc
// 错误做法：修改数据后直接 reloadData
self.dataArray = newDataArray;
[self.tableView reloadData]; // 没有动画，整表刷新，性能差

// 正确做法：使用批量更新
[self.tableView beginUpdates];

// 先更新数据源
[self.dataArray insertObject:newItem atIndex:2];
[self.dataArray removeObjectAtIndex:5];

// 再对应更新 UI
[self.tableView insertRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:2 inSection:0]]
                      withRowAnimation:UITableViewRowAnimationFade];
[self.tableView deleteRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:5 inSection:0]]
                      withRowAnimation:UITableViewRowAnimationFade];

[self.tableView endUpdates];
```

```
批量更新的执行规则（非常重要，极易踩坑）：

  在 beginUpdates / endUpdates 之间：
    - 删除操作使用的是 更新前 的 IndexPath
    - 插入操作使用的是 更新后 的 IndexPath
    - 系统先执行所有删除，再执行所有插入（无论代码顺序）

  举例：原始数据 [A, B, C, D, E]
    要删除 B（index 1），插入 X 到开头（index 0）
    结果应该是 [X, A, C, D, E]

    deleteRows: IndexPath(row: 1)  ← 指的是原始数据中的 B
    insertRows: IndexPath(row: 0)  ← 指的是删除后、插入后的位置

  常见 Crash：
    *** Terminating app due to uncaught exception 'NSInternalInconsistencyException',
    reason: 'Invalid update: invalid number of rows in section 0...'

    原因：数据源的变化量和 insert/delete 的操作量不匹配
    规则：更新后数据源行数 = 更新前行数 - 删除行数 + 插入行数
```

### 4.2 DiffableDataSource（iOS 13+）

```swift
// DiffableDataSource 彻底解决了批量更新的复杂性

// 1. 定义 Section 和 Item（必须 Hashable）
enum Section: Hashable {
    case main
}

struct Item: Hashable {
    let id: UUID
    let title: String
}

// 2. 创建 DataSource
var dataSource: UITableViewDiffableDataSource<Section, Item>!

dataSource = UITableViewDiffableDataSource<Section, Item>(tableView: tableView) {
    tableView, indexPath, item in
    let cell = tableView.dequeueReusableCell(withIdentifier: "Cell", for: indexPath) as! MyCell
    cell.titleLabel.text = item.title
    return cell
}

// 3. 应用 Snapshot（替代 reloadData 和 beginUpdates/endUpdates）
var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
snapshot.appendSections([.main])
snapshot.appendItems(items, toSection: .main)
dataSource.apply(snapshot, animatingDifferences: true)

// 更新数据只需要创建新 Snapshot 并 apply
// 系统自动计算 Diff，自动添加动画
// 永远不会出现 数据源和 UI 不一致 的 Crash
```

```
DiffableDataSource 的优势：
  - 不需要手动管理 insert / delete / move
  - 自动计算差异并带动画更新
  - 不会出现 NSInternalInconsistencyException
  - 线程安全（apply 可以在后台线程调用）

注意事项：
  - Item 必须实现 Hashable，hash 值是唯一标识
  - 同一个 Snapshot 中不能有相同 hash 的 Item（否则 Crash）
  - 如果 Item 内容变了但 hash 没变，需要使用 reconfigureItems（iOS 15+）
    或 reloadItems 来刷新显示
```

### 4.3 编辑模式与侧滑操作

```swift
// iOS 11+ 侧滑操作
func tableView(_ tableView: UITableView,
    trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath
) -> UISwipeActionsConfiguration? {
    
    let deleteAction = UIContextualAction(style: .destructive, title: "删除") {
        action, view, completion in
        // 执行删除逻辑
        self.dataSource.remove(at: indexPath.row)
        tableView.deleteRows(at: [indexPath], with: .automatic)
        completion(true)  // true 表示操作成功
    }
    deleteAction.backgroundColor = .systemRed
    
    let archiveAction = UIContextualAction(style: .normal, title: "归档") {
        action, view, completion in
        // 执行归档逻辑
        completion(true)
    }
    archiveAction.backgroundColor = .systemBlue
    
    return UISwipeActionsConfiguration(actions: [deleteAction, archiveAction])
}

// 左滑操作
func tableView(_ tableView: UITableView,
    leadingSwipeActionsConfigurationForRowAt indexPath: IndexPath
) -> UISwipeActionsConfiguration? {
    let pinAction = UIContextualAction(style: .normal, title: "置顶") {
        action, view, completion in
        completion(true)
    }
    pinAction.backgroundColor = .systemOrange
    
    let config = UISwipeActionsConfiguration(actions: [pinAction])
    config.performsFirstActionWithFullSwipe = false  // 禁止完全滑动触发第一个操作
    return config
}
```

### 4.4 Self-Sizing Cell（自适应高度）

```swift
// 方式 1：Auto Layout 自动计算（推荐）
tableView.rowHeight = UITableView.automaticDimension
tableView.estimatedRowHeight = 80  // 必须设置估算高度

// Cell 内部使用 Auto Layout 约束
// 关键：从 contentView 的 top 到 bottom 必须有完整的约束链
class DynamicCell: UITableViewCell {
    let titleLabel = UILabel()
    let detailLabel = UILabel()
    
    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        
        titleLabel.numberOfLines = 0  // 多行
        detailLabel.numberOfLines = 0
        
        contentView.addSubview(titleLabel)
        contentView.addSubview(detailLabel)
        
        // 约束链：contentView.top -> titleLabel -> detailLabel -> contentView.bottom
        // 这条完整的纵向约束链是自适应高度的关键
        titleLabel.snp.makeConstraints { make in
            make.top.equalToSuperview().offset(12)
            make.leading.trailing.equalToSuperview().inset(16)
        }
        detailLabel.snp.makeConstraints { make in
            make.top.equalTo(titleLabel.snp.bottom).offset(8)
            make.leading.trailing.equalToSuperview().inset(16)
            make.bottom.equalToSuperview().offset(-12)  // 关键：连接到 bottom
        }
    }
    
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}
```

```
Self-Sizing 常见问题：

  1. Cell 高度为 0 或异常
     原因：约束链不完整，缺少到 contentView.bottom 的约束
     解决：确保纵向约束从 top 到 bottom 完整连接

  2. 首次加载高度不正确
     原因：estimatedRowHeight 差距太大，或数据异步加载
     解决：设置合理的 estimatedRowHeight，数据就绪后 reload

  3. Cell 内容闪烁或跳动
     原因：estimatedRowHeight 与实际高度差距大，ScrollView 的 contentSize 频繁变化
     解决：缓存已计算的高度，或使用 prefetchDataSource 提前准备数据

  4. 性能问题
     原因：每次滚动都要自动计算高度（Auto Layout 求解）
     解决：用 heightForRowAt 代理手动返回缓存的高度

  方式 2：手动计算并缓存高度（高性能场景）
    - 使用 NSAttributedString.boundingRect 计算文本高度
    - 将计算结果缓存在 Model 或字典中
    - 在 heightForRowAt 中直接返回缓存值
    - 避免每次滚动都触发 Auto Layout 计算
```

---

## 五、UICollectionView 详解

### 5.1 UICollectionViewFlowLayout

```swift
// 基本使用
let layout = UICollectionViewFlowLayout()
layout.scrollDirection = .vertical
layout.itemSize = CGSize(width: 100, height: 100)
layout.minimumInteritemSpacing = 10      // 同行 item 之间的最小间距
layout.minimumLineSpacing = 10           // 行与行之间的最小间距
layout.sectionInset = UIEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)
layout.headerReferenceSize = CGSize(width: 0, height: 44)
layout.footerReferenceSize = CGSize(width: 0, height: 44)

let collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
```

```
FlowLayout 的布局逻辑：

  垂直滚动（scrollDirection = .vertical）：
    - 从左到右排列 item
    - 一行放不下时自动换行
    - minimumInteritemSpacing 控制水平间距
    - minimumLineSpacing 控制垂直行间距

  水平滚动（scrollDirection = .horizontal）：
    - 从上到下排列 item
    - 一列放不下时自动换列
    - minimumInteritemSpacing 控制垂直间距
    - minimumLineSpacing 控制水平列间距

  注意"minimum"的含义：
    - 这是"最小"间距，实际间距可能更大
    - FlowLayout 会在剩余空间中均匀分配额外间距
    - 如果需要精确控制，使用代理方法动态返回 itemSize
```

```swift
// 通过代理动态设置大小和间距
extension ViewController: UICollectionViewDelegateFlowLayout {
    
    func collectionView(_ collectionView: UICollectionView,
        layout collectionViewLayout: UICollectionViewLayout,
        sizeForItemAt indexPath: IndexPath
    ) -> CGSize {
        // 实现等宽两列布局
        let spacing: CGFloat = 10
        let totalWidth = collectionView.bounds.width - spacing * 3  // 左 + 中 + 右
        let itemWidth = totalWidth / 2
        return CGSize(width: itemWidth, height: itemWidth * 1.5)
    }
    
    func collectionView(_ collectionView: UICollectionView,
        layout collectionViewLayout: UICollectionViewLayout,
        minimumInteritemSpacingForSectionAt section: Int
    ) -> CGFloat {
        return 10
    }
}
```

### 5.2 Compositional Layout（iOS 13+）

```swift
// Compositional Layout 的核心概念：
// Item -> Group -> Section -> Layout

// 示例：两列网格布局
func createGridLayout() -> UICollectionViewCompositionalLayout {
    
    // 1. Item：占 Group 宽度的 50%，高度由 Group 决定
    let itemSize = NSCollectionLayoutSize(
        widthDimension: .fractionalWidth(0.5),
        heightDimension: .fractionalHeight(1.0)
    )
    let item = NSCollectionLayoutItem(layoutSize: itemSize)
    item.contentInsets = NSDirectionalEdgeInsets(top: 5, leading: 5, bottom: 5, trailing: 5)
    
    // 2. Group：满宽，高度为宽度的 60%，水平排列 item
    let groupSize = NSCollectionLayoutSize(
        widthDimension: .fractionalWidth(1.0),
        heightDimension: .fractionalWidth(0.6)
    )
    let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize, subitems: [item])
    
    // 3. Section
    let section = NSCollectionLayoutSection(group: group)
    section.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)
    
    // 4. Layout
    return UICollectionViewCompositionalLayout(section: section)
}
```

```swift
// Compositional Layout 的强大之处：不同 Section 使用不同布局
func createComplexLayout() -> UICollectionViewCompositionalLayout {
    
    return UICollectionViewCompositionalLayout { sectionIndex, environment in
        switch sectionIndex {
        case 0:
            return self.createBannerSection()    // 横向滚动 Banner
        case 1:
            return self.createGridSection()      // 网格布局
        default:
            return self.createListSection()      // 列表布局
        }
    }
}

// 横向滚动的 Banner Section
func createBannerSection() -> NSCollectionLayoutSection {
    let itemSize = NSCollectionLayoutSize(
        widthDimension: .fractionalWidth(1.0),
        heightDimension: .fractionalHeight(1.0)
    )
    let item = NSCollectionLayoutItem(layoutSize: itemSize)
    
    let groupSize = NSCollectionLayoutSize(
        widthDimension: .fractionalWidth(0.9),
        heightDimension: .absolute(200)
    )
    let group = NSCollectionLayoutGroup.horizontal(layoutSize: groupSize, subitems: [item])
    
    let section = NSCollectionLayoutSection(group: group)
    section.orthogonalScrollingBehavior = .groupPagingCentered  // 横向分页滚动
    section.interGroupSpacing = 10
    return section
}
```

```
Compositional Layout 尺寸维度：

  .fractionalWidth(0.5)    占父容器宽度的 50%
  .fractionalHeight(1.0)   占父容器高度的 100%
  .absolute(200)           固定 200pt
  .estimated(100)          估算 100pt，实际大小由内容决定（Self-Sizing）

  Group 类型：
  .horizontal(...)         水平排列 item
  .vertical(...)           垂直排列 item
  .custom(...)             完全自定义布局

  orthogonalScrollingBehavior（正交滚动）：
  .none                    不横向滚动（默认）
  .continuous              自由滚动
  .continuousGroupLeadingBoundary  滚动到 Group 边界对齐
  .paging                  按 CollectionView 宽度分页
  .groupPaging             按 Group 宽度分页
  .groupPagingCentered     按 Group 宽度分页并居中
```

### 5.3 Supplementary Views 与 Decoration Views

```swift
// Supplementary Views（Header / Footer）
// 1. 注册
collectionView.register(
    HeaderView.self,
    forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader,
    withReuseIdentifier: "header"
)

// 2. 数据源提供
func collectionView(_ collectionView: UICollectionView,
    viewForSupplementaryElementOfKind kind: String,
    at indexPath: IndexPath
) -> UICollectionReusableView {
    let header = collectionView.dequeueReusableSupplementaryView(
        ofKind: kind,
        withReuseIdentifier: "header",
        for: indexPath
    ) as! HeaderView
    header.titleLabel.text = sections[indexPath.section].title
    return header
}
```

```
Supplementary View vs Decoration View：

  Supplementary View（附加视图）：
    - 由数据源驱动（DataSource 提供）
    - 典型用途：Section Header / Footer
    - 参与复用机制
    - 有 indexPath，与数据关联

  Decoration View（装饰视图）：
    - 由 Layout 驱动（Layout 提供）
    - 典型用途：Section 背景色、分组背景
    - 不由数据源管理，纯视觉装饰
    - 需要在自定义 Layout 中注册和返回

  常见使用场景：
    - 商品分类页的 Section 背景色 -> Decoration View
    - 列表的分组标题 -> Supplementary View
    - 瀑布流的分隔线 -> Decoration View
```

### 5.4 Cell Registration（iOS 14+）

```swift
// 新式 Cell 注册（类型安全，无需手动 dequeue + 类型转换）
let cellRegistration = UICollectionView.CellRegistration<MyCell, MyItem> {
    cell, indexPath, item in
    cell.titleLabel.text = item.title
    cell.imageView.image = item.image
}

// 在 DiffableDataSource 中使用
let dataSource = UICollectionViewDiffableDataSource<Section, MyItem>(
    collectionView: collectionView
) { collectionView, indexPath, item in
    return collectionView.dequeueConfiguredReusableCell(
        using: cellRegistration, for: indexPath, item: item
    )
}

// 优势：
//   - 类型安全：编译时检查 Cell 类型和数据类型
//   - 无需手动 register + dequeueReusableCell + as!
//   - 配置逻辑集中在 Registration 闭包中
```

---

## 六、Cell 复用机制深度解析

### 6.1 复用原理

```
Cell 复用是 UITableView / UICollectionView 性能优化的核心机制：

  为什么需要复用：
    - 一个列表可能有成千上万条数据
    - 如果为每条数据都创建一个 Cell，内存会爆炸
    - 屏幕上同时可见的 Cell 其实只有十几个
    - 所以只创建屏幕可见数量 + 少量缓冲的 Cell，反复重复使用

  复用池（Reuse Pool）工作流程：

    ┌─────────────────────────────────────────────────────┐
    │                     屏幕可见区域                      │
    │  ┌─────────┐                                        │
    │  │ Cell A   │ <- 正在显示                             │
    │  ├─────────┤                                        │
    │  │ Cell B   │ <- 正在显示                             │
    │  ├─────────┤                                        │
    │  │ Cell C   │ <- 正在显示                             │
    │  ├─────────┤                                        │
    │  │ Cell D   │ <- 正在显示                             │
    │  └─────────┘                                        │
    └─────────────────────────────────────────────────────┘

    向上滚动时：
      Cell A 滚出屏幕 -> 放入复用池（标记为可复用）
      底部需要新 Cell -> 从复用池取出 Cell A -> 重新配置数据 -> 显示为 Cell E

    ┌─────────────────────────────────────────────────────┐
    │                   复用池（Reuse Pool）                │
    │                                                     │
    │  reuseIdentifier: "MyCell"                          │
    │  ┌─────────┐  ┌─────────┐                           │
    │  │ Cell（闲）│  │ Cell（闲）│  ...                     │
    │  └─────────┘  └─────────┘                           │
    │                                                     │
    │  reuseIdentifier: "HeaderCell"                      │
    │  ┌─────────┐                                        │
    │  │ Cell（闲）│  ...                                   │
    │  └─────────┘                                        │
    └─────────────────────────────────────────────────────┘

  关键方法：
    - dequeueReusableCell(withIdentifier:for:)
      从复用池中取出 Cell，如果池中没有则自动创建新的
    - prepareForReuse()
      Cell 被取出复用前调用，用于重置状态
```

### 6.2 复用带来的经典问题

```
问题 1：Cell 内容错乱

  现象：快速滚动时，Cell 显示了错误的图片或文本
  原因：Cell 被复用后，旧的数据/请求还在，新数据覆盖不及时

  典型场景 — 图片加载错乱：
    1. Cell A 开始加载图片 A（异步网络请求）
    2. 快速滚动，Cell A 被复用显示第 20 条数据
    3. Cell A 开始加载图片 20（新请求）
    4. 图片 A 先返回 -> 显示在 Cell A 上（此时应该显示图片 20）
    5. 图片 20 后返回 -> 再次更新（用户看到图片闪变）
```

```swift
// 错误做法：没有处理复用导致的图片错乱
func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath) as! MyCell
    let imageURL = items[indexPath.row].imageURL
    
    // 异步加载图片，但没有校验 Cell 是否还对应这条数据
    URLSession.shared.dataTask(with: imageURL) { data, _, _ in
        DispatchQueue.main.async {
            cell.imageView?.image = UIImage(data: data!)  // Cell 可能已经被复用了！
        }
    }.resume()
    
    return cell
}

// 正确做法 1：使用 indexPath 校验
func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath) as! MyCell
    let imageURL = items[indexPath.row].imageURL
    cell.imageView?.image = nil  // 先清空旧图片
    
    URLSession.shared.dataTask(with: imageURL) { data, _, _ in
        DispatchQueue.main.async {
            // 校验：当前 Cell 是否还在显示这个 indexPath
            guard let currentCell = tableView.cellForRow(at: indexPath) as? MyCell else { return }
            currentCell.imageView?.image = UIImage(data: data!)
        }
    }.resume()
    
    return cell
}

// 正确做法 2：使用 Kingfisher / SDWebImage 等库（内部已处理复用问题）
cell.imageView?.kf.setImage(with: imageURL, placeholder: UIImage(named: "placeholder"))
```

```
问题 2：Cell 状态残留

  现象：选中某个 Cell 后滚动，发现其他 Cell 也变成选中状态
  原因：Cell 被复用时，之前设置的选中状态没有被清除
```

```swift
// 错误做法：没有在 prepareForReuse 中重置状态
class MyCell: UITableViewCell {
    var isExpanded = false
    
    func configure(with item: Item) {
        if item.isSelected {
            backgroundColor = .systemBlue  // 只在选中时设置蓝色
            // 但未选中时没有重置为白色！
        }
    }
}

// 正确做法：在 prepareForReuse 中重置所有可变状态
class MyCell: UITableViewCell {
    var isExpanded = false
    
    override func prepareForReuse() {
        super.prepareForReuse()
        // 重置所有可变状态
        isExpanded = false
        backgroundColor = .white
        accessoryType = .none
        imageView?.image = nil
        // 取消进行中的网络请求
        imageView?.kf.cancelDownloadTask()
    }
    
    func configure(with item: Item) {
        backgroundColor = item.isSelected ? .systemBlue : .white
    }
}
```

```
问题 3：Cell 中的定时器 / 动画 / 播放器没有被清理

  现象：滚出屏幕的 Cell 定时器仍在运行，导致内存泄漏或 CPU 占用
  原因：Cell 复用时没有停止定时器或动画

  解决方案：
    - 在 prepareForReuse() 中停止定时器、取消动画
    - 在 willDisplay / didEndDisplaying 代理中管理生命周期
    - 不要在 Cell 中持有强引用的 Timer（用 weak 或在消失时 invalidate）
```

```swift
// 使用 willDisplay / didEndDisplaying 管理 Cell 生命周期
func tableView(_ tableView: UITableView, willDisplay cell: UITableViewCell,
               forRowAt indexPath: IndexPath) {
    // Cell 即将显示，开始动画或加载
    if let videoCell = cell as? VideoCell {
        videoCell.startPlayback()
    }
}

func tableView(_ tableView: UITableView, didEndDisplaying cell: UITableViewCell,
               forRowAt indexPath: IndexPath) {
    // Cell 消失，停止动画或清理资源
    if let videoCell = cell as? VideoCell {
        videoCell.stopPlayback()
    }
}
```

### 6.3 复用的性能最佳实践

```
1. 避免在 cellForRowAt 中做重量级操作
   - 不要在这里做同步的图片解码、JSON 解析、高度计算
   - 这些工作应该在数据层提前完成，cellForRowAt 只做赋值

2. Cell 的子视图在 init 中创建，不要在 configure 中动态添加/移除
   - 频繁的 addSubview / removeFromSuperview 严重影响性能
   - 用 isHidden 控制显示/隐藏，而非动态增删视图

3. 合理使用多种 reuseIdentifier
   - 如果列表有多种样式的 Cell，使用不同的 identifier
   - 不要用一个 Cell 通过 isHidden 来适配所有样式
   - 但 identifier 种类也不宜过多（每种都有独立的复用池）

4. 预加载与缓存
   - 使用 prefetchDataSource 提前加载数据
   - 缓存已计算的 Cell 高度
   - 缓存已下载的图片（SDWebImage / Kingfisher 自动处理）
```

---

## 七、UIScrollView 手势与嵌套冲突

### 7.1 ScrollView 的手势识别

```
UIScrollView 内部使用两个手势识别器：

  1. UIPanGestureRecognizer：处理滑动
     - 决定 contentOffset 的变化
     - 控制减速、弹性、分页等行为

  2. UIPinchGestureRecognizer：处理缩放（设置了 zoomScale 时）
     - 通过 viewForZooming(in:) 代理指定缩放视图

  手势传递流程：
    用户触摸 -> UIScrollView 的 panGestureRecognizer 识别
    -> 判断是否为有效的滑动（而非点击）
    -> 开始修改 contentOffset

  ScrollView 如何区分滑动和点击：
    - 触摸开始时不会立刻响应，有约 150ms 的延迟
    - 这段时间内判断手指是否移动
    - 如果移动了 -> 滑动手势
    - 如果没移动 -> 传递给子视图作为点击
    - 这就是 delaysContentTouches 属性的作用
```

### 7.2 常见嵌套冲突与解决

```
场景 1：ScrollView 嵌套 ScrollView（同方向）

  问题：外层和内层都能响应垂直滚动，手势被外层吃掉或冲突

  典型场景：
    - 个人主页（外层纵向滚动 + 内层列表纵向滚动）
    - 商品详情页（上半部分信息 + 下半部分评论列表）

  解决方案：
    - 使用嵌套滚动协议：外层滚动到一定位置后锁定，将手势传递给内层
    - 核心思路：通过 scrollViewDidScroll 代理判断当前应该由谁处理滚动
```

```swift
// 嵌套滚动的典型实现思路
class NestedScrollViewController: UIViewController, UIScrollViewDelegate {
    let outerScrollView = UIScrollView()   // 外层
    let innerTableView = UITableView()     // 内层
    
    var headerHeight: CGFloat = 200        // 头部高度
    var canOuterScroll = true
    var canInnerScroll = false
    
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        if scrollView == outerScrollView {
            // 外层滚到头部完全隐藏时，停止外层滚动，让内层开始滚
            if scrollView.contentOffset.y >= headerHeight {
                scrollView.contentOffset.y = headerHeight
                canOuterScroll = false
                canInnerScroll = true
            } else {
                // 内层未回到顶部时，外层不滚
                if !canOuterScroll {
                    scrollView.contentOffset.y = headerHeight
                }
            }
        } else if scrollView == innerTableView {
            // 内层滚到顶部时，停止内层滚动，让外层开始滚
            if scrollView.contentOffset.y <= 0 {
                scrollView.contentOffset.y = 0
                canOuterScroll = true
                canInnerScroll = false
            } else {
                if !canInnerScroll {
                    scrollView.contentOffset.y = 0
                }
            }
        }
    }
}
```

```
场景 2：ScrollView 嵌套 ScrollView（交叉方向）

  问题：水平 ScrollView 内放垂直 TableView，斜向滑动时冲突

  典型场景：
    - 新闻类 App 的标签页（水平翻页 + 每页垂直列表）

  解决方案：
    - 利用手势的 delegate 方法 gestureRecognizerShouldBegin
    - 根据手势方向（水平/垂直）决定哪个 ScrollView 响应
```

```swift
// 根据手势方向决定是否响应
class DirectionalScrollView: UIScrollView, UIGestureRecognizerDelegate {
    
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
        let velocity = pan.velocity(in: self)
        // 只响应水平方向的滑动
        return abs(velocity.x) > abs(velocity.y)
    }
    
    // 允许同时识别手势（与子 ScrollView 的手势共存）
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        return true
    }
}
```

```
场景 3：TableView 中嵌套水平 CollectionView

  问题：水平滑动 CollectionView 时，TableView 也在轻微垂直移动

  解决：一般不需要特殊处理，系统默认会根据手势方向分配
  但如果出现冲突，可以：
    - 设置内层 CollectionView 的 panGesture 的 delegate
    - 实现 gestureRecognizerShouldBegin 根据方向过滤
    - 或者增大 directionalLockEnabled = true

场景 4：UIScrollView 与 UINavigationController 的右滑返回冲突

  问题：ScrollView 在最左侧时，右滑应该返回上一页而非滚动

  解决：
    - 当 contentOffset.x == 0 时，让系统手势优先
    - 使用 gestureRecognizer(_:shouldBeRequiredToFailBy:) 设置优先级
```

---

## 八、性能优化专题

### 8.1 列表卡顿排查

```
列表滑动卡顿的根本原因：
  主线程无法在 16.67ms（60fps）或 8.33ms（120fps）内完成一帧的渲染

常见卡顿原因及排查：

  1. Cell 布局过于复杂
     现象：任何时候滑动都卡
     排查：Instruments -> Time Profiler 查看 layoutSubviews 耗时
     优化：减少视图层级、使用预计算的 frame 替代 Auto Layout（极端情况）

  2. 图片解码在主线程
     现象：图片加载时卡顿，加载完后流畅
     排查：Instruments -> Time Profiler 查看 ImageIO 相关调用
     优化：使用 SDWebImage / Kingfisher 自动后台解码
            或手动在后台线程 CGContext 解码

  3. 离屏渲染
     现象：有圆角、阴影的 Cell 滑动卡顿
     排查：模拟器 -> Debug -> Color Off-screen Rendered（黄色标记）
     优化：
       - 圆角：使用 layer.cornerRadius + layer.masksToBounds
                或用 UIBezierPath 裁剪图片
       - 阴影：指定 shadowPath 避免实时计算
       - 避免同时使用 cornerRadius + masksToBounds + shadow

  4. 过度绘制
     现象：多层 View 叠加区域卡顿
     排查：模拟器 -> Debug -> Color Blended Layers（红色标记）
     优化：设置 backgroundColor（不透明背景）、减少视图叠加

  5. 主线程 I/O
     现象：间歇性卡顿
     排查：Instruments -> System Trace 查看主线程阻塞
     优化：所有文件读写、数据库操作放到后台线程
```

### 8.2 预加载（Prefetching）

```swift
// UITableViewDataSourcePrefetching（iOS 10+）
class ViewController: UIViewController, UITableViewDataSourcePrefetching {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.prefetchDataSource = self
    }
    
    // 即将需要这些 indexPaths 的数据，提前加载
    func tableView(_ tableView: UITableView,
                   prefetchRowsAt indexPaths: [IndexPath]) {
        for indexPath in indexPaths {
            let item = items[indexPath.row]
            if item.image == nil {
                // 提前开始下载图片
                imageLoader.startDownload(for: item.imageURL)
            }
        }
    }
    
    // 这些 indexPaths 不再需要了（用户反向滚动），可以取消加载
    func tableView(_ tableView: UITableView,
                   cancelPrefetchingForRowsAt indexPaths: [IndexPath]) {
        for indexPath in indexPaths {
            imageLoader.cancelDownload(for: items[indexPath.row].imageURL)
        }
    }
}
```

```
Prefetching 的原理：
  - 系统根据滚动方向和速度，预测即将进入屏幕的 Cell
  - 在 Cell 真正需要显示之前，调用 prefetchRowsAt
  - 给你时间提前准备数据（网络请求、图片解码、数据库查询等）
  - 当用户突然反向滚动，之前预加载的数据不再需要，调用 cancelPrefetchingForRowsAt

注意事项：
  - prefetchRowsAt 在主线程调用，不要在这里做重操作
  - 应该在这里启动异步任务，而非同步处理
  - cancelPrefetchingForRowsAt 不一定每次都调用
  - 结合 Operation / Task 使用，方便取消
```

### 8.3 高度缓存策略

```swift
// 方案 1：使用字典缓存高度
var heightCache: [IndexPath: CGFloat] = [:]

func tableView(_ tableView: UITableView,
               estimatedHeightForRowAt indexPath: IndexPath) -> CGFloat {
    return heightCache[indexPath] ?? 80
}

func tableView(_ tableView: UITableView, willDisplay cell: UITableViewCell,
               forRowAt indexPath: IndexPath) {
    heightCache[indexPath] = cell.frame.height
}

// 数据源变化时清空缓存
func reloadData() {
    heightCache.removeAll()
    tableView.reloadData()
}
```

```
为什么需要缓存高度：

  1. estimatedRowHeight 不准确会导致滚动跳动
     - TableView 根据 estimated 值计算 contentSize
     - 真正显示时计算出实际高度
     - 差距大时 contentSize 突变 -> 滚动条跳动 -> 用户体验差

  2. scrollToRow 不准确
     - 跳转到某行时依赖高度计算
     - estimated 不准确导致跳转位置偏差

  3. reloadData 后 contentOffset 跳变
     - 当前在列表中间 reloadData
     - 新的 estimated 值导致 contentSize 变化
     - contentOffset 被调整 -> 视觉上列表跳了一下

  缓存策略可以大幅缓解这些问题。
```

---

## 九、常见坑点与疑难问题汇总

### 9.1 reloadData 相关

```
坑点 1：reloadData 后立刻获取 Cell 返回 nil

  原因：reloadData 只是标记需要刷新，实际刷新在下一个 RunLoop
  解决：
    tableView.reloadData()
    tableView.layoutIfNeeded()  // 强制立刻布局
    let cell = tableView.cellForRow(at: indexPath)  // 现在可以获取了
    // 或者
    DispatchQueue.main.async {
        let cell = tableView.cellForRow(at: indexPath)
    }

坑点 2：reloadData 导致列表跳到顶部

  原因：reloadData 会重新计算 contentSize，如果 estimatedRowHeight
        与实际高度差距较大，contentOffset 会被系统调整
  解决：
    - 使用高度缓存
    - 用 reloadRows / reloadSections 替代 reloadData（局部刷新）
    - 使用 DiffableDataSource 的 apply（自动计算差异）

坑点 3：频繁调用 reloadData 导致性能问题

  原因：每次 reloadData 都会重新调用所有可见 Cell 的 cellForRowAt
  解决：
    - 使用 reloadRows(at:with:) 局部刷新
    - 使用 DiffableDataSource
    - 合并多次刷新（在一个 RunLoop 内只刷新一次）
```

### 9.2 insertRows / deleteRows 崩溃

```
坑点 4：NSInternalInconsistencyException 崩溃

  典型错误信息：
  "Invalid update: invalid number of rows in section 0.
   The number of rows contained in an existing section after the update (5)
   must be equal to the number of rows contained in that section before
   the update (5), plus or minus the number of rows inserted or deleted
   from that section (1 inserted, 0 deleted)"

  原因：数据源数量与 insert/delete 操作不一致

  规则：
    操作前的数据源数量 + insertRows 数量 - deleteRows 数量 = 操作后的数据源数量
    必须严格一致，否则 Crash
```

```swift
// 错误做法：先更新数据源，再单独 insert / delete
dataSource.append(newItem)
tableView.insertRows(at: [IndexPath(row: dataSource.count - 1, section: 0)],
                     with: .automatic)
dataSource.remove(at: 0)
tableView.deleteRows(at: [IndexPath(row: 0, section: 0)], with: .automatic)
// 可能崩溃！两次操作之间数据源状态不一致

// 正确做法：使用 performBatchUpdates 包裹
tableView.performBatchUpdates {
    dataSource.append(newItem)
    tableView.insertRows(at: [IndexPath(row: dataSource.count - 1, section: 0)],
                         with: .automatic)
    
    dataSource.remove(at: 0)
    tableView.deleteRows(at: [IndexPath(row: 0, section: 0)], with: .automatic)
} completion: { finished in
    // 完成回调
}

// 更好的做法：使用 DiffableDataSource，彻底避免这类问题
```

### 9.3 contentInset 与 safeArea 问题

```
坑点 5：ScrollView 内容位置不对

  iOS 11+ 引入了 adjustedContentInset：
    adjustedContentInset = contentInset + safeAreaInsets
    （如果 contentInsetAdjustmentBehavior != .never）

  contentInsetAdjustmentBehavior 选项：
    .automatic         系统自动调整（默认，NavBar/TabBar 区域自动 inset）
    .scrollableAxes    只在可滚动方向调整
    .never             不自动调整（完全手动控制）
    .always            总是调整

  常见问题：
    - TableView 顶部有意外的空白 -> 是 safeAreaInsets 自动添加的
    - contentOffset 初始值不是 (0, 0) 而是 (0, -navBarHeight)
    - 设置 contentInset 后效果不对

  解决：
    // 方式 1：关闭自动调整
    scrollView.contentInsetAdjustmentBehavior = .never
    // 然后手动设置 contentInset

    // 方式 2：使用 adjustedContentInset 而非 contentInset 来计算
    let realInset = scrollView.adjustedContentInset

坑点 6：键盘遮挡输入框

  现象：TableView 中有 UITextField，键盘弹出时遮挡输入区域
  解决：
    - 监听 UIResponder.keyboardWillShowNotification
    - 获取键盘高度，调整 TableView 的 contentInset.bottom
    - 使用 scrollToRow 将输入框所在行滚动到可见区域
    - 键盘消失时恢复 contentInset
    - 或使用 IQKeyboardManager 自动处理
```

### 9.4 其他常见坑点

```
坑点 7：多个 Section 时 indexPath 混淆

  问题：通过 indexPath.row 访问数据，但忘记考虑 section
  解决：根据 section 找到对应的数据数组再用 row 索引
    let item = sections[indexPath.section].items[indexPath.row]

坑点 8：estimatedHeightForRowAt 返回 0 导致布局异常

  问题：返回 0 会导致 TableView 无法正确预估 contentSize
  解决：始终返回大于 0 的合理估算值

坑点 9：在 cellForRowAt 中调用 reloadData / beginUpdates 导致死循环

  问题：cellForRowAt 正在执行时触发 reload，系统再次调用 cellForRowAt
  解决：任何数据更新操作都应延迟到 cellForRowAt 返回之后
    DispatchQueue.main.async { tableView.reloadData() }

坑点 10：UICollectionView 的 FlowLayout itemSize 为 0 导致崩溃

  问题：iOS 某些版本中 itemSize 为 CGSize.zero 时可能崩溃
  解决：确保 itemSize 大于 0，或在代理方法中返回合法的 size

坑点 11：CollectionView 在 viewDidLoad 中 layout 不正确

  问题：viewDidLoad 时 CollectionView 的 frame 还未确定，布局计算不正确
  解决：在 viewDidLayoutSubviews 或 viewWillAppear 中刷新
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        collectionView.collectionViewLayout.invalidateLayout()
    }

坑点 12：使用 DiffableDataSource 时 Item 的 hash 冲突

  问题：两个不同的 Item 有相同的 hashValue，apply snapshot 时崩溃
  错误信息："Invalid parameter not satisfying: newIdentifier"
  解决：确保每个 Item 的 Hashable 实现是唯一的（通常用唯一 ID）
    struct MyItem: Hashable {
        let id: UUID        // 用唯一 ID 作为 hash 依据
        let title: String
        
        func hash(into hasher: inout Hasher) {
            hasher.combine(id)  // 只用 id 计算 hash
        }
        
        static func == (lhs: MyItem, rhs: MyItem) -> Bool {
            return lhs.id == rhs.id
        }
    }
```

---

## 十、iOS 14+ 现代化 API

### 10.1 UIListContentConfiguration

```swift
// iOS 14+ 新的 Cell 内容配置方式
func tableView(_ tableView: UITableView,
               cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
    
    // 使用 Content Configuration 替代直接设置 textLabel / imageView
    var config = cell.defaultContentConfiguration()
    config.text = items[indexPath.row].title
    config.secondaryText = items[indexPath.row].subtitle
    config.image = UIImage(systemName: "star")
    config.imageProperties.tintColor = .systemYellow
    config.textProperties.font = .systemFont(ofSize: 16, weight: .medium)
    config.secondaryTextProperties.color = .secondaryLabel
    
    cell.contentConfiguration = config
    return cell
}
```

```
Content Configuration 的优势：
  - 替代了被废弃的 textLabel / detailTextLabel / imageView
  - 配置是值类型（struct），可以复用和组合
  - 系统自动处理布局和适配
  - 与 UIBackgroundConfiguration 配合控制背景样式
  - 支持自定义 Configuration：实现 UIContentConfiguration 协议

Background Configuration：
  var bgConfig = UIBackgroundConfiguration.listPlainCell()
  bgConfig.backgroundColor = .systemBackground
  bgConfig.cornerRadius = 8
  bgConfig.strokeColor = .separator
  bgConfig.strokeWidth = 1.0 / UIScreen.main.scale
  cell.backgroundConfiguration = bgConfig
```

### 10.2 UICollectionView.CellRegistration 与 List Layout

```swift
// iOS 14+ 将 CollectionView 当作 TableView 使用
func createListLayout() -> UICollectionViewCompositionalLayout {
    var config = UICollectionLayoutListConfiguration(appearance: .insetGrouped)
    config.headerMode = .supplementary
    config.trailingSwipeActionsConfigurationProvider = { indexPath in
        let deleteAction = UIContextualAction(style: .destructive, title: "删除") {
            _, _, completion in
            // 删除逻辑
            completion(true)
        }
        return UISwipeActionsConfiguration(actions: [deleteAction])
    }
    return UICollectionViewCompositionalLayout.list(using: config)
}

// List Configuration 的 appearance 选项：
//   .plain             类似 UITableView plain 样式
//   .grouped           类似 UITableView grouped 样式
//   .insetGrouped      类似 UITableView insetGrouped 样式
//   .sidebar           侧边栏样式（iPad）
//   .sidebarPlain      侧边栏无分组样式
```

```
iOS 14+ 趋势：UICollectionView 统一列表和网格

  Apple 的方向是用 UICollectionView 替代 UITableView：
    - CollectionView + List Layout = 完全等价于 TableView
    - 但 CollectionView 还能做网格、瀑布流、横向滚动等
    - 新 API（CellRegistration、ContentConfiguration）优先支持 CollectionView
    - UITableView 短期内不会废弃，但新功能主要在 CollectionView 上

  建议：
    - 新项目优先使用 UICollectionView + Compositional Layout
    - 旧项目的 UITableView 继续维护即可，无需强制迁移
    - 但如果有复杂的布局需求（如多种 Section 布局混合），直接用 CollectionView
```

---

## 面试题

### Q1：UITableView 的 Cell 复用机制是怎么实现的？

```
A：UITableView 内部维护了一个复用池（Reuse Pool），按 reuseIdentifier 分组。

  当 Cell 滚出屏幕时，TableView 不会销毁它，而是将它放入复用池中。
  当需要显示新的 Cell 时，先用 dequeueReusableCell(withIdentifier:for:)
  从复用池中查找同一 identifier 的空闲 Cell。

  如果复用池中有可用的 Cell，直接返回（需要重新配置数据）。
  如果没有，系统会根据注册信息自动创建新的 Cell 实例。

  这样，整个列表无论有多少条数据，实际创建的 Cell 数量
  大约只有屏幕可见数量 + 1~2 个缓冲，大幅节省内存。

  使用复用机制时需要注意：
    - 在 cellForRowAt 中必须对所有属性重新赋值（因为 Cell 可能携带旧数据）
    - 在 prepareForReuse() 中重置自定义状态
    - 异步加载的内容（如图片）需要校验 Cell 是否仍然对应当前数据
```

### Q2：contentOffset、contentSize、contentInset 分别是什么？它们之间的关系？

```
A：这三个是 UIScrollView 的核心属性：

  contentSize：内容的总大小
    - 代表 ScrollView 内部内容区域的宽高
    - 决定了可以滚动的范围

  contentOffset：当前滚动的偏移量
    - 代表内容区域左上角相对于 ScrollView 可见区域左上角的偏移
    - 改变 contentOffset 就是在"滚动"
    - 初始值通常是 (0, 0)，向下滚动 y 增大

  contentInset：内容区域的内边距
    - 在内容周围添加额外的可滚动空间
    - 不改变 contentSize，但改变了可滚动的范围
    - 典型用途：为 NavigationBar/TabBar 预留空间

  关系：
    可见区域的显示内容 = contentOffset + visibleRect
    可滚动范围 = contentSize + contentInset
    iOS 11+ 还有 adjustedContentInset = contentInset + safeAreaInsets
```

### Q3：DiffableDataSource 相比传统的 DataSource 有什么优势？

```
A：DiffableDataSource 的核心优势：

  1. 消除数据不一致崩溃
     传统方式中 numberOfRows 和 cellForRowAt 读取的数据源可能不同步，
     导致 NSInternalInconsistencyException 崩溃。
     DiffableDataSource 使用 Snapshot 确保数据一致性。

  2. 自动计算差异并动画
     传统方式需要手动计算 insert/delete/move 的 indexPath，
     DiffableDataSource 只需 apply 新的 Snapshot，系统自动 diff 并动画。

  3. 线程安全
     apply 方法可以在后台线程调用，系统自动在主线程更新 UI。

  4. 类型安全
     Section 和 Item 使用 Hashable 类型，编译时检查。

  注意事项：
     - Item 的 Hashable 必须确保唯一性（推荐用唯一 ID）
     - 如果 Item 内容变了但 hash 没变，显示不会更新
       需要使用 reconfigureItems（iOS 15+）或 reloadItems
```

### Q4：如何解决列表滑动卡顿？

```
A：从以下几个方面排查和优化：

  1. Cell 复杂度：减少视图层级，避免在 cellForRowAt 中做重操作

  2. 图片处理：使用 SDWebImage/Kingfisher 异步加载和后台解码，
     确保在 prepareForReuse 中取消上一次请求

  3. 离屏渲染：避免 cornerRadius + masksToBounds + shadow 组合，
     使用 shadowPath，用模拟器 Color Off-screen Rendered 排查

  4. 高度计算：缓存已计算的 Cell 高度，设置合理的 estimatedRowHeight

  5. 预加载：实现 UITableViewDataSourcePrefetching，
     提前加载即将显示的数据

  6. 主线程：确保所有 I/O 操作、数据解析在后台线程完成

  7. 减少 reloadData：使用局部刷新（reloadRows）或 DiffableDataSource
```

### Q5：UICollectionView 的 Compositional Layout 解决了什么问题？

```
A：Compositional Layout 解决了 FlowLayout 的局限性：

  FlowLayout 的问题：
    - 只能实现简单的流式布局（等宽行或等高列）
    - 所有 Section 必须使用相同的布局规则
    - 复杂布局（如不同 Section 不同样式）需要自定义 Layout，代码复杂

  Compositional Layout 的优势：
    - 通过 Item -> Group -> Section 的组合，声明式地描述布局
    - 每个 Section 可以有不同的布局（网格、列表、横向滚动）
    - 内置 orthogonalScrollingBehavior 支持 Section 级横向滚动
    - 支持 Self-Sizing（.estimated 尺寸）
    - 配合 DiffableDataSource 实现完整的现代化列表

  典型应用场景：
    - App Store 首页（Banner + 横向滚动列表 + 网格混合）
    - 电商首页（不同 Section 不同布局风格）
    - 设置页（分组列表样式）
```

### Q6：ScrollView 嵌套滚动冲突怎么解决？

```
A：根据嵌套方向有不同的解决策略：

  同方向嵌套（如外层垂直 + 内层垂直）：
    - 通过 scrollViewDidScroll 代理判断当前由谁响应滚动
    - 设置阈值（如外层滚到头部隐藏后锁定，让内层接管滚动）
    - 维护 canOuterScroll / canInnerScroll 标志位

  交叉方向嵌套（如外层水平 + 内层垂直）：
    - 通常系统能自动处理
    - 如果有冲突，使用 gestureRecognizerShouldBegin 根据手势速度方向过滤
    - 或使用 shouldRecognizeSimultaneouslyWith 允许手势共存

  通用原则：
    - gestureRecognizerShouldBegin 控制手势是否开始识别
    - shouldRecognizeSimultaneouslyWith 控制多个手势是否可以同时识别
    - shouldBeRequiredToFailBy 控制手势优先级
```

### Q7：Cell 复用导致的图片错乱怎么解决？

```
A：图片错乱是 Cell 复用最经典的问题，解决方案有三层：

  第一层 — 清空旧数据：
    在 prepareForReuse 中将 imageView.image 设为 nil
    在 cellForRowAt 中设置占位图

  第二层 — 校验 Cell 身份：
    异步回调中通过 tableView.cellForRow(at:) 获取当前 Cell
    如果返回 nil（Cell 不可见）或不是同一个 Cell，放弃更新

  第三层 — 取消旧请求：
    在 prepareForReuse 中取消上一次的网络请求
    避免旧请求返回后覆盖新数据

  最佳实践：使用 SDWebImage / Kingfisher 等成熟的图片库
  它们内部同时实现了上述三层保护：取消旧请求、设置占位图、校验 Cell 身份
```

### Q5-深度：Compositional Layout 核心概念详解（Item / Group / Section）

```
A：Compositional Layout 的三层结构是理解一切的关键：

  Item（最小单位）— 对应一个 Cell：
    // 定义 Cell 尺寸，支持固定、自适应、灵活尺寸
    let itemSize = NSCollectionLayoutSize(
        width: .fractionalWidth(0.5),   // 占 group 宽度的 50%
        height: .estimated(200)           // 自 sizing
    )
    let item = NSCollectionLayoutItem(layoutSize: itemSize)
    // 可附加 boundaryInsets、contentInsets 实现间距

  Group（组织层）— 决定 Item 如何排列：
    // Horizontal：Item 横向排列，自动换行（网格效果）
    let group = NSCollectionLayoutGroup.horizontal(
        layoutSize: .init(width: .fractionalWidth(1.0), height: .estimated(200)),
        subitems: [item]
    )
    // Vertical：Item 纵向排列（列表效果）
    // Orthogonal：与滚动方向垂直（横向滚动效果）

  Section（顶层）— 定义 Group 排列方向和滚动行为：
    let section = NSCollectionLayoutSection(group: group)
    section.orthogonalScrollingBehavior = .continuousGroupGapLeading(16)
    // continuousGroupGapLeading：Section 内 Group 横向连续滚动
    // 配合 Group.vertical 实现横向卡片轮播

  三个核心滚动行为：
    - .none：默认，Section 随 UICollectionView 垂直滚动
    - .continuous / .continuousGroupGapLeading：横向无限滚动
    - .paginated：分页滚动（如 Tinder 式卡片翻页）

  高级技巧 — 边界间距：
    section.interGroupSpacing = 12         // Group 间距
    section.contentInsets = .init(top: 8, leading: 16, bottom: 8, trailing: 16)

⚠️ Pitfalls: estimated 尺寸必须接近真实值，否则首次渲染会跳动；orthogonalScrollingBehavior 只在滚动方向与 Group 排列方向垂直时生效。
✅ Best Practice: 用闭包构造函数 UICollectionViewCompositionalLayout { sectionIndex, env in } 实现多 Section 差异化布局。
```

### Q6-进阶：UICollectionViewSupplementaryItem 用于 Header/Footer

```
A：Supplementary View 是 CollectionView 实现 Header/Footer 的官方方式，与 TableView 的 headerView 本质不同：

  // 1. 在 Layout 中声明 Supplementary Item
  let header = NSCollectionLayoutBoundarySupplementaryItem(
      layoutSize: NSCollectionLayoutSize(width: .fractionalWidth(1.0), height: .estimated(50)),
      elementKind: UICollectionView.elementKindSectionHeader,
      alignment: .top
  )
  section.boundarySupplementaryItems = [header]

  // 2. 注册并返回 Supplementary View
  collectionView.register(HeaderView.self, forSupplementaryViewOfKind: .sectionHeader, withReuseIdentifier: "Header")
  func collectionView(_ cv: UICollectionView, viewForSupplementaryElementOfKind kind: String, at indexPath: IndexPath) -> UICollectionReusableView {
      let header = cv.dequeueReusableSupplementaryView(ofKind: kind, withReuseIdentifier: "Header", for: indexPath) as! HeaderView
      return header
  }

  与 TableView 关键差异：
    - CollectionView Header 参与布局计算，可设置 inset、间距
    - 支持 pinToVisibleBounds(true) 实现吸顶效果
    - Footer 使用 .sectionFooter kind，配置方式完全对称
    - 每个 Section 可独立配置不同的 Header/Footer 尺寸

⚠️ Pitfalls: Supplementary Item 必须添加到 Section.boundarySupplementaryItems，而非 Group.subitems，否则完全不显示。
✅ Best Practice: 用 pinToVisibleBounds() 实现吸顶 Header，配合 contentInsets.top 控制触发位置。
```

### Q7-进阶：Diffable Data Sources（NSDiffableDataSourceSnapshot）内部机制

```
A：Diffable Data Source 是 iOS 11+ 官方推荐的 CollectionView/TableView 数据源方案，核心由两部分组成：

  1. NSDiffableDataSourceSnapshot — 描述"应该展示什么"
    var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
    snapshot.appendSections([.main, .favorites])
    snapshot.appendItems(mainItems, toSection: .main)
    // 内部维护 Section-ID → Items 的哈希映射，支持 O(1) 增删改查

  2. NSDiffableDataSource — 桥接 Snapshot 与 Cell 配置
    let dataSource = UICollectionViewDiffableDataSource<Section, Item>(collectionView: cv) { cv, ip, item in
        let cell = cv.dequeueReusableCell(withReuseIdentifier: "Cell", for: ip)
        cell.configure(with: item)
        return cell
    }
    dataSource.apply(snapshot, animatingDifferences: true)  // 自动计算差异并执行增量更新

  内部工作原理 — Three-Way Diff 算法：
    - 保存旧 Snapshot 的哈希副本（before state）
    - 新 apply 时，对比新旧 Snapshot，O(n) 时间计算出 insert/delete/move/update
    - 自动调用 UICollectionView 的 insertItems/deleteItems/reloadItems/moveItems
    - 动画同步执行，无需手动管理 indexPath 变化

  对比手动更新的核心优势：
    - 消除 indexPath 偏移导致的崩溃（indexPathOutOfBounds）
    - 自动处理 Section 重排、Item 移动、批量操作原子化
    - 支持 apply(snapshot, animatingDifferences:completion:) 链式操作

⚠️ Pitfalls: Item 必须实现 Hashable，且 hash 值在 Session 内保持稳定，否则 Diff 会把同一 Item 误判为"删除+新增"导致不必要的 Cell 重建。
✅ Best Practice: 用 Snapshot.appendItems(contentsOf:toSection:) 批量操作后再 apply，避免逐条 modify 导致多次 Diff 计算。
```

### 带过渡配置的批量更新（performBatchUpdates + Snapshot 动画）

使用 Diffable Data Source 的 `apply(snapshot, animatingDifferences: true)` 时，系统自动计算差异并触发插入/删除/移动动画。但默认的过渡动画可能不符合产品设计需求，此时需结合 `performBatchUpdates` 自定义过渡样式。

```swift
// ✅ 1. 基础批量更新（Diffable 自动处理动画）
var snapshot = dataSource.snapshot()
snapshot.appendItems(newItems, toSection: .main)
dataSource.apply(snapshot, animatingDifferences: true)

// ✅ 2. 自定义 Cell 插入/删除过渡动画
dataSource.apply(snapshot, animatingDifferences: true) {
    // 自定义 scrollPosition 和额外回调
    self.collectionView.scrollToItem(at: targetIndexPath, at: .top, animated: true)
}

// ✅ 3. 高级：结合 Layout 过渡（iOS 13+）
if let transitionLayout = self.collectionView.collectionViewLayout
        .initialLayoutTransactionWithLayout(compositionalLayout) {
    self.collectionView.transition(to: transitionLayout, viewPosition: .maintain)
    // 布局变更 + 数据变更原子化执行
}

// ✅ 4. 性能优化：大列表时禁用动画
dataSource.apply(snapshot, animatingDifferences: itemCount < 50)
// 超过 50 项差异时直接刷新，避免动画卡顿
```

**Pitfalls:** 在 `performBatchUpdates` 的 closures 中不要同时调用 `apply(snapshot)` 和手动的 `insertItems(at:)`，两者冲突会导致崩溃（invalid update）；Diffable Data Source 已内部调用 batch update，手动再调一次会触发断言失败。

**Best Practice:** 优先使用 Diffable Data Source 的 `apply(animatingDifferences:)`，需要自定义动画时才结合 `performBatchUpdates` 手动控制 insert/delete 的过渡样式；大批量操作（>100项）时关闭动画直接刷新以保证流畅度。


### UICollectionView 自适应尺寸 Cell 与 estimatedRowHeight

与 UITableView 类似，UICollectionView 也支持基于 Auto Layout 的自适应 Cell 高度（宽度），核心机制是设置 `estimatedItemSize`。当启用了估计尺寸后，Collection View 会先以估计值布局 Cell，Cell 渲染完毕后再根据 Auto Layout 约束计算出实际尺寸并调整布局。

```swift
// ✅ 1. 启用自适配尺寸（iOS 10.0+ 推荐 .automatic）
let layout = UICollectionViewFlowLayout()
layout.estimatedItemSize = UICollectionViewFlowLayout.automaticSize

// ✅ 2. Cell 内部必须提供完整的约束链
class DynamicCell: UICollectionViewCell {
    private let label = UILabel()
    override init(frame: CGRect) {
        super.init(frame: frame)
        label.translatesAutoresizingMaskIntoConstraints = false
        label.numberOfLines = 0
        contentView.addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: contentLayoutGuide.topAnchor, constant: 8),
            label.bottomAnchor.constraint(equalTo: contentLayoutGuide.bottomAnchor, constant: -8),
            label.leadingAnchor.constraint(equalTo: contentLayoutGuide.leadingAnchor, constant: 8),
            label.trailingAnchor.constraint(equalTo: contentLayoutGuide.trailingAnchor, constant: -8)
        ])
    }
}

// ✅ 3. 多 Section 不同高度时，为每个 Section 设置独立估计值
layout.sectionProperties = [
    NSWINGSectionFlowLayout(Section.kind: .chat, estimatedItemSize: CGSize(width: 320, height: 80)),
    NSWINGSectionFlowLayout(Section.kind: .photo, estimatedItemSize: CGSize(width: 150, height: 150))
]
```

⚠️ Pitfalls: Cell 的内容宽度/高度必须通过约束完整锚定到 `contentLayoutGuide`（iOS 13+）或 Cell 的 `topAnchor/bottomAnchor`，缺少任一方向约束会导致自适配失效，Cell 退化为固定尺寸。
✅ Best Practice: 多 Section 场景下为每个 Section 配置贴近实际的 estimatedItemSize，可显著减少首次渲染后的布局跳动（content offset jump），提升滚动流畅度。


### UITableView 基于 Auto Layout 的自适应尺寸

UITableView 支持 Cell 高度由 Auto Layout 自动计算，无需在 `heightForRow` 中手动返回固定值。设置 `rowHeight = .automatic` 后，Table View 会读取 Cell 的约束链自动推算高度。配合 `estimatedRowHeight` 可避免 `numberOfRows` 被调用 N 次的性能问题。

```swift
tableView.rowHeight = UITableView.automaticDimension
tableView.estimatedRowHeight = 80

class DynamicCell: UITableViewCell {
    let label = UILabel()
    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            label.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 8),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -8)
        ])
    }
}
```

**Pitfalls:** Cell 内部的UILabel必须设置 `numberOfLines = 0` 否则多行文本会被截断；约束链必须从 `contentView.topAnchor` 到 `bottomAnchor` 完整覆盖，缺少任一约束会导致高度计算为 `estimatedRowHeight` 的固定值。
**Best Practice:** 始终同时设置 `estimatedRowHeight`，让 Table View 预分配合理空间，避免首屏加载时 contentSize 剧烈跳动导致的布局闪烁。

### UIScrollView contentOffset / contentSize 编程式滚动

通过设置 UIScrollView 的 `contentOffset` 属性可实现编程式滚动定位，配合 `scrollRectToVisible(_:animated:)` 可滚动到指定区域。`contentSize` 决定可滚动范围，`contentInset` 可在边缘添加额外滚动空间。

```swift
// 滚动到特定偏移量
scrollView.setContentOffset(CGPoint(x: 0, y: 500), animated: true)

// 滚动到指定矩形区域（自动计算 offset）
scrollView.scrollRectToVisible(targetFrame, animated: true)

// 动态调整 contentSize（如聊天消息追加时）
scrollView.contentSize = CGSize(width: bounds.width, height: lastMessageBottom + 100)

// contentInset 边缘留白（如避免 Safe Area 遮挡）
scrollView.contentInset = UIEdgeInsets(top: 0, left: 0, bottom: 60, right: 0)

// 监听滚动状态
scrollView.delegate = self
func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let offset = scrollView.contentOffset.y
    // 根据 offset 实现下拉刷新、吸顶等逻辑
}
```

**Pitfalls:** 在 `viewDidLoad` 中设置 `contentOffset` 无效（此时 frame 未确定），应延后至 `viewDidLayoutSubviews` 或使用 `DispatchQueue.main.async` 延迟执行。

**Best Practice:** 聊天列表追加消息后，先计算新 contentSize 再调用 `scrollRectToVisible` 定位到最新消息区域，比直接设 `contentOffset` 更可靠。


### UIScrollView 缩放（zoomToRect、minimumZoomScale 与 UIScrollViewDelegate）

UIScrollView 内置缩放功能，通过 `minimumZoomScale` / `maximumZoomScale` 设定缩放范围，配合 `viewForZoomingIn` 委托方法指定可缩放的子视图。调用 `zoomToRect(_:animated:)` 可实现编程式缩放定位（如双击放大）。

```swift
class ZoomViewController: UIViewController, UIScrollViewDelegate {
    let scrollView = UIScrollView()
    let imageView = UIImageView(image: UIImage(named: "photo"))

    override func viewDidLoad() {
        super.viewDidLoad()
        scrollView.delegate = self
        scrollView.minimumZoomScale = 0.5
        scrollView.maximumZoomScale = 3.0
        scrollView.bouncesZoom = true  // 超出范围时弹性回弹
        scrollView.addSubview(imageView)
        view.addSubview(scrollView)
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return imageView  // 必须实现
    }

    // 双击缩放：在点击处放大
    func scrollViewDoubleTap(_ gesture: UITapGestureRecognizer) {
        let point = gesture.location(in: imageView)
        let rect = CGRect(x: point.x - 100, y: point.y - 100, width: 200, height: 200)
        scrollView.zoom(to: rect, animated: true)
    }
}
```

⚠️ Pitfalls: `viewForZooming(in:)` 是必实现的委托方法，返回 nil 则缩放完全不生效；缩放的视图必须是 ScrollView 的直接子视图。
✅ Best Practice: 双击放大时以手势触点为中心计算 zoomRect，比简单的 `setZoomScale` 体验更自然，用户不会被跳转到意外的区域。

### UICollectionViewCell / UITableViewCell 复用标识符优化

复用机制的核心是 `reuseIdentifier`。系统根据 identifier 从复用池中取 cell，identifier 越多，复用池越分散，内存峰值越高。对于同质化的列表，使用统一的 identifier 可最大化复用效率。

```swift
// ❌ 错误：每种 cell 类型单独注册一个 identifier
tableView.register(ImageCell.self, forCellReuseIdentifier: "ImageCell")
tableView.register(TextCell.self, forCellReuseIdentifier: "TextCell")

// ✅ 优化：同类型 cell 使用统一 identifier + dequeue 后配置
let cell = tableView.dequeueReusableCell(withIdentifier: "ImageCell", for: indexPath) as! ImageCell
cell.configure(with: items[indexPath.row])
```

**进阶技巧：** 使用 `cellForItemAt` 时返回的 cell 可能来自复用池，务必在 `configure()` 中重置所有属性（包括 hidden、alpha、constraints），避免"幽灵数据"残留。

**Pitfalls:** 动态混合布局时（如 Chat 聊天中的 text/image/video cell），每 kind 分 identifier 是必须的，但应控制种类在 3-5 种以内，避免复用池碎片化。

**Best Practice:** 优先使用 `register(_:forCellWithReuseIdentifier:)` 而非 XIB/storyboard 注册，配合 `dequeueReusableCell(withReuseIdentifier:for:)` 可避免 nil 检查，减少运行时崩溃风险。

### PrefetchingDataSource 实现细节

UICollectionView 通过 `UICollectionViewDataSourcePrefetching` 协议支持预加载，在 cell 进入可视区域前提前加载数据（图片、网络请求等），消除滚动时的白屏闪烁。

```swift
class PhotoViewController: UIViewController {
    let collectionView: UICollectionView = {
        let cv = UICollectionView(frame: .zero, collectionViewLayout: UICollectionViewFlowLayout())
        return cv
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        collectionView.prefetchingDataSource = self
    }
}

extension PhotoViewController: UICollectionViewDataSourcePrefetching {
    func collectionView(_ collectionView: UICollectionView,
                        prefetchItemsAt indexPaths: [IndexPath]) {
        for indexPath in indexPaths {
            Task {
                let photo = await loadImage(from: items[indexPath.row].url)
                cache.store(photo, key: items[indexPath.row].url)
            }
        }
    }

    func collectionView(_ collectionView: UICollectionView,
                        cancelPrefetchingForItemsAt indexPaths: [IndexPath]) {
        for indexPath in indexPaths {
            cache.cancelRequest(for: items[indexPath.row].url)
        }
    }
}
```

⚠️ Pitfalls: `prefetchItemsAt` 可能在非主线程调用，直接更新 UI 会崩溃；预加载数据务必先写缓存再关联 cell，避免竞态导致错图。
✅ Best Practice: 配合 `prepareForReuse()` 取消进行中的异步任务，使用 `URLSession` 的 `cancel()` 或 `Task.isCancelled` 及时终止无用预加载。

### Section 预览 / 拖拽重排

iOS 13+ 的 UICollectionViewCompositionalLayout 支持 section 级别的拖拽重排与预览动画。通过 `UIDragInteraction` 与 `UIDropInteraction` 配合 `UICollectionViewDiffableDataSource`，可实现 fluid 的 reorder 体验，拖拽时 cell 自动让位并显示占位符。

```swift
let layout = UICollectionViewCompositionalLayout { sectionIndex, _ in
    var section = NSCollectionLayoutSection(layout: NSCollectionLayoutGridLayout(itemCount: 4))
    section.interGroupSpacing = 8
    // 启用 section preview：拖拽时显示整个 section 的缩略预览
    section.contentMode = .sectionRoot
    return section
}

// DiffableDataSource 驱动的拖拽重排
func applyNewOrder(_ items: [Item], to section: Section) {
    var snapshot = dataSource.snapshot()
    snapshot.reloadItems(items)  // 自动 diff + 动画过渡
    dataSource.apply(snapshot, animatingDifferences: true)
}

// 手动启用 drag & drop
collectionView.dragDelegate = self
collectionView.dropDelegate = self
```

⚠️ Pitfalls: `localObject` 必须是 `NSObject` 子类，纯 struct 需包裹在 `Box<T>` 中；拖拽目标 region 计算错误会导致 drop 不触发。
✅ Best Practice: 优先使用 `UIContextMenuConfiguration` + `previewProvider` 实现类 3D Touch 风格的 preview 视图，DiffableDataSource 的 `animatingDifferences` 自动处理 reorder 动画。

### Compositional layout 动画与过渡

UICollectionViewCompositionalLayout 配合 DiffableDataSource 可实现声明式动画过渡。通过 `NSCollectionLayoutBoundarySupplementaryItem` 与 `NSCollectionLayoutDecorationItem` 自定义 section header/footer 与 decoration view 的入场动画。iOS 15+ 的 `animatingTo:completion:` API 允许在 layout 属性变化时触发隐式过渡动画。

```swift
var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
snapshot.appendSections([.photos, .videos])
snapshot.appendItems(photoItems, toSection: .photos)

// 自动 diff + 插值动画
dataSource.apply(snapshot, animatingDifferences: true) {
    print("动画完成")
}

// 自定义 layout 属性过渡（iOS 15+）
let layout = UICollectionViewCompositionalLayout.build {
    var config = UICollectionLayoutListConfiguration(appearance: .insetGrouped)
    return .list(configuration: config)
}

// 滚动到指定 item 并附带动画
collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: true)
```

⚠️ Pitfalls: `performBatchUpdates` 与 `apply(snapshot)` 混用会导致动画冲突，二选一即可。
✅ Best Practice: 优先用 DiffableDataSource 的 `apply(animatingDifferences:)`，框架自动计算 insert/delete/reorder/move 动画，无需手动管理 indexPath。

### Supplementary views vs Decoration views

在 UICollectionView 中，supplementary views（section header/footer）是真实参与布局的视图元素，拥有独立的数据源和 indexPath，可响应点击和事件；而 decoration views 仅用于背景装饰（如分割线、底色块），不参与 content size 计算，不绑定数据源，由 layout 的 `decorationViewForElementOfKind:forSection:atIndex:withReuseIdentifier:` 提供。

```swift
// 1) 注册 supplementary view（header）
collectionView.register(SectionHeader.self,
    forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader,
    withReuseIdentifier: "Header")

// 2) 提供 header 数据
func collectionView(_ cv: UICollectionView,
    viewForSupplementaryElementOfKind kind: String,
    at indexPath: IndexPath) -> UICollectionReusableView {
    let header = cv.dequeueReusableSupplementaryView(
        ofKind: kind, withReuseIdentifier: "Header", for: indexPath)
    return header
}

// 3) Decoration view（仅背景装饰，无需数据源）
func layoutDecorationView(forElementOfKind kind: String,
    forSectionAt section: Int,
    layoutAttributes: UICollectionViewLayoutAttributes)
    -> UICollectionLayoutDecorationViewItem {
    var deco = UICollectionLayoutDecorationViewItem(kind: "divider",
        layoutAttributes: layoutAttributes)
    deco.backgroundColor = .systemGray5
    return deco
}
```

⚠️ Pitfalls: decoration views 不会触发 `cellForItemAt`，也不能通过 `cellForItemAt` 访问；在 CompositionalLayout 中通过 `NSCollectionLayoutDecorationItem` 声明式配置即可，无需手动提供视图实例。
✅ Best Practice: 背景底色用 decoration view（性能优于 UIImageView），分隔线用 `boundarySupplementaryItem` 实现，避免为每个 cell 额外添加子 view。

### UICollectionViewLayout 失效与 performBatchUpdates

在使用 `performBatchUpdates` 进行批量 cell 增删改时，若 layout 属性（如 `sectionInset`、`itemSize`）同时变化，可能导致 layout 失效 —— 表现为 cell 位置跳动、动画错乱或崩溃。根本原因是 batch updates 期间 layout 需要多次 reprepare，而手动修改 layout 属性会触发额外的 `invalidateLayout()`，与框架内部状态冲突。

```swift
// ❌ 错误写法：在 batch updates 块内修改 layout 属性
collectionView.performBatchUpdates {
    dataSource.apply(snapshot, animatingDifferences: true)
    layout.sectionInset = UIEdgeInsets(top: 10, left: 0, bottom: 10, right: 0)
}

// ✅ 正确写法：layout 属性变化放在 batch updates 之前或之后
layout.sectionInset = UIEdgeInsets(top: 10, left: 0, bottom: 10, right: 0)
collectionView.performBatchUpdates {
    dataSource.apply(snapshot, animatingDifferences: true)
} completion: { _ in
    // 完成回调
}
```

⚠️ Pitfalls: `performBatchUpdates` 与 `apply(snapshot, animatingDifferences:)` 功能重叠，同时使用会导致双重动画和布局错乱，**二选一**。
✅ Best Practice: 优先使用 DiffableDataSource 的 `apply()` 方法，layout 属性变更通过 `UICollectionViewCompositionalLayout` 的 section provider 回调动态返回，避免显式 `invalidateLayout()`。
