import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivePath = path.join(root, "node_modules", "harmonyos-sans", "HarmonyOS Sans.zip");
const outputDirectory = path.join(root, "src", "renderer", "generated-fonts");
const fontFiles = [
  {
    archivePath: "HarmonyOS Sans/HarmonyOS_Sans_SC/HarmonyOS_Sans_SC_Regular.ttf",
    outputName: "HarmonyOS_Sans_SC_Regular.ttf"
  },
  {
    archivePath: "HarmonyOS Sans/HarmonyOS_Sans_SC/HarmonyOS_Sans_SC_Bold.ttf",
    outputName: "HarmonyOS_Sans_SC_Bold.ttf"
  }
];

function readZipEntry(archive, wantedPath) {
  const endOfCentralDirectory = 0x06054b50;
  const centralDirectoryHeader = 0x02014b50;
  const localFileHeader = 0x04034b50;
  const minimumEndOffset = Math.max(0, archive.length - 0xffff - 22);
  let endOffset = -1;

  for (let offset = archive.length - 22; offset >= minimumEndOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === endOfCentralDirectory) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset === -1) {
    throw new Error("Could not read the HarmonyOS Sans ZIP directory.");
  }

  let offset = archive.readUInt32LE(endOffset + 16);
  while (archive.readUInt32LE(offset) === centralDirectoryHeader) {
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const fileName = archive.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    if (fileName === wantedPath) {
      if (archive.readUInt32LE(localHeaderOffset) !== localFileHeader) {
        throw new Error(`Invalid ZIP entry for ${wantedPath}.`);
      }
      const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const contentStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedContent = archive.subarray(contentStart, contentStart + compressedSize);

      if (compressionMethod === 0) {
        return compressedContent;
      }
      if (compressionMethod === 8) {
        return inflateRawSync(compressedContent);
      }
      throw new Error(`Unsupported ZIP compression method for ${wantedPath}.`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`Could not find ${wantedPath} in harmonyos-sans.`);
}

export async function prepareHarmonyOsFonts() {
  const archive = await readFile(archivePath);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    fontFiles.map(async (font) => {
      const content = readZipEntry(archive, font.archivePath);
      await writeFile(path.join(outputDirectory, font.outputName), content);
    })
  );
}
