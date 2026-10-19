import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const containsClientSecret = text => {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
    || /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/.test(text)
    || /\b(?:sb_secret_|re_|sk_)[A-Za-z0-9_-]{20,}\b/.test(text)) return true;
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(match[1], "base64url").toString()).role === "service_role") return true; }
    catch { /* Not a JWT payload. Public anon JWTs are allowed. */ }
  }
  return false;
};

const scan = async directory => {
  let files = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files += await scan(target);
    else if (/\.(?:js|css|html|json)$/.test(entry.name)) {
      files++;
      if (containsClientSecret(await readFile(target, "utf8"))) throw new Error(`Potential server credential in client artifact: ${target}`);
    }
  }
  return files;
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Client secret check passed for ${await scan(path.resolve("dist"))} text artifacts. No credential values are printed.`);
}
