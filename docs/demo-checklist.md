# Demo checklist

Use this to record a short walkthrough without improvising. Everything here works without credentials.

1. Start the app: `npm run build && npm run start`, then open http://localhost:3000.
2. Show the problem: the Overview is empty and honest. Point out the "No data source" badge.
3. Click **Try demo**. The header shows **Demo · synthetic**. Say the channel is fictional.
4. After about 20 seconds, show the Overview: the summary, key insights, recurring questions and topic activity.
5. Open **Question Queue**. Show a repeated question with its count and "No response detected" or "Reply visible".
6. Click **Mark handled**, then open the **Handled** tab to show it moved.
7. Open **Insights**, click **Run analysis now**, and point out "Local rules (not AI)" and how each sentence is grounded in counts.
8. Open **Live Chat**, search for a word, and pause/resume the display.
9. Open **Settings**, show the analysis interval, the AI status (local rules unless a key is set) and **Clear session data** with its confirmation.
10. Show a phone-width view (browser devtools, 390 px).

For a live Twitch demonstration, only after verifying the connection on your own machine:

- Enter a channel you control, click **Connect**, and wait for **Connected** (the status must never show before Twitch confirms the join).
- Send a few test messages from another account and confirm they appear in Live Chat.
- Disconnect and confirm the status returns to **Disconnected**.
