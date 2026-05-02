import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const PREVIEW_LIMITS = {
  maxFiles: 80,
  maxTotalBytes: 1024 * 1024,
  maxFileBytes: 128 * 1024,
};

const SKIP_DIRS = new Set([
  ".git",
  ".cache",
  ".next",
  ".turbo",
  ".venv",
  ".vite",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "venv",
]);

const TEXT_EXTENSIONS = new Set([
  ".bash",
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".env",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mdx",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);

export class SkillImportError extends Error {
  constructor(code, message, { status = 400, details, cause } = {}) {
    super(message);
    this.name = "SkillImportError";
    this.code = code;
    this.status = status;
    this.details = details;
    if (cause) this.cause = cause;
  }
}

export async function importSkillFromGit(input, { repo, gitBin = "git", tempRoot = os.tmpdir() } = {}) {
  if (!repo) throw new SkillImportError("repository_required", "Repository is required.", { status: 500 });
  const url = cleanInput(input?.url);
  const subdir = cleanInput(input?.subdir);
  const ref = cleanInput(input?.ref);
  if (!url) throw new SkillImportError("url_required", "Git URL is required.");

  const tempDir = await fs.mkdtemp(path.join(tempRoot, "atelier-skill-import-"));
  const cloneDir = path.join(tempDir, "repo");
  try {
    await cloneRepository({ gitBin, url, ref, cloneDir });
    const commit = await gitOutput(gitBin, ["-C", cloneDir, "rev-parse", "HEAD"]);
    const skillDir = resolveImportDir(cloneDir, subdir);
    await assertDirectory(skillDir);

    const manifest = await findSkillManifest(skillDir);
    if (!manifest) {
      throw new SkillImportError("skill_manifest_not_found", "SKILL.md was not found in the selected directory.");
    }

    const manifestContent = await fs.readFile(manifest.absPath, "utf8");
    const parsed = parseSkillManifest(manifestContent, path.basename(skillDir));
    const snapshot = await collectPreviewFiles(skillDir, manifest.relPath);
    const id = nextSkillId(repo, slugSkillId(parsed.name));
    const importedAt = new Date().toISOString();

    const skill = {
      id,
      name: parsed.name,
      category: parsed.category || "code",
      kind: "custom",
      desc: parsed.description || "",
      calls: 0,
      source: {
        type: "git",
        url,
        subdir: subdir || "",
        ref: ref || "",
        commit,
        importedAt,
      },
      meta: {
        version: parsed.version || null,
        skillFile: manifest.relPath,
        fileCount: snapshot.files.length,
        totalBytes: snapshot.totalBytes,
        skippedCount: snapshot.skippedCount,
      },
      preview: { path: manifest.relPath },
      files: snapshot.files,
    };

    repo.upsertEntity("skills", skill.id, skill);
    return skill;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function cloneRepository({ gitBin, url, ref, cloneDir }) {
  try {
    if (ref) {
      await gitOutput(gitBin, ["clone", "--no-tags", url, cloneDir]);
      await gitOutput(gitBin, ["-C", cloneDir, "checkout", "--quiet", ref]);
    } else {
      await gitOutput(gitBin, ["clone", "--depth", "1", "--no-tags", url, cloneDir]);
    }
  } catch (error) {
    throw new SkillImportError("git_clone_failed", "Git repository could not be cloned.", {
      details: trimGitError(error),
      cause: error,
    });
  }
}

async function gitOutput(gitBin, args) {
  const { stdout } = await execFile(gitBin, args, { maxBuffer: 1024 * 1024 * 8 });
  return stdout.trim();
}

function trimGitError(error) {
  const text = `${error?.stderr || error?.stdout || error?.message || ""}`.trim();
  return text.slice(0, 1200);
}

function cleanInput(value) {
  return String(value || "").trim();
}

function resolveImportDir(root, subdir) {
  const raw = cleanInput(subdir).replace(/\\/g, "/");
  if (!raw || raw === ".") return root;
  if (raw.includes("\0") || path.posix.isAbsolute(raw)) {
    throw new SkillImportError("invalid_subdir", "Subdirectory must be a relative path.");
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === "." || !normalized) return root;
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new SkillImportError("invalid_subdir", "Subdirectory must stay inside the repository.");
  }
  const target = path.resolve(root, ...normalized.split("/"));
  const rel = path.relative(root, target);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new SkillImportError("invalid_subdir", "Subdirectory must stay inside the repository.");
  }
  return target;
}

async function assertDirectory(dir) {
  try {
    const stat = await fs.stat(dir);
    if (stat.isDirectory()) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  throw new SkillImportError("invalid_subdir", "Selected subdirectory does not exist.");
}

async function findSkillManifest(dir) {
  for (const name of ["SKILL.md", "skill.md"]) {
    const absPath = path.join(dir, name);
    try {
      const stat = await fs.stat(absPath);
      if (stat.isFile()) return { absPath, relPath: name };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return null;
}

export function parseSkillManifest(source, fallbackName = "skill") {
  const { frontmatter, body } = splitFrontmatter(source);
  const meta = parseSimpleYaml(frontmatter);
  const headingName = firstHeading(body);
  const name = cleanInput(meta.name) || headingName || fallbackName || "skill";
  const description = cleanInput(meta.description || meta.desc) || firstParagraph(body);
  return {
    name,
    description,
    category: cleanInput(meta.category).toLowerCase(),
    version: cleanInput(meta.version),
  };
}

function splitFrontmatter(source) {
  const lines = String(source || "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { frontmatter: "", body: source || "" };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return { frontmatter: "", body: source || "" };
  return {
    frontmatter: lines.slice(1, end).join("\n"),
    body: lines.slice(end + 1).join("\n"),
  };
}

function parseSimpleYaml(source) {
  const out = {};
  String(source || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) return;
    out[match[1]] = stripYamlScalar(match[2]);
  });
  return out;
}

function stripYamlScalar(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function firstHeading(body) {
  const line = String(body || "").split(/\r?\n/).find((item) => /^#\s+/.test(item.trim()));
  return line ? line.replace(/^#\s+/, "").trim() : "";
}

function firstParagraph(body) {
  const lines = String(body || "").split(/\r?\n/);
  const paragraph = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "---") {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(trimmed);
  }
  return paragraph.join(" ").slice(0, 280);
}

async function collectPreviewFiles(root, manifestPath) {
  const discovered = [];
  let skippedCount = 0;

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = toPosix(path.relative(root, absPath));
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(absPath);
        continue;
      }
      if (!entry.isFile()) {
        skippedCount += 1;
        continue;
      }
      if (!isPreviewCandidate(relPath, manifestPath)) {
        skippedCount += 1;
        continue;
      }
      discovered.push({ absPath, relPath });
    }
  }

  await walk(root);
  discovered.sort((a, b) => priority(a.relPath, manifestPath) - priority(b.relPath, manifestPath) || a.relPath.localeCompare(b.relPath));

  const files = [];
  let totalBytes = 0;
  for (const item of discovered) {
    if (files.length >= PREVIEW_LIMITS.maxFiles) {
      skippedCount += 1;
      continue;
    }
    const stat = await fs.stat(item.absPath);
    if (stat.size > PREVIEW_LIMITS.maxFileBytes) {
      skippedCount += 1;
      continue;
    }
    const buffer = await fs.readFile(item.absPath);
    if (isBinary(buffer) || totalBytes + buffer.length > PREVIEW_LIMITS.maxTotalBytes) {
      skippedCount += 1;
      continue;
    }
    totalBytes += buffer.length;
    files.push({
      path: item.relPath,
      language: languageForPath(item.relPath),
      size: buffer.length,
      content: buffer.toString("utf8"),
    });
  }

  return { files, totalBytes, skippedCount };
}

function isPreviewCandidate(relPath, manifestPath) {
  const name = path.posix.basename(relPath);
  if (relPath === manifestPath) return true;
  if (/^readme(\.[a-z0-9]+)?$/i.test(name)) return true;
  return TEXT_EXTENSIONS.has(path.posix.extname(relPath).toLowerCase());
}

function priority(relPath, manifestPath) {
  const name = path.posix.basename(relPath);
  if (relPath === manifestPath) return 0;
  if (/^readme/i.test(name)) return 1;
  if (/\.(ya?ml|json|toml)$/i.test(name)) return 2;
  if (/\.(js|jsx|ts|tsx|py|sh)$/i.test(name)) return 3;
  if (/\.md$/i.test(name)) return 4;
  return 5;
}

function isBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return sample.includes(0);
}

function languageForPath(relPath) {
  const ext = path.posix.extname(relPath).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".js" || ext === ".jsx") return "javascript";
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".json") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  if (ext === ".md" || ext === ".mdx") return "markdown";
  if (ext === ".css") return "css";
  if (ext === ".html" || ext === ".xml") return "xml";
  if (ext === ".sh" || ext === ".bash" || ext === ".zsh") return "bash";
  if (ext === ".sql") return "sql";
  return "plaintext";
}

function nextSkillId(repo, base) {
  let id = base || "skill";
  let index = 2;
  while (repo.getEntity("skills", id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

function slugSkillId(value) {
  return cleanInput(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "skill";
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
