-- Exemplo de integração com FiveM
-- Coloque este código no seu resource do FiveM

-- Configurações
local API_URL = 'http://SEU_SERVIDOR:3000'
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
    PerformHttpRequest(API_URL .. '/api/update-nickname', function(statusCode, response, headers)
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

-- Função para verificar se o player tem um cargo específico
function CheckDiscordRole(source, roleId, roleName, callback)
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
        if callback then callback(false, nil) end
        return
    end

    -- Prepara os dados
    local data = {
        discord_id = discordId
    }

    if roleId then
        data.role_id = tostring(roleId)
    elseif roleName then
        data.role_name = roleName
    else
        print('[Discord Sync] Erro: role_id ou role_name não fornecido')
        if callback then callback(false, nil) end
        return
    end

    -- Faz a requisição HTTP
    PerformHttpRequest(API_URL .. '/api/check-role', function(statusCode, response, headers)
        if statusCode == 200 then
            local result = json.decode(response)
            if result.success then
                local hasRole = result.data.has_role
                print('[Discord Sync] Player ' .. GetPlayerName(source) .. ' tem o cargo: ' .. tostring(hasRole))
                if callback then callback(hasRole, result.data) end
            else
                print('[Discord Sync] Erro: ' .. (result.error or 'Desconhecido'))
                if callback then callback(false, nil) end
            end
        else
            print('[Discord Sync] Erro HTTP: ' .. statusCode)
            if callback then callback(false, nil) end
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

-- Exemplo 5: Verificar cargo antes de permitir entrada no servidor
AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
    local source = source
    deferrals.defer()

    Wait(50)
    deferrals.update('Verificando cargo no Discord...')

    -- Verifica se o player tem o cargo "Membro VIP" (pode ser por nome ou ID)
    CheckDiscordRole(source, nil, 'Membro VIP', function(hasRole, data)
        if hasRole then
            deferrals.done()
            print('[Discord Sync] Player ' .. name .. ' tem o cargo necessário!')
        else
            deferrals.done('Você precisa ter o cargo "Membro VIP" no Discord para entrar no servidor!')
            print('[Discord Sync] Player ' .. name .. ' não tem o cargo necessário!')
        end
    end)
end)

-- Exemplo 6: Comando para verificar cargo manualmente
RegisterCommand('checkrole', function(source, args)
    local roleName = table.concat(args, ' ')

    if roleName == '' then
        TriggerClientEvent('chat:addMessage', source, {
            args = { 'Discord Sync', 'Uso: /checkrole [nome do cargo]' }
        })
        return
    end

    CheckDiscordRole(source, nil, roleName, function(hasRole, data)
        if hasRole then
            TriggerClientEvent('chat:addMessage', source, {
                args = { 'Discord Sync', 'Você TEM o cargo: ' .. roleName }
            })
        else
            TriggerClientEvent('chat:addMessage', source, {
                args = { 'Discord Sync', 'Você NÃO TEM o cargo: ' .. roleName }
            })
        end
    end)
end, false)

-- Exemplo 7: Comando para sincronizar todos os nicknames (ADMIN)
RegisterCommand('syncallnicks', function(source, args)
    -- Verificar se é admin (ajuste conforme seu sistema de permissões)
    if source ~= 0 and not IsPlayerAceAllowed(source, 'command.syncallnicks') then
        TriggerClientEvent('chat:addMessage', source, {
            args = { 'Discord Sync', 'Você não tem permissão para usar este comando!' }
        })
        return
    end
    
    print('[Discord Sync] Iniciando sincronização em massa de nicknames...')
    
    PerformHttpRequest(API_URL .. '/api/update-all-nicknames', function(statusCode, response)
        if statusCode == 200 then
            local result = json.decode(response)
            if result.success then
                local msg = string.format('Sincronização concluída! Processados: %d, Atualizados: %d, Erros: %d, Ignorados: %d',
                    result.stats.processed,
                    result.stats.updated,
                    result.stats.errors,
                    result.stats.skipped
                )
                print('[Discord Sync] ' .. msg)
                
                if source ~= 0 then
                    TriggerClientEvent('chat:addMessage', source, {
                        args = { 'Discord Sync', msg }
                    })
                end
            else
                local errorMsg = 'Erro na sincronização: ' .. (result.error or 'Desconhecido')
                print('[Discord Sync] ' .. errorMsg)
                
                if source ~= 0 then
                    TriggerClientEvent('chat:addMessage', source, {
                        args = { 'Discord Sync', errorMsg }
                    })
                end
            end
        else
            local errorMsg = 'Erro HTTP na sincronização: ' .. statusCode
            print('[Discord Sync] ' .. errorMsg)
            
            if source ~= 0 then
                TriggerClientEvent('chat:addMessage', source, {
                    args = { 'Discord Sync', errorMsg }
                })
            end
        end
    end, 'POST', '', {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. API_SECRET
    })
end, true) -- true = comando restrito

print('^2[Discord Sync] ^7Integração carregada com sucesso!^0')
