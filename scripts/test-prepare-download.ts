import { createWriteStream } from "fs";
import { downloadToTempFile } from "../src/lib/ytdlp";
import { createDownloadSession, consumeDownloadSession } from "../src/lib/download-session";
import { createReadStream } from "fs";

async function main() {
  const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  const formatId = process.argv[2] ?? "yt-v-480";

  console.log("prepare...", formatId);
  const tmpPath = await downloadToTempFile(url, formatId, false);
  const token = createDownloadSession({
    url,
    formatId,
    merge: false,
    title: "test",
    ext: "mp4",
    tmpPath,
  });
  console.log("token", token);

  const session = consumeDownloadSession(token);
  if (!session) throw new Error("no session");

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream("scripts/prepare-out.mp4");
    createReadStream(session.tmpPath)
      .pipe(out)
      .on("finish", resolve)
      .on("error", reject);
  });

  console.log("OK prepare download flow");
}

main().catch((e) => {
  console.error("FAIL", e.message?.slice(0, 400) ?? e);
  process.exit(1);
});
