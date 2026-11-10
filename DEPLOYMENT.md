# 云端部署步骤

推荐：一台华为云 ECS 或其他 Linux 云服务器，运行 Docker Compose；Caddy 负责 HTTPS；作业文件存入华为云 OBS；名单和提交索引保存在 Docker 持久卷。

## 1. 准备服务器和域名

使用可运行 Docker 的 Linux 服务器。2 核 2 GB 可作为小班级的起点，多人同时上传大文件时建议增加内存。部署一份应用实例即可。

安装 Docker Engine 与 Compose 插件，按服务器发行版采用 [Docker 官方安装步骤](https://docs.docker.com/engine/install/)。安装后检查：

```sh
docker --version
docker compose version
```

将域名（例如 `homework.example.com`）的 A 记录指向服务器公网 IP。若设置 AAAA 记录，也需确保 IPv6 可访问。

安全组开放 TCP 80、443；SSH 22 只开放给管理员来源 IP。应用的 3000 端口不需要开放。443/UDP 用于可选 HTTP/3，不开放也能使用 HTTPS。

若选择中国大陆节点，域名接入前按云厂商流程完成所需备案。具体要求以服务商当前规定为准。

## 2. 创建 OBS 私有桶和 IAM 凭证

1. 在华为云 OBS 创建标准存储桶，记录桶名、区域、对应 Endpoint。
2. 保持桶和对象私有；不要启用匿名读取或公开写入。
3. 为此应用创建专用 IAM 用户及 AK / SK，限定到目标桶。应用需要读取、上传、删除对象，以及检查桶是否可访问的权限。删除用于失败上传回滚；历史成功提交会保留。
4. 确认区域与 Endpoint 一致，例如区域 `cn-east-3` 对应 `https://obs.cn-east-3.myhuaweicloud.com`。不要将桶名前缀拼进 `OBS_ENDPOINT`。

本应用按你提供的项目使用 S3 兼容 API。官方资料：[OBS 文档](https://support.huaweicloud.com/obs/index.html)、[访问控制说明](https://support.huaweicloud.com/intl/zh-cn/productdesc-obs/obs_03_0391.html)。浏览器不直接访问 OBS，无需配置浏览器 CORS。

## 3. 上传项目

将项目放在服务器的 `/opt/classroom-inbox`。如果项目已推送到你自己的 Git 仓库，可在服务器克隆该仓库；当前目录没有远程仓库时，可通过 SCP 或 SFTP 上传源码。

上传时不包含 `node_modules`、`.nuxt`、`.output` 和测试产物。`.env` 只通过受控方式传到服务器，也可以在服务器重新生成；不要提交 Git。以下步骤都在项目目录执行：

```sh
cd /opt/classroom-inbox
```

若将来迁移本地已有数据，需要一并迁移 SQLite 的一致性备份，见第 7 步；不要在数据库运行中只拷贝主文件而遗漏 WAL。

## 4. 配置 .env

若服务器上没有 `.env`，先生成随机密码和签名密钥：

```sh
docker run --rm -v "$PWD:/work" -w /work oven/bun:1.4.4 bun scripts/init-env.ts
chmod 600 .env
nano .env
```

如果 Docker 以 root 运行导致 `.env` 归 root 所有，可用 `sudo nano .env` 编辑。完整字段见 `.env.example`，至少填好：

```dotenv
ADMIN_PASSWORD=足够长的随机管理密码
SESSION_SECRET=至少32位的随机签名密钥
CLASS_NAME=你的班级名称

OBS_ACCESS_KEY_ID=你的AK
OBS_SECRET_ACCESS_KEY=你的SK
OBS_BUCKET=你的私有桶名
OBS_REGION=cn-east-3
OBS_ENDPOINT=https://obs.cn-east-3.myhuaweicloud.com
OBS_PREFIX=classroom

APP_URL=https://homework.example.com
DOMAIN=homework.example.com
ACME_EMAIL=你的证书联系邮箱
COOKIE_SECURE=true
TRUST_PROXY=true
UPLOAD_MAX_MB=50
```

`DOMAIN` 仅填写域名，`APP_URL` 填含 `https://` 的完整地址。不要保留示例域名。使用特殊符号（如 `$`、`#`）的值时，在 `.env` 中用单引号包裹；生成脚本默认使用无需特殊转义的随机字符。

Compose 将 `.env` 注入服务端；Dockerfile 不会将 `.env` 复制进镜像。Compose 强制启用安全 Cookie 和可信代理，并固定容器内数据库目录为 `/app/.data`。

## 5. 构建和启动

```sh
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 app caddy
```

首次构建会下载 npm 依赖。服务健康后，Caddy 自动为域名申请证书并将 HTTP 跳转到 HTTPS。需确保 DNS 生效，80 / 443 可达，域名未被其他代理错误转发。证书行为详见 [Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)。

检查健康状态：

```sh
curl -fsS https://homework.example.com/api/health
```

预期返回 `{"status":"ok"}`。

浏览器打开域名即可查看班级待办首页。管理员访问 `/admin` 或点击页底“管理员入口”，用 `.env` 中的 `ADMIN_PASSWORD` 登录：

1. 在“存储设置”测试连接，确认能访问指定桶。
2. 在“班级名单”上传名单、预览并确认保存。
3. 发布一份测试作业，复制收集链接。
4. 用手机或无痕窗口打开链接，输入名单内姓名和学号并上传小文件。
5. 管理端刷新，确认统计更新，并分别测试单文件下载、ZIP 打包、CSV 导出。
6. 打开“班级事务 → JSON 导入”，复制提示词或载入格式示例，修改截止时间，校验后确认。测试内置表单填写、结果导出，以及文件类事务的收集入口。外部链接事务需要手动标记完成。每项事务保留原始通知。
7. 无痕打开 `https://你的域名/`，检查当前开放的表单、文件任务和原始通知；将该地址发到班群。名单、答案和下载入口仍由管理登录保护。

存储连接测试检查桶访问；实际上传 / 下载仍需完成第 4、5 项，以确认对象读写权限。未填写真实云端凭证前，开发环境测试不能代替这一步。

## 6. 日常更新

更新服务器上的源码或拉取自己的仓库后执行：

```sh
docker compose exec -T app bun scripts/backup.ts
docker compose build app
docker compose up -d --no-deps app
docker compose ps
```

配置变更后用 `docker compose up -d --force-recreate app` 重新创建应用容器，确保读取新的 `.env`；单纯 `restart` 不会重新读取 Compose 的 env_file。

数据在 `classroom_data` 持久卷中，正常重建容器不会丢失。不要执行 `docker compose down -v`，它会删除数据卷和证书卷。

## 7. 备份、下载和恢复数据库

创建包含已提交 WAL 数据的一致性快照，脚本还会校验备份完整性：

```sh
docker compose exec -T app bun scripts/backup.ts
```

输出类似 `/app/.data/backups/classroom-2026-11-10T12-00-00-000Z.sqlite`。用该实际路径下载到宿主机，再复制到其他服务器或离线位置：

```sh
mkdir -p backups
docker compose cp app:/app/.data/backups/实际备份文件名.sqlite ./backups/
```

可用服务器已有的备份调度工具定期运行。备份含名单和收集令牌，限制读取权限。保留独立的 `.env` 安全副本；OBS 对象也应按你的保留策略配置版本控制或其他备份措施。SQLite 备份只包含索引，不包含作业文件本身。

恢复时先停止应用，再向持久卷放入校验过的快照（把路径换成真实备份）：

```sh
docker compose stop app
docker compose run --rm --no-deps --user root \
  -v "$PWD/backups:/restore:ro" --entrypoint sh app -c \
  'rm -f /app/.data/classroom.sqlite-wal /app/.data/classroom.sqlite-shm && cp /restore/实际备份文件名.sqlite /app/.data/classroom.sqlite && chown bun:bun /app/.data/classroom.sqlite && chmod 600 /app/.data/classroom.sqlite'
docker compose up -d app
```

这一步会替换当前数据库，执行前保存当前状态。恢复后需沿用原 OBS 桶与前缀对应的对象，才能下载旧作业。

## 8. 常见问题

| 现象 | 检查 |
| --- | --- |
| 登录后又回到登录页 | 必须通过 HTTPS 访问；`APP_URL` 与实际域名一致 |
| 跨站提交被拒绝 | 检查 `APP_URL`，不要混用 IP、HTTP 和另一个域名 |
| OBS 连接 / 上传失败 | 检查区域、Endpoint、AK / SK、桶名、IAM 权限与服务器出站网络 |
| 413 请求过大 | 单文件限制在发布作业时设定；每批最多 5 个文件、100 MB；Caddy 接收上限 101 MiB |
| ZIP 下载中断 | 检查 OBS 对象是否被外部删除、网络连接和代理超时；ZIP 需要从 OBS 实时读取 |
| 无法申请 HTTPS 证书 | 检查 DNS A / AAAA、80 / 443、安全组及证书申请日志 |
| 更新 .env 后未生效 | 运行 `docker compose up -d --force-recreate app` |
| 更新名单后旧作业人数没变 | 这是名单快照设计；新作业才使用新名单 |
| 忘记管理密码 | 在服务器 `.env` 更新 `ADMIN_PASSWORD`，重新创建应用容器 |

## 部署边界

当前为单服务器、单应用实例设计，SQLite 必须挂载持久卷。不要直接部署到会清空本地磁盘的临时函数环境。若以后需要多实例或学校统一登录，可将索引迁移至 PostgreSQL 并接入 SSO。

上传会经过服务器内存，批量大文件会增加内存和服务器流量；小班级场景适用。应用没有自动删除历史提交文件，后续需根据实际保留周期安排清理。
