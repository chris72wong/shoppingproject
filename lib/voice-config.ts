// Keep the hosted tool alive beyond the browser's 55-second shopping deadline.
export const stylistToolTimeoutSeconds = 60;

export type VoiceToolConfig = {
  type: string;
  name: string;
  expects_response?: boolean;
  response_timeout_secs?: number;
  parameters?: { required?: string[]; properties?: Record<string, { type?: string }> };
};

export function stylistToolIssues(tool: VoiceToolConfig): string[] {
  const issues: string[] = [];
  if (tool.type !== "client" || tool.name !== "consult_stylist")
    issues.push("Register a client tool named consult_stylist.");
  if (!tool.parameters?.required?.includes("message") || tool.parameters.properties?.message?.type !== "string")
    issues.push("consult_stylist needs a required string parameter named message.");
  if (tool.expects_response !== true)
    issues.push("Enable Wait for response (expects_response=true) so voice waits for Gemini's result.");
  if ((tool.response_timeout_secs ?? 0) < stylistToolTimeoutSeconds)
    issues.push(`Set the tool response timeout to at least ${stylistToolTimeoutSeconds} seconds.`);
  return issues;
}
