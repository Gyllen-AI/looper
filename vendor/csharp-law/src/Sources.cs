namespace LooperCsharp;

public static class Sources
{
    private static readonly string[] NotLookedIn =
    [
        "node_modules", "dist", ".git", "target", "vendor",
        ".venv", "venv", "site-packages", "__pycache__", "bin", "obj",
    ];

    public static bool IsJudged(string path) =>
        path.EndsWith(".cs", StringComparison.Ordinal) || path.EndsWith(".razor", StringComparison.Ordinal);

    public static IEnumerable<string> Under(string root)
    {
        var pending = new Stack<string>();
        pending.Push(root);

        while (pending.Count > 0)
        {
            var at = pending.Pop();
            string[] entries;
            try { entries = Directory.GetFileSystemEntries(at); }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }

            foreach (var entry in entries)
            {
                var name = Path.GetFileName(entry);
                if (Directory.Exists(entry))
                {
                    if (NotLookedIn.Contains(name) || name.StartsWith('.')) continue;
                    pending.Push(entry);
                    continue;
                }
                if (IsJudged(entry)) yield return entry;
            }
        }
    }

    public static string CSharpIn(string path, string text) =>
        path.EndsWith(".razor", StringComparison.Ordinal) ? OnlyTheCodeBlocks(text) : text;

    private static bool OpensACodeBlock(string line)
    {
        var trimmed = line.TrimStart();
        return trimmed.StartsWith("@code", StringComparison.Ordinal)
            || trimmed.StartsWith("@functions", StringComparison.Ordinal);
    }

    private static string OnlyTheCodeBlocks(string text)
    {
        var lines = text.ReplaceLineEndings("\n").Split('\n');
        var kept = new string[lines.Length];
        var depth = 0;
        var inside = false;

        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];

            if (!inside)
            {
                if (OpensACodeBlock(line) && line.Contains('{'))
                {
                    inside = true;
                    depth = Depth(line);
                    kept[i] = "class __Razor" + line[(line.IndexOf('{'))..];
                    continue;
                }
                kept[i] = "";
                continue;
            }

            depth += Depth(line);
            kept[i] = line;
            if (depth <= 0) inside = false;
        }

        return string.Join("\n", kept);
    }

    private static int Depth(string line)
    {
        var open = 0;
        var close = 0;
        foreach (var c in line)
        {
            if (c == '{') open++;
            if (c == '}') close++;
        }
        return open - close;
    }
}
