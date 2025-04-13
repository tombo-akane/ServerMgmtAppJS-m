const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, WebhookClient } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // 一意のIDを生成するために追加
const { selfIntroductionChannelId, snsShareChannelId } = require('../config.json');

// 一時データ用のディレクトリパス
const TEMP_DIR = path.join(__dirname, '..', 'db', 'temp');

// コース選択肢の例（バリデーション用ではなく、誘導用）
const COURSE_EXAMPLES = ['週1', '週3', '週5', '個別', '卒業生', 'ネット'];

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

module.exports = {
	data: new SlashCommandBuilder()
		.setName('self')
		.setDescription('自己紹介を作成・更新します'),
	
	execute: async function(interaction) {
		// 特定チャンネルでのみ実行可能にする
		if (interaction.channelId !== selfIntroductionChannelId) {
			return await interaction.reply({ 
				content: '自己紹介は <#' + selfIntroductionChannelId + '> チャンネルでのみ使用できます。', 
				ephemeral: true 
			});
		}
		
		const userId = interaction.user.id;
		const dbDir = path.join(__dirname, '..', 'db', 'self_introduction');
		const userDataPath = path.join(dbDir, `${userId}.json`);
		
		// dbディレクトリが存在するか確認し、なければ作成
		if (!fs.existsSync(dbDir)) {
			fs.mkdirSync(dbDir, { recursive: true });
		}
		
		// 既存の自己紹介があるか確認
		if (fs.existsSync(userDataPath)) {
			try {
				const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
				
				// メッセージへのリンクを作成
				const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${userData.messageId}`;
				
				// すでに自己紹介済みのユーザーには編集を促す
				return await interaction.reply({
					content: `すでに自己紹介済みです！/self-edit コマンドを使用して編集してください！\n[自己紹介メッセージを表示](${messageLink})`,
					ephemeral: true
				});
			} catch (error) {
				console.error(`Error reading user data for ${userId}:`, error);
				return await interaction.reply({
					content: 'データの読み込み中にエラーが発生しました。もう一度お試しください。',
					ephemeral: true
				});
			}
		}
		
		// Modalを作成（コース含む全ての入力項目）
		const modal = new ModalBuilder()
			.setCustomId('selfIntroModal')
			.setTitle('自己紹介フォーム');
			
		// フォームの各入力フィールドを作成
		const nameInput = new TextInputBuilder()
			.setCustomId('nameInput')
			.setLabel('名前')
			.setStyle(TextInputStyle.Short)
			.setRequired(true);
			
		const slackNameInput = new TextInputBuilder()
			.setCustomId('slackNameInput')
			.setLabel('Slack名')
			.setStyle(TextInputStyle.Short)
			.setRequired(true);
			
		// コース入力フィールドを追加（バリデーションなしの自由記述）
		const courseInput = new TextInputBuilder()
			.setCustomId('courseInput')
			.setLabel('コース（週1、週3、週5、個別、卒業生、ネットなど）')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('ご自身の所属するコースを入力してください')
			.setRequired(true);
		
		const generationInput = new TextInputBuilder()
			.setCustomId('generationInput')
			.setLabel('所属期（例: N1, S2, R3など）')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('N, S, Rのいずれかと数字の組み合わせ')
			.setRequired(true);
			
		const messageInput = new TextInputBuilder()
			.setCustomId('messageInput')
			.setLabel('ひとこと')
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);
			
		// 各フィールドをActionRowに配置
		const nameRow = new ActionRowBuilder().addComponents(nameInput);
		const slackRow = new ActionRowBuilder().addComponents(slackNameInput);
		const courseRow = new ActionRowBuilder().addComponents(courseInput);
		const genRow = new ActionRowBuilder().addComponents(generationInput);
		const msgRow = new ActionRowBuilder().addComponents(messageInput);
		
		// ActionRowをModalに追加
		modal.addComponents(nameRow, slackRow, courseRow, genRow, msgRow);
		
		// Modalを表示
		await interaction.showModal(modal);
	},

  // 編集コマンド
  editData: new SlashCommandBuilder()
    .setName('self-edit')
    .setDescription('自己紹介を編集します'),

  // 編集コマンドの実行
  editExecute: async function(interaction) {
    // 特定チャンネルでのみ実行可能にする
    if (interaction.channelId !== selfIntroductionChannelId) {
      return await interaction.reply({ 
        content: '自己紹介は <#' + selfIntroductionChannelId + '> チャンネルでのみ使用できます。', 
        ephemeral: true 
      });
    }
    
    const userId = interaction.user.id;
    const dbDir = path.join(__dirname, '..', 'db', 'self_introduction');
    const userDataPath = path.join(dbDir, `${userId}.json`);
    
    // データファイルが存在するか確認
    if (!fs.existsSync(userDataPath)) {
      await interaction.reply({
        content: '自己紹介データが見つかりません。先に `/self` コマンドで自己紹介を作成してください。',
        ephemeral: true
      });
      return;
    }
    
    try {
      // ユーザーデータを読み込む
      const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
      
      // Modal作成
      const modal = new ModalBuilder()
        .setCustomId(`editSelfIntroModal-${userId}`)
        .setTitle('自己紹介の編集');
        
      // 既存のデータをフォームに入力
      const nameInput = new TextInputBuilder()
        .setCustomId('nameInput')
        .setLabel('名前')
        .setStyle(TextInputStyle.Short)
        .setValue(userData.name || '')
        .setRequired(true);
        
      const slackNameInput = new TextInputBuilder()
        .setCustomId('slackNameInput')
        .setLabel('Slack名')
        .setStyle(TextInputStyle.Short)
        .setValue(userData.slackName || '')
        .setRequired(true);
      
      // コース入力フィールド（既存のコースをセット）
      const courseInput = new TextInputBuilder()
        .setCustomId('courseInput')
        .setLabel('コース（週1、週3、週5、個別、卒業生、ネットなど）')
        .setStyle(TextInputStyle.Short)
        .setValue(userData.course || '')
        .setPlaceholder('ご自身の所属するコースを入力してください')
        .setRequired(true);
      
      const generationInput = new TextInputBuilder()
        .setCustomId('generationInput')
        .setLabel('所属期（例: N1, S2, R3など）')
        .setStyle(TextInputStyle.Short)
        .setValue(userData.generation || '')
        .setPlaceholder('N, S, Rのいずれかと数字の組み合わせ')
        .setRequired(true);
        
      const messageInput = new TextInputBuilder()
        .setCustomId('messageInput')
        .setLabel('ひとこと')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(userData.message || '')
        .setRequired(true);
        
      // 各フィールドをActionRowに配置
      const nameRow = new ActionRowBuilder().addComponents(nameInput);
      const slackRow = new ActionRowBuilder().addComponents(slackNameInput);
      const courseRow = new ActionRowBuilder().addComponents(courseInput);
      const genRow = new ActionRowBuilder().addComponents(generationInput);
      const msgRow = new ActionRowBuilder().addComponents(messageInput);
      
      // ActionRowをModalに追加
      modal.addComponents(nameRow, slackRow, courseRow, genRow, msgRow);
      
      // Modalを表示
      await interaction.showModal(modal);
    } catch (error) {
      console.error(`Error preparing edit form for ${userId}:`, error);
      await interaction.reply({
        content: '自己紹介データの読み込み中にエラーが発生しました。もう一度お試しください。',
        ephemeral: true
      });
    }
  },
	
	// Modal送信イベントを処理するハンドラ
	handleModalSubmit: async function(interaction) {
		if (interaction.customId !== 'selfIntroModal' && !interaction.customId.startsWith('editSelfIntroModal-')) {
			return false; // このモーダルは処理しない
		}
		
		const isEdit = interaction.customId.startsWith('editSelfIntroModal-');
		const userId = isEdit ? interaction.customId.split('-')[1] : interaction.user.id;
		
		// 各フィールドの値を取得
		const name = interaction.fields.getTextInputValue('nameInput');
		const slackName = interaction.fields.getTextInputValue('slackNameInput');
		const course = interaction.fields.getTextInputValue('courseInput');
		const generation = interaction.fields.getTextInputValue('generationInput');
		const message = interaction.fields.getTextInputValue('messageInput');
		
		// 所属期の検証
		const generationRegex = /^[NSR][1-9][0-9]*$/;
		if (!generationRegex.test(generation)) {
			return await interaction.reply({
				content: '無効な所属期の形式です。「N, S, R」のいずれかと数字（1以上）の組み合わせで入力してください。例：N1, S2, R3',
				ephemeral: true
			});
		}
		
		// コースのバリデーションを削除
		
		// ユーザーデータのパスを設定
		const dbDir = path.join(__dirname, '..', 'db', 'self_introduction');
		const userDataPath = path.join(dbDir, `${userId}.json`);
		
		// dbディレクトリが存在するか確認し、なければ作成
		if (!fs.existsSync(dbDir)) {
			fs.mkdirSync(dbDir, { recursive: true });
		}

		// 一時応答を送信（処理中であることを示す）
		await interaction.deferReply({ ephemeral: true });
		
		try {
			// SNSシェア情報の確認
			let snsShareLink = '';
			const snsShareDir = path.join(__dirname, '..', 'db', 'sns_share');
			const snsSharePath = path.join(snsShareDir, `${userId}.json`);
			
			if (fs.existsSync(snsSharePath)) {
				try {
					const snsShareData = JSON.parse(fs.readFileSync(snsSharePath, 'utf8'));
					if (snsShareData.messageId) {
						snsShareLink = `- SNSシェア: https://discord.com/channels/${interaction.guildId}/${snsShareChannelId}/${snsShareData.messageId}\n`;
					}
				} catch (error) {
					console.error(`Error reading SNS share data for ${userId}:`, error);
				}
			}
			
			// 整形されたメッセージテキストを作成（改行で区切る）
			const formattedMessage = `<@${interaction.user.id}>\n` +
				`- 名前: ${name}\n` +
				`- Slack名: ${slackName}\n` +
				`- コース: ${course}\n` +
				`- 所属期: ${generation}\n` +
				`${snsShareLink}\n\n` +
				`ひとこと:\n${message}`;
			
			let oldMessageId = null;
			let userData = null;
			
			// 編集モードの場合、古いメッセージを探す
			if (isEdit && fs.existsSync(userDataPath)) {
				userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
				oldMessageId = userData.messageId;
				
				// 古いメッセージを削除
				try {
					await interaction.channel.messages.delete(oldMessageId);
				} catch (error) {
					console.error(`Error deleting old message ${oldMessageId}:`, error);
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
			
			// Webhookを削除（一時的に使用するだけ）
			await webhook.delete();
			
			// ユーザーデータを保存
			const now = new Date().toISOString();
			const newUserData = {
				userId: interaction.user.id,
				messageId: sentMessage.id,
				name: name,
				slackName: slackName,
				course: course,
				generation: generation,
				message: message,
				createdAt: isEdit ? (userData?.createdAt || now) : now,
				updatedAt: now
			};
			
			// ファイルへ保存
			fs.writeFileSync(userDataPath, JSON.stringify(newUserData, null, 2));
			
			// 完了メッセージを送信
			await interaction.editReply({
				content: isEdit ? '自己紹介を更新しました！' : '自己紹介を投稿しました！',
			});
			
			return true; // 処理完了
		} catch (error) {
			console.error('Error in self introduction processing:', error);
			await interaction.editReply({
				content: '自己紹介の処理中にエラーが発生しました。もう一度お試しください。'
			});
			return true; // エラーが発生したが処理は完了
		}
	}
};