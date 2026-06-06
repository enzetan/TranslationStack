# TranslationStack Video Intro Script

## Main Version, About 2-3 Minutes

Hi everyone, I am the creator of TranslationStack.

This is my first open-source project. I am a developer, and English is not my first language, so I will keep this simple and practical.

TranslationStack started from one problem I kept seeing:

AI can translate a short paragraph pretty well. But long-form translation is a different problem.

When we translate a book, a long article, a manual, or any serious document, we need more than a good answer in chat.

We need consistency.

We need the same term to use the same translation.

We need style decisions to survive after the chat window is closed.

We need reviewer comments to point to stable places in the document.

And we need a way to revise, validate, and export the work without losing context.

That is why I built TranslationStack.

The main idea is:

Long-form translation should be a project, not a prompt.

TranslationStack is not a translation model. It is not a translation API wrapper.

It is a contract-first workflow for AI translation agents.

The agent still does the translation work. But TranslationStack defines what must be remembered, reviewed, and validated.

For example, a TranslationStack project has files for the original source, semantic chunks, glossary, style guide, review issues, revision history, translation memory, and export QA.

Everything important is written to disk.

So if I come back tomorrow, or if another agent continues the work, the project still has memory. It does not depend only on chat history.

For the current MVP, I made one very clear choice: support clean Markdown first.

That means headings, paragraphs, lists, block quotes, code blocks, and simple inline markers.

I know people want DOCX, PDF, and more complex formats. I want them too. But I do not want to build format adapters before the core contract is stable.

So the first version is intentionally small. It focuses on the workflow, the project structure, and validation.

My goal is to make AI translation feel less like a one-time chat result, and more like professional translation work that can be resumed, audited, revised, and shared.

If this sounds useful to you, please check out TranslationStack on GitHub.

This is my first open-source project, so feedback is very valuable to me.

If you like the idea, please give my repo a star. If you find a problem, open an issue. Feedback is very welcome.

Thank you.
