use crate::violation::{Rule, Violation};

pub fn comment_hits(rel: &str, content: &str) -> Vec<Violation> {
    let chars: Vec<char> = content.chars().collect();
    let mut hits = Vec::new();
    let mut line = 1usize;
    let mut i = 0usize;
    let mut prev_ident = false;

    while i < chars.len() {
        let c = chars[i];
        match c {
            '\n' => {
                line += 1;
                prev_ident = false;
                i += 1;
            }
            '"' => {
                i = consume_string(&chars, i + 1, &mut line);
                prev_ident = false;
            }
            '\'' => {
                i = consume_quote(&chars, i + 1, &mut line);
                prev_ident = false;
            }
            'r' | 'b' | 'c' if !prev_ident => {
                let taken = raw_or_byte_start(&chars, i);
                if taken == 0 {
                    prev_ident = true;
                    i += 1;
                } else {
                    i = taken;
                    prev_ident = false;
                    i = consume_after_prefix(&chars, i, &mut line);
                }
            }
            '/' => {
                let at = line;
                i = consume_slash(&chars, i, at, rel, &mut hits, &mut line);
                prev_ident = false;
            }
            _ => {
                prev_ident = c.is_alphanumeric() || c == '_';
                i += 1;
            }
        }
    }

    hits
}

fn consume_slash(
    chars: &[char],
    i: usize,
    at_line: usize,
    rel: &str,
    hits: &mut Vec<Violation>,
    line: &mut usize,
) -> usize {
    if is_char(chars, i + 1, '/') {
        hits.push(Violation {
            rule: Rule::Comment,
            file: rel.to_string(),
            line: at_line,
        });
        let mut j = i;
        while j < chars.len() && chars[j] != '\n' {
            j += 1;
        }
        return j;
    }
    if is_char(chars, i + 1, '*') {
        hits.push(Violation {
            rule: Rule::Comment,
            file: rel.to_string(),
            line: at_line,
        });
        return consume_block_comment(chars, i + 2, line);
    }
    i + 1
}

fn consume_after_prefix(chars: &[char], i: usize, line: &mut usize) -> usize {
    if is_char(chars, i, '"') {
        let hashes = count_hashes(chars, i);
        return consume_raw_string(chars, i, hashes, line);
    }
    if is_char(chars, i, '#') {
        let hashes = count_hashes(chars, i);
        return consume_raw_string(chars, i + hashes, hashes, line);
    }
    if is_char(chars, i, '\'') {
        return consume_quote(chars, i + 1, line);
    }
    i
}

fn is_char(chars: &[char], i: usize, want: char) -> bool {
    let Some(c) = chars.get(i) else {
        return false;
    };
    *c == want
}

fn raw_or_byte_start(chars: &[char], i: usize) -> usize {
    let c = chars[i];
    if c == 'r' {
        if is_char(chars, i + 1, '"') || is_char(chars, i + 1, '#') {
            return i + 1;
        }
        return 0;
    }
    if is_char(chars, i + 1, 'r') && (is_char(chars, i + 2, '"') || is_char(chars, i + 2, '#')) {
        return i + 2;
    }
    if is_char(chars, i + 1, '"') || is_char(chars, i + 1, '\'') {
        return i + 1;
    }
    0
}

fn count_hashes(chars: &[char], start: usize) -> usize {
    let mut hashes = 0usize;
    while is_char(chars, start + hashes, '#') {
        hashes += 1;
    }
    hashes
}

fn consume_string(chars: &[char], start: usize, line: &mut usize) -> usize {
    let mut i = start;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 2,
            '"' => return i + 1,
            '\n' => {
                *line += 1;
                i += 1;
            }
            _ => i += 1,
        }
    }
    i
}

fn consume_raw_string(chars: &[char], start: usize, hashes: usize, line: &mut usize) -> usize {
    let mut i = start;
    if is_char(chars, i, '"') {
        i += 1;
    }
    while i < chars.len() {
        if chars[i] == '\n' {
            *line += 1;
            i += 1;
            continue;
        }
        if chars[i] == '"' {
            let mut matched = 0usize;
            while matched < hashes && is_char(chars, i + 1 + matched, '#') {
                matched += 1;
            }
            if matched == hashes {
                return i + 1 + hashes;
            }
        }
        i += 1;
    }
    i
}

fn consume_block_comment(chars: &[char], start: usize, line: &mut usize) -> usize {
    let mut i = start;
    let mut depth = 1usize;
    while i < chars.len() && depth > 0 {
        match chars[i] {
            '\n' => {
                *line += 1;
                i += 1;
            }
            '/' => {
                if is_char(chars, i + 1, '*') {
                    depth += 1;
                    i += 2;
                    continue;
                }
                i += 1;
            }
            '*' => {
                if is_char(chars, i + 1, '/') {
                    depth -= 1;
                    i += 2;
                    continue;
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    i
}

fn consume_quote(chars: &[char], start: usize, line: &mut usize) -> usize {
    let Some(first) = chars.get(start) else {
        return start;
    };
    let alpha = first.is_alphabetic() || *first == '_';
    if alpha && !is_char(chars, start + 1, '\'') {
        return start;
    }
    let mut j = start;
    while j < chars.len() {
        match chars[j] {
            '\\' => j += 2,
            '\'' => return j + 1,
            '\n' => {
                *line += 1;
                return j;
            }
            _ => j += 1,
        }
    }
    j
}
