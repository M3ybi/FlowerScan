// CLI startup/status output can contain credentials. Emit fixed categories only.
export const supabaseFailureSummary = ({ stdout, stderr, error }) => {
  const output = `${stdout ?? ""}\n${stderr ?? ""}`;
  const categories = [
    ["MISSING_FUNCTION_ENTRYPOINT", /entrypoint[^\n]*(?:not found|does not exist|missing)|(?:not found|no such file)[^\n]*functions[/\\]/i],
    ["MISSING_ENVIRONMENT_VARIABLE", /environment variable[^\n]*(?:not set|missing|required)|env\([^\n]*\)[^\n]*(?:not set|missing)/i],
    ["INVALID_CONFIGURATION", /(?:invalid|failed to (?:parse|load|decode))[^\n]*config|config[^\n]*(?:invalid|required|not found)/i],
    ["CONTAINER_IMAGE_PULL_FAILED", /(?:pull|manifest|registry)[^\n]*(?:failed|denied|not found|unauthorized)|failed[^\n]*(?:pull|registry)/i],
    ["CONTAINER_HEALTH_FAILED", /(?:container|service)[^\n]*(?:unhealthy|not healthy|failed to start)|health[^\n]*(?:failed|timeout)/i],
    ["PORT_CONFLICT", /address already in use|port[^\n]*already allocated/i],
    ["DISK_CAPACITY", /no space left on device|disk quota exceeded/i],
    ["DATABASE_MIGRATION_FAILED", /(?:migration|sqlstate)[^\n]*(?:failed|error)|failed[^\n]*migration/i],
    ["DOCKER_UNAVAILABLE", /cannot connect to the docker daemon|docker[^\n]*not running/i],
    ["PERMISSION_DENIED", /permission denied|access denied/i],
  ].filter(([, pattern]) => pattern.test(output)).map(([category]) => category);
  if (error?.code === "ENOENT") categories.push("EXECUTABLE_UNAVAILABLE");
  if (error?.code === "ETIMEDOUT") categories.push("COMMAND_TIMEOUT");
  if (error?.code === "ENOBUFS") categories.push("OUTPUT_BUFFER_LIMIT");
  return categories.length ? [...new Set(categories)].join(",") : "UNCLASSIFIED_CLI_FAILURE";
};

export const supabaseFailureSignals = ({ stderr }) => {
  const tail = (stderr ?? "").slice(-8192).toLowerCase().replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/g, "");
  const vocabulary = ["error", "failed", "panic", "timeout", "connection", "refused", "network", "dns", "tls", "certificate", "forbidden", "unauthorized", "unexpected", "status", "download", "pull", "image", "manifest", "registry", "checksum", "digest", "denied", "permission", "missing", "invalid", "unsupported", "version", "migration", "database", "relation", "column", "constraint", "violates", "syntax", "extension", "vault", "pg_net", "pgcrypto", "auth", "storage", "postgres", "realtime", "analytics", "vector", "edge", "runtime", "function", "entrypoint", "module", "file", "directory", "exist", "found", "memory", "space", "health", "stopped", "exited", "port", "address", "unavailable", "resolve", "fetch", "404", "403", "429", "500", "502", "503", "eof"];
  vocabulary.push("layer", "extract", "unpack", "stat", "create", "read", "write", "open", "lstat", "symlink", "mkdir", "mount", "cannot", "not", "no", "such", "or", "client", "server", "response", "too", "many", "requests", "rate", "limit", "retry", "canceled", "context", "deadline", "exceeded", "message", "cause", "enoent", "package", "deno", "mismatch", "signature", "reference", "format", "algorithm", "sha256", "https");
  // Preserve at most 40 fixed tokens for context, never CLI text/identifiers.
  const allowed = new Set(vocabulary);
  return (tail.match(/\b[a-z0-9_]+\b/g) ?? []).filter(word => allowed.has(word)).slice(-40).join(",") || "NO_KNOWN_SIGNALS";
};
