"use client";

import { useMemo, useState } from "react";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonSchema = {
  $schema?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
};

const DEFAULT_INPUT = `{
  "meta": { "source": "example", "count": 3 },
  "users": [
    { "id": 1, "name": "Ada", "roles": ["admin", "editor"] },
    { "id": 2, "name": "Max", "roles": ["viewer"] }
  ],
  "events": [
    { "type": "click", "tags": ["nav", "cta", "primary"] },
    { "type": "scroll", "tags": ["hero", "story"] }
  ]
}`;

const trimStructure = (value: JsonValue, maxArrayLen: number): JsonValue => {
  if (Array.isArray(value)) {
    return value.slice(0, maxArrayLen).map((item) => trimStructure(item, maxArrayLen));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, val]) => [
      key,
      trimStructure(val, maxArrayLen),
    ]);
    return Object.fromEntries(entries);
  }

  return value;
};

const normalizeTypes = (schema: JsonSchema | null): string[] => {
  if (!schema?.type) return [];
  return Array.isArray(schema.type) ? schema.type : [schema.type];
};

const mergeSchemas = (left: JsonSchema | null, right: JsonSchema | null): JsonSchema => {
  if (!left) return right ?? {};
  if (!right) return left;

  const types = Array.from(
    new Set([...normalizeTypes(left), ...normalizeTypes(right)])
  );
  const merged: JsonSchema = {};
  if (types.length > 0) {
    merged.type = types.length === 1 ? types[0] : types;
  }

  const leftIsObject = normalizeTypes(left).includes("object");
  const rightIsObject = normalizeTypes(right).includes("object");
  if (leftIsObject && rightIsObject) {
    const properties: Record<string, JsonSchema> = {};
    const leftProps = left.properties ?? {};
    const rightProps = right.properties ?? {};
    const keys = new Set([...Object.keys(leftProps), ...Object.keys(rightProps)]);
    keys.forEach((key) => {
      properties[key] = mergeSchemas(leftProps[key] ?? null, rightProps[key] ?? null);
    });
    merged.properties = properties;

    const leftRequired = new Set(left.required ?? []);
    const rightRequired = new Set(right.required ?? []);
    const required = [...leftRequired].filter((key) => rightRequired.has(key));
    if (required.length > 0) {
      merged.required = required;
    }
  }

  const leftIsArray = normalizeTypes(left).includes("array");
  const rightIsArray = normalizeTypes(right).includes("array");
  if (leftIsArray && rightIsArray) {
    merged.items = mergeSchemas(left.items ?? null, right.items ?? null);
  }

  return merged;
};

const inferSchema = (value: JsonValue): JsonSchema => {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array", items: {} };
    }
    const itemsSchema = value.reduce<JsonSchema | null>(
      (acc, item) => mergeSchemas(acc, inferSchema(item)),
      null
    );
    return { type: "array", items: itemsSchema ?? {} };
  }

  if (typeof value === "object") {
    const properties: Record<string, JsonSchema> = {};
    Object.entries(value).forEach(([key, val]) => {
      properties[key] = inferSchema(val);
    });
    const required = Object.keys(properties);
    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (typeof value === "number") {
    return { type: Number.isInteger(value) ? "integer" : "number" };
  }

  return { type: typeof value };
};

const generateSchema = (value: JsonValue): JsonSchema => {
  const schema = inferSchema(value);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...schema,
  };
};

export default function Home() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [output, setOutput] = useState("");
  const [outputValue, setOutputValue] = useState<JsonValue | null>(null);
  const [arrayLimit, setArrayLimit] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [outputMode, setOutputMode] = useState<"trim" | "schema">("trim");

  const parsedLimit = useMemo(() => {
    const parsed = Number.parseInt(arrayLimit, 10);
    if (Number.isNaN(parsed)) return null;
    return Math.max(parsed, 0);
  }, [arrayLimit]);

  const handleTrim = () => {
    if (parsedLimit === null) {
      setError("Provide a valid number of items for arrays.");
      setOutput("");
      setOutputValue(null);
      return;
    }

    try {
      const parsed = JSON.parse(input) as JsonValue;
      const trimmed = trimStructure(parsed, parsedLimit);
      setOutput(JSON.stringify(trimmed, null, 2));
      setOutputValue(trimmed);
      setCollapsedPaths(new Set());
      setOutputMode("trim");
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to parse JSON.";
      setError(`JSON error: ${message}`);
      setOutput("");
      setOutputValue(null);
    }
  };

  const handleGenerateSchema = () => {
    try {
      const parsed = JSON.parse(input) as JsonValue;
      const schema = generateSchema(parsed);
      setOutput(JSON.stringify(schema, null, 2));
      setOutputValue(schema as JsonValue);
      setCollapsedPaths(new Set());
      setOutputMode("schema");
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to parse JSON.";
      setError(`JSON error: ${message}`);
      setOutput("");
      setOutputValue(null);
    }
  };

  const handleFormatInput = () => {
    try {
      const parsed = JSON.parse(input) as JsonValue;
      setInput(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to parse JSON.";
      setError(`JSON error: ${message}`);
    }
  };

  const handleCopyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to copy.";
      setError(`Copy error: ${message}`);
    }
  };

  const toggleCollapsed = (path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const formatPrimitive = (value: JsonValue) => {
    if (typeof value === "string") return JSON.stringify(value);
    if (value === null) return "null";
    return String(value);
  };

  const renderJson = (value: JsonValue) => {
    const lines: React.ReactNode[] = [];
    const indentSize = 16;

    const pushLine = (
      content: React.ReactNode,
      depth: number,
      options?: { togglePath?: string; isCollapsed?: boolean }
    ) => {
      const hasToggle = Boolean(options?.togglePath);
      lines.push(
        <div
          key={`${lines.length}-${depth}`}
          className="flex items-start font-mono text-sm"
          style={{ paddingLeft: depth * indentSize }}
        >
          <span className="mr-2 flex h-5 w-5 items-center justify-center text-[color:var(--accent)]">
            {hasToggle ? (
              <button
                type="button"
                className="text-xs font-semibold"
                onClick={() => toggleCollapsed(options!.togglePath!)}
              >
                {options?.isCollapsed ? "▸" : "▾"}
              </button>
            ) : (
              <span className="opacity-0">▾</span>
            )}
          </span>
          <span className="whitespace-pre-wrap">{content}</span>
        </div>
      );
    };

    const renderNode = (
      node: JsonValue,
      path: string,
      depth: number,
      isLast: boolean,
      keyPrefix?: string
    ) => {
      const isArray = Array.isArray(node);
      const isObject = node !== null && typeof node === "object" && !isArray;

      if (!isArray && !isObject) {
        pushLine(
          `${keyPrefix ?? ""}${formatPrimitive(node)}${isLast ? "" : ","}`,
          depth
        );
        return;
      }

      const open = isArray ? "[" : "{";
      const close = isArray ? "]" : "}";
      const entries = isArray
        ? (node as JsonValue[])
        : Object.entries(node as Record<string, JsonValue>);
      const isCollapsed = collapsedPaths.has(path);
      const count = entries.length;
      const collapsedPreview = isArray
        ? `[… ${count}]`
        : `{… ${count}}`;

      if (isCollapsed) {
        pushLine(
          `${keyPrefix ?? ""}${collapsedPreview}${isLast ? "" : ","}`,
          depth,
          { togglePath: path, isCollapsed: true }
        );
        return;
      }

      pushLine(`${keyPrefix ?? ""}${open}`, depth, {
        togglePath: path,
        isCollapsed: false,
      });

      if (isArray) {
        (node as JsonValue[]).forEach((item, index) => {
          const itemPath = `${path}[${index}]`;
          const last = index === (node as JsonValue[]).length - 1;
          renderNode(item, itemPath, depth + 1, last);
        });
      } else {
        const entriesArray = Object.entries(node as Record<string, JsonValue>);
        entriesArray.forEach(([key, val], index) => {
          const last = index === entriesArray.length - 1;
          const keyLabel = `"${key}": `;
          const entryPath = `${path}.${key}`;
          renderNode(val, entryPath, depth + 1, last, keyLabel);
        });
      }

      pushLine(`${close}${isLast ? "" : ","}`, depth);
    };

    renderNode(value, "$", 0, true);
    return lines;
  };

  return (
    <div className="min-h-screen px-4 py-10 text-zinc-900 sm:px-8">
      <header className="mx-auto mb-8 flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Data Structure Saver
            </p>
            <h1 className="text-3xl font-semibold text-zinc-950 sm:text-4xl">
              Trim data, keep the structure
            </h1>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-zinc-600">
          Paste JSON on the left. You can trim arrays to a fixed length or
          generate a JSON Schema with required fields inferred from the input.
        </p>
      </header>

      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex h-[560px] flex-col gap-3 rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-4 shadow-xl shadow-orange-900/5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Input data
            </h2>
            <div className="flex items-center gap-3 text-xs font-semibold text-[color:var(--accent)]">
              <button
                className="hover:text-[color:var(--accent-dark)]"
                onClick={handleFormatInput}
                type="button"
              >
                Format
              </button>
              <button
                className="hover:text-[color:var(--accent-dark)]"
                onClick={() => setInput(DEFAULT_INPUT)}
                type="button"
              >
                Insert example
              </button>
            </div>
          </div>
          <textarea
            className="h-[420px] flex-1 resize-none overflow-y-auto overflow-x-hidden rounded-xl border border-transparent bg-white/70 p-4 font-mono text-sm text-zinc-800 shadow-inner focus:border-[color:var(--accent)] focus:outline-none"
            placeholder="Paste JSON..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </section>

        <section className="flex h-[560px] flex-col gap-3 rounded-2xl border border-[color:var(--panel-border)] bg-white/80 p-4 shadow-xl shadow-emerald-900/5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {outputMode === "schema" ? "JSON schema" : "Shortened data"}
            </h2>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>
                {output ? `${output.split("\n").length} lines` : "No data"}
              </span>
              <button
                className="font-semibold text-[color:var(--accent)] hover:text-[color:var(--accent-dark)]"
                onClick={handleCopyOutput}
                type="button"
              >
                {copyLabel}
              </button>
            </div>
          </div>
          <div className="h-[420px] flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-transparent bg-zinc-950/90 p-4 text-emerald-50 shadow-inner">
            {outputValue ? (
              <div className="space-y-1 break-words">{renderJson(outputValue)}</div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-emerald-100/70">
                {outputMode === "schema"
                  ? "Generated JSON Schema will appear here..."
                  : "Shortened JSON will appear here..."}
              </div>
            )}
          </div>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>
      </main>

      <div className="mx-auto mt-6 flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-4 shadow-lg shadow-teal-900/5">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-600">
            Items per array
          </label>
          <input
            className="h-10 w-24 rounded-lg border border-[color:var(--panel-border)] bg-white/80 px-3 text-sm shadow-sm focus:border-[color:var(--accent)] focus:outline-none"
            type="number"
            min={0}
            value={arrayLimit}
            onChange={(event) => setArrayLimit(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="h-12 rounded-full bg-[color:var(--accent)] px-6 text-base font-semibold text-white shadow-lg shadow-teal-900/10 transition hover:bg-[color:var(--accent-dark)]"
            onClick={handleTrim}
          >
            Trim data
          </button>
          <button
            className="h-12 rounded-full border border-[color:var(--accent)] px-6 text-base font-semibold text-[color:var(--accent)] shadow-lg shadow-teal-900/10 transition hover:border-[color:var(--accent-dark)] hover:text-[color:var(--accent-dark)]"
            onClick={handleGenerateSchema}
          >
            Generate schema
          </button>
        </div>
      </div>
    </div>
  );
}
