import discord
from discord.ext import tasks, commands
import asyncio

class MyBot(commands.Bot):
    def __init__(self):
        super().__init__(command_prefix="!", intents=discord.Intents.all())

    async def on_ready(self):
        print(f'Logged in as {self.user}')
        # Start the background task
        self.update_stats.start()

    @tasks.loop(seconds=20)
    async def update_stats(self):
        channel = self.get_channel(1234567890) # Replace with your Channel ID
        if channel:
            # Simple logic to find or create the message
            # In a real bot, you might save the message_id to a file/database
            content = f"Last updated: <t:{int(asyncio.get_event_loop().time())}:R>"
            
            # This is a basic example; for a specific command, see below
            print("Updating message...")

    @commands.command()
    async def monitor(self, ctx):
        # 1. Send the initial message
        msg = await ctx.send("Starting monitor...")
        
        # 2. Loop to edit it
        while True:
            await asyncio.sleep(20)
            # 3. Use .edit() instead of .send()
            await msg.edit(content=f"Updated 20s ago. Next update in 20s.")

# Run the bot
# bot = MyBot()
# bot.run('YOUR_TOKEN')
