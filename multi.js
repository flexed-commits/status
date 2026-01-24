require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Partials,
    Routes, 
    REST, 
    SlashCommandBuilder,
    EmbedBuilder,
    ActivityType,
    Events,
    PermissionFlagsBits
} = require('discord.js');
const sqlite3InitModule = require('@sqlite.org/sqlite-wasm');

// --- CONFIGURATION ---
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const OWNER_ID = '1403084314819825787';

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) {
    console.error('❌ ERROR: DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID must be set in .env file');
    process.exit(1);
}

let db;
let dbHelpers;

// --- DATABASE SETUP ---
async function initDatabase() {
    const sqlite3 = await sqlite3InitModule({
        print: console.log,
        printErr: console.error,
    });

    if ('opfs' in sqlite3) {
        db = new sqlite3.oo1.OpfsDb('/bot_config.db');
        console.log('[DATABASE] Using OPFS (Origin Private File System) for persistent storage');
    } else {
        db = new sqlite3.oo1.DB('/bot_config.db', 'ct');
        console.log('[DATABASE] Using in-memory database (data will not persist)');
    }

    // Initialize database tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS staff_members (
            user_id TEXT PRIMARY KEY,
            added_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
    `);

    // Database helper functions
    dbHelpers = {
        get(key, defaultValue = null) {
            const result = db.exec({
                sql: 'SELECT value FROM config WHERE key = ?',
                bind: [key],
                returnValue: 'resultRows'
            });
            
            if (result.length > 0) {
                return JSON.parse(result[0][0]);
            }
            return defaultValue;
        },
        
        set(key, value) {
            db.exec({
                sql: 'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
                bind: [key, JSON.stringify(value)]
            });
            console.log(`[DATABASE] Updated ${key}:`, value);
        },
        
        getStaffIds() {
            const result = db.exec({
                sql: 'SELECT user_id FROM staff_members',
                returnValue: 'resultRows'
            });
            return result.map(row => row[0]);
        },
        
        addStaffMember(userId) {
            db.exec({
                sql: 'INSERT OR IGNORE INTO staff_members (user_id) VALUES (?)',
                bind: [userId]
            });
        },
        
        removeStaffMember(userId) {
            db.exec({
                sql: 'DELETE FROM staff_members WHERE user_id = ?',
                bind: [userId]
            });
        }
    };

    // Initialize default staff members if database is empty
    const defaultStaffIds = [
        '1081876265683927080', '1403084314819825787', '1193415556402008169',
        '1317831363474227251', '1408294418695589929', '1355792114818224178',
        '1231563118455554119', '1033399411130245190', '1180098931280064562',
        '1228377961569325107', '923488148875526144'
    ];

    if (dbHelpers.getStaffIds().length === 0) {
        defaultStaffIds.forEach(id => dbHelpers.addStaffMember(id));
        console.log('[DATABASE] Initialized default staff members');
    }

    // Initialize default configuration
    if (!dbHelpers.get('statusChannelId')) {
        dbHelpers.set('statusChannelId', '1445693527274295378');
        dbHelpers.set('statusMessageId', '1458467286187770071');
    }

    console.log('[DATABASE] Database initialized successfully');
}

const STATUS_UPDATE_INTERVAL = 20000; // 20 seconds

const EMOJIS = {
    offline: '<:offline:1446211386718949497>',
    dnd: '<:dnd:1446211384818925700>',
    online: '<:online:1446211377848123484>',
    idle: '<:idle:1446211381354434693>'
};

// --- UTILITIES ---

function getEmoji(status) {
    return EMOJIS[status] || EMOJIS.offline;
}

/**
 * Calculates next Saturday at 6:30 PM GMT (18:30 UTC)
 */
function calculateNextRunTime() {
    const now = new Date();
    const nowUtc = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getUTCMilliseconds()
    ));

    // Target: Saturday (6) at 18:30 UTC (6:30 PM GMT)
    const targetDay = 6; // Saturday
    const targetHour = 18;
    const targetMinute = 30;

    const nextRun = new Date(Date.UTC(
        nowUtc.getUTCFullYear(),
        nowUtc.getUTCMonth(),
        nowUtc.getUTCDate(),
        targetHour,
        targetMinute,
        0,
        0
    ));

    let daysToAdd = (7 + targetDay - nowUtc.getUTCDay()) % 7;

    // If today is Saturday and time has passed, schedule for next Saturday
    if (daysToAdd === 0 && nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() >= targetHour * 60 + targetMinute) {
        daysToAdd = 7;
    }

    nextRun.setUTCDate(nextRun.getUTCDate() + daysToAdd);

    const delay = nextRun.getTime() - nowUtc.getTime();

    return {
        timestamp: nextRun.getTime(),
        delay: delay
    };
}

let schedulerTimeout;

function startScheduler(client) {
    const setupComplete = dbHelpers.get('setupComplete', false);
    
    if (!setupComplete) {
        console.log('[SCHEDULER] Setup incomplete. Scheduler not started.');
        return;
    }

    const { timestamp, delay } = calculateNextRunTime();
    dbHelpers.set('nextRunTimestamp', timestamp);

    console.log(`[SCHEDULER] Next leaderboard run: ${new Date(timestamp).toUTCString()}`);
    console.log(`[SCHEDULER] Delay: ${Math.round(delay / 1000 / 60)} minutes`);

    if (schedulerTimeout) {
        clearTimeout(schedulerTimeout);
    }

    schedulerTimeout = setTimeout(async () => {
        try {
            console.log('[SCHEDULER] Executing scheduled leaderboard update...');
            await runLeaderboardUpdate(client);
        } catch (error) {
            console.error('[SCHEDULER ERROR] Failed to run scheduled update:', error);
        } finally {
            startScheduler(client);
        }
    }, delay);
}

// --- STATUS TRACKING ---

async function updateStatus(client) {
    if (!client.isReady()) return;

    try {
        const statusChannelId = dbHelpers.get('statusChannelId');
        const statusMessageId = dbHelpers.get('statusMessageId');
        const staffIds = dbHelpers.getStaffIds();

        if (!statusChannelId || !statusMessageId) {
            return; // Status tracking not configured
        }

        const channel = await client.channels.fetch(statusChannelId);
        const guild = channel.guild;
        const available = [];
        const unavailable = [];

        for (const id of staffIds) {
            try {
                const member = await guild.members.fetch({ user: id, withPresences: true });
                const status = member.presence?.status || 'offline';
                const line = `${getEmoji(status)} <@${member.id}> (\`${member.user.username}\`)`;

                if (['online', 'idle'].includes(status)) {
                    available.push(line);
                } else {
                    unavailable.push(line);
                }
            } catch {
                unavailable.push(`❌ <@${id}> (\`User Data Unavailable\`)`);
            }
        }

        client.user.setPresence({
            activities: [{
                name: 'custom status', 
                type: ActivityType.Custom, 
                state: `${available.length} staff available` 
            }],
            status: 'online',
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

        const msg = await channel.messages.fetch(statusMessageId);
        await msg.edit({ embeds: [embed] });
        console.log(`✓ Updated status message ${statusMessageId}`);

    } catch (err) {
        console.error(`❌ Status update failed:`, err.message);
    }
}

// --- MESSAGE COUNTING ---

async function getWeeklyMessageCounts(sourceChannel) {
    const messageCounts = new Map();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - ONE_WEEK_MS;

    let lastId;
    let fetchedMessages = 0;

    while (fetchedMessages < 5000) {
        const messages = await sourceChannel.messages.fetch({ limit: 100, before: lastId });

        if (messages.size === 0) break;

        for (const message of messages.values()) {
            if (message.createdTimestamp < cutoffTime) {
                fetchedMessages = 5001;
                break;
            }

            if (!message.author.bot) {
                const userId = message.author.id;
                const currentCount = messageCounts.get(userId) || 0;
                messageCounts.set(userId, currentCount + 1);
            }
        }

        if (fetchedMessages > 5000) break;

        lastId = messages.last().id;
        fetchedMessages += messages.size;
    }

    return messageCounts;
}

// --- LEADERBOARD LOGIC ---

async function runLeaderboardUpdate(client, isTest = false, interaction = null) {
    const setupComplete = dbHelpers.get('setupComplete', false);
    
    if (!setupComplete) {
        if (interaction) {
            await interaction.reply({ 
                content: 'The auto-leaderboard is not yet set up. Please use `/setup-auto-leaderboard` first.', 
                ephemeral: true 
            });
        }
        return;
    }

    const guildId = interaction ? interaction.guildId : client.guilds.cache.firstKey();
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
        console.error('[LEADERBOARD] Guild not found.');
        if (interaction) {
            await interaction.reply({ content: 'Error: Guild not found.', ephemeral: true });
        }
        return;
    }

    if (interaction) {
        await interaction.deferReply();
    }

    try {
        const leaderboardChannelId = dbHelpers.get('leaderboardChannelId');
        const sourceChannelId = dbHelpers.get('sourceChannelId');
        const topRoleToGrantId = dbHelpers.get('topRoleToGrantId');
        const topUserCount = dbHelpers.get('topUserCount', 3);

        const leaderboardChannel = guild.channels.cache.get(leaderboardChannelId);
        const sourceChannel = guild.channels.cache.get(sourceChannelId);
        const topRole = guild.roles.cache.get(topRoleToGrantId);

        if (!leaderboardChannel || !sourceChannel || !topRole) {
            const errorMsg = 'Setup configuration is invalid (Channel/Role not found). Please run `/setup-auto-leaderboard` again.';
            if (interaction) await interaction.editReply({ content: errorMsg });
            else console.error(errorMsg);
            return;
        }

        console.log('[LEADERBOARD] Fetching message counts...');
        const messageCounts = await getWeeklyMessageCounts(sourceChannel);

        const sortedUsers = Array.from(messageCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, topUserCount);

        const topUserIds = sortedUsers.map(u => u[0]);
        const members = await guild.members.fetch();

        console.log(`[ROLES] Clearing role "${topRole.name}" from all members...`);
        for (const member of members.values()) {
            if (member.roles.cache.has(topRoleToGrantId)) {
                await member.roles.remove(topRole, 'Weekly leaderboard role clearance.');
            }
        }

        console.log(`[ROLES] Granting role "${topRole.name}" to top ${topUserIds.length} members...`);
        for (const userId of topUserIds) {
            const member = members.get(userId);
            if (member) {
                await member.roles.add(topRole, 'Weekly leaderboard top user award.');
            }
        }

        const top1 = sortedUsers[0] ? `<@${sortedUsers[0][0]}> with **${sortedUsers[0][1]}** messages` : 'N/A (No user ranked)';
        const top2 = sortedUsers[1] ? `<@${sortedUsers[1][0]}> with **${sortedUsers[1][1]}** messages` : 'N/A (No user ranked)';
        const top3 = sortedUsers[2] ? `<@${sortedUsers[2][0]}> with **${sortedUsers[2][1]}** messages` : 'N/A (No user ranked)';

        const leaderboardText = `Hello fellas, 
We're back with the weekly leaderboard update!! 
Here are the top ${topUserCount} active members past week:
:first_place: Top 1: ${top1}. 
-# Gets 50k unb in cash.
:second_place: Top 2: ${top2}.
-# Gets 25k unb in cash.
:third_place: Top 3: ${top3}.
-# Gets 10k unb in cash.

All of the top three members have been granted the role:
**<@&1376577805890093096>**

Top 1 can change their server nickname once. Top 1 & 2 can have a custom role with name and colour based on their requests. Contact <@!1081876265683927080> or <@!1193415556402008169>(<@&1405157360045002785>) within 24 hours to claim your awards.`;

        await leaderboardChannel.send(leaderboardText);
        console.log('[LEADERBOARD] Message sent successfully!');

        if (interaction) {
            await interaction.editReply({ 
                content: `✅ Leaderboard successfully run and posted to <#${leaderboardChannelId}>. Roles have been updated.` 
            });
        }

        if (!isTest) {
            dbHelpers.set('lastRunTimestamp', Date.now());
        }

    } catch (error) {
        console.error('[LEADERBOARD ERROR]', error);
        const errorMsg = `An error occurred while running the leaderboard update: \`${error.message}\``;
        if (interaction) await interaction.editReply({ content: errorMsg });
    }
}

// --- COMMANDS ---

const commands = [
    new SlashCommandBuilder()
        .setName('setup-auto-leaderboard')
        .setDescription('Sets up the automated weekly leaderboard system.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where the final leaderboard message will be sent.')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('from_channel')
                .setDescription('The channel to count messages from (e.g., #general).')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to clear and then give to the top members.')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('top')
                .setDescription('The number of top users to fetch (e.g., 3). Must be 1 or more.')
                .setRequired(true)
                .setMinValue(1))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('test-leaderboard')
        .setDescription('Manually runs the leaderboard update immediately for testing.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('leaderboard-timer')
        .setDescription('Shows the time remaining until the next scheduled leaderboard update.')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Shows message statistics (total messages and top user) for the last 7 days.')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('setup-status')
        .setDescription('Configure the status tracker (Admin only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel containing the status message')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID of the message to edit')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('staff-add')
        .setDescription('Add a staff member to the status tracker')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to add as staff')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('staff-remove')
        .setDescription('Remove a staff member from the status tracker')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove from staff')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),

    new SlashCommandBuilder()
        .setName('staff-list')
        .setDescription('List all staff members being tracked')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('shutdown')
        .setDescription('Shuts down the bot (Owner only).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(DISCORD_CLIENT_ID),
            { body: commands },
        );
        console.log('[COMMANDS] Successfully registered application commands.');
    } catch (error) {
        console.error('[COMMANDS ERROR] Failed to register application commands:', error);
    }
}

// --- CLIENT INITIALIZATION ---

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Channel, Partials.GuildMember]
});

client.once(Events.ClientReady, async () => {
    console.log(`✓ Bot logged in as ${client.user.tag}`);
    
    // Initialize database first
    await initDatabase();
    
    registerCommands();
    startScheduler(client);
    
    // Start status updates
    updateStatus(client);
    setInterval(() => updateStatus(client), STATUS_UPDATE_INTERVAL);
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    // SETUP LEADERBOARD
    if (commandName === 'setup-auto-leaderboard') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
        }

        const lbChannel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const topCount = interaction.options.getInteger('top');
        const sourceChannel = interaction.options.getChannel('from_channel');

        if (lbChannel.type !== 0 || sourceChannel.type !== 0) {
            return interaction.reply({ content: 'Both channels must be text channels.', ephemeral: true });
        }

        const { timestamp } = calculateNextRunTime();

        dbHelpers.set('setupComplete', true);
        dbHelpers.set('leaderboardChannelId', lbChannel.id);
        dbHelpers.set('topRoleToGrantId', role.id);
        dbHelpers.set('topUserCount', topCount);
        dbHelpers.set('sourceChannelId', sourceChannel.id);
        dbHelpers.set('lastRunTimestamp', 0);
        dbHelpers.set('nextRunTimestamp', timestamp);

        startScheduler(client);

        await interaction.reply({
            content: `✅ Leaderboard setup complete!
- Leaderboard Channel: <#${lbChannel.id}>
- Messages Counted From: <#${sourceChannel.id}>
- Top Users: ${topCount}
- Role to Grant: **${role.name}**
- Next Scheduled Update: **${new Date(timestamp).toUTCString()}** (Saturday 6:30 PM GMT)`,
            ephemeral: true
        });
    }

    // TEST LEADERBOARD
    else if (commandName === 'test-leaderboard') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
        }
        await runLeaderboardUpdate(client, true, interaction);
    }

    // LEADERBOARD TIMER
    else if (commandName === 'leaderboard-timer') {
        const setupComplete = dbHelpers.get('setupComplete', false);
        
        if (!setupComplete) {
            return interaction.reply({ content: 'The auto-leaderboard is not yet set up.', ephemeral: true });
        }

        const now = Date.now();
        let nextRunTimestamp = dbHelpers.get('nextRunTimestamp', 0);

        if (nextRunTimestamp < now) {
            const { timestamp } = calculateNextRunTime();
            dbHelpers.set('nextRunTimestamp', timestamp);
            nextRunTimestamp = timestamp;
        }

        const delay = nextRunTimestamp - now;
        const totalSeconds = Math.floor(delay / 1000);
        const days = Math.floor(totalSeconds / (3600 * 24));
        const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        await interaction.reply({
            content: `⏳ The next automated leaderboard update is scheduled for **${new Date(nextRunTimestamp).toUTCString()}**.
(In **${days}** days, **${hours}** hours, **${minutes}** minutes, and **${seconds}** seconds).`,
            ephemeral: false
        });
    }

    // STATS
    else if (commandName === 'stats') {
        const setupComplete = dbHelpers.get('setupComplete', false);
        
        if (!setupComplete) {
            return interaction.reply({ 
                content: 'The auto-leaderboard is not yet set up. Please use `/setup-auto-leaderboard` first.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const sourceChannelId = dbHelpers.get('sourceChannelId');
        const guild = interaction.guild;
        const sourceChannel = guild.channels.cache.get(sourceChannelId);

        if (!sourceChannel) {
            return interaction.editReply({ 
                content: 'The source channel configured for message counting was not found. Please re-run `/setup-auto-leaderboard`.' 
            });
        }

        try {
            const messageCounts = await getWeeklyMessageCounts(sourceChannel);
            const totalMessages = Array.from(messageCounts.values()).reduce((sum, count) => sum + count, 0);

            const topUserEntry = Array.from(messageCounts.entries())
                .sort((a, b) => b[1] - a[1])[0];

            let topUserText = 'No active members found in the last 7 days.';
            if (topUserEntry) {
                const [userId, count] = topUserEntry;
                topUserText = `<@${userId}> with **${count}** messages.`;
            }

            const today = new Date();
            const sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));

            const formatDate = (date) => date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            const statsMessage = `📊 **Weekly Message Statistics**
Period: **${formatDate(sevenDaysAgo)}** to **${formatDate(today)}** (Last 7 days)

**Source Channel:** <#${sourceChannel.id}>

**Total Messages Sent:** **${totalMessages}**
**Most Active Member:** ${topUserText}`;

            await interaction.editReply({ content: statsMessage });

        } catch (error) {
            console.error('Error during /stats command:', error);
            await interaction.editReply({ content: `An error occurred while fetching stats: \`${error.message}\`` });
        }
    }

    // SETUP STATUS
    else if (commandName === 'setup-status') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');
        const messageId = interaction.options.getString('message_id');

        try {
            // Verify the message exists
            await channel.messages.fetch(messageId);
            
            dbHelpers.set('statusChannelId', channel.id);
            dbHelpers.set('statusMessageId', messageId);

            await interaction.reply({
                content: `✅ Status tracker configured!\n- Channel: <#${channel.id}>\n- Message ID: ${messageId}`,
                ephemeral: true
            });

            // Trigger immediate update
            updateStatus(client);
        } catch (error) {
            await interaction.reply({
                content: `❌ Could not find message with ID ${messageId} in <#${channel.id}>. Please verify the message ID.`,
                ephemeral: true
            });
        }
    }

    // STAFF ADD
    else if (commandName === 'staff-add') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        dbHelpers.addStaffMember(user.id);

        await interaction.reply({
            content: `✅ Added <@${user.id}> to staff tracking.`,
            ephemeral: true
        });

        updateStatus(client);
    }

    // STAFF REMOVE
    else if (commandName === 'staff-remove') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        dbHelpers.removeStaffMember(user.id);

        await interaction.reply({
            content: `✅ Removed <@${user.id}> from staff tracking.`,
            ephemeral: true
        });

        updateStatus(client);
    }

    // STAFF LIST
    else if (commandName === 'staff-list') {
        const staffIds = dbHelpers.getStaffIds();
        
        if (staffIds.length === 0) {
            return interaction.reply({
                content: 'No staff members are currently being tracked.',
                ephemeral: true
            });
        }

        const staffList = staffIds.map(id => `<@${id}>`).join('\n');
        
        await interaction.reply({
            content: `📋 **Staff Members Being Tracked (${staffIds.length}):**\n${staffList}`,
            ephemeral: true
        });
    }

    // SHUTDOWN
    else if (commandName === 'shutdown') {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ 
                content: '🚫 Permission denied. Only the designated owner can use this command.', 
                ephemeral: true 
            });
        }

        await interaction.reply({ content: '👋 Shutting down bot. Goodbye!', ephemeral: false });

        console.log(`[ADMIN] Shutdown initiated by user ID: ${interaction.user.id}`);

        if (schedulerTimeout) {
            clearTimeout(schedulerTimeout);
            console.log('[SCHEDULER] Scheduler successfully cleared.');
        }

        if (db) {
            db.close();
            console.log('[DATABASE] Database closed.');
        }
        
        client.destroy();
        process.exit(0);
    }
});

// Graceful shutdown handlers
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Received SIGINT, closing database...');
    if (db) {
        db.close();
    }
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] Received SIGTERM, closing database...');
    if (db) {
        db.close();
    }
    client.destroy();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught Exception:', error);
    if (db) {
        db.close();
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

client.login(DISCORD_BOT_TOKEN).catch(err => {
    console.error('❌ Failed to log in to Discord:', err);
    process.exit(1);
});