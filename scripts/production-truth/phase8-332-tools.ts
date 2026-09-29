import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CANONICAL_TOOL_COUNT } from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootArtifactsDir = path.resolve(__dirname, "../../artifacts");
const truthArtifactsDir = path.resolve(__dirname, "../../artifacts/production-truth");
const rawDir = path.join(truthArtifactsDir, "raw");

if (!fs.existsSync(truthArtifactsDir)) {
  fs.mkdirSync(truthArtifactsDir, { recursive: true });
}
if (!fs.existsSync(rawDir)) {
  fs.mkdirSync(rawDir, { recursive: true });
}

async function main() {
  console.log("======================================================================");
  console.log(" NEXUS P0-8 PRODUCTION TRUTH HARNESS: Phase 8 (332 Tools Verification)");
  console.log("======================================================================");

  const gateFile = path.join(rootArtifactsDir, "production-gate.json");
  if (!fs.existsSync(gateFile)) {
    console.error("[-] FAIL_ZERO_TOLERANCE: Missing artifacts/production-gate.json from 332-tool probe");
    process.exit(1);
  }

  const gateRaw = fs.readFileSync(gateFile, "utf-8");
  const gate = JSON.parse(gateRaw);
  const gateSha256 = crypto.createHash("sha256").update(gateRaw).digest("hex");
  console.log("[+] Loaded 332-tool production gate:", JSON.stringify(gate, null, 2));

  if (gate.gateStatus !== "PASS" || gate.zeroToleranceViolation) {
    console.error("[-] FAIL_ZERO_TOLERANCE: 332-tool production gate did not pass!", gate);
    process.exit(1);
  }

  // Verify raw WAL artifact
  const rawWalPath = path.join(rawDir, "phase8-332-ledger.wal");
  if (!fs.existsSync(rawWalPath)) {
    console.error("[-] FAIL_ZERO_TOLERANCE: Missing raw WAL file: " + rawWalPath);
    process.exit(1);
  }
  const rawWalBuf = fs.readFileSync(rawWalPath);
  const rawWalBytes = rawWalBuf.length;
  if (rawWalBytes === 0) {
    console.error("[-] FAIL_ZERO_TOLERANCE: raw WAL file is empty: " + rawWalPath);
    process.exit(1);
  }
  const rawWalSha256 = crypto.createHash("sha256").update(rawWalBuf).digest("hex");
  const rawWalLines = rawWalBuf.toString("utf-8").split(/\r?\n/).filter(l => l.trim().length > 0);
  console.log(`[+] Verified Phase 8 raw WAL on disk: ${rawWalBytes} bytes, ${rawWalLines.length} events, SHA-256: ${rawWalSha256}`);

  // Verify exhaustive-tool-evidence.json
  const exhaustivePath = path.join(rootArtifactsDir, "exhaustive-tool-evidence.json");
  if (!fs.existsSync(exhaustivePath)) {
    console.error("[-] FAIL_ZERO_TOLERANCE: Missing artifacts/exhaustive-tool-evidence.json");
    process.exit(1);
  }
  const exhaustiveRaw = fs.readFileSync(exhaustivePath, "utf-8");
  const exhaustiveEvidence = JSON.parse(exhaustiveRaw);
  const exhaustiveSha256 = crypto.createHash("sha256").update(exhaustiveRaw).digest("hex");

  if (!Array.isArray(exhaustiveEvidence) || exhaustiveEvidence.length !== CANONICAL_TOOL_COUNT) {
    console.error(`[-] FAIL_ZERO_TOLERANCE: Expected ${CANONICAL_TOOL_COUNT} tools in exhaustive evidence, got ${exhaustiveEvidence.length}`);
    process.exit(1);
  }

  // Validate all 7 layers of evidence for each tool
  for (const record of exhaustiveEvidence) {
    if (!record.registryEvidence || !record.providerEvidence || !record.mcpEvidence ||
        !record.runnerEvidence || !record.executionEvidence || !record.verificationEvidence ||
        !record.artifactReferences) {
      console.error(`[-] FAIL_ZERO_TOLERANCE: Tool ${record.toolName} lacks one or more of the 7 layers of evidence!`, record);
      process.exit(1);
    }
  }
  console.log(`[+] All ${CANONICAL_TOOL_COUNT} tools verified with complete 7-Layer evidence schemas.`);

  const evidence = {
    evidenceId: "SEC-332TOOLS-008",
    timestamp: new Date().toISOString(),
    rawWalArtifact: "artifacts/production-truth/raw/phase8-332-ledger.wal",
    rawWalSha256,
    rawWalBytes,
    rawWalEventsCount: rawWalLines.length,
    exhaustiveEvidenceSha256: exhaustiveSha256,
    productionGateSha256: gateSha256,
    metrics: {
      canonicalToolCount: CANONICAL_TOOL_COUNT,
      verifiedToolsCount: exhaustiveEvidence.length,
      gateStatus: gate.gateStatus,
      overallDecision: gate.overallDecision,
      gateConditions: gate.gateConditions,
    },
    counterfactualVerdict: {
      toolCountMatched: exhaustiveEvidence.length === CANONICAL_TOOL_COUNT,
      allSevenLayersPresent: true,
      rawWalBytesNonZero: rawWalBytes > 0,
      rawWalEventsCount: rawWalLines.length,
      zeroToleranceViolation: false
    }
  };

  const evidencePath = path.join(truthArtifactsDir, "phase8-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`[+] Evidence cryptographically secured at ${evidencePath}`);
  console.log("\n[SUCCESS] Phase 8: 332 Tools Exhaustive Truth Harness Passed!");
}

main().catch((err) => {
  console.error("[-] FATAL EXCEPTION", err);
  process.exit(1);
});
