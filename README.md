# Awalon · 阿瓦隆 Android App

阿瓦隆线下桌游助手的 Android 版本。应用采用本地单机主持模式，不依赖云函数，适合使用一台 Android 设备完成身份查看、任务推进、手机投票和最终结算。

## 功能

- 支持 5–15 人对局，并按人数加载角色阵容与任务配置。
- 支持梅林、派西维尔、忠臣、莫甘娜、刺客、莫德雷德、奥伯伦、湖中仙女、兰斯洛特等角色。
- 支持 9 人局手动选择 3 坏 / 4 坏或随机坏人数量。
- 手机投票默认开启，车上成员可依次使用同一台设备投票，房主负责开票。
- 支持线下组队、房主手动记录任务成功或失败。
- 支持长按已有任务车编辑成员、设置车长，以及修改失败任务的炸弹数量。
- 好人完成三次任务后自动进入刺杀阶段，刺客或房主可以选择刺杀目标。
- 支持湖中仙女阵营查验与查验权传递、兰斯洛特忠诚值变化。
- 支持连续对局角色重洗、特殊身份保护和隐藏的坏人连续局保护逻辑。
- 支持身份卡、角色说明、头像编号、昵称和密码等线下传递设备功能。

## 项目结构

- `app/src/main/assets/app.js`：Android 端游戏流程和交互逻辑。
- `app/src/main/assets/avalon_rules.js`：角色、技能、阵营和任务规则配置。
- `app/src/main/assets/index.html`、`styles.css`：App 页面结构和样式。
- `app/src/main/java/com/avalon/offline/MainActivity.java`：Android 容器 Activity。
- `app/src/main/res/`：应用图标和 Android 资源。

## 构建

在 Android Studio 中打开项目根目录，或在 PowerShell 执行：

```powershell
.\gradlew.bat :app:assembleDebug
```

生成的 APK 位于：

```text
app/build/outputs/apk/debug/
```

## 说明

当前版本是本地线下主持版，不包含多人云端房间功能。角色和任务规则以 `app/src/main/assets/avalon_rules.js` 为准。
