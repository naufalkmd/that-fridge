import {
  buildSweepResults,
  boxToRect,
  cropStyle,
  fitFrame,
  flyStart,
  gridCells,
  padBox,
  sameItem,
  sceneSpace,
  shotLabel,
  spaceLocation,
  staggerStep,
  type Box,
  type SweepDetection,
  type SweepShotInput,
} from "../sweep";

describe("fitFrame", () => {
  it("fits a portrait photo by height and centers it", () => {
    const f = fitFrame(3 / 4, { x: 0, y: 0, w: 400, h: 400 });
    expect(f).toEqual({ x: 50, y: 0, w: 300, h: 400 });
  });

  it("fits a landscape photo by width", () => {
    const f = fitFrame(2, { x: 10, y: 20, w: 400, h: 400 });
    expect(f).toEqual({ x: 10, y: 120, w: 400, h: 200 });
  });

  it("falls back to 3:4 for a bad aspect", () => {
    expect(fitFrame(0, { x: 0, y: 0, w: 300, h: 1000 }).h).toBe(400);
  });
});

describe("boxToRect", () => {
  it("maps thousandths onto the frame", () => {
    const r = boxToRect([100, 200, 600, 700], { x: 10, y: 20, w: 300, h: 400 });
    expect(r).toEqual({ x: 70, y: 60, w: 150, h: 200 });
  });
});

describe("padBox", () => {
  it("grows the box and clamps to the photo", () => {
    expect(padBox([0, 100, 500, 300], 0.1)).toEqual([0, 80, 550, 320]);
  });
});

describe("cropStyle", () => {
  // A square photo makes the maths easy to check by hand.
  it("scales the photo so the box covers the tile", () => {
    const box: Box = [250, 250, 750, 750]; // the middle half
    const s = cropStyle(box, 1, 100);
    expect(s.width).toBeCloseTo(200);
    expect(s.height).toBeCloseTo(200);
    expect(s.left).toBeCloseTo(-50);
    expect(s.top).toBeCloseTo(-50);
  });

  it("centers the longer side of a tall box", () => {
    const box: Box = [0, 0, 1000, 500]; // left half, full height
    const s = cropStyle(box, 1, 100);
    // the 0.5-wide side fits the tile, so the photo is 200 wide; the 1-tall side is trimmed
    expect(s.width).toBeCloseTo(200);
    expect(s.left).toBeCloseTo(0);
    expect(s.top).toBeCloseTo(-50);
  });

  it("accounts for the photo's aspect", () => {
    const box: Box = [0, 0, 1000, 1000];
    const s = cropStyle(box, 0.5, 100); // twice as tall as wide
    expect(s.width).toBeCloseTo(100);
    expect(s.height).toBeCloseTo(200);
    expect(s.top).toBeCloseTo(-50);
  });
});

describe("gridCells", () => {
  it("returns nothing for no items", () => {
    expect(gridCells(0, { x: 0, y: 0, w: 100, h: 100 }, 5, 8, 72)).toEqual([]);
  });

  it("caps the cell size and centers a short row", () => {
    const cells = gridCells(2, { x: 0, y: 0, w: 400, h: 400 }, 5, 10, 72);
    expect(cells[0].w).toBe(72);
    expect(cells[0].x).toBe((400 - (72 * 2 + 10)) / 2);
    expect(cells[1].x).toBe(cells[0].x + 82);
  });

  it("shrinks cells so every row fits the height", () => {
    const cells = gridCells(20, { x: 0, y: 0, w: 400, h: 100 }, 5, 4, 72);
    const last = cells[cells.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(100.0001);
  });
});

describe("staggerStep", () => {
  it("keeps long lists within the total", () => {
    expect(staggerStep(1)).toBe(0);
    expect(staggerStep(3)).toBe(110);
    expect(staggerStep(31, 900)).toBe(30);
  });
});

describe("flyStart", () => {
  it("centers the tile on the box and scales to its longer side", () => {
    expect(flyStart({ x: 0, y: 0, w: 200, h: 100 }, 50)).toEqual({ x: 75, y: 25, scale: 4 });
  });
});

describe("spaces", () => {
  it("labels the next shot by space", () => {
    expect(shotLabel("pantry", 2)).toBe("Pantry · shot 3");
  });

  it("maps a scene to a space", () => {
    expect(sceneSpace("freezer")).toBe("freezer");
    expect(sceneSpace("counter")).toBe("groceries");
    expect(sceneSpace("unclear")).toBeNull();
    expect(sceneSpace(null)).toBeNull();
  });

  it("stores a haul by the model's guess and everything else by its space", () => {
    expect(spaceLocation("pantry", "fridge")).toBe("pantry");
    expect(spaceLocation("groceries", "freezer")).toBe("freezer");
    expect(spaceLocation("groceries", null)).toBe("fridge");
  });
});

describe("sameItem", () => {
  it("matches plurals and extra words", () => {
    expect(sameItem("Eggs", "egg")).toBe(true);
    expect(sameItem("Milk", "Whole milk")).toBe(true);
    expect(sameItem("Greek yogurt", "yogurt")).toBe(true);
  });

  it("doesn't match different things or tiny words", () => {
    expect(sameItem("Milk", "Oat cookies")).toBe(false);
    expect(sameItem("Oat milk", "Almond milk")).toBe(false);
    expect(sameItem("Ox", "Ox tail")).toBe(false);
  });
});

describe("buildSweepResults", () => {
  let n = 0;
  const det = (name: string, over: Partial<SweepDetection> = {}): SweepDetection => ({
    id: `d${n++}`,
    name,
    icon: "generic",
    box: null,
    confidence: 0.9,
    condition: null,
    storage: null,
    ...over,
  });
  const shot = (id: string, space: SweepShotInput["space"], items: SweepDetection[], status: SweepShotInput["status"] = "done"): SweepShotInput => ({
    id,
    space,
    status,
    items,
  });

  it("merges the same item across shots of one space and counts repeats in a photo as quantity", () => {
    const { rows } = buildSweepResults(
      [
        shot("a", "fridge", [det("Yogurt"), det("Yogurt"), det("Milk")]),
        shot("b", "fridge", [det("yogurts", { box: [0, 0, 500, 500] })]),
        shot("c", "freezer", [det("Yogurt")]),
      ],
      [],
    );
    const fridgeYogurt = rows.find((r) => r.space === "fridge" && r.name === "Yogurt")!;
    expect(fridgeYogurt.qty).toBe(2);
    expect(fridgeYogurt.seenIn).toBe(2);
    expect(fridgeYogurt.shotId).toBe("b"); // the placed view is used for the crop
    expect(rows.filter((r) => r.name === "Yogurt" || r.name === "yogurts")).toHaveLength(2); // freezer stays separate
    expect(rows.find((r) => r.space === "freezer")!.location).toBe("freezer");
  });

  it("matches tracked items at the same location and lists the unseen ones as missing", () => {
    const tracked = [
      { id: "t1", name: "Whole milk", location: "fridge" as const },
      { id: "t2", name: "Butter", location: "fridge" as const },
      { id: "t3", name: "Rice", location: "pantry" as const },
      { id: "t4", name: "Milk", location: "freezer" as const },
    ];
    const { rows, missing } = buildSweepResults([shot("a", "fridge", [det("Milk"), det("Cheese")])], tracked);

    expect(rows.find((r) => r.name === "Milk")!.match?.id).toBe("t1");
    expect(rows.find((r) => r.name === "Cheese")!.match).toBeNull();
    // Only the scanned space is checked: butter is missing, the pantry rice and freezer milk aren't.
    expect(missing.map((m) => m.id)).toEqual(["t2"]);
  });

  it("never compares a grocery haul and reports empty shots", () => {
    const tracked = [{ id: "t1", name: "Milk", location: "fridge" as const }];
    const { rows, missing, emptyShots } = buildSweepResults(
      [
        shot("a", "groceries", [det("Milk", { storage: "fridge" })]),
        shot("b", "pantry", []),
        shot("c", "fridge", [det("Eggs")], "scanning"),
      ],
      tracked,
    );

    expect(rows[0].match).toBeNull();
    expect(rows[0].location).toBe("fridge");
    expect(missing).toEqual([]); // the fridge shot isn't done, so the fridge wasn't checked
    expect(emptyShots).toEqual(["b"]);
  });

  it("takes a receipt line's quantity and merges a barcode scan of the same thing", () => {
    const { rows } = buildSweepResults(
      [
        { ...shot("r", "groceries", [det("Yogurt", { qty: 4, storage: "fridge" })]), source: "receipt" },
        {
          ...shot("b", "groceries", [
            det("Yogurt", { category: "dairy", shelfLifeDays: 14, storage: "fridge" }),
            det("Oat milk", { shelfLifeDays: 30, storage: "pantry" }),
            det("Oat milk", { shelfLifeDays: 30, storage: "pantry" }),
          ]),
          source: "barcode",
        },
      ],
      [],
    );
    const yogurt = rows.find((r) => r.name === "Yogurt")!;
    expect(yogurt.qty).toBe(4); // the receipt's count, not 4 + 1
    expect(yogurt.source).toBe("receipt");
    expect(yogurt.category).toBe("dairy"); // filled in from the barcode
    expect(yogurt.shelfLifeDays).toBe(14);
    const oat = rows.find((r) => r.name === "Oat milk")!;
    expect(oat.qty).toBe(2); // scanned twice
    expect(oat.location).toBe("pantry");
    expect(oat.source).toBe("barcode");
  });

  it("treats a tracked item with no location as in the fridge", () => {
    const { rows } = buildSweepResults([shot("a", "fridge", [det("Jam")])], [{ id: "t1", name: "Jam" }]);
    expect(rows[0].match?.id).toBe("t1");
  });
});
