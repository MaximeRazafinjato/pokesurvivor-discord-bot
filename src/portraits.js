import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const CACHE_DIR = new URL("../cache/portraits/", import.meta.url);
const BASE_URL = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait";
const SIZE = 200;

async function download(dex, emotion) {
  const response = await fetch(`${BASE_URL}/${String(dex).padStart(4, "0")}/${emotion}.png`);
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

export async function portrait(dex, emotions = ["Normal"]) {
  await mkdir(CACHE_DIR, { recursive: true });
  for (const emotion of [...emotions, "Normal"]) {
    const file = new URL(`${dex}-${emotion}.png`, CACHE_DIR);
    const cached = await readFile(file).catch(() => null);
    if (cached) return `data:image/png;base64,${cached.toString("base64")}`;
    const original = await download(dex, emotion);
    if (!original) continue;
    const upscaled = await sharp(original).resize(SIZE, SIZE, { kernel: "nearest" }).png().toBuffer();
    await writeFile(file, upscaled);
    return `data:image/png;base64,${upscaled.toString("base64")}`;
  }
  return null;
}
