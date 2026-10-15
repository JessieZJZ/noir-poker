# 对局记录 PR 整合（2026-10-16）

按用户要求统一由 [PR #49](https://github.com/JessieZJZ/noir-poker/pull/49) 承接除“轮到我行动的提醒动效”之外的开放 PR。目标仍为 `main`，本轮只更新 PR，不合并 `main`、部署网站或发布安装包。

## 提交范围

| PR                                                     | 核对的源提交                               | 处理                                                           |
| ------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------- |
| [#45](https://github.com/JessieZJZ/noir-poker/pull/45) | `13b1d921ad908fed325f9e7dc3411b00268b8657` | 已完整包含在 #49 原有提交中，由 #49 统一审阅                   |
| [#48](https://github.com/JessieZJZ/noir-poker/pull/48) | `78aaa0ed7089625910136c95102014c55de08343` | 以合并提交 `bebd0a5f1274152179d433e1a95e72606e11987f` 纳入 #49 |
| [#47](https://github.com/JessieZJZ/noir-poker/pull/47) | `a9d6934cb257ccbe7dfba85961735dc7c6f5f95f` | 行动提醒需求保持独立，其 4 个独有提交及对应补丁均未纳入        |

整合 #48 的历史底牌翻转与微信顶部间距修复，同时保留 #49 的缓存摘要、分页传输、返回不重写几何、长按全名、底池明细弹窗及历史 Showdown。文档冲突保留两项功能说明，Web 测试冲突保留性能与翻牌两组回归，没有丢弃任一侧行为。

关闭来源 PR 前，重新获取远端并检查源提交是 `origin/codex/records-performance-spacing` 的祖先，缺失提交数为零。`origin/main` 仍为 `0c9bca8c658d815c835bd29f121259e9f8a9c5d1`；本次整合到 PR 不代表功能已经进入 `main`。常用目录的行动提醒分支及其工作不作修改。

## 本轮验证

- `npm run check`：742/742 单元通过，生产 Web 与微信构建通过。
- `npm run test:e2e`：478 项，477 通过、1 项沿用既有条件跳过、0 失败，11.6 分钟；2 workers，retries=0。桌面与手机均覆盖新增的历史翻牌、再次查看、减少动态效果和快照隔离，完整回归同时覆盖性能、底池弹窗、Showdown、导航与牌桌布局。
- `npm run format:check` 通过。
- `wechat:verify` 和官方 13 文件 WXML/WXSS 编译通过；共享适配器回归包含在上述单元测试中。
- `mobile:sync`、`mobile:verify` 通过，本地图片与共享资源一致。

本轮没有重新执行 Xcode/Gradle 编译、安装后的 iOS/Android 场景或微信 DevTools 实际页面；不能将构建资源和浏览器结果描述为设备运行通过。之前的实际设备范围与失败记录保留在[性能与多端验证](records-performance-validation-2026-10-15.md)和[历史翻牌验证](records-peek-nav-validation-2026-10-16.md)。

本机证据保存在忽略的 `.artifacts/pr-consolidation-20261016/`，包括 `check.log`、`web.log`、`format.log`、`wechat-{verify,check}.log`、`mobile-{sync,verify}.log` 与提交包含关系审计。
