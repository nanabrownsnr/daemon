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
7. `docs/sql/agent-response-streaming.sql`

Re-running these current runbooks is intended to be safe, but use the existing
private-beta project and review SQL errors rather than skipping a failed step.

## New-computer acceptance test

1. Install and authenticate Claude Code or Codex CLI.
2. Download connector 0.7.0 from `/connector` and install it from the download
   directory. Use `sudo` only if npm reports `EACCES` under `/usr/local`.
3. Run `groupwork-connect login --app-url https://groupwork-ai.vercel.app`.
4. Add a binding in groupwork, then run `groupwork-connect doctor` and
   `groupwork-connect start`. Doctor must report a topic catalog version before
   the connector is considered UAT-ready.
5. Confirm the binding becomes green and turns yellow while working.
   The local topic model may continue downloading in the background; verify
   startup and mention delivery are not blocked while fallback is active.
6. In a Team chat, mention the owner, Accept the request, and verify execution
   and Advice/Act publication.
7. In a Solo chat, target Claude and Codex separately and together; verify each
   retains its own project, session, response, and presence state.
   Verify Claude renders incrementally in Act and Advice; verify Codex still
   publishes its complete response without creating a duplicate message.
8. Stop and restart the connector, then verify catch-up is routed through
   Advice and processed only once.
9. Run pause, resume, and logout once.

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

## Known private-UAT exception

`npm audit --omit=dev` currently reports four high-severity transitive
advisories in the local-classifier dependency chain (`onnxruntime-node` /
`adm-zip` and `sharp`) with no upstream fix. The connector only uses text
embeddings and does not accept ZIP or image inputs, so this is accepted for the
small, known-tester UAT only. Resolve or formally review it before public npm
distribution.
