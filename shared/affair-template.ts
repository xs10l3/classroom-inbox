export const affairExample = [
  {
    title: '班级活动报名',
    original_notice:
      '请全班同学在 2030 年 12 月 1 日 20:00 前填写是否参加班级活动。不能参加的同学也请填写。',
    category: '班级活动',
    description: '请选择是否参加本次班级活动。',
    mode: 'form',
    due_at: '2030-12-01T20:00:00+08:00',
    fields: [
      {
        key: 'participation',
        label: '是否参加',
        type: 'select',
        required: true,
        options: ['参加', '不参加'],
      },
      { key: 'remark', label: '备注', type: 'textarea', required: false },
    ],
  },
  {
    title: '课程作业收集',
    original_notice:
      '请于 2030 年 12 月 2 日 23:59 前提交课程作业，PDF 或 Word 格式，单文件不超过 20 MB。',
    category: '课程作业',
    description: '提交 PDF 或 Word 文件。',
    mode: 'files',
    due_at: '2030-12-02T23:59:00+08:00',
    collection: { extensions: ['pdf', 'docx'], max_size_mb: 20 },
  },
]

export function affairPrompt(today: string, maxSize = 20) {
  return `请把下方通知整理成“课代表”班级事务系统可导入的 JSON 数组。
今天是 ${today}，所有时间按北京时间（Asia/Shanghai）处理。

规则：
1. 每个独立事务一条记录，最多 50 条。只提取通知中明确的信息，不编造截止时间、链接或要求。如缺少截止时间或有歧义，请先向我提问，确认后再生成 JSON。
2. 确认信息完整后，只输出合法 JSON 数组，不要 Markdown 代码围栏、注释或解释。
3. 每条包含 title（名称，最多 80 字）、category（分类，最多 30 字）、description（说明，最多 3000 字）、mode、due_at 和 original_notice（原始通知全文，最多 20000 字，必填）。
4. due_at 必须是未来的 ISO 8601 时间，带 +08:00 时区，例如 2030-12-01T20:00:00+08:00。相对日期根据今天换算；“周五”“今晚”等有歧义时先确认。
5. mode 只能为 form、link 或 files：
   - form：在本系统填写表格，必须有 fields 数组（1–20 个字段）。每个字段含 key（以英文字母开头的唯一英文字母/数字/下划线，最多 40 字符）、label、type 和 required（布尔值）。type 只能为 text、textarea、number、select、date。select 额外提供 options 字符串数组，至少 2 个不重复选项。姓名、学号由系统收集，不要重复建字段。
   - link：填写外部表格，必须有 url，且是通知中原有的 HTTPS 链接。不要生成或猜测链接；链接不完整时先询问。不提供 fields 或 collection。
   - files：收集文件，提供 collection，含 extensions（小写扩展名数组，不带点）与 max_size_mb（1–${maxSize} 的整数）。若通知没写文件类型或大小，先询问。系统会自动创建关联收集任务，不要编造 task_id。
6. original_notice 必须逐字保留我提供的原始通知，不得改写、概括或删减；保留原来的段落、时间、地点与要求。多条事务来自同一通知时，每条都保存该通知的完整原文，以 JSON 的换行转义表示段落。description 可另行整理摘要。
7. 除原通知外，不要额外加入名单、个人信息或密钥。不要使用 schema 之外的字段。不同 mode 只输出其适用字段。

格式示例（示例日期、标题和内容仅用于说明格式，请按实际通知替换）：
${JSON.stringify(affairExample, null, 2)}

待整理的通知：
【在这里粘贴老师通知、群公告或班级待办】`
}
