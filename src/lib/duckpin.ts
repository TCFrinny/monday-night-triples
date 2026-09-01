/**
 * DUCKPIN scoring engine. NOT tenpin.
 *
 * Rules implemented:
 * - Frames 1-9 allow up to THREE balls.
 * - Strike  = 10 pins on ball 1. Balls 2/3 are not thrown. Bonus = next two balls.
 * - Spare   = pins cleared on ball 2. Ball 3 is not thrown. Bonus = next one ball.
 * - 10-box  = all ten pins cleared using ball 3. Worth 10 pins, NO bonus.
 *             Statistically distinct from a spare.
 * - Open    = sum of actual pins across up to 3 balls.
 * - 10th frame: a strike earns two bonus balls, a spare earns one bonus ball,
 *   all thrown inside the 10th frame (max 3 balls). Clearing all ten on ball 3
 *   is only a 10-box and earns NO bonus ball.
 */

export type FrameOutcome = "strike" | "spare" | "ten_box" | "open" | "incomplete";

export interface Ball {
  pins: number;
  isSplit?: boolean;
}

export interface Frame {
  balls: Ball[];
}

export interface ScoredFrame {
  frameNumber: number;
  balls: Ball[];
  outcome: FrameOutcome;
  frameScore: number;
  cumulative: number | null;
  complete: boolean;
  isSplit: boolean;
  splitConverted: boolean;
  firstBallPins: number | null;
}

export interface ScoredGame {
  frames: ScoredFrame[];
  total: number;
  complete: boolean;
}

export const FRAME_COUNT = 10;

export function emptyGame(): Frame[] {
  return Array.from({ length: FRAME_COUNT }, () => ({ balls: [] }));
}

/** Pins still standing before the given ball index within a frame. */
export function pinsRemaining(frame: Frame, ballIndex: number, isTenth: boolean): number {
  const balls = frame.balls.slice(0, ballIndex);
  if (!isTenth) {
    return 10 - balls.reduce((a, b) => a + b.pins, 0);
  }
  // 10th frame: the rack resets after any clear.
  let standing = 10;
  for (const b of balls) {
    standing -= b.pins;
    if (standing === 0) standing = 10;
  }
  return standing;
}

export function frameIsComplete(frame: Frame, isTenth: boolean): boolean {
  const b = frame.balls;
  if (isTenth) return b.length >= 3;
  if (b.length === 0) return false;
  if (b[0]!.pins === 10) return true; // strike: balls 2 & 3 are not thrown
  if (b.length >= 2 && b[0]!.pins + b[1]!.pins === 10) return true; // spare
  return b.length >= 3;
}

export function classifyFrame(frame: Frame, isTenth: boolean): FrameOutcome {
  const b = frame.balls;
  if (b.length === 0) return "incomplete";
  if (b[0]!.pins === 10) return "strike";
  if (b.length >= 2 && b[0]!.pins + b[1]!.pins === 10) return "spare";
  if (b.length >= 3) {
    const sum = b[0]!.pins + b[1]!.pins + b[2]!.pins;
    // In the 10th, ball 3 after a strike/spare is a bonus ball, handled above.
    return sum === 10 ? "ten_box" : "open";
  }
  return isTenth ? "incomplete" : "incomplete";
}

/** All balls after a given frame, flattened in throwing order (for bonuses). */
function ballsAfter(frames: Frame[], frameIndex: number): Ball[] {
  const out: Ball[] = [];
  for (let i = frameIndex + 1; i < frames.length; i++) out.push(...frames[i]!.balls);
  return out;
}

export function scoreGame(frames: Frame[]): ScoredGame {
  const scored: ScoredFrame[] = [];
  let running = 0;
  let runningKnown = true;

  for (let i = 0; i < FRAME_COUNT; i++) {
    const frame = frames[i] ?? { balls: [] };
    const isTenth = i === FRAME_COUNT - 1;
    const outcome = classifyFrame(frame, isTenth);
    const complete = frameIsComplete(frame, isTenth);
    const sum = frame.balls.reduce((a, b) => a + b.pins, 0);

    let frameScore = 0;
    let scoreKnown = false;

    if (isTenth) {
      // Every ball thrown in the 10th (including bonus balls) counts directly.
      frameScore = sum;
      scoreKnown = complete;
    } else if (outcome === "strike") {
      const next = ballsAfter(frames, i).slice(0, 2);
      scoreKnown = next.length === 2;
      frameScore = 10 + next.reduce((a, b) => a + b.pins, 0);
    } else if (outcome === "spare") {
      const next = ballsAfter(frames, i).slice(0, 1);
      scoreKnown = next.length === 1;
      frameScore = 10 + next.reduce((a, b) => a + b.pins, 0);
    } else if (outcome === "ten_box") {
      frameScore = 10; // NO bonus
      scoreKnown = true;
    } else if (outcome === "open") {
      frameScore = sum;
      scoreKnown = true;
    } else {
      frameScore = sum;
      scoreKnown = false;
    }

    if (scoreKnown && runningKnown) {
      running += frameScore;
    } else if (!scoreKnown) {
      runningKnown = false;
    }

    scored.push({
      frameNumber: i + 1,
      balls: frame.balls,
      outcome,
      frameScore,
      cumulative: scoreKnown && runningKnown ? running : null,
      complete,
      isSplit: Boolean(frame.balls[0]?.isSplit),
      splitConverted: Boolean(frame.balls[0]?.isSplit) && outcome === "spare",
      firstBallPins: frame.balls[0] ? frame.balls[0].pins : null,
    });
  }

  const lastKnown = [...scored].reverse().find((f) => f.cumulative !== null);
  return {
    frames: scored,
    total: lastKnown?.cumulative ?? 0,
    complete: scored.every((f) => f.complete),
  };
}

/** Validate a candidate ball. Returns an error message, or null when legal. */
export function validateBall(
  frames: Frame[],
  frameIndex: number,
  ballIndex: number,
  pins: number,
): string | null {
  if (!Number.isInteger(pins) || pins < 0 || pins > 10) return "Pins must be 0–10.";
  const isTenth = frameIndex === FRAME_COUNT - 1;
  const frame = frames[frameIndex] ?? { balls: [] };
  if (!isTenth) {
    if (ballIndex > 0 && frame.balls[0]?.pins === 10) return "Strike — no further balls.";
    if (
      ballIndex > 1 &&
      (frame.balls[0]?.pins ?? 0) + (frame.balls[1]?.pins ?? 0) === 10
    )
      return "Spare — ball 3 is not thrown.";
  }
  const remaining = pinsRemaining(frame, ballIndex, isTenth);
  if (pins > remaining) return `Only ${remaining} pin${remaining === 1 ? "" : "s"} standing.`;
  return null;
}

/** Whether a ball box should be disabled in the entry grid. */
export function ballDisabled(frame: Frame, frameIndex: number, ballIndex: number): boolean {
  const isTenth = frameIndex === FRAME_COUNT - 1;
  if (isTenth) return false;
  const b = frame.balls;
  if (ballIndex === 0) return false;
  if (b.length < ballIndex) return true; // previous ball not entered yet
  if (b[0]?.pins === 10) return true;
  if (ballIndex === 2 && b.length >= 2 && b[0]!.pins + b[1]!.pins === 10) return true;
  return false;
}

/**
 * Position of a ball within its CURRENT rack (0 = first ball at a full rack).
 * In frames 1-9 the rack never resets, so this equals the ball index. In the
 * 10th the rack resets after every clear.
 */
export function rackBallIndex(frame: Frame, ballIndex: number, isTenth: boolean): number {
  if (!isTenth) return ballIndex;
  let pos = 0;
  let standing = 10;
  for (let i = 0; i < ballIndex; i++) {
    const b = frame.balls[i];
    if (!b) break;
    standing -= b.pins;
    if (standing === 0) {
      standing = 10;
      pos = 0;
    } else {
      pos += 1;
    }
  }
  return pos;
}

/**
 * Display token for a ball box, e.g. X, /, 7s, -.
 * `/` is spare notation and is only ever used for the SECOND ball of a rack.
 * A third-ball clear in frames 1-9 is a 10-box and shows its numeric pin count.
 */
export function ballToken(frame: Frame, frameIndex: number, ballIndex: number): string {
  const ball = frame.balls[ballIndex];
  if (!ball) return "";
  const isTenth = frameIndex === FRAME_COUNT - 1;
  const remaining = pinsRemaining(frame, ballIndex, isTenth);
  const rackPos = rackBallIndex(frame, ballIndex, isTenth);
  let token: string;
  // A full-rack clear is only a STRIKE on the first ball of a rack. Clearing
  // all ten on the second ball (e.g. after a gutter) is a spare.
  if (ball.pins === 10 && rackPos === 0) token = "X";
  else if (ball.pins === remaining && ball.pins > 0 && rackPos === 1) token = "/";
  else if (ball.pins === 0) token = "-";
  else token = String(ball.pins);
  if (ball.isSplit) token += "s";
  return token;
}


/**
 * Parse a keyboard token into a ball. Returns null when the token is not valid
 * for the current position. Accepts: x/X, / (spare), s suffix (split), 0-10, "-".
 */
export function parseBallToken(
  raw: string,
  frames: Frame[],
  frameIndex: number,
  ballIndex: number,
): { ball: Ball; error: null } | { ball: null; error: string } {
  const input = raw.trim().toLowerCase();
  if (!input) return { ball: null, error: "Empty entry." };
  const isSplit = input.endsWith("s");
  const core = isSplit ? input.slice(0, -1) : input;
  const isTenth = frameIndex === FRAME_COUNT - 1;
  const frame = frames[frameIndex] ?? { balls: [] };
  const remaining = pinsRemaining(frame, ballIndex, isTenth);

  let pins: number;
  if (core === "x") {
    pins = remaining === 10 ? 10 : -1;
    if (pins === -1) return { ball: null, error: "A strike needs a full rack." };
  } else if (core === "/") {
    if (ballIndex === 0) return { ball: null, error: "A spare can never be on ball 1." };
    if (remaining === 10) return { ball: null, error: "Nothing left to spare." };
    if (rackBallIndex(frame, ballIndex, isTenth) !== 1)
      return { ball: null, error: "Ball 3 clears are 10-boxes — enter the pin count." };
    pins = remaining;

  } else if (core === "-") {
    pins = 0;
  } else if (/^\d{1,2}$/.test(core)) {
    pins = Number(core);
  } else {
    return { ball: null, error: "Enter 0–10, X, /, - or a split (e.g. 7s)." };
  }

  if (isSplit && ballIndex !== 0) return { ball: null, error: "Splits are marked on ball 1." };
  const err = validateBall(frames, frameIndex, ballIndex, pins);
  if (err) return { ball: null, error: err };
  return { ball: isSplit ? { pins, isSplit: true } : { pins }, error: null };
}

/** Where the cursor should move after entering a ball. */
export function nextCursor(
  frames: Frame[],
  frameIndex: number,
  ballIndex: number,
): { frameIndex: number; ballIndex: number } | null {
  const isTenth = frameIndex === FRAME_COUNT - 1;
  const frame = frames[frameIndex] ?? { balls: [] };
  if (!frameIsComplete(frame, isTenth) && ballIndex < (isTenth ? 2 : 2)) {
    return { frameIndex, ballIndex: ballIndex + 1 };
  }
  if (frameIndex < FRAME_COUNT - 1) return { frameIndex: frameIndex + 1, ballIndex: 0 };
  return null;
}

export interface FrameStatTotals {
  frames: number;
  strikes: number;
  spares: number;
  tenBoxes: number;
  opens: number;
  spareAttempts: number;
  cleanFrames: number;
  firstBallPins: number;
  firstBallCount: number;
  eightPlus: number;
  ninePlus: number;
  splits: number;
  splitConversions: number;
  splitTenBoxes: number;
  splitOpens: number;
}

export function emptyStatTotals(): FrameStatTotals {
  return {
    frames: 0,
    strikes: 0,
    spares: 0,
    tenBoxes: 0,
    opens: 0,
    spareAttempts: 0,
    cleanFrames: 0,
    firstBallPins: 0,
    firstBallCount: 0,
    eightPlus: 0,
    ninePlus: 0,
    splits: 0,
    splitConversions: 0,
    splitTenBoxes: 0,
    splitOpens: 0,
  };
}

export function accumulateFrameStats(
  totals: FrameStatTotals,
  frames: ScoredFrame[],
): FrameStatTotals {
  for (const f of frames) {
    if (f.outcome === "incomplete") continue;
    totals.frames += 1;
    if (f.outcome === "strike") totals.strikes += 1;
    if (f.outcome === "spare") totals.spares += 1;
    if (f.outcome === "ten_box") totals.tenBoxes += 1;
    if (f.outcome === "open") totals.opens += 1;
    if (f.outcome !== "strike") totals.spareAttempts += 1;
    if (f.outcome === "strike" || f.outcome === "spare") totals.cleanFrames += 1;
    if (f.firstBallPins !== null) {
      totals.firstBallPins += f.firstBallPins;
      totals.firstBallCount += 1;
      if (f.firstBallPins >= 8) totals.eightPlus += 1;
      if (f.firstBallPins >= 9) totals.ninePlus += 1;
    }
    if (f.isSplit) {
      totals.splits += 1;
      if (f.outcome === "spare") totals.splitConversions += 1;
      if (f.outcome === "ten_box") totals.splitTenBoxes += 1;
      if (f.outcome === "open") totals.splitOpens += 1;
    }
  }
  return totals;
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
