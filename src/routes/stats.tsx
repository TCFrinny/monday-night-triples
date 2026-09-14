import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/stats")({ component: StatsLayout });

function StatsLayout() { return <Outlet />; }