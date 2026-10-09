# 构建与 Sites 发布

## 本地生产构建

```sh
npm ci
npm run format:check
npm run check
npm run test:e2e
npm run preview
```

`npm run build` 生成 `dist/index.html`、哈希文件名的脚本、样式、Worker 和静态资源。不要直接修改 `dist/`；修改源文件后重新构建。部署时整个 `dist/` 必须一起上传，不能只替换 HTML 或部分脚本。

## 原网站关联

`.openai/hosting.json` 保留原 Sites 项目 ID 和 `static.directory: "dist"`。后续在 Codex 中更新这个网站时应复用该关联，避免意外创建第二个网站。不要将临时写入凭据、token 或浏览器访问凭据写入源码、文档或环境文件。

Sites 发布流程：

1. 校验源文件、单元测试和浏览器测试，构建生产产物。
2. 通过 Sites 插件的源码工作流提交并推送当前源码。
3. 从同一份源码构建的 `dist/` 和 `.openai/hosting.json` 打包部署档案。
4. 保存对应源码提交的版本，部署该版本，等待 Sites 返回成功状态。

部署操作由 Sites 插件提供；本地 `npm run build` 或 `npm run preview` 不会自动发布。保留当前网站访问范围，发布成功后才认为线上更新完成。

目前项目使用静态托管，无数据库迁移或服务端环境变量。若未来加入联网分析或用户存档，需要另外设计后端、密钥边界和持久化方式。

## 原生 App

Sites 仍只发布 Web 的 `dist/`。iOS/Android 使用同一源码的独立原生构建，输出 `.artifacts/mobile/`，不会改变 Sites 的托管目录。每次原生打包重新构建当前源码；在线网站发布和商店版本发布是两个入口。命令、IDE 构建入口及版本规则见 [手机工程](mobile.md)，签名与买断制上架见 [发行准备](mobile-release.md)。
