"use client";

import Link from "next/link";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { SAMPLES } from "@/lib/mock/samples";
import { ROLES } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { cn, firstName } from "@/lib/utils";
import { AccountNav } from "./account-nav";
import { buttonStyles } from "./button";
import { GitHubIcon } from "./icons";
import { HowItWorks as FlowWalkthrough } from "./flowchart";
import { Reveal } from "./motion/reveal";
import { ChevronsIcon, LogoMark } from "./logo";
import { MiniDemo } from "./mini-demo";
import { InView } from "./motion/in-view";
import { Nav } from "./nav";
import { SOURCE_URL } from "@/lib/legal";
import { SiteFooter } from "./site-footer";
import { ThemeToggle } from "./theme-toggle";

const DEMO = SAMPLES[0].card.explanation;

/** Home: what Rosetta is, who it's for, and the way in. */
export function LandingView() {
  // Arriving here right after deleting an account.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("deleted") !== "1") return;
    toast("Your account is deleted.");
    window.history.replaceState(null, "", "/");
  }, []);

  return (
    <>
      <Nav>
        <AccountNav />
        <ThemeToggle />
      </Nav>
      <main id="main" tabIndex={-1}>
        <Hero />
        <Gap />
        <Readers />
        <SeeItWork />
        <HowItWorks />
        <AskWhy />
        <Promises />
        <Pricing />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------ */

/** On the lime card the primary turns black and the secondary goes dark-on-lime. */
const ON_LIME_PRIMARY = "cta-slide bg-neutral-950! text-white! shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]! not-disabled:hover:bg-neutral-800!";
const ON_LIME_SECONDARY = "bg-black/5! text-neutral-950! shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]! hover:bg-black/10!";

function Ctas({ align = "start", onLime = false }: { align?: "start" | "center"; onLime?: boolean }) {
  const { user, status } = useSession();
  return (
    <div className={cn("flex flex-wrap items-center gap-3", align === "center" && "justify-center")}>
      {user ? (
        <Link href="/app" className={cn(buttonStyles({ variant: "primary" }), "h-12 px-6", onLime && ON_LIME_PRIMARY)}>
          {onLime && <CtaArrow />}
          <span className="cta-label">Open Rosetta</span>
        </Link>
      ) : (
        <>
          <Link href="/signup" className={cn(buttonStyles({ variant: "primary" }), "h-12 px-6", onLime && ON_LIME_PRIMARY)}>
            {onLime && <CtaArrow />}
            <span className="cta-label">Create a workspace</span>
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonStyles({ variant: "secondary", dot: true }),
              "h-12 px-6",
              onLime && ON_LIME_SECONDARY,
              status === "loading" && "invisible",
            )}
          >
            Log in
          </Link>
        </>
      )}
    </div>
  );
}

/** Decorative arrow that slides in from the left on hover (no text, no name change). */
function CtaArrow() {
  return (
    <svg aria-hidden className="cta-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h15m0 0-6-6m6 6-6 6" />
    </svg>
  );
}

function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className="relative isolate overflow-x-clip">
      <div className={cn("mx-auto max-w-(--w-app) px-(--gutter) py-16 md:py-[72px]", className)}>{children}</div>
    </section>
  );
}

/** Eyebrow pill, big headline on the left, short gray paragraph on the right of the same row. */
function SectionHead({
  eyebrow,
  title,
  children,
  stacked = false,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  stacked?: boolean;
}) {
  return (
    <Reveal className={cn("grid gap-6", !stacked && "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16")}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="mt-6 t-title text-balance text-fg-1">{title}</h2>
      </div>
      {children && (
        <p className={cn("max-w-[28rem] t-small leading-relaxed text-pretty text-fg-2", !stacked && "lg:justify-self-end lg:pb-2")}>
          {children}
        </p>
      )}
    </Reveal>
  );
}

const card = "panel rounded-lg";

/* ---------- 1. Hero: the slider is the picture ---------- */

function Hero() {
  const { user } = useSession();
  return (
    <section className="relative isolate -mt-(--nav-h) overflow-hidden pt-(--nav-h)">
      <div className="mx-auto grid max-w-(--w-app) items-center gap-14 px-(--gutter) pt-16 pb-24 md:pt-24 lg:min-h-[calc(100svh-var(--nav-h))] lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20">
        <Reveal>
          <h1 className="t-display text-balance text-fg-1">
            Every commit, <em>explained</em> for {user ? `${firstName(user.name)}.` : "whoever's reading."}
          </h1>
          <p className="mt-6 max-w-[32rem] t-body leading-relaxed text-pretty text-fg-2">
            Your engineers push code. Rosetta explains every change and sends it up the chain: the manager reads
            it as a manager, the CMO as a CMO. Questions go straight back to the engineer who wrote it.
          </p>
          <div className="mt-10">
            <Ctas />
          </div>
          <p className="mt-5 t-mono text-fg-3">
            Got an invite from your manager?{" "}
            <Link href="/join" className="text-fg-1 underline decoration-(--accent-ink) underline-offset-4">
              Join your team
            </Link>
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <MiniDemo />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- 2. The gap ---------- */

function Gap() {
  return (
    <Section>
      <SectionHead eyebrow="the gap" title={<>Code is a language only <em>half</em> the room speaks.</>}>
        Engineers ship work every day that the people who plan, pay for and sell it can&rsquo;t read. So they ask
        vague questions, wait for answers, and decide without knowing what changed or how risky it is.
      </SectionHead>

      <Reveal className="mt-14 grid items-stretch gap-4 card:grid-cols-[1fr_auto_1fr]">
        <InView as="figure" className={cn(card, "p-6 sm:p-8")}>
          <figcaption className="t-mono text-fg-3">What the diff says</figcaption>
          <pre className="mt-4 overflow-x-auto t-code text-fg-2">
            <code>
              <span className="text-fg-3">src/balancer.js</span>
              {"\n"}
              <span className="text-fg-3">-   return servers[0];</span>
              {"\n"}
              <span className="diff-add iv text-fg-1" style={{ "--i": 0 } as CSSProperties}><span className="text-accent-ink">+</span> function pickNextServer() {"{"}</span>
              {"\n"}
              <span className="diff-add iv text-fg-1" style={{ "--i": 1 } as CSSProperties}><span className="text-accent-ink">+</span>   current = (current + 1) % servers.length;</span>
              {"\n"}
              <span className="diff-add iv text-fg-1" style={{ "--i": 2 } as CSSProperties}><span className="text-accent-ink">+</span>   return servers[current];</span>
              {"\n"}
              <span className="diff-add iv text-fg-1" style={{ "--i": 3 } as CSSProperties}><span className="text-accent-ink">+</span> {"}"}</span>
            </code>
          </pre>
        </InView>

        <OrbitTile />

        <figure className={cn(card, "panel-lime flex flex-col p-6 sm:p-8")}>
          <figcaption className="t-mono text-fg-3">What your manager reads</figcaption>
          <p className="mt-4 t-summary text-pretty text-fg-1">{DEMO.levels.manager.summary}</p>
          <p className="relative mt-4 pl-4 t-small leading-relaxed text-fg-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:rounded-full before:bg-accent">
            {DEMO.levels.manager.analogy}
          </p>
        </figure>
      </Reveal>
    </Section>
  );
}

/* ---------- 3. Six readers ---------- */

function Readers() {
  return (
    <Section id="readers">
      <SectionHead eyebrow="six readers" title={<>Six roles, six <em>different</em> views.</>}>
        Your role decides what you see and how it&rsquo;s written. An engineer gets function names; their manager gets
        impact and risk; the CMO gets customers and campaigns. Same commit, nobody reads the wrong version.
      </SectionHead>

      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((role, i) => (
          <li key={role.key} className="flex">
          <Reveal delay={(i % 3) * 0.06} className={cn(card, "lift flex w-full flex-col p-7", (i === 0 || i === ROLES.length - 1) && "panel-lime")}>
            <h3 className="flex items-center gap-2.5 t-heading text-fg-1">
              <span aria-hidden className={cn("size-1.5 rounded-full", i === 0 ? "breathe-dot bg-accent shadow-[0_0_10px_var(--accent-glow)]" : "bg-fg-3")} />
              {role.label}
            </h3>
            <p className="mt-1 t-mono text-fg-3">{role.description}</p>
            <p className="mt-6 border-t border-(--ring) pt-5 t-small leading-relaxed text-pretty text-fg-2">
              <span className="sr-only">Example: </span>
              {DEMO.levels[role.key].summary}
            </p>
          </Reveal>
          </li>
        ))}
      </ul>
      <p className="mt-6 t-mono text-fg-3">Each example explains the same commit: a round-robin load balancer.</p>
    </Section>
  );
}

/* ---------- 3b. A real explanation, with its worked example ---------- */

function SeeItWork() {
  return (
    <Section>
      <SectionHead eyebrow="see it work" title={<>Not three boxes. The <em>actual</em> mechanism.</>}>
        Every change comes with a before-and-after flowchart of how it really works, and a worked example. Step
        through it and watch each request take its path. This is the round-robin commit, as a manager reads it.
      </SectionHead>
      <Reveal className="landing-flow mt-14">
        <FlowWalkthrough explanation={DEMO} level={DEMO.levels.manager} />
      </Reveal>
    </Section>
  );
}

/* ---------- 4. How it works, drawn with the real UI ---------- */

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <li className={cn(card, "step-in iv lift flex flex-col p-3")} style={{ "--i": n - 1 } as CSSProperties}>
      <div
        aria-hidden
        className="flex h-48 items-center justify-center rounded-[20px] bg-[radial-gradient(var(--ring-strong)_1px,transparent_1px)] bg-size-[16px_16px] p-6 shadow-[inset_0_0_0_1px_var(--ring)]"
      >
        {children}
      </div>
      <div className="p-4 pt-6">
        <p className="t-mono text-fg-3">Step {n}</p>
        <h3 className="mt-2 t-heading text-fg-1">{title}</h3>
        <p className="mt-2 t-small leading-relaxed text-pretty text-fg-2">{body}</p>
      </div>
    </li>
  );
}

function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHead eyebrow="how it works" title={<>Nobody pastes links, nobody <em>chases</em> updates.</>} />
      <InView as="ol" className="mt-14 grid gap-4 md:grid-cols-3">
        <Step n={1} title="An engineer pushes code" body="Rosetta watches your repositories. A push by anyone on your team is picked up on its own, through a webhook or a regular check.">
          <div className="explain-pill flex h-12 w-full items-center gap-1 rounded-full bg-white p-1 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]">
            <span className="min-w-0 flex-1 truncate px-3 font-mono text-[0.75rem] text-neutral-500">github.com/…/commit/a3f9c2e</span>
            <span className="grid h-10 place-items-center rounded-full bg-neutral-950 px-4 t-micro font-semibold text-white">
              Explain
            </span>
          </div>
        </Step>
        <Step n={2} title="Rosetta explains it" body="It reads the diff and writes six versions, a detailed before-and-after flowchart, and a worked example you can step through.">
          <InView as="ul" className="grid w-full gap-2.5 t-mono text-fg-1">
            {SAMPLES[0].findings.map((line, i) => (
              <li key={line} className="flex items-center gap-2" style={{ "--i": i } as CSSProperties}>
                <span className="check-dot iv relative grid size-4 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path className="draw iv" pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <span className="truncate">{line.replace(/`/g, "")}</span>
              </li>
            ))}
          </InView>
        </Step>
        <Step n={3} title="It reaches the right people" body="The engineer checks their explanation. Their manager and the CMO see it in their own feed, at their own level, and can ask why.">
          <div className="grid w-full justify-items-start gap-3">
            <span className="inline-flex h-7 items-center gap-2 rounded-full bg-(--btn-secondary-bg) px-3 t-mono text-fg-2 shadow-[inset_0_0_0_1px_var(--ring-strong)]">
              <span className="breathe-dot size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" />
              Reviewed by Arjun
            </span>
            <span className="feed-glow grid h-10 place-items-center rounded-full bg-(--btn-primary-bg) px-5 t-small font-semibold text-(--btn-primary-fg) shadow-[0_6px_24px_-8px_var(--accent-glow)]">
              In Neha&rsquo;s team feed
            </span>
          </div>
        </Step>
      </InView>
    </Section>
  );
}

/* ---------- 5. Ask why ---------- */

function AskWhy() {
  return (
    <Section>
      <div className="grid items-center gap-12 card:grid-cols-2 lg:gap-20">
        <SectionHead stacked eyebrow="ask why" title={<>Questions go back to the person who <em>knows.</em></>}>
          Select any step in the flowchart and ask why. If the code holds the answer, Rosetta gives it at your
          level. If it doesn&rsquo;t, your question goes to the engineer with a technical version attached, and
          their reply comes back rewritten for you. Managers can also check in with anyone directly.
        </SectionHead>

        <Reveal className={cn(card, "panel-lime p-6 sm:p-8")}>
          <p className="t-mono text-fg-3">Asking about</p>
          <p className="mt-1 t-heading text-fg-1">Takes turns</p>
          <div className="mt-6 grid gap-4">
            <p className="justify-self-end rounded-[20px] rounded-br-md bg-(--btn-secondary-hover) px-4 py-2.5 t-small text-fg-1 shadow-[inset_0_0_0_1px_var(--ring)]">
              Will this delay the launch?
            </p>
            <p className="flex items-center gap-2 t-mono text-fg-3">
              <span className="breathe-dot size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" aria-hidden />
              <GitHubIcon size={13} />
              Sent to Arjun, with a technical version
            </p>
            <div className="rounded-[20px] rounded-bl-md px-4 py-3 shadow-[inset_0_0_0_1px_var(--ring-strong)]">
              <p className="t-mono text-fg-3">Arjun replied</p>
              <p className="mt-1 t-small leading-relaxed text-fg-1">
                This won&rsquo;t delay the launch. Arjun tested it under heavy traffic and it&rsquo;s ready for this
                week&rsquo;s release.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ---------- 6. Promises ---------- */

const PROMISES = [
  {
    title: "The engineer stays in control",
    body: "Every card stays a draft until the person who wrote the code reviews it. Leads see drafts marked “Not reviewed yet”; clients only see reviewed work.",
  },
  {
    title: "Your full code isn't kept",
    body: "Diffs are read from GitHub and sent to the AI to explain. Rosetta saves the explanation and a few lines behind each step, not the diff.",
  },
  {
    title: "Every explanation is checked",
    body: "A second model and plain code rules score each one against the real diff, and every box links to the lines behind it.",
  },
];

function Promises() {
  return (
    <Section>
      <ul className="grid gap-4 md:grid-cols-3">
        {PROMISES.map((p, i) => (
          <li key={p.title} className="flex">
            <Reveal delay={i * 0.06} className={cn(card, "w-full p-7")}>
              <InView
                as="span"
                aria-hidden
                className="promise-tile logo-tile float size-10"
                style={{ animationDelay: `${i * -2}s`, "--tile-size": "40px", "--i": i } as CSSProperties}
              >
                {PROMISE_ICONS[i]}
              </InView>
              <h3 className="mt-6 t-body font-semibold text-fg-1">{p.title}</h3>
              <p className="mt-2 t-small leading-relaxed text-fg-2">{p.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- 7. Pricing ---------- */

function Pricing() {
  return (
    <Section id="pricing">
      <Reveal className="spot pricing-card relative mx-auto max-w-[52rem] rounded-lg bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.14),0_0_80px_-20px_var(--accent-glow)] backdrop-blur-xl sm:p-12 md:grid md:grid-cols-[1fr_auto] md:items-end md:gap-10">
        <span aria-hidden className="absolute inset-x-12 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]" />
        <div className="max-w-[36rem]">
          <span className="eyebrow">pricing</span>
          <h2 className="mt-6 t-title text-balance text-fg-1">
            <em>Free</em> while Rosetta is in early access
          </h2>
          <p className="mt-5 t-small leading-relaxed text-fg-2">
            There are no paid plans yet, and nothing asks for payment details. When paid plans arrive, they&rsquo;ll be for the people who write code;
            everyone who reads stays free. Prices, taxes and the refund policy will be shown before anyone pays.
          </p>
        </div>
        <Link href="/refunds" className={cn(buttonStyles({ variant: "outline" }), "mt-8 h-11 justify-self-start md:mt-0")}>
          Refund Policy
        </Link>
      </Reveal>
    </Section>
  );
}

/* ---------- 8. Closing ---------- */

function Closing() {
  const { user } = useSession();
  return (
    <Section>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal className={cn(card, "relative flex min-h-80 flex-col justify-between overflow-hidden p-8 sm:p-10")}>
          <ChevronsIcon size={340} className="watermark-drift pointer-events-none absolute -right-16 -bottom-20 text-fg-1 opacity-[0.04]" />
          <div className="flex items-center gap-2.5 font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-fg-1">
            <LogoMark />
            Rosetta
          </div>
          <div className="relative">
            <p className="max-w-[22rem] t-small leading-relaxed text-fg-2">
              Explain any GitHub commit to anyone, from a senior engineer to your CMO.
            </p>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="press social-btn mt-6 grid size-10 place-items-center rounded-[12px] bg-(--btn-secondary-bg) text-fg-1 shadow-[inset_0_0_0_1px_var(--ring-strong)] hover:bg-(--btn-secondary-hover)"
            >
              <GitHubIcon size={16} />
              <span className="sr-only">Source code (opens GitHub in a new tab)</span>
            </a>
          </div>
        </Reveal>
        <Reveal
          delay={0.08}
          className="lime-glow-card relative overflow-hidden rounded-lg bg-lime p-8 text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.3)_inset,0_30px_120px_-30px_rgba(200,245,60,0.55)] sm:p-12"
        >
          <h2 className="max-w-[30rem] t-title text-balance">
            {user ? (
              <>
                Your team&apos;s latest changes are <em>waiting.</em>
              </>
            ) : (
              <>
                Set up your workspace in two <em>minutes.</em>
              </>
            )}
          </h2>
          <p className="mt-5 max-w-[28rem] t-small leading-relaxed text-neutral-950/70">
            Create it as a CMO or manager, add your people, connect a repository. Or start with a sample team.
          </p>
          <div className="mt-10">
            <Ctas onLime />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}


/* ---------- Decorative visuals ---------- */

/** Arms of the orbit, in degrees; nodes sit at the end of each arm. */
const ORBIT_ARMS = [45, 135, 225, 315];

/**
 * Glossy lime hub (the arrow means "turns into") with four small dark glass
 * nodes orbiting it once a minute. Dotted spokes join each node to the hub;
 * tiny lime dots travel in and back, and the hub pulses as each one lands.
 * Timing is all CSS (motion-landing.css), so the pulse stays in sync.
 */
function OrbitTile() {
  return (
    <InView aria-hidden className="relative grid min-h-36 place-items-center card:w-36">
      <div className="orbit relative size-36">
        <svg viewBox="0 0 144 144" className="absolute inset-0 size-full" fill="none">
          <circle cx="72" cy="72" r="56" stroke="var(--ring-strong)" strokeDasharray="2 5" />
          <circle cx="72" cy="72" r="70" stroke="var(--ring)" strokeDasharray="2 6" />
        </svg>
        <div className="orbit-spin iv absolute inset-0">
          {ORBIT_ARMS.map((deg, i) => (
            <div key={deg} className="orbit-arm" style={{ "--a": `${deg}deg`, "--i": i, "--d": `${i % 2 ? -4 : 0}s` } as CSSProperties}>
              <span className="orbit-spoke" />
              <span className="orbit-dot iv" />
              <span className="orbit-node">
                <span className="orbit-node-face iv" />
              </span>
            </div>
          ))}
        </div>
        <span className="orbit-hub logo-tile iv absolute inset-0 m-auto size-14" style={{ "--tile-size": "56px" } as CSSProperties}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="max-card:rotate-90">
            <path d="M4 12h15m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </InView>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Each stroke draws itself once the tile scrolls in (j staggers the strokes). */
const stroke = (j: number) => ({ className: "draw iv", pathLength: 1, style: { "--j": j } as CSSProperties });

const PROMISE_ICONS = [
  <svg key="control" {...iconProps}>
    <path {...stroke(0)} d="M4 6h10M4 12h16M4 18h7" />
    <circle {...stroke(1)} cx="17" cy="6" r="2" />
    <circle {...stroke(2)} cx="14" cy="18" r="2" />
  </svg>,
  <svg key="lock" {...iconProps}>
    <rect {...stroke(0)} x="5" y="11" width="14" height="9" rx="2.5" />
    <path {...stroke(1)} d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>,
  <svg key="check" {...iconProps}>
    <path {...stroke(0)} d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6Z" />
    <path {...stroke(1)} d="m9 12 2 2 4-4" />
  </svg>,
];
