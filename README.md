# 福建农林大学园艺学院院运会计分系统 Skill

本包把院运会计分台的业务规则、名单核对、开发与现场部署经验整理为可复用技能，并附匿名运行示例。不是学校官方发布，也不包含真实名单、真实成绩或历史访问口令。不需要生图 API、API Key 或任何个人账号。

## 安装和调用

将 ZIP 解压，保留整个 `fafu-horticulture-sports-scoring` 文件夹。把它放到所用助手支持的技能目录；Codex 使用配置的 `CODEX_HOME/skills/`。若要求全部保存在 D 盘，先通过客户端支持的设置确认技能目录在 D 盘，再安装；本包不会更改当前配置或自动写入其他磁盘。

调用示例：

> 使用 $fafu-horticulture-sports-scoring，依据我提供的当届规程和匿名报名表，搭建院运会计分台。先确认计分规则和共享范围，所有文件放在指定工作目录。

> 使用 $fafu-horticulture-sports-scoring，指导我让电脑临时作为服务器，分别说明本机、同一 Wi-Fi 和外网的访问方法。

## 直接试用示例

1. 准备 Node.js 20 或更新版本（`node --version` 可检查）。
2. 将 `assets/starter/` **复制**到 D 盘自己的工作目录，不直接在技能原件里录真实成绩。
3. 在该副本打开 PowerShell：`powershell -NoProfile -File .\StartScoreboard.ps1`。
4. 按控制台提示，打开副本 `data/private-links.txt` 中的本机录入入口。访问口令首次运行随机生成，只存本机；文件不要公开。
5. 示例只有虚构选手编号和代表队，没有真实成绩。用完在启动窗口按 Ctrl+C 停止。

默认只有本机能访问。局域网和外网部署、口令处理、电脑休眠限制见 `references/temporary-server.md`。更换名单必须在比赛前停服、备份并核对ID，不能把新 seed 直接覆盖在旧成绩库上。

## 包内内容

- `SKILL.md`：助手的技能入口。
- `references/`：计分、名单、系统设计、服务器、排错及隐私验收。
- `assets/starter/`：匿名计分台源码、PowerShell启动入口、分享链接生成器。
- `scripts/verify-starter.mjs`：隔离验证匿名计分与API行为；不接触现场数据。

示例支持已有规则及100米预赛/决赛，不承诺任意赛事赛制。其他轮次、新项目、接力个人积分分配和新增奖项需另行确认与开发。最佳组织奖不自动评定。不要将此 ZIP 中的示例视为完整真实赛事数据库。
