# TranslationStack 设计文档

## 定位

TranslationStack 是一套面向长文档翻译的 **contract-first AI translation protocol**。

它不试图替代模型、翻译平台、CAT/TMS 或文档排版系统。它定义的是 AI agent 在执行长文档翻译时必须沉淀下来的项目资产：

- 源文档锚点
- 语义 chunk
- 术语表
- 风格指南
- 翻译记忆
- 审校 issue
- 修订记录
- 导出 QA
- 可验证的项目状态

一句话：

> TranslationStack 让长文档翻译从一次性模型输出，变成可恢复、可审校、可复用、可传播的项目。

## 核心判断

模型越来越擅长翻译、总结、拆分上下文、生成 HTML、执行局部修订和调用工具。TranslationStack 不应该和模型竞争这些执行能力。

TranslationStack 应该保留模型天然不稳定的部分：

- 项目记忆
- 术语约束
- 风格约束
- 状态机
- 审校记录
- 修订历史
- 影响范围分析
- 导出前校验

因此，本项目的设计原则是：

```text
model does the work
TranslationStack defines the work
files are the durable truth
validation protects the contract
```

## 产品边界

TranslationStack 是：

- 一个 AI agent 可读取和执行的 skill package
- 一套长文档翻译项目协议
- 一个本地文件系统上的持久项目结构
- 一个面向审校和传播的静态 HTML review 模板
- 一个无第三方依赖的项目 validator

TranslationStack 不是：

- 完整 CAT/TMS
- 翻译 API wrapper
- 模型 provider
- 固定 agent runtime
- 文档解析引擎
- DOCX/PDF 排版保真系统
- 多人协作平台

## MVP 范围

当前 MVP 只支持 clean Markdown。

允许：

- 标题
- 段落
- 普通列表
- 引用块
- fenced code block
- agent 提供的简单 inline marker

暂不支持：

- Pandoc Markdown extensions
- DOCX
- PDF
- EPUB
- LaTeX
- citation / bibliography
- 复杂表格保真
- 文档格式转换

这个边界是刻意的。MVP 的目标是验证项目协议，而不是过早进入复杂格式适配。

## 架构

```text
TranslationStack
├── Skill
│   └── agent 行为 contract
├── Protocol
│   ├── contract.md
│   ├── state-machine.md
│   ├── chunking-rules.md
│   ├── glossary-rules.md
│   ├── style-rules.md
│   └── export-rules.md
├── Validator
│   └── validate.mjs
└── Templates
    └── review.html
```

### Skill

`skills/translationstack/SKILL.md` 是 agent 入口。它告诉 agent：

- 什么时候应该使用 TranslationStack
- 哪些源格式属于 MVP 范围
- 如何创建 `.translationstack/<project-id>/`
- 哪些节点必须暂停询问用户
- 如何记录术语、风格、译文、issue、revision 和 export QA
- 如何运行 validator

### Protocol

`skills/translationstack/protocol/` 是项目协议。它不规定唯一执行路径，只规定 durable output 必须满足的 contract。

这意味着 agent 可以自由决定如何拆 chunk、如何调用模型、如何审校和修订，但最终项目文件必须可验证。

### Validator

`skills/translationstack/scripts/validate.mjs` 只做 contract validation：

- 不翻译
- 不调用模型
- 不修改项目文件
- 不依赖 `package.json`
- 不要求 `npm install`

它的作用是把 TranslationStack 从“好提示词”变成“可检查的项目协议”。

### Review Template

`skills/translationstack/templates/review.html` 是静态审校模板。它用于生成 `export/review.html`，让译文以双语、可浏览、可传播的形式呈现。

## 项目结构

每个翻译项目写入 `.translationstack/<project-id>/`：

```text
.translationstack/<project-id>/
├── project.yaml
├── source/
│   └── original.md
├── chunk_manifest.yaml
├── glossary/
│   ├── glossary.yaml
│   └── glossary_proposals.jsonl
├── style/
│   └── style_guide.yaml
├── translations/
│   └── chunks/
├── review/
│   ├── issues.jsonl
│   └── revisions.jsonl
├── memory/
│   └── translation_memory.jsonl
├── export/
│   ├── review.html
│   ├── output.md
│   ├── export_manifest.json
│   └── export_qa_report.json
└── runs/
```

## Durable Truth

TranslationStack 的持久真相在文件中，不在聊天历史中。

| 资产 | 作用 |
|---|---|
| `project.yaml` | 项目身份、语言方向、领域、翻译策略、审校策略 |
| `source/original.md` | 原文快照 |
| `chunk_manifest.yaml` | 语义 chunk、覆盖范围、状态 |
| `glossary/glossary.yaml` | 已确认术语规则 |
| `glossary/glossary_proposals.jsonl` | 待确认术语候选 |
| `style/style_guide.yaml` | 风格策略和样例 |
| `translations/chunks/*.jsonl` | chunk 级译文 |
| `review/issues.jsonl` | AI 或人工审校 issue |
| `review/revisions.jsonl` | 修订、状态变化、术语变更记录 |
| `memory/translation_memory.jsonl` | 可复用翻译记忆 |
| `export/*` | review HTML、最终输出和导出 QA |
| `runs/*` | 可选执行记录 |

## 推荐工作流

TranslationStack 不强制唯一 pipeline，但推荐以下顺序：

1. 初始化项目目录
2. 确认源文件属于 MVP 范围
3. 写入 `project.yaml`
4. 复制原文到 `source/original.md`
5. 生成语义 `chunk_manifest.yaml`
6. 运行 validator 修复覆盖和状态问题
7. 抽取术语候选
8. 让用户确认核心术语和风格方向
9. 按语义 chunk 翻译
10. 生成 AI 预审 issue
11. 生成 `export/review.html`
12. 根据审校意见写入 `review/revisions.jsonl`
13. 对术语、风格、源文变更运行影响分析
14. 导出 `export/output.md`
15. 写入 `export/export_manifest.json` 和 `export/export_qa_report.json`
16. 再次运行 validator

## 状态机

合法状态：

```text
planned
pending
translated
reviewing
reviewed
stale
blocked
exported
```

含义：

| State | Meaning |
|---|---|
| `planned` | chunk 已声明，但覆盖范围尚未验证 |
| `pending` | chunk 已准备好翻译 |
| `translated` | 已有译文，但未完成审校 |
| `reviewing` | 审校中，或存在 open issue |
| `reviewed` | 审校通过，可按 policy 导出 |
| `stale` | 术语、风格、源文或上下文变更后需要复查 |
| `blocked` | 需要用户决策或 contract 修复 |
| `exported` | 已进入某次导出 |

关键规则：

- 不翻译 `planned` chunk。
- 不导出 `pending`、`blocked` 或 `stale` chunk。
- `blocked` 必须暂停并询问用户。
- `stale` 不是失败，而是精准修订的入口。
- 术语、风格或源文发生全局变化时，先做影响分析，再修订。

## Chunking

TranslationStack 使用大语义 chunk 进行翻译，小 segment 作为可选审校锚点。

原则：

```text
完整意义 > 固定长度
章节结构 > token 数量
论证连续性 > 并行便利
局部修订 > 句子级机器翻译
```

推荐 chunk：

- 一个完整小节
- 一个标题及其正文
- 一个完整论证单元
- 一个表格及其解释
- 一个引文及其评述
- 一组连续段落

避免：

- 一句一翻
- 固定 token 窗口
- 标题和正文拆开
- 定义和解释拆开
- 表格和上下文拆开

## Glossary

术语表是项目级规则，不是 prompt 附件。

示例：

```yaml
terms:
  - source: context window
    target: 上下文窗口
    status: confirmed
    scope: global
    origin: user
    note: 技术术语，保持全书一致。
```

规则：

- `confirmed` 术语必须遵守。
- `proposed` 术语不能自动全局生效。
- `rejected` 术语不能被反复作为默认建议引入。
- 核心术语有歧义时必须询问用户。
- 已使用术语发生变化时必须做影响分析。

## Style

风格是持久资产，不是临时语气描述。

示例：

```yaml
style:
  strategy: faithful_readable
  register: formal
  tone: professional
  sentence_structure: moderate

preferences:
  prefer:
    - 保留论证链条
    - 技术名词稳定
  avoid:
    - 过度口语化
    - 为了顺滑而删改原意
```

规则：

- 风格不清楚时先让用户选择或确认。
- 风格样例应写入 `style_guide.yaml`。
- 风格变化后，相关 chunk 必须标记为 `stale` 或进入复查。

## Review 和 Revision

审校 issue 必须有稳定目标。

`review/issues.jsonl` 应记录：

- issue id
- target chunk 或 segment
- severity
- category
- source
- note
- status

`review/revisions.jsonl` 应记录：

- 修订类型
- target id
- before / after
- reason
- actor
- created_at

这样做的目的不是制造繁琐流程，而是让 reviewer 的一句反馈可以变成可追踪、可复用、可回放的项目事实。

## Impact Analysis

TranslationStack 的关键差异之一是影响范围分析。

当以下资产变化时：

- confirmed glossary
- style guide
- source text
- chunk coverage
- review decision

agent 必须先判断哪些 chunk 受影响，然后把它们标记为 `stale` 或生成 revision plan。

目标不是“重翻整本书”，而是：

```text
change one project fact
find affected chunks
revise only what changed
keep the rest untouched
```

## Export

导出是状态 checkpoint，不是简单拼接。

默认导出 policy：

```yaml
export_policy:
  allow_pending: false
  allow_blocked: false
  allow_stale: false
  allow_open_high_issues: false
  allow_unreviewed: false
```

导出前必须检查：

- 所有必需 chunk 都有译文
- 没有 `blocked` chunk
- 没有 `stale` chunk
- 没有 high-severity open issue
- 没有未确认核心术语
- 没有 marker mismatch
- 没有 source coverage gap
- 没有重复 chunk id
- 没有空译文

如果用户明确要求 draft export，可以生成草稿，但必须在 `export/export_qa_report.json` 中记录 draft 状态和风险。

## Marker 和代码规则

Inline marker 是承载格式和结构的占位符，例如：

```text
{{m1}}important{{/m1}}
<x id="term-1"/>
```

规则：

- 保留 marker set。
- 保留 marker count。
- 保留 marker order。
- 保留 marker balance。
- 不翻译 YAML/JSON key。
- 不翻译代码 fence 内的结构。
- 不改 CLI flag、placeholder、marker token。

## 验证

运行：

```bash
bun skills/translationstack/scripts/validate.mjs .translationstack/<project-id>
```

Node fallback：

```bash
node skills/translationstack/scripts/validate.mjs .translationstack/<project-id>
```

validator error 是 blocker。warning 可以存在，但必须报告。

## 传播表达

面向外部介绍时，TranslationStack 应避免被描述成：

- 翻译 prompt
- 翻译脚本
- 又一个 MT wrapper
- 轻量 CAT 工具

更准确的表达是：

> TranslationStack is a file-backed protocol that makes AI translation reviewable, resumable, and revisable across long documents.

中文表达：

> TranslationStack 让 AI 长文档翻译拥有项目记忆、审校锚点和可验证的交付状态。
