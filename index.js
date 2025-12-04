// index.js
import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, codeBlock } from 'discord.js';
import { handleInteraction } from './interactions.js'; // Import the interaction handler

// --- Configuration ---
const CHANNEL_ID = '1349304376967036960';
const ABOUT_SHIVAM_ID = 'about_shivam_btn';
const RULES_ID = 'rules_btn';
const FAQS_ID = 'faqs_btn';
const ROLE_INFO_ID = 'role_info_btn';
const SELF_ROLES_ID = 'self_roles_btn';
const VOLUNTEER_LIST_ID = 'volunteer_list_btn';
const GRATITUDE_LIST_ID = 'gratitude_list_btn';

// --- Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
});

// --- Initial Message Components ---

// 1. About Shivam Button
const aboutShivamBtn = new ButtonBuilder()
    .setCustomId(ABOUT_SHIVAM_ID)
    .setLabel('About Shivam')
    .setEmoji('<:crowww_1414290994777555057:1414291351888986202>')
    .setStyle(ButtonStyle.Secondary);

const row1 = new ActionRowBuilder().addComponents(aboutShivamBtn);

// 2. Second Row Buttons
const rulesBtn = new ButtonBuilder()
    .setCustomId(RULES_ID)
    .setLabel('Rules')
    .setEmoji('<a:rules:1411249793308561491>')
    .setStyle(ButtonStyle.Primary);

const faqsBtn = new ButtonBuilder()
    .setCustomId(FAQS_ID)
    .setLabel('FAQs')
    .setEmoji('<:FAQ:1414669616961159299>')
    .setStyle(ButtonStyle.Primary);

const roleInfoBtn = new ButtonBuilder()
    .setCustomId(ROLE_INFO_ID)
    .setLabel('Role Info')
    .setEmoji('<:information:1414670703579369552>')
    .setStyle(ButtonStyle.Primary);

const selfRolesBtn = new ButtonBuilder()
    .setCustomId(SELF_ROLES_ID)
    .setLabel('Self Roles')
    .setEmoji('<:roles:1414670814565105725>')
    .setStyle(ButtonStyle.Primary);

const volunteerListBtn = new ButtonBuilder()
    .setCustomId(VOLUNTEER_LIST_ID)
    .setLabel('Volunteer List')
    .setEmoji('<:Staff:1414671043788013718>')
    .setStyle(ButtonStyle.Primary);

const row2 = new ActionRowBuilder().addComponents(rulesBtn, faqsBtn, roleInfoBtn, selfRolesBtn, volunteerListBtn);

// 3. Third Row Button
const gratitudeListBtn = new ButtonBuilder()
    .setCustomId(GRATITUDE_LIST_ID)
    .setLabel('Gratitude List')
    .setEmoji('<:SD_Klee_Heart:1368535026978914346>')
    .setStyle(ButtonStyle.Primary);

const row3 = new ActionRowBuilder().addComponents(gratitudeListBtn);


// --- Event Handlers ---
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
        console.error(`❌ Could not find or access text channel with ID: ${CHANNEL_ID}`);
        return;
    }

    // 1. Send the first message (Image only)
    try {
        await channel.send({
            files: ['https://cdn.discordapp.com/attachments/1349771087851814993/1430613516913610894/IMG_20251022_231707.png?ex=68fb12e9&is=68f9c169&hm=37cf19f7f889a818546ea5912e91984fa616bf0ac1e8a22cfd8ee4205f52949e&'],
        });
        console.log('✅ Sent Image Message.');
    } catch (error) {
        console.error('❌ Error sending image message:', error);
    }

    // 2. Send the second message (Welcome message with buttons)
    const welcomeMessage = `## <a:hello:1413065594789564497> Welcome to 👑 Shivam’s Discord
This is the official community for Shivam, known for his Blockman Go edits and viral YouTube Shorts.
> 👑 Shivam’s Discord is a space built for laughs, conversations, and good vibes. From daily chats to community events, there’s always something happening here.

<:emote:1411249606636998698> **What you’ll find here:**
\` • \` Fun discussions & banter inspired by Shivam.

\` • \` Regular events and interactive activities.

\` • \` A place to share your best moments.

\` • \` A welcoming space to meet new people.

<a:rules:1411249793308561491> **Rules of the Server:**
\` • \` Follow [Discord’s Terms of Service](<https://discord.com/terms>) & [Community Guidelines](<https://discord.com/guidelines>).

\` • \` Respect staff decisions; they manage situations fairly.

\` • \` No spam of any kind (messages, emojis, reactions, or images).

\` • \` Use the correct channels for each topic.

\` • \` Only Hindi & English are allowed here.

\` • \` Check out the list of rules by clicking the blue colored \`Rules\` button attached below.

<a:note:1411250173665083494> **Final Note**
> This server is here to bring people together. Join the conversations, have fun, and help make **👑 Shivam’s Discord** a place everyone enjoys.

<:Icon_ServerVerified:1411271107809644605> **Join Us**
https://discord.gg/9y9XQ85U2d`;

    try {
        await channel.send({
            content: welcomeMessage,
            components: [row1, row2, row3],
        });
        console.log('✅ Sent Welcome Message with Buttons.');
    } catch (error) {
        console.error('❌ Error sending welcome message:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    
    // Pass the interaction to the specialized handler
    await handleInteraction(interaction);
});

// Replace with your actual bot token
client.login(process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE'); 
