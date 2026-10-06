/** Binary PGM (P5) read/write, the one image format Node can handle with no dependency. */
import fs from "node:fs";

export function readPGM(file) {
  const buf = fs.readFileSync(file);
  // header: P5 <ws> width <ws> height <ws> maxval <single ws>
  let pos = 0;
  const tokens = [];
  while (tokens.length < 4) {
    while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]))) pos++;
    if (buf[pos] === 0x23) {
      while (pos < buf.length && buf[pos] !== 0x0a) pos++;
      continue;
    }
    let start = pos;
    while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos]))) pos++;
    tokens.push(buf.toString("ascii", start, pos));
  }
  pos++;
  if (tokens[0] !== "P5") throw new Error(`${file}: not a binary PGM`);
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  const data = new Uint8Array(buf.buffer, buf.byteOffset + pos, width * height);
  return { width, height, data: new Uint8Array(data) };
}

export function writePGM(file, image) {
  const header = Buffer.from(`P5\n${image.width} ${image.height}\n255\n`, "ascii");
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(image.data.buffer, image.data.byteOffset, image.width * image.height)]));
}
