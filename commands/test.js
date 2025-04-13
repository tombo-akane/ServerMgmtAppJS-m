const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('test')
		.setDescription('test command'),
	execute: async function(interaction) {
		await interaction.reply('The bot is working correctly.');
		console.log(`test command has used by ${interaction.user.tag}.`);
	},
};
