const testFile = require('./commands/test.js');

const { Client, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { token } = require('./config.json');
const { exec } = require('child_process');
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

const commands = {
  [testFile.data.name]: testFile
};

client.once(Events.ClientReady, c => {
  console.log(`Login successful. username: ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  const userName = interaction.user.tag;

  let channelName = "DM/不明";
  if (interaction.channel && interaction.channel.name) {
      channelName = interaction.channel.name;
  }

  console.log(`Command "${commandName}" was executed by ${userName} in #${channelName}`);
  
  const command = commands[commandName];
  if (!command) {
    console.error(`Command "${commandName}" not found.`);
    await interaction.reply({ 
      content: `コマンド "${commandName}" は存在しません。`, 
      ephemeral: true 
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command "${commandName}":`, error);
    const errorMessage = '実行中にエラーが発生しました。';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ 
        content: errorMessage, 
        ephemeral: true 
      });
    } else {
      await interaction.reply({ 
        content: errorMessage, 
        ephemeral: true 
      });
    }
  }
});

client.login(token);
