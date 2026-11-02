# 强起手牌动效重启修复（2026-10-28）

对手每次行动都会调用实时牌桌渲染。此前底牌区域每次通过 `setLocalizedHTML` 写入整个 `innerHTML`，即使仍是同一手、同两张底牌也重建节点。强起手牌的 `::after` 光效跟着新节点从零开始，产生额外闪动，原定的结束计时却没有重置。

现在同手、同底牌复用原节点，只更新最佳组合标记；新手或重打仍重建底牌以播放发牌动画。光效样式、持续时间、牌局规则及机器人策略没有改变。

## 验证

- 新增 Web 回归在修复前真实失败：对手行动后 `sameCards` 和 `sameGlows` 都为 false。原始 trace 与失败保留。
- 修复后桌面、手机 Web 所选 30 项通过。定向 AK 案例连续执行两个合法对手动作，确认底牌节点和 CSS 光效实例不变，光效进度保留；到时正常清除，后续行动不重播。另验证重打相同底牌仍更换节点并发牌，以及结算、补码、布局、后台暂停和取消。
- `npm run check`：1,288/1,288 单元、生产构建和微信生成通过；格式、微信资源与 23 文件官方模板编译通过。
- 小程序新增真实引擎动作的适配回归，确认对手行动只发差异补丁，不替换 `heroCards` 或重设 `premium`。适配及原生选择检查共 98 项通过，包含在上述全量单元中。
- 当前微信包与 10 月 27 日已验的实际 DevTools 包逐文件比对，141 文件中仅 `project.config.json` 的 AppID 不同；运行代码、模板、样式、图片和音频一致。本轮没有重跑实际 DevTools 或实体微信，不将代码一致性和适配检查称为新的客户端画面通过。
- Xcode、Gradle 编译，两端资源同步与源码摘要核验通过。iOS、Android 安装版各 1 项定向通过、各 32 项未选：自然发牌、真实点击跟注、等待对手实际行动，两张底牌节点不变、删除计数为零。原图已检查；这两手自然牌均非强起手牌，原生证据验证节点复用，不冒充 AK 光效逐帧验收。

## 失败与边界

Android 首次 host GPU 模拟器的 QEMU 主循环及四个 CPU 线程挂起，以 139 退出，安装测试的 WebView 连接随之断开。仅本任务专用 AVD 改为 `swiftshader_indirect`，保留 `-feature -WiFiPacketStream` 后恢复。软件绘制的首次测试启动早于设备就绪，因 `device offline` 在场景前失败；确认系统启动和 PackageManager 均就绪后，同配置定向检查按原断言、原时限通过。未擦除原设备、调整应用绘制逻辑或关闭其他任务设备。

所有失败、报告和原始截图保留在本机 `.artifacts/premium-glow-2026-10-28/`，不加入 Git。没有新增音效、人耳听音、实体手机、商店或远程 CI 通过结论。

## 复验

```sh
npm run check
npm run test:e2e -- tests/e2e/game-end.spec.js tests/e2e/mobile-lifecycle.spec.js --workers=1
npm run format:check
npm run wechat:verify
npm run wechat:check
```

安装版按本机调试技能选择专用设备，再以 `NOIR_NATIVE_SCENARIOS=hero-cards-stable-during-opponent-action` 过滤运行；必须核对实际安装的源码摘要，不能复用旧 PID、设备端口或旧包成绩。
