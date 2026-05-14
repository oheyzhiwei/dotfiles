---
name: rfp-qa
description: "Guide an interactive RFP/RFI Q&A session where the user provides answers question by question. ONLY use this skill when the user explicitly mentions an RFP, RFQ, or RFI by name. Do NOT trigger on general Q&A, tech questions, or vendor discussions unless an RFP/RFQ/RFI document is explicitly being worked on. Triggers on: fill rfp, answer rfp, work on rfp, rfp questions, fill rfi, fill rfq."
---

# RFP Q&A Skill

An interactive workflow for filling out RFP/RFI questionnaires one question at a time, with the user providing or approving answers which are then written to a Google Sheet or markdown file.

## Workflow — For Each Question

Work through questions **strictly one at a time**. Never present multiple questions together. Complete all steps for one question before moving to the next.

### Step 1: Present the question clearly

Output the following structure:

---
**[ID]** (Sheet row: N, Tab: X)
**Section:** [section name]

**Original question:**
> [exact question text from sheet]

**In plain terms:**
[1–2 sentence plain English interpretation of what they're really asking]

---

### Step 2: Draft a response

- If a knowledge base is available, search it for relevant information first
- Draft a concise, professional response grounded in available knowledge
- If there is insufficient information, say so explicitly and ask the user to provide input
- Present the draft clearly:

---
**Draft response:**

[response text]

---

### Step 3: Ask for approval — one question at a time

Use the `ask` tool with `type: "select"` to ask a **single, focused** approval question:

```
question: "Does this response look good?"
type: "select"
options:
  - label: "Approve — write it"
  - label: "Edit — I'll rewrite"
    description: "You'll type your revised version"
  - label: "Skip — leave blank"
```

Then, if the user selects "Edit", immediately follow up with **one** `ask` tool call using `type: "text"`:

```
question: "Your revised response for [ID]:"
type: "text"
placeholder: "[paste or type your version here]"
```

Never bundle multiple questions into a single `ask` call. Each `ask` call must address exactly one decision or input.

### Step 4: Handle user response

- **"Approve"** → write the draft to the configured destination and move to next question
- **"Edit"** → user types their revision (via the text `ask`), show revised draft, ask for approval again (single `ask`)
- **"Skip"** → leave blank, note it as skipped, move to next question
- **User provides their own answer directly** (outside the `ask` tool) → use that as the response, confirm before writing with a single `ask`

### Step 5: Write the answer

**To Google Sheet** (default):
Use the `write_gsheet` tool with the correct tab name and cell reference.

**To a markdown file** (if user says "save to file" or "write to markdown"):
Append to the specified file in this format:
```
## [ID] — [short question title]
**Q:** [original question]
**A:** [approved answer]
```

**To both** (if user says "save both"):
Write to the sheet AND append to the markdown file.

## Session State

Keep a running tally during the session:
- ✅ Answered: list of IDs written
- ⏭️ Skipped: list of IDs skipped
- 🔲 Remaining: count of questions left

Show a brief status line after each question:
`✅ 3 answered | ⏭️ 1 skipped | 🔲 12 remaining`

## Tips

- Always check any available knowledge base before asking the user for input
- Never invent facts not in the knowledge base — flag gaps explicitly
- Keep drafts concise (3–8 sentences or equivalent bullets)
- For questions already answered in the sheet, skip them automatically
- Batch-write to the sheet where possible to reduce API calls
- **One `ask` at a time** — never chain multiple `ask` calls without waiting for each answer
