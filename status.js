// Load environment variables
require('dotenv').config();

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActivityType 
} = require('discord.js');

// --- CONFIGURATION ---
const config = {
    staffIds: [
        '1081876265683927080',
        '1403084314819825787',
        '1193415556402008169',
        '1317831363474227251',
        '1408294418695589929',
        '1355792114818224178',
        '1231563118455554119',
        '1033399411130245190',
        '1180098931280064562',
        '1228377961569325107'
    ],
    channelId: '1445693527274295378',
    emojis: {
        offline: '<:offline:1446211386718949497>',
        dnd: '<:dnd:1446211384818925700>',
        online: '<:online:1446211377848123484>',
        idle: '<:idle:1446211381354434693>',
        default: '⚫'
    },
    token: process.env.DISCORD_TOKEN
};

// --- CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Global state
let statusMessageId = null;
let cycleCount = 0;

const MAX_CYCLES = 2160;  // Every 12 hours (2160 * 20s = 12h)
const INTERVAL_MS = 20000; // Every 20 seconds

// Status → Emoji
function getEmoji(status) {
    switch (status) {
        case 'online': return config.emojis.online;
        case 'idle': return config.emojis.idle;
        case 'dnd': return config.emojis.dnd;
        case 'offline':
        case 'invisible': return config.emojis.offline;
        default: return config.emojis.default;
    }
}

// Delete all messages in a channel
async function clearChannelMessages(channel) {
    try {
        let deletedCount = 0;
        let fetchMore = true;

        while (fetchMore) {
            const messages = await channel.messages.fetch({ limit: 100 });
            if (messages.size === 0) break;

            const now = Date.now();
            const twoWeeksAgo = now - 1209600000; // 14 days in ms

            const recent = messages.filter(m => m.createdTimestamp > twoWeeksAgo);
            const old = messages.filter(m => m.createdTimestamp <= twoWeeksAgo);

            if (recent.size > 0) {
                await channel.bulkDelete(recent, true);
                deletedCount += recent.size;
            }

            for (const msg of old.values()) {
                try {
                    await msg.delete();
                    deletedCount++;
                    await new Promise(res => setTimeout(res, 100));
                } catch (err) {
                    console.error(`Failed deleting old message:`, err.message);
                }
            }

            if (messages.size < 100) fetchMore = false;
        }

        console.log(`Cleared ${deletedCount} messages from channel.`);
    } catch (error) {
        console.error('Error clearing messages:', error);
    }
}

async function updateStatus() {
    cycleCount++;

    if (!client.isReady()) return;

    try {
        const channel = await client.channels.fetch(config.channelId);
        if (!channel) return console.error("Channel not found.");

        const guild = channel.guild;
        if (!guild) return console.error("Guild not found.");

        const available = [];
        const unavailable = [];

        for (const id of config.staffIds) {
            try {
                const member = await guild.members.fetch(id);
                const status = member.presence?.status || 'offline';

                // --- FIX: Using correct template literal syntax for the list item ---
                const line = `${getEmoji(status)} <@${member.id}> (\`${member.user.username}\`)`;
                // --- END FIX ---

                if (['online', 'idle'].includes(status)) {
                    available.push(line);
                } else {
                    unavailable.push(line);
                }
            } catch {
                unavailable.push(`❌ <@${id}> (\`User Data Unavailable\`)`);
            }
        }

        // Update Bot Presence
        const count = available.length;
        // --- FIX: Using correct template literal syntax for the activity name ---
        client.user.setPresence({
            activities: [{ name: `${count} staff${count === 1 ? "" : "s"} available`, type: ActivityType.Watching }],
            status: 'online'
        });
        // --- END FIX ---

        const embed = new EmbedBuilder()
            .setColor(0x808080)
            .setTitle('👥 Staff Status Overview')
            .setAuthor({
                name: "👑 Shivam's Discord",
                iconURL: "https://cdn.discordapp.com/icons/1349281907765936188/7f90f5ba832e7672d4f55eb0c6017813.png",
                url: "https://discord.gg/ha7K8ngyex"
            })
            .addFields(
                { name: 'Available Staff:', value: available.join('\n') || "*No staff available.*" },
                { name: 'Unavailable Staff:', value: unavailable.join('\n') || "*No staff unavailable.*" }
            )
            .setFooter({ text: 'Status last updated' })
            .setTimestamp();

        const newCycle = cycleCount >= MAX_CYCLES;

        if (newCycle) {
            console.log("Starting new cycle: Clearing channel...");
            await clearChannelMessages(channel);
            const msg = await channel.send({ embeds: [embed] });
            statusMessageId = msg.id;
            cycleCount = 0;  // Reset to 0 since we increment at the beginning
        } else {
            try {
                if (!statusMessageId) {
                    const msg = await channel.send({ embeds: [embed] });
                    statusMessageId = msg.id;
                } else {
                    const msg = await channel.messages.fetch(statusMessageId);
                    await msg.edit({ embeds: [embed] });
                }
            } catch (err) {
                console.error("Failed to edit existing message, sending new one:", err);
                const msg = await channel.send({ embeds: [embed] });
                statusMessageId = msg.id;
            }
        }
    } catch (err) {
        console.error("Error in updateStatus():", err);
    }
}

client.on('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);

    updateStatus();
    setInterval(updateStatus, INTERVAL_MS);
});

client.login(config.token).catch(err => {
    console.error("Invalid Token:", err);
});
