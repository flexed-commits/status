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
        offline: '<:offline:1445697413015666749>',
        dnd: '<:dnd:1445697600446660668>',
        online: '<a:Online:1445697846354509886>',
        idle: '<:Idle:1445697974557609994>',
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

// Client requires Presence and Guild Member Intents to read user status
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences, // Required for status checks
        GatewayIntentBits.GuildMembers,   // Required for fetching members
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Global variable to store the ID of the status message for minute-by-minute editing.
let statusMessageId = null; 

/**
 * Maps the Discord status string to the custom emoji string.
 * This is updated to treat 'invisible' as 'offline' emoji.
 * @param {string} status - The raw status from Discord (online, idle, dnd, offline, invisible).
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
        case 'invisible': // <-- New explicit handling for invisible status
            return config.emojis.offline;
        default:
            return config.emojis.default;
    }
}


/**
 * Fetches staff status, builds the message, and sends/edits it.
 */
async function updateStatus() {
    console.log(`[${new Date().toLocaleTimeString()}] Running Status Update...`);
    
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
                // Fetch the member to get the latest presence
                const member = await guild.members.fetch({ user: id, force: true });
                
                // Get the current presence status (defaults to 'offline')
                const status = member.presence?.status || 'offline';
                
                // Construct the output line: {status emoji} @mention (username)
                const line = `${getEmoji(status)} <@${member.id}> (\`${member.user.username}\`)`;

                // 2. Separate based on availability
                // Only 'online' and 'idle' are considered available
                if (status === 'online' || status === 'idle') {
                    availableStaffs.push(line);
                } else {
                    // 'dnd', 'offline', 'invisible' (as requested), and any others are unavailable
                    unavailableStaffs.push(line); 
                }
            } catch (err) {
                // Fallback if user ID is invalid or bot cannot access member data
                console.error(`Error fetching staff member ${id}:`, err.message);
                unavailableStaffs.push(`:x: <@${id}> (\`User Data Unavailable\`)`);
            }
        }

        // 3. Build the Embed Message
        const availableContent = availableStaffs.join('\n') || '*No staffs currently available.*';
        const unavailableContent = unavailableStaffs.join('\n') || '*No staffs currently unavailable.*';

        const statusEmbed = new EmbedBuilder()
            // Using a neutral color for the default look (default is 0x000000, but using a subtle gray is better)
            .setColor(0x808080) 
            .setTitle('👥 Staff Status Overview')
            .setAuthor({ 
                name: config.author.name, 
                iconURL: config.author.iconURL, 
                url: config.author.url 
            })
            .addFields(
                { name: '🟢 Available Staffs:', value: availableContent, inline: false },
                { name: '🔴 Unavailable Staffs:', value: unavailableContent, inline: false }
            )
            // Footer shows the time of the last update
            .setFooter({ text: 'Status last updated' })
            .setTimestamp(); // This automatically includes the current time in the footer
            
        // 4. Send or Edit the Message
        if (statusMessageId) {
            // Edit existing message
            const message = await channel.messages.fetch(statusMessageId);
            await message.edit({ embeds: [statusEmbed] });
            console.log('Status message edited successfully.');
        } else {
            // Send new message (on startup)
            const message = await channel.send({ embeds: [statusEmbed] });
            statusMessageId = message.id; // Save the ID for future edits
            console.log('Initial status message sent successfully. ID saved.');
        }

    } catch (error) {
        console.error('FATAL ERROR during status update loop:', error);
    }
}

// --- BOT EVENTS ---

client.on('ready', () => {
    if (!config.token) {
        console.error('ERROR: DISCORD_TOKEN is missing. Check your .env file and environment variables.');
        // If the token is missing, destroy the client immediately
        return client.destroy(); 
    }
    
    console.log(`Bot is logged in as ${client.user.tag}!`);
    
    // 1. Run the status update immediately on startup
    updateStatus();

    // 2. Set the interval to run the update function every 60 seconds (1 minute)
    setInterval(updateStatus, 60000); 
});

// Start the bot
client.login(config.token).catch(err => {
    console.error("Failed to log in to Discord. Check your token and internet connection.", err);
});