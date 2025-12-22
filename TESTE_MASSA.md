# Sistema Automático de Atualização - Discord Nickname Sync

## 🚀 **Novo Sistema Automático!**

O bot agora funciona automaticamente:
- ✅ **Primeira execução completa** ao iniciar
- ⏰ **Atualização automática a cada 1 hora** (apenas mudanças)
- 💾 **Cache em memória** para otimizar performance
- 🔄 **Sempre atualiza** (não pula nicknames corretos)

## 📊 **Novos Endpoints**

### 1. Status do Cache
```bash
curl -X GET http://localhost:3000/api/cache-status \
  -H "Authorization: Bearer SEU_API_SECRET"
```

### 2. Atualização Manual (Completa)
```bash
curl -X POST http://localhost:3000/api/update-all-nicknames \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_API_SECRET" \
  -d '{"force_all": true}'
```

### 3. Atualização Manual (Apenas Novos)
```bash
curl -X POST http://localhost:3000/api/update-all-nicknames \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_API_SECRET" \
  -d '{"only_new": true}'
```

## 🎯 **Como Funciona**

### Execução Automática:
1. **Ao iniciar:** Atualização completa de todos os nicknames
2. **A cada 1 hora:** Verifica banco → detecta mudanças → atualiza apenas novos/alterados
3. **Cache inteligente:** Mantém histórico em memória para comparação

### Detecção de Mudanças:
- Novos usuários no servidor Discord
- Mudanças no nome do personagem 
- Alteração do Fixed ID (EL1, EL42, etc.)
- Novo Character ID (CID)

## 🛠 **Configurações**

No código você pode ajustar:
```javascript
const AUTO_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hora
const BATCH_SIZE = 3; // 3 usuários por batch
const DELAY_BETWEEN_BATCHES = 1000; // 1 segundo entre batches
```

## 📊 **Exemplo de Resposta do Cache Status**

```json
{
  "success": true,
  "cache_size": 150,
  "auto_update_active": true,
  "update_interval_minutes": 60,
  "next_update": "Automático",
  "sample_data": [
    {
      "discord_id": "123456789012345678",
      "nickname": "EL42 João Silva",
      "character_name": "João Silva", 
      "fixed_id": "EL42",
      "last_updated": "22/12/2025 15:30:45"
    }
  ]
}
```

## ⚡ **Performance**

- **Rate Limiting:** 3 usuários por batch com 1s de pausa
- **Cache Inteligente:** Evita atualizações desnecessárias
- **Logs Detalhados:** Acompanha progresso em tempo real
- **Retry Automático:** Tenta novamente em caso de rate limit (429)

Agora o sistema roda sozinho! 🎉