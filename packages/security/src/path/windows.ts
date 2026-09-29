import { LocalBridgeErrorCode } from "@localbridge/protocol";
import { SecurityPathError } from "./errors.js";

/**
 * Windows reserved DOS device names.
 * Reference: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
 */
const WINDOWS_RESERVED_NAMES_REGEX =
  /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Validates Windows-specific path restrictions:
 * - Null byte injection
 * - UNC paths (\\server\share)
 * - Device namespace paths (\\?\, \\.\)
 * - Drive-relative paths (C:foo)
 * - NTFS Alternate Data Streams (colon in path)
 * - Reserved device names (CON, NUL, COM1, etc.)
 * - Trailing dots and spaces on path segments
 */
export function validateWindowsPathSecurity(
  relativePath: string,
  options?: { unrestricted?: boolean }
): void {
  const unrestricted = options?.unrestricted ?? false;

  // 1. Null byte and percent-encoded null byte check
  if (relativePath.includes("\0") || /%00/i.test(relativePath)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      "Null byte in path is strictly prohibited"
    );
  }

  // Unicode separator check (fullwidth slashes)
  if (/[\uFF0F\uFF3C]/.test(relativePath)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      "Unicode separator in path is strictly prohibited"
    );
  }

  // Lexical path traversal check (.., ../, ..\, /../, \..\, etc.)
  const normPath = relativePath.replace(/\\/g, "/");
  if (
    normPath === ".." ||
    normPath.startsWith("../") ||
    normPath.split("/").includes("..")
  ) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      `Path traversal rejected: "${relativePath}"`
    );
  }

  // Multi-pass URL decoding check for single and double encoded traversals (%2e%2e, %2f, %5c, %252e, etc.)
  let decoded = relativePath;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  if (decoded !== relativePath) {
    const normalizedDecoded = decoded.replace(/\\/g, "/");
    const decodedWithoutDrive = /^[a-zA-Z]:([\\/]|$)/.test(normalizedDecoded)
      ? normalizedDecoded.slice(2)
      : normalizedDecoded;
    if (
      normalizedDecoded.includes("..") ||
      normalizedDecoded.includes("\0") ||
      (unrestricted
        ? decodedWithoutDrive.includes(":")
        : normalizedDecoded.includes(":") || /^[a-zA-Z]:/.test(normalizedDecoded))
    ) {
      throw new SecurityPathError(
        LocalBridgeErrorCode.PATH_TRAVERSAL,
        `Encoded path traversal attempt rejected: "${relativePath}"`
      );
    }
  }

  // 2. Windows device namespace paths and NT paths
  if (
    relativePath.startsWith("\\\\?\\") ||
    relativePath.startsWith("\\\\.\\") ||
    relativePath.startsWith("\\??\\") ||
    relativePath.startsWith("//?/") ||
    relativePath.startsWith("//./") ||
    relativePath.startsWith("/??/")
  ) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_DEVICE_NOT_ALLOWED,
      "Windows device namespace and NT paths are strictly prohibited"
    );
  }

  // 3. UNC network paths
  if (!unrestricted && (relativePath.startsWith("\\\\") || relativePath.startsWith("//"))) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_UNC_NOT_ALLOWED,
      "UNC network paths are not allowed"
    );
  }

  // 4. Drive-relative paths (e.g. C:foo, D:..\secret)
  if (/^[a-zA-Z]:[^\\/]/.test(relativePath)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      "Drive-relative paths are strictly prohibited"
    );
  }

  // 5. Drive-absolute paths (e.g. C:\foo, C:/foo)
  if (!unrestricted && /^[a-zA-Z]:[\\/]/.test(relativePath)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      "Drive-absolute paths are strictly prohibited"
    );
  }

  // 6. Root-relative paths (e.g. \foo, /foo)
  if (!unrestricted && (relativePath.startsWith("/") || relativePath.startsWith("\\"))) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      "Root-relative absolute paths are strictly prohibited"
    );
  }

  // 7. NTFS Alternate Data Streams (ADS) colon check
  const pathWithoutDrive = /^[a-zA-Z]:([\\/]|$)/.test(relativePath)
    ? relativePath.slice(2)
    : relativePath;
  if (unrestricted ? pathWithoutDrive.includes(":") : relativePath.includes(":")) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_ADS_NOT_ALLOWED,
      "NTFS Alternate Data Streams (colon in path) are strictly prohibited"
    );
  }

  // 8. Reserved Windows device names, trailing dots, and trailing spaces on segments
  const segments = relativePath.split(/[\\/]/);
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      continue;
    }

    // Windows normalization strips trailing dots and spaces
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw new SecurityPathError(
        LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME,
        `Path segment "${segment}" with trailing dot or space is prohibited on Windows`
      );
    }

    // Reserved DOS device names
    if (WINDOWS_RESERVED_NAMES_REGEX.test(segment)) {
      throw new SecurityPathError(
        LocalBridgeErrorCode.PATH_INVALID_WINDOWS_NAME,
        `Path segment "${segment}" uses reserved Windows device name`
      );
    }
  }
}
