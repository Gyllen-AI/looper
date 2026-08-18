import ast
import json
import sys

BARE_EXCEPT = "PY-ERROR:1"

MUTABLE_DEFAULT = "PY-TRUTH:1"

MUTABLE_BUILDERS = frozenset(
    {"list", "dict", "set", "bytearray", "defaultdict", "Counter", "deque", "OrderedDict"}
)


def does_nothing(body):
    for statement in body:
        if isinstance(statement, ast.Pass):
            continue
        if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant):
            if statement.value.value is Ellipsis:
                continue
        return False
    return True


def builder_name(call):
    if isinstance(call.func, ast.Name):
        return call.func.id
    if isinstance(call.func, ast.Attribute):
        return call.func.attr
    return ""


def is_mutable_default(node):
    if isinstance(node, (ast.List, ast.Dict, ast.Set)):
        return True
    if isinstance(node, ast.Call):
        return builder_name(node) in MUTABLE_BUILDERS
    return False


def defaults_of(node):
    given = list(node.args.defaults)
    for held in node.args.kw_defaults:
        if held is not None:
            given.append(held)
    return given


def violations_in(tree):
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler):
            if node.type is None or does_nothing(node.body):
                found.append({"rule": BARE_EXCEPT, "line": node.lineno})
            continue
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            for given in defaults_of(node):
                if is_mutable_default(given):
                    found.append({"rule": MUTABLE_DEFAULT, "line": given.lineno})
    return found


def judge(path):
    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as error:
        return {"unreadable": {"file": path, "detail": f"line {error.lineno}: {error.msg}"}}
    return {"violations": [dict(hit, file=path) for hit in violations_in(tree)]}


def main(argv):
    violations = []
    unreadable = []
    for path in argv:
        answer = judge(path)
        violations.extend(answer.get("violations", []))
        if "unreadable" in answer:
            unreadable.append(answer["unreadable"])
    return {"violations": violations, "unreadable": unreadable}


if __name__ == "__main__":
    try:
        print(json.dumps(main(sys.argv[1:])))
    except OSError as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
