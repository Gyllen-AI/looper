export type CsharpCase = {
  readonly rule: string;
  readonly name: string;
  readonly code: string;
  readonly expect: "fires" | "silent";
  readonly file?: string;
};

export const CSHARP_CASES: readonly CsharpCase[] = [
  { rule: "CS-ERROR:1", name: "a catch with nothing in it", expect: "fires",
    code: `class C {\n    void F() {\n        try { G(); } catch { }\n    }\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "a catch holding only a comment, which handles nothing", expect: "fires",
    code: `class C {\n    void F() {\n        try { G(); } catch { /* never mind */ }\n    }\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "a catch that names the failure and still drops it", expect: "fires",
    code: `using System;\nclass C {\n    void F() {\n        try { G(); } catch (Exception) { }\n    }\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "an empty catch spread over three lines", expect: "fires",
    code: `class C {\n    void F() {\n        try { G(); }\n        catch\n        {\n        }\n    }\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "logged where somebody will read it", expect: "silent",
    code: `using System;\nclass C {\n    void F() {\n        try { G(); } catch (Exception error) { Log(error); }\n    }\n    void G() { }\n    void Log(Exception e) { }\n}\n` },
  { rule: "CS-ERROR:1", name: "thrown onward", expect: "silent",
    code: `using System;\nclass C {\n    void F() {\n        try { G(); } catch (Exception) { throw; }\n    }\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "turned into a failure that has a name", expect: "silent",
    code: `using System;\nclass Missing : Exception { }\nclass C {\n    void F() {\n        try { G(); } catch (Exception error) { throw new Missing(); }\n    }\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "an empty method body is not a catch", expect: "silent",
    code: `class C {\n    void F() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "a try with a finally and no catch at all", expect: "silent",
    code: `class C {\n    void F() {\n        try { G(); } finally { H(); }\n    }\n    void G() { }\n    void H() { }\n}\n` },

  { rule: "CS-ERROR:1", name: "naming the one failure being ignored, which is the C# spelling of suppress()", expect: "silent",
    code: `using Microsoft.JSInterop;\nclass C {\n    void F() {\n        try { G(); } catch (JSDisconnectedException) { }\n    }\n    void G() { }\n}\nnamespace Microsoft.JSInterop { class JSDisconnectedException : System.Exception { } }\n` },
  { rule: "CS-ERROR:1", name: "a when filter naming which failure is expected", expect: "silent",
    code: `using System;\nclass C {\n    void F() {\n        try { G(); } catch (Exception error) when (Expected(error)) { }\n    }\n    void G() { }\n    bool Expected(Exception e) => true;\n}\n` },
  { rule: "CS-ERROR:1", name: "a named failure that is still not the everything type", expect: "silent",
    code: `using System;\nclass C {\n    void F() {\n        try { G(); } catch (OperationCanceledException) { }\n    }\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "SystemException is as wide as Exception and names as little", expect: "fires",
    code: `using System;\nclass C {\n    void F() {\n        try { G(); } catch (SystemException) { }\n    }\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "the everything type with a name on it is still the everything type", expect: "fires",
    code: `using System;\nclass C {\n    void F() {\n        try { G(); } catch (Exception error) { }\n    }\n    void G() { }\n}\n` },

  { rule: "CS-ERROR:2", name: "a failure that says nothing about itself", expect: "fires",
    code: `using System;\nclass C {\n    void F() { throw new Exception("something went wrong"); }\n}\n` },
  { rule: "CS-ERROR:2", name: "the same failure written out in full", expect: "fires",
    code: `class C {\n    void F() { throw new System.Exception("something went wrong"); }\n}\n` },
  { rule: "CS-ERROR:2", name: "a failure a caller can tell apart", expect: "silent",
    code: `using System;\nclass C {\n    void F() { throw new InvalidOperationException("no dataset open"); }\n}\n` },
  { rule: "CS-ERROR:2", name: "a failure named for this codebase", expect: "silent",
    code: `using System;\nclass DatasetMissing : Exception { }\nclass C {\n    void F() { throw new DatasetMissing(); }\n}\n` },

  { rule: "CS-TYPE:1", name: "the null check silenced on a value", expect: "fires",
    code: `class C {\n    string? Name() => null;\n    int F() => Name()!.Length;\n}\n` },
  { rule: "CS-TYPE:1", name: "the null check silenced on the way into a variable", expect: "fires",
    code: `class C {\n    string? Name() => null;\n    void F() { string held = Name()!; }\n}\n` },
  { rule: "CS-TYPE:1", name: "asking first instead of silencing", expect: "silent",
    code: `class C {\n    string? Name() => null;\n    int F() => Name()?.Length ?? 0;\n}\n` },
  { rule: "CS-TYPE:1", name: "not, the everyday one, is a different operator", expect: "silent",
    code: `class C {\n    bool F(bool ready) => !ready;\n}\n` },
  { rule: "CS-TYPE:1", name: "two things being different is not a suppression", expect: "silent",
    code: `class C {\n    bool F(int a, int b) => a != b;\n}\n` },

  { rule: "CS-TRUTH:1", name: "work started that nobody can wait for", expect: "fires",
    code: `using System.Threading.Tasks;\nclass C {\n    async void F() { await Task.Delay(1); }\n}\n` },
  { rule: "CS-TRUTH:1", name: "the same, with an argument", expect: "fires",
    code: `using System.Threading.Tasks;\nclass C {\n    async void F(string name) { await Task.Delay(1); }\n}\n` },
  { rule: "CS-TRUTH:1", name: "a Task a caller can wait for", expect: "silent",
    code: `using System.Threading.Tasks;\nclass C {\n    async Task F() { await Task.Delay(1); }\n}\n` },
  { rule: "CS-TRUTH:1", name: "an event handler, where the runtime demands this shape", expect: "silent",
    code: `using System;\nusing System.Threading.Tasks;\nclass C {\n    async void OnClick(object sender, EventArgs e) { await Task.Delay(1); }\n}\n` },
  { rule: "CS-TRUTH:1", name: "not async at all", expect: "silent",
    code: `class C {\n    void F() { }\n}\n` },

  { rule: "CS-ERROR:1", name: "a swallowed failure inside a Razor code block", expect: "fires", file: "Held.razor",
    code: `<div>@Name</div>\n\n@code {\n    string Name = "";\n\n    void F() {\n        try { G(); } catch { }\n    }\n\n    void G() { }\n}\n` },
  { rule: "CS-TRUTH:1", name: "work nobody can wait for, inside a Razor code block", expect: "fires", file: "Held.razor",
    code: `<div>@Name</div>\n\n@code {\n    string Name = "";\n\n    async void F() { await System.Threading.Tasks.Task.Delay(1); }\n}\n` },
  { rule: "CS-ERROR:1", name: "a clean Razor code block", expect: "silent", file: "Held.razor",
    code: `<div>@Name</div>\n\n@code {\n    string Name = "";\n\n    void F() {\n        try { G(); } catch (System.Exception error) { System.Console.Error.WriteLine(error); }\n    }\n\n    void G() { }\n}\n` },
  { rule: "CS-ERROR:1", name: "markup outside the code block is not read, and this records that", expect: "silent", file: "Held.razor",
    code: `<button @onclick="@(() => { try { G(); } catch { } })">go</button>\n\n@code {\n    void G() { }\n}\n` },
];
