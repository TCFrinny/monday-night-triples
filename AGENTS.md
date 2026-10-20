<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Mid-game withdrawal: `balls.is_blind` marks blind-completion balls; `bowler_games.is_withdrawn` is derived on save. Game-level individual stats exclude withdrawn games, frame stats use `v_frame_flags` masking — why: team score keeps hybrid pins while real pre-withdrawal frames still count.
- Per-game actual lanes live in matches.game_lane_pairs (overrides only, keys 1-3); v_game_context resolves override-or-primary — why: Lane Data attributes each game to where it was bowled while schedule order stays on matches.lane_pair.
