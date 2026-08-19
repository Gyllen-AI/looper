import ast
import json
import sys


PY_GRAMMAR = frozenset(
    {
        "and",
        "as",
        "assert",
        "async",
        "await",
        "break",
        "class",
        "continue",
        "def",
        "del",
        "elif",
        "else",
        "except",
        "finally",
        "for",
        "from",
        "global",
        "if",
        "import",
        "in",
        "is",
        "lambda",
        "nonlocal",
        "not",
        "or",
        "pass",
        "raise",
        "return",
        "try",
        "while",
        "with",
        "yield",
    }
)

NAMED_FIELDS = ("id", "attr", "arg", "name", "module")


def enclosing_kinds():
    kinds = [ast.stmt, ast.ExceptHandler]
    for name in ("match_case",):
        held = getattr(ast, name, None)
        if held is not None:
            kinds.append(held)
    return tuple(kinds)


ENCLOSING = enclosing_kinds()


class Names:
    def __init__(self):
        self.given = {}

    def for_one(self, original):
        held = self.given.get(original)
        if held is not None:
            return held
        given = "name{}".format(len(self.given) + 1)
        self.given[original] = given
        return given


def detail_of(node, names):
    detail = []
    for field in NAMED_FIELDS:
        held = getattr(node, field, None)
        if isinstance(held, str):
            if held in PY_GRAMMAR:
                detail.append(held)
            else:
                detail.append(names.for_one(held))
    if isinstance(node, ast.Constant):
        detail.append("value-removed")
    operator = getattr(node, "op", None)
    if operator is not None:
        detail.append(type(operator).__name__)
    return detail


def shape_of(node, names, depth):
    children = []
    if depth > 0:
        for child in ast.iter_child_nodes(node):
            children.append(shape_of(child, names, depth - 1))
    return {
        "node": type(node).__name__,
        "detail": detail_of(node, names),
        "children": children,
    }


def statement_on(tree, line):
    for node in ast.walk(tree):
        if not isinstance(node, ENCLOSING):
            continue
        if getattr(node, "lineno", None) != line:
            continue
        return node
    return None


def statement_around(tree, line):
    held = None
    for node in ast.walk(tree):
        if not isinstance(node, ENCLOSING):
            continue
        first = getattr(node, "lineno", None)
        last = getattr(node, "end_lineno", None)
        if first is None or last is None:
            continue
        if first > line or last < line:
            continue
        if held is not None and last - first > held.end_lineno - held.lineno:
            continue
        held = node
    return held


def shape_at(path, line, depth):
    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as error:
        return {
            "error": "could not read {} as Python: line {}: {}".format(path, error.lineno, error.msg)
        }
    found = statement_on(tree, line)
    if found is not None:
        return {"shape": shape_of(found, Names(), depth)}
    around = statement_around(tree, line)
    if around is None:
        return {"error": "nothing looked like a statement on line {}".format(line)}
    return {"shape": shape_of(around, Names(), depth), "startsAt": around.lineno}


def main(argv):
    if len(argv) != 3:
        return {"error": "the shape reader needs a file, a line and a depth"}
    try:
        line = int(argv[1])
        depth = int(argv[2])
    except ValueError:
        return {"error": "the shape reader needs a line and a depth that are numbers"}
    return shape_at(argv[0], line, depth)


if __name__ == "__main__":
    try:
        print(json.dumps(main(sys.argv[1:])))
    except OSError as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
