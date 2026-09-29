import type {
  ClipboardReadResult,
  ClipboardWriteParams,
  ClipboardWriteResult,
  MouseMoveParams,
  MouseClickParams,
  MouseScrollParams,
  MouseActionResult,
  KeyboardInputParams,
  KeyboardKeyParams,
  KeyboardActionResult,
  WindowListResult,
  WindowActivateParams,
  WindowActivateResult,
  DisplayListResult,
  AppListResult,
  AppLaunchParams,
  AppLaunchResult,
  AccessibilityTreeQueryParams,
  AccessibilityTreeQueryResult,
  UIElementActionParams,
  UIElementActionResult,
  ScreenSnapshotParams,
  ScreenSnapshotResult,
} from "@localbridge/protocol";
import type { WindowsComputerUseService } from "../../computer-use/computer-use-service.js";

export function createComputerClipboardReadHandler(service: WindowsComputerUseService) {
  return async (): Promise<ClipboardReadResult> => {
    return service.clipboardRead();
  };
}

export function createComputerClipboardWriteHandler(service: WindowsComputerUseService) {
  return async (params: ClipboardWriteParams): Promise<ClipboardWriteResult> => {
    return service.clipboardWrite(params);
  };
}

export function createComputerMouseMoveHandler(service: WindowsComputerUseService) {
  return async (params: MouseMoveParams): Promise<MouseActionResult> => {
    return service.mouseMove(params);
  };
}

export function createComputerMouseClickHandler(service: WindowsComputerUseService) {
  return async (params: MouseClickParams): Promise<MouseActionResult> => {
    return service.mouseClick(params);
  };
}

export function createComputerMouseScrollHandler(service: WindowsComputerUseService) {
  return async (params: MouseScrollParams): Promise<MouseActionResult> => {
    return service.mouseScroll(params);
  };
}

export function createComputerKeyboardInputHandler(service: WindowsComputerUseService) {
  return async (params: KeyboardInputParams): Promise<KeyboardActionResult> => {
    return service.keyboardInput(params);
  };
}

export function createComputerKeyboardKeyHandler(service: WindowsComputerUseService) {
  return async (params: KeyboardKeyParams): Promise<KeyboardActionResult> => {
    return service.keyboardKey(params);
  };
}

export function createComputerWindowListHandler(service: WindowsComputerUseService) {
  return async (): Promise<WindowListResult> => {
    return service.windowList();
  };
}

export function createComputerWindowActivateHandler(service: WindowsComputerUseService) {
  return async (params: WindowActivateParams): Promise<WindowActivateResult> => {
    return service.windowActivate(params);
  };
}

export function createComputerDisplayListHandler(service: WindowsComputerUseService) {
  return async (): Promise<DisplayListResult> => {
    return service.displayList();
  };
}

export function createComputerAppListHandler(service: WindowsComputerUseService) {
  return async (): Promise<AppListResult> => {
    return service.appList();
  };
}

export function createComputerAppLaunchHandler(service: WindowsComputerUseService) {
  return async (params: AppLaunchParams): Promise<AppLaunchResult> => {
    return service.appLaunch(params);
  };
}

export function createComputerAccessibilityTreeHandler(service: WindowsComputerUseService) {
  return async (params: AccessibilityTreeQueryParams): Promise<AccessibilityTreeQueryResult> => {
    return service.accessibilityTree(params);
  };
}

export function createComputerUIElementActionHandler(service: WindowsComputerUseService) {
  return async (params: UIElementActionParams): Promise<UIElementActionResult> => {
    return service.uiElementAction(params);
  };
}

export function createComputerScreenSnapshotHandler(service: WindowsComputerUseService) {
  return async (params: ScreenSnapshotParams): Promise<ScreenSnapshotResult> => {
    return service.screenSnapshot(params);
  };
}

export function createComputerStatusHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.status(params);
  };
}

export function createComputerMouseDragHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.mouseDrag(params);
  };
}

export function createComputerWindowCloseHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.windowClose(params);
  };
}

export function createComputerWaitHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.waitAction(params);
  };
}

export function createComputerObserveHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.observeAction(params);
  };
}

export function createComputerKeyboardHotkeyHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.keyboardHotkey(params);
  };
}

export function createComputerTakeControlHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.takeControlAction(params);
  };
}

export function createComputerReturnControlHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.returnControlAction(params);
  };
}

export function createComputerTakeoverStatusHandler(service: WindowsComputerUseService) {
  return async (): Promise<any> => {
    return service.takeoverStatusAction();
  };
}

export function createComputerLocateUIHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.locateUIAction(params);
  };
}

export function createComputerTaskAcceptanceHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.taskAcceptanceAction(params);
  };
}

export function createComputerLoopCheckHandler(service: WindowsComputerUseService) {
  return async (): Promise<any> => {
    return service.getLoopCheck();
  };
}

export function createComputerStateGetHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.getExecutionContext(params?.tier);
  };
}

export function createComputerRealtimeStreamHandler(service: WindowsComputerUseService) {
  return async (params: any): Promise<any> => {
    return service.setRealtimeMode(params);
  };
}


