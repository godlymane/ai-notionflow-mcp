/**
 * FinanceAgent — Monitors startup finances via Notion MCP
 * Calculates burn rate, runway, alerts on overspend
 */
async function run(notion, anthropic, financeDbId) {
  if (!financeDbId) return { summary: 'No finance DB configured', actionsCount: 0 };

  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  let alertsCount = 0;

  // Fetch all finance entries this month
  const response = await notion.databases.query({
    database_id: financeDbId,
    filter: {
      property: 'Date',
      date: { this_week: {} },
    },
  });

  const entries = response.results;

  // Calculate totals
  let totalIncome = 0, totalExpenses = 0;
  const expenseByCategory = {};

  for (const entry of entries) {
    const amount = entry.properties['Amount']?.number || 0;
    const type = entry.properties['Type']?.select?.name;
    const category = entry.properties['Category']?.select?.name || 'Other';

    if (type === 'Income') {
      totalIncome += amount;
    } else if (type === 'Expense') {
      totalExpenses += amount;
      expenseByCategory[category] = (expenseByCategory[category] || 0) + amount;
    }
  }

  const netCashFlow = totalIncome - totalExpenses;
  const cashBalance = parseFloat(process.env.CURRENT_CASH_BALANCE || '50000');
  const monthlyBurnRate = totalExpenses;
  const runwayMonths = monthlyBurnRate > 0 ? (cashBalance / monthlyBurnRate).toFixed(1) : 'N/A';
  const monthlyBudget = parseFloat(process.env.MONTHLY_BUDGET || '10000');
  const budgetUsed = ((totalExpenses / monthlyBudget) * 100).toFixed(1);

  // AI financial analysis
  const aiResponse = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Startup CFO AI. This month's financials:
Income: $${totalIncome}
Expenses: $${totalExpenses}
Net: $${netCashFlow}
Budget used: ${budgetUsed}%
Runway: ${runwayMonths} months
Top expense categories: ${JSON.stringify(expenseByCategory)}

Give 2-3 bullet financial insights and one recommendation. Be direct.`
    }],
  });

  // Create finance report in Notion
  const reportPage = await notion.pages.create({
    parent: { database_id: financeDbId },
    properties: {
      Date: { date: { start: new Date().toISOString().split('T')[0] } },
      Category: { select: { name: 'Report' } },
      Type: { select: { name: 'Report' } },
      Amount: { number: netCashFlow },
    },
    children: [
      {
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: `💰 Finance Report — ${thisMonth}` } }] },
      },
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: `Income: $${totalIncome} | Expenses: $${totalExpenses} | Runway: ${runwayMonths} mo` } }] },
      },
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: aiResponse.content[0].text } }] },
      },
    ],
  });

  // Check if overspent
  if (parseFloat(budgetUsed) > 90) {
    alertsCount++;
    console.warn(`⚠️ FINANCE ALERT: ${budgetUsed}% of monthly budget used!`);
  }

  if (runwayMonths !== 'N/A' && parseFloat(runwayMonths) < 3) {
    alertsCount++;
    console.warn(`🚨 CRITICAL: Only ${runwayMonths} months runway!`);
  }

  return {
    summary: `Income $${totalIncome}, Expenses $${totalExpenses}, Runway ${runwayMonths}mo`,
    actionsCount: 1,
    alertsCount,
    income: totalIncome,
    expenses: totalExpenses,
    runway: runwayMonths,
  };
}

module.exports = { run };
