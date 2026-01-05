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
        '1081876265683927080', '1403084314819825787', '1193415556402008169',
        '1317831363474227251', '1408294418695589929', '1355792114818224178',
        '1231563118455554119', '1033399411130245190', '1180098931280064562',
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Global state
let statusMessageId = null;
let cycleCount = 0;

// CALCULATIONS for 1 Hour:
// Interval: 20 seconds. 3600s / 20s = 180 cycles.
const MAX_CYCLES = 180; 
const INTERVAL_MS = 20000;

function getEmoji(status) {
    switch (status) {
        case 'online': return config.emojis.online;
        case 'idle': return config.emojis.idle;
        case 'dnd': return config.emojis.dnd;
        default: return config.emojis.offline;
    }
}

async function clearChannelMessages(channel) {
    try {
        console.log('🧹 Clearing channel for the hourly reset...');
        let fetched;
        do {
            fetched = await channel.messages.fetch({ limit: 100 });
            
            const now = Date.now();
            const twoWeeksAgo = now - 1209600000;
            const recent = fetched.filter(m => m.createdTimestamp > twoWeeksAgo);
            const old = fetched.filter(m => m.createdTimestamp <= twoWeeksAgo);

            if (recent.size > 0) await channel.bulkDelete(recent, true);
            
            for (const msg of old.values()) {
                await msg.delete().catch(() => {});
                // Short delay to prevent rate limiting on old messages
                await new Promise(res => setTimeout(res, 250));
            }
        } while (fetched.size >= 1);

        console.log('✅ Channel cleared.');
    } catch (error) {
        console.error('Error clearing messages:', error);
    }
}

async function updateStatus() {
    if (!client.isReady()) return;

    try {
        const channel = await client.channels.fetch(config.channelId);
        if (!channel) return;

        // Reset Logic: Triggered every 180 cycles (1 hour)
        if (cycleCount >= MAX_CYCLES || !statusMessageId) {
            await clearChannelMessages(channel);
            statusMessageId = null; 
            cycleCount = 0;
        }

        const guild = channel.guild;
        const available = [];
        const unavailable = [];

        for (const id of config.staffIds) {
            try {
                // withPresences: true ensures we get the most accurate status
                const member = await guild.members.fetch({ user: id, withPresences: true });
                const status = member.presence?.status || 'offline';
                const line = `${getEmoji(status)} <@${member.id}> (\`${member.user.username}\`)`;

                if (['online', 'idle'].includes(status)) {
                    available.push(line);
                } else if (['dnd'].includes(status)) {
                    unavailable.push(line)
                } else {
                   unavailable.push(line);
                }
            } catch {
                unavailable.push(`❌ <@${id}> (\`User Data Unavailable\`)`);
            }
        }

        const count = available.length;
        client.user.setPresence({
            activities: [{ 
                name: `${count} staff${count === 1 ? "" : "s"} available`, 
                type: ActivityType.Watching 
            }],
            status: 'online'
        });

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

        // If it's a new cycle or the message was deleted, send a new one
        if (!statusMessageId) {
            const msg = await channel.send({ embeds: [embed] });
            statusMessageId = msg.id;
            console.log(`Created new status message: ${statusMessageId}`);
        } else {
            // Otherwise, edit the existing message
            const msg = await channel.messages.fetch(statusMessageId).catch(() => null);
            if (msg) {
                await msg.edit({ embeds: [embed] });
            } else {
                const newMsg = await channel.send({ embeds: [embed] });
                statusMessageId = newMsg.id;
            }
        }

        cycleCount++;

    } catch (err) {
        console.error("Error in updateStatus():", err);
    }
}

client.on('ready', () => {
    console.log(`✓ Bot logged in as ${client.user.tag}`);
    updateStatus();
    setInterval(updateStatus, INTERVAL_MS);
});

client.login(config.token);
