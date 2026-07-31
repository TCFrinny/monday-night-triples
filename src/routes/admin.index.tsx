import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { activeSeasonQuery, announcementsQuery } from "@/lib/queries";
import { refreshAggregates } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

const numList = (s: string) =>
  s
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

function AdminOverview() {
  const qc = useQueryClient();
  const { data: season, isLoading } = useQuery(activeSeasonQuery);
  const { data: news } = useQuery(announcementsQuery(season?.id));
  const [form, setForm] = useState<Record<string, string>>({});
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!season) return;
    setForm({
      league_name: season.league_name,
      sponsor: season.sponsor ?? "",
      display_name: season.display_name,
      center_name: season.center_name,
      season_name: season.season_name,
      team_count: String(season.team_count),
      total_weeks: String(season.total_weeks),
      position_round_weeks: (season.position_round_weeks ?? []).join(", "),
      third_boundaries: (season.third_boundaries ?? []).join(", "),
      handicap_percent: String(season.handicap_percent),
      establishment_threshold: String(season.establishment_threshold),
      blind_deduction: String(season.blind_deduction),
    });
    setActive(season.is_active);
  }, [season?.id]);

  const set = (k: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        league_name: (form["league_name"] ?? "").trim().slice(0, 120) || "Monday Night Triples",
        sponsor: (form["sponsor"] ?? "").trim().slice(0, 120) || null,
        display_name: (form["display_name"] ?? "").trim().slice(0, 160) || "Monday Night Triples",
        center_name: (form["center_name"] ?? "").trim().slice(0, 120) || "AMF Dundalk",
        season_name: (form["season_name"] ?? "").trim().slice(0, 120) || "Season",
        team_count: Number(form["team_count"] ?? 0) || 0,
        total_weeks: Number(form["total_weeks"] ?? 0) || 0,
        position_round_weeks: numList(form["position_round_weeks"] ?? ""),
        third_boundaries: numList(form["third_boundaries"] ?? ""),
        handicap_percent: Number(form["handicap_percent"] ?? 80) || 80,
        establishment_threshold: Number(form["establishment_threshold"] ?? 15) || 15,
        blind_deduction: Number(form["blind_deduction"] ?? 10) || 0,
        is_active: active,
      };
      if (season) {
        const { error } = await supabase.from("seasons").update(payload).eq("id", season.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("seasons").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Season settings saved");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recalc = useMutation({
    mutationFn: async () => refreshAggregates(season!.id),
    onSuccess: () => {
      toast.success("Standings and statistics recalculated");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const fields: [string, string, string?][] = [
    ["league_name", "League name"],
    ["sponsor", "Sponsor"],
    ["display_name", "Display name"],
    ["center_name", "Center"],
    ["season_name", "Season name"],
    ["team_count", "Team count"],
    ["total_weeks", "Total weeks"],
    ["third_boundaries", "Third boundaries (last week of each third)", "e.g. 12, 24, 36"],
    ["position_round_weeks", "Position round weeks", "e.g. 12, 24, 36"],
    ["handicap_percent", "Handicap %", "80 = 80% of the team average difference"],
    ["establishment_threshold", "Games to establish an average", "Entry average used until reached"],
    ["blind_deduction", "Blind deduction (pins)"],
  ];

  return (
    <div className="space-y-8">
      <section className="panel p-6">
        <h2 className="mb-4 font-display text-lg uppercase text-foreground">
          {season ? "Season settings" : "Create the first season"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([key, label, hint]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input id={key} maxLength={200} value={form[key] ?? ""} onChange={set(key)} />
              {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="active">Active season</Label>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
          {season && (
            <Button variant="outline" onClick={() => recalc.mutate()} disabled={recalc.isPending}>
              Recalculate standings & stats
            </Button>
          )}
        </div>
      </section>

      {season && <Announcements seasonId={season.id} news={news ?? []} />}
    </div>
  );
}

function Announcements({ seasonId, news }: { seasonId: string; news: any[] }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [pinned, setPinned] = useState(false);

  const add = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const m = message.trim();
      if (!t || !m) throw new Error("Title and message are required.");
      const { error } = await supabase.from("announcements").insert({
        season_id: seasonId,
        title: t.slice(0, 140),
        message: m.slice(0, 2000),
        is_pinned: pinned,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setTitle("");
      setMessage("");
      setPinned(false);
      toast.success("Announcement posted");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="panel p-6">
      <h2 className="mb-4 font-display text-lg uppercase text-foreground">Announcements</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Input
            placeholder="Title"
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Message shown on the home page"
            maxLength={2000}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Switch id="pin" checked={pinned} onCheckedChange={setPinned} />
            <Label htmlFor="pin">Pin to top</Label>
            <Button className="ml-auto" onClick={() => add.mutate()} disabled={add.isPending}>
              Post
            </Button>
          </div>
        </div>
        <ul className="space-y-2">
          {news.map((n) => (
            <li key={n.id} className="rounded-md border border-border p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0">
                  <p className="font-display text-sm uppercase text-gold">{n.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.message}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => remove.mutate(n.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {!news.length && <li className="text-sm text-muted-foreground">No announcements.</li>}
        </ul>
      </div>
    </section>
  );
}
