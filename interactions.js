import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, codeBlock } from 'discord.js';

// --- Button IDs (Must match index.js) ---
const ABOUT_SHIVAM_ID = 'about_shivam_btn';
const RULES_ID = 'rules_btn';
const FAQS_ID = 'faqs_btn';
const ROLE_INFO_ID = 'role_info_btn';
const SELF_ROLES_ID = 'self_roles_btn';
const VOLUNTEER_LIST_ID = 'volunteer_list_btn';
const GRATITUDE_LIST_ID = 'gratitude_list_btn';

// --- Role Info Sub-Button IDs ---
const STAFF_ROLE_ID = 'role_info_staff';
const EXCLUSIVE_ROLE_ID = 'role_info_exclusive';
const MEMBER_ROLE_ID = 'role_info_member';
const LEVEL_ROLE_ID = 'role_info_level';

// --- Self Roles Sub-Button IDs ---
const SELF_ROLES_PING_ID = 'self_roles_ping';
const SELF_ROLES_AGE_ID = 'self_roles_age';
const SELF_ROLES_GENDER_ID = 'self_roles_gender';

// --- Role Toggling Functions ---
const toggleRole = async (interaction, roleId, action = 'toggle', removeRoles = []) => {
    const member = interaction.member;
    const role = member.guild.roles.cache.get(roleId);
    let responseText = '';

    if (!role) {
        return interaction.reply({ content: `❌ Error: Role <@&${roleId}> not found.`, ephemeral: true });
    }

    try {
        if (action === 'add' || (action === 'toggle' && !member.roles.cache.has(roleId))) {
            await member.roles.add(roleId);
            responseText += `✅ Added the ${role.name} role.`;
        } else if (action === 'remove' || action === 'toggle') {
            await member.roles.remove(roleId);
            responseText += `➖ Removed the ${role.name} role.`;
        }

        for (const remId of removeRoles) {
            if (member.roles.cache.has(remId)) {
                await member.roles.remove(remId);
                const removedRole = member.guild.roles.cache.get(remId);
                if (removedRole) responseText += `\n➖ Removed conflicting role: ${removedRole.name}.`;
            }
        }

        // Use editReply since we deferred the interaction at the start of handleInteraction
        return interaction.editReply({ content: responseText, ephemeral: true });
    } catch (e) {
        console.error('Error toggling role:', e);
        // Ensure to use editReply after deferring
        return interaction.editReply({ content: `❌ An error occurred while updating your roles.`, ephemeral: true });
    }
};


// --- Interaction Handlers ---

const handleAboutShivam = async (interaction) => {
    const embed = new EmbedBuilder()
        // NOTE: discord.js v14's EmbedBuilder does not support a custom icon for author unless using webhooks. 
        // We'll use the server icon URL as a placeholder or remove it if server icon is unknown.
        .setAuthor({
            name: 'itsmegamerShivam',
            url: 'https://youtube.com/@itsmegamershivam?si=MRKs6uLvgBjC03oz',
            // iconURL: 'SERVER_ICON_URL_HERE' // Placeholder for server icon
        })
        .setTitle('About Shivam')
        .setDescription('It’s me gamer Shivam is a YouTuber with over 34k Subscribers. He is mostly known for his cool & hit edits on Blockman GO and especially it\'s most famous mini-game BedWars. He likes to have fun of his fans and friends, his intentions are never to hurt anyone. He never does fake promises about giveaways or upcoming edits.')
        .setColor(0x5865F2); // Discord Blue

    const subscribeBtn = new ButtonBuilder()
        .setLabel('Subscribe!')
        .setEmoji('<:SD_Klee_Heart:1368535026978914346>')
        .setStyle(ButtonStyle.Link)
        .setURL('https://youtube.com/@itsmegamershivam?si=MRKs6uLvgBjC03oz');

    const row = new ActionRowBuilder().addComponents(subscribeBtn);

    // Use editReply since we deferred the interaction at the start of handleInteraction
    await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });
};

const handleRules = async (interaction) => {
    const rulesContent = `<a:Arrow_Mark:1350830831345602560> ***General Guidelines:***
1. Be respectful and kind to everyone. Don't be rude or toxic to anyone. Always treat everyone with respect. Don't make any type of parent joke or jokes on deceased parents. Jokes on deceased parents will lead to direct ban. Also keep in mind not to use any type of swear words or even their short forms, except "**gay**".

2. Avoid spamming. Excessive spamming or flooding chats with walls of texts will lead to 24 hours timeout.

3. Don't misuse channels. Before typing somewhere, keep in mind where and what you are typing and what is the channel for.

4. Do not ping (mention) others while using bot commands (e.g., .rob in UnbelievaBoat). Use usernames instead. Repeated or disturbing pings may lead to action if reported (to any staff).
<a:Arrow_Mark:1350830831345602560> ***Content Guidelines:***
5. No NSFW or explicit content. Any type of pornograpy or unsafe adult content is strictly prohibited.

6. No unauthorised advertising. Any type of unauthorised advertising links will be not allowed. *(DM advertising also counts)*

7. No doxxing. Respect everyone's privacy. Don't leak anyone's personal information without their permission (includes anything they don't want to be public). Leaking address or phone number will lead to a direct ban without considering if it's fake or real.
<a:Arrow_Mark:1350830831345602560> ***Safety and Security:***
8. No impersonating or deception. Impersonating a BGTuber or a Staff member will lead to a warn. If the name or the profile picture isn't changed in 24 hours, the user will be banned.

9. Follow the terms of discord strictly. Not following the Discord’s Terms of Service (ToS) will lead to a Ban.

10. Respect moderators and their decisions. Do what moderators say. Moderators have the final decision.
<a:Arrow_Mark:1350830831345602560> ***Community Etiquette:***
11. Avoid asking for free in-game currency. Do not beg or request others to give you in-game money, items, or rewards for free.

12. Avoid drama and conflicts. Any type of drama or conflicts will not be tolerated. Causing drama will lead to actions including warn or/and timeout, ban in worse case. If you see any arguments (that include you) turning into drama, **stop responding**. The other person will automatically stop.

13. Talking about anything negative or wrong about any religion is strictly prohibited. The same applies to political topics, be careful what you say. It is recommended not to go deep into political discussions, especially personal opinions. Speaking negatively or incorrectly about anyone is not acceptable, whether it’s a historical figure or someone alive.

14. Bypassing auto mod is strictly prohibited. Bypassing auto mod will lead to a warn. Baiting others also counts as bypass.
<a:Arrow_Mark:1350830831345602560> ***Discord Rules:***
17. Follow the discord terms: [discord.com/terms](<https://discord.com/terms>)

18. Follow the discord guidelines: [discord.com/guidelines](<https://discord.com/guidelines>)`;
    
    const rulesImageUrl = 'https://cdn.discordapp.com/attachments/1349771087851814993/1431342690938650806/IMG_20251024_233432.png?ex=6931cd42&is=69307bc2&hm=4ecadfff5a921c777d1346d09219f1f71dd96eefe2cc4314f1301ac154d83f39&';

    // CORRECTION APPLIED: Use { attachment: URL } format for remote files
    await interaction.editReply({
        content: rulesContent,
        files: [{ attachment: rulesImageUrl }],
        ephemeral: true
    });
};

const handleFAQs = async (interaction) => {
    const faqsContent = `A. It is difficult to contact him through DMs as he rarely responds to it, so be active in the server as he can randomly appear in the chat. 
-# Refrain from pinging him.`;
    
    const faqsImageUrl = 'https://cdn.discordapp.com/attachments/1349771087851814993/1431353959032946824/IMG_20251025_001925.png?ex=6931d7c1&is=69308641&hm=608686f39361efa66697654e067954a0ce508540663f2a34be09556c8e4d68f6&';

    // CORRECTION APPLIED: Use { attachment: URL } format for remote files
    await interaction.editReply({
        content: faqsContent,
        files: [{ attachment: faqsImageUrl }],
        ephemeral: true
    });
};

const handleRoleInfo = async (interaction) => {
    const staffRoleBtn = new ButtonBuilder().setCustomId(STAFF_ROLE_ID).setLabel('Staff Role').setStyle(ButtonStyle.Secondary);
    const exclusiveRoleBtn = new ButtonBuilder().setCustomId(EXCLUSIVE_ROLE_ID).setLabel('Exclusive Role').setStyle(ButtonStyle.Secondary);
    const memberRoleBtn = new ButtonBuilder().setCustomId(MEMBER_ROLE_ID).setLabel('Member Role').setStyle(ButtonStyle.Secondary);
    const levelRoleBtn = new ButtonBuilder().setCustomId(LEVEL_ROLE_ID).setLabel('Level Role').setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(staffRoleBtn, exclusiveRoleBtn, memberRoleBtn, levelRoleBtn);
    
    const roleInfoImageUrl = 'https://cdn.discordapp.com/attachments/1349771087851814993/1431353771933437982/IMG_20251025_001801.png?ex=6931d794&is=69308614&hm=c2873ff132ccf76b056bdf0970a306a171e2d34902db8e1b501d24a6c075c859&';

    // CORRECTION APPLIED: Use { attachment: URL } format for remote files
    await interaction.editReply({
        content: 'Click on the buttons below to read information about roles of those categories. \nFor now there are only four categories Staff Roles, Exclusive Roles, Member Roles and Level Roles Respectively.',
        files: [{ attachment: roleInfoImageUrl }],
        components: [row],
        ephemeral: true
    });
};

const handleRoleInfoCategory = async (interaction) => {
    let content = '';
    const divider = '\n<a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027>\n';

    switch (interaction.customId) {
        case STAFF_ROLE_ID:
            content = `***Staff Roles***
1. <@&1357323358986965054>: Lead Management are the ones who oversee over the moderation team and the whole server.
${divider}
2. <@&1349282403864150109>: Management Team are the ones who manage the server and make sure all the perms are assigned correctly to the roles and channels of this server.
${divider}
3. <@&1410523383577444413>: External Management are those who are recruited directly without having to pass the Trainees Interview. They are expected to help the server in improvement.
${divider}
4. <@&1349282454078488576>: Chief Moderators are the ones who look over the moderation team and make sure every staff member is doing their job correctly.
${divider}
5. <@&1349282593559941191>: Staff Team of this server  are the ones who manage cases and tickets and also help to give training to Trainees in their initial days.
${divider}
6. <@&1349282792512684053>: A role for the newly selected members which are trusted and can do good at moderation in this server.`;
            break;
        case EXCLUSIVE_ROLE_ID:
            content = `***Exclusive Roles***
1. <@&1349282245793546240>: Role for the owner of this server.
${divider}
2. <@&1349282311811760159>: Exclusive custom role for Co-Owner of this server.
${divider}
3. <@&1402277865441067150>: A role for close and good friends of Shivam. It can only be given to YouTubers who has more than 2000 subscribers on YouTube and are friend with Shivam in Blockman GO.
${divider}
4. <@&1376576471211966554>: A role only for those members who are most trusted by Ψ.1nOnly.Ψ and Shivam itself.
${divider}
5. <@&1349999252494876682>: A role for the content creators having more than 300 Subscribers on YouTube.
${divider}
6. <@&1353039181508771860>: Special role for the honorable nitro boosters of this server.
${divider}
7. <@&1376577805890093096>: A role given to them who are in the top 3 rank of weekly active members.
${divider}
8. <@&1376577903159935127>: A role commonly given to YouTubers, active members, boosters, etc.
${divider}
9. <@&1395038675699630181>: Anyone who wins a big event gets this role permanently. It also has V.I.P role perks.
${divider}
10. <@&1419722498752122901>: Anyone who gets on the top 3 of EPIC RPG leaderboard of this server gets this role. This role lasts until their position changes.
${divider}
11. <@&1379843655535431740>: Role for an experienced resigned staff.
${divider}
12. <@&1403686795438456862>: This is role given to the user who has set thier birthday with <@916434908728164372> bot. They get this role on thier birthday.`;
            break;
        case MEMBER_ROLE_ID:
            content = `***Member Roles***
1. <@&1350069916480569384>: Common role assigned to every human member in the server.
${divider}
2. <@&1350500645777571891>: A role which can be selected if they want to get pinged whenever <#1426800432247734272> is inactive.
${divider}
3. <@&1350500909074878649>: A role which can be selected by members if they want to get notified whenever it's me gamer Shivam uploads a Video.
${divider}
4. <@&1350501088935153756>: A role which can be selected by members if they want to get notified whenever mods host a giveaway.
${divider}
5. <@&1350501214424399872>: A role which can be selected by members if they want to get notified whenever it's me gamer Shivam is live on YouTube.
${divider}
6. <@&1373712857669308519>: A role which can be selected by members if they want to receive notifications whenever a poll is hosted and they want to vote first.
${divider}
7. <@&1350501460022132746>: Role for members who are below the age of 18.
${divider}
8. <@&1350501527541907456>: Role for members who are elder the age of 18.
${divider}
9. <@&1350501637625741414>: Exclusive role for boys.
${divider}
10. <@&1350501700246442025>: Exclusive role for girls.
${divider}
11. <@&1350501815640264865>: Exclusive role for the genders other than male and female.`;
            break;
        case LEVEL_ROLE_ID:
            content = `***Level Roles***
1. <@&1350052479190175796>: Unlock access to use Soundboards.
${divider}
2. <@&1350052450484359259>: Grants access to External Emojis & Stickers.
${divider}
3. <@&1350052410021904416>: Grants access to react on messages & Screen Sharing in VCs.
${divider}
4. <@&1350052380103938098>: Grants access to change Nickname of self.
${divider}
5. <@&1350052344137519184>: Grants access to exclusive Bot commands.
${divider}
6. <@&1350052313489870909>: Unlocks Attach Files & Embed Links.
${divider}
7. <@&1350052270213173248>: Priority access in Events & Giveaways.
${divider}
8. <@&1350052218329632859>: Gains all V.I.P perks.
${divider}
9. <@&1350052170115973165>: Becomes part of exclusive staff.
${divider}
10. <@&1350051749632802888>: Earns the Honorable Title of being on top.`;
            break;
        default:
            content = 'Error: Unknown role category.';
    }

    // Edit the original ephemeral message to show the role details
    await interaction.editReply({
        content: content,
        embeds: [],
        files: [],
        components: []
    });
};

const handleSelfRoles = async (interaction) => {
    const pingRoleBtn = new ButtonBuilder().setCustomId(SELF_ROLES_PING_ID).setLabel('Ping Roles').setStyle(ButtonStyle.Primary);
    const ageRoleBtn = new ButtonBuilder().setCustomId(SELF_ROLES_AGE_ID).setLabel('Age Roles').setStyle(ButtonStyle.Primary);
    const genderRoleBtn = new ButtonBuilder().setCustomId(SELF_ROLES_GENDER_ID).setLabel('Gender Roles').setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(pingRoleBtn, ageRoleBtn, genderRoleBtn);

    await interaction.editReply({
        content: '**Click on the buttons below to redirect yourself to the relevant role categories.**',
        components: [row],
        ephemeral: true
    });
};

const handleSelfRolesCategory = async (interaction) => {
    let content = '';
    let components = [];
    const customId = interaction.customId;

    if (customId === SELF_ROLES_PING_ID) {
        content = `***Ping Roles***
<a:bell:1413084012435476490> <@&1350500909074878649> 
<:status_streaming:1413084415508090971>  <@&1350501214424399872> 
<a:Giveaways:1355602892480057384> <@&1350501088935153756> 
<:deadchat:1355602043666039004>  <@&1350500645777571891>
<:poll:1413084561272737853> <@&1373712857669308519>
<:roblox:1411415158894628895> <@&1409881135076343828>`;

        const btn1 = new ButtonBuilder().setCustomId('toggle_1350500909074878649').setLabel('YouTube Video Notification').setEmoji('<a:bell:1413084012435476490>').setStyle(ButtonStyle.Primary);
        const btn2 = new ButtonBuilder().setCustomId('toggle_1350501214424399872').setLabel('Live Stream Notification').setEmoji('<:status_streaming:1413084415508090971>').setStyle(ButtonStyle.Primary);
        const btn3 = new ButtonBuilder().setCustomId('toggle_1350501088935153756').setLabel('Giveaway Ping').setEmoji('<a:Giveaways:1355602892480057384>').setStyle(ButtonStyle.Primary);
        const btn4 = new ButtonBuilder().setCustomId('toggle_1350500645777571891').setLabel('Chat Revive Ping').setEmoji('<:deadchat:1355602043666039004>').setStyle(ButtonStyle.Primary);
        const btn5 = new ButtonBuilder().setCustomId('toggle_1373712857669308519').setLabel('Poll Ping').setEmoji('<:poll:1413084561272737853>').setStyle(ButtonStyle.Primary);
        const btn6 = new ButtonBuilder().setCustomId('toggle_1409881135076343828').setLabel('Roblox Players').setEmoji('<:roblox:1411415158894628895>').setStyle(ButtonStyle.Secondary);

        components.push(new ActionRowBuilder().addComponents(btn1, btn2, btn3, btn4, btn5));
        components.push(new ActionRowBuilder().addComponents(btn6));

    } else if (customId === SELF_ROLES_AGE_ID) {
        content = `***Age Roles***
<a:18:1413084838667223041> <@&1350501527541907456>
<:18_18_18_18_18:1413084884192198817> <@&1350501460022132746>`;

        const over18Btn = new ButtonBuilder().setCustomId('age_add_1350501527541907456_rem_1350501460022132746').setLabel('Over 18').setEmoji('<a:18:1413084838667223041>').setStyle(ButtonStyle.Primary);
        const under18Btn = new ButtonBuilder().setCustomId('age_add_1350501460022132746_rem_1350501527541907456').setLabel('Under 18').setEmoji('<:18_18_18_18_18:1413084884192198817>').setStyle(ButtonStyle.Primary);

        components.push(new ActionRowBuilder().addComponents(over18Btn, under18Btn));
    } else if (customId === SELF_ROLES_GENDER_ID) {
        // Role IDs: 1: 1350501637625741414, 2: 1350501700246442025, 3: 1350501815640264865
        const maleId = '1350501637625741414';
        const femaleId = '1350501700246442025';
        const otherId = '1350501815640264865';

        content = `***Gender Roles***
<:male:1413085884018069574> <@&${maleId}>
<:female:1413085667100987394> <@&${femaleId}>
🏳️‍🌈 <@&${otherId}>`;

        const heHimBtn = new ButtonBuilder().setCustomId(`gender_add_${maleId}_rem_${femaleId},${otherId}`).setLabel('He/Him').setEmoji('<:male:1413085884018069574>').setStyle(ButtonStyle.Primary);
        const sheHerBtn = new ButtonBuilder().setCustomId(`gender_add_${femaleId}_rem_${maleId},${otherId}`).setLabel('She/Her').setEmoji('<:female:1413085667100987394>').setStyle(ButtonStyle.Primary);
        const theyThemBtn = new ButtonBuilder().setCustomId(`gender_add_${otherId}_rem_${maleId},${femaleId}`).setLabel('They/Them').setEmoji('🏳️‍🌈').setStyle(ButtonStyle.Primary);

        components.push(new ActionRowBuilder().addComponents(heHimBtn, sheHerBtn, theyThemBtn));
    }

    // Update the original ephemeral message to show the self-role options
    await interaction.editReply({
        content: content,
        components: components,
        embeds: [],
        files: [],
    });
};

const handleVolunteerList = async (interaction) => {
    const content = `***Shivam’s Discord — Volunteer List***

<:crowww_1414290994777555057:1414291351888986202> Lead Management 
\` • \` <@1355792114818224178>
<a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027>
<:management:1382619927441051671> Management Team
\` • \` _No one so far._
<a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027>
<:Moderator:1382620468816908321> Chief Moderator
\` • \` _No one so far._
<a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027>
<:Discordstaff:1382620570826313780> Staff Team
\` • \` _No one so far._
<a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027><a:lines:1377283248664744027>
<:Spider_Sparkle:1419735916737724537> Trainees
\` • \` <@1180098931280064562>
\` • \` <@1408294418695589929>
\` • \` <@1317831363474227251>`;
    await interaction.editReply({ content: content, ephemeral: true });
};

const handleGratitudeList = async (interaction) => {
    const content = `# Gratitude List.
**_The Gratitude list basically means giving gratitude to those who gave their best contribution to this server._**
1. <@1160436604754739321>
Great owner of this server. Busy in thinking how to grow this server and his youtube channel. He is the best owner and person.
2. <@1081876265683927080>
The one and only creator of this server and co-owner of this server. Trying to maintain the whole server in the absence of <@1160436604754739321> 
3. <@1231563118455554119>
Our first manager of this server. Him too trying best to bring improvement and give the best suggestions.
4. <@1216712260488134687>
Our honorable server special member. Special members are trying their best to bring attractive-ness in this server.
5. <@1396789637732630590> 
Second Co-owner & Founder of this server. Maintains this server silently.

* 🕊️ Not with us
 1. <@1151136510763094027>
Ayush was once a member of this server, he was a great BGTuber. SG and Ayush was the best combo of YouTubers I have ever seen. But recently he died due to breathing issues & other reasons which weren't revealed by the source. He left us too soon. May god take care of him there. Fly High Ayush!
# Huge Thanks to all the members mentioned above.`;
    await interaction.editReply({ content: content, ephemeral: true });
};


// --- Main Interaction Handler ---
export const handleInteraction = async (interaction) => {
    if (!interaction.isButton()) return;

    // Defer the reply to avoid timeout if role operations take time, and use editReply later
    await interaction.deferReply({ ephemeral: true });

    const customId = interaction.customId;

    if (customId === ABOUT_SHIVAM_ID) {
        await handleAboutShivam(interaction);
    } else if (customId === RULES_ID) {
        await handleRules(interaction);
    } else if (customId === FAQS_ID) {
        await handleFAQs(interaction);
    } else if (customId === ROLE_INFO_ID) {
        await handleRoleInfo(interaction);
    } else if (customId === SELF_ROLES_ID) {
        await handleSelfRoles(interaction);
    } else if (customId === VOLUNTEER_LIST_ID) {
        await handleVolunteerList(interaction);
    } else if (customId === GRATITUDE_LIST_ID) {
        await handleGratitudeList(interaction);
    } 
    // Role Info Categories
    else if ([STAFF_ROLE_ID, EXCLUSIVE_ROLE_ID, MEMBER_ROLE_ID, LEVEL_ROLE_ID].includes(customId)) {
        await handleRoleInfoCategory(interaction);
    } 
    // Self Roles Categories (update the message)
    else if ([SELF_ROLES_PING_ID, SELF_ROLES_AGE_ID, SELF_ROLES_GENDER_ID].includes(customId)) {
        await handleSelfRolesCategory(interaction);
    } 
    // Role Toggling (Ping Roles)
    else if (customId.startsWith('toggle_')) {
        const roleId = customId.substring('toggle_'.length);
        // Note: toggleRole handles the editReply internally
        await toggleRole(interaction, roleId, 'toggle');
    } 
    // Role Toggling (Age/Gender Roles - exclusive roles)
    else if (customId.startsWith('age_add_') || customId.startsWith('gender_add_')) {
        // Format: 'type_add_ROLEID_rem_ROLE1,ROLE2,...'
        const parts = customId.split('_rem_');
        const roleIdToAdd = parts[0].split('_add_')[1];
        const roleIdsToRemove = parts[1] ? parts[1].split(',') : [];

        // Note: toggleRole handles the editReply internally
        await toggleRole(interaction, roleIdToAdd, 'add', roleIdsToRemove);
    }
     else {
        await interaction.editReply({ content: 'Unrecognized button interaction.', ephemeral: true });
    }
};