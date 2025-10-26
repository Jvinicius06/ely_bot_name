import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!API_SECRET || !DISCORD_TOKEN || !GUILD_ID) {
  console.error('❌ Erro: Variáveis de ambiente faltando!');
  console.error('Certifique-se de configurar: API_SECRET, DISCORD_TOKEN, GUILD_ID');
  process.exit(1);
}

app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

let isDiscordReady = false;

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  isDiscordReady = true;
});

client.on('error', (error) => {
  console.error('❌ Erro no cliente Discord:', error);
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('❌ Erro ao fazer login no Discord:', error);
  process.exit(1);
});

function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'Token de autenticação não fornecido'
    });
  }

  const token = authHeader.replace('Bearer ', '');

  if (token !== API_SECRET) {
    return res.status(403).json({
      success: false,
      error: 'Token de autenticação inválido'
    });
  }

  next();
}

app.post('/api/update-nickname', authenticateRequest, async (req, res) => {
  try {
    if (!isDiscordReady) {
      return res.status(503).json({
        success: false,
        error: 'Bot do Discord ainda não está pronto',
      });
    }

    let { discord_id, character_name, character_id, character_fixed_id } = req.body;

    // Converte números para strings
    if (typeof discord_id === 'number') discord_id = String(discord_id);
    if (typeof character_id === 'number') character_id = String(character_id);
    if (typeof character_fixed_id === 'number') character_fixed_id = String(character_fixed_id);
    if (typeof character_name === 'number') character_name = String(character_name);

    if (!discord_id || !character_name) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: discord_id e character_name',
      });
    }

    const guild = await client.guilds.fetch(GUILD_ID);

    if (!guild) {
      return res.status(500).json({
        success: false,
        error: 'Servidor Discord não encontrado',
      });
    }

    const member = await guild.members.fetch(discord_id).catch(() => null);

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Membro não encontrado no servidor Discord',
      });
    }

    let newNickname = character_name;

    if (character_id && character_fixed_id) {
      newNickname = `${character_name} [${character_id}] [${character_fixed_id}]`;
    } else if (character_id) {
      newNickname = `${character_name} [${character_id}]`;
    } else if (character_fixed_id) {
      newNickname = `${character_name} [${character_fixed_id}]`;
    }

    try {
      await member.edit({ nick: newNickname });

      console.log(`✅ Nickname atualizado: ${member.user.tag} -> ${newNickname}`);

      return res.status(200).json({
        success: true,
        message: 'Nickname atualizado com sucesso',
        data: {
          discord_id: member.id,
          discord_username: member.user.username,
          new_nickname: newNickname,
        },
      });
    } catch (nicknameError) {
      if (nicknameError.code === 50013) {
        console.warn(`⚠️  Sem permissão para alterar nickname de: ${member.user.tag}`);

        return res.status(200).json({
          success: true,
          message: 'Usuário possui cargo acima do bot, nickname não alterado',
          data: {
            discord_id: member.id,
            discord_username: member.user.username,
            skipped: true,
            reason: 'Falta de permissão (cargo acima do bot)',
          },
        });
      }

      throw nicknameError;
    }
  } catch (error) {
    console.error('❌ Erro ao processar requisição:', error);

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar requisição',
      details: error.message,
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'online',
    discord_ready: isDiscordReady,
    bot_username: isDiscordReady ? client.user.tag : null,
  });
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint não encontrado',
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor HTTP rodando na porta ${PORT}`);
  console.log(`📡 Endpoints disponíveis:`);
  console.log(`   GET  http://localhost:${PORT}/api/health`);
  console.log(`   POST http://localhost:${PORT}/api/update-nickname`);
});
