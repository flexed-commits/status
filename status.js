require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActivityType 
} = require('discord.js');

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
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
    ]
});

let statusMessageId = null;
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
        const channel = await client.channels.fetch(config.channelId);
        if (!channel) return;

        const guild = channel.guild;
        const available = [];
        const unavailable = [];

        for (const id of config.staffIds) {
            try {
                const member = await guild.members.fetch({ user: id, withPresences: true });
                const status = member.presence?.status || 'offline';
                const line = `${getEmoji(status)} <@${member.id}> (\`${member.user.username}\`)`;

                // Logic updated: DND is now considered unavailable
                if (['online', 'idle'].includes(status)) {
                    available.push(line);
                } else {
                    unavailable.push(line);
                }
            } catch {
                unavailable.push(`❌ <@${id}> (\`User Data Unavailable\`)`);
            }
        }

        // Fixed pluralization of "staff"
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
                { name: 'Available Staff:', value: available.join('\n') || "*No staff currently active.*" },
                { name: 'Unavailable Staff:', value: unavailable.join('\n') || "*Everyone is online!*" }
            )
            .setFooter({ text: 'Auto-updates every 20 seconds' })
            .setTimestamp();

        // EDIT LOGIC: Search for the existing message instead of deleting
        if (statusMessageId) {
            try {
                const msg = await channel.messages.fetch(statusMessageId);
                await msg.edit({ embeds: [embed] });
            } catch (err) {
                // If message was manually deleted, send a new one
                const newMsg = await channel.send({ embeds: [embed] });
                statusMessageId = newMsg.id;
            }
        } else {
            const newMsg = await channel.send({ embeds: [embed] });
            statusMessageId = newMsg.id;
        }

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
