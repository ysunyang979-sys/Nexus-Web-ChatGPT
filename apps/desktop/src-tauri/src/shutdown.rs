use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static IS_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShutdownTelemetry {
    pub quit_clicked_at: u64,
    pub ui_hidden_at: u64,
    pub new_work_blocked_at: u64,
    pub tunnel_stop_started_at: u64,
    pub runner_stop_started_at: u64,
    pub server_stop_started_at: u64,
    pub db_flush_started_at: u64,
    pub child_processes_killed_at: u64,
    pub process_exit_at: u64,
    pub total_duration_ms: u64,
}

pub fn is_shutting_down() -> bool {
    IS_SHUTTING_DOWN.load(Ordering::SeqCst)
}

pub fn mark_shutting_down() -> bool {
    !IS_SHUTTING_DOWN.swap(true, Ordering::SeqCst)
}

pub fn current_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn fast_loopback_request(
    port: u16,
    token: &str,
    method: &str,
    path: &str,
    body: Option<&serde_json::Value>,
    timeout_ms: u64,
) -> Result<(), String> {
    use std::io::Write;

    let addr: SocketAddr = format!("127.0.0.1:{}", port)
        .parse()
        .map_err(|e| format!("Invalid address: {}", e))?;

    let timeout = Duration::from_millis(timeout_ms);
    let mut stream = TcpStream::connect_timeout(&addr, timeout)
        .map_err(|e| format!("Connect failed: {}", e))?;

    stream.set_write_timeout(Some(timeout)).ok();
    stream.set_read_timeout(Some(timeout)).ok();

    let body_str = body.map(|b| b.to_string()).unwrap_or_default();
    let body_bytes = body_str.as_bytes();

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

    stream.write_all(header.as_bytes()).map_err(|e| format!("Write header failed: {}", e))?;
    if !body_bytes.is_empty() {
        stream.write_all(body_bytes).map_err(|e| format!("Write body failed: {}", e))?;
    }
    stream.flush().ok();
    Ok(())
}

pub fn terminate_child_process_tree(child: &mut Child) {
    if child.try_wait().ok().flatten().is_some() {
        return;
    }
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
}

pub fn write_telemetry_file(telemetry: &ShutdownTelemetry) {
    let data_dir = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                std::env::var("APPDATA")
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| std::env::temp_dir())
            })
            .join("LocalBridge")
    } else {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".localbridge")
    };

    let log_dir = data_dir.join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("shutdown-telemetry.json");

    if let Ok(json) = serde_json::to_string_pretty(telemetry) {
        let _ = std::fs::write(&log_path, json);
    }
}

pub fn fast_shutdown(
    app: &tauri::AppHandle,
    state_port: u16,
    state_token: String,
    tunnel_stop_fn: impl FnOnce() + Send + 'static,
    mut runner_process: Option<Child>,
    mut server_process: Option<Child>,
    mut bridge_process: Option<Child>,
) {
    let quit_clicked_at = current_time_millis();

    if !mark_shutting_down() {
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    let ui_hidden_at = current_time_millis();
    let new_work_blocked_at = ui_hidden_at;

    std::thread::spawn(move || {
        let tunnel_stop_started_at = current_time_millis();
        tunnel_stop_fn();

        let server_stop_started_at = current_time_millis();
        let runner_stop_started_at = server_stop_started_at;

        let server_already_dead = server_process
            .as_mut()
            .map_or(false, |p| p.try_wait().ok().flatten().is_some());

        let port = if state_port == 0 { 18080 } else { state_port };
        if !server_already_dead && !state_token.is_empty() {
            let _ = fast_loopback_request(
                port,
                &state_token,
                "POST",
                "/api/shutdown",
                Some(&serde_json::json!({ "reason": "Desktop shutdown" })),
                150,
            );
        }

        let db_flush_started_at = current_time_millis();
        std::thread::sleep(Duration::from_millis(100));

        let child_processes_killed_at = current_time_millis();
        if let Some(mut bridge) = bridge_process.take() {
            terminate_child_process_tree(&mut bridge);
        }
        if let Some(mut runner) = runner_process.take() {
            terminate_child_process_tree(&mut runner);
        }
        if let Some(mut server) = server_process.take() {
            terminate_child_process_tree(&mut server);
        }

        let process_exit_at = current_time_millis();
        let total_duration_ms = process_exit_at.saturating_sub(quit_clicked_at);

        let telemetry = ShutdownTelemetry {
            quit_clicked_at,
            ui_hidden_at,
            new_work_blocked_at,
            tunnel_stop_started_at,
            runner_stop_started_at,
            server_stop_started_at,
            db_flush_started_at,
            child_processes_killed_at,
            process_exit_at,
            total_duration_ms,
        };

        write_telemetry_file(&telemetry);

        std::process::exit(0);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shutdown_idempotency() {
        let _first = mark_shutting_down();
        let second = mark_shutting_down();
        let is_down = is_shutting_down();

        assert!(is_down);
        // At least one of first/second should have been true, and the subsequent must be false
        assert!(!second);
    }

    #[test]
    fn test_telemetry_serialization() {
        let t = ShutdownTelemetry {
            quit_clicked_at: 1000,
            ui_hidden_at: 1020,
            new_work_blocked_at: 1020,
            tunnel_stop_started_at: 1030,
            runner_stop_started_at: 1040,
            server_stop_started_at: 1040,
            db_flush_started_at: 1100,
            child_processes_killed_at: 1200,
            process_exit_at: 1250,
            total_duration_ms: 250,
        };

        let json = serde_json::to_string(&t).expect("serialize");
        assert!(json.contains("\"total_duration_ms\":250"));
        assert!(json.contains("\"ui_hidden_at\":1020"));

        let deserialized: ShutdownTelemetry = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.total_duration_ms, 250);
        assert_eq!(deserialized.ui_hidden_at - deserialized.quit_clicked_at, 20);
    }
}
