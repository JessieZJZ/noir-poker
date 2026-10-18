# 启动画面素材与首屏

`public/launch-icon.png` 是现有 `public/app-icon.png` 的透明背景提取版，用于 Web、iOS、Android 和微信自身的启动过渡。原桌面 App 图标保持原样。512px PNG 的四角 alpha 为零，图标中的玻璃圆角底板与黑桃保留；不把黑色矩形贴到启动背景上。

使用内置 imagegen 工具的 background-extraction 编辑模式，输入为项目自己的图标。最终提示：

> Use case: background-extraction. Edit target: the provided NOIR Poker app icon. Remove only the dark flat rectangular background OUTSIDE the large rounded-square glass tile. Output genuine alpha transparency in the four outer corners and the narrow border outside the rounded tile. Keep the complete original rounded-square dark teal glass tile, its mint edge glow, and the luminous mint spade inside it. Preserve the exact original spade silhouette, orientation, color gradients, proportions, placement and lighting. Do not redraw, add symbols, text, shadows, or new elements. This is a precise background cutout for a mobile splash screen. Center the same tile in the square canvas with a small transparent margin. No opaque black rectangular matte.

输出经尺寸缩小与 PNG 无损压缩后入库，SHA-256 为 `0b323f1bafcf410f5a5b76394f3916b8fd43082f841b2bacfa34b3d8560ce4b0`。Android 的系统启动图使用独立透明 `launch_artwork`，iOS 背景图从该素材合成。微信系统级启动页不由仓库控制，其后的小程序首屏使用同一素材。

Web/App 的启动图与关键样式在 HTML 内声明，不等待游戏 CSS。全部游戏样式由 `src/styles/app.js` 异步加载；平台偏好、语言、首手和布局完成后一次揭开牌桌。隐藏规则覆盖所有子元素，防止拥有 `visibility: visible` 的指南标题穿透隐藏祖先。

iOS 在系统启动图结束后继续显示原生透明图标遮罩，直到本地 WebView 的主文档发出 `data-app-ready` 就绪通知后移除。通知核对实际 WebView 的本地 URL；不依赖自定义 scheme 下可能为空的 frame request URL，也不使用固定时长来掩盖加载。原生层沿用同一份本地 PNG，不访问远程素材。

生产构建专项不注入牌局或 QA 接口，分别延迟真实构建入口和 CSS，验证冷启动、刷新、窄屏和宽屏：

```sh
npm run build
node tests/production/startup.mjs .artifacts/startup-polish/production
```

该专项使用独立预览端口 4193，保留启动图、样式等待与完整牌桌的原始截图；不能代替手机系统启动过程的录像或实体设备验收。
