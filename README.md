# FiveM Discord Nickname Sync

Servidor HTTP para sincronizar automaticamente os nicknames dos players do FiveM com o Discord.

## Funcionalidades

- Servidor HTTP que recebe requisições do servidor FiveM
- Atualiza automaticamente o nickname do player no Discord
- Verifica se um player possui cargo específico (whitelist/permissões)
- Autenticação por token secreto para segurança
- Ignora erros de permissão (quando o player tem cargo acima do bot)
- Suporta ID do personagem no formato otimizado `[ID] Nome`
- Limite de 32 caracteres (limite do Discord) com truncamento automático
- Retorna lista de todos os cargos do usuário

## Requisitos

- Node.js 18+
- Bot do Discord configurado
- Servidor FiveM

## Instalação

1. Clone ou baixe este repositório

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Edite o arquivo `.env` com suas configurações:
```env
PORT=3000
API_SECRET=seu_secret_super_seguro_aqui
DISCORD_TOKEN=seu_token_do_bot_discord_aqui
GUILD_ID=seu_guild_id_aqui
```

### Como obter as credenciais:

**DISCORD_TOKEN:**
1. Acesse https://discord.com/developers/applications
2. Crie uma nova aplicação ou selecione uma existente
3. Vá em "Bot" no menu lateral
4. Copie o token (Reset Token se necessário)
5. Certifique-se de habilitar as intents: `GUILDS` e `GUILD_MEMBERS`

**GUILD_ID:**
1. No Discord, ative o Modo Desenvolvedor (Configurações > Avançado > Modo Desenvolvedor)
2. Clique com botão direito no servidor e selecione "Copiar ID"

**API_SECRET:**
Gere um token seguro com o comando:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Uso

Inicie o servidor:
```bash
npm start
```

O servidor estará rodando em `http://localhost:3000` (ou na porta configurada).

## API Endpoints

### POST /api/update-nickname

Atualiza o nickname de um player no Discord.

**Headers:**
```
Authorization: Bearer SEU_API_SECRET
Content-Type: application/json
```

**Body:**
```json
{
  "discord_id": "123456789012345678",
  "character_name": "João Silva",
  "character_id": "1001",
  "character_fixed_id": "42"
}
```

**Parâmetros:**
- `discord_id` (string, obrigatório): ID do Discord do player
- `character_name` (string, obrigatório): Nome do personagem
- `character_id` (string, opcional): ID do personagem no servidor
- `character_fixed_id` (string, opcional): ID fixo do personagem

**Resposta de sucesso (200):**
```json
{
  "success": true,
  "message": "Nickname atualizado com sucesso",
  "data": {
    "discord_id": "123456789012345678",
    "discord_username": "joao",
    "new_nickname": "[42][1001] João Silva"
  }
}
```

**Nota:** O nickname é limitado a 32 caracteres. Se o nome completo com IDs ultrapassar esse limite, o nome do personagem será truncado automaticamente.

**Resposta quando não há permissão (200):**
```json
{
  "success": true,
  "message": "Usuário possui cargo acima do bot, nickname não alterado",
  "data": {
    "discord_id": "123456789012345678",
    "discord_username": "joao",
    "skipped": true,
    "reason": "Falta de permissão (cargo acima do bot)"
  }
}
```

### POST /api/check-role

Verifica se um membro possui um cargo específico no Discord.

**Headers:**
```
Authorization: Bearer SEU_API_SECRET
Content-Type: application/json
```

**Body:**
```json
{
  "discord_id": "123456789012345678",
  "role_id": "987654321098765432"
}
```

ou

```json
{
  "discord_id": "123456789012345678",
  "role_name": "Membro VIP"
}
```

**Parâmetros:**
- `discord_id` (string, obrigatório): ID do Discord do player
- `role_id` (string, opcional): ID do cargo no Discord
- `role_name` (string, opcional): Nome do cargo (case insensitive)

**Nota:** Você deve informar `role_id` OU `role_name`.

**Resposta quando tem o cargo (200):**
```json
{
  "success": true,
  "data": {
    "discord_id": "123456789012345678",
    "discord_username": "joao",
    "has_role": true,
    "role": {
      "id": "987654321098765432",
      "name": "Membro VIP",
      "color": "#3498db"
    },
    "all_roles": [
      {
        "id": "987654321098765432",
        "name": "Membro VIP"
      },
      {
        "id": "123456789012345678",
        "name": "Player"
      }
    ]
  }
}
```

**Resposta quando NÃO tem o cargo (200):**
```json
{
  "success": true,
  "data": {
    "discord_id": "123456789012345678",
    "discord_username": "joao",
    "has_role": false,
    "role": null,
    "all_roles": [
      {
        "id": "123456789012345678",
        "name": "Player"
      }
    ]
  }
}
```

### GET /api/health

Verifica o status do servidor e do bot.

**Resposta:**
```json
{
  "success": true,
  "status": "online",
  "discord_ready": true,
  "bot_username": "MeuBot#1234"
}
```

## Integração com FiveM

### Atualizar Nickname

No seu servidor FiveM, faça uma requisição HTTP quando o player conectar:

```lua
-- Exemplo em Lua
RegisterNetEvent('playerConnected')
AddEventHandler('playerConnected', function(discordId, charName, charId, charFixedId)
    PerformHttpRequest('http://SEU_SERVIDOR:3000/api/update-nickname', function(statusCode, response, headers)
        if statusCode == 200 then
            print('Nickname atualizado com sucesso!')
        else
            print('Erro ao atualizar nickname: ' .. statusCode)
        end
    end, 'POST', json.encode({
        discord_id = discordId,
        character_name = charName,
        character_id = charId,
        character_fixed_id = charFixedId
    }), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer SEU_API_SECRET'
    })
end)
```

### Verificar Cargo (Whitelist)

Para verificar se um player tem um cargo específico antes de permitir entrada:

```lua
AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
    local source = source
    deferrals.defer()
    deferrals.update('Verificando cargo no Discord...')

    -- Pega o Discord ID
    local discordId = nil
    for _, id in ipairs(GetPlayerIdentifiers(source)) do
        if string.match(id, 'discord:') then
            discordId = string.gsub(id, 'discord:', '')
            break
        end
    end

    if not discordId then
        deferrals.done('Discord não vinculado!')
        return
    end

    -- Verifica se tem o cargo
    PerformHttpRequest('http://SEU_SERVIDOR:3000/api/check-role', function(statusCode, response)
        if statusCode == 200 then
            local result = json.decode(response)
            if result.success and result.data.has_role then
                deferrals.done()
            else
                deferrals.done('Você precisa ter o cargo "Membro VIP" no Discord!')
            end
        else
            deferrals.done('Erro ao verificar cargo!')
        end
    end, 'POST', json.encode({
        discord_id = discordId,
        role_name = 'Membro VIP'
    }), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer SEU_API_SECRET'
    })
end)
```

**Nota:** Veja o arquivo `fivem-example.lua` para exemplos completos e prontos para uso.

## Permissões do Bot no Discord

O bot precisa das seguintes permissões no servidor Discord:

1. **Manage Nicknames** (Gerenciar apelidos)
2. O cargo do bot deve estar **acima** dos cargos dos players que você quer renomear

**Nota:** Players com cargos acima do bot não terão seus nicknames alterados, mas não causarão erro (será ignorado).

## Segurança

- Mantenha o `API_SECRET` em segredo
- Use HTTPS em produção
- Configure firewall para permitir apenas requisições do servidor FiveM
- Adicione `.env` no `.gitignore` (já configurado)

## Desenvolvimento

Para rodar em modo de desenvolvimento com auto-reload:
```bash
npm run dev
```

## Estrutura do Projeto

```
.
├── index.js          # Servidor principal
├── package.json      # Dependências
├── .env.example      # Exemplo de configuração
├── .env              # Configuração (não commitado)
├── .gitignore        # Arquivos ignorados pelo git
└── README.md         # Esta documentação
```

## Troubleshooting

**Bot não conecta:**
- Verifique se o DISCORD_TOKEN está correto
- Certifique-se que as intents estão habilitadas no Discord Developer Portal

**Erro 403 ao atualizar nickname:**
- Verifique se o bot tem permissão "Manage Nicknames"
- Confirme que o cargo do bot está acima do cargo do player

**Erro 401/403 na API:**
- Verifique se o header Authorization está correto
- Confirme que está usando o mesmo API_SECRET configurado no .env

## Licença

ISC
