import { describe, expect, it } from "bun:test";
import {
  ballToken,
  classifyFrame,
  emptyGame,
  parseBallToken,
  type Frame,
} from "./duckpin";

const frame = (...pins: (number | [number, true])[]): Frame => ({
  balls: pins.map((p) => (Array.isArray(p) ? { pins: p[0], isSplit: true } : { pins: p })),
});

const tokens = (f: Frame, i = 0) => [0, 1, 2].map((b) => ballToken(f, i, b));

describe("ballToken — 10-box vs spare notation", () => {
  it("8|1|1 shows numeric ball 3 and is a 10-box", () => {
    const f = frame(8, 1, 1);
    expect(tokens(f)).toEqual(["8", "1", "1"]);
    expect(classifyFrame(f, false)).toBe("ten_box");
  });

  it("7|2|1 shows numeric ball 3 and is a 10-box", () => {
    const f = frame(7, 2, 1);
    expect(tokens(f)).toEqual(["7", "2", "1"]);
    expect(classifyFrame(f, false)).toBe("ten_box");
  });

  it("6|3|1 shows numeric ball 3 and is a 10-box", () => {
    const f = frame(6, 3, 1);
    expect(tokens(f)).toEqual(["6", "3", "1"]);
    expect(classifyFrame(f, false)).toBe("ten_box");
  });

  it("9|/ shows a spare on ball 2 with no ball 3", () => {
    const f = frame(9, 1);
    expect(tokens(f)).toEqual(["9", "/", ""]);
    expect(classifyFrame(f, false)).toBe("spare");
  });

  it("7s|/ is a converted split spare", () => {
    const f = frame([7, true], 3);
    expect(tokens(f)).toEqual(["7s", "/", ""]);
    expect(classifyFrame(f, false)).toBe("spare");
  });

  it("7s|2|1 is a split 10-box with numeric ball 3", () => {
    const f = frame([7, true], 2, 1);
    expect(tokens(f)).toEqual(["7s", "2", "1"]);
    expect(classifyFrame(f, false)).toBe("ten_box");
  });

  it("shows - for zero on ball 3", () => {
    expect(tokens(frame(4, 2, 0))).toEqual(["4", "2", "-"]);
  });

  it("round-trips a saved 10-box without turning ball 3 into /", () => {
    const frames = emptyGame();
    frames[2] = frame(8, 1, 1);
    expect(ballToken(frames[2]!, 2, 2)).toBe("1");
  });
});

describe("ballToken — 10th frame racks reset", () => {
  it("X|7|/ keeps spare notation on the bonus rack's second ball", () => {
    const f = frame(10, 7, 3);
    expect(tokens(f, 9)).toEqual(["X", "7", "/"]);
  });

  it("9|/|X shows a strike on the fresh bonus rack", () => {
    const f = frame(9, 1, 10);
    expect(tokens(f, 9)).toEqual(["9", "/", "X"]);
  });

  it("8|1|1 in the 10th is still numeric", () => {
    expect(tokens(frame(8, 1, 1), 9)).toEqual(["8", "1", "1"]);
  });
});

describe("parseBallToken", () => {
  const frames = () => {
    const g = emptyGame();
    g[0] = frame(8, 1);
    return g;
  };

  it("rejects / on ball 3 of a normal frame", () => {
    const res = parseBallToken("/", frames(), 0, 2);
    expect(res.ball).toBeNull();
    expect(res.error).toBeTruthy();
  });

  it("accepts numeric ball 3 that clears the rack", () => {
    const res = parseBallToken("1", frames(), 0, 2);
    expect(res.ball).toEqual({ pins: 1 });
  });

  it("rejects / on ball 1", () => {
    expect(parseBallToken("/", emptyGame(), 0, 0).ball).toBeNull();
  });

  it("accepts / on ball 2", () => {
    const g = emptyGame();
    g[0] = frame(9);
    expect(parseBallToken("/", g, 0, 1).ball).toEqual({ pins: 1 });
  });
});
