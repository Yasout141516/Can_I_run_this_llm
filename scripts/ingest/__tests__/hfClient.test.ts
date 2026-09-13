// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestError, fetchConfigJson, fetchModelInfo } from "../hfClient";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) =>
  vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status: 200 }));

describe("fetchModelInfo", () => {
  it("asks for blobs, because file sizes are absent without them", async () => {
    const fetchMock = ok({ id: "x/y", gated: false, siblings: [] });
    vi.stubGlobal("fetch", fetchMock);
    await fetchModelInfo("x/y");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://huggingface.co/api/models/x/y?blobs=true");
  });

  it("names the repo and status when the API refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(fetchModelInfo("x/y")).rejects.toThrow(IngestError);
    await expect(fetchModelInfo("x/y")).rejects.toThrow(/x\/y.*404/s);
  });

  it("throws if siblings is not an array", async () => {
    vi.stubGlobal("fetch", ok({ id: "x/y", gated: false, siblings: "not-an-array" }));
    await expect(fetchModelInfo("x/y")).rejects.toThrow(IngestError);
    await expect(fetchModelInfo("x/y")).rejects.toThrow(/x\/y/s);
  });

  it("throws if id is missing", async () => {
    vi.stubGlobal("fetch", ok({ gated: false, siblings: [] }));
    await expect(fetchModelInfo("x/y")).rejects.toThrow(IngestError);
    await expect(fetchModelInfo("x/y")).rejects.toThrow(/x\/y/s);
  });

  it("throws if id is not a string", async () => {
    vi.stubGlobal("fetch", ok({ id: 123, gated: false, siblings: [] }));
    await expect(fetchModelInfo("x/y")).rejects.toThrow(IngestError);
    await expect(fetchModelInfo("x/y")).rejects.toThrow(/x\/y/s);
  });
});

describe("fetchConfigJson", () => {
  it("reads config.json from the resolve endpoint", async () => {
    const fetchMock = ok({ num_hidden_layers: 32 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchConfigJson("a/b")).resolves.toEqual({ num_hidden_layers: 32 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://huggingface.co/a/b/resolve/main/config.json");
  });

  it("fails loudly on a gated 401 rather than returning an empty object", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await expect(fetchConfigJson("meta-llama/x")).rejects.toThrow(IngestError);
  });
});
