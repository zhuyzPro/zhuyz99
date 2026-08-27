# Zhuyz Pro导航 · 个人导航

一个个人网址导航页。公开页面部署在 GitHub Pages，只保留两类入口：中转站与其他；管理数据保存在腾讯云服务器的 SQLite 中。

## 本地预览

```powershell
python -m http.server 4173
```

然后打开 <http://127.0.0.1:4173/>。

## 修改入口

后台地址：<https://zhuyz.art/wayfind-admin/>。登录后台后可以新增分类，以及新增、编辑、删除、排序和移动入口。保存后，公开页面刷新即可读取服务器上的最新数据。

站点不提供面向访客的编辑入口。前台 `app.js` 仍保留一份内置数据，服务器临时不可用时会自动兜底展示。

本地启动后台（Node.js 24+）：

```powershell
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "change-this-before-use"
$env:COOKIE_SECURE = "false"
node server/wayfind-server.js
```

后台默认监听 `127.0.0.1:4899`。生产环境使用独立 systemd 服务和 Nginx HTTPS 反向代理，不把该端口直接暴露给浏览器。

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
.github/         GitHub Pages Actions 工作流
```
