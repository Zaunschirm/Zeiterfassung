import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const now = new Date();
const pad = (value) => String(value).padStart(2, "0");
const builtAt =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
  `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

const version = process.env.VITE_APP_VERSION || `${pkg.version} - ${builtAt}`;

fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.mkdirSync(path.join(root, "src"), { recursive: true });

fs.writeFileSync(
  path.join(root, "public", "app-version.json"),
  `${JSON.stringify({ version, builtAt }, null, 2)}\n`,
  "utf8"
);

fs.writeFileSync(
  path.join(root, "src", "generatedVersion.js"),
  `export const GENERATED_APP_VERSION = ${JSON.stringify(version)};\n`,
  "utf8"
);

console.log(`App-Version: ${version}`);
