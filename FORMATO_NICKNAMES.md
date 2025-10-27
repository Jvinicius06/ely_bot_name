# Formato de Nicknames

O sistema utiliza um formato otimizado para economizar caracteres e respeitar o limite de 32 caracteres do Discord.

## Formato

O formato padrão é: `[fixedID][charID] Nome`

Os IDs aparecem primeiro entre colchetes, seguidos pelo nome do personagem. Se o nome for muito longo, ele será truncado automaticamente.

## Exemplos

### Com ambos os IDs
```
Entrada:
- character_fixed_id: 42
- character_id: 1001
- character_name: Vessel Coldgrave

Resultado: [42][1001] Vessel Coldgrave
```

### Apenas Fixed ID
```
Entrada:
- character_fixed_id: 42
- character_name: Vessel Coldgrave

Resultado: [42] Vessel Coldgrave
```

### Apenas Character ID
```
Entrada:
- character_id: 1001
- character_name: Vessel Coldgrave

Resultado: [1001] Vessel Coldgrave
```

### Sem IDs
```
Entrada:
- character_name: Vessel Coldgrave

Resultado: Vessel Coldgrave
```

### Nome muito longo (truncamento automático)
```
Entrada:
- character_fixed_id: 42
- character_id: 1001
- character_name: Very Long Character Name That Exceeds Limit

Resultado: [42][1001] Very Long Character
(Truncado para caber em 32 caracteres)
```

## Cálculo de Espaço

O sistema calcula automaticamente quanto espaço está disponível para o nome:

1. Limite total: 32 caracteres
2. Espaço usado pelos IDs: `[42][1001] ` = 12 caracteres
3. Espaço restante para o nome: 32 - 12 = 20 caracteres

Se o nome do personagem tiver mais de 20 caracteres, ele será truncado para caber.

## Prioridades

1. **IDs sempre aparecem completos** - Nunca são truncados
2. **Nome é truncado se necessário** - Para caber no limite de 32 caracteres
3. **Formato econômico** - Usa o mínimo de caracteres especiais possível
