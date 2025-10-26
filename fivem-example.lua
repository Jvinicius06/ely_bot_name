-- Exemplo de integração com FiveM
-- Coloque este código no seu resource do FiveM

-- Configurações
local API_URL = 'http://SEU_SERVIDOR:3000/api/update-nickname'
local API_SECRET = 'SEU_API_SECRET_AQUI'

-- Função para atualizar o nickname no Discord
function UpdateDiscordNickname(source, characterName, characterId, characterFixedId)
    local discordId = nil

    -- Pega o Discord ID do player
    for _, id in ipairs(GetPlayerIdentifiers(source)) do
        if string.match(id, 'discord:') then
            discordId = string.gsub(id, 'discord:', '')
            break
        end
    end

    -- Verifica se encontrou o Discord ID
    if not discordId then
        print('[Discord Sync] Player ' .. GetPlayerName(source) .. ' não tem Discord vinculado')
        return
    end

    -- Prepara os dados
    local data = {
        discord_id = discordId,
        character_name = characterName,
        character_id = characterId and tostring(characterId) or nil,
        character_fixed_id = characterFixedId and tostring(characterFixedId) or nil
    }

    -- Faz a requisição HTTP
    PerformHttpRequest(API_URL, function(statusCode, response, headers)
        if statusCode == 200 then
            local result = json.decode(response)
            if result.success then
                if result.data.skipped then
                    print('[Discord Sync] Nickname não alterado: ' .. result.data.reason)
                else
                    print('[Discord Sync] Nickname atualizado: ' .. result.data.new_nickname)
                end
            else
                print('[Discord Sync] Erro: ' .. (result.error or 'Desconhecido'))
            end
        else
            print('[Discord Sync] Erro HTTP: ' .. statusCode)
        end
    end, 'POST', json.encode(data), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. API_SECRET
    })
end

-- Exemplo 1: Quando o player seleciona/cria um personagem
-- (Adapte para seu framework - ESX, QBCore, etc)
RegisterNetEvent('esx:playerLoaded')
AddEventHandler('esx:playerLoaded', function(xPlayer)
    local source = source
    local characterName = xPlayer.getName()
    local characterId = xPlayer.identifier

    -- Aguarda 2 segundos para garantir que o player está totalmente conectado
    Citizen.Wait(2000)

    UpdateDiscordNickname(source, characterName, characterId)
end)

-- Exemplo 2: Comando manual para testar
RegisterCommand('syncnick', function(source, args)
    -- Exemplo fixo para teste
    local characterName = 'João Silva'
    local characterId = 1001
    local characterFixedId = 42  -- ID fixo do personagem (opcional)

    UpdateDiscordNickname(source, characterName, characterId, characterFixedId)

    TriggerClientEvent('chat:addMessage', source, {
        args = { 'Discord Sync', 'Sincronização iniciada!' }
    })
end, false)

-- Exemplo 3: Para QBCore
RegisterNetEvent('QBCore:Client:OnPlayerLoaded')
AddEventHandler('QBCore:Client:OnPlayerLoaded', function()
    local source = source
    local Player = QBCore.Functions.GetPlayer(source)

    if Player then
        local characterName = Player.PlayerData.charinfo.firstname .. ' ' .. Player.PlayerData.charinfo.lastname
        local characterId = Player.PlayerData.citizenid

        Citizen.Wait(2000)
        UpdateDiscordNickname(source, characterName, characterId)
    end
end)

-- Exemplo 4: Quando o player troca de personagem
RegisterNetEvent('discord:updateNickname')
AddEventHandler('discord:updateNickname', function(characterName, characterId, characterFixedId)
    local source = source
    UpdateDiscordNickname(source, characterName, characterId, characterFixedId)
end)

print('^2[Discord Sync] ^7Integração carregada com sucesso!^0')
