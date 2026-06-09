export const VALID_STATES = [
  "planned",
  "pending",
  "translated",
  "reviewing",
  "reviewed",
  "stale",
  "blocked",
  "exported",
];

export const VALID_TRANSITIONS = {
  planned: ["pending", "blocked"],
  pending: ["translated", "blocked"],
  translated: ["reviewing", "reviewed", "stale", "blocked"],
  reviewing: ["reviewed", "translated", "stale", "blocked"],
  reviewed: ["exported", "stale", "reviewing"],
  stale: ["translated", "blocked"],
  blocked: ["planned", "pending", "translated", "reviewing"],
  exported: ["stale"],
};

export const VALID_TERM_STATUSES = ["confirmed", "proposed", "rejected"];
export const VALID_ISSUE_TYPES = [
  "term",
  "style",
  "accuracy",
  "omission",
  "addition",
  "marker",
  "format",
  "scripture_reference",
  "readability",
  "theological_precision",
];
export const VALID_ISSUE_STATUSES = ["open", "resolved", "rejected", "closed"];
export const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
export const VALID_CREATED_BY = ["ai", "user", "system"];
export const VALID_SCOPES = ["global", "book", "chunk", "segment", "project"];
export const FINAL_EXPORT_BLOCKING_ISSUE_TYPES = [
  "term",
  "scripture_reference",
  "accuracy",
  "omission",
  "addition",
  "marker",
  "readability",
];
export const MEDIUM_OR_HIGHER_SEVERITIES = ["medium", "high", "critical"];
export const VALID_PHASES = ["pretranslate", "translate", "review", "final"];
export const VALID_EXECUTION_MODES = ["sub-agent", "dynamic-workflow"];
export const VALID_RUN_TYPES = [
  "source_understanding",
  "translate",
  "draft_qa",
  "pre_review",
  "review",
  "export",
  "workflow",
];
export const VALID_REUSABLE_ASSET_TYPES = [
  "confirmed_glossary",
  "rejected_terms",
  "style_guide",
  "style_samples",
  "translation_memory",
  "citation_reference_policy",
  "domain_profile",
  "project_brief",
];
export const VALID_REUSABLE_IMPORT_STATUS = ["proposal", "trusted_by_user"];
export const VALID_REVISION_OPS = [
  "set_translation",
  "set_term",
  "set_style",
  "set_state",
  "resolve_issue",
  "set_issue_status",
  "update_manifest",
];

export const CHUNK_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)*$/;
export const STATES_REQUIRING_TRANSLATION = ["translated", "reviewing", "reviewed", "stale", "exported"];
export const EXPORTABLE_STATES = ["reviewed", "exported"];
export const YAML_BLOCK_SCALAR_PATTERN = /^[|>][+-]?\d*$/;
