//! Machine ID compatible with `node-machine-id` `machineIdSync(true)`.
//!
//! Returns the original (unhashed) platform machine identifier so existing
//! `credentials.bin` bindings keep working.

use std::process::Command;

const CREDENTIAL_FALLBACK: &str = "zero-sort-fallback";

/// Returns the original machine ID, or a credential-compatible fallback.
pub fn machine_id_or_credential_fallback() -> String {
    match machine_id() {
        Ok(id) if !id.is_empty() => id,
        _ => CREDENTIAL_FALLBACK.to_string(),
    }
}

/// Reads the platform machine identifier (original / unhashed).
pub fn machine_id() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        macos_machine_id()
    }

    #[cfg(target_os = "windows")]
    {
        windows_machine_id()
    }

    #[cfg(target_os = "linux")]
    {
        linux_machine_id()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("Unsupported platform for machine ID".to_string())
    }
}

#[cfg(target_os = "macos")]
fn macos_machine_id() -> Result<String, String> {
    let output = Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .map_err(|e| format!("ioreg failed: {e}"))?;

    if !output.status.success() {
        return Err("ioreg exited with error".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(rest) = line.split("\"IOPlatformUUID\"").nth(1) {
            if let Some(start) = rest.find('"') {
                let after = &rest[start + 1..];
                if let Some(end) = after.find('"') {
                    return Ok(after[..end].to_string());
                }
            }
        }
    }

    Err("IOPlatformUUID not found".to_string())
}

#[cfg(target_os = "windows")]
fn windows_machine_id() -> Result<String, String> {
    let output = Command::new("reg")
        .args([
            "query",
            r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .output()
        .map_err(|e| format!("reg query failed: {e}"))?;

    if !output.status.success() {
        return Err("reg query exited with error".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("MachineGuid") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if let Some(guid) = parts.last() {
                return Ok(guid.to_string());
            }
        }
    }

    Err("MachineGuid not found".to_string())
}

#[cfg(target_os = "linux")]
fn linux_machine_id() -> Result<String, String> {
    for candidate in ["/var/lib/dbus/machine-id", "/etc/machine-id"] {
        if let Ok(contents) = std::fs::read_to_string(candidate) {
            let id = contents.trim().to_string();
            if !id.is_empty() {
                return Ok(id);
            }
        }
    }
    Err("machine-id file not found".to_string())
}
