use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::Manager;
use tauri::webview::PageLoadEvent;

const QUIZ_MAGIC: &[u8; 8] = b"UNITSTQ1";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .on_page_load(|webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            if let Err(error) = inject_quiz_resource(&webview) {
                eprintln!("UniTest: не удалось внедрить quiz-data.js: {error}");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running UniTest player");
}

fn inject_quiz_resource(webview: &tauri::Webview) -> Result<(), String> {
    let js = load_quiz_js(webview)?;
    let script = match js {
        Some(code) => format!("{code}\nwindow.dispatchEvent(new Event('unitest-quiz-ready'));"),
        None => {
            "window.__UNITEST_QUIZ__ = window.__UNITEST_QUIZ__ || null; window.dispatchEvent(new Event('unitest-quiz-ready'));"
                .to_string()
        }
    };
    webview.eval(&script).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_quiz_js(webview: &tauri::Webview) -> Result<Option<String>, String> {
    if let Some(from_exe) = read_quiz_from_exe_overlay()? {
        return Ok(Some(from_exe));
    }

    let resource_dir = webview
        .app_handle()
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;
    let quiz_path = resource_dir.join("quiz-data.js");
    if quiz_path.is_file() {
        return Ok(Some(fs::read_to_string(&quiz_path).map_err(|e| e.to_string())?));
    }

    Ok(None)
}

fn read_quiz_from_exe_overlay() -> Result<Option<String>, String> {
    let exe: PathBuf = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut file = fs::File::open(&exe).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    let size = meta.len();
    if size < 17 {
        return Ok(None);
    }

    file.seek(SeekFrom::End(-16)).map_err(|e| e.to_string())?;
    let mut tail = [0u8; 16];
    file.read_exact(&mut tail).map_err(|e| e.to_string())?;

    if &tail[0..8] != QUIZ_MAGIC {
        return Ok(None);
    }

    let len = u64::from_le_bytes(tail[8..16].try_into().unwrap());
    if len == 0 || len > 64 * 1024 * 1024 {
        return Ok(None);
    }
    let total_tail = len.checked_add(16).ok_or_else(|| "overflow".to_string())?;
    if size < total_tail {
        return Ok(None);
    }

    file.seek(SeekFrom::End(-(total_tail as i64)))
        .map_err(|e| e.to_string())?;
    let mut payload = vec![0u8; len as usize];
    file.read_exact(&mut payload).map_err(|e| e.to_string())?;

    let js = String::from_utf8(payload).map_err(|e| e.to_string())?;
    Ok(Some(js))
}
