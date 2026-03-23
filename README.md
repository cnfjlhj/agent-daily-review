# Agent Daily Review

每天睡前，自动扫一遍你当天用过的 Codex / Claude Code 会话，告诉你：今天到底干了什么，哪些是有效产出，哪些是在转圈。

生成一份 HTML 报告，可以发到 Telegram，也可以本地看。

## 它回答什么问题

不是 token 用量统计，不是 API 调用计数。是更实在的东西：

- 今天通过 vibe coding 实际推进了什么？
- 哪些会话产出了真正的代码/文档？
- 哪些会话只是在兜圈子、跑题、或者注意力分散？
- 哪里是我用错了 Agent？哪里是 Agent 自己答得不好？
- 明天最该改掉的一个习惯是什么？

## 工作原理

```
你设定的目标
     |
     v
当天实际会话活动
     |
     v
最终着陆点
     |
     ├── 和目标一致     → 有效产出
     ├── 夹杂副话题     → 会话卫生警告
     └── 完全偏离       → 漂移 / 边界失守
```

核心判断逻辑：

- 一个会话应该只做一件事
- 多个主题挤进同一个会话 = 工作流异味
- 会话归属看活动时间，不看创建时间
- 短会话如果消耗了注意力或改变了方向，一样计入

## 你会得到什么

| 产物 | 说明 |
|------|------|
| `report.html` | 可读的每日复盘报告 |
| `report.json` | 机器可读版本，方便二次加工 |
| Telegram 推送 | 完整 HTML 直接发到手机（可选） |
| 定时任务 | 每晚 23:30 自动跑（可选） |
| Codex Skill | 装好就能手动触发预览或重跑 |

## 快速上手

```bash
npm install
cp agent-daily-review.example.json agent-daily-review.local.json
# 编辑配置：至少填 homeDir 和 outRoot
```

跑一天试试：

```bash
npm run daily -- --config ./agent-daily-review.local.json --date 2026-03-24
```

不发 Telegram，只看本地：

```bash
npm run nightly -- --config ./agent-daily-review.local.json --dry-run
```

## 定时任务

装上以后每晚自动跑：

```bash
npm run install-cron -- --config "$(pwd)/agent-daily-review.local.json"
```

卸载：

```bash
npm run install-cron -- --remove
```

## 三种分析模式

| 模式 | 特点 | 适合场景 |
|------|------|----------|
| `heuristic` | 纯规则，快且稳 | 每晚 cron 自动跑 |
| `auto` | 规则优先，必要时语义补充 | 日常使用 |
| `compact-first` | 语义阅读为主 | 长会话深度分析 |

## Telegram 推送

三种投递方式：

- **direct**：命令行传 `--bot-token` 和 `--chat-id`
- **config**：写在 JSON 配置里
- **cc-connect**：复用已有的会话级 Telegram 通道

## 时区处理

按 `Asia/Shanghai` 自然日切片：

- 昨天创建但今天又用了的会话 → 算今天的
- 只统计今天的活动部分
- 跨天会话在附录里标注为 `跨天续用`

## 项目结构

```
src/utils/                  核心分析逻辑
scripts/agent-daily-review/ CLI 入口和 cron 工具
scripts/telegram/           Telegram HTML 发送
skills/agent-daily-review/  打包好的 Codex Skill
tests/                      测试套件
```

## 测试

```bash
npm test
```

覆盖：日切片、跨天处理、短会话、混合话题检测、HTML 渲染、dry-run、Telegram dry-run、cron 安装。

## License

MIT
