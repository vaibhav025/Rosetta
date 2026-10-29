"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { githubReason, goTo, useGithubReturn } from "@/lib/github-app";
import { FOCUS_OPTIONS, isLead, isTechnical, roleNoun } from "@/lib/roles";
import { useSession } from "@/lib/session";
import type { Focus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Page } from "./app-shell";
import { Button } from "./button";
import { Field } from "./form";
import { VerifiedMark } from "./github";
import { DeleteAccount, YourData } from "./privacy-settings";

/** Your name and preferences. Your role is set by whoever added you. */
export function Profile() {
  const { user, org, updateProfile, refreshUser } = useSession();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [github, setGithub] = useState("");
  const [teamName, setTeamName] = useState("");
  const [focus, setFocus] = useState<Focus[]>([]);
  const [language, setLanguage] = useState<"en" | "hinglish">("en");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setTitle(user.title ?? "");
    setGithub(user.githubLogin ?? "");
    setTeamName(user.teamName ?? "");
    setFocus(user.focus);
    setLanguage(user.language);
  }, [user]);

  // GitHub sends the browser back here after "Link GitHub".
  useGithubReturn(({ ok, reason }) => {
    toast(ok ? "GitHub account linked. Your pushes are matched to you." : githubReason(reason, "link"));
    if (ok) refreshUser().catch(() => {});
  });

  if (!user) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        name: name.trim(),
        title: title.trim(),
        githubLogin: github.trim(),
        ...(user.role === "manager" ? { teamName: teamName.trim() } : {}),
        focus,
        language,
      });
      toast("Profile saved.");
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? err.detail.replace(/^✖ /gm, "") : "That didn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Profile and preferences" lead={`You read Rosetta as ${roleNoun(user.role)}${org ? ` at ${org.name}` : ""}. Your role is set by whoever added you.`}>
      <form onSubmit={onSubmit} className="grid max-w-[40rem] gap-6 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
        <Field label="Name" name="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" name="email" type="email" autoComplete="email" value={user.email} readOnly hint="Your email is your login." />
        <Field label="Job title" name="title" optional autoComplete="organization-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        {user.role === "manager" && <Field label="Team name" name="teamName" optional value={teamName} onChange={(e) => setTeamName(e.target.value)} />}
        {(isTechnical(user.role) || user.role === "manager") && (
          <Field
            label="GitHub username"
            name="githubLogin"
            optional
            value={github}
            onChange={(e) => setGithub(e.target.value)}
            hint={
              user.githubVerified && github.trim().toLowerCase() === (user.githubLogin ?? "").toLowerCase()
                ? "Verified on GitHub. Changing it unlinks your GitHub account."
                : "Your commits and comments are matched to you by this."
            }
            autoCapitalize="off"
            spellCheck={false}
          />
        )}
        <fieldset>
          <legend className="t-small font-medium text-fg-1">What do you care about most?</legend>
          <p className="mt-1 t-small text-fg-3">Shapes the &ldquo;For you&rdquo; note on every change.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {FOCUS_OPTIONS.map((o) => (
              <label
                key={o.key}
                className="press inline-flex h-10 cursor-pointer items-center rounded-full bg-surface-2 px-4 t-small font-medium text-fg-2 shadow-ring has-[:checked]:bg-(--btn-primary-bg) has-[:checked]:text-(--btn-primary-fg) has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={focus.includes(o.key)}
                  onChange={() => setFocus((f) => (f.includes(o.key) ? f.filter((x) => x !== o.key) : [...f, o.key]))}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {/* Hinglish versions are written for the non-technical levels only. */}
        {!isTechnical(user.role) && (
          <fieldset>
            <legend className="t-small font-medium text-fg-1">Language for your notes and messages</legend>
            <p className="mt-1 t-small text-fg-3">Hinglish rewrites explanations, notes and replies for you in Hindi and English, in Latin script.</p>
            <div className="mt-3 inline-grid grid-cols-2 rounded-sm bg-surface-2 p-1 shadow-ring">
              {(["en", "hinglish"] as const).map((l) => (
                <label
                  key={l}
                  className={cn(
                    "press grid h-9 cursor-pointer place-items-center rounded-full px-5 t-small font-medium text-fg-2",
                    "has-[:checked]:bg-surface-1 has-[:checked]:text-fg-1 has-[:checked]:shadow-elev-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                  )}
                >
                  <input type="radio" name="language" className="sr-only" checked={language === l} onChange={() => setLanguage(l)} />
                  {l === "en" ? "English" : "Hinglish"}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && (
          <p role="alert" className="t-small font-medium whitespace-pre-line text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={saving} className="justify-self-start">
          Save profile
        </Button>
      </form>
      {user.role !== "client" && <GithubAccount />}
      {isLead(user.role) && <PushEmails />}
      <ChangePassword />
      <YourData />
      <DeleteAccount />
    </Page>
  );
}

function ChangePassword() {
  const { changePassword } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("Use at least 8 characters.");
    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      toast("Password changed.");
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? err.detail.replace(/^✖ /gm, "") : "That didn't save. Try again in a minute.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 grid max-w-[40rem] gap-6 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8" aria-labelledby="password-heading">
      <h2 id="password-heading" className="t-heading text-fg-1">
        Password
      </h2>
      <Field label="Current password" name="current-password" required type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Field label="New password" name="new-password" required type="password" autoComplete="new-password" hint="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} />
      {error && (
        <p role="alert" className="t-small font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" loading={saving} disabled={!current || !next} className="justify-self-start">
        Change password
      </Button>
    </form>
  );
}

/** Prove which GitHub account is yours, so your pushes are matched to you. */
function GithubAccount() {
  const { user, unlinkGithub } = useSession();
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const verified = Boolean(user.githubVerified);

  const link = async () => {
    setLinking(true);
    setError(null);
    try {
      goTo((await api.githubLinkUrl()).url);
    } catch (e) {
      setLinking(false);
      setError(
        e instanceof ApiError && e.code === "unavailable"
          ? (e.detail ?? "Linking GitHub accounts isn't set up for Rosetta yet.")
          : errorText(e, "Couldn't reach GitHub right now. Try again in a minute."),
      );
    }
  };

  const unlink = async () => {
    setUnlinking(true);
    setError(null);
    try {
      await unlinkGithub();
      toast("GitHub account unlinked. Your username stays until you change it.");
    } catch (e) {
      setError(errorText(e, "That didn't save. Try again in a minute."));
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <section aria-labelledby="github-account-heading" className="mt-6 grid max-w-[40rem] gap-4 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="github-account-heading" className="t-heading text-fg-1">
          GitHub account
        </h2>
        {verified && (
          <span className="inline-flex h-6 items-center gap-1 rounded-xs bg-[color-mix(in_srgb,var(--risk-low)_10%,transparent)] tone-pill px-2 t-micro font-medium text-(--risk-low)">
            <VerifiedMark />
            Verified
          </span>
        )}
      </div>
      <p className="t-small text-fg-2">
        {verified ? (
          <>
            Linked as <span className="font-mono font-medium text-fg-1">@{user.githubLogin}</span>. Pushes from this account are matched to you.
          </>
        ) : (
          "Log in to GitHub once so Rosetta knows which pushes are yours. Nobody can claim your work by typing your username."
        )}
      </p>
      {error && (
        <p role="alert" className="t-small font-medium text-danger">
          {error}
        </p>
      )}
      <div>
        {verified ? (
          <Button onClick={unlink} loading={unlinking}>
            Unlink GitHub
          </Button>
        ) : (
          <Button variant="primary" onClick={link} loading={linking}>
            Link GitHub
          </Button>
        )}
      </div>
    </section>
  );
}

/** Managers and CMOs: an email each time a teammate's push is explained. */
function PushEmails() {
  const { user, updateProfile } = useSession();
  // Flips at once; goes back if saving fails. On unless turned off.
  const [on, setOn] = useState(user?.notifyEmailOnPush !== false);
  const [saving, setSaving] = useState(false);
  useEffect(() => setOn(user?.notifyEmailOnPush !== false), [user?.notifyEmailOnPush]);
  if (!user) return null;

  const change = async (next: boolean) => {
    setOn(next);
    setSaving(true);
    try {
      await updateProfile({ notifyEmailOnPush: next });
      toast(next ? "You'll get an email when a teammate's push is explained." : "No more emails for each push. They still reach your bell.");
    } catch {
      setOn(!next);
      toast("That didn't save. Try again in a minute.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="push-emails-heading" className="mt-6 grid max-w-[40rem] gap-4 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      <h2 id="push-emails-heading" className="t-heading text-fg-1">
        Emails
      </h2>
      <label className="flex cursor-pointer items-start gap-3 t-small text-fg-1">
        <input
          type="checkbox"
          checked={on}
          aria-busy={saving || undefined}
          onChange={(e) => change(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-(--btn-primary-bg)"
        />
        <span>
          Email me when a teammate&rsquo;s push is explained
          <span className="block t-micro text-fg-3">Each one also appears in your notifications either way.</span>
        </span>
      </label>
    </section>
  );
}
