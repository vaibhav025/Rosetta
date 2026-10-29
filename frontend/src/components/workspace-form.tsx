"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { ConsentFields, focusFirstInvalid } from "./consent-fields";
import { Field, FormShell } from "./form";

const TOP_ROLES = [
  {
    key: "cmo" as const,
    label: "I'm a CMO or business head",
    description: "You'll add managers, who add their engineers. You see every team, explained for a CMO.",
  },
  {
    key: "manager" as const,
    label: "I'm an engineering manager",
    description: "You'll add your engineers and interns. Their pushes reach you explained for a manager.",
  },
];

/** Creating a workspace. Everyone else joins with an invite from their lead. */
export function WorkspaceForm() {
  const router = useRouter();
  const { user, status, createWorkspace } = useSession();
  const [role, setRole] = useState<"cmo" | "manager">("manager");
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "", teamName: "", title: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form | "form" | "terms", string>>>({});
  const [saving, setSaving] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (status === "signed-in" && user) router.replace("/app");
  }, [status, user, router]);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!form.name.trim()) found.name = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) found.email = "Enter an email like you@company.com.";
    if (form.password.length < 8) found.password = "Use at least 8 characters.";
    if (!form.orgName.trim()) found.orgName = "Name your workspace, usually your company.";
    if (!terms) found.terms = "Tick the box to agree to the Terms and confirm you've read the Privacy Policy.";
    setErrors(found);
    if (Object.keys(found).length) return focusFirstInvalid(formRef.current);

    setSaving(true);
    try {
      await createWorkspace({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role,
        orgName: form.orgName.trim(),
        teamName: role === "manager" ? form.teamName.trim() || undefined : undefined,
        title: form.title.trim() || undefined,
        focus: [],
        language: "en",
        acceptTerms: terms,
        marketingOptIn: marketing,
      });
      router.replace("/app");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "unavailable";
      if (code === "conflict") setErrors({ email: "An account with this email already exists. Log in instead." });
      else if (code === "terms_required") setErrors({ terms: "Tick the box to agree to the Terms and confirm you've read the Privacy Policy." });
      else setErrors({ form: code === "network" || code === "timeout" ? "Rosetta can't be reached right now. Check your connection and try again in a minute." : "That didn't work. Check the details and try again." });
      setSaving(false);
    }
  };

  return (
    <FormShell
      title="Create your workspace"
      lead="Start at the top of your organisation. You'll add your people next, and each of them gets their own view."
    >
      <form ref={formRef} noValidate onSubmit={onSubmit} className="grid max-w-[44rem] gap-8 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
        <fieldset>
          <legend className="t-heading text-fg-1">Who are you?</legend>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TOP_ROLES.map((r) => (
              <label
                key={r.key}
                className={cn(
                  "press flex cursor-pointer flex-col gap-1 rounded-sm bg-surface-2 p-4 shadow-ring",
                  "has-[:checked]:shadow-[0_0_0_2px_var(--accent-ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                )}
              >
                <input type="radio" name="role" className="sr-only" checked={role === r.key} onChange={() => setRole(r.key)} />
                <span className="t-body font-semibold text-fg-1">{r.label}</span>
                <span className="t-small text-fg-2">{r.description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="mb-5 t-heading text-fg-1">About you</legend>
          <Field label="Name" name="name" required autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
          <Field label="Work email" name="email" required type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
          <Field
            label="Password"
            name="password"
            required
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            error={errors.password}
            hint="At least 8 characters."
          />
          <Field label="Job title" name="title" optional autoComplete="organization-title" placeholder={role === "cmo" ? "Chief marketing officer" : "Engineering manager"} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </fieldset>

        <fieldset className="grid gap-5">
          <legend className="mb-5 t-heading text-fg-1">Your workspace</legend>
          <Field label="Company or workspace name" name="orgName" required autoComplete="organization" placeholder="Acme" value={form.orgName} onChange={(e) => set("orgName", e.target.value)} error={errors.orgName} />
          {role === "manager" && (
            <Field label="Team name" name="teamName" optional placeholder="Payments" value={form.teamName} onChange={(e) => set("teamName", e.target.value)} />
          )}
        </fieldset>

        <ConsentFields
          terms={terms}
          marketing={marketing}
          onTerms={(v) => {
            setTerms(v);
            setErrors((e) => ({ ...e, terms: undefined }));
          }}
          onMarketing={setMarketing}
          error={errors.terms}
        />

        {errors.form && (
          <p role="alert" className="t-small font-medium text-danger">
            {errors.form}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="t-small text-fg-2">
            Got an invite code?{" "}
            <Link href="/join" className="font-medium text-fg-1 underline underline-offset-4">
              Join your team
            </Link>
          </p>
          <Button type="submit" variant="primary" loading={saving} className="h-11 px-6">
            Create workspace
          </Button>
        </div>
      </form>
    </FormShell>
  );
}
