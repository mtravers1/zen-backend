# 🚨 Plaid Error Handling Guide

## 📋 Overview
Este documento detalha como lidar com os erros específicos do Plaid que estão aparecendo nos logs de produção.

## 🔍 Erros Identificados

### 1. **TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION (400)**

**Descrição do Erro:**
```
Error Code: TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION
Error Message: "Underlying transaction data changed since last page was fetched. Please restart pagination from last update."
Institution: Capital One (identificado no log)
```

**Causa:**
- Os dados de transações mudaram durante o processo de paginação
- O cursor atual não é mais válido
- Dados foram modificados entre as chamadas da API
- **Específico do Capital One**: Esta instituição pode ter alta frequência de atualizações de transações

**Solução Implementada:**
```javascript
if (error.response?.data?.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
  mutationErrorCount++;
  console.log(`Data mutation detected (attempt ${mutationErrorCount}/${maxMutationErrors}), restarting pagination from current cursor`);
  
  // Log institution-specific information for debugging
  try {
    const institutionInfo = await plaidClient.institutionsGetById({
      institution_id: accounts[0]?.institution_id,
      country_codes: ['US']
    });
    console.log(`Mutation error for institution: ${institutionInfo.data.institution.name}`);
  } catch (instError) {
    console.log('Could not retrieve institution info for mutation error');
  }
  
  if (mutationErrorCount >= maxMutationErrors) {
    console.error('Max mutation errors reached, stopping sync');
    break;
  }
  
  // Reset cursor to null to restart pagination from the beginning
  // This follows Plaid's recommendation for this error
  cursor = null;
  
  // Wait longer for data to stabilize
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Don't increment retryCount for mutation errors as we're restarting pagination
  // This gives us more attempts to handle the mutation
  continue;
}
```

**Melhores Práticas:**
1. **Reset do cursor**: Definir `cursor = null` para reiniciar a paginação
2. **Contador específico**: `mutationErrorCount` separado do `retryCount` geral
3. **Delay maior**: Aguardar 5 segundos para os dados se estabilizarem
4. **Logging detalhado**: Registrar instituição específica e tentativas
5. **Limite de tentativas**: Máximo de 5 erros de mutação antes de parar

### 2. **Webhook 503 Service Unavailable**

**Descrição do Erro:**
```
Response Code: 503 Service Unavailable
Error Message: "Your server returned a 503 HTTP code when we sent this webhook."
```

**Causa:**
- O servidor está indisponível ou sobrecarregado
- Timeout no processamento do webhook
- Recursos insuficientes no servidor

**Solução Implementada:**
```javascript
// Middleware para garantir que webhooks sempre retornem 200
const webhookErrorHandler = (err, req, res, next) => {
  console.error('Webhook error:', err);
  
  // Sempre retorna 200 para webhooks, mesmo em caso de erro
  // O Plaid irá reenviar webhooks importantes automaticamente
  res.status(200).json({
    status: 'error',
    message: 'Webhook processed with errors',
    timestamp: new Date().toISOString()
  });
};
```

**Melhores Práticas:**
1. **Sempre retornar 200**: Evita retries desnecessários do Plaid
2. **Logging detalhado**: Registrar todos os erros para debugging
3. **Health check endpoint**: `/api/webhook/health` para monitoramento
4. **Processamento assíncrono**: Processar webhooks em background quando possível

## 🏦 Instituições Específicas

### Capital One - Alta Frequência de Mutação

**Características:**
- Alta frequência de atualizações de transações
- Múltiplas atualizações por dia
- Transações podem ser modificadas várias vezes

**Estratégias Específicas:**
```javascript
// Configuração específica para Capital One
const CAPITAL_ONE_CONFIG = {
  maxMutationErrors: 10, // Mais tentativas para Capital One
  mutationDelay: 10000,  // Delay maior (10 segundos)
  retryInterval: 30000   // Intervalo maior entre retries
};

// Detectar Capital One
const isCapitalOne = (institutionId) => {
  return institutionId === 'ins_56' || 
         institutionId.includes('capital_one') ||
         institutionId.includes('capitalone');
};
```

**Monitoramento Recomendado:**
- Alertas específicos para Capital One
- Métricas separadas para esta instituição
- Logs detalhados para debugging

### Outras Instituições com Problemas Similares

**Instituições que podem ter alta frequência de mutação:**
- Chase Bank
- Bank of America
- Wells Fargo
- American Express

**Estratégia Geral:**
- Implementar configurações específicas por instituição
- Monitorar padrões de erro por instituição
- Ajustar delays e retries baseado no comportamento histórico

## 🔧 Implementações Recomendadas

### 1. **Melhorar o Retry Logic**

```javascript
const RATE_LIMIT_CONFIG = {
  default: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
  chase: { maxRetries: 5, baseDelay: 2000, maxDelay: 30000 },
  high_volume: { maxRetries: 4, baseDelay: 1500, maxDelay: 15000 },
  universal: { maxRetries: 4, baseDelay: 1500, maxDelay: 20000 },
  // Configuração específica para erros de mutação
  mutation_error: { maxRetries: 3, baseDelay: 5000, maxDelay: 30000 }
};
```

### 2. **Implementar Circuit Breaker**

```javascript
class PlaidCircuitBreaker {
  constructor(failureThreshold = 5, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

### 3. **Implementar Queue para Webhooks**

```javascript
import Queue from 'bull';

const webhookQueue = new Queue('plaid-webhooks', {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

// Processar webhooks em background
webhookQueue.process(async (job) => {
  const { webhookData } = job.data;
  return await webhookService.webhookHandler(webhookData);
});

// Adicionar webhook à fila
router.post('/plaid', async (req, res) => {
  await webhookQueue.add({
    webhookData: req.body
  });
  
  res.status(200).json({ status: 'queued' });
});
```

## 📊 Monitoramento e Alertas

### 1. **Métricas Importantes**

```javascript
const webhookMetrics = {
  totalWebhooks: 0,
  successfulWebhooks: 0,
  failedWebhooks: 0,
  errorTypes: {},
  responseTimes: [],
  lastError: null
};

// Alertas recomendados
const alerts = {
  webhookFailureRate: '> 5%',
  avgResponseTime: '> 10s',
  consecutiveFailures: '> 10',
  errorRateIncrease: '> 50%'
};
```

### 2. **Logs Estruturados**

```javascript
const logWebhookEvent = (event, result, error = null) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'webhook_event',
    webhook_type: event.webhook_type,
    webhook_code: event.webhook_code,
    item_id: event.item_id,
    success: !error,
    error: error?.message,
    response_time: result?.responseTime,
    environment: process.env.NODE_ENV
  }));
};
```

## 🚨 Ações Imediatas

### 1. **Para TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION:**
- ✅ **Implementado**: Reset do cursor e retry logic
- 🔄 **Próximo**: Monitorar frequência do erro
- 📈 **Meta**: Reduzir ocorrências em 80%

### 2. **Para Webhook 503:**
- ✅ **Implementado**: Middleware de erro que sempre retorna 200
- 🔄 **Próximo**: Implementar queue para processamento assíncrono
- 📈 **Meta**: Eliminar erros 503

### 3. **Melhorias de Infraestrutura:**
- 🔄 **Implementar**: Health checks automáticos
- 🔄 **Configurar**: Alertas para alta taxa de erro
- 🔄 **Otimizar**: Recursos do servidor se necessário

## 📚 Referências da Documentação Plaid

### Webhook Retry Policy
- Plaid reenvia webhooks automaticamente por até 24 horas
- Intervalo de retry: 1 min, 5 min, 15 min, 1 hora, 6 horas, 24 horas
- Webhooks importantes: `SYNC_UPDATES_AVAILABLE`, `ITEM_ERROR`

### Transaction Sync Best Practices
- Sempre usar cursor para paginação
- Implementar retry logic com exponential backoff
- Monitorar `has_more` flag
- Tratar erros de mutação resetando o cursor

### Rate Limiting
- 100 requests per minute per client
- 1000 requests per hour per client
- Implementar exponential backoff para rate limits

## 🔮 Próximos Passos

1. **Implementar Circuit Breaker** para proteção contra falhas em cascata
2. **Adicionar Queue** para processamento assíncrono de webhooks
3. **Configurar Alertas** para monitoramento proativo
4. **Otimizar Recursos** do servidor se necessário
5. **Implementar Health Checks** automáticos

---

**Última Atualização**: Janeiro 2025
**Versão**: 1.0.0 