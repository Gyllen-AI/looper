export const A_LANGUAGE_BY_EXTENSION: readonly (readonly [string, string])[] = [
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".mts", "TypeScript"],
  [".cts", "TypeScript"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".rs", "Rust"],
  [".py", "Python"],
  [".go", "Go"],
  [".rb", "Ruby"],
  [".java", "Java"],
  [".kt", "Kotlin"],
  [".swift", "Swift"],
  [".cs", "C#"],
  [".php", "PHP"],
  [".ex", "Elixir"],
  [".scala", "Scala"],
];

export const A_MANIFEST_BY_NAME: readonly (readonly [string, string])[] = [
  ["Cargo.toml", "Rust"],
  ["package.json", "TypeScript or JavaScript"],
  ["pyproject.toml", "Python"],
  ["requirements.txt", "Python"],
  ["go.mod", "Go"],
  ["Gemfile", "Ruby"],
  ["pom.xml", "Java"],
  ["build.gradle", "Java or Kotlin"],
  ["composer.json", "PHP"],
  ["mix.exs", "Elixir"],
];

export const THE_INTERFACE_SPEAKS: readonly string[] = [".tsx", ".jsx", ".css", ".scss", ".html", ".vue", ".svelte"];
