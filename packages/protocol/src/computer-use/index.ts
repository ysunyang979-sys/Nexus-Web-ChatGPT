import { z } from "zod";

// 1. Clipboard
export const ClipboardReadResultSchema = z.object({
  text: z.string(),
  hasContent: z.boolean(),
});
export type ClipboardReadResult = z.infer<typeof ClipboardReadResultSchema>;

export const ClipboardWriteParamsSchema = z.object({
  text: z.string(),
});
export type ClipboardWriteParams = z.infer<typeof ClipboardWriteParamsSchema>;

export const ClipboardWriteResultSchema = z.object({
  success: z.boolean(),
  bytesWritten: z.number().int().nonnegative(),
});
export type ClipboardWriteResult = z.infer<typeof ClipboardWriteResultSchema>;

// 2. Mouse
export const MouseMoveParamsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  smooth: z.boolean().default(false),
});
export type MouseMoveParams = z.infer<typeof MouseMoveParamsSchema>;

export const MouseClickParamsSchema = z.object({
  button: z.enum(["left", "right", "middle", "double"]).default("left"),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
});
export type MouseClickParams = z.infer<typeof MouseClickParamsSchema>;

export const MouseScrollParamsSchema = z.object({
  deltaY: z.number().int(),
  deltaX: z.number().int().default(0),
});
export type MouseScrollParams = z.infer<typeof MouseScrollParamsSchema>;

export const MouseActionResultSchema = z.object({
  success: z.boolean(),
  requested: z.boolean().optional(),
  executed: z.boolean().optional(),
  stateChanged: z.boolean().optional(),
  verified: z.boolean().optional(),
  currentPosition: z.object({ x: z.number().int(), y: z.number().int() }),
});
export type MouseActionResult = z.infer<typeof MouseActionResultSchema>;

// 3. Keyboard
export const KeyboardInputParamsSchema = z.object({
  text: z.string(),
  delayMs: z.number().int().nonnegative().default(10),
});
export type KeyboardInputParams = z.infer<typeof KeyboardInputParamsSchema>;

export const KeyboardKeyParamsSchema = z.object({
  keys: z.array(z.string()).min(1), // e.g. ["ctrl", "c"], ["enter"], ["alt", "tab"]
  action: z.enum(["press", "down", "up"]).default("press"),
});
export type KeyboardKeyParams = z.infer<typeof KeyboardKeyParamsSchema>;

export const KeyboardActionResultSchema = z.object({
  success: z.boolean(),
  requested: z.boolean().optional(),
  executed: z.boolean().optional(),
  stateChanged: z.boolean().optional(),
  verified: z.boolean().optional(),
  textLength: z.number().int().optional(),
});
export type KeyboardActionResult = z.infer<typeof KeyboardActionResultSchema>;

// 4. Windows & Displays
export const WindowItemSchema = z.object({
  handle: z.string(),
  title: z.string(),
  processName: z.string().optional(),
  pid: z.number().int().optional(),
  isForeground: z.boolean(),
  bounds: z.object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
  }).optional(),
});
export type WindowItem = z.infer<typeof WindowItemSchema>;

export const WindowListResultSchema = z.object({
  windows: z.array(WindowItemSchema),
  activeWindow: WindowItemSchema.nullable().optional(),
});
export type WindowListResult = z.infer<typeof WindowListResultSchema>;

export const WindowActivateParamsSchema = z.object({
  handleOrTitle: z.string().optional(),
  title: z.string().optional(),
  handle: z.string().optional(),
});
export type WindowActivateParams = z.infer<typeof WindowActivateParamsSchema>;

export const WindowActivateResultSchema = z.object({
  success: z.boolean().default(true),
  executed: z.boolean().default(true),
  verified: z.boolean().default(true),
  activated: z.boolean(),
  isForeground: z.boolean(),
  alreadyForeground: z.boolean().optional(),
  window: WindowItemSchema.optional(),
  verification: z.object({
    foreground: z.boolean(),
    windowExists: z.boolean(),
  }).optional(),
  message: z.string().optional(),
});
export type WindowActivateResult = z.infer<typeof WindowActivateResultSchema>;

export const DisplayItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPrimary: z.boolean(),
  bounds: z.object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
  }),
  scaleFactor: z.number().default(1.0),
});
export type DisplayItem = z.infer<typeof DisplayItemSchema>;

export const DisplayListResultSchema = z.object({
  displays: z.array(DisplayItemSchema),
});
export type DisplayListResult = z.infer<typeof DisplayListResultSchema>;

// 5. Applications
export const AppItemSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  pid: z.number().int().optional(),
});
export type AppItem = z.infer<typeof AppItemSchema>;

export const AppListResultSchema = z.object({
  apps: z.array(AppItemSchema),
});
export type AppListResult = z.infer<typeof AppListResultSchema>;

export const AppLaunchParamsSchema = z.object({
  appNameOrPath: z.string(),
  args: z.array(z.string()).optional(),
});
export type AppLaunchParams = z.infer<typeof AppLaunchParamsSchema>;

export const AppLaunchResultSchema = z.object({
  launched: z.boolean(),
  pid: z.number().int().optional(),
  launcherPid: z.number().int().optional(),
  applicationPid: z.number().int().optional(),
  windowHandle: z.string().optional(),
  message: z.string(),
  success: z.boolean().optional(),
  executed: z.boolean().optional(),
  verified: z.boolean().optional(),
});
export type AppLaunchResult = z.infer<typeof AppLaunchResultSchema>;

// 6. Windows Accessibility / UI Automation
export const AccessibilityElementSchema = z.object({
  automationId: z.string().default(""),
  name: z.string().default(""),
  controlType: z.string().default(""),
  className: z.string().default(""),
  boundingBox: z.object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
  }).optional(),
  isEnabled: z.boolean().default(true),
  isOffscreen: z.boolean().default(false),
  value: z.string().optional(),
  childrenCount: z.number().int().nonnegative().default(0),
});
export type AccessibilityElement = z.infer<typeof AccessibilityElementSchema>;

export const AccessibilityTreeQueryParamsSchema = z.object({
  windowHandleOrTitle: z.string().optional(),
  maxDepth: z.number().int().positive().max(10).default(3),
  filterControlType: z.string().optional(),
});
export type AccessibilityTreeQueryParams = z.infer<typeof AccessibilityTreeQueryParamsSchema>;

export const AccessibilityTreeQueryResultSchema = z.object({
  elements: z.array(AccessibilityElementSchema),
  totalFound: z.number().int().nonnegative(),
});
export type AccessibilityTreeQueryResult = z.infer<typeof AccessibilityTreeQueryResultSchema>;

export const UIElementActionParamsSchema = z.object({
  selector: z.object({
    name: z.string().optional(),
    automationId: z.string().optional(),
    controlType: z.string().optional(),
    windowHandleOrTitle: z.string().optional(),
  }),
  action: z.enum(["click", "invoke", "focus", "set_value"]),
  value: z.string().optional(),
});
export type UIElementActionParams = z.infer<typeof UIElementActionParamsSchema>;

export const UIElementActionResultSchema = z.object({
  success: z.boolean(),
  elementMatched: AccessibilityElementSchema.optional(),
  message: z.string(),
});
export type UIElementActionResult = z.infer<typeof UIElementActionResultSchema>;

// 7. Screen Snapshot
export const ScreenSnapshotParamsSchema = z.object({
  displayId: z.string().optional(),
  windowHandleOrTitle: z.string().optional(),
  saveToArtifact: z.boolean().default(false),
  format: z.enum(["png", "jpeg"]).default("png"),
});
export type ScreenSnapshotParams = z.infer<typeof ScreenSnapshotParamsSchema>;

export const ScreenSnapshotResultSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.string(),
  base64Data: z.string(),
  artifactId: z.string().optional(),
  artifactPath: z.string().optional(),
  capturedAt: z.number(),
});
export type ScreenSnapshotResult = z.infer<typeof ScreenSnapshotResultSchema>;

// 8. Computer Status
export const ComputerStatusParamsSchema = z.object({
  includeScreenshot: z.boolean().default(false).optional(),
}).strict();
export type ComputerStatusParams = z.infer<typeof ComputerStatusParamsSchema>;

export const ComputerStatusResultSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["safe", "universal"]),
  securityMode: z.enum(["safe", "universal"]),
  desktopSession: z.string(),
  activeWindow: z.string().nullable().optional(),
  screenSize: z.string(),
  cursorPosition: z.object({ x: z.number().int(), y: z.number().int() }),
  screenHashVerified: z.boolean().optional(),
});
export type ComputerStatusResult = z.infer<typeof ComputerStatusResultSchema>;

// 9. Mouse Drag
export const MouseDragParamsSchema = z.object({
  fromX: z.number().int().optional(),
  fromY: z.number().int().optional(),
  toX: z.number().int(),
  toY: z.number().int(),
  durationMs: z.number().int().positive().default(300).optional(),
});
export type MouseDragParams = z.infer<typeof MouseDragParamsSchema>;

// 10. Window Close
export const WindowCloseParamsSchema = z.object({
  handleOrTitle: z.string().optional(),
  title: z.string().optional(),
  handle: z.string().optional(),
});
export type WindowCloseParams = z.infer<typeof WindowCloseParamsSchema>;

export const WindowCloseResultSchema = z.object({
  closed: z.boolean(),
  message: z.string(),
});
export type WindowCloseResult = z.infer<typeof WindowCloseResultSchema>;

// 11. Computer Wait
export const ComputerWaitParamsSchema = z.object({
  ms: z.number().int().nonnegative().default(1000).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
});
export type ComputerWaitParams = z.infer<typeof ComputerWaitParamsSchema>;

export const ComputerWaitResultSchema = z.object({
  waitedMs: z.number().int().nonnegative(),
  reason: z.string().optional(),
});
export type ComputerWaitResult = z.infer<typeof ComputerWaitResultSchema>;

// 12. Computer Observe
export const ComputerObserveParamsSchema = z.object({
  windowHandleOrTitle: z.string().optional(),
  includeScreenshot: z.boolean().default(true).optional(),
});
export type ComputerObserveParams = z.infer<typeof ComputerObserveParamsSchema>;

export const ComputerObserveResultSchema = z.object({
  timestamp: z.number().optional(),
  computer: z.object({
    os: z.string().default("Windows"),
    screenSize: z.string(),
    cursor: z.object({ x: z.number().int(), y: z.number().int() }),
    dpi: z.record(z.any()).optional(),
  }).optional(),
  activeWindow: WindowItemSchema.nullable().optional(),
  activeWindowReason: z.string().optional(),
  targetWindow: WindowItemSchema.nullable().optional(),
  matchedWindow: WindowItemSchema.optional(), // backward compat alias for targetWindow
  windows: z.array(WindowItemSchema).optional(),
  processes: z.array(AppItemSchema).optional(),
  ui: z.record(z.any()).optional(),
  ocr: z.record(z.any()).optional(),
  screen: z.object({
    path: z.string().optional(),
    hash: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    format: z.string().optional(),
    base64Data: z.string().optional(),
  }).optional(),
  screenSize: z.string(),
  cursorPosition: z.object({ x: z.number().int(), y: z.number().int() }),
  screenshot: ScreenSnapshotResultSchema.optional(),
  stateHash: z.string().optional(),
  target: z.record(z.any()).optional(),
  verification: z.record(z.any()).optional(),
});
export type ComputerObserveResult = z.infer<typeof ComputerObserveResultSchema>;

// 13. Keyboard Hotkey
export const KeyboardHotkeyParamsSchema = z.object({
  hotkey: z.string().optional(),
  combo: z.string().optional(),
});
export type KeyboardHotkeyParams = z.infer<typeof KeyboardHotkeyParamsSchema>;

// 14. Human Takeover Control
export const TakeControlParamsSchema = z.object({
  reason: z.string().optional(),
  timeoutMs: z.number().int().positive().default(300000).optional(),
});
export type TakeControlParams = z.infer<typeof TakeControlParamsSchema>;

export const TakeControlResultSchema = z.object({
  success: z.boolean(),
  mode: z.enum(["ai", "human"]),
  message: z.string(),
  takenAt: z.number(),
});
export type TakeControlResult = z.infer<typeof TakeControlResultSchema>;

export const ReturnControlParamsSchema = z.object({
  notes: z.string().optional(),
  reconcileScreenshot: z.boolean().default(true).optional(),
});
export type ReturnControlParams = z.infer<typeof ReturnControlParamsSchema>;

export const ReturnControlResultSchema = z.object({
  success: z.boolean(),
  mode: z.enum(["ai", "human"]),
  message: z.string(),
  returnedAt: z.number(),
  reconciledObservation: ComputerObserveResultSchema.optional(),
});
export type ReturnControlResult = z.infer<typeof ReturnControlResultSchema>;

export const TakeoverStatusResultSchema = z.object({
  activeControl: z.enum(["ai", "human"]),
  inputLockedForAi: z.boolean(),
  takenAt: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
});
export type TakeoverStatusResult = z.infer<typeof TakeoverStatusResultSchema>;

// 15. Execution Verification & Computer State Engine
export const ExecutionVerificationStatusSchema = z.enum([
  "EXECUTED",
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "FAILED",
  "UNKNOWN",
]);
export type ExecutionVerificationStatus = z.infer<typeof ExecutionVerificationStatusSchema>;

export const VerificationCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
});
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export const ComputerExecutionVerificationSchema = z.object({
  status: ExecutionVerificationStatusSchema,
  strategy: z.enum(["process", "window", "ui", "ocr", "filesystem", "artifact", "visual"]),
  passed: z.boolean(),
  details: z.string(),
  checks: z.array(VerificationCheckSchema).default([]),
});
export type ComputerExecutionVerification = z.infer<typeof ComputerExecutionVerificationSchema>;

export const ComputerStateSchema = z.object({
  timestamp: z.number(),
  displayId: z.string().default("display_0"),
  resolution: z.string(),
  activeWindow: WindowItemSchema.nullable().optional(),
  windows: z.array(WindowItemSchema).default([]),
  processes: z.array(AppItemSchema).default([]),
  cursor: z.object({ x: z.number().int(), y: z.number().int() }),
  screenHash: z.string().optional(),
  screenshotArtifact: z.string().optional(),
  ocrTextSnippet: z.string().optional(),
  lastActionId: z.string().optional(),
  lastVerificationStatus: ExecutionVerificationStatusSchema.optional(),
});
export type ComputerState = z.infer<typeof ComputerStateSchema>;

export const ExecutionErrorDetailSchema = z.object({
  type: z.enum([
    "WINDOW_NOT_READY",
    "FOCUS_LOST",
    "TIMEOUT",
    "TARGET_NOT_FOUND",
    "FILE_LOCKED",
    "APPLICATION_CRASH",
    "INPUT_REJECTED",
    "PERMISSION_DENIED",
    "LOOP_DETECTED",
    "UNKNOWN_ERROR",
  ]),
  code: z.string(),
  message: z.string(),
  possibleCauses: z.array(z.string()).default([]),
  suggestedRecoverySignals: z.array(z.string()).default([]),
  attemptHistory: z.array(z.object({
    attempt: z.number().int(),
    timestamp: z.number(),
    error: z.string(),
    strategyApplied: z.string(),
  })).default([]),
});
export type ExecutionErrorDetail = z.infer<typeof ExecutionErrorDetailSchema>;

export const ComputerExecutionContractSchema = z.object({
  actionId: z.string(),
  action: z.object({
    tool: z.string(),
    params: z.record(z.any()).default({}),
  }),
  before: ComputerStateSchema.optional(),
  execution: z.object({
    success: z.boolean(),
    message: z.string().optional(),
    rawResult: z.any().optional(),
  }),
  after: ComputerStateSchema.optional(),
  verification: ComputerExecutionVerificationSchema,
  error: ExecutionErrorDetailSchema.nullable().optional(),
  duration: z.number().nonnegative(),
  artifacts: z.array(z.string()).default([]),
});
export type ComputerExecutionContract = z.infer<typeof ComputerExecutionContractSchema>;

// 16. Multi-level Semantic UI Locator
export const SemanticUILocatorParamsSchema = z.object({
  target: z.string(), // e.g. "保存按钮", "Word document canvas", "File menu"
  targetType: z.enum(["button", "menu", "input", "text", "window", "canvas", "any"]).default("any"),
  windowHandleOrTitle: z.string().optional(),
  preferredLevel: z.number().int().min(1).max(6).default(1),
  maxWaitMs: z.number().int().positive().default(5000),
});
export type SemanticUILocatorParams = z.infer<typeof SemanticUILocatorParamsSchema>;

export const SemanticUILocatorResultSchema = z.object({
  found: z.boolean(),
  resolvedLevel: z.number().int(),
  levelName: z.enum(["UIAutomation", "ControlTree", "Accessibility", "OCR", "LocalVision", "CloudVision"]),
  boundingBox: z.object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
  }),
  clickPoint: z.object({
    x: z.number().int(),
    y: z.number().int(),
  }),
  confidence: z.number(),
  matchedText: z.string().optional(),
  elementInfo: AccessibilityElementSchema.optional(),
  level: z.string().optional(),
  element: z.record(z.any()).optional(),
  selector: z.record(z.any()).optional(),
  window: WindowItemSchema.optional(),
});
export type SemanticUILocatorResult = z.infer<typeof SemanticUILocatorResultSchema>;

// 17. Execution Loop Detector
export const LoopDetectionResultSchema = z.object({
  loopDetected: z.boolean(),
  pattern: z.enum([
    "same_action_repeated",
    "same_screen_repeated",
    "same_error_repeated",
    "no_state_progress",
    "oscillating_actions",
    "NO_EFFECT_LOOP",
    "OSCILLATION_LOOP",
    "REPEATED_ACTION",
    "STATE_STAGNATION",
    "none",
  ]),
  repeatCount: z.number().int().nonnegative(),
  message: z.string(),
  suggestedAction: z.string(),
});
export type LoopDetectionResult = z.infer<typeof LoopDetectionResultSchema>;

// 18. Task Acceptance Engine
export const TaskAcceptancePolicySchema = z.object({
  requiredFiles: z.array(z.object({
    path: z.string(),
    minSizeBytes: z.number().int().nonnegative().optional(),
    textMatches: z.array(z.string()).optional(),
    contentContains: z.string().optional(),
    contentHash: z.string().optional(),
  })).optional(),
  requiredWindowsClosed: z.array(z.string()).optional(),
  requiredProcessesKilled: z.array(z.string()).optional(),
  requiredArtifacts: z.array(z.string()).optional(),
});
export type TaskAcceptancePolicy = z.infer<typeof TaskAcceptancePolicySchema>;

export const TaskAcceptanceResultSchema = z.object({
  passed: z.boolean(),
  status: z.enum(["COMPLETED", "FAILED", "IN_PROGRESS"]),
  checks: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    details: z.string(),
  })),
});
export type TaskAcceptanceResult = z.infer<typeof TaskAcceptanceResultSchema>;

// 19. Realtime Computer Mode
export const RealtimeComputerModeSchema = z.object({
  enabled: z.boolean(),
  streamFps: z.number().default(1),
  detectDelta: z.boolean().default(true),
  broadcastMouseKeyboard: z.boolean().default(true),
});
export type RealtimeComputerMode = z.infer<typeof RealtimeComputerModeSchema>;


