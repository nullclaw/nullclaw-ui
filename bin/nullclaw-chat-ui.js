#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const buildDir = resolve(rootDir, "build");
const packageJsonPath = resolve(rootDir, "package.json");
const packageVersion = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;

const mimeTypes = {
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".woff": "font/woff",
	".woff2": "font/woff2"
};

function printHelp() {
	console.log(`nullclaw-chat-ui ${packageVersion}

Usage:
  nullclaw-chat-ui run [--host <host>] [--port <port>]
  nullclaw-chat-ui version
  nullclaw-chat-ui help

Commands:
  run      Serve the built UI from the local package.
  version  Print the installed package version.
  help     Show this help text.

Options for "run":
  --host   Bind address (default: 127.0.0.1)
  --port   Port number (default: 4173)
`);
}

function parseRunOptions(args) {
	const options = { host: "127.0.0.1", port: 4173 };

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--host") {
			const value = args[i + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --host");
			}
			options.host = value;
			i += 1;
		} else if (arg === "--port") {
			const value = args[i + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --port");
			}
			if (!/^\d+$/.test(value)) {
				throw new Error("Port must contain only digits");
			}
			const parsed = Number.parseInt(value, 10);
			options.port = parsed;
			i += 1;
		} else if (arg === "-h" || arg === "--help") {
			options.help = true;
		} else {
			throw new Error(`Unknown option: ${arg}`);
		}
	}

	if (!options.help) {
		if (!options.host) {
			throw new Error("Missing value for --host");
		}
		if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
			throw new Error("Port must be an integer between 1 and 65535");
		}
	}

	return options;
}

function resolveStaticFile(requestPath) {
	let decodedPath = "/";
	try {
		decodedPath = decodeURIComponent(requestPath || "/");
	} catch {
		return null;
	}

	const cleanPath = decodedPath.split("?")[0].split("#")[0].replace(/^\/+/, "");
	const normalizedPath = normalize(cleanPath);
	if (normalizedPath.includes("\0") || normalizedPath.startsWith("..")) {
		return null;
	}

	let candidate = join(buildDir, normalizedPath);
	try {
		if (statSync(candidate).isDirectory()) {
			candidate = join(candidate, "index.html");
		}
	} catch {
		// Keep candidate as-is; we'll fall through to SPA fallback below.
	}

	if (existsSync(candidate)) {
		return candidate;
	}

	return join(buildDir, "index.html");
}

function serveBuiltUi({ host, port }) {
	const entryHtml = join(buildDir, "index.html");
	if (!existsSync(entryHtml)) {
		console.error("Build output was not found.");
		console.error("Run `npm run build` in this package, then retry `nullclaw-chat-ui run`.");
		process.exit(1);
	}

	const server = createServer((req, res) => {
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.statusCode = 405;
			res.setHeader("Allow", "GET, HEAD");
			res.end("Method Not Allowed");
			return;
		}

		const filePath = resolveStaticFile(req.url || "/");
		if (!filePath) {
			res.statusCode = 400;
			res.end("Bad Request");
			return;
		}

		const ext = extname(filePath).toLowerCase();
		res.statusCode = 200;
		res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");

		if (req.method === "HEAD") {
			res.end();
			return;
		}

		const stream = createReadStream(filePath);
		stream.on("error", () => {
			res.statusCode = 500;
			res.end("Internal Server Error");
		});
		stream.pipe(res);
	});

	server.listen(port, host, () => {
		console.log(`nullclaw-chat-ui running at http://${host}:${port}`);
		console.log("Press Ctrl+C to stop.");
	});

	const shutdown = () => {
		server.close(() => process.exit(0));
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

function main() {
	const [command, ...rest] = process.argv.slice(2);

	if (!command || command === "help" || command === "-h" || command === "--help") {
		printHelp();
		return;
	}

	if (command === "version" || command === "-v" || command === "--version") {
		console.log(packageVersion);
		return;
	}

	if (command === "run") {
		const options = parseRunOptions(rest);
		if (options.help) {
			printHelp();
			return;
		}
		serveBuiltUi(options);
		return;
	}

	console.error(`Unknown command: ${command}`);
	console.error("Use `nullclaw-chat-ui help` for usage.");
	process.exit(1);
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
