# 完整云端部署流程

本文以 **Ubuntu 24.04 LTS 云服务器 + Docker Compose + Caddy HTTPS + 华为云 OBS** 为例。应用运行一个实例：OBS 保存上传的文件，Docker 持久卷中的 SQLite 保存名单、作业、事务、原始通知、表单答案和提交索引。

项目的 Dockerfile、Compose 和文档使用通用镜像名。**专属镜像加速地址只填写在服务器的 `/etc/docker/daemon.json` 中**，不写入源码、`.env.example` 或部署包。

## 没有域名：使用公网 IP + HTTP

项目提供独立的 `compose.http.yaml`，无需填写域名和证书邮箱。服务器准备、Docker 安装、服务器镜像源配置、OBS 配置仍按下文执行；跳过 DNS 和证书步骤，云安全组开放 TCP 80，SSH 按实际端口限制来源。

将新版源码中的 `compose.http.yaml` 和 `deploy/Caddyfile.http` 一同上传。已有服务器项目至少需要补齐这两个文件。

在服务器项目目录执行 `nano .env`，新增或修改以下配置。每个变量只保留一行，将 IP 换成服务器的真实公网地址：

```dotenv
COMPOSE_FILE=compose.http.yaml
APP_URL=http://你的服务器公网IP
COOKIE_SECURE=false
TRUST_PROXY=true
HTTP_PORT=80
```

`ADMIN_PASSWORD`、`SESSION_SECRET` 和所有 OBS 配置沿用原值。HTTP 配置不读取 `DOMAIN` 和 `ACME_EMAIL`，这两个变量可以留空。它会关闭安全 Cookie 标志并保留代理、上传大小限制和持久卷。`COMPOSE_FILE` 让后续不带 `-f` 的 Compose 命令自动选择 HTTP 配置。

服务器启动：

```sh
cd /opt/classroom-inbox
sudo docker compose config --quiet
sudo docker compose up -d --build --force-recreate
sudo docker compose ps
sudo docker compose logs --tail=100 -f app caddy
```

`Ctrl+C` 退出日志查看，容器继续运行。浏览器访问 `http://你的服务器公网IP/` 查看学生待办，`http://你的服务器公网IP/admin` 登录管理端；健康检查为 `http://你的服务器公网IP/api/health`。所有分享、填写和上传均使用同一 IP 与端口。

如果浏览器报 SSL 错误，先确认地址栏完整填写 `http://`，并在服务器检查：

```sh
curl -I http://你的服务器公网IP/
sudo docker compose config --services
sudo docker compose logs --tail=100 caddy
```

若 HTTP 响应仍包含跳转到 `https://` 的 `Location`，检查新配置文件是否已上传，并明确选择 HTTP 配置重新创建服务：

```sh
sudo docker compose -f compose.http.yaml config --quiet
sudo docker compose -f compose.http.yaml up -d --build --force-recreate
```

若 curl 能正常访问 HTTP、浏览器仍强制 HTTPS，检查浏览器的“始终使用安全连接”设置，允许该 IP 使用 HTTP。不要通过忽略证书错误来代替正确的 HTTP 配置。

若 80 端口已被其他服务占用，可改为 `HTTP_PORT=8080`、`APP_URL=http://你的服务器公网IP:8080`，同时开放 TCP 8080，再重新创建容器。公网仍无需开放应用的 3000 端口。

两种配置使用相同 Compose 项目名与数据库卷，切换时保留数据。不要用 `down -v`。HTTP 的管理密码和提交内容以明文传输，建议先用于部署验证，后续配置 HTTPS。

有域名后，先备份数据库，配置好 DNS，再将服务器 `.env` 改为：

```dotenv
COMPOSE_FILE=compose.yaml
DOMAIN=你的域名
APP_URL=https://你的域名
ACME_EMAIL=你的证书联系邮箱
COOKIE_SECURE=true
TRUST_PROXY=true
```

开放 TCP 80/443，再执行 `sudo docker compose up -d --build --force-recreate`。HTTPS 验证完成后重新分享首页和任务链接；已发出的 IP 链接需替换。

下文中 `ubuntu` 是示例 SSH 用户名，按服务器实际账户替换；`homework.example.com`、`你的服务器公网IP`、`YOUR_BUCKET_NAME` 都要换成自己的值。标注“本机”的命令在你的 Mac 执行，标注“服务器”的命令通过 SSH 执行。

## 1. 准备服务器、域名和网络

准备一台 Ubuntu 24.04 LTS 服务器，可从 2 核 4 GB 内存开始；多人同时上传大文件时按内存使用情况扩容。保留足够磁盘空间用于 Docker 镜像、SQLite 和备份。

在域名服务商添加 DNS 记录：

| 类型 | 主机记录 | 值              |
| ---- | -------- | --------------- |
| A    | homework | 服务器公网 IPv4 |

该例最终域名为 `homework.example.com`。如果配置 AAAA，IPv6 也必须能到达该服务器。

在云服务器安全组配置入站规则，并检查已有的主机防火墙也允许网站端口：

| 端口    | 来源                | 用途                                     |
| ------- | ------------------- | ---------------------------------------- |
| TCP 22  | 管理员自己的公网 IP | SSH；若服务器改了 SSH 端口，以实际值为准 |
| TCP 80  | 所有访问者          | HTTP 跳转及 HTTPS 证书验证               |
| TCP 443 | 所有访问者          | HTTPS                                    |
| UDP 443 | 所有访问者，可选    | HTTP/3                                   |

应用的 3000 端口由 Docker 内部网络访问。确认服务器的 80、443 没有被其他网站服务占用。

中国大陆节点的网站需先按接入商要求完成备案再开通访问；已在其他接入商备案的域名也需确认接入要求。参见[华为云备案说明](https://support.huaweicloud.com/icp_faq/icp_05_0145.html)。

本机登录服务器：

```sh
ssh ubuntu@你的服务器公网IP
```

## 2. 创建 OBS 私有桶和应用访问密钥

在华为云控制台进入“对象存储服务 OBS”，创建一个**私有、标准存储**桶。建议应用服务器与 OBS 使用同一区域。记录桶名、区域和区域服务 Endpoint。

例如使用华东上海一区时，配置为：

```dotenv
OBS_BUCKET=你的实际桶名
OBS_REGION=cn-east-3
OBS_ENDPOINT=https://obs.cn-east-3.myhuaweicloud.com
OBS_PREFIX=classroom
```

Endpoint 填区域端点，不包含桶名。桶和对象保持私有；浏览器经应用服务端上传下载，应用不需要 OBS 浏览器 CORS 配置。

在 IAM 创建应用专用用户，启用编程访问并生成访问密钥 AK/SK。将用户加入专用用户组，并给该组授予限定到此桶的自定义权限。

项目已提供两种授权模型的模板，选择与你的 IAM 控制台一致的一种：

| 控制台授权模型           | 模板                             | Version |
| ------------------------ | -------------------------------- | ------- |
| 身份策略授权，新版 IAM   | `deploy/obs-iam-v5.example.json` | `5.0`   |
| 角色与策略授权，旧版 IAM | `deploy/obs-iam-v3.example.json` | `1.1`   |

操作顺序：创建自定义策略 → 选 JSON 视图 → 粘贴对应模板 → 将两处 `YOUR_BUCKET_NAME` 改为实际桶名 → 保存 → 授予用户组 → 将应用用户加入用户组。旧版 OBS 策略使用“全局服务”授权范围。按控制台的策略类型选择模板，不要混用新版和旧版的授权项大小写。

模板仅授权以下应用操作：

| 操作         | 资源范围           | 用途                 |
| ------------ | ------------------ | -------------------- |
| HeadBucket   | 指定桶             | 管理端测试桶连接     |
| PutObject    | 桶内 `classroom/*` | 上传文件             |
| GetObject    | 桶内 `classroom/*` | 下载文件与打包 ZIP   |
| DeleteObject | 桶内 `classroom/*` | 上传失败后的回滚清理 |

如果修改 `OBS_PREFIX`，同时修改模板中的 `classroom/*`。这套权限供应用 API 使用，不包含专用 IAM 用户浏览 OBS 控制台所需的列举权限。管理员可用原有管理账号查看桶。

官方说明：[新版 IAM 授权项](https://support.huaweicloud.com/api-obs/obs_04_0112.html)、[新版身份策略样例](https://support.huaweicloud.com/perms-cfg-obs/obs_40_0055.html)、[旧版角色与策略授权](https://support.huaweicloud.com/perms-cfg-obs/obs_40_0054.html)。启用额外云服务功能时，按相应官方说明补充所需权限。

## 3. 在服务器安装 Docker

以下命令针对新装 Ubuntu 24.04。已有 Docker Engine 和 Compose 插件的服务器可直接检查版本，跳到第 4 步；其他发行版采用[Docker 对应系统的官方安装步骤](https://docs.docker.com/engine/install/)。

服务器执行，按 [Docker Ubuntu 官方文档](https://docs.docker.com/engine/install/ubuntu/)配置 APT 仓库：

```sh
sudo apt update
sudo apt install -y ca-certificates curl nano
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker --version
sudo docker compose version
```

## 4. 只在服务器配置镜像加速地址

服务器执行：

```sh
sudo install -m 0755 -d /etc/docker
sudo nano /etc/docker/daemon.json
```

没有现有配置时填入下列 JSON，将占位符换成你提供的专属镜像域名；这里的值需要带 `https://`：

```json
{
  "registry-mirrors": ["https://你的专属镜像域名"]
}
```

已有其他配置时，只增加或修改 `registry-mirrors`，保留其他字段；修改前可将原文件备份到服务器的受控目录。`nano` 用 Ctrl+O、回车保存，再用 Ctrl+X 退出。

校验配置并重启 Docker：

```sh
sudo dockerd --validate --config-file=/etc/docker/daemon.json
sudo systemctl restart docker
sudo docker info
sudo docker pull oven/bun:1.4.4
sudo docker pull caddy:2-alpine
sudo docker run --rm oven/bun:1.4.4 bun --version
```

`docker info` 的 `Registry Mirrors` 应显示服务器上填写的地址。最后一条预期输出 `1.4.4`。已有其他容器的服务器应在可接受的维护时间重启 Docker。

项目保留 `oven/bun:1.4.4` 和 `caddy:2-alpine` 两个通用镜像名，通过该服务器的 Docker 加速配置拉取。参见[Docker 镜像加速配置](https://docs.docker.com/docker-hub/image-library/mirror/)。

## 5. 从本机上传源码

在你的 **Mac 本机**开一个终端执行以下命令。它只打包明确列出的源码文件，不包含 `.env`、本地数据库、个人名单、依赖目录和测试产物：

```sh
cd "/Users/dylansu/Documents/ChatGPT/班级相关事物"

COPYFILE_DISABLE=1 tar -czf /tmp/classroom-inbox.tar.gz \
  Dockerfile compose.yaml compose.http.yaml deploy package.json bun.lock \
  nuxt.config.ts tsconfig.json .env.example .dockerignore .gitignore \
  README.md DEPLOYMENT.md app server shared public scripts docs tests

scp /tmp/classroom-inbox.tar.gz ubuntu@你的服务器公网IP:/tmp/
```

然后在 **服务器 SSH 终端**执行：

```sh
sudo mkdir -p /opt/classroom-inbox
sudo chown "$(id -u):$(id -g)" /opt/classroom-inbox
cd /opt/classroom-inbox
tar -xzf /tmp/classroom-inbox.tar.gz
```

若使用自己的 Git 仓库，也可克隆到同一路径。首次部署默认使用空数据库；如果本机已有需要迁移的事务和提交记录，需迁移第 9 步所述的一致性快照。

## 6. 在服务器生成并填写 .env

服务器执行：

```sh
cd /opt/classroom-inbox
sudo docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work \
  oven/bun:1.4.4 bun scripts/init-env.ts
chmod 600 .env
nano .env
```

脚本会生成随机 `ADMIN_PASSWORD` 和 `SESSION_SECRET`；已有 `.env` 时保留。保留生成的随机值，管理员登录时使用 `ADMIN_PASSWORD`。修改以下字段：

```dotenv
CLASS_NAME=你的班级名称

OBS_ACCESS_KEY_ID=你的AK
OBS_SECRET_ACCESS_KEY=你的SK
OBS_SECURITY_TOKEN=
OBS_BUCKET=你的私有桶名
OBS_REGION=cn-east-3
OBS_ENDPOINT=https://obs.cn-east-3.myhuaweicloud.com
OBS_PREFIX=classroom

DOMAIN=homework.example.com
APP_URL=https://homework.example.com
ACME_EMAIL=你的证书联系邮箱

COOKIE_SECURE=true
TRUST_PROXY=true
UPLOAD_MAX_MB=50
NITRO_BUN_IDLE_TIMEOUT=240
```

区域和 Endpoint 按真实桶修改。普通 AK/SK 的 `OBS_SECURITY_TOKEN` 留空；使用临时凭证时需填写配套 token 并在过期前更新。

`DOMAIN` 只填域名；`APP_URL` 填同一域名的完整 HTTPS 地址，不附加路径。使用 `$`、`#` 等特殊字符的值时，用单引号包裹。完整变量解释见 README。

Compose 把 `.env` 注入服务端，强制开启 HTTPS Cookie 和可信代理，并将数据库固定存入 `/app/.data` 持久卷。镜像构建排除了 `.env`。服务器的镜像加速地址不需要写入此文件。

## 7. 构建、启动和验证 HTTPS

服务器执行：

```sh
cd /opt/classroom-inbox
sudo docker compose config --quiet
sudo docker compose build app
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 app caddy
```

首次构建会下载 npm 依赖。镜像加速配置负责 Docker 镜像拉取，Bun 安装依赖还需服务器能访问 npm registry。

应用健康后，Caddy 自动为域名申请并续期证书，并将 HTTP 跳转到 HTTPS；DNS、80/443 和持久证书目录需正常。参见[Caddy 自动 HTTPS 文档](https://caddyserver.com/docs/automatic-https)。

验证：

```sh
curl -fsS https://homework.example.com/api/health
```

预期返回：

```json
{ "status": "ok" }
```

这表示应用可访问，尚未验证真实 OBS 文件读写。

## 8. 首次管理员设置与验收

打开 `https://你的域名/admin`，用服务器 `.env` 中的 `ADMIN_PASSWORD` 登录。

1. **存储设置**：点击测试连接，确认指定桶可访问。
2. **班级名单**：上传 JSON、CSV 或 Excel，核对预览后确认导入。可以在本机浏览器选择 `private-imports/班级名单.json`；该个人文件没有进入部署包。
3. **测试收文件**：发布一份测试作业，填写原始通知并复制收集链接；用手机或无痕窗口输入名单内的姓名、学号，上传一个小文件。
4. **验证下载与统计**：管理端检查人数，分别下载单文件、ZIP、提交情况 CSV；在 OBS 控制台用管理账号确认出现 `classroom/` 前缀对象。再重交一次确认有效记录更新。
5. **测试班级事务**：进入“班级事务 → JSON 导入”，复制提示词或导入样例，修改日期和内容，校验预览后确认。分别测试内置表单、外部链接、文件收集。原始通知必须保留；外部链接的完成状态由管理员维护。
6. **检查学生首页**：无痕访问 `https://你的域名/`，确认开放任务、截止时间、原始通知和办理入口正确，再把该首页地址发给同学。

学生首页为 `/`，管理入口为 `/admin`，旧地址 `/classroom` 会跳转到首页。名单、答案和管理员下载接口由登录保护。

管理端连接测试使用 HeadBucket；第 3、4 项才验证上传与下载权限。初次上线必须用真实 OBS 完成这一轮。

## 9. 备份、迁移和恢复

### 创建并下载备份

服务器执行以下命令，生成包含已提交 WAL 数据的一致性快照，并校验数据库完整性：

```sh
cd /opt/classroom-inbox
sudo docker compose exec -T app bun scripts/backup.ts
```

记录输出的实际路径，例如 `/app/.data/backups/classroom-2026-11-10T12-00-00-000Z.sqlite`。将真实文件名替换到下面命令：

```sh
mkdir -p backups
chmod 700 backups
sudo docker compose cp app:/app/.data/backups/实际备份文件名.sqlite ./backups/
sudo chown "$(id -u):$(id -g)" ./backups/实际备份文件名.sqlite
chmod 600 ./backups/实际备份文件名.sqlite
```

在 Mac 本机下载到受控目录：

```sh
mkdir -p "$HOME/classroom-backups"
chmod 700 "$HOME/classroom-backups"
scp ubuntu@你的服务器公网IP:/opt/classroom-inbox/backups/实际备份文件名.sqlite "$HOME/classroom-backups/"
chmod 600 "$HOME/classroom-backups/实际备份文件名.sqlite"
```

备份包含名单、表单答案和收集令牌，保留访问限制。使用服务器已有的备份调度工具定期执行，并保留服务器之外的副本；备份成功验证后再按保留周期清理旧副本，避免备份持续占满磁盘。

SQLite 快照包含文件索引，**OBS 中的作业文件需另外保留或备份**；同时保存 `.env` 的受控副本。迁移时沿用原桶及前缀对应的对象。运行中的数据库使用备份脚本导出，不直接拷贝主数据库文件。

本机开发数据可在项目目录运行 `bun run backup`，把输出快照传到服务器的 `backups/` 后按下面流程恢复。服务器 `.env` 仍需使用正式域名和配置。

### 恢复数据库

恢复会替换当前数据库。先按上面的步骤备份当前状态，再将目标快照放进服务器项目的 `backups/`。以下命令中的实际备份文件名必须替换成真实值。

服务器执行：

```sh
cd /opt/classroom-inbox
sudo docker compose stop app
sudo docker compose run --rm --no-deps --user root \
  -v "$PWD/backups:/restore:ro" --entrypoint sh app -ec '
    bun -e '\''
      const { Database } = require("bun:sqlite");
      const db = new Database("/restore/实际备份文件名.sqlite", { readonly: true });
      const result = db.query("PRAGMA integrity_check").get();
      db.close();
      if (result.integrity_check !== "ok") throw new Error("备份校验失败");
    '\''
    cp /restore/实际备份文件名.sqlite /app/.data/classroom.sqlite.restore
    chown bun:bun /app/.data/classroom.sqlite.restore
    chmod 600 /app/.data/classroom.sqlite.restore
    rm -f /app/.data/classroom.sqlite-wal /app/.data/classroom.sqlite-shm
    mv /app/.data/classroom.sqlite.restore /app/.data/classroom.sqlite
  '
sudo docker compose up -d
```

恢复后检查首页、登录、统计和旧文件下载。校验或复制失败时先处理错误，再决定恢复或启动原数据库。

## 10. 更新和日常运维

每次更新先执行第 9 步备份，并将快照复制出容器。然后重新上传解压源码，或拉取自己的仓库，再执行：

```sh
cd /opt/classroom-inbox
sudo docker compose build app
sudo docker compose up -d --no-deps app
sudo docker compose ps
curl -fsS https://homework.example.com/api/health
```

### 请假功能升级与验收

本次升级会在原 SQLite 中自动新增晚自习设置、个人调整、请假记录、假条索引表。原名单、作业、通知和提交记录保留，**不需要重新导入数据库或名单**。首次上线前按第 9 步备份，再上传新版源码，沿用服务器已有 `.env`、OBS 桶、对象前缀和 Docker 数据卷。无需增加环境变量、服务器端口或 OBS 访问方式。

无域名、已在使用 HTTP 配置的服务器按以下步骤重建应用（备份后执行）：

```sh
cd /opt/classroom-inbox
sudo docker compose build app
sudo docker compose up -d --no-deps app
sudo docker compose ps
sudo docker compose logs --tail=100 app
curl -fsS http://你的服务器公网IP/api/health
```

首次验收：

1. 访问 `/evening-settings`，设置本班每周晚自习、开始 / 结束日期和每日时间，再启用并保存。原始通知可粘贴保留。
2. 从首页进入 `/leave`，用已导入名单中的姓名、学号核对身份。新增晚自习请假，勾选以后补交假条；管理端 `/leaves` 应立即减少对应正常晚自习人数。
3. 补交一份测试假条，确认本人和管理员都能下载；取消该请假，核对人数恢复。
4. 同学申请永久或指定日期调整，在 `/evening-settings` 审核通过前后核对每日名单；再验证管理员直接设置的调整立即生效。
5. 在 `/leaves` 选择日期并导出 Excel，检查正常人员、有效请假和待补假条状态。普通课程请假有独立类型，不扣减晚自习人数。

假条文件仍写入原私有 OBS 桶，路径位于原 `OBS_PREFIX` 下的 `leave-proofs/`。如果现有 IAM 权限只放行 `assignments/` 子目录，还需在服务器使用的 IAM 策略中允许该前缀的读、写、删除；若已允许整个应用前缀则无需调整。备份需同时保留 SQLite、OBS 对象和 `.env`。

正常重建不会删除 `classroom_data` 卷。**不要执行 `docker compose down -v`**，该命令会删除数据库卷和证书卷。

修改 `.env` 后执行以下命令，重新注入配置；若修改了域名或证书邮箱，同时让 Caddy 应用新配置：

```sh
sudo docker compose up -d --force-recreate app caddy
```

单纯 `restart` 不会重新读取 Compose 的 env_file。修改管理员密码同样编辑 `.env` 后重建容器；密码改变会使已有管理会话失效。

常用查看命令：

```sh
sudo docker compose ps
sudo docker compose logs --tail=100 app caddy
sudo docker stats --no-stream
df -h
```

| 现象                     | 检查                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| Docker 镜像拉取失败      | 服务器的镜像源配置、镜像站可用性与额度、出站网络；`docker info` 确认配置生效 |
| Bun 安装依赖超时         | 检查 npm registry 网络；Docker 镜像加速不会代理 npm                          |
| HTTPS 证书申请失败       | DNS A/AAAA、80/443、安全组、端口占用和 Caddy 日志                            |
| 登录后返回登录页         | 使用 HTTPS，确认 `APP_URL` 与浏览器地址一致                                  |
| 跨站提交被拒绝           | 检查 `APP_URL`，统一通过正式 HTTPS 域名访问                                  |
| OBS 连接成功但上传失败   | 桶连接和对象权限独立；检查 PutObject、前缀范围、AK/SK、区域                  |
| OBS 下载失败             | 检查 GetObject 权限、对象是否存在，确认恢复的数据对应原桶对象                |
| 413 请求过大             | 每批最多 5 个文件、100 MiB；单文件还受任务设置和 `UPLOAD_MAX_MB` 限制        |
| 上传时内存不足           | 上传经过服务器内存，降低单文件限制或增加内存，查看容器日志和资源使用         |
| 更新名单后旧作业人数没变 | 旧作业使用发布时的名单快照，新作业使用新名单                                 |
| 改 .env 没生效           | 用 `up -d --force-recreate` 重新创建容器                                     |
| 磁盘空间不足             | 检查旧数据库备份、镜像和日志；保留数据库持久卷                               |

当前使用单服务器、单应用实例和 SQLite 持久卷。后续扩展多实例时，需先将数据库迁移到支持并发共享的数据库。历史成功上传的 OBS 文件不会自动删除，应按班级保留周期维护。

本地已完成构建和模拟存储联调；真实云服务器上的 Docker 镜像构建、HTTPS 与 OBS 读写以上述上线验收结果为准。

## 11. 停止和卸载

以下命令均在服务器执行，读取 `.env` 中选定的 Compose 配置。只停止并移除本项目容器与网络，保留数据库卷和源码：

```sh
cd /opt/classroom-inbox
sudo docker compose down --remove-orphans
```

需要彻底删除本项目时，先保存需要的数据库备份及 `.env` 配置。下面第一条命令会删除持久卷中的名单、事务、原始通知、表单答案、提交索引和证书数据，并移除本地构建的应用镜像；第二组命令删除源码目录及其中的配置和宿主机备份：

```sh
cd /opt/classroom-inbox
sudo docker compose down -v --remove-orphans --rmi local
```

确认上一条成功后执行：

```sh
cd /opt
sudo rm -rf /opt/classroom-inbox
```

如果 `.env` 中选择了尚未上传的 `compose.http.yaml`，可在卸载命令中显式加 `-f compose.yaml` 使用原来的配置；原配置仍需能够通过变量校验。

OBS 文件和服务器的 Docker 镜像加速配置会保留。要清理 OBS 文件，在控制台核对目标桶与应用前缀后单独删除；其他应用共用的镜像、Docker 本身和镜像源无需随本项目卸载。
