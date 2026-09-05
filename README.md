# Zhuyz Pro导航 · 个人导航

一个个人网址导航页。后台数据保存在腾讯云服务器的 SQLite 中；内网前台实时读取服务器数据，公开页面则使用发布到 GitHub Pages 的静态快照。

## 本地预览

```powershell
python -m http.server 4173
```

然后打开 <http://127.0.0.1:4173/>。

## 修改入口

后台地址：<https://zhuyz.art/wayfind-admin/>。登录后台后可以新增、编辑、删除分类，以及新增、编辑、删除、排序和移动入口。入口的“后台备注”只在后台保存和显示，不会进入公开快照。右上角的个人设置可以修改密码，修改后会要求重新登录。保存数据后，点击“发布给访客”，服务器只导出已启用的分类和入口并提交到 GitHub；GitHub Pages 工作流随后自动部署。后台默认使用浅色主题，右下角按钮可以切换深色主题，选择会保存在当前浏览器中。

站点不提供面向访客的编辑入口。`/preview/` 是服务器上的内网实时预览，会读取当前数据库；GitHub Pages 只读取仓库根目录的 `navigation-data.json`，不会请求服务器 API。服务器临时不可用时，内网预览会提示加载失败；公开站点仍可显示上一次成功发布的快照。

本地启动后台（Node.js 24+）：

```powershell
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "change-this-before-use"
$env:COOKIE_SECURE = "false"
# 可选：本地默认是 /api/；生产反向代理使用 /wayfind-api/
$env:COOKIE_PATH = "/api/"
# 可选：会话有效期（毫秒），默认 30 天，范围 5 分钟至 365 天
$env:SESSION_TTL_MS = "2592000000"
# 发布到 GitHub Pages（生产环境放进受限的 wayfind.env，不要写入仓库）
$env:GITHUB_TOKEN = "fine-grained-token"
$env:GITHUB_REPOSITORY = "zhuyzPro/zhuyz99"
$env:GITHUB_BRANCH = "main"
$env:GITHUB_FILE_PATH = "navigation-data.json"
node server/wayfind-server.js
```

后台默认监听 `127.0.0.1:4899`。生产环境使用独立 systemd 服务和 Nginx HTTPS 反向代理，不把该端口直接暴露给浏览器。内网访问可以通过 SSH 隧道转发本地端口，例如：

```powershell
ssh -i C:\Users\Anderson\Desktop\二维码生成\zhuyz_art_server_rsa.pem -p 22 -L 4899:127.0.0.1:4899 ubuntu@139.199.69.231
```

然后在本机打开 `http://127.0.0.1:4899/admin/`（后台）或 `http://127.0.0.1:4899/preview/`（内网前台）。如果生产环境使用 Nginx 路径前缀，应通过内网/VPN访问并相应设置 `ADMIN_ORIGIN` 与 `COOKIE_PATH`；不要把后台/API直接开放到公网。
登录会话默认有效 30 天，后台持续使用时会自动续期；会话记录保存在 SQLite，服务重启后只要仍未过期就不需要重新登录。生产环境必须设置 `SESSION_SECRET`，服务会拒绝在缺少该值时启动；反向代理路径为 `/wayfind-api/` 时，将 `COOKIE_PATH=/wayfind-api/` 写入环境文件，避免会话 Cookie 被同域的无关路径携带。

导航默认分类和示例入口只会在全新、空数据库首次启动时写入一次。之后即使删除所有分类或入口，服务重启也不会重新创建它们。

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。推送到 `main` 后，GitHub Actions 会自动把根目录发布到 Pages。

项目仓库的默认地址格式是：

```text
https://zhuyzpro.github.io/<仓库名>/
```

仓库名使用小写字母、数字和短横线最稳妥，例如 `wayfind` 或 `nav-home`。如果以后需要自定义域名，再在仓库的 Pages 设置里填写域名并配置 DNS。

本机已经配置并验证了 GitHub SSH 别名 `github-zhuyzpro`，远程地址可以写成：

```text
git@github-zhuyzpro:zhuyzPro/<仓库名>.git
```

## 文件结构

```text
index.html       页面结构
styles.css       主题、响应式布局和交互状态
app.js           站点数据与页面行为
favicon.svg      浏览器图标
.github/         GitHub Pages Actions 工作流
```
