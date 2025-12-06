// Load environment variables from .env file immediately
// To run this code, first install dependencies: npm install discord.js dotenv
// Then, create a .env file with your bot token: DISCORD_TOKEN=YOUR_SECRET_TOKEN
require('dotenv').config();

const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

// --- CONFIGURATION ---
const config = {
    // List of staff user IDs
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
    // The channel where the status message will be posted
    channelId: '1445693527274295378',
    // Custom emojis provided by the user
    emojis: {
        offline: '<:offline:1446211386718949497>',
        dnd: '<:dnd:1446211384818925700>',
        online: '<:online:1446211377848123484>',
        idle: '<:idle:1446211381354434693>',
        default: '⚫' // Fallback for unexpected statuses
    },
    // Author information for the embed
    author: {
        name: 'Server Name',
        url: 'https://discord.gg/ha7K8ngyex',
        iconURL: 'https://placehold.co/128x128/3a4049/ffffff?text=Icon' // REPLACE THIS
    },
    // SECURED: Reads the token from the environment variable (DISCORD_TOKEN in .env)
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
// Calculate the number of 20-second cycles in 12 hours: (12 * 60 * 60) / 20 = 2160
const MAX_CYCLES = 2160; 
const INTERVAL_MS = 20000; // 20 seconds

/**
 * Maps the Discord status string to the custom emoji string.
 * @param {string} status - The raw status from Discord.
 * @returns {string} The corresponding custom emoji string.
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

        // 1. Fetch all staff members and their current presence
        for (const id of config.staffIds) {
            try {
                const member = await guild.members.fetch({ user: id, force: true });
                const status = member.presence?.status || 'offline';
                const line = `${getEmoji(status)} <@${member.id}> (\`${member.user.username}\`)`;

                if (status === 'online' || status === 'idle') {
                    availableStaffs.push(line);
                } else {
                    unavailableStaffs.push(line); 
                }
            } catch (err) {
                console.error(`Error fetching staff member ${id}:`, err.message);
                unavailableStaffs.push(`:x: <@${id}> (\`User Data Unavailable\`)`);
            }
        }

        // 2. Build the Embed Message
        const availableContent = availableStaffs.join('\n') || '*No staffs currently available.*';
        const unavailableContent = unavailableStaffs.join('\n') || '*No staffs currently unavailable.*';

        const statusEmbed = new EmbedBuilder()
            .setColor(0x808080) 
            .setTitle('👥 Staff Status Overview')
            .setAuthor({ 
                name: "👑 Shivam’s Discord", 
                iconURL: "https://cdn.discordapp.com/icons/1349281907765936188/7f90f5ba832e7672d4f55eb0c6017813.png?size=4096", 
                url: "https://discord.gg/ha7K8ngyex"
            })
            .addFields(
                { name: 'Available Staffs:', value: availableContent, inline: false },
                { name: 'Unavailable Staffs:', value: unavailableContent, inline: false }
            )
            .setFooter({ text: 'Status last updated' })
            .setTimestamp();

        // 3. Determine Action: Send/Delete (12-hour cycle) or Edit (20-second cycle)
        const isNewMessageCycle = cycleCount >= MAX_CYCLES || statusMessageId === null;

        if (isNewMessageCycle) {
            // --- 12-HOUR CYCLE: DELETE OLD MESSAGE AND SEND NEW ONE ---

            // Delete previous message if ID exists
            if (statusMessageId) {
                try {
                    const messageToDelete = await channel.messages.fetch(statusMessageId);
                    await messageToDelete.delete();
                    console.log('Previous message deleted for 12-hour cycle.');
                } catch (deleteError) {
                    console.log('Could not delete previous message (may be missing):', deleteError.message);
                }
            }

            // Send new message
            const message = await channel.send({ embeds: [statusEmbed] });
            statusMessageId = message.id; // Save the ID of the new message
            cycleCount = 1; // Reset counter for the 20-second edit loop
            console.log('New status message sent successfully (12-hour cycle start).');

        } else {
            // --- 20-SECOND CYCLE: EDIT EXISTING MESSAGE ---
            
            try {
                const message = await channel.messages.fetch(statusMessageId);
                await message.edit({ embeds: [statusEmbed] });
                console.log('Status message edited successfully (20-second cycle).');
            } catch (editError) {
                // If edit fails (e.g., message was deleted manually), force a new message on the next cycle
                console.error('Error editing message. Resetting statusMessageId to force a new message send:', editError.message);
                statusMessageId = null;
                cycleCount = MAX_CYCLES; // Immediately trigger the send/delete cycle next time
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

    console.log(`Bot is logged in as ${client.user.tag}!`);

    // 1. Run the status update immediately on startup (This triggers the first 'send new message' action)
    // By setting cycleCount = MAX_CYCLES on startup, we force the first action to be 'Send New Message'
    cycleCount = MAX_CYCLES; 
    updateStatus();

    // 2. Set the interval to run the update function every 20 seconds.
    setInterval(updateStatus, INTERVAL_MS); 
});

// Start the bot
client.login(config.token).catch(err => {
    console.error("Failed to log in to Discord. Check your token and internet connection.", err);
});
