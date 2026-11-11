import { fileURLToPath } from 'node:url'
import pdfjsPackage from 'pdfjs-dist/package.json'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: '课代表 · 让每一份作业都有着落',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        {
          name: 'description',
          content: '班级作业，一处收齐。发布作业、在线提交、缺交统计与文件归档。',
        },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  nitro: {
    preset: 'bun',
    publicAssets: ['cmaps', 'standard_fonts', 'wasm'].map((folder) => ({
      dir: fileURLToPath(new URL(`./node_modules/pdfjs-dist/${folder}`, import.meta.url)),
      baseURL: `/pdfjs/${pdfjsPackage.version}/${folder}`,
      maxAge: 31536000,
    })),
    externals: { external: ['bun:sqlite'] },
    rollupConfig: { external: ['bun:sqlite'] },
  },
  routeRules: { '/classroom': { redirect: { to: '/', statusCode: 301 } } },
  typescript: { strict: true },
})
