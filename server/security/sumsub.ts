import crypto from "crypto";

const SUPPORTED_ALGOS = new Map<string, "sha256" | "sha512" | "sha1">([
  ["HMAC_SHA256_HEX", "sha256"],
  ["HMAC_SHA512_HEX", "sha512"],
  ["HMAC_SHA1_HEX", "sha1"],
]);

export function verifySumsubSignature(
  rawBody: Buffer,
  algHeader: string | undefined,
  digestHeader: string | undefined,
  secret: string | undefined
): boolean {
  if (!rawBody || !Buffer.isBuffer(rawBody)) return false;
  if (!algHeader || !digestHeader || !secret) return false;

  const algo = SUPPORTED_ALGOS.get(algHeader.toUpperCase());
  if (!algo) return false;

  const provided = digestHeader.trim();
  if (!/^[0-9a-fA-F]+$/.test(provided) || provided.length % 2 !== 0) {
    return false;
  }

  const expected = crypto.createHmac(algo, secret).update(rawBody).digest("hex");
  if (expected.length !== provided.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex")
    );
  } catch {
    return false;
  }
}
