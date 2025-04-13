const { REST, Routes } = require('discord.js');
const { applicationId, guildId, token } = require('./config.json');

const testFile = require('./commands/test.js');
const selfFile = require('./commands/self.js');

const commands = [
  testFile.data.toJSON(),
  selfFile.data.toJSON(),
  selfFile.editData.toJSON()
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
      await rest.put(
    Routes.applicationGuildCommands(applicationId, guildId),
    { body: commands },
  );
      console.log('All commands have been registered!');
  } catch (error) {
      console.error('Error during registration of command:', error);
  }
})();
