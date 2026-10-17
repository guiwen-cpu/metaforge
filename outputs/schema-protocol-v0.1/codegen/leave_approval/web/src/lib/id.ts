const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomChars(count: number): string {
  const bytes = new Uint8Array(count);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < count; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (let index = 0; index < count; index += 1) {
    out += ALPHABET[bytes[index] % 32];
  }
  return out;
}

function encodeTime(now: number): string {
  let value = Math.floor(now);
  let out = "";
  for (let index = 0; index < 10; index += 1) {
    const mod = value % 32;
    out = ALPHABET[mod] + out;
    value = (value - mod) / 32;
  }
  return out;
}

/** 26 位 Crockford Base32 ULID，与后端 idType=ulid 对齐。 */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + randomChars(16);
}

export function extOf(name: string): string {
  const index = name.lastIndexOf(".");
  if (index < 0 || index === name.length - 1) return "bin";
  return name.slice(index + 1).toLowerCase();
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  return cleaned.slice(-80) || "file";
}
