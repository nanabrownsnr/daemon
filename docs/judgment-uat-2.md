# Judgment UAT 2

Use a new chat named `uat 2`. User A owns the Claude binding and keeps the local
connector running. User B plays the teammate. Start User A's binding in
**Judgment** mode.

Use the API topic consistently in steps 1–4. Select User A from the mention
autocomplete each time so a real `message_mention` row is created.

| Step | User action | Expected result |
|---|---|---|
| 1 | B: `@UserA What does the API endpoint currently return?` | Advice draft; A clicks **Send** unchanged. |
| 2 | B: `@UserA Which API endpoint handles authentication?` | Advice draft; A clicks **Send** unchanged. |
| 3 | B: `@UserA Does the API endpoint validate its input?` | Advice draft; A clicks **Send** unchanged. This creates the third positive signal. |
| 4 | B: `@UserA What status code does the API endpoint return?` | Judgment chooses Act and posts directly. No new `sent_unedited` event is recorded. |
| 5 | B: `@UserA Is the deployment ready to ship?` | Deployment is cold, so Judgment chooses Advice. Dismiss this draft. |
| 6 | A temporarily pins **Advice**. B: `@UserA Should we change the API endpoint response?` | A edits the draft and sends it, recording `sent_edited` for `api`. |
| 7 | A switches back to **Judgment**. B: `@UserA What does the API endpoint return now?` | The edited signal broke the streak, so this returns to Advice. |

Do not approve or dismiss the final step until after analysis if you want its
pre-action state preserved.

## Analyze the result

From `connector/`, using User A's existing `.env` credentials:

```bash
npm run uat:analyze -- "uat 2"
```

Expected summary:

- `api` reached a streak of 3 and produced Act on step 4.
- Step 4 did not add a positive judgment event.
- `deployment` remained Advice and its dismissal recorded `ignored`.
- The later `sent_edited` event reset `api` to Advice.

The analyzer is read-only. Save its output for review; it does not modify UAT
data.
