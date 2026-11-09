//! Discord Rich Presence over Discord's local IPC pipe (\\.\pipe\discord-ipc-N), no library in between,
//! so Discord's real answer (e.g. "Invalid Client ID") reaches Settings instead of a silent timeout.
use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, PartialEq, Default, Debug)]
pub struct Desired { pub enabled: bool, pub client_id: String, pub activity: Option<Value> }

pub struct Presence { tx: Sender<Desired>, pub status: Arc<Mutex<String>> }

fn write_frame(f: &mut File, op: u32, v: &Value) -> std::io::Result<()> {
    let b = v.to_string().into_bytes();
    let mut buf = Vec::with_capacity(8 + b.len());
    buf.extend_from_slice(&op.to_le_bytes());
    buf.extend_from_slice(&(b.len() as u32).to_le_bytes());
    buf.extend_from_slice(&b);
    f.write_all(&buf)?;
    f.flush()
}
fn read_frame(f: &mut File) -> std::io::Result<(u32, Value)> {
    let mut h = [0u8; 8];
    f.read_exact(&mut h)?;
    let op = u32::from_le_bytes([h[0], h[1], h[2], h[3]]);
    let len = u32::from_le_bytes([h[4], h[5], h[6], h[7]]) as usize;
    let mut b = vec![0u8; len.min(1 << 20)];
    f.read_exact(&mut b)?;
    Ok((op, serde_json::from_slice(&b).unwrap_or(Value::Null)))
}

/// Ok(pipe) once Discord says READY; Err("waiting") if Discord isn't running; Err(message) if Discord refuses
fn connect(client_id: &str) -> Result<File, String> {
    for i in 0..10 {
        let Ok(mut f) = OpenOptions::new().read(true).write(true).open(format!(r"\\.\pipe\discord-ipc-{}", i)) else { continue };
        if write_frame(&mut f, 0, &json!({ "v": 1, "client_id": client_id })).is_err() { continue }
        match read_frame(&mut f) {
            Ok((1, v)) if v["evt"] == "READY" => return Ok(f),
            Ok((_, v)) => {
                let msg = v["message"].as_str().or(v["data"]["message"].as_str()).unwrap_or("Discord refused the connection");
                return Err(format!("error:{}", msg));
            }
            Err(_) => continue,
        }
    }
    Err("waiting".into())
}

impl Presence {
    pub fn start() -> Presence {
        let (tx, rx) = channel::<Desired>();
        let status = Arc::new(Mutex::new("off".to_string()));
        let st = status.clone();
        std::thread::spawn(move || {
            let mut want = Desired::default();
            let mut pipe: Option<(File, String)> = None;
            let mut sent: Option<Option<Value>> = None;
            let mut retry_at = std::time::Instant::now();
            let set = |s: &str| { *st.lock().unwrap() = s.to_string(); };
            loop {
                match rx.recv_timeout(Duration::from_secs(10)) {
                    Ok(d) => { want = d; while let Ok(d) = rx.try_recv() { want = d } }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }
                if !want.enabled { if pipe.take().is_some() { sent = None } set("off"); continue }
                if want.client_id.len() < 15 || !want.client_id.chars().all(|c| c.is_ascii_digit()) { pipe = None; sent = None; set("noid"); continue }
                if pipe.as_ref().map(|p| p.1 != want.client_id).unwrap_or(false) { pipe = None; sent = None }
                if pipe.is_none() {
                    if std::time::Instant::now() < retry_at { continue }
                    match connect(&want.client_id) {
                        Ok(f) => { pipe = Some((f, want.client_id.clone())); sent = None; set("on") }
                        Err(e) => { set(&e); retry_at = std::time::Instant::now() + Duration::from_secs(if e == "waiting" { 15 } else { 60 }); continue }
                    }
                }
                if sent.as_ref() == Some(&want.activity) { continue }
                let (f, _) = pipe.as_mut().unwrap();
                let msg = json!({ "cmd": "SET_ACTIVITY", "args": { "pid": std::process::id(), "activity": want.activity.clone().unwrap_or(Value::Null) }, "nonce": format!("{}", crate::util::now_ms()) });
                let ok = write_frame(f, 1, &msg).is_ok();
                match (ok, if ok { read_frame(f).ok() } else { None }) {
                    (true, Some((_, v))) if v["evt"] == "ERROR" => { set(&format!("error:{}", v["data"]["message"].as_str().unwrap_or("Discord rejected the activity"))); sent = Some(want.activity.clone()) }
                    (true, Some(_)) => { set("on"); sent = Some(want.activity.clone()) }
                    _ => { pipe = None; sent = None; set("waiting"); retry_at = std::time::Instant::now() } // Discord closed or restarted: reconnect
                }
            }
        });
        Presence { tx, status }
    }
    pub fn send(&self, d: Desired) { let _ = self.tx.send(d); }
    pub fn status(&self) -> String { self.status.lock().unwrap().clone() }
}

/// Discord limits: 2–128 characters per line
pub fn line(s: &str) -> String {
    let mut t: String = s.chars().take(128).collect();
    while t.chars().count() < 2 { t.push(' ') }
    t
}
