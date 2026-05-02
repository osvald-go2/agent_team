import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { openDatabase } from "../src/db/connection.js";
import { Repository } from "../src/db/repository.js";
import { importSkillFromGit, SkillImportError } from "../src/skills/gitImporter.js";

const execFile = promisify(execFileCallback);

async function tempDb(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-team-skill-db-"));
  const db = openDatabase(path.join(dir, "atelier.db"));
  t.after(async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return new Repository(db);
}

async function git(dir, args) {
  await execFile("git", args, { cwd: dir });
}

async function createSkillRepo(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-team-skill-repo-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  await fs.mkdir(path.join(dir, "skills/demo/src"), { recursive: true });
  await fs.mkdir(path.join(dir, "skills/empty"), { recursive: true });
  await fs.writeFile(path.join(dir, "skills/demo/SKILL.md"), [
    "---",
    "name: demo.skill",
    "description: Demo import skill.",
    "category: code",
    "version: 1.2.3",
    "---",
    "",
    "# Demo Skill",
    "",
    "Use this skill in tests.",
    "",
  ].join("\n"));
  await fs.writeFile(path.join(dir, "skills/demo/README.md"), "# Demo\n\nPreview docs.\n");
  await fs.writeFile(path.join(dir, "skills/demo/src/index.js"), "export function run() { return 'ok'; }\n");
  await fs.writeFile(path.join(dir, "skills/demo/blob.bin"), Buffer.from([0, 1, 2, 3, 4]));
  await fs.writeFile(path.join(dir, "skills/demo/large.txt"), "x".repeat(129 * 1024));
  await fs.writeFile(path.join(dir, "skills/empty/README.md"), "# Missing skill manifest\n");

  await git(dir, ["init"]);
  await git(dir, ["config", "user.email", "tests@example.com"]);
  await git(dir, ["config", "user.name", "Tests"]);
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "seed skill"]);
  return dir;
}

test("imports a skill from a Git subdirectory into SQLite with preview files", async (t) => {
  const sourceRepo = await createSkillRepo(t);
  const repo = await tempDb(t);

  const skill = await importSkillFromGit({ url: sourceRepo, subdir: "skills/demo" }, { repo });

  assert.equal(skill.id, "demo.skill");
  assert.equal(skill.name, "demo.skill");
  assert.equal(skill.desc, "Demo import skill.");
  assert.equal(skill.category, "code");
  assert.equal(skill.kind, "custom");
  assert.match(skill.source.commit, /^[0-9a-f]{40}$/);
  assert.equal(skill.source.url, sourceRepo);
  assert.equal(skill.source.subdir, "skills/demo");
  assert.equal(skill.meta.version, "1.2.3");
  assert.equal(skill.meta.skillFile, "SKILL.md");
  assert.ok(skill.meta.fileCount >= 3);
  assert.ok(skill.meta.totalBytes > 0);
  assert.ok(skill.meta.skippedCount >= 2);
  assert.deepEqual(
    skill.files.map((file) => file.path),
    ["SKILL.md", "README.md", "src/index.js"],
  );
  assert.ok(!skill.files.some((file) => file.path === "blob.bin"));
  assert.ok(!skill.files.some((file) => file.path === "large.txt"));

  const persisted = repo.getEntity("skills", "demo.skill");
  assert.equal(persisted.source.commit, skill.source.commit);
  assert.equal(persisted.files[0].content.includes("Demo Skill"), true);
});

test("rejects selected Git subdirectories without SKILL.md", async (t) => {
  const sourceRepo = await createSkillRepo(t);
  const repo = await tempDb(t);

  await assert.rejects(
    importSkillFromGit({ url: sourceRepo, subdir: "skills/empty" }, { repo }),
    (error) => {
      assert.equal(error instanceof SkillImportError, true);
      assert.equal(error.code, "skill_manifest_not_found");
      return true;
    },
  );
});

test("generates a unique id instead of overwriting an existing skill", async (t) => {
  const sourceRepo = await createSkillRepo(t);
  const repo = await tempDb(t);

  const first = await importSkillFromGit({ url: sourceRepo, subdir: "skills/demo" }, { repo });
  const second = await importSkillFromGit({ url: sourceRepo, subdir: "skills/demo" }, { repo });

  assert.equal(first.id, "demo.skill");
  assert.equal(second.id, "demo.skill-2");
  assert.equal(repo.getEntity("skills", "demo.skill").id, "demo.skill");
  assert.equal(repo.getEntity("skills", "demo.skill-2").id, "demo.skill-2");
});
