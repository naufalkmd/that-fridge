/// <reference types="node" />
import fs from "fs";
import path from "path";

/**
 * Guards against a navigation string pointing at a screen that no longer exists (a deleted screen is not a
 * type error while the generated route types are stale, and only shows up as an "unmatched route" on a device).
 */
const SRC = path.resolve(__dirname, "..");
const APP = path.join(SRC, "app");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
    return /\.(tsx?|ts)$/.test(e.name) ? [full] : [];
  });
}

/** Every top-level route the app defines: `app/x.tsx`, `app/(group)/x.tsx`, `app/x/index.tsx`, `app/x/[id].tsx`. */
function definedRoutes(): Set<string> {
  const routes = new Set<string>();
  const visit = (dir: string, prefix: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === "__tests__") continue;
        const groupless = /^\(.*\)$/.test(e.name);
        visit(path.join(dir, e.name), groupless ? prefix : `${prefix}/${e.name}`);
      } else if (/\.tsx$/.test(e.name)) {
        const name = e.name.replace(/\.tsx$/, "");
        if (name === "_layout") continue;
        routes.add(name === "index" ? prefix || "/" : `${prefix}/${name}`);
      }
    }
  };
  visit(APP, "");
  return routes;
}

/** "/eat?tab=recipes" -> "/eat"; "/item/42" -> "/item/[id]" is matched by its first segment below. */
function firstSegment(route: string): string {
  return "/" + route.replace(/^\//, "").split(/[?#/]/)[0];
}

describe("navigation targets", () => {
  const routes = definedRoutes();
  const known = new Set([...routes].map(firstSegment));
  const files = walk(SRC);

  test("the route table was read (sanity)", () => {
    expect(known.has("/calendar")).toBe(true);
    expect(known.has("/eat")).toBe(true);
    expect(known.has("/item")).toBe(true);
  });

  test("every literal route passed to push / navigate / replace or listed as a route exists", () => {
    const pattern = /(?:router\.(?:push|navigate|replace)\(\s*(?:\{\s*pathname:\s*)?|\broute:\s*|\bpathname:\s*|\bhref=)["'`](\/[A-Za-z0-9\-_/[\]?=&]*)/g;
    const missing: string[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(pattern)) {
        const target = firstSegment(m[1]);
        if (target !== "/" && !known.has(target)) missing.push(`${path.relative(SRC, file)}: ${m[1]}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
