import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmbeddedRequest } from "@/lib/embed/is-embedded-request";

describe("isEmbeddedRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows all requests in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const headers = new Headers({ "sec-fetch-dest": "document" });
    expect(isEmbeddedRequest(headers)).toBe(true);
  });

  it("blocks direct navigation in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = new Headers({
      host: "app.dunnconsulting.org",
      "sec-fetch-dest": "document",
    });
    expect(isEmbeddedRequest(headers)).toBe(false);
  });

  it("allows iframe loads in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = new Headers({
      host: "app.dunnconsulting.org",
      "sec-fetch-dest": "iframe",
    });
    expect(isEmbeddedRequest(headers)).toBe(true);
  });

  it("allows cross-site referer embed fallback in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = new Headers({
      host: "app.dunnconsulting.org",
      referer: "https://www.dunnconsulting.org/",
      "x-forwarded-proto": "https",
    });
    expect(isEmbeddedRequest(headers)).toBe(true);
  });

  it("honors ALLOW_WIDGET_PREVIEW in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_WIDGET_PREVIEW", "true");
    const headers = new Headers({ "sec-fetch-dest": "document" });
    expect(isEmbeddedRequest(headers)).toBe(true);
  });
});
