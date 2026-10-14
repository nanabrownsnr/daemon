"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SegmentedControl from "./segmented-control";
import { Button, TextInput } from "@/app/ui";

export type AgentProfile = {
  id: string;
  agent_type: string;
  agent_label: string | null;
  agent_role: string | null;
  agent_description: string | null;
  project_path: string | null;
};

export default function AgentModal({
  chatId,
  personId,
  isSolo = false,
  binding,
}: {
  chatId: string;
  personId: string;
  isSolo?: boolean;
  binding?: AgentProfile;
}) {
  const editing = Boolean(binding);
  const [open, setOpen] = useState(false);
  const [agentType, setAgentType] = useState(binding?.agent_type ?? "claude_code");
  const [agentLabel, setAgentLabel] = useState(binding?.agent_label ?? "");
  const [agentRole, setAgentRole] = useState(binding?.agent_role ?? "");
  const [agentDescription, setAgentDescription] = useState(binding?.agent_description ?? "");
  const [projectPath, setProjectPath] = useState(binding?.project_path ?? "");
  const [fullAccessAcknowledged, setFullAccessAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  function showModal() {
    setAgentType(binding?.agent_type ?? "claude_code");
    setAgentLabel(binding?.agent_label ?? "");
    setAgentRole(binding?.agent_role ?? "");
    setAgentDescription(binding?.agent_description ?? "");
    setProjectPath(binding?.project_path ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const label = agentLabel.trim();
    if (isSolo && !label) {
      setError("Give this Solo agent a name so other agents can mention it.");
      setLoading(false);
      return;
    }
    if (!editing && isSolo && !fullAccessAcknowledged) {
      setError("Acknowledge local access before adding this Solo agent.");
      setLoading(false);
      return;
    }

    if (label) {
      let duplicateQuery = supabase
        .from("agent_binding")
        .select("id, agent_label")
        .eq("chat_id", chatId)
        .eq("person_id", personId);
      if (binding) duplicateQuery = duplicateQuery.neq("id", binding.id);
      const { data: duplicates, error: duplicateError } = await duplicateQuery;
      if (duplicateError) {
        setError(`Could not check whether that name is available: ${duplicateError.message}`);
        setLoading(false);
        return;
      }
      if (duplicates?.some((candidate) => candidate.agent_label?.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
        setError("Use a unique name for each of your agents in this chat.");
        setLoading(false);
        return;
      }
    }

    const profile = {
      agent_label: label || null,
      agent_role: agentRole.trim() || null,
      agent_description: agentDescription.trim() || null,
    };
    const result = binding
      ? await supabase.from("agent_binding").update(profile).eq("id", binding.id).eq("person_id", personId)
      : await supabase.from("agent_binding").insert({
          chat_id: chatId,
          person_id: personId,
          agent_type: agentType,
          ...profile,
          project_path: projectPath.trim() || null,
          mode: "advice",
        });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    setOpen(false);
    setFullAccessAcknowledged(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={showModal}
        className={editing
          ? "text-xs text-neutral-500 hover:text-neutral-200 transition-colors"
          : "text-xs text-neutral-500 hover:text-neutral-300 transition-colors"}
        aria-label={editing ? `Edit ${binding?.agent_label ?? "agent"} profile` : "Add agent"}
      >
        {editing ? "Edit profile" : "+ add"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close agent profile editor" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{editing ? "Edit agent profile" : "Add your agent"}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 hover:text-neutral-300 text-lg leading-none" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {!editing && (
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Agent type</label>
                  <SegmentedControl
                    value={agentType}
                    onChange={setAgentType}
                    options={[{ value: "claude_code", label: "Claude Code" }, { value: "codex_cli", label: "Codex CLI" }]}
                    ariaLabel="Agent type"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Name</label>
                <TextInput
                  type="text"
                  placeholder="e.g. Backend specialist"
                  value={agentLabel}
                  onChange={(event) => setAgentLabel(event.target.value)}
                  maxLength={80}
                  required={isSolo}
                />
                {isSolo && <p className="text-xs text-neutral-600 mt-1">Other agents use this name when handing work to this agent.</p>}
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Role <span className="text-neutral-600">(optional)</span></label>
                <TextInput
                  type="text"
                  placeholder="e.g. Backend and database engineer"
                  value={agentRole}
                  onChange={(event) => setAgentRole(event.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Description <span className="text-neutral-600">(optional)</span></label>
                <textarea
                  value={agentDescription}
                  onChange={(event) => setAgentDescription(event.target.value)}
                  maxLength={1200}
                  rows={4}
                  placeholder="Describe what this agent is good at, what it owns, and useful boundaries."
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-neutral-500"
                />
                <p className="text-xs text-neutral-600 mt-1">Shared with the other agents in this Solo chat to help them route work.</p>
              </div>
              {!editing && (
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Project path <span className="text-neutral-600">(optional)</span></label>
                  <TextInput
                    type="text"
                    placeholder="/home/you/code/my-project"
                    value={projectPath}
                    onChange={(event) => setProjectPath(event.target.value)}
                  />
                  <p className="text-xs text-neutral-600 mt-1">Absolute path on your machine where the connector will run.</p>
                </div>
              )}
              {!editing && isSolo && (
                <label className="flex items-start gap-2 rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">
                  <input
                    type="checkbox"
                    checked={fullAccessAcknowledged}
                    onChange={(event) => setFullAccessAcknowledged(event.target.checked)}
                    className="mt-0.5 accent-amber-400"
                  />
                  <span>I understand that mentioning this Solo agent lets it run commands, modify files, manage processes and access the network with my local user&apos;s permissions.</span>
                </label>
              )}
              {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="quiet" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? "Saving..." : editing ? "Save profile" : "Add agent"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
