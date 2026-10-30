# 本地部署 + 远程访问

把需求排期台跑在自己的 Mac 上，用 Cloudflare Tunnel 映射到一个固定网址，
在外面用手机或公司电脑打开，数据和家里这台机器是同一份。

全程不需要公网 IP，不需要在路由器上开端口。

---

## 一、它是怎么跑的

```
手机 / 公司电脑
   │  https://scheduler.你的域名.com
Cloudflare 边缘（免费证书 + 邮箱验证码登录）
   │  出站加密隧道，本机不开放任何端口
cloudflared（常驻）
   │  http://127.0.0.1:4173
Node 服务（server/index.mjs）
   ├─ 静态页 dist/index.html
   ├─ /api/state  读写整份数据
   └─ 数据文件 ~/Library/Application Support/demand-scheduler/state.json
```

- 服务默认只监听 `127.0.0.1`，同一 WiFi 下的其他设备也连不上，只能经隧道进来
- 数据落在本机文件里，每天自动备份一份，保留 30 天
- 没有后端时（比如云端那份分享链接），前端会自动退回浏览器存储，不会报错

---

## 二、先在本机跑起来

```bash
cd /Volumes/T7/work/Scheduler
npm install          # 首次
npm run serve        # 构建 + 启动，默认 http://127.0.0.1:4173
```

看到这两行就成功了：

```
需求排期台 已启动  http://127.0.0.1:4173
数据目录       ~/Library/Application Support/demand-scheduler  (rev 0)
```

浏览器打开 <http://127.0.0.1:4173>，随便改一条需求，然后：

```bash
cat ~/Library/Application\ Support/demand-scheduler/state.json | head -c 200
```

能看到内容，说明数据已经写到磁盘了。

> **注意数据搬家**：浏览器存储是按域名隔离的。本地版是 `127.0.0.1`，和线上分享链接
> （`apps.workbuddy.host`）不是同一个域，所以第一次打开本地版看到的是示例数据。
> 把线上那份的真实数据搬过来：在线上版「设置 → 数据 → 导出 JSON 备份」下载文件，
> 再到本地版「设置 → 数据 → 导入 JSON」上传即可。之后数据就落在本机文件里了。

开发模式（改代码热更新）另开两个终端：

```bash
npm run api    # 数据服务，4173
npm run dev    # 前端，5173，/api 自动转发到 4173
```

---

## 三、开机自启（launchd）

仓库里带了脚本，一条命令装好：

```bash
bash scripts/launchd-install.sh
```

它会把服务注册成用户级 LaunchAgent，登录后自动启动、崩溃自动重拉。日志在：

```
~/Library/Logs/demand-scheduler.log
```

卸载：

```bash
bash scripts/launchd-install.sh uninstall
```

> 笔记本合盖会休眠，休眠时隧道会断。想让它一直在线，接上电源并执行
> `sudo pmset -c sleep 0`（仅充电时不休眠）。

---

## 四、映射到公网域名（Cloudflare Tunnel）

### 1. 准备

- 一个域名，DNS 托管在 Cloudflare（免费套餐够用，没有域名就先跳过这步用临时地址）
- 安装客户端：

```bash
brew install cloudflared
```

### 2. 建隧道

```bash
cloudflared tunnel login                       # 浏览器里选域名授权
cloudflared tunnel create scheduler            # 生成凭证，记下 Tunnel ID
cloudflared tunnel route dns scheduler scheduler.example.com
```

### 3. 写配置

`~/.cloudflared/config.yml`：

```yaml
tunnel: scheduler
credentials-file: /Users/你的用户名/.cloudflared/<Tunnel-ID>.json
ingress:
  - hostname: scheduler.example.com
    service: http://127.0.0.1:4173
  - service: http_status:404
```

### 4. 跑起来

```bash
cloudflared tunnel run scheduler      # 先手工验证
sudo cloudflared service install      # 没问题再装成系统服务
```

访问 `https://scheduler.example.com` 应该能看到界面。

> 只想先验证链路、暂时不绑域名：
> `cloudflared tunnel --url http://127.0.0.1:4173`，会给一个
> `xxx.trycloudflare.com` 临时地址，重启就变。

---

## 五、加登录：Cloudflare Access 邮箱验证码

隧道一通，网址就是公开的，**必须马上加访问控制**，否则等于把需求数据公开。

1. 打开 Cloudflare 控制台 → **Zero Trust** → **Access** → **Applications**
2. **Add an application** → 选 **Self-hosted**
3. Application name 填 `需求排期台`，domain 选 `scheduler.example.com`
4. Policy 里新建一条：
   - Action：`Allow`
   - Include → `Emails` → 填你自己的邮箱（要多个人看就都加上）
5. 登录方式选 **One-time PIN**（默认开启，不用配 IdP）
6. 保存

之后任何人访问这个网址，都会先看到 Cloudflare 的登录页，输入邮箱收到 6 位验证码才能进。
免费版支持 50 个用户，个人用绰绰有余。

**加固（可选）**：让服务只接受经 Access 验证的请求，别人就算知道内网地址也读不到数据。

```bash
REQUIRE_ACCESS=1 npm run serve
```

开启后不带 Access 凭证的 `/api` 请求会返回 401。

---

## 六、备份与恢复

- **自动**：每天第一次写入时生成 `backups/2026-10-30.json`，保留最近 30 份
- **手动**：界面「设置 → 数据 → 导出 JSON 备份」
- **恢复**：停服务，把某份备份复制成 `state.json`，再启动

```bash
cd ~/Library/Application\ Support/demand-scheduler
cp backups/2026-10-30.json state.json
```

---

## 七、常见问题

**打不开 / 502**
先确认本机服务活着：`curl http://127.0.0.1:4173/api/health`，返回 `{"ok":true,...}` 说明服务没问题，
问题在隧道：`cloudflared tunnel list` 看连接状态，`tail -f ~/Library/Logs/demand-scheduler.log` 看服务日志。

**数据没同步**
界面上如果提示「连不上本地服务」，说明前端没连上 `/api`。检查是不是直接打开了 `dist/index.html`
（`file://` 协议下没有接口），正确方式是访问 `http://127.0.0.1:4173`。

**两台设备同时改**
后保存的一方会覆盖先保存的，界面会提示「另一台设备改过这份数据，已用本机版本覆盖」。
一个人用基本碰不到；真需要多人协作，再上数据库和字段级合并。

**外置盘拔了**
数据目录默认在内置盘（`~/Library/Application Support`），拔掉 `/Volumes/T7` 不影响已有数据，
但服务读不到 `dist` 会报「还没有构建产物」，重新插上并 `npm run build` 即可。

---

## 八、和线上那份分享链接的关系

`https://demand-scheduler-95439.apps.workbuddy.host/?sharecode=...` 是云端沙箱跑的独立副本，
数据存在各自浏览器里，和本地这份**不互通**。

建议：本地这套跑顺之后，把云端那份当只读演示，或者直接下线，避免两边各改各的。
