import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifySumsubSignature } from "../security/sumsub";

const rawBody = Buffer.from('{"applicantId":"abc","type":"applicantReviewed"}', "utf8");
const secret = "test-secret";

describe("verifySumsubSignature", () => {
  it("verifies HMAC_SHA256_HEX signatures", () => {
    const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const ok = verifySumsubSignature(rawBody, "HMAC_SHA256_HEX", digest, secret);
    expect(ok).toBe(true);
  });

  it("verifies HMAC_SHA512_HEX signatures", () => {
    const digest = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    const ok = verifySumsubSignature(rawBody, "HMAC_SHA512_HEX", digest, secret);
    expect(ok).toBe(true);
  });

  it("verifies HMAC_SHA1_HEX signatures", () => {
    const digest = crypto.createHmac("sha1", secret).update(rawBody).digest("hex");
    const ok = verifySumsubSignature(rawBody, "HMAC_SHA1_HEX", digest, secret);
    expect(ok).toBe(true);
  });

  it("rejects invalid digest", () => {
    const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const ok = verifySumsubSignature(rawBody, "HMAC_SHA256_HEX", `${digest}00`, secret);
    expect(ok).toBe(false);
  });

  it("rejects unknown algorithm", () => {
    const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const ok = verifySumsubSignature(rawBody, "HMAC_SHA256_BASE64", digest, secret);
    expect(ok).toBe(false);
  });
});
