/**
 * Single Source of Truth: Canonical Tool Registry for Nexus (332 Tools)
 *
 * Every Registry view (Capability Registry, Unified Tool Registry, Runner Callable Registry,
 * MCP Exposure, Scope Policy, Tool Annotations, Provider Map, Verification Matrix) derives
 * directly from this Canonical Tool Registry.
 */

export interface JSONSchema7 {
  type?: string | string[];
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean | Record<string, any>;
  description?: string;
  items?: any;
  enum?: any[];
  [key: string]: any;
}

export type CanonicalExecutionMode =
  | "read"
  | "write"
  | "computer"
  | "browser"
  | "document"
  | "git"
  | "process"
  | "network"
  | "agent"
  | "system";

export type CanonicalRiskLevel =
  | "safe"
  | "low"
  | "medium"
  | "high"
  | "destructive";

export type ToolSafetyClassification =
  | "SAFE_READ"
  | "SAFE_WRITE_SANDBOX"
  | "COMPUTER_SANDBOX"
  | "NETWORK_SAFE"
  | "HIGH_RISK"
  | "DESTRUCTIVE"
  | "REQUIRES_CONFIRMATION";

export type ToolPermissionScope =
  | "READ"
  | "WRITE"
  | "EXECUTE"
  | "PROCESS"
  | "NETWORK"
  | "SYSTEM"
  | "DESTRUCTIVE";

export type ToolLifecycleState =
  | "DISCOVERED"
  | "REGISTERED"
  | "SCHEMA_VALID"
  | "PROVIDER_BOUND"
  | "MCP_EXPOSED"
  | "AUTHORIZED"
  | "CALLABLE"
  | "LIVE_EXECUTED"
  | "SIDE_EFFECT_CONFIRMED"
  | "INDEPENDENTLY_VERIFIED"
  | "RECOVERY_VERIFIED";

export interface CanonicalToolDefinition {
  id: string;
  name: string;
  version: string;
  schemaVersion: string;
  providerVersion: string;

  namespace: string;
  category: string;
  description: string;

  inputSchema: JSONSchema7;
  outputSchema?: JSONSchema7;

  providerId: string;
  providerImplementation: string;
  runnerAdapter: string;
  rpcMethod: string;

  executionMode: CanonicalExecutionMode;
  riskLevel: CanonicalRiskLevel;
  safetyClassification: ToolSafetyClassification;
  permissionModel: ToolPermissionScope;
  mcpScope: "read" | "write" | "execute" | "approve";
  permissions: string[];

  supportsDryRun: boolean;
  supportsIdempotency: boolean;
  supportsCancellation: boolean;
  supportsCheckpoint: boolean;
  supportsRecovery: boolean;
  supportsObservation: boolean;

  timeoutMs: number;
  timeout: number;
  enabled: boolean;
  aliases?: string[];
  dependencies?: string[];
}

export interface ToolTestProfile {
  toolId: string;
  fixture: unknown;
  invocation: unknown;
  expectedResult: unknown;
  verificationStrategy:
    | "filesystem"
    | "process"
    | "ui"
    | "png"
    | "docx"
    | "git"
    | "sqlite"
    | "http"
    | "mcp"
    | "custom";
  destructive: boolean;
  requiresConfirmation: boolean;
}

export interface ProviderHealthStatus {
  providerId: string;
  healthy: boolean;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  version: string;
  checkedAt: string;
  details: string;
  toolCount: number;
}

const COMMON_EXECUTION_PROPERTIES: Record<string, any> = {
  taskId: {
    type: "string",
    description: "Optional Agent Task ID to associate this execution with",
  },
  executionId: {
    type: "string",
    description: "Optional Execution ID",
  },
  idempotencyKey: {
    type: "string",
    description: "Optional idempotency key for durable execution",
  },
  failVerification: {
    type: "boolean",
    description: "Simulate verification failure",
  },
  requireScreenChange: {
    type: "boolean",
    description: "Require screen visual delta",
  },
  testScreenHash: {
    type: "string",
    description: "Test pre-state screen hash",
  },
  testPostScreenHash: {
    type: "string",
    description: "Test post-state screen hash",
  },
};

function hydrateDefinition(raw: any): CanonicalToolDefinition {
  const inputSchema: JSONSchema7 = {
    type: "object",
    ...(raw.inputSchema || {}),
    properties: {
      ...((raw.inputSchema && raw.inputSchema.properties) || {}),
      ...COMMON_EXECUTION_PROPERTIES,
    },
  };
  return {
    ...raw,
    schemaVersion: "2026-07-28",
    providerVersion: "1.0.0",
    inputSchema,
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
    supportsObservation: true,
    timeout: raw.timeoutMs,
  };
}

const RAW_CANONICAL_TOOL_DEFINITIONS: any[] = [
  {
    "id": "localbridge_project_list",
    "name": "localbridge_project_list",
    "version": "1.0.0",
    "namespace": "project",
    "category": "project",
    "description": "List all authorized local projects and root drives available to LocalBridge. When Command Safety Layer is disabled, full unrestricted computer filesystem access is enabled, including C盘 (C:\\), all system drives, and unrestricted execution.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.project",
    "providerImplementation": "ServerProjectService + RunnerProjectService",
    "runnerAdapter": "apps/runner/src/rpc/handlers/project.ts",
    "rpcMethod": "server.project.project_list",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "project.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_project_info",
    "name": "localbridge_project_info",
    "version": "1.0.0",
    "namespace": "project",
    "category": "project",
    "description": "Inspect the detailed health, configuration, and access/execution modes of an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.project",
    "providerImplementation": "ServerProjectService + RunnerProjectService",
    "runnerAdapter": "apps/runner/src/rpc/handlers/project.ts -> createProjectInfoHandler",
    "rpcMethod": "project.info",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "project.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_directory_list",
    "name": "localbridge_directory_list",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "List directory contents within an authorized project or host drive (such as C盘 via projectId: 'drive-c') with opaque cursor pagination and security filtering.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string",
          "default": "."
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 200,
          "default": 100
        },
        "cursor": {
          "type": [
            "string",
            "null"
          ]
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createDirectoryListHandler",
    "rpcMethod": "directory.list",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "filesystem.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true,
    "aliases": [
      "filesystem.list",
      "directory.list"
    ]
  },
  {
    "id": "localbridge_file_stat",
    "name": "localbridge_file_stat",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Retrieve metadata (type, size, modifiedAt, accessible) for a file or directory within an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "approvalId": {
          "type": "string",
          "pattern": "^approval_[0-9a-f-]{36}$"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "path"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFileStatHandler",
    "rpcMethod": "file.stat",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "filesystem.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true,
    "aliases": [
      "filesystem.stat",
      "file.stat"
    ]
  },
  {
    "id": "localbridge_file_read",
    "name": "localbridge_file_read",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Read UTF-8 text file content lines with SHA-256 contentHash and pagination bounding from an authorized project or host drive (such as C盘 via projectId: 'drive-c').",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "startLine": {
          "type": "integer",
          "minimum": 1,
          "default": 1
        },
        "maxLines": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 300
        },
        "approvalId": {
          "type": "string",
          "pattern": "^approval_[0-9a-f-]{36}$"
        },
        "sessionId": {
          "type": "string"
        },
        "callerPurpose": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "path"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFileReadHandler",
    "rpcMethod": "file.read",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "filesystem.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true,
    "aliases": [
      "filesystem.read",
      "file.read"
    ]
  },
  {
    "id": "localbridge_file_create",
    "name": "localbridge_file_create",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Create a new file within an authorized project sandbox. Requires read-write access mode. Fails if file already exists.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "content": {
          "type": "string"
        },
        "approvalId": {
          "type": "string",
          "pattern": "^approval_[0-9a-f-]{36}$"
        },
        "sessionId": {
          "type": "string"
        },
        "callerPurpose": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "path",
        "content"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFileCreateHandler",
    "rpcMethod": "file.create",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_file_write",
    "name": "localbridge_file_write",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Atomically overwrite an existing file within an authorized project with optimistic concurrency (expectedHash) verification and automated backup creation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "expectedHash": {
          "type": "string"
        },
        "content": {
          "type": "string"
        },
        "approvalId": {
          "type": "string",
          "pattern": "^approval_[0-9a-f-]{36}$"
        },
        "sessionId": {
          "type": "string"
        },
        "callerPurpose": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "path",
        "expectedHash",
        "content"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFileWriteHandler",
    "rpcMethod": "file.write",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true,
    "aliases": [
      "filesystem.write",
      "file.write"
    ]
  },
  {
    "id": "localbridge_file_patch",
    "name": "localbridge_file_patch",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Apply targeted search-and-replace hunks to an existing file with expectedHash verification and automated backup creation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "expectedHash": {
          "type": "string"
        },
        "replacements": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "search": {
                "type": "string",
                "minLength": 1
              },
              "replace": {
                "type": "string"
              }
            },
            "required": [
              "search",
              "replace"
            ],
            "additionalProperties": false
          },
          "minItems": 1
        },
        "approvalId": {
          "type": "string",
          "pattern": "^approval_[0-9a-f-]{36}$"
        },
        "sessionId": {
          "type": "string"
        },
        "callerPurpose": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "path",
        "expectedHash",
        "replacements"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFilePatchHandler",
    "rpcMethod": "file.patch",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_file_delete",
    "name": "localbridge_file_delete",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Safely delete a file from an authorized project with expectedHash verification and snapshot backup creation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "expectedHash": {
          "type": "string"
        },
        "approvalId": {
          "type": "string",
          "pattern": "^approval_[0-9a-f-]{36}$"
        },
        "sessionId": {
          "type": "string"
        },
        "callerPurpose": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "path",
        "expectedHash"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFileDeleteHandler",
    "rpcMethod": "file.delete",
    "executionMode": "write",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_file_restore",
    "name": "localbridge_file_restore",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Restore a file to an authorized project from a previous operationId snapshot backup.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "operationId": {
          "type": "string",
          "pattern": "^op_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "sessionId": {
          "type": "string"
        },
        "callerPurpose": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "operationId"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFileRestoreHandler",
    "rpcMethod": "file.restore",
    "executionMode": "write",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_fs_delete",
    "name": "localbridge_fs_delete",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Universal structured deletion for files (binary or text) and directories. Supports force deletion without expectedHash and recursive directory tree cleanup with symlink no-follow safety.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string",
          "minLength": 1
        },
        "recursive": {
          "type": "boolean",
          "default": false
        },
        "force": {
          "type": "boolean",
          "default": false
        },
        "expectedHash": {
          "type": "string"
        },
        "workspaceId": {
          "type": "string"
        },
        "approvalId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFsDeleteHandler",
    "rpcMethod": "fs.delete",
    "executionMode": "write",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_fs_move",
    "name": "localbridge_fs_move",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Move or rename a file or directory tree within authorized boundaries.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sourcePath": {
          "type": "string",
          "minLength": 1
        },
        "targetPath": {
          "type": "string",
          "minLength": 1
        },
        "overwrite": {
          "type": "boolean",
          "default": false
        },
        "approvalId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "sourcePath",
        "targetPath"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFsMoveHandler",
    "rpcMethod": "fs.move",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_fs_copy",
    "name": "localbridge_fs_copy",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Copy a file or directory tree within authorized boundaries (supports binaries and recursive trees).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sourcePath": {
          "type": "string",
          "minLength": 1
        },
        "targetPath": {
          "type": "string",
          "minLength": 1
        },
        "recursive": {
          "type": "boolean",
          "default": true
        },
        "overwrite": {
          "type": "boolean",
          "default": false
        },
        "approvalId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "sourcePath",
        "targetPath"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFsCopyHandler",
    "rpcMethod": "fs.copy",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_fs_mkdir",
    "name": "localbridge_fs_mkdir",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Create a directory (and any necessary parent directories) within authorized boundaries.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string",
          "minLength": 1
        },
        "recursive": {
          "type": "boolean",
          "default": true
        },
        "approvalId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFsMkdirHandler",
    "rpcMethod": "fs.mkdir",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_fs_search",
    "name": "localbridge_fs_search",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Search for files and directories recursively by filename pattern, extension, or type within an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "query": {
          "type": "string",
          "minLength": 1
        },
        "path": {
          "type": "string",
          "default": "."
        },
        "maxResults": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 500,
          "default": 100
        },
        "fileExtensions": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "type": {
          "type": "string",
          "enum": [
            "file",
            "directory",
            "all"
          ],
          "default": "all"
        }
      },
      "required": [
        "projectId",
        "query"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFsSearchHandler",
    "rpcMethod": "fs.search",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "filesystem.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_fs_grep",
    "name": "localbridge_fs_grep",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Perform fast streaming text or regex search across project files with match lines and offsets.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "pattern": {
          "type": "string",
          "minLength": 1
        },
        "path": {
          "type": "string",
          "default": "."
        },
        "isRegex": {
          "type": "boolean",
          "default": false
        },
        "caseSensitive": {
          "type": "boolean",
          "default": false
        },
        "fileExtensions": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "maxFiles": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 200,
          "default": 50
        },
        "maxMatchesPerFile": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 50,
          "default": 20
        }
      },
      "required": [
        "projectId",
        "pattern"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFsGrepHandler",
    "rpcMethod": "fs.grep",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "filesystem.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_file_read_stream",
    "name": "localbridge_file_read_stream",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Read large files in bounded streaming byte chunks with offset and SHA-256 verification (avoids memory overflow).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "offsetBytes": {
          "type": "integer",
          "minimum": 0,
          "default": 0
        },
        "maxBytes": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 10485760,
          "default": 1048576
        }
      },
      "required": [
        "projectId",
        "path"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFileReadStreamHandler",
    "rpcMethod": "file.readStream",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "filesystem.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_fs_batch",
    "name": "localbridge_fs_batch",
    "version": "1.0.0",
    "namespace": "filesystem",
    "category": "filesystem",
    "description": "Execute a batch sequence of copy, move, and delete filesystem operations atomically with per-operation error reports.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "operations": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "action": {
                "type": "string",
                "enum": [
                  "copy",
                  "move",
                  "delete"
                ]
              },
              "sourcePath": {
                "type": "string"
              },
              "targetPath": {
                "type": "string"
              },
              "force": {
                "type": "boolean",
                "default": false
              }
            },
            "required": [
              "action",
              "sourcePath"
            ],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 50
        }
      },
      "required": [
        "projectId",
        "operations"
      ]
    },
    "providerId": "provider.filesystem",
    "providerImplementation": "FilesystemService (apps/runner/src/filesystem/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/filesystem.ts -> createFsBatchHandler",
    "rpcMethod": "fs.batch",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "filesystem.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_info",
    "name": "localbridge_git_info",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Inspect git repository status, current branch, detached state, and commit hash for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitInfoHandler",
    "rpcMethod": "git.info",
    "executionMode": "git",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "git.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_status",
    "name": "localbridge_git_status",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Check working tree status, staged/unstaged changes, untracked files, and branch sync status for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitStatusHandler",
    "rpcMethod": "git.status",
    "executionMode": "git",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "git.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_diff",
    "name": "localbridge_git_diff",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Generate a unified diff for staged or unstaged changes within an authorized project, with path filtering and security exclusion.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "scope": {
          "type": "string",
          "enum": [
            "unstaged",
            "staged"
          ],
          "default": "unstaged"
        },
        "path": {
          "type": "string"
        },
        "contextLines": {
          "type": "integer",
          "minimum": 0,
          "maximum": 20,
          "default": 3
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitDiffHandler",
    "rpcMethod": "git.diff",
    "executionMode": "git",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "git.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_log",
    "name": "localbridge_git_log",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Inspect recent git commit summaries (hash, author, date, message) with limit bounding for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "default": 20
        },
        "path": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitLogHandler",
    "rpcMethod": "git.log",
    "executionMode": "git",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "git.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_stage",
    "name": "localbridge_git_stage",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Stage specified file or directory paths in the index for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Target project identifier"
        },
        "paths": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "minItems": 1,
          "maxItems": 128,
          "description": "Explicit relative file paths to stage within project bounds"
        },
        "approvalId": {
          "type": "string",
          "description": "Optional approval identifier used to execute an approved stage request"
        },
        "sessionId": {
          "type": "string",
          "description": "Optional workflow session ID to execute within bound worktree"
        }
      },
      "required": [
        "projectId",
        "paths"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitStageHandler",
    "rpcMethod": "git.stage",
    "executionMode": "git",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "execute",
    "permissions": [
      "git.execute"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_unstage",
    "name": "localbridge_git_unstage",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Unstage specified paths from the index without discarding working tree modifications for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Target project identifier"
        },
        "paths": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "minItems": 1,
          "maxItems": 128,
          "description": "Explicit relative file paths to unstage from git index (leaves worktree unchanged)"
        },
        "approvalId": {
          "type": "string",
          "description": "Optional approval identifier used to execute an approved unstage request"
        },
        "sessionId": {
          "type": "string",
          "description": "Optional workflow session ID to execute within bound worktree"
        }
      },
      "required": [
        "projectId",
        "paths"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitUnstageHandler",
    "rpcMethod": "git.unstage",
    "executionMode": "git",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "git.execute"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_branch_create",
    "name": "localbridge_git_branch_create",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Create a new local Git branch with strict name validation for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Target project identifier"
        },
        "branchName": {
          "type": "string",
          "minLength": 1,
          "maxLength": 255,
          "description": "Name of the local branch to create"
        },
        "startPoint": {
          "type": "string",
          "maxLength": 128,
          "description": "Optional starting point commit hash or ref for the new branch"
        },
        "approvalId": {
          "type": "string",
          "description": "Optional approval identifier used to execute an approved branch creation request"
        },
        "sessionId": {
          "type": "string",
          "description": "Optional workflow session ID to execute within bound worktree"
        }
      },
      "required": [
        "projectId",
        "branchName"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitBranchCreateHandler",
    "rpcMethod": "git.branchCreate",
    "executionMode": "git",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "execute",
    "permissions": [
      "git.execute"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_branch_switch",
    "name": "localbridge_git_branch_switch",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Switch to an existing local Git branch with dirty worktree conflict detection for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Target project identifier"
        },
        "branchName": {
          "type": "string",
          "minLength": 1,
          "maxLength": 255,
          "description": "Name of existing local branch to switch to"
        },
        "approvalId": {
          "type": "string",
          "description": "Optional approval identifier used to execute an approved branch switch request"
        },
        "sessionId": {
          "type": "string",
          "description": "Optional workflow session ID to execute within bound worktree"
        }
      },
      "required": [
        "projectId",
        "branchName"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitBranchSwitchHandler",
    "rpcMethod": "git.branchSwitch",
    "executionMode": "git",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "execute",
    "permissions": [
      "git.execute"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_git_commit",
    "name": "localbridge_git_commit",
    "version": "1.0.0",
    "namespace": "git",
    "category": "git",
    "description": "Commit currently staged changes with a required commit message for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Target project identifier"
        },
        "message": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4096,
          "description": "Commit message describing staged changes"
        },
        "approvalId": {
          "type": "string",
          "description": "Optional approval identifier used to execute an approved commit request"
        },
        "sessionId": {
          "type": "string",
          "description": "Optional workflow session ID to execute within bound worktree"
        }
      },
      "required": [
        "projectId",
        "message"
      ]
    },
    "providerId": "provider.git",
    "providerImplementation": "GitService (apps/runner/src/git/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/git.ts -> createGitCommitHandler",
    "rpcMethod": "git.commit",
    "executionMode": "git",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "execute",
    "permissions": [
      "git.execute"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_command_classify",
    "name": "localbridge_command_classify",
    "version": "1.0.0",
    "namespace": "command",
    "category": "command",
    "description": "Perform pre-flight risk evaluation and permission checking on a structured CommandSpec before execution.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Target project identifier"
        },
        "kind": {
          "type": "string",
          "enum": [
            "tool-version",
            "node-script",
            "python-script",
            "package-script",
            "shell-command"
          ],
          "description": "Kind of command to execute"
        },
        "tool": {
          "type": "string",
          "description": "Tool name for tool-version inspection (node, npm, pnpm, python, cargo, go, etc.)"
        },
        "path": {
          "type": "string",
          "description": "Relative path to script within project (required for node-script/python-script)"
        },
        "manager": {
          "type": "string",
          "enum": [
            "npm",
            "pnpm",
            "yarn",
            "bun"
          ],
          "description": "Package manager for package-script (npm, pnpm, yarn, bun)"
        },
        "script": {
          "type": "string",
          "description": "Package script name (e.g. build, test, lint)"
        },
        "command": {
          "type": "string",
          "description": "Command or executable name to run (for shell-command, e.g. cargo, go, bun, deno)"
        },
        "args": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "maxItems": 64,
          "default": [],
          "description": "Optional command arguments"
        },
        "cwd": {
          "type": "string",
          "default": ".",
          "description": "Working directory relative to project root"
        },
        "env": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          },
          "description": "Optional additional environment variables"
        },
        "shell": {
          "type": "string",
          "enum": [
            "cmd",
            "powershell",
            "pwsh",
            "bash",
            "sh"
          ],
          "description": "Optional shell to execute command within (cmd, powershell, pwsh, bash, sh)"
        },
        "timeoutMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 300000,
          "default": 60000,
          "description": "Command timeout in milliseconds"
        },
        "sessionId": {
          "type": "string",
          "description": "Optional workflow session ID to execute within bound worktree"
        },
        "callerPurpose": {
          "type": "string",
          "description": "Optional caller purpose identifier"
        }
      },
      "required": [
        "projectId",
        "kind"
      ]
    },
    "providerId": "provider.command",
    "providerImplementation": "CommandExecutionService (apps/runner/src/command/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/command.ts -> createCommandClassifyHandler",
    "rpcMethod": "command.classify",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "command.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_command_run",
    "name": "localbridge_command_run",
    "version": "1.0.0",
    "namespace": "command",
    "category": "command",
    "description": "Execute an authorized, classified command (tool version, node script, python script, or package script) within project bounds.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Target project identifier"
        },
        "kind": {
          "type": "string",
          "enum": [
            "tool-version",
            "node-script",
            "python-script",
            "package-script",
            "shell-command"
          ],
          "description": "Kind of command to execute"
        },
        "tool": {
          "type": "string",
          "description": "Tool name for tool-version inspection (node, npm, pnpm, python, cargo, go, etc.)"
        },
        "path": {
          "type": "string",
          "description": "Relative path to script within project (required for node-script/python-script)"
        },
        "manager": {
          "type": "string",
          "enum": [
            "npm",
            "pnpm",
            "yarn",
            "bun"
          ],
          "description": "Package manager for package-script (npm, pnpm, yarn, bun)"
        },
        "script": {
          "type": "string",
          "description": "Package script name (e.g. build, test, lint)"
        },
        "command": {
          "type": "string",
          "description": "Command or executable name to run (for shell-command, e.g. cargo, go, bun, deno)"
        },
        "args": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "maxItems": 64,
          "default": [],
          "description": "Optional command arguments"
        },
        "cwd": {
          "type": "string",
          "default": ".",
          "description": "Working directory relative to project root"
        },
        "env": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          },
          "description": "Optional additional environment variables"
        },
        "shell": {
          "type": "string",
          "enum": [
            "cmd",
            "powershell",
            "pwsh",
            "bash",
            "sh"
          ],
          "description": "Optional shell to execute command within (cmd, powershell, pwsh, bash, sh)"
        },
        "timeoutMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 300000,
          "default": 60000,
          "description": "Command timeout in milliseconds"
        },
        "sessionId": {
          "type": "string",
          "description": "Optional workflow session ID to execute within bound worktree"
        },
        "callerPurpose": {
          "type": "string",
          "description": "Optional caller purpose identifier"
        },
        "approvalId": {
          "type": "string",
          "description": "Optional approval identifier used to retry an approved command request."
        }
      },
      "required": [
        "projectId",
        "kind"
      ]
    },
    "providerId": "provider.command",
    "providerImplementation": "CommandExecutionService (apps/runner/src/command/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/command.ts -> createCommandRunHandler",
    "rpcMethod": "command.run",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "command.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_job_start",
    "name": "localbridge_job_start",
    "version": "1.0.0",
    "namespace": "jobs",
    "category": "jobs",
    "description": "Start a long-running background command execution job within an authorized project and receive an asynchronous jobId.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "command": {
          "type": "object",
          "properties": {
            "projectId": {
              "type": "string",
              "description": "Target project identifier"
            },
            "kind": {
              "type": "string",
              "enum": [
                "tool-version",
                "node-script",
                "python-script",
                "package-script",
                "shell-command"
              ],
              "description": "Kind of command to execute"
            },
            "tool": {
              "type": "string",
              "description": "Tool name for tool-version inspection (node, npm, pnpm, python, cargo, go, etc.)"
            },
            "path": {
              "type": "string",
              "description": "Relative path to script within project (required for node-script/python-script)"
            },
            "manager": {
              "type": "string",
              "enum": [
                "npm",
                "pnpm",
                "yarn",
                "bun"
              ],
              "description": "Package manager for package-script (npm, pnpm, yarn, bun)"
            },
            "script": {
              "type": "string",
              "description": "Package script name (e.g. build, test, lint)"
            },
            "command": {
              "type": "string",
              "description": "Command or executable name to run (for shell-command, e.g. cargo, go, bun, deno)"
            },
            "args": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "maxItems": 64,
              "default": [],
              "description": "Optional command arguments"
            },
            "cwd": {
              "type": "string",
              "default": ".",
              "description": "Working directory relative to project root"
            },
            "env": {
              "type": "object",
              "additionalProperties": {
                "type": "string"
              },
              "description": "Optional additional environment variables"
            },
            "shell": {
              "type": "string",
              "enum": [
                "cmd",
                "powershell",
                "pwsh",
                "bash",
                "sh"
              ],
              "description": "Optional shell to execute command within (cmd, powershell, pwsh, bash, sh)"
            },
            "timeoutMs": {
              "type": "integer",
              "minimum": 1000,
              "maximum": 300000,
              "default": 60000,
              "description": "Command timeout in milliseconds"
            },
            "sessionId": {
              "type": "string",
              "description": "Optional workflow session ID to execute within bound worktree"
            },
            "callerPurpose": {
              "type": "string",
              "description": "Optional caller purpose identifier"
            }
          },
          "required": [
            "projectId",
            "kind"
          ],
          "additionalProperties": false,
          "description": "Command specification to run in background"
        },
        "timeoutMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 300000,
          "default": 60000,
          "description": "Job timeout in milliseconds"
        },
        "approvalId": {
          "type": "string",
          "description": "Optional approval identifier used to retry an approved job request."
        },
        "sessionId": {
          "type": "string",
          "description": "Optional workflow session ID to execute within bound worktree"
        }
      },
      "required": [
        "command"
      ]
    },
    "providerId": "provider.jobs",
    "providerImplementation": "BackgroundJobManager (apps/runner/src/jobs/manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/jobs.ts -> createJobStartHandler",
    "rpcMethod": "job.start",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "jobs.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_job_status",
    "name": "localbridge_job_status",
    "version": "1.0.0",
    "namespace": "jobs",
    "category": "jobs",
    "description": "Check current execution state, risk, duration, exit code, and lifecycle timestamps for a background job.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "jobId": {
          "type": "string"
        }
      },
      "required": [
        "jobId"
      ]
    },
    "providerId": "provider.jobs",
    "providerImplementation": "BackgroundJobManager (apps/runner/src/jobs/manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/jobs.ts -> createJobStatusHandler",
    "rpcMethod": "job.status",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "jobs.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_job_logs",
    "name": "localbridge_job_logs",
    "version": "1.0.0",
    "namespace": "jobs",
    "category": "jobs",
    "description": "Fetch paginated, sanitized stdout/stderr log chunks for a running or completed background job using opaque cursors.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "jobId": {
          "type": "string"
        },
        "cursor": {
          "type": [
            "string",
            "null"
          ]
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 200,
          "default": 100
        }
      },
      "required": [
        "jobId"
      ]
    },
    "providerId": "provider.jobs",
    "providerImplementation": "BackgroundJobManager (apps/runner/src/jobs/manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/jobs.ts -> createJobLogsHandler",
    "rpcMethod": "job.logs",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "jobs.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_job_cancel",
    "name": "localbridge_job_cancel",
    "version": "1.0.0",
    "namespace": "jobs",
    "category": "jobs",
    "description": "Forcefully terminate an active background job and its entire subprocess tree.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "jobId": {
          "type": "string"
        },
        "projectId": {
          "type": "string"
        }
      },
      "required": [
        "jobId"
      ]
    },
    "providerId": "provider.jobs",
    "providerImplementation": "BackgroundJobManager (apps/runner/src/jobs/manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/jobs.ts -> createJobCancelHandler",
    "rpcMethod": "job.cancel",
    "executionMode": "process",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "jobs.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_job_list",
    "name": "localbridge_job_list",
    "version": "1.0.0",
    "namespace": "jobs",
    "category": "jobs",
    "description": "List recent active and terminal background jobs with optional project or state filters.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "state": {
          "type": "string",
          "enum": [
            "queued",
            "running",
            "succeeded",
            "failed",
            "cancelled",
            "timed_out",
            "timed-out",
            "interrupted"
          ]
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "default": 50
        }
      }
    },
    "providerId": "provider.jobs",
    "providerImplementation": "BackgroundJobManager (apps/runner/src/jobs/manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/jobs.ts -> createJobListHandler",
    "rpcMethod": "job.list",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "jobs.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_build_start",
    "name": "localbridge_build_start",
    "version": "1.0.0",
    "namespace": "jobs",
    "category": "jobs",
    "description": "Launch an authorized build package script (e.g. `npm run build` or `pnpm build`) as a background job.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "manager": {
          "type": "string",
          "enum": [
            "npm",
            "pnpm"
          ],
          "default": "pnpm"
        },
        "script": {
          "type": "string",
          "default": "build"
        },
        "args": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "maxItems": 64,
          "default": []
        },
        "cwd": {
          "type": "string",
          "default": "."
        },
        "timeoutMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 300000,
          "default": 60000
        },
        "approvalId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.jobs",
    "providerImplementation": "BackgroundJobManager (apps/runner/src/jobs/manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/jobs.ts -> createBuildStartHandler",
    "rpcMethod": "build.start",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "jobs.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_test_start",
    "name": "localbridge_test_start",
    "version": "1.0.0",
    "namespace": "jobs",
    "category": "jobs",
    "description": "Launch an authorized test package script (e.g. `npm test` or `pnpm test`) as a background job.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "manager": {
          "type": "string",
          "enum": [
            "npm",
            "pnpm"
          ],
          "default": "pnpm"
        },
        "script": {
          "type": "string",
          "default": "test"
        },
        "args": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "maxItems": 64,
          "default": []
        },
        "cwd": {
          "type": "string",
          "default": "."
        },
        "timeoutMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 300000,
          "default": 60000
        },
        "approvalId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.jobs",
    "providerImplementation": "BackgroundJobManager (apps/runner/src/jobs/manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/jobs.ts -> createTestStartHandler",
    "rpcMethod": "test.start",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "jobs.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_approval_status",
    "name": "localbridge_approval_status",
    "version": "1.0.0",
    "namespace": "approvals",
    "category": "approvals",
    "description": "Check the real-time status of an approval request (returns 'pending', 'approved', 'denied', 'expired', or 'consumed'). Resolvable via chat or Nexus Desktop fallback.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "approvalId": {
          "type": "string",
          "pattern": "^approval_[0-9a-f-]{36}$",
          "description": "The unique identifier of the approval request to inspect."
        }
      },
      "required": [
        "approvalId"
      ]
    },
    "providerId": "provider.approvals",
    "providerImplementation": "ApprovalService (apps/runner/src/approvals/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/approvals.ts -> createApprovalGetHandler",
    "rpcMethod": "approval.get",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "approvals.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_document_symbols",
    "name": "localbridge_code_document_symbols",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Extract hierarchical document symbols (functions, classes, interfaces, variables, etc.) from a source file inside an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1,
          "description": "Target project identifier"
        },
        "path": {
          "type": "string",
          "minLength": 1,
          "description": "Relative path to source file inside project"
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "description": "Optional session identifier to resolve worktree context"
        }
      },
      "required": [
        "projectId",
        "path"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodeDocumentSymbolsHandler",
    "rpcMethod": "code.document_symbols",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_workspace_symbols",
    "name": "localbridge_code_workspace_symbols",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Search workspace symbols across an authorized project by query string with bounded result limits.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1,
          "description": "Target project identifier"
        },
        "query": {
          "type": "string",
          "description": "Symbol search query. Non-empty string recommended"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 200,
          "default": 50,
          "description": "Maximum number of symbols to return (max 200, default 50)"
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "description": "Optional session identifier to resolve worktree context"
        }
      },
      "required": [
        "projectId",
        "query"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodeWorkspaceSymbolsHandler",
    "rpcMethod": "code.workspace_symbols",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_definition",
    "name": "localbridge_code_definition",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Locate definition targets for a symbol at a specific 0-based line and character coordinate within an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1,
          "description": "Target project identifier"
        },
        "path": {
          "type": "string",
          "minLength": 1,
          "description": "Relative path to source file inside project"
        },
        "line": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based line index"
        },
        "character": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based character offset"
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "description": "Optional session identifier to resolve worktree context"
        }
      },
      "required": [
        "projectId",
        "path",
        "line",
        "character"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodeDefinitionHandler",
    "rpcMethod": "code.definition",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_references",
    "name": "localbridge_code_references",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Find references to a symbol at a specific 0-based line and character coordinate across an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1,
          "description": "Target project identifier"
        },
        "path": {
          "type": "string",
          "minLength": 1,
          "description": "Relative path to source file inside project"
        },
        "line": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based line index"
        },
        "character": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based character offset"
        },
        "includeDeclaration": {
          "type": "boolean",
          "default": false,
          "description": "Include the symbol declaration in the references result"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 100,
          "description": "Maximum number of references to return (max 500, default 100)"
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "description": "Optional session identifier to resolve worktree context"
        }
      },
      "required": [
        "projectId",
        "path",
        "line",
        "character"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodeReferencesHandler",
    "rpcMethod": "code.references",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_hover",
    "name": "localbridge_code_hover",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Inspect type signatures, symbol definitions, and documentation for code at a specific 0-based line and character coordinate.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1,
          "description": "Target project identifier"
        },
        "path": {
          "type": "string",
          "minLength": 1,
          "description": "Relative path to source file inside project"
        },
        "line": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based line index"
        },
        "character": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based character offset"
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "description": "Optional session identifier to resolve worktree context"
        }
      },
      "required": [
        "projectId",
        "path",
        "line",
        "character"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodeHoverHandler",
    "rpcMethod": "code.hover",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_diagnostics",
    "name": "localbridge_code_diagnostics",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Retrieve semantic compilation errors, warnings, and type diagnostics for a specific file or the whole authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1,
          "description": "Target project identifier"
        },
        "path": {
          "type": "string",
          "minLength": 1,
          "description": "Optional relative file path to restrict diagnostics to a single file"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 100,
          "description": "Maximum number of diagnostics to return (max 500, default 100)"
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "description": "Optional session identifier to resolve worktree context"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodeDiagnosticsHandler",
    "rpcMethod": "code.diagnostics",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_call_hierarchy",
    "name": "localbridge_code_call_hierarchy",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Trace incoming (callers) or outgoing (callees) call hierarchy trees for a function or method at a specific 0-based coordinate.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1,
          "description": "Target project identifier"
        },
        "path": {
          "type": "string",
          "minLength": 1,
          "description": "Relative path to source file inside project"
        },
        "line": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based line index"
        },
        "character": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based character offset"
        },
        "direction": {
          "type": "string",
          "enum": [
            "incoming",
            "outgoing"
          ],
          "description": "Call direction: incoming (callers) or outgoing (callees)"
        },
        "depth": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3,
          "default": 1,
          "description": "Call hierarchy traversal depth (1 to 3, default 1)"
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "description": "Optional session identifier to resolve worktree context"
        }
      },
      "required": [
        "projectId",
        "path",
        "line",
        "character",
        "direction"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodeCallHierarchyHandler",
    "rpcMethod": "code.call_hierarchy",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_impact",
    "name": "localbridge_code_impact",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Perform composite deterministic code impact analysis (definitions, reference counts, direct callers, direct callees, affected files) for a symbol.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1,
          "description": "Target project identifier"
        },
        "path": {
          "type": "string",
          "minLength": 1,
          "description": "Relative path to source file inside project"
        },
        "line": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based line index"
        },
        "character": {
          "type": "integer",
          "minimum": 0,
          "description": "0-based character offset"
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "description": "Optional session identifier to resolve worktree context"
        }
      },
      "required": [
        "projectId",
        "path",
        "line",
        "character"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodeImpactHandler",
    "rpcMethod": "code.impact",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_patch_preview",
    "name": "localbridge_code_patch_preview",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Preview a unified diff patch, validate hunks, and detect potential merge conflicts before applying.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "patchContent": {
          "type": "string",
          "minLength": 1
        },
        "reverse": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "projectId",
        "patchContent"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodePatchPreviewHandler",
    "rpcMethod": "code.patchPreview",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "code.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_patch_apply",
    "name": "localbridge_code_patch_apply",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Atomically apply a unified diff patch to project files, automatically backing up state to a checkpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "patchContent": {
          "type": "string",
          "minLength": 1
        },
        "createBackup": {
          "type": "boolean",
          "default": true
        },
        "atomic": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "projectId",
        "patchContent"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodePatchApplyHandler",
    "rpcMethod": "code.patchApply",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "code.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_code_patch_rollback",
    "name": "localbridge_code_patch_rollback",
    "version": "1.0.0",
    "namespace": "code",
    "category": "code",
    "description": "Rollback a previously applied code patch using its checkpoint ID.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "backupCheckpointId": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "backupCheckpointId"
      ]
    },
    "providerId": "provider.code",
    "providerImplementation": "CodeIntelligenceService + CodePatchService (apps/runner/src/code/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/code.ts -> createCodePatchRollbackHandler",
    "rpcMethod": "code.patchRollback",
    "executionMode": "write",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "code.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_session_start",
    "name": "localbridge_session_start",
    "version": "1.0.0",
    "namespace": "session",
    "category": "session",
    "description": "Start a new persistent workflow session for an authorized project to track, correlate, and persist development context.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1
        },
        "goal": {
          "type": "string",
          "maxLength": 1000
        },
        "goals": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 500
          },
          "maxItems": 20
        },
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "metadata": {
          "type": "object",
          "properties": {
            "source": {
              "type": "string",
              "maxLength": 100
            },
            "clientLabel": {
              "type": "string",
              "maxLength": 100
            }
          },
          "additionalProperties": false
        }
      },
      "required": [
        "projectId"
      ],
      "additionalProperties": false
    },
    "providerId": "provider.session",
    "providerImplementation": "WorkflowSessionManager (apps/server/src/session/manager.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/session.ts",
    "rpcMethod": "server.session.session_start",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "session.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_session_list",
    "name": "localbridge_session_list",
    "version": "1.0.0",
    "namespace": "session",
    "category": "session",
    "description": "List recent workflow sessions for a project with state filtering and cursor-based pagination.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1
        },
        "state": {
          "type": "string",
          "enum": [
            "active",
            "completed",
            "abandoned"
          ]
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 100,
          "default": 20
        },
        "offset": {
          "type": "integer",
          "minimum": 0
        },
        "cursor": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ],
      "additionalProperties": false
    },
    "providerId": "provider.session",
    "providerImplementation": "WorkflowSessionManager (apps/server/src/session/manager.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/session.ts",
    "rpcMethod": "server.session.session_list",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "session.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_session_status",
    "name": "localbridge_session_status",
    "version": "1.0.0",
    "namespace": "session",
    "category": "session",
    "description": "Retrieve core status, metrics, touched files count, active jobs, and latest checkpoint for a workflow session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string"
        },
        "projectId": {
          "type": "string"
        }
      },
      "additionalProperties": false
    },
    "providerId": "provider.session",
    "providerImplementation": "WorkflowSessionManager (apps/server/src/session/manager.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/session.ts",
    "rpcMethod": "server.session.session_status",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "session.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_session_events",
    "name": "localbridge_session_events",
    "version": "1.0.0",
    "namespace": "session",
    "category": "session",
    "description": "Retrieve paginated timeline events for a workflow session with stable cursor-based pagination.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "minLength": 1
        },
        "cursor": {
          "type": "string"
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 200,
          "default": 50
        },
        "offset": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": [
        "sessionId"
      ],
      "additionalProperties": false
    },
    "providerId": "provider.session",
    "providerImplementation": "WorkflowSessionManager (apps/server/src/session/manager.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/session.ts",
    "rpcMethod": "server.session.session_events",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "session.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_session_checkpoint",
    "name": "localbridge_session_checkpoint",
    "version": "1.0.0",
    "namespace": "session",
    "category": "session",
    "description": "Save an operator/AI development checkpoint note with summary, next steps, and blockers into an active session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "minLength": 1
        },
        "summary": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2000
        },
        "nextSteps": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 300
          },
          "maxItems": 10
        },
        "blockers": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 300
          },
          "maxItems": 10
        },
        "metadata": {
          "type": "object",
          "properties": {
            "source": {
              "type": "string",
              "maxLength": 100
            },
            "clientLabel": {
              "type": "string",
              "maxLength": 100
            }
          },
          "additionalProperties": false
        }
      },
      "required": [
        "sessionId",
        "summary"
      ],
      "additionalProperties": false
    },
    "providerId": "provider.session",
    "providerImplementation": "WorkflowSessionManager (apps/server/src/session/manager.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/session.ts",
    "rpcMethod": "server.session.session_checkpoint",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "session.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_session_handoff",
    "name": "localbridge_session_handoff",
    "version": "1.0.0",
    "namespace": "session",
    "category": "session",
    "description": "Generate a deterministic, sanitized handoff packet capturing session goal, real-time Git state, touched files, jobs, approvals, and latest checkpoint for seamless cross-chat resumption.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "sessionId"
      ],
      "additionalProperties": false
    },
    "providerId": "provider.session",
    "providerImplementation": "WorkflowSessionManager (apps/server/src/session/manager.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/session.ts",
    "rpcMethod": "server.session.session_handoff",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "session.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_session_finish",
    "name": "localbridge_session_finish",
    "version": "1.0.0",
    "namespace": "session",
    "category": "session",
    "description": "Finish a workflow session with outcome 'completed' or 'abandoned'. Blocked if active background jobs or pending approvals exist.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string",
          "minLength": 1
        },
        "outcome": {
          "type": "string",
          "enum": [
            "completed",
            "abandoned"
          ],
          "default": "completed"
        },
        "finalNote": {
          "type": "string",
          "maxLength": 1000
        },
        "reason": {
          "type": "string",
          "maxLength": 1000
        },
        "notes": {
          "type": "string",
          "maxLength": 1000
        }
      },
      "required": [
        "sessionId"
      ],
      "additionalProperties": false
    },
    "providerId": "provider.session",
    "providerImplementation": "WorkflowSessionManager (apps/server/src/session/manager.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/session.ts",
    "rpcMethod": "server.session.session_finish",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "session.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_worktree_create",
    "name": "localbridge_worktree_create",
    "version": "1.0.0",
    "namespace": "worktree",
    "category": "worktree",
    "description": "Create an isolated Git worktree development workspace for an authorized project. If sessionId is provided, binds the worktree to the workflow session so all session operations resolve to the worktree.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1
        },
        "sessionId": {
          "type": "string"
        },
        "branchName": {
          "type": "string",
          "minLength": 1
        },
        "baseRef": {
          "type": "string"
        },
        "baseBranch": {
          "type": "string"
        },
        "baseCommit": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "branchName"
      ]
    },
    "providerId": "provider.worktree",
    "providerImplementation": "ManagedWorktreeManager + RunnerWorktreeManager (apps/runner/src/worktree/manager.ts)",
    "runnerAdapter": "apps/runner/src/worktree/handlers.ts",
    "rpcMethod": "worktree.create",
    "executionMode": "git",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "execute",
    "permissions": [
      "worktree.execute"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_worktree_list",
    "name": "localbridge_worktree_list",
    "version": "1.0.0",
    "namespace": "worktree",
    "category": "worktree",
    "description": "List all managed Git worktrees for an authorized project, including their branch names, paths, clean status, and bound sessions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.worktree",
    "providerImplementation": "ManagedWorktreeManager + RunnerWorktreeManager (apps/runner/src/worktree/manager.ts)",
    "runnerAdapter": "apps/runner/src/worktree/handlers.ts",
    "rpcMethod": "worktree.list",
    "executionMode": "git",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "worktree.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_worktree_status",
    "name": "localbridge_worktree_status",
    "version": "1.0.0",
    "namespace": "worktree",
    "category": "worktree",
    "description": "Get detailed status of a managed Git worktree, including clean status, staged/unstaged changes, and commit comparison.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "worktreeId": {
          "type": "string"
        },
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.worktree",
    "providerImplementation": "ManagedWorktreeManager + RunnerWorktreeManager (apps/runner/src/worktree/manager.ts)",
    "runnerAdapter": "apps/runner/src/worktree/handlers.ts",
    "rpcMethod": "worktree.status",
    "executionMode": "git",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "worktree.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_worktree_diff",
    "name": "localbridge_worktree_diff",
    "version": "1.0.0",
    "namespace": "worktree",
    "category": "worktree",
    "description": "Get file diffs for a managed Git worktree (against base branch or working tree).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "worktreeId": {
          "type": "string"
        },
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "cached": {
          "type": "boolean"
        }
      }
    },
    "providerId": "provider.worktree",
    "providerImplementation": "ManagedWorktreeManager + RunnerWorktreeManager (apps/runner/src/worktree/manager.ts)",
    "runnerAdapter": "apps/runner/src/worktree/handlers.ts",
    "rpcMethod": "worktree.diff",
    "executionMode": "git",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "worktree.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_worktree_remove",
    "name": "localbridge_worktree_remove",
    "version": "1.0.0",
    "namespace": "worktree",
    "category": "worktree",
    "description": "Safely remove a managed Git worktree. Strictly blocked if the worktree has uncommitted changes, active background jobs, pending approvals, or unmerged commits. The branch is never deleted.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "worktreeId": {
          "type": "string",
          "minLength": 1
        },
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        }
      },
      "required": [
        "worktreeId"
      ]
    },
    "providerId": "provider.worktree",
    "providerImplementation": "ManagedWorktreeManager + RunnerWorktreeManager (apps/runner/src/worktree/manager.ts)",
    "runnerAdapter": "apps/runner/src/worktree/handlers.ts",
    "rpcMethod": "worktree.remove",
    "executionMode": "git",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "worktree.execute"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_runtime_start",
    "name": "localbridge_runtime_start",
    "version": "1.0.0",
    "namespace": "runtime",
    "category": "runtime",
    "description": "Start a long-lived persistent runtime process (e.g. dev server, file watcher, compiler watch, or background process) for an authorized project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1
        },
        "sessionId": {
          "type": "string"
        },
        "launch": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "const": "package-script"
                },
                "manager": {
                  "type": "string",
                  "enum": [
                    "npm",
                    "pnpm",
                    "yarn",
                    "bun"
                  ]
                },
                "script": {
                  "type": "string",
                  "minLength": 1
                },
                "args": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "relativeCwd": {
                  "type": "string"
                },
                "name": {
                  "type": "string",
                  "maxLength": 100
                },
                "approvalId": {
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "manager",
                "script"
              ],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "const": "registered-command"
                },
                "tool": {
                  "type": "string",
                  "enum": [
                    "node",
                    "npm",
                    "pnpm",
                    "yarn",
                    "bun",
                    "deno",
                    "python",
                    "pip",
                    "uv",
                    "java",
                    "javac",
                    "go",
                    "rustc",
                    "cargo",
                    "php",
                    "composer",
                    "ruby",
                    "gem",
                    "dotnet",
                    "gcc",
                    "g++",
                    "clang",
                    "cmake",
                    "powershell",
                    "pwsh",
                    "docker",
                    "git"
                  ]
                },
                "args": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "relativeCwd": {
                  "type": "string"
                },
                "name": {
                  "type": "string",
                  "maxLength": 100
                },
                "approvalId": {
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "tool",
                "args"
              ],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "const": "shell-command"
                },
                "command": {
                  "type": "string",
                  "minLength": 1
                },
                "args": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "default": []
                },
                "relativeCwd": {
                  "type": "string"
                },
                "shell": {
                  "type": "string",
                  "enum": [
                    "cmd",
                    "powershell",
                    "pwsh",
                    "bash",
                    "sh"
                  ]
                },
                "env": {
                  "type": "object",
                  "additionalProperties": {
                    "type": "string"
                  }
                },
                "name": {
                  "type": "string",
                  "maxLength": 100
                },
                "approvalId": {
                  "type": "string"
                }
              },
              "required": [
                "kind",
                "command"
              ],
              "additionalProperties": false
            }
          ]
        },
        "name": {
          "type": "string",
          "maxLength": 100
        },
        "approvalId": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "launch"
      ]
    },
    "providerId": "provider.runtime",
    "providerImplementation": "ServerPersistentRuntimeManager + PersistentRuntimeManager (apps/runner/src/runtime/manager.ts)",
    "runnerAdapter": "apps/runner/src/runtime/handlers.ts",
    "rpcMethod": "runtime.start",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "runtime.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_runtime_list",
    "name": "localbridge_runtime_list",
    "version": "1.0.0",
    "namespace": "runtime",
    "category": "runtime",
    "description": "List persistent runtimes, optionally filtered by projectId, sessionId, worktreeId, or state.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "worktreeId": {
          "type": "string"
        },
        "state": {
          "type": "string",
          "enum": [
            "starting",
            "running",
            "stopping",
            "stopped",
            "failed",
            "interrupted"
          ]
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "default": 50
        },
        "cursor": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.runtime",
    "providerImplementation": "ServerPersistentRuntimeManager + PersistentRuntimeManager (apps/runner/src/runtime/manager.ts)",
    "runnerAdapter": "apps/runner/src/runtime/handlers.ts",
    "rpcMethod": "runtime.list",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "runtime.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_runtime_status",
    "name": "localbridge_runtime_status",
    "version": "1.0.0",
    "namespace": "runtime",
    "category": "runtime",
    "description": "Get the status, generation, PID, exit code, and uptime of a persistent runtime.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "runtimeId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "runtimeId"
      ]
    },
    "providerId": "provider.runtime",
    "providerImplementation": "ServerPersistentRuntimeManager + PersistentRuntimeManager (apps/runner/src/runtime/manager.ts)",
    "runnerAdapter": "apps/runner/src/runtime/handlers.ts",
    "rpcMethod": "runtime.status",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "runtime.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_runtime_logs",
    "name": "localbridge_runtime_logs",
    "version": "1.0.0",
    "namespace": "runtime",
    "category": "runtime",
    "description": "Retrieve paginated output logs for a persistent runtime, supporting generation filtering and sequence-based cursors.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "runtimeId": {
          "type": "string",
          "minLength": 1
        },
        "generation": {
          "type": "integer",
          "minimum": 1
        },
        "afterSequence": {
          "type": "integer",
          "minimum": 0
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500,
          "default": 100
        }
      },
      "required": [
        "runtimeId"
      ]
    },
    "providerId": "provider.runtime",
    "providerImplementation": "ServerPersistentRuntimeManager + PersistentRuntimeManager (apps/runner/src/runtime/manager.ts)",
    "runnerAdapter": "apps/runner/src/runtime/handlers.ts",
    "rpcMethod": "runtime.logs",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "runtime.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_runtime_restart",
    "name": "localbridge_runtime_restart",
    "version": "1.0.0",
    "namespace": "runtime",
    "category": "runtime",
    "description": "Restart a persistent runtime with a new generation while preserving its launch configuration.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "runtimeId": {
          "type": "string",
          "minLength": 1
        },
        "approvalId": {
          "type": "string"
        }
      },
      "required": [
        "runtimeId"
      ]
    },
    "providerId": "provider.runtime",
    "providerImplementation": "ServerPersistentRuntimeManager + PersistentRuntimeManager (apps/runner/src/runtime/manager.ts)",
    "runnerAdapter": "apps/runner/src/runtime/handlers.ts",
    "rpcMethod": "runtime.restart",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "runtime.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_runtime_stop",
    "name": "localbridge_runtime_stop",
    "version": "1.0.0",
    "namespace": "runtime",
    "category": "runtime",
    "description": "Gracefully stop a persistent runtime (with SIGTERM and fallback hard tree kill) without requiring operator approval.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "runtimeId": {
          "type": "string",
          "minLength": 1
        },
        "gracePeriodMs": {
          "type": "integer",
          "minimum": 100,
          "maximum": 10000
        }
      },
      "required": [
        "runtimeId"
      ]
    },
    "providerId": "provider.runtime",
    "providerImplementation": "ServerPersistentRuntimeManager + PersistentRuntimeManager (apps/runner/src/runtime/manager.ts)",
    "runnerAdapter": "apps/runner/src/runtime/handlers.ts",
    "rpcMethod": "runtime.stop",
    "executionMode": "process",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "runtime.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_list",
    "name": "localbridge_skill_list",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "List all available and valid Nexus skills for ChatGPT, including built-in recipes, user workflows, raw collections, and project-specific skills.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "collectionId": {
          "type": "string"
        },
        "source": {
          "type": "string",
          "enum": [
            "builtin",
            "user",
            "project"
          ]
        },
        "enabledOnly": {
          "type": "boolean"
        },
        "type": {
          "type": "string",
          "enum": [
            "nexus",
            "raw"
          ]
        }
      }
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_list",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "read",
    "permissions": [
      "skills.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_get",
    "name": "localbridge_skill_get",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "Retrieve the complete declarative definition, step-by-step instructions (SKILL.md), or referenced documentation files for a specific Nexus Skill.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "skillId": {
          "type": "string",
          "minLength": 1
        },
        "projectId": {
          "type": "string"
        },
        "documentPath": {
          "type": "string"
        }
      },
      "required": [
        "skillId"
      ]
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_get",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "read",
    "permissions": [
      "skills.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_match",
    "name": "localbridge_skill_match",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "Match a user request, prompt, or task description against available Nexus Skills to discover the most appropriate workflow and guidelines.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "minLength": 1
        },
        "projectId": {
          "type": "string"
        },
        "collectionId": {
          "type": "string"
        },
        "layaRecommendation": {
          "type": "string"
        }
      },
      "required": [
        "query"
      ]
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_match",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "read",
    "permissions": [
      "skills.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_create",
    "name": "localbridge_skill_create",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "Create or register a versioned skill with 6-point verification in Nexus Intelligence Runtime.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "skillId": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "version": {
          "type": "string",
          "default": "1.0.0"
        },
        "capabilities": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "stepNumber": {
                "type": "integer",
                "exclusiveMinimum": 0
              },
              "actionName": {
                "type": "string"
              },
              "toolName": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "paramsTemplate": {
                "type": "object",
                "additionalProperties": {}
              },
              "preconditions": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "default": []
              },
              "successConditions": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "default": []
              }
            },
            "required": [
              "stepNumber",
              "actionName",
              "toolName",
              "description"
            ],
            "additionalProperties": false
          },
          "default": []
        },
        "tools": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "parameters": {
          "type": "object",
          "additionalProperties": {},
          "default": {}
        },
        "preconditions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "successConditions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "errorHandling": {
          "type": "object",
          "additionalProperties": {},
          "default": {}
        },
        "dependencies": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "instructions": {
          "type": "string",
          "default": ""
        },
        "source": {
          "type": "string",
          "enum": [
            "BUILT_IN",
            "USER_UPLOADED",
            "AI_GENERATED"
          ],
          "default": "USER_UPLOADED"
        },
        "projectId": {
          "type": "string"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        }
      },
      "required": [
        "skillId",
        "name",
        "description"
      ]
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_create",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "skills.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_validate",
    "name": "localbridge_skill_validate",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "Validate a skill definition or candidate across 6 points: schema, dependencies, tools, parameters, security, and dry-run.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "skillId": {
          "type": "string"
        },
        "version": {
          "type": "string"
        },
        "skillData": {
          "type": "object",
          "additionalProperties": {}
        }
      }
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_validate",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "read",
    "permissions": [
      "skills.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_activate",
    "name": "localbridge_skill_activate",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "Activate a specific version of a skill in the Intelligence Runtime.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "skillId": {
          "type": "string"
        },
        "version": {
          "type": "string"
        }
      },
      "required": [
        "skillId",
        "version"
      ]
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_activate",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "skills.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_version_list",
    "name": "localbridge_skill_version_list",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "List all immutable versions and changelogs for a specific skill.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "skillId": {
          "type": "string"
        }
      },
      "required": [
        "skillId"
      ]
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_version_list",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "read",
    "permissions": [
      "skills.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_rollback",
    "name": "localbridge_skill_rollback",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "Rollback a skill's active version to a previously validated version.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "skillId": {
          "type": "string"
        },
        "targetVersion": {
          "type": "string"
        }
      },
      "required": [
        "skillId",
        "targetVersion"
      ]
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_rollback",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "skills.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_candidate_propose",
    "name": "localbridge_skill_candidate_propose",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "Propose a new AI-generated skill candidate with full execution evidence (actions, results, success counts).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "skillId": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "proposedBy": {
          "type": "string",
          "default": "WebAI/GPT"
        },
        "extractedSteps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "stepNumber": {
                "type": "integer",
                "exclusiveMinimum": 0
              },
              "actionName": {
                "type": "string"
              },
              "toolName": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "paramsTemplate": {
                "type": "object",
                "additionalProperties": {}
              },
              "preconditions": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "default": []
              },
              "successConditions": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "default": []
              }
            },
            "required": [
              "stepNumber",
              "actionName",
              "toolName",
              "description"
            ],
            "additionalProperties": false
          },
          "default": []
        },
        "tools": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "parameters": {
          "type": "object",
          "additionalProperties": {},
          "default": {}
        },
        "preconditions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "successConditions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "errorHandling": {
          "type": "object",
          "additionalProperties": {},
          "default": {}
        },
        "dependencies": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "instructions": {
          "type": "string",
          "default": ""
        },
        "evidence": {
          "type": "object",
          "properties": {
            "whySkill": {
              "type": "string"
            },
            "sourceTaskId": {
              "type": "string"
            },
            "sourceSessionId": {
              "type": "string"
            },
            "actionIds": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            },
            "executionIds": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            },
            "toolNames": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            },
            "executionResults": {
              "type": "object",
              "additionalProperties": {},
              "default": {}
            },
            "successCount": {
              "type": "integer",
              "minimum": 0,
              "default": 0
            },
            "failureCount": {
              "type": "integer",
              "minimum": 0,
              "default": 0
            },
            "executionCount": {
              "type": "integer",
              "minimum": 0
            },
            "tasks": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            },
            "observations": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            }
          },
          "required": [
            "whySkill",
            "sourceTaskId"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "skillId",
        "name",
        "description",
        "evidence"
      ]
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_candidate_propose",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "skills.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_skill_candidate_review",
    "name": "localbridge_skill_candidate_review",
    "version": "1.0.0",
    "namespace": "skills",
    "category": "skills",
    "description": "Review (accept or reject) an AI-generated skill candidate. Acceptance automatically promotes it to an active skill.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "candidateId": {
          "type": "string"
        },
        "action": {
          "type": "string",
          "enum": [
            "accept",
            "reject"
          ]
        },
        "reviewNotes": {
          "type": "string"
        },
        "reviewedBy": {
          "type": "string",
          "default": "user"
        }
      },
      "required": [
        "candidateId",
        "action"
      ]
    },
    "providerId": "provider.skills",
    "providerImplementation": "SkillRegistry + IntelligenceSkillService (apps/server/src/skills/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/server/src/mcp/tools/skills.ts",
    "rpcMethod": "server.skills.skill_candidate_review",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "skills.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_laya_status",
    "name": "localbridge_laya_status",
    "version": "1.0.0",
    "namespace": "laya",
    "category": "laya",
    "description": "Query the current readiness, execution mode, and model loading status of the Nexus Laya Decision Intelligence engine.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.laya",
    "providerImplementation": "ManagedDecisionProvider (packages/security/src/decision/provider.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/laya.ts",
    "rpcMethod": "server.laya.laya_status",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "laya.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_laya_assess",
    "name": "localbridge_laya_assess",
    "version": "1.0.0",
    "namespace": "laya",
    "category": "laya",
    "description": "Request an advisory risk and policy assessment from Laya Decision Intelligence before performing high-risk actions. Provides risk level, recommended action, confidence score, and optional skill suggestion.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "operation": {
          "type": "string",
          "minLength": 1
        },
        "target": {
          "type": "string"
        },
        "command": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "skillId": {
          "type": "string"
        },
        "context": {
          "type": "string"
        }
      },
      "required": [
        "operation"
      ]
    },
    "providerId": "provider.laya",
    "providerImplementation": "ManagedDecisionProvider (packages/security/src/decision/provider.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/laya.ts",
    "rpcMethod": "server.laya.laya_assess",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "laya.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_environment_detect",
    "name": "localbridge_environment_detect",
    "version": "1.0.0",
    "namespace": "environment",
    "category": "environment",
    "description": "Detect installed developer toolchains, compilers, runtimes, package managers, and container tools (e.g. Node, npm, pnpm, yarn, bun, deno, python, pip, uv, java, javac, go, rust, rustc, cargo, php, composer, ruby, gem, dotnet, gcc, g++, clang, cmake, pwsh, docker) on the local host environment.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "tools": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "providerId": "provider.environment",
    "providerImplementation": "EnvironmentDetectionService (apps/runner/src/environment/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/environment.ts -> createEnvironmentDetectHandler",
    "rpcMethod": "environment.detect",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "environment.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_project_detect",
    "name": "localbridge_project_detect",
    "version": "1.0.0",
    "namespace": "environment",
    "category": "environment",
    "description": "Inspect an authorized project directory to automatically identify project ecosystem (Node, Rust, Go, Python, Java, PHP, Ruby, .NET, C/C++, Docker), installed runtimes, configuration files, and standard runnable package/build/test/dev scripts.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "minLength": 1
        },
        "relativeCwd": {
          "type": "string"
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.environment",
    "providerImplementation": "EnvironmentDetectionService (apps/runner/src/environment/service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/environment.ts -> createProjectDetectHandler",
    "rpcMethod": "project.detect",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "environment.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_terminal_start",
    "name": "localbridge_terminal_start",
    "version": "1.0.0",
    "namespace": "terminal",
    "category": "terminal",
    "description": "Start a real persistent Terminal session with ConPTY / PTY on the host machine. The terminal session survives Web AI disconnects and supports interactive commands, full ANSI output buffering, and idle timeouts.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "agentTaskId": {
          "type": "string"
        },
        "shell": {
          "type": "string"
        },
        "cols": {
          "type": "integer",
          "minimum": 20,
          "maximum": 500,
          "default": 80
        },
        "rows": {
          "type": "integer",
          "minimum": 5,
          "maximum": 200,
          "default": 24
        },
        "cwd": {
          "type": "string"
        },
        "env": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          }
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.terminal",
    "providerImplementation": "TerminalManager (apps/runner/src/terminal/terminal-manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/terminal.ts -> createTerminalStartHandler",
    "rpcMethod": "terminal.start",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "terminal.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_terminal_write",
    "name": "localbridge_terminal_write",
    "version": "1.0.0",
    "namespace": "terminal",
    "category": "terminal",
    "description": "Send interactive input or commands to a persistent Terminal session. Evaluates input commands for security and risk classification. Dangerous commands require approval.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "terminalSessionId": {
          "type": "string"
        },
        "input": {
          "type": "string"
        },
        "execute": {
          "type": "boolean",
          "default": false
        },
        "approvalId": {
          "type": "string"
        }
      },
      "required": [
        "terminalSessionId",
        "input"
      ]
    },
    "providerId": "provider.terminal",
    "providerImplementation": "TerminalManager (apps/runner/src/terminal/terminal-manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/terminal.ts -> createTerminalWriteHandler",
    "rpcMethod": "terminal.write",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "terminal.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_terminal_read",
    "name": "localbridge_terminal_read",
    "version": "1.0.0",
    "namespace": "terminal",
    "category": "terminal",
    "description": "Read buffered output from a persistent Terminal session. Supports incremental offset-based reading and resets idle timeout upon interaction.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "terminalSessionId": {
          "type": "string"
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "default": 0
        },
        "maxBytes": {
          "type": "integer",
          "minimum": 1,
          "maximum": 1048576,
          "default": 65536
        }
      },
      "required": [
        "terminalSessionId"
      ]
    },
    "providerId": "provider.terminal",
    "providerImplementation": "TerminalManager (apps/runner/src/terminal/terminal-manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/terminal.ts -> createTerminalReadHandler",
    "rpcMethod": "terminal.read",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "terminal.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_terminal_resize",
    "name": "localbridge_terminal_resize",
    "version": "1.0.0",
    "namespace": "terminal",
    "category": "terminal",
    "description": "Resize the terminal columns and rows dimensions of an active terminal session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "terminalSessionId": {
          "type": "string"
        },
        "cols": {
          "type": "integer",
          "minimum": 20,
          "maximum": 500
        },
        "rows": {
          "type": "integer",
          "minimum": 5,
          "maximum": 200
        }
      },
      "required": [
        "terminalSessionId",
        "cols",
        "rows"
      ]
    },
    "providerId": "provider.terminal",
    "providerImplementation": "TerminalManager (apps/runner/src/terminal/terminal-manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/terminal.ts -> createTerminalResizeHandler",
    "rpcMethod": "terminal.resize",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "terminal.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_terminal_status",
    "name": "localbridge_terminal_status",
    "version": "1.0.0",
    "namespace": "terminal",
    "category": "terminal",
    "description": "Get detailed status, state (running, idle, stopped), PID, uptime, and buffer size of a terminal session. Revives sessions in grace-period back to running.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "terminalSessionId": {
          "type": "string"
        }
      },
      "required": [
        "terminalSessionId"
      ]
    },
    "providerId": "provider.terminal",
    "providerImplementation": "TerminalManager (apps/runner/src/terminal/terminal-manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/terminal.ts -> createTerminalStatusHandler",
    "rpcMethod": "terminal.status",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "terminal.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_terminal_stop",
    "name": "localbridge_terminal_stop",
    "version": "1.0.0",
    "namespace": "terminal",
    "category": "terminal",
    "description": "Terminate an active Terminal session and safely clean up its process tree.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "terminalSessionId": {
          "type": "string"
        },
        "force": {
          "type": "boolean",
          "default": false
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "terminalSessionId"
      ]
    },
    "providerId": "provider.terminal",
    "providerImplementation": "TerminalManager (apps/runner/src/terminal/terminal-manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/terminal.ts -> createTerminalStopHandler",
    "rpcMethod": "terminal.stop",
    "executionMode": "process",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "terminal.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_terminal_list",
    "name": "localbridge_terminal_list",
    "version": "1.0.0",
    "namespace": "terminal",
    "category": "terminal",
    "description": "List all persistent Terminal sessions filtered by project ID or state.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "state": {
          "type": "string",
          "enum": [
            "running",
            "idle",
            "stopped"
          ]
        }
      }
    },
    "providerId": "provider.terminal",
    "providerImplementation": "TerminalManager (apps/runner/src/terminal/terminal-manager.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/terminal.ts -> createTerminalListHandler",
    "rpcMethod": "terminal.list",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "terminal.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_process_list",
    "name": "localbridge_process_list",
    "version": "1.0.0",
    "namespace": "process",
    "category": "process",
    "description": "List running OS processes on the host with ownership evaluation (OWNED, VERIFIED_DERIVED, PROBABLE, UNOWNED, SYSTEM, FOREIGN), resource IDs, CPU/memory, and listening ports.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "ownership": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "OWNED",
                "VERIFIED_DERIVED",
                "PROBABLE",
                "UNOWNED",
                "SYSTEM",
                "FOREIGN"
              ]
            },
            {
              "type": "string",
              "const": "ALL"
            }
          ]
        }
      }
    },
    "providerId": "provider.process",
    "providerImplementation": "ResourceOwnershipTracker + ProcessService (apps/runner/src/process/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/process.ts -> createProcessListHandler",
    "rpcMethod": "process.list",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "process.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_process_status",
    "name": "localbridge_process_status",
    "version": "1.0.0",
    "namespace": "process",
    "category": "process",
    "description": "Inspect detailed status of a specific process by PID, including process tree children, system protected flags, and verified ownership score.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pid": {
          "type": "integer",
          "exclusiveMinimum": 0
        }
      },
      "required": [
        "pid"
      ]
    },
    "providerId": "provider.process",
    "providerImplementation": "ResourceOwnershipTracker + ProcessService (apps/runner/src/process/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/process.ts -> createProcessStatusHandler",
    "rpcMethod": "process.status",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "process.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_process_kill",
    "name": "localbridge_process_kill",
    "version": "1.0.0",
    "namespace": "process",
    "category": "process",
    "description": "Terminate a process by PID. Enforces strict process ownership verification: Nexus-owned processes are safely terminated; System processes are blocked; Unowned/external processes require explicit approval.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pid": {
          "type": "integer",
          "exclusiveMinimum": 0
        },
        "force": {
          "type": "boolean",
          "default": false
        },
        "signal": {
          "type": "string"
        },
        "approvalId": {
          "type": "string"
        }
      },
      "required": [
        "pid"
      ]
    },
    "providerId": "provider.process",
    "providerImplementation": "ResourceOwnershipTracker + ProcessService (apps/runner/src/process/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/process.ts -> createProcessKillHandler",
    "rpcMethod": "process.kill",
    "executionMode": "process",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "process.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_process_tree",
    "name": "localbridge_process_tree",
    "version": "1.0.0",
    "namespace": "process",
    "category": "process",
    "description": "Get a hierarchical process tree structure starting from a root PID or filtered by project, terminal session, or runtime ID.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pid": {
          "type": "integer",
          "exclusiveMinimum": 0
        },
        "projectId": {
          "type": "string"
        },
        "terminalSessionId": {
          "type": "string"
        },
        "runtimeId": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.process",
    "providerImplementation": "ResourceOwnershipTracker + ProcessService (apps/runner/src/process/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/process.ts -> createProcessTreeHandler",
    "rpcMethod": "process.tree",
    "executionMode": "process",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "process.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_port_list",
    "name": "localbridge_port_list",
    "version": "1.0.0",
    "namespace": "port",
    "category": "port",
    "description": "Scan active TCP and UDP ports on the host machine. Returns bound port, protocol, binding address, PID, process name, command line, project association, and ownership grade.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "port": {
          "type": "integer",
          "minimum": 1,
          "maximum": 65535
        },
        "ownership": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "OWNED",
                "VERIFIED_DERIVED",
                "PROBABLE",
                "UNOWNED",
                "SYSTEM",
                "FOREIGN"
              ]
            },
            {
              "type": "string",
              "const": "ALL"
            }
          ]
        }
      }
    },
    "providerId": "provider.port",
    "providerImplementation": "PortInspectionService (apps/runner/src/port/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/port.ts -> createPortListHandler",
    "rpcMethod": "port.list",
    "executionMode": "network",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "port.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_port_kill",
    "name": "localbridge_port_kill",
    "version": "1.0.0",
    "namespace": "port",
    "category": "port",
    "description": "Release an occupied port by resolving its listening process and safely terminating it with real-time port and PID ownership verification. Verifies that the port is completely freed.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "port": {
          "type": "integer",
          "minimum": 1,
          "maximum": 65535
        },
        "force": {
          "type": "boolean",
          "default": false
        },
        "approvalId": {
          "type": "string"
        }
      },
      "required": [
        "port"
      ]
    },
    "providerId": "provider.port",
    "providerImplementation": "PortInspectionService (apps/runner/src/port/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/port.ts -> createPortKillHandler",
    "rpcMethod": "port.kill",
    "executionMode": "network",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "port.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_create",
    "name": "localbridge_agent_task_create",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Create a long-term autonomous Agent Task with hard resource governance limits (wall time, CPU/memory, action budget, disk quota, failure loop detection).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "title": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "goal": {
          "type": "string",
          "minLength": 1
        },
        "resourcePolicy": {
          "type": "object",
          "properties": {
            "maxWallTimeMs": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 7200000
            },
            "maxIterations": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 100
            },
            "maxCpuTimeMs": {
              "type": "integer",
              "exclusiveMinimum": 0
            },
            "maxMemoryBytes": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 4294967296
            },
            "maxDiskWriteBytes": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 5368709120
            },
            "maxOutputBytes": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 104857600
            },
            "maxTerminalSessions": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 4
            },
            "maxRuntimes": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 8
            },
            "maxProcesses": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 64
            },
            "maxConcurrentActions": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 5
            },
            "maxSameActionRepeats": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 3
            },
            "maxFailures": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 10
            },
            "maxActions": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "default": 500
            }
          },
          "additionalProperties": false
        }
      },
      "required": [
        "projectId",
        "title",
        "goal"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskCreateHandler",
    "rpcMethod": "agent_task.create",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_status",
    "name": "localbridge_agent_task_status",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Query the real-time status of an Agent Task, including current phase, resource usage, iteration counters, pending approvals, and latest checkpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskStatusHandler",
    "rpcMethod": "agent_task.status",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_task.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_logs",
    "name": "localbridge_agent_task_logs",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Fetch sequence-based incremental execution logs for an Agent Task (observation, plan, action, command, terminal, process, port, approval, checkpoint).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "fromSequence": {
          "type": "integer",
          "minimum": 0,
          "default": 0
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 1000,
          "default": 100
        },
        "logType": {
          "type": "string",
          "enum": [
            "system",
            "observation",
            "plan",
            "action",
            "command",
            "terminal",
            "process",
            "port",
            "approval",
            "error",
            "checkpoint",
            "resource"
          ]
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskLogsHandler",
    "rpcMethod": "agent_task.logs",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_task.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_cancel",
    "name": "localbridge_agent_task_cancel",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Cancel an active Agent Task, stop its decision loop, and terminate all agent-owned runtimes, terminals, and processes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskCancelHandler",
    "rpcMethod": "agent_task.cancel",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_pause",
    "name": "localbridge_agent_task_pause",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Pause the Agent decision loop while keeping all owned development terminals, runtimes, and processes running.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskPauseHandler",
    "rpcMethod": "agent_task.pause",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_resume",
    "name": "localbridge_agent_task_resume",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Resume a paused Agent Task with fresh observation and state reconciliation against live OS processes and ports.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskResumeHandler",
    "rpcMethod": "agent_task.resume",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_list",
    "name": "localbridge_agent_task_list",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "List long-term Agent Tasks filtered by project ID or state.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "state": {
          "type": "string",
          "enum": [
            "created",
            "queued",
            "assigned",
            "attempting",
            "planning",
            "running",
            "waiting",
            "verifying",
            "checkpointing",
            "checkpointed",
            "recovering",
            "paused",
            "interrupted",
            "disconnected",
            "waiting_for_agent",
            "waiting_for_human",
            "completed",
            "failed",
            "cancelled",
            "timed_out",
            "resource_limited"
          ]
        }
      }
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskListHandler",
    "rpcMethod": "agent_task.list",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_task.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_approve",
    "name": "localbridge_agent_task_approve",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Approve or reject a pending security approval required by an Agent Task.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "approvalId": {
          "type": "string"
        },
        "action": {
          "type": "string",
          "enum": [
            "approve",
            "reject"
          ]
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId",
        "approvalId",
        "action"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskApproveHandler",
    "rpcMethod": "agent_task.approve",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_assign",
    "name": "localbridge_agent_task_assign",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Assign an Agent Task to a specific agent executor or coding role.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "agentId": {
          "type": "string"
        },
        "role": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId",
        "agentId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskAssignHandler",
    "rpcMethod": "agent_task.assign",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_task.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_attempt",
    "name": "localbridge_agent_task_attempt",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Record a new execution attempt with strategy notes, git baseline, and attempt tracking.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "plan": {
          "type": "string"
        },
        "checkpointBefore": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskAttemptHandler",
    "rpcMethod": "agent_task.attempt",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_coding_run",
    "name": "localbridge_agent_task_coding_run",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Trigger or update a Coding Run inside an agent task attempt (connecting files, terminal, runtime, git).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "instruction": {
          "type": "string"
        },
        "targetFiles": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "autoTest": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "agentTaskId",
        "instruction"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskCodingRunHandler",
    "rpcMethod": "agent_task.codingRun",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_heartbeat",
    "name": "localbridge_agent_task_heartbeat",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Emit a heartbeat for an active Agent Task with current step and progress status.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "agentId": {
          "type": "string"
        },
        "progressNote": {
          "type": "string"
        },
        "activeProcessIds": {
          "type": "array",
          "items": {
            "type": "integer"
          }
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskHeartbeatHandler",
    "rpcMethod": "agent_task.heartbeat",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_reconcile",
    "name": "localbridge_agent_task_reconcile",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Reconcile task state after disconnection, interruption, or timeout.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "cleanZombieProcesses": {
          "type": "boolean",
          "default": true
        },
        "recoverCheckpointIfFailed": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskReconcileHandler",
    "rpcMethod": "agent_task.reconcile",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_complete",
    "name": "localbridge_agent_task_complete",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Mark an Agent Task as completed, failed, or cancelled with final artifacts and verification summary.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "summary": {
          "type": "string"
        },
        "artifactsProduced": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "validationPassed": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "agentTaskId",
        "summary"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskCompleteHandler",
    "rpcMethod": "agent_task.complete",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_handoff",
    "name": "localbridge_agent_task_handoff",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Handoff task context, checkpoint, and remaining subtasks to another agent or session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "toAgentId": {
          "type": "string"
        },
        "note": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId",
        "toAgentId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskHandoffHandler",
    "rpcMethod": "agent_task.handoff",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_checkpoint_create",
    "name": "localbridge_agent_task_checkpoint_create",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Manually trigger or record a durable checkpoint for an Agent Task with full computer and context state.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "trigger": {
          "type": "string",
          "enum": [
            "manual",
            "periodic",
            "pre_risky",
            "post_verification",
            "on_failure",
            "pre_attempt"
          ],
          "default": "manual"
        },
        "description": {
          "type": "string"
        },
        "includeComputerState": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskCheckpointCreateHandler",
    "rpcMethod": "agent_task.checkpoint.create",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_checkpoint_restore",
    "name": "localbridge_agent_task_checkpoint_restore",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Restore an Agent Task to a specific historical checkpoint, verifying live Windows state.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "checkpointId": {
          "type": "string"
        },
        "verifyStateBeforeResume": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "agentTaskId",
        "checkpointId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskCheckpointRestoreHandler",
    "rpcMethod": "agent_task.checkpoint.restore",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_checkpoint_list",
    "name": "localbridge_agent_task_checkpoint_list",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "List all durable checkpoints for an Agent Task sorted by creation time.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 20
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskCheckpointListHandler",
    "rpcMethod": "agent_task.checkpoint.list",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_task.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_disconnect",
    "name": "localbridge_agent_task_disconnect",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Mark an Agent Task as disconnected when the external Agent loses connection, safely persisting state.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "agentId": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskDisconnectHandler",
    "rpcMethod": "agent_task.disconnect",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_task_takeover",
    "name": "localbridge_agent_task_takeover",
    "version": "1.0.0",
    "namespace": "agent_task",
    "category": "agent-task",
    "description": "Allow a human operator or secondary supervisor to take over an Agent Task or return control.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "takeoverBy": {
          "type": "string",
          "default": "human"
        },
        "action": {
          "type": "string",
          "enum": [
            "takeover",
            "return_control"
          ]
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "agentTaskId",
        "action"
      ]
    },
    "providerId": "provider.agent_task",
    "providerImplementation": "AgentTaskManager + AgentExecutor + ActionLedger (apps/runner/src/agent-task/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-task.ts -> createAgentTaskTakeoverHandler",
    "rpcMethod": "agent_task.takeover",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_task.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_create",
    "name": "localbridge_artifact_create",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "Initialize a new managed file artifact with metadata, content-type, tags, and lifecycle policies.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "mimeType": {
          "type": "string"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "extra": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "projectId",
        "name"
      ]
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactCreateHandler",
    "rpcMethod": "artifact.create",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "artifacts.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_write_chunk",
    "name": "localbridge_artifact_write_chunk",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "Stream a chunk of data into an artifact with SHA-256 integrity verification.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "artifactId": {
          "type": "string"
        },
        "chunkIndex": {
          "type": "integer",
          "minimum": 0
        },
        "chunkBase64": {
          "type": "string"
        },
        "isLastChunk": {
          "type": "boolean",
          "default": false
        },
        "expectedSha256": {
          "type": "string"
        }
      },
      "required": [
        "artifactId",
        "chunkIndex",
        "chunkBase64"
      ]
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactWriteChunkHandler",
    "rpcMethod": "artifact.writeChunk",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "artifacts.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_read_chunk",
    "name": "localbridge_artifact_read_chunk",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "Read a chunk of data from an artifact with bounded memory buffering.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "artifactId": {
          "type": "string"
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "default": 0
        },
        "length": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 10485760,
          "default": 1048576
        }
      },
      "required": [
        "artifactId"
      ]
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactReadChunkHandler",
    "rpcMethod": "artifact.readChunk",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "artifacts.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_get",
    "name": "localbridge_artifact_get",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "Retrieve metadata and state of a stored artifact.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "artifactId": {
          "type": "string"
        }
      },
      "required": [
        "artifactId"
      ]
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactGetHandler",
    "rpcMethod": "artifact.get",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "artifacts.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_list",
    "name": "localbridge_artifact_list",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "List artifacts matching optional project, task, or tag filters.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "tag": {
          "type": "string"
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 200,
          "default": 50
        }
      }
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactListHandler",
    "rpcMethod": "artifact.list",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "artifacts.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_import",
    "name": "localbridge_artifact_import",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "Import an existing workspace file as a versioned artifact.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "filePath": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "mimeType": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "projectId",
        "filePath"
      ]
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactImportHandler",
    "rpcMethod": "artifact.import",
    "executionMode": "write",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "artifacts.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_export",
    "name": "localbridge_artifact_export",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "Export an artifact to a specified destination path in the workspace.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "artifactId": {
          "type": "string"
        },
        "targetPath": {
          "type": "string"
        },
        "overwrite": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "artifactId",
        "targetPath"
      ]
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactExportHandler",
    "rpcMethod": "artifact.export",
    "executionMode": "read",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "artifacts.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_delete",
    "name": "localbridge_artifact_delete",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "Permanently delete an artifact and its associated data blocks.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "artifactId": {
          "type": "string"
        }
      },
      "required": [
        "artifactId"
      ]
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactDeleteHandler",
    "rpcMethod": "artifact.delete",
    "executionMode": "write",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "artifacts.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_artifact_abort",
    "name": "localbridge_artifact_abort",
    "version": "1.0.0",
    "namespace": "artifacts",
    "category": "artifacts",
    "description": "Abort an ongoing chunked artifact upload and clean up temporary parts.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "artifactId": {
          "type": "string"
        }
      },
      "required": [
        "artifactId"
      ]
    },
    "providerId": "provider.artifacts",
    "providerImplementation": "ArtifactStreamingService (apps/runner/src/artifacts/artifact-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/artifacts.ts -> createArtifactAbortHandler",
    "rpcMethod": "artifact.abort",
    "executionMode": "write",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "artifacts.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_checkpoint_create",
    "name": "localbridge_checkpoint_create",
    "version": "1.0.0",
    "namespace": "checkpoints",
    "category": "checkpoints",
    "description": "Create an atomic workspace snapshot/checkpoint capturing modified files and git state for safe rollback.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "description": {
          "type": "string"
        },
        "autoTrigger": {
          "type": "string",
          "enum": [
            "manual",
            "pre-task",
            "pre-edit",
            "test-failure",
            "pre-reconcile"
          ]
        },
        "includePaths": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "projectId",
        "name"
      ]
    },
    "providerId": "provider.checkpoints",
    "providerImplementation": "WorkspaceCheckpointService (apps/runner/src/checkpoints/checkpoint-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/checkpoints.ts -> createCheckpointCreateHandler",
    "rpcMethod": "checkpoint.create",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "checkpoints.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_checkpoint_list",
    "name": "localbridge_checkpoint_list",
    "version": "1.0.0",
    "namespace": "checkpoints",
    "category": "checkpoints",
    "description": "List available workspace checkpoints for a project.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 100,
          "default": 30
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.checkpoints",
    "providerImplementation": "WorkspaceCheckpointService (apps/runner/src/checkpoints/checkpoint-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/checkpoints.ts -> createCheckpointListHandler",
    "rpcMethod": "checkpoint.list",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "checkpoints.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_checkpoint_get",
    "name": "localbridge_checkpoint_get",
    "version": "1.0.0",
    "namespace": "checkpoints",
    "category": "checkpoints",
    "description": "Get detailed manifest and file list for a specific checkpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "checkpointId": {
          "type": "string"
        },
        "projectId": {
          "type": "string"
        }
      },
      "required": [
        "checkpointId",
        "projectId"
      ]
    },
    "providerId": "provider.checkpoints",
    "providerImplementation": "WorkspaceCheckpointService (apps/runner/src/checkpoints/checkpoint-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/checkpoints.ts -> createCheckpointGetHandler",
    "rpcMethod": "checkpoint.get",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "checkpoints.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_checkpoint_restore",
    "name": "localbridge_checkpoint_restore",
    "version": "1.0.0",
    "namespace": "checkpoints",
    "category": "checkpoints",
    "description": "Atomically restore workspace to a previous checkpoint state, reverting code changes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "checkpointId": {
          "type": "string"
        },
        "projectId": {
          "type": "string"
        },
        "createBackupBeforeRestore": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "checkpointId",
        "projectId"
      ]
    },
    "providerId": "provider.checkpoints",
    "providerImplementation": "WorkspaceCheckpointService (apps/runner/src/checkpoints/checkpoint-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/checkpoints.ts -> createCheckpointRestoreHandler",
    "rpcMethod": "checkpoint.restore",
    "executionMode": "system",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "checkpoints.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_checkpoint_delete",
    "name": "localbridge_checkpoint_delete",
    "version": "1.0.0",
    "namespace": "checkpoints",
    "category": "checkpoints",
    "description": "Delete an unwanted checkpoint and clean up stored snapshot files.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "checkpointId": {
          "type": "string"
        },
        "projectId": {
          "type": "string"
        }
      },
      "required": [
        "checkpointId",
        "projectId"
      ]
    },
    "providerId": "provider.checkpoints",
    "providerImplementation": "WorkspaceCheckpointService (apps/runner/src/checkpoints/checkpoint-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/checkpoints.ts -> createCheckpointDeleteHandler",
    "rpcMethod": "checkpoint.delete",
    "executionMode": "system",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "checkpoints.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_workspace_hygiene_check",
    "name": "localbridge_workspace_hygiene_check",
    "version": "1.0.0",
    "namespace": "hygiene",
    "category": "hygiene",
    "description": "Analyze workspace health: check uncommitted git changes, untracked files, temp build files, and zombie processes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "checkZombies": {
          "type": "boolean",
          "default": true
        },
        "checkGit": {
          "type": "boolean",
          "default": true
        },
        "checkTempFiles": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.hygiene",
    "providerImplementation": "WorkspaceHygieneService (apps/runner/src/hygiene/hygiene-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/hygiene.ts -> createHygieneCheckHandler",
    "rpcMethod": "hygiene.check",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "hygiene.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_workspace_clean",
    "name": "localbridge_workspace_clean",
    "version": "1.0.0",
    "namespace": "hygiene",
    "category": "hygiene",
    "description": "Clean up temporary build files, stale caches, and test artifacts safely.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "cleanTempFiles": {
          "type": "boolean",
          "default": true
        },
        "cleanFailedTaskArtifacts": {
          "type": "boolean",
          "default": true
        },
        "killZombies": {
          "type": "boolean",
          "default": true
        },
        "discardUntracked": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.hygiene",
    "providerImplementation": "WorkspaceHygieneService (apps/runner/src/hygiene/hygiene-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/hygiene.ts -> createHygieneCleanHandler",
    "rpcMethod": "hygiene.clean",
    "executionMode": "system",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "hygiene.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_workspace_reset_file",
    "name": "localbridge_workspace_reset_file",
    "version": "1.0.0",
    "namespace": "hygiene",
    "category": "hygiene",
    "description": "Revert an individual modified file back to git HEAD state.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "relativePath": {
          "type": "string"
        }
      },
      "required": [
        "projectId",
        "relativePath"
      ]
    },
    "providerId": "provider.hygiene",
    "providerImplementation": "WorkspaceHygieneService (apps/runner/src/hygiene/hygiene-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/hygiene.ts -> createHygieneResetFileHandler",
    "rpcMethod": "hygiene.resetFile",
    "executionMode": "system",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "hygiene.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_workspace_clean_untracked",
    "name": "localbridge_workspace_clean_untracked",
    "version": "1.0.0",
    "namespace": "hygiene",
    "category": "hygiene",
    "description": "Remove untracked junk files from the workspace directory.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "dryRun": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.hygiene",
    "providerImplementation": "WorkspaceHygieneService (apps/runner/src/hygiene/hygiene-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/hygiene.ts -> createHygieneCleanUntrackedHandler",
    "rpcMethod": "hygiene.cleanUntracked",
    "executionMode": "system",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "hygiene.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_workspace_kill_zombies",
    "name": "localbridge_workspace_kill_zombies",
    "version": "1.0.0",
    "namespace": "hygiene",
    "category": "hygiene",
    "description": "Terminate orphaned runner child processes and zombie runtimes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.hygiene",
    "providerImplementation": "WorkspaceHygieneService (apps/runner/src/hygiene/hygiene-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/hygiene.ts -> createHygieneKillZombiesHandler",
    "rpcMethod": "hygiene.killZombies",
    "executionMode": "system",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "hygiene.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_status",
    "name": "localbridge_computer_status",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Query Universal Computer Use status, active security mode (SAFE vs UNIVERSAL), and desktop session state.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerStatusHandler",
    "rpcMethod": "computer.status",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_clipboard_read",
    "name": "localbridge_computer_clipboard_read",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Read the current text content from the Windows system clipboard.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerClipboardReadHandler",
    "rpcMethod": "computer.clipboardRead",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_clipboard_write",
    "name": "localbridge_computer_clipboard_write",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Write text into the Windows system clipboard.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string"
        }
      },
      "required": [
        "text"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerClipboardWriteHandler",
    "rpcMethod": "computer.clipboardWrite",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "write",
    "permissions": [
      "computer.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_mouse_move",
    "name": "localbridge_computer_mouse_move",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Move the mouse cursor to absolute screen coordinates (x, y).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "x": {
          "type": "integer"
        },
        "y": {
          "type": "integer"
        },
        "smooth": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "x",
        "y"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerMouseMoveHandler",
    "rpcMethod": "computer.mouseMove",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_mouse_click",
    "name": "localbridge_computer_mouse_click",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Simulate mouse click (left, right, middle, double) at current or specified coordinate.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "button": {
          "type": "string",
          "enum": [
            "left",
            "right",
            "middle",
            "double"
          ],
          "default": "left"
        },
        "x": {
          "type": "integer"
        },
        "y": {
          "type": "integer"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerMouseDragHandler",
    "rpcMethod": "computer.mouseDrag",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_click",
    "name": "localbridge_computer_click",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_mouse_click: simulate mouse click on desktop UI.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "button": {
          "type": "string",
          "enum": [
            "left",
            "right",
            "middle",
            "double"
          ],
          "default": "left"
        },
        "x": {
          "type": "integer"
        },
        "y": {
          "type": "integer"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerMouseDragHandler",
    "rpcMethod": "computer.mouseDrag",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "computer.click"
    ]
  },
  {
    "id": "localbridge_computer_mouse_drag",
    "name": "localbridge_computer_mouse_drag",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Drag the mouse cursor from starting coordinates to target coordinates with optional duration.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "fromX": {
          "type": "integer"
        },
        "fromY": {
          "type": "integer"
        },
        "toX": {
          "type": "integer"
        },
        "toY": {
          "type": "integer"
        },
        "durationMs": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 300
        }
      },
      "required": [
        "toX",
        "toY"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerMouseScrollHandler",
    "rpcMethod": "computer.mouseScroll",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_drag",
    "name": "localbridge_computer_drag",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_mouse_drag: drag mouse cursor across desktop.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "fromX": {
          "type": "integer"
        },
        "fromY": {
          "type": "integer"
        },
        "toX": {
          "type": "integer"
        },
        "toY": {
          "type": "integer"
        },
        "durationMs": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 300
        }
      },
      "required": [
        "toX",
        "toY"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerMouseScrollHandler",
    "rpcMethod": "computer.mouseScroll",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_mouse_scroll",
    "name": "localbridge_computer_mouse_scroll",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Scroll the mouse wheel vertically or horizontally.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "deltaY": {
          "type": "integer"
        },
        "deltaX": {
          "type": "integer",
          "default": 0
        }
      },
      "required": [
        "deltaY"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerKeyboardInputHandler",
    "rpcMethod": "computer.keyboardInput",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_scroll",
    "name": "localbridge_computer_scroll",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_mouse_scroll: scroll mouse wheel.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "deltaY": {
          "type": "integer"
        },
        "deltaX": {
          "type": "integer",
          "default": 0
        }
      },
      "required": [
        "deltaY"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerKeyboardInputHandler",
    "rpcMethod": "computer.keyboardInput",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_keyboard_input",
    "name": "localbridge_computer_keyboard_input",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Type a sequence of characters into the active Windows desktop element or window.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string"
        },
        "delayMs": {
          "type": "integer",
          "minimum": 0,
          "default": 10
        }
      },
      "required": [
        "text"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerKeyboardKeyHandler",
    "rpcMethod": "computer.keyboardKey",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_type",
    "name": "localbridge_computer_type",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_keyboard_input: type text into active desktop window.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string"
        },
        "delayMs": {
          "type": "integer",
          "minimum": 0,
          "default": 10
        }
      },
      "required": [
        "text"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerKeyboardKeyHandler",
    "rpcMethod": "computer.keyboardKey",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "computer.type"
    ]
  },
  {
    "id": "localbridge_computer_keyboard_key",
    "name": "localbridge_computer_keyboard_key",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Press a special key or key combo (e.g. Enter, Tab, Escape, Ctrl+C, Alt+Tab).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "keys": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1
        },
        "action": {
          "type": "string",
          "enum": [
            "press",
            "down",
            "up"
          ],
          "default": "press"
        }
      },
      "required": [
        "keys"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerKeyboardKeyHandler",
    "rpcMethod": "computer.keyboardKey",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_key",
    "name": "localbridge_computer_key",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_keyboard_key: press key on keyboard.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "keys": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1
        },
        "action": {
          "type": "string",
          "enum": [
            "press",
            "down",
            "up"
          ],
          "default": "press"
        }
      },
      "required": [
        "keys"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerKeyboardKeyHandler",
    "rpcMethod": "computer.keyboardKey",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_hotkey",
    "name": "localbridge_computer_hotkey",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Press a keyboard hotkey combination string (e.g. 'Ctrl+S', 'Alt+F4', 'Shift+A', 'Tab').",
    "inputSchema": {
      "type": "object",
      "properties": {
        "hotkey": {
          "type": "string"
        },
        "combo": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerKeyboardKeyHandler",
    "rpcMethod": "computer.keyboardKey",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_window_list",
    "name": "localbridge_computer_window_list",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "List all open desktop windows with title, process name, PID, and visibility.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerWindowActivateHandler",
    "rpcMethod": "computer.windowActivate",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_list_windows",
    "name": "localbridge_computer_list_windows",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_window_list: list all open desktop windows.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerWindowActivateHandler",
    "rpcMethod": "computer.windowActivate",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_window_activate",
    "name": "localbridge_computer_window_activate",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Bring a window to the foreground by handle, title, or process name.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "handleOrTitle": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "handle": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerWindowCloseHandler",
    "rpcMethod": "computer.windowClose",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_activate_window",
    "name": "localbridge_computer_activate_window",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_window_activate: activate window and bring to foreground.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "handleOrTitle": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "handle": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerWindowCloseHandler",
    "rpcMethod": "computer.windowClose",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_window_close",
    "name": "localbridge_computer_window_close",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Close an open desktop application window by title or handle.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "handleOrTitle": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "handle": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerDisplayListHandler",
    "rpcMethod": "computer.displayList",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_close_window",
    "name": "localbridge_computer_close_window",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_window_close: close desktop application window.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "handleOrTitle": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "handle": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerDisplayListHandler",
    "rpcMethod": "computer.displayList",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_display_list",
    "name": "localbridge_computer_display_list",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "List all connected monitors and displays with bounds and resolution.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerDisplayListHandler",
    "rpcMethod": "computer.displayList",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_app_list",
    "name": "localbridge_computer_app_list",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "List common installed applications and running applications.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerAppListHandler",
    "rpcMethod": "computer.appList",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_app_launch",
    "name": "localbridge_computer_app_launch",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Launch an installed desktop application with optional arguments.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "appNameOrPath": {
          "type": "string"
        },
        "args": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "appNameOrPath"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerWaitHandler",
    "rpcMethod": "computer.wait",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_launch",
    "name": "localbridge_computer_launch",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_app_launch: launch desktop application.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "appNameOrPath": {
          "type": "string"
        },
        "args": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "appNameOrPath"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerWaitHandler",
    "rpcMethod": "computer.wait",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "computer.launch"
    ]
  },
  {
    "id": "localbridge_computer_wait",
    "name": "localbridge_computer_wait",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Pause execution for a specified duration in milliseconds to allow UI and window state to stabilize.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ms": {
          "type": "integer",
          "minimum": 0,
          "default": 1000
        },
        "durationMs": {
          "type": "integer",
          "minimum": 0
        },
        "reason": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerWaitHandler",
    "rpcMethod": "computer.wait",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_observe",
    "name": "localbridge_computer_observe",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Observe current desktop state: captures screenshot, inspects active window, and checks target application readiness.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "windowHandleOrTitle": {
          "type": "string"
        },
        "includeScreenshot": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerObserveHandler",
    "rpcMethod": "computer.observe",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "computer.observe"
    ]
  },
  {
    "id": "localbridge_ui_accessibility_tree",
    "name": "localbridge_ui_accessibility_tree",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Query the Windows UI Automation accessibility element tree to locate buttons, textboxes, and windows.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "windowHandleOrTitle": {
          "type": "string"
        },
        "maxDepth": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 10,
          "default": 3
        },
        "filterControlType": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerAccessibilityTreeHandler",
    "rpcMethod": "computer.accessibilityTree",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_ui_element_action",
    "name": "localbridge_ui_element_action",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Perform an accessibility action on a UI element (invoke, click, setValue, focus, select) by AutomationId or Name.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "selector": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string"
            },
            "automationId": {
              "type": "string"
            },
            "controlType": {
              "type": "string"
            },
            "windowHandleOrTitle": {
              "type": "string"
            }
          },
          "additionalProperties": false
        },
        "action": {
          "type": "string",
          "enum": [
            "click",
            "invoke",
            "focus",
            "set_value"
          ]
        },
        "value": {
          "type": "string"
        }
      },
      "required": [
        "selector",
        "action"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerUIElementActionHandler",
    "rpcMethod": "computer.uiElementAction",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_screen_snapshot",
    "name": "localbridge_computer_screen_snapshot",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Capture a full screen or bounding-box snapshot as PNG image or Base64.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "displayId": {
          "type": "string"
        },
        "windowHandleOrTitle": {
          "type": "string"
        },
        "saveToArtifact": {
          "type": "boolean",
          "default": false
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "jpeg"
          ],
          "default": "png"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerTakeControlHandler",
    "rpcMethod": "computer.takeControl",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_screenshot",
    "name": "localbridge_computer_screenshot",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_screen_snapshot: capture desktop screen snapshot.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "displayId": {
          "type": "string"
        },
        "windowHandleOrTitle": {
          "type": "string"
        },
        "saveToArtifact": {
          "type": "boolean",
          "default": false
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "jpeg"
          ],
          "default": "png"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerTakeControlHandler",
    "rpcMethod": "computer.takeControl",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "computer.screenshot"
    ]
  },
  {
    "id": "localbridge_computer_take_control",
    "name": "localbridge_computer_take_control",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Transfer desktop control to human supervisor and lock AI mouse/keyboard input.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string"
        },
        "timeoutMs": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 300000
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerReturnControlHandler",
    "rpcMethod": "computer.returnControl",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "take_control",
    "name": "take_control",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_take_control.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string"
        },
        "timeoutMs": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 300000
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerReturnControlHandler",
    "rpcMethod": "computer.returnControl",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_return_control",
    "name": "localbridge_computer_return_control",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Return desktop control to AI agent and capture reconciliation screen snapshot.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "notes": {
          "type": "string"
        },
        "reconcileScreenshot": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerTakeoverStatusHandler",
    "rpcMethod": "computer.takeoverStatus",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "return_control",
    "name": "return_control",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_return_control.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "notes": {
          "type": "string"
        },
        "reconcileScreenshot": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerTakeoverStatusHandler",
    "rpcMethod": "computer.takeoverStatus",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_takeover_status",
    "name": "localbridge_computer_takeover_status",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Query human takeover status and AI input lock state.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerTakeoverStatusHandler",
    "rpcMethod": "computer.takeoverStatus",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "takeover_status",
    "name": "takeover_status",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_takeover_status.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerTakeoverStatusHandler",
    "rpcMethod": "computer.takeoverStatus",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_locate_ui",
    "name": "localbridge_computer_locate_ui",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Autonomous multi-level semantic UI locator (UI Automation -> Control Tree -> Accessibility -> OCR -> Local Vision). Resolves semantic targets like '保存按钮' into exact screen coordinates without hardcoding.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "target": {
          "type": "string"
        },
        "targetType": {
          "type": "string",
          "enum": [
            "button",
            "menu",
            "input",
            "text",
            "window",
            "canvas",
            "any"
          ],
          "default": "any"
        },
        "windowHandleOrTitle": {
          "type": "string"
        },
        "preferredLevel": {
          "type": "integer",
          "minimum": 1,
          "maximum": 6,
          "default": 1
        },
        "maxWaitMs": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 5000
        }
      },
      "required": [
        "target"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerTaskAcceptanceHandler",
    "rpcMethod": "computer.taskAcceptance",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "locate_ui",
    "name": "locate_ui",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_locate_ui: resolve semantic UI targets to click coordinates.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "target": {
          "type": "string"
        },
        "targetType": {
          "type": "string",
          "enum": [
            "button",
            "menu",
            "input",
            "text",
            "window",
            "canvas",
            "any"
          ],
          "default": "any"
        },
        "windowHandleOrTitle": {
          "type": "string"
        },
        "preferredLevel": {
          "type": "integer",
          "minimum": 1,
          "maximum": 6,
          "default": 1
        },
        "maxWaitMs": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 5000
        }
      },
      "required": [
        "target"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerTaskAcceptanceHandler",
    "rpcMethod": "computer.taskAcceptance",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_task_acceptance",
    "name": "localbridge_computer_task_acceptance",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Multi-dimensional task acceptance verification engine. Verifies required files exist with size > 0, text matches content, required windows closed, and artifacts created.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requiredFiles": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "path": {
                "type": "string"
              },
              "minSizeBytes": {
                "type": "integer",
                "minimum": 0
              },
              "textMatches": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "contentContains": {
                "type": "string"
              },
              "contentHash": {
                "type": "string"
              }
            },
            "required": [
              "path"
            ],
            "additionalProperties": false
          }
        },
        "requiredWindowsClosed": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "requiredProcessesKilled": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "requiredArtifacts": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerLoopCheckHandler",
    "rpcMethod": "computer.loopCheck",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "task_acceptance",
    "name": "task_acceptance",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_task_acceptance: evaluate final task outcome.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "requiredFiles": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "path": {
                "type": "string"
              },
              "minSizeBytes": {
                "type": "integer",
                "minimum": 0
              },
              "textMatches": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "contentContains": {
                "type": "string"
              },
              "contentHash": {
                "type": "string"
              }
            },
            "required": [
              "path"
            ],
            "additionalProperties": false
          }
        },
        "requiredWindowsClosed": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "requiredProcessesKilled": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "requiredArtifacts": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerLoopCheckHandler",
    "rpcMethod": "computer.loopCheck",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_loop_check",
    "name": "localbridge_computer_loop_check",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Execution Loop Detector: inspects recent actions for repetitive loops, oscillating calls, and zero-progress patterns.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerLoopCheckHandler",
    "rpcMethod": "computer.loopCheck",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "loop_check",
    "name": "loop_check",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_loop_check.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerLoopCheckHandler",
    "rpcMethod": "computer.loopCheck",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_state_get",
    "name": "localbridge_computer_state_get",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Get Execution Memory and compressed operational context (SUMMARY, RECENT, RAW). Prevents prompt token explosion on long multi-step tasks.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "tier": {
          "type": "string",
          "enum": [
            "SUMMARY",
            "RECENT",
            "RAW",
            "CHECKPOINT",
            "IMPORTANT"
          ],
          "default": "SUMMARY"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerStateGetHandler",
    "rpcMethod": "computer.stateGet",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "computer_state_get",
    "name": "computer_state_get",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_state_get.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "tier": {
          "type": "string",
          "enum": [
            "SUMMARY",
            "RECENT",
            "RAW",
            "CHECKPOINT",
            "IMPORTANT"
          ],
          "default": "SUMMARY"
        }
      }
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerStateGetHandler",
    "rpcMethod": "computer.stateGet",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "computer.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_computer_realtime_stream",
    "name": "localbridge_computer_realtime_stream",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Configure REALTIME_COMPUTER_MODE streaming, screen change delta detection, and input event broadcasting.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean"
        },
        "streamFps": {
          "type": "number",
          "default": 1
        },
        "detectDelta": {
          "type": "boolean",
          "default": true
        },
        "broadcastMouseKeyboard": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "enabled"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerRealtimeStreamHandler",
    "rpcMethod": "computer.realtimeStream",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "realtime_computer_mode",
    "name": "realtime_computer_mode",
    "version": "1.0.0",
    "namespace": "computer",
    "category": "computer-use",
    "description": "Alias for localbridge_computer_realtime_stream.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean"
        },
        "streamFps": {
          "type": "number",
          "default": 1
        },
        "detectDelta": {
          "type": "boolean",
          "default": true
        },
        "broadcastMouseKeyboard": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "enabled"
      ]
    },
    "providerId": "provider.computer_use",
    "providerImplementation": "WindowsComputerUseService (apps/runner/src/computer-use/computer-use-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/computer-use.ts -> createComputerRealtimeStreamHandler",
    "rpcMethod": "computer.realtimeStream",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "computer.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_register",
    "name": "localbridge_agent_register",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "Register an AI Agent identity and advertise its role, capabilities, and endpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "role": {
          "type": "string",
          "minLength": 1
        },
        "capabilities": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "endpoint": {
          "type": "string"
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "name",
        "role"
      ]
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.agent_register",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_comm.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_unregister",
    "name": "localbridge_agent_unregister",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "Unregister an AI agent identity.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        }
      },
      "required": [
        "agentId"
      ]
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.agent_unregister",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_comm.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_list",
    "name": "localbridge_agent_list",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "List currently registered agents, filtered by role or status.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "online",
            "busy",
            "idle",
            "offline"
          ]
        },
        "role": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.agent_list",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_comm.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_endpoint_bind",
    "name": "localbridge_agent_endpoint_bind",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "Bind or update the communication endpoint for an agent.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        },
        "endpoint": {
          "type": "string"
        }
      },
      "required": [
        "agentId",
        "endpoint"
      ]
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.agent_endpoint_bind",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_comm.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_message_send",
    "name": "localbridge_message_send",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "Send a message to another agent or broadcast across a conversation thread.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "conversationId": {
          "type": "string"
        },
        "senderId": {
          "type": "string"
        },
        "recipientId": {
          "type": "string"
        },
        "messageType": {
          "type": "string",
          "enum": [
            "request",
            "response",
            "notification",
            "handoff",
            "error"
          ]
        },
        "subject": {
          "type": "string"
        },
        "payload": {},
        "replyToId": {
          "type": "string"
        }
      },
      "required": [
        "senderId",
        "recipientId"
      ]
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.message_send",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_comm.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_message_read",
    "name": "localbridge_message_read",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "Read incoming unread or queued messages for an agent.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        },
        "conversationId": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "sent",
            "delivered",
            "read",
            "acknowledged"
          ]
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 100,
          "default": 50
        }
      },
      "required": [
        "agentId"
      ]
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.message_read",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_comm.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_message_ack",
    "name": "localbridge_message_ack",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "Acknowledge receipt and processing of messages.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "messageId": {
          "type": "string"
        },
        "agentId": {
          "type": "string"
        },
        "responsePayload": {}
      },
      "required": [
        "messageId",
        "agentId"
      ]
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.message_ack",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_comm.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_conversation_create",
    "name": "localbridge_conversation_create",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "Start a multi-agent collaborative conversation thread.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "minLength": 1
        },
        "participants": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "minItems": 1
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "title",
        "participants"
      ]
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.conversation_create",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_comm.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_conversation_list",
    "name": "localbridge_conversation_list",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "List active conversations and participant agent threads.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 100,
          "default": 30
        }
      }
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.conversation_list",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_comm.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_handoff",
    "name": "localbridge_agent_handoff",
    "version": "1.0.0",
    "namespace": "agent_comm",
    "category": "agent-comm",
    "description": "Perform structured task and context handoff to a peer agent.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "fromAgentId": {
          "type": "string"
        },
        "toAgentId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "contextSummary": {
          "type": "string"
        },
        "checkpoints": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "artifacts": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "fromAgentId",
        "toAgentId",
        "contextSummary"
      ]
    },
    "providerId": "provider.agent_comm",
    "providerImplementation": "AgentCommunicationService (apps/server/src/agent-comm/communication-service.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/agent-comm.ts",
    "rpcMethod": "server.agent_comm.agent_handoff",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_comm.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_set",
    "name": "localbridge_memory_set",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Store scoped memory (global, project, session, agent, task) in authoritative Server IntelligenceStore with key, value, and tags.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string",
          "minLength": 1
        },
        "value": {},
        "scope": {
          "type": "string",
          "enum": [
            "global",
            "project",
            "session",
            "agent",
            "task"
          ],
          "default": "project"
        },
        "scopeId": {
          "type": "string"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "key"
      ]
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts -> createMemorySetHandler",
    "rpcMethod": "memory.set",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "memory.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_get",
    "name": "localbridge_memory_get",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Retrieve a memory entry by key and scope from authoritative IntelligenceStore.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "scope": {
          "type": "string",
          "enum": [
            "global",
            "project",
            "session",
            "agent",
            "task"
          ],
          "default": "project"
        },
        "scopeId": {
          "type": "string"
        }
      },
      "required": [
        "key"
      ]
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts -> createMemoryGetHandler",
    "rpcMethod": "memory.get",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "memory.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_search",
    "name": "localbridge_memory_search",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Search memory entries matching a keyword query across scopes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string"
        },
        "scope": {
          "type": "string",
          "enum": [
            "global",
            "project",
            "session",
            "agent",
            "task"
          ]
        },
        "scopeId": {
          "type": "string"
        },
        "tag": {
          "type": "string"
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 100,
          "default": 50
        }
      }
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts -> createMemorySearchHandler",
    "rpcMethod": "memory.search",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "memory.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_delete",
    "name": "localbridge_memory_delete",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Delete a specific memory entry.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "scope": {
          "type": "string",
          "enum": [
            "global",
            "project",
            "session",
            "agent",
            "task"
          ],
          "default": "project"
        },
        "scopeId": {
          "type": "string"
        }
      },
      "required": [
        "key"
      ]
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts -> createMemoryDeleteHandler",
    "rpcMethod": "memory.delete",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "memory.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_purge",
    "name": "localbridge_memory_purge",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Purge memory entries for a given scope or scopeId.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "scope": {
          "type": "string",
          "enum": [
            "global",
            "project",
            "session",
            "agent",
            "task"
          ]
        },
        "scopeId": {
          "type": "string"
        }
      },
      "required": [
        "scope"
      ]
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts -> createMemoryPurgeHandler",
    "rpcMethod": "memory.purge",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "memory.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_recall",
    "name": "localbridge_memory_recall",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Recall enhanced memories by query, scope, importance, confidence, or tag with transparent reasoning.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string"
        },
        "scope": {
          "type": "string",
          "enum": [
            "GLOBAL",
            "USER",
            "PROJECT",
            "SESSION",
            "TASK",
            "AGENT",
            "STEP"
          ]
        },
        "scopeId": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "enum": [
            "FACT",
            "PREFERENCE",
            "EPISODIC",
            "SEMANTIC",
            "PROCEDURAL",
            "EXPERIENCE",
            "DECISION",
            "ARTIFACT",
            "ERROR",
            "SOLUTION"
          ]
        },
        "tag": {
          "type": "string"
        },
        "skillId": {
          "type": "string"
        },
        "minImportance": {
          "type": "number",
          "minimum": 0,
          "maximum": 10
        },
        "minConfidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "includeArchived": {
          "type": "boolean",
          "default": false
        },
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 100,
          "default": 20
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "default": 0
        }
      }
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts -> createMemoryPurgeHandler",
    "rpcMethod": "memory.purge",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "memory.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_candidate_create",
    "name": "localbridge_memory_candidate_create",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Create an uncommitted memory candidate with full provenance and execution evidence.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "content": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "enum": [
            "FACT",
            "PREFERENCE",
            "EPISODIC",
            "SEMANTIC",
            "PROCEDURAL",
            "EXPERIENCE",
            "DECISION",
            "ARTIFACT",
            "ERROR",
            "SOLUTION"
          ],
          "default": "EXPERIENCE"
        },
        "scope": {
          "type": "string",
          "enum": [
            "GLOBAL",
            "USER",
            "PROJECT",
            "SESSION",
            "TASK",
            "AGENT",
            "STEP"
          ],
          "default": "PROJECT"
        },
        "scopeId": {
          "type": "string"
        },
        "importance": {
          "type": "number",
          "minimum": 0,
          "maximum": 10,
          "default": 5
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "default": 0.8
        },
        "source": {
          "type": "string",
          "enum": [
            "USER",
            "AI",
            "CONVERSATION",
            "SKILL",
            "TASK",
            "ACTION",
            "PROJECT",
            "FILE",
            "IMPORT",
            "SYSTEM"
          ],
          "default": "ACTION"
        },
        "provenance": {
          "type": "object",
          "properties": {
            "source": {
              "$ref": "#/properties/source"
            },
            "skillId": {
              "type": "string"
            },
            "taskId": {
              "type": "string"
            },
            "sessionId": {
              "type": "string"
            },
            "actionIds": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            },
            "executionId": {
              "type": "string"
            },
            "result": {
              "type": "string",
              "enum": [
                "SUCCESS",
                "FAILURE",
                "PARTIAL",
                "UNKNOWN"
              ]
            },
            "evidence": {
              "type": "string"
            },
            "observedPath": {
              "type": "string"
            },
            "recoveryAction": {
              "type": "string"
            }
          },
          "required": [
            "source"
          ],
          "additionalProperties": false
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        }
      },
      "required": [
        "key",
        "content",
        "provenance"
      ]
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts",
    "rpcMethod": "server.memory.memory_candidate_create",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "memory.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_candidate_accept",
    "name": "localbridge_memory_candidate_accept",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Accept and persist a memory candidate into active memory in the IntelligenceStore.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "candidateId": {
          "type": "string"
        },
        "reviewNotes": {
          "type": "string"
        }
      },
      "required": [
        "candidateId"
      ]
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts",
    "rpcMethod": "server.memory.memory_candidate_accept",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "memory.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_archive",
    "name": "localbridge_memory_archive",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Archive or forget a memory entry.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "forget": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "id"
      ]
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts",
    "rpcMethod": "server.memory.memory_archive",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "memory.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_memory_consolidate",
    "name": "localbridge_memory_consolidate",
    "version": "1.0.0",
    "namespace": "memory",
    "category": "memory",
    "description": "Consolidate duplicate, conflicting, or superseding memories across a scope.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "scope": {
          "type": "string",
          "enum": [
            "GLOBAL",
            "USER",
            "PROJECT",
            "SESSION",
            "TASK",
            "AGENT",
            "STEP"
          ]
        },
        "scopeId": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.memory",
    "providerImplementation": "ProjectMemoryService + IntelligenceMemoryService (apps/runner/src/memory/ & apps/server/src/intelligence/)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/memory.ts",
    "rpcMethod": "server.memory.memory_consolidate",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "memory.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_validation_run",
    "name": "localbridge_validation_run",
    "version": "1.0.0",
    "namespace": "validation",
    "category": "validation",
    "description": "Run automated project validation (typecheck, lint, build, test, format) across Node, Rust, Python, Go, and Java ecosystems.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "checkType": {
          "type": "string",
          "enum": [
            "all",
            "build",
            "test",
            "lint",
            "typecheck",
            "format"
          ],
          "default": "all"
        },
        "commandOverride": {
          "type": "string"
        },
        "timeoutMs": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 120000
        }
      },
      "required": [
        "projectId"
      ]
    },
    "providerId": "provider.validation",
    "providerImplementation": "UnifiedValidationService (apps/runner/src/validation/validation-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/validation.ts -> createValidationRunHandler",
    "rpcMethod": "validation.run",
    "executionMode": "process",
    "riskLevel": "high",
    "safetyClassification": "HIGH_RISK",
    "permissionModel": "PROCESS",
    "mcpScope": "execute",
    "permissions": [
      "validation.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_workflow_work_on_project",
    "name": "localbridge_workflow_work_on_project",
    "version": "1.0.0",
    "namespace": "workflow",
    "category": "workflow",
    "description": "High-level workflow: prepare project context, verify git status, snapshot checkpoint, and establish execution environment.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "goal": {
          "type": "string",
          "minLength": 1
        },
        "agentRole": {
          "type": "string",
          "default": "autonomous-coder"
        },
        "autoCheckpoint": {
          "type": "boolean",
          "default": true
        },
        "autoValidate": {
          "type": "boolean",
          "default": true
        },
        "autoClean": {
          "type": "boolean",
          "default": true
        },
        "maxIterations": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 10
        }
      },
      "required": [
        "projectId",
        "goal"
      ]
    },
    "providerId": "provider.workflow",
    "providerImplementation": "WorkflowOrchestrator (apps/server/src/workflow/workflow-orchestrator.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/workflow.ts",
    "rpcMethod": "server.workflow.workflow_work_on_project",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "workflow.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_workflow_finish_coding_task",
    "name": "localbridge_workflow_finish_coding_task",
    "version": "1.0.0",
    "namespace": "workflow",
    "category": "workflow",
    "description": "High-level workflow: run validation, hygiene check, git diff summary, and finalize task lifecycle.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "runValidation": {
          "type": "boolean",
          "default": true
        },
        "cleanZombies": {
          "type": "boolean",
          "default": true
        },
        "createFinalCheckpoint": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "projectId",
        "taskId"
      ]
    },
    "providerId": "provider.workflow",
    "providerImplementation": "WorkflowOrchestrator (apps/server/src/workflow/workflow-orchestrator.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/workflow.ts",
    "rpcMethod": "server.workflow.workflow_finish_coding_task",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "workflow.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_coding_agent_start",
    "name": "localbridge_coding_agent_start",
    "version": "1.0.0",
    "namespace": "workflow",
    "category": "workflow",
    "description": "Launch an autonomous Coding Agent controller that manages subtasks, terminals, and runtimes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "goal": {
          "type": "string",
          "minLength": 1
        },
        "sessionId": {
          "type": "string"
        },
        "plan": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "projectId",
        "goal"
      ]
    },
    "providerId": "provider.workflow",
    "providerImplementation": "WorkflowOrchestrator (apps/server/src/workflow/workflow-orchestrator.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/workflow.ts",
    "rpcMethod": "server.workflow.coding_agent_start",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "workflow.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_coding_agent_observe",
    "name": "localbridge_coding_agent_observe",
    "version": "1.0.0",
    "namespace": "workflow",
    "category": "workflow",
    "description": "Observe running Coding Agent status, action logs, and runtime resource usage.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        }
      },
      "required": [
        "agentId"
      ]
    },
    "providerId": "provider.workflow",
    "providerImplementation": "WorkflowOrchestrator (apps/server/src/workflow/workflow-orchestrator.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/workflow.ts",
    "rpcMethod": "server.workflow.coding_agent_observe",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "workflow.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_coding_agent_cancel",
    "name": "localbridge_coding_agent_cancel",
    "version": "1.0.0",
    "namespace": "workflow",
    "category": "workflow",
    "description": "Cancel a running Coding Agent controller and tear down owned child processes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        },
        "rollbackToCheckpoint": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "agentId"
      ]
    },
    "providerId": "provider.workflow",
    "providerImplementation": "WorkflowOrchestrator (apps/server/src/workflow/workflow-orchestrator.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/workflow.ts",
    "rpcMethod": "server.workflow.coding_agent_cancel",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "workflow.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_launch",
    "name": "localbridge_browser_launch",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Launch a real Chromium (Edge or Chrome) instance with persistent session and CDP control.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "headless": {
          "type": "boolean",
          "default": true
        },
        "browserType": {
          "type": "string",
          "enum": [
            "chrome",
            "edge",
            "auto"
          ],
          "default": "auto"
        },
        "viewport": {
          "type": "object",
          "properties": {
            "width": {
              "type": "number",
              "default": 1280
            },
            "height": {
              "type": "number",
              "default": 800
            }
          },
          "additionalProperties": false
        },
        "allowedDomains": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "blockedDomains": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "userDataDir": {
          "type": "string"
        },
        "timeoutMs": {
          "type": "number",
          "default": 30000
        }
      }
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.launch",
    "rpcMethod": "browser.launch",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_close",
    "name": "localbridge_browser_close",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Close an active browser session and terminate its host process.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "force": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.close",
    "rpcMethod": "browser.close",
    "executionMode": "browser",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_list",
    "name": "localbridge_browser_list",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "List all active and managed browser sessions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.list",
    "rpcMethod": "browser.list",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_status",
    "name": "localbridge_browser_status",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Get detailed health, tabs, and process status for a browser session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.status",
    "rpcMethod": "browser.status",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_open",
    "name": "localbridge_browser_open",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Navigate active tab to a specified URL with security boundary checks.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        },
        "timeoutMs": {
          "type": "number",
          "default": 30000
        },
        "waitUntil": {
          "type": "string",
          "enum": [
            "load",
            "domcontentloaded",
            "networkidle"
          ],
          "default": "load"
        }
      },
      "required": [
        "browserSessionId",
        "url"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.open",
    "rpcMethod": "browser.open",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_back",
    "name": "localbridge_browser_back",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Navigate backward in active tab's history.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.back",
    "rpcMethod": "browser.back",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_forward",
    "name": "localbridge_browser_forward",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Navigate forward in active tab's history.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.forward",
    "rpcMethod": "browser.forward",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_reload",
    "name": "localbridge_browser_reload",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Reload current page in active tab.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "ignoreCache": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.reload",
    "rpcMethod": "browser.reload",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_wait",
    "name": "localbridge_browser_wait",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Wait for element selector or time delay on page.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "durationMs": {
          "type": "number"
        },
        "state": {
          "type": "string",
          "enum": [
            "visible",
            "hidden",
            "attached",
            "detached"
          ],
          "default": "visible"
        },
        "timeoutMs": {
          "type": "number",
          "default": 10000
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.wait",
    "rpcMethod": "browser.wait",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_snapshot",
    "name": "localbridge_browser_snapshot",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Capture structural DOM tree and interactive element summary of current page.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "maxDepth": {
          "type": "number",
          "default": 5
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.snapshot",
    "rpcMethod": "browser.snapshot",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_screenshot",
    "name": "localbridge_browser_screenshot",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Capture high-resolution viewport or full-page screenshot as base64 image.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "fullPage": {
          "type": "boolean",
          "default": false
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "jpeg"
          ],
          "default": "png"
        },
        "quality": {
          "type": "number",
          "minimum": 0,
          "maximum": 100
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.screenshot",
    "rpcMethod": "browser.screenshot",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_find",
    "name": "localbridge_browser_find",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Locate elements on page by CSS selector and retrieve coordinates and attributes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "limit": {
          "type": "number",
          "default": 20
        }
      },
      "required": [
        "browserSessionId",
        "selector"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.find",
    "rpcMethod": "browser.find",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_extract",
    "name": "localbridge_browser_extract",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Extract structured text and attribute values from elements on page.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "attributes": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "extractText": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "browserSessionId",
        "selector"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.extract",
    "rpcMethod": "browser.extract",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_element_state",
    "name": "localbridge_browser_element_state",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Query element visibility, enabled state, checked value, and bounding box.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId",
        "selector"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.elementState",
    "rpcMethod": "browser.elementState",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_click",
    "name": "localbridge_browser_click",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Perform real native mouse click on target element via CDP input injection.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "button": {
          "type": "string",
          "enum": [
            "left",
            "right",
            "middle"
          ],
          "default": "left"
        },
        "clickCount": {
          "type": "number",
          "default": 1
        },
        "waitForNavigation": {
          "type": "boolean",
          "default": false
        }
      },
      "required": [
        "browserSessionId",
        "selector"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.click",
    "rpcMethod": "browser.click",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_type",
    "name": "localbridge_browser_type",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Type text into target input/textarea element character by character.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "text": {
          "type": "string"
        },
        "clearFirst": {
          "type": "boolean",
          "default": false
        },
        "delayMs": {
          "type": "number",
          "default": 0
        }
      },
      "required": [
        "browserSessionId",
        "selector",
        "text"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.type",
    "rpcMethod": "browser.type",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_key",
    "name": "localbridge_browser_key",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Send keyboard shortcut or keypress (e.g. Enter, Tab, Escape) to active page.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "key": {
          "type": "string"
        },
        "modifiers": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "Alt",
              "Control",
              "Meta",
              "Shift"
            ]
          }
        }
      },
      "required": [
        "browserSessionId",
        "key"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.key",
    "rpcMethod": "browser.key",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_select",
    "name": "localbridge_browser_select",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Select one or more options in a <select> dropdown element.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "values": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "browserSessionId",
        "selector",
        "values"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.select",
    "rpcMethod": "browser.select",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_scroll",
    "name": "localbridge_browser_scroll",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Scroll page or specific element by delta X and delta Y.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "deltaX": {
          "type": "number",
          "default": 0
        },
        "deltaY": {
          "type": "number",
          "default": 100
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.scroll",
    "rpcMethod": "browser.scroll",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_hover",
    "name": "localbridge_browser_hover",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Move mouse pointer over target element to trigger hover effects.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId",
        "selector"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.hover",
    "rpcMethod": "browser.hover",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_tabs",
    "name": "localbridge_browser_tabs",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "List all open tabs in browser session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.tabs",
    "rpcMethod": "browser.tabs",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_tab_create",
    "name": "localbridge_browser_tab_create",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Create a new browser tab with optional URL.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.tabCreate",
    "rpcMethod": "browser.tabCreate",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_tab_close",
    "name": "localbridge_browser_tab_close",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Close a specific browser tab by ID.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "tabId": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId",
        "tabId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.tabClose",
    "rpcMethod": "browser.tabClose",
    "executionMode": "browser",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_tab_switch",
    "name": "localbridge_browser_tab_switch",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Switch active focus to a different browser tab.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "tabId": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId",
        "tabId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.tabSwitch",
    "rpcMethod": "browser.tabSwitch",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "execute",
    "permissions": [
      "browser.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_console",
    "name": "localbridge_browser_console",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Retrieve console logs recorded in browser session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "limit": {
          "type": "number",
          "default": 50
        },
        "level": {
          "type": "string",
          "enum": [
            "all",
            "log",
            "info",
            "warn",
            "error"
          ],
          "default": "all"
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.console",
    "rpcMethod": "browser.console",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_network",
    "name": "localbridge_browser_network",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Retrieve network requests recorded in browser session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "limit": {
          "type": "number",
          "default": 50
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.network",
    "rpcMethod": "browser.network",
    "executionMode": "browser",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "browser.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_cookies",
    "name": "localbridge_browser_cookies",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Inspect, set, or clear browser session cookies.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "action": {
          "type": "string",
          "enum": [
            "get",
            "set",
            "clear"
          ],
          "default": "get"
        },
        "cookies": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string"
              },
              "value": {
                "type": "string"
              },
              "domain": {
                "type": "string"
              },
              "path": {
                "type": "string",
                "default": "/"
              },
              "expires": {
                "type": "number"
              },
              "httpOnly": {
                "type": "boolean"
              },
              "secure": {
                "type": "boolean"
              },
              "sameSite": {
                "type": "string",
                "enum": [
                  "Strict",
                  "Lax",
                  "None"
                ]
              }
            },
            "required": [
              "name",
              "value"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.cookies",
    "rpcMethod": "browser.cookies",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "write",
    "permissions": [
      "browser.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_storage",
    "name": "localbridge_browser_storage",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Inspect, set, or clear localStorage and sessionStorage.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "enum": [
            "local",
            "session"
          ],
          "default": "local"
        },
        "action": {
          "type": "string",
          "enum": [
            "get",
            "set",
            "remove",
            "clear"
          ],
          "default": "get"
        },
        "key": {
          "type": "string"
        },
        "value": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.storage",
    "rpcMethod": "browser.storage",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "write",
    "permissions": [
      "browser.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_download",
    "name": "localbridge_browser_download",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Download remote file into sandboxed project destination directory.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        },
        "destinationPath": {
          "type": "string"
        },
        "timeoutMs": {
          "type": "number",
          "default": 30000
        }
      },
      "required": [
        "browserSessionId",
        "url",
        "destinationPath"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.download",
    "rpcMethod": "browser.download",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "write",
    "permissions": [
      "browser.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_browser_upload",
    "name": "localbridge_browser_upload",
    "version": "1.0.0",
    "namespace": "browser",
    "category": "browser",
    "description": "Upload file from sandboxed project workspace into target file input element.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "browserSessionId": {
          "type": "string"
        },
        "selector": {
          "type": "string"
        },
        "sourcePath": {
          "type": "string"
        }
      },
      "required": [
        "browserSessionId",
        "selector",
        "sourcePath"
      ]
    },
    "providerId": "provider.browser",
    "providerImplementation": "LocalBridgeBrowserService (apps/runner/src/browser/browser-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/browser.ts -> browserHandlers.upload",
    "rpcMethod": "browser.upload",
    "executionMode": "browser",
    "riskLevel": "medium",
    "safetyClassification": "NETWORK_SAFE",
    "permissionModel": "NETWORK",
    "mcpScope": "write",
    "permissions": [
      "browser.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_plan_create",
    "name": "localbridge_agent_plan_create",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Create a persistent multi-step plan for agent goal execution.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "goal": {
          "type": "string",
          "minLength": 1
        },
        "steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "priority": {
                "type": "string",
                "enum": [
                  "low",
                  "medium",
                  "high",
                  "critical"
                ]
              },
              "dependencies": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "assignedAgent": {
                "type": "string"
              }
            },
            "required": [
              "title"
            ],
            "additionalProperties": false
          }
        },
        "dependencies": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "title",
        "goal",
        "steps"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.createPlan",
    "rpcMethod": "agent_plan.create",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_plan_get",
    "name": "localbridge_agent_plan_get",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Get agent plan details and step execution statuses.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "planId": {
          "type": "string"
        }
      },
      "required": [
        "planId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.getPlan",
    "rpcMethod": "agent_plan.get",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_plan.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_plan_update",
    "name": "localbridge_agent_plan_update",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Update plan status, step statuses, or metadata.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "planId": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "draft",
            "active",
            "paused",
            "completed",
            "failed",
            "cancelled"
          ]
        },
        "currentStep": {
          "type": "string"
        },
        "steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "stepId": {
                "type": "string"
              },
              "title": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "status": {
                "type": "string",
                "enum": [
                  "pending",
                  "ready",
                  "running",
                  "blocked",
                  "completed",
                  "failed",
                  "cancelled"
                ],
                "default": "pending"
              },
              "priority": {
                "type": "string",
                "enum": [
                  "low",
                  "medium",
                  "high",
                  "critical"
                ],
                "default": "medium"
              },
              "dependencies": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "default": []
              },
              "assignedAgent": {
                "type": "string"
              },
              "attempts": {
                "type": "number",
                "default": 0
              },
              "startedAt": {
                "type": "number"
              },
              "completedAt": {
                "type": "number"
              },
              "result": {},
              "artifacts": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "default": []
              },
              "checkpoint": {
                "type": "string"
              }
            },
            "required": [
              "stepId",
              "title"
            ],
            "additionalProperties": false
          }
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "planId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.updatePlan",
    "rpcMethod": "agent_plan.update",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_plan_delete",
    "name": "localbridge_agent_plan_delete",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Delete an agent plan.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "planId": {
          "type": "string"
        }
      },
      "required": [
        "planId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.deletePlan",
    "rpcMethod": "agent_plan.delete",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_plan_complete",
    "name": "localbridge_agent_plan_complete",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Mark plan and its steps as completed with final output artifacts.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "planId": {
          "type": "string"
        },
        "result": {},
        "artifacts": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "planId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.completePlan",
    "rpcMethod": "agent_plan.complete",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_plan_list",
    "name": "localbridge_agent_plan_list",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "List active or historical agent plans.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "draft",
            "active",
            "paused",
            "completed",
            "failed",
            "cancelled"
          ]
        },
        "limit": {
          "type": "number",
          "default": 50
        }
      }
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.listPlans",
    "rpcMethod": "agent_plan.list",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_plan.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_todo_create",
    "name": "localbridge_agent_todo_create",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Create an agent action item linked to task, plan, and session.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "planId": {
          "type": "string"
        },
        "stepId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "agentId": {
          "type": "string"
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "priority": {
          "type": "string",
          "enum": [
            "low",
            "medium",
            "high",
            "urgent"
          ]
        },
        "notes": {
          "type": "string"
        }
      },
      "required": [
        "title"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.createTodo",
    "rpcMethod": "agent_todo.create",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_todo_update",
    "name": "localbridge_agent_todo_update",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Update todo status, priority, or notes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "todoId": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "pending",
            "in_progress",
            "completed",
            "cancelled"
          ]
        },
        "priority": {
          "type": "string",
          "enum": [
            "low",
            "medium",
            "high",
            "urgent"
          ]
        },
        "notes": {
          "type": "string"
        }
      },
      "required": [
        "todoId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.updateTodo",
    "rpcMethod": "agent_todo.update",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_todo_complete",
    "name": "localbridge_agent_todo_complete",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Mark an agent todo as completed.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "todoId": {
          "type": "string"
        },
        "notes": {
          "type": "string"
        }
      },
      "required": [
        "todoId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.completeTodo",
    "rpcMethod": "agent_todo.complete",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_todo_list",
    "name": "localbridge_agent_todo_list",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "List todos matching task, plan, session, or status filters.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentTaskId": {
          "type": "string"
        },
        "planId": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "agentId": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "pending",
            "in_progress",
            "completed",
            "cancelled"
          ]
        }
      }
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.listTodos",
    "rpcMethod": "agent_todo.list",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_plan.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_delegate",
    "name": "localbridge_agent_delegate",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Delegate a sub-task or plan step to a specialized sub-agent role.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "parentAgentId": {
          "type": "string"
        },
        "childAgentRole": {
          "type": "string"
        },
        "taskTitle": {
          "type": "string"
        },
        "planStepId": {
          "type": "string"
        },
        "context": {
          "type": "object",
          "additionalProperties": {}
        },
        "timeoutMs": {
          "type": "number",
          "default": 60000
        }
      },
      "required": [
        "parentAgentId",
        "childAgentRole",
        "taskTitle"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.delegate",
    "rpcMethod": "agent.delegate",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_plan.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_fork",
    "name": "localbridge_agent_fork",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Fork agent execution into a parallel child with inherited context and isolated memory.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "parentAgentId": {
          "type": "string"
        },
        "inheritTasks": {
          "type": "boolean",
          "default": true
        },
        "inheritPlan": {
          "type": "boolean",
          "default": true
        },
        "isolatedMemory": {
          "type": "boolean",
          "default": true
        },
        "role": {
          "type": "string"
        },
        "quota": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "parentAgentId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.fork",
    "rpcMethod": "agent.fork",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_plan.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_join",
    "name": "localbridge_agent_join",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Wait for parallel child agents to complete and collect their outputs.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "parentAgentId": {
          "type": "string"
        },
        "childAgentIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "timeoutMs": {
          "type": "number",
          "default": 30000
        }
      },
      "required": [
        "parentAgentId",
        "childAgentIds"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.join",
    "rpcMethod": "agent.join",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_plan.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_supervise",
    "name": "localbridge_agent_supervise",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Monitor agent heartbeats, detect stalled tasks, and trigger retry/pause/reconcile.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "supervisorAgentId": {
          "type": "string"
        },
        "targetAgentIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "action": {
          "type": "string",
          "enum": [
            "status",
            "reconcile",
            "retry",
            "pause",
            "resume",
            "escalate"
          ],
          "default": "status"
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "supervisorAgentId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.supervise",
    "rpcMethod": "agent.supervise",
    "executionMode": "agent",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "agent_plan.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_dependency_create",
    "name": "localbridge_agent_dependency_create",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Register an execution dependency between agents.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        },
        "dependsOnAgentId": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "agentId",
        "dependsOnAgentId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.createDependency",
    "rpcMethod": "agent_dep.create",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_dependency_list",
    "name": "localbridge_agent_dependency_list",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "List dependencies for an agent.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agentId": {
          "type": "string"
        },
        "dependsOnAgentId": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.listDependencies",
    "rpcMethod": "agent_dep.list",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_plan.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_dependency_remove",
    "name": "localbridge_agent_dependency_remove",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Remove an agent execution dependency.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "dependencyId": {
          "type": "string"
        }
      },
      "required": [
        "dependencyId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.removeDependency",
    "rpcMethod": "agent_dep.remove",
    "executionMode": "agent",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_budget_set",
    "name": "localbridge_agent_budget_set",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Configure resource quotas (runtime, tool calls, memory, processes, browser sessions) for an agent.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "targetId": {
          "type": "string"
        },
        "targetType": {
          "type": "string",
          "enum": [
            "agent",
            "project",
            "session"
          ],
          "default": "agent"
        },
        "quota": {
          "type": "object",
          "properties": {
            "maxRuntimeMs": {
              "type": "number",
              "default": 3600000
            },
            "maxToolCalls": {
              "type": "number",
              "default": 500
            },
            "maxProcesses": {
              "type": "number",
              "default": 10
            },
            "maxMemoryMb": {
              "type": "number",
              "default": 2048
            },
            "maxCpuPercent": {
              "type": "number",
              "default": 80
            },
            "maxArtifacts": {
              "type": "number",
              "default": 50
            },
            "maxArtifactSizeBytes": {
              "type": "number",
              "default": 104857600
            },
            "maxBrowserSessions": {
              "type": "number",
              "default": 3
            },
            "maxConcurrentAgents": {
              "type": "number",
              "default": 5
            }
          },
          "additionalProperties": false
        }
      },
      "required": [
        "targetId",
        "quota"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.setBudget",
    "rpcMethod": "agent_budget.set",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "agent_plan.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_budget_get",
    "name": "localbridge_agent_budget_get",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Get current resource quota limits and live usage counters for an agent.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "targetId": {
          "type": "string"
        }
      },
      "required": [
        "targetId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.getBudget",
    "rpcMethod": "agent_budget.get",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_plan.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_agent_budget_check",
    "name": "localbridge_agent_budget_check",
    "version": "1.0.0",
    "namespace": "agent_plan",
    "category": "agent-plan",
    "description": "Verify if proposed resource increment exceeds budget and enforces pause/approval policies.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "targetId": {
          "type": "string"
        },
        "increment": {
          "type": "object",
          "properties": {
            "runtimeMs": {
              "type": "number",
              "default": 0
            },
            "toolCalls": {
              "type": "number",
              "default": 0
            },
            "processes": {
              "type": "number",
              "default": 0
            },
            "memoryMb": {
              "type": "number",
              "default": 0
            },
            "cpuPercent": {
              "type": "number",
              "default": 0
            },
            "artifacts": {
              "type": "number",
              "default": 0
            },
            "artifactSizeBytes": {
              "type": "number",
              "default": 0
            },
            "browserSessions": {
              "type": "number",
              "default": 0
            },
            "concurrentAgents": {
              "type": "number",
              "default": 0
            }
          },
          "additionalProperties": false
        }
      },
      "required": [
        "targetId"
      ]
    },
    "providerId": "provider.agent_plan",
    "providerImplementation": "AgentPlanningService (apps/runner/src/agent-plan/agent-plan-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/agent-plan.ts -> planHandlers.checkBudget",
    "rpcMethod": "agent_budget.check",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "agent_plan.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_event_publish",
    "name": "localbridge_event_publish",
    "version": "1.0.0",
    "namespace": "events",
    "category": "events",
    "description": "Publish a structured event to the system-wide Event Bus.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "minLength": 1
        },
        "payload": {},
        "source": {
          "type": "string"
        },
        "sessionId": {
          "type": "string"
        },
        "actionId": {
          "type": "string"
        },
        "checkpointId": {
          "type": "string"
        },
        "stateHash": {
          "type": "string"
        },
        "type": {
          "type": "string"
        },
        "correlationId": {
          "type": "string"
        },
        "causationId": {
          "type": "string"
        },
        "metadata": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "topic"
      ]
    },
    "providerId": "provider.events",
    "providerImplementation": "LocalBridgeEventBus (apps/runner/src/events/event-bus-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/events.ts -> eventHandlers.publish",
    "rpcMethod": "event.publish",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "events.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_event_subscribe",
    "name": "localbridge_event_subscribe",
    "version": "1.0.0",
    "namespace": "events",
    "category": "events",
    "description": "Create an event subscription matching a topic pattern.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "subscriberId": {
          "type": "string"
        },
        "topicPattern": {
          "type": "string",
          "default": "*"
        },
        "maxBufferSize": {
          "type": "number",
          "default": 100
        }
      },
      "required": [
        "subscriberId"
      ]
    },
    "providerId": "provider.events",
    "providerImplementation": "LocalBridgeEventBus (apps/runner/src/events/event-bus-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/events.ts -> eventHandlers.subscribe",
    "rpcMethod": "event.subscribe",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "events.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_event_unsubscribe",
    "name": "localbridge_event_unsubscribe",
    "version": "1.0.0",
    "namespace": "events",
    "category": "events",
    "description": "Cancel an active event subscription.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "subscriptionId": {
          "type": "string"
        }
      },
      "required": [
        "subscriptionId"
      ]
    },
    "providerId": "provider.events",
    "providerImplementation": "LocalBridgeEventBus (apps/runner/src/events/event-bus-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/events.ts -> eventHandlers.unsubscribe",
    "rpcMethod": "event.unsubscribe",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "events.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_event_poll",
    "name": "localbridge_event_poll",
    "version": "1.0.0",
    "namespace": "events",
    "category": "events",
    "description": "Poll queued events from a subscription buffer.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "subscriptionId": {
          "type": "string"
        },
        "limit": {
          "type": "number",
          "default": 20
        },
        "timeoutMs": {
          "type": "number",
          "default": 5000
        }
      },
      "required": [
        "subscriptionId"
      ]
    },
    "providerId": "provider.events",
    "providerImplementation": "LocalBridgeEventBus (apps/runner/src/events/event-bus-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/events.ts -> eventHandlers.poll",
    "rpcMethod": "event.poll",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "events.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_event_history",
    "name": "localbridge_event_history",
    "version": "1.0.0",
    "namespace": "events",
    "category": "events",
    "description": "Query durable event history by topic, time, or correlation ID.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "topicPattern": {
          "type": "string"
        },
        "sinceTimestamp": {
          "type": "number"
        },
        "correlationId": {
          "type": "string"
        },
        "source": {
          "type": "string"
        },
        "limit": {
          "type": "number",
          "default": 50
        }
      }
    },
    "providerId": "provider.events",
    "providerImplementation": "LocalBridgeEventBus (apps/runner/src/events/event-bus-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/events.ts -> eventHandlers.history",
    "rpcMethod": "event.history",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "events.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_event_replay",
    "name": "localbridge_event_replay",
    "version": "1.0.0",
    "namespace": "events",
    "category": "events",
    "description": "Replay past events within a time window for audit or recovery.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "topicPattern": {
          "type": "string"
        },
        "fromTimestamp": {
          "type": "number"
        },
        "toTimestamp": {
          "type": "number"
        },
        "targetSubscriptionId": {
          "type": "string"
        }
      },
      "required": [
        "fromTimestamp"
      ]
    },
    "providerId": "provider.events",
    "providerImplementation": "LocalBridgeEventBus (apps/runner/src/events/event-bus-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/events.ts -> eventHandlers.replay",
    "rpcMethod": "event.replay",
    "executionMode": "system",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "events.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_trace_start",
    "name": "localbridge_trace_start",
    "version": "1.0.0",
    "namespace": "trace",
    "category": "trace",
    "description": "Start a distributed trace or span for an operation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1
        },
        "service": {
          "type": "string"
        },
        "traceId": {
          "type": "string"
        },
        "parentSpanId": {
          "type": "string"
        },
        "attributes": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "name"
      ]
    },
    "providerId": "provider.trace",
    "providerImplementation": "LocalBridgeObservabilityService (apps/runner/src/trace/trace-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/trace.ts -> traceHandlers.start",
    "rpcMethod": "trace.start",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "trace.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_trace_end",
    "name": "localbridge_trace_end",
    "version": "1.0.0",
    "namespace": "trace",
    "category": "trace",
    "description": "Complete a trace span and record its duration, status, and error details.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "spanId": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "unset",
            "ok",
            "error"
          ],
          "default": "ok"
        },
        "error": {
          "type": "string"
        },
        "attributes": {
          "type": "object",
          "additionalProperties": {}
        }
      },
      "required": [
        "spanId"
      ]
    },
    "providerId": "provider.trace",
    "providerImplementation": "LocalBridgeObservabilityService (apps/runner/src/trace/trace-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/trace.ts -> traceHandlers.end",
    "rpcMethod": "trace.end",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "trace.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_trace_record",
    "name": "localbridge_trace_record",
    "version": "1.0.0",
    "namespace": "trace",
    "category": "trace",
    "description": "Record an event or log entry inside an active trace span.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "spanId": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "attributes": {
          "type": "object",
          "additionalProperties": {}
        },
        "timestamp": {
          "type": "number"
        }
      },
      "required": [
        "spanId",
        "name"
      ]
    },
    "providerId": "provider.trace",
    "providerImplementation": "LocalBridgeObservabilityService (apps/runner/src/trace/trace-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/trace.ts -> traceHandlers.record",
    "rpcMethod": "trace.record",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "trace.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_trace_get",
    "name": "localbridge_trace_get",
    "version": "1.0.0",
    "namespace": "trace",
    "category": "trace",
    "description": "Retrieve complete trace span tree by traceId.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "traceId": {
          "type": "string"
        }
      },
      "required": [
        "traceId"
      ]
    },
    "providerId": "provider.trace",
    "providerImplementation": "LocalBridgeObservabilityService (apps/runner/src/trace/trace-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/trace.ts -> traceHandlers.get",
    "rpcMethod": "trace.get",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "trace.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_trace_list",
    "name": "localbridge_trace_list",
    "version": "1.0.0",
    "namespace": "trace",
    "category": "trace",
    "description": "List recent distributed traces with span counts and latencies.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "service": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "unset",
            "ok",
            "error"
          ]
        },
        "limit": {
          "type": "number",
          "default": 50
        }
      }
    },
    "providerId": "provider.trace",
    "providerImplementation": "LocalBridgeObservabilityService (apps/runner/src/trace/trace-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/trace.ts -> traceHandlers.list",
    "rpcMethod": "trace.list",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "trace.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_metrics_get",
    "name": "localbridge_metrics_get",
    "version": "1.0.0",
    "namespace": "trace",
    "category": "trace",
    "description": "Query system-wide runtime metrics (memory, CPU, tool call latency percentiles p50/p95/p99).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "enum": [
            "system",
            "tool",
            "agent",
            "all"
          ],
          "default": "all"
        }
      }
    },
    "providerId": "provider.trace",
    "providerImplementation": "LocalBridgeObservabilityService (apps/runner/src/trace/trace-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/trace.ts -> traceHandlers.metrics",
    "rpcMethod": "metrics.get",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "trace.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_observability_summary",
    "name": "localbridge_observability_summary",
    "version": "1.0.0",
    "namespace": "trace",
    "category": "trace",
    "description": "Get a comprehensive observability summary (slowest operations, error rates, active components).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "timeWindowMinutes": {
          "type": "number",
          "default": 60
        }
      }
    },
    "providerId": "provider.trace",
    "providerImplementation": "LocalBridgeObservabilityService (apps/runner/src/trace/trace-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/trace.ts -> traceHandlers.summary",
    "rpcMethod": "observability.summary",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "trace.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_vision_analyze",
    "name": "localbridge_vision_analyze",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Analyze image to extract structured objects, functional regions, geometry, color palette, OCR text, and spatial relationships.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imagePath": {
          "type": "string"
        },
        "base64Data": {
          "type": "string"
        },
        "referenceId": {
          "type": "string"
        },
        "saveToCache": {
          "type": "boolean",
          "default": true
        },
        "detectText": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionAnalyzeHandler",
    "rpcMethod": "vision.analyze",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "vision.analyze"
    ]
  },
  {
    "id": "vision_analyze",
    "name": "vision_analyze",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Alias for localbridge_vision_analyze.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imagePath": {
          "type": "string"
        },
        "base64Data": {
          "type": "string"
        },
        "referenceId": {
          "type": "string"
        },
        "saveToCache": {
          "type": "boolean",
          "default": true
        },
        "detectText": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionAnalyzeHandler",
    "rpcMethod": "vision.analyze",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_vision_describe",
    "name": "localbridge_vision_describe",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Provide high-level visual description and semantic tags of an image.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imagePath": {
          "type": "string"
        },
        "base64Data": {
          "type": "string"
        },
        "referenceId": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionDescribeHandler",
    "rpcMethod": "vision.describe",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "vision_describe",
    "name": "vision_describe",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Alias for localbridge_vision_describe.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imagePath": {
          "type": "string"
        },
        "base64Data": {
          "type": "string"
        },
        "referenceId": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionDescribeHandler",
    "rpcMethod": "vision.describe",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_vision_ocr",
    "name": "localbridge_vision_ocr",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Extract text lines and bounding boxes from image using local Windows OCR or visual inspection.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imagePath": {
          "type": "string"
        },
        "base64Data": {
          "type": "string"
        },
        "referenceId": {
          "type": "string"
        },
        "language": {
          "type": "string",
          "default": "en"
        }
      }
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionOcrHandler",
    "rpcMethod": "vision.ocr",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "vision.ocr"
    ]
  },
  {
    "id": "vision_ocr",
    "name": "vision_ocr",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Alias for localbridge_vision_ocr.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imagePath": {
          "type": "string"
        },
        "base64Data": {
          "type": "string"
        },
        "referenceId": {
          "type": "string"
        },
        "language": {
          "type": "string",
          "default": "en"
        }
      }
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionOcrHandler",
    "rpcMethod": "vision.ocr",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_vision_compare",
    "name": "localbridge_vision_compare",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Compare two visual scenes to detect differences, similarities, missing elements, and unexpected elements.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imageA": {
          "type": "string"
        },
        "imageB": {
          "type": "string"
        },
        "referenceIdA": {
          "type": "string"
        },
        "referenceIdB": {
          "type": "string"
        },
        "base64DataA": {
          "type": "string"
        },
        "base64DataB": {
          "type": "string"
        },
        "threshold": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "default": 0.85
        }
      }
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionCompareHandler",
    "rpcMethod": "vision.compare",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "vision.compare"
    ]
  },
  {
    "id": "vision_compare",
    "name": "vision_compare",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Alias for localbridge_vision_compare.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "imageA": {
          "type": "string"
        },
        "imageB": {
          "type": "string"
        },
        "referenceIdA": {
          "type": "string"
        },
        "referenceIdB": {
          "type": "string"
        },
        "base64DataA": {
          "type": "string"
        },
        "base64DataB": {
          "type": "string"
        },
        "threshold": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "default": 0.85
        }
      }
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionCompareHandler",
    "rpcMethod": "vision.compare",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_vision_cache",
    "name": "localbridge_vision_cache",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Persist structured vision artifact into .nexus/vision/<refId>/ cache.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "referenceId": {
          "type": "string"
        },
        "imagePath": {
          "type": "string"
        },
        "artifactData": {
          "type": "object",
          "properties": {
            "referenceId": {
              "type": "string"
            },
            "image": {
              "type": "object",
              "properties": {
                "width": {
                  "type": "integer",
                  "minimum": 0
                },
                "height": {
                  "type": "integer",
                  "minimum": 0
                },
                "format": {
                  "type": "string"
                },
                "path": {
                  "type": "string"
                }
              },
              "required": [
                "width",
                "height"
              ],
              "additionalProperties": false
            },
            "objects": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "label": {
                    "type": "string"
                  },
                  "confidence": {
                    "type": "number"
                  },
                  "boundingBox": {
                    "type": "object",
                    "properties": {
                      "x": {
                        "type": "number"
                      },
                      "y": {
                        "type": "number"
                      },
                      "width": {
                        "type": "number"
                      },
                      "height": {
                        "type": "number"
                      },
                      "confidence": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "x",
                      "y",
                      "width",
                      "height"
                    ],
                    "additionalProperties": false
                  },
                  "attributes": {
                    "type": "object",
                    "additionalProperties": {}
                  }
                },
                "required": [
                  "id",
                  "label",
                  "confidence",
                  "boundingBox"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "regions": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "boundingBox": {
                    "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                  },
                  "type": {
                    "type": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "boundingBox"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "parts": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "parentObjectId": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "boundingBox": {
                    "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "boundingBox"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "text": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "text": {
                    "type": "string"
                  },
                  "confidence": {
                    "type": "number"
                  },
                  "boundingBox": {
                    "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                  }
                },
                "required": [
                  "text"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "geometry": {
              "type": "object",
              "properties": {
                "shapes": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "type": {
                        "type": "string"
                      },
                      "bounds": {
                        "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                      },
                      "area": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "type",
                      "bounds"
                    ],
                    "additionalProperties": false
                  },
                  "default": []
                },
                "dominantAspect": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            },
            "materials": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "label": {
                    "type": "string"
                  },
                  "region": {
                    "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                  },
                  "texture": {
                    "type": "string"
                  },
                  "confidence": {
                    "type": "number"
                  }
                },
                "required": [
                  "label"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "colors": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "hex": {
                    "type": "string"
                  },
                  "rgb": {
                    "type": "array",
                    "items": {
                      "type": "number"
                    }
                  },
                  "percentage": {
                    "type": "number"
                  },
                  "name": {
                    "type": "string"
                  }
                },
                "required": [
                  "hex",
                  "rgb",
                  "percentage"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "spatialRelationships": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "subjectId": {
                    "type": "string"
                  },
                  "relation": {
                    "type": "string",
                    "enum": [
                      "above",
                      "below",
                      "left_of",
                      "right_of",
                      "inside",
                      "contains",
                      "adjacent_to",
                      "overlapping"
                    ]
                  },
                  "objectId": {
                    "type": "string"
                  },
                  "distance": {
                    "type": "number"
                  }
                },
                "required": [
                  "subjectId",
                  "relation",
                  "objectId"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "style": {
              "type": "string",
              "default": ""
            },
            "summary": {
              "type": "string",
              "default": ""
            }
          },
          "required": [
            "referenceId",
            "image"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "referenceId"
      ]
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionCacheHandler",
    "rpcMethod": "vision.cache",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "write",
    "permissions": [
      "vision.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "vision_cache",
    "name": "vision_cache",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Alias for localbridge_vision_cache.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "referenceId": {
          "type": "string"
        },
        "imagePath": {
          "type": "string"
        },
        "artifactData": {
          "type": "object",
          "properties": {
            "referenceId": {
              "type": "string"
            },
            "image": {
              "type": "object",
              "properties": {
                "width": {
                  "type": "integer",
                  "minimum": 0
                },
                "height": {
                  "type": "integer",
                  "minimum": 0
                },
                "format": {
                  "type": "string"
                },
                "path": {
                  "type": "string"
                }
              },
              "required": [
                "width",
                "height"
              ],
              "additionalProperties": false
            },
            "objects": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "label": {
                    "type": "string"
                  },
                  "confidence": {
                    "type": "number"
                  },
                  "boundingBox": {
                    "type": "object",
                    "properties": {
                      "x": {
                        "type": "number"
                      },
                      "y": {
                        "type": "number"
                      },
                      "width": {
                        "type": "number"
                      },
                      "height": {
                        "type": "number"
                      },
                      "confidence": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "x",
                      "y",
                      "width",
                      "height"
                    ],
                    "additionalProperties": false
                  },
                  "attributes": {
                    "type": "object",
                    "additionalProperties": {}
                  }
                },
                "required": [
                  "id",
                  "label",
                  "confidence",
                  "boundingBox"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "regions": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "boundingBox": {
                    "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                  },
                  "type": {
                    "type": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "boundingBox"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "parts": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "parentObjectId": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "boundingBox": {
                    "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "boundingBox"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "text": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "text": {
                    "type": "string"
                  },
                  "confidence": {
                    "type": "number"
                  },
                  "boundingBox": {
                    "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                  }
                },
                "required": [
                  "text"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "geometry": {
              "type": "object",
              "properties": {
                "shapes": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "type": {
                        "type": "string"
                      },
                      "bounds": {
                        "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                      },
                      "area": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "type",
                      "bounds"
                    ],
                    "additionalProperties": false
                  },
                  "default": []
                },
                "dominantAspect": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            },
            "materials": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "label": {
                    "type": "string"
                  },
                  "region": {
                    "$ref": "#/properties/artifactData/properties/objects/items/properties/boundingBox"
                  },
                  "texture": {
                    "type": "string"
                  },
                  "confidence": {
                    "type": "number"
                  }
                },
                "required": [
                  "label"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "colors": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "hex": {
                    "type": "string"
                  },
                  "rgb": {
                    "type": "array",
                    "items": {
                      "type": "number"
                    }
                  },
                  "percentage": {
                    "type": "number"
                  },
                  "name": {
                    "type": "string"
                  }
                },
                "required": [
                  "hex",
                  "rgb",
                  "percentage"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "spatialRelationships": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "subjectId": {
                    "type": "string"
                  },
                  "relation": {
                    "type": "string",
                    "enum": [
                      "above",
                      "below",
                      "left_of",
                      "right_of",
                      "inside",
                      "contains",
                      "adjacent_to",
                      "overlapping"
                    ]
                  },
                  "objectId": {
                    "type": "string"
                  },
                  "distance": {
                    "type": "number"
                  }
                },
                "required": [
                  "subjectId",
                  "relation",
                  "objectId"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "style": {
              "type": "string",
              "default": ""
            },
            "summary": {
              "type": "string",
              "default": ""
            }
          },
          "required": [
            "referenceId",
            "image"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "referenceId"
      ]
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionCacheHandler",
    "rpcMethod": "vision.cache",
    "executionMode": "computer",
    "riskLevel": "medium",
    "safetyClassification": "COMPUTER_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "write",
    "permissions": [
      "vision.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_vision_get",
    "name": "localbridge_vision_get",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Retrieve cached structured vision artifact without re-running vision model (avoids quota exhaustion).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "referenceId": {
          "type": "string"
        }
      },
      "required": [
        "referenceId"
      ]
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionGetHandler",
    "rpcMethod": "vision.get",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "vision.get"
    ]
  },
  {
    "id": "vision_get",
    "name": "vision_get",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Alias for localbridge_vision_get.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "referenceId": {
          "type": "string"
        }
      },
      "required": [
        "referenceId"
      ]
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionGetHandler",
    "rpcMethod": "vision.get",
    "executionMode": "computer",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "vision.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_vision_delete",
    "name": "localbridge_vision_delete",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Delete cached vision artifact from disk and memory.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "referenceId": {
          "type": "string"
        }
      },
      "required": [
        "referenceId"
      ]
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionDeleteHandler",
    "rpcMethod": "vision.delete",
    "executionMode": "computer",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "vision.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "vision_delete",
    "name": "vision_delete",
    "version": "1.0.0",
    "namespace": "vision",
    "category": "vision",
    "description": "Alias for localbridge_vision_delete.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "referenceId": {
          "type": "string"
        }
      },
      "required": [
        "referenceId"
      ]
    },
    "providerId": "provider.vision",
    "providerImplementation": "VisionService (apps/runner/src/vision/vision-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/vision.ts -> createVisionDeleteHandler",
    "rpcMethod": "vision.delete",
    "executionMode": "computer",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "vision.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_create",
    "name": "localbridge_document_create",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Create standard office documents (DOCX, PDF, XLSX, PPTX, MD, TXT, CSV, RTF) with structured headings, tables, and paragraphs.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "format": {
          "type": "string",
          "enum": [
            "docx",
            "pdf",
            "xlsx",
            "pptx",
            "md",
            "txt",
            "csv",
            "rtf",
            "odt",
            "ods",
            "odp"
          ],
          "default": "docx"
        },
        "path": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "content": {
          "type": "string"
        },
        "author": {
          "type": "string"
        },
        "templateId": {
          "type": "string"
        },
        "elements": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "heading",
                  "paragraph",
                  "table",
                  "image",
                  "bullet_list",
                  "numbered_list",
                  "page_break",
                  "sheet",
                  "slide"
                ]
              },
              "text": {
                "type": "string"
              },
              "level": {
                "type": "integer",
                "minimum": 1,
                "maximum": 6
              },
              "headers": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "rows": {
                "type": "array",
                "items": {
                  "type": "array"
                }
              },
              "imagePath": {
                "type": "string"
              },
              "caption": {
                "type": "string"
              },
              "items": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "sheetName": {
                "type": "string"
              },
              "cells": {
                "type": "array",
                "items": {
                  "type": "array"
                }
              },
              "slideTitle": {
                "type": "string"
              },
              "slideContent": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            },
            "required": [
              "type"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentCreateHandler",
    "rpcMethod": "document.create",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "document.create"
    ]
  },
  {
    "id": "document_create",
    "name": "document_create",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_create.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "format": {
          "type": "string",
          "enum": [
            "docx",
            "pdf",
            "xlsx",
            "pptx",
            "md",
            "txt",
            "csv",
            "rtf",
            "odt",
            "ods",
            "odp"
          ],
          "default": "docx"
        },
        "path": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "content": {
          "type": "string"
        },
        "author": {
          "type": "string"
        },
        "templateId": {
          "type": "string"
        },
        "elements": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "heading",
                  "paragraph",
                  "table",
                  "image",
                  "bullet_list",
                  "numbered_list",
                  "page_break",
                  "sheet",
                  "slide"
                ]
              },
              "text": {
                "type": "string"
              },
              "level": {
                "type": "integer",
                "minimum": 1,
                "maximum": 6
              },
              "headers": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "rows": {
                "type": "array",
                "items": {
                  "type": "array"
                }
              },
              "imagePath": {
                "type": "string"
              },
              "caption": {
                "type": "string"
              },
              "items": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "sheetName": {
                "type": "string"
              },
              "cells": {
                "type": "array",
                "items": {
                  "type": "array"
                }
              },
              "slideTitle": {
                "type": "string"
              },
              "slideContent": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            },
            "required": [
              "type"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentCreateHandler",
    "rpcMethod": "document.create",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_read",
    "name": "localbridge_document_read",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Read and extract structured content from DOCX, PDF, XLSX, PPTX, or text documents.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "format": {
          "type": "string",
          "enum": [
            "docx",
            "pdf",
            "xlsx",
            "pptx",
            "md",
            "txt",
            "csv",
            "rtf",
            "odt",
            "ods",
            "odp"
          ]
        },
        "maxChars": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 50000
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentReadHandler",
    "rpcMethod": "document.read",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_read",
    "name": "document_read",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_read.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "format": {
          "type": "string",
          "enum": [
            "docx",
            "pdf",
            "xlsx",
            "pptx",
            "md",
            "txt",
            "csv",
            "rtf",
            "odt",
            "ods",
            "odp"
          ]
        },
        "maxChars": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 50000
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentReadHandler",
    "rpcMethod": "document.read",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_edit",
    "name": "localbridge_document_edit",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Edit existing document via appending text, replacing substrings, or inserting tables/headings.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "action": {
          "type": "string",
          "enum": [
            "append",
            "replace",
            "insert_heading",
            "insert_paragraph",
            "insert_table",
            "insert_image",
            "insert_page_break"
          ]
        },
        "text": {
          "type": "string"
        },
        "target": {
          "type": "string"
        },
        "replacement": {
          "type": "string"
        },
        "level": {
          "type": "integer"
        },
        "headers": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "rows": {
          "type": "array",
          "items": {
            "type": "array"
          }
        },
        "imagePath": {
          "type": "string"
        },
        "caption": {
          "type": "string"
        }
      },
      "required": [
        "path",
        "action"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentEditHandler",
    "rpcMethod": "document.edit",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_edit",
    "name": "document_edit",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_edit.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "action": {
          "type": "string",
          "enum": [
            "append",
            "replace",
            "insert_heading",
            "insert_paragraph",
            "insert_table",
            "insert_image",
            "insert_page_break"
          ]
        },
        "text": {
          "type": "string"
        },
        "target": {
          "type": "string"
        },
        "replacement": {
          "type": "string"
        },
        "level": {
          "type": "integer"
        },
        "headers": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "rows": {
          "type": "array",
          "items": {
            "type": "array"
          }
        },
        "imagePath": {
          "type": "string"
        },
        "caption": {
          "type": "string"
        }
      },
      "required": [
        "path",
        "action"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentEditHandler",
    "rpcMethod": "document.edit",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_append",
    "name": "localbridge_document_append",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Append paragraph, heading, or bullet item to a document.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "text": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "enum": [
            "paragraph",
            "heading",
            "bullet"
          ],
          "default": "paragraph"
        },
        "level": {
          "type": "integer"
        }
      },
      "required": [
        "path",
        "text"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentAppendHandler",
    "rpcMethod": "document.append",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_append",
    "name": "document_append",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_append.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "text": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "enum": [
            "paragraph",
            "heading",
            "bullet"
          ],
          "default": "paragraph"
        },
        "level": {
          "type": "integer"
        }
      },
      "required": [
        "path",
        "text"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentAppendHandler",
    "rpcMethod": "document.append",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_replace",
    "name": "localbridge_document_replace",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Replace target substring with replacement in document.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "target": {
          "type": "string"
        },
        "replacement": {
          "type": "string"
        }
      },
      "required": [
        "path",
        "target",
        "replacement"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentReplaceHandler",
    "rpcMethod": "document.replace",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_replace",
    "name": "document_replace",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_replace.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "target": {
          "type": "string"
        },
        "replacement": {
          "type": "string"
        }
      },
      "required": [
        "path",
        "target",
        "replacement"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentReplaceHandler",
    "rpcMethod": "document.replace",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_insert_image",
    "name": "localbridge_document_insert_image",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Insert visual image artifact into document body with caption.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "imagePath": {
          "type": "string"
        },
        "caption": {
          "type": "string"
        },
        "width": {
          "type": "number"
        },
        "height": {
          "type": "number"
        }
      },
      "required": [
        "path",
        "imagePath"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentInsertImageHandler",
    "rpcMethod": "document.insert_image",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_insert_image",
    "name": "document_insert_image",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_insert_image.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "imagePath": {
          "type": "string"
        },
        "caption": {
          "type": "string"
        },
        "width": {
          "type": "number"
        },
        "height": {
          "type": "number"
        }
      },
      "required": [
        "path",
        "imagePath"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentInsertImageHandler",
    "rpcMethod": "document.insert_image",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_insert_table",
    "name": "localbridge_document_insert_table",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Insert data table with headers and rows into document.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "headers": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "rows": {
          "type": "array",
          "items": {
            "type": "array"
          }
        }
      },
      "required": [
        "path",
        "headers",
        "rows"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentInsertTableHandler",
    "rpcMethod": "document.insert_table",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_insert_table",
    "name": "document_insert_table",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_insert_table.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "headers": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "rows": {
          "type": "array",
          "items": {
            "type": "array"
          }
        }
      },
      "required": [
        "path",
        "headers",
        "rows"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentInsertTableHandler",
    "rpcMethod": "document.insert_table",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_export_pdf",
    "name": "localbridge_document_export_pdf",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Export document (DOCX, Markdown, etc.) to standard Adobe PDF specification.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sourcePath": {
          "type": "string"
        },
        "targetPdfPath": {
          "type": "string"
        }
      },
      "required": [
        "sourcePath"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentExportPdfHandler",
    "rpcMethod": "document.export_pdf",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "document.export_pdf"
    ]
  },
  {
    "id": "document_export_pdf",
    "name": "document_export_pdf",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_export_pdf.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sourcePath": {
          "type": "string"
        },
        "targetPdfPath": {
          "type": "string"
        }
      },
      "required": [
        "sourcePath"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentExportPdfHandler",
    "rpcMethod": "document.export_pdf",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_convert",
    "name": "localbridge_document_convert",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Convert document between supported formats.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sourcePath": {
          "type": "string"
        },
        "targetPath": {
          "type": "string"
        },
        "targetFormat": {
          "type": "string",
          "enum": [
            "docx",
            "pdf",
            "xlsx",
            "pptx",
            "md",
            "txt",
            "csv",
            "rtf",
            "odt",
            "ods",
            "odp"
          ]
        }
      },
      "required": [
        "sourcePath",
        "targetPath",
        "targetFormat"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentConvertHandler",
    "rpcMethod": "document.convert",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_convert",
    "name": "document_convert",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_convert.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sourcePath": {
          "type": "string"
        },
        "targetPath": {
          "type": "string"
        },
        "targetFormat": {
          "type": "string",
          "enum": [
            "docx",
            "pdf",
            "xlsx",
            "pptx",
            "md",
            "txt",
            "csv",
            "rtf",
            "odt",
            "ods",
            "odp"
          ]
        }
      },
      "required": [
        "sourcePath",
        "targetPath",
        "targetFormat"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentConvertHandler",
    "rpcMethod": "document.convert",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_inspect",
    "name": "localbridge_document_inspect",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Inspect document structure, format, paragraph count, page count, and metadata.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentInspectHandler",
    "rpcMethod": "document.inspect",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_inspect",
    "name": "document_inspect",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_inspect.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentInspectHandler",
    "rpcMethod": "document.inspect",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_validate",
    "name": "localbridge_document_validate",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Validate document structural integrity and container signature; automatically repairs corrupt formatting if autoRepair is enabled.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "expectedFormat": {
          "type": "string",
          "enum": [
            "docx",
            "pdf",
            "xlsx",
            "pptx",
            "md",
            "txt",
            "csv",
            "rtf",
            "odt",
            "ods",
            "odp"
          ]
        },
        "minPages": {
          "type": "integer"
        },
        "requireImages": {
          "type": "boolean"
        },
        "requireTables": {
          "type": "boolean"
        },
        "autoRepair": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentValidateHandler",
    "rpcMethod": "document.validate",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true,
    "aliases": [
      "document.validate"
    ]
  },
  {
    "id": "document_validate",
    "name": "document_validate",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_validate.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "expectedFormat": {
          "type": "string",
          "enum": [
            "docx",
            "pdf",
            "xlsx",
            "pptx",
            "md",
            "txt",
            "csv",
            "rtf",
            "odt",
            "ods",
            "odp"
          ]
        },
        "minPages": {
          "type": "integer"
        },
        "requireImages": {
          "type": "boolean"
        },
        "requireTables": {
          "type": "boolean"
        },
        "autoRepair": {
          "type": "boolean",
          "default": true
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentValidateHandler",
    "rpcMethod": "document.validate",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_render",
    "name": "localbridge_document_render",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Render document preview as HTML and plain text.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "pageIndex": {
          "type": "integer",
          "minimum": 0,
          "default": 0
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentRenderHandler",
    "rpcMethod": "document.render",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_render",
    "name": "document_render",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_render.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "pageIndex": {
          "type": "integer",
          "minimum": 0,
          "default": 0
        }
      },
      "required": [
        "path"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentRenderHandler",
    "rpcMethod": "document.render",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_compare",
    "name": "localbridge_document_compare",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Compare two documents to identify additions, removals, and structural modifications.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pathA": {
          "type": "string"
        },
        "pathB": {
          "type": "string"
        }
      },
      "required": [
        "pathA",
        "pathB"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentCompareHandler",
    "rpcMethod": "document.compare",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_compare",
    "name": "document_compare",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_compare.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pathA": {
          "type": "string"
        },
        "pathB": {
          "type": "string"
        }
      },
      "required": [
        "pathA",
        "pathB"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentCompareHandler",
    "rpcMethod": "document.compare",
    "executionMode": "document",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "document.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_document_template_apply",
    "name": "localbridge_document_template_apply",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Apply pre-built document template (report, resume, contract, meeting minutes, presentation, spreadsheet).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "templateId": {
          "type": "string"
        },
        "targetPath": {
          "type": "string"
        },
        "variables": {
          "type": "object",
          "additionalProperties": {},
          "default": {}
        }
      },
      "required": [
        "templateId",
        "targetPath"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentTemplateApplyHandler",
    "rpcMethod": "document.template.apply",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "document_template_apply",
    "name": "document_template_apply",
    "version": "1.0.0",
    "namespace": "document",
    "category": "document",
    "description": "Alias for localbridge_document_template_apply.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "templateId": {
          "type": "string"
        },
        "targetPath": {
          "type": "string"
        },
        "variables": {
          "type": "object",
          "additionalProperties": {},
          "default": {}
        }
      },
      "required": [
        "templateId",
        "targetPath"
      ]
    },
    "providerId": "provider.document",
    "providerImplementation": "DocumentService (apps/runner/src/documents/document-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/document.ts -> createDocumentTemplateApplyHandler",
    "rpcMethod": "document.template.apply",
    "executionMode": "document",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "WRITE",
    "mcpScope": "write",
    "permissions": [
      "document.write"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 30000,
    "enabled": true
  },
  {
    "id": "localbridge_tool_registry_list",
    "name": "localbridge_tool_registry_list",
    "version": "1.0.0",
    "namespace": "tool_registry",
    "category": "tool-registry",
    "description": "List all tools registered in the unified Tool Registry with risk levels, permissions, and timeout metadata.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.tool_registry",
    "providerImplementation": "ToolRegistryService (apps/runner/src/tools/tool-registry.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/tool-registry.ts -> createToolRegistryListHandler",
    "rpcMethod": "tool_registry.list",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "tool_registry.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "tool_registry_list",
    "name": "tool_registry_list",
    "version": "1.0.0",
    "namespace": "tool_registry",
    "category": "tool-registry",
    "description": "Alias for localbridge_tool_registry_list.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "providerId": "provider.tool_registry",
    "providerImplementation": "ToolRegistryService (apps/runner/src/tools/tool-registry.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/tool-registry.ts -> createToolRegistryListHandler",
    "rpcMethod": "tool_registry.list",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "tool_registry.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_tool_registry_get",
    "name": "localbridge_tool_registry_get",
    "version": "1.0.0",
    "namespace": "tool_registry",
    "category": "tool-registry",
    "description": "Get detailed unified tool definition and schemas by tool name.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        }
      },
      "required": [
        "name"
      ]
    },
    "providerId": "provider.tool_registry",
    "providerImplementation": "ToolRegistryService (apps/runner/src/tools/tool-registry.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/tool-registry.ts -> createToolRegistryGetHandler",
    "rpcMethod": "tool_registry.get",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "tool_registry.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "tool_registry_get",
    "name": "tool_registry_get",
    "version": "1.0.0",
    "namespace": "tool_registry",
    "category": "tool-registry",
    "description": "Alias for localbridge_tool_registry_get.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        }
      },
      "required": [
        "name"
      ]
    },
    "providerId": "provider.tool_registry",
    "providerImplementation": "ToolRegistryService (apps/runner/src/tools/tool-registry.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/tool-registry.ts -> createToolRegistryGetHandler",
    "rpcMethod": "tool_registry.get",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "tool_registry.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_rule_list",
    "name": "localbridge_rule_list",
    "version": "1.0.0",
    "namespace": "rules",
    "category": "rules",
    "description": "List global and scoped rules with priority hierarchy (SYSTEM > CORE > USER > PROJECT > TASK > SKILL).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "scope": {
          "type": "string",
          "enum": [
            "GLOBAL",
            "USER_GLOBAL",
            "PROJECT",
            "TASK",
            "SKILL"
          ]
        },
        "scopeId": {
          "type": "string"
        },
        "activeOnly": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "providerId": "provider.rules",
    "providerImplementation": "IntelligenceRuleService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/rules.ts",
    "rpcMethod": "server.rules.rule_list",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "rules.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_rule_get",
    "name": "localbridge_rule_get",
    "version": "1.0.0",
    "namespace": "rules",
    "category": "rules",
    "description": "Get a specific global rule by its ID.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ruleId": {
          "type": "string"
        }
      },
      "required": [
        "ruleId"
      ]
    },
    "providerId": "provider.rules",
    "providerImplementation": "IntelligenceRuleService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/rules.ts",
    "rpcMethod": "server.rules.rule_get",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "rules.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_rule_create",
    "name": "localbridge_rule_create",
    "version": "1.0.0",
    "namespace": "rules",
    "category": "rules",
    "description": "Create or register a new rule in the Global Rule Registry with strict priority ranking.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ruleId": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "content": {
          "type": "string"
        },
        "scope": {
          "type": "string",
          "enum": [
            "GLOBAL",
            "USER_GLOBAL",
            "PROJECT",
            "TASK",
            "SKILL"
          ],
          "default": "GLOBAL"
        },
        "scopeId": {
          "type": "string"
        },
        "priority": {
          "type": "string",
          "enum": [
            "SYSTEM",
            "CORE_GLOBAL",
            "USER_GLOBAL",
            "PROJECT",
            "TASK",
            "SKILL"
          ],
          "default": "USER_GLOBAL"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "provenance": {
          "type": "object",
          "properties": {
            "source": {
              "type": "string",
              "default": "user"
            },
            "author": {
              "type": "string"
            },
            "importedFrom": {
              "type": "string"
            }
          },
          "additionalProperties": false
        }
      },
      "required": [
        "name",
        "content"
      ]
    },
    "providerId": "provider.rules",
    "providerImplementation": "IntelligenceRuleService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/rules.ts",
    "rpcMethod": "server.rules.rule_create",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "rules.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_rule_update",
    "name": "localbridge_rule_update",
    "version": "1.0.0",
    "namespace": "rules",
    "category": "rules",
    "description": "Update an existing rule's content, priority, tags, or status.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ruleId": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "content": {
          "type": "string"
        },
        "priority": {
          "type": "string",
          "enum": [
            "SYSTEM",
            "CORE_GLOBAL",
            "USER_GLOBAL",
            "PROJECT",
            "TASK",
            "SKILL"
          ]
        },
        "status": {
          "type": "string",
          "enum": [
            "ACTIVE",
            "DISABLED",
            "DEPRECATED"
          ]
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "ruleId"
      ]
    },
    "providerId": "provider.rules",
    "providerImplementation": "IntelligenceRuleService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/rules.ts",
    "rpcMethod": "server.rules.rule_update",
    "executionMode": "system",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "rules.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_rule_delete",
    "name": "localbridge_rule_delete",
    "version": "1.0.0",
    "namespace": "rules",
    "category": "rules",
    "description": "Delete a user or project rule (SYSTEM and CORE rules cannot be deleted).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ruleId": {
          "type": "string"
        }
      },
      "required": [
        "ruleId"
      ]
    },
    "providerId": "provider.rules",
    "providerImplementation": "IntelligenceRuleService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/rules.ts",
    "rpcMethod": "server.rules.rule_delete",
    "executionMode": "system",
    "riskLevel": "destructive",
    "safetyClassification": "DESTRUCTIVE",
    "permissionModel": "DESTRUCTIVE",
    "mcpScope": "write",
    "permissions": [
      "rules.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_knowledge_import",
    "name": "localbridge_knowledge_import",
    "version": "1.0.0",
    "namespace": "knowledge",
    "category": "knowledge",
    "description": "Import knowledge file (Markdown, JSON, YAML, TXT, or Skill archive) with automatic classification, SHA-256 deduplication, and persistence.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "filename": {
          "type": "string"
        },
        "content": {
          "type": "string"
        },
        "filePath": {
          "type": "string"
        },
        "explicitType": {
          "type": "string",
          "enum": [
            "MEMORY",
            "RULE",
            "SKILL",
            "DOCUMENT"
          ]
        },
        "source": {
          "type": "string",
          "default": "upload"
        },
        "projectId": {
          "type": "string"
        }
      },
      "required": [
        "filename"
      ]
    },
    "providerId": "provider.knowledge",
    "providerImplementation": "IntelligenceKnowledgeService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/knowledge.ts",
    "rpcMethod": "server.knowledge.knowledge_import",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "knowledge.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_knowledge_list",
    "name": "localbridge_knowledge_list",
    "version": "1.0.0",
    "namespace": "knowledge",
    "category": "knowledge",
    "description": "List imported knowledge documents with metadata, summaries, and tags.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 50
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "default": 0
        },
        "tag": {
          "type": "string"
        }
      }
    },
    "providerId": "provider.knowledge",
    "providerImplementation": "IntelligenceKnowledgeService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/knowledge.ts",
    "rpcMethod": "server.knowledge.knowledge_list",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "knowledge.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_knowledge_get",
    "name": "localbridge_knowledge_get",
    "version": "1.0.0",
    "namespace": "knowledge",
    "category": "knowledge",
    "description": "Get a specific knowledge document's full metadata and content reference.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "documentId": {
          "type": "string"
        }
      },
      "required": [
        "documentId"
      ]
    },
    "providerId": "provider.knowledge",
    "providerImplementation": "IntelligenceKnowledgeService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/knowledge.ts",
    "rpcMethod": "server.knowledge.knowledge_get",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "knowledge.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_context_build",
    "name": "localbridge_context_build",
    "version": "1.0.0",
    "namespace": "context",
    "category": "context",
    "description": "Build a coherent, dynamically aggregated context snapshot combining rules, recalled memories, active skills, files, and recent actions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sessionId": {
          "type": "string"
        },
        "projectId": {
          "type": "string"
        },
        "goal": {
          "type": "string"
        },
        "query": {
          "type": "string"
        },
        "recentActions": {
          "type": "array",
          "default": []
        },
        "files": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "maxTokens": {
          "type": "integer",
          "exclusiveMinimum": 0
        },
        "persistSnapshot": {
          "type": "boolean",
          "default": true
        }
      }
    },
    "providerId": "provider.context",
    "providerImplementation": "IntelligenceContextService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/context.ts",
    "rpcMethod": "server.context.context_build",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "context.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_context_get",
    "name": "localbridge_context_get",
    "version": "1.0.0",
    "namespace": "context",
    "category": "context",
    "description": "Retrieve an existing context snapshot by its ID.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "contextId": {
          "type": "string"
        }
      },
      "required": [
        "contextId"
      ]
    },
    "providerId": "provider.context",
    "providerImplementation": "IntelligenceContextService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/context.ts",
    "rpcMethod": "server.context.context_get",
    "executionMode": "agent",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "context.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_context_compact",
    "name": "localbridge_context_compact",
    "version": "1.0.0",
    "namespace": "context",
    "category": "context",
    "description": "Perform deterministic, zero-LLM context compaction on a snapshot or existing context to fit within target token limits.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "contextId": {
          "type": "string"
        },
        "snapshot": {
          "type": "object",
          "properties": {
            "contextId": {
              "type": "string"
            },
            "taskId": {
              "type": "string"
            },
            "sessionId": {
              "type": "string"
            },
            "projectId": {
              "type": "string"
            },
            "goal": {
              "type": "string"
            },
            "rules": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "ruleId": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "content": {
                    "type": "string"
                  },
                  "scope": {
                    "type": "string",
                    "enum": [
                      "GLOBAL",
                      "USER_GLOBAL",
                      "PROJECT",
                      "TASK",
                      "SKILL"
                    ],
                    "default": "GLOBAL"
                  },
                  "scopeId": {
                    "type": "string"
                  },
                  "priority": {
                    "type": "string",
                    "enum": [
                      "SYSTEM",
                      "CORE_GLOBAL",
                      "USER_GLOBAL",
                      "PROJECT",
                      "TASK",
                      "SKILL"
                    ],
                    "default": "USER_GLOBAL"
                  },
                  "priorityRank": {
                    "type": "integer",
                    "default": 60
                  },
                  "status": {
                    "type": "string",
                    "enum": [
                      "ACTIVE",
                      "DISABLED",
                      "DEPRECATED"
                    ],
                    "default": "ACTIVE"
                  },
                  "version": {
                    "type": "integer",
                    "exclusiveMinimum": 0,
                    "default": 1
                  },
                  "tags": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  },
                  "provenance": {
                    "type": "object",
                    "properties": {
                      "source": {
                        "type": "string",
                        "default": "user"
                      },
                      "author": {
                        "type": "string"
                      },
                      "importedFrom": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "default": {
                      "source": "user"
                    }
                  },
                  "createdAt": {
                    "type": "number"
                  },
                  "updatedAt": {
                    "type": "number"
                  }
                },
                "required": [
                  "ruleId",
                  "name",
                  "content",
                  "createdAt",
                  "updatedAt"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "memories": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "key": {
                    "type": "string"
                  },
                  "content": {
                    "type": "string"
                  },
                  "type": {
                    "type": "string",
                    "enum": [
                      "FACT",
                      "PREFERENCE",
                      "EPISODIC",
                      "SEMANTIC",
                      "PROCEDURAL",
                      "EXPERIENCE",
                      "DECISION",
                      "ARTIFACT",
                      "ERROR",
                      "SOLUTION"
                    ],
                    "default": "FACT"
                  },
                  "scope": {
                    "type": "string",
                    "enum": [
                      "GLOBAL",
                      "USER",
                      "PROJECT",
                      "SESSION",
                      "TASK",
                      "AGENT",
                      "STEP"
                    ],
                    "default": "PROJECT"
                  },
                  "scopeId": {
                    "type": "string"
                  },
                  "importance": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 10,
                    "default": 5
                  },
                  "confidence": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "default": 1
                  },
                  "source": {
                    "type": "string",
                    "enum": [
                      "USER",
                      "AI",
                      "CONVERSATION",
                      "SKILL",
                      "TASK",
                      "ACTION",
                      "PROJECT",
                      "FILE",
                      "IMPORT",
                      "SYSTEM"
                    ],
                    "default": "USER"
                  },
                  "provenance": {
                    "type": "object",
                    "properties": {
                      "source": {
                        "$ref": "#/properties/snapshot/properties/memories/items/properties/source"
                      },
                      "skillId": {
                        "type": "string"
                      },
                      "taskId": {
                        "type": "string"
                      },
                      "sessionId": {
                        "type": "string"
                      },
                      "actionIds": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        },
                        "default": []
                      },
                      "executionId": {
                        "type": "string"
                      },
                      "result": {
                        "type": "string",
                        "enum": [
                          "SUCCESS",
                          "FAILURE",
                          "PARTIAL",
                          "UNKNOWN"
                        ]
                      },
                      "evidence": {
                        "type": "string"
                      },
                      "observedPath": {
                        "type": "string"
                      },
                      "recoveryAction": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "source"
                    ],
                    "additionalProperties": false
                  },
                  "version": {
                    "type": "integer",
                    "exclusiveMinimum": 0,
                    "default": 1
                  },
                  "relations": {
                    "type": "object",
                    "properties": {
                      "relatedMemoryIds": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        },
                        "default": []
                      },
                      "conflictsWith": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        },
                        "default": []
                      },
                      "supersedes": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        },
                        "default": []
                      }
                    },
                    "additionalProperties": false,
                    "default": {}
                  },
                  "status": {
                    "type": "string",
                    "enum": [
                      "ACTIVE",
                      "ARCHIVED",
                      "FORGOTTEN"
                    ],
                    "default": "ACTIVE"
                  },
                  "tags": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "default": []
                  },
                  "createdAt": {
                    "type": "number"
                  },
                  "updatedAt": {
                    "type": "number"
                  }
                },
                "required": [
                  "id",
                  "key",
                  "content",
                  "createdAt",
                  "updatedAt"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "skills": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "skillId": {
                    "type": "string"
                  },
                  "version": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "stepsCount": {
                    "type": "integer",
                    "minimum": 0
                  }
                },
                "required": [
                  "skillId",
                  "version",
                  "name",
                  "stepsCount"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "documents": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "documentId": {
                    "type": "string"
                  },
                  "filename": {
                    "type": "string"
                  },
                  "summary": {
                    "type": "string"
                  }
                },
                "required": [
                  "documentId",
                  "filename"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "currentState": {
              "type": "object",
              "additionalProperties": {},
              "default": {}
            },
            "recentActions": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "actionId": {
                    "type": "string"
                  },
                  "toolName": {
                    "type": "string"
                  },
                  "status": {
                    "type": "string"
                  },
                  "durationMs": {
                    "type": "number"
                  }
                },
                "required": [
                  "actionId",
                  "toolName",
                  "status"
                ],
                "additionalProperties": false
              },
              "default": []
            },
            "checkpoint": {
              "type": "object",
              "properties": {
                "checkpointId": {
                  "type": "string"
                },
                "step": {
                  "type": "integer",
                  "minimum": 0
                }
              },
              "required": [
                "checkpointId",
                "step"
              ],
              "additionalProperties": false
            },
            "files": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "default": []
            },
            "tokenEstimate": {
              "type": "integer",
              "minimum": 0
            },
            "compactionState": {
              "type": "object",
              "properties": {
                "compactionId": {
                  "type": "string"
                },
                "originalTokenEstimate": {
                  "type": "integer",
                  "minimum": 0
                },
                "compactedTokenEstimate": {
                  "type": "integer",
                  "minimum": 0
                },
                "compactionBoundaryStep": {
                  "type": "integer",
                  "minimum": 0
                },
                "preservedGoal": {
                  "type": "string"
                },
                "preservedStepCount": {
                  "type": "integer",
                  "minimum": 0
                },
                "preservedMemoryIds": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "default": []
                },
                "preservedRuleIds": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "default": []
                },
                "preservedSkillVersions": {
                  "type": "object",
                  "additionalProperties": {
                    "type": "string"
                  },
                  "default": {}
                },
                "compactedActionSummary": {
                  "type": "string"
                },
                "compactedAt": {
                  "type": "number"
                },
                "version": {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "default": 1
                }
              },
              "required": [
                "compactionId",
                "originalTokenEstimate",
                "compactedTokenEstimate",
                "compactionBoundaryStep",
                "preservedGoal",
                "preservedStepCount",
                "compactedActionSummary",
                "compactedAt"
              ],
              "additionalProperties": false
            },
            "traceMetadata": {
              "type": "object",
              "properties": {
                "usedMemoryIds": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "default": []
                },
                "usedRuleIds": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "default": []
                },
                "usedSkillVersions": {
                  "type": "object",
                  "additionalProperties": {
                    "type": "string"
                  },
                  "default": {}
                },
                "usedDocumentIds": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "default": []
                },
                "checkpointId": {
                  "type": "string"
                },
                "actionIds": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "default": []
                },
                "contextHash": {
                  "type": "string"
                }
              },
              "required": [
                "contextHash"
              ],
              "additionalProperties": false
            },
            "createdAt": {
              "type": "number"
            }
          },
          "required": [
            "contextId",
            "tokenEstimate",
            "traceMetadata",
            "createdAt"
          ],
          "additionalProperties": false
        },
        "targetTokenLimit": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "default": 4000
        }
      }
    },
    "providerId": "provider.context",
    "providerImplementation": "IntelligenceContextService (apps/server/src/intelligence/runtime.ts)",
    "runnerAdapter": "apps/server/src/mcp/tools/context.ts",
    "rpcMethod": "server.context.context_compact",
    "executionMode": "agent",
    "riskLevel": "low",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "SYSTEM",
    "mcpScope": "write",
    "permissions": [
      "context.write"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": true,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 60000,
    "enabled": true
  },
  {
    "id": "localbridge_local_resource_query",
    "name": "localbridge_local_resource_query",
    "version": "1.0.0",
    "namespace": "discovery",
    "category": "discovery",
    "description": "Unified host and computer resource discovery. Discovers installed Windows applications (from Registry, Start Menu, PATH, Program Files, AppData, and accessible drives), files, directories, running processes, open windows, and content index records. Supports natural language semantic query and alias matching.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "default": ""
        },
        "resourceTypes": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "drive",
              "directory",
              "file",
              "application",
              "executable",
              "shortcut",
              "process",
              "window",
              "document",
              "project",
              "browser",
              "device",
              "capability"
            ]
          }
        },
        "scope": {
          "type": "string",
          "enum": [
            "local_machine",
            "workspace",
            "project"
          ],
          "default": "local_machine"
        },
        "deep": {
          "type": "boolean",
          "default": false
        },
        "fresh": {
          "type": "boolean",
          "default": false
        },
        "verify": {
          "type": "boolean",
          "default": true
        },
        "projectId": {
          "type": "string"
        },
        "limit": {
          "type": "number",
          "default": 50
        },
        "action": {
          "type": "string",
          "enum": [
            "query",
            "find_application",
            "find_file",
            "find_directory",
            "search_content",
            "find_process",
            "find_window",
            "inspect_resource"
          ],
          "default": "query"
        }
      }
    },
    "providerId": "provider.discovery",
    "providerImplementation": "LocalResourceDiscoveryService (apps/runner/src/discovery/discovery-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/discovery.ts -> createDiscoveryQueryHandler",
    "rpcMethod": "discovery.query",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "discovery.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "nexus_local_resource_query",
    "name": "nexus_local_resource_query",
    "version": "1.0.0",
    "namespace": "discovery",
    "category": "discovery",
    "description": "Alias for localbridge_local_resource_query: Unified host and computer resource discovery.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "default": ""
        },
        "resourceTypes": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "drive",
              "directory",
              "file",
              "application",
              "executable",
              "shortcut",
              "process",
              "window",
              "document",
              "project",
              "browser",
              "device",
              "capability"
            ]
          }
        },
        "scope": {
          "type": "string",
          "enum": [
            "local_machine",
            "workspace",
            "project"
          ],
          "default": "local_machine"
        },
        "deep": {
          "type": "boolean",
          "default": false
        },
        "fresh": {
          "type": "boolean",
          "default": false
        },
        "verify": {
          "type": "boolean",
          "default": true
        },
        "projectId": {
          "type": "string"
        },
        "limit": {
          "type": "number",
          "default": 50
        },
        "action": {
          "type": "string",
          "enum": [
            "query",
            "find_application",
            "find_file",
            "find_directory",
            "search_content",
            "find_process",
            "find_window",
            "inspect_resource"
          ],
          "default": "query"
        }
      }
    },
    "providerId": "provider.discovery",
    "providerImplementation": "LocalResourceDiscoveryService (apps/runner/src/discovery/discovery-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/discovery.ts -> createDiscoveryQueryHandler",
    "rpcMethod": "discovery.query",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "discovery.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_application_launch",
    "name": "localbridge_application_launch",
    "version": "1.0.0",
    "namespace": "discovery",
    "category": "discovery",
    "description": "Execution Tier: Launch an application by name, alias (e.g. 'Maya', 'Blender', 'Notepad'), or executable path. Nexus automatically locates the real executable, verifies its presence on disk, launches it, and inspects real OS state (polling process and window) to verify true launch state.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "appNameOrPath": {
          "type": "string"
        },
        "args": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "workingDirectory": {
          "type": "string"
        },
        "verifyLaunch": {
          "type": "boolean",
          "default": true
        },
        "timeoutMs": {
          "type": "number",
          "default": 8000
        }
      },
      "required": [
        "appNameOrPath"
      ]
    },
    "providerId": "provider.discovery",
    "providerImplementation": "LocalResourceDiscoveryService (apps/runner/src/discovery/discovery-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/discovery.ts -> createDiscoveryLaunchHandler",
    "rpcMethod": "discovery.launch",
    "executionMode": "system",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "discovery.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": true,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_resource_verify",
    "name": "localbridge_resource_verify",
    "version": "1.0.0",
    "namespace": "discovery",
    "category": "discovery",
    "description": "Verification Tier: Inspect real operating system state for a file, directory, running process, desktop window, or application to confirm actual existence without relying on assumed or unverified tool output.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "resourceType": {
          "type": "string",
          "enum": [
            "file",
            "process",
            "window",
            "operation",
            "application",
            "directory"
          ]
        },
        "target": {
          "type": "string"
        },
        "expectedState": {
          "type": "object",
          "additionalProperties": {}
        },
        "timeoutMs": {
          "type": "number",
          "default": 5000
        }
      },
      "required": [
        "resourceType",
        "target"
      ]
    },
    "providerId": "provider.discovery",
    "providerImplementation": "LocalResourceDiscoveryService (apps/runner/src/discovery/discovery-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/discovery.ts -> createDiscoveryVerifyHandler",
    "rpcMethod": "discovery.verify",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "discovery.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_content_index_search",
    "name": "localbridge_content_index_search",
    "version": "1.0.0",
    "namespace": "discovery",
    "category": "discovery",
    "description": "Search indexed text files (.txt, .md, .json, .ts, .py, etc.) across the machine or specified directories using the incremental content index.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string"
        },
        "extensions": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "directories": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "limit": {
          "type": "number",
          "default": 20
        }
      },
      "required": [
        "query"
      ]
    },
    "providerId": "provider.discovery",
    "providerImplementation": "LocalResourceDiscoveryService (apps/runner/src/discovery/discovery-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/discovery.ts -> createDiscoveryIndexSearchHandler",
    "rpcMethod": "discovery.indexSearch",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "discovery.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_resource_inspect",
    "name": "localbridge_resource_inspect",
    "version": "1.0.0",
    "namespace": "discovery",
    "category": "discovery",
    "description": "Inspect detailed metadata, aliases, origin source, and verified status for a single local resource.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "resourceIdOrPath": {
          "type": "string"
        }
      },
      "required": [
        "resourceIdOrPath"
      ]
    },
    "providerId": "provider.discovery",
    "providerImplementation": "LocalResourceDiscoveryService (apps/runner/src/discovery/discovery-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/discovery.ts -> createDiscoveryInspectHandler",
    "rpcMethod": "discovery.inspect",
    "executionMode": "system",
    "riskLevel": "safe",
    "safetyClassification": "SAFE_READ",
    "permissionModel": "READ",
    "mcpScope": "read",
    "permissions": [
      "discovery.read"
    ],
    "supportsDryRun": true,
    "supportsIdempotency": true,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  },
  {
    "id": "localbridge_discovery_refresh",
    "name": "localbridge_discovery_refresh",
    "version": "1.0.0",
    "namespace": "discovery",
    "category": "discovery",
    "description": "Trigger a complete re-scan and deep discovery of host applications, drives, and resources into the Resource Registry.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "deep": {
          "type": "boolean",
          "default": false
        },
        "scope": {
          "type": "string",
          "enum": [
            "local_machine",
            "workspace",
            "project"
          ]
        }
      }
    },
    "providerId": "provider.discovery",
    "providerImplementation": "LocalResourceDiscoveryService (apps/runner/src/discovery/discovery-service.ts)",
    "runnerAdapter": "apps/runner/src/rpc/handlers/discovery.ts -> createDiscoveryRefreshHandler",
    "rpcMethod": "discovery.refresh",
    "executionMode": "system",
    "riskLevel": "medium",
    "safetyClassification": "SAFE_WRITE_SANDBOX",
    "permissionModel": "EXECUTE",
    "mcpScope": "execute",
    "permissions": [
      "discovery.execute"
    ],
    "supportsDryRun": false,
    "supportsIdempotency": false,
    "supportsCancellation": false,
    "supportsCheckpoint": true,
    "supportsRecovery": true,
    "timeoutMs": 15000,
    "enabled": true
  }
];

export const CANONICAL_TOOL_DEFINITIONS: CanonicalToolDefinition[] =
  RAW_CANONICAL_TOOL_DEFINITIONS.map(hydrateDefinition);

export const CANONICAL_TOOL_MAP: ReadonlyMap<string, CanonicalToolDefinition> = new Map(
  CANONICAL_TOOL_DEFINITIONS.map((t) => [t.id, t])
);

/**
 * Dynamic Canonical Tool Registry with task-isolated snapshot protection
 * so in-flight tasks never lose their bound Provider during a registry reload.
 */
export class CanonicalToolRegistry {
  private tools = new Map<string, CanonicalToolDefinition>();
  private versionedTools = new Map<string, CanonicalToolDefinition>(); // `${id}@${version}`
  private aliasIndex = new Map<string, string>(); // alias -> canonical id
  private inFlightTaskSnapshots = new Map<string, Map<string, CanonicalToolDefinition>>();
  private registryGeneration = 1;

  constructor(initialTools: CanonicalToolDefinition[] = CANONICAL_TOOL_DEFINITIONS) {
    this.loadDefinitions(initialTools);
  }

  private loadDefinitions(defs: CanonicalToolDefinition[]): void {
    this.tools.clear();
    this.versionedTools.clear();
    this.aliasIndex.clear();
    for (const def of defs) {
      const cloned: CanonicalToolDefinition = { ...def };
      this.tools.set(cloned.id, cloned);
      this.versionedTools.set(`${cloned.id}@${cloned.version}`, cloned);
      this.versionedTools.set(`${cloned.id}@v1`, cloned);
      this.versionedTools.set(`${cloned.id}@v2`, { ...cloned, version: "2.0.0" });
      if (cloned.aliases) {
        for (const alias of cloned.aliases) {
          this.aliasIndex.set(alias, cloned.id);
        }
      }
    }
  }

  register(tool: CanonicalToolDefinition): CanonicalToolDefinition {
    const cloned: CanonicalToolDefinition = {
      ...tool,
      id: tool.id || tool.name,
      name: tool.name || tool.id,
      version: tool.version || "1.0.0",
      schemaVersion: tool.schemaVersion || "2026-07-28",
      providerVersion: tool.providerVersion || "1.0.0",
      supportsObservation: tool.supportsObservation ?? true,
      timeout: tool.timeout ?? tool.timeoutMs ?? 30000,
      timeoutMs: tool.timeoutMs ?? tool.timeout ?? 30000,
      enabled: tool.enabled ?? true,
    };
    this.tools.set(cloned.id, cloned);
    this.versionedTools.set(`${cloned.id}@${cloned.version}`, cloned);
    this.versionedTools.set(`${cloned.id}@v${cloned.version.split(".")[0]}`, cloned);
    if (cloned.aliases) {
      for (const alias of cloned.aliases) {
        this.aliasIndex.set(alias, cloned.id);
      }
    }
    return cloned;
  }

  unregister(idOrName: string): boolean {
    const existing = this.get(idOrName);
    if (!existing) return false;
    this.tools.delete(existing.id);
    if (existing.aliases) {
      for (const a of existing.aliases) {
        this.aliasIndex.delete(a);
      }
    }
    return true;
  }

  enable(idOrName: string): boolean {
    const existing = this.get(idOrName);
    if (!existing) return false;
    existing.enabled = true;
    return true;
  }

  disable(idOrName: string): boolean {
    const existing = this.get(idOrName);
    if (!existing) return false;
    existing.enabled = false;
    return true;
  }

  /**
   * Reload registry definitions without disrupting any in-flight task snapshots.
   */
  reload(newDefinitions: CanonicalToolDefinition[] = CANONICAL_TOOL_DEFINITIONS): {
    generation: number;
    totalCount: number;
    inFlightProtectedTasks: number;
  } {
    this.registryGeneration += 1;
    this.loadDefinitions(newDefinitions);
    return {
      generation: this.registryGeneration,
      totalCount: this.tools.size,
      inFlightProtectedTasks: this.inFlightTaskSnapshots.size,
    };
  }

  /**
   * Pin an immutable snapshot of all currently enabled tools & providers for an in-flight task.
   */
  acquireTaskSnapshot(taskId: string): void {
    const snap = new Map<string, CanonicalToolDefinition>();
    for (const [k, v] of this.tools.entries()) {
      snap.set(k, { ...v });
    }
    this.inFlightTaskSnapshots.set(taskId, snap);
  }

  releaseTaskSnapshot(taskId: string): void {
    this.inFlightTaskSnapshots.delete(taskId);
  }

  get(
    idOrName: string,
    options?: { version?: string; taskId?: string; includeDisabled?: boolean }
  ): CanonicalToolDefinition | undefined {
    if (options?.taskId && this.inFlightTaskSnapshots.has(options.taskId)) {
      const snap = this.inFlightTaskSnapshots.get(options.taskId)!;
      const canonicalId = this.aliasIndex.get(idOrName) || idOrName;
      const fromSnap = snap.get(canonicalId);
      if (fromSnap) return fromSnap;
    }

    const canonicalId = this.aliasIndex.get(idOrName) || idOrName;
    if (options?.version) {
      const vKey = `${canonicalId}@${options.version}`;
      const vMatch = this.versionedTools.get(vKey);
      if (vMatch && (options?.includeDisabled || vMatch.enabled)) {
        return vMatch;
      }
    }

    const found = this.tools.get(canonicalId);
    if (!found) return undefined;
    if (!options?.includeDisabled && !found.enabled) return undefined;
    return found;
  }

  list(filter?: {
    category?: string;
    riskLevel?: string;
    executionMode?: string;
    providerId?: string;
    includeDisabled?: boolean;
  }): CanonicalToolDefinition[] {
    let result = Array.from(this.tools.values());
    if (!filter?.includeDisabled) {
      result = result.filter((t) => t.enabled);
    }
    if (filter?.category) {
      result = result.filter((t) => t.category === filter.category || t.namespace === filter.category);
    }
    if (filter?.riskLevel) {
      result = result.filter((t) => t.riskLevel === filter.riskLevel);
    }
    if (filter?.executionMode) {
      result = result.filter((t) => t.executionMode === filter.executionMode);
    }
    if (filter?.providerId) {
      result = result.filter((t) => t.providerId === filter.providerId);
    }
    return result;
  }

  version(): {
    registryVersion: string;
    schemaVersion: string;
    generation: number;
    totalTools: number;
    enabledTools: number;
  } {
    const all = Array.from(this.tools.values());
    return {
      registryVersion: "1.0.0",
      schemaVersion: "2026-07-28",
      generation: this.registryGeneration,
      totalTools: all.length,
      enabledTools: all.filter((t) => t.enabled).length,
    };
  }

  health(): {
    healthy: boolean;
    status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
    totalTools: number;
    enabledTools: number;
    providers: ProviderHealthStatus[];
  } {
    const byProvider = new Map<string, CanonicalToolDefinition[]>();
    for (const tool of this.tools.values()) {
      if (!byProvider.has(tool.providerId)) {
        byProvider.set(tool.providerId, []);
      }
      byProvider.get(tool.providerId)!.push(tool);
    }
    const now = new Date().toISOString();
    const providers: ProviderHealthStatus[] = [];
    for (const [providerId, tools] of byProvider.entries()) {
      const enabledCount = tools.filter((t) => t.enabled).length;
      providers.push({
        providerId,
        healthy: enabledCount > 0,
        status: enabledCount > 0 ? "HEALTHY" : "DEGRADED",
        version: tools[0]?.providerVersion || "1.0.0",
        checkedAt: now,
        details: `${enabledCount}/${tools.length} tools enabled via ${tools[0]?.providerImplementation}`,
        toolCount: tools.length,
      });
    }
    const enabledTools = Array.from(this.tools.values()).filter((t) => t.enabled).length;
    return {
      healthy: enabledTools > 0 && providers.every((p) => p.healthy),
      status: enabledTools > 0 ? "HEALTHY" : "UNHEALTHY",
      totalTools: this.tools.size,
      enabledTools,
      providers,
    };
  }
}

export const CANONICAL_TOOL_COUNT = CANONICAL_TOOL_DEFINITIONS.length;
export const defaultCanonicalToolRegistry = new CanonicalToolRegistry();

