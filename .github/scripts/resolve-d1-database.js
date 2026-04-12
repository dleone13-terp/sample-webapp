#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

function fail(message, details) {
  console.error(message);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function runWrangler(args) {
  const result = spawnSync(
    "npm",
    ["exec", "--workspace=backend", "--", "wrangler", ...args],
    { encoding: "utf8" }
  );

  if (result.error) {
    fail(`Failed to run wrangler ${args.join(" ")}`, result.error.message);
  }

  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();

  if (result.status !== 0) {
    fail(
      `Wrangler command failed: wrangler ${args.join(" ")}`,
      [
        stderr ? `stderr:\n${stderr}` : "",
        stdout ? `stdout:\n${stdout}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return { stdout, stderr };
}

function parseJsonOutput(jsonText, commandLabel) {
  const trimmed = (jsonText || "").trim();
  if (!trimmed) {
    fail(`Wrangler ${commandLabel} returned empty output when JSON was expected`);
  }

  const startsLikeJson = trimmed.startsWith("[") || trimmed.startsWith("{");
  if (!startsLikeJson) {
    fail(
      `Wrangler ${commandLabel} did not return JSON output`,
      `Output:\n${trimmed}`
    );
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    fail(
      `Failed to parse Wrangler ${commandLabel} JSON output`,
      `${error.message}\nOutput:\n${trimmed}`
    );
  }
}

function resolveDatabaseIdByName(databaseName) {
  const { stdout, stderr } = runWrangler(["d1", "list", "--json"]);
  if (stderr) {
    console.error(stderr);
  }

  const data = parseJsonOutput(stdout, "d1 list --json");
  if (!Array.isArray(data)) {
    fail("Unexpected Wrangler d1 list --json response shape", `Output:\n${stdout}`);
  }

  const match = data.find((db) => db && db.name === databaseName);
  return match && typeof match.uuid === "string" ? match.uuid : "";
}

function main() {
  const databaseName = process.argv[2];
  const shouldCreate = process.argv.includes("--create");

  if (!databaseName) {
    fail("Usage: node .github/scripts/resolve-d1-database.js <database-name> [--create]");
  }

  let databaseId = resolveDatabaseIdByName(databaseName);

  if (!databaseId && shouldCreate) {
    const created = runWrangler(["d1", "create", databaseName]);
    if (created.stdout) {
      console.error(created.stdout);
    }
    if (created.stderr) {
      console.error(created.stderr);
    }
    databaseId = resolveDatabaseIdByName(databaseName);
  }

  if (!databaseId) {
    fail(`Could not resolve D1 database id for ${databaseName}`);
  }

  process.stdout.write(databaseId);
}

main();
