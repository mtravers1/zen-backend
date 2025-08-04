import express from 'express';
import webhookService from '../services/webhook.service.js';

const router = express.Router();

// Middleware para garantir que webhooks sempre retornem 200
// Isso evita que o Plaid retente webhooks desnecessariamente
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

// Health check para webhook endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Webhook endpoint is available'
  });
});

// Plaid webhook endpoint
router.post('/plaid', async (req, res, next) => {
  try {
    console.log('Plaid webhook received:', {
      body: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });

    const result = await webhookService.webhookHandler(
      req.body,
      req.headers['plaid-verification'],
      JSON.stringify(req.body)
    );
    
    res.status(200).json({
      status: 'success',
      message: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Sempre retorna 200 para evitar retries desnecessários
    res.status(200).json({
      status: 'error',
      message: 'Webhook processed with errors',
      timestamp: new Date().toISOString()
    });
  }
});

// Aplicar middleware de erro
router.use(webhookErrorHandler);

export default router;
