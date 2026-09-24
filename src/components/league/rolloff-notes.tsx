import { parseDecisions } from "@/lib/rolloff";
import type { GameSnapshot } from "@/lib/results";

/** Tied original scores stay tied; the roll-off winner is shown separately. */
export function RolloffNotes({ match, games }: { match: any; games: GameSnapshot[] }) {
  const name = (s: unknown) =>
    s === "a" ? (match.team_a?.name ?? "Team A") : s === "b" ? (match.team_b?.name ?? "Team B") : null;
  const lines: string[] = [];
  for (const g of games) {
    if (!g.tied || !g.rolloff_winner) continue;
    const who = name(g.rolloff_winner);
    if (g.rolloff_method === "auto" && typeof g.rolloff_a === "number" && typeof g.rolloff_b === "number") {
      const a = g.rolloff_a + Number(g.rolloff_hdcp_a ?? 0);
      const b = g.rolloff_b + Number(g.rolloff_hdcp_b ?? 0);
      lines.push(
        `Game ${g.game} tied ${g.a_hdcp}–${g.b_hdcp} — ${who} won the roll-off (Game ${g.game + 1} frame 1: ${a}–${b} incl. roll-off handicap), +2`,
      );
    } else {
      lines.push(`Game ${g.game} tied ${g.a_hdcp}–${g.b_hdcp} — ${who} won the roll-off, +2`);
    }
  }
  const setWinner = parseDecisions(match.rolloff_decisions).set;
  if (
    setWinner &&
    match.status === "final" &&
    Number(match.hdcp_total_a) === Number(match.hdcp_total_b)
  ) {
    lines.push(`Set tied ${match.hdcp_total_a}–${match.hdcp_total_b} — ${name(setWinner)} won the roll-off, +1`);
  }
  if (!lines.length) return null;
  return (
    <ul className="space-y-0.5 px-5 py-2 text-xs text-muted-foreground">
      {lines.map((l) => (
        <li key={l}>
          <span className="font-display uppercase text-gold">Roll-off</span> · {l}
        </li>
      ))}
    </ul>
  );
}
