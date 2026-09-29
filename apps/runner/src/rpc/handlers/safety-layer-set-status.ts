import type {
  SafetyLayerSetStatusParams,
  SafetyLayerSetStatusResult,
} from "@localbridge/protocol";
import { isUnrestrictedMode } from "@localbridge/protocol";
import type { Runner } from "../../runner.js";

export function createSafetyLayerSetStatusHandler(runner: Runner) {
  return async (params: SafetyLayerSetStatusParams): Promise<SafetyLayerSetStatusResult> => {
    const mode = (params as any).mode ?? (params as any).securityMode;
    const disabled = mode ? isUnrestrictedMode(mode) : Boolean(params.disabled);
    const targetMode = mode ?? (disabled ? "UNRESTRICTED" : "SAFE");
    runner.setSafetyLayerDisabled(disabled, targetMode);
    return {
      disabled: runner.isSafetyLayerDisabled(),
      success: true,
      mode: runner.getSecurityMode(),
      securityMode: runner.getSecurityMode(),
    };
  };
}
