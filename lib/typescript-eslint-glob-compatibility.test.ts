import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const load = createRequire(import.meta.url);
const configLoad = createRequire(load.resolve("eslint-config-next"));
const parserPath = configLoad.resolve("@typescript-eslint/parser");
const parser = configLoad("@typescript-eslint/parser") as {
  parseForESLint: (code: string, options: Record<string, unknown>) => {
    services: { program?: unknown };
  };
};
const estreeLoad = createRequire(createRequire(parserPath).resolve("@typescript-eslint/typescript-estree"));

describe("TypeScript parser with patched minimatch", () => {
  let fixture: string;
  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), "fortylove-parser-glob-"));
    mkdirSync(join(fixture, "src"));
    writeFileSync(join(fixture, "src", "member.ts"), "export const member = true;");
    writeFileSync(join(fixture, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    for (const name of ["tool.config.ts", ".tool.config.ts", "unlisted.ts"]) {
      writeFileSync(join(fixture, name), "export const enabled = true;");
    }
  });
  afterAll(() => rmSync(fixture, { recursive: true, force: true }));

  const parse = (name: string) => parser.parseForESLint("export const enabled = true;", {
    filePath: join(fixture, name),
    tsconfigRootDir: fixture,
    projectService: { allowDefaultProject: ["*.config.ts"], defaultProject: "tsconfig.json" },
  });

  it("resolves the fixed major only for the parser's named API", () => {
    expect(estreeLoad("minimatch/package.json").version).toMatch(/^11\./);
    expect(typeof estreeLoad("minimatch").minimatch).toBe("function");
  });

  it("accepts config files including dotfiles through the actual project service", () => {
    expect(parse("tool.config.ts").services.program).toBeDefined();
    expect(parse(".tool.config.ts").services.program).toBeDefined();
  });

  it("still rejects files outside the configured project and allowed glob", () => {
    expect(() => parse("unlisted.ts")).toThrow(/not found by the project service/i);
  });
});
