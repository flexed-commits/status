import discord
from discord.ext import commands
from discord import app_commands
import aiohttp
import sqlite3
import asyncio
import re
from datetime import datetime

# Bot setup
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Database setup
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

# Webhook management
WEBHOOK_NAME = "flexedAI"
WEBHOOK_AVATAR_URL = "https://cdn.discordapp.com/avatars/1081876265683927080/5856bc32a1943714f38d3d2c3fa8489d.webp?size=2048"
webhook_url = None

async def create_or_get_webhook(channel):
    """Create or get the flexedAI webhook in the specified channel"""
    global webhook_url
    
    webhooks = await channel.webhooks()
    
    # Download avatar bytes first
    async with aiohttp.ClientSession() as session:
        async with session.get(WEBHOOK_AVATAR_URL) as resp:
            if resp.status != 200:
                print(f"⚠️  Failed to download webhook avatar: {resp.status}")
                avatar_bytes = None
            else:
                avatar_bytes = await resp.read()
                print(f"✅ Downloaded webhook avatar ({len(avatar_bytes)} bytes)")
    
    # Check if webhook already exists
    for webhook in webhooks:
        if webhook.name == WEBHOOK_NAME:
            webhook_url = webhook.url
            print(f"📍 Found existing webhook: {webhook.name}")
            
            # Update avatar if we have the bytes and avatar is different
            if avatar_bytes:
                try:
                    await webhook.edit(avatar=avatar_bytes, reason="Updating webhook avatar")
                    print(f"✅ Updated webhook avatar")
                except Exception as e:
                    print(f"⚠️  Failed to update webhook avatar: {e}")
            
            return webhook
    
    # Create new webhook
    print(f"🆕 Creating new webhook: {WEBHOOK_NAME}")
    webhook = await channel.create_webhook(
        name=WEBHOOK_NAME,
        avatar=avatar_bytes if avatar_bytes else None,
        reason="Contact form webhook created by bot"
    )
    webhook_url = webhook.url
    print(f"✅ Webhook created successfully")
    return webhook

# Email validation
def is_valid_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

# Modal for Reply
class ReplyModal(discord.ui.Modal, title="Reply to Contact Form"):
    reply_text = discord.ui.TextInput(
        label="Your Reply",
        style=discord.TextStyle.paragraph,
        placeholder="Type your reply here (max 4096 characters)...",
        required=True,
        max_length=4096
    )
    
    def __init__(self, user_email, webhook_message_id):
        super().__init__()
        self.user_email = user_email
        self.webhook_message_id = webhook_message_id
    
    async def on_submit(self, interaction: discord.Interaction):
        # Validate email
        if not is_valid_email(self.user_email):
            await interaction.response.send_message(
                "❌ Email is invalid. Failed to send reply. Message marked as invalid.",
                ephemeral=True
            )
            # Mark embed as invalid
            await self.mark_as_invalid(interaction, "Invalid email address")
            return
        
        # Send email
        success = await self.send_reply_email(self.user_email, self.reply_text.value)
        
        if success:
            await interaction.response.send_message(
                f"✅ Reply sent successfully to {self.user_email}",
                ephemeral=True
            )
            # Update embed to show reply was sent
            await self.update_embed_replied(interaction)
        else:
            await interaction.response.send_message(
                "❌ Failed to send reply. Please check logs.",
                ephemeral=True
            )
    
    async def send_reply_email(self, to_email, reply_message):
        """Send reply email using your Netlify function"""
        try:
            async with aiohttp.ClientSession() as session:
                url = "https://flexedai.netlify.app/.netlify/functions/send-reply"
                
                data = {
                    "to": to_email,
                    "message": reply_message
                }
                
                async with session.post(url, json=data, timeout=30) as resp:
                    if resp.status == 200:
                        return True
                    else:
                        error_text = await resp.text()
                        print(f"Reply email failed: {resp.status} - {error_text}")
                        return False
        except asyncio.TimeoutError:
            print("Error: Request timed out while sending reply email")
            return False
        except Exception as e:
            print(f"Error sending reply email: {e}")
            return False
    
    async def update_embed_replied(self, interaction):
        """Update the embed to show reply was sent"""
        try:
            message = await interaction.channel.fetch_message(self.webhook_message_id)
            embed = message.embeds[0]
            embed.color = discord.Color.green()
            embed.set_footer(text=f"✅ Replied by {interaction.user.name}")
            await message.edit(embed=embed, view=None)
        except Exception as e:
            print(f"Error updating embed: {e}")
    
    async def mark_as_invalid(self, interaction, reason):
        """Mark embed as invalid"""
        try:
            message = await interaction.channel.fetch_message(self.webhook_message_id)
            embed = message.embeds[0]
            embed.color = discord.Color.dark_gray()
            embed.set_footer(text=f"❌ Invalid: {reason}")
            await message.edit(embed=embed, view=None)
        except Exception as e:
            print(f"Error marking as invalid: {e}")

# Modal for Ignore
class IgnoreModal(discord.ui.Modal, title="Ignore Contact Form"):
    reason = discord.ui.TextInput(
        label="Reason for Ignoring",
        style=discord.TextStyle.paragraph,
        placeholder="Why are you ignoring this message?",
        required=True,
        max_length=500
    )
    
    def __init__(self, user_email, webhook_message_id):
        super().__init__()
        self.user_email = user_email
        self.webhook_message_id = webhook_message_id
    
    async def on_submit(self, interaction: discord.Interaction):
        # Send ignore email
        success = await self.send_ignore_email(self.user_email, self.reason.value)
        
        if success:
            await interaction.response.send_message(
                f"✅ Ignore notification sent to {self.user_email}",
                ephemeral=True
            )
            # Update embed
            await self.update_embed_ignored(interaction)
        else:
            await interaction.response.send_message(
                "❌ Failed to send ignore notification.",
                ephemeral=True
            )
    
    async def send_ignore_email(self, to_email, reason):
        """Send ignore notification email"""
        try:
            async with aiohttp.ClientSession() as session:
                url = "https://flexedai.netlify.app/.netlify/functions/send-ignore"
                
                data = {
                    "to": to_email,
                    "reason": reason
                }
                
                async with session.post(url, json=data, timeout=30) as resp:
                    if resp.status == 200:
                        return True
                    else:
                        error_text = await resp.text()
                        print(f"Ignore email failed: {resp.status} - {error_text}")
                        return False
        except asyncio.TimeoutError:
            print("Error: Request timed out while sending ignore email")
            return False
        except Exception as e:
            print(f"Error sending ignore email: {e}")
            return False
    
    async def update_embed_ignored(self, interaction):
        """Update embed to show it was ignored"""
        try:
            message = await interaction.channel.fetch_message(self.webhook_message_id)
            embed = message.embeds[0]
            embed.color = discord.Color.orange()
            embed.set_footer(text=f"🔕 Ignored by {interaction.user.name}: {self.reason.value}")
            await message.edit(embed=embed, view=None)
        except Exception as e:
            print(f"Error updating ignored embed: {e}")

# Modal for Mark as Invalid
class MarkInvalidModal(discord.ui.Modal, title="Mark as Invalid"):
    reason = discord.ui.TextInput(
        label="Reason",
        style=discord.TextStyle.paragraph,
        placeholder="Why is this message invalid?",
        required=True,
        max_length=500
    )
    
    def __init__(self, webhook_message_id):
        super().__init__()
        self.webhook_message_id = webhook_message_id
    
    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.send_message(
            "✅ Message marked as invalid",
            ephemeral=True
        )
        await self.update_embed_invalid(interaction)
    
    async def update_embed_invalid(self, interaction):
        """Update embed to mark as invalid"""
        try:
            message = await interaction.channel.fetch_message(self.webhook_message_id)
            embed = message.embeds[0]
            embed.color = discord.Color.dark_gray()
            embed.set_footer(text=f"❌ Invalid: {self.reason.value}")
            await message.edit(embed=embed, view=None)
        except Exception as e:
            print(f"Error marking as invalid: {e}")

# Button view for contact form messages
class ContactFormButtons(discord.ui.View):
    def __init__(self, user_email, message_id):
        super().__init__(timeout=None)
        self.user_email = user_email
        self.message_id = message_id
    
    @discord.ui.button(label="Reply", style=discord.ButtonStyle.green, emoji="✉️")
    async def reply_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        # Check if user is a handler
        if not is_handler(interaction.user.id):
            await interaction.response.send_message(
                "❌ You don't have permission to handle contact forms.",
                ephemeral=True
            )
            return
        
        modal = ReplyModal(self.user_email, self.message_id)
        await interaction.response.send_modal(modal)
    
    @discord.ui.button(label="Ignore", style=discord.ButtonStyle.gray, emoji="🔕")
    async def ignore_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        # Check if user is a handler
        if not is_handler(interaction.user.id):
            await interaction.response.send_message(
                "❌ You don't have permission to handle contact forms.",
                ephemeral=True
            )
            return
        
        modal = IgnoreModal(self.user_email, self.message_id)
        await interaction.response.send_modal(modal)
    
    @discord.ui.button(label="Mark as Invalid", style=discord.ButtonStyle.red, emoji="❌")
    async def invalid_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        # Check if user is a handler
        if not is_handler(interaction.user.id):
            await interaction.response.send_message(
                "❌ You don't have permission to handle contact forms.",
                ephemeral=True
            )
            return
        
        modal = MarkInvalidModal(self.message_id)
        await interaction.response.send_modal(modal)

# Commands
@bot.tree.command(name="handler", description="Manage contact form handlers")
@app_commands.describe(
    action="Action to perform",
    user="User to add/remove as handler"
)
@app_commands.choices(action=[
    app_commands.Choice(name="add", value="add"),
    app_commands.Choice(name="remove", value="remove"),
    app_commands.Choice(name="list", value="list")
])
async def handler_command(
    interaction: discord.Interaction,
    action: app_commands.Choice[str],
    user: discord.Member = None
):
    # Check if user is the bot owner
    app_info = await bot.application_info()
    if interaction.user.id != app_info.owner.id:
        await interaction.response.send_message(
            "❌ Only the bot owner can manage handlers.",
            ephemeral=True
        )
        return
    
    if action.value == "add":
        if user is None:
            await interaction.response.send_message(
                "❌ Please specify a user to add.",
                ephemeral=True
            )
            return
        
        add_handler(user.id, str(user))
        await interaction.response.send_message(
            f"✅ Added {user.mention} as a contact form handler.",
            ephemeral=True
        )
    
    elif action.value == "remove":
        if user is None:
            await interaction.response.send_message(
                "❌ Please specify a user to remove.",
                ephemeral=True
            )
            return
        
        remove_handler(user.id)
        await interaction.response.send_message(
            f"✅ Removed {user.mention} from contact form handlers.",
            ephemeral=True
        )
    
    elif action.value == "list":
        handlers = get_all_handlers()
        if not handlers:
            await interaction.response.send_message(
                "📋 No handlers configured yet.",
                ephemeral=True
            )
            return
        
        handler_list = "\n".join([f"• <@{h[0]}> (added {h[2].split('T')[0]})" for h in handlers])
        embed = discord.Embed(
            title="📋 Contact Form Handlers",
            description=handler_list,
            color=discord.Color.blue()
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.tree.command(name="setup-webhook", description="Setup webhook in current channel")
async def setup_webhook(interaction: discord.Interaction):
    # Check if user is the bot owner
    app_info = await bot.application_info()
    if interaction.user.id != app_info.owner.id:
        await interaction.response.send_message(
            "❌ Only the bot owner can setup webhooks.",
            ephemeral=True
        )
        return
    
    await interaction.response.defer(ephemeral=True)
    
    webhook = await create_or_get_webhook(interaction.channel)
    
    embed = discord.Embed(
        title="✅ Webhook Setup Complete",
        description=f"Webhook **{WEBHOOK_NAME}** is ready in this channel!",
        color=discord.Color.green()
    )
    embed.add_field(name="Webhook URL", value=f"||{webhook.url}||", inline=False)
    embed.add_field(
        name="📝 Next Steps",
        value="1. Copy the webhook URL above\n2. Add it to your Netlify environment variables as `DISCORD_WEBHOOK_URL`\n3. Redeploy your Netlify site",
        inline=False
    )
    
    await interaction.followup.send(embed=embed, ephemeral=True)
    print(f"\n{'='*60}")
    print(f"🎉 Webhook created successfully!")
    print(f"📍 Channel: #{interaction.channel.name}")
    print(f"🔗 Webhook URL: {webhook.url}")
    print(f"{'='*60}\n")

@bot.event
async def on_message(message):
    # Ignore messages from the bot itself
    if message.author == bot.user:
        return
    
    # Check if message is from webhook and has embeds with contact form title
    if message.webhook_id and message.embeds:
        try:
            embed = message.embeds[0]
            
            # Check if this is a contact form submission
            if embed.title and "Contact Form Submission" in embed.title:
                print(f"📧 Detected contact form submission in message {message.id}")
                
                # Extract email from embed fields
                email = None
                for field in embed.fields:
                    if field.name and "From" in field.name:
                        email = field.value
                        break
                
                if email:
                    print(f"📨 Extracted email: {email}")
                    # Add buttons to the webhook message
                    view = ContactFormButtons(email, message.id)
                    await message.edit(view=view)
                    print(f"✅ Added buttons to message {message.id}")
                else:
                    print(f"⚠️  Could not extract email from embed")
        except Exception as e:
            print(f"❌ Error adding buttons to webhook message: {e}")
            import traceback
            traceback.print_exc()
    
    # Process commands
    await bot.process_commands(message)

@bot.event
async def on_ready():
    print(f"\n{'='*60}")
    print(f"🤖 Bot logged in as {bot.user}")
    print(f"📊 Connected to {len(bot.guilds)} guild(s)")
    print(f"{'='*60}\n")
    
    # Initialize database
    init_db()
    
    # Sync commands
    try:
        synced = await bot.tree.sync()
        print(f"✅ Synced {len(synced)} command(s)")
    except Exception as e:
        print(f"❌ Failed to sync commands: {e}")
    
    print(f"\n📋 Instructions:")
    print(f"1. Use /setup-webhook in your desired channel to create the webhook")
    print(f"2. Use /handler add @user to add contact form handlers")
    print(f"3. Copy the webhook URL and add it to Netlify env vars")
    print(f"\n{'='*60}\n")

# Run bot
if __name__ == "__main__":
    import os
    
    # Get token from environment or user input
    TOKEN = os.getenv("BOT_TOKEN1")
    
    if not TOKEN:
        print("\n⚠️  BOT_TOKEN1 not found in environment variables")
        TOKEN = input("Please enter your Discord bot token: ").strip()
    
    if not TOKEN:
        print("❌ No token provided. Exiting...")
        exit(1)
    
    try:
        bot.run(TOKEN)
    except discord.LoginFailure:
        print("❌ Invalid token. Please check your bot token and try again.")
    except Exception as e:
        print(f"❌ Error running bot: {e}")
