import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const load = createRequire(import.meta.url);
const pluginRoot = dirname(load.resolve("@next/eslint-plugin-next/package.json"));
const pluginLoad = createRequire(join(pluginRoot, "package.json"));
const { getRootDirs } = pluginLoad("./dist/utils/get-root-dirs.js") as {
  getRootDirs: (context: { cwd: string; settings: { next?: { rootDir: string | string[] } } }) => string[];
};

// This exercises the plugin's actual dependency resolution, not a replacement
// helper. Keep the scoped override under review when upgrading the plugin.
describe("Next ESLint glob dependency compatibility", () => {
  let fixture: string;

  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), "fortylove-lint-glob-"));
    mkdirSync(join(fixture, "apps", "member", "pages"), { recursive: true });
    mkdirSync(join(fixture, "apps", "admin"), { recursive: true });
    writeFileSync(join(fixture, "apps", "not-a-directory.ts"), "");
    writeFileSync(join(fixture, "apps", "member", "pages", "login.tsx"), "");
  });

  afterAll(() => rmSync(fixture, { recursive: true, force: true }));

  const roots = (rootDir?: string | string[]) =>
    getRootDirs({ cwd: fixture, settings: rootDir ? { next: { rootDir } } : {} })
      .map((directory) => resolve(directory))
      .sort();

  it("uses the braces-free replacement only inside the Next plugin", () => {
    expect(pluginLoad("fast-glob/package.json").name).toBe("tinyglobby");
    expect(typeof pluginLoad("fast-glob").globSync).toBe("function");
  });

  it("keeps the default and explicit project roots", () => {
    expect(roots()).toEqual([fixture]);
    expect(roots(join(fixture, "apps", "member"))).toEqual([join(fixture, "apps", "member")]);
    expect(roots(join(fixture, "missing"))).toEqual([]);
  });

  it("expands directory globs without including files", () => {
    expect(roots(join(fixture, "apps", "*"))).toEqual([
      join(fixture, "apps", "admin"),
      join(fixture, "apps", "member"),
    ]);
  });

  it("supports root arrays, brace patterns and Windows separators", () => {
    const expected = [join(fixture, "apps", "admin"), join(fixture, "apps", "member")];
    expect(roots(expected)).toEqual(expected);
    expect(roots(join(fixture, "apps", "{admin,member}"))).toEqual(expected);
    expect(roots(join(fixture, "apps", "*").replaceAll("/", "\\"))).toEqual(expected);
  });

  it("still detects internal HTML links with an explicit Next root", async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: {
        files: ["**/*.tsx"],
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { "@next/next": load("@next/eslint-plugin-next") },
        rules: { "@next/next/no-html-link-for-pages": "error" },
        settings: { next: { rootDir: join(fixture, "apps", "*") } },
      },
    });
    const [result] = await eslint.lintText(
      'export default function Page() { return <a href="/login">Login</a>; }',
      { filePath: "app/lint-dependency-probe.tsx" },
    );
    expect(result.messages.some((message) => message.ruleId === "@next/next/no-html-link-for-pages"))
      .toBe(true);
    const [valid] = await eslint.lintText(
      'export default function Page() { return <Link href="/login">Login</Link>; }',
      { filePath: "app/lint-dependency-probe.tsx" },
    );
    expect(valid.messages).toEqual([]);
  });
});
