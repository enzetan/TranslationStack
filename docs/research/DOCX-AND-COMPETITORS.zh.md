# DOCX 技术路线与长文翻译产品调研

本文是公开版调研摘要，服务于 TranslationStack 的产品和技术取舍。

重点不是复述竞品功能，而是回答两个问题：

1. TranslationStack 将来如何接入 DOCX 等复杂格式？
2. 哪些长文翻译工作流机制值得吸收，哪些产品形态不应照搬？

所有第三方库版本、许可证和生态活跃度在采用前都应重新核验。本文不保留会快速过期的 star 数、实时版本号或本地实验数据。

## 总结论

TranslationStack 不应该自研 DOCX/XML/HTML 底层格式解析器，也不应该变成普通翻译 app。

推荐分工：

```text
成熟格式库负责格式事实
  - DOCX packaging
  - HTML / XML / Markdown parsing
  - style map
  - footnote / image / table / list
  - DOCX serialization

TranslationStack 负责翻译事实
  - stable source anchor
  - semantic chunk
  - glossary hash
  - style hash
  - translation memory
  - review issue
  - impact analysis
  - revision patch
  - export QA
```

竞品证明“双语对照成品”“长任务续跑”“术语一致性”“局部重译”都有真实需求。TranslationStack 的差异应该是：用户在 review HTML 里改一个词或提出一个建议后，系统能把反馈转成结构化事实，分析影响范围，并只修订受影响的地方。

## DOCX 路线

### 推荐方向

未来 DOCX adapter 可以采用：

- DOCX import：优先使用成熟语义导入库，例如 `mammoth`
- DOCX export：优先使用 JS/TS 原生生成库，例如 `docx`
- Pandoc：作为可选高级 adapter，而非默认内核
- LibreOffice / platform converter：作为应急转换或人工辅助，不进入正式质量链路
- Python 生态：可作为诊断或 fallback，不作为 Bun 本地 MVP 默认依赖

一句话：

> DOCX adapter 把 Word 文档转成可审校的语义流；TranslationStack 自己管理 segment、chunk、glossary、style、memory 和 review；最终再生成 clean DOCX。

### Import 边界

DOCX import 的目标不是 round-trip mutation，而是提取可翻译语义：

```text
DOCX -> semantic HTML / AST -> sanitize -> TranslationStack source anchors
```

导入层必须明确记录：

- 哪些结构被保留
- 哪些结构被降级
- 哪些内容无法安全导入
- 哪些 anchor 可以回溯

### Export 边界

DOCX export 的目标是 clean semantic DOCX，而不是保留任意复杂 Word 版式。

```text
TranslationStack IR -> clean semantic DOCX -> export manifest -> export QA report
```

公开叙事里不应承诺：

- 原 DOCX 就地修改
- 完美版式保真
- 复杂表格、批注、域代码、宏、修订模式完整 round-trip

### Pandoc 定位

Pandoc 生态成熟，适合作为高级 adapter 或用户自带依赖。但它不应成为默认内核，原因是：

- 外部二进制增加安装和调试成本
- AST 转换可能重排或丢失 TranslationStack 需要的审校 anchor
- 许可证和分发策略需要单独评估

### 不建议的路线

- 手写 OOXML：成本高、边界多，会把产品拖回格式工程。
- HTML-to-DOCX 作为核心：适合 clean export，不适合作为 truth layer。
- 黑盒转换链路：无法支撑 segment-level review、impact analysis 和 export QA。

## 竞品机制

以下项目代表了不同方向的长文翻译实践：

- `bilingual_book_maker`
- `epub-translator`
- `book-translator`
- `TranslateBooksWithLLMs`
- `ai-novel-translation`

这些项目的价值在于验证需求和机制，不在于给 TranslationStack 提供产品壳。

## 值得吸收的机制

### 双语预览

长文翻译需要天然支持多种预览方式：

- side-by-side
- stacked
- translated-only
- source-with-translation-after-block

TranslationStack 应把 preview 当成 review interface，而不是只当成最终导出样式。

### Checkpoint / Resume

长文翻译任务会中断。可恢复状态是基础能力。

需要沉淀：

- source anchor
- chunk state
- translated chunk
- failed chunk
- run artifact
- export manifest

### Context Planning

一致性不应该只靠一句 prompt。

较稳的路线是：

1. 先分析文档结构和上下文
2. 抽取术语候选
3. 建立风格样例
4. 翻译时注入相关 glossary 和 context
5. 审校后更新项目事实

### Glossary Auto-Extract

术语自动抽取有价值，但不能直接全局生效。

推荐流程：

```text
candidate -> user review -> confirmed / rejected -> applied with impact analysis
```

只向当前 chunk 注入相关术语，避免把整本 glossary 直接塞进每次请求。

### Local Retranslation

局部重译是核心需求。

不要用字符串 range 定位。应该使用：

```text
segment_id / chunk_id
  -> issue
  -> impact analysis
  -> revision patch
  -> user approval
  -> regenerate preview / export
```

### Stage Visibility

用户需要知道译文处于哪个阶段：

```text
source -> draft -> reviewed -> revised -> exported
```

TranslationStack 的状态机应比“进度条百分比”更重要。

## 不应照搬的形态

### 不做传统翻译 app

TranslationStack 的核心不是桌面 UI、Docker 部署、多 provider 配置页或任务队列管理台。那些是可选外壳，不是产品差异。

### 不把格式文件当 truth

EPUB、DOCX、HTML 都可以是 import/export adapter，但不应成为项目 truth。

Truth 应该在：

- source anchor
- chunk manifest
- glossary
- style guide
- review issue
- revision record
- memory
- export QA

### 不承诺 perfect preservation

公开表述应避免“完美保留格式”。更诚实也更专业的承诺是：

> preserve semantic structure where the adapter can prove it, and report degradation explicitly.

### 不把 API key 配置作为卖点

多 provider 和 key 管理不是 TranslationStack 的核心卖点。核心卖点是长文档翻译项目的持久一致性。

## 对 TranslationStack 的设计要求

调研结论反推产品要求：

1. 文件即真相，而不是聊天上下文即真相。
2. 语义 chunk 优先，机械 sentence/token split 次之。
3. 术语和风格必须外部化、可 diff、可确认。
4. Review HTML 必须是工作台，而不是静态展示页。
5. 所有用户反馈都应写成 issue 或 revision。
6. 术语/风格变化必须触发 impact analysis。
7. 导出必须有 QA report。
8. 复杂格式必须以 adapter 形式进入，不污染核心协议。

## 推荐公开表述

英文：

> TranslationStack does not try to be a better translator than the model. It gives the model a project contract: stable anchors, glossary memory, review issues, revision history, and export checks.

中文：

> TranslationStack 不和模型比谁更会翻译。它给模型一套专业翻译项目契约，让术语、风格、审校和修订都能沉淀为可验证的项目资产。
