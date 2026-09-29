import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const websiteDir = path.join(rootDir, "website");
const releasesDir = path.join(rootDir, "releases");

const PORT = 3000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".exe": "application/octet-stream",
  ".msi": "application/octet-stream",
  ".dmg": "application/octet-stream",
  ".appimage": "application/octet-stream",
  ".deb": "application/vnd.debian.binary-package",
  ".zip": "application/zip",
  ".gz": "application/gzip",
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  if (reqPath === "/download") reqPath = "/download.html";

  // Allow downloading from releases directory if referenced
  let targetFile;
  if (reqPath.startsWith("/releases/")) {
    targetFile = path.join(releasesDir, reqPath.replace("/releases/", ""));
  } else {
    targetFile = path.join(websiteDir, reqPath);
  }

  // Fallback for .html if missing extension
  if (!fs.existsSync(targetFile) && fs.existsSync(targetFile + ".html")) {
    targetFile += ".html";
  }

  if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
    const ext = path.extname(targetFile).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const stat = fs.statSync(targetFile);

    const headers = {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Access-Control-Allow-Origin": "*",
    };

    // If downloading a binary, set attachment header
    if ([".exe", ".msi", ".dmg", ".appimage", ".deb", ".zip"].includes(ext)) {
      headers["Content-Disposition"] = `attachment; filename="${path.basename(targetFile)}"`;
    }

    res.writeHead(200, headers);
    fs.createReadStream(targetFile).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n Nexus Official Website running at: ${url}`);
  console.log(`📁 Serving directory: ${websiteDir}\n`);

  // Auto-open in default browser
  try {
    if (process.platform === "win32") {
      child_process.exec(`start ${url}`);
    } else if (process.platform === "darwin") {
      child_process.exec(`open ${url}`);
    } else {
      child_process.exec(`xdg-open ${url}`);
    }
  } catch {}
});
