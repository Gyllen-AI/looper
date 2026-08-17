use std::collections::BTreeMap;

use crate::violation::{Rule, Violation};

pub enum Resolved {
    Internal(Vec<String>),
    External,
}

pub fn module_path_for_rel(rel: &str) -> Vec<String> {
    let clean = rel.replace('\\', "/");
    let mut mp = vec!["crate".to_string()];
    let parts: Vec<&str> = clean.split('/').collect();
    let total = parts.len();
    for (idx, part) in parts.iter().enumerate() {
        if idx + 1 < total {
            mp.push((*part).to_string());
            continue;
        }
        let Some(stem) = part.strip_suffix(".rs") else {
            mp.push((*part).to_string());
            continue;
        };
        if stem == "mod" || stem == "lib" || stem == "main" {
            continue;
        }
        mp.push(stem.to_string());
    }
    mp
}

pub fn resolve(segs: &[String], mod_path: &[String]) -> Resolved {
    let Some(first) = segs.first() else {
        return Resolved::External;
    };
    if first == "crate" {
        return Resolved::Internal(segs.to_vec());
    }
    if first == "self" {
        let mut full = mod_path.to_vec();
        full.extend(segs.iter().skip(1).cloned());
        return Resolved::Internal(full);
    }
    if first == "super" {
        let supers = segs.iter().take_while(|s| *s == "super").count();
        if supers >= mod_path.len() {
            return Resolved::External;
        }
        let keep = mod_path.len() - supers;
        let mut full: Vec<String> = mod_path.iter().take(keep).cloned().collect();
        full.extend(segs.iter().skip(supers).cloned());
        return Resolved::Internal(full);
    }
    Resolved::External
}

pub fn check_layer_uses(
    layers: &BTreeMap<String, Vec<String>>,
    rel: &str,
    uses: &[(usize, Vec<String>)],
    hits: &mut Vec<Violation>,
) {
    if layers.is_empty() {
        return;
    }
    let mod_path = module_path_for_rel(rel);
    let Some(own) = mod_path.get(1) else {
        return;
    };
    let Some(allowed) = layers.get(own) else {
        return;
    };
    for (line, segs) in uses {
        let Resolved::Internal(full) = resolve(segs, &mod_path) else {
            continue;
        };
        let Some(target) = full.get(1) else {
            continue;
        };
        if target == own {
            continue;
        }
        if !layers.contains_key(target) {
            continue;
        }
        if allowed.iter().any(|a| a == target) {
            continue;
        }
        hits.push(Violation {
            rule: Rule::LayerBreach,
            file: rel.to_string(),
            line: *line,
        });
    }
}

pub fn verify_invariants() {
    let mp = module_path_for_rel("routines/auth/login.rs");
    assert_eq!(mp, seglist(&["crate", "routines", "auth", "login"]), "nested file");
    assert_eq!(
        module_path_for_rel("routines/auth/mod.rs"),
        seglist(&["crate", "routines", "auth"]),
        "mod.rs collapses"
    );
    assert_eq!(module_path_for_rel("routines.rs"), seglist(&["crate", "routines"]), "top file");
    assert_eq!(module_path_for_rel("lib.rs"), seglist(&["crate"]), "lib.rs is root");
    assert_eq!(module_path_for_rel("main.rs"), seglist(&["crate"]), "main.rs is root");

    let anchor = seglist(&["crate", "routines", "auth", "login"]);
    assert_internal(&seglist(&["crate", "models", "Foo"]), &anchor, &["crate", "models", "Foo"]);
    assert_internal(&seglist(&["self", "Bar"]), &anchor, &["crate", "routines", "auth", "login", "Bar"]);
    assert_internal(&seglist(&["super", "Foo"]), &anchor, &["crate", "routines", "auth", "Foo"]);
    assert_internal(
        &seglist(&["super", "super", "super", "models", "Foo"]),
        &anchor,
        &["crate", "models", "Foo"],
    );
    assert_external(&seglist(&["super", "super", "super", "super"]), &anchor);
    assert_external(&seglist(&["std", "fmt", "Display"]), &anchor);
    assert_external(&seglist(&["serde", "Deserialize"]), &anchor);
    assert_external(&seglist(&["supersize", "X"]), &anchor);
    assert_external(&seglist(&["selfless", "Y"]), &anchor);
    assert_external(&seglist(&["crateful", "Z"]), &anchor);
}

fn seglist(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|s| (*s).to_string()).collect()
}

fn assert_internal(segs: &[String], anchor: &[String], want: &[&str]) {
    let Resolved::Internal(full) = resolve(segs, anchor) else {
        panic!("resolver invariant broken: {segs:?} must resolve internal");
    };
    assert_eq!(full, seglist(want), "resolver invariant broken for {segs:?}");
}

fn assert_external(segs: &[String], anchor: &[String]) {
    let Resolved::External = resolve(segs, anchor) else {
        panic!("resolver invariant broken: {segs:?} must resolve external");
    };
}
