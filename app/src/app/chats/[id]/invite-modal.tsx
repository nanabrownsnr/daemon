"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, TextInput } from "@/app/ui";

export default function InviteModal({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const { data: found, error: lookupError } = await supabase.rpc(
      "find_person_by_email",
      { lookup_email: email }
    );

    if (lookupError) { setStatus(`Error: ${lookupError.message}`); setLoading(false); return; }
    if (!found || found.length === 0) { setStatus("No account found with that email."); setLoading(false); return; }

    const person = found[0];
    const { error } = await supabase.from("chat_member").insert({ chat_id: chatId, person_id: person.id });

    if (error) { setStatus(`Couldn't add: ${error.message}`); setLoading(false); return; }

    setStatus(`Added ${person.display_name}.`);
    setEmail("");
    setLoading(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setStatus(null); }}
        className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        + add
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          {/* modal */}
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-full max-w-sm space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Add member</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-neutral-500 hover:text-neutral-300 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-3">
              <TextInput
                type="email"
                placeholder="person@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {status && (
                <p className={`text-sm ${status.startsWith("Added") ? "text-green-400" : "text-red-400"}`}>
                  {status}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading}
                >
                  {loading ? "..." : "Add"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
