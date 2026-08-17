use std::path::{Path, PathBuf};

use rust_law::scan::{judge_files, judge_project};
use rust_law::violation::{LawError, Violation};

fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn as_json(found: &[Violation]) -> String {
    let mut parts: Vec<String> = Vec::with_capacity(found.len());
    for held in found {
        parts.push(format!(
            "{{\"rule\":\"{}\",\"file\":\"{}\",\"line\":{}}}",
            escape(held.rule.id()),
            escape(&held.file),
            held.line
        ));
    }
    format!("{{\"violations\":[{}]}}", parts.join(","))
}

fn said(error: &LawError) -> String {
    match error {
        LawError::Io { path, message } => format!("could not read {}: {}", path.display(), message),
        LawError::Parse { path, message } => {
            format!("could not read {} as Rust: {}", path.display(), message)
        }
        LawError::Config { path, message } => {
            format!("could not read {}: {}", path.display(), message)
        }
        LawError::Usage { message } => message.clone(),
        LawError::RootNotFound { start } => {
            format!("no Cargo.toml at or above {}", start.display())
        }
    }
}

fn is_a_command(attrs: &[syn::Attribute]) -> bool {
    attrs.iter().any(|attr| {
        let path = attr.path();
        let last = match path.segments.last() {
            Some(segment) => segment.ident.to_string(),
            None => return false,
        };
        if last != "command" {
            return false;
        }
        match path.segments.len() {
            1 => true,
            _ => path.segments.first().map(|s| s.ident == "tauri").unwrap_or(false),
        }
    })
}

fn commands_in(items: &[syn::Item], into: &mut Vec<String>) {
    for item in items {
        match item {
            syn::Item::Fn(held) if is_a_command(&held.attrs) => {
                into.push(held.sig.ident.to_string());
            }
            syn::Item::Mod(held) => {
                if let Some((_, inner)) = &held.content {
                    commands_in(inner, into);
                }
            }
            _ => {}
        }
    }
}

fn commands_under(root: &Path) -> Result<Vec<String>, LawError> {
    let mut found: Vec<String> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];

    while let Some(at) = stack.pop() {
        let entries = match std::fs::read_dir(&at) {
            Ok(entries) => entries,
            Err(error) => {
                return Err(LawError::Io { path: at, message: error.to_string() });
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name == "target" || name == "node_modules" || name.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("rs") {
                continue;
            }
            let text = match std::fs::read_to_string(&path) {
                Ok(text) => text,
                Err(error) => {
                    return Err(LawError::Io { path, message: error.to_string() });
                }
            };
            let parsed = match syn::parse_file(&text) {
                Ok(parsed) => parsed,
                Err(error) => {
                    return Err(LawError::Parse { path, message: error.to_string() });
                }
            };
            commands_in(&parsed.items, &mut found);
        }
    }

    found.sort();
    found.dedup();
    Ok(found)
}

fn print_commands(root: &Path) {
    match commands_under(root) {
        Ok(found) => {
            let named: Vec<String> = found.iter().map(|n| format!("\"{}\"", escape(n))).collect();
            println!("{{\"commands\":[{}]}}", named.join(","));
        }
        Err(error) => {
            println!("{{\"error\":\"{}\"}}", escape(&said(&error)));
            std::process::exit(2);
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--commands") {
        let Some(root) = args.get(1) else {
            println!("{{\"error\":\"--commands needs a project root\"}}");
            std::process::exit(2);
        };
        print_commands(Path::new(root));
        return;
    }
    let Some(root) = args.first() else {
        eprintln!("{{\"error\":\"looper-rust needs a project root\"}}");
        std::process::exit(2);
    };
    let root = PathBuf::from(root);
    let files: Vec<PathBuf> = args[1..].iter().map(PathBuf::from).collect();

    let judged = if files.is_empty() {
        judge_project(&root)
    } else {
        judge_files(&root, &files)
    };

    match judged {
        Ok(found) => println!("{}", as_json(&found)),
        Err(error) => {
            println!("{{\"error\":\"{}\"}}", escape(&said(&error)));
            std::process::exit(2);
        }
    }
}
