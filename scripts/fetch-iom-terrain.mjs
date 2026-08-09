import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const zoom = 11;
const tileSize = 256;
const bounds = {
  west: -4.84,
  east: -4.28,
  north: 54.43,
  south: 54.02,
};
const outputPath = path.resolve("public/iom-terrain.png");
const sourcePath = path.resolve("public/iom-terrain-source.json");
const tileTemplate = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

function longitudeToWorldX(longitude) {
  return ((longitude + 180) / 360) * 2 ** zoom;
}

function latitudeToWorldY(latitude) {
  const radians = (latitude * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** zoom;
}

const worldBounds = {
  left: longitudeToWorldX(bounds.west),
  right: longitudeToWorldX(bounds.east),
  top: latitudeToWorldY(bounds.north),
  bottom: latitudeToWorldY(bounds.south),
};
const tiles = {
  left: Math.floor(worldBounds.left),
  right: Math.floor(worldBounds.right),
  top: Math.floor(worldBounds.top),
  bottom: Math.floor(worldBounds.bottom),
};

const tileRequests = [];
for (let y = tiles.top; y <= tiles.bottom; y += 1) {
  for (let x = tiles.left; x <= tiles.right; x += 1) {
    const url = tileTemplate
      .replace("{z}", String(zoom))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
    tileRequests.push({ x, y, url });
  }
}

const downloadedTiles = await Promise.all(
  tileRequests.map(async (tile) => {
    const response = await fetch(tile.url, {
      headers: { "user-agent": "Real-Isle-terrain-builder/1.0" },
    });
    if (!response.ok) throw new Error(`Terrain tile ${tile.url} returned ${response.status}`);
    return { ...tile, input: Buffer.from(await response.arrayBuffer()) };
  }),
);

const mosaicWidth = (tiles.right - tiles.left + 1) * tileSize;
const mosaicHeight = (tiles.bottom - tiles.top + 1) * tileSize;
const mosaic = await sharp({
  create: {
    width: mosaicWidth,
    height: mosaicHeight,
    channels: 4,
    background: { r: 0, g: 128, b: 0, alpha: 1 },
  },
})
  .composite(
    downloadedTiles.map((tile) => ({
      input: tile.input,
      left: (tile.x - tiles.left) * tileSize,
      top: (tile.y - tiles.top) * tileSize,
    })),
  )
  .png()
  .toBuffer();

const crop = {
  left: Math.round((worldBounds.left - tiles.left) * tileSize),
  top: Math.round((worldBounds.top - tiles.top) * tileSize),
  width: Math.round((worldBounds.right - worldBounds.left) * tileSize),
  height: Math.round((worldBounds.bottom - worldBounds.top) * tileSize),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await sharp(mosaic)
  .extract(crop)
  .png({ compressionLevel: 9, palette: false })
  .toFile(outputPath);

await writeFile(
  sourcePath,
  `${JSON.stringify(
    {
      dataset: "Mapzen Terrain Tiles",
      encoding: "Terrarium",
      registry: "https://registry.opendata.aws/terrain-tiles/",
      tileTemplate,
      zoom,
      bounds,
      generatedAt: new Date().toISOString(),
      output: {
        width: crop.width,
        height: crop.height,
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Wrote ${outputPath} (${crop.width} x ${crop.height}) from ${downloadedTiles.length} tiles.`);
