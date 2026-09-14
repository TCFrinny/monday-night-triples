import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/standings")({ component: StandingsLayout });

function StandingsLayout() { return <Outlet />; }