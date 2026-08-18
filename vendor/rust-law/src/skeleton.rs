use std::collections::BTreeMap;
use std::str::FromStr;

use proc_macro2::{Delimiter, TokenStream, TokenTree};

use crate::violation::LawError;

pub struct Shape {
    pub node: String,
    pub detail: Vec<String>,
    pub children: Vec<Shape>,
}

pub struct Names {
    given: BTreeMap<String, String>,
}

impl Names {
    fn new() -> Self {
        Self { given: BTreeMap::new() }
    }

    fn for_one(&mut self, original: &str) -> String {
        let next = format!("name{}", self.given.len() + 1);
        self.given.entry(original.to_string()).or_insert(next).clone()
    }
}

const GRAMMAR: &[&str] = &[
    "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum", "extern",
    "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref",
    "return", "self", "Self", "static", "struct", "super", "trait", "type", "union", "unsafe",
    "use", "where", "while", "u8", "u16", "u32", "u64", "u128", "usize", "i8", "i16", "i32", "i64",
    "i128", "isize", "f32", "f64", "bool", "char", "str",
];

fn word_for(ident: &str, names: &mut Names) -> String {
    if GRAMMAR.contains(&ident) {
        return ident.to_string();
    }
    names.for_one(ident)
}

fn opened_by(delimiter: Delimiter) -> &'static str {
    match delimiter {
        Delimiter::Parenthesis => "parens",
        Delimiter::Brace => "braces",
        Delimiter::Bracket => "brackets",
        Delimiter::None => "none",
    }
}

fn shape_of(tree: &TokenTree, names: &mut Names, depth: usize) -> Shape {
    match tree {
        TokenTree::Ident(ident) => Shape {
            node: "Ident".to_string(),
            detail: vec![word_for(&ident.to_string(), names)],
            children: Vec::new(),
        },
        TokenTree::Punct(punct) => Shape {
            node: "Punct".to_string(),
            detail: vec![punct.as_char().to_string()],
            children: Vec::new(),
        },
        TokenTree::Literal(_) => Shape {
            node: "Literal".to_string(),
            detail: vec!["value-removed".to_string()],
            children: Vec::new(),
        },
        TokenTree::Group(group) => {
            let mut children = Vec::new();
            if depth > 0 {
                for inner in group.stream() {
                    children.push(shape_of(&inner, names, depth - 1));
                }
            }
            Shape {
                node: "Group".to_string(),
                detail: vec![opened_by(group.delimiter()).to_string()],
                children,
            }
        }
    }
}

fn on_line(tokens: TokenStream, line: usize, out: &mut Vec<TokenTree>) {
    for tree in tokens {
        if tree.span().start().line == line {
            out.push(tree);
            continue;
        }
        if let TokenTree::Group(group) = &tree {
            if group.span().start().line <= line && line <= group.span().end().line {
                on_line(group.stream(), line, out);
            }
        }
    }
}

fn item_holding(items: &[syn::Item], line: usize) -> Option<String> {
    for item in items {
        let held = match item {
            syn::Item::Fn(_) => "ItemFn",
            syn::Item::Impl(_) => "ItemImpl",
            syn::Item::Struct(_) => "ItemStruct",
            syn::Item::Enum(_) => "ItemEnum",
            syn::Item::Trait(_) => "ItemTrait",
            syn::Item::Mod(_) => "ItemMod",
            syn::Item::Const(_) => "ItemConst",
            syn::Item::Static(_) => "ItemStatic",
            syn::Item::Macro(_) => "ItemMacro",
            syn::Item::Type(_) => "ItemType",
            syn::Item::Use(_) => "ItemUse",
            _ => "Item",
        };
        let span = syn::spanned::Spanned::span(item);
        if span.start().line <= line && line <= span.end().line {
            if let syn::Item::Mod(held_mod) = item {
                if let Some((_brace, inner)) = &held_mod.content {
                    if let Some(deeper) = item_holding(inner, line) {
                        return Some(deeper);
                    }
                }
            }
            return Some(held.to_string());
        }
    }
    None
}

pub fn shape_at(source: &str, line: usize, depth: usize) -> Result<Shape, LawError> {
    let tokens = TokenStream::from_str(source).map_err(|error| LawError::Parse {
        path: std::path::PathBuf::new(),
        message: error.to_string(),
    })?;

    let mut found = Vec::new();
    on_line(tokens, line, &mut found);
    if found.is_empty() {
        return Err(LawError::Usage {
            message: format!("nothing looked like Rust on line {line}"),
        });
    }

    let holder = match syn::parse_file(source) {
        Ok(parsed) => item_holding(&parsed.items, line).unwrap_or_else(|| "File".to_string()),
        Err(_) => "File".to_string(),
    };

    let mut names = Names::new();
    let children = found.iter().map(|tree| shape_of(tree, &mut names, depth)).collect();
    Ok(Shape { node: holder, detail: Vec::new(), children })
}
