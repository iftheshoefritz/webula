#!/usr/bin/env node
/**
 * One-time script to register the /card slash command with Discord.
 *
 * Usage:
 *   DISCORD_APPLICATION_ID=<app-id> DISCORD_BOT_TOKEN=<bot-token> node scripts/register-discord-commands.js
 *
 * Both values are in the Discord Developer Portal:
 *   - Application ID: General Information → Application ID
 *   - Bot Token:      Bot → Token (click "Reset Token" if you've never copied it)
 *
 * Re-running this script is safe — Discord upserts commands by name.
 * To delete the command instead, use the Discord API:
 *   DELETE /applications/{id}/commands/{command-id}
 */

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error('Error: DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must both be set.');
  console.error('');
  console.error('Example:');
  console.error('  DISCORD_APPLICATION_ID=123456789 DISCORD_BOT_TOKEN=your-token node scripts/register-discord-commands.js');
  process.exit(1);
}

const commands = [
  {
    name: 'card',
    description: 'Search for ST2e cards',
    options: [
      {
        name: 'query',
        description: 'Search query (e.g. "Picard", "type:personnel", "name:Worf sk:engineer")',
        type: 3, // STRING
        required: true,
      },
    ],
  },
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;

  console.log(`Registering ${commands.length} command(s) with Discord...`);
  console.log(`Application ID: ${APPLICATION_ID}`);
  console.log(`Endpoint: ${url}`);
  console.log('');

  for (const command of commands) {
    console.log(`  Registering /${command.name}...`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    const body = await res.json();

    if (res.ok) {
      console.log(`  ✓ /${command.name} registered (id: ${body.id})`);
    } else {
      console.error(`  ✗ Failed to register /${command.name}`);
      console.error(`    HTTP ${res.status}: ${JSON.stringify(body)}`);
      process.exit(1);
    }
  }

  console.log('');
  console.log('Done. The /card command is now available globally (may take up to 1 hour to propagate).');
}

registerCommands().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
