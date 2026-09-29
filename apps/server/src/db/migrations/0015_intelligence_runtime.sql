-- 0015_intelligence_runtime.sql
-- Production SQLite schema for Nexus Intelligence Layer:
-- Skills (Versioned & Candidates), Memory (Scoped, Typed, Candidates & Relations),
-- Global Rules, Knowledge Documents, Import Deduplication, and Context Snapshots.

-- 1. Versioned Skills
CREATE TABLE IF NOT EXISTS intelligence_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_version TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'USER_UPLOADED',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  project_id TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_skills_status ON intelligence_skills(status);
CREATE INDEX IF NOT EXISTS idx_intel_skills_project ON intelligence_skills(project_id);

CREATE TABLE IF NOT EXISTS intelligence_skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  steps_json TEXT NOT NULL DEFAULT '[]',
  tools_json TEXT NOT NULL DEFAULT '[]',
  parameters_json TEXT NOT NULL DEFAULT '{}',
  preconditions_json TEXT NOT NULL DEFAULT '[]',
  success_conditions_json TEXT NOT NULL DEFAULT '[]',
  error_handling_json TEXT NOT NULL DEFAULT '{}',
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'USER_UPLOADED',
  hash TEXT NOT NULL,
  changelog TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES intelligence_skills(id) ON DELETE CASCADE,
  UNIQUE(skill_id, version)
);

CREATE INDEX IF NOT EXISTS idx_intel_skill_versions_skill ON intelligence_skill_versions(skill_id);

CREATE TABLE IF NOT EXISTS intelligence_skill_candidates (
  candidate_id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  proposed_by TEXT NOT NULL DEFAULT 'WebAI/GPT',
  extracted_steps_json TEXT NOT NULL DEFAULT '[]',
  tools_json TEXT NOT NULL DEFAULT '[]',
  parameters_json TEXT NOT NULL DEFAULT '{}',
  preconditions_json TEXT NOT NULL DEFAULT '[]',
  success_conditions_json TEXT NOT NULL DEFAULT '[]',
  error_handling_json TEXT NOT NULL DEFAULT '{}',
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CANDIDATE',
  review_notes TEXT,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_skill_candidates_status ON intelligence_skill_candidates(status);

CREATE TABLE IF NOT EXISTS intelligence_skill_validations (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version TEXT,
  validation_status TEXT NOT NULL,
  report_json TEXT NOT NULL,
  validated_at INTEGER NOT NULL
);

-- 2. Scoped, Typed & Provenance Memory Runtime
CREATE TABLE IF NOT EXISTS intelligence_memories (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'FACT',
  scope TEXT NOT NULL DEFAULT 'PROJECT',
  scope_id TEXT,
  importance REAL NOT NULL DEFAULT 5.0,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT 'USER',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  relations_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_memories_scope ON intelligence_memories(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_intel_memories_type ON intelligence_memories(type);
CREATE INDEX IF NOT EXISTS idx_intel_memories_status ON intelligence_memories(status);
CREATE INDEX IF NOT EXISTS idx_intel_memories_key ON intelligence_memories(key);

CREATE TABLE IF NOT EXISTS intelligence_memory_candidates (
  candidate_id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'EXPERIENCE',
  scope TEXT NOT NULL DEFAULT 'PROJECT',
  scope_id TEXT,
  importance REAL NOT NULL DEFAULT 5.0,
  confidence REAL NOT NULL DEFAULT 0.8,
  source TEXT NOT NULL DEFAULT 'ACTION',
  provenance_json TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'CANDIDATE',
  review_notes TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_mem_candidates_status ON intelligence_memory_candidates(status);

-- 3. Global Rule Registry
CREATE TABLE IF NOT EXISTS intelligence_rules (
  rule_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'GLOBAL',
  scope_id TEXT,
  priority TEXT NOT NULL DEFAULT 'USER_GLOBAL',
  priority_rank INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version INTEGER NOT NULL DEFAULT 1,
  tags_json TEXT NOT NULL DEFAULT '[]',
  provenance_json TEXT NOT NULL DEFAULT '{"source":"user"}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_rules_scope ON intelligence_rules(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_intel_rules_priority ON intelligence_rules(priority_rank);
CREATE INDEX IF NOT EXISTS idx_intel_rules_status ON intelligence_rules(status);

-- 4. Knowledge Documents & Import History
CREATE TABLE IF NOT EXISTS intelligence_documents (
  document_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'upload',
  content_reference TEXT,
  text_summary TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_docs_hash ON intelligence_documents(file_hash);

CREATE TABLE IF NOT EXISTS intelligence_knowledge_imports (
  import_id TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  detected_type TEXT NOT NULL,
  explicit_type TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  result TEXT NOT NULL,
  registered_id TEXT,
  registered_count INTEGER NOT NULL DEFAULT 1,
  errors_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_imports_hash ON intelligence_knowledge_imports(file_hash);

-- 5. Context Snapshots & Compactions
CREATE TABLE IF NOT EXISTS intelligence_context_snapshots (
  context_id TEXT PRIMARY KEY,
  task_id TEXT,
  session_id TEXT,
  project_id TEXT,
  goal TEXT,
  snapshot_json TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_snapshots_task ON intelligence_context_snapshots(task_id);

CREATE TABLE IF NOT EXISTS intelligence_context_compactions (
  compaction_id TEXT PRIMARY KEY,
  context_id TEXT,
  task_id TEXT,
  original_tokens INTEGER NOT NULL,
  compacted_tokens INTEGER NOT NULL,
  compaction_state_json TEXT NOT NULL,
  compacted_at INTEGER NOT NULL
);
