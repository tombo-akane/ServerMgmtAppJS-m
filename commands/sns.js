const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { snsShareChannelId, selfIntroductionChannelId } = require('../config.json');

// 一時データ用のディレクトリパス
const TEMP_DIR = path.join(__dirname, '..', 'db', 'temp');

// 一時データの保存・取得・削除を行うヘルパー関数
const tempDataHelper = {
  // 一時データディレクトリの確認・作成
  ensureTempDir: function() {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  },
  
  // 一時データを保存し、一意のIDを返す
  saveData: function(data) {
    this.ensureTempDir();
    const id = crypto.randomUUID(); // uuidを生成
    const filePath = path.join(TEMP_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data));
    return id;
  },
  
  // 一時データを取得する
  getData: function(id) {
    const filePath = path.join(TEMP_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`Error reading temp data ${id}:`, error);
      return null;
    }
  },
  
  // 一時データを削除する
  removeData: function(id) {
    const filePath = path.join(TEMP_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};

// 対応するSNSのリスト（将来的に拡張しやすいようにオブジェクト形式）
const SUPPORTED_SNS = {
  'twitter': {
    name: 'X(旧Twitter)',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([^\/\?\s]+)/i
    ],
    formatUsername: (username) => `@${username}`
  },
  'instagram': {
    name: 'Instagram',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^\/\?\s]+)/i
    ],
    formatUsername: (username) => `@${username}`
  },
  'tiktok': {
    name: 'TikTok',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([^\/\?\s]+)/i,
      /(?:https?:\/\/)?(?:www\.)?vm\.tiktok\.com\/([^\/\?\s]+)/i
    ],
    formatUsername: (username) => `@${username}`
  },
  'youtube': {
    name: 'YouTube',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:channel\/|c\/|user\/|@)([^\/\?\s]+)/i
    ],
    formatUsername: (username) => username
  },
  'github': {
    name: 'GitHub',
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/\?\s]+)/i
    ],
    formatUsername: (username) => username
  }
};

// URLからSNSを判別する関数
function detectSnsFromUrl(url) {
  if (!url || url.trim() === '') return null;
  
  for (const [key, sns] of Object.entries(SUPPORTED_SNS)) {
    for (const pattern of sns.patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return {
          type: key,
          name: sns.name,
          username: match[1],
          url: url,
          formattedUsername: sns.formatUsername(match[1])
        };
      }
    }
  }
  
  return {
    type: 'unknown',
    name: 'その他',
    username: '',
    url: url,
    formattedUsername: ''
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sns')
    .setDescription('SNSのリンクを共有します'),
  
  // SNS共有ボタンを作成する関数
  createSnsButton: function() {
    return new ButtonBuilder()
      .setCustomId('sns_share_button')
      .setLabel('SNSリンクを追加/編集する')
      .setStyle(ButtonStyle.Primary);
  },
  
  // ボタンコンポーネントの行を作成する関数
  createSnsButtonRow: function() {
    const buttonRow = new ActionRowBuilder()
      .addComponents(this.createSnsButton());
    return buttonRow;
  },
  
  // ボタンイベントを処理するハンドラ
  handleButton: async function(interaction) {
    if (interaction.customId !== 'sns_share_button') {
      return false; // このボタンは処理しない
    }
    
    // 特定チャンネルでのみ実行可能にする
    if (interaction.channelId !== snsShareChannelId) {
      return await interaction.reply({ 
        content: 'SNS共有は <#' + snsShareChannelId + '> チャンネルでのみ使用できます。', 
        ephemeral: true 
      });
    }
    
    const userId = interaction.user.id;
    const selfIntroDir = path.join(__dirname, '..', 'db', 'self_introduction');
    const userDataPath = path.join(selfIntroDir, `${userId}.json`);
    
    // 自己紹介データがあるか確認
    if (!fs.existsSync(userDataPath)) {
      return await interaction.reply({
        content: '先に <#' + selfIntroductionChannelId + '> で自己紹介をしてください！',
        ephemeral: true
      });
    }
    
    // SNSデータのパスを設定
    const snsDbDir = path.join(__dirname, '..', 'db', 'sns_share');
    const snsUserDataPath = path.join(snsDbDir, `${userId}.json`);
    
    // 既存のSNS共有データがあるか確認
    const isEdit = fs.existsSync(snsUserDataPath);
    let existingData = {};
    
    // Modalを作成
    const modal = new ModalBuilder()
      .setCustomId(isEdit ? 'snsEditModal' : 'snsShareModal')
      .setTitle(isEdit ? 'SNS共有編集フォーム' : 'SNS共有フォーム');
      
    // フォームの各入力フィールドを作成
    const snsInput1 = new TextInputBuilder()
      .setCustomId('snsInput1')
      .setLabel('SNS URL 1 (必須)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://twitter.com/username など')
      .setRequired(true);
      
    const snsInput2 = new TextInputBuilder()
      .setCustomId('snsInput2')
      .setLabel('SNS URL 2 (任意)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://instagram.com/username など')
      .setRequired(false);
      
    const snsInput3 = new TextInputBuilder()
      .setCustomId('snsInput3')
      .setLabel('SNS URL 3 (任意)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://tiktok.com/@username など')
      .setRequired(false);
    
    const snsInput4 = new TextInputBuilder()
      .setCustomId('snsInput4')
      .setLabel('SNS URL 4 (任意)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://youtube.com/channel/xxxx など')
      .setRequired(false);
      
    const snsInput5 = new TextInputBuilder()
      .setCustomId('snsInput5')
      .setLabel('SNS URL 5 (任意)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://github.com/username など')
      .setRequired(false);
    
    // 既存のデータがあれば読み込み
    if (isEdit) {
      try {
        existingData = JSON.parse(fs.readFileSync(snsUserDataPath, 'utf8'));
        
        // 既存のデータを使ってフォームを事前入力
        if (existingData.snsUrls && existingData.snsUrls.length > 0) {
          if (existingData.snsUrls[0]) snsInput1.setValue(existingData.snsUrls[0]);
          if (existingData.snsUrls[1]) snsInput2.setValue(existingData.snsUrls[1]);
          if (existingData.snsUrls[2]) snsInput3.setValue(existingData.snsUrls[2]);
          if (existingData.snsUrls[3]) snsInput4.setValue(existingData.snsUrls[3]);
          if (existingData.snsUrls[4]) snsInput5.setValue(existingData.snsUrls[4]);
        }
      } catch (error) {
        console.error(`Error reading SNS data for ${userId}:`, error);
      }
    }
      
    // 各フィールドをActionRowに配置
    const row1 = new ActionRowBuilder().addComponents(snsInput1);
    const row2 = new ActionRowBuilder().addComponents(snsInput2);
    const row3 = new ActionRowBuilder().addComponents(snsInput3);
    const row4 = new ActionRowBuilder().addComponents(snsInput4);
    const row5 = new ActionRowBuilder().addComponents(snsInput5);
    
    // ActionRowをModalに追加
    modal.addComponents(row1, row2, row3, row4, row5);
    
    // Modalを表示
    await interaction.showModal(modal);
    return true;
  },
  
  execute: async function(interaction) {
    // 特定チャンネルでのみ実行可能にする
    if (interaction.channelId !== snsShareChannelId) {
      return await interaction.reply({ 
        content: 'SNS共有は <#' + snsShareChannelId + '> チャンネルでのみ使用できます。', 
        ephemeral: true 
      });
    }
    
    const userId = interaction.user.id;
    const selfIntroDir = path.join(__dirname, '..', 'db', 'self_introduction');
    const userDataPath = path.join(selfIntroDir, `${userId}.json`);
    
    // 自己紹介データがあるか確認
    if (!fs.existsSync(userDataPath)) {
      return await interaction.reply({
        content: '先に <#' + selfIntroductionChannelId + '> で自己紹介をしてください！',
        ephemeral: true
      });
    }
    
    // Modalを作成
    const modal = new ModalBuilder()
      .setCustomId('snsShareModal')
      .setTitle('SNS共有フォーム');
      
    // フォームの各入力フィールドを作成
    const snsInput1 = new TextInputBuilder()
      .setCustomId('snsInput1')
      .setLabel('SNS URL 1 (必須)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://twitter.com/username など')
      .setRequired(true);
      
    const snsInput2 = new TextInputBuilder()
      .setCustomId('snsInput2')
      .setLabel('SNS URL 2 (任意)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://instagram.com/username など')
      .setRequired(false);
      
    const snsInput3 = new TextInputBuilder()
      .setCustomId('snsInput3')
      .setLabel('SNS URL 3 (任意)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://tiktok.com/@username など')
      .setRequired(false);
    
    const snsInput4 = new TextInputBuilder()
      .setCustomId('snsInput4')
      .setLabel('SNS URL 4 (任意)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://youtube.com/channel/xxxx など')
      .setRequired(false);
      
    const snsInput5 = new TextInputBuilder()
      .setCustomId('snsInput5')
      .setLabel('SNS URL 5 (任意)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://github.com/username など')
      .setRequired(false);
      
    // 各フィールドをActionRowに配置
    const row1 = new ActionRowBuilder().addComponents(snsInput1);
    const row2 = new ActionRowBuilder().addComponents(snsInput2);
    const row3 = new ActionRowBuilder().addComponents(snsInput3);
    const row4 = new ActionRowBuilder().addComponents(snsInput4);
    const row5 = new ActionRowBuilder().addComponents(snsInput5);
    
    // ActionRowをModalに追加
    modal.addComponents(row1, row2, row3, row4, row5);
    
    // ユーザーIDを保存（編集用）
    const snsUserId = interaction.user.id;
    
    // SNS共有データのパスを設定
    const snsDbDir = path.join(__dirname, '..', 'db', 'sns_share');
    const snsUserDataPath = path.join(snsDbDir, `${snsUserId}.json`);
    
    // 既存のデータがあれば読み込み
    let existingData = {};
    if (fs.existsSync(snsUserDataPath)) {
      try {
        existingData = JSON.parse(fs.readFileSync(snsUserDataPath, 'utf8'));
        
        // 既存のデータを使ってフォームを事前入力
        if (existingData.snsUrls && existingData.snsUrls.length > 0) {
          if (existingData.snsUrls[0]) snsInput1.setValue(existingData.snsUrls[0]);
          if (existingData.snsUrls[1]) snsInput2.setValue(existingData.snsUrls[1]);
          if (existingData.snsUrls[2]) snsInput3.setValue(existingData.snsUrls[2]);
          if (existingData.snsUrls[3]) snsInput4.setValue(existingData.snsUrls[3]);
          if (existingData.snsUrls[4]) snsInput5.setValue(existingData.snsUrls[4]);
        }
      } catch (error) {
        console.error(`Error reading SNS data for ${snsUserId}:`, error);
      }
    }
    
    // Modalを表示
    await interaction.showModal(modal);
  },
  
  // 編集コマンド
  editData: new SlashCommandBuilder()
    .setName('sns-edit')
    .setDescription('SNS共有情報を編集します'),
  
  // 編集コマンドの実行
  editExecute: async function(interaction) {
    // 特定チャンネルでのみ実行可能にする
    if (interaction.channelId !== snsShareChannelId) {
      return await interaction.reply({ 
        content: 'SNS共有は <#' + snsShareChannelId + '> チャンネルでのみ使用できます。', 
        ephemeral: true 
      });
    }
    
    const userId = interaction.user.id;
    const selfIntroDir = path.join(__dirname, '..', 'db', 'self_introduction');
    const userDataPath = path.join(selfIntroDir, `${userId}.json`);
    
    // 自己紹介データがあるか確認
    if (!fs.existsSync(userDataPath)) {
      return await interaction.reply({
        content: '先に <# ' + selfIntroductionChannelId + '> で自己紹介をしてください！',
        ephemeral: true
      });
    }
    
    const snsDbDir = path.join(__dirname, '..', 'db', 'sns_share');
    const snsUserDataPath = path.join(snsDbDir, `${userId}.json`);
    
    // SNS共有データがあるか確認
    if (!fs.existsSync(snsUserDataPath)) {
      return await interaction.reply({
        content: 'SNS共有データが見つかりません。先に `/sns` コマンドでSNS情報を共有してください。',
        ephemeral: true
      });
    }
    
    try {
      // 既存のデータを読み込む
      const snsData = JSON.parse(fs.readFileSync(snsUserDataPath, 'utf8'));
      
      // Modalを作成
      const modal = new ModalBuilder()
        .setCustomId('snsEditModal')
        .setTitle('SNS共有編集フォーム');
        
      // フォームの各入力フィールドを作成
      const snsInput1 = new TextInputBuilder()
        .setCustomId('snsInput1')
        .setLabel('SNS URL 1 (必須)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://twitter.com/username など')
        .setRequired(true);
        
      const snsInput2 = new TextInputBuilder()
        .setCustomId('snsInput2')
        .setLabel('SNS URL 2 (任意)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://instagram.com/username など')
        .setRequired(false);
        
      const snsInput3 = new TextInputBuilder()
        .setCustomId('snsInput3')
        .setLabel('SNS URL 3 (任意)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://tiktok.com/@username など')
        .setRequired(false);
      
      const snsInput4 = new TextInputBuilder()
        .setCustomId('snsInput4')
        .setLabel('SNS URL 4 (任意)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://youtube.com/channel/xxxx など')
        .setRequired(false);
        
      const snsInput5 = new TextInputBuilder()
        .setCustomId('snsInput5')
        .setLabel('SNS URL 5 (任意)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://github.com/username など')
        .setRequired(false);
      
      // 既存のデータを設定
      if (snsData.snsUrls && snsData.snsUrls.length > 0) {
        if (snsData.snsUrls[0]) snsInput1.setValue(snsData.snsUrls[0]);
        if (snsData.snsUrls[1]) snsInput2.setValue(snsData.snsUrls[1]);
        if (snsData.snsUrls[2]) snsInput3.setValue(snsData.snsUrls[2]);
        if (snsData.snsUrls[3]) snsInput4.setValue(snsData.snsUrls[3]);
        if (snsData.snsUrls[4]) snsInput5.setValue(snsData.snsUrls[4]);
      }
      
      // 各フィールドをActionRowに配置
      const row1 = new ActionRowBuilder().addComponents(snsInput1);
      const row2 = new ActionRowBuilder().addComponents(snsInput2);
      const row3 = new ActionRowBuilder().addComponents(snsInput3);
      const row4 = new ActionRowBuilder().addComponents(snsInput4);
      const row5 = new ActionRowBuilder().addComponents(snsInput5);
      
      // ActionRowをModalに追加
      modal.addComponents(row1, row2, row3, row4, row5);
      
      // Modalを表示
      await interaction.showModal(modal);
      
    } catch (error) {
      console.error(`Error preparing edit form for ${userId}:`, error);
      await interaction.reply({
        content: 'SNS共有データの読み込み中にエラーが発生しました。もう一度お試しください。',
        ephemeral: true
      });
    }
  },
  
  // Modal送信イベントを処理するハンドラ
  handleModalSubmit: async function(interaction) {
    if (interaction.customId !== 'snsShareModal' && interaction.customId !== 'snsEditModal') {
      return false; // このモーダルは処理しない
    }
    
    const isEdit = interaction.customId === 'snsEditModal';
    const userId = interaction.user.id;
    
    // 自己紹介データの確認
    const selfIntroDir = path.join(__dirname, '..', 'db', 'self_introduction');
    const userDataPath = path.join(selfIntroDir, `${userId}.json`);
    
    if (!fs.existsSync(userDataPath)) {
      await interaction.reply({
        content: '先に <# ' + selfIntroductionChannelId + '> で自己紹介をしてください！',
        ephemeral: true
      });
      return true;
    }
    
    // 各フィールドの値を取得
    const snsUrls = [
      interaction.fields.getTextInputValue('snsInput1'),
      interaction.fields.getTextInputValue('snsInput2') || '',
      interaction.fields.getTextInputValue('snsInput3') || '',
      interaction.fields.getTextInputValue('snsInput4') || '',
      interaction.fields.getTextInputValue('snsInput5') || ''
    ].filter(url => url.trim() !== ''); // 空のURLを除外
    
    // 一時応答を送信
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // SNSを検出して整理
      const detectedSnsList = snsUrls.map(url => detectSnsFromUrl(url))
                                    .filter(sns => sns !== null);
      
      // 自己紹介データを読み込む
      const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
      const messageLink = `https://discord.com/channels/${interaction.guildId}/${selfIntroductionChannelId}/${userData.messageId}`;
      
      // 整形されたSNS共有メッセージを作成
      let formattedMessage = `<@${interaction.user.id}>\n`;
      formattedMessage += `[>>自己紹介を見る](${messageLink})\n\n`;
      
      // 各SNSのリンクを追加
      detectedSnsList.forEach(sns => {
        if (sns.type === 'unknown') {
          formattedMessage += `その他: [${sns.url}](<${sns.url}>)\n`;
        } else {
          formattedMessage += `${sns.name}: [${sns.formattedUsername}](<${sns.url}>)\n`;
        }
      });
      
      // SNS共有データのディレクトリを確認・作成
      const snsDbDir = path.join(__dirname, '..', 'db', 'sns_share');
      if (!fs.existsSync(snsDbDir)) {
        fs.mkdirSync(snsDbDir, { recursive: true });
      }
      
      // ユーザーのSNSデータパス
      const snsUserDataPath = path.join(snsDbDir, `${userId}.json`);
      
      // 古いメッセージの削除（編集モードの場合）
      let oldMessageId = null;
      if (isEdit && fs.existsSync(snsUserDataPath)) {
        try {
          const oldData = JSON.parse(fs.readFileSync(snsUserDataPath, 'utf8'));
          oldMessageId = oldData.messageId;
          
          if (oldMessageId) {
            try {
              await interaction.channel.messages.delete(oldMessageId);
            } catch (error) {
              console.error(`Error deleting old message ${oldMessageId}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error handling old message for ${userId}:`, error);
        }
      }
      
      // 新しいメッセージをWebhookで送信
      const webhook = await interaction.channel.createWebhook({
        name: interaction.user.displayName,
        avatar: interaction.user.displayAvatarURL({ dynamic: true })
      });
      
      const sentMessage = await webhook.send({
        content: formattedMessage
      });
      
      // Webhookを削除
      await webhook.delete();
      
      // SNS共有データを保存
      const now = new Date().toISOString();
      const snsData = {
        userId: interaction.user.id,
        messageId: sentMessage.id,
        snsUrls: snsUrls,
        detectedSns: detectedSnsList,
        selfIntroLink: messageLink,
        createdAt: isEdit && fs.existsSync(snsUserDataPath) ? 
                 JSON.parse(fs.readFileSync(snsUserDataPath, 'utf8')).createdAt || now : now,
        updatedAt: now
      };
      
      // ファイルへ保存
      fs.writeFileSync(snsUserDataPath, JSON.stringify(snsData, null, 2));
      
      // 完了メッセージを送信
      await interaction.editReply({
        content: isEdit ? 'SNS共有情報を更新しました！' : 'SNS共有情報を投稿しました！',
      });
      
      return true; // 処理完了
    } catch (error) {
      console.error('Error in SNS sharing processing:', error);
      await interaction.editReply({
        content: 'SNS共有の処理中にエラーが発生しました。もう一度お試しください。'
      });
      return true; // エラーが発生したが処理は完了
    }
  }
};