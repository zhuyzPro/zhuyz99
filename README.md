# 航迹 · 个人导航

一个纯静态、可搜索、可收藏的个人网址导航页。页面不需要后端，站点内容写在 `app.js`，收藏、主题和自定义入口保存在浏览器本地。

## 本地预览

```powershell
python -m http.server 4173
```

然后打开 <http://127.0.0.1:4173/>。

## 修改入口

默认站点和分类在 `app.js` 顶部的 `DEFAULT_LINKS` 中。每个入口包含名称、地址、分类、简介、色调和标签，按现有格式增删即可。

页面自带的“新增入口”只写入当前浏览器的 `localStorage`，不会修改仓库文件；需要让所有访问者看到某个入口时，请直接编辑 `DEFAULT_LINKS` 后提交。

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
