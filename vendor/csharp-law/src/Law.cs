using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace LooperCsharp;

public readonly record struct Violation(string Rule, string File, int Line);

public static class Law
{
    public static IEnumerable<Violation> Judge(string file, SyntaxNode root)
    {
        foreach (var node in root.DescendantNodes())
        {
            switch (node)
            {
                case CatchClauseSyntax held when Swallows(held):
                    yield return At("CS-ERROR:1", file, held);
                    break;

                case ThrowStatementSyntax { Expression: ObjectCreationExpressionSyntax made } when NamesNothing(made):
                    yield return At("CS-ERROR:2", file, made);
                    break;

                case PostfixUnaryExpressionSyntax held
                    when held.IsKind(SyntaxKind.SuppressNullableWarningExpression):
                    yield return At("CS-TYPE:1", file, held.OperatorToken);
                    break;

                case MethodDeclarationSyntax held when IsAsyncVoid(held):
                    yield return At("CS-TRUTH:1", file, held);
                    break;
            }
        }
    }

    private static Violation At(string rule, string file, SyntaxNode node) =>
        At(rule, file, node.GetLocation());

    private static Violation At(string rule, string file, SyntaxToken token) =>
        At(rule, file, token.GetLocation());

    private static Violation At(string rule, string file, Location where) =>
        new(rule, file, where.GetLineSpan().StartLinePosition.Line + 1);

    private static readonly string[] TheEverythingType = ["Exception", "SystemException"];

    private static bool Swallows(CatchClauseSyntax held)
    {
        if (held.Block.Statements.Count > 0) return false;
        if (held.Filter is not null) return false;
        if (held.Declaration is null) return true;
        return NamesNothing(held.Declaration.Type);
    }

    private static bool NamesNothing(TypeSyntax type) => type switch
    {
        IdentifierNameSyntax held => TheEverythingType.Contains(held.Identifier.ValueText),
        QualifiedNameSyntax held => TheEverythingType.Contains(held.Right.Identifier.ValueText),
        _ => false,
    };

    private static bool NamesNothing(ObjectCreationExpressionSyntax made) =>
        made.Type is IdentifierNameSyntax { Identifier.ValueText: "Exception" }
        || made.Type is QualifiedNameSyntax { Right.Identifier.ValueText: "Exception" };

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
}
