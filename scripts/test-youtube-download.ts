import { createWriteStream } from "fs";
import { createDownloadStream } from "../src/lib/ytdlp";

async function main() {
  const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  const formatId = process.argv[2] ?? "yt-v-480";

  const stream = await createDownloadStream(url, formatId, false);
  const out = createWriteStream("scripts/test-output.mp4");

  await new Promise<void>((resolve, reject) => {
    let bytes = 0;
    stream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
    });
    stream.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => {
      console.log(`OK format=${formatId} bytes=${bytes}`);
      resolve();
    });
    stream.pipe(out);
  });
}

main().catch((e) => {
  console.error("FAIL", e.message?.slice(0, 500) ?? e);
  process.exit(1);
});
