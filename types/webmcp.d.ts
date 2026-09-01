type WebMcpToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
};

type WebMcpToolDefinition = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: WebMcpToolAnnotations;
  execute: (
    input: Record<string, unknown>,
    context?: { signal?: AbortSignal },
  ) => unknown | Promise<unknown>;
};

type WebMcpRegisteredTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: string | Record<string, unknown>;
  annotations?: WebMcpToolAnnotations;
};

interface Document {
  modelContext?: {
    registerTool: (
      tool: WebMcpToolDefinition,
      options?: { signal?: AbortSignal; exposedTo?: string[] },
    ) => Promise<void> | void;
    getTools?: (options?: { fromOrigins?: string[] }) => Promise<WebMcpRegisteredTool[]>;
    executeTool?: (
      tool: WebMcpRegisteredTool,
      input: string,
      options?: { signal?: AbortSignal },
    ) => Promise<unknown>;
    addEventListener?: (type: "toolchange", listener: () => void) => void;
    removeEventListener?: (type: "toolchange", listener: () => void) => void;
  };
}


