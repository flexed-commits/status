require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActivityType,
    Events
} = require('discord.js');

if (!process.env.DISCORD_BOT_TOKEN1) {
    console.error("❌ ERROR: DISCORD_BOT_TOKEN is missing from .env");
    process.exit(1);
}

const config = {
    staffIds: [
        '1081876265683927080',
        '1193415556402008169',
        '1228377961569325107'
    ],
    channelId: '1460574191072972913', // Updated to the channel ID where messages will be sent
    emojis: {
        offline: '<:offline:1446211386718949497>',
        dnd: '<:dnd:1446211384818925700>',
        online: '<:online:1446211377848123484>',
        idle: '<:idle:1446211381354434693>'
    },
    token: process.env.DISCORD_BOT_TOKEN1
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers
    ]
});

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
        const guild = channel.guild;
        const available = [];
        const unavailable = [];

        for (const id of config.staffIds) {
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

        // Send a new message instead of editing
        await channel.send({ embeds: [embed] });
        console.log(`✓ Sent new status message to channel ${config.channelId}`);

    } catch (err) {
        console.error(`❌ Failed to send message. Retrying in 20s...`, err.message);
    }
}

client.once(Events.ClientReady, () => {
    console.log(`✓ Bot logged in as ${client.user.tag}`);
    updateStatus();
    setInterval(updateStatus, INTERVAL_MS);
});

client.login(config.token);