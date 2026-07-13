import { ref } from 'vue'

/**
 * 轻量全局抽屉状态（移动端侧边栏）。
 * 顶栏的汉堡按钮 toggle，AppLayout 的遮罩/抽屉消费此状态。
 * 模块视图在挂载时声明是否拥有侧边栏，顶栏据此决定是否显示汉堡按钮。
 */

// 移动端抽屉是否打开
const drawerOpen = ref(false)

// 当前页面是否拥有侧边栏（带目录树的模块页为 true，Home 为 false）
const hasSidebar = ref(false)

export function useSidebar() {
  function openDrawer() {
    drawerOpen.value = true
  }
  function closeDrawer() {
    drawerOpen.value = false
  }
  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value
  }
  function setHasSidebar(value: boolean) {
    hasSidebar.value = value
    // 切换到无侧栏页面时确保抽屉关闭
    if (!value) drawerOpen.value = false
  }

  return {
    drawerOpen,
    hasSidebar,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    setHasSidebar,
  }
}
