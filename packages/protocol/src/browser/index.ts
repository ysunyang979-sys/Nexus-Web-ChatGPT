import { z } from "zod";

export const BrowserSessionStatusSchema = z.enum([
  "starting",
  "ready",
  "busy",
  "disconnected",
  "closed",
  "crashed",
]);
export type BrowserSessionStatus = z.infer<typeof BrowserSessionStatusSchema>;

export const TabInfoSchema = z.object({
  tabId: z.string(),
  url: z.string(),
  title: z.string(),
  active: z.boolean(),
});
export type TabInfo = z.infer<typeof TabInfoSchema>;

export const BrowserSessionSummarySchema = z.object({
  browserSessionId: z.string(),
  projectId: z.string().optional(),
  name: z.string(),
  pid: z.number().optional(),
  status: BrowserSessionStatusSchema,
  activeTabId: z.string().optional(),
  currentUrl: z.string().optional(),
  tabCount: z.number(),
  createdAt: z.number(),
  lastActivityAt: z.number(),
});
export type BrowserSessionSummary = z.infer<typeof BrowserSessionSummarySchema>;

export const ElementInfoSchema = z.object({
  selector: z.string(),
  tagName: z.string(),
  text: z.string().optional(),
  attributes: z.record(z.string()).optional(),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  visible: z.boolean().default(true),
  enabled: z.boolean().default(true),
});
export type ElementInfo = z.infer<typeof ElementInfoSchema>;

export const ConsoleEntrySchema = z.object({
  level: z.enum(["log", "info", "warn", "error", "debug"]),
  text: z.string(),
  timestamp: z.number(),
  url: z.string().optional(),
  lineNumber: z.number().optional(),
});
export type ConsoleEntry = z.infer<typeof ConsoleEntrySchema>;

export const NetworkEntrySchema = z.object({
  requestId: z.string(),
  url: z.string(),
  method: z.string(),
  status: z.number().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().optional(),
  durationMs: z.number().optional(),
  timestamp: z.number(),
});
export type NetworkEntry = z.infer<typeof NetworkEntrySchema>;

export const CookieParamSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().default("/"),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
});
export type CookieParam = z.infer<typeof CookieParamSchema>;

// --- Tool Schemas ---

// 1. Launch
export const BrowserLaunchParamsSchema = z.object({
  projectId: z.string().optional(),
  name: z.string().optional(),
  headless: z.boolean().default(true),
  browserType: z.enum(["chrome", "edge", "auto"]).default("auto"),
  viewport: z
    .object({
      width: z.number().default(1280),
      height: z.number().default(800),
    })
    .optional(),
  allowedDomains: z.array(z.string()).optional(),
  blockedDomains: z.array(z.string()).optional(),
  userDataDir: z.string().optional(),
  timeoutMs: z.number().default(30000),
});
export type BrowserLaunchParams = z.infer<typeof BrowserLaunchParamsSchema>;

export const BrowserLaunchResultSchema = z.object({
  browserSessionId: z.string(),
  pid: z.number().optional(),
  status: BrowserSessionStatusSchema,
  activeTabId: z.string(),
  wsEndpoint: z.string().optional(),
});
export type BrowserLaunchResult = z.infer<typeof BrowserLaunchResultSchema>;

// 2. Close
export const BrowserCloseParamsSchema = z.object({
  browserSessionId: z.string(),
  force: z.boolean().default(false),
});
export type BrowserCloseParams = z.infer<typeof BrowserCloseParamsSchema>;

export const BrowserCloseResultSchema = z.object({
  browserSessionId: z.string(),
  closed: z.boolean(),
});
export type BrowserCloseResult = z.infer<typeof BrowserCloseResultSchema>;

// 3. List
export const BrowserListParamsSchema = z.object({
  projectId: z.string().optional(),
});
export type BrowserListParams = z.infer<typeof BrowserListParamsSchema>;

export const BrowserListResultSchema = z.object({
  sessions: z.array(BrowserSessionSummarySchema),
  total: z.number(),
});
export type BrowserListResult = z.infer<typeof BrowserListResultSchema>;

// 4. Status
export const BrowserStatusParamsSchema = z.object({
  browserSessionId: z.string(),
});
export type BrowserStatusParams = z.infer<typeof BrowserStatusParamsSchema>;

export const BrowserStatusResultSchema = z.object({
  browserSessionId: z.string(),
  status: BrowserSessionStatusSchema,
  pid: z.number().optional(),
  activeTabId: z.string().optional(),
  currentUrl: z.string().optional(),
  title: z.string().optional(),
  tabs: z.array(TabInfoSchema),
  openCount: z.number(),
  createdAt: z.number(),
  lastActivityAt: z.number(),
});
export type BrowserStatusResult = z.infer<typeof BrowserStatusResultSchema>;

// 5. Open / Navigate
export const BrowserOpenParamsSchema = z.object({
  browserSessionId: z.string(),
  url: z.string().url(),
  timeoutMs: z.number().default(30000),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).default("load"),
});
export type BrowserOpenParams = z.infer<typeof BrowserOpenParamsSchema>;

export const BrowserOpenResultSchema = z.object({
  browserSessionId: z.string(),
  url: z.string(),
  title: z.string(),
  httpStatus: z.number().optional(),
  tabId: z.string(),
});
export type BrowserOpenResult = z.infer<typeof BrowserOpenResultSchema>;

// 6. Back
export const BrowserBackParamsSchema = z.object({
  browserSessionId: z.string(),
});
export type BrowserBackParams = z.infer<typeof BrowserBackParamsSchema>;

export const BrowserBackResultSchema = z.object({
  browserSessionId: z.string(),
  url: z.string(),
  title: z.string(),
});
export type BrowserBackResult = z.infer<typeof BrowserBackResultSchema>;

// 7. Forward
export const BrowserForwardParamsSchema = z.object({
  browserSessionId: z.string(),
});
export type BrowserForwardParams = z.infer<typeof BrowserForwardParamsSchema>;

export const BrowserForwardResultSchema = z.object({
  browserSessionId: z.string(),
  url: z.string(),
  title: z.string(),
});
export type BrowserForwardResult = z.infer<typeof BrowserForwardResultSchema>;

// 8. Reload
export const BrowserReloadParamsSchema = z.object({
  browserSessionId: z.string(),
  ignoreCache: z.boolean().default(false),
});
export type BrowserReloadParams = z.infer<typeof BrowserReloadParamsSchema>;

export const BrowserReloadResultSchema = z.object({
  browserSessionId: z.string(),
  reloaded: z.boolean(),
  url: z.string(),
});
export type BrowserReloadResult = z.infer<typeof BrowserReloadResultSchema>;

// 9. Wait
export const BrowserWaitParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string().optional(),
  durationMs: z.number().optional(),
  state: z.enum(["visible", "hidden", "attached", "detached"]).default("visible"),
  timeoutMs: z.number().default(10000),
});
export type BrowserWaitParams = z.infer<typeof BrowserWaitParamsSchema>;

export const BrowserWaitResultSchema = z.object({
  browserSessionId: z.string(),
  satisfied: z.boolean(),
  elapsedMs: z.number(),
});
export type BrowserWaitResult = z.infer<typeof BrowserWaitResultSchema>;

// 10. Snapshot
export const BrowserSnapshotParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string().optional(),
  maxDepth: z.number().default(5),
});
export type BrowserSnapshotParams = z.infer<typeof BrowserSnapshotParamsSchema>;

export const BrowserSnapshotResultSchema = z.object({
  browserSessionId: z.string(),
  url: z.string(),
  title: z.string(),
  domSummary: z.string(),
  interactiveElements: z.array(ElementInfoSchema),
});
export type BrowserSnapshotResult = z.infer<typeof BrowserSnapshotResultSchema>;

// 11. Screenshot
export const BrowserScreenshotParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string().optional(),
  fullPage: z.boolean().default(false),
  format: z.enum(["png", "jpeg"]).default("png"),
  quality: z.number().min(0).max(100).optional(),
});
export type BrowserScreenshotParams = z.infer<typeof BrowserScreenshotParamsSchema>;

export const BrowserScreenshotResultSchema = z.object({
  browserSessionId: z.string(),
  dataBase64: z.string(),
  mimeType: z.string(),
  width: z.number(),
  height: z.number(),
});
export type BrowserScreenshotResult = z.infer<typeof BrowserScreenshotResultSchema>;

// 12. Find
export const BrowserFindParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  limit: z.number().default(20),
});
export type BrowserFindParams = z.infer<typeof BrowserFindParamsSchema>;

export const BrowserFindResultSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  elements: z.array(ElementInfoSchema),
  totalFound: z.number(),
});
export type BrowserFindResult = z.infer<typeof BrowserFindResultSchema>;

// 13. Extract
export const BrowserExtractParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  attributes: z.array(z.string()).optional(),
  extractText: z.boolean().default(true),
});
export type BrowserExtractParams = z.infer<typeof BrowserExtractParamsSchema>;

export const BrowserExtractResultSchema = z.object({
  browserSessionId: z.string(),
  items: z.array(
    z.object({
      text: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })
  ),
  count: z.number(),
});
export type BrowserExtractResult = z.infer<typeof BrowserExtractResultSchema>;

// 14. Element State
export const BrowserElementStateParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
});
export type BrowserElementStateParams = z.infer<typeof BrowserElementStateParamsSchema>;

export const BrowserElementStateResultSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  exists: z.boolean(),
  visible: z.boolean(),
  enabled: z.boolean(),
  checked: z.boolean().optional(),
  value: z.string().optional(),
  rect: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});
export type BrowserElementStateResult = z.infer<typeof BrowserElementStateResultSchema>;

// 15. Click
export const BrowserClickParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  button: z.enum(["left", "right", "middle"]).default("left"),
  clickCount: z.number().default(1),
  waitForNavigation: z.boolean().default(false),
});
export type BrowserClickParams = z.infer<typeof BrowserClickParamsSchema>;

export const BrowserClickResultSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  clicked: z.boolean(),
  newUrl: z.string().optional(),
});
export type BrowserClickResult = z.infer<typeof BrowserClickResultSchema>;

// 16. Type
export const BrowserTypeParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  text: z.string(),
  clearFirst: z.boolean().default(false),
  delayMs: z.number().default(0),
});
export type BrowserTypeParams = z.infer<typeof BrowserTypeParamsSchema>;

export const BrowserTypeResultSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  typed: z.boolean(),
  length: z.number(),
});
export type BrowserTypeResult = z.infer<typeof BrowserTypeResultSchema>;

// 17. Key
export const BrowserKeyParamsSchema = z.object({
  browserSessionId: z.string(),
  key: z.string(),
  modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).optional(),
});
export type BrowserKeyParams = z.infer<typeof BrowserKeyParamsSchema>;

export const BrowserKeyResultSchema = z.object({
  browserSessionId: z.string(),
  key: z.string(),
  pressed: z.boolean(),
});
export type BrowserKeyResult = z.infer<typeof BrowserKeyResultSchema>;

// 18. Select
export const BrowserSelectParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  values: z.array(z.string()),
});
export type BrowserSelectParams = z.infer<typeof BrowserSelectParamsSchema>;

export const BrowserSelectResultSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  selectedValues: z.array(z.string()),
});
export type BrowserSelectResult = z.infer<typeof BrowserSelectResultSchema>;

// 19. Scroll
export const BrowserScrollParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string().optional(),
  deltaX: z.number().default(0),
  deltaY: z.number().default(100),
});
export type BrowserScrollParams = z.infer<typeof BrowserScrollParamsSchema>;

export const BrowserScrollResultSchema = z.object({
  browserSessionId: z.string(),
  scrolled: z.boolean(),
  scrollX: z.number(),
  scrollY: z.number(),
});
export type BrowserScrollResult = z.infer<typeof BrowserScrollResultSchema>;

// 20. Hover
export const BrowserHoverParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
});
export type BrowserHoverParams = z.infer<typeof BrowserHoverParamsSchema>;

export const BrowserHoverResultSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  hovered: z.boolean(),
});
export type BrowserHoverResult = z.infer<typeof BrowserHoverResultSchema>;

// 21. Tabs
export const BrowserTabsParamsSchema = z.object({
  browserSessionId: z.string(),
});
export type BrowserTabsParams = z.infer<typeof BrowserTabsParamsSchema>;

export const BrowserTabsResultSchema = z.object({
  browserSessionId: z.string(),
  tabs: z.array(TabInfoSchema),
  activeTabId: z.string(),
});
export type BrowserTabsResult = z.infer<typeof BrowserTabsResultSchema>;

// 22. Tab Create
export const BrowserTabCreateParamsSchema = z.object({
  browserSessionId: z.string(),
  url: z.string().url().optional(),
});
export type BrowserTabCreateParams = z.infer<typeof BrowserTabCreateParamsSchema>;

export const BrowserTabCreateResultSchema = z.object({
  browserSessionId: z.string(),
  tabId: z.string(),
  url: z.string().optional(),
});
export type BrowserTabCreateResult = z.infer<typeof BrowserTabCreateResultSchema>;

// 23. Tab Close
export const BrowserTabCloseParamsSchema = z.object({
  browserSessionId: z.string(),
  tabId: z.string(),
});
export type BrowserTabCloseParams = z.infer<typeof BrowserTabCloseParamsSchema>;

export const BrowserTabCloseResultSchema = z.object({
  browserSessionId: z.string(),
  closedTabId: z.string(),
  activeTabId: z.string().optional(),
  remainingCount: z.number(),
});
export type BrowserTabCloseResult = z.infer<typeof BrowserTabCloseResultSchema>;

// 24. Tab Switch
export const BrowserTabSwitchParamsSchema = z.object({
  browserSessionId: z.string(),
  tabId: z.string(),
});
export type BrowserTabSwitchParams = z.infer<typeof BrowserTabSwitchParamsSchema>;

export const BrowserTabSwitchResultSchema = z.object({
  browserSessionId: z.string(),
  activeTabId: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
});
export type BrowserTabSwitchResult = z.infer<typeof BrowserTabSwitchResultSchema>;

// 25. Console
export const BrowserConsoleParamsSchema = z.object({
  browserSessionId: z.string(),
  limit: z.number().default(50),
  level: z.enum(["all", "log", "info", "warn", "error"]).default("all"),
});
export type BrowserConsoleParams = z.infer<typeof BrowserConsoleParamsSchema>;

export const BrowserConsoleResultSchema = z.object({
  browserSessionId: z.string(),
  logs: z.array(ConsoleEntrySchema),
  total: z.number(),
});
export type BrowserConsoleResult = z.infer<typeof BrowserConsoleResultSchema>;

// 26. Network
export const BrowserNetworkParamsSchema = z.object({
  browserSessionId: z.string(),
  limit: z.number().default(50),
});
export type BrowserNetworkParams = z.infer<typeof BrowserNetworkParamsSchema>;

export const BrowserNetworkResultSchema = z.object({
  browserSessionId: z.string(),
  requests: z.array(NetworkEntrySchema),
  total: z.number(),
});
export type BrowserNetworkResult = z.infer<typeof BrowserNetworkResultSchema>;

// 27. Cookies
export const BrowserCookiesParamsSchema = z.object({
  browserSessionId: z.string(),
  action: z.enum(["get", "set", "clear"]).default("get"),
  cookies: z.array(CookieParamSchema).optional(),
});
export type BrowserCookiesParams = z.infer<typeof BrowserCookiesParamsSchema>;

export const BrowserCookiesResultSchema = z.object({
  browserSessionId: z.string(),
  action: z.enum(["get", "set", "clear"]),
  cookies: z.array(CookieParamSchema),
  count: z.number(),
});
export type BrowserCookiesResult = z.infer<typeof BrowserCookiesResultSchema>;

// 28. Storage
export const BrowserStorageParamsSchema = z.object({
  browserSessionId: z.string(),
  type: z.enum(["local", "session"]).default("local"),
  action: z.enum(["get", "set", "remove", "clear"]).default("get"),
  key: z.string().optional(),
  value: z.string().optional(),
});
export type BrowserStorageParams = z.infer<typeof BrowserStorageParamsSchema>;

export const BrowserStorageResultSchema = z.object({
  browserSessionId: z.string(),
  type: z.enum(["local", "session"]),
  action: z.enum(["get", "set", "remove", "clear"]),
  data: z.record(z.string()),
});
export type BrowserStorageResult = z.infer<typeof BrowserStorageResultSchema>;

// 29. Download
export const BrowserDownloadParamsSchema = z.object({
  browserSessionId: z.string(),
  url: z.string().url(),
  destinationPath: z.string(),
  timeoutMs: z.number().default(30000),
});
export type BrowserDownloadParams = z.infer<typeof BrowserDownloadParamsSchema>;

export const BrowserDownloadResultSchema = z.object({
  browserSessionId: z.string(),
  url: z.string(),
  destinationPath: z.string(),
  sizeBytes: z.number(),
  mimeType: z.string().optional(),
});
export type BrowserDownloadResult = z.infer<typeof BrowserDownloadResultSchema>;

// 30. Upload
export const BrowserUploadParamsSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  sourcePath: z.string(),
});
export type BrowserUploadParams = z.infer<typeof BrowserUploadParamsSchema>;

export const BrowserUploadResultSchema = z.object({
  browserSessionId: z.string(),
  selector: z.string(),
  uploaded: z.boolean(),
  fileName: z.string(),
  sizeBytes: z.number(),
});
export type BrowserUploadResult = z.infer<typeof BrowserUploadResultSchema>;
