import { api } from "@/lib/api";
import type { GraphNode, GraphSnapshot } from "@/lib/types";
import * as d3 from "d3";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const GRAPH_HEIGHT = 600;

const NODE_COLORS: Record<string, string> = {
  root: "#1e293b",
  PatientCase: "#3b82f6",
  PARequest: "#8b5cf6",
  DenialRecord: "#ef4444",
  AppealRecord: "#22c55e",
  PayerProfile: "#f59e0b",
  DenialPattern: "#06b6d4",
};

const NODE_SIZES: Record<string, number> = {
  root: 20,
  PatientCase: 16,
  PARequest: 12,
  DenialRecord: 12,
  AppealRecord: 12,
  PayerProfile: 14,
  DenialPattern: 10,
};

const LEGEND_TYPES = [
  "root",
  "PatientCase",
  "PARequest",
  "DenialRecord",
  "AppealRecord",
  "PayerProfile",
  "DenialPattern",
] as const;

type SimulationGraphNode = GraphNode & d3.SimulationNodeDatum;

type SimulationGraphLink = d3.SimulationLinkDatum<SimulationGraphNode> & {
  type: string;
};

function nodeRadius(type: string): number {
  return NODE_SIZES[type] ?? 10;
}

function nodeColor(type: string): string {
  return NODE_COLORS[type] ?? "#94a3b8";
}

function truncateLabel(label: string, max = 18): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

function formatTooltipData(data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === "") continue;
    lines.push(`${key}: ${String(value)}`);
  }
  return lines;
}

type GraphViewProps = {
  refreshKey?: number;
  onPatientCaseClick?: (caseId: string) => void;
};

export function GraphView({ refreshKey = 0, onPatientCaseClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(800);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: GraphNode;
  } | null>(null);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getGraphSnapshot();
      setSnapshot(data);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not load graph snapshot from server.";
      setError(message);
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot, refreshKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWidth(Math.max(entry.contentRect.width, 320));
      }
    });
    observer.observe(el);
    setWidth(Math.max(el.clientWidth, 320));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!snapshot || !svgRef.current || loading || error) {
      return;
    }

    if (snapshot.node_count <= 1) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const nodes: SimulationGraphNode[] = snapshot.nodes.map((n) => ({ ...n }));
    const links: SimulationGraphLink[] = snapshot.edges.map((e) => ({ ...e }));

    const linkGroup = svg.append("g").attr("class", "links");
    const nodeGroup = svg.append("g").attr("class", "nodes");

    const linkSelection = linkGroup
      .selectAll<SVGLineElement, SimulationGraphLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1.5);

    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, SimulationGraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", (d) => (d.type === "PatientCase" ? "pointer" : "grab"));

    nodeSelection
      .append("circle")
      .attr("r", (d) => nodeRadius(d.type))
      .attr("fill", (d) => nodeColor(d.type))
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 1.5);

    nodeSelection
      .append("text")
      .attr("dy", (d) => nodeRadius(d.type) + 12)
      .attr("text-anchor", "middle")
      .attr("fill", "#cbd5e1")
      .attr("font-size", 10)
      .text((d) => truncateLabel(d.label));

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimulationGraphNode, SimulationGraphLink>(links)
          .id((d) => d.id)
          .distance(70)
      )
      .force("charge", d3.forceManyBody().strength(-280))
      .force("center", d3.forceCenter(width / 2, GRAPH_HEIGHT / 2))
      .force(
        "collision",
        d3.forceCollide<SimulationGraphNode>().radius((d) => nodeRadius(d.type) + 8)
      );

    const dragBehavior = d3
      .drag<SVGGElement, SimulationGraphNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSelection.call(dragBehavior);

    nodeSelection
      .on("mouseenter", (event, d) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top + 12,
          node: d,
        });
      })
      .on("mouseleave", () => setTooltip(null))
      .on("click", (_event, d) => {
        if (d.type === "PatientCase" && onPatientCaseClick) {
          onPatientCaseClick(d.id);
        }
      });

    simulation.on("tick", () => {
      linkSelection
        .attr("x1", (d) => (d.source as SimulationGraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimulationGraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimulationGraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimulationGraphNode).y ?? 0);

      nodeSelection.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [snapshot, width, loading, error, onPatientCaseClick]);

  const dataLines = tooltip ? formatTooltipData(tooltip.node.data) : [];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">
            Jac Object Spatial Programming Graph
          </h2>
          <p className="mt-0.5 text-xs text-indigo-400">
            Powered by Jac Graph Intelligence
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {snapshot && !loading && (
            <p className="text-xs text-slate-400 tabular-nums">
              {snapshot.node_count} nodes · {snapshot.edge_count} edges
            </p>
          )}
          <button
            type="button"
            onClick={() => void fetchSnapshot()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[600px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <p className="text-sm text-slate-400">Loading OSP graph snapshot…</p>
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 px-6 text-center">
            <p className="text-sm font-medium text-slate-200">Graph unavailable</p>
            <p className="text-xs text-slate-400">{error}</p>
            <button
              type="button"
              onClick={() => void fetchSnapshot()}
              className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && snapshot && snapshot.node_count <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <p className="text-sm text-slate-400">
              No graph nodes yet — submit a PA request to populate the OSP graph.
            </p>
          </div>
        )}

        {!loading && !error && snapshot && snapshot.node_count > 1 && (
          <>
            <svg
              ref={svgRef}
              width="100%"
              height={GRAPH_HEIGHT}
              viewBox={`0 0 ${width} ${GRAPH_HEIGHT}`}
              className="block"
              role="img"
              aria-label="Jac OSP force-directed graph"
            />
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Node types
              </p>
              <ul className="flex flex-col gap-1">
                {LEGEND_TYPES.map((type) => (
                  <li key={type} className="flex items-center gap-2 text-[10px] text-slate-300">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: nodeColor(type) }}
                    />
                    {type === "root" ? "Root" : type}
                  </li>
                ))}
              </ul>
            </div>
            {tooltip && (
              <div
                className="pointer-events-none absolute z-10 max-w-[220px] rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 shadow-lg"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <p className="text-xs font-medium text-slate-100">{tooltip.node.type}</p>
                <p className="text-xs text-slate-300">{tooltip.node.label}</p>
                {dataLines.map((line) => (
                  <p key={line} className="text-[10px] text-slate-400">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}