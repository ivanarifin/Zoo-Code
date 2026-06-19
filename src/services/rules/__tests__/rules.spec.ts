import fs from "fs/promises"
import * as path from "path"
import { tmpdir } from "node:os"

const mockHome = vi.hoisted(() => ({ path: "" }))

vi.mock("os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("os")>()
	return {
		...actual,
		homedir: () => mockHome.path,
	}
})

import { createRule, deleteRule, getRules, resolveRuleFile, shouldIncludeRuleFile } from "../rules"

describe("rules service", () => {
	let tempDir: string
	let homeDir: string
	let cwd: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(tmpdir(), "zoo-rules-"))
		homeDir = path.join(tempDir, "home")
		cwd = path.join(tempDir, "workspace")
		mockHome.path = homeDir
		await fs.mkdir(cwd, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("returns global and workspace generic rules with deterministic metadata", async () => {
		await fs.mkdir(path.join(homeDir, ".roo", "rules"), { recursive: true })
		await fs.mkdir(path.join(cwd, ".roo", "rules"), { recursive: true })
		await fs.writeFile(path.join(homeDir, ".roo", "rules", "global-rule.md"), "# Global")
		await fs.writeFile(path.join(cwd, ".roo", "rules", "workspace-rule.md"), "# Workspace")

		const rules = await getRules(cwd, { modes: [] })

		expect(rules).toEqual([
			expect.objectContaining({
				id: "global:generic:generic:global-rule.md",
				name: "global-rule.md",
				scope: "global",
				kind: "generic",
				relativePath: "global-rule.md",
			}),
			expect.objectContaining({
				id: "project:generic:generic:workspace-rule.md",
				name: "workspace-rule.md",
				scope: "project",
				kind: "generic",
				relativePath: "workspace-rule.md",
			}),
		])
	})

	it("returns mode-specific rules for provided modes", async () => {
		await fs.mkdir(path.join(cwd, ".roo", "rules-code"), { recursive: true })
		await fs.writeFile(path.join(cwd, ".roo", "rules-code", "code-rule.md"), "# Code")

		const rules = await getRules(cwd, { modes: [{ slug: "code", name: "Code" }] })

		expect(rules).toEqual([
			expect.objectContaining({
				id: "project:mode:code:code-rule.md",
				kind: "mode",
				modeSlug: "code",
				modeName: "Code",
				relativePath: "code-rule.md",
			}),
		])
	})

	it("creates global generic and workspace mode rules", async () => {
		const globalPath = await createRule(cwd, {
			scope: "global",
			kind: "generic",
			fileName: "global-new",
		})
		const projectPath = await createRule(cwd, {
			scope: "project",
			kind: "mode",
			modeSlug: "code",
			fileName: "workspace-new.md",
		})

		expect(globalPath).toBe(path.join(homeDir, ".roo", "rules", "global-new.md"))
		expect(projectPath).toBe(path.join(cwd, ".roo", "rules-code", "workspace-new.md"))
		expect(await fs.readFile(globalPath, "utf-8")).toContain("# global-new")
		expect(await fs.readFile(projectPath, "utf-8")).toContain("for code mode")
	})

	it("rejects path traversal, absolute paths, and invalid file names", async () => {
		await expect(createRule(cwd, { scope: "global", kind: "generic", fileName: "../bad" })).rejects.toThrow(
			"not a path",
		)
		await expect(
			createRule(cwd, { scope: "global", kind: "generic", fileName: path.join(tempDir, "bad.md") }),
		).rejects.toThrow("not a path")
		await expect(createRule(cwd, { scope: "global", kind: "generic", fileName: "Bad Name" })).rejects.toThrow(
			"lowercase letters",
		)
	})

	it("deletes only resolved files inside an allowed rules directory", async () => {
		const rulePath = await createRule(cwd, { scope: "project", kind: "generic", fileName: "delete-me" })

		await deleteRule(cwd, {
			scope: "project",
			kind: "generic",
			relativePath: "delete-me.md",
		})

		await expect(fs.stat(rulePath)).rejects.toMatchObject({ code: "ENOENT" })
		await expect(
			resolveRuleFile(cwd, { scope: "project", kind: "generic", relativePath: "../outside.md" }),
		).rejects.toThrow("Invalid rule path")
	})

	it("ignores non-markdown, cache, and system files", async () => {
		await fs.mkdir(path.join(cwd, ".roo", "rules"), { recursive: true })
		await fs.writeFile(path.join(cwd, ".roo", "rules", "good.md"), "# Good")
		await fs.writeFile(path.join(cwd, ".roo", "rules", "debug.log"), "log")
		await fs.writeFile(path.join(cwd, ".roo", "rules", ".DS_Store"), "store")
		await fs.writeFile(path.join(cwd, ".roo", "rules", "notes.txt"), "notes")

		const rules = await getRules(cwd, { modes: [] })

		expect(rules.map((rule) => rule.name)).toEqual(["good.md"])
		expect(shouldIncludeRuleFile("debug.log")).toBe(false)
		expect(shouldIncludeRuleFile("notes.txt")).toBe(false)
		expect(shouldIncludeRuleFile("good.md")).toBe(true)
	})

	it("round-trips symlinked directory rules through resolve and delete", async () => {
		const projectRulesDir = path.join(cwd, ".roo", "rules")
		const targetRulesDir = path.join(tempDir, "target-rules")
		const targetRulePath = path.join(targetRulesDir, "nested", "symlinked.md")
		await fs.mkdir(path.dirname(targetRulePath), { recursive: true })
		await fs.mkdir(projectRulesDir, { recursive: true })
		await fs.writeFile(targetRulePath, "# Symlinked")
		await fs.symlink(targetRulesDir, path.join(projectRulesDir, "linked"), "dir")

		const rules = await getRules(cwd, { modes: [] })
		const symlinkedRule = rules.find((rule) => rule.name === "symlinked.md")

		expect(symlinkedRule).toEqual(
			expect.objectContaining({
				isSymlink: true,
				relativePath: path.join("linked", "nested", "symlinked.md"),
				filePath: targetRulePath,
			}),
		)
		expect(symlinkedRule!.relativePath).not.toContain("..")

		const resolvedPath = await resolveRuleFile(cwd, {
			scope: "project",
			kind: "generic",
			relativePath: symlinkedRule!.relativePath,
		})
		expect(resolvedPath).toBe(path.join(projectRulesDir, "linked", "nested", "symlinked.md"))

		await deleteRule(cwd, {
			scope: "project",
			kind: "generic",
			relativePath: symlinkedRule!.relativePath,
		})
		await expect(fs.stat(targetRulePath)).rejects.toMatchObject({ code: "ENOENT" })
	})

	it("handles missing directories as empty lists", async () => {
		await expect(getRules(cwd, { modes: [] })).resolves.toEqual([])
	})
})
