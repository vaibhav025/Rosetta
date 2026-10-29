"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { Mermaid } from "mermaid";
import { changedNodeIds, mermaidId, nextNodes, orderedNodes, pathEdges, toMermaid } from "@/lib/flow";
import type { Explanation, FlowGraph, LevelText } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type AskTarget = { nodeId: string; key: string; panel: "before" | "after" };

let loader: Promise<Mermaid> | null = null;

function loadMermaid() {
  loader ??= import("mermaid").then(({ default: mermaid }) => {
    const font = getComputedStyle(document.body).fontFamily;
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      look: "classic",
      securityLevel: "strict",
      suppressErrorRendering: true,
      fontFamily: font,
      htmlLabels: true,
      themeVariables: {
        fontFamily: font,
        fontSize: "14px",
        background: "transparent",
        primaryColor: "#151515",
        primaryTextColor: "#FFFFFF",
        primaryBorderColor: "#C8F53C",
        lineColor: "#737373",
        secondaryColor: "#0B0B0B",
        tertiaryColor: "#0B0B0B",
      },
      flowchart: {
        curve: "basis",
        nodeSpacing: 28,
        rankSpacing: 44,
        htmlLabels: true,
        wrappingWidth: 150,
        padding: 10,
        useMaxWidth: true,
      },
    });
    return mermaid;
  });
  return loader;
}

type DiagramProps = {
  graph: FlowGraph;
  labels: Record<string, string>;
  changed: Set<string>;
  panel: "before" | "after";
  /** Walkthrough: the path to light up; everything else dims. */
  trace?: string[] | null;
  onAsk?: (target: AskTarget) => void;
  /** What selecting a box does, for screen readers. */
  askLabel?: string;
};

/** One graph, drawn by Mermaid from our JSON at one reader's level. */
export function FlowDiagram({ graph, labels, changed, panel, trace, onAsk, askLabel = "Ask why" }: DiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"rendering" | "ready" | "failed">("rendering");
  const [asList, setAsList] = useState(false);
  const wide = useMediaQuery("(min-width: 900px)", true);
  const direction = wide ? "LR" : "TD";
  const renderId = `flow${useId().replace(/[^a-zA-Z0-9]/g, "")}${panel}${direction}`;
  const labelsKey = JSON.stringify(labels);

  useEffect(() => {
    let cancelled = false;
    setStatus("rendering");
    (async () => {
      try {
        const mermaid = await loadMermaid();
        await document.fonts?.ready;
        const { svg } = await mermaid.render(renderId, toMermaid(graph, JSON.parse(labelsKey), changed, direction));
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        decorate(ref.current, graph, JSON.parse(labelsKey), onAsk ? askLabel : null);
        setStatus("ready");
      } catch {
        document.getElementById(`d${renderId}`)?.remove();
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, changed, labelsKey, renderId, direction]);

  // Light up the walkthrough path.
  useEffect(() => {
    const root = ref.current;
    if (status !== "ready" || !root) return;
    const nodes = new Set(trace ?? []);
    const edges = pathEdges(trace ?? []);
    root.toggleAttribute("data-tracing", Boolean(trace?.length));
    root.querySelectorAll<SVGGElement>("g.node").forEach((g) => {
      g.classList.toggle("is-on", nodes.has(g.dataset.node ?? ""));
    });
    root.querySelectorAll<SVGElement>("[data-edge-from]").forEach((el) => {
      el.classList.toggle("is-on", edges.has(`${el.dataset.edgeFrom}>${el.dataset.edgeTo}`));
    });
  }, [trace, status]);

  const fromEvent = (target: EventTarget) => {
    const g = (target as Element).closest<SVGGElement>("g[data-ask]");
    if (g && onAsk) onAsk({ nodeId: g.dataset.node!, key: g.dataset.key!, panel });
  };
  const onClick = (e: MouseEvent) => fromEvent(e.target);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fromEvent(e.target);
  };

  const label = (key: string) => labels[key] ?? key;
  const listId = `${renderId}-steps`;
  const showList = asList || status === "failed";

  return (
    <div className="min-w-0">
      <div
        ref={ref}
        role="group"
        aria-label={`Flowchart, ${panel === "after" ? "after" : "before"} this change`}
        aria-describedby={listId}
        data-panel={panel}
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-hidden={status !== "ready" || undefined}
        className={cn(
          "flow min-h-32 transition-opacity duration-200",
          status === "ready" ? "opacity-100" : "opacity-0",
          status === "failed" && "hidden",
        )}
      />
      {/* Text version, from the same data: always there for screen readers, shown on request or if the chart can't render. */}
      {status !== "failed" && (
        <button
          type="button"
          aria-expanded={asList}
          aria-controls={listId}
          onClick={() => setAsList((v) => !v)}
          className="press mt-2 inline-flex min-h-11 items-center t-small text-fg-3 underline underline-offset-4 hover:text-fg-1 md:min-h-8"
        >
          {asList ? "Hide the list" : "Read the steps as a list"}
        </button>
      )}
      <ol id={listId} className={cn(showList ? "mt-2 grid gap-2" : "sr-only")} aria-label="Step by step">
        {orderedNodes(graph).map((node) => {
          const next = nextNodes(graph, node.id);
          return (
            <li key={node.id} className={cn(showList && "rounded-sm bg-surface-2 px-3 py-2 t-small text-fg-1 shadow-ring")}>
              {label(node.key)}
              {next.length > 0 &&
                `, then ${next.map((n) => (n.labelKey ? `${label(n.node.key)} (${label(n.labelKey)})` : label(n.node.key))).join(" or ")}`}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Tags nodes and edges with our ids, and makes nodes buttons when asking is on. */
function decorate(root: HTMLElement, graph: FlowGraph, labels: Record<string, string>, askLabel: string | null) {
  // Mermaid ids back to ours (they differ only for reserved words).
  const ours = (id: string) => graph.nodes.find((n) => mermaidId(n.id) === id)?.id ?? id;
  root.querySelectorAll<SVGGElement>("g.node").forEach((g) => {
    const id = g.dataset.id ?? g.id.match(/flowchart-(.+)-\d+$/)?.[1];
    const node = graph.nodes.find((n) => mermaidId(n.id) === id);
    if (!node) return;
    g.dataset.node = node.id;
    g.dataset.key = node.key;
    if (askLabel) {
      g.dataset.ask = "";
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `${askLabel}: ${labels[node.key] ?? node.key}`);
    }
  });
  // Edge paths and their labels carry data-id = L_<from>_<to>_<n>.
  root.querySelectorAll<SVGElement>("[data-id^='L_']").forEach((el) => {
    const [, from, to] = (el.dataset.id ?? "").split("_");
    if (!from || !to) return;
    const target = el.closest("g.edgeLabel") ?? el;
    (target as SVGElement).dataset.edgeFrom = ours(from);
    (target as SVGElement).dataset.edgeTo = ours(to);
  });
}

/* ------------------------------------------------------------------ */

type HowProps = {
  explanation: Explanation;
  level: LevelText;
  onAsk?: (target: AskTarget) => void;
  askLabel?: string;
  askHint?: string;
};

/**
 * "How it works": the before/after flowchart plus a worked example that
 * lights up its path one step at a time.
 */
export function HowItWorks({ explanation, level, onAsk, askLabel, askHint = "Select any box to ask why." }: HowProps) {
  const { before, after } = explanation.flow;
  const changed = useMemo(() => changedNodeIds(before, after), [before, after]);
  const [panel, setPanel] = useState<"before" | "after">("after");
  const steps = explanation.walkthrough?.steps ?? [];
  const texts = level.walkthrough?.steps ?? [];
  const hasWalk = panel === "after" && steps.length > 0 && texts.length === steps.length;
  const [step, setStep] = useState<number | null>(null);
  const trace = hasWalk && step !== null ? steps[step].path : null;

  return (
    <section aria-labelledby="how-heading" className="how-card rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="how-heading" className="t-heading text-fg-1">
            How it works
          </h2>
          <p className="mt-1 t-small text-fg-3">
            {panel === "after" ? "After this change." : "Before this change."}
            {onAsk && ` ${askHint}`}
          </p>
        </div>
        {before ? (
          <div role="group" aria-label="Show the flow before or after this change" className="inline-grid grid-cols-2 rounded-full bg-surface-2 p-1 shadow-ring">
            {(["before", "after"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={panel === p}
                onClick={() => {
                  setPanel(p);
                  setStep(null);
                }}
                className={cn(
                  "press h-8 rounded-full px-4 t-small font-medium",
                  panel === p ? "bg-surface-1 text-fg-1 shadow-elev-1" : "text-fg-2 hover:text-fg-1",
                )}
              >
                {p === "before" ? "Before" : "After"}
              </button>
            ))}
          </div>
        ) : (
          <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 t-micro text-fg-2">New</span>
        )}
      </div>

      <div className="mt-6">
        <FlowDiagram
          key={panel}
          graph={panel === "after" ? after : before!}
          labels={level.labels}
          changed={panel === "after" ? changed : new Set()}
          panel={panel}
          trace={trace}
          onAsk={onAsk}
          askLabel={askLabel}
        />
      </div>

      {hasWalk && (
        <div className="how-walk mt-8 rounded-sm bg-surface-2 p-5 shadow-ring">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="t-body font-semibold text-fg-1">{level.walkthrough!.title}</h3>
            <div className="flex items-center gap-1" aria-hidden>
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-2 rounded-full transition-[background-color] duration-150",
                    step !== null && i <= step ? "bg-accent" : "bg-(--ring-strong)",
                  )}
                />
              ))}
            </div>
          </div>
          <p className="mt-3 min-h-[3.2em] t-body text-fg-1" aria-live="polite">
            {step === null ? (
              <span className="text-fg-2">Step through a real example and watch its path light up in the chart.</span>
            ) : (
              <>
                <span className="t-small font-medium text-fg-3">
                  Step {step + 1} of {steps.length}.{" "}
                </span>
                {texts[step]}
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {step === null ? (
              <Button variant="primary" onClick={() => setStep(0)}>
                Start the example
              </Button>
            ) : (
              <>
                <Button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, (s ?? 0) - 1))}>
                  Previous
                </Button>
                {step < steps.length - 1 ? (
                  <Button variant="primary" onClick={() => setStep((s) => (s ?? 0) + 1)}>
                    Next step
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setStep(0)}>
                    Play again
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setStep(null)}>
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
