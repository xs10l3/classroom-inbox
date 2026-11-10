# 课代表 · 班级作业收集

Bun + Nuxt 4 + Vue 3，华为云 OBS 存文件，Bun SQLite 存名单、作业与提交记录。初始名单为空，由管理员上传，代码中没有固定学生信息。

## 功能

- 管理密码登录，HttpOnly 会话，登录限流与跨站请求校验。
- 管理员上传 XLSX、CSV、JSON，或粘贴 JSON；先预览、校验重复学号，再确认保存。
- 发布作业：课程、说明、北京时间截止时间、文件格式、单文件大小限制。
- 每份作业冻结发布时的名单，之后修改班级名单不会改变历史统计。
- 分享随机收集链接；学生填写名单内的姓名和学号，无需注册。
- 多文件上传与进度提示，截止校验、自动命名、成功回执。
- 重新提交替换当前有效记录；历史文件与记录保留，上传失败不覆盖原有记录。
- 按姓名、学号、提交状态筛选；复制班群催交通知，导出含缺交名单的 CSV。
- 管理员下载单文件或 ZIP；ZIP 按学号、姓名分目录并附提交情况表。
- 存储配置状态和连接测试；桌面、手机均可使用。
- 首页 `/` 为学生待办页：无需管理员登录，按截止时间展示全部开放的表格、上传入口；支持搜索、分类和分享。
- 所有新事务与作业保留原始通知全文，学生可以展开查看，和整理后的说明分开保存。
- 班级事务概览表：内置在线表单、外部表格链接、文件收集入口，统一查看截止时间和完成进度。
- 事务 JSON 批量导入：上传或粘贴、先校验预览、整批保存，页面内可复制通知整理提示词。
- 自定义表单字段（文本、长文本、数字、单选、日期），名单身份核对、截止校验、重复填写更新、缺填名单与结果 CSV 导出。

## 本地启动

没有域名时可使用 `compose.http.yaml`，通过公网 IP 访问。服务器 `.env` 设置 `COMPOSE_FILE=compose.http.yaml`、`APP_URL=http://服务器公网IP`、`COOKIE_SECURE=false`、`TRUST_PROXY=true`，然后运行 `docker compose up -d --build`。默认监听 80 端口，OBS 配置不变；详细步骤见 [无域名部署](DEPLOYMENT.md#没有域名使用公网-ip--http)。HTTP 连接不加密，适合先完成部署验证。

建议使用 Bun 1.4.4 或更新版本。Bun 1.3.8 已完成构建验证，但运行当前 Nuxt CLI 时会提示其兼容的 Node 版本偏旧。

```sh
bun install --frozen-lockfile
bun scripts/init-env.ts
# 在编辑器中打开 .env，填写 OBS 参数；ADMIN_PASSWORD 是登录密码
bun run dev
```

访问 `http://localhost:3000` 即可查看班级待办首页；管理员点击页底入口，或访问 `/admin` 登录管理。本项目已生成的 `.env` 含随机管理密码，保存在你的本地目录中，不提交 Git。未配置 OBS 时仍可管理名单、发布作业；学生上传会明确提示存储未配置。

建议使用顺序：登录 → 班级名单 → 导入并确认 → 作业总览 → 发布作业 → 分享收集链接 → 查看进度 / 下载。

### 名单格式

Excel / CSV 首行为表头：

```csv
学号,姓名,性别
2026000000001,示例同学甲,女
2026000000002,示例同学乙,男
```

JSON：

```json
[
  { "name": "示例同学甲", "student_id": "2026000000001", "gender": "F" },
  { "name": "示例同学乙", "student_id": "2026000000002", "gender": "M" }
]
```

姓名、学号必填；性别可省略。支持 `studentId` / `student_id` / `学号`。学号始终作为字符串保存，Excel 学号列应设置为文本以保留前导零。单次最多 1000 人、5 MB。管理页面可下载 CSV 模板。

## 班级事务与 JSON 导入

登录后打开 **班级事务**：可手动新增，也可点击 **JSON 导入** 上传 `.json` 或粘贴数组。点击 **复制提示词**，把老师通知交给 AI 整理，再将 JSON 粘贴回来，**校验并预览 → 确认导入**。每项必须提供 `original_notice` 原文（最多 20000 字），系统原样保存空格和换行，并传递到自动创建的文件收集任务。单次最多 50 条、512 KB；整批验证通过后统一保存，每次确认都会新增，避免重复导入。

- `form`：内置表单，1–20 个自定义字段；分享填写链接，同学填写姓名、学号和表格。按人数去重统计，可查看结果与缺填名单、导出 CSV、修改截止时间。发布时保存名单快照。
- `link`：已有 HTTPS 表格链接。点击跳转原表，管理员手动标记事务完成，系统不读取外部平台的填写数据。
- `files`：自动创建文件收集任务，或用 `task_id` 关联已有作业。共享原作业的截止时间、名单、统计和 OBS 上传流程。

可复制的完整提示词：[事务导入提示词](docs/事务导入提示词.md)。JSON 模板：[事务导入示例](docs/事务导入示例.json)。示例中的日期、要求均需按实际通知修改；不明确的信息应先确认。名单通过独立的管理页面导入。

### 学生查看所有待办

把 `https://你的域名/` 发到班群即可。管理端侧栏也有“学生待办页”入口；页面内的“分享待办页”按钮可复制地址。它会展示已发布的原始通知与办理入口，包括单独发布的作业，关联同一作业的文件收集会去重。截止或停止的事务、手动标记完成的外部事务自动移出，每分钟刷新一次。

首页无需登录；旧地址 `/classroom` 会自动跳转首页。管理员作业总览位于 `/admin`。班级名单、个人填写答案和上传文件索引仅管理员可见。页面显示班级全部开放任务，不记录个人完成勾选；同学通过提交回执确认自己是否完成。

## 环境变量

参见 `.env.example`。所有密钥只由服务端读取，未放入 Nuxt 的 public runtime config；`.env`、`.data` 都已被 Git 和 Docker 构建上下文排除。

| 变量 | 用途 |
| --- | --- |
| `ADMIN_PASSWORD` | 管理密码，至少 10 位；更换后现有会话失效 |
| `SESSION_SECRET` | 会话签名密钥，至少 32 位 |
| `OBS_ENDPOINT` | 桶所在区域的服务端点，不含桶名，生产必须 HTTPS |
| `OBS_REGION` | 与桶一致的区域，例如 `cn-east-3` |
| `OBS_BUCKET` | 私有桶名 |
| `OBS_ACCESS_KEY_ID` / `OBS_SECRET_ACCESS_KEY` | IAM 访问密钥 AK / SK |
| `OBS_SECURITY_TOKEN` | 可选临时凭证；生产长期运行请确保到期后及时轮换 |
| `OBS_PREFIX` | 本应用对象前缀，默认 `classroom` |
| `CLASS_NAME` | 页面班级名称 |
| `DATA_DIR` | SQLite 持久化目录，默认 `.data` |
| `UPLOAD_MAX_MB` | 单文件全局上限，默认 50，最高 100 MB |
| `COOKIE_SECURE` | HTTPS 部署为 `true`，本地 HTTP 为 `false` |
| `APP_URL` | 对外完整地址，例如 `https://homework.example.com`，分享链接和 Origin 校验使用 |
| `TRUST_PROXY` | 仅在应用前置可信反向代理时为 `true` |
| `DOMAIN` / `ACME_EMAIL` | Docker Compose 中 Caddy 域名和证书邮箱 |

## OBS 设计

参考你指定的 [xs10l3/lrc](https://github.com/xs10l3/lrc/blob/main/server/utils/obs.ts)：使用 `@aws-sdk/client-s3` 的兼容接口，配置 `requestChecksumCalculation: 'WHEN_REQUIRED'` 和 `responseChecksumValidation: 'WHEN_REQUIRED'`，集中封装上传、下载、删除。

本应用使用私有桶，浏览器访问应用服务端，服务端访问 OBS。无需配置浏览器直传 CORS，也无需公开对象 URL。所有文件下载都先校验管理会话。文件路径：

```text
classroom/assignments/{作业ID}/{学号}/{提交文件UUID}/{学号_姓名_作业名_原文件名}
```

名单、事务、表单答案、作业、收集令牌、文件索引保存在 `.data/classroom.sqlite`。**只备份 OBS 文件不能恢复完整应用，必须同时备份 SQLite。** 上传请求最多 5 个文件、100 MB，文件经服务端转存，峰值内存会随并发上传增加。

## 构建和验证

```sh
bun run typecheck
bun test
bun run build
bun run test:integration
bun run start
```

`test:integration` 使用独立临时数据库、本地 S3 模拟服务和真实 AWS SDK，覆盖事务 JSON 导入、表单填写与导出、原始通知保留、公开待办筛选与去重、文件流程关联、旧数据库迁移与在线备份、名单导入与快照、上传、失败重试保护、重新提交、单文件 / ZIP 下载、导出、截止和权限校验。它不访问真实 OBS，运行环境需允许监听本机端口。安装 Playwright 浏览器后，可用 `BROWSER_TEST=1 bun run test:integration` 加测管理端和手机端实际交互；截图保存在 `test-results/screenshots`。

## 云端部署

完整步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)，仓库已提供 Dockerfile、Compose、Caddy HTTPS 配置和 SQLite 备份脚本。推荐单台云服务器 + 持久化卷；暂不支持多个应用副本共用 SQLite。

本版本用“随机作业链接 + 名单内姓名 / 学号”识别提交者，适合可信班群内收集，不提供学校统一身份认证。不要把收集链接公开发布；需要严格防代交时，应接入学校 SSO 或每人独立凭证。

历史提交保留但暂未提供清理界面；存储用量含历史文件。学校资料的保留周期由管理员确定，可在归档后进行有计划的清理。
