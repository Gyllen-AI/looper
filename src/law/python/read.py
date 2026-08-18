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

UNNAMED_FAILURE = "PY-ERROR:3"

PRINTS_ITS_OWN_OUTPUT = "PY-LOG:1"

VALUE_IN_THE_MESSAGE = "PY-LOG:3"

LOG_LEVELS = frozenset(
    {"debug", "info", "warning", "warn", "error", "exception", "critical", "fatal", "log"}
)

LOGGING_MODULES = frozenset({"logging", "structlog"})

TERMINAL_WRITES = frozenset({"write", "writelines"})

TERMINAL_HANDLES = frozenset({"stdout", "stderr"})

SAYS_NOTHING = frozenset({"Exception", "BaseException"})

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


def destination_of(node):
    for given in node.keywords:
        if given.arg == "file":
            return given.value
    return None


def is_a_terminal_handle(held):
    if not isinstance(held, ast.Attribute) or held.attr not in TERMINAL_HANDLES:
        return False
    return isinstance(held.value, ast.Name) and held.value.id == "sys"


def writes_to_the_terminal(node):
    if isinstance(node.func, ast.Name):
        if node.func.id != "print":
            return False
        sent = destination_of(node)
        return sent is None or is_a_terminal_handle(sent)
    if not isinstance(node.func, ast.Attribute):
        return False
    if node.func.attr not in TERMINAL_WRITES:
        return False
    return is_a_terminal_handle(node.func.value)


def says_it_starts_the_program(node):
    if not isinstance(node, ast.If) or not isinstance(node.test, ast.Compare):
        return False
    test = node.test
    if len(test.ops) != 1 or not isinstance(test.ops[0], ast.Eq):
        return False
    sides = [test.left, test.comparators[0]]
    named = {one.id for one in sides if isinstance(one, ast.Name)}
    values = {one.value for one in sides if isinstance(one, ast.Constant)}
    return "__name__" in named and "__main__" in values


def starts_the_program(tree, path):
    if path.replace("\\", "/").split("/")[-1] == "__main__.py":
        return True
    return any(says_it_starts_the_program(node) for node in ast.walk(tree))


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


def a_logger_is_imported(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name.split(".")[0] in LOGGING_MODULES for alias in node.names):
                return True
        if isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in LOGGING_MODULES:
                return True
    return False


def is_a_string(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, str)


def value_baked_into(node):
    if isinstance(node, ast.JoinedStr):
        return any(isinstance(part, ast.FormattedValue) for part in node.values)
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mod, ast.Add)):
        return is_a_string(node.left) or is_a_string(node.right)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.attr == "format" and is_a_string(node.func.value)
    return False


def is_a_logger(held):
    if isinstance(held, ast.Name):
        return "log" in held.id.lower()
    if isinstance(held, ast.Attribute):
        return "log" in held.attr.lower()
    if isinstance(held, ast.Call):
        return is_a_logger(held.func)
    return False


def message_carries_a_value(node):
    if not isinstance(node.func, ast.Attribute):
        return False
    if node.func.attr not in LOG_LEVELS:
        return False
    if not is_a_logger(node.func.value):
        return False
    return any(value_baked_into(given) for given in node.args)


def violations_in(tree, in_a_test_file, is_where_it_starts):
    found = []
    a_logger_here = a_logger_is_imported(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if not is_where_it_starts and writes_to_the_terminal(node):
                found.append({"rule": PRINTS_ITS_OWN_OUTPUT, "line": node.lineno})
            if a_logger_here and message_carries_a_value(node):
                found.append({"rule": VALUE_IN_THE_MESSAGE, "line": node.lineno})
            continue
        if isinstance(node, ast.Raise):
            thrown = node.exc
            if isinstance(thrown, ast.Call):
                thrown = thrown.func
            if isinstance(thrown, ast.Name) and thrown.id in SAYS_NOTHING:
                found.append({"rule": UNNAMED_FAILURE, "line": node.lineno})
            continue
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
    hits = list(violations_in(tree, is_a_test_file(path), starts_the_program(tree, path)))
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
