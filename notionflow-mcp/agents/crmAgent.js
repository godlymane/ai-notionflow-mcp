/**
 * CRMAgent — Manages startup CRM pipeline via Notion MCP
 * Finds stale leads, generates follow-up drafts, updates pipeline
 */
async function run(notion, anthropic, crmDbId) {
  if (!crmDbId) return { summary: 'No CRM DB configured', actionsCount: 0 };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  let actionsCount = 0;

  // Fetch active leads
  const response = await notion.databases.query({
    database_id: crmDbId,
    filter: {
      and: [
        { property: 'Stage', select: { does_not_equal: 'Closed Won' } },
        { property: 'Stage', select: { does_not_equal: 'Closed Lost' } },
      ],
    },
  });

  const leads = response.results;

  // Find stale leads (no contact in 7+ days)
  const staleLeads = leads.filter(lead => {
    const lastContact = lead.properties['Last Contact']?.date?.start;
    return !lastContact || lastContact < sevenDaysAgo;
  });

  // Generate follow-up drafts for stale leads
  for (const lead of staleLeads.slice(0, 5)) { // Max 5 at a time
    const name = lead.properties['Lead Name']?.title?.[0]?.plain_text || 'there';
    const company = lead.properties['Company']?.rich_text?.[0]?.plain_text || 'your company';
    const stage = lead.properties['Stage']?.select?.name || 'prospect';
    const value = lead.properties['Value']?.number || 0;

    const followUpResponse = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Write a short, friendly follow-up email (3 sentences max) for: ${name} at ${company}. Deal stage: ${stage}. Deal value: $${value}. Be warm but direct about checking in.`
      }],
    });

    // Update the lead's Notion page with follow-up draft
    await notion.pages.update({
      page_id: lead.id,
      properties: {
        'Follow-up Draft': {
          rich_text: [{ type: 'text', text: { content: followUpResponse.content[0].text } }]
        },
        'Follow-up Needed': { checkbox: true },
      },
    });

    actionsCount++;
  }

  return {
    summary: `${leads.length} leads, ${staleLeads.length} stale, ${actionsCount} follow-ups drafted`,
    actionsCount,
    staleLeads: staleLeads.length,
    totalLeads: leads.length,
  };
}

module.exports = { run };
