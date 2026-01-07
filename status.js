require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActivityType 
} = require('discord.js');

if (!process.env.DISCORD_TOKEN) {
    console.error("❌ ERROR: DISCORD_TOKEN is missing from .env");
    process.exit(1);
}

const config = {
    staffIds: [
        '1081876265683927080', '1403084314819825787', '1193415556402008169',
        '1317831363474227251', '1408294418695589929', '1355792114818224178',
        '1231563118455554119', '1033399411130245190', '1180098931280064562',
        '1228377961569325107'
    ],
    channelId: '1445693527274295378',
    targetMessageId: '1458157186894139535', 
    emojis: {
        offline: '<:offline:1446211386718949497>',
        dnd: '<:dnd:1446211384818925700>',
        online: '<:online:1446211377848123484>',
        idle: '<:idle:1446211381354434693>'
    },
    token: process.env.DISCORD_TOKEN
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

// Increases limit to prevent the AsyncEventEmitter memory leak warning
client.setMaxListeners(20);

let statusMessageId = config.targetMessageId; 
let isIntervalStarted = false; 
const INTERVAL_MS = 20000;

function getEmoji(status) {
    switch (status) {
        case 'online': return config.emojis.online;
        case 'idle': return config.emojis.idle;
        case 'dnd': return config.emojis.dnd;
        default: return config.emojis.offline;
    }
}

async function updateStatus() {
    if (!client.isReady()) return;

    try {
        const channel = await client.channels.fetch(config.channelId).catch(() => null);
        if (!channel) return;

        const guild = channel.guild;
        const available = [];
        const unavailable = [];

        for (const id of config.staffIds) {
            try {
                const member = await guild.members.fetch({ user: id, withPresences: true });
                const status = member.presence?.status || 'offline';
                const line = `${getEmoji(status)} <@${member.id}> (\`${member.user.username}\`)`;

                // DND is unavailable
                if (['online', 'idle'].includes(status)) {
                    available.push(line);
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
                name: `${count} staff member${count === 1 ? "" : "s"} available`, 
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

        // Editing your specific message
        try {
            const msg = await channel.messages.fetch(statusMessageId);
            await msg.edit({ embeds: [embed] });
        } catch (err) {
            // Re-post if the specific message is missing
            const newMsg = await channel.send({ embeds: [embed] });
            statusMessageId = newMsg.id;
            console.log(`New status message sent: ${statusMessageId}`);
        }

    } catch (err) {
        console.error("Error in updateStatus():", err);
    }
}

// Fixed the DeprecationWarning by using 'clientReady'
client.once('clientReady', () => {
    console.log(`✓ Bot logged in as ${client.user.tag}`);
    
    if (!isIntervalStarted) {
        updateStatus();
        setInterval(updateStatus, INTERVAL_MS);
        isIntervalStarted = true;
    }
});

client.login(config.token);
