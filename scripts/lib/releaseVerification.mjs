import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

export const npmCommand = (args) => process.platform === "win32"
  ? { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `npm ${args.join(" ")}`] }
  : { command: "npm", args };

// Only repository-owned command arguments enter npmCommand. No credentials,
// operator input or URLs are composed into a shell command.
export const executeVerification = ({ command, args, log, env = process.env, cwd = process.cwd(), blockedExitCodes = [] }) => new Promise(resolve => {
  const stream = log ? createWriteStream(log) : null;
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const consume = data => stream?.write(data);
  child.stdout.on("data", consume); child.stderr.on("data", consume);
  let error = false;
  child.on("error", () => { error = true; });
  child.on("close", code => {
    const result = { status: !error && code === 0 ? "PASS" : blockedExitCodes.includes(code) && !error ? "BLOCKED" : "FAIL", exitCode: code ?? 1 };
    if (stream) stream.end(() => resolve(result)); else resolve(result);
  });
});
export const verificationExitCode = (results, localOnly = false) => results.some(item => item.status === "FAIL") ? 1
  : !localOnly && results.some(item => item.status === "BLOCKED" || item.status === "NOT_RUN") ? 2 : 0;
