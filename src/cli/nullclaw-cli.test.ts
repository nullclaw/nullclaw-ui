// @ts-nocheck
// @vitest-environment node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..", "..");
const cliPath = resolve(rootDir, "bin", "nullclaw-chat-ui.js");

function runCli(args: string[]) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		timeout: 3000
	});
}

describe("nullclaw-chat-ui CLI argument parsing", () => {
	it("prints usage for help command", () => {
		const result = runCli(["help"]);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Usage:");
	});

	it("rejects non-numeric port values", () => {
		const result = runCli(["run", "--port", "3000abc"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Port must contain only digits");
	});

	it("rejects missing host value when next token is another option", () => {
		const result = runCli(["run", "--host", "--port", "4173"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Missing value for --host");
	});
});
