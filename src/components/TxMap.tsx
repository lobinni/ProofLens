import { useEffect, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Network } from "lucide-react";
import type { WalletAnalytics } from "@/lib/types";
import { fmtCompact, fmtUsd, shortAddress } from "@/lib/format";

interface MapNode extends SimulationNodeDatum {
  id: string;
  kind: "wallet" | "eoa" | "contract";
  label: string | null;
  r: number;
  interactions: number;
  usd: number;
  pinned?: boolean;
}

interface MapLink extends SimulationLinkDatum<MapNode> {
  w: number;
}

interface Hover {
  x: number;
  y: number;
  node: MapNode;
}

export function TxMap({ analytics, wallet }: { analytics: WalletAnalytics; wallet: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const nodesRef = useRef<MapNode[]>([]);
  const simRef = useRef<Simulation<MapNode, MapLink> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const cps = analytics.counterparties.slice(0, 12);
    const cts = analytics.contracts.slice(0, 6);

    const maxVol = Math.max(1, ...cps.map((c) => c.usdIn + c.usdOut), ...cts.map(() => 1));
    const nodes: MapNode[] = [
      {
        id: wallet.toLowerCase(),
        kind: "wallet",
        label: "subject",
        r: 22,
        interactions: analytics.counts.observedTx,
        usd: 0,
      },
    ];
    const links: MapLink[] = [];

    for (const c of cps) {
      const vol = c.usdIn + c.usdOut;
      nodes.push({
        id: c.address,
        kind: c.isContract ? "contract" : "eoa",
        label: c.label,
        r: 7 + Math.sqrt(Math.max(vol, 0.01) / maxVol) * 12 + Math.min(c.interactions, 40) * 0.12,
        interactions: c.interactions,
        usd: vol,
      });
      links.push({ source: wallet.toLowerCase(), target: c.address, w: c.interactions });
    }
    for (const c of cts) {
      if (nodes.some((n) => n.id === c.address)) continue;
      nodes.push({
        id: c.address,
        kind: "contract",
        label: c.name,
        r: 8 + Math.min(c.interactions, 50) * 0.22,
        interactions: c.interactions,
        usd: 0,
      });
      links.push({ source: wallet.toLowerCase(), target: c.address, w: c.interactions });
    }
    nodesRef.current = nodes;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const sim = forceSimulation<MapNode>(nodes)
      .force(
        "link",
        forceLink<MapNode, MapLink>(links)
          .id((d) => d.id)
          .distance((l) => 130 - Math.min(l.w, 60))
          .strength(0.4),
      )
      .force("charge", forceManyBody<MapNode>().strength((d) => (d.kind === "wallet" ? -420 : -140)))
      .force("collide", forceCollide<MapNode>().radius((d) => d.r + 10))
      .force("center", forceCenter(0, 0));
    simRef.current = sim;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.translate(width / dpr / 2, height / dpr / 2);

      const maxW = Math.max(...links.map((l) => l.w), 1);
      for (const l of links) {
        const s = l.source as unknown as MapNode;
        const t = l.target as unknown as MapNode;
        ctx.beginPath();
        ctx.moveTo(s.x ?? 0, s.y ?? 0);
        ctx.lineTo(t.x ?? 0, t.y ?? 0);
        ctx.strokeStyle = `rgba(255,178,36,${0.07 + (l.w / maxW) * 0.2})`;
        ctx.lineWidth = 0.6 + (l.w / maxW) * 2.4;
        ctx.stroke();
      }

      for (const n of nodes) {
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        if (n.kind === "wallet") {
          ctx.beginPath();
          ctx.arc(x, y, n.r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,178,36,0.35)";
          ctx.setLineDash([3, 4]);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.arc(x, y, n.r, 0, Math.PI * 2);
        ctx.fillStyle =
          n.kind === "wallet" ? "#ffb224" : n.kind === "contract" ? "#8f7bff" : "#3a434f";
        ctx.fill();
        if (n.kind !== "wallet") {
          ctx.beginPath();
          ctx.arc(x, y, n.r, 0, Math.PI * 2);
          ctx.strokeStyle = n.kind === "contract" ? "rgba(143,123,255,0.5)" : "rgba(139,144,151,0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (n.kind === "wallet" || n.interactions >= 12 || n.label) {
          ctx.font = "9.5px 'IBM Plex Mono', monospace";
          ctx.fillStyle = n.kind === "wallet" ? "#ece9df" : "#8b9097";
          ctx.textAlign = "center";
          ctx.fillText(n.label ? (n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label) : shortAddress(n.id, 4), x, y + n.r + 13);
        }
      }
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      sim.stop();
      ro.disconnect();
    };
  }, [analytics, wallet]);

  const pickNode = (e: React.PointerEvent): MapNode | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    let best: MapNode | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current) {
      const dx = (n.x ?? 0) - x;
      const dy = (n.y ?? 0) - y;
      const d = Math.hypot(dx, dy);
      if (d < n.r + 6 && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };

  const dragRef = useRef<MapNode | null>(null);

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-ink-2/50">
      <div className="flex items-center justify-between border-b border-line/70 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Network className="h-4 w-4 text-amber" strokeWidth={1.8} />
          <p className="mono-label text-mute">Transaction map</p>
        </div>
        <p className="font-mono text-[10px] text-dim">drag nodes · hover to inspect</p>
      </div>

      <div ref={wrapRef} className="relative h-[420px]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            const n = pickNode(e);
            if (n) {
              dragRef.current = n;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              simRef.current?.alphaTarget(0.25).restart();
            }
          }}
          onPointerMove={(e) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            if (dragRef.current) {
              dragRef.current.fx = x;
              dragRef.current.fy = y;
            } else {
              const n = pickNode(e);
              setHover(n ? { x: e.clientX - rect.left, y: e.clientY - rect.top, node: n } : null);
            }
          }}
          onPointerUp={(e) => {
            if (dragRef.current) {
              dragRef.current.fx = null;
              dragRef.current.fy = null;
              dragRef.current = null;
              simRef.current?.alphaTarget(0);
              (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            }
          }}
          onPointerLeave={() => setHover(null)}
        />

        {hover && hover.node.kind !== "wallet" && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line-2 bg-ink/95 p-3.5 shadow-2xl"
            style={{ left: Math.min(hover.x + 14, 400), top: Math.max(hover.y - 60, 8) }}
          >
            <p className="font-mono text-[11px] text-bone">{shortAddress(hover.node.id, 10)}</p>
            {hover.node.label && <p className="mt-0.5 text-[11px] text-amber">{hover.node.label}</p>}
            <div className="mt-2 space-y-1 font-mono text-[10px] text-mute">
              <p>kind · {hover.node.kind === "contract" ? "contract" : "externally owned"}</p>
              <p>interactions · {hover.node.interactions}</p>
              {hover.node.usd > 0 && <p>priced volume · {fmtUsd(hover.node.usd, { compact: true })}</p>}
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-4 left-5 flex items-center gap-4 font-mono text-[10px] text-dim">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber" /> subject</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet" /> contract</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3a434f]" /> eoa</span>
          <span className="hidden sm:inline">edge width ∝ interactions</span>
        </div>
        <div className="pointer-events-none absolute right-5 bottom-4 font-mono text-[10px] text-dim">
          top {Math.min(analytics.counterparties.length, 12) + Math.min(analytics.contracts.length, 6)} routes · {fmtCompact(analytics.derived.uniqueCounterparties)} total
        </div>
      </div>
    </div>
  );
}
