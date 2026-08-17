use std::collections::BTreeMap;

use crate::violation::{Category, Rule, Violation};

pub fn format_report(hits: &[Violation]) -> String {
    let mut by_rule: BTreeMap<Rule, Vec<String>> = BTreeMap::new();
    for hit in hits {
        let location = match hit.line {
            0 => format!("{} (whole file)", hit.file),
            line => format!("{}:{}", hit.file, line),
        };
        by_rule.entry(hit.rule).or_default().push(location);
    }

    let mut out = String::new();
    out.push_str(&format!("\n{} violations — rejected by the law.\n", hits.len()));
    out.push_str(
        "every entry below is a repair prompt: what is banned, why it exists, the legal spellings,\n\
         and the law.toml valve where the rule has one. no other document is needed to fix this.\n",
    );

    for category in Category::ORDER {
        let rules: Vec<Rule> = by_rule
            .keys()
            .filter(|r| r.category() == *category)
            .copied()
            .collect();
        if rules.is_empty() {
            continue;
        }
        out.push_str(&format!(
            "\n--- {} --- {}\n",
            category.name(),
            category.spirit()
        ));
        for rule in rules {
            let locations = match by_rule.get(&rule) {
                Some(locations) => locations.join(" | "),
                None => continue,
            };
            out.push_str(&format!("\n  [{}] {}\n", rule.id(), locations));
            out.push_str(&format!("    {}\n", rule.help()));
        }
    }

    out.push_str(&format!(
        "\n{} violations standing. this build does not pass — fix every line above and judge again.\n",
        hits.len()
    ));
    out.push_str(
        "the whole constitution: `lawkeeper --rules`. every knob, its default and when you may\n\
         touch it: `lawkeeper --init` writes a fully commented law.toml.\n",
    );

    out
}

pub fn constitution() -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "the law — {} rules in {} categories, enforced on syntax alone at build time.\n",
        Rule::ALL.len(),
        Category::ORDER.len()
    ));
    out.push_str(
        "each rule prints here exactly what it prints when it fires: what is banned, why it exists,\n\
         the legal spellings, and the law.toml valve where the rule has one.\n",
    );
    for category in Category::ORDER {
        out.push_str(&format!(
            "\n--- {} --- {}\n",
            category.name(),
            category.spirit()
        ));
        for rule in Rule::ALL {
            if rule.category() != *category {
                continue;
            }
            out.push_str(&format!("\n  [{}]\n    {}\n", rule.id(), rule.help()));
        }
    }
    out.push_str(
        "\nthe knobs live in law.toml next to Cargo.toml, searched upward, so one law can rule a\n\
         workspace. `lawkeeper --init` writes it with every key at its default and commented.\n\
         a valve is a LOCAL concession, visible in the diff — the defaults concede nothing.\n",
    );
    out
}
