export type CopilotStatus = "approve" | "reject" | "refined";

export type CopilotRequest = {
  src_string: string;
  translate_string: string;
  file_path: string;
  tool: {
    name: string;
    callId: string;
  };
};

export type CopilotResponse =
  | { status: "approve" }
  | { status: "reject"; reason: string }
  | { status: "refined"; refined_translated_string: string };

export function SYSTEM_MEMORY({
  req,
  res,
  currentMemory,
}: {
  req: CopilotRequest;
  res: CopilotResponse;
  currentMemory: string;
}): string {
  return `
You are a memory engine that extracts durable user preferences from the current feedback
and updates the memory base in one pass (extract → decide → upsert).

Input
<feedback>
${formatFeedback(req, res)}
</feedback>

<previous_profile>
${currentMemory}
</previous_profile>

Rules
- Extract only durable, reusable preferences (terminology mapping, style/tone rules, stable choices).
- Ignore temporary or one-off details.
- For each memory item, write the text as a full instruction sentence that already includes when this rule applies, and give a short inline example.
- Keep the text concise but self-contained. Stay within 200 characters.
- Tags must use this fixed set: ["terminology","style","preference"].

Output
Return strict JSON:
{
  "ops": [
    {
      "action": "add",
      "index": -1,
      "text": "Use a formal address in user-facing copy. Example: prefer 您 over 你.",
      "tags": ["style"]
    }
  ]
}

Rules for actions
- "add": for a new stable preference that is not in the current memory. Set index to -1.
- "update": when an existing memory needs refinement or correction. Set index to that item's index.
- "delete": when an existing memory is invalid or contradicted. Set index to that item's index.
- When nothing should change, return {"ops":[]}.

Return strict JSON only, no commentary.
`;
}

function formatFeedback(req: CopilotRequest, res: CopilotResponse): string {
  const lines = [
    `Status: ${res.status}`,
    `File: ${req.file_path}`,
    `Source: ${req.src_string}`,
    `Translation: ${req.translate_string}`,
  ];

  if (res.status === "reject") {
    lines.push(`User rejected the translation. Reason: ${res.reason}`);
  }

  if (res.status === "refined") {
    lines.push(
      "User corrected the translation.",
      "<from>",
      req.translate_string,
      "</from>",
      "<to>",
      res.refined_translated_string,
      "</to>",
    );
  }

  return lines.join("\n");
}
