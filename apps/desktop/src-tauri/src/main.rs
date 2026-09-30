// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub mod tunnel;
pub mod shutdown;
pub mod bridge;

#[cfg(target_os = "windows")]
pub mod job_object {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    type HANDLE = *mut std::ffi::c_void;
    type BOOL = i32;
    type DWORD = u32;

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: DWORD = 0x00002000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: u32 = 9;

    #[repr(C)]
    struct IO_COUNTERS {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: DWORD,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: DWORD,
        affinity: usize,
        priority_class: DWORD,
        scheduling_class: DWORD,
    }

    #[repr(C)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        basic_limit_information: JOBOBJECT_BASIC_LIMIT_INFORMATION,
        io_info: IO_COUNTERS,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_limit: usize,
        peak_job_memory_limit: usize,
    }

    extern "system" {
        fn CreateJobObjectW(lpJobAttributes: *mut std::ffi::c_void, lpName: *const u16) -> HANDLE;
        fn SetInformationJobObject(
            hJob: HANDLE,
            JobObjectInformationClass: u32,
            lpJobObjectInformation: *const std::ffi::c_void,
            cbJobObjectInformationLength: DWORD,
        ) -> BOOL;
        fn AssignProcessToJobObject(hJob: HANDLE, hProcess: HANDLE) -> BOOL;
        fn CloseHandle(hObject: HANDLE) -> BOOL;
    }

    pub struct JobObjectGuard {
        handle: HANDLE,
    }

    unsafe impl Send for JobObjectGuard {}
    unsafe impl Sync for JobObjectGuard {}

    impl JobObjectGuard {
        pub fn create() -> Option<Self> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let res = SetInformationJobObject(
                    handle,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                    &info as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as DWORD,
                );
                if res == 0 {
                    CloseHandle(handle);
                    return None;
                }
                Some(JobObjectGuard { handle })
            }
        }

        pub fn assign_child(&self, child: &Child) -> bool {
            unsafe {
                let proc_handle = child.as_raw_handle() as HANDLE;
                AssignProcessToJobObject(self.handle, proc_handle) != 0
            }
        }
    }

    impl Drop for JobObjectGuard {
        fn drop(&mut self) {
            unsafe {
                if !self.handle.is_null() {
                    CloseHandle(self.handle);
                }
            }
        }
    }
}

fn terminate_owned_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill");
        command.args(["/PID", &pid.to_string(), "/T", "/F"]);
        command.creation_flags(CREATE_NO_WINDOW);
        let _ = command.status();
    }
    #[cfg(not(target_os = "windows"))]
    let _ = child.kill();
    #[cfg(target_os = "windows")]
    let _ = child.kill();
    let _ = child.try_wait();
    let _ = child.wait();
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceDiagnostics {
    pub executable_path: String,
    pub resource_root: String,
    pub node_path: String,
    pub server_bundle_path: String,
    pub runner_bundle_path: String,
    pub bridge_bundle_path: String,
    pub bridge_executable_path: String,
    pub lsp_root: String,
    pub skills_root: String,
    pub laya_root: String,
    pub tunnel_runtime_path: String,
    pub webview_target: String,
    pub health_url: String,
    pub source_tree_fallback_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupDiagnosticsDto {
    pub ready: bool,
    pub startup_error: Option<String>,
    pub resource_root: Option<String>,
    pub server_exit_code: Option<i32>,
    pub last_stderr: Option<String>,
    pub port_state: String,
}

#[derive(Default)]
struct SupervisorState {
    server_process: Option<Child>,
    runner_process: Option<Child>,
    bridge_supervisor: bridge::BridgeSupervisor,
    bridge_entry: Option<PathBuf>,
    tunnel_supervisor: tunnel::TunnelSupervisor,
    bundled_node: Option<PathBuf>,
    server_entry: Option<PathBuf>,
    runner_entry: Option<PathBuf>,
    runner_token: Option<String>,
    management_token: Option<String>,
    server_port: u16,
    data_dir: Option<PathBuf>,
    startup_error: Option<String>,
    #[cfg(target_os = "windows")]
    job_object: Option<job_object::JobObjectGuard>,
    resource_diagnostics: Option<ResourceDiagnostics>,
    server_exit_code: Option<i32>,
    last_stderr_lines: Vec<String>,
}

impl SupervisorState {
    fn shutdown(&mut self) {
        shutdown::mark_shutting_down();
        self.tunnel_supervisor.shutdown();
        let port = if self.server_port == 0 { 18080 } else { self.server_port };
        let token = get_management_token(self);
        if !token.is_empty() {
            let _ = shutdown::fast_loopback_request(
                port,
                &token,
                "POST",
                "/api/pause",
                Some(&serde_json::json!({ "paused": true })),
                200,
            );
            let _ = shutdown::fast_loopback_request(
                port,
                &token,
                "POST",
                "/api/shutdown",
                Some(&serde_json::json!({ "reason": "Desktop shutdown" })),
                400,
            );
        }
        std::thread::sleep(Duration::from_millis(100));
        if let Some(mut bridge) = self.bridge_supervisor.process.take() {
            shutdown::terminate_child_process_tree(&mut bridge);
        }
        if let Some(mut runner) = self.runner_process.take() {
            shutdown::terminate_child_process_tree(&mut runner);
        }
        if let Some(mut server) = self.server_process.take() {
            shutdown::terminate_child_process_tree(&mut server);
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub ready: bool,
    pub version: String,
    pub platform: String,
    pub bundled_runtime: bool,
    pub server_running: bool,
    pub runner_running: bool,
    pub startup_error: Option<String>,
}

#[tauri::command]
fn get_desktop_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
fn check_desktop_health(state: tauri::State<Arc<Mutex<SupervisorState>>>) -> SystemStatus {
    let (bundled, server_active, runner_active, startup_error) = match state.lock() {
        Ok(mut s) => {
            let server_active = s.server_process.as_mut().is_some_and(|p| p.try_wait().ok().flatten().is_none());
            let runner_active = s.runner_process.as_mut().is_some_and(|p| p.try_wait().ok().flatten().is_none());
            (s.bundled_node.is_some(), server_active, runner_active, s.startup_error.clone())
        },
        Err(_) => (false, false, false, Some("Supervisor state is unavailable".into())),
    };

    SystemStatus {
        ready: startup_error.is_none() && server_active && runner_active,
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        bundled_runtime: bundled,
        server_running: server_active,
        runner_running: runner_active,
        startup_error,
    }
}

fn is_port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(200),
    )
    .is_ok()
}

fn is_inside_repo() -> bool {
    if let Ok(exe) = std::env::current_exe() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        if exe.starts_with(manifest_dir) {
            return true;
        }
        let exe_str = exe.to_string_lossy().to_lowercase();
        if exe_str.contains("target\\release")
            || exe_str.contains("target\\debug")
            || exe_str.contains("apps\\desktop\\src-tauri")
        {
            return true;
        }
    }
    false
}

fn resolve_production_resources(app: &tauri::AppHandle) -> Result<ResourceDiagnostics, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Directory containing current executable (highest priority for portable & installed)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            candidates.push(parent.join("resources"));
            candidates.push(parent.to_path_buf());
        }
    }

    // 2. Tauri resource directory
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("resources"));
        candidates.push(res_dir);
    }

    let mut found_root: Option<PathBuf> = None;
    let mut fallback_count: u32 = 0;

    let node_bin_name = if cfg!(target_os = "windows") { "node.exe" } else { "node" };
    let bridge_bin_name = if cfg!(target_os = "windows") { "nexus-mcp-bridge.exe" } else { "nexus-mcp-bridge" };

    for cand in &candidates {
        let node_check = cand.join("runtime").join(node_bin_name);
        let server_check = cand.join("server").join("index.js");
        if (node_check.exists() || cand.join("runtime").join("node.exe").exists()) && server_check.exists() {
            found_root = Some(cand.clone());
            break;
        }
    }

    // If not found in production candidates, check if development fallback is permitted
    if found_root.is_none() {
        if is_inside_repo() {
            let dev_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
            if (dev_root.join("runtime").join(node_bin_name).exists()
                || dev_root.join("runtime").join("node.exe").exists())
                && dev_root.join("server").join("index.js").exists()
            {
                found_root = Some(dev_root);
                fallback_count = 1;
            }
        }
    }

    let resource_root = match found_root {
        Some(r) => r,
        None => {
            let searched = candidates
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            return Err(format!(
                "Fatal: Bundled production resources not found. Searched: [{}]. Source-tree fallback is forbidden outside repository.",
                searched
            ));
        }
    };

    let exe_str = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let node_path = {
        let preferred = resource_root.join("runtime").join(node_bin_name);
        if preferred.exists() {
            preferred
        } else {
            resource_root.join("runtime").join("node.exe")
        }
    };
    let server_entry = resource_root.join("server").join("index.js");
    let runner_entry = resource_root.join("runner").join("index.js");
    let bridge_entry = resource_root.join("bridge").join("index.js");
    let bridge_exe = {
        let preferred = resource_root.join("bridge").join(bridge_bin_name);
        if preferred.exists() {
            preferred
        } else {
            resource_root.join("bridge").join("nexus-mcp-bridge.exe")
        }
    };
    let lsp_root = resource_root.join("lsp");
    let skills_root = resource_root.join("skills");
    let laya_root = resource_root.join("laya");
    let laya_str = if laya_root.exists() {
        laya_root.to_string_lossy().to_string()
    } else {
        String::new()
    };

    let bridge_entry_str = if bridge_entry.exists() {
        bridge_entry.to_string_lossy().to_string()
    } else {
        String::new()
    };
    let bridge_exe_str = if bridge_exe.exists() {
        bridge_exe.to_string_lossy().to_string()
    } else {
        String::new()
    };

    let tunnel_cf = resource_root.join("tunnel").join("tunnel-client-runtime-cloudflared.exe");
    let tunnel_fallback = resource_root.join("tunnel").join("cloudflared.exe");
    let tunnel_str = if tunnel_cf.exists() {
        tunnel_cf.to_string_lossy().to_string()
    } else if tunnel_fallback.exists() {
        tunnel_fallback.to_string_lossy().to_string()
    } else {
        String::new()
    };

    Ok(ResourceDiagnostics {
        executable_path: exe_str,
        resource_root: resource_root.to_string_lossy().to_string(),
        node_path: node_path.to_string_lossy().to_string(),
        server_bundle_path: server_entry.to_string_lossy().to_string(),
        runner_bundle_path: runner_entry.to_string_lossy().to_string(),
        bridge_bundle_path: bridge_entry_str,
        bridge_executable_path: bridge_exe_str,
        lsp_root: lsp_root.to_string_lossy().to_string(),
        skills_root: skills_root.to_string_lossy().to_string(),
        laya_root: laya_str,
        tunnel_runtime_path: tunnel_str,
        webview_target: "tauri://localhost".to_string(),
        health_url: "http://127.0.0.1:18080/health".to_string(),
        source_tree_fallback_count: fallback_count,
    })
}

fn resolve_resource_file(app: &tauri::AppHandle, relative_path: &str) -> Option<PathBuf> {
    // 1. Directory containing current executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let p1 = parent.join("resources").join(relative_path);
            if p1.exists() {
                return Some(p1);
            }
            let p2 = parent.join(relative_path);
            if p2.exists() {
                return Some(p2);
            }
        }
    }

    // 2. Tauri resource directory
    if let Ok(res_dir) = app.path().resource_dir() {
        let p1 = res_dir.join("resources").join(relative_path);
        if p1.exists() {
            return Some(p1);
        }
        let p2 = res_dir.join(relative_path);
        if p2.exists() {
            return Some(p2);
        }
    }

    // 3. Fallback ONLY for development workspace inside repository
    if is_inside_repo() {
        let dev_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let dev_p = dev_root.join(relative_path);
        if dev_p.exists() {
            return Some(dev_p);
        }
    }

    None
}

fn log_resource_diagnostics(diag: &ResourceDiagnostics, data_dir: Option<&Path>) {
    let banner = format!(
        "\n==================================================\n\
         Nexus Resource Diagnostics:\n\
           Executable:       {}\n\
           Resource Root:    {}\n\
           Node Runtime:     {}\n\
           Server Bundle:    {}\n\
           Runner Bundle:    {}\n\
           LSP Root:         {}\n\
           Skills Root:      {}\n\
           Laya Root:        {}\n\
           Tunnel Runtime:   {}\n\
           WebView Target:   {}\n\
           Health URL:       {}\n\
           Source Fallbacks: {}\n\
         ==================================================",
        diag.executable_path,
        diag.resource_root,
        diag.node_path,
        diag.server_bundle_path,
        diag.runner_bundle_path,
        diag.lsp_root,
        diag.skills_root,
        if diag.laya_root.is_empty() { "Not Present" } else { &diag.laya_root },
        if diag.tunnel_runtime_path.is_empty() { "Not Present" } else { &diag.tunnel_runtime_path },
        diag.webview_target,
        diag.health_url,
        diag.source_tree_fallback_count
    );
    eprintln!("{}", banner);
    println!("{}", banner);

    if let Some(dir) = data_dir {
        let log_file = dir.join("desktop.log");
        let _ = std::fs::write(&log_file, &banner);
    }
}

fn get_or_create_token(prefix: &str, filename: &str, data_dir: &Path) -> Result<String, String> {
    let key_file = data_dir.join(filename);
    if key_file.exists() {
        let content = std::fs::read_to_string(&key_file)
            .map_err(|e| format!("Cannot read token file {}: {}", key_file.display(), e))?;
        let trimmed = content.trim();
        if trimmed.starts_with(prefix)
            && trimmed.len() == prefix.len() + 64
            && trimmed[prefix.len()..].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Ok(trimmed.to_string());
        }
        return Err(format!("Token file {} is invalid", key_file.display()));
    }

    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| format!("OS CSPRNG failure: {}", e))?;
    let mut token = String::with_capacity(prefix.len() + 64);
    token.push_str(prefix);
    for byte in bytes { token.push_str(&format!("{:02x}", byte)); }

    let temp_file = data_dir.join(format!(".{}.{}.tmp", filename, std::process::id()));
    use std::io::Write;
    let write_result = (|| -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temp_file)?;
        file.write_all(token.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&temp_file, &key_file)?;
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp_file);
        return Err(format!("Atomic token file write failed for {}: {}", key_file.display(), error));
    }
    Ok(token)
}

fn get_management_token(state: &SupervisorState) -> String {
    if let Some(ref t) = state.management_token {
        return t.clone();
    }
    if let Some(ref dir) = state.data_dir {
        let key_file = dir.join("management-token.key");
        if let Ok(content) = std::fs::read_to_string(&key_file) {
            let trimmed = content.trim();
            if trimmed.starts_with("lm_") {
                return trimmed.to_string();
            }
        }
    }
    let default_key = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("LocalBridge")
        .join("data")
        .join("management-token.key");
    if let Ok(content) = std::fs::read_to_string(&default_key) {
        let trimmed = content.trim();
        if trimmed.starts_with("lm_") {
            return trimmed.to_string();
        }
    }
    String::new()
}

fn decode_chunked(body: &str) -> String {
    let mut result = String::new();
    let mut rem = body;
    while let Some(pos) = rem.find("\r\n") {
        let size_hex = rem[..pos].trim();
        if let Ok(size) = usize::from_str_radix(size_hex, 16) {
            if size == 0 {
                break;
            }
            let chunk_start = pos + 2;
            if chunk_start + size <= rem.len() {
                result.push_str(&rem[chunk_start..chunk_start + size]);
                let next = chunk_start + size;
                rem = if next + 2 <= rem.len() && &rem[next..next + 2] == "\r\n" {
                    &rem[next + 2..]
                } else if next <= rem.len() {
                    &rem[next..]
                } else {
                    ""
                };
            } else {
                result.push_str(&rem[chunk_start..]);
                break;
            }
        } else {
            result.push_str(rem);
            break;
        }
    }
    result
}

fn loopback_management_request(
    port: u16,
    token: &str,
    method: &str,
    path: &str,
    body: Option<&serde_json::Value>,
) -> Result<serde_json::Value, String> {
    use std::io::{Read, Write};

    let body_str = body.map(|b| b.to_string()).unwrap_or_default();
    let body_bytes = body_str.as_bytes();

    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|e| format!("Failed to connect to local server (127.0.0.1:{}): {}", port, e))?;

    stream.set_read_timeout(Some(Duration::from_secs(15))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(15))).ok();

    let mut header = format!(
        "{} {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n",
        method, path, port
    );
    if !token.is_empty() {
        header.push_str(&format!("Authorization: Bearer {}\r\n", token));
    }
    if !body_bytes.is_empty() {
        header.push_str("Content-Type: application/json\r\n");
        header.push_str(&format!("Content-Length: {}\r\n", body_bytes.len()));
    } else {
        header.push_str("Content-Length: 0\r\n");
    }
    header.push_str("\r\n");

    stream.write_all(header.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    if !body_bytes.is_empty() {
        stream.write_all(body_bytes).map_err(|e| format!("Write body failed: {}", e))?;
    }
    stream.flush().ok();

    let mut raw_response = Vec::new();
    stream.read_to_end(&mut raw_response).map_err(|e| format!("Read failed: {}", e))?;

    let response_str = String::from_utf8_lossy(&raw_response);
    let mut parts = response_str.splitn(2, "\r\n\r\n");
    let headers_part = parts.next().unwrap_or("");
    let body_part = parts.next().unwrap_or("");

    let status_line = headers_part.lines().next().unwrap_or("");
    let status_code: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(500);

    let clean_body = if headers_part.to_lowercase().contains("transfer-encoding: chunked") {
        decode_chunked(body_part)
    } else {
        body_part.to_string()
    };

    if status_code >= 200 && status_code < 300 {
        if clean_body.trim().is_empty() {
            Ok(serde_json::json!({ "success": true }))
        } else {
            serde_json::from_str(&clean_body)
                .map_err(|e| format!("JSON decode error: {} - body: {}", e, clean_body))
        }
    } else {
        if let Ok(err_json) = serde_json::from_str::<serde_json::Value>(&clean_body) {
            if err_json.get("code").is_some() || err_json.get("success").is_some() {
                Err(clean_body)
            } else {
                let msg = err_json.get("error")
                    .or_else(|| err_json.get("message"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&clean_body);
                Err(msg.to_string())
            }
        } else {
            Err(format!("HTTP {}: {}", status_code, clean_body))
        }
    }
}

// Private Rust loopback helper for typed IPC commands.
// Not exposed directly to the WebView context.
fn desktop_management_call(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let (port, token) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        let port = if s.server_port > 0 { s.server_port } else { 18080 };
        let token = get_management_token(&s);
        (port, token)
    };
    loopback_management_request(port, &token, &method, &path, body.as_ref())
}

fn desktop_bridge_call(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let (port, token) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        let port = if s.bridge_supervisor.port > 0 { s.bridge_supervisor.port } else { 8787 };
        let token = get_management_token(&s);
        (port, token)
    };
    loopback_management_request(port, &token, &method, &path, body.as_ref())
}

#[tauri::command]
fn desktop_list_oauth_requests(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_bridge_call(state, "GET".into(), "/oauth/requests".into(), None)
}

#[tauri::command]
fn desktop_resolve_oauth_request(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    request_id: String,
    action: String,
    pairing_code: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "action": action,
    });
    if let Some(code) = pairing_code {
        payload["pairing_code"] = serde_json::Value::String(code);
    }
    desktop_bridge_call(
        state,
        "POST".into(),
        format!("/oauth/requests/{}/resolve", request_id),
        Some(payload),
    )
}

#[tauri::command]
fn desktop_set_server_url(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    url: String,
) -> Result<(), String> {
    if let Ok(mut s) = state.lock() {
        if let Some(pos) = url.rfind(':') {
            if let Ok(port) = url[pos + 1..].trim_matches('/').parse::<u16>() {
                s.server_port = port;
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn desktop_authorize_project(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    path: String,
    name: Option<String>,
    access_mode: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "path": path,
    });
    if let Some(n) = name {
        payload["name"] = serde_json::Value::String(n);
    }
    if let Some(m) = access_mode {
        payload["accessMode"] = serde_json::Value::String(m);
    }
    desktop_management_call(state, "POST".into(), "/api/management/projects/authorize".into(), Some(payload))
}

#[tauri::command]
fn desktop_set_project_access(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
    access_mode: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "accessMode": access_mode });
    desktop_management_call(state, "POST".into(), format!("/api/management/projects/{}/access", project_id), Some(payload))
}

#[tauri::command]
fn desktop_set_project_execution(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
    execution_mode: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "executionMode": execution_mode });
    desktop_management_call(state, "POST".into(), format!("/api/management/projects/{}/execution", project_id), Some(payload))
}

#[tauri::command]
fn desktop_enable_project(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(
        state,
        "POST".into(),
        format!("/api/management/projects/{}/enable", project_id),
        Some(serde_json::json!({})),
    )
}

#[tauri::command]
fn desktop_disable_project(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(
        state,
        "POST".into(),
        format!("/api/management/projects/{}/disable", project_id),
        Some(serde_json::json!({})),
    )
}

#[tauri::command]
fn desktop_remove_project(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "DELETE".into(), format!("/api/management/projects/{}", project_id), None)
}

#[tauri::command]
fn desktop_create_token(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    name: String,
    token_type: String,
    scopes: Option<Vec<String>>,
    expires_at: Option<i64>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "name": name,
        "type": token_type,
    });
    if let Some(s) = scopes {
        payload["scopes"] = serde_json::json!(s);
    }
    if let Some(exp) = expires_at {
        payload["expiresAt"] = serde_json::json!(exp);
    }
    desktop_management_call(state, "POST".into(), "/api/tokens".into(), Some(payload))
}

#[tauri::command]
fn desktop_revoke_token(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    token_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "DELETE".into(), format!("/api/tokens/{}", token_id), None)
}

#[tauri::command]
fn desktop_list_tokens(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/tokens".into(), None)
}

#[tauri::command]
fn desktop_list_approvals(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: Option<String>,
    status: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(p) = project_id {
        qs.push(format!("projectId={}", p));
    }
    if let Some(s) = status {
        qs.push(format!("status={}", s));
    }
    let path = if qs.is_empty() {
        "/api/approvals".to_string()
    } else {
        format!("/api/approvals?{}", qs.join("&"))
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_resolve_approval(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    approval_id: String,
    action: String,
    resolved_by: Option<String>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": action,
        "resolvedBy": resolved_by.unwrap_or_else(|| "desktop-user".into()),
    });
    desktop_management_call(state, "POST".into(), format!("/api/approvals/{}/resolve", approval_id), Some(payload))
}

#[tauri::command]
fn desktop_bulk_resolve_approvals(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    approval_ids: Vec<String>,
    action: String,
    resolved_by: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "approvalIds": approval_ids,
        "action": action,
    });
    if let Some(r) = resolved_by {
        payload["resolvedBy"] = serde_json::Value::String(r);
    }
    desktop_management_call(state, "POST".into(), "/api/management/approvals/bulk-resolve".into(), Some(payload))
}

#[tauri::command]
fn desktop_get_project_trust_policy(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), format!("/api/management/projects/{}/trust-policy", project_id), None)
}

#[tauri::command]
fn desktop_set_project_trust_policy(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
    trust_policy: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "trustPolicy": trust_policy });
    desktop_management_call(state, "POST".into(), format!("/api/management/projects/{}/trust-policy", project_id), Some(payload))
}

#[tauri::command]
fn desktop_grant_session_trust(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "action": "grant" });
    desktop_management_call(state, "POST".into(), format!("/api/management/projects/{}/session-trust", project_id), Some(payload))
}

#[tauri::command]
fn desktop_revoke_session_trust(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "DELETE".into(), format!("/api/management/projects/{}/session-trust", project_id), None)
}

#[tauri::command]
fn desktop_reset_trust_defaults(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), "/api/management/trust/reset-defaults".into(), None)
}

#[tauri::command]
fn desktop_clear_session_trusts(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), "/api/management/trust/clear-sessions".into(), None)
}

#[tauri::command]
fn desktop_get_operator_name(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/settings/operator".into(), None)
}

#[tauri::command]
fn desktop_set_operator_name(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    display_name: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "displayName": display_name });
    desktop_management_call(state, "POST".into(), "/api/management/settings/operator".into(), Some(payload))
}

#[tauri::command]
fn desktop_get_approval_routing_mode(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/settings/approval-routing".into(), None)
}

#[tauri::command]
fn desktop_set_approval_routing_mode(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    mode: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "mode": mode });
    desktop_management_call(state, "POST".into(), "/api/management/settings/approval-routing".into(), Some(payload))
}

#[tauri::command]
fn desktop_get_safety_layer_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/settings/safety-layer".into(), None)
}

#[tauri::command]
fn desktop_set_safety_layer_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    disabled: bool,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "disabled": disabled });
    desktop_management_call(state, "POST".into(), "/api/management/settings/safety-layer".into(), Some(payload))
}

#[tauri::command]
fn desktop_get_lsp_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let path = if let Some(p) = project_id {
        format!("/api/management/lsp/status?projectId={}", p)
    } else {
        "/api/management/lsp/status".to_string()
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_restart_lsp(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "projectId": project_id });
    desktop_management_call(state, "POST".into(), "/api/management/lsp/restart".into(), Some(payload))
}

#[tauri::command]
fn desktop_stop_lsp(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "projectId": project_id });
    desktop_management_call(state, "POST".into(), "/api/management/lsp/stop".into(), Some(payload))
}

#[tauri::command]
fn desktop_list_sessions(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: Option<String>,
    session_state: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(p) = project_id {
        qs.push(format!("projectId={}", p));
    }
    if let Some(s) = session_state {
        qs.push(format!("state={}", s));
    }
    if let Some(l) = limit {
        qs.push(format!("limit={}", l));
    }
    if let Some(o) = offset {
        qs.push(format!("offset={}", o));
    }
    let path = if qs.is_empty() {
        "/api/management/sessions".to_string()
    } else {
        format!("/api/management/sessions?{}", qs.join("&"))
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_get_session(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), format!("/api/management/sessions/{}", session_id), None)
}

#[tauri::command]
fn desktop_get_session_events(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    session_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(c) = cursor {
        qs.push(format!("cursor={}", c));
    }
    if let Some(l) = limit {
        qs.push(format!("limit={}", l));
    }
    let path = if qs.is_empty() {
        format!("/api/management/sessions/{}/events", session_id)
    } else {
        format!("/api/management/sessions/{}/events?{}", session_id, qs.join("&"))
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_get_session_handoff(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), format!("/api/management/sessions/{}/handoff", session_id), None)
}

#[tauri::command]
fn desktop_start_session(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: String,
    title: Option<String>,
    goals: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({ "projectId": project_id });
    if let Some(t) = title {
        payload["title"] = serde_json::json!(t);
    }
    if let Some(g) = goals {
        payload["goals"] = serde_json::json!(g);
    }
    desktop_management_call(state, "POST".into(), "/api/management/sessions/start".into(), Some(payload))
}

#[tauri::command]
fn desktop_checkpoint_session(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    session_id: String,
    summary: String,
    next_steps: Option<Vec<String>>,
    blockers: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({ "summary": summary });
    if let Some(ns) = next_steps {
        payload["nextSteps"] = serde_json::json!(ns);
    }
    if let Some(b) = blockers {
        payload["blockers"] = serde_json::json!(b);
    }
    desktop_management_call(state, "POST".into(), format!("/api/management/sessions/{}/checkpoint", session_id), Some(payload))
}

#[tauri::command]
fn desktop_finish_session(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    session_id: String,
    reason: Option<String>,
    notes: Option<String>,
    outcome: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "outcome": outcome.unwrap_or_else(|| "completed".to_string()),
    });
    if let Some(r) = reason {
        payload["reason"] = serde_json::json!(r.clone());
        payload["finalNote"] = serde_json::json!(r);
    }
    if let Some(n) = notes {
        payload["notes"] = serde_json::json!(n.clone());
        payload["finalNote"] = serde_json::json!(n);
    }
    desktop_management_call(state, "POST".into(), format!("/api/management/sessions/{}/finish", session_id), Some(payload))
}

#[tauri::command]
fn desktop_get_intelligence_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/intelligence/status".into(), None)
}

#[tauri::command]
fn desktop_update_intelligence_config(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    provider: Option<String>,
    model_path: Option<String>,
    python_path: Option<String>,
    worker_timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({});
    if let Some(p) = provider {
        payload["provider"] = serde_json::json!(p);
    }
    if let Some(mp) = model_path {
        payload["modelPath"] = serde_json::json!(mp);
    }
    if let Some(pp) = python_path {
        payload["pythonPath"] = serde_json::json!(pp);
    }
    if let Some(to) = worker_timeout_ms {
        payload["workerTimeoutMs"] = serde_json::json!(to);
    }
    desktop_management_call(state, "POST".into(), "/api/management/intelligence/config".into(), Some(payload))
}

#[tauri::command]
fn desktop_get_model_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/intelligence/model/status".into(), None)
}

#[tauri::command]
fn desktop_start_model_download(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    proxy_mode: Option<String>,
    custom_proxy_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({});
    if let Some(pm) = proxy_mode {
        payload["proxyMode"] = serde_json::json!(pm);
    }
    if let Some(cpu) = custom_proxy_url {
        payload["customProxyUrl"] = serde_json::json!(cpu);
    }
    desktop_management_call(state, "POST".into(), "/api/management/intelligence/model/download".into(), Some(payload))
}

#[tauri::command]
fn desktop_cancel_model_download(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), "/api/management/intelligence/model/cancel".into(), None)
}

#[tauri::command]
fn desktop_download_and_enable_model(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    proxy_mode: Option<String>,
    custom_proxy_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({});
    if let Some(pm) = proxy_mode {
        payload["proxyMode"] = serde_json::json!(pm);
    }
    if let Some(cpu) = custom_proxy_url {
        payload["customProxyUrl"] = serde_json::json!(cpu);
    }
    desktop_management_call(state, "POST".into(), "/api/management/intelligence/model/download-and-enable".into(), Some(payload))
}

#[tauri::command]
fn desktop_validate_model_path(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    model_path: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "modelPath": model_path });
    desktop_management_call(state, "POST".into(), "/api/management/intelligence/model/validate".into(), Some(payload))
}

#[tauri::command]
fn desktop_set_model_path(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    model_path: String,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "modelPath": model_path });
    desktop_management_call(state, "POST".into(), "/api/management/intelligence/model/set-path".into(), Some(payload))
}

#[tauri::command]
fn desktop_import_model(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    source_dir: String,
    copy_to_managed: Option<bool>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "sourceDir": source_dir,
        "copyToManaged": copy_to_managed.unwrap_or(false)
    });
    desktop_management_call(state, "POST".into(), "/api/management/intelligence/model/import".into(), Some(payload))
}

#[tauri::command]
fn desktop_evaluate_intelligence(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    context: serde_json::Value,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), "/api/management/intelligence/evaluate".into(), Some(context))
}

#[tauri::command]
fn desktop_list_ai_connections(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/connections".into(), None)
}

#[tauri::command]
fn desktop_get_ai_connection(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), format!("/api/management/connections/{}", id), None)
}

#[tauri::command]
fn desktop_rotate_ai_connection_token(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    id: String,
    scopes: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "scopes": scopes });
    desktop_management_call(state, "POST".into(), format!("/api/management/connections/{}/token/rotate", id), Some(payload))
}

#[tauri::command]
fn desktop_revoke_ai_connection_token(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), format!("/api/management/connections/{}/token/revoke", id), None)
}

#[tauri::command]
fn desktop_test_ai_connection(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), format!("/api/management/connections/{}/test", id), None)
}

// ============================================================
// Skills Management IPC (Zero Management Secret Exposure)
// ============================================================

#[tauri::command]
fn desktop_list_skills(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: Option<String>,
    category: Option<String>,
    source: Option<String>,
    enabled_only: Option<bool>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(p) = project_id {
        qs.push(format!("projectId={}", p));
    }
    if let Some(c) = category {
        qs.push(format!("category={}", c));
    }
    if let Some(s) = source {
        qs.push(format!("source={}", s));
    }
    if let Some(e) = enabled_only {
        qs.push(format!("enabledOnly={}", e));
    }
    let path = if qs.is_empty() {
        "/api/skills".to_string()
    } else {
        format!("/api/skills?{}", qs.join("&"))
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_get_skill(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    skill_id: String,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let path = if let Some(p) = project_id {
        format!("/api/skills/{}?projectId={}", skill_id, p)
    } else {
        format!("/api/skills/{}", skill_id)
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_reload_skills(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_dirs: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "projectDirs": project_dirs.unwrap_or_else(|| serde_json::json!([]))
    });
    desktop_management_call(state, "POST".into(), "/api/skills/reload".into(), Some(payload))
}

#[tauri::command]
fn desktop_toggle_skill(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    skill_id: String,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "enabled": enabled
    });
    desktop_management_call(
        state,
        "PATCH".into(),
        format!("/api/skills/{}/toggle", skill_id),
        Some(payload),
    )
}

#[tauri::command]
fn desktop_match_skill(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    query: String,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "query": query
    });
    if let Some(p) = project_id {
        payload["projectId"] = serde_json::Value::String(p);
    }
    desktop_management_call(state, "POST".into(), "/api/skills/match".into(), Some(payload))
}

// Aliases for skills_* naming
#[tauri::command]
fn skills_list(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: Option<String>,
    category: Option<String>,
    source: Option<String>,
    enabled_only: Option<bool>,
) -> Result<serde_json::Value, String> {
    desktop_list_skills(state, project_id, category, source, enabled_only)
}

#[tauri::command]
fn skills_get(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    skill_id: String,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    desktop_get_skill(state, skill_id, project_id)
}

#[tauri::command]
fn skills_reload(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_dirs: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    desktop_reload_skills(state, project_dirs)
}

#[tauri::command]
fn skills_toggle(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    skill_id: String,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    desktop_toggle_skill(state, skill_id, enabled)
}

#[tauri::command]
fn skills_match(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    query: String,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    desktop_match_skill(state, query, project_id)
}

#[tauri::command]
fn skills_preview_import(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    source_type: String,
    source_path: Option<String>,
    zip_base64: Option<String>,
    target: Option<String>,
    project_id: Option<String>,
    sub_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "sourceType": source_type,
        "target": target.unwrap_or_else(|| "user".to_string()),
    });
    if let Some(sp) = source_path {
        payload["sourcePath"] = serde_json::Value::String(sp);
    }
    if let Some(zb) = zip_base64 {
        payload["zipBase64"] = serde_json::Value::String(zb);
    }
    if let Some(pid) = project_id {
        payload["projectId"] = serde_json::Value::String(pid);
    }
    if let Some(sub) = sub_path {
        payload["subPath"] = serde_json::Value::String(sub);
    }
    desktop_management_call(state, "POST".into(), "/api/skills/preview".into(), Some(payload))
}

#[tauri::command]
fn skills_import_folder(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    source_path: String,
    target: String,
    project_id: Option<String>,
    project_root: Option<String>,
    overwrite: Option<bool>,
    custom_yaml: Option<String>,
    sub_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "sourceType": "folder",
        "sourcePath": source_path,
        "target": target,
        "overwrite": overwrite.unwrap_or(false),
    });
    if let Some(pid) = project_id {
        payload["projectId"] = serde_json::Value::String(pid);
    }
    if let Some(pr) = project_root {
        payload["projectRoot"] = serde_json::Value::String(pr);
    }
    if let Some(cy) = custom_yaml {
        payload["customYaml"] = serde_json::Value::String(cy);
    }
    if let Some(sub) = sub_path {
        payload["subPath"] = serde_json::Value::String(sub);
    }
    match desktop_management_call(state, "POST".into(), "/api/skills/import".into(), Some(payload)) {
        Ok(v) => Ok(v),
        Err(err_str) => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&err_str) {
                if v.get("success").and_then(|b| b.as_bool()) == Some(false) {
                    return Ok(v);
                }
            }
            Err(err_str)
        }
    }
}

#[tauri::command]
fn skills_import_zip(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    source_path: Option<String>,
    zip_base64: Option<String>,
    target: String,
    project_id: Option<String>,
    project_root: Option<String>,
    overwrite: Option<bool>,
    custom_yaml: Option<String>,
    sub_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "sourceType": "zip",
        "target": target,
        "overwrite": overwrite.unwrap_or(false),
    });
    if let Some(sp) = source_path {
        payload["sourcePath"] = serde_json::Value::String(sp);
    }
    if let Some(zb) = zip_base64 {
        payload["zipBase64"] = serde_json::Value::String(zb);
    }
    if let Some(pid) = project_id {
        payload["projectId"] = serde_json::Value::String(pid);
    }
    if let Some(pr) = project_root {
        payload["projectRoot"] = serde_json::Value::String(pr);
    }
    if let Some(cy) = custom_yaml {
        payload["customYaml"] = serde_json::Value::String(cy);
    }
    if let Some(sub) = sub_path {
        payload["subPath"] = serde_json::Value::String(sub);
    }
    match desktop_management_call(state, "POST".into(), "/api/skills/import".into(), Some(payload)) {
        Ok(v) => Ok(v),
        Err(err_str) => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&err_str) {
                if v.get("success").and_then(|b| b.as_bool()) == Some(false) {
                    return Ok(v);
                }
            }
            Err(err_str)
        }
    }
}

#[tauri::command]
fn skills_import_batch(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    source_type: String,
    source_path: Option<String>,
    zip_base64: Option<String>,
    target: Option<String>,
    project_id: Option<String>,
    project_root: Option<String>,
    overwrite: Option<bool>,
    collection_name: Option<String>,
    selected_candidate_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "sourceType": source_type,
        "target": target.unwrap_or_else(|| "user".to_string()),
        "overwrite": overwrite.unwrap_or(false),
        "selectedCandidateIds": selected_candidate_ids,
    });
    if let Some(sp) = source_path {
        payload["sourcePath"] = serde_json::Value::String(sp);
    }
    if let Some(zb) = zip_base64 {
        payload["zipBase64"] = serde_json::Value::String(zb);
    }
    if let Some(pid) = project_id {
        payload["projectId"] = serde_json::Value::String(pid);
    }
    if let Some(pr) = project_root {
        payload["projectRoot"] = serde_json::Value::String(pr);
    }
    if let Some(cn) = collection_name {
        payload["collectionName"] = serde_json::Value::String(cn);
    }
    match desktop_management_call(state, "POST".into(), "/api/skills/import-batch".into(), Some(payload)) {
        Ok(v) => Ok(v),
        Err(err_str) => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&err_str) {
                if v.get("success").and_then(|b| b.as_bool()) == Some(false) {
                    return Ok(v);
                }
            }
            Err(err_str)
        }
    }
}

#[tauri::command]
fn skills_toggle_collection(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    collection_id: String,
    enabled: bool,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({
        "enabled": enabled,
    });
    if let Some(pid) = project_id {
        payload["projectId"] = serde_json::Value::String(pid);
    }
    let path = format!("/api/skills/collections/{}/toggle", collection_id);
    desktop_management_call(state, "PATCH".into(), path, Some(payload))
}

#[tauri::command]
fn desktop_toggle_collection(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    collection_id: String,
    enabled: bool,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    skills_toggle_collection(state, collection_id, enabled, project_id)
}

#[tauri::command]
fn skills_delete(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    skill_id: String,
    target: Option<String>,
    project_id: Option<String>,
    project_root: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(t) = target {
        qs.push(format!("target={}", t));
    }
    if let Some(pid) = project_id {
        qs.push(format!("projectId={}", pid));
    }
    if let Some(pr) = project_root {
        qs.push(format!("projectRoot={}", pr));
    }
    let query_str = if qs.is_empty() {
        "".to_string()
    } else {
        format!("?{}", qs.join("&"))
    };
    let path = format!("/api/skills/{}{}", skill_id, query_str);
    desktop_management_call(state, "DELETE".into(), path, None)
}

#[tauri::command]
fn skills_get_raw(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    skill_id: String,
    project_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let path = match project_id {
        Some(p) => format!("/api/skills/{}/raw?projectId={}", skill_id, p),
        None => format!("/api/skills/{}/raw", skill_id),
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn skills_open_source_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Directory does not exist".into());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn desktop_list_jobs(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    project_id: Option<String>,
    limit: Option<u32>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(p) = project_id {
        qs.push(format!("projectId={}", p));
    }
    if let Some(l) = limit {
        qs.push(format!("limit={}", l));
    }
    let path = if qs.is_empty() {
        "/api/jobs".to_string()
    } else {
        format!("/api/jobs?{}", qs.join("&"))
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_cancel_job(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    job_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), format!("/api/jobs/{}/cancel", job_id), None)
}

#[tauri::command]
fn desktop_get_job_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    job_id: String,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), format!("/api/jobs/{}/status", job_id), None)
}

#[tauri::command]
fn desktop_get_job_logs(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    job_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
) -> Result<serde_json::Value, String> {
    let mut qs = Vec::new();
    if let Some(c) = cursor {
        qs.push(format!("cursor={}", c));
    }
    if let Some(l) = limit {
        qs.push(format!("limit={}", l));
    }
    let path = if qs.is_empty() {
        format!("/api/jobs/{}/logs", job_id)
    } else {
        format!("/api/jobs/{}/logs?{}", job_id, qs.join("&"))
    };
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_get_pause_state(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/pause".into(), None)
}

#[tauri::command]
fn desktop_set_pause_state(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    paused: bool,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({ "paused": paused });
    desktop_management_call(state, "POST".into(), "/api/pause".into(), Some(payload))
}

#[tauri::command]
fn desktop_emergency_stop(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    reason: Option<String>,
) -> Result<serde_json::Value, String> {
    if let Ok(mut s) = state.lock() {
        s.tunnel_supervisor.stop();
    }
    let payload = serde_json::json!({
        "reason": reason.unwrap_or_else(|| "Emergency stop initiated from Desktop".into()),
    });
    desktop_management_call(state, "POST".into(), "/api/emergency-stop".into(), Some(payload))
}

#[tauri::command]
fn desktop_get_full_control_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/full-control/status".into(), None)
}

#[tauri::command]
fn desktop_start_full_control(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "POST".into(), "/api/management/full-control/start".into(), Some(params))
}

#[tauri::command]
fn desktop_stop_full_control(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    session_id: Option<String>,
    client_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "sessionId": session_id,
        "clientId": client_id,
    });
    desktop_management_call(state, "POST".into(), "/api/management/full-control/stop".into(), Some(payload))
}

#[tauri::command]
fn desktop_get_computer_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/computer/status".into(), None)
}

#[tauri::command]
fn desktop_get_takeover_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/computer/takeover/status".into(), None)
}

#[tauri::command]
fn desktop_take_control(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    taken_by: Option<String>,
    reason: Option<String>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "takenBy": taken_by.unwrap_or_else(|| "Desktop User".into()),
        "reason": reason.unwrap_or_else(|| "Manual human inspection".into()),
    });
    desktop_management_call(state, "POST".into(), "/api/management/computer/take-control".into(), Some(payload))
}

#[tauri::command]
fn desktop_return_control(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    returned_by: Option<String>,
    return_note: Option<String>,
) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "returnedBy": returned_by.unwrap_or_else(|| "Desktop User".into()),
        "returnNote": return_note.unwrap_or_else(|| "Control returned to AI".into()),
    });
    desktop_management_call(state, "POST".into(), "/api/management/computer/return-control".into(), Some(payload))
}

#[tauri::command]
fn desktop_get_computer_screenshot(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/management/computer/screenshot".into(), None)
}

#[tauri::command]
fn desktop_list_audit(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    limit: Option<u32>,
) -> Result<serde_json::Value, String> {
    let path = format!("/api/audit?limit={}", limit.unwrap_or(100));
    desktop_management_call(state, "GET".into(), path, None)
}

#[tauri::command]
fn desktop_list_projects(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/projects".into(), None)
}

#[tauri::command]
fn desktop_get_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/status".into(), None)
}

#[tauri::command]
fn desktop_get_mcp_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    desktop_management_call(state, "GET".into(), "/api/mcp/status".into(), None)
}

#[tauri::command]
fn desktop_list_runners(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    let val = desktop_management_call(state, "GET".into(), "/api/runners".into(), None)?;
    if val.is_array() {
        Ok(serde_json::json!({ "runners": val }))
    } else {
        Ok(val)
    }
}

#[tauri::command]
fn desktop_api_request(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let method_upper = method.trim().to_uppercase();
    if !["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].contains(&method_upper.as_str()) {
        return Err("Forbidden: Invalid HTTP method".into());
    }
    if (!path.starts_with("/api/") && path != "/api")
        || path.contains("..")
        || path.contains('\r')
        || path.contains('\n')
    {
        return Err("Forbidden: Only /api/ loopback endpoints are permitted".into());
    }
    let sanitized_body = match body {
        Some(serde_json::Value::Null) | None => None,
        Some(v) => Some(v),
    };
    desktop_management_call(state, method_upper, path, sanitized_body)
}

fn spawn_tunnel_internal(
    app: &tauri::AppHandle,
    state: Arc<Mutex<SupervisorState>>,
) -> Result<(), String> {
    let tunnel_exe = match resolve_resource_file(app, "tunnel/tunnel-client-runtime-cloudflared.exe") {
        Some(p) => p,
        None => {
            if let Ok(mut s) = state.lock() {
                s.tunnel_supervisor.status = tunnel::TunnelStatus::RuntimeMissing;
                s.tunnel_supervisor.error_message = Some("Bundled tunnel runtime not found in application resources".into());
            }
            return Err("Bundled tunnel runtime not found in application resources".into());
        }
    };

    let (cfg, server_port) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        let cfg = match &s.tunnel_supervisor.config {
            Some(c) => c.clone(),
            None => {
                return Err("Tunnel is not configured. Please configure Tunnel ID and Runtime API Key first.".into());
            }
        };
        let port = if s.server_port > 0 { s.server_port } else { 18080 };
        (cfg, port)
    };

    if cfg.tunnel_id.trim().is_empty() || cfg.runtime_api_key.trim().is_empty() || cfg.mcp_token.trim().is_empty() {
        if let Ok(mut s) = state.lock() {
            s.tunnel_supervisor.status = tunnel::TunnelStatus::NotConfigured;
            s.tunnel_supervisor.error_message = Some("Tunnel ID, Runtime API Key, and LocalBridge MCP Token are required.".into());
        }
        return Err("Tunnel configuration is incomplete".into());
    }

    if is_port_open(cfg.health_port) && !tunnel::TunnelSupervisor::check_readyz(cfg.health_port) {
        let msg = format!("Health port {} is already in use by another application.", cfg.health_port);
        if let Ok(mut s) = state.lock() {
            s.tunnel_supervisor.status = tunnel::TunnelStatus::HealthPortConflict;
            s.tunnel_supervisor.error_message = Some(msg.clone());
        }
        return Err(msg);
    }

    // Determine outbound proxy according to network_mode
    let (proxy_env, active_proxy_url) = match cfg.network_mode {
        tunnel::TunnelNetworkMode::Direct => (None, None),
        tunnel::TunnelNetworkMode::System => {
            match tunnel::resolve_windows_system_proxy() {
                Ok(Some(p)) => {
                    let p_clone = p.clone();
                    (Some(p), Some(p_clone))
                }
                Ok(None) => {
                    if let Ok(mut s) = state.lock() {
                        s.tunnel_supervisor.status = tunnel::TunnelStatus::Error;
                        s.tunnel_supervisor.error_message = Some("System Proxy mode is selected but no active Windows system proxy was found.".into());
                        s.tunnel_supervisor.proxy_status = Some("NotConfigured".into());
                    }
                    return Err("System Proxy mode is selected but no active Windows system proxy was found.".into());
                }
                Err(e) => {
                    if let Ok(mut s) = state.lock() {
                        s.tunnel_supervisor.status = tunnel::TunnelStatus::Error;
                        s.tunnel_supervisor.error_message = Some(format!("System proxy error: {}", e));
                        s.tunnel_supervisor.proxy_status = Some("Unsupported".into());
                    }
                    return Err(e);
                }
            }
        }
        tunnel::TunnelNetworkMode::Custom => {
            let custom_p = cfg.custom_proxy_url.as_deref().unwrap_or("").trim();
            if custom_p.is_empty() {
                if let Ok(mut s) = state.lock() {
                    s.tunnel_supervisor.status = tunnel::TunnelStatus::Error;
                    s.tunnel_supervisor.error_message = Some("Custom proxy URL is empty.".into());
                    s.tunnel_supervisor.proxy_status = Some("NotConfigured".into());
                }
                return Err("Custom proxy URL is empty.".into());
            }
            if custom_p.contains('@') {
                return Err("Proxy authentication credentials are not supported. Please use an unauthenticated proxy.".into());
            }
            let normalized = tunnel::normalize_proxy_server(custom_p);
            (Some(normalized.clone()), Some(normalized))
        }
    };

    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.tunnel_supervisor.stop();
    }

    let sanitized_tunnel_id = {
        let raw = cfg.tunnel_id.trim();
        if let Some(pos) = raw.find("tunnel_") {
            let candidate = &raw[pos..];
            let end = candidate.find(|c: char| !c.is_ascii_alphanumeric() && c != '_').unwrap_or(candidate.len());
            candidate[..end].to_string()
        } else {
            raw.to_string()
        }
    };

    let mut cmd = Command::new(&tunnel_exe);
    let mut args = vec![
        "run".to_string(),
        "--log.level=info".to_string(),
        "--log.format=struct-text".to_string(),
        format!("--health.listen-addr=127.0.0.1:{}", cfg.health_port),
        format!("--control-plane.tunnel-id={}", sanitized_tunnel_id),
        format!("--control-plane.api-key=env:CONTROL_PLANE_API_KEY"),
        format!("--mcp.server-url=http://127.0.0.1:{}/mcp", server_port),
        format!("--mcp.extra-headers=Authorization: env:LOCALBRIDGE_MCP_AUTH"),
    ];
    if let Some(ref p) = proxy_env {
        args.push(format!("--control-plane.http-proxy={}", p));
    }
    cmd.args(&args);

    if let Some(parent) = tunnel_exe.parent() {
        cmd.current_dir(parent);
        let cf_path = parent.join("cloudflared.exe");
        if cf_path.exists() {
            cmd.env("CLOUDFLARED_PATH", cf_path);
        }
    }
    cmd.env("CONTROL_PLANE_API_KEY", &cfg.runtime_api_key);
    cmd.env("CONTROL_PLANE_TUNNEL_ID", &sanitized_tunnel_id);
    cmd.env("MCP_SERVER_URL", format!("http://127.0.0.1:{}/mcp", server_port));
    cmd.env("LOCALBRIDGE_MCP_AUTH", format!("Bearer {}", cfg.mcp_token));
    cmd.env("MCP_EXTRA_HEADERS", "Authorization: env:LOCALBRIDGE_MCP_AUTH");
    cmd.env("HEALTH_LISTEN_ADDR", format!("127.0.0.1:{}", cfg.health_port));

    // Clear inherited proxy variables
    cmd.env_remove("TUNNEL_CLIENT_HTTP_PROXY");
    cmd.env_remove("HTTP_PROXY");
    cmd.env_remove("HTTPS_PROXY");
    cmd.env_remove("ALL_PROXY");

    // Local loopback is strictly never proxied
    cmd.env("NO_PROXY", "127.0.0.1,localhost,::1");

    // Inject CONTROL_PLANE_HTTP_PROXY only if proxy is configured
    if let Some(ref p) = proxy_env {
        cmd.env("CONTROL_PLANE_HTTP_PROXY", p);
    } else {
        cmd.env_remove("CONTROL_PLANE_HTTP_PROXY");
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("Failed to spawn tunnel client: {}", e);
            if let Ok(mut s) = state.lock() {
                s.tunnel_supervisor.status = tunnel::TunnelStatus::Error;
                s.tunnel_supervisor.error_message = Some(msg.clone());
            }
            return Err(msg);
        }
    };

    // Check if child process exited immediately on startup
    std::thread::sleep(Duration::from_millis(150));
    if let Ok(Some(exit_status)) = child.try_wait() {
        let msg = format!("Tunnel client exited immediately on startup (exit code: {:?})", exit_status.code());
        if let Ok(mut s) = state.lock() {
            s.tunnel_supervisor.status = tunnel::TunnelStatus::Error;
            s.tunnel_supervisor.error_message = Some(msg.clone());
            s.tunnel_supervisor.process = None;
        }
        return Err(msg);
    }

    #[cfg(target_os = "windows")]
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if let Some(ref job) = s.job_object {
            job.assign_child(&child);
        }
    }

    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.tunnel_supervisor.process = Some(child);
        s.tunnel_supervisor.status = tunnel::TunnelStatus::Connecting;
        s.tunnel_supervisor.error_message = None;
        s.tunnel_supervisor.should_run = true;
        s.tunnel_supervisor.active_proxy_url = active_proxy_url;
        s.tunnel_supervisor.proxy_status = if proxy_env.is_some() { Some("Reachable".into()) } else { None };
        s.tunnel_supervisor.control_plane_status = Some("Polling".into());
        s.tunnel_supervisor.local_mcp_status = Some("Connected".into());
    }

    Ok(())
}

#[tauri::command]
fn desktop_tunnel_get_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<tunnel::TunnelStatusDto, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.tunnel_supervisor.get_status_dto())
}

#[tauri::command]
fn desktop_tunnel_save_config(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    runtime_api_key: Option<String>,
    mcp_token: Option<String>,
    auto_reconnect: Option<bool>,
    health_port: Option<u16>,
    network_mode: Option<String>,
    custom_proxy_url: Option<String>,
    connect_now: Option<bool>,
) -> Result<tunnel::TunnelStatusDto, String> {
    let data_dir = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.data_dir.clone().ok_or("Data directory unavailable")?
    };

    let existing_cfg = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.tunnel_supervisor.config.clone()
            .or_else(|| tunnel::TunnelConfig::load_encrypted(&data_dir).ok().flatten())
    };

    let final_api_key = match runtime_api_key {
        Some(k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => existing_cfg.as_ref().map(|c| c.runtime_api_key.clone()).unwrap_or_default(),
    };

    let final_mcp_token = match mcp_token {
        Some(t) if !t.trim().is_empty() => t.trim().to_string(),
        _ => existing_cfg.as_ref().map(|c| c.mcp_token.clone()).unwrap_or_default(),
    };

    let parsed_network_mode = match network_mode.as_deref().unwrap_or("system").to_lowercase().as_str() {
        "direct" => tunnel::TunnelNetworkMode::Direct,
        "custom" => tunnel::TunnelNetworkMode::Custom,
        _ => tunnel::TunnelNetworkMode::System,
    };

    let sanitized_custom_proxy = custom_proxy_url.and_then(|u| {
        let trimmed = u.trim().to_string();
        if trimmed.is_empty() { None } else { Some(trimmed) }
    });

    if let Some(ref p) = sanitized_custom_proxy {
        if p.contains('@') {
            return Err("Proxy authentication credentials are not supported. Please use an unauthenticated proxy.".into());
        }
    }

    let cfg = tunnel::TunnelConfig {
        tunnel_id: tunnel_id.trim().to_string(),
        runtime_api_key: final_api_key,
        mcp_token: final_mcp_token,
        auto_reconnect: auto_reconnect.unwrap_or(true),
        health_port: health_port.unwrap_or(8080),
        network_mode: parsed_network_mode,
        custom_proxy_url: sanitized_custom_proxy,
    };

    let was_running = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let active = s.tunnel_supervisor.is_active();
        s.tunnel_supervisor.set_config(cfg, &data_dir)?;
        active
    };

    if connect_now.unwrap_or(false) || was_running {
        let _ = spawn_tunnel_internal(&app_handle, state.inner().clone());
    }

    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.tunnel_supervisor.get_status_dto())
}

#[tauri::command]
fn desktop_tunnel_auto_create_token(
    app_handle: tauri::AppHandle,
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    scopes: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let token_scopes = scopes.unwrap_or_else(|| vec!["read".into(), "write".into(), "execute".into()]);
    let (port, mgmt_token, data_dir) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        let port = if s.server_port > 0 { s.server_port } else { 18080 };
        let mgmt_token = get_management_token(&s);
        let data_dir = s.data_dir.clone().ok_or("Data directory unavailable")?;
        (port, mgmt_token, data_dir)
    };

    let payload = serde_json::json!({
        "name": "ChatGPT Tunnel",
        "type": "mcp",
        "scopes": token_scopes
    });

    let resp = loopback_management_request(port, &mgmt_token, "POST", "/api/tokens", Some(&payload))?;
    let lb_token = resp.get("token")
        .and_then(|t| t.as_str().or_else(|| t.get("token").and_then(|inner| inner.as_str())))
        .ok_or("Server response did not contain token secret")?;

    let was_running = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let mut cfg = s.tunnel_supervisor.config.clone()
            .or_else(|| tunnel::TunnelConfig::load_encrypted(&data_dir).ok().flatten())
            .unwrap_or(tunnel::TunnelConfig {
                tunnel_id: String::new(),
                runtime_api_key: String::new(),
                mcp_token: lb_token.to_string(),
                auto_reconnect: true,
                health_port: 8080,
                network_mode: tunnel::TunnelNetworkMode::System,
                custom_proxy_url: None,
            });
        cfg.mcp_token = lb_token.to_string();
        let active = s.tunnel_supervisor.is_active();
        s.tunnel_supervisor.set_config(cfg, &data_dir)?;
        active
    };

    if was_running {
        let _ = spawn_tunnel_internal(&app_handle, state.inner().clone());
    }

    Ok(serde_json::json!({
        "success": true,
        "token": lb_token,
        "message": "Tunnel MCP token created and securely stored"
    }))
}

#[tauri::command]
fn desktop_tunnel_get_mcp_token(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<serde_json::Value, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let token = {
        let in_mem = s.tunnel_supervisor.config.as_ref().map(|c| c.mcp_token.clone()).unwrap_or_default();
        if !in_mem.trim().is_empty() {
            in_mem
        } else if let Some(ref data_dir) = s.data_dir {
            tunnel::TunnelConfig::load_encrypted(data_dir)
                .ok()
                .flatten()
                .map(|c| c.mcp_token)
                .unwrap_or_default()
        } else {
            String::new()
        }
    };
    Ok(serde_json::json!({
        "token": token
    }))
}

#[tauri::command]
fn desktop_tunnel_save_mcp_token(
    app_handle: tauri::AppHandle,
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    token: String,
) -> Result<serde_json::Value, String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("Token cannot be empty".into());
    }
    let data_dir = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.data_dir.clone().ok_or("Data directory unavailable")?
    };

    let was_running = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let mut cfg = s.tunnel_supervisor.config.clone()
            .or_else(|| tunnel::TunnelConfig::load_encrypted(&data_dir).ok().flatten())
            .unwrap_or(tunnel::TunnelConfig {
                tunnel_id: String::new(),
                runtime_api_key: String::new(),
                mcp_token: trimmed.to_string(),
                auto_reconnect: true,
                health_port: 8080,
                network_mode: tunnel::TunnelNetworkMode::System,
                custom_proxy_url: None,
            });
        cfg.mcp_token = trimmed.to_string();
        let active = s.tunnel_supervisor.is_active();
        s.tunnel_supervisor.set_config(cfg, &data_dir)?;
        active
    };

    if was_running {
        let _ = spawn_tunnel_internal(&app_handle, state.inner().clone());
    }

    Ok(serde_json::json!({
        "success": true,
        "token": trimmed,
        "message": "MCP token securely saved to DPAPI"
    }))
}

#[tauri::command]
fn desktop_tunnel_start(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    app_handle: tauri::AppHandle,
) -> Result<tunnel::TunnelStatusDto, String> {
    spawn_tunnel_internal(&app_handle, state.inner().clone())?;
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.tunnel_supervisor.get_status_dto())
}

#[tauri::command]
fn desktop_tunnel_stop(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<tunnel::TunnelStatusDto, String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.tunnel_supervisor.stop();
    Ok(s.tunnel_supervisor.get_status_dto())
}

#[tauri::command]
fn desktop_tunnel_clear_config(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<tunnel::TunnelStatusDto, String> {
    let data_dir = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.data_dir.clone().ok_or("Data directory unavailable")?
    };
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.tunnel_supervisor.clear_config(&data_dir)?;
    Ok(s.tunnel_supervisor.get_status_dto())
}

#[tauri::command]
fn desktop_tunnel_test_connection(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
    network_mode: Option<String>,
    custom_proxy_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let (server_port, health_port, has_token, mode, custom_p, is_running) = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let port = if s.server_port > 0 { s.server_port } else { 18080 };
        let hport = s.tunnel_supervisor.config.as_ref().map(|c| c.health_port).unwrap_or(8080);
        let has_tok = s.tunnel_supervisor.config.as_ref().map(|c| !c.mcp_token.is_empty()).unwrap_or(false);
        let active_mode = match network_mode.as_deref() {
            Some("direct") => tunnel::TunnelNetworkMode::Direct,
            Some("custom") => tunnel::TunnelNetworkMode::Custom,
            Some("system") => tunnel::TunnelNetworkMode::System,
            _ => s.tunnel_supervisor.config.as_ref().map(|c| c.network_mode).unwrap_or(tunnel::TunnelNetworkMode::System),
        };
        let p_url = custom_proxy_url.or_else(|| s.tunnel_supervisor.config.as_ref().and_then(|c| c.custom_proxy_url.clone()));
        let running = s.tunnel_supervisor.is_active();
        (port, hport, has_tok, active_mode, p_url, running)
    };

    // Stage 1: Local MCP test
    let mcp_url = format!("http://127.0.0.1:{}/mcp", server_port);
    let mut mcp_online = false;
    if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", server_port)) {
        use std::io::{Read, Write};
        let req = format!("GET /mcp HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n", server_port);
        let _ = stream.write_all(req.as_bytes());
        let mut resp = String::new();
        let _ = stream.read_to_string(&mut resp);
        mcp_online = resp.contains("HTTP/1.1 200") || resp.contains("HTTP/1.1 405") || resp.contains("HTTP/1.1 400");
    }

    if !mcp_online {
        return Ok(serde_json::json!({
            "success": false,
            "stage": "local_mcp",
            "mcpServerOnline": false,
            "mcpServerUrl": mcp_url,
            "hasMcpToken": has_token,
            "message": "Local MCP server is offline or unreachable at 127.0.0.1:18080/mcp"
        }));
    }

    // Stage 2 & 3: Outbound proxy & OpenAI connection test
    let mut proxy_reachable = false;
    let mut control_plane_tls_ok = false;
    let mut resolved_proxy: Option<String> = None;

    match mode {
        tunnel::TunnelNetworkMode::Direct => {
            use std::net::ToSocketAddrs;
            match "api.openai.com:443".to_socket_addrs() {
                Ok(mut addrs) => {
                    if let Some(addr) = addrs.next() {
                        match TcpStream::connect_timeout(&addr, Duration::from_secs(4)) {
                            Ok(_) => {
                                control_plane_tls_ok = true;
                            }
                            Err(e) => {
                                return Ok(serde_json::json!({
                                    "success": false,
                                    "stage": "control_plane_tls",
                                    "mcpServerOnline": true,
                                    "mcpServerUrl": mcp_url,
                                    "hasMcpToken": has_token,
                                    "proxyReachable": false,
                                    "controlPlaneTlsOk": false,
                                    "message": format!("Direct connection to api.openai.com:443 failed: {}", e)
                                }));
                            }
                        }
                    }
                }
                Err(e) => {
                    return Ok(serde_json::json!({
                        "success": false,
                        "stage": "control_plane_tls",
                        "mcpServerOnline": true,
                        "mcpServerUrl": mcp_url,
                        "hasMcpToken": has_token,
                        "proxyReachable": false,
                        "controlPlaneTlsOk": false,
                        "message": format!("DNS resolution for api.openai.com failed: {}", e)
                    }));
                }
            }
        }
        tunnel::TunnelNetworkMode::System => {
            match tunnel::resolve_windows_system_proxy() {
                Ok(Some(p)) => {
                    resolved_proxy = Some(p.clone());
                    if let Err(e) = tunnel::test_proxy_connectivity(&p) {
                        return Ok(serde_json::json!({
                            "success": false,
                            "stage": "proxy_connect",
                            "mcpServerOnline": true,
                            "mcpServerUrl": mcp_url,
                            "hasMcpToken": has_token,
                            "proxyReachable": false,
                            "controlPlaneTlsOk": false,
                            "message": format!("System proxy unreachable: {}", e)
                        }));
                    }
                    proxy_reachable = true;
                    if let Err(e) = tunnel::test_proxy_openai_connect(&p) {
                        return Ok(serde_json::json!({
                            "success": false,
                            "stage": "control_plane_tls",
                            "mcpServerOnline": true,
                            "mcpServerUrl": mcp_url,
                            "hasMcpToken": has_token,
                            "proxyReachable": true,
                            "controlPlaneTlsOk": false,
                            "message": format!("Proxy CONNECT to api.openai.com:443 failed: {}", e)
                        }));
                    }
                    control_plane_tls_ok = true;
                }
                Ok(None) => {
                    return Ok(serde_json::json!({
                        "success": false,
                        "stage": "proxy_connect",
                        "mcpServerOnline": true,
                        "mcpServerUrl": mcp_url,
                        "hasMcpToken": has_token,
                        "proxyReachable": false,
                        "controlPlaneTlsOk": false,
                        "message": "No Windows system proxy is currently active."
                    }));
                }
                Err(e) => {
                    return Ok(serde_json::json!({
                        "success": false,
                        "stage": "proxy_connect",
                        "mcpServerOnline": true,
                        "mcpServerUrl": mcp_url,
                        "hasMcpToken": has_token,
                        "proxyReachable": false,
                        "controlPlaneTlsOk": false,
                        "message": format!("System proxy error: {}", e)
                    }));
                }
            }
        }
        tunnel::TunnelNetworkMode::Custom => {
            let p_raw = custom_p.as_deref().unwrap_or("").trim();
            if p_raw.is_empty() {
                return Ok(serde_json::json!({
                    "success": false,
                    "stage": "proxy_connect",
                    "mcpServerOnline": true,
                    "mcpServerUrl": mcp_url,
                    "hasMcpToken": has_token,
                    "proxyReachable": false,
                    "controlPlaneTlsOk": false,
                    "message": "Custom proxy URL is not configured."
                }));
            }
            if p_raw.contains('@') {
                return Ok(serde_json::json!({
                    "success": false,
                    "stage": "proxy_connect",
                    "mcpServerOnline": true,
                    "mcpServerUrl": mcp_url,
                    "hasMcpToken": has_token,
                    "proxyReachable": false,
                    "controlPlaneTlsOk": false,
                    "message": "Proxy authentication credentials are not supported. Please use an unauthenticated HTTP proxy."
                }));
            }
            let p = tunnel::normalize_proxy_server(p_raw);
            resolved_proxy = Some(p.clone());
            if let Err(e) = tunnel::test_proxy_connectivity(&p) {
                return Ok(serde_json::json!({
                    "success": false,
                    "stage": "proxy_connect",
                    "mcpServerOnline": true,
                    "mcpServerUrl": mcp_url,
                    "hasMcpToken": has_token,
                    "proxyReachable": false,
                    "controlPlaneTlsOk": false,
                    "message": format!("Custom proxy unreachable: {}", e)
                }));
            }
            proxy_reachable = true;
            if let Err(e) = tunnel::test_proxy_openai_connect(&p) {
                return Ok(serde_json::json!({
                    "success": false,
                    "stage": "control_plane_tls",
                    "mcpServerOnline": true,
                    "mcpServerUrl": mcp_url,
                    "hasMcpToken": has_token,
                    "proxyReachable": true,
                    "controlPlaneTlsOk": false,
                    "message": format!("Custom proxy CONNECT to api.openai.com:443 failed: {}", e)
                }));
            }
            control_plane_tls_ok = true;
        }
    }

    // Stage 4: If tunnel is currently running, check health and metrics
    let mut control_plane_connected = false;
    let mut last_successful_poll_at = None;
    let mut poll_errors = 0;

    if is_running {
        let metrics_url = format!("http://127.0.0.1:{}/metrics", health_port);
        if let Ok(resp) = tunnel::ureq_get(&metrics_url) {
            let (poll_ts, errs) = tunnel::parse_metrics_poll_info(&resp);
            last_successful_poll_at = poll_ts;
            poll_errors = errs;
            if poll_ts.is_some() && poll_ts.unwrap() > 0 {
                control_plane_connected = true;
            }
        }
    }

    let success_message = match mode {
        tunnel::TunnelNetworkMode::Direct => "Direct connection to OpenAI Control Plane verified successfully.",
        tunnel::TunnelNetworkMode::System => "Connection to OpenAI Control Plane via Windows System Proxy verified successfully.",
        tunnel::TunnelNetworkMode::Custom => "Connection to OpenAI Control Plane via Custom Proxy verified successfully.",
    };

    Ok(serde_json::json!({
        "success": true,
        "stage": if is_running { "tunnel_metrics" } else { "control_plane_tls" },
        "mcpServerOnline": true,
        "mcpServerUrl": mcp_url,
        "hasMcpToken": has_token,
        "proxyReachable": if mode != tunnel::TunnelNetworkMode::Direct { proxy_reachable } else { true },
        "controlPlaneTlsOk": control_plane_tls_ok,
        "controlPlaneConnected": control_plane_connected,
        "lastSuccessfulPollAt": last_successful_poll_at,
        "pollErrors": poll_errors,
        "activeProxyUrl": resolved_proxy,
        "message": success_message
    }))
}

#[tauri::command]
fn desktop_mcp_bridge_get_status(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> bridge::BridgeStatusDto {
    if let Ok(mut s) = state.lock() {
        s.bridge_supervisor.get_status_dto()
    } else {
        bridge::BridgeStatusDto {
            running: false,
            port: 8787,
            mode: "failed".to_string(),
            error: Some("Failed to acquire supervisor lock".to_string()),
            public_base_url: "http://127.0.0.1:8787".to_string(),
            mcp_url: "http://127.0.0.1:8787/mcp".to_string(),
            core_url: "http://127.0.0.1:18080".to_string(),
            pid: None,
            uptime_seconds: 0,
            restart_count: 0,
            cloudflared_service_detected: false,
            tools_count: 0,
        }
    }
}

#[tauri::command]
fn desktop_mcp_bridge_restart(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<bridge::BridgeStatusDto, String> {
    if let Ok(mut s) = state.lock() {
        s.bridge_supervisor.restart()?;
        Ok(s.bridge_supervisor.get_status_dto())
    } else {
        Err("Failed to acquire supervisor lock".to_string())
    }
}

#[tauri::command]
fn desktop_mcp_bridge_get_logs(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Vec<String> {
    if let Ok(s) = state.lock() {
        s.bridge_supervisor.get_logs()
    } else {
        Vec::new()
    }
}

#[tauri::command]
fn desktop_mcp_bridge_detect_cloudflared() -> bool {
    bridge::detect_cloudflared_service()
}

#[tauri::command]
fn desktop_mcp_bridge_detect_cloudflared_agent() -> bridge::CloudflaredAgentStatus {
    bridge::detect_cloudflared_agent()
}

#[tauri::command]
fn desktop_mcp_bridge_check_dns_os(domain: String) -> bridge::PublicDnsResult {
    bridge::check_public_dns_os(&domain)
}

fn start_supervisor(app: &tauri::AppHandle, supervisor: Arc<Mutex<SupervisorState>>) {
    // Reset any previous startup error and clean up leftover processes before starting
    if let Ok(mut state) = supervisor.lock() {
        state.startup_error = None;
        state.server_exit_code = None;
        if let Some(mut runner) = state.runner_process.take() {
            terminate_owned_process_tree(&mut runner);
        }
        if let Some(mut server) = state.server_process.take() {
            terminate_owned_process_tree(&mut server);
        }
    }

    // 1. Resolve production resources with strict isolation
    let diag = match resolve_production_resources(app) {
        Ok(d) => d,
        Err(err) => {
            eprintln!("[LocalBridge Supervisor] {}", err);
            if let Ok(mut state) = supervisor.lock() {
                state.startup_error = Some(err);
            }
            return;
        }
    };

    let node_path = PathBuf::from(&diag.node_path);
    let server_entry = PathBuf::from(&diag.server_bundle_path);
    let runner_entry = PathBuf::from(&diag.runner_bundle_path);
    let bridge_entry = PathBuf::from(&diag.bridge_bundle_path);
    let resource_root = PathBuf::from(&diag.resource_root);

    // 2. Prepare data directories in local app data
    let base_data_dir = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("APPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::temp_dir())
        })
        .join("LocalBridge");

    let server_data_dir = base_data_dir.join("server");
    let runner_data_dir = base_data_dir.join("runner");
    let data_dir = base_data_dir.join("data");

    let _ = std::fs::create_dir_all(&server_data_dir);
    let _ = std::fs::create_dir_all(&runner_data_dir);
    let _ = std::fs::create_dir_all(&data_dir);

    // 3. Log diagnostics banner to stdout, stderr, and desktop.log
    log_resource_diagnostics(&diag, Some(&data_dir));

    let db_path = server_data_dir.join("localbridge.db");
    let projects_path = runner_data_dir.join("projects.json");

    // 4. Retrieve or generate tokens using OS CSPRNG (before port check so we can stop orphaned servers)
    let runner_token = match get_or_create_token("lbr_", "runner-token.key", &data_dir) {
        Ok(token) => token,
        Err(message) => {
            eprintln!("[LocalBridge Supervisor] {}", message);
            if let Ok(mut state) = supervisor.lock() {
                state.resource_diagnostics = Some(diag);
                state.startup_error = Some(message);
            }
            return;
        }
    };
    let management_token = match get_or_create_token("lm_", "management-token.key", &data_dir) {
        Ok(token) => token,
        Err(message) => {
            eprintln!("[LocalBridge Supervisor] {}", message);
            if let Ok(mut state) = supervisor.lock() {
                state.resource_diagnostics = Some(diag);
                state.startup_error = Some(message);
            }
            return;
        }
    };

    // 5. Port collision check (attempt graceful shutdown of any orphaned LocalBridge Server first)
    if is_port_open(18080) {
        let _ = shutdown::fast_loopback_request(
            18080,
            &management_token,
            "POST",
            "/api/shutdown",
            Some(&serde_json::json!({ "reason": "Stopping previous LocalBridge Server instance before startup" })),
            500,
        );
        for _ in 0..15 {
            if !is_port_open(18080) {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    if is_port_open(18080) {
        let message = "LocalBridge cannot start safely because 127.0.0.1:18080 is already in use by another process. Close conflicting processes and restart LocalBridge.".to_string();
        eprintln!("[LocalBridge Supervisor] {}", message);
        if let Ok(mut state) = supervisor.lock() {
            state.resource_diagnostics = Some(diag);
            state.data_dir = Some(data_dir);
            state.startup_error = Some(message);
        }
        return;
    }

    // 6. Update state
    #[cfg(target_os = "windows")]
    let job_guard = job_object::JobObjectGuard::create();

    if let Ok(mut state) = supervisor.lock() {
        state.bundled_node = Some(node_path.clone());
        state.server_entry = Some(server_entry.clone());
        state.runner_entry = Some(runner_entry.clone());
        state.bridge_entry = Some(bridge_entry.clone());
        state.runner_token = Some(runner_token.clone());
        state.management_token = Some(management_token.clone());
        state.server_port = 18080;
        state.data_dir = Some(data_dir.clone());
        state.resource_diagnostics = Some(diag.clone());
        state.tunnel_supervisor.init_from_disk(&data_dir);
    }

    // 7. Start the owned Server and require authenticated readiness.
    {
        let server_cwd = server_entry.parent().unwrap_or(&resource_root);
        let mut server_cmd = Command::new(&node_path);
        server_cmd.arg(&server_entry);
        server_cmd.current_dir(server_cwd);
        server_cmd.env("NODE_ENV", "production");
        server_cmd.env("LOCALBRIDGE_LOG_PRETTY", "false");
        server_cmd.env("LOCALBRIDGE_SERVER_PORT", "18080");
        server_cmd.env("LOCALBRIDGE_SERVER_HOST", "127.0.0.1");
        server_cmd.env("LOCALBRIDGE_SERVER_DB_PATH", db_path.to_string_lossy().to_string());
        server_cmd.env("LOCALBRIDGE_BOOTSTRAP_RUNNER_TOKEN", &runner_token);
        server_cmd.env("LOCALBRIDGE_MANAGEMENT_TOKEN", &management_token);
        server_cmd.env("LOCALBRIDGE_RESOURCES_PATH", &diag.resource_root);
        server_cmd.env("NEXUS_SKILLS_DIR", &diag.skills_root);
        server_cmd.env("LOCALBRIDGE_LSP_DIR", &diag.lsp_root);
        server_cmd.env("NEXUS_DISABLE_INTERNAL_GATEWAY", "true");

        #[cfg(target_os = "windows")]
        server_cmd.creation_flags(CREATE_NO_WINDOW);

        server_cmd.stderr(std::process::Stdio::piped());

        let mut server_child = match server_cmd.spawn() {
            Ok(child) => child,
            Err(e) => {
                let message = format!("Failed to spawn bundled LocalBridge Server: {}", e);
                eprintln!("[LocalBridge Supervisor] {}", message);
                if let Ok(mut state) = supervisor.lock() { state.startup_error = Some(message); }
                return;
            }
        };

        if let Some(err_pipe) = server_child.stderr.take() {
            let sup_err = supervisor.clone();
            std::thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                let reader = BufReader::new(err_pipe);
                for line in reader.lines().flatten() {
                    eprintln!("[Server stderr] {}", line);
                    if let Ok(mut s) = sup_err.lock() {
                        if s.last_stderr_lines.len() >= 30 {
                            s.last_stderr_lines.remove(0);
                        }
                        s.last_stderr_lines.push(format!("[Server] {}", line));
                    }
                }
            });
        }

        #[cfg(target_os = "windows")]
        if let Some(ref job) = job_guard {
            job.assign_child(&server_child);
        }

        // Authenticated readiness check (up to 20s)
        let mut ready = false;
        for _ in 0..100 {
            if let Ok(Some(exit_st)) = server_child.try_wait() {
                if let Ok(mut s) = supervisor.lock() {
                    s.server_exit_code = exit_st.code();
                }
                break;
            }
            if loopback_management_request(18080, &management_token, "GET", "/api/status", None).is_ok() {
                ready = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }

        if !ready {
            let exit_code = server_child.try_wait().ok().flatten().and_then(|s| s.code());
            terminate_owned_process_tree(&mut server_child);
            let message = "Bundled LocalBridge Server failed authenticated readiness; Runner was not started.".to_string();
            eprintln!("[LocalBridge Supervisor] {}", message);
            if let Ok(mut state) = supervisor.lock() {
                state.server_exit_code = exit_code;
                state.startup_error = Some(message);
            }
            return;
        }

        if let Ok(mut state) = supervisor.lock() {
            state.server_process = Some(server_child);
        }

        // Server lifecycle monitor (records unexpected exit without killing the desktop window)
        let sup_srv_mon = supervisor.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(250));
                if shutdown::is_shutting_down() {
                    break;
                }
                let exit_status = {
                    if let Ok(mut s) = sup_srv_mon.lock() {
                        if let Some(ref mut proc) = s.server_process {
                            proc.try_wait().ok().flatten()
                        } else {
                            break;
                        }
                    } else {
                        None
                    }
                };
                if let Some(st) = exit_status {
                    if !shutdown::is_shutting_down() {
                        eprintln!("[LocalBridge Supervisor] Server process exited unexpectedly with status {:?}", st);
                        if let Ok(mut s) = sup_srv_mon.lock() {
                            s.server_exit_code = st.code();
                            s.server_process = None;
                            if s.startup_error.is_none() {
                                s.startup_error = Some(format!(
                                    "LocalBridge Server exited unexpectedly (code: {:?}).",
                                    st.code()
                                ));
                            }
                        }
                    }
                    break;
                }
            }
        });
    }

    // 8. Start Runner
    let runner_cwd = runner_entry.parent().unwrap_or(&resource_root);
    let mut runner_cmd = Command::new(&node_path);
    runner_cmd.arg(&runner_entry);
    runner_cmd.current_dir(runner_cwd);
    runner_cmd.env("NODE_ENV", "production");
    runner_cmd.env("LOCALBRIDGE_LOG_PRETTY", "false");
    runner_cmd.env("LOCALBRIDGE_SERVER_URL", "ws://127.0.0.1:18080/runner/ws");
    runner_cmd.env("LOCALBRIDGE_RUNNER_TOKEN", &runner_token);
    runner_cmd.env("LOCALBRIDGE_PROJECTS_PATH", projects_path.to_string_lossy().to_string());
    runner_cmd.env("LOCALBRIDGE_LSP_DIR", &diag.lsp_root);
    runner_cmd.env("LOCALBRIDGE_RESOURCES_PATH", &diag.resource_root);

    #[cfg(target_os = "windows")]
    runner_cmd.creation_flags(CREATE_NO_WINDOW);

    runner_cmd.stderr(std::process::Stdio::piped());

    let mut runner_child = match runner_cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            let message = format!("Failed to spawn bundled LocalBridge Runner: {}", e);
            eprintln!("[LocalBridge Supervisor] {}", message);
            if let Ok(mut state) = supervisor.lock() {
                state.startup_error = Some(message);
                if let Some(mut srv) = state.server_process.take() {
                    terminate_owned_process_tree(&mut srv);
                }
            }
            return;
        }
    };

    if let Some(err_pipe) = runner_child.stderr.take() {
        let sup_runner_err = supervisor.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(err_pipe);
            for line in reader.lines().flatten() {
                eprintln!("[Runner stderr] {}", line);
                if let Ok(mut s) = sup_runner_err.lock() {
                    if s.last_stderr_lines.len() >= 30 {
                        s.last_stderr_lines.remove(0);
                    }
                    s.last_stderr_lines.push(format!("[Runner] {}", line));
                }
            }
        });
    }

    #[cfg(target_os = "windows")]
    if let Some(ref job) = job_guard {
        job.assign_child(&runner_child);
    }

    // Wait up to 30s (150 * 200ms) for Runner registration
    let mut runner_ready = false;
    for _ in 0..150 {
        if runner_child.try_wait().ok().flatten().is_some() { break; }
        if let Ok(value) = loopback_management_request(18080, &management_token, "GET", "/api/runners", None) {
            let has_runner = value.as_array().is_some_and(|items| !items.is_empty())
                || value.get("runners").and_then(|v| v.as_array()).is_some_and(|items| !items.is_empty());
            if has_runner {
                runner_ready = true;
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    if !runner_ready {
        terminate_owned_process_tree(&mut runner_child);
        let message = "Bundled LocalBridge Runner failed authenticated registration.".to_string();
        eprintln!("[LocalBridge Supervisor] {}", message);
        if let Ok(mut state) = supervisor.lock() {
            state.startup_error = Some(message);
            if let Some(mut srv) = state.server_process.take() {
                terminate_owned_process_tree(&mut srv);
            }
        }
        return;
    }
    if let Ok(mut state) = supervisor.lock() {
        #[cfg(target_os = "windows")]
        {
            state.job_object = job_guard;
        }
        state.runner_process = Some(runner_child);
    }

    // 8.5. Start or Reuse Nexus MCP Bridge
    {
        if let Ok(mut state) = supervisor.lock() {
            let core_port = if state.server_port == 0 { 18080 } else { state.server_port };
            state.bridge_supervisor.core_url = format!("http://127.0.0.1:{}", core_port);
            state.bridge_supervisor.port = 8787;
            let res = state.bridge_supervisor.start_or_reuse(
                &node_path,
                &bridge_entry,
                &data_dir,
                &management_token,
            );
            if let Err(e) = res {
                eprintln!("[Nexus Bridge Supervisor Warning] {}", e);
            }
            #[cfg(target_os = "windows")]
            if let Some(ref job) = state.job_object {
                if let Some(ref child) = state.bridge_supervisor.process {
                    job.assign_child(child);
                }
            }
        }

        // Bridge Watchdog monitor loop
        let sup_bridge_mon = supervisor.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(1000));
                if shutdown::is_shutting_down() {
                    break;
                }

                let should_restart = {
                    let Ok(mut s) = sup_bridge_mon.lock() else { continue; };
                    if !s.bridge_supervisor.should_run || s.bridge_supervisor.mode != "owned" {
                        false
                    } else if let Some(ref mut child) = s.bridge_supervisor.process {
                        match child.try_wait() {
                            Ok(Some(st)) => {
                                eprintln!("[Nexus Bridge Watchdog] Bridge child exited with status {:?}. Will auto-restart in 5s...", st);
                                true
                            }
                            Ok(None) => false,
                            Err(_) => true,
                        }
                    } else {
                        false
                    }
                };

                if should_restart && !shutdown::is_shutting_down() {
                    std::thread::sleep(Duration::from_secs(5));
                    if shutdown::is_shutting_down() {
                        break;
                    }

                    if let Ok(mut s) = sup_bridge_mon.lock() {
                        if s.bridge_supervisor.restart_count < 5 {
                            s.bridge_supervisor.restart_count += 1;
                            eprintln!("[Nexus Bridge Watchdog] Attempting auto-restart #{}...", s.bridge_supervisor.restart_count);
                            let _ = s.bridge_supervisor.spawn_bridge_process();
                            #[cfg(target_os = "windows")]
                            if let Some(ref job) = s.job_object {
                                if let Some(ref child) = s.bridge_supervisor.process {
                                    job.assign_child(child);
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    // 8. Initialize Tunnel Supervisor
    {
        if let Ok(mut state) = supervisor.lock() {
            let data_dir = state.data_dir.clone();
            if let Some(ref dir) = data_dir {
                state.tunnel_supervisor.init_from_disk(dir);
            }
            let auto_start = state.tunnel_supervisor.config.as_ref().map(|c| c.auto_reconnect && !c.tunnel_id.is_empty()).unwrap_or(false);
            if auto_start {
                drop(state);
                let _ = spawn_tunnel_internal(app, supervisor.clone());
            }
        }
    }

    // 9. Tunnel health and auto-reconnect monitoring loop
    let sup_monitor = supervisor.clone();
    let app_monitor = app.clone();
    std::thread::spawn(move || {
        let backoffs = [5, 10, 20, 30, 60];
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            if shutdown::is_shutting_down() {
                break;
            }

            let (health_port, is_running, auto_reconnect, reconnect_attempts) = {
                let Ok(mut s) = sup_monitor.lock() else { continue; };
                let running = s.tunnel_supervisor.is_active();
                (
                    s.tunnel_supervisor.config.as_ref().map(|c| c.health_port).unwrap_or(18082),
                    running,
                    s.tunnel_supervisor.config.as_ref().map(|c| c.auto_reconnect).unwrap_or(false),
                    s.tunnel_supervisor.reconnect_attempts,
                )
            };

            if is_running {
                let is_ready = tunnel::TunnelSupervisor::check_readyz(health_port);
                let metrics_url = format!("http://127.0.0.1:{}/metrics", health_port);
                let (last_poll, poll_errs) = if let Ok(resp) = tunnel::ureq_get(&metrics_url) {
                    tunnel::parse_metrics_poll_info(&resp)
                } else {
                    (None, 0)
                };

                if let Ok(mut s) = sup_monitor.lock() {
                    s.tunnel_supervisor.last_successful_poll_at = last_poll;
                    s.tunnel_supervisor.poll_errors = poll_errs;

                    if is_ready && last_poll.is_some() && last_poll.unwrap() > 0 {
                        s.tunnel_supervisor.status = tunnel::TunnelStatus::Connected;
                        s.tunnel_supervisor.control_plane_status = Some("Connected".into());
                        s.tunnel_supervisor.reconnect_attempts = 0;
                        s.tunnel_supervisor.error_message = None;
                    } else if is_ready {
                        s.tunnel_supervisor.status = tunnel::TunnelStatus::Connecting;
                        s.tunnel_supervisor.control_plane_status = Some("Polling".into());
                    } else {
                        s.tunnel_supervisor.status = tunnel::TunnelStatus::Starting;
                        s.tunnel_supervisor.control_plane_status = Some("Connecting".into());
                    }
                }
            } else {
                let attempt = reconnect_attempts;
                let backoff_secs = backoffs[attempt.min(backoffs.len() as u32 - 1) as usize];

                if let Ok(mut s) = sup_monitor.lock() {
                    s.tunnel_supervisor.control_plane_status = Some("ConnectionFailed".into());
                    if auto_reconnect && s.tunnel_supervisor.status != tunnel::TunnelStatus::AuthenticationError {
                        s.tunnel_supervisor.status = tunnel::TunnelStatus::Reconnecting;
                        s.tunnel_supervisor.reconnect_attempts += 1;
                        s.tunnel_supervisor.error_message = Some(format!(
                            "Tunnel disconnected. Reconnecting in {}s (attempt {})...",
                            backoff_secs, attempt + 1
                        ));
                    } else {
                        s.tunnel_supervisor.status = tunnel::TunnelStatus::NeedsAttention;
                        s.tunnel_supervisor.should_run = false;
                        continue;
                    }
                }

                for _ in 0..(backoff_secs * 10) {
                    if shutdown::is_shutting_down() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                if shutdown::is_shutting_down() {
                    break;
                }

                let can_retry = {
                    let Ok(s) = sup_monitor.lock() else { continue; };
                    s.tunnel_supervisor.should_run
                };
                if can_retry && !shutdown::is_shutting_down() {
                    let _ = spawn_tunnel_internal(&app_monitor, sup_monitor.clone());
                }
            }
        }
    });
}

#[tauri::command]
fn get_resource_diagnostics(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<ResourceDiagnostics, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    s.resource_diagnostics.clone().ok_or_else(|| "Resource diagnostics not yet initialized".into())
}

#[tauri::command]
fn desktop_get_resource_diagnostics(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<ResourceDiagnostics, String> {
    get_resource_diagnostics(state)
}

#[tauri::command]
fn desktop_get_startup_diagnostics(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<StartupDiagnosticsDto, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let port_open = is_port_open(if s.server_port > 0 { s.server_port } else { 18080 });
    let port_state = if port_open { "127.0.0.1:18080 (LISTEN)".into() } else { "127.0.0.1:18080 (FREE)".into() };
    let resource_root = s.resource_diagnostics.as_ref().map(|d| d.resource_root.clone());
    let last_stderr = if s.last_stderr_lines.is_empty() {
        None
    } else {
        Some(s.last_stderr_lines.join("\n"))
    };
    let ready = s.startup_error.is_none()
        && s.server_process.as_ref().is_some()
        && s.runner_process.as_ref().is_some();

    Ok(StartupDiagnosticsDto {
        ready,
        startup_error: s.startup_error.clone(),
        resource_root,
        server_exit_code: s.server_exit_code,
        last_stderr,
        port_state,
    })
}

#[tauri::command]
fn desktop_open_logs_folder(
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<(), String> {
    let dir = if let Ok(s) = state.lock() {
        s.data_dir.clone().unwrap_or_else(|| {
            std::env::var("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("LocalBridge")
        })
    } else {
        std::env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("LocalBridge")
    };
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("explorer").arg(&dir).spawn();
    }
    Ok(())
}

#[tauri::command]
fn desktop_retry_startup(
    app: tauri::AppHandle,
    state: tauri::State<Arc<Mutex<SupervisorState>>>,
) -> Result<(), String> {
    let sup = state.inner().clone();
    std::thread::spawn(move || {
        start_supervisor(&app, sup);
    });
    Ok(())
}

#[tauri::command]
async fn quit_nexus(app: tauri::AppHandle, state: tauri::State<'_, Arc<Mutex<SupervisorState>>>) -> Result<(), String> {
    let (port, token, runner_proc, server_proc, bridge_proc) = {
        if let Ok(mut s) = state.lock() {
            let port = s.server_port;
            let token = get_management_token(&s);
            let runner = s.runner_process.take();
            let server = s.server_process.take();
            let bridge = s.bridge_supervisor.process.take();
            (port, token, runner, server, bridge)
        } else {
            (18080, String::new(), None, None, None)
        }
    };
    let sup_tunnel = state.inner().clone();
    shutdown::fast_shutdown(
        &app,
        port,
        token,
        move || {
            if let Ok(mut s) = sup_tunnel.lock() {
                s.tunnel_supervisor.shutdown();
            }
        },
        runner_proc,
        server_proc,
        bridge_proc,
    );
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn apply_crisp_windows_icons(hwnd_val: isize) {
    unsafe {
        type HMODULE = *mut std::ffi::c_void;
        type HICON = *mut std::ffi::c_void;
        type HwndPtr = *mut std::ffi::c_void;

        extern "system" {
            fn GetModuleHandleW(lpModuleName: *const u16) -> HMODULE;
            fn LoadImageW(
                hInst: HMODULE,
                name: *const u16,
                type_: u32,
                cx: i32,
                cy: i32,
                fuLoad: u32,
            ) -> HICON;
            fn SendMessageW(
                hWnd: HwndPtr,
                Msg: u32,
                wParam: usize,
                lParam: isize,
            ) -> isize;
            fn GetSystemMetrics(nIndex: i32) -> i32;
        }

        let hinstance = GetModuleHandleW(std::ptr::null());
        let sm_cx_big = GetSystemMetrics(11); // SM_CXICON (32, 48, etc.)
        let sm_cy_big = GetSystemMetrics(12); // SM_CYICON
        let sm_cx_small = GetSystemMetrics(49); // SM_CXSMICON (16, 24, etc.)
        let sm_cy_small = GetSystemMetrics(50); // SM_CYSMICON

        // 32512 is IDI_APPLICATION embedded in executable PE resource
        // 0x00008000 is LR_SHARED
        let hicon_big = LoadImageW(
            hinstance,
            32512 as *const u16,
            1, // IMAGE_ICON
            sm_cx_big,
            sm_cy_big,
            0x00008000,
        );
        let hicon_small = LoadImageW(
            hinstance,
            32512 as *const u16,
            1, // IMAGE_ICON
            sm_cx_small,
            sm_cy_small,
            0x00008000,
        );

        const WM_SETICON: u32 = 0x0080;
        const ICON_SMALL: usize = 0;
        const ICON_BIG: usize = 1;

        if !hicon_big.is_null() {
            SendMessageW(hwnd_val as _, WM_SETICON, ICON_BIG, hicon_big as isize);
        }
        if !hicon_small.is_null() {
            SendMessageW(hwnd_val as _, WM_SETICON, ICON_SMALL, hicon_small as isize);
        }
    }
}

fn main() {
    let supervisor = Arc::new(Mutex::new(SupervisorState::default()));
    let supervisor_exit_clone = supervisor.clone();
    let supervisor_tray = supervisor.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(supervisor.clone())
        .invoke_handler(tauri::generate_handler![
            get_desktop_version,
            check_desktop_health,
            desktop_authorize_project,
            desktop_set_project_access,
            desktop_set_project_execution,
            desktop_enable_project,
            desktop_disable_project,
            desktop_remove_project,
            desktop_create_token,
            desktop_revoke_token,
            desktop_list_tokens,
            desktop_list_approvals,
            desktop_resolve_approval,
            desktop_list_oauth_requests,
            desktop_resolve_oauth_request,
            desktop_list_jobs,
            desktop_cancel_job,
            desktop_get_job_status,
            desktop_get_job_logs,
            desktop_get_pause_state,
            desktop_set_pause_state,
            desktop_emergency_stop,
            desktop_get_full_control_status,
            desktop_start_full_control,
            desktop_stop_full_control,
            desktop_get_computer_status,
            desktop_get_takeover_status,
            desktop_take_control,
            desktop_return_control,
            desktop_get_computer_screenshot,
            desktop_list_audit,
            desktop_list_projects,
            desktop_get_status,
            desktop_get_mcp_status,
            desktop_list_runners,
            desktop_api_request,
            desktop_set_server_url,
            desktop_tunnel_get_status,
            desktop_tunnel_save_config,
            desktop_tunnel_auto_create_token,
            desktop_tunnel_get_mcp_token,
            desktop_tunnel_save_mcp_token,
            desktop_tunnel_start,
            desktop_tunnel_stop,
            desktop_tunnel_clear_config,
            desktop_tunnel_test_connection,
            desktop_bulk_resolve_approvals,
            desktop_get_project_trust_policy,
            desktop_set_project_trust_policy,
            desktop_grant_session_trust,
            desktop_revoke_session_trust,
            desktop_reset_trust_defaults,
            desktop_clear_session_trusts,
            desktop_get_operator_name,
            desktop_set_operator_name,
            desktop_get_approval_routing_mode,
            desktop_set_approval_routing_mode,
            desktop_get_safety_layer_status,
            desktop_set_safety_layer_status,
            desktop_get_lsp_status,
            desktop_restart_lsp,
            desktop_stop_lsp,
            desktop_list_sessions,
            desktop_get_session,
            desktop_get_session_events,
            desktop_get_session_handoff,
            desktop_start_session,
            desktop_checkpoint_session,
            desktop_finish_session,
            desktop_get_intelligence_status,
            desktop_update_intelligence_config,
            desktop_get_model_status,
            desktop_start_model_download,
            desktop_cancel_model_download,
            desktop_download_and_enable_model,
            desktop_validate_model_path,
            desktop_set_model_path,
            desktop_import_model,
            desktop_evaluate_intelligence,
            desktop_list_ai_connections,
            desktop_get_ai_connection,
            desktop_rotate_ai_connection_token,
            desktop_revoke_ai_connection_token,
            desktop_test_ai_connection,
            desktop_list_skills,
            desktop_get_skill,
            desktop_reload_skills,
            desktop_toggle_skill,
            desktop_match_skill,
            skills_list,
            skills_get,
            skills_reload,
            skills_toggle,
            skills_match,
            skills_preview_import,
            skills_import_folder,
            skills_import_zip,
            skills_import_batch,
            skills_toggle_collection,
            desktop_toggle_collection,
            skills_delete,
            skills_get_raw,
            skills_open_source_folder,
            get_resource_diagnostics,
            desktop_get_resource_diagnostics,
            desktop_get_startup_diagnostics,
            desktop_open_logs_folder,
            desktop_retry_startup,
            desktop_mcp_bridge_get_status,
            desktop_mcp_bridge_restart,
            desktop_mcp_bridge_get_logs,
            desktop_mcp_bridge_detect_cloudflared,
            desktop_mcp_bridge_detect_cloudflared_agent,
            desktop_mcp_bridge_check_dns_os,
            quit_nexus
        ])
        .setup(move |app| {
            let open_i = MenuItem::with_id(app, "open", "Open Nexus", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Nexus", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

            let sup_tray = supervisor_tray.clone();
            let _tray = TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            let (port, token, runner_proc, server_proc, bridge_proc) = {
                                if let Ok(mut s) = sup_tray.lock() {
                                    let port = s.server_port;
                                    let token = get_management_token(&s);
                                    let runner = s.runner_process.take();
                                    let server = s.server_process.take();
                                    let bridge = s.bridge_supervisor.process.take();
                                    (port, token, runner, server, bridge)
                                } else {
                                    (18080, String::new(), None, None, None)
                                }
                            };
                            let sup_tunnel = sup_tray.clone();
                            shutdown::fast_shutdown(
                                app,
                                port,
                                token,
                                move || {
                                    if let Ok(mut s) = sup_tunnel.lock() {
                                        s.tunnel_supervisor.shutdown();
                                    }
                                },
                                runner_proc,
                                server_proc,
                                bridge_proc,
                            );
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let win_clone = window.clone();
                let sup_win = supervisor_tray.clone();
                let app_handle_clone = app.handle().clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                            let _ = win_clone.hide();
                            
                            // Trigger full shutdown when the main window is closed
                            let (port, token, runner_proc, server_proc, bridge_proc) = {
                                if let Ok(mut s) = sup_win.lock() {
                                    let port = s.server_port;
                                    let token = get_management_token(&s);
                                    let runner = s.runner_process.take();
                                    let server = s.server_process.take();
                                    let bridge = s.bridge_supervisor.process.take();
                                    (port, token, runner, server, bridge)
                                } else {
                                    (18080, String::new(), None, None, None)
                                }
                            };
                            let sup_tunnel = sup_win.clone();
                            shutdown::fast_shutdown(
                                &app_handle_clone,
                                port,
                                token,
                                move || {
                                    if let Ok(mut s) = sup_tunnel.lock() {
                                        s.tunnel_supervisor.shutdown();
                                    }
                                },
                                runner_proc,
                                server_proc,
                                bridge_proc,
                            );
                        }
                        #[cfg(target_os = "windows")]
                        tauri::WindowEvent::Focused(true) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                            if let Ok(hwnd) = win_clone.hwnd() {
                                apply_crisp_windows_icons(hwnd.0 as isize);
                            }
                        }
                        _ => {}
                    }
                });
            }

            #[cfg(not(target_os = "windows"))]
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(icon) = Image::from_bytes(include_bytes!("../icons/icon.png")) {
                    let _ = window.set_icon(icon);
                }
            }

            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(hwnd) = window.hwnd() {
                    apply_crisp_windows_icons(hwnd.0 as isize);
                }
            }

            let app_handle = app.handle().clone();
            let sup = supervisor.clone();
            std::thread::spawn(move || {
                start_supervisor(&app_handle, sup);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running LocalBridge Desktop application");

    app.run(move |app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
            let (port, token, runner_proc, server_proc, bridge_proc) = {
                if let Ok(mut s) = supervisor_exit_clone.lock() {
                    let port = s.server_port;
                    let token = get_management_token(&s);
                    let runner = s.runner_process.take();
                    let server = s.server_process.take();
                    let bridge = s.bridge_supervisor.process.take();
                    (port, token, runner, server, bridge)
                } else {
                    (18080, String::new(), None, None, None)
                }
            };
            let sup_tunnel = supervisor_exit_clone.clone();
            shutdown::fast_shutdown(
                app_handle,
                port,
                token,
                move || {
                    if let Ok(mut s) = sup_tunnel.lock() {
                        s.tunnel_supervisor.shutdown();
                    }
                },
                runner_proc,
                server_proc,
                bridge_proc,
            );
        }
    });
}
