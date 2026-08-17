use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use syn::visit::Visit;

use crate::patterns::{flatten_use, path_last};
use crate::violation::LawError;

const DEP_TABLES: &[&str] = &["dependencies", "dev-dependencies", "build-dependencies"];

pub struct Provenance<'c> {
    symbols: &'c [String],
    deps: &'c BTreeSet<String>,
    shadows: BTreeSet<String>,
    imports: Vec<Vec<String>>,
    enforce_deps: bool,
}

impl<'c> Provenance<'c> {
    pub fn new(
        symbols: &'c [String],
        deps: &'c BTreeSet<String>,
        ast: &syn::File,
        enforce_deps: bool,
    ) -> Provenance<'c> {
        let mut names = FileNames {
            shadows: BTreeSet::new(),
            imports: Vec::new(),
        };
        names.visit_file(ast);
        Provenance {
            symbols,
            deps,
            shadows: names.shadows,
            imports: names.imports,
            enforce_deps,
        }
    }

    pub fn honors(&self, segs: &[String], is_macro: bool) -> bool {
        self.symbols
            .iter()
            .any(|symbol| self.honors_symbol(symbol, segs, is_macro))
    }

    fn honors_symbol(&self, symbol: &str, segs: &[String], is_macro: bool) -> bool {
        let sym_segs: Vec<&str> = symbol.split("::").collect();
        let [root, ..] = sym_segs.as_slice() else {
            return false;
        };
        if self.shadows.contains(*root) {
            return false;
        }
        if sym_segs.len() == 1 {
            return is_macro && segs_eq(segs, &sym_segs);
        }
        if self.enforce_deps && !self.deps.contains(*root) {
            return false;
        }
        if segs_eq(segs, &sym_segs) {
            return true;
        }
        self.imported_bare(segs, &sym_segs)
    }

    fn imported_bare(&self, segs: &[String], sym_segs: &[&str]) -> bool {
        let [only] = segs else {
            return false;
        };
        let [.., last] = sym_segs else {
            return false;
        };
        if only != last {
            return false;
        }
        self.imports.iter().any(|path| segs_eq(path, sym_segs))
    }
}

fn segs_eq(segs: &[String], sym_segs: &[&str]) -> bool {
    segs.len() == sym_segs.len() && segs.iter().zip(sym_segs).all(|(a, b)| a == b)
}

struct FileNames {
    shadows: BTreeSet<String>,
    imports: Vec<Vec<String>>,
}

impl FileNames {
    fn record_use(&mut self, segs: &[String]) {
        self.imports.push(segs.to_vec());
        let [first, rest @ ..] = segs else {
            return;
        };
        if first != "crate" && first != "self" && first != "super" {
            return;
        }
        for seg in rest {
            self.shadows.insert(seg.clone());
        }
    }

    fn record_macro(&mut self, node: &syn::ItemMacro) {
        let Some(name) = &node.ident else {
            return;
        };
        self.shadows.insert(name.to_string());
    }
}

impl<'ast> Visit<'ast> for FileNames {
    fn visit_item_mod(&mut self, node: &'ast syn::ItemMod) {
        self.shadows.insert(node.ident.to_string());
        syn::visit::visit_item_mod(self, node);
    }

    fn visit_item_macro(&mut self, node: &'ast syn::ItemMacro) {
        if path_last(&node.mac.path) == "macro_rules" {
            self.record_macro(node);
        }
        syn::visit::visit_item_macro(self, node);
    }

    fn visit_item_use(&mut self, node: &'ast syn::ItemUse) {
        let mut paths = Vec::new();
        flatten_use(&node.tree, Vec::new(), &mut paths);
        for info in &paths {
            self.record_use(&info.segs);
        }
        syn::visit::visit_item_use(self, node);
    }
}

pub fn dependency_names(roots: &[PathBuf]) -> Result<BTreeSet<String>, LawError> {
    let mut out = BTreeSet::new();
    for root in roots {
        let manifest = root.join("Cargo.toml");
        if !manifest.is_file() {
            continue;
        }
        harvest_manifest(&manifest, &mut out)?;
    }
    Ok(out)
}

fn harvest_manifest(manifest: &Path, out: &mut BTreeSet<String>) -> Result<(), LawError> {
    let raw = match fs::read_to_string(manifest) {
        Ok(raw) => raw,
        Err(err) => {
            return Err(LawError::Io {
                path: manifest.to_path_buf(),
                message: err.to_string(),
            });
        }
    };
    let doc: toml::Value = match toml::from_str(&raw) {
        Ok(doc) => doc,
        Err(err) => {
            return Err(LawError::Config {
                path: manifest.to_path_buf(),
                message: err.to_string(),
            });
        }
    };
    harvest_tables(&doc, out);
    let Some(workspace) = doc.get("workspace") else {
        return Ok(());
    };
    harvest_tables(workspace, out);
    Ok(())
}

fn harvest_tables(doc: &toml::Value, out: &mut BTreeSet<String>) {
    for table in DEP_TABLES {
        let Some(section) = doc.get(table) else {
            continue;
        };
        let Some(map) = section.as_table() else {
            continue;
        };
        for name in map.keys() {
            out.insert(name.replace('-', "_"));
        }
    }
}
