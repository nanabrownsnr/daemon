import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { getAuthenticatedClient, getConnectorAppUrl, hasSavedLogin } from "./auth.js";

function commandVersion(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr).trim().split("\n")[0];
}

function report(ok, message) {
  console.log(`${ok ? "✓" : "✗"} ${message}`);
  return ok;
}

export async function doctor() {
  console.log("groupwork connector doctor\n");
  const results = [];
  results.push(report(Boolean(process.versions.node), `Node.js ${process.versions.node}`));
  results.push(report(hasSavedLogin(), "Saved groupwork login"));

  let bindings = [];
  if (hasSavedLogin()) {
    try {
      const supabase = await getAuthenticatedClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("No user");
      results.push(report(true, `Authenticated as ${user.email}`));
      const { data: person } = await supabase
        .from("person")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      const { data, error } = person
        ? await supabase
            .from("agent_binding")
            .select("agent_type, agent_label, project_path")
            .eq("person_id", person.id)
        : { data: null, error: new Error("Person record not found") };
      if (error) throw error;
      bindings = data ?? [];
      results.push(report(bindings.length > 0, `${bindings.length} agent binding(s) found`));
    } catch (error) {
      results.push(report(false, `groupwork connection: ${error.message}`));
    }
  }

  const neededTypes = new Set(bindings.map((binding) => binding.agent_type));
  if (neededTypes.size === 0 || neededTypes.has("claude_code")) {
    const version = commandVersion("claude");
    results.push(report(Boolean(version), version ? `Claude Code: ${version}` : "Claude Code not found"));
  }
  if (neededTypes.size === 0 || neededTypes.has("codex_cli")) {
    const version = commandVersion("codex");
    results.push(report(Boolean(version), version ? `Codex CLI: ${version}` : "Codex CLI not found"));
  }

  for (const binding of bindings) {
    const label = binding.agent_label ?? binding.agent_type;
    results.push(report(
      Boolean(binding.project_path && existsSync(binding.project_path)),
      `${label} project: ${binding.project_path ?? "not configured"}`,
    ));
  }

  try {
    const appUrl = getConnectorAppUrl();
    const response = await fetch(appUrl, { method: "HEAD" });
    results.push(report(response.ok, `Website reachable: ${appUrl}`));
  } catch {
    results.push(report(false, `Website unreachable: ${getConnectorAppUrl()}`));
  }

  const ok = results.every(Boolean);
  console.log(ok ? "\nReady to start." : "\nFix the failed checks, then run doctor again.");
  return ok;
}
