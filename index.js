const testFile = require('./commands/test.js');
const selfFile = require('./commands/self.js');

const { Client, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { token, selfIntroductionChannelId } = require('./config.json');
const { exec } = require('child_process');
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

// 案内メッセージのIDを保持する変数
let guideMessageId = null;
// 最後にメッセージが更新された時間を記録
let lastGuideUpdateTime = 0;

// 案内メッセージの内容
const GUIDE_MESSAGE = '/self コマンドで自己紹介を投稿できます。\n投稿した自己紹介を編集したいときは、/self-edit コマンドで編集できます。';
// 更新間隔（ミリ秒）- 短時間で複数回更新されないようにするための制限
const UPDATE_INTERVAL = 3000; // 3秒

/**
 * 既存の案内メッセージを検索する関数
 * @returns {Promise<string|null>} 見つかった場合はメッセージID、なければnull
 */
async function findExistingGuideMessage() {
  try {
    const channel = await client.channels.fetch(selfIntroductionChannelId);
    if (!channel) {
      console.error(`Channel with ID ${selfIntroductionChannelId} not found.`);
      return null;
    }

    // チャンネルの最新100件のメッセージを取得
    const messages = await channel.messages.fetch({ limit: 100 });
    
    // ボット自身のメッセージで、案内メッセージの内容と一致するものを探す
    const guideMessage = messages.find(msg => 
      msg.author.id === client.user.id && 
      msg.content === GUIDE_MESSAGE
    );

    if (guideMessage) {
      console.log(`Found existing guide message with ID: ${guideMessage.id}`);
      return guideMessage.id;
    }
    
    return null;
  } catch (error) {
    console.error('Error finding existing guide message:', error);
    return null;
  }
}

/**
 * 自己紹介チャンネルに案内メッセージを投稿する関数
 * @param {boolean} force - trueの場合、時間制限に関わらず強制的に更新
 */
async function postGuideMessage(force = false) {
  try {
    // 前回の更新から一定時間経っていない場合は更新しない（force=trueの場合を除く）
    const now = Date.now();
    if (!force && (now - lastGuideUpdateTime < UPDATE_INTERVAL)) {
      console.log(`Guide message update skipped - too soon since last update (${now - lastGuideUpdateTime}ms)`);
      return;
    }

    const channel = await client.channels.fetch(selfIntroductionChannelId);
    if (!channel) {
      console.error(`Channel with ID ${selfIntroductionChannelId} not found.`);
      return;
    }

    // 以前の案内メッセージがあれば削除
    if (guideMessageId) {
      try {
        const oldMessage = await channel.messages.fetch(guideMessageId);
        if (oldMessage) {
          await oldMessage.delete();
        }
      } catch (error) {
        console.error('Error deleting old guide message:', error);
        // エラーが出ても続行
      }
    }

    // 新しい案内メッセージを投稿
    const newGuideMessage = await channel.send(GUIDE_MESSAGE);
    guideMessageId = newGuideMessage.id;
    lastGuideUpdateTime = Date.now();
    console.log(`Guide message posted with ID: ${guideMessageId}`);
  } catch (error) {
    console.error('Error posting guide message:', error);
  }
}

const commands = {
  [testFile.data.name]: testFile,
  [selfFile.data.name]: selfFile,
  // self-editコマンドを追加
  'self-edit': {
    ...selfFile,
    execute: selfFile.editExecute
  }
};

client.once(Events.ClientReady, async c => {
  console.log(`Login successful. username: ${c.user.tag}`);
  
  // 既存の案内メッセージを検索
  const existingMessageId = await findExistingGuideMessage();
  
  if (existingMessageId) {
    // 既存のメッセージを見つけた場合、それを使用
    guideMessageId = existingMessageId;
    lastGuideUpdateTime = Date.now();
    console.log(`Using existing guide message with ID: ${guideMessageId}`);
  } else {
    // 見つからなかった場合は新規投稿
    await postGuideMessage(true);
  }
});

// メッセージ作成イベントを監視
client.on(Events.MessageCreate, async message => {
  // 自分自身のメッセージには反応しない
  if (message.author.id === client.user.id) return;
  
  // 自己紹介チャンネルでのメッセージのみ処理
  if (message.channelId === selfIntroductionChannelId) {
    // Webhookからのメッセージはself/self-editコマンドによる自己紹介なので処理
    if (message.webhookId) {
      // Webhookからのメッセージ（自己紹介の投稿・編集）の場合は案内メッセージを更新
      setTimeout(() => {
        postGuideMessage();
      }, 500); // 少し待ってから更新
    } 
    // 通常のユーザーメッセージでEphemeral（一時的な）メッセージでない場合のみ処理
    else if (!message.flags.has(MessageFlags.Ephemeral)) {
      // 一般ユーザーからの通常メッセージの場合は案内メッセージを更新
      setTimeout(() => {
        postGuideMessage();
      }, 500);
    }
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    // スラッシュコマンドの処理
    if (interaction.isChatInputCommand()) {
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

      await command.execute(interaction);
      return;
    }
    
    // モーダル送信の処理
    if (interaction.isModalSubmit()) {
      for (const command of Object.values(commands)) {
        if (command.handleModalSubmit && await command.handleModalSubmit(interaction)) {
          return;
        }
      }
    }
  } catch (error) {
    console.error(`Error handling interaction:`, error);
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
