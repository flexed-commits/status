import discord
from discord.ext import commands
from discord import app_commands
import aiohttp
import sqlite3
import asyncio
import re
from datetime import datetime
from aiohttp import web
import os

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
    c.execute('''CREATE TABLE IF NOT EXISTS config
                 (key TEXT PRIMARY KEY, value TEXT)''')
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

def set_contact_channel(channel_id):
    """Store the contact form channel ID"""
    conn = sqlite3.connect('handlers.db')
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO config VALUES ('contact_channel_id', ?)", (str(channel_id),))
    conn.commit()
    conn.close()

def get_contact_channel():
    """Get the contact form channel ID"""
    conn = sqlite3.connect('handlers.db')
    c = conn.cursor()
    c.execute("SELECT value FROM config WHERE key = 'contact_channel_id'")
    result = c.fetchone()
    conn.close()
    return int(result[0]) if result else None

# Email validation
def is_valid_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

# Modal for Reply
class ReplyModal(discord.ui.Modal, title="Reply to Contact Form"):
    reply_text = discord.ui.TextInput(
        label="Your Reply",
        style=discord.TextStyle.paragraph,
        placeholder="Type your reply here (max 4000 characters)...",
        required=True,
        max_length=4000
    )

    def __init__(self, user_email, message_id, channel_id):
        super().__init__()
        self.user_email = user_email
        self.message_id = message_id
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        # Validate email
        if not is_valid_email(self.user_email):
            await interaction.followup.send(
                "❌ Email is invalid. Failed to send reply.",
                ephemeral=True
            )
            await self.mark_as_invalid(interaction, "Invalid email address")
            return

        # Send email
        success = await self.send_reply_email(self.user_email, self.reply_text.value)

        if success:
            await interaction.followup.send(
                f"✅ Reply sent successfully to {self.user_email}",
                ephemeral=True
            )
            await self.update_embed_replied(interaction)
        else:
            await interaction.followup.send(
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
            channel = bot.get_channel(self.channel_id)
            message = await channel.fetch_message(self.message_id)
            
            embed = message.embeds[0]
            embed.color = discord.Color.green()
            embed.set_footer(text=f"✅ Replied by {interaction.user.name}")
            
            await message.edit(embed=embed, view=None)
        except Exception as e:
            print(f"Error updating embed: {e}")

    async def mark_as_invalid(self, interaction, reason):
        """Mark embed as invalid"""
        try:
            channel = bot.get_channel(self.channel_id)
            message = await channel.fetch_message(self.message_id)
            
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

    def __init__(self, user_email, message_id, channel_id):
        super().__init__()
        self.user_email = user_email
        self.message_id = message_id
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        # Send ignore notification
        success = await self.send_ignore_notification(self.user_email, self.reason.value)

        if success:
            await interaction.followup.send(
                f"✅ Message ignored and notification sent to {self.user_email}",
                ephemeral=True
            )
            await self.update_embed_ignored(interaction)
        else:
            await interaction.followup.send(
                "❌ Failed to send ignore notification.",
                ephemeral=True
            )

    async def send_ignore_notification(self, to_email, reason):
        """Send ignore notification using Netlify function"""
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
                        print(f"Ignore notification failed: {resp.status} - {error_text}")
                        return False
        except asyncio.TimeoutError:
            print("Error: Request timed out while sending ignore notification")
            return False
        except Exception as e:
            print(f"Error sending ignore notification: {e}")
            return False

    async def update_embed_ignored(self, interaction):
        """Update embed to show message was ignored"""
        try:
            channel = bot.get_channel(self.channel_id)
            message = await channel.fetch_message(self.message_id)
            
            embed = message.embeds[0]
            embed.color = discord.Color.orange()
            embed.set_footer(text=f"🔕 Ignored by {interaction.user.name}: {self.reason.value}")
            
            await message.edit(embed=embed, view=None)
        except Exception as e:
            print(f"Error updating embed: {e}")

# Modal for Mark Invalid
class MarkInvalidModal(discord.ui.Modal, title="Mark as Invalid"):
    reason = discord.ui.TextInput(
        label="Reason",
        style=discord.TextStyle.paragraph,
        placeholder="Why is this message invalid?",
        required=True,
        max_length=500
    )

    def __init__(self, message_id, channel_id):
        super().__init__()
        self.message_id = message_id
        self.channel_id = channel_id

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        await self.mark_as_invalid(interaction, self.reason.value)
        await interaction.followup.send(
            "✅ Message marked as invalid.",
            ephemeral=True
        )

    async def mark_as_invalid(self, interaction, reason):
        """Mark embed as invalid"""
        try:
            channel = bot.get_channel(self.channel_id)
            message = await channel.fetch_message(self.message_id)
            
            embed = message.embeds[0]
            embed.color = discord.Color.dark_gray()
            embed.set_footer(text=f"❌ Invalid ({interaction.user.name}): {reason}")
            
            await message.edit(embed=embed, view=None)
        except Exception as e:
            print(f"Error marking as invalid: {e}")

# Button View
class ContactFormButtons(discord.ui.View):
    def __init__(self, user_email, message_id, channel_id):
        super().__init__(timeout=None)
        self.user_email = user_email
        self.message_id = message_id
        self.channel_id = channel_id

    @discord.ui.button(label="Reply", style=discord.ButtonStyle.green, emoji="✉️")
    async def reply_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_handler(interaction.user.id):
            await interaction.response.send_message(
                "❌ You don't have permission to handle contact forms.",
                ephemeral=True
            )
            return

        modal = ReplyModal(self.user_email, self.message_id, self.channel_id)
        await interaction.response.send_modal(modal)

    @discord.ui.button(label="Ignore", style=discord.ButtonStyle.gray, emoji="🔕")
    async def ignore_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_handler(interaction.user.id):
            await interaction.response.send_message(
                "❌ You don't have permission to handle contact forms.",
                ephemeral=True
            )
            return

        modal = IgnoreModal(self.user_email, self.message_id, self.channel_id)
        await interaction.response.send_modal(modal)

    @discord.ui.button(label="Mark as Invalid", style=discord.ButtonStyle.red, emoji="❌")
    async def invalid_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_handler(interaction.user.id):
            await interaction.response.send_message(
                "❌ You don't have permission to handle contact forms.",
                ephemeral=True
            )
            return

        modal = MarkInvalidModal(self.message_id, self.channel_id)
        await interaction.response.send_modal(modal)

# Handler for contact forms
async def handle_contact_form(request):
    """Handle incoming contact form submissions from Netlify"""
    try:
        data = await request.json()
        
        email = data.get('email')
        subject = data.get('subject')
        message = data.get('message')
        
        if not email or not subject or not message:
            return web.json_response(
                {'error': 'Missing required fields'},
                status=400
            )
        
        # Get the configured contact channel
        channel_id = get_contact_channel()
        if not channel_id:
            print("❌ No contact channel configured!")
            return web.json_response(
                {'error': 'Bot not configured properly. Run /setup-contact first.'},
                status=500
            )
        
        channel = bot.get_channel(channel_id)
        if not channel:
            print(f"❌ Channel {channel_id} not found!")
            return web.json_response(
                {'error': 'Channel not found'},
                status=500
            )
        
        # Create embed
        embed = discord.Embed(
            title="📧 New Contact Form Submission",
            color=0x667eea,
            timestamp=datetime.now()
        )
        embed.add_field(name="📨 From", value=email, inline=False)
        embed.add_field(name="📋 Subject", value=subject, inline=False)
        embed.add_field(
            name="💬 Message",
            value=message[:1024] if len(message) > 1024 else message,
            inline=False
        )
        embed.set_footer(text="Contact Form • flexedAI")
        
        # BOT SENDS MESSAGE WITH BUTTONS DIRECTLY!
        view = ContactFormButtons(email, 0, channel.id)
        sent_message = await channel.send(embed=embed, view=view)
        
        # Update the view with the correct message ID
        view.message_id = sent_message.id
        await sent_message.edit(view=view)
        
        print(f"✅ Contact form sent with buttons for {email}")
        
        return web.json_response({
            'success': True,
            'message': 'Contact form submitted to Discord'
        })
        
    except Exception as e:
        print(f"❌ Error handling contact form: {e}")
        import traceback
        traceback.print_exc()
        return web.json_response(
            {'error': str(e)},
            status=500
        )

# Start HTTP server with BOTH routes
async def start_http_server():
    """Start the HTTP server for receiving webhooks"""
    app = web.Application()

    # These two lines allow ONE ngrok URL to handle TWO different services
    app.router.add_post('/topgg', handle_topgg_vote)
    app.router.add_post('/contact', handle_contact_form)

    runner = web.AppRunner(app)
    await runner.setup()

    # Listen on port 8080
    site = web.TCPSite(runner, '0.0.0.0', 8080)
    await site.start()
    print("🌐 HTTP server started on port 8080")

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

@bot.tree.command(name="setup-contact", description="Setup contact form channel")
async def setup_contact(interaction: discord.Interaction):
    app_info = await bot.application_info()
    if interaction.user.id != app_info.owner.id:
        await interaction.response.send_message(
            "❌ Only the bot owner can setup contact forms.",
            ephemeral=True
        )
        return

    # Save channel ID
    set_contact_channel(interaction.channel.id)

    embed = discord.Embed(
        title="✅ Contact Form Setup Complete",
        description=f"Contact forms will now be sent to this channel with buttons!",
        color=discord.Color.green()
    )
    embed.add_field(
        name="📝 Your Endpoint",
        value="Add this to Netlify:\n`BOT_HTTP_ENDPOINT=https://tamisha-dilatometric-lengthwise.ngrok-free.dev/contact`",
        inline=False
    )

    await interaction.response.send_message(embed=embed, ephemeral=True)
    print(f"\n✅ Contact channel configured: #{interaction.channel.name}")

@bot.event
async def on_ready():
    print(f"\n{'='*60}")
    print(f"🤖 Bot logged in as {bot.user}")
    print(f"📊 Connected to {len(bot.guilds)} guild(s)")
    print(f"{'='*60}\n")

    # Initialize database
    init_db()

    # Start HTTP server
    asyncio.create_task(start_http_server())

    # Sync commands
    try:
        synced = await bot.tree.sync()
        print(f"✅ Synced {len(synced)} command(s)")
    except Exception as e:
        print(f"❌ Failed to sync commands: {e}")

    print(f"\n📋 Setup Instructions:")
    print(f"1. Run /setup-contact in your desired Discord channel")
    print(f"2. Run /handler add @user to add contact form handlers")
    print(f"3. Add BOT_HTTP_ENDPOINT to Netlify environment variables")
    print(f"\n{'='*60}\n")

# Run bot
if __name__ == "__main__":
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
