import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { resolve } from "path"

export default defineConfig({
  base: "/myknowledge/",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@content": resolve(__dirname, "../content"),
    },
  },
  server: {
    allowedHosts: [".trycloudflare.com"],
    fs: {
      allow: [
        resolve(__dirname, ".."),
      ],
    },
  },
})
