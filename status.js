// Load environment variables from .env file immediately
// To run this code, first install dependencies: npm install discord.js dotenv
// Then, create a .env file with your bot token: DISCORD_TOKEN=YOUR_SECRET_TOKEN
require('dotenv').config();

const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActivityType } = require('discord.js');

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
    author: {
        name: 'Server Name',
        url: 'https://discord.gg/ha7K8ngyex',
        iconURL: 'https://placehold.co/128x128/3a4049/ffffff?text=Icon'
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
        GatewayIntentBits.MessageContent, 
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Global state variables
let statusMessageId = null; 
let cycleCount = 0;
const MAX_CYCLES = 2160; // (12 * 60 * 60) / 20 = 2160 cycles
const INTERVAL_MS = 20000; // 20 seconds

/**
 * Maps the Discord status string to the custom emoji string.
 */
function getEmoji(status) {
    switch (status) {
        case 'online':
            return config.emojis.online;
        case 'idle':
            return config.emojis.idle;
        case 'dnd':
            return config.emojis.dnd; 
        case 'offline':
        case 'invisible': 
            return config.emojis.offline;
        default:
            return config.emojis.default;
    }
}

/**
 * Clears all messages in the channel (messages older than 14 days are deleted individually)
 */
async function clearChannelMessages(channel) {
    try {
        let deletedCount = 0;
        let fetchMore = true;

        while (fetchMore) {
            // Fetch up to 100 messages at a time
            const messages = await channel.messages.fetch({ limit: 100 });
            
            if (messages.size === 0) {
                fetchMore = false;
                break;
            }

            // Separate messages by age (14 days = 1209600000 ms)
            const now = Date.now();
            const twoWeeksAgo = now - 1209600000;
            
            const recentMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
            const oldMessages = messages.filter(msg => msg.createdTimestamp <= twoWeeksAgo);

            // Bulk delete recent messages (faster)
            if (recentMessages.size > 0) {
                await channel.bulkDelete(recentMessages, true);
                deletedCount += recentMessages.size;
                console.log(`Bulk deleted ${recentMessages.size} recent messages`);
            }

            // Delete old messages one by one (slower but necessary for messages older than 14 days)
            for (const [id, msg] of oldMessages) {
                try {
                    await msg.delete();
                    deletedCount++;
                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (err) {
                    console.error(`Failed to delete message ${id}:`, err.message);
                }
            }

            // If we fetched less than 100, we've reached the end
            if (messages.size < 100) {
                fetchMore = false;
            }
        }

        console.log(`✅ Cleared ${deletedCount} total messages from channel`);
    } catch (error) {
        console.error('Error clearing channel messages:', error);
    }
}

/**
 * Fetches staff status, builds the message, and either edits or sends a new one based on the cycle.
 */
async function updateStatus() {
    cycleCount++;
    console.log(`[${new Date().toLocaleTimeString()}] Running Status Update. Cycle: ${cycleCount}/${MAX_CYCLES}`);

    if (!client.isReady()) {
        console.log("Client not ready yet, skipping update.");
        return;
    }

    try {
        const channel = await client.channels.fetch(config.channelId);
        if (!channel) return console.error('Error: Could not find the specified channel.');

        const guild = channel.guild;
        if (!guild) return console.error('Error: Could not find the guild for the channel.');

        const availableStaffs = [];
        const unavailableStaffs = [];

        // Fetch all staff members and their current presence
        for (const id of config.staffIds) {
            try {
                const member = await guild.members.fetch({ user: id, force: true });
                const status = member.presence?.status || 'offline';
                const line = `${getEmoji(status)} <@${member.id}> (`${member.user.username}`)`;

                if (status === 'online' || status === 'idle') {
                    availableStaffs.push(line);
                } else {
                    unavailableStaffs.push(line); 
                }
            } catch (err) {
                console.error(`Error fetching staff member ${id}:`, err.message);
                unavailableStaffs.push(`:x: <@${id}> (`User Data Unavailable`)`);
            }
        }

        // Update Bot's Presence
        const availableCount = availableStaffs.length;
        const activityName = `${availableCount} staff${availableCount === 1 ? '' : 's'}`;

        client.user.setPresence({
            activities: [{ 
                name: activityName,
                type: ActivityType.Watching
            }],
            status: 'online',
        });

        console.log(`Bot Presence Updated: Watching ${activityName}`);

        // Build the Embed Message
        const availableContent = availableStaffs.join('
') || '*No staffs currently available.*';
        const unavailableContent = unavailableStaffs.join('
') || '*No staffs currently unavailable.*';

        const statusEmbed = new EmbedBuilder()
            .setColor(0x808080) 
            .setTitle('👥 Staff Status Overview')
            .setAuthor({ 
                name: "👑 Shivam's Discord", 
                iconURL: "https://cdn.discordapp.com/icons/1349281907765936188/7f90f5ba832e7672d4f55eb0c6017813.png?size=4096", 
                url: "https://discord.gg/ha7K8ngyex"
            })
            .addFields(
                { name: 'Available Staffs:', value: availableContent, inline: false },
                { name: 'Unavailable Staffs:', value: unavailableContent, inline: false }
            )
            .setFooter({ text: 'Status last updated' })
            .setTimestamp();

        // Determine if we need to send a new message (12-hour cycle)
        const isNewMessageCycle = cycleCount >= MAX_CYCLES;

        if (isNewMessageCycle) {
            // --- 12-HOUR CYCLE: CLEAR ALL MESSAGES AND SEND NEW ONE ---
            console.log('🔄 Starting 12-hour cycle: Clearing all messages...');
            
            // Clear all messages in the channel
            await clearChannelMessages(channel);

            // Send new message
            const message = await channel.send({ embeds: [statusEmbed] });
            statusMessageId = message.id;
            cycleCount = 1; // Reset to 1 (not 0, since we just completed cycle 1)
            console.log('✅ New status message sent successfully (12-hour cycle reset).');

        } else {
            // --- 20-SECOND CYCLE: EDIT EXISTING MESSAGE ---
            try {
                if (!statusMessageId) {
                    // If no message ID exists, send a new one
                    const message = await channel.send({ embeds: [statusEmbed] });
                    statusMessageId = message.id;
                    console.log('📨 Sent new status message (no previous message found).');
                } else {
                    const message = await channel.messages.fetch(statusMessageId);
                    await message.edit({ embeds: [statusEmbed] });
                    console.log('✏️ Status message edited successfully (20-second cycle).');
                }
            } catch (editError) {
                // If edit fails, send a new message
                console.error('⚠️ Error editing message, sending new one:', editError.message);
                const message = await channel.send({ embeds: [statusEmbed] });
                statusMessageId = message.id;
            }
        }

    } catch (error) {
        console.error('FATAL ERROR during status update loop:', error);
    }
}

// --- BOT EVENTS ---
client.on('ready', () => {
    if (!config.token) {
        console.error('ERROR: DISCORD_TOKEN is missing. Check your .env file and environment variables.');
        return client.destroy(); 
    }

    console.log(`🤖 Bot is logged in as ${client.user.tag}!`);

    // Start the first cycle immediately
    updateStatus();

    // Set interval to run every 20 seconds
    setInterval(updateStatus, INTERVAL_MS); 
});

// Start the bot
client.login(config.token).catch(err => {
    console.error("❌ Failed to log in to Discord. Check your token and internet connection.", err);
});