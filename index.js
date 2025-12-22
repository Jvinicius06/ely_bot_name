import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Função para formatar a hora atual
function getFormattedTime() {
  const now = new Date();
  return now.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!API_SECRET || !DISCORD_TOKEN || !GUILD_ID || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error(`[${getFormattedTime()}] ❌ Erro: Variáveis de ambiente faltando!`);
  console.error(`[${getFormattedTime()}] Certifique-se de configurar: API_SECRET, DISCORD_TOKEN, GUILD_ID, DB_USER, DB_PASSWORD, DB_NAME`);
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

// Sistema de cache em memória para nicknames processados
const nicknameCache = new Map(); // discord_id -> { nickname, character_name, fixed_id, cid, last_updated }
let autoUpdateInterval = null;
const AUTO_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hora em millisegundos

// Configuração para rate limiting
const BATCH_SIZE = 3;
const DELAY_BETWEEN_BATCHES = 1000;

// Função para criar conexão com o banco de dados
async function createDbConnection() {
  try {
    const connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      port: DB_PORT || 3306,
      password: DB_PASSWORD,
      database: DB_NAME,
      charset: 'utf8mb4'
    });
    return connection;
  } catch (error) {
    console.error(`[${getFormattedTime()}] ❌ Erro ao conectar no banco de dados:`, error);
    throw error;
  }
}

// Função principal de atualização de nicknames
async function updateAllNicknames(onlyNew = false) {
  if (!isDiscordReady) {
    console.log(`[${getFormattedTime()}] ⚠️  Discord não está pronto, pulando atualização`);
    return { success: false, error: 'Discord não está pronto' };
  }

  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    console.error(`[${getFormattedTime()}] ❌ Servidor Discord não encontrado`);
    return { success: false, error: 'Servidor Discord não encontrado' };
  }

  let connection;
  try {
    console.log(`[${getFormattedTime()}] 🔗 Conectando ao banco de dados...`);
    connection = await createDbConnection();
    console.log(`[${getFormattedTime()}] ✅ Conectado ao banco de dados com sucesso`);

    const query = `
      SELECT 
        REPLACE(u.discord, 'discord:', '') as discord,
        u.username,
        CONCAT(
          JSON_UNQUOTE(JSON_EXTRACT(p.charinfo, '$.firstname')), 
          ' ', 
          JSON_UNQUOTE(JSON_EXTRACT(p.charinfo, '$.lastname'))
        ) as name,
        p.cid,
        p.id as player_id,
        CONCAT('EL', cf.id) as fixed_id
      FROM users u
      LEFT JOIN players p ON u.userId = p.userId
      LEFT JOIN character_fixed_ids cf ON p.citizenid = cf.citizenid
      WHERE u.discord IS NOT NULL 
        AND u.discord != ''
        AND u.discord LIKE 'discord:%'
        AND p.charinfo IS NOT NULL
        AND JSON_EXTRACT(p.charinfo, '$.firstname') IS NOT NULL
        AND JSON_EXTRACT(p.charinfo, '$.lastname') IS NOT NULL
      ORDER BY u.discord, p.id ASC
    `;

    console.log(`[${getFormattedTime()}] 📊 Executando consulta no banco de dados...`);
    const [rows] = await connection.execute(query);
    console.log(`[${getFormattedTime()}] 📈 Encontrados ${rows.length} registros na consulta`);
    
    if (rows.length === 0) {
      return {
        success: true,
        message: 'Nenhum usuário encontrado para atualizar',
        stats: { processed: 0, updated: 0, errors: 0, skipped: 0 }
      };
    }

    // Agrupar por discord ID e pegar apenas o personagem com menor ID
    console.log(`[${getFormattedTime()}] 🔄 Agrupando usuários por Discord ID...`);
    const userMap = new Map();
    rows.forEach(row => {
      if (!userMap.has(row.discord) || row.player_id < userMap.get(row.discord).player_id) {
        userMap.set(row.discord, row);
      }
    });

    // Filtrar apenas usuários novos ou com mudanças se solicitado
    let usersToProcess = Array.from(userMap.entries());
    if (onlyNew) {
      usersToProcess = usersToProcess.filter(([discordId, userData]) => {
        const cached = nicknameCache.get(discordId);
        if (!cached) return true; // Usuário novo
        
        // Verificar se houve mudanças
        const currentNickname = userData.fixed_id ? 
          `${userData.fixed_id} ${userData.name}` : 
          userData.cid ? `[${userData.cid}] ${userData.name}` : userData.name;
        
        return cached.nickname !== currentNickname || 
               cached.character_name !== userData.name ||
               cached.fixed_id !== userData.fixed_id ||
               cached.cid !== userData.cid;
      });
      
      console.log(`[${getFormattedTime()}] 🔍 Filtrados ${usersToProcess.length} usuários com mudanças`);
    }

    console.log(`[${getFormattedTime()}] 👥 ${usersToProcess.length} usuários para processar`);
    
    if (usersToProcess.length === 0) {
      return {
        success: true,
        message: 'Nenhuma mudança detectada',
        stats: { processed: 0, updated: 0, errors: 0, skipped: 0 }
      };
    }

    console.log(`[${getFormattedTime()}] 🚀 Iniciando atualização (processamento em batches)...`);

    const stats = { processed: 0, updated: 0, errors: 0, skipped: 0 };
    const results = [];
    
    // Função para processar um usuário
    async function processUser([discordId, userData]) {
      stats.processed++;
      
      try {
        const member = await guild.members.fetch(discordId).catch(() => null);
        
        if (!member) {
          stats.skipped++;
          return {
            discord_id: discordId,
            status: 'skipped',
            reason: 'Membro não encontrado no servidor'
          };
        }

        // Construir o nickname (sempre atualizar, sem verificar se já está correto)
        let newNickname = userData.name;
        const MAX_LENGTH = 32;

        if (userData.fixed_id) {
          const prefix = `${userData.fixed_id} `;
          const maxNameLength = MAX_LENGTH - prefix.length;
          const truncatedName = userData.name.length > maxNameLength
            ? userData.name.substring(0, maxNameLength)
            : userData.name;
          newNickname = `${prefix}${truncatedName}`;
        } else if (userData.cid) {
          const prefix = `[${userData.cid}] `;
          const maxNameLength = MAX_LENGTH - prefix.length;
          const truncatedName = userData.name.length > maxNameLength
            ? userData.name.substring(0, maxNameLength)
            : userData.name;
          newNickname = `${prefix}${truncatedName}`;
        } else {
          newNickname = userData.name.length > MAX_LENGTH
            ? userData.name.substring(0, MAX_LENGTH)
            : userData.name;
        }

        try {
          await member.edit({ nick: newNickname });
          stats.updated++;
          
          // Salvar no cache
          nicknameCache.set(discordId, {
            nickname: newNickname,
            character_name: userData.name,
            fixed_id: userData.fixed_id,
            cid: userData.cid,
            last_updated: Date.now()
          });
          
          console.log(`[${getFormattedTime()}] ✅ ${member.user.username} -> ${newNickname}`);
          
          return {
            discord_id: discordId,
            discord_username: member.user.username,
            old_nickname: member.nickname,
            new_nickname: newNickname,
            character_name: userData.name,
            fixed_id: userData.fixed_id,
            cid: userData.cid,
            status: 'updated'
          };

        } catch (nicknameError) {
          if (nicknameError.code === 50013) {
            stats.skipped++;
            console.warn(`[${getFormattedTime()}] ⚠️  ${member.user.username} - Sem permissão`);
            
            return {
              discord_id: discordId,
              discord_username: member.user.username,
              status: 'skipped',
              reason: 'Falta de permissão (cargo acima do bot)'
            };
          } else if (nicknameError.code === 429) {
            console.warn(`[${getFormattedTime()}] ⏱️  Rate limit atingido, aguardando...`);
            await new Promise(resolve => setTimeout(resolve, nicknameError.retry_after * 1000 || 5000));
            throw nicknameError;
          } else {
            stats.errors++;
            console.error(`[${getFormattedTime()}] ❌ Erro ${member.user.username}:`, nicknameError.message);
            
            return {
              discord_id: discordId,
              discord_username: member.user.username,
              status: 'error',
              reason: nicknameError.message
            };
          }
        }

      } catch (memberError) {
        stats.errors++;
        console.error(`[${getFormattedTime()}] ❌ Erro ao processar ${discordId}:`, memberError.message);
        
        return {
          discord_id: discordId,
          status: 'error',
          reason: memberError.message
        };
      }
    }

    // Processar em batches
    for (let i = 0; i < usersToProcess.length; i += BATCH_SIZE) {
      const batch = usersToProcess.slice(i, i + BATCH_SIZE);
      
      console.log(`[${getFormattedTime()}] 📦 Processando batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(usersToProcess.length / BATCH_SIZE)} (${batch.length} usuários)`);
      
      try {
        const batchResults = await Promise.all(batch.map(processUser));
        results.push(...batchResults);
        
        if (i + BATCH_SIZE < usersToProcess.length) {
          console.log(`[${getFormattedTime()}] ⏳ Aguardando ${DELAY_BETWEEN_BATCHES}ms antes do próximo batch...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
        
      } catch (batchError) {
        console.error(`[${getFormattedTime()}] ❌ Erro no batch:`, batchError.message);
      }
    }

    console.log(`[${getFormattedTime()}] ✅ Processo concluído!`);
    console.log(`[${getFormattedTime()}] 📊 Resultado: ${stats.updated} atualizados, ${stats.skipped} ignorados, ${stats.errors} erros`);
    console.log(`[${getFormattedTime()}] 💾 Cache: ${nicknameCache.size} usuários em memória`);

    return {
      success: true,
      message: 'Atualização concluída',
      stats,
      results: results.slice(0, 50)
    };

  } finally {
    if (connection) {
      console.log(`[${getFormattedTime()}] 🔌 Desconectando do banco de dados...`);
      await connection.end();
    }
  }
}

client.once('ready', async () => {
  console.log(`[${getFormattedTime()}] ✅ Bot conectado como ${client.user.tag}`);
  isDiscordReady = true;
  
  // Primeira execução ao iniciar (completa)
  console.log(`[${getFormattedTime()}] 🔄 Executando primeira atualização completa...`);
  try {
    await updateAllNicknames(false); // false = atualizar todos
  } catch (error) {
    console.error(`[${getFormattedTime()}] ❌ Erro na primeira atualização:`, error.message);
  }
  
  // Configurar timer para atualização automática a cada hora
  console.log(`[${getFormattedTime()}] ⏰ Configurando atualização automática a cada ${AUTO_UPDATE_INTERVAL / (60 * 1000)} minutos`);
  autoUpdateInterval = setInterval(async () => {
    console.log(`[${getFormattedTime()}] 🔄 Iniciando atualização automática (apenas mudanças)...`);
    try {
      await updateAllNicknames(true); // true = apenas novos/mudanças
    } catch (error) {
      console.error(`[${getFormattedTime()}] ❌ Erro na atualização automática:`, error.message);
    }
  }, AUTO_UPDATE_INTERVAL);
});

client.on('error', (error) => {
  console.error(`[${getFormattedTime()}] ❌ Erro no cliente Discord:`, error);
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error(`[${getFormattedTime()}] ❌ Erro ao fazer login no Discord:`, error);
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
    // if (character_fixed_id && character_id) {
    //   const prefix = `${character_fixed_id}[${character_id}] `;
    //   const maxNameLength = MAX_LENGTH - prefix.length;
    //   const truncatedName = character_name.length > maxNameLength
    //     ? character_name.substring(0, maxNameLength)
    //     : character_name;
    //   newNickname = `${prefix}${truncatedName}`;
    // } else 
      if (character_fixed_id) {
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

      console.log(`[${getFormattedTime()}] ✅ Nickname atualizado: ${member.user.tag} -> ${newNickname}`);

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
        console.warn(`[${getFormattedTime()}] ⚠️  Sem permissão para alterar nickname de: ${member.user.tag}`);

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
    console.error(`[${getFormattedTime()}] ❌ Erro ao processar requisição:`, error);

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

    console.log(`[${getFormattedTime()}] 🔍 Verificação de cargo: ${member.user.tag} - Cargo: ${role_id || role_name} - Tem: ${hasRole}`);

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
    console.error(`[${getFormattedTime()}] ❌ Erro ao verificar cargo:`, error);

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao verificar cargo',
      details: error.message,
    });
  }
});

app.post('/api/update-all-nicknames', authenticateRequest, async (req, res) => {
  try {
    if (!isDiscordReady) {
      return res.status(503).json({
        success: false,
        error: 'Bot do Discord ainda não está pronto',
      });
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      return res.status(500).json({
        success: false,
        error: 'Servidor Discord não encontrado',
      });
    }

    let connection;
    try {
      console.log(`[${getFormattedTime()}] 🔗 Conectando ao banco de dados...`);
      connection = await createDbConnection();
      console.log(`[${getFormattedTime()}] ✅ Conectado ao banco de dados com sucesso`);

      // Query para buscar todos os usuários com seus personagens e IDs fixos
      const query = `
        SELECT 
          u.discord,
          u.username,
          p.name,
          p.cid,
          p.id as player_id,
          CONCAT('EL', cf.id) as fixed_id
        FROM users u
        LEFT JOIN players p ON u.userId = p.userId
        LEFT JOIN character_fixed_ids cf ON p.citizenid = cf.citizenid
        WHERE u.discord IS NOT NULL 
          AND u.discord != ''
          AND p.name IS NOT NULL
        ORDER BY u.discord, p.id ASC
      `;

      console.log(`[${getFormattedTime()}] 📊 Executando consulta no banco de dados...`);
      const [rows] = await connection.execute(query);
      console.log(`[${getFormattedTime()}] 📈 Encontrados ${rows.length} registros na consulta`);
      
      if (rows.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'Nenhum usuário encontrado para atualizar',
          stats: { processed: 0, updated: 0, errors: 0, skipped: 0 }
        });
      }

      // Agrupar por discord ID e pegar apenas o personagem com menor ID
      console.log(`[${getFormattedTime()}] 🔄 Agrupando usuários por Discord ID...`);
      const userMap = new Map();
      rows.forEach(row => {
        if (!userMap.has(row.discord) || row.player_id < userMap.get(row.discord).player_id) {
          userMap.set(row.discord, row);
        }
      });

      console.log(`[${getFormattedTime()}] 👥 ${userMap.size} usuários únicos encontrados`);
      console.log(`[${getFormattedTime()}] 🚀 Iniciando atualização em massa (processamento em batches)...`);

      const stats = {
        processed: 0,
        updated: 0,
        errors: 0,
        skipped: 0
      };

      const results = [];
      
      // Configuração para rate limiting
      const BATCH_SIZE = 10; // Processar 3 por vez para respeitar rate limits
      const DELAY_BETWEEN_BATCHES = 1000; // 1 segundo entre batches
      
      const userEntries = Array.from(userMap.entries());
      
      // Função para processar um usuário
      async function processUser([discordId, userData]) {
        stats.processed++;
        
        try {
          const member = await guild.members.fetch(discordId).catch(() => null);
          
          if (!member) {
            stats.skipped++;
            return {
              discord_id: discordId,
              status: 'skipped',
              reason: 'Membro não encontrado no servidor'
            };
          }

          // Construir o nickname (sempre atualizar)
          let newNickname = userData.name;
          const MAX_LENGTH = 32;

          if (userData.fixed_id) {
            const prefix = `${userData.fixed_id} `;
            const maxNameLength = MAX_LENGTH - prefix.length;
            const truncatedName = userData.name.length > maxNameLength
              ? userData.name.substring(0, maxNameLength)
              : userData.name;
            newNickname = `${prefix}${truncatedName}`;
          } else if (userData.cid) {
            const prefix = `[${userData.cid}] `;
            const maxNameLength = MAX_LENGTH - prefix.length;
            const truncatedName = userData.name.length > maxNameLength
              ? userData.name.substring(0, maxNameLength)
              : userData.name;
            newNickname = `${prefix}${truncatedName}`;
          } else {
            newNickname = userData.name.length > MAX_LENGTH
              ? userData.name.substring(0, MAX_LENGTH)
              : userData.name;
          }

          try {
            await member.edit({ nick: newNickname });
            stats.updated++;
            
            console.log(`[${getFormattedTime()}] ✅ ${member.user.username} -> ${newNickname}`);
            
            return {
              discord_id: discordId,
              discord_username: member.user.username,
              old_nickname: member.nickname,
              new_nickname: newNickname,
              character_name: userData.name,
              fixed_id: userData.fixed_id,
              cid: userData.cid,
              status: 'updated'
            };

          } catch (nicknameError) {
            if (nicknameError.code === 50013) {
              stats.skipped++;
              console.warn(`[${getFormattedTime()}] ⚠️  ${member.user.username} - Sem permissão`);
              
              return {
                discord_id: discordId,
                discord_username: member.user.username,
                status: 'skipped',
                reason: 'Falta de permissão (cargo acima do bot)'
              };
            } else if (nicknameError.code === 429) {
              // Rate limit - aguardar e tentar novamente
              console.warn(`[${getFormattedTime()}] ⏱️  Rate limit atingido, aguardando...`);
              await new Promise(resolve => setTimeout(resolve, nicknameError.retry_after * 1000 || 5000));
              throw nicknameError; // Re-throw para retry
            } else {
              stats.errors++;
              console.error(`[${getFormattedTime()}] ❌ Erro ${member.user.username}:`, nicknameError.message);
              
              return {
                discord_id: discordId,
                discord_username: member.user.username,
                status: 'error',
                reason: nicknameError.message
              };
            }
          }

        } catch (memberError) {
          stats.errors++;
          console.error(`[${getFormattedTime()}] ❌ Erro ao processar ${discordId}:`, memberError.message);
          
          return {
            discord_id: discordId,
            status: 'error',
            reason: memberError.message
          };
        }
      }

      // Processar em batches
      for (let i = 0; i < userEntries.length; i += BATCH_SIZE) {
        const batch = userEntries.slice(i, i + BATCH_SIZE);
        
        console.log(`[${getFormattedTime()}] 📦 Processando batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(userEntries.length / BATCH_SIZE)} (${batch.length} usuários)`);
        
        try {
          // Processar batch em paralelo
          const batchResults = await Promise.all(batch.map(processUser));
          results.push(...batchResults);
          
          // Aguardar entre batches para respeitar rate limits
          if (i + BATCH_SIZE < userEntries.length) {
            console.log(`[${getFormattedTime()}] ⏳ Aguardando ${DELAY_BETWEEN_BATCHES}ms antes do próximo batch...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
          }
          
        } catch (batchError) {
          console.error(`[${getFormattedTime()}] ❌ Erro no batch:`, batchError.message);
          // Continuar com o próximo batch mesmo se houver erro
        }
      }

      console.log(`[${getFormattedTime()}] ✅ Processo concluído!`);
      console.log(`[${getFormattedTime()}] 📊 Resultado: ${stats.updated} atualizados, ${stats.skipped} ignorados, ${stats.errors} erros`);

      return res.status(200).json({
        success: true,
        message: 'Atualização em massa concluída',
        stats,
        results: results.slice(0, 50) // Limitar resultados para evitar resposta muito grande
      });

    } finally {
      if (connection) {
        console.log(`[${getFormattedTime()}] 🔌 Desconectando do banco de dados...`);
        await connection.end();
      }
    }

  } catch (error) {
    console.error(`[${getFormattedTime()}] ❌ Erro na atualização em massa:`, error);

    return res.status(500).json({
      success: false,
      error: 'Erro interno na atualização em massa',
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

// Endpoint para ver status do cache
app.get('/api/cache-status', authenticateRequest, async (req, res) => {
  try {
    const cacheData = Array.from(nicknameCache.entries()).slice(0, 100).map(([discordId, data]) => ({
      discord_id: discordId,
      nickname: data.nickname,
      character_name: data.character_name,
      fixed_id: data.fixed_id,
      last_updated: new Date(data.last_updated).toLocaleString('pt-BR')
    }));
    
    return res.status(200).json({
      success: true,
      cache_size: nicknameCache.size,
      auto_update_active: !!autoUpdateInterval,
      update_interval_minutes: AUTO_UPDATE_INTERVAL / (60 * 1000),
      next_update: autoUpdateInterval ? 'Automático' : 'Desativado',
      sample_data: cacheData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Erro ao acessar status do cache',
      details: error.message
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint não encontrado',
  });
});

app.listen(PORT, () => {
  console.log(`[${getFormattedTime()}] 🚀 Servidor HTTP rodando na porta ${PORT}`);
  console.log(`[${getFormattedTime()}] 📡 Endpoints disponíveis:`);
  console.log(`[${getFormattedTime()}]    GET  http://localhost:${PORT}/api/health`);
  console.log(`[${getFormattedTime()}]    GET  http://localhost:${PORT}/api/cache-status`);
  console.log(`[${getFormattedTime()}]    POST http://localhost:${PORT}/api/update-nickname`);
  console.log(`[${getFormattedTime()}]    POST http://localhost:${PORT}/api/check-role`);
  console.log(`[${getFormattedTime()}]    POST http://localhost:${PORT}/api/update-all-nicknames`);
  console.log(`[${getFormattedTime()}] ⏰ Atualização automática: A cada ${AUTO_UPDATE_INTERVAL / (60 * 1000)} minutos`);
});

// Limpar timer ao encerrar
process.on('SIGINT', () => {
  console.log(`[${getFormattedTime()}] 🛑 Encerrando processo...`);
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
    console.log(`[${getFormattedTime()}] ⏰ Timer automático cancelado`);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`[${getFormattedTime()}] 🛑 Processo sendo terminado...`);
  if (autoUpdateInterval) {
    clearInterval(autoUpdateInterval);
    console.log(`[${getFormattedTime()}] ⏰ Timer automático cancelado`);
  }
  process.exit(0);
});
