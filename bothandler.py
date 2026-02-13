import discord
from discord.ext import commands
from discord import app_commands
import aiohttp
import sqlite3
import asyncio
import re
from datetime import datetime
import os

# Bot setup
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# --- Database setup ---
def init_db():
    conn = sqlite3.connect('handlers.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS handlers
                 (user_id INTEGER PRIMARY KEY, username TEXT, added_at TEXT)''')
    conn.commit()
    conn.close()

def add_handler(user_id, username):
    conn = sqlite3.connect('handlers.db')
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO handlers VALUES (?, ?, ?)",
              (user_id, username, datetime.now().isoformat()))
    conn.commit()
    conn.close()

def remove_handler(user_id):
    conn = sqlite3.connect('handlers.db')
    c = conn.cursor()
    c.execute("DELETE FROM handlers WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()

def is_handler(user_id):
    conn = sqlite3.connect('handlers.db')
    c = conn.cursor()
    c.execute("SELECT * FROM handlers WHERE user_id = ?", (user_id,))
    result = c.fetchone()
    conn.close()
    return result is not None

def get_all_handlers():
    conn = sqlite3.connect('handlers.db')
    c = conn.cursor()
    c.execute("SELECT * FROM handlers")
    handlers = c.fetchall()
    conn.close()
    return handlers

# --- Webhook management ---
WEBHOOK_NAME = "flexedAI"
WEBHOOK_AVATAR_URL = "https://cdn.discordapp.com/avatars/1081876265683927080/5856bc32a1943714f38d3d2c3fa8489d.webp?size=2048"

async def create_or_get_webhook(channel):
    webhooks = await channel.webhooks()
    
    avatar_bytes = None
    async with aiohttp.ClientSession() as session:
        async with session.get(WEBHOOK_AVATAR_URL) as resp:
            if resp.status == 200:
                avatar_bytes = await resp.read()

    for webhook in webhooks:
        if webhook.name == WEBHOOK_NAME:
            if avatar_bytes:
                try:
                    await webhook.edit(avatar=avatar_bytes)
                except: pass
            return webhook

    webhook = await channel.create_webhook(
        name=WEBHOOK_NAME,
        avatar=avatar_bytes if avatar_bytes else None,
        reason="Contact form webhook created by bot"
    )
    return webhook

async def get_webhook_by_name(channel, name):
    webhooks = await channel.webhooks()
    for webhook in webhooks:
        if webhook.name == name:
            return webhook
    return None

def is_valid_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

# --- Modals (Fixed with Defer/Followup) ---

class ReplyModal(discord.ui.Modal, title="Reply to Contact Form"):
    reply_text = discord.ui.TextInput(
        label="Your Reply",
        style=discord.TextStyle.paragraph,
        placeholder="Type your reply here...",
        required=True,
        max_length=4000
    )

    def __init__(self, user_email, webhook_message_id, channel_id):
        super().__init__()
        self.user_email = user_email
        self.webhook_message_id = webhook_message_id
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        # Prevent "Unknown Interaction" by deferring immediately
        await interaction.response.defer(ephemeral=True)

        if not is_valid_email(self.user_email):
            await interaction.followup.send("❌ Email is invalid.", ephemeral=True)
            await self.update_embed_status(interaction, "Invalid email address", discord.Color.dark_gray(), "❌")
            return

        success = await self.send_email_api("send-reply", {"to": self.user_email, "message": self.reply_text.value})

        if success:
            await interaction.followup.send(f"✅ Reply sent to {self.user_email}", ephemeral=True)
            await self.update_embed_status(interaction, f"Replied by {interaction.user.name}", discord.Color.green(), "✅")
        else:
            await interaction.followup.send("❌ Failed to send reply. API error.", ephemeral=True)

    async def send_email_api(self, endpoint, data):
        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://flexedai.netlify.app/.netlify/functions/{endpoint}"
                async with session.post(url, json=data, timeout=20) as resp:
                    return resp.status == 200
        except:
            return False

    async def update_embed_status(self, interaction, footer_text, color, icon):
        try:
            channel = bot.get_channel(self.channel_id) or await bot.fetch_channel(self.channel_id)
            webhook = await get_webhook_by_name(channel, WEBHOOK_NAME)
            if webhook:
                message = await webhook.fetch_message(self.webhook_message_id)
                embed = message.embeds[0]
                embed.color = color
                embed.set_footer(text=f"{icon} {footer_text}")
                await webhook.edit_message(self.webhook_message_id, embed=embed, view=None)
        except Exception as e:
            print(f"Error updating embed: {e}")

class IgnoreModal(discord.ui.Modal, title="Ignore Contact Form"):
    reason = discord.ui.TextInput(
        label="Reason for Ignoring",
        style=discord.TextStyle.paragraph,
        placeholder="Why are you ignoring this?",
        required=True,
        max_length=500
    )

    def __init__(self, user_email, webhook_message_id, channel_id):
        super().__init__()
        self.user_email = user_email
        self.webhook_message_id = webhook_message_id
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        # API call
        async with aiohttp.ClientSession() as session:
            url = "https://flexedai.netlify.app/.netlify/functions/send-ignore"
            data = {"to": self.user_email, "reason": self.reason.value}
            async with session.post(url, json=data, timeout=20) as resp:
                success = (resp.status == 200)

        if success:
            await interaction.followup.send(f"✅ Ignore notification sent.", ephemeral=True)
            # Reusing status update logic
            channel = bot.get_channel(self.channel_id) or await bot.fetch_channel(self.channel_id)
            webhook = await get_webhook_by_name(channel, WEBHOOK_NAME)
            if webhook:
                msg = await webhook.fetch_message(self.webhook_message_id)
                emb = msg.embeds[0]
                emb.color = discord.Color.orange()
                emb.set_footer(text=f"🔕 Ignored by {interaction.user.name}: {self.reason.value}")
                await webhook.edit_message(self.webhook_message_id, embed=emb, view=None)
        else:
            await interaction.followup.send("❌ Failed to send ignore email.", ephemeral=True)

class MarkInvalidModal(discord.ui.Modal, title="Mark as Invalid"):
    reason = discord.ui.TextInput(label="Reason", required=True, max_length=500)

    def __init__(self, webhook_message_id, channel_id):
        super().__init__()
        self.webhook_message_id = webhook_message_id
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        channel = bot.get_channel(self.channel_id) or await bot.fetch_channel(self.channel_id)
        webhook = await get_webhook_by_name(channel, WEBHOOK_NAME)
        if webhook:
            msg = await webhook.fetch_message(self.webhook_message_id)
            emb = msg.embeds[0]
            emb.color = discord.Color.dark_gray()
            emb.set_footer(text=f"❌ Invalid: {self.reason.value}")
            await webhook.edit_message(self.webhook_message_id, embed=emb, view=None)
            await interaction.followup.send("✅ Marked as invalid.", ephemeral=True)

# --- Button View ---

class ContactFormButtons(discord.ui.View):
    def __init__(self, user_email, message_id, channel_id):
        super().__init__(timeout=None)
        self.user_email = user_email
        self.message_id = message_id
        self.channel_id = channel_id

    @discord.ui.button(label="Reply", style=discord.ButtonStyle.green, emoji="✉️")
    async def reply_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_handler(interaction.user.id):
            return await interaction.response.send_message("❌ No permission.", ephemeral=True)
        await interaction.response.send_modal(ReplyModal(self.user_email, self.message_id, self.channel_id))

    @discord.ui.button(label="Ignore", style=discord.ButtonStyle.gray, emoji="🔕")
    async def ignore_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_handler(interaction.user.id):
            return await interaction.response.send_message("❌ No permission.", ephemeral=True)
        await interaction.response.send_modal(IgnoreModal(self.user_email, self.message_id, self.channel_id))

    @discord.ui.button(label="Mark as Invalid", style=discord.ButtonStyle.red, emoji="❌")
    async def invalid_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_handler(interaction.user.id):
            return await interaction.response.send_message("❌ No permission.", ephemeral=True)
        await interaction.response.send_modal(MarkInvalidModal(self.message_id, self.channel_id))

# --- Slash Commands ---

@bot.tree.command(name="handler", description="Manage handlers")
@app_commands.describe(action="Action", user="User")
@app_commands.choices(action=[
    app_commands.Choice(name="add", value="add"),
    app_commands.Choice(name="remove", value="remove"),
    app_commands.Choice(name="list", value="list")
])
async def handler_command(interaction: discord.Interaction, action: app_commands.Choice[str], user: discord.Member = None):
    app_info = await bot.application_info()
    if interaction.user.id != app_info.owner.id:
        return await interaction.response.send_message("❌ Owner only.", ephemeral=True)

    if action.value == "add" and user:
        add_handler(user.id, str(user))
        await interaction.response.send_message(f"✅ Added {user.mention}", ephemeral=True)
    elif action.value == "remove" and user:
        remove_handler(user.id)
        await interaction.response.send_message(f"✅ Removed {user.mention}", ephemeral=True)
    elif action.value == "list":
        handlers = get_all_handlers()
        list_str = "\n".join([f"• <@{h[0]}>" for h in handlers]) or "No handlers."
        await interaction.response.send_message(embed=discord.Embed(title="Handlers", description=list_str), ephemeral=True)

@bot.tree.command(name="setup-webhook", description="Setup webhook")
async def setup_webhook(interaction: discord.Interaction):
    app_info = await bot.application_info()
    if interaction.user.id != app_info.owner.id:
        return await interaction.response.send_message("❌ Owner only.", ephemeral=True)

    await interaction.response.defer(ephemeral=True)
    webhook = await create_or_get_webhook(interaction.channel)
    await interaction.followup.send(f"✅ Webhook Ready: `{webhook.url}`", ephemeral=True)

# --- Events ---

@bot.event
async def on_message(message):
    if message.author == bot.user and not message.webhook_id:
        return

    if message.webhook_id and message.embeds:
        embed = message.embeds[0]
        if embed.title and "Contact Form" in embed.title:
            email = None
            for field in embed.fields:
                if field.name and "From" in field.name:
                    email = field.value
                    break
            
            if email:
                webhook = await get_webhook_by_name(message.channel, WEBHOOK_NAME)
                if webhook:
                    view = ContactFormButtons(email, message.id, message.channel.id)
                    await asyncio.sleep(1) # Wait for Discord to index message
                    await webhook.edit_message(message.id, view=view)

    await bot.process_commands(message)

@bot.event
async def on_ready():
    init_db()
    await bot.tree.sync()
    print(f"Logged in as {bot.user}")

if __name__ == "__main__":
    TOKEN = os.getenv("BOT_TOKEN1") or input("Enter Token: ")
    bot.run(TOKEN)
