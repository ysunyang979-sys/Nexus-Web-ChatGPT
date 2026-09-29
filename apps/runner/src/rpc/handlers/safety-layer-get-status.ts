import type {
  SafetyLayerGetStatusParams,
  SafetyLayerGetStatusResult,
} from "@localbridge/protocol";
import type { Runner } from "../../runner.js";

export function createSafetyLayerGetStatusHandler(runner: Runner) {
  return async (_params: SafetyLayerGetStatusParams): Promise<SafetyLayerGetStatusResult> => {
    return {
      disabled: runner.isSafetyLayerDisabled(),
      mode: runner.getSecurityMode(),
      securityMode: runner.getSecurityMode(),
    };
  };
}
