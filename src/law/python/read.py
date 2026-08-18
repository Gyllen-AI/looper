import ast
import io
import json
import sys
import tokenize

BARE_EXCEPT = "PY-ERROR:1"

MUTABLE_DEFAULT = "PY-TRUTH:1"

ASSERT_AS_A_CHECK = "PY-TRUTH:2"

MADE_UP_ANSWER = "PY-ERROR:2"

SILENCED_CHECKER = "PY-TYPE:1"

LAUNDERED_NAMESPACE = "PY-LAYER:1"

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


def is_a_test_file(path):
    parts = path.replace("\\", "/").split("/")
    name = parts[-1]
    if "tests" in parts[:-1] or "test" in parts[:-1]:
        return True
    return name.startswith("test_") or name.endswith("_test.py") or name == "conftest.py"


def shape_of(node):
    if node is None:
        return "None"
    if isinstance(node, ast.Constant):
        return f"constant:{node.value!r}"
    if isinstance(node, ast.List) and not node.elts:
        return "empty:list"
    if isinstance(node, ast.Dict) and not node.keys:
        return "empty:dict"
    if isinstance(node, ast.Set) and not node.elts:
        return "empty:set"
    if isinstance(node, ast.Tuple) and not node.elts:
        return "empty:tuple"
    return ""


def is_made_up(node):
    shape = shape_of(node)
    if shape.startswith("empty:") or shape == "None":
        return True
    return isinstance(node, ast.Constant)


def answers_already_given(body):
    given = set()
    for statement in body:
        for node in ast.walk(statement):
            if isinstance(node, ast.Return):
                shape = shape_of(node.value)
                if shape:
                    given.add(shape)
    return given


def looks_at_the_error(handler):
    if handler.name is None:
        return False
    for node in ast.walk(handler):
        if isinstance(node, ast.Name) and node.id == handler.name:
            return True
    return False


def made_up_answers_in(handler, already):
    found = []
    for statement in handler.body:
        for node in ast.walk(statement):
            if not isinstance(node, ast.Return):
                continue
            if shape_of(node.value) in already:
                continue
            if is_made_up(node.value):
                found.append(node.lineno)
    return found


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


def violations_in(tree, in_a_test_file):
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if any(alias.name == "*" for alias in node.names):
                found.append({"rule": LAUNDERED_NAMESPACE, "line": node.lineno})
            continue
        if isinstance(node, ast.Try):
            already = answers_already_given(node.body)
            for handler in node.handlers:
                if looks_at_the_error(handler):
                    continue
                for line in made_up_answers_in(handler, already):
                    found.append({"rule": MADE_UP_ANSWER, "line": line})
            continue
        if isinstance(node, ast.ExceptHandler):
            if node.type is None or does_nothing(node.body):
                found.append({"rule": BARE_EXCEPT, "line": node.lineno})
            continue
        if isinstance(node, ast.Assert):
            if not in_a_test_file:
                found.append({"rule": ASSERT_AS_A_CHECK, "line": node.lineno})
            continue
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            for given in defaults_of(node):
                if is_mutable_default(given):
                    found.append({"rule": MUTABLE_DEFAULT, "line": given.lineno})
    return found


def silences_the_checker(text):
    said = text.lstrip("#").strip()
    if said.startswith("type:"):
        return said[len("type:") :].strip().startswith("ignore")
    if said.startswith("mypy:"):
        return "ignore-errors" in said
    return False


def silenced_lines(source):
    found = []
    reader = io.StringIO(source).readline
    try:
        for token in tokenize.generate_tokens(reader):
            if token.type == tokenize.COMMENT and silences_the_checker(token.string):
                found.append(token.start[0])
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return found
    return found


def judge(path):
    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as error:
        return {"unreadable": {"file": path, "detail": f"line {error.lineno}: {error.msg}"}}
    hits = list(violations_in(tree, is_a_test_file(path)))
    for line in silenced_lines(source):
        hits.append({"rule": SILENCED_CHECKER, "line": line})
    return {"violations": [dict(hit, file=path) for hit in hits]}


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
