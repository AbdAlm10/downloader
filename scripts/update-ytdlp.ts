import YTDlpWrap from "yt-dlp-wrap";
import fs from "fs";
import path from "path";

const binDir = path.join(process.cwd(), ".bin");
const binName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const binPath = path.join(binDir, binName);

fs.mkdirSync(binDir, { recursive: true });
await YTDlpWrap.downloadFromGithub(binPath, undefined, process.platform);
fs.chmodSync(binPath, 0o755);
console.log(`Updated ${binPath}`);
