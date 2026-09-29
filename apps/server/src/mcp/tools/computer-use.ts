import { z } from "zod";
import {
  ClipboardWriteParamsSchema,
  MouseMoveParamsSchema,
  MouseClickParamsSchema,
  MouseScrollParamsSchema,
  MouseDragParamsSchema,
  KeyboardInputParamsSchema,
  KeyboardKeyParamsSchema,
  KeyboardHotkeyParamsSchema,
  WindowActivateParamsSchema,
  WindowCloseParamsSchema,
  AppLaunchParamsSchema,
  AccessibilityTreeQueryParamsSchema,
  UIElementActionParamsSchema,
  ScreenSnapshotParamsSchema,
  ComputerWaitParamsSchema,
  ComputerObserveParamsSchema,
  TakeControlParamsSchema,
  ReturnControlParamsSchema,
  SemanticUILocatorParamsSchema,
  TaskAcceptancePolicySchema,
  RealtimeComputerModeSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";

import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

const EmptyParamsSchema = z.object({});

function assertUniversalMode(context: McpContext): void {
  if (!context.projectService.getSafetyLayerDisabled()) {
    throw new Error(
      "Computer Use is disabled in SAFE mode. Switch to UNIVERSAL mode by disabling the safety layer to enable full desktop control."
    );
  }
}

async function syncSecurityContext(context: McpContext, runnerId: string, toolName: string, args: any): Promise<void> {
  context.logAudit("mcp_tool_started", { toolName, ...args });
  
  const isUniversal = context.projectService.getSafetyLayerDisabled();
  await context.request(runnerId, RunnerRpcMethods.SafetyLayerSetStatus, {
    disabled: isUniversal,
    mode: isUniversal ? "universal" : "safe",
    securityMode: isUniversal ? "universal" : "safe"
  });
  
  context.logAudit("mcp_tool_completed", { toolName, metadata: { status: "Security context synchronized" } });
}

export function registerComputerUseTools(server: McpServer, context: McpContext): void {
  // 0. localbridge_computer_status
  server.registerTool(
    "localbridge_computer_status",
    {
      description: "Query Universal Computer Use status, active security mode (SAFE vs UNIVERSAL), and desktop session state.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    async () => {
      try {
        const isSafe = !context.projectService.getSafetyLayerDisabled();
        const runnerId = context.resolveAnyRunner();
        const runnerStatus = await context.request(runnerId, RunnerRpcMethods.ComputerStatus, undefined as any);
        return formatToolSuccess({
          ...runnerStatus,
          enabled: !isSafe,
          mode: isSafe ? "safe" : "universal",
          securityMode: isSafe ? "safe" : "universal",
        });
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 1. localbridge_computer_clipboard_read
  server.registerTool(
    "localbridge_computer_clipboard_read",
    {
      description: "Read the current text content from the Windows system clipboard.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    async () => {
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerClipboardRead, undefined as any);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_computer_clipboard_write
  server.registerTool(
    "localbridge_computer_clipboard_write",
    {
      description: "Write text into the Windows system clipboard.",
      inputSchema: toMcpSchema(ClipboardWriteParamsSchema),
    },
    async (args: any) => {
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerClipboardWrite, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_computer_mouse_move
  server.registerTool(
    "localbridge_computer_mouse_move",
    {
      description: "Move the mouse cursor to absolute screen coordinates (x, y).",
      inputSchema: toMcpSchema(MouseMoveParamsSchema),
    },
    async (args: any) => {
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerMouseMove, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_computer_mouse_click
  const mouseClickToolHandler = async (args: any) => {
    const startTime = Date.now();
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      await syncSecurityContext(context, runnerId, "localbridge_computer_mouse_click", args);
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerMouseClick, args);
      context.logAudit("mcp_tool_completed", { toolName: "localbridge_computer_mouse_click", durationMs: Date.now() - startTime, resultStatus: "success" });
      return formatToolSuccess(result);
    } catch (err) {
      context.logAudit("mcp_tool_failed", { toolName: "localbridge_computer_mouse_click", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_mouse_click",
    {
      description: "Simulate mouse click (left, right, middle, double) at current or specified coordinate.",
      inputSchema: toMcpSchema(MouseClickParamsSchema),
    },
    mouseClickToolHandler
  );
  server.registerTool(
    "localbridge_computer_click",
    {
      description: "Alias for localbridge_computer_mouse_click: simulate mouse click on desktop UI.",
      inputSchema: toMcpSchema(MouseClickParamsSchema),
    },
    mouseClickToolHandler
  );

  // 5. localbridge_computer_mouse_drag
  const mouseDragToolHandler = async (args: any) => {
    const startTime = Date.now();
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      await syncSecurityContext(context, runnerId, "localbridge_computer_mouse_drag", args);
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerMouseDrag, args);
      context.logAudit("mcp_tool_completed", { toolName: "localbridge_computer_mouse_drag", durationMs: Date.now() - startTime, resultStatus: "success" });
      return formatToolSuccess(result);
    } catch (err) {
      context.logAudit("mcp_tool_failed", { toolName: "localbridge_computer_mouse_drag", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_mouse_drag",
    {
      description: "Drag the mouse cursor from starting coordinates to target coordinates with optional duration.",
      inputSchema: toMcpSchema(MouseDragParamsSchema),
    },
    mouseDragToolHandler
  );
  server.registerTool(
    "localbridge_computer_drag",
    {
      description: "Alias for localbridge_computer_mouse_drag: drag mouse cursor across desktop.",
      inputSchema: toMcpSchema(MouseDragParamsSchema),
    },
    mouseDragToolHandler
  );

  // 6. localbridge_computer_mouse_scroll
  const mouseScrollToolHandler = async (args: any) => {
    const startTime = Date.now();
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      await syncSecurityContext(context, runnerId, "localbridge_computer_mouse_scroll", args);
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerMouseScroll, args);
      context.logAudit("mcp_tool_completed", { toolName: "localbridge_computer_mouse_scroll", durationMs: Date.now() - startTime, resultStatus: "success" });
      return formatToolSuccess(result);
    } catch (err) {
      context.logAudit("mcp_tool_failed", { toolName: "localbridge_computer_mouse_scroll", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_mouse_scroll",
    {
      description: "Scroll the mouse wheel vertically or horizontally.",
      inputSchema: toMcpSchema(MouseScrollParamsSchema),
    },
    mouseScrollToolHandler
  );
  server.registerTool(
    "localbridge_computer_scroll",
    {
      description: "Alias for localbridge_computer_mouse_scroll: scroll mouse wheel.",
      inputSchema: toMcpSchema(MouseScrollParamsSchema),
    },
    mouseScrollToolHandler
  );

  // 7. localbridge_computer_keyboard_input
  const keyboardInputToolHandler = async (args: any) => {
    const startTime = Date.now();
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      await syncSecurityContext(context, runnerId, "localbridge_computer_keyboard_input", args);
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerKeyboardInput, args);
      context.logAudit("mcp_tool_completed", { toolName: "localbridge_computer_keyboard_input", durationMs: Date.now() - startTime, resultStatus: "success" });
      return formatToolSuccess(result);
    } catch (err) {
      context.logAudit("mcp_tool_failed", { toolName: "localbridge_computer_keyboard_input", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_keyboard_input",
    {
      description: "Type a sequence of characters into the active Windows desktop element or window.",
      inputSchema: toMcpSchema(KeyboardInputParamsSchema),
    },
    keyboardInputToolHandler
  );
  server.registerTool(
    "localbridge_computer_type",
    {
      description: "Alias for localbridge_computer_keyboard_input: type text into active desktop window.",
      inputSchema: toMcpSchema(KeyboardInputParamsSchema),
    },
    keyboardInputToolHandler
  );

  // 8. localbridge_computer_keyboard_key
  const keyboardKeyToolHandler = async (args: any) => {
    const startTime = Date.now();
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      await syncSecurityContext(context, runnerId, "localbridge_computer_keyboard_key", args);
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerKeyboardKey, args);
      context.logAudit("mcp_tool_completed", { toolName: "localbridge_computer_keyboard_key", durationMs: Date.now() - startTime, resultStatus: "success" });
      return formatToolSuccess(result);
    } catch (err) {
      context.logAudit("mcp_tool_failed", { toolName: "localbridge_computer_keyboard_key", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_keyboard_key",
    {
      description: "Press a special key or key combo (e.g. Enter, Tab, Escape, Ctrl+C, Alt+Tab).",
      inputSchema: toMcpSchema(KeyboardKeyParamsSchema),
    },
    keyboardKeyToolHandler
  );
  server.registerTool(
    "localbridge_computer_key",
    {
      description: "Alias for localbridge_computer_keyboard_key: press key on keyboard.",
      inputSchema: toMcpSchema(KeyboardKeyParamsSchema),
    },
    keyboardKeyToolHandler
  );

  // 9. localbridge_computer_hotkey
  server.registerTool(
    "localbridge_computer_hotkey",
    {
      description: "Press a keyboard hotkey combination string (e.g. 'Ctrl+S', 'Alt+F4', 'Shift+A', 'Tab').",
      inputSchema: toMcpSchema(KeyboardHotkeyParamsSchema),
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        await syncSecurityContext(context, runnerId, "localbridge_computer_hotkey", args);
        const raw = args.hotkey || args.combo || (Array.isArray(args.keys) ? args.keys.join('+') : '');
        const keys = Array.isArray(args.keys) && args.keys.length > 0
          ? args.keys
          : (raw ? raw.split(/[\+\-]/).map((p: string) => p.trim()).filter(Boolean) : ["Control"]);
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerKeyboardKey, { keys, action: "press" });
        context.logAudit("mcp_tool_completed", { toolName: "localbridge_computer_hotkey", durationMs: Date.now() - startTime, resultStatus: "success" });
        return formatToolSuccess(result);
      } catch (err) {
        context.logAudit("mcp_tool_failed", { toolName: "localbridge_computer_hotkey", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 10. localbridge_computer_window_list
  const windowListToolHandler = async (args: any) => {
    const startTime = Date.now();
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      await syncSecurityContext(context, runnerId, "localbridge_computer_window_list", args || {});
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerWindowList, undefined as any);
      context.logAudit("mcp_tool_completed", { toolName: "localbridge_computer_window_list", durationMs: Date.now() - startTime, resultStatus: "success" });
      return formatToolSuccess(result);
    } catch (err) {
      context.logAudit("mcp_tool_failed", { toolName: "localbridge_computer_window_list", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_window_list",
    {
      description: "List all open desktop windows with title, process name, PID, and visibility.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    windowListToolHandler
  );
  server.registerTool(
    "localbridge_computer_list_windows",
    {
      description: "Alias for localbridge_computer_window_list: list all open desktop windows.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    windowListToolHandler
  );

  // 11. localbridge_computer_window_activate
  const windowActivateToolHandler = async (args: any) => {
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerWindowActivate, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_window_activate",
    {
      description: "Bring a window to the foreground by handle, title, or process name.",
      inputSchema: toMcpSchema(WindowActivateParamsSchema),
    },
    windowActivateToolHandler
  );
  server.registerTool(
    "localbridge_computer_activate_window",
    {
      description: "Alias for localbridge_computer_window_activate: activate window and bring to foreground.",
      inputSchema: toMcpSchema(WindowActivateParamsSchema),
    },
    windowActivateToolHandler
  );

  // 12. localbridge_computer_window_close
  const windowCloseToolHandler = async (args: any) => {
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerWindowClose, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_window_close",
    {
      description: "Close an open desktop application window by title or handle.",
      inputSchema: toMcpSchema(WindowCloseParamsSchema),
    },
    windowCloseToolHandler
  );
  server.registerTool(
    "localbridge_computer_close_window",
    {
      description: "Alias for localbridge_computer_window_close: close desktop application window.",
      inputSchema: toMcpSchema(WindowCloseParamsSchema),
    },
    windowCloseToolHandler
  );

  // 13. localbridge_computer_display_list
  server.registerTool(
    "localbridge_computer_display_list",
    {
      description: "List all connected monitors and displays with bounds and resolution.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        await syncSecurityContext(context, runnerId, "localbridge_computer_display_list", args || {});
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerDisplayList, undefined as any);
        context.logAudit("mcp_tool_completed", { toolName: "localbridge_computer_display_list", durationMs: Date.now() - startTime, resultStatus: "success" });
        return formatToolSuccess(result);
      } catch (err) {
        context.logAudit("mcp_tool_failed", { toolName: "localbridge_computer_display_list", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 14. localbridge_computer_app_list
  server.registerTool(
    "localbridge_computer_app_list",
    {
      description: "List common installed applications and running applications.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    async () => {
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerAppList, undefined as any);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 15. localbridge_computer_app_launch
  const appLaunchToolHandler = async (args: any) => {
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerAppLaunch, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_app_launch",
    {
      description: "Launch an installed desktop application with optional arguments.",
      inputSchema: toMcpSchema(AppLaunchParamsSchema),
    },
    appLaunchToolHandler
  );
  server.registerTool(
    "localbridge_computer_launch",
    {
      description: "Alias for localbridge_computer_app_launch: launch desktop application.",
      inputSchema: toMcpSchema(AppLaunchParamsSchema),
    },
    appLaunchToolHandler
  );

  // 16. localbridge_computer_wait
  server.registerTool(
    "localbridge_computer_wait",
    {
      description: "Pause execution for a specified duration in milliseconds to allow UI and window state to stabilize.",
      inputSchema: toMcpSchema(ComputerWaitParamsSchema),
    },
    async (args: any) => {
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerWait, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 17. localbridge_computer_observe
  server.registerTool(
    "localbridge_computer_observe",
    {
      description: "Observe current desktop state: captures screenshot, inspects active window, and checks target application readiness.",
      inputSchema: toMcpSchema(ComputerObserveParamsSchema),
    },
    async (args: any) => {
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerObserve, args, { timeoutMs: 30000 });
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 18. localbridge_ui_accessibility_tree
  server.registerTool(
    "localbridge_ui_accessibility_tree",
    {
      description: "Query the Windows UI Automation accessibility element tree to locate buttons, textboxes, and windows.",
      inputSchema: toMcpSchema(AccessibilityTreeQueryParamsSchema),
    },
    async (args: any) => {
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerAccessibilityTree, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 19. localbridge_ui_element_action
  server.registerTool(
    "localbridge_ui_element_action",
    {
      description: "Perform an accessibility action on a UI element (invoke, click, setValue, focus, select) by AutomationId or Name.",
      inputSchema: toMcpSchema(UIElementActionParamsSchema),
    },
    async (args: any) => {
      try {
        assertUniversalMode(context);
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ComputerUIElementAction, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 20. localbridge_computer_screen_snapshot
  const screenSnapshotToolHandler = async (args: any) => {
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerScreenSnapshot, args, { timeoutMs: 30000 });
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_screen_snapshot",
    {
      description: "Capture a full screen or bounding-box snapshot as PNG image or Base64.",
      inputSchema: toMcpSchema(ScreenSnapshotParamsSchema),
    },
    screenSnapshotToolHandler
  );
  server.registerTool(
    "localbridge_computer_screenshot",
    {
      description: "Alias for localbridge_computer_screen_snapshot: capture desktop screen snapshot.",
      inputSchema: toMcpSchema(ScreenSnapshotParamsSchema),
    },
    screenSnapshotToolHandler
  );

  // 21. localbridge_computer_take_control
  const takeControlHandler = async (args: any) => {
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerTakeControl, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_take_control",
    {
      description: "Transfer desktop control to human supervisor and lock AI mouse/keyboard input.",
      inputSchema: toMcpSchema(TakeControlParamsSchema),
    },
    takeControlHandler
  );
  server.registerTool(
    "take_control",
    {
      description: "Alias for localbridge_computer_take_control.",
      inputSchema: toMcpSchema(TakeControlParamsSchema),
    },
    takeControlHandler
  );

  // 22. localbridge_computer_return_control
  const returnControlHandler = async (args: any) => {
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerReturnControl, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_return_control",
    {
      description: "Return desktop control to AI agent and capture reconciliation screen snapshot.",
      inputSchema: toMcpSchema(ReturnControlParamsSchema),
    },
    returnControlHandler
  );
  server.registerTool(
    "return_control",
    {
      description: "Alias for localbridge_computer_return_control.",
      inputSchema: toMcpSchema(ReturnControlParamsSchema),
    },
    returnControlHandler
  );

  // 23. localbridge_computer_takeover_status
  const takeoverStatusHandler = async () => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerTakeoverStatus, undefined as any);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_takeover_status",
    {
      description: "Query human takeover status and AI input lock state.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    takeoverStatusHandler
  );
  server.registerTool(
    "takeover_status",
    {
      description: "Alias for localbridge_computer_takeover_status.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    takeoverStatusHandler
  );

  // 24. localbridge_computer_locate_ui
  const locateUIHandler = async (args: any) => {
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerLocateUI, args, { timeoutMs: 30000 });
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_locate_ui",
    {
      description: "Autonomous multi-level semantic UI locator (UI Automation -> Control Tree -> Accessibility -> OCR -> Local Vision). Resolves semantic targets like '保存按钮' into exact screen coordinates without hardcoding.",
      inputSchema: toMcpSchema(SemanticUILocatorParamsSchema),
    },
    locateUIHandler
  );
  server.registerTool(
    "locate_ui",
    {
      description: "Alias for localbridge_computer_locate_ui: resolve semantic UI targets to click coordinates.",
      inputSchema: toMcpSchema(SemanticUILocatorParamsSchema),
    },
    locateUIHandler
  );

  // 25. localbridge_computer_task_acceptance
  const taskAcceptanceHandler = async (args: any) => {
    try {
      assertUniversalMode(context);
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerTaskAcceptance, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_task_acceptance",
    {
      description: "Multi-dimensional task acceptance verification engine. Verifies required files exist with size > 0, text matches content, required windows closed, and artifacts created.",
      inputSchema: toMcpSchema(TaskAcceptancePolicySchema),
    },
    taskAcceptanceHandler
  );
  server.registerTool(
    "task_acceptance",
    {
      description: "Alias for localbridge_computer_task_acceptance: evaluate final task outcome.",
      inputSchema: toMcpSchema(TaskAcceptancePolicySchema),
    },
    taskAcceptanceHandler
  );

  // 26. localbridge_computer_loop_check
  const loopCheckHandler = async () => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerLoopCheck, undefined as any);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_loop_check",
    {
      description: "Execution Loop Detector: inspects recent actions for repetitive loops, oscillating calls, and zero-progress patterns.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    loopCheckHandler
  );
  server.registerTool(
    "loop_check",
    {
      description: "Alias for localbridge_computer_loop_check.",
      inputSchema: toMcpSchema(EmptyParamsSchema),
    },
    loopCheckHandler
  );

  // 27. localbridge_computer_state_get
  const stateGetHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerStateGet, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_state_get",
    {
      description: "Get Execution Memory and compressed operational context (SUMMARY, RECENT, RAW). Prevents prompt token explosion on long multi-step tasks.",
      inputSchema: toMcpSchema(z.object({ tier: z.enum(["SUMMARY", "RECENT", "RAW", "CHECKPOINT", "IMPORTANT"]).default("SUMMARY").optional() })),
    },
    stateGetHandler
  );
  server.registerTool(
    "computer_state_get",
    {
      description: "Alias for localbridge_computer_state_get.",
      inputSchema: toMcpSchema(z.object({ tier: z.enum(["SUMMARY", "RECENT", "RAW", "CHECKPOINT", "IMPORTANT"]).default("SUMMARY").optional() })),
    },
    stateGetHandler
  );

  // 28. localbridge_computer_realtime_stream
  const realtimeStreamHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.ComputerRealtimeStream, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_computer_realtime_stream",
    {
      description: "Configure REALTIME_COMPUTER_MODE streaming, screen change delta detection, and input event broadcasting.",
      inputSchema: toMcpSchema(RealtimeComputerModeSchema),
    },
    realtimeStreamHandler
  );
  server.registerTool(
    "realtime_computer_mode",
    {
      description: "Alias for localbridge_computer_realtime_stream.",
      inputSchema: toMcpSchema(RealtimeComputerModeSchema),
    },
    realtimeStreamHandler
  );
}


