using System.Text.Json;
using Microsoft.CodeAnalysis.CSharp;

namespace LooperCsharp;

public static class Program
{
    private static readonly JsonSerializerOptions Compact = new() { WriteIndented = false };

    public static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--shape")
        {
            Say(new { error = "--shape is not built for C# yet" });
            return 0;
        }

        if (args.Length == 0)
        {
            Say(new { error = "looper-csharp needs a project root" });
            return 2;
        }

        var root = args[0];
        if (!Directory.Exists(root))
        {
            Say(new { error = $"no directory at {root}" });
            return 2;
        }

        var asked = args.Skip(1).ToArray();
        var files = asked.Length > 0 ? asked : Sources.Under(root).ToArray();

        var violations = new List<Violation>();
        var unreadable = new List<object>();

        foreach (var file in files)
        {
            if (!Sources.IsJudged(file)) continue;

            string text;
            try { text = File.ReadAllText(file); }
            catch (IOException error) { unreadable.Add(Unreadable(root, file, error.Message)); continue; }
            catch (UnauthorizedAccessException error) { unreadable.Add(Unreadable(root, file, error.Message)); continue; }

            var tree = CSharpSyntaxTree.ParseText(Sources.CSharpIn(file, text));
            violations.AddRange(Law.Judge(Relative(root, file), tree.GetRoot()));
        }

        Say(new
        {
            violations = violations
                .OrderBy(one => one.File, StringComparer.Ordinal)
                .ThenBy(one => one.Line)
                .ThenBy(one => one.Rule, StringComparer.Ordinal)
                .Select(one => new { rule = one.Rule, file = one.File, line = one.Line }),
            unreadable,
        });
        return 0;
    }

    private static object Unreadable(string root, string file, string detail) =>
        new { file = Relative(root, file), detail };

    private static string Relative(string root, string file)
    {
        try { return Path.GetRelativePath(root, file).Replace('\\', '/'); }
        catch (ArgumentException) { return file; }
    }

    private static void Say(object payload) =>
        Console.WriteLine(JsonSerializer.Serialize(payload, Compact));
}
