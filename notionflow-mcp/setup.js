#!/usr/bin/env node
/**
 * NotionFlow Setup — Creates all Notion databases
 */
require('dotenv').config();
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const ROOT = process.env.NOTION_PAGE_ID;

const makeDb = (title, emoji, props) =>
  notion.databases.create({
    parent: { page_id: ROOT },
    title: [{ type: 'text', text: { content: `${emoji} ${title}` } }],
    properties: props,
  });

async function main() {
  if (!process.env.NOTION_API_KEY || !ROOT) {
    console.error('Set NOTION_API_KEY and NOTION_PAGE_ID in .env'); process.exit(1);
  }

  const tasks = await makeDb('NotionFlow Tasks', '📋', {
    Name: { title: {} },
    Status: { select: { options: [
      {name:'Not Started',color:'gray'},{name:'In Progress',color:'blue'},
      {name:'Blocked',color:'red'},{name:'Done',color:'green'},{name:'Cancelled',color:'pink'}
    ]}},
    Priority: { select: { options: [
      {name:'Critical',color:'red'},{name:'High',color:'orange'},{name:'Medium',color:'yellow'},{name:'Low',color:'gray'}
    ]}},
    'Due Date': { date: {} }, Assignee: { rich_text: {} },
  });

  const crm = await makeDb('NotionFlow CRM', '🎯', {
    'Lead Name': { title: {} }, Company: { rich_text: {} }, Email: { email: {} },
    Stage: { select: { options: [
      {name:'Lead',color:'gray'},{name:'Qualified',color:'blue'},{name:'Demo',color:'yellow'},
      {name:'Proposal',color:'orange'},{name:'Closed Won',color:'green'},{name:'Closed Lost',color:'red'}
    ]}},
    Value: { number: { format: 'dollar' } }, 'Last Contact': { date: {} },
    'Follow-up Needed': { checkbox: {} }, 'Follow-up Draft': { rich_text: {} },
  });

  const finance = await makeDb('NotionFlow Finance', '💰', {
    Description: { title: {} }, Date: { date: {} },
    Type: { select: { options: [{name:'Income',color:'green'},{name:'Expense',color:'red'},{name:'Report',color:'blue'}] }},
    Category: { select: { options: [
      {name:'Revenue',color:'green'},{name:'Payroll',color:'red'},{name:'Infrastructure',color:'orange'},
      {name:'Marketing',color:'purple'},{name:'Tools',color:'yellow'},{name:'Report',color:'blue'}
    ]}},
    Amount: { number: { format: 'dollar' } },
  });

  const content = await makeDb('NotionFlow Content', '📅', {
    Title: { title: {} },
    Platform: { select: { options: [
      {name:'Dev.to',color:'default'},{name:'Twitter',color:'blue'},{name:'LinkedIn',color:'blue'},{name:'YouTube',color:'red'}
    ]}},
    Status: { select: { options: [
      {name:'Idea',color:'gray'},{name:'Drafting',color:'yellow'},{name:'Scheduled',color:'blue'},{name:'Published',color:'green'}
    ]}},
    'Publish Date': { date: {} }, Views: { number: {} },
  });

  const logs = await makeDb('NotionFlow Logs', '📊', {
    Name: { title: {} },
    Status: { select: { options: [{name:'Completed',color:'green'},{name:'Failed',color:'red'}] }},
    'Tasks Actions': { number: {} }, 'CRM Actions': { number: {} },
    'Finance Alerts': { number: {} }, 'Content Created': { number: {} },
  });

  console.log('\n✅ Add to .env:');
  console.log(`NOTION_TASKS_DB_ID=${tasks.id}`);
  console.log(`NOTION_CRM_DB_ID=${crm.id}`);
  console.log(`NOTION_FINANCE_DB_ID=${finance.id}`);
  console.log(`NOTION_CONTENT_DB_ID=${content.id}`);
  console.log(`NOTION_LOGS_DB_ID=${logs.id}`);
}

main().catch(console.error);
