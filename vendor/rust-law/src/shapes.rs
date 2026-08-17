use syn::spanned::Spanned;
use syn::visit::Visit;

use crate::patterns::{path_last, path_segs};

pub enum ResultShape {
    Lawful,
    Shorthand,
    Erased,
    MaybeGeneric(String),
}

pub fn collect_results(ty: &syn::Type, out: &mut Vec<(usize, ResultShape)>) {
    let mut finder = ResultFinder { out };
    finder.visit_type(ty);
}

struct ResultFinder<'a> {
    out: &'a mut Vec<(usize, ResultShape)>,
}

impl<'ast, 'a> Visit<'ast> for ResultFinder<'a> {
    fn visit_type(&mut self, node: &'ast syn::Type) {
        shape_of_type(node, self.out);
        syn::visit::visit_type(self, node);
    }
}

pub fn sig_option_lines(sig: &syn::Signature, out: &mut Vec<usize>) {
    for input in &sig.inputs {
        let syn::FnArg::Typed(pt) = input else {
            continue;
        };
        option_lines(&pt.ty, out);
    }
    let syn::ReturnType::Type(_arrow, ty) = &sig.output else {
        return;
    };
    option_lines(ty, out);
}

fn option_lines(ty: &syn::Type, out: &mut Vec<usize>) {
    let mut finder = OptionFinder { out };
    finder.visit_type(ty);
}

struct OptionFinder<'a> {
    out: &'a mut Vec<usize>,
}

impl<'ast, 'a> Visit<'ast> for OptionFinder<'a> {
    fn visit_type(&mut self, node: &'ast syn::Type) {
        if let syn::Type::Path(tp) = node
            && tp.path.segments.iter().any(|s| s.ident == "Option")
        {
            self.out.push(node.span().start().line);
        }
        syn::visit::visit_type(self, node);
    }
}

pub fn type_holds_callable(ty: &syn::Type) -> bool {
    let mut finder = CallableFinder { found: false };
    finder.visit_type(ty);
    finder.found
}

struct CallableFinder {
    found: bool,
}

impl<'ast> Visit<'ast> for CallableFinder {
    fn visit_type_bare_fn(&mut self, node: &'ast syn::TypeBareFn) {
        self.found = true;
        syn::visit::visit_type_bare_fn(self, node);
    }

    fn visit_trait_bound(&mut self, node: &'ast syn::TraitBound) {
        let last = path_last(&node.path);
        if last == "Fn" || last == "FnMut" || last == "FnOnce" {
            self.found = true;
        }
        syn::visit::visit_trait_bound(self, node);
    }
}

pub fn erased_error_carrier(ty: &syn::Type) -> bool {
    match ty {
        syn::Type::TraitObject(to) => bounds_name_error(&to.bounds),
        syn::Type::ImplTrait(it) => bounds_name_error(&it.bounds),
        syn::Type::Path(tp) => {
            let segs = path_segs(&tp.path);
            segs.iter().any(|s| s == "anyhow" || s == "eyre")
        }
        _ => false,
    }
}

type Bounds = syn::punctuated::Punctuated<syn::TypeParamBound, syn::token::Plus>;

fn bounds_name_error(bounds: &Bounds) -> bool {
    for bound in bounds {
        let syn::TypeParamBound::Trait(tb) = bound else {
            continue;
        };
        if path_last(&tb.path) == "Error" {
            return true;
        }
    }
    false
}

pub fn shape_of_type(node: &syn::Type, out: &mut Vec<(usize, ResultShape)>) {
    let syn::Type::Path(tp) = node else {
        return;
    };
    let Some(last) = tp.path.segments.last() else {
        return;
    };
    if last.ident != "Result" {
        return;
    }
    let line = node.span().start().line;
    let syn::PathArguments::AngleBracketed(ab) = &last.arguments else {
        out.push((line, ResultShape::Shorthand));
        return;
    };
    let mut types: Vec<&syn::Type> = Vec::new();
    for arg in &ab.args {
        if let syn::GenericArgument::Type(t) = arg {
            types.push(t);
        }
    }
    if types.len() == 2 {
        let Some(err_ty) = types.last() else {
            return;
        };
        out.push((line, erasure_shape(err_ty)));
        return;
    }
    out.push((line, ResultShape::Shorthand));
}

const ERASED_IDENTS: &[&str] = &[
    "String", "str", "i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64",
    "u128", "usize", "f32", "f64", "bool", "char",
];

pub fn erasure_shape(ty: &syn::Type) -> ResultShape {
    match ty {
        syn::Type::TraitObject(_) => ResultShape::Erased,
        syn::Type::Tuple(t) => {
            if t.elems.is_empty() {
                return ResultShape::Erased;
            }
            ResultShape::Lawful
        }
        syn::Type::Reference(r) => erasure_shape(&r.elem),
        syn::Type::Paren(p) => erasure_shape(&p.elem),
        syn::Type::Group(g) => erasure_shape(&g.elem),
        syn::Type::Path(tp) => path_erasure_shape(tp),
        _ => ResultShape::Lawful,
    }
}

fn path_erasure_shape(tp: &syn::TypePath) -> ResultShape {
    let segs = path_segs(&tp.path);
    if segs.iter().any(|s| s == "anyhow" || s == "eyre") {
        return ResultShape::Erased;
    }
    let Some(last) = segs.last() else {
        return ResultShape::Erased;
    };
    if ERASED_IDENTS.iter().any(|e| e == last) {
        return ResultShape::Erased;
    }
    if last == "Box" && boxed_dyn(tp) {
        return ResultShape::Erased;
    }
    let single_upper = last.len() == 1 && last.chars().all(|c| c.is_ascii_uppercase());
    if single_upper {
        return ResultShape::Erased;
    }
    if segs.len() == 1 {
        return ResultShape::MaybeGeneric(last.clone());
    }
    ResultShape::Lawful
}

fn boxed_dyn(tp: &syn::TypePath) -> bool {
    let Some(seg) = tp.path.segments.last() else {
        return false;
    };
    let syn::PathArguments::AngleBracketed(ab) = &seg.arguments else {
        return false;
    };
    for arg in &ab.args {
        if let syn::GenericArgument::Type(syn::Type::TraitObject(_)) = arg {
            return true;
        }
    }
    false
}
