import fs from "node:fs";
import path from "node:path";

import { YAML_BLOCK_SCALAR_PATTERN } from "./constants.mjs";

export function fileExists(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

export function dirExists(dir) {
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

export function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === "#" && !quote && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function countIndent(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (YAML_BLOCK_SCALAR_PATTERN.test(trimmed)) {
    throw new Error(
      "unsupported YAML block scalar; use quoted single-line strings or arrays instead of | or >"
    );
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map(item => parseScalar(item));
  }
  return trimmed;
}

function parseKeyValue(text) {
  const index = text.indexOf(":");
  if (index === -1) return null;
  return {
    key: text.slice(0, index).trim(),
    valueText: text.slice(index + 1).trim(),
  };
}

function preprocessYaml(text) {
  return text
    .replace(/\t/g, "  ")
    .split(/\r?\n/)
    .map(raw => stripComment(raw).replace(/\s+$/, ""))
    .filter(line => line.trim().length > 0)
    .map(line => ({
      indent: countIndent(line),
      text: line.trim(),
    }));
}

function parseBlock(lines, startIndex, indent) {
  if (startIndex >= lines.length) return { value: {}, index: startIndex };

  const isArray = lines[startIndex].indent === indent && lines[startIndex].text.startsWith("- ");
  return isArray
    ? parseArray(lines, startIndex, indent)
    : parseObject(lines, startIndex, indent);
}

function parseArray(lines, startIndex, indent) {
  const array = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent !== indent || !line.text.startsWith("- ")) break;

    const itemText = line.text.slice(2).trim();
    if (!itemText) {
      const child = parseBlock(lines, index + 1, indent + 2);
      array.push(child.value);
      index = child.index;
      continue;
    }

    const kv = parseKeyValue(itemText);
    if (!kv) {
      array.push(parseScalar(itemText));
      index += 1;
      continue;
    }

    const item = {};
    if (kv.valueText) {
      item[kv.key] = parseScalar(kv.valueText);
      index += 1;
    } else {
      const child = parseBlock(lines, index + 1, indent + 2);
      item[kv.key] = child.value;
      index = child.index;
    }

    while (index < lines.length && lines[index].indent === indent + 2 && !lines[index].text.startsWith("- ")) {
      const nested = parseKeyValue(lines[index].text);
      if (!nested) break;
      if (nested.valueText) {
        item[nested.key] = parseScalar(nested.valueText);
        index += 1;
      } else {
        const child = parseBlock(lines, index + 1, indent + 4);
        item[nested.key] = child.value;
        index = child.index;
      }
    }

    array.push(item);
  }

  return { value: array, index };
}

function parseObject(lines, startIndex, indent) {
  const object = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent !== indent || line.text.startsWith("- ")) break;

    const kv = parseKeyValue(line.text);
    if (!kv) {
      index += 1;
      continue;
    }

    if (kv.valueText) {
      object[kv.key] = parseScalar(kv.valueText);
      index += 1;
    } else {
      const child = parseBlock(lines, index + 1, indent + 2);
      object[kv.key] = child.value;
      index = child.index;
    }
  }

  return { value: object, index };
}

function parseYaml(text) {
  const lines = preprocessYaml(text);
  if (lines.length === 0) return {};
  return parseBlock(lines, 0, lines[0].indent).value;
}

export function readYaml(file, errors) {
  try {
    return parseYaml(readText(file));
  } catch (error) {
    errors.push(`${file}: invalid YAML: ${error.message}`);
    return {};
  }
}

export function readJson(file, errors) {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    errors.push(`${file}: invalid JSON: ${error.message}`);
    return null;
  }
}

export function readJsonl(file, errors) {
  if (!fileExists(file)) return [];

  return readText(file)
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        errors.push(`${file}:${index + 1}: invalid JSONL row: ${error.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

export function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

export function warn(condition, message, warnings) {
  if (!condition) warnings.push(message);
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

export function looksLikeTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

export function assertTimestamp(value, label, errors) {
  assert(looksLikeTimestamp(value), `${label} must be an ISO-like timestamp`, errors);
}

export function isCheckTrue(checks, key) {
  return checks?.[key] === true;
}

export function isPlainRelativePath(value) {
  return isNonEmptyString(value) && !value.includes("*") && !value.includes("(") && !path.isAbsolute(value);
}

export function extractMarkers(text = "") {
  const markers = [];
  const markerPattern = /\{\{\/?[A-Za-z0-9_]+\}\}|<x\s+id="[^"]+"\s*\/>/g;
  let match;

  while ((match = markerPattern.exec(String(text))) !== null) {
    markers.push(match[0]);
  }

  return markers;
}

function markerName(marker) {
  const curly = marker.match(/^\{\{(\/?)([A-Za-z0-9_]+)\}\}$/);
  if (curly) return { closing: curly[1] === "/", name: curly[2], selfClosing: false };

  const xml = marker.match(/^<x\s+id="([^"]+)"\s*\/>$/);
  if (xml) return { closing: false, name: xml[1], selfClosing: true };

  return null;
}

export function validateMarkerBalance(text, label, errors) {
  const stack = [];
  for (const marker of extractMarkers(text)) {
    const parsed = markerName(marker);
    if (!parsed) {
      errors.push(`${label}: invalid marker token ${marker}`);
      continue;
    }

    if (parsed.selfClosing) continue;

    if (!parsed.closing) {
      stack.push(parsed.name);
      continue;
    }

    const open = stack.pop();
    if (open !== parsed.name) errors.push(`${label}: unbalanced marker ${marker}`);
  }

  if (stack.length > 0) errors.push(`${label}: unclosed marker(s): ${stack.join(", ")}`);
}

export function sameArray(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function extractMarkdownImageRefs(text = "") {
  const refs = [];
  const imagePattern = /!\[[^\]\n]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let match;

  while ((match = imagePattern.exec(String(text))) !== null) {
    refs.push(match[1].replace(/^<|>$/g, ""));
  }

  return refs;
}

function isLocalRelativeRef(ref) {
  return Boolean(ref) && !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(ref);
}

export function validateMarkdownImageAssets(file, label, errors) {
  if (!fileExists(file)) return;

  const baseDir = path.dirname(file);
  for (const ref of extractMarkdownImageRefs(readText(file))) {
    if (!isLocalRelativeRef(ref)) continue;
    const resolved = path.resolve(baseDir, ref);
    assert(fileExists(resolved), `${label}: missing local image asset ${ref}`, errors);
  }
}
