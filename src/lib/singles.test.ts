import { describe, expect, it } from "vitest";
import {
  SINGLES_RULES,
  adjustedScores,
  gamePoint,
  generateSinglesSchedule,
  isSinglesPositionWeek,
  lineupForParticipant,
  positionRoundPairings,
  resolveSinglesSide,
  roundRobinPairings,
  singlesHandicap,
  singlesMatchPoints,
  sortSinglesStandings,
  validateActiveWeeks,
} from "@/lib/singles";

describe("singles handicap", () => {
  it("is 80% of (160 - average), floored", () => {
    expect(singlesHandicap(100)).toBe(48);
    expect(singlesHandicap(120)).toBe(32);
  });
  it("floors the final result for decimal averages", () => {
    expect(singlesHandicap(112.4)).toBe(38); // 0.8 * 47.6 = 38.08
    expect(singlesHandicap(99.75)).toBe(48); // 0.8 * 60.25 = 48.2
  });
  it("is zero at or above the base average", () => {
    expect(singlesHandicap(160)).toBe(0);
    expect(singlesHandicap(184.6)).toBe(0);
  });
  it("never inherits: each side computes from its own average", () => {
    expect(singlesHandicap(90)).not.toBe(singlesHandicap(140));
  });
});

describe("game points", () => {
  it("awards one point to the higher adjusted game", () => {
    expect(gamePoint(150, 140)).toEqual({ game: 1, a: 1, b: 0 });
    expect(gamePoint(140, 150)).toEqual({ game: 1, a: 0, b: 1 });
  });
  it("splits a tied game 0.5 / 0.5", () => {
    expect(gamePoint(140, 140, 2)).toEqual({ game: 2, a: 0.5, b: 0.5 });
  });
  it("caps a match at 3 points with no set point", () => {
    const p = singlesMatchPoints([150, 150, 150], [100, 100, 100]);
    expect(p.totalA).toBe(3);
    expect(p.totalB).toBe(0);
    expect(p.gamePoints).toHaveLength(3);
    expect(p.totalA + p.totalB).toBe(3);
  });
  it("splits every game when all three tie", () => {
    const p = singlesMatchPoints([120, 120, 120], [120, 120, 120]);
    expect(p.totalA).toBe(1.5);
    expect(p.totalB).toBe(1.5);
  });
});

describe("substitute attribution", () => {
  const scheduled = "steven";
  const sub = "bob";
  const lineups = [
    { bowler_id: sub, absent_bowler_id: scheduled, participation: "sub", applicable_average: 96.5 },
    { bowler_id: "other", absent_bowler_id: null, participation: "rostered", applicable_average: 130 },
  ];

  it("maps the scheduled participant to the lineup the sub bowled", () => {
    expect(lineupForParticipant(lineups, scheduled)?.bowler_id).toBe(sub);
  });

  it("uses the sub's own average and handicap, never the scheduled bowler's", () => {
    const side = resolveSinglesSide(lineups, scheduled)!;
    expect(side.scheduledBowlerId).toBe(scheduled);
    expect(side.actualBowlerId).toBe(sub);
    expect(side.isSub).toBe(true);
    expect(side.applicableAverage).toBe(96.5);
    expect(side.handicap).toBe(singlesHandicap(96.5));
  });

  it("credits the scheduled participant with the points and pinfall the sub produced", () => {
    const side = resolveSinglesSide(lineups, scheduled)!;
    const adj = adjustedScores([110, 95, 120], side.handicap);
    const pts = singlesMatchPoints(adj, [150, 150, 150]);
    const credited = { bowlerId: side.scheduledBowlerId, points: pts.totalA, pinfall: adj.reduce((a, b) => a + b, 0) };
    expect(credited.bowlerId).toBe(scheduled);
    expect(credited.pinfall).toBe(325 + side.handicap * 3);
    // the sub's raw scores are not attributed to the scheduled bowler's own stats
    expect(side.actualBowlerId).not.toBe(credited.bowlerId);
  });

  it("resolves a normal (non-sub) week to the bowler themselves", () => {
    const own = [{ bowler_id: scheduled, absent_bowler_id: null, participation: "rostered", applicable_average: 118 }];
    const side = resolveSinglesSide(own, scheduled)!;
    expect(side.actualBowlerId).toBe(scheduled);
    expect(side.isSub).toBe(false);
  });

  it("returns null when the participant did not appear in that week's Triples lineups", () => {
    expect(resolveSinglesSide(lineups, "nobody")).toBeNull();
  });
});

describe("active week configuration", () => {
  const all34 = Array.from({ length: 36 }, (_, i) => i + 1).filter((w) => w !== 5 && w !== 12);

  it("accepts exactly 34 weeks including 18 and 35", () => {
    const check = validateActiveWeeks(all34, 36);
    expect(check.ok).toBe(true);
    expect(check.selectedCount).toBe(34);
  });
  it("rejects any count other than 34", () => {
    expect(validateActiveWeeks(all34.slice(0, 33), 36).ok).toBe(false);
    expect(validateActiveWeeks(Array.from({ length: 36 }, (_, i) => i + 1), 36).ok).toBe(false);
  });
  it("requires the mandatory position weeks 18 and 35", () => {
    const without = all34.filter((w) => w !== 18).concat(5);
    const check = validateActiveWeeks(without, 36);
    expect(check.ok).toBe(false);
    expect(check.missingPositionWeeks).toEqual([18]);
  });
  it("flags weeks outside the season", () => {
    expect(validateActiveWeeks(all34.filter((w) => w !== 1).concat(99), 36).ok).toBe(false);
  });
  it("marks 18 and 35 as position rounds", () => {
    expect(isSinglesPositionWeek(18)).toBe(true);
    expect(isSinglesPositionWeek(35)).toBe(true);
    expect(isSinglesPositionWeek(17)).toBe(false);
    expect(SINGLES_RULES.mandatoryPositionWeeks).toEqual([18, 35]);
  });
});

describe("schedule generation", () => {
  const even = ["a", "b", "c", "d", "e", "f"];
  const odd = ["a", "b", "c", "d", "e"];

  it("pairs every bowler once per week with an even roster", () => {
    const p = roundRobinPairings(even, 0);
    expect(p).toHaveLength(3);
    const used = p.flatMap((x) => [x.a, x.b]);
    expect(new Set(used).size).toBe(6);
    expect(p.every((x) => x.a !== x.b)).toBe(true);
  });

  it("gives exactly one bye with an odd roster", () => {
    const p = roundRobinPairings(odd, 1);
    const byes = p.filter((x) => x.b === null);
    expect(byes).toHaveLength(1);
    expect(p.filter((x) => x.b !== null)).toHaveLength(2);
  });

  it("never repeats a bowler inside one week and never self-matches", () => {
    for (let r = 0; r < 7; r++) {
      const p = roundRobinPairings(odd, r);
      const ids = p.flatMap((x) => (x.b ? [x.a, x.b] : [x.a]));
      expect(new Set(ids).size).toBe(ids.length);
      expect(p.every((x) => x.a !== x.b)).toBe(true);
    }
  });

  it("adapts to a dynamic roster size", () => {
    expect(roundRobinPairings(["a", "b"], 0)).toHaveLength(1);
    expect(roundRobinPairings(["a"], 0)).toHaveLength(0);
    expect(roundRobinPairings(Array.from({ length: 18 }, (_, i) => `b${i}`), 3)).toHaveLength(9);
  });

  it("leaves position-round weeks pending instead of auto-inventing matchups", () => {
    const plan = generateSinglesSchedule(even, [16, 17, 18, 19]);
    expect(plan.find((w) => w.weekNumber === 18)!.pairings).toEqual([]);
    expect(plan.find((w) => w.weekNumber === 18)!.isPositionRound).toBe(true);
    expect(plan.find((w) => w.weekNumber === 17)!.pairings.length).toBe(3);
  });

  it("produces no lane field anywhere in the Singles matchup model", () => {
    const plan = generateSinglesSchedule(even, [1, 2]);
    for (const w of plan) {
      for (const p of w.pairings) {
        expect(Object.keys(p).sort()).toEqual(["a", "b"]);
      }
    }
  });
});

describe("position rounds", () => {
  it("pairs 1v2, 3v4 from standings order", () => {
    expect(positionRoundPairings(["p1", "p2", "p3", "p4"])).toEqual([
      { a: "p1", b: "p2" },
      { a: "p3", b: "p4" },
    ]);
  });
  it("gives the last standings bowler a bye when odd", () => {
    const p = positionRoundPairings(["p1", "p2", "p3"]);
    expect(p[2]).toEqual({ a: "p3", b: null });
  });
});

describe("standings order", () => {
  it("sorts by points then credited pinfall", () => {
    const rows = [
      { bowler_id: "x", points: 12, pinfall: 5000 },
      { bowler_id: "y", points: 12, pinfall: 5200 },
      { bowler_id: "z", points: 15, pinfall: 100 },
    ];
    expect(sortSinglesStandings(rows).map((r) => r.bowler_id)).toEqual(["z", "y", "x"]);
  });
});

describe("recomputation from corrected Triples scores", () => {
  it("changes the Singles result without changing schedule identity", () => {
    const matchId = "singles-match-1";
    const hA = singlesHandicap(100);
    const hB = singlesHandicap(130);
    const before = singlesMatchPoints(adjustedScores([100, 100, 100], hA), adjustedScores([120, 120, 120], hB));
    const corrected = singlesMatchPoints(adjustedScores([160, 160, 160], hA), adjustedScores([120, 120, 120], hB));
    expect(before.totalA).not.toBe(corrected.totalA);
    expect(matchId).toBe("singles-match-1");
  });
});
