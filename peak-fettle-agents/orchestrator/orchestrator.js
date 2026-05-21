/**
 * Peak Fettle Multi-Agent Orchestrator
 *
 * This script is the entry point for the Peak Fettle agent system.
 * It accepts a high-level task, routes it to the appropriate agent team,
 * and pipes outputs through the reporter/teacher for Arvin's review.
 *
 * Usage:
 *   node orchestrator.js --task "implement workout logging screen"
 *   node orchestrator.js --task "run beta test on streak feature"
 *   node orchestrator.js --task "executive review of sprint 1"
 *   node orchestrator.js --teach "explain how JWT authentication works"
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY in your .env file
 *   - npm install (run once)
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(__dirname, "../agents");

// Load .env from the parent directory (peak-fettle-agents/)
dotenv.config({ path: path.join(__dirname, "../.env") });

// Debug: confirm key is loading (shows first 20 chars only)
console.log("API key loaded:", process.env.ANTHROPIC_API_KEY?.slice(0, 20) ?? "NOT FOUND");

// ─── Load agent definitions ─────────────────────────────────────────────────

function loadAgent(filename) {
  const filepath = path.join(AGENTS_DIR, filename);
  const raw = fs.readFileSync(filepath, "utf-8");

  // Parse YAML frontmatter
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Invalid agent file format: ${filename}`);

  const frontmatter = match[1];
  const systemPrompt = match[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
    systemPrompt,
  };
}

const agents = {
  devLead: loadAgent("dev-lead.md"),
  devFrontend: loadAgent("dev-frontend.md"),
  devBackend: loadAgent("dev-backend.md"),
  devDatabase: loadAgent("dev-database.md"),
  betaCasual: loadAgent("beta-casual-gymgoer.md"),
  betaLifter: loadAgent("beta-competitive-lifter.md"),
  betaRunner: loadAgent("beta-runner.md"),
  betaBeginner: loadAgent("beta-beginner.md"),
  execPM: loadAgent("exec-product-manager.md"),
  execCTO: loadAgent("exec-cto.md"),
  execCEO: loadAgent("exec-ceo.md"),
  reporter: loadAgent("reporter-teacher.md"),
};

// ─── Anthropic client ────────────────────────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Run a single agent ──────────────────────────────────────────────────────

async function runAgent(agent, userMessage) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🤖 Agent: ${agent.name}`);
  console.log(`${"─".repeat(60)}`);

  const messages = [{ role: "user", content: userMessage }];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: agent.systemPrompt,
    messages,
  });

  const output = response.content[0].text;
  console.log(output);
  return output;
}

// ─── Routing logic ───────────────────────────────────────────────────────────

function classifyTask(task) {
  const t = task.toLowerCase();
  if (t.includes("beta") || t.includes("test") || t.includes("user feedback")) return "beta";
  if (t.includes("exec") || t.includes("strategy") || t.includes("priorit")) return "exec";
  if (t.includes("teach") || t.includes("explain") || t.includes("learn")) return "teach";
  return "dev"; // default
}

// ─── Workflow runners ─────────────────────────────────────────────────────────

async function runDevWorkflow(task) {
  console.log("\n🏗️  DEV WORKFLOW STARTING\n");

  // 1. Lead dev plans the work
  const plan = await runAgent(agents.devLead, `Plan and implement the following task: ${task}`);

  // 2. Specialists execute (run in parallel where possible)
  const [frontendOutput, backendOutput, dbOutput] = await Promise.all([
    runAgent(agents.devFrontend, `The lead dev has planned this work:\n\n${plan}\n\nExecute the frontend portion.`),
    runAgent(agents.devBackend, `The lead dev has planned this work:\n\n${plan}\n\nExecute the backend portion.`),
    runAgent(agents.devDatabase, `The lead dev has planned this work:\n\n${plan}\n\nExecute the database portion.`),
  ]);

  // 3. Lead dev integrates
  const integration = await runAgent(
    agents.devLead,
    `Review and integrate the following outputs:\n\nFrontend:\n${frontendOutput}\n\nBackend:\n${backendOutput}\n\nDatabase:\n${dbOutput}`
  );

  // 4. Reporter explains to Arvin
  await runAgent(
    agents.reporter,
    `Report and teach the following dev work to Arvin:\n\nTask: ${task}\n\nDev Lead Plan:\n${plan}\n\nIntegration Summary:\n${integration}`
  );
}

async function runBetaWorkflow(task) {
  console.log("\n🧪 BETA TEST WORKFLOW STARTING\n");

  // All four testers run in parallel
  const [casual, lifter, runner, beginner] = await Promise.all([
    runAgent(agents.betaCasual, `Test the following feature as your persona: ${task}`),
    runAgent(agents.betaLifter, `Test the following feature as your persona: ${task}`),
    runAgent(agents.betaRunner, `Test the following feature as your persona: ${task}`),
    runAgent(agents.betaBeginner, `Test the following feature as your persona: ${task}`),
  ]);

  // PM synthesizes feedback
  const pmSummary = await runAgent(
    agents.execPM,
    `Synthesize this beta test feedback and recommend next actions:\n\nCasual user (Jamie):\n${casual}\n\nCompetitive lifter (Marcus):\n${lifter}\n\nRunner (Priya):\n${runner}\n\nBeginner (Derek):\n${beginner}`
  );

  // Reporter surfaces key findings to Arvin
  await runAgent(
    agents.reporter,
    `Report the following beta test results to Arvin and explain any technical implications:\n\nFeature tested: ${task}\n\nPM Summary:\n${pmSummary}`
  );
}

async function runExecWorkflow(task) {
  console.log("\n📊 EXECUTIVE WORKFLOW STARTING\n");

  const [pmOutput, ctoOutput] = await Promise.all([
    runAgent(agents.execPM, task),
    runAgent(agents.execCTO, task),
  ]);

  const ceoDecision = await runAgent(
    agents.execCEO,
    `PM input:\n${pmOutput}\n\nCTO input:\n${ctoOutput}\n\nTask: ${task}`
  );

  await runAgent(
    agents.reporter,
    `Report the following executive decisions to Arvin:\n\nTask: ${task}\n\nCEO Decision:\n${ceoDecision}`
  );
}

async function runTeachWorkflow(topic) {
  console.log("\n📚 TEACHING SESSION STARTING\n");
  await runAgent(agents.reporter, `Teach Arvin about the following topic interactively: ${topic}`);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const taskFlag = args.indexOf("--task");
  const teachFlag = args.indexOf("--teach");

  if (taskFlag !== -1 && args[taskFlag + 1]) {
    const task = args[taskFlag + 1];
    const type = classifyTask(task);

    if (type === "dev") await runDevWorkflow(task);
    else if (type === "beta") await runBetaWorkflow(task);
    else if (type === "exec") await runExecWorkflow(task);
    else if (type === "teach") await runTeachWorkflow(task);
  } else if (teachFlag !== -1 && args[teachFlag + 1]) {
    await runTeachWorkflow(args[teachFlag + 1]);
  } else {
    console.log(`
Peak Fettle Agent Orchestrator

Usage:
  node orchestrator.js --task "implement workout logging screen"
  node orchestrator.js --task "run beta test on streak feature"
  node orchestrator.js --task "executive review of sprint 1"
  node orchestrator.js --teach "explain how JWT authentication works"

Task routing:
  - Dev tasks → dev-lead → frontend/backend/database → reporter
  - Beta tasks → all 4 testers in parallel → PM synthesis → reporter
  - Exec tasks → PM + CTO in parallel → CEO decision → reporter
  - Teach tasks → reporter/teacher directly
    `);
  }
}

main().catch(console.error);
