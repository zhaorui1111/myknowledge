# MVC / MVP / MVVM 架构详解

---

## 一、架构模式概述

### 1.1 为什么需要架构模式

```
没有架构的代码：

  ViewController.m（3000 行）
    - 网络请求
    - JSON 解析
    - 数据库读写
    - UI 布局
    - 业务逻辑
    - 动画
    - 代理回调
    - 通知处理
    - ...

问题：
  1. Massive ViewController — VC 承担所有职责，代码臃肿
  2. 无法测试 — 业务逻辑和 UI 耦合，无法单独测试
  3. 难以维护 — 修改一个功能可能影响其他功能
  4. 难以复用 — 业务逻辑绑死在 VC 中，无法在其他场景复用

架构模式的核心目标：
  - 关注点分离（Separation of Concerns）
  - 提高可测试性（Testability）
  - 降低耦合度（Low Coupling）
  - 提高可维护性和可复用性
```

### 1.2 三种架构的核心区别

```
三种架构的本质区别在于：View 如何获取数据、谁来处理业务逻辑。

MVC（Model-View-Controller）：
  Controller 同时持有 Model 和 View，充当中间人

MVP（Model-View-Presenter）：
  Presenter 持有 View 的协议引用，通过协议更新 View

MVVM（Model-View-ViewModel）：
  ViewModel 暴露数据流，View 通过绑定自动更新

                MVC                 MVP                 MVVM
          ┌────────────┐    ┌────────────┐      ┌────────────┐
          │   Model     │    │   Model     │      │   Model     │
          └──────┬─────┘    └──────┬─────┘      └──────┬─────┘
                 │                 │                    │
          ┌──────┴─────┐    ┌──────┴─────┐      ┌──────┴─────┐
          │ Controller  │    │ Presenter   │      │ ViewModel   │
          └──┬─────┬───┘    └──┬─────┬───┘      └──────┬─────┘
             │     │           │     │                  │
          直接操作  │        协议回调  │            数据绑定（单向/双向）
             │     │           │     │                  │
          ┌──┴─────┴───┐    ┌──┴─────┴───┐      ┌──────┴─────┐
          │    View     │    │    View     │      │    View     │
          └────────────┘    └────────────┘      └────────────┘
```

---

## 二、MVC（Model-View-Controller）

### 2.1 Apple 的 MVC

```
Apple 官方推荐的 MVC：

  ┌─────────┐     通知/KVO      ┌─────────┐
  │  Model   │ ───────────────→ │Controller│
  │          │ ←─────────────── │          │
  │ 数据+逻辑 │     更新数据      │  中间人   │
  └─────────┘                   └────┬────┘
                                     │
                              用户操作↑ │↓ 更新UI
                                     │
                                ┌────┴────┐
                                │  View    │
                                │  UI展示   │
                                └─────────┘

  Model：数据模型和业务逻辑，不依赖 View 和 Controller
  View：UI 展示，不包含业务逻辑，通过代理/action 通知 Controller
  Controller：协调 Model 和 View，处理用户交互

理想状态下 View 和 Model 互不知道对方的存在，Controller 是唯一的桥梁。
```

### 2.2 iOS 中 MVC 的现实

```
iOS 实际的 MVC：

  ┌─────────┐                  ┌──────────────────┐
  │  Model   │ ←──────────────→│   ViewController  │
  │          │                  │                  │
  └─────────┘                  │  Controller 职责  │
                                │  + View 生命周期  │
                                │  + View 配置      │
                                │  + 布局           │
                                │  + 数据源/代理     │
                                └────────┬─────────┘
                                         │
                                    ┌────┴────┐
                                    │  View    │
                                    └─────────┘

问题：UIViewController 同时承担了 Controller 和 View 的职责
  - viewDidLoad 中配置 UI
  - 实现 UITableViewDataSource / UITableViewDelegate
  - 处理网络回调更新 UI
  - 管理 View 的生命周期

结果：Controller 成了 "Massive View Controller"
```

### 2.3 标准 MVC 代码示例

```objc
// ===== Model =====
@interface User : NSObject
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *avatar;
@property (nonatomic, assign) NSInteger followersCount;
@end


// ===== View =====
@protocol UserCellDelegate <NSObject>
- (void)userCellDidTapFollow:(UserCell *)cell;
@end

@interface UserCell : UITableViewCell
@property (nonatomic, weak) id<UserCellDelegate> delegate;
- (void)configureWithUser:(User *)user;
@end

@implementation UserCell

- (void)configureWithUser:(User *)user {
    self.nameLabel.text = user.name;
    self.followersLabel.text = [NSString stringWithFormat:@"%ld 粉丝", user.followersCount];
    [self.avatarView sd_setImageWithURL:[NSURL URLWithString:user.avatar]];
}

- (void)followButtonTapped {
    [self.delegate userCellDidTapFollow:self];
}

@end


// ===== Controller =====
@interface UserListViewController () <UITableViewDataSource, UITableViewDelegate, UserCellDelegate>
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) NSArray<User *> *users;
@end

@implementation UserListViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    [self setupUI];
    [self fetchUsers];
}

- (void)setupUI {
    self.tableView = [[UITableView alloc] initWithFrame:self.view.bounds];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    [self.tableView registerClass:[UserCell class] forCellReuseIdentifier:@"UserCell"];
    [self.view addSubview:self.tableView];
}

- (void)fetchUsers {
    // 网络请求
    [[NetworkManager shared] GET:@"/users" completion:^(NSArray *data) {
        self.users = [User arrayWithJSON:data];
        [self.tableView reloadData];
    }];
}

#pragma mark - UITableViewDataSource

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return self.users.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UserCell *cell = [tableView dequeueReusableCellWithIdentifier:@"UserCell"
                                                     forIndexPath:indexPath];
    cell.delegate = self;
    [cell configureWithUser:self.users[indexPath.row]];
    return cell;
}

#pragma mark - UserCellDelegate

- (void)userCellDidTapFollow:(UserCell *)cell {
    NSIndexPath *indexPath = [self.tableView indexPathForCell:cell];
    User *user = self.users[indexPath.row];
    [[NetworkManager shared] POST:[NSString stringWithFormat:@"/follow/%@", user.name]
                       completion:^(BOOL success) {
        if (success) {
            user.followersCount += 1;
            [self.tableView reloadRowsAtIndexPaths:@[indexPath]
                                  withRowAnimation:UITableViewRowAnimationNone];
        }
    }];
}

@end
```

### 2.4 MVC 的优化方向

```
减轻 ViewController 的方法：

1. 将 DataSource 抽离为独立对象

@interface UserListDataSource : NSObject <UITableViewDataSource>
@property (nonatomic, strong) NSArray<User *> *users;
@end

2. 将网络请求抽离到 Service 层

@interface UserService : NSObject
- (void)fetchUsersCompletion:(void(^)(NSArray<User *> *))completion;
- (void)followUser:(User *)user completion:(void(^)(BOOL))completion;
@end

3. 将 Cell 配置逻辑放到 View Model / Presenter（此时已演化为 MVP/MVVM）

4. 使用 Child ViewController 拆分大页面

优化后的 ViewController 只负责：
  - 组装各组件
  - 响应用户操作，调用 Service
  - 将 Service 结果传给 View
```

### 2.5 MVC 优缺点

```
优点：
  - 简单直观，学习成本低
  - Apple 官方推荐，UIKit 天然支持
  - 小型页面开发速度快
  - 团队成员都能理解

缺点：
  - ViewController 容易膨胀（Massive VC）
  - Controller 和 View 紧耦合（VC 管理 View 生命周期）
  - 业务逻辑难以单元测试（依赖 UIKit）
  - Model 到 View 的数据转换逻辑散落在 Controller 中

适用场景：
  - 简单页面（设置页、关于页）
  - 原型开发、快速迭代
  - 小型项目
```

---

## 三、MVP（Model-View-Presenter）

### 3.1 MVP 架构

```
MVP 的核心改进：引入 Presenter 替代 Controller 处理业务逻辑，
View 和 Presenter 通过协议（Protocol）通信。

┌─────────┐                 ┌─────────────┐
│  Model   │ ←─────────────→│  Presenter   │
│          │  请求/返回数据   │             │
└─────────┘                 │ 业务逻辑     │
                             │ 数据转换     │
                             └──────┬──────┘
                                    │
                              协议回调↑ │↓ 调用协议方法更新 UI
                                    │
                             ┌──────┴──────┐
                             │    View      │
                             │  (VC + View) │
                             │  纯 UI 操作   │
                             └─────────────┘

关键特征：
  1. Presenter 持有 View 的协议引用（弱引用），不持有具体 View
  2. View（ViewController）持有 Presenter
  3. View 只负责 UI 展示，所有逻辑交给 Presenter
  4. Presenter 不 import UIKit，完全独立于 UI 框架
  5. Presenter 可以直接用 XCTest 测试（不需要 UI 环境）
```

### 3.2 MVP 代码示例（Objective-C）

```objc
// ===== Model =====
@interface User : NSObject
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *avatar;
@property (nonatomic, assign) NSInteger followersCount;
@end


// ===== View Protocol =====
// Presenter 通过这个协议更新 View，不直接依赖 UIKit
@protocol UserListViewProtocol <NSObject>
- (void)showLoading;
- (void)hideLoading;
- (void)showUsers:(NSArray<User *> *)users;
- (void)showError:(NSString *)message;
- (void)updateUserAtIndex:(NSInteger)index;
@end


// ===== Presenter =====
@interface UserListPresenter : NSObject

@property (nonatomic, weak) id<UserListViewProtocol> view;  // 弱引用！
@property (nonatomic, strong) NSArray<User *> *users;

- (instancetype)initWithView:(id<UserListViewProtocol>)view;
- (void)loadUsers;
- (void)followUserAtIndex:(NSInteger)index;
- (NSInteger)numberOfUsers;
- (User *)userAtIndex:(NSInteger)index;

@end

@interface UserListPresenter ()
@property (nonatomic, strong) UserService *userService;
@end

@implementation UserListPresenter

- (instancetype)initWithView:(id<UserListViewProtocol>)view {
    self = [super init];
    if (self) {
        _view = view;
        _userService = [[UserService alloc] init];
    }
    return self;
}

- (void)loadUsers {
    [self.view showLoading];

    [self.userService fetchUsersCompletion:^(NSArray<User *> *users, NSError *error) {
        [self.view hideLoading];

        if (error) {
            [self.view showError:error.localizedDescription];
        } else {
            self.users = users;
            [self.view showUsers:users];
        }
    }];
}

- (void)followUserAtIndex:(NSInteger)index {
    User *user = self.users[index];

    [self.userService followUser:user completion:^(BOOL success) {
        if (success) {
            user.followersCount += 1;
            [self.view updateUserAtIndex:index];
        } else {
            [self.view showError:@"关注失败"];
        }
    }];
}

- (NSInteger)numberOfUsers {
    return self.users.count;
}

- (User *)userAtIndex:(NSInteger)index {
    return self.users[index];
}

@end


// ===== View（ViewController）=====
@interface UserListViewController () <UserListViewProtocol, UITableViewDataSource, UserCellDelegate>
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) UserListPresenter *presenter;
@end

@implementation UserListViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.presenter = [[UserListPresenter alloc] initWithView:self];
    [self setupUI];
    [self.presenter loadUsers];
}

- (void)setupUI {
    self.tableView = [[UITableView alloc] initWithFrame:self.view.bounds];
    self.tableView.dataSource = self;
    [self.tableView registerClass:[UserCell class] forCellReuseIdentifier:@"UserCell"];
    [self.view addSubview:self.tableView];
}

#pragma mark - UserListViewProtocol

- (void)showLoading {
    [MBProgressHUD showHUDAddedTo:self.view animated:YES];
}

- (void)hideLoading {
    [MBProgressHUD hideHUDForView:self.view animated:YES];
}

- (void)showUsers:(NSArray<User *> *)users {
    [self.tableView reloadData];
}

- (void)showError:(NSString *)message {
    UIAlertController *alert = [UIAlertController
        alertControllerWithTitle:@"错误" message:message
                  preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"确定" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)updateUserAtIndex:(NSInteger)index {
    NSIndexPath *indexPath = [NSIndexPath indexPathForRow:index inSection:0];
    [self.tableView reloadRowsAtIndexPaths:@[indexPath]
                          withRowAnimation:UITableViewRowAnimationNone];
}

#pragma mark - UITableViewDataSource

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return [self.presenter numberOfUsers];
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UserCell *cell = [tableView dequeueReusableCellWithIdentifier:@"UserCell"
                                                     forIndexPath:indexPath];
    cell.delegate = self;
    [cell configureWithUser:[self.presenter userAtIndex:indexPath.row]];
    return cell;
}

#pragma mark - UserCellDelegate

- (void)userCellDidTapFollow:(UserCell *)cell {
    NSIndexPath *indexPath = [self.tableView indexPathForCell:cell];
    [self.presenter followUserAtIndex:indexPath.row];
}

@end
```

### 3.3 MVP 单元测试

```objc
// MVP 的最大优势：Presenter 可以脱离 UIKit 进行单元测试

// ===== Mock View =====
@interface MockUserListView : NSObject <UserListViewProtocol>
@property (nonatomic, assign) BOOL showLoadingCalled;
@property (nonatomic, assign) BOOL hideLoadingCalled;
@property (nonatomic, strong) NSArray<User *> *displayedUsers;
@property (nonatomic, copy) NSString *errorMessage;
@property (nonatomic, assign) NSInteger updatedIndex;
@end

@implementation MockUserListView

- (void)showLoading { self.showLoadingCalled = YES; }
- (void)hideLoading { self.hideLoadingCalled = YES; }
- (void)showUsers:(NSArray<User *> *)users { self.displayedUsers = users; }
- (void)showError:(NSString *)message { self.errorMessage = message; }
- (void)updateUserAtIndex:(NSInteger)index { self.updatedIndex = index; }

@end


// ===== 测试用例 =====
@interface UserListPresenterTests : XCTestCase
@property (nonatomic, strong) MockUserListView *mockView;
@property (nonatomic, strong) UserListPresenter *presenter;
@end

@implementation UserListPresenterTests

- (void)setUp {
    [super setUp];
    self.mockView = [[MockUserListView alloc] init];
    self.presenter = [[UserListPresenter alloc] initWithView:self.mockView];
}

- (void)testLoadUsers_ShowsLoading {
    [self.presenter loadUsers];
    XCTAssertTrue(self.mockView.showLoadingCalled);
}

- (void)testLoadUsers_Success_ShowsUsers {
    // 配置 mock service 返回数据...
    [self.presenter loadUsers];

    XCTAssertTrue(self.mockView.hideLoadingCalled);
    XCTAssertNotNil(self.mockView.displayedUsers);
    XCTAssertNil(self.mockView.errorMessage);
}

- (void)testFollowUser_Success_UpdatesView {
    // 准备数据...
    [self.presenter followUserAtIndex:0];
    XCTAssertEqual(self.mockView.updatedIndex, 0);
}

@end

// Presenter 完全不依赖 UIKit → 可以用普通 XCTest 测试
// 不需要启动模拟器或加载 Storyboard
```

### 3.4 MVP 优缺点

```
优点：
  - 业务逻辑集中在 Presenter，VC 只负责 UI
  - Presenter 不依赖 UIKit，可以轻松单元测试
  - View 和业务逻辑解耦，View 可以被替换
  - 比 MVC 更清晰的职责划分

缺点：
  - 代码量增多（需要定义 View Protocol + Presenter）
  - View Protocol 可能变得很长（每个 UI 更新都要一个方法）
  - Presenter 与 View 之间存在命令式通信（调用方法更新）
  - 简单页面使用 MVP 显得过度设计

适用场景：
  - 业务逻辑较复杂的页面
  - 需要单元测试的项目
  - ObjC 项目的架构升级
```

---

## 四、MVVM（Model-View-ViewModel）

### 4.1 MVVM 架构

```
MVVM 的核心改进：用数据绑定替代命令式更新。
ViewModel 暴露数据状态，View 通过绑定机制自动响应变化。

┌─────────┐                 ┌─────────────┐
│  Model   │ ←─────────────→│  ViewModel   │
│          │  请求/返回数据   │             │
└─────────┘                 │ 业务逻辑     │
                             │ 数据转换     │
                             │ 状态管理     │
                             └──────┬──────┘
                                    │
                              数据绑定（自动）
                              Binding / Combine / RxSwift
                                    │
                             ┌──────┴──────┐
                             │    View      │
                             │  (VC + View) │
                             │  观察数据变化  │
                             │  自动更新 UI  │
                             └─────────────┘

关键特征：
  1. ViewModel 暴露可观察的属性（Observable）
  2. View 绑定这些属性，数据变化时 UI 自动更新
  3. ViewModel 不持有 View 的任何引用（与 MVP 最大的不同）
  4. ViewModel 不 import UIKit
  5. 数据流向清晰：Model → ViewModel → View（单向绑定）
     或 View ↔ ViewModel ↔ Model（双向绑定）

MVP vs MVVM 的核心区别：
  MVP：Presenter 调用 view.showUsers(users) → 命令式
  MVVM：ViewModel.users 变化 → View 自动刷新 → 声明式
```

### 4.2 MVVM + Combine 示例（Swift）

```swift
import Foundation
import Combine

// ===== Model =====
struct User: Identifiable {
    let id: String
    var name: String
    var avatar: String
    var followersCount: Int
}


// ===== Service =====
class UserService {
    func fetchUsers() -> AnyPublisher<[User], Error> {
        // 实际项目中这里是网络请求
        let users = [
            User(id: "1", name: "Alice", avatar: "https://...", followersCount: 100),
            User(id: "2", name: "Bob", avatar: "https://...", followersCount: 200)
        ]
        return Just(users)
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }

    func followUser(_ user: User) -> AnyPublisher<Bool, Error> {
        return Just(true)
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
}


// ===== ViewModel =====
class UserListViewModel: ObservableObject {
    // 输出：View 绑定这些属性
    @Published var users: [User] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let userService: UserService
    private var cancellables = Set<AnyCancellable>()

    init(userService: UserService = UserService()) {
        self.userService = userService
    }

    // 输入：View 调用这些方法
    func loadUsers() {
        isLoading = true
        errorMessage = nil

        userService.fetchUsers()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completion in
                self?.isLoading = false
                if case .failure(let error) = completion {
                    self?.errorMessage = error.localizedDescription
                }
            } receiveValue: { [weak self] users in
                self?.users = users
            }
            .store(in: &cancellables)
    }

    func followUser(at index: Int) {
        guard index < users.count else { return }
        let user = users[index]

        userService.followUser(user)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completion in
                if case .failure(_) = completion {
                    self?.errorMessage = "关注失败"
                }
            } receiveValue: { [weak self] success in
                if success {
                    self?.users[index].followersCount += 1
                }
            }
            .store(in: &cancellables)
    }

    // 数据转换：将 Model 数据格式化为 View 需要的格式
    func followersText(for index: Int) -> String {
        return "\(users[index].followersCount) 粉丝"
    }
}


// ===== View（UIKit + Combine 绑定）=====
class UserListViewController: UIViewController {
    private let tableView = UITableView()
    private let viewModel = UserListViewModel()
    private var cancellables = Set<AnyCancellable>()

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        bindViewModel()
        viewModel.loadUsers()
    }

    private func setupUI() {
        tableView.frame = view.bounds
        tableView.dataSource = self
        tableView.register(UserCell.self, forCellReuseIdentifier: "UserCell")
        view.addSubview(tableView)
    }

    private func bindViewModel() {
        // 绑定 users → 刷新列表
        viewModel.$users
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.tableView.reloadData()
            }
            .store(in: &cancellables)

        // 绑定 isLoading → 显示/隐藏 Loading
        viewModel.$isLoading
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isLoading in
                if isLoading {
                    // 显示 loading
                } else {
                    // 隐藏 loading
                }
            }
            .store(in: &cancellables)

        // 绑定 errorMessage → 显示错误
        viewModel.$errorMessage
            .compactMap { $0 }  // 过滤 nil
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                let alert = UIAlertController(title: "错误", message: message,
                                              preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "确定", style: .default))
                self?.present(alert, animated: true)
            }
            .store(in: &cancellables)
    }
}

extension UserListViewController: UITableViewDataSource {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return viewModel.users.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "UserCell", for: indexPath) as! UserCell
        let user = viewModel.users[indexPath.row]
        cell.nameLabel.text = user.name
        cell.followersLabel.text = viewModel.followersText(for: indexPath.row)
        cell.onFollowTapped = { [weak self] in
            self?.viewModel.followUser(at: indexPath.row)
        }
        return cell
    }
}
```

### 4.3 MVVM + SwiftUI 示例

```swift
// SwiftUI 天然支持 MVVM，@Published + @ObservedObject 就是内置的绑定机制

// ===== ViewModel（同上，直接复用）=====
// UserListViewModel 不需要任何修改


// ===== View（SwiftUI）=====
struct UserListView: View {
    @StateObject private var viewModel = UserListViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("加载中...")
                } else {
                    List(Array(viewModel.users.enumerated()), id: \.element.id) { index, user in
                        UserRow(user: user, followersText: viewModel.followersText(for: index)) {
                            viewModel.followUser(at: index)
                        }
                    }
                }
            }
            .navigationTitle("用户列表")
            .alert("错误", isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )) {
                Button("确定") { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
        .onAppear {
            viewModel.loadUsers()
        }
    }
}

struct UserRow: View {
    let user: User
    let followersText: String
    let onFollow: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(user.name)
                    .font(.headline)
                Text(followersText)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Button("关注", action: onFollow)
        }
    }
}

// SwiftUI 中：
// @Published 属性变化 → SwiftUI 自动重新计算 body → UI 自动更新
// 不需要手动 reloadData，不需要绑定代码
// 这是 MVVM 最自然的实现方式
```

### 4.4 MVVM + RxSwift 示例

```swift
import RxSwift
import RxCocoa

// ===== ViewModel =====
class UserListViewModel {
    // 输入
    let loadTrigger = PublishRelay<Void>()
    let followTrigger = PublishRelay<Int>()

    // 输出
    let users: Driver<[User]>
    let isLoading: Driver<Bool>
    let errorMessage: Driver<String>

    private let disposeBag = DisposeBag()

    init(userService: UserService = UserService()) {
        let loadingRelay = BehaviorRelay<Bool>(value: false)
        let usersRelay = BehaviorRelay<[User]>(value: [])
        let errorRelay = PublishRelay<String>()

        // 加载用户
        loadTrigger
            .do(onNext: { loadingRelay.accept(true) })
            .flatMapLatest { _ in
                userService.rxFetchUsers()
                    .catch { error in
                        errorRelay.accept(error.localizedDescription)
                        return .just([])
                    }
            }
            .do(onNext: { _ in loadingRelay.accept(false) })
            .bind(to: usersRelay)
            .disposed(by: disposeBag)

        // 关注用户
        followTrigger
            .withLatestFrom(usersRelay) { index, users in (index, users) }
            .flatMapLatest { index, users in
                userService.rxFollowUser(users[index])
                    .map { success in (index, success) }
                    .catch { error in
                        errorRelay.accept("关注失败")
                        return .empty()
                    }
            }
            .subscribe(onNext: { index, success in
                if success {
                    var users = usersRelay.value
                    users[index].followersCount += 1
                    usersRelay.accept(users)
                }
            })
            .disposed(by: disposeBag)

        // 输出
        self.users = usersRelay.asDriver()
        self.isLoading = loadingRelay.asDriver()
        self.errorMessage = errorRelay.asDriver(onErrorJustReturn: "")
    }
}


// ===== View =====
class UserListViewController: UIViewController {
    private let tableView = UITableView()
    private let viewModel = UserListViewModel()
    private let disposeBag = DisposeBag()

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        bindViewModel()
        viewModel.loadTrigger.accept(())
    }

    private func bindViewModel() {
        // users → tableView
        viewModel.users
            .drive(tableView.rx.items(cellIdentifier: "UserCell", cellType: UserCell.self)) {
                index, user, cell in
                cell.nameLabel.text = user.name
                cell.followersLabel.text = "\(user.followersCount) 粉丝"
                cell.followButton.rx.tap
                    .map { index }
                    .bind(to: self.viewModel.followTrigger)
                    .disposed(by: cell.disposeBag)
            }
            .disposed(by: disposeBag)

        // isLoading → HUD
        viewModel.isLoading
            .drive(onNext: { [weak self] isLoading in
                isLoading ? MBProgressHUD.showAdded(to: self!.view, animated: true)
                          : MBProgressHUD.hide(for: self!.view, animated: true)
            })
            .disposed(by: disposeBag)

        // errorMessage → Alert
        viewModel.errorMessage
            .filter { !$0.isEmpty }
            .drive(onNext: { [weak self] message in
                // 显示错误提示
            })
            .disposed(by: disposeBag)
    }
}
```

### 4.5 MVVM 的数据绑定方式对比

```
iOS 中实现 MVVM 数据绑定的几种方式：

┌──────────────┬─────────────┬────────────┬──────────────┐
│              │  KVO         │  Combine    │  RxSwift      │
├──────────────┼─────────────┼────────────┼──────────────┤
│ 系统版本     │ 任意         │ iOS 13+    │ 第三方库      │
│ 语言         │ ObjC/Swift  │ Swift      │ Swift         │
│ 响应式       │ 基础         │ 完整       │ 最完整        │
│ 操作符       │ 无           │ 丰富       │ 极其丰富      │
│ 线程调度     │ 手动         │ 内置       │ 内置          │
│ 内存管理     │ 需手动移除   │ AnyCancellable │ DisposeBag │
│ 学习曲线     │ 低           │ 中         │ 高            │
│ 社区生态     │ -            │ Apple 官方 │ 庞大          │
│ SwiftUI 集成 │ 不适合       │ 天然集成   │ 需要桥接      │
└──────────────┴─────────────┴────────────┴──────────────┘

还有其他方式：
  - 闭包回调（最简单，无需第三方库）
  - Delegate 协议（类 MVP）
  - NotificationCenter（松耦合但不推荐大量使用）

推荐选择：
  新项目/SwiftUI → Combine
  已有 RxSwift 基础设施的项目 → RxSwift
  ObjC 项目 → KVO 或闭包回调
```

### 4.6 MVVM 单元测试

```swift
// ViewModel 不依赖 UIKit，可以直接测试

class UserListViewModelTests: XCTestCase {
    var viewModel: UserListViewModel!
    var mockService: MockUserService!
    var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        mockService = MockUserService()
        viewModel = UserListViewModel(userService: mockService)
        cancellables = Set<AnyCancellable>()
    }

    func testLoadUsers_Success() {
        // 准备
        let expectedUsers = [User(id: "1", name: "Alice", avatar: "", followersCount: 100)]
        mockService.stubbedUsers = expectedUsers

        let expectation = expectation(description: "加载用户")

        // 观察
        viewModel.$users
            .dropFirst()  // 跳过初始值
            .sink { users in
                XCTAssertEqual(users.count, 1)
                XCTAssertEqual(users.first?.name, "Alice")
                expectation.fulfill()
            }
            .store(in: &cancellables)

        // 执行
        viewModel.loadUsers()

        waitForExpectations(timeout: 1)
    }

    func testLoadUsers_SetsLoading() {
        var loadingStates: [Bool] = []

        viewModel.$isLoading
            .sink { loadingStates.append($0) }
            .store(in: &cancellables)

        viewModel.loadUsers()

        // 预期：false → true → false
        XCTAssertEqual(loadingStates, [false, true, false])
    }

    func testFollowUser_IncrementsCount() {
        viewModel.users = [User(id: "1", name: "Alice", avatar: "", followersCount: 100)]
        mockService.stubbedFollowResult = true

        let expectation = expectation(description: "关注用户")

        viewModel.$users
            .dropFirst()
            .sink { users in
                XCTAssertEqual(users[0].followersCount, 101)
                expectation.fulfill()
            }
            .store(in: &cancellables)

        viewModel.followUser(at: 0)

        waitForExpectations(timeout: 1)
    }
}
```

### 4.7 MVVM 优缺点

```
优点：
  - 数据绑定减少了胶水代码（不需要手动调用 reloadData）
  - ViewModel 完全独立于 UIKit，测试性极好
  - ViewModel 不持有 View，无循环引用风险
  - SwiftUI 天然支持，开发体验最佳
  - 数据流清晰，状态管理集中

缺点：
  - 需要绑定框架支持（Combine / RxSwift / 自定义）
  - RxSwift 学习曲线陡峭
  - 调试困难（响应式链路长，断点不好打）
  - 简单页面绑定代码反而增加复杂度
  - 双向绑定容易导致循环更新

适用场景：
  - SwiftUI 项目（首选）
  - 数据驱动的复杂页面（表单、列表、筛选等）
  - 需要高测试覆盖率的项目
  - 已使用 RxSwift / Combine 的项目
```

---

## 五、三种架构的完整对比

### 5.1 对比表

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│              │  MVC          │  MVP          │  MVVM         │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 数据更新方式 │ Controller   │ Presenter    │ 数据绑定      │
│              │ 直接操作View │ 通过协议回调  │ 自动响应      │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ View 知道    │ 不知道Model  │ 不知道Model  │ 不知道Model   │
│ 什么？       │              │ 知道Presenter│ 知道ViewModel │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 中间层持有   │ Controller   │ Presenter    │ ViewModel     │
│ View？       │ 直接持有     │ 持有协议引用  │ 不持有 View   │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 可测试性     │ 差           │ 好           │ 好            │
│              │ 依赖UIKit    │ Mock协议即可  │ 观察输出即可  │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 代码量       │ 最少          │ 中等         │ 中等          │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 学习成本     │ 低           │ 低-中        │ 中-高         │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ VC 体积      │ 大（臃肿）   │ 小           │ 小            │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 通信方式     │ 直接调用     │ 协议/代理    │ 绑定/订阅     │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 适合框架     │ UIKit        │ UIKit        │ SwiftUI/UIKit │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 典型场景     │ 简单页面     │ ObjC复杂页面  │ 数据驱动页面  │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

### 5.2 数据流对比

```
MVC 数据流：
  User Action → Controller → 更新 Model
  Model 变化 → Controller → 直接操作 View

  缺点：Controller 既读 Model 又写 View，职责不清

MVP 数据流：
  User Action → View → 调用 Presenter 方法
  Presenter → 更新 Model → 调用 View Protocol 方法

  缺点：Presenter 需要逐个调用协议方法，命令式更新

MVVM 数据流：
  User Action → View → 调用 ViewModel 方法
  ViewModel → 更新 Model → @Published 属性变化 → View 自动刷新

  优点：声明式，数据驱动，单向数据流
```

---

## 六、进阶架构模式

### 6.1 VIPER

```
VIPER 将职责拆分得更细：

  View → Interactor → Presenter → Entity → Router
   V         I           P          E        R

┌──────┐  用户操作  ┌──────────┐  业务逻辑  ┌────────────┐
│ View  │ ────────→ │ Presenter │ ────────→ │ Interactor  │
│      │ ←──────── │          │ ←──────── │            │
│ UI   │  更新UI   │ 展示逻辑  │  数据结果  │ 业务+数据   │
└──────┘           └─────┬────┘           └─────┬──────┘
                         │                       │
                   ┌─────┴────┐            ┌─────┴──────┐
                   │  Router   │            │  Entity     │
                   │ 页面跳转   │            │ 数据模型    │
                   └──────────┘            └────────────┘

各层职责：
  View：纯 UI，委托事件给 Presenter
  Interactor：业务逻辑，与 Service/Repository 交互
  Presenter：展示逻辑，数据格式化，协调 View 和 Interactor
  Entity：数据模型（POJO）
  Router：负责页面间的导航跳转

优点：职责极其清晰，测试性最好
缺点：代码量大幅增加，一个页面至少 5 个文件，过度设计风险高
适用：大型团队、复杂业务模块
```

### 6.2 Clean Architecture

```
Clean Architecture 强调依赖规则：外层依赖内层，内层不知道外层。

┌─────────────────────────────────────────┐
│           Frameworks & Drivers           │
│  (UIKit / SwiftUI / Core Data / Network)│
│  ┌─────────────────────────────────┐    │
│  │      Interface Adapters          │    │
│  │  (ViewModels / Presenters /      │    │
│  │   Controllers / Gateways)        │    │
│  │  ┌─────────────────────────┐    │    │
│  │  │    Use Cases             │    │    │
│  │  │  (Application Logic)     │    │    │
│  │  │  ┌─────────────────┐   │    │    │
│  │  │  │    Entities       │   │    │    │
│  │  │  │  (Domain Models)  │   │    │    │
│  │  │  └─────────────────┘   │    │    │
│  │  └─────────────────────────┘    │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘

依赖方向：外层 → 内层（从不反向）

Entities：核心业务模型，不依赖任何框架
Use Cases：应用业务规则，一个 UseCase 对应一个用户操作
Interface Adapters：ViewModel/Presenter，转换数据格式
Frameworks：UIKit、数据库、网络等具体实现

通过 Protocol 实现依赖反转：
  UseCase 定义 Repository 协议
  外层提供具体实现（CoreData / Network）
  内层完全不知道外层的实现细节
```

### 6.3 Coordinator 模式

```swift
// Coordinator 解决的问题：将导航逻辑从 ViewController 中抽离

protocol Coordinator: AnyObject {
    var childCoordinators: [Coordinator] { get set }
    var navigationController: UINavigationController { get set }
    func start()
}

class AppCoordinator: Coordinator {
    var childCoordinators: [Coordinator] = []
    var navigationController: UINavigationController

    init(navigationController: UINavigationController) {
        self.navigationController = navigationController
    }

    func start() {
        let userListCoordinator = UserListCoordinator(navigationController: navigationController)
        userListCoordinator.parentCoordinator = self
        childCoordinators.append(userListCoordinator)
        userListCoordinator.start()
    }
}

class UserListCoordinator: Coordinator {
    var childCoordinators: [Coordinator] = []
    var navigationController: UINavigationController
    weak var parentCoordinator: AppCoordinator?

    init(navigationController: UINavigationController) {
        self.navigationController = navigationController
    }

    func start() {
        let viewModel = UserListViewModel()
        viewModel.coordinator = self  // ViewModel 通知 Coordinator 跳转
        let vc = UserListViewController(viewModel: viewModel)
        navigationController.pushViewController(vc, animated: false)
    }

    func showUserDetail(user: User) {
        let detailVC = UserDetailViewController(user: user)
        navigationController.pushViewController(detailVC, animated: true)
    }

    func showLogin() {
        let loginCoordinator = LoginCoordinator(navigationController: navigationController)
        childCoordinators.append(loginCoordinator)
        loginCoordinator.start()
    }
}

// Coordinator 的好处：
// - ViewController 不知道其他 VC 的存在
// - 导航逻辑集中管理
// - 便于 A/B 测试不同的导航流程
// - 可以和 MVC/MVP/MVVM 任意架构组合使用
```

---

## 七、实际项目中的选择策略

### 7.1 不同场景的推荐

```
场景                          推荐架构
─────────────────────────────────────────────
简单页面（设置、关于）        MVC
中等复杂度 ObjC 页面          MVP
数据驱动的 Swift 页面         MVVM + Combine
SwiftUI 项目                 MVVM（天然支持）
大型模块/多人协作              VIPER / Clean Architecture
全 App 导航管理               + Coordinator

混合策略（大型项目推荐）：
  - 简单页面用 MVC（不过度设计）
  - 核心业务页面用 MVVM
  - 全局导航用 Coordinator
  - 复杂模块用 Clean Architecture 分层
  
不要强求整个 App 只用一种架构，根据页面复杂度灵活选择。
```

### 7.2 渐进式迁移

```
从 MVC 迁移到 MVVM 的步骤：

Step 1：抽离网络请求到 Service 层
  MVC 的 VC 中直接网络请求 → 提取到 UserService

Step 2：抽离数据转换逻辑到 ViewModel
  VC 中的 "字符串拼接/日期格式化/金额格式化" → 移到 ViewModel

Step 3：引入数据绑定
  ViewModel 使用 @Published
  VC 订阅变化自动更新

Step 4：VC 只负责 UI 配置和事件转发
  setupUI() + bindViewModel() + 事件传递给 ViewModel

不需要一次性重构整个项目：
  新页面 → MVVM
  老页面 → 逐步重构高优先级的
```

---

## 八、常见面试题

### Q1：MVC、MVP、MVVM 的区别？

```
MVC：Controller 持有 Model 和 View，直接操作 View 更新 UI。
     iOS 中 ViewController 同时承担 C 和 V 的职责，容易臃肿。

MVP：Presenter 取代 Controller，通过 Protocol 与 View 通信。
     Presenter 不依赖 UIKit，可以单元测试。
     View 和 Presenter 是命令式通信（调用方法）。

MVVM：ViewModel 暴露可观察属性，View 通过绑定自动更新。
      ViewModel 不持有 View，通信方式是声明式（数据绑定）。
      需要 Combine/RxSwift 等框架支持。

核心区别：数据更新的方式不同。
  MVC → 直接操作
  MVP → 协议回调
  MVVM → 数据绑定
```

### Q2：为什么 iOS 的 MVC 容易变成 Massive VC？

```
原因：
  1. UIViewController 同时管理 View 的生命周期和业务逻辑
  2. UITableView 的 DataSource/Delegate 通常写在 VC 中
  3. 网络回调直接在 VC 中更新 UI
  4. 没有明确的 "业务逻辑层" → 逻辑全堆在 VC

解决：
  - 抽离 DataSource 为独立对象
  - 网络请求放到 Service 层
  - 数据格式化放到 ViewModel
  - 复杂布局使用 Child ViewController
```

### Q3：MVP 和 MVVM 的核心区别？

```
MVP：
  - Presenter 持有 View 的协议引用（弱引用）
  - Presenter 通过调用协议方法主动更新 View
  - 命令式通信：presenter.loadUsers() → view.showUsers(users)

MVVM：
  - ViewModel 不持有 View 的任何引用
  - ViewModel 只暴露数据状态，View 自己订阅变化
  - 声明式通信：viewModel.users 变化 → View 自动刷新

实际影响：
  - MVP 的 View Protocol 可能随功能增长而膨胀
  - MVVM 的 ViewModel 更简洁，但需要绑定框架
  - MVVM 更适合 SwiftUI，MVP 更适合纯 ObjC 项目
```

### Q4：MVVM 中 ViewModel 应该 import UIKit 吗？

```
不应该。

ViewModel 的设计原则：
  - 只依赖 Foundation / Combine / 业务层
  - 不 import UIKit / SwiftUI
  - 不持有任何 View 或 ViewController 的引用
  - 不包含 UIColor / UIImage / UIFont 等 UI 类型

如果 ViewModel 需要提供颜色/字体等信息，应该：
  - 返回语义值（如 enum State { case normal, error }）
  - View 层根据语义值决定具体的 UIColor

好处：
  - ViewModel 可以跨平台复用（iOS / macOS / watchOS）
  - 可以在纯 XCTest 中测试，不需要 UI 环境
```

### Q5：Combine 和 RxSwift 怎么选？

```
Combine：
  - Apple 官方框架，iOS 13+
  - SwiftUI 天然集成
  - 无需第三方依赖
  - 操作符不如 RxSwift 丰富，但基本够用
  - 社区资源逐渐增多

RxSwift：
  - 第三方库，支持 iOS 9+
  - 操作符极其丰富
  - RxCocoa 提供 UIKit 绑定扩展
  - 庞大的社区和生态
  - 包体积增加

选择建议：
  新项目/最低支持 iOS 13+ → Combine
  需要丰富的操作符/已有 RxSwift 基础设施 → RxSwift
  ObjC 项目 → ReactiveCocoa（ObjC 版响应式框架）
```

### Q6：如何在 MVVM 中处理导航跳转？

```
ViewModel 不应该直接处理导航（因为不能 import UIKit）。

方案1：闭包回调
  viewModel.onShowDetail = { [weak self] user in
      let detailVC = DetailViewController(user: user)
      self?.navigationController?.pushViewController(detailVC, animated: true)
  }

方案2：Coordinator 模式（推荐）
  ViewModel 通知 Coordinator → Coordinator 处理跳转
  ViewModel 完全不知道导航细节

方案3：Router
  通过 URL Router 解耦
  viewModel 触发 router.open("app://detail?id=123")

SwiftUI 中：
  NavigationStack + NavigationPath 天然支持
  ViewModel 管理 path，SwiftUI 根据 path 自动导航
```

### Q7：实际项目中怎么选择架构？

```
不要教条主义，根据实际情况选择：

1. 项目规模
   小型/个人项目 → MVC 足够
   中型项目 → MVVM
   大型项目 → MVVM + Coordinator + Clean Architecture

2. 团队情况
   团队熟悉 ObjC → MVP
   团队熟悉 Swift + 响应式 → MVVM
   多人协作大模块 → VIPER / Clean

3. 技术栈
   SwiftUI → MVVM（唯一合理选择）
   UIKit + Combine → MVVM
   UIKit + ObjC → MVC 或 MVP

4. 页面复杂度
   一个项目内可以混合使用
   简单页面 MVC，复杂页面 MVVM
```

### Q8：什么是单向数据流？MVVM 如何实现？

```
单向数据流：数据只朝一个方向流动，不形成环。

MVVM 的单向数据流：
  User Action → View → ViewModel（Input）
  ViewModel 处理逻辑 → 更新 @Published 状态（Output）
  View 观察状态变化 → 自动更新 UI

  View → ViewModel → Model
          ↓
        State 变化
          ↓
        View 更新

好处：
  - 状态可预测（知道数据从哪来、到哪去）
  - 调试容易（追踪状态变化即可）
  - 避免了双向绑定可能导致的循环更新

SwiftUI 天然是单向数据流：
  @State / @Published 变化 → body 重新计算 → View 更新
  用户操作 → 修改 State → 又触发更新
  整个流程清晰可控
```


### MVVM + Combine（iOS 13+）响应式模式

Combine 是 Apple 官方响应式框架，天然契合 MVVM。ViewModel 用 @Published 暴露状态，View 自动响应变化，无需手动添加/移除观察者。核心组件：@Published（状态源）、@State（View 内部状态）、@ObservedObject（观察 ViewModel）、@EnvironmentObject（跨层级传递）。

优势：零 boilerplate（比 RxSwift 轻量，无需第三方依赖）、类型安全（编译器捕获绑定错误）、自动内存管理（弱引用 ViewModel，无循环引用风险）。

```swift
@MainActor
class LoginViewModel: ObservableObject {
    @Published var username: String = ""
    @Published var password: String = ""
    @Published var isLoggedIn: Bool = false
    @Published var errorMessage: String?
    private let api = AuthService.shared

    var canLogin: Bool { !username.isEmpty && password.count >= 6 }

    func login() {
        api.login(username: username, password: password)
            .receive(on: DispatchQueue.main)
            .replaceError(with: false)
            .assign(to: &$isLoggedIn)
        api.login(username: username, password: password)
            .map { _ in "" }.catch { $0.localizedDescription }
            .assign(to: &$errorMessage)
    }
}

struct LoginView: View {
    @ObservedObject var vm: LoginViewModel
    var body: some View {
        VStack {
            TextField("用户名", text: $vm.username)
            SecureField("密码", text: $vm.password)
            Button("登录") { vm.login() }.disabled(!vm.canLogin)
            if let msg = vm.errorMessage { Text(msg).foregroundColor(.red) }
        }
    }
}
```

**Pitfall**: @Published 在 MainActor 外修改会崩溃，确保 UI 相关状态在主线程更新。
**Best Practice**: ViewModel 标注 @MainActor，所有网络回调用 .receive(on:) 切回主线程。

### MVVM + Swift async/await 模式

Swift 5.5 引入的 async/await 彻底简化了 ViewModel 中的异步逻辑，取代了 Combine 的复杂的 operator 链、RxSwift 的订阅管理，以及传统的嵌套 closure。ViewModel 直接声明 async 方法，View 通过 @State 或 task {} 调用，错误处理用标准 do-catch 而非自定义 Error 枚举映射。

Core: 用 MainActor 保证 UI 线程安全，async let 并发执行独立请求，withTaskCancellation 处理页面退出取消。

```swift
@MainActor
class ProfileViewModel: ObservableObject {
    @Published var user: User?
    @Published var posts: [Post] = []
    @Published var error: String?
    private let api: APIService

    func loadData() async {
        do {
            async let userTask = api.fetchUser(id: 42)
            async let postsTask = api.fetchPosts(userId: 42)
            let (userResult, postsResult) = try await (userTask, postsTask)
            self.user = userResult
            self.posts = postsResult
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ProfileView: View {
    @StateObject var vm = ProfileViewModel(api: .shared)
    var body: some View {
        VStack {
            if let user = vm.user { Text(user.name) }
            ForEach(vm.posts) { post in Text(post.title) }
        }
        .task { await vm.loadData() }
    }
}
```

**Pitfall**: @StateObject 在 View 初始化时创建，每次导航都可能重建 ViewModel，改用 @State 或注入依赖。
**Best Practice**: 异步 ViewModel 方法标注 @MainActor，View 侧用 .task {} 自动管理取消令牌。

### Clean Architecture（用例、实体、接口适配器）

Clean Architecture 由 Robert C. Martin 提出，核心思想是**业务逻辑独立于框架与 UI**，通过分层与单向依赖解耦。iOS 实现中通常分为三层：Domain（实体与用例）、Data（仓库实现与数据源）、Presentation（ViewModel 与 View）。依赖规则：外层依赖内层，内层对外层零认知。

Core: 实体是核心业务对象（如 User、Order），用例是原子业务操作（如 LoginUseCase），接口适配器负责将外部数据转为领域对象。

```swift
// Domain Layer
struct User { let id: UUID; let name: String }

protocol LoginUseCase {
    func execute(username: String, password: String) async throws -> User
}

// Data Layer
protocol UserRepository {
    func login(username: String, password: String) async throws -> RemoteUser
}

struct LoginUseCaseImpl: LoginUseCase {
    private let repo: any UserRepository
    func execute(username: String, password: String) async throws -> User {
        let remote = try await repo.login(username: username, password: password)
        return User(id: remote.id, name: remote.name)  // 适配转换
    }
}
```

**Pitfall**: 不要在 Domain 层引入 UIKit/AppKit/Network 类型，否则破坏可测试性与框架无关性。
**Best Practice**: 每层通过 Protocol 接口交互，测试时用 Mock 替换 Data 层，确保 Domain 单元测试零外部依赖。


### VIPER 架构优缺点与样板代码精简

VIPER 将模块拆分为 **V**iew、**I**nteractor、**P**resenter、**E**ntity、**R**outer 五层，严格实现单一职责与依赖倒置。iOS 团队多用于大型项目以保障可测试性与模块隔离，但样板代码爆炸是最大痛点。精简策略：合并 Router 到 Presenter（路由逻辑简单时）、用依赖注入减少中间 Protocol 层级、将 Entity 与 Interactor 的 Request/Response 合并为通用 Model。

```swift
// 精简 VIPER - View → Presenter → Interactor，Router 由 Presenter 兼任
protocol ProfileViewModelInput { func viewDidLoad(); func didTapFollow() }
protocol ProfileViewModelOutput { func updateUser(user: User) }

final class ProfilePresenter: ProfileViewModelOutput {
    weak var view: ProfileViewModelOutput?
    private let interactor: ProfileInteractor
    func viewDidLoad() { view?.viewDidLoad(); interactor.loadUser() }
    func didTapFollow() { interactor.followUser { [weak self] in self?.navigateToFollowed() } }
    func updateUser(user: User) { view?.updateUser(user: user) }
    private func navigateToFollowed() { /* 路由逻辑 */ }
}
```

**Pitfall**：VIPER 每模块至少 4 文件，100 个页面即 400+ 文件，新成员上手成本极高。
**Best Practice**：中小型项目优先 MVVM + Coordinator；VIPER 仅用于业务核心模块，避免全量引入。

### TCA（The Composable Architecture）深度解析

TCA 由 Point Free 团队开源，是 iOS 最系统化的声明式架构框架。核心三大原语：**Store**（持有 State 并处理 Action）、**View**（纯函数渲染 `@BindableState`）、**Reducer**（`State & Action -> Effect` 的纯函数）。所有状态变更通过 Action 单向流动，依赖 `@ObservableMacro`（Swift 5.9+）或 `@Bindings` 实现响应式绑定。TCA 强制消除隐式副作用，使应用逻辑完全可测试、可回放、可组合。

```swift
@Reducer
struct LoginFeature {
    struct State: Equatable {
        var username = "", password = "", loading = false, error: String?
    }
    enum Action: Equatable {
        case usernameChanged(String), passwordChanged(String)
        case loginTapped, loginCompleted(Result<User, Error>)
    }
    var body: some Reducer<State, Action> {
        Reduce { state, action in
            switch action {
            case .loginTapped:
                state.loading = true
                return .customLogin(state).publisher.eraseToEffect()  // 发起网络请求
            case .loginCompleted(.success(let user)):
                state.loading = false; return .none
            case .loginCompleted(.failure(let err)):
                state.loading = false; state.error = err.localizedDescription
                return .none
            default: return .none
            }
        }
    }
}
```

**Pitfall**: Reducer 中直接修改 state 属于纯函数，不要在其中执行异步操作（用 Effect 包裹）。
**Best Practice**: 每个 Feature 独立定义 State/Action/Reducer，通过 `ChildReducer` 组合子模块，实现关注点分离。


### iOS 中的 Redux 模式（Combine + 状态管理）

Redux 模式的核心理念是 **单向数据流**：State 唯一真实来源，Action 描述变更，Reducer 纯函数计算新 State。在 iOS 中用 Combine 实现时，用一个主 Store 持有一切状态，通过 `.share().removeDuplicates()` 链发布更新，View 订阅 Store 并发送 Action。

```swift
import Combine

final class Store<State: Equatable> {
    private let reducer: (inout State, Action) -> Effect
    private let currentState: CurrentValueSubject<State, Never>
    private var effectCancellables = Set<AnyCancellable>()

    var state: AnyPublisher<State, Never> {
        currentState.eraseToAnyPublisher()
    }

    init(initialState: State, reducer: @escaping (inout State, Action) -> Effect) {
        self.reducer = reducer
        self.currentState = CurrentValueSubject<State, Never>(initialState)
        // Action 进入 → Reducer 更新 State → Effect 完成后派发新 Action
        $state.flatMap { s -> Effect.Publisher in /* ... */ }
            .receive(on: RunLoop.main).sink { [weak self] in self?.currentState.send($0) }
            .store(in: &effectCancellables)
    }

    func send(_ action: Action) { /* ... */ }
}

### 状态恢复架构（NSSecureCoding、NSUserActivity）

iOS 状态恢复让 App 在关闭或崩溃后重新打开时，恢复到用户上次使用的位置。核心机制是 **NSSecureCoding**（归档模型数据）与 **NSUserActivity**（声明当前用户意图，支持 Handoff 跨设备同步）。在 `AppDelegate` 中实现 `encodeRestorableState(with:)` 保存导航栈，在 ViewController 中重写 `updateUserActivityState(_:)` 绑定 UserActivity 数据。

```swift
// 1. Model 安全编码
struct UserProfile: Codable, NSSecureCoding {
    static var supportsSecureCoding: Bool { true }
    let name: String, age: Int
    func encode(with coder: NSCoder) {
        coder.encode(name, forKey: "name")
        coder.encode(age, forKey: "age")
    }
    init?(coder: NSCoder) {
        guard let name = coder.decodeObject(forKey: "name") as? String,
              let age = coder.decodeObject(forKey: "age") as? Int else { return nil }
        self.name = name; self.age = age
    }
}

// 2. ViewController 状态恢复
override func encodeRestorableState(with coder: NSCoder) {
    super.encodeRestorableState(with: coder)
    coder.encode(currentTab, forKey: "tab")
}

// 3. UserActivity 声明（支持 Handoff & Quick Resume）
override func updateUserActivityState(activity: NSUserActivity) {
    activity.activityType = "com.app.view-profile"
    activity.userInfo = ["userId": userProfile.id]
    activity.becomeCurrent()
}
```

**Pitfall**: `encodeRestorableState` 只在用户明确退出 App 时调用（划掉多任务卡片），崩溃场景不会触发 —— 需配合 NSUserActivity 的 `weakDelegate` 实现持续同步。
**Best Practice**: 优先使用 NSUserActivity 的 `makes content available for search` 和 Quick Resume 能力，而非手动编码状态，系统自动处理跨设备同步与 Deep Link 唤醒。


### 依赖注入模式（协议注入、属性注入、构造器注入）

依赖注入（DI）是解耦组件间依赖的核心技术。在 Swift 中，核心思想是**通过协议定义依赖，而非直接实例化具体类**，从而使代码可测试、可替换、可组合。Swift 的协议天然支持 DI 的三种注入方式：

```swift
// 1. 协议定义
protocol LocationProvider {
    var location: CLLocationCoordinate2D? { get }
}
protocol APIClient {
    func fetch<T: Decodable>(_ type: T.Path: String) async throws -> T
}

// 2. 构造器注入（最常用，推荐）
class WeatherService {
    private let api: APIClient
    private let location: LocationProvider
    init(api: APIClient, location: LocationProvider) {
        self.api = api; self.location = location
    }
}

// 3. 属性注入（适用于可选依赖或 SwiftUI @StateObject）
class AnalyticsTracker {
    var networkLogger: (String) -> Void = { _ in }  // 默认无操作
}

// 4. 协议扩展提供默认实现
extension APIClient {
    func fetch<T: Decodable>(_ type: T.Type, path: String) async throws -> T {
        fatalError("Use concrete implementation in production")
    }
}
```

**Pitfall**: 构造器注入导致深层依赖链难以管理时，避免引入完整的 DI 容器框架（如 Swinject），优先用工厂方法或 Builder 模式手动组装。
**Best Practice**: 为每个模块定义 `Production` 和 `Mock` 协议实现，在测试中注入 Mock，生产环境注入真实实现 —— 这是最轻量且最可维护的 DI 策略。


### 数据抽象的 Repository 模式

Repository 模式将数据访问逻辑封装在统一接口后，使业务层无感知地切换数据源（本地 Core Data / 远程 API / Mock）。核心思想是**用协议隔离「数据从哪里来」，业务代码只依赖协议而非具体实现**。

```swift
// 1. 统一数据源协议
protocol Repository {
    func fetchUser(id: String) async throws -> User
    func saveUser(_ user: User) async throws
}

// 2. 远程实现
struct APIClientRepository: Repository {
    let client: APIClient
    func fetchUser(id: String) async throws -> User {
        try await client.fetch(User.self, path: "/users/\(id)")
    }
    func saveUser(_ user: User) async throws {
        try await client.post(user, path: "/users")
    }
}

// 3. 缓存层实现（链式组合）
class CachingRepository: Repository {
    private let cache: NSCache<String, User> = NSCache()
    private let backend: Repository  // 组合而非继承
    func fetchUser(id: String) async throws -> User {
        if let cached = cache.object(forKey: id) { return cached }
        let user = try await backend.fetchUser(id: id)
        cache.setObject(user, forKey: id)
        return user
    }
    func saveUser(_ user: User) async throws {
        try await backend.saveUser(user)
    }
}
```

**Pitfall**: 缓存与后端数据不一致时，需在写操作后主动使缓存失效，或使用 TTL 策略，避免「脏读」。
**Best Practice**: 用组合方式链式叠加 Repository 层（Cache → API → Mock），每层只关注单一职责，测试时注入 MockRepository 零网络依赖。


### 基于功能的模块化架构

功能模块化是 iOS 大型项目架构演进的核心方向。不同于按层级（Model/View/Controller）划分模块，**按功能域切分**（如 User、Payment、Feed 独立模块），每个模块自包含业务逻辑、UI 和数据层，实现真正的内聚与解耦。模块间通过 Swift Package Manager 或静态库分发，接口通过协议定义，避免循环依赖。

```swift
// 1. 模块接口层（独立 Target：PaymentKitInterface）
public protocol PaymentService {
    func pay(amount: Decimal, method: PaymentMethod) async throws -> Transaction
    var onPaymentStateChange: ((PaymentState) -> Void)? { get set }
}

// 2. 模块实现层（Target：PaymentKit）
internal class PayPalPaymentService: PaymentService {
    var onPaymentStateChange: ((PaymentState) -> Void)?
    func pay(amount: Decimal, method: PaymentMethod) async throws -> Transaction {
        // 内部实现完全封闭，外部不可见
        return try await payViaPayPal(amount: amount)
    }
}

// 3. 宿主 App 组装（仅依赖 Interface Target）
let payment: PaymentService = PayPalPaymentService()  // 通过 DI 注入
```

**Pitfalls:** 模块划分过细则导致跨模块通信成本激增（"协议爆炸"）；划分过粗则回到"上帝模块"。避免在模块接口中暴露 UIKit 类型，用纯数据模型跨边界传递。

**Best Practice:** 用 SPM 管理模块依赖图，CI 中用脚本检测循环引用；每个模块提供 `README.md` 说明职责边界；模块间通信优先用事件总线或 Completion Handler，避免直接注入具体实现。

### ReactiveCocoa / RxSwift 与 Combine 框架对比

三大响应式框架各有侧重：**ReactiveCocoa (RAC)** 基于 Objective-C 的 signal 机制，适合混编项目渐进迁移；**RxSwift** 是 ReactiveX 的 Swift 实现，社区最大、操作符最全（40+），跨平台复用率高；**Combine** 是 Apple 官方框架（iOS 13+），原生集成 SwiftUI 和 @Observable，零依赖且性能最优。

```swift
// Combine 示例：表单验证管道
@Published var email = ""
@Published var password = ""

var isValid: Bool { !email.isEmpty && password.count >= 8 }

// 操作符链式处理
emailPublisher
    .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
    .removeDuplicates()
    .map { $0.contains("@") }
    .assign(to: \$@emailIsValid)  // 自动关联
```

**Pitfall**: RxSwift 的 DisposeBag 在 SwiftUI 中无法自动管理，需改用 cancel() 或 @StateObject 封装 Subscriber；Combine 的 AnyPublisher 过度使用会丢失类型信息。

**Best Practice**: 新项目优先 Combine + SwiftUI（零依赖生态完整），维护老项目选 RxSwift（操作符丰富），OC 混编临时桥选用 RAC；跨框架迁移时以 Protocol 抽象数据流接口隔离实现。


#### 跨框架迁移与性能对比实战

实际项目中经常需要在框架间迁移。以下迁移策略可最大限度降低风险：

```swift
// 1. 协议抽象层 —— 隔离具体响应式框架
protocol DataSourceProvider {
    associatedtype Event: AnyObject
    func events() -> AnyPublisher<UserEvent, Never>  // Combine
    // func events() -> Observable<UserEvent>         // RxSwift
}

// 2. RxSwift → Combine 桥接（关键转换）
extension ObservableType {
    func asCombinePublisher() -> AnyPublisher<Element, Swift.Never> {
        self.asPublisher().eraseToAnyPublisher()
    }
}

// 3. Combine → RxSwift 桥接（反向兼容）
import RxCombine  // 社区库，双向互转
let rxObservable = publisher.asObservable()

// 4. 性能基准（单线程 100k 事件）
//   Combine:  ~120ms（原生优化，零桥接）
//   RxSwift:  ~280ms（操作符丰富但分配开销大）
//   RAC:      ~650ms（ObjC 运行时开销显著）
```

**Pitfall**: 迁移时最容易遗漏的是**生命周期管理差异** —— RxSwift 的 DisposeBag 是强持有（需手动 dealloc），Combine 的 Cancellable 需显式 cancel()，而 @Published + SwiftUI 自动管理。忘记转换生命周期导致内存泄漏是迁移后 #1 崩溃源。

**Best Practice**: 迁移分三阶段：① 用 Protocol 抽象数据流接口 ② 在新模块用目标框架，老模块保持原框架 ③ 逐模块替换，CI 中加内存检测用例；**不要大爆炸式重写**。
#### 线程调度模型对比与选型速查

三大框架的线程调度机制是实际开发中最容易踩坑的部分：

```swift
// Combine —— receive(on:) 切换下游线程，自动管理
networkPublisher
    .receive(on: DispatchQueue.global())   // 后台处理
    .map { transform($0) }
    .receive(on: DispatchQueue.main)        // 主线程更新UI

// RxSwift —— subscribeOn/observeOn 分离关注点
apiService.fetch()
    .subscribeOn(ConcurrentDispatchQueueScheduler(qos: .userInitiated))
    .observeOn(MainScheduler.instance)
    .subscribe(onNext: { updateUI($0) })

// ReactiveCocoa —— deliverOn 链式传递
apiSignal
    .deliverOn(UIThreadScheduler.shared())
    .observeNext { updateUI($0) }
```

**Pitfall**: RxSwift 的 `subscribeOn` 只作用于紧接的上游操作符，`observeOn` 影响下游所有操作符，混用时容易在错误线程执行耗时操作导致卡顿。Combine 的 `receive(on:)` 行为类似 `observeOn`，但缺少 `subscribeOn` 等价物，需注意底层 Publisher 的调度器行为。

**Best Practice**: 写选型决策表钉在 README：iOS 13+ 新项目 → Combine（零依赖+SwiftUI 原生集成）；跨平台/Android 复用 → RxSwift（操作符生态最全）；OC 存量桥接 → RAC。线程调度统一封装为 extension，避免散落各处的硬编码。


### Coordinator 模式实现

Coordinator 模式由 Erica Sadun 提出，核心思想是将导航逻辑从 ViewController 中抽离到独立的 Coordinator 对象。每个 Coordinator 负责一段导航流程的编排，视图控制器只关注 UI 和业务逻辑，实现真正的职责分离。

```swift
protocol CoordinatorProtocol {
    var childCoordinators: [CoordinatorProtocol] { get set }
    func start()
}

class AppCoordinator: CoordinatorProtocol {
    var childCoordinators: [CoordinatorProtocol] = []
    private let window: UIWindow
    
    init(window: UIWindow) {
        self.window = window
        let authCoord = AuthCoordinator()
        authCoord.onLoginSuccess = { [weak self] in
            self?.startHomeFlow()
        }
        childCoordinators.append(authCoord)
        authCoord.start()
    }
    
    func start() { /* set root VC */ }
    func startHomeFlow() {
        removeChild(authCoord)
        let homeCoord = HomeCoordinator()
        childCoordinators.append(homeCoord)
        homeCoord.start()
    }
}
```

**Pitfall**: Coordinator 之间形成循环引用是最常见的内存泄漏源，闭包捕获和回调代理都必须用 `[weak self]`。

**Best Practice**: 按功能域拆分 Coordinator（AuthCoordinator / HomeCoordinator / SettingsCoordinator），用闭包回调替代 Delegate 简化通信，根 Coordinator 持有所有子 Coordinator 的强引用表。


### 事件总线 / 中介者模式

事件总线（Event Bus）是解耦模块间通信的经典方案，在 iOS 中常以 NotificationCenter、Combine 的 PassthroughSubject 或自定义中介者实现。核心思想：发送方发布事件，订阅方监听，双方无需直接引用。中介者模式（Mediator）更进一步——用一个集中对象管理所有 ViewController 间的导航与通信，消除控制器间的耦合。

```swift
// 方案1：NotificationCenter（系统内置，最轻量）
NotificationCenter.default.post(name: .userLoggedIn, object: user)
NotificationCenter.default.addObserver(forName: .userLoggedIn, object: nil, queue: .main) { _ in }

// 方案2：Combine PassthroughSubject（类型安全）
class EventBus: ObservableObject {
    private let subject = PassthroughSubject<AppEvent, Never>()
    var events: AnyPublisher<AppEvent, Never> {
        subject.eraseToAnyPublisher()
    }
    func post(_ event: AppEvent) { subject.send(event) }
}

// 方案3：自定义 Mediator（导航编排）
class Mediator {
    func showDetails(from sender: UIViewController, item: Item) {
        let vc = DetailsVC(item: item)
        sender.navigationController?.pushViewController(vc, animated: true)
    }
}
```

**Pitfall**: NotificationCenter 的事件名用硬编码字符串，拼写错误导致静默失败；PassthroughSubject 在最后一个订阅者离开发出新事件时无消费者，消息丢失。

**Best Practice**: 事件名统一用 `extension Notification.Name { static let xxx = ... }` 集中管理；Combine EventBus 实例通过 DI 注入共享，避免多实例造成事件不同步；Mediator 按功能域拆分（AuthMediator, HomeMediator），不要在单一 Mediator 中堆砌所有导航逻辑。
### iOS 项目架构决策记录（ADR）

ADR（Architecture Decision Record）是团队记录架构决策及其上下文的轻量文档格式，解决"为什么用 Clean Architecture 而不是 MVVM？"这类长期困惑新成员的问题。每条 ADR 包含：上下文（面临的问题）、决策（选择的方案）、后果（权衡利弊）。在 iOS 团队中，ADR 有效减少了架构重复讨论，加速了新人上手。

```swift
// ADR 模板（Markdown 格式存入 docs/adr/ 目录）
// ADR-001: 采用 Coordinator 模式管理导航
## Context
- 项目有 40+ ViewController，导航逻辑分散在各 VC 中
- 登录/未登录流程导致循环 import
## Decision
采用 Coordinator 模式集中管理导航流程
## Consequences
+ 导航逻辑集中，新增流程不修改现有 VC
- 学习曲线较高，需团队统一理解 Coordinator 协议设计
```

推荐工具：GitHub 仓库内 `docs/adr/` 目录 + decide.md 模板，CI 检查 ADR 编号连续。

**Pitfall**: ADR 写成后不再更新，半年后技术选型已改变但文档仍写旧方案，误导新人。

**Best Practice**: 每次重大架构变更（换网络层、改数据流）必须写 ADR；季度回顾时标记 superseded（已被取代）的 ADR，保持文档库精简；用编号（ADR-001, ADR-002...）在 PR 描述中引用决策记录。
