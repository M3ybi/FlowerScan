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
