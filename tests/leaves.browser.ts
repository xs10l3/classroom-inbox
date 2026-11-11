import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { addDays, shanghaiDate, weekdayOf } from '../shared/evening'
import { previewPdf, previewPng } from './preview-fixtures'

export async function runLeaveBrowserChecks(base: string) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  })
  const screenshots = resolve('test-results/screenshots')
  await mkdir(screenshots, { recursive: true })
  const errors: string[] = []
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  })
  const admin = await adminContext.newPage(),
    student = await mobile.newPage()
  for (const p of [admin, student]) p.on('pageerror', (e) => errors.push(e.message))
  let monday = addDays(shanghaiDate(), 7)
  while (weekdayOf(monday) !== 1) monday = addDays(monday, 1)
  const day = addDays(monday, 15)
  try {
    await admin.goto(base + '/login')
    await admin.getByLabel('管理密码').fill('integration-password-123')
    await admin.getByRole('button', { name: '进入工作台' }).click()
    await expect(admin).toHaveURL(base + '/admin')
    await admin.getByRole('link', { name: '晚自习设置', exact: true }).click()
    await expect(admin.getByLabel('安排结束日期')).toHaveValue(addDays(monday, 21))
    await admin.getByRole('button', { name: '保存班级安排', exact: true }).click()
    await expect(admin.getByText('晚自习安排已保存', { exact: true })).toBeVisible()
    await admin.screenshot({ path: screenshots + '/evening-settings-desktop.png', fullPage: true })

    await student.goto(base + '/')
    await student.getByRole('link', { name: /请假与个人安排/ }).click()
    await student.getByLabel('你的姓名').fill('测试甲')
    await student.getByLabel('你的学号').fill('001')
    await student.getByRole('button', { name: '查看我的请假', exact: true }).click()
    await expect(student.getByRole('heading', { name: '我的请假记录', exact: true })).toBeVisible()
    await student.getByRole('button', { name: '新增请假', exact: true }).click()
    await student.getByLabel('请假类型').selectOption('evening')
    await student.getByLabel('请假日期').fill(day)
    await student.getByLabel('请假原因').fill('手机端晚自习请假测试')
    await student.getByLabel('暂时没有假条，以后补交').check()
    await student.getByRole('button', { name: '提交请假并生效', exact: true }).click()
    const record = student.getByRole('article').filter({ hasText: '手机端晚自习请假测试' })
    await expect(record.getByText('已生效', { exact: true })).toBeVisible()
    await record.getByRole('button', { name: '补交假条', exact: true }).click()
    await student.getByLabel('选择假条文件').setInputFiles({
      name: '手机假条.pdf',
      mimeType: 'application/pdf',
      buffer: previewPdf(),
    })
    await expect(student.getByRole('dialog')).not.toBeVisible()
    await expect(record.getByRole('link', { name: '下载：手机假条.pdf' })).toBeVisible()
    await record.getByRole('button', { name: '预览：手机假条.pdf' }).click()
    const preview = student.getByRole('dialog')
    await expect(preview.locator('canvas[data-rendered-page="1"]')).toBeVisible()
    await preview.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(preview.locator('canvas[data-rendered-page="2"]')).toBeVisible()
    await preview.getByRole('button', { name: '放大', exact: true }).click()
    await expect(preview.getByText('125%', { exact: true })).toBeVisible()
    expect(await student.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    )
    await student.screenshot({
      path: screenshots + '/proof-pdf-preview-mobile.png',
      fullPage: false,
    })
    await preview.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await expect(preview).not.toBeVisible()
    await record.getByRole('button', { name: '更新假条', exact: true }).click()
    await student.getByLabel('选择假条文件').setInputFiles({
      name: '手机假条.png',
      mimeType: 'image/png',
      buffer: previewPng(),
    })
    await expect(student.getByRole('dialog')).not.toBeVisible()
    await record.getByRole('button', { name: '预览：手机假条.png' }).click()
    const image = preview.getByRole('img', { name: '手机假条.png', exact: true })
    await expect(image).toBeVisible()
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    await preview.getByRole('button', { name: '放大', exact: true }).click()
    await expect(preview.getByText('125%', { exact: true })).toBeVisible()
    await student.screenshot({
      path: screenshots + '/proof-image-preview-mobile.png',
      fullPage: false,
    })
    await preview.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await student.screenshot({ path: screenshots + '/leave-records-mobile.png', fullPage: true })
    expect(await student.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    )
    await student.reload()
    await expect(record.getByText('已生效', { exact: true })).toBeVisible()

    await student.getByRole('button', { name: '个人调整', exact: true }).click()
    await student.getByLabel('调整方式').selectOption('permanent')
    await student.getByLabel('调出星期').selectOption('3')
    await student.getByLabel('调入星期').selectOption('7')
    await student.getByLabel('生效日期').fill(monday)
    await student.getByLabel('调整原因').fill('手机端申请每周日参加晚自习')
    await student.getByRole('button', { name: '提交调整申请', exact: true }).click()
    const adjustment = student
      .getByRole('article')
      .filter({ hasText: '手机端申请每周日参加晚自习' })
    await expect(adjustment.getByText('待审核', { exact: true })).toBeVisible()
    await student.screenshot({ path: screenshots + '/evening-request-mobile.png', fullPage: true })
    await admin.reload()
    const pending = admin.getByRole('article').filter({ hasText: '手机端申请每周日参加晚自习' })
    await pending.getByLabel('审核备注').fill('网页审核同意')
    await pending.getByRole('button', { name: '通过并生效', exact: true }).click()
    await expect(pending).not.toBeVisible()
    await student.getByRole('button', { name: '刷新我的请假', exact: true }).click()
    await expect(adjustment.getByText('已通过', { exact: true })).toBeVisible()
    await expect(adjustment.getByText('管理员备注：网页审核同意')).toBeVisible()

    await admin.getByLabel('调整同学').selectOption('002')
    await admin.getByLabel('调整方式').selectOption('permanent')
    await admin.getByLabel('调出星期').selectOption('1')
    await admin.getByLabel('调入星期').selectOption('7')
    await admin.getByLabel('生效日期').fill(addDays(monday, 14))
    await admin.getByLabel('调整原因').fill('管理员网页直接调整')
    await admin.getByRole('button', { name: '直接设置并生效', exact: true }).click()
    await expect(admin.getByRole('cell', { name: '管理员网页直接调整', exact: true })).toBeVisible()
    await admin.getByRole('link', { name: '请假管理', exact: true }).click()
    await admin.getByLabel('名单日期').fill(day)
    await expect(
      admin.getByRole('cell', { name: '手机端晚自习请假测试', exact: true }),
    ).toBeVisible()
    await admin.getByRole('button', { name: '预览：手机假条.png', exact: true }).click()
    await expect(
      admin.getByRole('dialog').getByRole('img', { name: '手机假条.png', exact: true }),
    ).toBeVisible()
    await admin.getByRole('dialog').getByRole('button', { name: '关闭弹窗', exact: true }).click()
    const downloadPromise = admin.waitForEvent('download')
    await admin.getByRole('link', { name: '导出当日名单', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`晚自习名单-${day}.xlsx`)
    expect(await download.failure()).toBeNull()
    await admin.screenshot({ path: screenshots + '/leaves-desktop.png', fullPage: true })

    await student.getByRole('button', { name: '我的请假', exact: true }).click()
    await record.getByRole('button', { name: '取消请假', exact: true }).click()
    await student
      .getByRole('dialog')
      .getByRole('button', { name: '确认取消请假', exact: true })
      .click()
    await expect(record.getByText('已取消', { exact: true })).toBeVisible()
    await admin.getByRole('button', { name: '刷新每日名单', exact: true }).click()
    await expect(
      admin.locator('.leave-student-grid').getByText('测试甲', { exact: true }),
    ).toBeVisible()
    await student.getByRole('button', { name: '切换同学', exact: true }).click()
    await expect(student.getByRole('button', { name: '查看我的请假', exact: true })).toBeVisible()
    await expect(student.getByText('手机端晚自习请假测试', { exact: true })).not.toBeVisible()
    await admin.setViewportSize({ width: 390, height: 844 })
    await expect(admin.getByRole('button', { name: '打开导航', exact: true })).toBeVisible()
    await admin.screenshot({ path: screenshots + '/leaves-admin-mobile.png', fullPage: true })
    expect(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    )
    expect(errors).toEqual([])
    console.log(
      '✓ Browser leave: settings, mobile identity/leave/proof, mobile PDF pages/zoom and image preview, admin proof preview, reload/cancellation, student adjustment plus admin review/direct setup, XLSX download, privacy reset and responsive pages',
    )
  } finally {
    await browser.close()
  }
}
