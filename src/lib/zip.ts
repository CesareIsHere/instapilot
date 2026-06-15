// Minimal zero-dependency ZIP writer (STORE method — no compression).
// Good enough for bundling a handful of PNG/HTML/JSON files for download.
// Avoids pulling in `archiver`/`adm-zip`, which the network policy may block.

export interface ZipEntry {
  /** Path inside the archive (use forward slashes). */
  name: string;
  data: Buffer;
}

const CRC_TABLE: number[] = (() => {
  const table: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Convert a JS Date to a packed DOS date/time pair. */
function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** Build a ZIP archive from in-memory entries. */
export function createZip(entries: ZipEntry[]): Buffer {
  const { time, date } = dosDateTime(new Date());
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4);         // version needed
    local.writeUInt16LE(0x0800, 6);     // flags (UTF-8 filename)
    local.writeUInt16LE(0, 8);          // compression method = store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);      // compressed size
    local.writeUInt32LE(size, 22);      // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);         // extra field length
    localParts.push(local, nameBuf, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central dir header signature
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0x0800, 8);     // flags (UTF-8)
    central.writeUInt16LE(0, 10);         // compression = store
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);         // extra field length
    central.writeUInt16LE(0, 32);         // comment length
    central.writeUInt16LE(0, 34);         // disk number start
    central.writeUInt16LE(0, 36);         // internal attributes
    central.writeUInt32LE(0, 38);         // external attributes
    central.writeUInt32LE(offset, 42);    // offset of local header
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + entry.data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);          // end of central dir signature
  end.writeUInt16LE(0, 4);                    // disk number
  end.writeUInt16LE(0, 6);                    // disk with central dir
  end.writeUInt16LE(entries.length, 8);       // entries on this disk
  end.writeUInt16LE(entries.length, 10);      // total entries
  end.writeUInt32LE(centralDir.length, 12);   // central dir size
  end.writeUInt32LE(localData.length, 16);    // central dir offset
  end.writeUInt16LE(0, 20);                   // comment length

  return Buffer.concat([localData, centralDir, end]);
}
