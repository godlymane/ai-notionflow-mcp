/**
 * ContentAgent — Manages content calendar via Notion MCP
 * Generates content ideas, creates draft pages, tracks publishing
 */
async function run(notion, anthropic, contentDbId) {
  if (!contentDbId) return { summary: 'No content DB configured', actionsCount: 0 };

  const today = new Date();
  const isMonday = today.getDay() === 1;
  let itemsCreated = 0;

  // Fetch existing content for context
  const existing = await notion.databases.query({
    database_id: contentDbId,
    filter: { property: 'Status', select: { equals: 'Idea' } },
    page_size: 10,
  });

  const existingIdeas = existing.results.map(p =>
    p.properties.Title?.title?.[0]?.plain_text || 'Untitled'
  );

  // Generate new content ideas on Monday (or if < 5 ideas exist)
  if (isMonday || existing.results.length < 5) {
    const aiResponse = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You're a content strategist for an AI startup. Generate 5 UNIQUE content ideas for this week.
Existing ideas (avoid duplicates): ${existingIdeas.join(', ')}

For each idea, provide:
- Title (catchy, SEO-friendly)
- Platform (Dev.to, Twitter, LinkedIn, YouTube)  
- Hook (1 sentence why this will go viral)

Format as JSON array: [{"title":"...","platform":"...","hook":"..."}]`
      }],
    });

    let ideas = [];
    try {
      const jsonMatch = aiResponse.content[0].text.match(/\[[\s\S]*\]/);
      if (jsonMatch) ideas = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse content ideas JSON');
      ideas = [];
    }

    // Create each idea as a Notion page
    for (const idea of ideas.slice(0, 5)) {
      const publishDate = new Date(today);
      publishDate.setDate(publishDate.getDate() + Math.floor(Math.random() * 7));

      await notion.pages.create({
        parent: { database_id: contentDbId },
        properties: {
          Title: { title: [{ text: { content: idea.title || 'Untitled Content' } }] },
          Platform: { select: { name: idea.platform || 'Dev.to' } },
          Status: { select: { name: 'Idea' } },
          'Publish Date': { date: { start: publishDate.toISOString().split('T')[0] } },
        },
        children: [
          {
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: `🎯 Hook: ${idea.hook || 'TBD'}\n\n📝 Outline:\n- Intro\n- Main points\n- Call to action` } }],
            },
          },
        ],
      });

      itemsCreated++;
    }
  }

  // Check for overdue content (past publish date, still not published)
  const overdueContent = await notion.databases.query({
    database_id: contentDbId,
    filter: {
      and: [
        { property: 'Status', select: { does_not_equal: 'Published' } },
        { property: 'Publish Date', date: { before: today.toISOString().split('T')[0] } },
      ],
    },
  });

  return {
    summary: `${itemsCreated} ideas created, ${overdueContent.results.length} overdue`,
    actionsCount: itemsCreated,
    itemsCreated,
    overdueContent: overdueContent.results.length,
  };
}

module.exports = { run };
