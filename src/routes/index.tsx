import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BottomBar } from "@/components/skymed/BottomBar";
import { FleetPanel } from "@/components/skymed/FleetPanel";
import { HealthcarePanel } from "@/components/skymed/HealthcarePanel";
import { SecurityPanel } from "@/components/skymed/SecurityPanel";
import { TopBar } from "@/components/skymed/TopBar";
import { Viewport } from "@/components/skymed/Viewport";
import { useSim, useSimLoop } from "@/sim/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SKYMED GRID — 3D Drone Fleet Simulation" },
      {
        name: "description",
        content:
          "Interactive 3D smart-city simulation of 12 drones delivering medicine and running night-time security patrols, with OTP delivery checks and human-reviewed alerts.",
      },
      { property: "og:title", content: "SKYMED GRID — 3D Drone Fleet Simulation" },
      {
        property: "og:description",
        content: "Watch 12 simulated drones deliver medicine by day and patrol the city by night.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useSimLoop();
  const mode = useSim((s) => s.snap.mode);
  const [fullscreen, setFullscreen] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === dashboardRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    const dashboard = dashboardRef.current;
    if (!dashboard) return;
    try {
      if (document.fullscreenElement === dashboard) await document.exitFullscreen();
      else await dashboard.requestFullscreen();
    } catch (error) {
      console.warn("Fullscreen is unavailable", error);
    }
  };

  return (
    <div
      ref={dashboardRef}
      className={`flex flex-col gap-2 p-2 ${
        fullscreen
          ? "h-screen min-h-0 w-screen overflow-hidden"
          : "min-h-screen lg:h-screen lg:overflow-hidden"
      }`}
    >
      <div className={fullscreen ? "hidden" : ""}>
        <TopBar />
      </div>
      <div
        className={`grid min-h-0 flex-1 gap-2 ${
          fullscreen
            ? "min-w-0 grid-cols-[minmax(0,2.15fr)_minmax(340px,1fr)] gap-3"
            : "lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]"
        }`}
      >
        <aside
          className={`scrollbar-thin order-2 min-h-0 min-w-0 lg:order-2 ${
            fullscreen
              ? "overscroll-contain overflow-y-auto rounded-2xl pr-1"
              : "pr-1 lg:overflow-y-auto"
          }`}
        >
          <div className="flex flex-col gap-2">
            <div className={mode === "healthcare" ? "order-1" : "order-3"}>
              <HealthcarePanel fullscreen={fullscreen && mode === "healthcare"} mode={mode} />
            </div>
            <div className={mode === "security" ? "order-1" : "hidden"}>
              <SecurityPanel />
            </div>
            <div
              className={mode === "healthcare" ? (fullscreen ? "hidden" : "order-3") : "order-2"}
            >
              <FleetPanel compact={mode === "security"} />
            </div>
          </div>
        </aside>
        <main className="order-1 flex min-h-0 min-w-0 flex-col gap-2 lg:order-1">
          {fullscreen && <TopBar compact />}
          <div
            className={fullscreen ? "min-h-0 flex-1" : "h-[68vh] min-h-[420px] lg:h-auto lg:flex-1"}
          >
            <Viewport fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} />
          </div>
          <div className={fullscreen ? "hidden" : ""}>
            <BottomBar />
          </div>
        </main>
      </div>
    </div>
  );
}
