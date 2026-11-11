import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { previewPdf } from './preview-fixtures'

export async function runBrowserChecks(base: string) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  })
  const screenshots = resolve('test-results/screenshots')
  await mkdir(screenshots, { recursive: true })
  const errors: string[] = []
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(`${base}/login`)
    await page.getByLabel('管理密码').fill('integration-password-123')
    await page.screenshot({ path: `${screenshots}/login-desktop.png`, fullPage: true })
    await page.getByRole('button', { name: '进入工作台' }).click()
    await expect(page).toHaveURL(`${base}/admin`)
    await expect(page.getByRole('heading', { name: '作业总览.' })).toBeVisible()

    await page.getByRole('link', { name: '班级名单' }).click()
    await page.getByRole('button', { name: '更新班级名单' }).click()
    const modal = page.getByRole('dialog')
    await modal.getByRole('button', { name: '粘贴 JSON' }).click()
    await modal.getByLabel('JSON 数组').fill(
      JSON.stringify([
        { name: '测试甲', student_id: '001', gender: 'F' },
        { name: '测试乙', student_id: '002', gender: 'M' },
      ]),
    )
    await modal.getByRole('button', { name: '解析并预览' }).click()
    await expect(modal.getByText('共 2 人，学号完整且无重复。')).toBeVisible()
    await modal.getByRole('button', { name: '确认保存名单' }).click()
    await expect(modal).not.toBeVisible()
    await expect(page.getByText('测试乙', { exact: true })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/roster-desktop.png`, fullPage: true })

    await page.getByRole('link', { name: '作业总览', exact: true }).click()
    await page.getByRole('button', { name: '发布作业', exact: true }).click()
    const create = page.getByRole('dialog')
    await create.getByLabel('作业名称').fill('网页端流程测试')
    await create.getByLabel('课程名称').fill('程序设计')
    await create.getByLabel('作业说明').fill('请提交 PDF 作业文件，系统会自动整理姓名和学号。')
    await create.getByLabel('原始通知').fill('老师原始通知：请提交本次 PDF 作业。')
    await create.getByRole('button', { name: '发布作业', exact: true }).click()
    await expect(create).not.toBeVisible()
    await expect(page.getByRole('heading', { name: '网页端流程测试' })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/dashboard-desktop.png`, fullPage: true })
    await page.getByRole('link', { name: '网页端流程测试', exact: true }).click()
    await expect(page.getByRole('heading', { name: '网页端流程测试', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '收集链接', exact: true }).click()
    const share = page.getByRole('dialog')
    const link = await share.getByLabel('学生提交链接').inputValue()
    await share.getByRole('button', { name: '关闭弹窗' }).click()
    await page.screenshot({ path: `${screenshots}/task-desktop.png`, fullPage: true })

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    })
    const student = await mobile.newPage()
    student.on('pageerror', (error) => errors.push(error.message))
    await student.goto(link)
    await expect(student.getByRole('heading', { name: '网页端流程测试' })).toBeVisible()
    await student.getByLabel('你的姓名').fill('测试甲')
    await student.getByLabel('你的学号').fill('001')
    await student.getByLabel('选择作业文件').setInputFiles({
      name: '网页提交.pdf',
      mimeType: 'application/pdf',
      buffer: previewPdf(),
    })
    await student.screenshot({ path: `${screenshots}/submit-mobile.png`, fullPage: true })
    await student.getByRole('button', { name: '确认提交作业' }).click()
    await expect(student.getByRole('heading', { name: '作业收到啦，测试甲！' })).toBeVisible()
    await student.screenshot({ path: `${screenshots}/receipt-mobile.png`, fullPage: true })
    const studentOverflow = await student.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(studentOverflow).toBe(false)
    await mobile.close()

    await page.getByRole('button', { name: '刷新提交情况' }).click()
    await expect(page.getByText('网页提交.pdf', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '预览：网页提交.pdf', exact: true }).click()
    const preview = page.getByRole('dialog')
    await expect(preview.getByRole('heading', { name: '文件预览' })).toBeVisible()
    await expect(preview.locator('canvas[data-rendered-page="1"]')).toBeVisible()
    await expect(preview.getByText('第 1 / 2 页')).toBeVisible()
    await preview.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(preview.locator('canvas[data-rendered-page="2"]')).toBeVisible()
    await preview.getByRole('button', { name: '上一页', exact: true }).click()
    await expect(preview.locator('canvas[data-rendered-page="1"]')).toBeVisible()
    const originalWidth = await preview
      .locator('canvas')
      .evaluate((el) => el.getBoundingClientRect().width)
    await preview.getByRole('button', { name: '放大', exact: true }).click()
    await expect(preview.getByText('125%', { exact: true })).toBeVisible()
    await expect
      .poll(() => preview.locator('canvas').evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(originalWidth)
    await page.screenshot({ path: `${screenshots}/homework-preview-desktop.png`, fullPage: true })
    const previewDownload = page.waitForEvent('download')
    await preview.getByRole('link', { name: '下载原文件', exact: true }).click()
    expect(await (await previewDownload).failure()).toBeNull()
    await page.keyboard.press('Escape')
    await expect(preview).not.toBeVisible()
    await page.route(
      '**/api/files/*?preview=1',
      (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{}',
        }),
      { times: 1 },
    )
    await page.getByRole('button', { name: '预览：网页提交.pdf', exact: true }).click()
    await expect(preview.getByRole('alert')).toContainText('登录已过期')
    await preview.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(preview.locator('canvas[data-rendered-page="1"]')).toBeVisible()
    await preview.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await page.getByRole('button', { name: /未提交/ }).click()
    await expect(page.getByText('测试乙', { exact: true })).toBeVisible()
    await expect(page.getByText('测试甲', { exact: true })).not.toBeVisible()
    await page.getByRole('link', { name: '班级事务', exact: true }).click()
    await expect(page.getByRole('heading', { name: '班级事务概览表' })).toBeVisible()
    await page.getByRole('button', { name: 'JSON 导入', exact: true }).click()
    const affairsModal = page.getByRole('dialog')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await affairsModal.getByRole('button', { name: '复制提示词', exact: true }).click()
    await expect(affairsModal.getByRole('button', { name: '已复制提示词' })).toBeVisible()
    const copiedPrompt = await page.evaluate(() => navigator.clipboard.readText())
    expect(copiedPrompt).toContain('due_at')
    expect(copiedPrompt).toContain('待整理的通知')
    await affairsModal.getByRole('button', { name: '查看完整提示词' }).click()
    await expect(affairsModal.getByLabel('事务整理提示词')).toHaveValue(copiedPrompt)
    await affairsModal.getByLabel('事务 JSON', { exact: true }).fill(
      JSON.stringify([
        {
          title: '网页活动报名',
          category: '班级活动',
          description: '请告诉我们你的报名意向。',
          mode: 'form',
          due_at: '2030-12-01T20:00:00+08:00',
          original_notice: '班级原始通知：\n请大家确认活动报名意向，备注写明需要说明的情况。',
          fields: [
            {
              key: 'join',
              label: '是否参加',
              type: 'select',
              required: true,
              options: ['参加', '不参加'],
            },
            { key: 'note', label: '备注', type: 'textarea', required: false },
          ],
        },
        {
          title: '网页材料收集',
          category: '通知材料',
          mode: 'files',
          due_at: '2030-12-02T20:00:00+08:00',
          original_notice: '材料收集原始通知：请按要求上传 PDF。',
          collection: { extensions: ['pdf'], max_size_mb: 2 },
        },
      ]),
    )
    const pastedJson = await affairsModal.getByLabel('事务 JSON', { exact: true }).inputValue()
    await affairsModal.getByLabel('事务 JSON', { exact: true }).fill('')
    await affairsModal.getByLabel('上传事务 JSON', { exact: true }).setInputFiles({
      name: 'affairs.json',
      mimeType: 'application/json',
      buffer: Buffer.from('\uFEFF' + pastedJson),
    })
    await expect(affairsModal.getByLabel('事务 JSON', { exact: true })).toHaveValue(pastedJson)
    await affairsModal.getByRole('button', { name: '校验并预览' }).click()
    await expect(affairsModal.getByText('校验通过，共 2 条')).toBeVisible()
    await page.screenshot({ path: `${screenshots}/affairs-import.png`, fullPage: true })
    await affairsModal.getByRole('button', { name: '确认导入 2 条' }).click()
    await expect(affairsModal).not.toBeVisible()
    const affairRow = page.getByRole('row').filter({ hasText: '网页活动报名' })
    await expect(affairRow).toBeVisible()
    const formUrl = await affairRow.getByRole('link', { name: '填写表格' }).getAttribute('href')
    await page.screenshot({ path: `${screenshots}/affairs-desktop.png`, fullPage: true })
    const formContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    })
    const formPage = await formContext.newPage()
    formPage.on('pageerror', (error) => errors.push(error.message))
    await formPage.goto(base + '/classroom')
    await expect(formPage).toHaveURL(`${base}/`)
    await expect(formPage.getByRole('heading', { name: '班级待办.' })).toBeVisible()
    const publicCard = formPage
      .getByRole('article')
      .filter({ has: formPage.getByRole('heading', { name: '网页活动报名', exact: true }) })
    await expect(publicCard).toBeVisible()
    await publicCard.locator('summary').click()
    await expect(publicCard.locator('pre')).toHaveText(
      '班级原始通知：\n请大家确认活动报名意向，备注写明需要说明的情况。',
    )
    await formPage.screenshot({ path: `${screenshots}/classroom-mobile.png`, fullPage: true })
    expect(await formPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    )
    await formPage.setViewportSize({ width: 1440, height: 1000 })
    await formPage.screenshot({ path: `${screenshots}/classroom-desktop.png`, fullPage: true })
    await formPage.setViewportSize({ width: 390, height: 844 })
    await formPage.getByRole('button', { name: '提交文件', exact: true }).click()
    await expect(
      formPage.getByRole('heading', { name: '网页活动报名', exact: true }),
    ).not.toBeVisible()
    await expect(formPage.getByRole('heading', { name: '网页材料收集', exact: true })).toBeVisible()
    await formPage.getByRole('button', { name: '填写表格', exact: true }).click()
    await formPage.getByRole('link', { name: '填写表格：网页活动报名', exact: true }).click()
    await expect(formPage).toHaveURL(base + formUrl)
    await formPage.locator('summary').click()
    await expect(formPage.locator('pre')).toHaveText(
      '班级原始通知：\n请大家确认活动报名意向，备注写明需要说明的情况。',
    )

    await formPage.getByLabel('你的姓名').fill('测试甲')
    await formPage.getByLabel('你的学号').fill('001')
    await formPage.getByLabel('是否参加').selectOption('参加')
    await formPage.getByLabel('备注').fill('期待和大家一起参加活动。')
    await formPage.screenshot({ path: `${screenshots}/fill-mobile.png`, fullPage: true })
    await formPage.getByRole('button', { name: '确认提交表格' }).click()
    await expect(formPage.getByRole('heading', { name: '填写已保存，测试甲！' })).toBeVisible()
    expect(await formPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    )
    await formContext.close()
    await page.getByRole('button', { name: '刷新事务', exact: true }).click()
    await expect(affairRow.getByText('1', { exact: true })).toBeVisible()
    await affairRow.getByRole('link', { name: '查看结果' }).click()
    await expect(page.getByRole('cell', { name: '期待和大家一起参加活动。' })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/form-results.png`, fullPage: true })
    await page.getByRole('button', { name: '未填写 1' }).click()
    await expect(page.getByRole('cell', { name: '测试乙' })).toBeVisible()
    await expect(page.getByRole('cell', { name: '测试甲' })).not.toBeVisible()
    await page.getByRole('link', { name: '班级事务', exact: true }).click()
    await page.getByRole('button', { name: '新增事务' }).click()
    const addAffair = page.getByRole('dialog')
    await addAffair.getByLabel('事务名称').fill('网页外部问卷')
    await addAffair.getByLabel('原始通知').fill('原始通知：请填写外部问卷。')
    await addAffair.getByLabel('办理方式').selectOption('link')
    await addAffair.getByLabel('外部表格链接').fill('https://example.com/form')
    await addAffair.getByRole('button', { name: '发布事务', exact: true }).click()
    await expect(addAffair).not.toBeVisible()
    const externalRow = page.getByRole('row').filter({ hasText: '网页外部问卷' })
    await externalRow.getByRole('button', { name: '标记完成' }).click()
    await expect(externalRow.getByText('已完成', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(base + '/affairs')
    await page.screenshot({ path: `${screenshots}/affairs-mobile.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.getByRole('button', { name: '打开导航' }).click()
    await expect(page.getByRole('link', { name: '班级名单' })).toBeVisible()
    await page.getByRole('link', { name: '班级名单' }).click()
    await expect(page.getByRole('heading', { name: '班级名单.' })).toBeVisible()
    await page.screenshot({ path: `${screenshots}/roster-mobile.png`, fullPage: true })
    const adminOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(adminOverflow).toBe(false)
    expect(errors).toEqual([])
    console.log(
      '✓ Browser: admin login, JSON roster import, task publish/share, mobile upload/receipt, PDF preview/pages/zoom/download, missing filter, affairs JSON import/prompt clipboard, mobile form/results, external completion, public board filters/original notices, responsive navigation',
    )
    console.log(`Screenshots: ${screenshots}`)
  } finally {
    await browser.close()
  }
}
