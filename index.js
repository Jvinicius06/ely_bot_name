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

    // Constrói o nickname com limite de 32 caracteres (limite do Discord)
    let newNickname = character_name;
    const MAX_LENGTH = 32;

    // Formato otimizado: [fixedID][charID] Nome
    if (character_fixed_id && character_id) {
      const prefix = `${character_fixed_id}[${character_id}] `;
      const maxNameLength = MAX_LENGTH - prefix.length;
      const truncatedName = character_name.length > maxNameLength
        ? character_name.substring(0, maxNameLength)
        : character_name;
      newNickname = `${prefix}${truncatedName}`;
    } else if (character_fixed_id) {
      const prefix = `${character_fixed_id} `;
      const maxNameLength = MAX_LENGTH - prefix.length;
      const truncatedName = character_name.length > maxNameLength
        ? character_name.substring(0, maxNameLength)
        : character_name;
      newNickname = `${prefix}${truncatedName}`;
    } else if (character_id) {
      const prefix = `[${character_id}] `;
      const maxNameLength = MAX_LENGTH - prefix.length;
      const truncatedName = character_name.length > maxNameLength
        ? character_name.substring(0, maxNameLength)
        : character_name;
      newNickname = `${prefix}${truncatedName}`;
    } else {
      // Apenas o nome, limitado a 32 caracteres
      newNickname = character_name.length > MAX_LENGTH
        ? character_name.substring(0, MAX_LENGTH)
        : character_name;
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

app.post('/api/check-role', authenticateRequest, async (req, res) => {
  try {
    if (!isDiscordReady) {
      return res.status(503).json({
        success: false,
        error: 'Bot do Discord ainda não está pronto',
      });
    }

    let { discord_id, role_id, role_name } = req.body;

    // Converte números para strings
    if (typeof discord_id === 'number') discord_id = String(discord_id);
    if (typeof role_id === 'number') role_id = String(role_id);

    if (!discord_id) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetro obrigatório: discord_id',
      });
    }

    if (!role_id && !role_name) {
      return res.status(400).json({
        success: false,
        error: 'Informe role_id ou role_name',
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

    let hasRole = false;
    let foundRole = null;

    // Verifica por ID do cargo
    if (role_id) {
      hasRole = member.roles.cache.has(role_id);
      if (hasRole) {
        foundRole = member.roles.cache.get(role_id);
      }
    }
    // Verifica por nome do cargo (case insensitive)
    else if (role_name) {
      foundRole = member.roles.cache.find(
        role => role.name.toLowerCase() === role_name.toLowerCase()
      );
      hasRole = !!foundRole;
    }

    console.log(`🔍 Verificação de cargo: ${member.user.tag} - Cargo: ${role_id || role_name} - Tem: ${hasRole}`);

    return res.status(200).json({
      success: true,
      data: {
        discord_id: member.id,
        discord_username: member.user.username,
        has_role: hasRole,
        role: foundRole ? {
          id: foundRole.id,
          name: foundRole.name,
          color: foundRole.hexColor,
        } : null,
        all_roles: member.roles.cache.map(role => ({
          id: role.id,
          name: role.name,
        })).filter(role => role.name !== '@everyone'),
      },
    });
  } catch (error) {
    console.error('❌ Erro ao verificar cargo:', error);

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao verificar cargo',
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
  console.log(`   POST http://localhost:${PORT}/api/check-role`);
});
