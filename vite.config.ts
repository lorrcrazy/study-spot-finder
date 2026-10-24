import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { ProxyOptions } from 'vite'

const libcalProxy = (prefix: string, target: string): Record<string, ProxyOptions> => ({
  [prefix]: {
    target,
    changeOrigin: true,
    rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ''),
    headers: { Referer: `${target}/spaces`, 'X-Requested-With': 'XMLHttpRequest' },
  },
})

const proxy = {
  ...libcalProxy('/libcal/gt', 'https://libcal.library.gatech.edu'),
  ...libcalProxy('/libcal/arizona', 'https://libcal.library.arizona.edu'),
}

export default defineConfig({
  plugins: [react()],
  server: { host: true, allowedHosts: true, proxy },
  preview: { host: true, allowedHosts: true, proxy },
})
