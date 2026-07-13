import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { initTheme } from './composables/useTheme'

// Apply the persisted/system theme before first paint to avoid a flash.
initTheme()

const app = createApp(App)
app.use(router)
app.mount('#app')
