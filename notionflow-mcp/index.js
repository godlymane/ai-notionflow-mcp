#!/usr/bin/env node
/**
 * NotionFlow — AI Startup OS powered by Notion MCP
 * DEV × Notion MCP Challenge Submission
 * 
 * Autonomous AI agent that manages your entire startup
 * using Notion as its persistent brain.
 */

require('dotenv').config();
const cron = require('node-cron');
const { Client } = require('@notionhq/client');
const Anthropic = require('@anthropic-ai/sdk');

const taskAgent = require('./agents/taskAgent');
const crmAgent = require('./agents/crmAgent');
const financeAgent = require('./agents/financeAgent');
const contentAgent = require('./agents/contentAgent');

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DB_IDS = {
  tasks: process.env.NOTION_TASKS_DB_ID,
  crm: process.env.NOTION_CRM_DB_ID,
  finance: process.env.NOTION_FINANCE_DB_ID,
  content: process.env.NOTION_CONTENT_DB_ID,
  logs: process.env.NOTION_LOGS_DB_ID,
};

/**
 * Main orchestrator — runs all agents and logs results to Notion
 */
async function runOrchestrator() {
  const startTime = new Date();
  console.log(`\n🤖 NotionFlow Agent Loop Started — ${startTime.toISOString()}`);
  
  const results = {};

  // Run all agents in parallel for speed
  const [taskResult, crmResult, financeResult, contentResult] = await Promise.allSettled([
    taskAgent.run(notion, anthropic, DB_IDS.tasks),
    crmAgent.run(notion, anthropic, DB_IDS.crm),
    financeAgent.run(notion, anthropic, DB_IDS.finance),
    contentAgent.run(notion, anthropic, DB_IDS.content),
  ]);

  results.tasks = taskResult.status === 'fulfilled' ? taskResult.value : { error: taskResult.reason?.message };
  results.crm = crmResult.status === 'fulfilled' ? crmResult.value : { error: crmResult.reason?.message };
  results.finance = financeResult.status === 'fulfilled' ? financeResult.value : { error: financeResult.reason?.message };
  results.content = contentResult.status === 'fulfilled' ? contentResult.value : { error: contentResult.reason?.message };

  // Log run to Notion
  await logRunToNotion(notion, DB_IDS.logs, results, startTime);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Agent loop complete in ${duration}s`);
  console.log('📊 Results:', JSON.stringify(results, null, 2));
}

/**
 * Log agent run results back to Notion for human review
 */
async function logRunToNotion(notion, logsDbId, results, startTime) {
  if (!logsDbId) return;
  
  try {
    const summary = Object.entries(results)
      .map(([agent, result]) => `**${agent}**: ${result.error ? `❌ ${result.error}` : `✅ ${result.summary || 'Done'}`}`)
      .join('\n');

    await notion.pages.create({
      parent: { database_id: logsDbId },
      properties: {
        Name: { title: [{ text: { content: `Agent Run — ${startTime.toLocaleString()}` } }] },
        Status: { select: { name: 'Completed' } },
        'Tasks Actions': { number: results.tasks?.actionsCount || 0 },
        'CRM Actions': { number: results.crm?.actionsCount || 0 },
        'Finance Alerts': { number: results.finance?.alertsCount || 0 },
        'Content Created': { number: results.content?.itemsCreated || 0 },
      },
      children: [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: summary } }],
          },
        },
      ],
    });
  } catch (err) {
    console.error('Failed to log to Notion:', err.message);
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

if (process.argv[2] === '--once') {
  // Run once and exit
  runOrchestrator().catch(console.error).finally(() => process.exit(0));
} else {
  // Run on schedule (default: every 15 minutes)
  const interval = process.env.CRON_INTERVAL || '*/15 * * * *';
  console.log(`🚀 NotionFlow starting — schedule: ${interval}`);
  console.log('📋 Databases:', DB_IDS);

  // Run immediately on start
  runOrchestrator().catch(console.error);

  // Then on schedule
  cron.schedule(interval, () => {
    runOrchestrator().catch(console.error);
  });

  console.log('⏱️  Agent loop scheduled. Press Ctrl+C to stop.');
}
