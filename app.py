import os
import json
import sqlite3
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Tuple
import discord
from discord import app_commands
from discord.ext import tasks
from dotenv import load_dotenv

# --- CONFIGURATION ---
load_dotenv()

DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
DISCORD_CLIENT_ID = os.getenv('DISCORD_CLIENT_ID')
OWNER_ID = '1081876265683927080'

if not DISCORD_BOT_TOKEN or not DISCORD_CLIENT_ID:
    print('❌ ERROR: DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID must be set in .env file')
    exit(1)

STATUS_UPDATE_INTERVAL = 20  # 20 seconds

EMOJIS = {
    'offline': '<:offline:1446211386718949497>',
    'dnd': '<:dnd:1446211384818925700>',
    'online': '<:online:1446211377848123484>',
    'idle': '<:idle:1446211381354434693>'
}

# --- DATABASE SETUP ---
class Database:
    def __init__(self, db_path='bot_config.db'):
        self.db_path = db_path
        self.conn = None
        self.init_database()

    def init_database(self):
        self.conn = sqlite3.connect(self.db_path)
        cursor = self.conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS staff_members (
                user_id TEXT PRIMARY KEY,
                added_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        ''')

        self.conn.commit()
        print('[DATABASE] Database initialized successfully')

        # Initialize default staff members if database is empty
        default_staff_ids = [
            '1081876265683927080', '1403084314819825787', '1193415556402008169',
            '1317831363474227251', '1408294418695589929', '1355792114818224178',
            '1231563118455554119', '1033399411130245190', '1180098931280064562',
            '1228377961569325107', '923488148875526144'
        ]

        if len(self.get_staff_ids()) == 0:
            for staff_id in default_staff_ids:
                self.add_staff_member(staff_id)
            print('[DATABASE] Initialized default staff members')

        # Initialize default configuration
        if not self.get('statusChannelId'):
            self.set('statusChannelId', '1445693527274295378')
            self.set('statusMessageId', '1458467286187770071')

    def get(self, key: str, default_value=None):
        cursor = self.conn.cursor()
        cursor.execute('SELECT value FROM config WHERE key = ?', (key,))
        result = cursor.fetchone()

        if result:
            return json.loads(result[0])
        return default_value

    def set(self, key: str, value):
        cursor = self.conn.cursor()
        cursor.execute(
            'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
            (key, json.dumps(value))
        )
        self.conn.commit()
        print(f'[DATABASE] Updated {key}:', value)

    def get_staff_ids(self) -> List[str]:
        cursor = self.conn.cursor()
        cursor.execute('SELECT user_id FROM staff_members')
        return [row[0] for row in cursor.fetchall()]

    def add_staff_member(self, user_id: str):
        cursor = self.conn.cursor()
        cursor.execute(
            'INSERT OR IGNORE INTO staff_members (user_id) VALUES (?)',
            (user_id,)
        )
        self.conn.commit()

    def remove_staff_member(self, user_id: str):
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM staff_members WHERE user_id = ?', (user_id,))
        self.conn.commit()

    def close(self):
        if self.conn:
            self.conn.close()
            print('[DATABASE] Database closed.')

# Initialize database
db = Database()

# --- UTILITIES ---

def get_emoji(status: str) -> str:
    return EMOJIS.get(status, EMOJIS['offline'])

def calculate_next_run_time() -> Tuple[int, int]:
    """Calculates next Saturday at 6:30 PM GMT (18:30 UTC)"""
    now_utc = datetime.now(timezone.utc)

    # Target: Saturday (5 in Python, 0=Monday) at 18:30 UTC (6:30 PM GMT)
    target_day = 5  # Saturday
    target_hour = 18
    target_minute = 30

    # Start with today at the target time
    next_run = now_utc.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)

    # Calculate days until next Saturday
    current_weekday = now_utc.weekday()
    days_ahead = (target_day - current_weekday) % 7

    # If today is Saturday but the time has passed, schedule for next Saturday
    if days_ahead == 0:
        current_minutes = now_utc.hour * 60 + now_utc.minute
        target_minutes = target_hour * 60 + target_minute
        if current_minutes >= target_minutes:
            days_ahead = 7

    # If days_ahead is 0 and we haven't passed the time, keep it as today
    # Otherwise add the days
    if days_ahead > 0:
        next_run += timedelta(days=days_ahead)

    timestamp = int(next_run.timestamp() * 1000)
    delay = int((next_run - now_utc).total_seconds() * 1000)

    print(f'[SCHEDULER] Current time: {now_utc.strftime("%a, %d %b %Y %H:%M:%S UTC")}')
    print(f'[SCHEDULER] Next run time: {next_run.strftime("%a, %d %b %Y %H:%M:%S UTC")}')
    print(f'[SCHEDULER] Days ahead: {days_ahead}, Delay: {delay/1000/60:.2f} minutes')

    return timestamp, delay

# --- BOT CLIENT ---

class DiscordBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.members = True
        intents.messages = True
        intents.message_content = True
        intents.presences = True

        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)
        self.scheduler_task = None

    async def setup_hook(self):
        await self.tree.sync()
        print('[COMMANDS] Successfully registered application commands.')

    async def on_ready(self):
        print(f'✓ Bot logged in as {self.user}')

        # Start scheduler
        self.start_scheduler()

        # Start status updates
        if not self.status_updater.is_running():
            self.status_updater.start()
            print('[STATUS] Status updater started')

    def start_scheduler(self):
        setup_complete = db.get('setupComplete', False)

        if not setup_complete:
            print('[SCHEDULER] Setup incomplete. Scheduler not started.')
            return

        timestamp, delay = calculate_next_run_time()
        db.set('nextRunTimestamp', timestamp)

        next_run_date = datetime.fromtimestamp(timestamp/1000, timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
        print(f'[SCHEDULER] Next leaderboard run: {next_run_date}')
        print(f'[SCHEDULER] Delay: {delay / 1000 / 60:.2f} minutes ({delay / 1000:.2f} seconds)')

        if self.scheduler_task:
            self.scheduler_task.cancel()

        self.scheduler_task = self.loop.create_task(self.run_scheduler(delay / 1000))

    async def run_scheduler(self, delay: float):
        print(f'[SCHEDULER] Waiting {delay:.2f} seconds until next run...')
        await asyncio.sleep(delay)
        try:
            print('[SCHEDULER] Executing scheduled leaderboard update...')
            await run_leaderboard_update(self, False, None)
            print('[SCHEDULER] Scheduled leaderboard update completed successfully')
        except Exception as error:
            print(f'[SCHEDULER ERROR] Failed to run scheduled update: {error}')
            import traceback
            traceback.print_exc()
        finally:
            # Reschedule for next week
            self.start_scheduler()

    @tasks.loop(seconds=STATUS_UPDATE_INTERVAL)
    async def status_updater(self):
        await update_status(self)

client = DiscordBot()

# --- STATUS TRACKING ---

async def update_status(bot: DiscordBot):
    if not bot.is_ready():
        print('[STATUS] Bot not ready yet')
        return

    try:
        status_channel_id = db.get('statusChannelId')
        status_message_id = db.get('statusMessageId')
        staff_ids = db.get_staff_ids()

        if not status_channel_id or not status_message_id:
            print('[STATUS] Status tracking not configured')
            return

        channel = bot.get_channel(int(status_channel_id))
        if not channel:
            print(f'[STATUS] Fetching channel {status_channel_id}')
            channel = await bot.fetch_channel(int(status_channel_id))

        guild = channel.guild
        available = []
        unavailable = []

        for user_id in staff_ids:
            try:
                member = guild.get_member(int(user_id))
                if not member:
                    member = await guild.fetch_member(int(user_id))

                status = str(member.status) if hasattr(member, 'status') and member.status else 'offline'
                line = f"{get_emoji(status)} <@{member.id}> (`{member.name}`)"

                if status in ['online', 'idle']:
                    available.append(line)
                else:
                    unavailable.append(line)
            except Exception as e:
                print(f"[STATUS] Error fetching member {user_id}: {e}")
                unavailable.append(f"❌ <@{user_id}> (`User Data Unavailable`)")

        await bot.change_presence(
            activity=discord.CustomActivity(name=f"{len(available)} staff available"),
            status=discord.Status.online
        )

        embed = discord.Embed(
            color=0x808080,
            title='👥 Staff Status Overview'
        )
        embed.set_author(
            name="👑 Shivam's Discord",
            icon_url="https://cdn.discordapp.com/icons/1349281907765936188/7f90f5ba832e7672d4f55eb0c6017813.png",
            url="https://discord.gg/ha7K8ngyex"
        )
        embed.add_field(
            name='Available Staff:',
            value='\n'.join(available) or "*No staff available.*",
            inline=False
        )
        embed.add_field(
            name='Unavailable Staff:',
            value='\n'.join(unavailable) or "*No staff unavailable.*",
            inline=False
        )
        embed.set_footer(text='Status last updated')
        embed.timestamp = datetime.now(timezone.utc)

        msg = await channel.fetch_message(int(status_message_id))
        await msg.edit(embed=embed)
        print(f'✓ Updated status message')

    except Exception as err:
        print(f'❌ Status update failed: {err}')
        import traceback
        traceback.print_exc()

# --- MESSAGE COUNTING ---

async def get_weekly_message_counts(source_channel: discord.TextChannel) -> Dict[str, int]:
    message_counts = {}
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=7)

    fetched_messages = 0
    last_id = None

    print(f'[MESSAGE COUNT] Starting to count messages from {source_channel.name}')
    print(f'[MESSAGE COUNT] Cutoff time: {cutoff_time.strftime("%Y-%m-%d %H:%M:%S UTC")}')

    while fetched_messages < 5000:
        messages = []
        async for message in source_channel.history(limit=100, before=discord.Object(id=last_id) if last_id else None):
            messages.append(message)

        if len(messages) == 0:
            print(f'[MESSAGE COUNT] No more messages to fetch')
            break

        for message in messages:
            if message.created_at < cutoff_time:
                fetched_messages = 5001
                print(f'[MESSAGE COUNT] Reached cutoff time')
                break

            if not message.author.bot:
                user_id = str(message.author.id)
                message_counts[user_id] = message_counts.get(user_id, 0) + 1

        if fetched_messages > 5000:
            break

        last_id = messages[-1].id
        fetched_messages += len(messages)

    print(f'[MESSAGE COUNT] Counted {sum(message_counts.values())} messages from {len(message_counts)} users')
    return message_counts

# --- LEADERBOARD LOGIC ---

async def run_leaderboard_update(bot: DiscordBot, is_test: bool = False, interaction: discord.Interaction = None):
    print(f'[LEADERBOARD] Starting leaderboard update (test={is_test})')
    
    setup_complete = db.get('setupComplete', False)

    if not setup_complete:
        error_msg = 'The auto-leaderboard is not yet set up. Please use `/setup-auto-leaderboard` first.'
        print(f'[LEADERBOARD] {error_msg}')
        if interaction:
            await interaction.response.send_message(error_msg, ephemeral=True)
        return

    # Get guild - prioritize interaction guild, fallback to first guild
    guild = None
    if interaction:
        guild = interaction.guild
    else:
        guild_id = db.get('guildId')
        if guild_id:
            guild = bot.get_guild(int(guild_id))
        if not guild and bot.guilds:
            guild = bot.guilds[0]

    if not guild:
        error_msg = 'Error: Guild not found.'
        print(f'[LEADERBOARD] {error_msg}')
        if interaction:
            await interaction.response.send_message(error_msg, ephemeral=True)
        return

    if interaction:
        await interaction.response.defer()

    try:
        leaderboard_channel_id = db.get('leaderboardChannelId')
        source_channel_id = db.get('sourceChannelId')
        top_role_to_grant_id = db.get('topRoleToGrantId')
        top_user_count = db.get('topUserCount', 3)

        print(f'[LEADERBOARD] Config: channel={leaderboard_channel_id}, source={source_channel_id}, role={top_role_to_grant_id}, top={top_user_count}')

        leaderboard_channel = guild.get_channel(int(leaderboard_channel_id))
        source_channel = guild.get_channel(int(source_channel_id))
        top_role = guild.get_role(int(top_role_to_grant_id))

        if not leaderboard_channel or not source_channel or not top_role:
            error_msg = 'Setup configuration is invalid (Channel/Role not found). Please run `/setup-auto-leaderboard` again.'
            print(f'[LEADERBOARD] {error_msg}')
            print(f'[LEADERBOARD] leaderboard_channel={leaderboard_channel}, source_channel={source_channel}, top_role={top_role}')
            if interaction:
                await interaction.followup.send(error_msg)
            return

        print('[LEADERBOARD] Fetching message counts...')
        message_counts = await get_weekly_message_counts(source_channel)

        if not message_counts:
            error_msg = 'No messages found in the last 7 days. Cannot generate leaderboard.'
            print(f'[LEADERBOARD] {error_msg}')
            if interaction:
                await interaction.followup.send(error_msg)
            return

        sorted_users = sorted(message_counts.items(), key=lambda x: x[1], reverse=True)[:top_user_count]
        top_user_ids = [user_id for user_id, _ in sorted_users]

        print(f'[LEADERBOARD] Top users: {sorted_users}')

        print(f'[ROLES] Clearing role "{top_role.name}" from all members...')
        cleared_count = 0
        async for member in guild.fetch_members(limit=None):
            if top_role in member.roles:
                await member.remove_roles(top_role, reason='Weekly leaderboard role clearance.')
                cleared_count += 1
        print(f'[ROLES] Cleared role from {cleared_count} members')

        print(f'[ROLES] Granting role "{top_role.name}" to top {len(top_user_ids)} members...')
        granted_count = 0
        for user_id in top_user_ids:
            member = guild.get_member(int(user_id))
            if member:
                await member.add_roles(top_role, reason='Weekly leaderboard top user award.')
                granted_count += 1
                print(f'[ROLES] Granted role to {member.name}')
        print(f'[ROLES] Granted role to {granted_count} members')

        top1 = f"<@{sorted_users[0][0]}> with **{sorted_users[0][1]}** messages" if len(sorted_users) > 0 else 'N/A (No user ranked)'
        top2 = f"<@{sorted_users[1][0]}> with **{sorted_users[1][1]}** messages" if len(sorted_users) > 1 else 'N/A (No user ranked)'
        top3 = f"<@{sorted_users[2][0]}> with **{sorted_users[2][1]}** messages" if len(sorted_users) > 2 else 'N/A (No user ranked)'

        leaderboard_text = f"""Hello fellas, 
We're back with the weekly leaderboard update!! 
Here are the top {top_user_count} active members past week:
:first_place: Top 1: {top1}. 
-# Gets 50k unb in cash.
:second_place: Top 2: {top2}.
-# Gets 25k unb in cash.
:third_place: Top 3: {top3}.
-# Gets 10k unb in cash.

All of the top three members have been granted the role:
**<@&1376577805890093096>**

Top 1 can change their server nickname once. Top 1 & 2 can have a custom role with name and colour based on their requests. Contact <@!1081876265683927080> or <@!1193415556402008169>(<@&1405157360045002785>) within 24 hours to claim your awards."""

        await leaderboard_channel.send(leaderboard_text)
        print('[LEADERBOARD] Message sent successfully!')

        if interaction:
            await interaction.followup.send(
                f'✅ Leaderboard successfully run and posted to <#{leaderboard_channel_id}>. Roles have been updated.'
            )

        if not is_test:
            db.set('lastRunTimestamp', int(datetime.now(timezone.utc).timestamp() * 1000))
            print('[LEADERBOARD] Updated lastRunTimestamp')

    except Exception as error:
        print(f'[LEADERBOARD ERROR] {error}')
        import traceback
        traceback.print_exc()
        error_msg = f'An error occurred while running the leaderboard update: `{error}`'
        if interaction:
            await interaction.followup.send(error_msg)

# --- COMMANDS ---

@client.tree.command(name='setup-auto-leaderboard', description='Sets up the automated weekly leaderboard system.')
@app_commands.describe(
    channel='The channel where the final leaderboard message will be sent.',
    from_channel='The channel to count messages from (e.g., #general).',
    role='The role to clear and then give to the top members.',
    top='The number of top users to fetch (e.g., 3). Must be 1 or more.'
)
@app_commands.default_permissions(administrator=True)
async def setup_auto_leaderboard(
    interaction: discord.Interaction,
    channel: discord.TextChannel,
    from_channel: discord.TextChannel,
    role: discord.Role,
    top: int
):
    if top < 1:
        await interaction.response.send_message('Top count must be 1 or more.', ephemeral=True)
        return

    timestamp, _ = calculate_next_run_time()

    db.set('setupComplete', True)
    db.set('guildId', str(interaction.guild_id))
    db.set('leaderboardChannelId', str(channel.id))
    db.set('topRoleToGrantId', str(role.id))
    db.set('topUserCount', top)
    db.set('sourceChannelId', str(from_channel.id))
    db.set('lastRunTimestamp', 0)
    db.set('nextRunTimestamp', timestamp)

    client.start_scheduler()

    next_run_date = datetime.fromtimestamp(timestamp/1000, timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')

    await interaction.response.send_message(
        f'✅ Leaderboard setup complete!\n'
        f'- Leaderboard Channel: <#{channel.id}>\n'
        f'- Messages Counted From: <#{from_channel.id}>\n'
        f'- Top Users: {top}\n'
        f'- Role to Grant: **{role.name}**\n'
        f'- Next Scheduled Update: **{next_run_date}** (Saturday 6:30 PM GMT)',
        ephemeral=True
    )

@client.tree.command(name='test-leaderboard', description='Manually runs the leaderboard update immediately for testing.')
@app_commands.default_permissions(administrator=True)
async def test_leaderboard(interaction: discord.Interaction):
    await run_leaderboard_update(client, True, interaction)

@client.tree.command(name='leaderboard-timer', description='Shows the time remaining until the next scheduled leaderboard update.')
async def leaderboard_timer(interaction: discord.Interaction):
    setup_complete = db.get('setupComplete', False)

    if not setup_complete:
        await interaction.response.send_message('The auto-leaderboard is not yet set up.', ephemeral=True)
        return

    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    next_run_timestamp = db.get('nextRunTimestamp', 0)

    if next_run_timestamp < now:
        timestamp, _ = calculate_next_run_time()
        db.set('nextRunTimestamp', timestamp)
        next_run_timestamp = timestamp

    delay = next_run_timestamp - now
    total_seconds = delay // 1000
    days = total_seconds // (3600 * 24)
    hours = (total_seconds % (3600 * 24)) // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    next_run_date = datetime.fromtimestamp(next_run_timestamp/1000, timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')

    await interaction.response.send_message(
        f'⏳ The next automated leaderboard update is scheduled for **{next_run_date}**.\n'
        f'(In **{days}** days, **{hours}** hours, **{minutes}** minutes, and **{seconds}** seconds).'
    )

@client.tree.command(name='stats', description='Shows message statistics (total messages and top user) for the last 7 days.')
async def stats(interaction: discord.Interaction):
    setup_complete = db.get('setupComplete', False)

    if not setup_complete:
        await interaction.response.send_message(
            'The auto-leaderboard is not yet set up. Please use `/setup-auto-leaderboard` first.',
            ephemeral=True
        )
        return

    await interaction.response.defer(ephemeral=True)

    source_channel_id = db.get('sourceChannelId')
    guild = interaction.guild
    source_channel = guild.get_channel(int(source_channel_id))

    if not source_channel:
        await interaction.followup.send(
            'The source channel configured for message counting was not found. Please re-run `/setup-auto-leaderboard`.'
        )
        return

    try:
        message_counts = await get_weekly_message_counts(source_channel)
        total_messages = sum(message_counts.values())

        sorted_users = sorted(message_counts.items(), key=lambda x: x[1], reverse=True)

        top_user_text = 'No active members found in the last 7 days.'
        if sorted_users:
            user_id, count = sorted_users[0]
            top_user_text = f'<@{user_id}> with **{count}** messages.'

        today = datetime.now(timezone.utc)
        seven_days_ago = today - timedelta(days=7)

        format_date = lambda date: date.strftime('%b %d, %Y')

        stats_message = f'''📊 **Weekly Message Statistics**
Period: **{format_date(seven_days_ago)}** to **{format_date(today)}** (Last 7 days)

**Source Channel:** <#{source_channel.id}>

**Total Messages Sent:** **{total_messages}**
**Most Active Member:** {top_user_text}'''

        await interaction.followup.send(stats_message)

    except Exception as error:
        print(f'Error during /stats command: {error}')
        import traceback
        traceback.print_exc()
        await interaction.followup.send(f'An error occurred while fetching stats: `{error}`')

@client.tree.command(name='setup-status', description='Configure the status tracker (Admin only)')
@app_commands.describe(
    channel='Channel containing the status message',
    message_id='ID of the message to edit'
)
@app_commands.default_permissions(administrator=True)
async def setup_status(interaction: discord.Interaction, channel: discord.TextChannel, message_id: str):
    try:
        await channel.fetch_message(int(message_id))

        db.set('statusChannelId', str(channel.id))
        db.set('statusMessageId', message_id)

        await interaction.response.send_message(
            f'✅ Status tracker configured!\n- Channel: <#{channel.id}>\n- Message ID: {message_id}',
            ephemeral=True
        )

        await update_status(client)
    except:
        await interaction.response.send_message(
            f'❌ Could not find message with ID {message_id} in <#{channel.id}>. Please verify the message ID.',
            ephemeral=True
        )

@client.tree.command(name='staff-add', description='Add a staff member to the status tracker')
@app_commands.describe(user='The user to add as staff')
@app_commands.default_permissions(administrator=True)
async def staff_add(interaction: discord.Interaction, user: discord.User):
    db.add_staff_member(str(user.id))

    await interaction.response.send_message(
        f'✅ Added <@{user.id}> to staff tracking.',
        ephemeral=True
    )

    await update_status(client)

@client.tree.command(name='staff-remove', description='Remove a staff member from the status tracker')
@app_commands.describe(user='The user to remove from staff')
@app_commands.default_permissions(administrator=True)
async def staff_remove(interaction: discord.Interaction, user: discord.User):
    db.remove_staff_member(str(user.id))

    await interaction.response.send_message(
        f'✅ Removed <@{user.id}> from staff tracking.',
        ephemeral=True
    )

    await update_status(client)

@client.tree.command(name='staff-list', description='List all staff members being tracked')
async def staff_list(interaction: discord.Interaction):
    staff_ids = db.get_staff_ids()

    if len(staff_ids) == 0:
        await interaction.response.send_message(
            'No staff members are currently being tracked.',
            ephemeral=True
        )
        return

    staff_list_text = '\n'.join([f'<@{user_id}>' for user_id in staff_ids])

    await interaction.response.send_message(
        f'📋 **Staff Members Being Tracked ({len(staff_ids)}):**\n{staff_list_text}',
        ephemeral=True
    )

@client.tree.command(name='shutdown', description='Shuts down the bot (Owner only).')
@app_commands.default_permissions(administrator=True)
async def shutdown(interaction: discord.Interaction):
    if str(interaction.user.id) != OWNER_ID:
        await interaction.response.send_message(
            '🚫 Permission denied. Only the designated owner can use this command.',
            ephemeral=True
        )
        return

    await interaction.response.send_message('👋 Shutting down bot. Goodbye!')

    print(f'[ADMIN] Shutdown initiated by user ID: {interaction.user.id}')

    if client.scheduler_task:
        client.scheduler_task.cancel()
        print('[SCHEDULER] Scheduler successfully cleared.')

    db.close()

    await client.close()

# --- MAIN ---

if __name__ == '__main__':
    try:
        client.run(DISCORD_BOT_TOKEN)
    except KeyboardInterrupt:
        print('\n[SHUTDOWN] Received SIGINT, closing database...')
        db.close()
    except Exception as e:
        print(f'❌ Failed to log in to Discord: {e}')
        db.close()
        exit(1)
