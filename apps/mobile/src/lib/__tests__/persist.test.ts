// An in-memory stand-in for expo-file-system's File / Paths.
const mockFiles = new Map<string, string>();
let mockFailWrites = false;
jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : "/cache")).join("/");
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, "");
    }
    write(text: string) {
      if (mockFailWrites) throw new Error("disk full");
      mockFiles.set(this.uri, text);
    }
    async text() {
      return mockFiles.get(this.uri) ?? "";
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return { File, Paths: { cache: {} } };
});

import { __resetPersistForTests, clearCache, hydrate, readCache, writeCache } from "@/lib/persist";

beforeEach(() => {
  jest.useFakeTimers();
  mockFiles.clear();
  mockFailWrites = false;
  __resetPersistForTests();
});
afterEach(() => jest.useRealTimers());

const flush = () => jest.advanceTimersByTimeAsync(500);

describe("persist", () => {
  test("what was saved comes back for the same user", async () => {
    writeCache("fridges", "u1", [{ id: "1", name: "Home" }]);
    await flush();

    expect(await readCache("fridges", "u1")).toEqual([{ id: "1", name: "Home" }]);
  });

  test("another user's data is never returned", async () => {
    writeCache("fridges", "u1", [{ id: "1" }]);
    await flush();

    expect(await readCache("fridges", "u2")).toBeNull();
  });

  test("a missing, corrupt or old-version file is just a miss", async () => {
    expect(await readCache("nothing", "u1")).toBeNull();

    mockFiles.set("/cache/thatfridge-cache-fridges.json", "{not json");
    expect(await readCache("fridges", "u1")).toBeNull();

    mockFiles.set("/cache/thatfridge-cache-fridges.json", JSON.stringify({ v: 0, userId: "u1", data: [1] }));
    expect(await readCache("fridges", "u1")).toBeNull();
  });

  test("rapid saves collapse into one write of the latest value", async () => {
    writeCache("recipes", "u1", ["a"]);
    writeCache("recipes", "u1", ["b"]);
    writeCache("recipes", "u1", ["c"]);
    await flush();

    expect(await readCache("recipes", "u1")).toEqual(["c"]);
  });

  test("a failing disk never throws", async () => {
    mockFailWrites = true;
    writeCache("recipes", "u1", ["a"]);
    await expect(flush()).resolves.not.toThrow();
    expect(await readCache("recipes", "u1")).toBeNull();
  });

  test("clearCache removes everything, including a write still waiting", async () => {
    writeCache("fridges", "u1", [1]);
    await flush();
    writeCache("recipes", "u1", [2]); // not written yet

    clearCache();
    await flush();

    expect(await readCache("fridges", "u1")).toBeNull();
    expect(await readCache("recipes", "u1")).toBeNull();
  });

  test("hydrate applies cached data, but never over fresher network data or after stop()", async () => {
    writeCache("shopping", "u1", ["milk"]);
    await flush();

    const seen: string[][] = [];
    hydrate<string[]>("shopping", "u1", (d) => seen.push(d), () => false);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([["milk"]]);

    hydrate<string[]>("shopping", "u1", (d) => seen.push(d), () => true); // the network already answered
    const stopped = hydrate<string[]>("shopping", "u1", (d) => seen.push(d), () => false);
    stopped.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toHaveLength(1);
  });
});
