import {
  RunnerRpcMethods,
  BrowserLaunchParamsSchema,
  BrowserCloseParamsSchema,
  BrowserListParamsSchema,
  BrowserStatusParamsSchema,
  BrowserOpenParamsSchema,
  BrowserBackParamsSchema,
  BrowserForwardParamsSchema,
  BrowserReloadParamsSchema,
  BrowserWaitParamsSchema,
  BrowserSnapshotParamsSchema,
  BrowserScreenshotParamsSchema,
  BrowserFindParamsSchema,
  BrowserExtractParamsSchema,
  BrowserElementStateParamsSchema,
  BrowserClickParamsSchema,
  BrowserTypeParamsSchema,
  BrowserKeyParamsSchema,
  BrowserSelectParamsSchema,
  BrowserScrollParamsSchema,
  BrowserHoverParamsSchema,
  BrowserTabsParamsSchema,
  BrowserTabCreateParamsSchema,
  BrowserTabCloseParamsSchema,
  BrowserTabSwitchParamsSchema,
  BrowserConsoleParamsSchema,
  BrowserNetworkParamsSchema,
  BrowserCookiesParamsSchema,
  BrowserStorageParamsSchema,
  BrowserDownloadParamsSchema,
  BrowserUploadParamsSchema,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

function resolveRunner(context: McpContext, projectId?: string): string {
  if (projectId) {
    try {
      return context.resolveProjectRunner(projectId);
    } catch {}
  }
  return context.resolveAnyRunner();
}

export function registerBrowserTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_browser_launch
  server.registerTool(
    "localbridge_browser_launch",
    {
      description: "Launch a real Chromium (Edge or Chrome) instance with persistent session and CDP control.",
      inputSchema: toMcpSchema(BrowserLaunchParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserLaunch, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_browser_close
  server.registerTool(
    "localbridge_browser_close",
    {
      description: "Close an active browser session and terminate its host process.",
      inputSchema: toMcpSchema(BrowserCloseParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserClose, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_browser_list
  server.registerTool(
    "localbridge_browser_list",
    {
      description: "List all active and managed browser sessions.",
      inputSchema: toMcpSchema(BrowserListParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserList, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_browser_status
  server.registerTool(
    "localbridge_browser_status",
    {
      description: "Get detailed health, tabs, and process status for a browser session.",
      inputSchema: toMcpSchema(BrowserStatusParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserStatus, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 5. localbridge_browser_open
  server.registerTool(
    "localbridge_browser_open",
    {
      description: "Navigate active tab to a specified URL with security boundary checks.",
      inputSchema: toMcpSchema(BrowserOpenParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserOpen, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 6. localbridge_browser_back
  server.registerTool(
    "localbridge_browser_back",
    {
      description: "Navigate backward in active tab's history.",
      inputSchema: toMcpSchema(BrowserBackParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserBack, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 7. localbridge_browser_forward
  server.registerTool(
    "localbridge_browser_forward",
    {
      description: "Navigate forward in active tab's history.",
      inputSchema: toMcpSchema(BrowserForwardParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserForward, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 8. localbridge_browser_reload
  server.registerTool(
    "localbridge_browser_reload",
    {
      description: "Reload current page in active tab.",
      inputSchema: toMcpSchema(BrowserReloadParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserReload, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 9. localbridge_browser_wait
  server.registerTool(
    "localbridge_browser_wait",
    {
      description: "Wait for element selector or time delay on page.",
      inputSchema: toMcpSchema(BrowserWaitParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserWait, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 10. localbridge_browser_snapshot
  server.registerTool(
    "localbridge_browser_snapshot",
    {
      description: "Capture structural DOM tree and interactive element summary of current page.",
      inputSchema: toMcpSchema(BrowserSnapshotParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserSnapshot, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 11. localbridge_browser_screenshot
  server.registerTool(
    "localbridge_browser_screenshot",
    {
      description: "Capture high-resolution viewport or full-page screenshot as base64 image.",
      inputSchema: toMcpSchema(BrowserScreenshotParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserScreenshot, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 12. localbridge_browser_find
  server.registerTool(
    "localbridge_browser_find",
    {
      description: "Locate elements on page by CSS selector and retrieve coordinates and attributes.",
      inputSchema: toMcpSchema(BrowserFindParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserFind, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 13. localbridge_browser_extract
  server.registerTool(
    "localbridge_browser_extract",
    {
      description: "Extract structured text and attribute values from elements on page.",
      inputSchema: toMcpSchema(BrowserExtractParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserExtract, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 14. localbridge_browser_element_state
  server.registerTool(
    "localbridge_browser_element_state",
    {
      description: "Query element visibility, enabled state, checked value, and bounding box.",
      inputSchema: toMcpSchema(BrowserElementStateParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserElementState, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 15. localbridge_browser_click
  server.registerTool(
    "localbridge_browser_click",
    {
      description: "Perform real native mouse click on target element via CDP input injection.",
      inputSchema: toMcpSchema(BrowserClickParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserClick, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 16. localbridge_browser_type
  server.registerTool(
    "localbridge_browser_type",
    {
      description: "Type text into target input/textarea element character by character.",
      inputSchema: toMcpSchema(BrowserTypeParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserType, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 17. localbridge_browser_key
  server.registerTool(
    "localbridge_browser_key",
    {
      description: "Send keyboard shortcut or keypress (e.g. Enter, Tab, Escape) to active page.",
      inputSchema: toMcpSchema(BrowserKeyParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserKey, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 18. localbridge_browser_select
  server.registerTool(
    "localbridge_browser_select",
    {
      description: "Select one or more options in a <select> dropdown element.",
      inputSchema: toMcpSchema(BrowserSelectParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserSelect, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 19. localbridge_browser_scroll
  server.registerTool(
    "localbridge_browser_scroll",
    {
      description: "Scroll page or specific element by delta X and delta Y.",
      inputSchema: toMcpSchema(BrowserScrollParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserScroll, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 20. localbridge_browser_hover
  server.registerTool(
    "localbridge_browser_hover",
    {
      description: "Move mouse pointer over target element to trigger hover effects.",
      inputSchema: toMcpSchema(BrowserHoverParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserHover, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 21. localbridge_browser_tabs
  server.registerTool(
    "localbridge_browser_tabs",
    {
      description: "List all open tabs in browser session.",
      inputSchema: toMcpSchema(BrowserTabsParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserTabs, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 22. localbridge_browser_tab_create
  server.registerTool(
    "localbridge_browser_tab_create",
    {
      description: "Create a new browser tab with optional URL.",
      inputSchema: toMcpSchema(BrowserTabCreateParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserTabCreate, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 23. localbridge_browser_tab_close
  server.registerTool(
    "localbridge_browser_tab_close",
    {
      description: "Close a specific browser tab by ID.",
      inputSchema: toMcpSchema(BrowserTabCloseParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserTabClose, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 24. localbridge_browser_tab_switch
  server.registerTool(
    "localbridge_browser_tab_switch",
    {
      description: "Switch active focus to a different browser tab.",
      inputSchema: toMcpSchema(BrowserTabSwitchParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserTabSwitch, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 25. localbridge_browser_console
  server.registerTool(
    "localbridge_browser_console",
    {
      description: "Retrieve console logs recorded in browser session.",
      inputSchema: toMcpSchema(BrowserConsoleParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserConsole, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 26. localbridge_browser_network
  server.registerTool(
    "localbridge_browser_network",
    {
      description: "Retrieve network requests recorded in browser session.",
      inputSchema: toMcpSchema(BrowserNetworkParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserNetwork, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 27. localbridge_browser_cookies
  server.registerTool(
    "localbridge_browser_cookies",
    {
      description: "Inspect, set, or clear browser session cookies.",
      inputSchema: toMcpSchema(BrowserCookiesParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserCookies, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 28. localbridge_browser_storage
  server.registerTool(
    "localbridge_browser_storage",
    {
      description: "Inspect, set, or clear localStorage and sessionStorage.",
      inputSchema: toMcpSchema(BrowserStorageParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserStorage, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 29. localbridge_browser_download
  server.registerTool(
    "localbridge_browser_download",
    {
      description: "Download remote file into sandboxed project destination directory.",
      inputSchema: toMcpSchema(BrowserDownloadParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserDownload, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 30. localbridge_browser_upload
  server.registerTool(
    "localbridge_browser_upload",
    {
      description: "Upload file from sandboxed project workspace into target file input element.",
      inputSchema: toMcpSchema(BrowserUploadParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.BrowserUpload, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
