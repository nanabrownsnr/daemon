"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AgentModal({
  chatId,
  personId,
  isSolo = false,
}: {
  chatId: string;
  personId: string;
  isSolo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [agentType, setAgentType] = useState("claude_code");
  const [agentLabel, setAgentLabel] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isSolo) {
      const { data: existing } = await supabase
        .from("agent_binding")
        .select("id")
        .eq("chat_id", chatId)
        .ilike("agent_label", agentLabel.trim());
      if (existing?.length) {
        setError("Use a unique label for each Solo agent.");
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.from("agent_binding").insert({
      chat_id: chatId,
      person_id: personId,
      agent_type: agentType,
      agent_label: agentLabel || null,
      project_path: projectPath || null,
      mode: "advice",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setOpen(false);
    setAgentType("claude_code");
    setAgentLabel("");
    setProjectPath("");
    setLoading(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        + add
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-full max-w-sm space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Add your agent</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-neutral-300 text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Agent type</label>
                <select
                  value={agentType}
                  onChange={(e) => setAgentType(e.target.value)}
                  className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-300"
                >
                  <option value="claude_code">Claude Code</option>
                  <option value="codex_cli">Codex CLI</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Label <span className="text-neutral-600">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. Backend agent"
                  value={agentLabel}
                  onChange={(e) => setAgentLabel(e.target.value)}
                  required={isSolo}
                  className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                />
                {isSolo && <p className="text-xs text-neutral-600 mt-1">Required so you can mention this agent directly.</p>}
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Project path <span className="text-neutral-600">(optional)</span></label>
                <input
                  type="text"
                  placeholder="/home/you/code/my-project"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm font-mono"
                />
                <p className="text-xs text-neutral-600 mt-1">Absolute path on your machine where the connector will run.</p>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-1.5 text-sm rounded bg-neutral-100 text-neutral-900 font-medium disabled:opacity-50">
                  {loading ? "..." : "Add agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
