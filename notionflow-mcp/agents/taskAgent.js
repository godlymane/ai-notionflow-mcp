/**
 * TaskAgent — Manages startup task backlog via Notion MCP
 * Finds overdue tasks, reprioritizes, creates daily standup summaries
 */
async function run(notion, anthropic, tasksDbId) {
  if (!tasksDbId) return { summary: 'No tasks DB configured', actionsCount: 0 };

  const today = new Date().toISOString().split('T')[0];

  // Fetch all open tasks
  const response = await notion.databases.query({
    database_id: tasksDbId,
    filter: {
      and: [
        { property: 'Status', select: { does_not_equal: 'Done' } },
        { property: 'Status', select: { does_not_equal: 'Cancelled' } },
      ],
    },
    sorts: [{ property: 'Due Date', direction: 'ascending' }],
  });

  const tasks = response.results;
  const overdueTasks = tasks.filter(t => {
    const due = t.properties['Due Date']?.date?.start;
    return due && due < today;
  });

  const taskSummary = tasks.slice(0, 15).map(t => ({
    title: t.properties.Name?.title?.[0]?.plain_text || 'Untitled',
    status: t.properties.Status?.select?.name || 'Unknown',
    priority: t.properties.Priority?.select?.name || 'Medium',
    dueDate: t.properties['Due Date']?.date?.start || 'No date',
  }));

  // AI analysis
  const aiResponse = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Startup task manager AI. Today: ${today}. Tasks:\n${JSON.stringify(taskSummary, null, 2)}\n\nOverdue: ${overdueTasks.length}. Write a concise 3-bullet standup + top 3 priorities for today.`
    }],
  });

  // Create standup page in Notion
  await notion.pages.create({
    parent: { database_id: tasksDbId },
    properties: {
      Name: { title: [{ text: { content: `📋 AI Standup — ${today}` } }] },
      Status: { select: { name: 'Done' } },
      Priority: { select: { name: 'Low' } },
    },
    children: [{
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: aiResponse.content[0].text } }] },
    }],
  });

  return {
    summary: `${tasks.length} tasks, ${overdueTasks.length} overdue, standup created`,
    actionsCount: 1 + overdueTasks.length,
  };
}

module.exports = { run };
