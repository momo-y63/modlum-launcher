use std::collections::HashSet;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tokio::process::Child;
use tokio::sync::Mutex as AsyncMutex;

use crate::model::{LogLine, Settings};
use crate::store;

pub struct LaunchHandle {
    pub child: Arc<AsyncMutex<Option<Child>>>,
    pub instance_id: String,
    pub started_at: u64,
    pub version_id: String,
    pub pid: Option<u32>,
}

pub struct AppState {
    settings: Mutex<Settings>,
    logs: Mutex<Vec<LogLine>>,
    pub launch: Mutex<Option<LaunchHandle>>,
    pub ms_cancelled: AtomicBool,
    pub installs: Mutex<HashSet<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings: Mutex::new(store::load()),
            logs: Mutex::new(Vec::new()),
            launch: Mutex::new(None),
            ms_cancelled: AtomicBool::new(false),
            installs: Mutex::new(HashSet::new()),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    /// Ayarları yerinde değiştirir, diske yazar ve güncel hali döndürür.
    pub fn update<F: FnOnce(&mut Settings)>(&self, update: F) -> Settings {
        let snapshot = {
            let mut guard = match self.settings.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            update(&mut guard);
            guard.clone()
        };
        store::write(&snapshot);
        snapshot
    }

    pub fn push_log(&self, line: LogLine) {
        if let Ok(mut logs) = self.logs.lock() {
            logs.push(line);
            if logs.len() > 4000 {
                let overflow = logs.len() - 4000;
                logs.drain(0..overflow);
            }
        }
    }

    pub fn logs(&self) -> Vec<LogLine> {
        self.logs
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub fn clear_logs(&self) {
        if let Ok(mut logs) = self.logs.lock() {
            logs.clear();
        }
    }
}
