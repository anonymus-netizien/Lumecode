# Lumecode Tools Reference

Complete documentation for all built-in tools and MCP integration.

---

## Built-in Tools

Lumecode includes 6 built-in tools that agents use to interact with the filesystem and terminal.

---

### file_read

**Description:** Read the contents of a file at the specified path. Supports reading specific line ranges.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✅ | Absolute or relative path to the file |
| `startLine` | number | ❌ | Starting line number (1-indexed) |
| `endLine` | number | ❌ | Ending line number (inclusive) |

**Returns:** File contents as a string, or error message if file not found.

**Example:**
```json
{
  "name": "file_read",
  "args": {
    "path": "src/index.ts",
    "startLine": 1,
    "endLine": 50
  }
}
```

**Agents with access:** BUILD ✅, PLAN ✅, REVIEW ✅, GENERAL ⚠️

---

### file_write

**Description:** Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Can optionally create a backup before overwriting.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✅ | Absolute or relative path to the file |
| `content` | string | ✅ | Content to write to the file |
| `createBackup` | boolean | ❌ | Create .bak backup before overwriting (default: false) |

**Returns:** Success message with bytes written, or error message.

**Example:**
```json
{
  "name": "file_write",
  "args": {
    "path": "src/utils/helper.ts",
    "content": "export const helper = () => 'hello';",
    "createBackup": true
  }
}
```

**Agents with access:** BUILD ✅, PLAN ❌, REVIEW ❌, GENERAL ⚠️

---

### file_edit

**Description:** Make targeted edits to a file by replacing specific text ranges. Supports multiple edits in a single operation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✅ | Absolute or relative path to the file |
| `edits` | EditOperation[] | ✅ | Array of edit operations to apply |

**EditOperation Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `oldText` | string | ✅ | Text to find and replace |
| `newText` | string | ✅ | Replacement text |

**Returns:** Success message with number of edits applied, or error if text not found.

**Example:**
```json
{
  "name": "file_edit",
  "args": {
    "path": "src/config.ts",
    "edits": [
      {
        "oldText": "const DEBUG = false;",
        "newText": "const DEBUG = true;"
      },
      {
        "oldText": "version: '1.0.0'",
        "newText": "version: '1.0.1'"
      }
    ]
  }
}
```

**Agents with access:** BUILD ✅, PLAN ❌, REVIEW ❌, GENERAL ⚠️

---

### directory_list

**Description:** List contents of a directory with optional depth control and hidden file display.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | ✅ | Absolute or relative path to the directory |
| `depth` | number | ❌ | Maximum depth to recurse (default: 1) |
| `showHidden` | boolean | ❌ | Include hidden files/folders (default: false) |

**Returns:** Formatted directory tree as a string.

**Example:**
```json
{
  "name": "directory_list",
  "args": {
    "path": "src",
    "depth": 2,
    "showHidden": false
  }
}
```

**Agents with access:** BUILD ✅, PLAN ✅, REVIEW ✅, GENERAL ✅

---

### terminal_execute

**Description:** Execute a shell command in the terminal. Supports working directory specification and timeout.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `command` | string | ✅ | Shell command to execute |
| `workingDirectory` | string | ❌ | Directory to run command in (default: cwd) |
| `timeout` | number | ❌ | Timeout in milliseconds (default: 30000) |

**Returns:** Object with `stdout`, `stderr`, and `exitCode`.

**Example:**
```json
{
  "name": "terminal_execute",
  "args": {
    "command": "npm test",
    "workingDirectory": "/home/user/project",
    "timeout": 60000
  }
}
```

**Agents with access:** BUILD ✅, PLAN ⚠️, REVIEW ❌, GENERAL ⚠️

---

### search_files

**Description:** Search for text patterns across files using regex. Returns matching lines with context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pattern` | string | ✅ | Regex pattern to search for |
| `path` | string | ❌ | Directory to search in (default: cwd) |
| `filePattern` | string | ❌ | Glob pattern to filter files (e.g., `*.ts`) |
| `contextLines` | number | ❌ | Lines of context around matches (default: 2) |

**Returns:** Array of matches with file path, line number, and surrounding context.

**Example:**
```json
{
  "name": "search_files",
  "args": {
    "pattern": "TODO|FIXME",
    "path": "src",
    "filePattern": "*.ts",
    "contextLines": 3
  }
}
```

**Agents with access:** BUILD ✅, PLAN ✅, REVIEW ✅, GENERAL ✅

---

## MCP Tools

Lumecode supports the Model Context Protocol (MCP) for extending tool capabilities.

### Configuration

MCP servers are configured in `~/.lumecode/config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

### How MCP Tools Work

1. **Discovery:** On startup, Lumecode connects to configured MCP servers
2. **Registration:** Each server's tools are added to the Tool Registry with `mcp_` prefix
3. **Execution:** When the LLM calls an MCP tool, Lumecode routes it to the correct server
4. **Results:** Tool output is returned to the LLM context

### MCP Server Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | ✅ | Executable to run |
| `args` | string[] | ❌ | Command line arguments |
| `env` | object | ❌ | Environment variables |

### Example MCP Tools

Once configured, MCP tools appear in the tool list:

- `mcp_filesystem_read_file` — Read file via MCP filesystem server
- `mcp_filesystem_write_file` — Write file via MCP filesystem server
- `mcp_github_create_issue` — Create GitHub issue via MCP GitHub server
- `mcp_github_list_repos` — List repositories via MCP GitHub server

---

## Tool Permissions by Agent

Each agent has different tool access based on its intended purpose:

| Tool | BUILD | PLAN | REVIEW | GENERAL |
|------|-------|------|--------|---------|
| `file_read` | ✅ | ✅ | ✅ | ⚠️ |
| `file_write` | ✅ | ❌ | ❌ | ⚠️ |
| `file_edit` | ✅ | ❌ | ❌ | ⚠️ |
| `directory_list` | ✅ | ✅ | ✅ | ✅ |
| `terminal_execute` | ✅ | ⚠️ | ❌ | ⚠️ |
| `search_files` | ✅ | ✅ | ✅ | ✅ |

**Legend:**
- ✅ = Full access, no confirmation required
- ⚠️ = Requires user confirmation before execution
- ❌ = Not available to this agent

### Permission Model

Tool permissions are determined by agent capabilities defined in `src/agents/index.ts`:

```typescript
interface AgentCapabilities {
  canReadFiles: boolean;      // file_read, search_files
  canWriteFiles: boolean;     // file_write, file_edit
  canExecuteCommands: boolean; // terminal_execute
  requiresConfirmation: boolean; // prompts user before destructive ops
}
```

| Agent | canReadFiles | canWriteFiles | canExecuteCommands | requiresConfirmation |
|-------|--------------|---------------|-------------------|---------------------|
| build | true | true | true | false |
| plan | true | false | true | true |
| review | true | false | false | false |
| general | true | true | true | true |

---

## Tool Execution Flow

```
1. LLM returns tool_call in response
       ↓
2. Engine.setToolCallHandler() fires
       ↓
3. Check agent permissions for tool
       ↓
4. If requiresConfirmation → prompt user
       ↓
5. Execute tool via toolRegistry.execute()
       ↓
6. Return result to LLM context
       ↓
7. LLM continues with tool result
```

---

## Error Handling

Tools return standardized error responses:

| Error | Cause | Response |
|-------|-------|----------|
| `ENOENT` | File/directory not found | `"Error: File not found: {path}"` |
| `EACCES` | Permission denied | `"Error: Permission denied: {path}"` |
| `TIMEOUT` | Command exceeded timeout | `"Error: Command timed out after {ms}ms"` |
| `INVALID_ARGS` | Missing required parameter | `"Error: Missing required parameter: {name}"` |
| `NOT_PERMITTED` | Agent lacks permission | `"Error: Agent cannot use tool: {toolName}"` |
