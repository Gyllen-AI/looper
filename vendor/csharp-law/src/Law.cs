using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace LooperCsharp;

public readonly record struct Violation(string Rule, string File, int Line);

public static class Law
{
    private static readonly string[] TheEverythingType = ["Exception", "SystemException"];

    private static readonly string[] MadeUpAnswers = ["null", "default", "0", "false", "\"\"", "string.Empty"];

    private static readonly string[] CommentKinds = [];

    private const string AllowMarker = "looper:allow-secret";

    private static readonly System.Text.RegularExpressions.Regex ALicence =
        new("copyright|SPDX|licen[cs]e", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    public static IEnumerable<Violation> Judge(string file, SyntaxNode root, bool startsTheProgram, bool aProgramWroteIt)
    {
        if (!aProgramWroteIt)
        {
            var text = root.SyntaxTree.GetText();
            foreach (var trivia in root.DescendantTrivia(descendIntoTrivia: true))
            {
                if (!IsAComment(trivia)) continue;
                var at = trivia.GetLocation().GetLineSpan().StartLinePosition;
                if (at.Line == 0 && ALicence.IsMatch(trivia.ToFullString())) continue;
                if (IsTheAllowance(trivia, text, at.Character)) continue;
                yield return At("CS-DEAD:2", file, trivia.GetLocation());
            }
        }

        foreach (var node in root.DescendantNodes())
        {
            switch (node)
            {
                case CatchClauseSyntax held:
                    var said = JudgeCatch(held);
                    if (said is not null) yield return At(said, file, held);
                    break;

                case ThrowStatementSyntax { Expression: ObjectCreationExpressionSyntax made } when NamesNothing(made.Type):
                    yield return At("CS-ERROR:2", file, made);
                    break;

                case MethodDeclarationSyntax held when IsAsyncVoid(held):
                    yield return At("CS-TRUTH:1", file, held.Identifier);
                    break;

                case MemberAccessExpressionSyntax held when !startsTheProgram && TakesTheOutput(held):
                    yield return At("CS-LOG:1", file, held);
                    break;

                case InterpolatedStringExpressionSyntax held when PastesIntoAQuery(held):
                    yield return At("CS-SECURITY:1", file, held);
                    break;

                case BinaryExpressionSyntax held when held.IsKind(SyntaxKind.AddExpression) && GluesAQuery(held):
                    yield return At("CS-SECURITY:1", file, held);
                    break;
            }
        }
    }

    private static bool IsAComment(SyntaxTrivia trivia) =>
        trivia.IsKind(SyntaxKind.SingleLineCommentTrivia)
        || trivia.IsKind(SyntaxKind.MultiLineCommentTrivia)
        || trivia.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia)
        || trivia.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia);

    private static bool IsTheAllowance(SyntaxTrivia trivia, Microsoft.CodeAnalysis.Text.SourceText text, int column)
    {
        if (!trivia.IsKind(SyntaxKind.SingleLineCommentTrivia)) return false;
        var written = trivia.ToFullString().TrimStart('/').Trim();
        if (written != AllowMarker) return false;
        var line = text.Lines[trivia.GetLocation().GetLineSpan().StartLinePosition.Line].ToString();
        return line[..Math.Min(column, line.Length)].Trim().Length > 0;
    }

    private static Violation At(string rule, string file, SyntaxNode node) => At(rule, file, node.GetLocation());

    private static Violation At(string rule, string file, SyntaxToken token) => At(rule, file, token.GetLocation());

    private static Violation At(string rule, string file, Location where) =>
        new(rule, file, where.GetLineSpan().StartLinePosition.Line + 1);

    private static string? JudgeCatch(CatchClauseSyntax held)
    {
        var body = held.Block.Statements;

        if (body.Count == 0)
        {
            if (held.Filter is not null) return null;
            if (held.Declaration is null) return "CS-ERROR:1";
            return NamesNothing(held.Declaration.Type) ? "CS-ERROR:1" : null;
        }

        if (Throws(held.Block)) return null;
        if (WritesItDown(held.Block)) return null;
        if (held.Filter is not null) return null;
        if (held.Declaration is not null && !NamesNothing(held.Declaration.Type)) return null;
        if (IsATryMethod(held)) return null;

        if (body.All(one => one is ReturnStatementSyntax made && IsMadeUp(made.Expression)))
            return "CS-ERROR:3";

        return LooksAtWhatItCaught(held) ? null : "CS-ERROR:4";
    }

    private static bool IsATryMethod(SyntaxNode inside)
    {
        var held = inside.Ancestors().OfType<MethodDeclarationSyntax>().FirstOrDefault();
        if (held is null) return false;
        if (!held.Identifier.ValueText.StartsWith("Try", StringComparison.Ordinal)) return false;
        return held.ReturnType is PredefinedTypeSyntax { Keyword.RawKind: (int)SyntaxKind.BoolKeyword };
    }

    private static bool Throws(SyntaxNode body) =>
        body.DescendantNodes().OfType<ThrowStatementSyntax>().Any()
        || body.DescendantNodes().OfType<ThrowExpressionSyntax>().Any();

    private static bool WritesItDown(SyntaxNode body) =>
        body.DescendantNodes().OfType<InvocationExpressionSyntax>().Any(call => NameOf(call).Contains("Log", StringComparison.Ordinal));

    private static bool LooksAtWhatItCaught(CatchClauseSyntax held)
    {
        var caught = held.Declaration?.Identifier;
        if (caught is null || caught.Value.IsKind(SyntaxKind.None) || caught.Value.ValueText.Length == 0) return false;
        var named = caught.Value.ValueText;
        return held.Block.DescendantNodes().OfType<IdentifierNameSyntax>()
            .Any(one => one.Identifier.ValueText == named);
    }

    private static bool IsMadeUp(ExpressionSyntax? made) => made switch
    {
        null => false,
        LiteralExpressionSyntax held => MadeUpAnswers.Contains(held.Token.Text),
        ObjectCreationExpressionSyntax held => (held.ArgumentList?.Arguments.Count ?? 0) == 0,
        ImplicitObjectCreationExpressionSyntax held => held.ArgumentList.Arguments.Count == 0,
        CollectionExpressionSyntax held => held.Elements.Count == 0,
        InvocationExpressionSyntax held => NameOf(held) == "Empty",
        MemberAccessExpressionSyntax held => held.Name.Identifier.ValueText is "Empty",
        DefaultExpressionSyntax => true,
        _ => false,
    };

    private static bool NamesNothing(TypeSyntax type) => type switch
    {
        IdentifierNameSyntax held => TheEverythingType.Contains(held.Identifier.ValueText),
        QualifiedNameSyntax held => TheEverythingType.Contains(held.Right.Identifier.ValueText),
        _ => false,
    };

    private static bool IsAsyncVoid(MethodDeclarationSyntax held)
    {
        if (!held.Modifiers.Any(SyntaxKind.AsyncKeyword)) return false;
        if (held.ReturnType is not PredefinedTypeSyntax predefined) return false;
        if (!predefined.Keyword.IsKind(SyntaxKind.VoidKeyword)) return false;
        return !LooksLikeAnEventHandler(held);
    }

    private static bool LooksLikeAnEventHandler(MethodDeclarationSyntax held)
    {
        var parameters = held.ParameterList.Parameters;
        if (parameters.Count != 2) return false;
        var second = parameters[1].Type?.ToString() ?? "";
        return second.EndsWith("EventArgs", StringComparison.Ordinal);
    }

    private static string NameOf(InvocationExpressionSyntax call) => call.Expression switch
    {
        MemberAccessExpressionSyntax held => held.Name.Identifier.ValueText,
        IdentifierNameSyntax held => held.Identifier.ValueText,
        GenericNameSyntax held => held.Identifier.ValueText,
        MemberBindingExpressionSyntax held => held.Name.Identifier.ValueText,
        _ => "",
    };


    private static bool TakesTheOutput(MemberAccessExpressionSyntax held)
    {
        var root = held;
        while (root.Expression is MemberAccessExpressionSyntax inner) root = inner;
        if (root.Expression is not IdentifierNameSyntax named) return false;
        if (named.Identifier.ValueText != "Console") return false;
        return held.Parent is InvocationExpressionSyntax;
    }

    private static readonly string[][] TellsItIsAQuery =
    [
        ["select ", " from "], ["insert into"], ["delete from"], ["update ", " set "], [" from ", " where "],
    ];

    private static bool ReadsAsAQuery(string text)
    {
        var lowered = text.ToLowerInvariant();
        return TellsItIsAQuery.Any(all => all.All(lowered.Contains));
    }

    private static bool PastesIntoAQuery(InterpolatedStringExpressionSyntax held)
    {
        if (!held.Contents.OfType<InterpolationSyntax>().Any()) return false;
        var written = string.Concat(held.Contents.OfType<InterpolatedStringTextSyntax>().Select(one => one.TextToken.ValueText));
        return ReadsAsAQuery(written);
    }

    private static bool GluesAQuery(BinaryExpressionSyntax held)
    {
        if (held.Parent is BinaryExpressionSyntax { RawKind: (int)SyntaxKind.AddExpression }) return false;
        var parts = held.DescendantNodesAndSelf().ToList();
        var written = string.Concat(parts.OfType<LiteralExpressionSyntax>()
            .Where(one => one.IsKind(SyntaxKind.StringLiteralExpression))
            .Select(one => one.Token.ValueText));
        if (!ReadsAsAQuery(written)) return false;
        return parts.OfType<IdentifierNameSyntax>().Any();
    }
}
