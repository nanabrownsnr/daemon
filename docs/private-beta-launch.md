# Private-beta launch checklist

## Email confirmation boundary

For the private test, keep signup limited to known people and email
confirmation disabled. Supabase's default SMTP on new free-tier projects cannot
deliver to arbitrary users and does not allow editing the confirmation template.

Before opening signup to external users, configure custom SMTP and then:

1. In Supabase Authentication URL Configuration, set **Site URL** to the
   deployed HTTPS groupwork origin. Keep localhost only as an additional
   development redirect URL.
2. In the **Confirm signup** email template, make the confirmation link:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm email</a>
   ```

3. Enable email confirmation, create a brand-new account, follow the email
   link, and confirm it lands on `/connector` while signed in.

The `/auth/confirm` route exchanges the one-time token for the cookie-backed
Supabase session. A default SSR-incompatible email template may verify the
address without establishing the web session correctly.

## Database

Apply the current runbooks before deploying the matching app and connector:

1. `docs/sql/solo-multi-agent.sql`
2. `docs/sql/team-run-approval.sql`
3. `docs/sql/edit-agent-message-atomic.sql`
4. `docs/sql/send-message-atomic.sql`
5. `docs/sql/chat-context-summary.sql`
6. `docs/sql/topic-classification.sql`
7. `docs/sql/chat-github-link.sql`
8. `docs/sql/connector-workspace-errors.sql`
9. `docs/sql/solo-agent-profiles.sql`
10. `docs/sql/solo-agent-handoffs.sql`

Re-running these current runbooks is intended to be safe, but use the existing
private-beta project and review SQL errors rather than skipping a failed step.

## New-computer acceptance test

1. Install and authenticate Claude Code or Codex CLI.
   Install the CLI inside the same Linux, WSL, Git Bash, or macOS environment
   where `groupwork-connect` will run; installing a desktop/web app is not
   sufficient.
2. Install the connector from `/connector` with `npm install -g
   @groupwork/connect`. The same command works in PowerShell, macOS Terminal,
   and Linux shells. Use Node.js 22 or newer; a user-owned Node install such as
   nvm avoids global npm permissions errors.
3. Run `groupwork-connect login --app-url https://groupwork-ai.vercel.app`.
4. Add a binding in groupwork, then run `groupwork-connect doctor` and
   `groupwork-connect start`. Doctor must report a topic catalog version before
   the connector is considered UAT-ready.
5. Confirm the binding becomes green and remains green while a three-dot
   working bubble appears in the conversation.
   The local topic model may continue downloading in the background; verify
   startup and mention delivery are not blocked while fallback is active.
6. In a Team chat, mention the owner, Accept the request, and verify execution
   and Advice/Act publication.
7. In a Solo chat, target Claude and Codex separately and together; verify each
   retains its own project, session, response, and presence state.
   Verify each working agent shows a three-dot conversation indicator and then
   publishes exactly one complete response. In a Solo chat, edit each agent's
   name, role and description; verify updates reach its peers' separate agent
   directory prompts. Verify an agent can hand off with one exact `@label`,
   and a repeated agent is blocked without an arbitrary chain-length limit.
8. Stop and restart the connector, then verify catch-up is routed through
   Advice and processed only once.
9. Run pause, resume, and logout once.

## Founder dogfood scenario

Use one real project rather than a synthetic prompt. For the two-laptop test,
use two groupwork accounts in a Team chat, with one account, connector and
project-bound agent per laptop:

1. On laptop A, use account A with its project-bound backend agent and complete
   a concrete backend slice.
2. Bring that agent into the shared Team chat and ask it to leave a concise
   status, API contract, validation result, and remaining frontend needs.
3. On laptop B, use account B with its frontend agent bound to its own
   workspace. Accept its Team requests and use only the groupwork conversation
   and project files to begin the frontend—do not manually relay missing
   context unless the product forces you to.
4. Record every manual copy/paste, unclear state, missed message, stale
   presence indicator, incorrect topic, unsafe action, or place where you
   cannot tell whether an agent is working.
5. Treat data loss, duplicate execution, cross-user data exposure, an
   unapproved Team execution, or work applied to the wrong project/session as
   stop-ship. Treat wording, spacing, and optional convenience as post-UAT.

Do not run two connectors for the same account simultaneously. Connectors are
currently person-scoped and each subscribes to all bindings owned by that
person, so a same-account multi-device setup can execute one Solo mention more
than once. Device-scoped binding ownership or a distributed invocation claim is
required before that topology is supported.

## Repository gate

Run the connector tests and app static checks locally. Run Playwright only
against the dedicated staging users because it mutates Supabase data.

```bash
npm --prefix connector test
npm --prefix app run lint
npm --prefix app exec tsc -- --noEmit
```

Once the staging accounts and connector are ready, run `npm run check:prod`
from the repository root.

## Formally accepted private-beta exception

`npm audit --omit=dev` currently reports four high-severity transitive
advisories in the local-classifier dependency chain (`onnxruntime-node` /
`adm-zip` and `sharp`) with no upstream fix. The connector only uses text
embeddings and does not accept ZIP or image inputs, limiting the identified
attack paths. This risk is formally accepted for the small, known-tester
private beta only. Resolve, replace, or re-review it before public npm
distribution; it is not approved for public production.
