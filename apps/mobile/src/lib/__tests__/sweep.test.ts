import {
  boxToRect,
  cropStyle,
  fitFrame,
  flyStart,
  gridCells,
  padBox,
  shotLabel,
  staggerStep,
  type Box,
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

describe("shotLabel", () => {
  it("names the first shots and counts after that", () => {
    expect(shotLabel(0)).toBe("Door");
    expect(shotLabel(7)).toBe("Shot 8");
  });
});
